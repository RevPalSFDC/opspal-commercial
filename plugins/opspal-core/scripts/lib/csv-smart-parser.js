#!/usr/bin/env node

/**
 * CSV Smart Parser - Header-based CSV parsing with validation
 *
 * Replaces hardcoded array indices (values[0]) with header-based
 * column lookups to prevent data import failures from column order changes.
 *
 * @version 1.0.0
 * @date 2025-12-10
 */

const fs = require('fs');
const path = require('path');

class CSVSmartParser {
    constructor(options = {}) {
        this.verbose = options.verbose || false;
        this.delimiter = options.delimiter || ',';
        this.quoteChar = options.quoteChar || '"';
        this.escapeChar = options.escapeChar || '"';
        this.encoding = options.encoding || 'utf8';
        this.trimFields = options.trimFields !== false;
        this.skipEmptyLines = options.skipEmptyLines !== false;
        this.strictMode = options.strictMode || false;

        // Column mapping for flexible field access
        this.columnMap = new Map();
        this.headers = [];
        this.requiredColumns = options.requiredColumns || [];
        this.optionalColumns = options.optionalColumns || [];
        this.columnAliases = options.columnAliases || {};

        // Statistics
        this.stats = {
            totalRows: 0,
            parsedRows: 0,
            skippedRows: 0,
            errors: []
        };
    }

    /**
     * Parse CSV from file
     * @param {string} filePath - Path to CSV file
     * @returns {Object} Parsed result with data, headers, and stats
     */
    parseFile(filePath) {
        if (!fs.existsSync(filePath)) {
            throw new Error(`File not found: ${filePath}`);
        }

        const content = fs.readFileSync(filePath, this.encoding);
        return this.parse(content, path.basename(filePath));
    }

    /**
     * Parse CSV string
     * @param {string} content - CSV content
     * @param {string} source - Source identifier for error messages
     * @returns {Object} Parsed result
     */
    parse(content, source = 'string') {
        this._resetStats();

        // Normalize line endings
        const normalizedContent = this._normalizeLineEndings(content);
        const lines = this._splitLines(normalizedContent);

        if (lines.length === 0) {
            return this._createResult([], source);
        }

        // Parse header row
        const headerLine = lines[0];
        this.headers = this._parseLine(headerLine, 0);
        this._buildColumnMap();

        // Validate required columns
        const validation = this._validateRequiredColumns();
        if (!validation.valid) {
            if (this.strictMode) {
                throw new Error(`Missing required columns: ${validation.missing.join(', ')}`);
            }
            this.stats.errors.push({
                type: 'missing_columns',
                message: `Missing required columns: ${validation.missing.join(', ')}`,
                line: 0
            });
        }

        // Parse data rows
        const data = [];
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i];
            this.stats.totalRows++;

            if (this.skipEmptyLines && this._isEmptyLine(line)) {
                this.stats.skippedRows++;
                continue;
            }

            try {
                const values = this._parseLine(line, i);
                const row = this._createRow(values, i);
                data.push(row);
                this.stats.parsedRows++;
            } catch (error) {
                this.stats.errors.push({
                    type: 'parse_error',
                    message: error.message,
                    line: i + 1
                });
                this.stats.skippedRows++;

                if (this.strictMode) {
                    throw error;
                }
            }
        }

        return this._createResult(data, source);
    }

    /**
     * Parse a single line into fields
     */
    _parseLine(line, lineNumber) {
        const fields = [];
        let current = '';
        let inQuotes = false;
        let i = 0;

        while (i < line.length) {
            const char = line[i];
            const nextChar = line[i + 1];

            if (inQuotes) {
                if (char === this.quoteChar) {
                    if (nextChar === this.quoteChar) {
                        // Escaped quote
                        current += this.quoteChar;
                        i += 2;
                    } else {
                        // End of quoted field
                        inQuotes = false;
                        i++;
                    }
                } else {
                    current += char;
                    i++;
                }
            } else {
                if (char === this.quoteChar) {
                    inQuotes = true;
                    i++;
                } else if (char === this.delimiter) {
                    fields.push(this._processField(current));
                    current = '';
                    i++;
                } else {
                    current += char;
                    i++;
                }
            }
        }

        // Don't forget the last field
        fields.push(this._processField(current));

        if (inQuotes) {
            throw new Error(`Unterminated quoted field at line ${lineNumber + 1}`);
        }

        return fields;
    }

    /**
     * Process a field (trim, etc.)
     */
    _processField(field) {
        if (this.trimFields) {
            return field.trim();
        }
        return field;
    }

    /**
     * Build column map from headers
     */
    _buildColumnMap() {
        this.columnMap.clear();

        this.headers.forEach((header, index) => {
            const normalizedHeader = this._normalizeHeader(header);
            this.columnMap.set(normalizedHeader, index);

            // Also map original header
            if (normalizedHeader !== header) {
                this.columnMap.set(header, index);
            }
        });

        // Add aliases
        for (const [alias, canonical] of Object.entries(this.columnAliases)) {
            const normalizedAlias = this._normalizeHeader(alias);
            const normalizedCanonical = this._normalizeHeader(canonical);

            if (this.columnMap.has(normalizedCanonical)) {
                this.columnMap.set(normalizedAlias, this.columnMap.get(normalizedCanonical));
            }
        }

        if (this.verbose) {
            console.log(`[CSV] Column map: ${JSON.stringify([...this.columnMap.entries()])}`);
        }
    }

    /**
     * Normalize header for matching
     */
    _normalizeHeader(header) {
        return header.toLowerCase().trim().replace(/[\s_-]+/g, '_');
    }

    /**
     * Validate required columns exist
     */
    _validateRequiredColumns() {
        const missing = [];

        for (const required of this.requiredColumns) {
            const normalized = this._normalizeHeader(required);
            if (!this.columnMap.has(normalized) && !this.columnMap.has(required)) {
                missing.push(required);
            }
        }

        return {
            valid: missing.length === 0,
            missing
        };
    }

    /**
     * Create a row object from values
     */
    _createRow(values, lineNumber) {
        const row = {
            _lineNumber: lineNumber + 1,
            _raw: values
        };

        // Map values to headers
        this.headers.forEach((header, index) => {
            const value = index < values.length ? values[index] : null;
            const normalizedHeader = this._normalizeHeader(header);

            // Store with both original and normalized keys
            row[header] = value;
            if (normalizedHeader !== header) {
                row[normalizedHeader] = value;
            }
        });

        return row;
    }

    /**
     * Get column value from row by name (case-insensitive, alias-aware)
     * @param {Object} row - Parsed row object
     * @param {string} columnName - Column name to retrieve
     * @param {*} defaultValue - Default if column not found
     * @returns {*} Column value
     */
    getValue(row, columnName, defaultValue = null) {
        const normalizedName = this._normalizeHeader(columnName);

        // Check direct match
        if (row.hasOwnProperty(columnName)) {
            return row[columnName];
        }

        // Check normalized match
        if (row.hasOwnProperty(normalizedName)) {
            return row[normalizedName];
        }

        // Check aliases
        const aliasTarget = this.columnAliases[columnName] || this.columnAliases[normalizedName];
        if (aliasTarget) {
            const normalizedTarget = this._normalizeHeader(aliasTarget);
            if (row.hasOwnProperty(aliasTarget)) {
                return row[aliasTarget];
            }
            if (row.hasOwnProperty(normalizedTarget)) {
                return row[normalizedTarget];
            }
        }

        return defaultValue;
    }

    /**
     * Get column index by name
     * @param {string} columnName - Column name
     * @returns {number} Column index or -1 if not found
     */
    getColumnIndex(columnName) {
        const normalized = this._normalizeHeader(columnName);

        if (this.columnMap.has(columnName)) {
            return this.columnMap.get(columnName);
        }
        if (this.columnMap.has(normalized)) {
            return this.columnMap.get(normalized);
        }

        return -1;
    }

    /**
     * Check if column exists
     * @param {string} columnName - Column name
     * @returns {boolean} True if column exists
     */
    hasColumn(columnName) {
        return this.getColumnIndex(columnName) !== -1;
    }

    /**
     * Get all available columns
     * @returns {Array} Column names
     */
    getColumns() {
        return [...this.headers];
    }

    /**
     * Normalize line endings
     */
    _normalizeLineEndings(content) {
        return content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    }

    /**
     * Split content into lines (handling quoted newlines)
     */
    _splitLines(content) {
        const lines = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < content.length; i++) {
            const char = content[i];

            if (char === this.quoteChar && (i === 0 || content[i - 1] !== this.escapeChar)) {
                inQuotes = !inQuotes;
                current += char;
            } else if (char === '\n' && !inQuotes) {
                lines.push(current);
                current = '';
            } else {
                current += char;
            }
        }

        // Don't forget the last line
        if (current.length > 0) {
            lines.push(current);
        }

        return lines;
    }

    /**
     * Check if line is empty
     */
    _isEmptyLine(line) {
        return line.trim().length === 0;
    }

    /**
     * Reset statistics
     */
    _resetStats() {
        this.stats = {
            totalRows: 0,
            parsedRows: 0,
            skippedRows: 0,
            errors: []
        };
        this.headers = [];
        this.columnMap.clear();
    }

    /**
     * Create result object
     */
    _createResult(data, source) {
        return {
            success: this.stats.errors.length === 0 || !this.strictMode,
            source,
            headers: [...this.headers],
            columns: this.getColumns(),
            data,
            stats: { ...this.stats },
            columnMap: Object.fromEntries(this.columnMap)
        };
    }

    /**
     * Convert parsed data back to CSV
     * @param {Array} data - Array of row objects
     * @param {Array} columns - Columns to include (optional)
     * @returns {string} CSV string
     */
    toCSV(data, columns = null) {
        const cols = columns || this.headers;

        if (cols.length === 0 && data.length > 0) {
            // Infer columns from first row
            const firstRow = data[0];
            columns = Object.keys(firstRow).filter(k => !k.startsWith('_'));
        }

        const lines = [];

        // Header row
        lines.push(cols.map(c => this._escapeField(c)).join(this.delimiter));

        // Data rows
        for (const row of data) {
            const values = cols.map(col => {
                const value = row[col] !== undefined ? row[col] : '';
                return this._escapeField(String(value));
            });
            lines.push(values.join(this.delimiter));
        }

        return lines.join('\n');
    }

    /**
     * Escape a field for CSV output
     */
    _escapeField(value) {
        if (value.includes(this.delimiter) || value.includes(this.quoteChar) || value.includes('\n')) {
            const escaped = value.replace(new RegExp(this.quoteChar, 'g'), this.quoteChar + this.quoteChar);
            return this.quoteChar + escaped + this.quoteChar;
        }
        return value;
    }

    /**
     * Transform data using column mapping
     * @param {Array} data - Parsed data
     * @param {Object} mapping - Column mapping {targetColumn: sourceColumn}
     * @returns {Array} Transformed data
     */
    transform(data, mapping) {
        return data.map((row, index) => {
            const transformed = {
                _lineNumber: row._lineNumber,
                _original: row
            };

            for (const [target, source] of Object.entries(mapping)) {
                if (typeof source === 'function') {
                    transformed[target] = source(row, index);
                } else {
                    transformed[target] = this.getValue(row, source);
                }
            }

            return transformed;
        });
    }

    /**
     * Filter data based on criteria
     * @param {Array} data - Parsed data
     * @param {Function} predicate - Filter function
     * @returns {Array} Filtered data
     */
    filter(data, predicate) {
        return data.filter(predicate);
    }

    /**
     * Validate data against schema
     * @param {Array} data - Parsed data
     * @param {Object} schema - Validation schema
     * @returns {Object} Validation result
     */
    validate(data, schema) {
        const errors = [];
        const validated = [];

        for (let i = 0; i < data.length; i++) {
            const row = data[i];
            const rowErrors = [];

            for (const [field, rules] of Object.entries(schema)) {
                const value = this.getValue(row, field);

                // Required check
                if (rules.required && (value === null || value === undefined || value === '')) {
                    rowErrors.push({
                        field,
                        rule: 'required',
                        message: `Field '${field}' is required`
                    });
                    continue;
                }

                // Skip further validation if value is empty and not required
                if (value === null || value === undefined || value === '') {
                    continue;
                }

                // Type check
                if (rules.type) {
                    const typeValid = this._validateType(value, rules.type);
                    if (!typeValid) {
                        rowErrors.push({
                            field,
                            rule: 'type',
                            message: `Field '${field}' must be of type ${rules.type}`
                        });
                    }
                }

                // Pattern check
                if (rules.pattern) {
                    const regex = new RegExp(rules.pattern);
                    if (!regex.test(value)) {
                        rowErrors.push({
                            field,
                            rule: 'pattern',
                            message: `Field '${field}' does not match pattern ${rules.pattern}`
                        });
                    }
                }

                // Custom validator
                if (rules.validate && typeof rules.validate === 'function') {
                    const result = rules.validate(value, row);
                    if (result !== true) {
                        rowErrors.push({
                            field,
                            rule: 'custom',
                            message: typeof result === 'string' ? result : `Field '${field}' validation failed`
                        });
                    }
                }
            }

            if (rowErrors.length > 0) {
                errors.push({
                    lineNumber: row._lineNumber,
                    errors: rowErrors
                });
            } else {
                validated.push(row);
            }
        }

        return {
            valid: errors.length === 0,
            validated,
            errors,
            totalRows: data.length,
            validRows: validated.length,
            invalidRows: errors.length
        };
    }

    /**
     * Validate value type
     */
    _validateType(value, type) {
        switch (type) {
            case 'string':
                return typeof value === 'string';
            case 'number':
                return !isNaN(parseFloat(value)) && isFinite(value);
            case 'integer':
                return Number.isInteger(parseFloat(value));
            case 'boolean':
                return ['true', 'false', '1', '0', 'yes', 'no'].includes(String(value).toLowerCase());
            case 'date':
                return !isNaN(Date.parse(value));
            case 'email':
                return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
            case 'salesforce_id':
                return /^[a-zA-Z0-9]{15}([a-zA-Z0-9]{3})?$/.test(value);
            default:
                return true;
        }
    }

    /**
     * Get statistics
     * @returns {Object} Parsing statistics
     */
    getStatistics() {
        return { ...this.stats };
    }
}

/**
 * Common column aliases for Salesforce data
 */
const SalesforceAliases = {
    // Account
    'account_id': 'AccountId',
    'account_name': 'Account Name',
    'account': 'Account Name',
    'acct': 'Account Name',

    // Contact
    'contact_id': 'ContactId',
    'contact_name': 'Name',
    'email_address': 'Email',

    // Opportunity
    'opportunity_id': 'OpportunityId',
    'opp_id': 'OpportunityId',
    'opportunity_name': 'Opportunity Name',
    'opp_name': 'Opportunity Name',
    'amount': 'Amount',
    'close_date': 'CloseDate',
    'stage': 'StageName',

    // Common
    'id': 'Id',
    'record_id': 'Id',
    'external_id': 'External_Id__c',
    'owner': 'OwnerId',
    'owner_id': 'OwnerId',
    'created': 'CreatedDate',
    'modified': 'LastModifiedDate'
};

// CLI interface
if (require.main === module) {
    const args = process.argv.slice(2);
    const command = args[0];
    const filePath = args[1];

    const parser = new CSVSmartParser({
        verbose: args.includes('--verbose'),
        strictMode: args.includes('--strict'),
        columnAliases: SalesforceAliases
    });

    switch (command) {
        case 'parse':
            if (!filePath) {
                console.error('Usage: csv-smart-parser parse <file> [--verbose] [--strict]');
                process.exit(1);
            }

            try {
                const result = parser.parseFile(filePath);
                console.log(JSON.stringify(result, null, 2));
                process.exit(result.success ? 0 : 1);
            } catch (error) {
                console.error(`Error: ${error.message}`);
                process.exit(1);
            }
            break;

        case 'columns':
            if (!filePath) {
                console.error('Usage: csv-smart-parser columns <file>');
                process.exit(1);
            }

            try {
                const result = parser.parseFile(filePath);
                console.log('Columns:', result.columns.join(', '));
                console.log('Column Map:', JSON.stringify(result.columnMap, null, 2));
            } catch (error) {
                console.error(`Error: ${error.message}`);
                process.exit(1);
            }
            break;

        case 'validate':
            if (!filePath) {
                console.error('Usage: csv-smart-parser validate <file> [--schema <schema.json>]');
                process.exit(1);
            }

            const schemaIndex = args.indexOf('--schema');
            const schemaPath = schemaIndex >= 0 ? args[schemaIndex + 1] : null;

            try {
                const result = parser.parseFile(filePath);

                if (schemaPath && fs.existsSync(schemaPath)) {
                    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
                    const validation = parser.validate(result.data, schema);
                    console.log(JSON.stringify(validation, null, 2));
                    process.exit(validation.valid ? 0 : 1);
                } else {
                    console.log('No schema provided. Parse result:');
                    console.log(JSON.stringify(result.stats, null, 2));
                }
            } catch (error) {
                console.error(`Error: ${error.message}`);
                process.exit(1);
            }
            break;

        default:
            console.log(`
CSV Smart Parser - Header-based CSV parsing with validation

Usage:
  csv-smart-parser parse <file> [--verbose] [--strict]   Parse CSV file
  csv-smart-parser columns <file>                        Show column mapping
  csv-smart-parser validate <file> [--schema <file>]     Validate against schema

Examples:
  csv-smart-parser parse ./data.csv
  csv-smart-parser columns ./import.csv
  csv-smart-parser validate ./data.csv --schema ./schema.json --strict

Features:
  - Header-based column lookup (no hardcoded indices)
  - Case-insensitive column matching
  - Column aliases (AccountId, account_id, Account ID all work)
  - Proper quoted field handling
  - Line ending normalization
  - Data validation against schema
            `);
    }
}

/**
 * Normalize line endings in a string (CRLF/CR → LF).
 * Shared utility for cross-platform CSV and text file handling.
 * Desktop (Git Bash on Windows) produces CRLF more frequently than WSL/Linux.
 * @param {string} content - Raw content to normalize
 * @returns {string} Content with LF-only line endings
 */
function normalizeLineEndings(content) {
  if (!content) return content;
  return content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

module.exports = { CSVSmartParser, SalesforceAliases, normalizeLineEndings };
