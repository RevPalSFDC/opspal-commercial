#!/usr/bin/env node

/**
 * Field Mapping Configuration Engine
 *
 * Declarative CSV → Salesforce field transformation system that eliminates
 * manual, error-prone field mappings. Supports complex transformations,
 * multi-target fields, and naming conventions.
 *
 * Prevents errors like:
 * - Amount going to wrong field (should be Expected_Renewal__c)
 * - Missing field mappings (5 unmapped columns today)
 * - Incorrect naming conventions (used today's date instead of FY)
 *
 * Configuration Format:
 * {
 *   "csvToSalesforce": {
 *     "CSV_Column_Name": {
 *       "salesforceField": "SF_API_Name__c",
 *       "transform": "currency|date|text|boolean",
 *       "required": true|false,
 *       "multiTarget": ["Field1__c", "Field2__c"],
 *       "defaultValue": "...",
 *       "validation": "..."
 *     }
 *   },
 *   "namingConvention": {
 *     "template": "{AccountName} - Renewal - FY{FiscalYear}",
 *     "sources": {
 *       "AccountName": "Account.Name",
 *       "FiscalYear": "CloseDate"
 *     },
 *     "transforms": {
 *       "FiscalYear": "toFiscalYear:YY"
 *     }
 *   }
 * }
 */

const fs = require('fs');
const csv = require('csv-parse/sync');

class FieldMappingError extends Error {
    constructor(message, code, details = {}) {
        super(message);
        this.name = 'FieldMappingError';
        this.code = code;
        this.details = details;
    }
}

class FieldMappingEngine {
    constructor(config, options = {}) {
        this.config = config;
        this.options = {
            verbose: options.verbose || false,
            strictMode: options.strictMode || false,
            ...options
        };

        this.mappings = config.csvToSalesforce || {};
        this.namingConvention = config.namingConvention || null;
        this.transformers = this.initializeTransformers();
    }

    /**
     * Initialize transformation functions
     */
    initializeTransformers() {
        return {
            // Currency transformations
            currency: (value) => {
                if (!value) return null;
                const cleaned = value.toString().replace(/[$,]/g, '');
                const num = parseFloat(cleaned);
                return isNaN(num) ? null : num;
            },

            // Date transformations
            date: (value) => {
                if (!value) return null;
                const date = new Date(value);
                return isNaN(date.getTime()) ? null : date.toISOString().split('T')[0];
            },

            datetime: (value) => {
                if (!value) return null;
                const date = new Date(value);
                return isNaN(date.getTime()) ? null : date.toISOString();
            },

            // Boolean transformations
            boolean: (value) => {
                if (!value) return false;
                const str = value.toString().toLowerCase();
                return ['true', '1', 'yes', 'y'].includes(str);
            },

            // Text transformations
            text: (value) => {
                return value ? value.toString().trim() : null;
            },

            uppercase: (value) => {
                return value ? value.toString().toUpperCase() : null;
            },

            lowercase: (value) => {
                return value ? value.toString().toLowerCase() : null;
            },

            // Number transformations
            number: (value) => {
                if (!value) return null;
                const num = parseFloat(value.toString().replace(/[^0-9.-]/g, ''));
                return isNaN(num) ? null : num;
            },

            integer: (value) => {
                if (!value) return null;
                const num = parseInt(value.toString().replace(/[^0-9-]/g, ''), 10);
                return isNaN(num) ? null : num;
            },

            // Fiscal year extraction
            toFiscalYear: (value, format = 'YYYY') => {
                if (!value) return null;
                const date = new Date(value);
                if (isNaN(date.getTime())) return null;

                const year = date.getFullYear();
                const month = date.getMonth(); // 0-indexed

                // Fiscal year typically starts in October (month 9)
                const fiscalYear = month >= 9 ? year + 1 : year;

                if (format === 'YY') {
                    return fiscalYear.toString().slice(-2);
                }
                return fiscalYear.toString();
            },

            // ID validation
            salesforceId: (value) => {
                if (!value) return null;
                const str = value.toString().trim();
                if (!/^[a-zA-Z0-9]{15}$|^[a-zA-Z0-9]{18}$/.test(str)) {
                    return null;
                }
                return str;
            }
        };
    }

    /**
     * Transform CSV record to Salesforce record
     */
    transformRecord(csvRecord, additionalData = {}) {
        const sfRecord = {};
        const errors = [];
        const warnings = [];

        // Apply field mappings
        for (const [csvColumn, mapping] of Object.entries(this.mappings)) {
            try {
                const result = this.applyMapping(csvColumn, mapping, csvRecord, additionalData);

                if (result.errors.length > 0) {
                    errors.push(...result.errors);
                }

                if (result.warnings.length > 0) {
                    warnings.push(...result.warnings);
                }

                // Add transformed values to SF record
                Object.assign(sfRecord, result.values);

            } catch (error) {
                errors.push({
                    column: csvColumn,
                    error: error.message
                });
            }
        }

        // Apply naming convention if configured
        if (this.namingConvention) {
            try {
                const name = this.generateName(csvRecord, sfRecord, additionalData);
                if (name) {
                    sfRecord.Name = name;
                }
            } catch (error) {
                errors.push({
                    field: 'Name',
                    error: `Naming convention failed: ${error.message}`
                });
            }
        }

        return {
            record: sfRecord,
            errors,
            warnings
        };
    }

    /**
     * Apply individual field mapping
     */
    applyMapping(csvColumn, mapping, csvRecord, additionalData) {
        const values = {};
        const errors = [];
        const warnings = [];

        // Get raw value from CSV
        let rawValue = csvRecord[csvColumn];

        // Check required field
        if (mapping.required && !rawValue) {
            errors.push({
                column: csvColumn,
                field: mapping.salesforceField,
                error: 'Required field is empty'
            });
            return { values, errors, warnings };
        }

        // Apply default value if empty
        if (!rawValue && mapping.defaultValue !== undefined) {
            rawValue = mapping.defaultValue;
        }

        // Skip if no value and not required
        if (!rawValue && !mapping.required) {
            return { values, errors, warnings };
        }

        // Apply transformation
        let transformedValue = rawValue;
        if (mapping.transform) {
            const transformer = this.transformers[mapping.transform];
            if (transformer) {
                transformedValue = transformer(rawValue, mapping.transformOptions);

                if (transformedValue === null && mapping.required) {
                    errors.push({
                        column: csvColumn,
                        field: mapping.salesforceField,
                        error: `Transformation '${mapping.transform}' failed for required field`
                    });
                }
            } else {
                warnings.push({
                    column: csvColumn,
                    error: `Unknown transformer: ${mapping.transform}`
                });
            }
        }

        // Apply validation
        if (mapping.validation && transformedValue) {
            const validationResult = this.validateValue(transformedValue, mapping.validation);
            if (!validationResult.valid) {
                errors.push({
                    column: csvColumn,
                    field: mapping.salesforceField,
                    error: validationResult.error
                });
            }
        }

        // Set value(s) in SF record
        if (mapping.salesforceField) {
            values[mapping.salesforceField] = transformedValue;
        }

        // Multi-target: set same value to multiple fields
        if (mapping.multiTarget && Array.isArray(mapping.multiTarget)) {
            for (const targetField of mapping.multiTarget) {
                values[targetField] = transformedValue;
            }
        }

        // Use for naming only (no direct field mapping)
        if (mapping.useFor === 'naming') {
            // Value will be used in naming convention, don't add to record
        }

        return { values, errors, warnings };
    }

    /**
     * Generate record name using naming convention
     */
    generateName(csvRecord, sfRecord, additionalData) {
        if (!this.namingConvention || !this.namingConvention.template) {
            return null;
        }

        const { template, sources = {}, transforms = {} } = this.namingConvention;

        // Extract values for template variables
        const templateValues = {};

        for (const [varName, source] of Object.entries(sources)) {
            let value;

            // Check if source is a CSV column
            if (csvRecord[source]) {
                value = csvRecord[source];
            }
            // Check if source is a SF field
            else if (sfRecord[source]) {
                value = sfRecord[source];
            }
            // Check if source is additional data (e.g., Account.Name from lookup)
            else if (additionalData[source]) {
                value = additionalData[source];
            }
            // Try nested path (e.g., "Account.Name")
            else {
                value = this.getNestedValue(additionalData, source);
            }

            // Apply transform if specified
            if (value && transforms[varName]) {
                const [transformName, ...args] = transforms[varName].split(':');
                const transformer = this.transformers[transformName];
                if (transformer) {
                    value = transformer(value, ...args);
                }
            }

            templateValues[varName] = value;
        }

        // Replace template variables
        let name = template;
        for (const [varName, value] of Object.entries(templateValues)) {
            const placeholder = `{${varName}}`;
            name = name.replace(placeholder, value || '');
        }

        return name.trim();
    }

    /**
     * Validate transformed value
     */
    validateValue(value, validation) {
        if (typeof validation === 'string') {
            // Regex validation
            const regex = new RegExp(validation);
            if (!regex.test(value.toString())) {
                return {
                    valid: false,
                    error: `Value does not match pattern: ${validation}`
                };
            }
        } else if (typeof validation === 'function') {
            // Custom validation function
            return validation(value);
        } else if (validation.min !== undefined || validation.max !== undefined) {
            // Range validation
            const num = parseFloat(value);
            if (validation.min !== undefined && num < validation.min) {
                return {
                    valid: false,
                    error: `Value ${num} is less than minimum ${validation.min}`
                };
            }
            if (validation.max !== undefined && num > validation.max) {
                return {
                    valid: false,
                    error: `Value ${num} is greater than maximum ${validation.max}`
                };
            }
        }

        return { valid: true };
    }

    /**
     * Get nested value from object (e.g., "Account.Name")
     */
    getNestedValue(obj, path) {
        const parts = path.split('.');
        let current = obj;

        for (const part of parts) {
            if (current && typeof current === 'object' && part in current) {
                current = current[part];
            } else {
                return null;
            }
        }

        return current;
    }

    /**
     * Transform entire CSV file
     */
    transformCsv(csvPath, options = {}) {
        const content = fs.readFileSync(csvPath, 'utf-8');
        const records = csv.parse(content, {
            columns: true,
            skip_empty_lines: true
        });

        const results = {
            total: records.length,
            successful: 0,
            failed: 0,
            records: [],
            errors: [],
            warnings: []
        };

        for (let i = 0; i < records.length; i++) {
            const csvRecord = records[i];
            const result = this.transformRecord(csvRecord, options.additionalData);

            if (result.errors.length > 0) {
                results.failed++;
                results.errors.push({
                    row: i + 2, // +2 for header and 0-index
                    errors: result.errors
                });
            } else {
                results.successful++;
            }

            if (result.warnings.length > 0) {
                results.warnings.push({
                    row: i + 2,
                    warnings: result.warnings
                });
            }

            results.records.push(result.record);
        }

        return results;
    }

    /**
     * Export field mapping config template
     */
    static generateTemplate(csvPath, objectName = 'Opportunity') {
        const content = fs.readFileSync(csvPath, 'utf-8');
        const records = csv.parse(content, {
            columns: true,
            skip_empty_lines: true
        });

        if (records.length === 0) {
            throw new Error('CSV file is empty');
        }

        const csvColumns = Object.keys(records[0]);
        const template = {
            csvToSalesforce: {},
            namingConvention: {
                template: "{AccountName} - Renewal - FY{FiscalYear}",
                sources: {
                    "AccountName": "Account.Name",
                    "FiscalYear": "CloseDate"
                },
                transforms: {
                    "FiscalYear": "toFiscalYear:YY"
                }
            }
        };

        // Generate mapping template for each CSV column
        for (const column of csvColumns) {
            // Try to infer field type from sample data
            const sampleValue = records[0][column];
            const inferredType = this.inferFieldType(sampleValue);

            template.csvToSalesforce[column] = {
                salesforceField: `${column.replace(/[^a-zA-Z0-9_]/g, '_')}__c`,
                transform: inferredType.transform,
                required: false,
                comment: `Sample value: ${sampleValue}`
            };
        }

        return template;
    }

    /**
     * Infer field type from sample value
     */
    static inferFieldType(value) {
        if (!value) {
            return { transform: 'text' };
        }

        const str = value.toString().trim();

        // Currency
        if (/^\$?[\d,]+\.?\d*$/.test(str)) {
            return { transform: 'currency' };
        }

        // Date
        if (!isNaN(Date.parse(str)) && /\d{4}-\d{2}-\d{2}/.test(str)) {
            return { transform: 'date' };
        }

        // Boolean
        if (/^(true|false|yes|no|y|n|1|0)$/i.test(str)) {
            return { transform: 'boolean' };
        }

        // Number
        if (/^\d+\.?\d*$/.test(str)) {
            return { transform: 'number' };
        }

        // Salesforce ID
        if (/^[a-zA-Z0-9]{15}$|^[a-zA-Z0-9]{18}$/.test(str)) {
            return { transform: 'salesforceId' };
        }

        return { transform: 'text' };
    }
}

// CLI interface
if (require.main === module) {
    const command = process.argv[2];

    if (command === 'generate-template') {
        const csvPath = process.argv[3];

        if (!csvPath) {
            console.error('Usage: node field-mapping-engine.js generate-template <csv-path>');
            process.exit(1);
        }

        const template = FieldMappingEngine.generateTemplate(csvPath);
        console.log(JSON.stringify(template, null, 2));
        process.exit(0);
    }

    if (command === 'transform') {
        const configPath = process.argv[3];
        const csvPath = process.argv[4];
        const outputPath = process.argv[5];

        if (!configPath || !csvPath) {
            console.error('Usage: node field-mapping-engine.js transform <config-path> <csv-path> [output-path]');
            process.exit(1);
        }

        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        const engine = new FieldMappingEngine(config, { verbose: true });
        const results = engine.transformCsv(csvPath);

        console.log(`\n📊 Transformation Results:`);
        console.log(`   Total: ${results.total}`);
        console.log(`   Successful: ${results.successful}`);
        console.log(`   Failed: ${results.failed}`);
        console.log(`   Warnings: ${results.warnings.length}`);

        if (outputPath) {
            fs.writeFileSync(outputPath, JSON.stringify(results.records, null, 2));
            console.log(`\n✅ Output written to: ${outputPath}`);
        }

        process.exit(results.failed > 0 ? 1 : 0);
    }

    console.log(`
Field Mapping Configuration Engine

Commands:
  generate-template <csv-path>                    Generate mapping template from CSV
  transform <config-path> <csv-path> [output]     Transform CSV using config

Examples:
  node field-mapping-engine.js generate-template data/input.csv > field-mapping.json
  node field-mapping-engine.js transform field-mapping.json data/input.csv data/output.json
    `);
}

module.exports = { FieldMappingEngine, FieldMappingError };
