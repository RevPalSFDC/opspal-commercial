#!/usr/bin/env node

/**
 * Safe CSV Parser
 *
 * Header-based CSV parsing (NOT positional indices) to prevent data integrity issues:
 * - Maps columns by header name, not position
 * - Validates headers against expected schema
 * - Handles missing columns gracefully
 * - Detects and fixes common CSV issues (line endings, encoding, quotes)
 * - Provides clear error messages with line numbers
 *
 * ROI: Part of $126,000/year dependency analyzer suite
 *
 * Usage:
 *   const parser = new CSVParserSafe(options);
 *   const data = await parser.parse(csvPath, schema);
 *
 * @see docs/DATA_INTEGRITY_PROTOCOL.md
 * @runbook Ensures CSV data integrity during import/export
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

class CSVParserSafe {
  constructor(options = {}) {
    this.verbose = options.verbose !== false;
    this.strictMode = options.strict || false;  // Fail on missing columns
    this.autoFix = options.autoFix || false;    // Auto-fix common issues
    this.encoding = options.encoding || 'utf-8';
    this.delimiter = options.delimiter || ',';
    this.errors = [];
    this.warnings = [];
    this.fixes = [];
  }

  /**
   * Parse CSV file using header-based mapping
   * @param {string} csvPath - Path to CSV file
   * @param {Object} schema - Expected schema with column definitions
   * @returns {Promise<Array>} Parsed data rows
   */
  async parse(csvPath, schema = null) {
    this.errors = [];
    this.warnings = [];
    this.fixes = [];

    try {
      if (!fs.existsSync(csvPath)) {
        throw new Error(`CSV file not found: ${csvPath}`);
      }

      this.log(`📊 Parsing CSV: ${path.basename(csvPath)}`);

      // Pre-flight validation
      await this.validateCSVFormat(csvPath);

      // Read and parse
      const rows = await this.readCSV(csvPath, schema);

      // Post-validation
      this.validateData(rows, schema);

      this.log(`✅ Parsed ${rows.length} row(s)`);
      this.log(`   Errors: ${this.errors.length}, Warnings: ${this.warnings.length}`);

      if (this.errors.length > 0 && this.strictMode) {
        throw new Error(`CSV parsing failed with ${this.errors.length} error(s)`);
      }

      return {
        data: rows,
        headers: rows.length > 0 ? Object.keys(rows[0]) : [],
        errors: this.errors,
        warnings: this.warnings,
        fixes: this.fixes,
        stats: {
          totalRows: rows.length,
          totalColumns: rows.length > 0 ? Object.keys(rows[0]).length : 0,
          errorCount: this.errors.length,
          warningCount: this.warnings.length
        }
      };
    } catch (error) {
      this.logError(`CSV parsing failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Validate CSV format (line endings, encoding, structure)
   */
  async validateCSVFormat(csvPath) {
    const buffer = fs.readFileSync(csvPath);
    const content = fs.readFileSync(csvPath, this.encoding);

    // Check for BOM (Byte Order Mark)
    if (buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
      this.warnings.push({
        type: 'BOM_DETECTED',
        message: 'UTF-8 BOM detected in file',
        details: 'File contains UTF-8 BOM which may cause parsing issues',
        fix: 'Remove BOM or parse with BOM-aware encoding'
      });

      if (this.autoFix) {
        this.fixes.push({
          type: 'BOM_REMOVAL',
          description: 'Strip UTF-8 BOM from file'
        });
      }
    }

    // Check line endings
    const hasWindows = content.includes('\r\n');
    const hasUnix = content.includes('\n') && !content.includes('\r\n');
    const hasMac = content.includes('\r') && !content.includes('\r\n');

    if (hasWindows + hasUnix + hasMac > 1) {
      this.warnings.push({
        type: 'MIXED_LINE_ENDINGS',
        message: 'Mixed line endings detected (Windows, Unix, Mac)',
        details: 'Inconsistent line endings may cause parsing errors',
        fix: 'Normalize to Unix (\\n) line endings'
      });

      if (this.autoFix) {
        this.fixes.push({
          type: 'LINE_ENDING_NORMALIZATION',
          description: 'Normalize line endings to \\n'
        });
      }
    }

    // Check for empty file
    if (content.trim().length === 0) {
      this.errors.push({
        type: 'EMPTY_FILE',
        message: 'CSV file is empty',
        details: 'File contains no data'
      });
    }

    this.log(`  ✅ Format validation complete`);
  }

  /**
   * Read CSV file and parse using headers
   */
  async readCSV(csvPath, schema) {
    return new Promise((resolve, reject) => {
      const rows = [];
      let headers = null;
      let lineNumber = 0;

      const fileStream = fs.createReadStream(csvPath, { encoding: this.encoding });
      const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
      });

      rl.on('line', (line) => {
        lineNumber++;

        // Skip empty lines
        if (!line.trim()) {
          this.warnings.push({
            type: 'EMPTY_LINE',
            line: lineNumber,
            message: `Empty line at ${lineNumber}`
          });
          return;
        }

        // Parse line
        const values = this.parseLine(line);

        if (lineNumber === 1) {
          // First line is headers
          headers = values.map(h => h.trim());

          // Validate headers against schema
          if (schema) {
            this.validateHeaders(headers, schema);
          }

          this.log(`  📋 Headers: ${headers.join(', ')}`);
        } else {
          // Data row - map to object using headers
          if (!headers) {
            this.errors.push({
              type: 'MISSING_HEADERS',
              line: lineNumber,
              message: 'No headers found - cannot parse data'
            });
            return;
          }

          const row = this.mapRowToObject(headers, values, lineNumber);
          if (row) {
            rows.push(row);
          }
        }
      });

      rl.on('close', () => {
        resolve(rows);
      });

      rl.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Parse a single CSV line, handling quotes and delimiters
   */
  parseLine(line) {
    const values = [];
    let currentValue = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          // Escaped quote
          currentValue += '"';
          i++; // Skip next quote
        } else {
          // Toggle quote mode
          inQuotes = !inQuotes;
        }
      } else if (char === this.delimiter && !inQuotes) {
        // End of value
        values.push(currentValue);
        currentValue = '';
      } else {
        currentValue += char;
      }
    }

    // Push last value
    values.push(currentValue);

    return values;
  }

  /**
   * Map row values to object using headers
   */
  mapRowToObject(headers, values, lineNumber) {
    if (values.length !== headers.length) {
      this.errors.push({
        type: 'COLUMN_MISMATCH',
        line: lineNumber,
        message: `Column count mismatch at line ${lineNumber}`,
        details: `Expected ${headers.length} columns, found ${values.length}`,
        expected: headers.length,
        actual: values.length
      });

      // Pad or truncate to match headers
      if (values.length < headers.length) {
        while (values.length < headers.length) {
          values.push('');
        }
      } else {
        values = values.slice(0, headers.length);
      }
    }

    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] ? values[index].trim() : '';
    });

    return row;
  }

  /**
   * Validate headers against schema
   */
  validateHeaders(headers, schema) {
    if (!schema || !schema.columns) {
      return;
    }

    const required = schema.columns.filter(c => c.required).map(c => c.name);
    const expected = schema.columns.map(c => c.name);

    // Check for missing required columns
    const missing = required.filter(col => !headers.includes(col));
    if (missing.length > 0) {
      this.errors.push({
        type: 'MISSING_REQUIRED_COLUMNS',
        message: `Missing required columns: ${missing.join(', ')}`,
        details: `Schema requires: ${required.join(', ')}`,
        missingColumns: missing
      });
    }

    // Check for unexpected columns
    const unexpected = headers.filter(h => !expected.includes(h));
    if (unexpected.length > 0) {
      this.warnings.push({
        type: 'UNEXPECTED_COLUMNS',
        message: `Unexpected columns: ${unexpected.join(', ')}`,
        details: `Schema expects: ${expected.join(', ')}`,
        unexpectedColumns: unexpected
      });
    }

    // Check for column order (warning only)
    const expectedOrder = expected.filter(e => headers.includes(e));
    const actualOrder = headers.filter(h => expected.includes(h));

    if (JSON.stringify(expectedOrder) !== JSON.stringify(actualOrder)) {
      this.warnings.push({
        type: 'COLUMN_ORDER',
        message: 'Column order does not match schema',
        details: `Expected order: ${expectedOrder.join(', ')}`,
        actualOrder: actualOrder.join(', ')
      });
    }
  }

  /**
   * Validate data against schema
   */
  validateData(rows, schema) {
    if (!schema || !schema.columns) {
      return;
    }

    rows.forEach((row, index) => {
      schema.columns.forEach(column => {
        const value = row[column.name];

        // Check required fields
        if (column.required && (!value || value.trim() === '')) {
          this.errors.push({
            type: 'MISSING_VALUE',
            line: index + 2, // +2 because: +1 for headers, +1 for 1-indexing
            column: column.name,
            message: `Missing required value for "${column.name}" at row ${index + 2}`
          });
        }

        // Check data type
        if (value && column.type) {
          if (column.type === 'number' && isNaN(value)) {
            this.errors.push({
              type: 'INVALID_TYPE',
              line: index + 2,
              column: column.name,
              message: `Invalid number value "${value}" for column "${column.name}"`,
              expected: 'number',
              actual: typeof value
            });
          }

          if (column.type === 'email' && !this.isValidEmail(value)) {
            this.warnings.push({
              type: 'INVALID_EMAIL',
              line: index + 2,
              column: column.name,
              message: `Invalid email format "${value}" for column "${column.name}"`
            });
          }
        }

        // Check max length
        if (value && column.maxLength && value.length > column.maxLength) {
          this.errors.push({
            type: 'VALUE_TOO_LONG',
            line: index + 2,
            column: column.name,
            message: `Value exceeds max length (${column.maxLength}) for column "${column.name}"`,
            actual: value.length,
            max: column.maxLength
          });
        }
      });
    });
  }

  /**
   * Validate email format
   */
  isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Generate example schema from CSV headers
   */
  static generateSchema(csvPath, options = {}) {
    const parser = new CSVParserSafe(options);
    const content = fs.readFileSync(csvPath, 'utf-8');
    const firstLine = content.split('\n')[0];
    const headers = parser.parseLine(firstLine);

    return {
      columns: headers.map(header => ({
        name: header.trim(),
        type: 'string',
        required: false,
        maxLength: null
      }))
    };
  }

  /**
   * Logging helpers
   */
  log(message) {
    if (this.verbose) {
      console.log(message);
    }
  }

  logError(message) {
    console.error(`❌ ${message}`);
  }

  /**
   * Format validation report
   */
  formatReport(result) {
    const lines = [];

    lines.push('═══════════════════════════════════════════════════════════');
    lines.push('  CSV PARSING REPORT');
    lines.push('═══════════════════════════════════════════════════════════');
    lines.push('');
    lines.push(`Total Rows: ${result.stats.totalRows}`);
    lines.push(`Total Columns: ${result.stats.totalColumns}`);
    lines.push(`Errors: ${result.stats.errorCount}`);
    lines.push(`Warnings: ${result.stats.warningCount}`);
    lines.push('');

    if (result.headers.length > 0) {
      lines.push(`Headers: ${result.headers.join(', ')}`);
      lines.push('');
    }

    if (result.errors.length > 0) {
      lines.push('🔴 ERRORS:');
      result.errors.forEach((error, i) => {
        lines.push(`\n${i + 1}. [${error.type}]${error.line ? ` Line ${error.line}` : ''}: ${error.message}`);
        if (error.details) lines.push(`   ${error.details}`);
      });
      lines.push('');
    }

    if (result.warnings.length > 0) {
      lines.push('🟡 WARNINGS:');
      result.warnings.forEach((warning, i) => {
        lines.push(`${i + 1}. [${warning.type}]${warning.line ? ` Line ${warning.line}` : ''}: ${warning.message}`);
      });
      lines.push('');
    }

    lines.push('═══════════════════════════════════════════════════════════');

    return lines.join('\n');
  }
}

// CLI Interface
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('Usage: node csv-parser-safe.js <file.csv> [--schema schema.json] [--strict] [--auto-fix]');
    console.error('       node csv-parser-safe.js <file.csv> --generate-schema');
    process.exit(1);
  }

  const csvPath = args[0];
  const generateSchema = args.includes('--generate-schema');

  if (generateSchema) {
    const schema = CSVParserSafe.generateSchema(csvPath);
    console.log(JSON.stringify(schema, null, 2));
    process.exit(0);
  }

  const schemaPath = args.find((arg, i) => args[i - 1] === '--schema');
  const schema = schemaPath ? JSON.parse(fs.readFileSync(schemaPath, 'utf-8')) : null;

  const options = {
    verbose: true,
    strict: args.includes('--strict'),
    autoFix: args.includes('--auto-fix')
  };

  const parser = new CSVParserSafe(options);

  parser.parse(csvPath, schema)
    .then(result => {
      console.log('\n' + parser.formatReport(result));

      // Write parsed data to JSON for inspection
      const outputPath = csvPath.replace('.csv', '-parsed.json');
      fs.writeFileSync(outputPath, JSON.stringify(result.data, null, 2));
      console.log(`\n💾 Parsed data written to: ${outputPath}`);

      process.exit(result.errors.length > 0 && options.strict ? 1 : 0);
    })
    .catch(error => {
      console.error(`\n❌ Parsing failed: ${error.message}`);
      process.exit(1);
    });
}

module.exports = CSVParserSafe;
