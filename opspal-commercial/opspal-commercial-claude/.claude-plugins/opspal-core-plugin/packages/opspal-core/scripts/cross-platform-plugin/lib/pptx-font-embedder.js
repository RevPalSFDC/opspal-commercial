#!/usr/bin/env node

/**
 * PPTX Font Embedder
 *
 * Merges embedded font parts from a template PPTX into a generated PPTX.
 * Requires a template PPTX created with fonts embedded in PowerPoint.
 *
 * @version 1.0.0
 * @date 2025-12-30
 */

const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);

const FONT_REL_TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/font';

async function embedFontsFromTemplate(options) {
  const {
    sourcePptxPath,
    templatePptxPath,
    outputPptxPath,
    tempDir,
    verbose
  } = options;

  if (!sourcePptxPath || !templatePptxPath || !outputPptxPath) {
    throw new Error('sourcePptxPath, templatePptxPath, and outputPptxPath are required');
  }

  const resolvedSourcePath = path.resolve(sourcePptxPath);
  const resolvedTemplatePath = path.resolve(templatePptxPath);
  const resolvedOutputPath = path.resolve(outputPptxPath);

  await assertCommand('unzip');
  await assertCommand('zip');

  const workingDir = tempDir || path.join(os.tmpdir(), `pptx-font-embed-${Date.now()}`);
  const sourceDir = path.join(workingDir, 'source');
  const templateDir = path.join(workingDir, 'template');

  await fs.mkdir(sourceDir, { recursive: true });
  await fs.mkdir(templateDir, { recursive: true });

  try {
    await unzipToDir(resolvedSourcePath, sourceDir);
    await unzipToDir(resolvedTemplatePath, templateDir);

    await copyFonts(templateDir, sourceDir, verbose);
    await mergeEmbeddedFonts(templateDir, sourceDir, verbose);
    await mergeContentTypes(templateDir, sourceDir, verbose);

    await zipDir(sourceDir, resolvedOutputPath);
  } finally {
    await safeRm(workingDir);
  }
}

async function unzipToDir(zipPath, outDir) {
  await execFileAsync('unzip', ['-q', zipPath, '-d', outDir]);
}

async function zipDir(inputDir, outputPath) {
  await execFileAsync('zip', ['-q', '-r', outputPath, '.'], { cwd: inputDir });
}

async function copyFonts(templateDir, sourceDir, verbose) {
  const templateFonts = path.join(templateDir, 'ppt', 'fonts');
  const sourceFonts = path.join(sourceDir, 'ppt', 'fonts');

  try {
    await fs.access(templateFonts);
  } catch {
    if (verbose) {
      console.log('WARN: No embedded fonts found in template PPTX.');
    }
    return;
  }

  await fs.mkdir(sourceFonts, { recursive: true });
  await fs.cp(templateFonts, sourceFonts, { recursive: true });
  if (verbose) {
    console.log('Embedded fonts copied from template.');
  }
}

async function mergeEmbeddedFonts(templateDir, sourceDir, verbose) {
  const templatePresentation = path.join(templateDir, 'ppt', 'presentation.xml');
  const sourcePresentation = path.join(sourceDir, 'ppt', 'presentation.xml');
  const templateRels = path.join(templateDir, 'ppt', '_rels', 'presentation.xml.rels');
  const sourceRels = path.join(sourceDir, 'ppt', '_rels', 'presentation.xml.rels');

  const [templateXml, sourceXml, templateRelXml, sourceRelXml] = await Promise.all([
    fs.readFile(templatePresentation, 'utf8'),
    fs.readFile(sourcePresentation, 'utf8'),
    fs.readFile(templateRels, 'utf8'),
    fs.readFile(sourceRels, 'utf8')
  ]);

  const fontListMatch = templateXml.match(/<p:embeddedFontLst>[\s\S]*?<\/p:embeddedFontLst>/);
  if (!fontListMatch) {
    if (verbose) {
      console.log('WARN: Template PPTX does not contain embeddedFontLst block.');
    }
    return;
  }

  const sourceRelIds = extractRelationshipIds(sourceRelXml);
  let maxId = sourceRelIds.reduce((max, id) => Math.max(max, parseInt(id.replace('rId', ''), 10)), 0);

  const fontRelationships = extractFontRelationships(templateRelXml);
  const { updatedRelationships, idMap } = remapRelationshipIds(fontRelationships, sourceRelIds, maxId);
  maxId = Math.max(maxId, ...Object.values(idMap).map(id => parseInt(id.replace('rId', ''), 10)));

  const updatedFontList = fontListMatch[0].replace(/r:id="(rId\d+)"/g, (match, id) => {
    return `r:id="${idMap[id] || id}"`;
  });

  let mergedPresentationXml = sourceXml;
  if (!sourceXml.includes('<p:embeddedFontLst>')) {
    mergedPresentationXml = sourceXml.replace(
      /<\/p:presentation>/,
      `${updatedFontList}</p:presentation>`
    );
  }

  let mergedRelsXml = sourceRelXml;
  if (updatedRelationships.length > 0) {
    const relInsert = updatedRelationships.join('\n');
    mergedRelsXml = sourceRelXml.replace(
      /<\/Relationships>/,
      `${relInsert}\n</Relationships>`
    );
  }

  await Promise.all([
    fs.writeFile(sourcePresentation, mergedPresentationXml, 'utf8'),
    fs.writeFile(sourceRels, mergedRelsXml, 'utf8')
  ]);

  if (verbose) {
    console.log('Embedded font relationships merged.');
  }
}

async function mergeContentTypes(templateDir, sourceDir, verbose) {
  const templateContentTypes = path.join(templateDir, '[Content_Types].xml');
  const sourceContentTypes = path.join(sourceDir, '[Content_Types].xml');

  const [templateXml, sourceXml] = await Promise.all([
    fs.readFile(templateContentTypes, 'utf8'),
    fs.readFile(sourceContentTypes, 'utf8')
  ]);

  let fontOverrides = templateXml.match(/<Override[^>]+ContentType="application\/vnd\.openxmlformats-officedocument\.obfuscatedFont"[^>]*\/>/g) || [];
  if (fontOverrides.length === 0) {
    fontOverrides = await buildFontOverridesFromDir(sourceDir);
    if (fontOverrides.length === 0) {
      if (verbose) {
        console.log('WARN: No font overrides found in template content types.');
      }
      return;
    }
    if (verbose) {
      console.log('WARN: No font overrides found in template content types. Using ppt/fonts fallback.');
    }
  }

  const existingOverrides = new Set(
    (sourceXml.match(/<Override[^>]+PartName="[^"]+"[^>]*\/>/g) || []).map(entry => {
      const match = entry.match(/PartName="([^"]+)"/);
      return match ? match[1] : '';
    })
  );

  const newOverrides = fontOverrides.filter(entry => {
    const match = entry.match(/PartName="([^"]+)"/);
    return match && !existingOverrides.has(match[1]);
  });

  if (newOverrides.length === 0) {
    return;
  }

  const mergedXml = sourceXml.replace(
    /<\/Types>/,
    `${newOverrides.join('\n')}\n</Types>`
  );

  await fs.writeFile(sourceContentTypes, mergedXml, 'utf8');

  if (verbose) {
    console.log('Content types updated for embedded fonts.');
  }
}

async function buildFontOverridesFromDir(sourceDir) {
  const fontsDir = path.join(sourceDir, 'ppt', 'fonts');
  let fontFiles = [];

  try {
    fontFiles = await fs.readdir(fontsDir);
  } catch {
    return [];
  }

  return fontFiles
    .filter(name => name && name !== '.' && name !== '..')
    .map(name => {
      return `  <Override PartName="/ppt/fonts/${name}" ContentType="application/vnd.openxmlformats-officedocument.obfuscatedFont"/>`;
    });
}

function extractRelationshipIds(xml) {
  const matches = xml.match(/Id="(rId\d+)"/g) || [];
  return matches.map(match => match.replace('Id="', '').replace('"', ''));
}

function extractFontRelationships(xml) {
  return xml.match(new RegExp(`<Relationship[^>]+Type="${FONT_REL_TYPE}"[^>]*/>`, 'g')) || [];
}

function remapRelationshipIds(relationships, existingIds, maxId) {
  const idMap = {};
  const updatedRelationships = relationships.map(rel => {
    const idMatch = rel.match(/Id="(rId\d+)"/);
    if (!idMatch) return rel;
    const id = idMatch[1];

    if (existingIds.includes(id) || idMap[id]) {
      maxId += 1;
      const newId = `rId${maxId}`;
      idMap[id] = newId;
      return rel.replace(/Id="rId\d+"/, `Id="${newId}"`);
    }

    idMap[id] = id;
    return rel;
  });

  return { updatedRelationships, idMap };
}

async function assertCommand(command) {
  try {
    await execFileAsync('which', [command]);
  } catch {
    throw new Error(`Required binary not found: ${command}`);
  }
}

async function safeRm(targetPath) {
  try {
    await fs.rm(targetPath, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

module.exports = {
  embedFontsFromTemplate
};
