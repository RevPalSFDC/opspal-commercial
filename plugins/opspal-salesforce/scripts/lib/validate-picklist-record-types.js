#!/usr/bin/env node

/**
 * Validate Picklist Record Types
 *
 * Pre-deployment static analysis tool that detects restricted picklist values
 * missing from record type assignments, preventing
 * INVALID_OR_NULL_FOR_RESTRICTED_PICKLIST deployment failures.
 *
 * Supports:
 *   - Monolithic object-meta.xml (recordTypes embedded)
 *   - Decomposed recordType-meta.xml files
 *   - GlobalValueSet references (field uses <valueSetName> instead of inline values)
 *
 * Exit codes:
 *   0 = no gaps found
 *   1 = gaps found
 *   2 = error
 */

'use strict';

const fs = require('fs');
const path = require('path');

// Use xml2js if available, fall back to regex-based parsing
let xml2js;
try {
  xml2js = require('xml2js');
} catch (e) {
  xml2js = null;
}

// ---------------------------------------------------------------------------
// XML parsing helpers
// ---------------------------------------------------------------------------

/**
 * Parse XML string to a plain JS object.
 * Uses xml2js when available; falls back to a minimal regex-based parser
 * sufficient for Salesforce metadata XML.
 * @param {string} xmlStr
 * @returns {Promise<Object>}
 */
async function parseXml(xmlStr) {
  if (xml2js) {
    return xml2js.parseStringPromise(xmlStr, {
      explicitArray: true,
      explicitRoot: true,
      trim: true,
    });
  }
  return regexParseXml(xmlStr);
}

/**
 * Minimal regex-based XML parser.
 * Extracts repeated blocks and scalar values for the tags we care about.
 * Not a general-purpose parser — only used when xml2js is absent.
 */
function regexParseXml(xmlStr) {
  const root = {};

  // Helper: extract all occurrences of a top-level block tag using matchAll
  function extractBlocks(xml, tag) {
    const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'g');
    return Array.from(xml.matchAll(re)).map(m => m[1]);
  }

  // Helper: extract scalar value for a tag (first occurrence)
  function extractScalar(xml, tag) {
    const m = xml.match(new RegExp(`<${tag}>([^<]*)<\\/${tag}>`));
    return m ? m[1].trim() : null;
  }

  root.CustomField = {};
  const restricted = extractScalar(xmlStr, 'restricted');
  root.CustomField.restricted = restricted ? [restricted] : ['false'];

  // Inline valueSet values
  const valueSetBlocks = extractBlocks(xmlStr, 'valueSet');
  if (valueSetBlocks.length > 0) {
    const vsXml = valueSetBlocks[0];
    // GlobalValueSet reference
    const gvsName = extractScalar(vsXml, 'valueSetName');
    if (gvsName) {
      root.CustomField.valueSet = [{ valueSetName: [gvsName] }];
    } else {
      const valueBlocks = extractBlocks(vsXml, 'value');
      const values = valueBlocks.map(vb => ({
        fullName: [extractScalar(vb, 'fullName') || ''],
        isActive: [extractScalar(vb, 'isActive') || 'true'],
      }));
      root.CustomField.valueSet = [{ valueSetDefinition: [{ value: values }] }];
    }
  }

  // Inline picklist values (older metadata format)
  const picklistBlocks = extractBlocks(xmlStr, 'picklist');
  if (picklistBlocks.length > 0) {
    const pvBlocks = extractBlocks(picklistBlocks[0], 'picklistValues');
    const values = pvBlocks.map(pvb => ({
      fullName: [extractScalar(pvb, 'fullName') || ''],
      isActive: [extractScalar(pvb, 'isActive') || 'true'],
    }));
    root.CustomField.picklist = [{ picklistValues: values }];
  }

  // fullName / type
  const fn = extractScalar(xmlStr, 'fullName');
  if (fn) root.CustomField.fullName = [fn];
  const type = extractScalar(xmlStr, 'type');
  if (type) root.CustomField.type = [type];

  return root;
}

// ---------------------------------------------------------------------------
// File system helpers
// ---------------------------------------------------------------------------

/**
 * Recursively find files matching a suffix under a directory.
 * @param {string} dir
 * @param {string} suffix
 * @returns {string[]}
 */
function findFiles(dir, suffix) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  const walk = (d) => {
    let entries;
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch (e) {
      return;
    }
    for (const entry of entries) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith(suffix)) {
        results.push(full);
      }
    }
  };
  walk(dir);
  return results;
}

/**
 * Read a file and return its content as a string, or null on error.
 * @param {string} filePath
 * @returns {string|null}
 */
function readFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Salesforce metadata structure helpers
// ---------------------------------------------------------------------------

/**
 * Given a field file path in a force-app style tree, derive the object name.
 * Typical decomposed layout:
 *   force-app/main/default/objects/<ObjectName>/fields/<FieldName>.field-meta.xml
 * @param {string} fieldPath
 * @returns {string|null}
 */
function objectNameFromFieldPath(fieldPath) {
  const parts = fieldPath.split(path.sep);
  const objectsIdx = parts.lastIndexOf('objects');
  if (objectsIdx >= 0 && objectsIdx + 1 < parts.length) {
    return parts[objectsIdx + 1];
  }
  return null;
}

// ---------------------------------------------------------------------------
// Picklist value extraction
// ---------------------------------------------------------------------------

/**
 * Given a parsed field XML object (xml2js output), extract the list of
 * active picklist value full names defined on the field.
 *
 * Returns { values: string[], isGlobalValueSet: boolean, globalValueSetName: string|null }
 * @param {Object} parsed  Result of parseXml on a .field-meta.xml file
 * @returns {{ values: string[], isGlobalValueSet: boolean, globalValueSetName: string|null }}
 */
function extractFieldPicklistValues(parsed) {
  const empty = { values: [], isGlobalValueSet: false, globalValueSetName: null };
  const root = parsed.CustomField || parsed.customField;
  if (!root) return empty;

  // Check valueSet (SFDX decomposed format)
  const valueSet = getFirst(root, 'valueSet');
  if (valueSet) {
    // GlobalValueSet reference
    const vsName = getFirstScalar(valueSet, 'valueSetName');
    if (vsName) {
      return { values: [], isGlobalValueSet: true, globalValueSetName: vsName };
    }
    // Inline valueSetDefinition
    const vsd = getFirst(valueSet, 'valueSetDefinition');
    if (vsd) {
      const rawValues = getArray(vsd, 'value');
      const active = rawValues
        .filter(v => getFirstScalar(v, 'isActive') !== 'false')
        .map(v => getFirstScalar(v, 'fullName'))
        .filter(Boolean);
      return { values: active, isGlobalValueSet: false, globalValueSetName: null };
    }
  }

  // Check picklist (older metadata format)
  const picklist = getFirst(root, 'picklist');
  if (picklist) {
    const rawValues = getArray(picklist, 'picklistValues');
    const active = rawValues
      .filter(v => getFirstScalar(v, 'isActive') !== 'false')
      .map(v => getFirstScalar(v, 'fullName'))
      .filter(Boolean);
    return { values: active, isGlobalValueSet: false, globalValueSetName: null };
  }

  return empty;
}

// ---------------------------------------------------------------------------
// GlobalValueSet resolution
// ---------------------------------------------------------------------------

/**
 * Locate and parse GlobalValueSet XML for a given valueSetName.
 * Searches under <sourcePath>/globalValueSets/<name>.globalValueSet-meta.xml
 * @param {string} sourcePath
 * @param {string} valueSetName
 * @returns {Promise<string[]>} Active value full names, or empty array if not found
 */
async function resolveGlobalValueSet(sourcePath, valueSetName) {
  const candidates = [
    path.join(sourcePath, 'globalValueSets', `${valueSetName}.globalValueSet-meta.xml`),
    path.join(sourcePath, 'main', 'default', 'globalValueSets', `${valueSetName}.globalValueSet-meta.xml`),
  ];

  // Also scan for any .globalValueSet-meta.xml with matching name anywhere under sourcePath
  const allGvs = findFiles(sourcePath, '.globalValueSet-meta.xml');
  for (const f of allGvs) {
    const bn = path.basename(f, '.globalValueSet-meta.xml');
    if (bn === valueSetName) {
      candidates.unshift(f);
    }
  }

  for (const candidate of candidates) {
    const content = readFile(candidate);
    if (!content) continue;
    try {
      const parsed = await parseXml(content);
      const root = parsed.GlobalValueSet || parsed.globalValueSet;
      if (!root) continue;
      const rawValues = getArray(root, 'customValue');
      if (rawValues.length > 0) {
        return rawValues
          .filter(v => getFirstScalar(v, 'isActive') !== 'false')
          .map(v => getFirstScalar(v, 'fullName'))
          .filter(Boolean);
      }
    } catch (e) {
      // ignore parse errors on individual files
    }
  }
  return [];
}

// ---------------------------------------------------------------------------
// Record type picklist assignment extraction
// ---------------------------------------------------------------------------

/**
 * Extract picklist assignments per record type from a monolithic object-meta.xml.
 * Returns Map<rtFullName, Map<fieldName, Set<assignedValue>>>
 * @param {Object} parsed  xml2js-parsed object-meta.xml
 * @returns {Map<string, Map<string, Set<string>>>}
 */
function extractRtAssignmentsFromObjectMeta(parsed) {
  const result = new Map(); // rtName -> Map<fieldName, Set<value>>
  const root = parsed.CustomObject || parsed.customObject;
  if (!root) return result;

  const recordTypes = getArray(root, 'recordTypes');
  for (const rt of recordTypes) {
    const rtName = getFirstScalar(rt, 'fullName');
    if (!rtName) continue;
    const fieldMap = new Map(); // fieldName -> Set<value>
    const pvBlocks = getArray(rt, 'picklistValues');
    for (const pvBlock of pvBlocks) {
      const picklist = getFirstScalar(pvBlock, 'picklist');
      if (!picklist) continue;
      const values = getArray(pvBlock, 'values').map(v => getFirstScalar(v, 'fullName')).filter(Boolean);
      fieldMap.set(picklist, new Set(values));
    }
    result.set(rtName, fieldMap);
  }
  return result;
}

/**
 * Extract picklist assignments from a single decomposed recordType-meta.xml.
 * Returns { rtName: string|null, fieldMap: Map<fieldName, Set<assignedValue>> }
 * @param {Object} parsed  xml2js-parsed recordType-meta.xml
 * @returns {{ rtName: string|null, fieldMap: Map<string, Set<string>> }}
 */
function extractRtAssignmentsFromRtMeta(parsed) {
  const root = parsed.RecordType || parsed.recordType;
  const rtName = root ? getFirstScalar(root, 'fullName') : null;
  const fieldMap = new Map();
  if (!root) return { rtName, fieldMap };

  const pvBlocks = getArray(root, 'picklistValues');
  for (const pvBlock of pvBlocks) {
    const picklist = getFirstScalar(pvBlock, 'picklist');
    if (!picklist) continue;
    const values = getArray(pvBlock, 'values').map(v => getFirstScalar(v, 'fullName')).filter(Boolean);
    fieldMap.set(picklist, new Set(values));
  }
  return { rtName, fieldMap };
}

// ---------------------------------------------------------------------------
// xml2js result navigation helpers
// These normalise between xml2js (arrays everywhere) and the regex fallback
// ---------------------------------------------------------------------------

function getFirst(obj, key) {
  if (!obj) return null;
  const val = obj[key];
  if (Array.isArray(val)) return val[0] || null;
  return val || null;
}

function getFirstScalar(obj, key) {
  const val = getFirst(obj, key);
  if (val === null || val === undefined) return null;
  if (typeof val === 'object') {
    return (val._ !== undefined ? val._ : null);
  }
  return String(val);
}

function getArray(obj, key) {
  if (!obj) return [];
  const val = obj[key];
  if (Array.isArray(val)) return val;
  if (val !== undefined && val !== null) return [val];
  return [];
}

// ---------------------------------------------------------------------------
// Core analysis logic
// ---------------------------------------------------------------------------

/**
 * Main validation function.
 *
 * @param {string} sourcePath  Path to the Salesforce source directory (force-app style)
 * @param {Object} options
 * @param {boolean} [options.strict=false]       Also warn about unrestricted picklists
 * @param {boolean} [options.generateXml=false]  Emit RT XML fragments for gaps
 * @param {boolean} [options.verbose=false]      Verbose logging
 * @returns {Promise<{ valid: boolean, gaps: Array, warnings: Array, summary: string }>}
 */
async function validateRestrictedPicklistRecordTypes(sourcePath, options = {}) {
  const { strict = false, generateXml = false, verbose = false } = options;

  const gaps = [];      // { objectName, fieldName, recordType, missingValues: string[] }
  const warnings = [];  // strict-mode unrestricted picklist notices

  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Source path does not exist: ${sourcePath}`);
  }

  // 1. Find all field-meta.xml files
  const fieldFiles = findFiles(sourcePath, '.field-meta.xml');
  if (verbose) {
    process.stderr.write(`[picklist-rt-validator] Found ${fieldFiles.length} field-meta.xml files\n`);
  }

  // 2. For each field file, check if it's a restricted picklist
  for (const fieldFile of fieldFiles) {
    const content = readFile(fieldFile);
    if (!content) continue;

    // Quick pre-filter before full parse
    const isRestricted = content.includes('<restricted>true</restricted>');
    const isUnrestricted = !isRestricted && content.includes('<restricted>');

    if (!isRestricted) {
      if (strict && isUnrestricted && content.includes('<valueSet>')) {
        const objectName = objectNameFromFieldPath(fieldFile);
        const fieldBase = path.basename(fieldFile, '.field-meta.xml');
        warnings.push(`UNRESTRICTED picklist ${objectName}.${fieldBase} — consider restricting to prevent dirty data`);
      }
      continue;
    }

    let parsed;
    try {
      parsed = await parseXml(content);
    } catch (e) {
      process.stderr.write(`[picklist-rt-validator] WARN: failed to parse ${fieldFile}: ${e.message}\n`);
      continue;
    }

    const objectName = objectNameFromFieldPath(fieldFile);
    if (!objectName) continue;

    const fieldBase = path.basename(fieldFile, '.field-meta.xml');

    // 3. Extract defined picklist values
    let { values: definedValues, isGlobalValueSet, globalValueSetName } = extractFieldPicklistValues(parsed);

    if (isGlobalValueSet && globalValueSetName) {
      if (verbose) {
        process.stderr.write(`[picklist-rt-validator] ${objectName}.${fieldBase} references GlobalValueSet "${globalValueSetName}" — resolving\n`);
      }
      definedValues = await resolveGlobalValueSet(sourcePath, globalValueSetName);
      if (definedValues.length === 0 && verbose) {
        process.stderr.write(`[picklist-rt-validator] WARN: GlobalValueSet "${globalValueSetName}" not found or empty — skipping ${objectName}.${fieldBase}\n`);
      }
    }

    if (definedValues.length === 0) continue;

    // 4. Find record type assignments for this object
    const rtAssignments = await loadRecordTypeAssignments(sourcePath, objectName, verbose);

    if (rtAssignments.size === 0) {
      if (verbose) {
        process.stderr.write(`[picklist-rt-validator] No record types found for ${objectName} — skipping field ${fieldBase}\n`);
      }
      continue;
    }

    // 5. Check each record type for missing values
    for (const [rtName, fieldMap] of rtAssignments) {
      const assignedValues = fieldMap.get(fieldBase) || new Set();
      const missing = definedValues.filter(v => !assignedValues.has(v));
      if (missing.length > 0) {
        gaps.push({
          objectName,
          fieldName: fieldBase,
          recordType: rtName,
          missingValues: missing,
          fieldFile,
          globalValueSetName: isGlobalValueSet ? globalValueSetName : null,
        });
      }
    }
  }

  // 6. Build summary
  const totalMissing = gaps.reduce((sum, g) => sum + g.missingValues.length, 0);
  const summary = gaps.length === 0
    ? 'No restricted picklist gaps found.'
    : `Found ${gaps.length} gap(s) across ${countUnique(gaps, 'objectName')} object(s): ` +
      `${totalMissing} missing value assignment(s) in record types.`;

  // 7. Optionally generate XML fragments
  if (generateXml && gaps.length > 0) {
    const xml = buildXmlFragments(gaps);
    process.stdout.write(xml);
  }

  return {
    valid: gaps.length === 0,
    gaps,
    warnings,
    summary,
  };
}

/**
 * Load all record type picklist assignments for an object.
 * Checks both monolithic object-meta.xml and decomposed recordType-meta.xml files.
 * Returns Map<rtName, Map<fieldName, Set<value>>>
 * @param {string} sourcePath
 * @param {string} objectName
 * @param {boolean} verbose
 * @returns {Promise<Map<string, Map<string, Set<string>>>>}
 */
async function loadRecordTypeAssignments(sourcePath, objectName, verbose) {
  const result = new Map();

  const objectDir = findObjectDir(sourcePath, objectName);
  if (!objectDir) return result;

  // --- Monolithic object-meta.xml ---
  const objectMetaFile = path.join(objectDir, `${objectName}.object-meta.xml`);
  if (fs.existsSync(objectMetaFile)) {
    const content = readFile(objectMetaFile);
    if (content && content.includes('<recordTypes>')) {
      try {
        const parsed = await parseXml(content);
        const rtMap = extractRtAssignmentsFromObjectMeta(parsed);
        for (const [rtName, fieldMap] of rtMap) {
          mergeInto(result, rtName, fieldMap);
        }
        if (verbose && rtMap.size > 0) {
          process.stderr.write(`[picklist-rt-validator] ${objectName}: loaded ${rtMap.size} RT(s) from object-meta.xml\n`);
        }
      } catch (e) {
        process.stderr.write(`[picklist-rt-validator] WARN: failed to parse ${objectMetaFile}: ${e.message}\n`);
      }
    }
  }

  // --- Decomposed recordType-meta.xml files ---
  const rtDir = path.join(objectDir, 'recordTypes');
  if (fs.existsSync(rtDir)) {
    const rtFiles = findFiles(rtDir, '.recordType-meta.xml');
    for (const rtFile of rtFiles) {
      const content = readFile(rtFile);
      if (!content) continue;
      try {
        const parsed = await parseXml(content);
        const { rtName, fieldMap } = extractRtAssignmentsFromRtMeta(parsed);
        const key = rtName || path.basename(rtFile, '.recordType-meta.xml');
        mergeInto(result, key, fieldMap);
      } catch (e) {
        process.stderr.write(`[picklist-rt-validator] WARN: failed to parse ${rtFile}: ${e.message}\n`);
      }
    }
    if (verbose && result.size > 0) {
      process.stderr.write(`[picklist-rt-validator] ${objectName}: loaded ${result.size} RT(s) total (decomposed + monolithic)\n`);
    }
  }

  return result;
}

/**
 * Find the directory under sourcePath that contains the given object's metadata.
 * @param {string} sourcePath
 * @param {string} objectName
 * @returns {string|null}
 */
function findObjectDir(sourcePath, objectName) {
  const walk = (dir, depth) => {
    if (depth > 8) return null;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (e) {
      return null;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const full = path.join(dir, entry.name);
      if (entry.name === objectName) {
        // Verify it looks like an object directory
        const children = fs.readdirSync(full);
        if (children.some(c => c.endsWith('.object-meta.xml') || c === 'fields' || c === 'recordTypes')) {
          return full;
        }
      }
      const found = walk(full, depth + 1);
      if (found) return found;
    }
    return null;
  };
  return walk(sourcePath, 0);
}

/**
 * Merge fieldMap entries into result map for a given rtName.
 * @param {Map} result
 * @param {string} rtName
 * @param {Map<string, Set<string>>} fieldMap
 */
function mergeInto(result, rtName, fieldMap) {
  if (!result.has(rtName)) {
    result.set(rtName, new Map());
  }
  const existing = result.get(rtName);
  for (const [fieldName, values] of fieldMap) {
    if (!existing.has(fieldName)) {
      existing.set(fieldName, new Set());
    }
    for (const v of values) {
      existing.get(fieldName).add(v);
    }
  }
}

/**
 * Count distinct values for a property across an array of objects.
 * @param {Array} arr
 * @param {string} prop
 * @returns {number}
 */
function countUnique(arr, prop) {
  return new Set(arr.map(item => item[prop])).size;
}

// ---------------------------------------------------------------------------
// XML fragment generation
// ---------------------------------------------------------------------------

/**
 * Build RT XML <picklistValues> fragments for all gaps.
 * Groups by object + record type for clean output.
 * @param {Array} gaps
 * @returns {string}
 */
function buildXmlFragments(gaps) {
  // Group by objectName -> recordType -> fieldName -> missing values
  const grouped = {};
  for (const gap of gaps) {
    if (!grouped[gap.objectName]) grouped[gap.objectName] = {};
    if (!grouped[gap.objectName][gap.recordType]) grouped[gap.objectName][gap.recordType] = {};
    grouped[gap.objectName][gap.recordType][gap.fieldName] = gap.missingValues;
  }

  const lines = [];
  lines.push('<!-- RT picklist gap fragments — merge into appropriate record type definitions -->');
  lines.push('');

  for (const [objName, rtMap] of Object.entries(grouped)) {
    lines.push(`<!-- Object: ${objName} -->`);
    for (const [rtName, fieldMap] of Object.entries(rtMap)) {
      lines.push(`  <!-- RecordType: ${rtName} -->`);
      lines.push(`  <recordTypes>`);
      lines.push(`    <fullName>${escapeXml(rtName)}</fullName>`);
      for (const [fieldName, values] of Object.entries(fieldMap)) {
        lines.push(`    <picklistValues>`);
        lines.push(`      <picklist>${escapeXml(fieldName)}</picklist>`);
        for (const v of values) {
          lines.push(`      <values>`);
          lines.push(`        <fullName>${escapeXml(v)}</fullName>`);
          lines.push(`        <default>false</default>`);
          lines.push(`      </values>`);
        }
        lines.push(`    </picklistValues>`);
      }
      lines.push(`  </recordTypes>`);
      lines.push('');
    }
  }

  return lines.join('\n') + '\n';
}

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ---------------------------------------------------------------------------
// CLI output formatting
// ---------------------------------------------------------------------------

function printTextReport(result) {
  const { gaps, warnings, summary } = result;

  if (warnings.length > 0) {
    process.stderr.write('\nWarnings:\n');
    warnings.forEach(w => process.stderr.write(`  WARN: ${w}\n`));
  }

  if (gaps.length === 0) {
    process.stdout.write(`\n[picklist-rt-validator] ${summary}\n`);
    return;
  }

  process.stdout.write('\n[picklist-rt-validator] Restricted Picklist Gaps Found\n');
  process.stdout.write('='.repeat(60) + '\n');

  // Group by object for readable output
  const byObject = {};
  for (const gap of gaps) {
    if (!byObject[gap.objectName]) byObject[gap.objectName] = [];
    byObject[gap.objectName].push(gap);
  }

  for (const [objName, objGaps] of Object.entries(byObject)) {
    process.stdout.write(`\nObject: ${objName}\n`);
    for (const gap of objGaps) {
      const gvsNote = gap.globalValueSetName ? ` (GlobalValueSet: ${gap.globalValueSetName})` : '';
      process.stdout.write(`  Field: ${gap.fieldName}${gvsNote}\n`);
      process.stdout.write(`  RecordType: ${gap.recordType}\n`);
      process.stdout.write(`  Missing values: ${gap.missingValues.join(', ')}\n`);
      process.stdout.write('\n');
    }
  }

  process.stdout.write('-'.repeat(60) + '\n');
  process.stdout.write(`${summary}\n`);
  process.stdout.write('\nFix: Add missing <picklistValues> entries to each listed record type.\n');
  process.stdout.write('Use --generate-xml to emit XML fragments ready for merge.\n');
}

// ---------------------------------------------------------------------------
// CLI block
// ---------------------------------------------------------------------------

if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    process.stdout.write(`
Validate Picklist Record Types — pre-deployment static analysis

Usage:
  node validate-picklist-record-types.js --source <path> [options]

Options:
  --source <path>   Path to Salesforce source directory (force-app style)
  --strict          Also warn about unrestricted picklists
  --generate-xml    Emit RT XML fragments for gaps to stdout
  --json            Output results as JSON
  --verbose         Show detailed progress

Exit codes:
  0  No gaps found
  1  Gaps found
  2  Error

Examples:
  node validate-picklist-record-types.js --source ./force-app
  node validate-picklist-record-types.js --source ./force-app --strict
  node validate-picklist-record-types.js --source ./force-app --generate-xml
  node validate-picklist-record-types.js --source ./force-app --json
`);
    process.exit(0);
  }

  const sourceIdx = args.indexOf('--source');
  if (sourceIdx === -1 || !args[sourceIdx + 1]) {
    process.stderr.write('Error: --source <path> is required\n');
    process.exit(2);
  }

  const sourcePath = path.resolve(args[sourceIdx + 1]);
  const strict = args.includes('--strict');
  const generateXml = args.includes('--generate-xml');
  const jsonOutput = args.includes('--json');
  const verbose = args.includes('--verbose');

  validateRestrictedPicklistRecordTypes(sourcePath, { strict, generateXml, verbose })
    .then(result => {
      if (jsonOutput) {
        const serialisable = {
          valid: result.valid,
          summary: result.summary,
          warnings: result.warnings,
          gaps: result.gaps.map(g => ({
            objectName: g.objectName,
            fieldName: g.fieldName,
            recordType: g.recordType,
            missingValues: g.missingValues,
            fieldFile: g.fieldFile,
            globalValueSetName: g.globalValueSetName,
          })),
        };
        process.stdout.write(JSON.stringify(serialisable, null, 2) + '\n');
      } else if (!generateXml) {
        // generateXml output was already written inside validateRestrictedPicklistRecordTypes
        printTextReport(result);
      }

      process.exit(result.valid ? 0 : 1);
    })
    .catch(err => {
      process.stderr.write(`Error: ${err.message}\n`);
      process.exit(2);
    });
}

// ---------------------------------------------------------------------------
// Module exports
// ---------------------------------------------------------------------------

module.exports = {
  validateRestrictedPicklistRecordTypes,
};
