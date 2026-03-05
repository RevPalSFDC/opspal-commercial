#!/usr/bin/env node

/**
 * CSV Parser Library
 * Instance-agnostic CSV parsing with proper quote handling
 *
 * **Enhanced (Reflection Cohort #2, P1):**
 * - Handles Salesforce compound fields (Address, Geolocation)
 * - Parses JSON-serialized fields within CSV
 * - Optional field expansion (BillingAddress → BillingAddress.City, etc.)
 * - Prevents validation false positives
 *
 * **Problem Solved:**
 * - Salesforce exports compound fields as JSON strings in CSV
 * - Example: "BillingAddress":"{""city"":""SF"",""street"":""123 Main""}"
 * - Standard CSV parsers break on nested commas/quotes
 *
 * **Solution:**
 * - Detect and parse JSON-serialized compound fields
 * - Support 'raw', 'parse', and 'expand' modes
 *
 * Features:
 * - Handles quoted fields with embedded commas
 * - Auto-detects delimiters (comma, tab, pipe)
 * - Header row parsing to objects
 * - CSV generation from objects
 * - Escape handling for quotes and special characters
 * - **NEW: Compound field handling (Address, Geolocation)**
 *
 * Usage:
 *   const { CSVParser } = require('./scripts/lib/csv-parser');
 *
 *   // Parse CSV string
 *   const rows = CSVParser.parse(csvContent);
 *
 *   // Parse with headers
 *   const objects = CSVParser.parseWithHeaders(csvContent);
 *
 *   // Parse with compound field handling
 *   const objects = CSVParser.parseWithHeaders(csvContent, {
 *     compoundFieldHandling: 'parse' // or 'expand'
 *   });
 *
 *   // Generate CSV
 *   const csv = CSVParser.generate(data, ['Id', 'Name', 'Email']);
 */

class CSVParser {
    /**
     * Parse a single CSV line handling quoted fields
     * @param {string} line - CSV line to parse
     * @param {object} options - Parsing options
     * @returns {Array} - Array of field values
     */
    static parseLine(line, options = {}) {
        const delimiter = options.delimiter || ',';
        const result = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            const nextChar = line[i + 1];

            if (char === '"') {
                if (inQuotes && nextChar === '"') {
                    // Escaped quote (double quote inside quoted field)
                    current += '"';
                    i++; // Skip next quote
                } else {
                    // Toggle quote state
                    inQuotes = !inQuotes;
                }
            } else if (char === delimiter && !inQuotes) {
                // Field separator (only when not in quotes)
                result.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }

        // Push final field
        result.push(current.trim());

        return result;
    }

    /**
     * Detect delimiter from CSV content
     * @param {string} content - CSV content
     * @returns {string} - Detected delimiter
     */
    static detectDelimiter(content) {
        const firstLine = content.split('\n')[0];
        const delimiters = [',', '\t', '|', ';'];

        // Count occurrences of each delimiter
        const counts = delimiters.map(d => ({
            delimiter: d,
            count: (firstLine.match(new RegExp(`\\${d}`, 'g')) || []).length
        }));

        // Return delimiter with highest count
        counts.sort((a, b) => b.count - a.count);
        return counts[0].count > 0 ? counts[0].delimiter : ',';
    }

    /**
     * Parse CSV content into array of arrays
     * @param {string} content - CSV content
     * @param {object} options - Parsing options
     * @returns {Array<Array>} - Parsed rows
     */
    static parse(content, options = {}) {
        if (!content || typeof content !== 'string') {
            throw new Error('CSV content must be a non-empty string');
        }

        // Detect delimiter if not provided
        const delimiter = options.delimiter || this.detectDelimiter(content);

        // Split into lines (handle both \r\n and \n)
        const lines = content.replace(/\r\n/g, '\n').split('\n');

        const rows = [];
        for (const line of lines) {
            // Skip empty lines
            if (line.trim().length === 0) continue;

            // Parse line
            const fields = this.parseLine(line, { delimiter });
            rows.push(fields);
        }

        return rows;
    }

    /**
     * Parse CSV with headers into array of objects
     *
     * @param {string} content - CSV content with header row
     * @param {object} options - Parsing options
     * @param {string} options.delimiter - Field delimiter (auto-detected if not provided)
     * @param {string} options.compoundFieldHandling - How to handle compound fields:
     *   - 'raw' (default): Leave compound fields as JSON strings
     *   - 'parse': Parse JSON strings to objects
     *   - 'expand': Expand compound fields to flat keys (e.g., BillingAddress.city)
     * @returns {Array<Object>} - Array of objects with header keys
     *
     * @example
     * // Default (raw)
     * const rows = CSVParser.parseWithHeaders(csv);
     * // { Id: "001", BillingAddress: '{"city":"SF","street":"123 Main"}' }
     *
     * // Parse mode
     * const rows = CSVParser.parseWithHeaders(csv, { compoundFieldHandling: 'parse' });
     * // { Id: "001", BillingAddress: { city: "SF", street: "123 Main" } }
     *
     * // Expand mode
     * const rows = CSVParser.parseWithHeaders(csv, { compoundFieldHandling: 'expand' });
     * // { Id: "001", "BillingAddress.city": "SF", "BillingAddress.street": "123 Main" }
     */
    static parseWithHeaders(content, options = {}) {
        const rows = this.parse(content, options);

        if (rows.length === 0) {
            return [];
        }

        // First row is headers
        const headers = rows[0];

        // Convert remaining rows to objects
        const objects = [];
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            const obj = {};

            for (let j = 0; j < headers.length; j++) {
                const header = headers[j];
                const value = row[j] || '';
                obj[header] = value;
            }

            objects.push(obj);
        }

        // Process compound fields if requested
        const compoundMode = options.compoundFieldHandling || 'raw';
        return this.processCompoundFields(objects, compoundMode);
    }

    /**
     * Escape field value for CSV
     * @param {string} value - Field value
     * @returns {string} - Escaped value
     */
    static escapeField(value) {
        if (value === null || value === undefined) {
            return '';
        }

        const str = String(value);

        // If field contains comma, newline, or quotes, wrap in quotes
        if (str.includes(',') || str.includes('\n') || str.includes('"')) {
            // Escape existing quotes by doubling them
            const escaped = str.replace(/"/g, '""');
            return `"${escaped}"`;
        }

        return str;
    }

    /**
     * Generate CSV from array of objects
     * @param {Array<Object>} data - Array of objects
     * @param {Array<string>} headers - Header names (keys to extract)
     * @param {object} options - Generation options
     * @returns {string} - CSV content
     */
    static generate(data, headers, options = {}) {
        if (!Array.isArray(data) || data.length === 0) {
            return '';
        }

        // If headers not provided, use keys from first object
        const cols = headers || Object.keys(data[0]);

        const rows = [];

        // Add header row
        rows.push(cols.map(h => this.escapeField(h)).join(','));

        // Add data rows
        for (const item of data) {
            const row = cols.map(col => this.escapeField(item[col]));
            rows.push(row.join(','));
        }

        return rows.join('\n');
    }

    /**
     * Generate CSV from array of arrays
     * @param {Array<Array>} rows - Array of row arrays
     * @param {object} options - Generation options
     * @returns {string} - CSV content
     */
    static generateFromRows(rows, options = {}) {
        if (!Array.isArray(rows) || rows.length === 0) {
            return '';
        }

        return rows.map(row =>
            row.map(field => this.escapeField(field)).join(',')
        ).join('\n');
    }

    /**
     * Convert CSV to TSV
     * @param {string} csvContent - CSV content
     * @returns {string} - TSV content
     */
    static csvToTsv(csvContent) {
        const rows = this.parse(csvContent);
        return rows.map(row => row.join('\t')).join('\n');
    }

    /**
     * Convert TSV to CSV
     * @param {string} tsvContent - TSV content
     * @returns {string} - CSV content
     */
    static tsvToCsv(tsvContent) {
        const rows = this.parse(tsvContent, { delimiter: '\t' });
        return this.generateFromRows(rows);
    }

    /**
     * Filter CSV rows by condition
     * @param {string} content - CSV content with headers
     * @param {Function} filterFn - Filter function (row) => boolean
     * @returns {string} - Filtered CSV content
     */
    static filter(content, filterFn) {
        const objects = this.parseWithHeaders(content);
        const filtered = objects.filter(filterFn);

        if (filtered.length === 0) {
            return '';
        }

        const headers = Object.keys(filtered[0]);
        return this.generate(filtered, headers);
    }

    /**
     * Transform CSV data
     * @param {string} content - CSV content with headers
     * @param {Function} transformFn - Transform function (row) => row
     * @returns {string} - Transformed CSV content
     */
    static transform(content, transformFn) {
        const objects = this.parseWithHeaders(content);
        const transformed = objects.map(transformFn);

        if (transformed.length === 0) {
            return '';
        }

        const headers = Object.keys(transformed[0]);
        return this.generate(transformed, headers);
    }

    /**
     * Merge multiple CSV files by headers
     * @param {Array<string>} contents - Array of CSV contents
     * @returns {string} - Merged CSV content
     */
    static merge(contents) {
        if (!Array.isArray(contents) || contents.length === 0) {
            return '';
        }

        // Parse all files
        const allObjects = contents.flatMap(content => this.parseWithHeaders(content));

        if (allObjects.length === 0) {
            return '';
        }

        // Get all unique headers
        const headerSet = new Set();
        allObjects.forEach(obj => {
            Object.keys(obj).forEach(key => headerSet.add(key));
        });

        const headers = Array.from(headerSet);
        return this.generate(allObjects, headers);
    }

    /**
     * Get CSV statistics
     * @param {string} content - CSV content with headers
     * @returns {Object} - Statistics object
     */
    static getStats(content) {
        const objects = this.parseWithHeaders(content);

        if (objects.length === 0) {
            return {
                rowCount: 0,
                columnCount: 0,
                headers: [],
                emptyFields: 0,
                totalFields: 0
            };
        }

        const headers = Object.keys(objects[0]);
        let emptyFields = 0;
        let totalFields = 0;

        objects.forEach(obj => {
            headers.forEach(header => {
                totalFields++;
                if (!obj[header] || obj[header].trim() === '') {
                    emptyFields++;
                }
            });
        });

        return {
            rowCount: objects.length,
            columnCount: headers.length,
            headers,
            emptyFields,
            totalFields,
            completeness: ((totalFields - emptyFields) / totalFields * 100).toFixed(2) + '%'
        };
    }

    // ========================================
    // COMPOUND FIELD HANDLING (NEW)
    // ========================================

    /**
     * Detect if a value is a Salesforce compound field (JSON string)
     *
     * Salesforce compound fields are exported as JSON strings:
     * - Address: {"city":"SF","street":"123 Main","state":"CA","postalCode":"94105","country":"US"}
     * - Geolocation: {"latitude":37.7749,"longitude":-122.4194}
     *
     * @param {string} value - Field value to check
     * @returns {boolean} - True if value appears to be a compound field
     */
    static isCompoundField(value) {
        if (!value || typeof value !== 'string') {
            return false;
        }

        const trimmed = value.trim();

        // Check if starts with { and ends with }
        if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
            return false;
        }

        // Try to parse as JSON
        try {
            const parsed = JSON.parse(trimmed);

            // Check if it's an object (not array)
            if (typeof parsed !== 'object' || Array.isArray(parsed)) {
                return false;
            }

            // Check for common compound field patterns
            const keys = Object.keys(parsed);

            // Address fields: city, street, state, postalCode, country
            const addressKeys = ['city', 'street', 'state', 'postalCode', 'country'];
            const hasAddressKeys = addressKeys.some(k => keys.includes(k));

            // Geolocation fields: latitude, longitude
            const geoKeys = ['latitude', 'longitude'];
            const hasGeoKeys = geoKeys.every(k => keys.includes(k));

            return hasAddressKeys || hasGeoKeys;
        } catch {
            return false;
        }
    }

    /**
     * Parse compound field from JSON string
     *
     * @param {string} value - JSON string value
     * @returns {Object|string} - Parsed object or original value if not compound
     */
    static parseCompoundField(value) {
        if (!this.isCompoundField(value)) {
            return value;
        }

        try {
            return JSON.parse(value.trim());
        } catch {
            return value;
        }
    }

    /**
     * Expand compound field into flat structure
     *
     * Example:
     *   Input: { BillingAddress: {city: "SF", street: "123 Main"} }
     *   Output: { "BillingAddress.city": "SF", "BillingAddress.street": "123 Main" }
     *
     * @param {string} fieldName - Original field name
     * @param {Object} compoundValue - Parsed compound field object
     * @returns {Object} - Flattened key-value pairs
     */
    static expandCompoundField(fieldName, compoundValue) {
        const expanded = {};

        if (typeof compoundValue !== 'object' || Array.isArray(compoundValue)) {
            // Not an object, return original
            expanded[fieldName] = compoundValue;
            return expanded;
        }

        // Flatten nested fields
        for (const [key, value] of Object.entries(compoundValue)) {
            const expandedKey = `${fieldName}.${key}`;
            expanded[expandedKey] = value || '';
        }

        return expanded;
    }

    /**
     * Process compound fields in parsed objects
     *
     * @param {Array<Object>} objects - Parsed CSV objects
     * @param {string} mode - Handling mode: 'raw', 'parse', 'expand'
     * @returns {Array<Object>} - Processed objects
     */
    static processCompoundFields(objects, mode = 'raw') {
        if (mode === 'raw' || !objects || objects.length === 0) {
            return objects;
        }

        return objects.map(obj => {
            const processed = {};

            for (const [key, value] of Object.entries(obj)) {
                if (this.isCompoundField(value)) {
                    const parsed = this.parseCompoundField(value);

                    if (mode === 'parse') {
                        // Return parsed JSON object as-is
                        processed[key] = parsed;
                    } else if (mode === 'expand') {
                        // Expand into flat keys
                        const expanded = this.expandCompoundField(key, parsed);
                        Object.assign(processed, expanded);
                    }
                } else {
                    // Not a compound field, keep as-is
                    processed[key] = value;
                }
            }

            return processed;
        });
    }
}

// Export for CommonJS
module.exports = { CSVParser };

// CLI Usage
if (require.main === module) {
    const fs = require('fs');
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.log('Usage: csv-parser.js <command> <file> [options]');
        console.log('\nCommands:');
        console.log('  parse <file>              - Parse CSV and display as JSON');
        console.log('  stats <file>              - Display CSV statistics');
        console.log('  convert <file> <format>   - Convert CSV to TSV or vice versa');
        console.log('  validate <file>           - Validate CSV syntax');
        console.log('\nExamples:');
        console.log('  csv-parser.js parse data.csv');
        console.log('  csv-parser.js stats data.csv');
        console.log('  csv-parser.js convert data.csv tsv > data.tsv');
        console.log('  csv-parser.js validate data.csv');
        process.exit(1);
    }

    const command = args[0];
    const file = args[1];

    try {
        if (!fs.existsSync(file)) {
            console.error(`Error: File not found: ${file}`);
            process.exit(1);
        }

        const content = fs.readFileSync(file, 'utf-8');

        switch (command) {
            case 'parse':
                const objects = CSVParser.parseWithHeaders(content);
                console.log(JSON.stringify(objects, null, 2));
                break;

            case 'stats':
                const stats = CSVParser.getStats(content);
                console.log('\nCSV Statistics:');
                console.log(`  Rows: ${stats.rowCount}`);
                console.log(`  Columns: ${stats.columnCount}`);
                console.log(`  Headers: ${stats.headers.join(', ')}`);
                console.log(`  Empty Fields: ${stats.emptyFields}/${stats.totalFields} (${stats.completeness} complete)`);
                break;

            case 'convert':
                const format = args[2];
                if (format === 'tsv') {
                    console.log(CSVParser.csvToTsv(content));
                } else if (format === 'csv') {
                    console.log(CSVParser.tsvToCsv(content));
                } else {
                    console.error('Error: Format must be "tsv" or "csv"');
                    process.exit(1);
                }
                break;

            case 'validate':
                try {
                    const rows = CSVParser.parse(content);
                    console.log(`✓ Valid CSV - ${rows.length} rows parsed successfully`);
                } catch (err) {
                    console.error(`✗ Invalid CSV: ${err.message}`);
                    process.exit(1);
                }
                break;

            default:
                console.error(`Error: Unknown command: ${command}`);
                process.exit(1);
        }
    } catch (err) {
        console.error(`Error: ${err.message}`);
        process.exit(1);
    }
}
