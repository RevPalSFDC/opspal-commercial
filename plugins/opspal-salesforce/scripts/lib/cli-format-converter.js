#!/usr/bin/env node

/**
 * CLI Format Converter
 *
 * Automatically converts between JSON and CSV formats for SF CLI bulk operations.
 * Prevents errors like "Bulk API requires CSV format but received JSON".
 *
 * Root Cause Addressed: Reflection cohort FP-005
 * - Issue: CLI format mismatch - bulk API expects CSV, script provides JSON
 * - Example: sf data import requires CSV, not JSON
 * - Impact: 2 hours wasted per occurrence, $15K annual ROI
 *
 * Usage:
 *   const converter = require('./cli-format-converter');
 *
 *   // Auto-detect and convert
 *   const { data, format } = converter.autoConvert('sf data import bulk', jsonData);
 *   // Returns: { data: csvString, format: 'csv' }
 *
 *   // Explicit conversion
 *   const csv = converter.jsonToCsv(jsonData);
 *   const json = converter.csvToJson(csvData);
 *
 * @module cli-format-converter
 * @version 1.0.0
 * @created 2025-10-22
 */

const fs = require('fs');
const path = require('path');

/**
 * Detect expected format from CLI command
 *
 * @param {string} command - SF CLI command
 * @returns {string} Expected format: 'json', 'csv', or 'unknown'
 */
function detectExpectedFormat(command) {
  const lower = command.toLowerCase();

  // Commands that require CSV
  const csvCommands = [
    'data import bulk',
    'data upsert bulk',
    'data delete bulk',
    'data update bulk',
    'bulk api insert',
    'bulk api update',
    'bulk api upsert',
    'bulk api delete'
  ];

  for (const csvCmd of csvCommands) {
    if (lower.includes(csvCmd)) {
      return 'csv';
    }
  }

  // Commands that expect JSON
  const jsonCommands = [
    'data query',
    'data import tree',
    'sobject describe',
    'project deploy',
    'project retrieve'
  ];

  for (const jsonCmd of jsonCommands) {
    if (lower.includes(jsonCmd)) {
      return 'json';
    }
  }

  return 'unknown';
}

/**
 * Detect actual format of data
 *
 * @param {string|Object|Array} data - Data to analyze
 * @returns {string} Detected format: 'json', 'csv', or 'unknown'
 */
function detectDataFormat(data) {
  // Already an object/array
  if (typeof data === 'object') {
    return 'json';
  }

  // String data - analyze content
  if (typeof data === 'string') {
    const trimmed = data.trim();

    // Check for JSON
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
        (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try {
        JSON.parse(trimmed);
        return 'json';
      } catch (e) {
        // Not valid JSON
      }
    }

    // Check for CSV (contains commas, has header row)
    if (trimmed.includes(',') && trimmed.includes('\n')) {
      const lines = trimmed.split('\n').filter(l => l.trim());
      if (lines.length > 1) {
        return 'csv';
      }
    }
  }

  return 'unknown';
}

/**
 * Convert JSON to CSV
 *
 * @param {Object|Array|string} jsonData - JSON data (object, array, or JSON string)
 * @param {Object} options - Conversion options
 * @param {Array} options.headers - Explicit headers (optional)
 * @param {boolean} options.includeHeader - Include header row (default: true)
 * @returns {string} CSV string
 */
function jsonToCsv(jsonData, options = {}) {
  const includeHeader = options.includeHeader !== false;
  let data = jsonData;

  // Parse if string
  if (typeof jsonData === 'string') {
    data = JSON.parse(jsonData);
  }

  // Ensure array
  if (!Array.isArray(data)) {
    data = [data];
  }

  if (data.length === 0) {
    return '';
  }

  // Extract headers
  let headers = options.headers;
  if (!headers) {
    const allKeys = new Set();
    data.forEach(row => {
      Object.keys(row).forEach(key => allKeys.add(key));
    });
    headers = Array.from(allKeys);
  }

  // Build CSV
  let csv = '';

  // Header row
  if (includeHeader) {
    csv += headers.map(h => escapeCsvValue(h)).join(',') + '\n';
  }

  // Data rows
  data.forEach(row => {
    const values = headers.map(header => {
      const value = row[header];
      return escapeCsvValue(value);
    });
    csv += values.join(',') + '\n';
  });

  return csv;
}

/**
 * Convert CSV to JSON
 *
 * @param {string} csvData - CSV string
 * @param {Object} options - Conversion options
 * @param {boolean} options.hasHeader - First row is header (default: true)
 * @param {Array} options.headers - Explicit headers (optional)
 * @returns {Array} Array of objects
 */
function csvToJson(csvData, options = {}) {
  const hasHeader = options.hasHeader !== false;
  let lines = csvData.trim().split('\n').filter(l => l.trim());

  if (lines.length === 0) {
    return [];
  }

  let headers = options.headers;
  let dataStartIndex = 0;

  // Extract headers
  if (hasHeader && !headers) {
    const headerLine = lines[0];
    headers = parseCsvLine(headerLine);
    dataStartIndex = 1;
  }

  if (!headers) {
    // No headers - use column indices
    const firstLine = parseCsvLine(lines[0]);
    headers = firstLine.map((_, i) => `column_${i}`);
  }

  // Parse data rows
  const result = [];
  for (let i = dataStartIndex; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const row = {};

    headers.forEach((header, index) => {
      row[header] = values[index] || null;
    });

    result.push(row);
  }

  return result;
}

/**
 * Parse a single CSV line handling quoted values
 *
 * @param {string} line - CSV line
 * @returns {Array} Array of values
 */
function parseCsvLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped quote
        current += '"';
        i++;
      } else {
        // Toggle quotes
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      // End of value
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  // Add last value
  values.push(current.trim());

  return values;
}

/**
 * Escape a value for CSV
 *
 * @param {any} value - Value to escape
 * @returns {string} Escaped value
 */
function escapeCsvValue(value) {
  if (value === null || value === undefined) {
    return '';
  }

  const str = String(value);

  // Check if escaping needed
  const needsEscaping = str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r');

  if (needsEscaping) {
    // Escape quotes by doubling them
    const escaped = str.replace(/"/g, '""');
    return `"${escaped}"`;
  }

  return str;
}

/**
 * Auto-convert data to expected format based on command
 *
 * @param {string} command - SF CLI command
 * @param {string|Object|Array} data - Data to convert
 * @param {Object} options - Conversion options
 * @returns {Object} { data: convertedData, format: 'json'|'csv', converted: boolean }
 */
function autoConvert(command, data, options = {}) {
  const expectedFormat = detectExpectedFormat(command);
  const actualFormat = detectDataFormat(data);

  // No conversion needed
  if (expectedFormat === actualFormat || expectedFormat === 'unknown') {
    return {
      data,
      format: actualFormat,
      converted: false
    };
  }

  // Convert
  let converted = data;
  if (expectedFormat === 'csv' && actualFormat === 'json') {
    converted = jsonToCsv(data, options);
  } else if (expectedFormat === 'json' && actualFormat === 'csv') {
    converted = csvToJson(data, options);
  }

  return {
    data: converted,
    format: expectedFormat,
    converted: true,
    originalFormat: actualFormat
  };
}

/**
 * Write data to file in correct format
 *
 * @param {string} filePath - Output file path
 * @param {string|Object|Array} data - Data to write
 * @param {string} format - Target format: 'json' or 'csv'
 * @param {Object} options - Conversion options
 */
function writeFormattedFile(filePath, data, format, options = {}) {
  let content = data;

  // Convert if needed
  const actualFormat = detectDataFormat(data);
  if (format === 'csv' && actualFormat === 'json') {
    content = jsonToCsv(data, options);
  } else if (format === 'json' && actualFormat === 'csv') {
    content = JSON.stringify(csvToJson(data, options), null, 2);
  } else if (format === 'json' && typeof data === 'object') {
    content = JSON.stringify(data, null, 2);
  }

  fs.writeFileSync(filePath, content, 'utf-8');
}

/**
 * Read and parse file, detecting format
 *
 * @param {string} filePath - Input file path
 * @param {Object} options - Parsing options
 * @returns {Object} { data, format }
 */
function readFormattedFile(filePath, options = {}) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const format = detectDataFormat(content);

  let data = content;
  if (format === 'json') {
    data = JSON.parse(content);
  } else if (format === 'csv') {
    data = csvToJson(content, options);
  }

  return { data, format };
}

// Export functions
module.exports = {
  detectExpectedFormat,
  detectDataFormat,
  jsonToCsv,
  csvToJson,
  autoConvert,
  writeFormattedFile,
  readFormattedFile,
  escapeCsvValue,
  parseCsvLine
};

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log('Usage: node cli-format-converter.js <command> <input-file> [output-file]');
    console.log('');
    console.log('Example:');
    console.log('  node cli-format-converter.js "sf data import bulk" data.json data.csv');
    process.exit(1);
  }

  const command = args[0];
  const inputFile = args[1];
  const outputFile = args[2];

  try {
    // Read input
    const { data, format: inputFormat } = readFormattedFile(inputFile);
    console.log(`Input format: ${inputFormat}`);

    // Auto-convert
    const result = autoConvert(command, data);
    console.log(`Expected format: ${result.format}`);

    if (result.converted) {
      console.log(`✅ Converted ${inputFormat} → ${result.format}`);

      // Write output
      if (outputFile) {
        fs.writeFileSync(outputFile, result.data, 'utf-8');
        console.log(`Saved to: ${outputFile}`);
      } else {
        console.log('\n--- Output ---');
        console.log(result.data);
      }
    } else {
      console.log('✅ No conversion needed');
    }

  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    process.exit(1);
  }
}
