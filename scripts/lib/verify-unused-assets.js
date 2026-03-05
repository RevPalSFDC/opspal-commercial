#!/usr/bin/env node

'use strict';

const fs = require('fs');
const path = require('path');

const { REPO_ROOT, discoverRuntimePluginPaths } = require('./plugin-doc-inventory');

const BASELINE_PATH = path.join(REPO_ROOT, 'scripts', 'unused-assets-baseline.json');
const SKIP_DIRS = new Set(['node_modules', '.git', '.cache', '.temp', 'dist', 'build', 'coverage']);
const CANDIDATE_CONTAINERS = ['/assets/', '/templates/', '/examples/'];
const ASSET_EXTENSIONS = new Set([
  '.json', '.yaml', '.yml', '.xml', '.txt', '.md', '.csv', '.sql', '.html', '.svg', '.png'
]);
const TEXT_EXTENSIONS = new Set([
  '.md', '.json', '.yaml', '.yml', '.xml', '.txt', '.csv', '.sql', '.html',
  '.js', '.cjs', '.mjs', '.ts', '.sh'
]);
const GENERIC_FILENAMES = new Set(['readme.md', 'readme.txt', '.gitkeep']);

function parseArgs(argv) {
  return {
    updateBaseline: argv.includes('--update-baseline')
  };
}

function toPosix(filePath) {
  return filePath.split(path.sep).join('/');
}

function toRelative(filePath) {
  return toPosix(path.relative(REPO_ROOT, filePath));
}

function walk(dir, files = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(path.join(dir, entry.name), files);
      continue;
    }
    if (entry.isFile()) {
      files.push(path.join(dir, entry.name));
    }
  }
  return files;
}

function isAssetCandidate(pluginRoot, filePath) {
  const rel = toPosix(path.relative(pluginRoot, filePath));
  const ext = path.extname(filePath).toLowerCase();
  const base = path.basename(filePath).toLowerCase();

  if (!ASSET_EXTENSIONS.has(ext)) return false;
  if (GENERIC_FILENAMES.has(base)) return false;
  if (!CANDIDATE_CONTAINERS.some((container) => rel.includes(container.slice(1)))) return false;
  return true;
}

function isTextFile(filePath) {
  return TEXT_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function loadTextCorpus(pluginRoot, allFiles) {
  const corpus = new Map();
  for (const filePath of allFiles) {
    if (!isTextFile(filePath)) continue;
    try {
      corpus.set(filePath, fs.readFileSync(filePath, 'utf8'));
    } catch (_) {
      // ignore unreadable files
    }
  }
  return corpus;
}

function buildReferenceTokens(pluginRoot, assetPath) {
  const repoRel = toRelative(assetPath);
  const pluginRel = toPosix(path.relative(pluginRoot, assetPath));
  const basename = path.basename(assetPath);
  const basenameNoExt = basename.replace(path.extname(basename), '');

  const tokens = new Set([repoRel, pluginRel, basename]);
  if (basenameNoExt.length >= 8) {
    tokens.add(basenameNoExt);
  }
  return [...tokens];
}

function hasReference(assetPath, corpus, tokens) {
  for (const [filePath, content] of corpus.entries()) {
    if (filePath === assetPath) continue;
    for (const token of tokens) {
      if (!token) continue;
      if (content.includes(token)) {
        return true;
      }
    }
  }
  return false;
}

function collectViolations() {
  const pluginRoots = discoverRuntimePluginPaths();
  const violations = [];

  for (const pluginRoot of pluginRoots) {
    const pluginName = path.basename(pluginRoot);
    const files = walk(pluginRoot);
    const corpus = loadTextCorpus(pluginRoot, files);
    const assetCandidates = files.filter((filePath) => isAssetCandidate(pluginRoot, filePath));

    for (const assetPath of assetCandidates) {
      const tokens = buildReferenceTokens(pluginRoot, assetPath);
      const referenced = hasReference(assetPath, corpus, tokens);

      if (referenced) continue;

      violations.push({
        rule: 'orphan-asset',
        plugin: pluginName,
        file: toRelative(assetPath),
        referenceTokens: tokens,
        message: `Asset appears unused (no textual references found in ${pluginName})`
      });
    }
  }

  return violations.sort((a, b) => a.file.localeCompare(b.file));
}

function signatureFor(violation) {
  return `${violation.rule}|${violation.file}`;
}

function loadBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) {
    return { entries: [], signatures: new Set() };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
    const entries = Array.isArray(parsed.violations) ? parsed.violations : [];
    const signatures = new Set(entries.map((entry) => entry.signature).filter(Boolean));
    return { entries, signatures };
  } catch (error) {
    throw new Error(`Failed to parse baseline at ${toRelative(BASELINE_PATH)}: ${error.message}`);
  }
}

function saveBaseline(violations) {
  const payload = {
    generatedAt: new Date().toISOString(),
    ruleSetVersion: '1.0.0',
    violations: violations.map((violation) => ({
      signature: signatureFor(violation),
      rule: violation.rule,
      plugin: violation.plugin,
      file: violation.file,
      message: violation.message
    }))
  };

  fs.mkdirSync(path.dirname(BASELINE_PATH), { recursive: true });
  fs.writeFileSync(BASELINE_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function printViolations(title, violations) {
  if (violations.length === 0) return;

  console.log(`\n${title} (${violations.length})`);
  for (const violation of violations.slice(0, 40)) {
    console.log(`- [${violation.rule}] ${violation.file}`);
    console.log(`  ${violation.message}`);
  }
  if (violations.length > 40) {
    console.log(`- ... ${violations.length - 40} more`);
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const violations = collectViolations();

  if (options.updateBaseline) {
    saveBaseline(violations);
    console.log('Unused Asset Check');
    console.log('==================');
    console.log(`Baseline updated: ${toRelative(BASELINE_PATH)}`);
    console.log(`Violations recorded: ${violations.length}`);
    process.exit(0);
  }

  const baseline = loadBaseline();
  const current = new Map(violations.map((violation) => [signatureFor(violation), violation]));

  const newViolations = [];
  for (const [signature, violation] of current.entries()) {
    if (!baseline.signatures.has(signature)) {
      newViolations.push(violation);
    }
  }

  const resolvedViolations = [];
  for (const old of baseline.entries) {
    if (!current.has(old.signature)) {
      resolvedViolations.push(old);
    }
  }

  console.log('Unused Asset Check');
  console.log('==================');
  console.log(`Current violations: ${violations.length}`);
  console.log(`Baseline violations: ${baseline.entries.length}`);
  console.log(`New violations: ${newViolations.length}`);
  console.log(`Resolved since baseline: ${resolvedViolations.length}`);

  printViolations('New violations', newViolations);

  if (newViolations.length > 0) {
    console.error('\nUnused-asset gate failed due to net-new violations.');
    console.error('If intentional, update baseline with:');
    console.error('  node scripts/lib/verify-unused-assets.js --update-baseline');
    process.exit(1);
  }

  console.log('\nUnused-asset gate passed.');
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`Fatal: ${error.message}`);
    process.exit(2);
  }
}
