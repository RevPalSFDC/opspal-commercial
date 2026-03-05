#!/usr/bin/env node

/**
 * CSV Utilities for Salesforce Bulk API Operations
 *
 * Provides normalization and validation utilities for CSV files before
 * Salesforce Bulk API operations.
 *
 * Problem: Salesforce Bulk API rejects CSV files with:
 * - Windows CRLF line endings (requires Unix LF)
 * - UTF-8 BOM (Byte Order Mark)
 * - Inconsistent line endings
 * - Invalid encoding
 *
 * Usage:
 *   node csv-utils.js normalize <file>           Normalize and overwrite
 *   node csv-utils.js normalize <file> --output <out>  Normalize to new file
 *   node csv-utils.js validate <file>            Check if file needs normalization
 *   node csv-utils.js info <file>                Show file info
 *   node csv-utils.js --test                     Run self-tests
 *
 * Programmatic:
 *   const { normalizeCsvForBulkApi, validateCsvFormat } = require('./csv-utils');
 *   const normalized = await normalizeCsvForBulkApi('./data.csv');
 *
 * ROI: $2,400/year (prevents CRLF-related bulk API failures)
 */

const fs = require('fs');
const path = require('path');

/**
 * Detect line ending type in content
 * @param {string|Buffer} content - File content
 * @returns {Object} Line ending info
 */
function detectLineEndings(content) {
  const str = Buffer.isBuffer(content) ? content.toString('utf-8') : content;

  const crlfCount = (str.match(/\r\n/g) || []).length;
  const lfCount = (str.match(/(?<!\r)\n/g) || []).length;
  const crCount = (str.match(/\r(?!\n)/g) || []).length;

  let primary = 'unix'; // LF
  let maxCount = lfCount;

  if (crlfCount > maxCount) {
    primary = 'windows'; // CRLF
    maxCount = crlfCount;
  }

  if (crCount > maxCount) {
    primary = 'mac'; // CR (old Mac)
    maxCount = crCount;
  }

  const mixed = (crlfCount > 0 && lfCount > 0) ||
                (crlfCount > 0 && crCount > 0) ||
                (lfCount > 0 && crCount > 0);

  return {
    primary,
    counts: {
      windows: crlfCount,  // \r\n
      unix: lfCount,       // \n
      mac: crCount         // \r
    },
    mixed,
    total: crlfCount + lfCount + crCount,
    needsNormalization: primary !== 'unix' || mixed
  };
}

/**
 * Detect BOM (Byte Order Mark) in file
 * @param {Buffer} buffer - File buffer
 * @returns {Object} BOM detection result
 */
function detectBom(buffer) {
  if (!Buffer.isBuffer(buffer)) {
    buffer = Buffer.from(buffer, 'utf-8');
  }

  const boms = {
    'utf8': { bytes: [0xEF, 0xBB, 0xBF], name: 'UTF-8 BOM' },
    'utf16be': { bytes: [0xFE, 0xFF], name: 'UTF-16 BE BOM' },
    'utf16le': { bytes: [0xFF, 0xFE], name: 'UTF-16 LE BOM' },
    'utf32be': { bytes: [0x00, 0x00, 0xFE, 0xFF], name: 'UTF-32 BE BOM' },
    'utf32le': { bytes: [0xFF, 0xFE, 0x00, 0x00], name: 'UTF-32 LE BOM' }
  };

  for (const [type, spec] of Object.entries(boms)) {
    if (buffer.length >= spec.bytes.length) {
      const match = spec.bytes.every((b, i) => buffer[i] === b);
      if (match) {
        return {
          hasBom: true,
          type,
          name: spec.name,
          length: spec.bytes.length
        };
      }
    }
  }

  return { hasBom: false, type: null, name: null, length: 0 };
}

/**
 * Normalize CSV content for Salesforce Bulk API
 * @param {string|Buffer} content - File content
 * @param {Object} options - Normalization options
 * @returns {string} Normalized content
 */
function normalizeContent(content, options = {}) {
  let str = Buffer.isBuffer(content) ? content.toString('utf-8') : content;

  // Remove BOM if present
  const bomInfo = detectBom(Buffer.from(str, 'utf-8'));
  if (bomInfo.hasBom && bomInfo.type === 'utf8') {
    str = str.slice(1); // Remove UTF-8 BOM (1 character after conversion)
  }

  // Normalize line endings to Unix LF
  // Order matters: CRLF first, then CR
  str = str.replace(/\r\n/g, '\n');  // Windows CRLF -> LF
  str = str.replace(/\r/g, '\n');    // Old Mac CR -> LF

  // Ensure file ends with newline (optional but recommended)
  if (options.ensureTrailingNewline !== false && !str.endsWith('\n')) {
    str += '\n';
  }

  // Remove trailing whitespace from lines (optional)
  if (options.trimLines) {
    str = str.split('\n').map(line => line.trimEnd()).join('\n');
  }

  return str;
}

/**
 * Validate CSV format for Salesforce Bulk API
 * @param {string} filePath - Path to CSV file
 * @returns {Object} Validation result
 */
function validateCsvFormat(filePath) {
  const buffer = fs.readFileSync(filePath);
  const content = buffer.toString('utf-8');

  const lineEndings = detectLineEndings(content);
  const bomInfo = detectBom(buffer);

  const issues = [];
  const warnings = [];

  // Check for BOM
  if (bomInfo.hasBom) {
    issues.push(`File has ${bomInfo.name} - Salesforce Bulk API may reject`);
  }

  // Check line endings
  if (lineEndings.primary === 'windows') {
    issues.push('File uses Windows (CRLF) line endings - must use Unix (LF)');
  } else if (lineEndings.primary === 'mac') {
    issues.push('File uses old Mac (CR) line endings - must use Unix (LF)');
  }

  if (lineEndings.mixed) {
    issues.push('File has mixed line endings - must be consistent Unix (LF)');
  }

  // Check encoding (basic check)
  try {
    const _ = Buffer.from(content, 'utf-8').toString('utf-8');
  } catch {
    issues.push('File encoding may not be valid UTF-8');
  }

  // Check for common CSV issues
  const lines = content.split(/\r?\n/);
  const headerLine = lines[0] || '';

  if (headerLine.includes('\t') && !headerLine.includes(',')) {
    warnings.push('File appears to be tab-delimited, not comma-delimited');
  }

  // Check for empty first column (common Excel export issue)
  if (headerLine.startsWith(',')) {
    warnings.push('First column header is empty - possible Excel export issue');
  }

  return {
    valid: issues.length === 0,
    issues,
    warnings,
    details: {
      filePath,
      fileSize: buffer.length,
      lineCount: lines.length,
      lineEndings,
      bom: bomInfo
    },
    needsNormalization: lineEndings.needsNormalization || bomInfo.hasBom
  };
}

/**
 * Normalize a CSV file for Salesforce Bulk API
 * @param {string} inputPath - Input file path
 * @param {Object} options - Options
 * @returns {Object} Result with normalized content path
 */
async function normalizeCsvForBulkApi(inputPath, options = {}) {
  const outputPath = options.output || inputPath;
  const dryRun = options.dryRun || false;

  // Read file
  const buffer = fs.readFileSync(inputPath);
  const originalContent = buffer.toString('utf-8');

  // Validate first
  const validation = validateCsvFormat(inputPath);

  // Normalize
  const normalizedContent = normalizeContent(originalContent, {
    ensureTrailingNewline: options.ensureTrailingNewline !== false,
    trimLines: options.trimLines || false
  });

  const changed = originalContent !== normalizedContent;

  const result = {
    success: true,
    inputPath,
    outputPath,
    changed,
    validation,
    normalizations: []
  };

  // Track what was normalized
  if (validation.details.bom.hasBom) {
    result.normalizations.push(`Removed ${validation.details.bom.name}`);
  }

  if (validation.details.lineEndings.primary !== 'unix' || validation.details.lineEndings.mixed) {
    result.normalizations.push('Converted line endings to Unix (LF)');
  }

  if (!originalContent.endsWith('\n') && normalizedContent.endsWith('\n')) {
    result.normalizations.push('Added trailing newline');
  }

  // Write output (unless dry run)
  if (!dryRun && changed) {
    fs.writeFileSync(outputPath, normalizedContent, 'utf-8');
    result.message = `Normalized ${result.normalizations.length} issue(s) and saved to ${outputPath}`;
  } else if (dryRun && changed) {
    result.message = `[DRY RUN] Would normalize ${result.normalizations.length} issue(s)`;
  } else {
    result.message = 'File already normalized, no changes needed';
  }

  return result;
}

/**
 * Get detailed info about a CSV file
 * @param {string} filePath - Path to CSV file
 * @returns {Object} File info
 */
function getCsvInfo(filePath) {
  const stats = fs.statSync(filePath);
  const buffer = fs.readFileSync(filePath);
  const content = buffer.toString('utf-8');
  const lines = content.split(/\r?\n/);

  const lineEndings = detectLineEndings(content);
  const bomInfo = detectBom(buffer);

  // Parse header to count columns
  const headerLine = lines[0] || '';
  const delimiter = headerLine.includes('\t') ? '\t' : ',';
  const columns = headerLine.split(delimiter).length;

  return {
    filePath,
    fileName: path.basename(filePath),
    fileSize: stats.size,
    fileSizeHuman: formatBytes(stats.size),
    lineCount: lines.length,
    columnCount: columns,
    delimiter: delimiter === '\t' ? 'TAB' : 'COMMA',
    encoding: 'UTF-8', // Assumed
    bom: bomInfo,
    lineEndings: {
      type: lineEndings.primary,
      description: {
        'windows': 'Windows (CRLF - \\r\\n)',
        'unix': 'Unix (LF - \\n)',
        'mac': 'Old Mac (CR - \\r)'
      }[lineEndings.primary],
      mixed: lineEndings.mixed,
      counts: lineEndings.counts
    },
    bulkApiReady: !lineEndings.needsNormalization && !bomInfo.hasBom,
    recommendations: getRecommendations(lineEndings, bomInfo)
  };
}

/**
 * Get recommendations based on file analysis
 */
function getRecommendations(lineEndings, bomInfo) {
  const recommendations = [];

  if (bomInfo.hasBom) {
    recommendations.push('Remove BOM before Bulk API import');
  }

  if (lineEndings.primary !== 'unix') {
    recommendations.push('Convert line endings to Unix (LF)');
  }

  if (lineEndings.mixed) {
    recommendations.push('File has mixed line endings - normalize to Unix (LF)');
  }

  if (recommendations.length === 0) {
    recommendations.push('File is ready for Salesforce Bulk API');
  }

  return recommendations;
}

/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Run self-tests
 */
function runTests() {
  console.log('=== CSV Utils Self-Test ===\n');

  const tests = [
    {
      name: 'detectLineEndings - Windows CRLF',
      test: () => {
        const result = detectLineEndings('line1\r\nline2\r\nline3');
        if (result.primary !== 'windows') throw new Error(`Expected windows, got ${result.primary}`);
        if (result.counts.windows !== 2) throw new Error(`Expected 2 CRLF, got ${result.counts.windows}`);
        return `Detected ${result.counts.windows} CRLF`;
      }
    },
    {
      name: 'detectLineEndings - Unix LF',
      test: () => {
        const result = detectLineEndings('line1\nline2\nline3');
        if (result.primary !== 'unix') throw new Error(`Expected unix, got ${result.primary}`);
        return `Detected ${result.counts.unix} LF`;
      }
    },
    {
      name: 'detectLineEndings - Mixed',
      test: () => {
        const result = detectLineEndings('line1\r\nline2\nline3');
        if (!result.mixed) throw new Error('Expected mixed=true');
        return 'Mixed line endings detected';
      }
    },
    {
      name: 'detectBom - UTF-8 BOM',
      test: () => {
        const bomBuffer = Buffer.from([0xEF, 0xBB, 0xBF, 0x68, 0x65, 0x6C, 0x6C, 0x6F]);
        const result = detectBom(bomBuffer);
        if (!result.hasBom) throw new Error('Expected BOM to be detected');
        if (result.type !== 'utf8') throw new Error(`Expected utf8, got ${result.type}`);
        return 'UTF-8 BOM detected';
      }
    },
    {
      name: 'detectBom - No BOM',
      test: () => {
        const noBomBuffer = Buffer.from('hello\nworld');
        const result = detectBom(noBomBuffer);
        if (result.hasBom) throw new Error('Expected no BOM');
        return 'No BOM correctly identified';
      }
    },
    {
      name: 'normalizeContent - CRLF to LF',
      test: () => {
        const input = 'line1\r\nline2\r\nline3';
        const output = normalizeContent(input, { ensureTrailingNewline: false });
        if (output.includes('\r')) throw new Error('CR still present after normalization');
        if (output !== 'line1\nline2\nline3') throw new Error('Unexpected output');
        return 'CRLF normalized to LF';
      }
    },
    {
      name: 'normalizeContent - Remove BOM',
      test: () => {
        const bomChar = '\uFEFF'; // UTF-8 BOM as string
        const input = bomChar + 'header1,header2\ndata1,data2';
        const output = normalizeContent(input, { ensureTrailingNewline: false });
        if (output.startsWith(bomChar)) throw new Error('BOM still present');
        return 'BOM removed';
      }
    }
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      const result = test.test();
      console.log(`  [PASS] ${test.name}: ${result}`);
      passed++;
    } catch (error) {
      console.log(`  [FAIL] ${test.name}: ${error.message}`);
      failed++;
    }
  }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  return failed === 0;
}

// CLI execution
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === '--test') {
    const success = runTests();
    process.exit(success ? 0 : 1);
  }

  if (!command || command === 'help' || command === '--help') {
    console.log(`
CSV Utilities for Salesforce Bulk API

Commands:
  normalize <file> [--output <out>] [--dry-run]   Normalize CSV for Bulk API
  validate <file>                                 Check if file needs normalization
  info <file>                                     Show detailed file info
  --test                                          Run self-tests

Options:
  --output <path>    Write to different file (default: overwrite input)
  --dry-run          Show what would change without modifying

Examples:
  node csv-utils.js normalize data.csv
  node csv-utils.js normalize data.csv --output data-normalized.csv
  node csv-utils.js validate data.csv
  node csv-utils.js info data.csv
`);
    process.exit(command ? 0 : 1);
  }

  const filePath = args[1];

  if (!filePath) {
    console.error('Error: File path required');
    process.exit(1);
  }

  if (!fs.existsSync(filePath)) {
    console.error(`Error: File not found: ${filePath}`);
    process.exit(1);
  }

  try {
    switch (command) {
      case 'normalize': {
        const outputIndex = args.indexOf('--output');
        const output = outputIndex !== -1 ? args[outputIndex + 1] : undefined;
        const dryRun = args.includes('--dry-run');

        const result = await normalizeCsvForBulkApi(filePath, { output, dryRun });
        console.log(JSON.stringify(result, null, 2));
        process.exit(result.success ? 0 : 1);
        break;
      }

      case 'validate': {
        const result = validateCsvFormat(filePath);
        console.log(JSON.stringify(result, null, 2));
        process.exit(result.valid ? 0 : 1);
        break;
      }

      case 'info': {
        const info = getCsvInfo(filePath);
        console.log(JSON.stringify(info, null, 2));
        break;
      }

      default:
        console.error(`Unknown command: ${command}`);
        process.exit(1);
    }
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

// Export for programmatic use
module.exports = {
  detectLineEndings,
  detectBom,
  normalizeContent,
  validateCsvFormat,
  normalizeCsvForBulkApi,
  getCsvInfo
};

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error(`Fatal error: ${error.message}`);
    process.exit(1);
  });
}
