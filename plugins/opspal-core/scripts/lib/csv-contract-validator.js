#!/usr/bin/env node

/**
 * CSV Contract Validator
 *
 * Validates CSV parsing operations to prevent common errors:
 * - Hardcoded column index access
 * - Missing header validation
 * - Encoding issues
 * - Type coercion problems
 *
 * @version 1.0.0
 * @date 2025-12-19
 *
 * Addresses: tool-contract mismatch cohort (CSV parsing bugs)
 */

const fs = require('fs');
const path = require('path');

class CSVContractValidator {
    constructor(options = {}) {
        this.verbose = options.verbose || false;
        this.strictMode = options.strictMode !== false;

        // Common encoding signatures (BOM markers)
        this.encodingSignatures = {
            'utf-8-bom': Buffer.from([0xEF, 0xBB, 0xBF]),
            'utf-16-le': Buffer.from([0xFF, 0xFE]),
            'utf-16-be': Buffer.from([0xFE, 0xFF])
        };

        // Forbidden access patterns (hardcoded indices)
        this.forbiddenPatterns = [
            /row\s*\[\s*\d+\s*\]/g,           // row[0], row[1], etc.
            /columns\s*\[\s*\d+\s*\]/g,        // columns[0], etc.
            /data\s*\[\s*\d+\s*\]/g,           // data[0], etc.
            /line\s*\[\s*\d+\s*\]/g,           // line[0], etc.
            /record\s*\[\s*\d+\s*\]/g,         // record[0], etc.
            /fields\s*\[\s*\d+\s*\]/g          // fields[0], etc.
        ];

        // Allowed patterns (header-based access)
        this.allowedPatterns = [
            /row\s*\[\s*['"`][^'"`]+['"`]\s*\]/,     // row["header"]
            /row\s*\.\s*\w+/,                         // row.header
            /get\s*\(\s*['"`][^'"`]+['"`]\s*\)/      // get("header")
        ];
    }

    /**
     * Validate CSV parsing code for anti-patterns
     * @param {string} code - Code string to validate
     * @returns {Object} Validation result
     */
    validateCode(code) {
        const result = {
            valid: true,
            errors: [],
            warnings: [],
            suggestions: [],
            violations: []
        };

        if (!code || typeof code !== 'string') {
            result.valid = false;
            result.errors.push('Code must be a non-empty string');
            return result;
        }

        // Check for forbidden hardcoded index patterns
        for (const pattern of this.forbiddenPatterns) {
            const matches = code.match(pattern);
            if (matches) {
                for (const match of matches) {
                    result.violations.push({
                        type: 'hardcoded_index',
                        pattern: match,
                        message: `Hardcoded column index detected: ${match}`,
                        suggestion: `Use header-based access instead: row["columnName"] or row.columnName`
                    });
                }
            }
        }

        if (result.violations.length > 0) {
            result.valid = false;
            result.errors.push(
                `Found ${result.violations.length} hardcoded index access(es). ` +
                `Use header-based column access to prevent errors when CSV format changes.`
            );
        }

        // Check for encoding detection
        if (!code.includes('encoding') && !code.includes('Encoding')) {
            result.warnings.push(
                'No encoding detection found. Consider validating file encoding.'
            );
        }

        // Check for header validation
        if (!code.includes('header') && !code.includes('Header')) {
            result.warnings.push(
                'No explicit header handling found. Consider validating headers match expected schema.'
            );
        }

        return result;
    }

    /**
     * Validate CSV file structure
     * @param {string} filePath - Path to CSV file
     * @param {Object} schema - Expected schema { headers: [...], types: {...} }
     * @returns {Object} Validation result
     */
    validateFile(filePath, schema = {}) {
        const result = {
            valid: true,
            errors: [],
            warnings: [],
            fileInfo: {},
            headerAnalysis: {},
            sampleData: []
        };

        // Check file exists
        if (!fs.existsSync(filePath)) {
            result.valid = false;
            result.errors.push(`File not found: ${filePath}`);
            return result;
        }

        // Read file with encoding detection
        const buffer = fs.readFileSync(filePath);
        const encoding = this._detectEncoding(buffer);
        result.fileInfo.encoding = encoding;
        result.fileInfo.size = buffer.length;

        // Remove BOM if present
        let content = buffer.toString(encoding === 'utf-8-bom' ? 'utf8' : encoding);
        if (encoding === 'utf-8-bom') {
            content = content.slice(1); // Remove BOM character
        }

        // Parse CSV
        const lines = this._parseLines(content);
        result.fileInfo.lineCount = lines.length;

        if (lines.length === 0) {
            result.valid = false;
            result.errors.push('File is empty');
            return result;
        }

        // Detect delimiter
        const delimiter = this._detectDelimiter(lines[0]);
        result.fileInfo.delimiter = delimiter;

        // Parse headers
        const headers = this._parseLine(lines[0], delimiter);
        result.fileInfo.headerCount = headers.length;
        result.headerAnalysis.detected = headers;

        // Validate headers against schema
        if (schema.headers) {
            const missingHeaders = schema.headers.filter(h =>
                !headers.some(dh => dh.toLowerCase() === h.toLowerCase())
            );
            const extraHeaders = headers.filter(h =>
                !schema.headers.some(sh => sh.toLowerCase() === h.toLowerCase())
            );

            if (missingHeaders.length > 0) {
                result.errors.push(`Missing expected headers: ${missingHeaders.join(', ')}`);
                result.valid = false;
            }

            if (extraHeaders.length > 0) {
                result.warnings.push(`Extra headers not in schema: ${extraHeaders.join(', ')}`);
            }

            result.headerAnalysis.expected = schema.headers;
            result.headerAnalysis.missing = missingHeaders;
            result.headerAnalysis.extra = extraHeaders;
        }

        // Check for duplicate headers
        const duplicateHeaders = headers.filter((h, i) =>
            headers.indexOf(h) !== i
        );
        if (duplicateHeaders.length > 0) {
            result.errors.push(`Duplicate headers found: ${[...new Set(duplicateHeaders)].join(', ')}`);
            result.valid = false;
        }

        // Validate column consistency
        const inconsistentLines = [];
        for (let i = 1; i < lines.length; i++) {
            const cols = this._parseLine(lines[i], delimiter);
            if (cols.length !== headers.length) {
                inconsistentLines.push({
                    line: i + 1,
                    expected: headers.length,
                    actual: cols.length
                });
            }
        }

        if (inconsistentLines.length > 0) {
            result.warnings.push(
                `${inconsistentLines.length} line(s) have inconsistent column counts. ` +
                `First: line ${inconsistentLines[0].line} (expected ${inconsistentLines[0].expected}, got ${inconsistentLines[0].actual})`
            );
        }

        // Sample data (first 5 rows)
        for (let i = 1; i < Math.min(6, lines.length); i++) {
            const cols = this._parseLine(lines[i], delimiter);
            const row = {};
            headers.forEach((h, idx) => {
                row[h] = cols[idx] || null;
            });
            result.sampleData.push(row);
        }

        // Type validation if schema includes types
        if (schema.types) {
            const typeViolations = this._validateTypes(result.sampleData, schema.types);
            if (typeViolations.length > 0) {
                result.warnings.push(
                    `Type mismatches in sample data: ${typeViolations.slice(0, 3).join('; ')}` +
                    (typeViolations.length > 3 ? ` (+${typeViolations.length - 3} more)` : '')
                );
            }
        }

        return result;
    }

    /**
     * Generate header-based access code from hardcoded index code
     * @param {string} code - Code with hardcoded indices
     * @param {string[]} headers - Header names to use
     * @returns {string} Converted code
     */
    convertToHeaderAccess(code, headers) {
        let converted = code;

        // Replace row[0] with row["header1"], row[1] with row["header2"], etc.
        for (let i = 0; i < headers.length; i++) {
            const patterns = [
                new RegExp(`row\\s*\\[\\s*${i}\\s*\\]`, 'g'),
                new RegExp(`columns\\s*\\[\\s*${i}\\s*\\]`, 'g'),
                new RegExp(`data\\s*\\[\\s*${i}\\s*\\]`, 'g')
            ];

            for (const pattern of patterns) {
                converted = converted.replace(pattern, `row["${headers[i]}"]`);
            }
        }

        return converted;
    }

    /**
     * Create a safe CSV parser function
     * @param {Object} schema - Expected schema
     * @returns {Function} Safe parser function
     */
    createSafeParser(schema) {
        const validator = this;

        return function safeParseCSV(content, options = {}) {
            const result = {
                success: true,
                headers: [],
                rows: [],
                errors: [],
                warnings: []
            };

            try {
                const lines = content.split(/\r?\n/).filter(l => l.trim());

                if (lines.length === 0) {
                    result.success = false;
                    result.errors.push('Empty content');
                    return result;
                }

                // Detect delimiter
                const delimiter = options.delimiter || validator._detectDelimiter(lines[0]);

                // Parse headers
                result.headers = validator._parseLine(lines[0], delimiter);

                // Validate against schema
                if (schema.headers) {
                    const missingHeaders = schema.headers.filter(h =>
                        !result.headers.some(dh =>
                            dh.toLowerCase() === h.toLowerCase()
                        )
                    );

                    if (missingHeaders.length > 0 && options.strict) {
                        result.success = false;
                        result.errors.push(`Missing required headers: ${missingHeaders.join(', ')}`);
                        return result;
                    }
                }

                // Parse rows with header-based access
                for (let i = 1; i < lines.length; i++) {
                    const cols = validator._parseLine(lines[i], delimiter);
                    const row = {};

                    result.headers.forEach((header, idx) => {
                        let value = cols[idx];

                        // Type coercion if schema specifies types
                        if (schema.types && schema.types[header]) {
                            value = validator._coerceType(value, schema.types[header]);
                        }

                        row[header] = value !== undefined ? value : null;
                    });

                    result.rows.push(row);
                }

                return result;
            } catch (error) {
                result.success = false;
                result.errors.push(error.message);
                return result;
            }
        };
    }

    /**
     * Validate a CSV file for upsert safety
     * @param {string} filePath - Path to CSV file
     * @param {Object} options - Options { externalIdField: string }
     * @returns {Object} Validation report { valid, errors, warnings, stats }
     * @throws {Error} When critical failures are detected (null IDs > 5% or formula fields)
     */
    validateForUpsert(filePath, options = {}) {
        const externalIdField = options.externalIdField || 'Id';

        const report = {
            valid: true,
            errors: [],
            warnings: [],
            stats: {
                totalRows: 0,
                junkNames: 0,
                formulaFields: [],
                duplicateIds: 0,
                nullIds: 0
            }
        };

        // Junk/test name patterns
        const junkPatterns = [
            /^Test\s/i,
            /^Lead\s\d+/i,
            /^Contact\s\d+/i,
            /^Account\s\d+/i,
            /^Fake\s/i
        ];

        // Check file exists
        if (!fs.existsSync(filePath)) {
            report.valid = false;
            report.errors.push(`File not found: ${filePath}`);
            return report;
        }

        // Read and decode file
        const buffer = fs.readFileSync(filePath);
        const encoding = this._detectEncoding(buffer);
        let content = buffer.toString(encoding === 'utf-8-bom' ? 'utf8' : encoding);
        if (encoding === 'utf-8-bom') {
            content = content.slice(1);
        }

        // Parse lines
        const lines = this._parseLines(content);

        if (lines.length === 0) {
            report.valid = false;
            report.errors.push('File is empty');
            return report;
        }

        // Detect delimiter and parse headers
        const delimiter = this._detectDelimiter(lines[0]);
        const headers = this._parseLine(lines[0], delimiter);

        // Check ExternalId column exists
        const idColIndex = headers.findIndex(
            h => h.toLowerCase() === externalIdField.toLowerCase()
        );

        if (idColIndex === -1) {
            report.valid = false;
            report.errors.push(
                `ExternalId column "${externalIdField}" not found in headers: ${headers.join(', ')}`
            );
            return report;
        }

        // Parse data rows
        const dataLines = lines.slice(1);
        report.stats.totalRows = dataLines.length;

        const seenIds = new Set();
        const duplicateIdSet = new Set();
        const formulaColsFound = new Set();

        for (let i = 0; i < dataLines.length; i++) {
            const cols = this._parseLine(dataLines[i], delimiter);
            const row = {};
            headers.forEach((h, idx) => {
                row[h] = cols[idx] !== undefined ? cols[idx] : null;
            });

            // Check ExternalId is present and non-empty
            const idValue = row[externalIdField];
            if (idValue === null || idValue === undefined || idValue === '') {
                report.stats.nullIds++;
            } else {
                // Detect duplicate ExternalId values
                if (seenIds.has(idValue)) {
                    duplicateIdSet.add(idValue);
                } else {
                    seenIds.add(idValue);
                }
            }

            // Detect junk/test names in any Name-like column
            for (const header of headers) {
                const cellValue = row[header];
                if (!cellValue) continue;

                if (/name/i.test(header)) {
                    for (const pattern of junkPatterns) {
                        if (pattern.test(cellValue)) {
                            report.stats.junkNames++;
                            break;
                        }
                    }
                }

                // Detect formula field values (any cell starting with '=')
                if (typeof cellValue === 'string' && cellValue.startsWith('=')) {
                    formulaColsFound.add(header);
                }
            }
        }

        report.stats.duplicateIds = duplicateIdSet.size;
        report.stats.formulaFields = Array.from(formulaColsFound);

        // Accumulate warnings
        if (report.stats.junkNames > 0) {
            report.warnings.push(
                `${report.stats.junkNames} row(s) contain junk/test names matching known test patterns.`
            );
        }

        if (report.stats.duplicateIds > 0) {
            report.warnings.push(
                `${report.stats.duplicateIds} duplicate ${externalIdField} value(s) detected — ` +
                'upsert will overwrite the last matching record.'
            );
        }

        if (report.stats.nullIds > 0) {
            report.warnings.push(
                `${report.stats.nullIds} row(s) have a null/empty ${externalIdField}.`
            );
        }

        // Critical failure checks — throw rather than return invalid
        if (report.stats.formulaFields.length > 0) {
            const msg =
                `Formula field values detected in column(s): ${report.stats.formulaFields.join(', ')}. ` +
                'Formula strings (starting with "=") must not be uploaded to the CRM.';
            report.valid = false;
            report.errors.push(msg);
            throw new Error(`[validateForUpsert] Critical failure — ${msg}`);
        }

        const nullIdRate = report.stats.totalRows > 0
            ? report.stats.nullIds / report.stats.totalRows
            : 0;

        if (nullIdRate > 0.05) {
            const pct = (nullIdRate * 100).toFixed(1);
            const msg =
                `${pct}% of rows have a null/empty ${externalIdField} (threshold: 5%). ` +
                'Upsert will insert instead of update for these rows, which may cause duplicates.';
            report.valid = false;
            report.errors.push(msg);
            throw new Error(`[validateForUpsert] Critical failure — ${msg}`);
        }

        // Mark invalid if any non-throwing errors accumulated
        if (report.errors.length > 0) {
            report.valid = false;
        }

        return report;
    }

    // === Private Methods ===

    _detectEncoding(buffer) {
        for (const [encoding, signature] of Object.entries(this.encodingSignatures)) {
            if (buffer.slice(0, signature.length).equals(signature)) {
                return encoding;
            }
        }
        return 'utf-8';
    }

    _detectDelimiter(line) {
        const delimiters = [',', '\t', ';', '|'];
        const counts = delimiters.map(d => ({
            delimiter: d,
            count: (line.match(new RegExp(`\\${d}`, 'g')) || []).length
        }));

        counts.sort((a, b) => b.count - a.count);
        return counts[0].count > 0 ? counts[0].delimiter : ',';
    }

    _parseLines(content) {
        // Handle different line endings
        return content.split(/\r?\n/).filter(line => line.trim());
    }

    _parseLine(line, delimiter = ',') {
        const result = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];

            if (char === '"') {
                if (inQuotes && line[i + 1] === '"') {
                    current += '"';
                    i++; // Skip escaped quote
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (char === delimiter && !inQuotes) {
                result.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }

        result.push(current.trim());
        return result;
    }

    _validateTypes(rows, types) {
        const violations = [];

        for (const row of rows) {
            for (const [field, expectedType] of Object.entries(types)) {
                if (row[field] === null || row[field] === undefined) continue;

                const value = row[field];
                let valid = true;

                switch (expectedType) {
                    case 'number':
                    case 'integer':
                        valid = !isNaN(Number(value));
                        break;
                    case 'boolean':
                        valid = ['true', 'false', '1', '0', 'yes', 'no'].includes(
                            String(value).toLowerCase()
                        );
                        break;
                    case 'date':
                        valid = !isNaN(Date.parse(value));
                        break;
                    case 'email':
                        valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
                        break;
                }

                if (!valid) {
                    violations.push(`${field}: expected ${expectedType}, got "${value}"`);
                }
            }
        }

        return violations;
    }

    _coerceType(value, type) {
        if (value === null || value === undefined || value === '') {
            return null;
        }

        switch (type) {
            case 'number':
                return Number(value);
            case 'integer':
                return parseInt(value, 10);
            case 'boolean':
                return ['true', '1', 'yes'].includes(String(value).toLowerCase());
            case 'date':
                return new Date(value);
            default:
                return value;
        }
    }
}

// CLI interface
if (require.main === module) {
    const args = process.argv.slice(2);
    const command = args[0];

    const validator = new CSVContractValidator({ verbose: true });

    switch (command) {
        case 'validate-code':
            const code = args.slice(1).join(' ') || fs.readFileSync(0, 'utf-8');
            const codeResult = validator.validateCode(code);
            console.log(JSON.stringify(codeResult, null, 2));
            process.exit(codeResult.valid ? 0 : 1);
            break;

        case 'validate-file':
            const filePath = args[1];
            if (!filePath) {
                console.error('Usage: csv-contract-validator validate-file <file.csv>');
                process.exit(1);
            }
            const fileResult = validator.validateFile(filePath);
            console.log(JSON.stringify(fileResult, null, 2));
            process.exit(fileResult.valid ? 0 : 1);
            break;

        case 'convert':
            const inputCode = args[1];
            const headerList = args.slice(2);
            if (!inputCode || headerList.length === 0) {
                console.error('Usage: csv-contract-validator convert "code" header1 header2 ...');
                process.exit(1);
            }
            const converted = validator.convertToHeaderAccess(inputCode, headerList);
            console.log(converted);
            break;

        default:
            console.log(`
CSV Contract Validator - Validate CSV parsing code and files

Usage:
  csv-contract-validator validate-code <code>       Validate code for anti-patterns
  csv-contract-validator validate-file <file.csv>  Validate CSV file structure
  csv-contract-validator convert <code> <headers>  Convert hardcoded indices to header access

Examples:
  csv-contract-validator validate-code "row[0] + row[1]"
  csv-contract-validator validate-file data.csv
  csv-contract-validator convert "row[0]" "Name" "Email"

Checks:
  - Hardcoded column index access (FORBIDDEN)
  - Header validation against schema
  - Encoding detection (UTF-8, UTF-16)
  - Column consistency across rows
  - Type validation
            `);
    }
}

module.exports = { CSVContractValidator };
