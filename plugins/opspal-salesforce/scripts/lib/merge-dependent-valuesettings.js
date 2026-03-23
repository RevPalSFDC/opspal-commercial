#!/usr/bin/env node

/**
 * Merge Duplicate valueSettings in Dependent Picklist Field Metadata
 *
 * Salesforce treats separate <valueSettings> blocks sharing the same <valueName>
 * as sequential overwrites (last one wins), not merges. This script detects and
 * collapses duplicates by merging all <controllingFieldValue> entries from each
 * duplicate block into a single canonical <valueSettings> block.
 *
 * Usage (CLI):
 *   node merge-dependent-valuesettings.js --file path/to/Field__c.field-meta.xml
 *   node merge-dependent-valuesettings.js --source ./force-app --dry-run
 *   node merge-dependent-valuesettings.js --source ./force-app --fix
 *   node merge-dependent-valuesettings.js --file path --json
 *
 * Exit codes:
 *   0 = clean (no duplicates found, or all fixed)
 *   1 = duplicates found (dry-run mode)
 *   2 = error
 *
 * @version 1.0.0
 * @date 2026-03-23
 */

'use strict';

const fs = require('fs');
const path = require('path');
const xml2js = require('xml2js');

// ---------------------------------------------------------------------------
// Core merge logic
// ---------------------------------------------------------------------------

/**
 * Merge duplicate valueSettings blocks in a parsed CustomField XML object.
 *
 * xml2js with explicitArray:true represents repeated sibling elements as an
 * array, so parsed.CustomField.valueSettings is Array<valueSettingsBlock>.
 * Each block has the shape:
 *   { valueName: [string], controllingFieldValue: [string, ...], ... }
 *
 * @param {Object} parsed - xml2js parse result (explicitArray:true)
 * @returns {{ modified: boolean, mergedCount: number, details: Array }}
 */
function mergeValueSettings(parsed) {
  const details = [];
  let mergedCount = 0;
  let modified = false;

  // Navigate to the root element — Salesforce field files use <CustomField>
  const rootKey = Object.keys(parsed).find(k => parsed[k] && typeof parsed[k] === 'object');
  if (!rootKey) {
    return { modified: false, mergedCount: 0, details: [] };
  }

  const root = parsed[rootKey];

  // valueSettings may not exist (non-dependent picklist) or be a single object
  // xml2js with explicitArray:true always wraps repeated elements in arrays.
  let vsBlocks = root.valueSettings;
  if (!vsBlocks) {
    return { modified: false, mergedCount: 0, details: [] };
  }

  // Normalise to array
  if (!Array.isArray(vsBlocks)) {
    vsBlocks = [vsBlocks];
  }

  if (vsBlocks.length <= 1) {
    return { modified: false, mergedCount: 0, details: [] };
  }

  // Group blocks by valueName
  const byValueName = new Map();
  for (const block of vsBlocks) {
    // valueName is an array under explicitArray:true
    const nameArr = block.valueName;
    const name = Array.isArray(nameArr) ? nameArr[0] : nameArr;
    if (name === undefined || name === null) {
      continue;
    }
    if (!byValueName.has(name)) {
      byValueName.set(name, []);
    }
    byValueName.get(name).push(block);
  }

  // Check for any duplicates
  const hasDuplicates = [...byValueName.values()].some(blocks => blocks.length > 1);
  if (!hasDuplicates) {
    return { modified: false, mergedCount: 0, details: [] };
  }

  // Build merged blocks (preserve insertion order of first occurrence)
  const seen = new Set();
  const mergedBlocks = [];

  for (const block of vsBlocks) {
    const nameArr = block.valueName;
    const name = Array.isArray(nameArr) ? nameArr[0] : nameArr;

    if (seen.has(name)) {
      continue; // already handled
    }
    seen.add(name);

    const group = byValueName.get(name);
    if (group.length === 1) {
      mergedBlocks.push(block);
      continue;
    }

    // Collect all controllingFieldValue entries across all blocks for this name
    const allCFVs = new Set();
    for (const b of group) {
      const cfvs = b.controllingFieldValue;
      if (!cfvs) continue;
      const cfvArr = Array.isArray(cfvs) ? cfvs : [cfvs];
      for (const v of cfvArr) {
        allCFVs.add(v);
      }
    }

    // Sort for deterministic output
    const sortedCFVs = [...allCFVs].sort();

    // Build merged block: start from first occurrence, replace controllingFieldValue
    const mergedBlock = Object.assign({}, group[0]);
    mergedBlock.controllingFieldValue = sortedCFVs;

    mergedBlocks.push(mergedBlock);
    mergedCount++;
    modified = true;

    details.push({
      valueName: name,
      duplicateBlockCount: group.length,
      originalCFVCounts: group.map(b => {
        const cfvs = b.controllingFieldValue;
        if (!cfvs) return 0;
        return Array.isArray(cfvs) ? cfvs.length : 1;
      }),
      mergedCFVCount: sortedCFVs.length,
      mergedCFVs: sortedCFVs,
    });
  }

  if (modified) {
    root.valueSettings = mergedBlocks;
  }

  return { modified, mergedCount, details };
}

// ---------------------------------------------------------------------------
// File-level operations
// ---------------------------------------------------------------------------

/**
 * Parse, merge, and optionally write a single .field-meta.xml file.
 *
 * @param {string} filePath - Absolute or relative path to the file
 * @param {Object} [options]
 * @param {boolean} [options.dryRun=false] - If true, do not write changes
 * @param {string|null} [options.outputPath=null] - Write to this path instead of in-place
 * @returns {{ modified: boolean, mergedCount: number, details: Array }}
 */
function mergeDuplicateValueSettings(filePath, options = {}) {
  const { dryRun = false, outputPath = null } = options;

  let xmlContent;
  try {
    xmlContent = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    throw new Error(`Cannot read file ${filePath}: ${err.message}`);
  }

  // Preserve XML declaration for round-trip fidelity
  const declarationMatch = xmlContent.match(/^(<\?xml[^?]*\?>)\s*/);
  const xmlDeclaration = declarationMatch ? declarationMatch[1] : '<?xml version="1.0" encoding="UTF-8"?>';

  let parsed;
  try {
    const parser = new xml2js.Parser({
      explicitArray: true,
      explicitCharkey: false,
      mergeAttrs: false,
    });
    // xml2js.parseString is callback-based; use the synchronous parseStringPromise shim
    // For CommonJS/sync usage we drive it through the internal parseString synchronously
    // by exploiting that xml2js exposes a synchronous path via parseString with a
    // callback that fires synchronously for well-formed XML.
    let parseError = null;
    let parseResult = null;
    parser.parseString(xmlContent, (err, result) => {
      parseError = err;
      parseResult = result;
    });
    if (parseError) {
      throw parseError;
    }
    parsed = parseResult;
  } catch (err) {
    throw new Error(`Failed to parse XML in ${filePath}: ${err.message}`);
  }

  const result = mergeValueSettings(parsed);

  if (result.modified && !dryRun) {
    const builder = new xml2js.Builder({
      xmldec: { version: '1.0', encoding: 'UTF-8' },
      renderOpts: { pretty: true, indent: '    ', newline: '\n' },
      headless: false,
    });
    const newXml = builder.buildObject(parsed);
    const dest = outputPath || filePath;
    try {
      fs.writeFileSync(dest, newXml, 'utf8');
    } catch (err) {
      throw new Error(`Failed to write ${dest}: ${err.message}`);
    }
  }

  return result;
}

/**
 * Recursively scan a source directory for .field-meta.xml files and process each.
 *
 * @param {string} sourcePath - Directory to scan
 * @param {Object} [options]
 * @param {boolean} [options.dryRun=false] - If true, report only, do not write
 * @returns {Array<{ filePath: string, modified: boolean, mergedCount: number, details: Array, error: string|null }>}
 */
function scanDirectory(sourcePath, options = {}) {
  const { dryRun = false } = options;
  const results = [];

  function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (err) {
      return; // skip unreadable dirs
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith('.field-meta.xml')) {
        let fileResult;
        try {
          fileResult = mergeDuplicateValueSettings(full, { dryRun });
          results.push({ filePath: full, error: null, ...fileResult });
        } catch (err) {
          results.push({
            filePath: full,
            modified: false,
            mergedCount: 0,
            details: [],
            error: err.message,
          });
        }
      }
    }
  }

  walk(sourcePath);
  return results;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    process.stdout.write(`
Merge Duplicate valueSettings in Salesforce Dependent Picklist Field Metadata

Usage:
  node merge-dependent-valuesettings.js --file <path>              Merge in place
  node merge-dependent-valuesettings.js --file <path> --dry-run    Report only
  node merge-dependent-valuesettings.js --file <path> --json       JSON output
  node merge-dependent-valuesettings.js --source <dir> --dry-run   Scan, report
  node merge-dependent-valuesettings.js --source <dir> --fix       Scan and fix

Exit codes:
  0  Clean — no duplicates found, or all fixed
  1  Duplicates found (dry-run mode)
  2  Error
`);
    process.exit(0);
  }

  const fileIndex = args.indexOf('--file');
  const sourceIndex = args.indexOf('--source');
  const dryRun = args.includes('--dry-run');
  const fix = args.includes('--fix');
  const jsonOutput = args.includes('--json');

  // --file mode
  if (fileIndex !== -1) {
    const filePath = args[fileIndex + 1];
    if (!filePath) {
      process.stderr.write('Error: --file requires a path argument\n');
      process.exit(2);
    }

    let result;
    try {
      result = mergeDuplicateValueSettings(filePath, { dryRun });
    } catch (err) {
      if (jsonOutput) {
        process.stdout.write(JSON.stringify({ error: err.message }, null, 2) + '\n');
      } else {
        process.stderr.write(`Error: ${err.message}\n`);
      }
      process.exit(2);
    }

    if (jsonOutput) {
      process.stdout.write(JSON.stringify({ filePath, ...result }, null, 2) + '\n');
    } else {
      if (!result.modified) {
        process.stdout.write(`No duplicate valueSettings found in ${path.basename(filePath)}\n`);
      } else {
        const action = dryRun ? '[DRY RUN] Would merge' : 'Merged';
        process.stdout.write(`${action} ${result.mergedCount} duplicate valueSettings block(s) in ${path.basename(filePath)}\n`);
        for (const d of result.details) {
          process.stdout.write(
            `  valueName "${d.valueName}": ${d.duplicateBlockCount} blocks -> 1 ` +
            `(${d.mergedCFVCount} unique controllingFieldValues)\n`
          );
        }
      }
    }

    process.exit(dryRun && result.modified ? 1 : 0);
  }

  // --source mode
  if (sourceIndex !== -1) {
    const sourcePath = args[sourceIndex + 1];
    if (!sourcePath) {
      process.stderr.write('Error: --source requires a directory path argument\n');
      process.exit(2);
    }

    if (!dryRun && !fix) {
      process.stderr.write('Error: --source requires either --dry-run or --fix\n');
      process.exit(2);
    }

    let scanResults;
    try {
      scanResults = scanDirectory(sourcePath, { dryRun: dryRun || !fix });
    } catch (err) {
      process.stderr.write(`Error: ${err.message}\n`);
      process.exit(2);
    }

    const withDuplicates = scanResults.filter(r => r.modified || (r.details && r.details.length > 0));
    const withErrors = scanResults.filter(r => r.error);
    const totalMerged = scanResults.reduce((sum, r) => sum + (r.mergedCount || 0), 0);

    if (jsonOutput) {
      process.stdout.write(JSON.stringify(scanResults, null, 2) + '\n');
    } else {
      process.stdout.write(`Scanned ${scanResults.length} field-meta.xml file(s)\n`);
      if (withDuplicates.length === 0) {
        process.stdout.write('No duplicate valueSettings found.\n');
      } else {
        const action = dryRun ? 'Would fix' : 'Fixed';
        process.stdout.write(`${action} ${withDuplicates.length} file(s), ${totalMerged} merged block(s)\n\n`);
        for (const r of withDuplicates) {
          process.stdout.write(`  ${r.filePath}\n`);
          for (const d of r.details) {
            process.stdout.write(
              `    valueName "${d.valueName}": ${d.duplicateBlockCount} blocks -> 1 ` +
              `(${d.mergedCFVCount} unique controllingFieldValues)\n`
            );
          }
        }
      }
      if (withErrors.length > 0) {
        process.stderr.write(`\n${withErrors.length} file(s) had errors:\n`);
        for (const r of withErrors) {
          process.stderr.write(`  ${r.filePath}: ${r.error}\n`);
        }
      }
    }

    const hasErrors = withErrors.length > 0;
    if (hasErrors) process.exit(2);
    process.exit(dryRun && withDuplicates.length > 0 ? 1 : 0);
  }

  process.stderr.write('Error: specify --file <path> or --source <dir>\n');
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Module exports
// ---------------------------------------------------------------------------

module.exports = {
  mergeDuplicateValueSettings,
  scanDirectory,
};
