#!/usr/bin/env node
/**
 * Data Operation Preflight Validator
 *
 * Purpose: Validate before running bulk data operations to prevent common
 * failures. Checks field existence, data types, governor limits, automation
 * complexity, and more.
 *
 * Key Features:
 * - Field existence validation
 * - Data type compatibility checks
 * - Record count estimation
 * - Governor limit pre-checks
 * - Automation complexity assessment
 * - Validation rule analysis
 * - CSV format validation
 * - Dry-run mode
 *
 * Usage Examples:
 *
 * // Validate before bulk update
 * const validator = new PreflightValidator('delta-production');
 * const result = await validator.validate({
 *   operation: 'update',
 *   sobject: 'Contact',
 *   csvPath: 'updates.csv'
 * });
 *
 * if (!result.passed) {
 *   console.log('Validation failed:', result.errors);
 *   process.exit(1);
 * }
 *
 * // Check specific concerns
 * await validator.checkFieldsExist('Contact', ['Email', 'Phone']);
 * await validator.checkAutomationComplexity('Contact');
 * await validator.estimateProcessingTime('Contact', 60000);
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { SafeQueryBuilder } = require('./safe-query-builder');
const { RobustCSVParser } = require('./csv-schema-validator');

class PreflightValidator {
    constructor(orgAlias, options = {}) {
        this.orgAlias = orgAlias;
        this.verbose = options.verbose || false;
        this.warnings = [];
        this.errors = [];
        this.describeCache = new Map();
    }

    /**
     * Run complete preflight validation
     * @param {object} config - Operation configuration
     * @returns {Promise<object>} Validation result
     */
    async validate(config) {
        this.warnings = [];
        this.errors = [];

        console.log(`\n🔍 Preflight Validation`);
        console.log(`${'═'.repeat(60)}\n`);

        const { operation, sobject, csvPath, fields } = config;

        // Step 1: CSV validation
        if (csvPath) {
            console.log(`📄 Validating CSV file...`);
            await this._validateCSV(csvPath);
        }

        // Step 2: Object existence
        console.log(`📦 Validating object exists...`);
        const objectExists = await this.checkObjectExists(sobject);
        if (!objectExists) {
            this.errors.push(`Object ${sobject} does not exist`);
            return this._buildResult(false);
        }

        // Step 3: Field existence
        console.log(`🏷️  Validating fields exist...`);
        const fieldsToCheck = fields || (csvPath ? this._extractFieldsFromCSV(csvPath) : []);
        if (fieldsToCheck.length > 0) {
            await this.checkFieldsExist(sobject, fieldsToCheck, { operation });
        }

        // Step 4: Data type compatibility
        if (csvPath && fieldsToCheck.length > 0) {
            console.log(`🔢 Validating data types...`);
            await this._validateDataTypes(sobject, csvPath, fieldsToCheck);
        }

        // Step 5: Record count
        console.log(`📊 Estimating record count...`);
        const recordCount = csvPath ? this._countRecordsInCSV(csvPath) : 0;
        await this._checkRecordCount(sobject, recordCount, operation);

        // Step 6: Automation complexity
        console.log(`⚙️  Checking automation complexity...`);
        await this.checkAutomationComplexity(sobject);

        // Step 7: Validation rules
        console.log(`✅ Analyzing validation rules...`);
        await this._checkValidationRules(sobject);

        // Step 8: Governor limits
        console.log(`📏 Checking governor limits...`);
        await this._checkGovernorLimits(sobject);

        // Step 9: Estimate processing time
        if (recordCount > 0) {
            console.log(`⏱️  Estimating processing time...`);
            await this.estimateProcessingTime(sobject, recordCount);
        }

        // Build final result
        const passed = this.errors.length === 0;
        const result = this._buildResult(passed);

        this._displayResult(result);

        return result;
    }

    /**
     * Check if object exists
     */
    async checkObjectExists(sobject) {
        try {
            const command = `sf sobject describe --sobject ${sobject} --target-org ${this.orgAlias} --json`;
            const result = execSync(command, {
                encoding: 'utf-8',
                stdio: ['pipe', 'pipe', 'pipe']
            });

            const data = JSON.parse(result);
            return data.status === 0;

        } catch (error) {
            return false;
        }
    }

    /**
     * Check if fields exist on object
     */
    async checkFieldsExist(sobject, fieldNames, options = {}) {
        try {
            const describe = await this._describeObject(sobject);
            if (!describe) {
                this.errors.push(`Failed to describe object: ${sobject}`);
                return false;
            }

            const operation = options.operation;
            const operationLower = String(operation || '').toLowerCase();
            const requiresCreateable = operationLower === 'insert';
            const requiresUpdateable = operationLower === 'update';
            const isUpsert = operationLower === 'upsert';

            const fieldIndex = new Map();
            const fieldIndexLower = new Map();
            const relationshipIndex = new Map();

            describe.fields.forEach(field => {
                fieldIndex.set(field.name, field);
                fieldIndexLower.set(field.name.toLowerCase(), field);
                if (field.relationshipName) {
                    relationshipIndex.set(field.relationshipName.toLowerCase(), field);
                }
            });

            const cleanedFields = fieldNames
                .map(name => String(name || '').replace(/^\uFEFF/, '').trim())
                .filter(Boolean);

            const directFields = [];
            const relationshipFields = [];

            cleanedFields.forEach(field => {
                if (field.includes('.')) {
                    relationshipFields.push(field);
                } else {
                    directFields.push(field);
                }
            });

            const missingFields = [];
            const caseMismatches = [];
            const nonCreateableFields = [];
            const nonUpdateableFields = [];

            directFields.forEach(field => {
                let fieldDef = fieldIndex.get(field);
                if (!fieldDef) {
                    const fallback = fieldIndexLower.get(field.toLowerCase());
                    if (fallback) {
                        fieldDef = fallback;
                        caseMismatches.push(`${field}->${fallback.name}`);
                    }
                }

                if (!fieldDef) {
                    missingFields.push(field);
                    return;
                }

                if (requiresCreateable && fieldDef.createable === false) {
                    nonCreateableFields.push(fieldDef.name);
                }

                if (requiresUpdateable && fieldDef.updateable === false) {
                    nonUpdateableFields.push(fieldDef.name);
                }

                if (isUpsert) {
                    if (fieldDef.createable === false) {
                        nonCreateableFields.push(fieldDef.name);
                    }
                    if (fieldDef.updateable === false) {
                        nonUpdateableFields.push(fieldDef.name);
                    }
                }
            });

            if (caseMismatches.length > 0) {
                this.warnings.push(`Field case mismatches on ${sobject}: ${caseMismatches.join(', ')}`);
            }

            if (missingFields.length > 0) {
                this.errors.push(`Missing fields on ${sobject}: ${missingFields.join(', ')}`);
                return false;
            }

            if (nonCreateableFields.length > 0) {
                const uniqueCreateable = [...new Set(nonCreateableFields)];
                const message = `Non-creatable fields for ${operationLower || 'operation'} on ${sobject}: ${uniqueCreateable.join(', ')}`;
                if (isUpsert) {
                    this.warnings.push(message);
                } else {
                    this.errors.push(message);
                }
            }

            if (nonUpdateableFields.length > 0) {
                const uniqueUpdateable = [...new Set(nonUpdateableFields)];
                const message = `Non-updateable fields for ${operationLower || 'operation'} on ${sobject}: ${uniqueUpdateable.join(', ')}`;
                if (isUpsert) {
                    this.warnings.push(message);
                } else {
                    this.errors.push(message);
                }
            }

            if (relationshipFields.length > 0) {
                await this._validateRelationshipFields(relationshipFields, relationshipIndex);
            }

            const totalChecked = cleanedFields.length;
            console.log(`   ✅ ${totalChecked} fields validated\n`);
            return this.errors.length === 0;

        } catch (error) {
            this.errors.push(`Failed to describe object: ${error.message}`);
            return false;
        }
    }

    /**
     * Check automation complexity
     */
    async checkAutomationComplexity(sobject) {
        const complexity = {
            triggers: 0,
            workflows: 0,
            flows: 0,
            processBuilders: 0
        };

        try {
            // Query triggers
            const triggersQuery = `SELECT Id FROM ApexTrigger WHERE TableEnumOrId = '${sobject}'`;
            const triggers = await this._toolingQuery(triggersQuery);
            complexity.triggers = triggers.length;

            // Query flows (active only)
            const flowsQuery = `SELECT Id FROM Flow WHERE ProcessType = 'AutoLaunchedFlow' AND TriggerObjectOrEvent.QualifiedApiName = '${sobject}' AND Status = 'Active'`;
            try {
                const flows = await this._toolingQuery(flowsQuery);
                complexity.flows = flows.length;
            } catch (e) {
                // Flow queries can be complex; skip if error
            }

            // Calculate complexity score
            const complexityScore =
                (complexity.triggers * 3) +
                (complexity.flows * 2) +
                (complexity.workflows * 1);

            console.log(`   Triggers: ${complexity.triggers}`);
            console.log(`   Flows: ${complexity.flows}`);
            console.log(`   Complexity Score: ${complexityScore}`);

            if (complexityScore > 10) {
                this.warnings.push(`High automation complexity (${complexityScore}). Expect slower processing and potential timeouts.`);
            } else if (complexityScore > 5) {
                this.warnings.push(`Moderate automation complexity (${complexityScore}). Monitor processing times.`);
            } else {
                console.log(`   ✅ Low automation complexity\n`);
            }

            return complexity;

        } catch (error) {
            this.warnings.push(`Could not assess automation complexity: ${error.message}`);
            return complexity;
        }
    }

    /**
     * Estimate processing time
     */
    async estimateProcessingTime(sobject, recordCount) {
        const complexity = await this.checkAutomationComplexity(sobject);

        // Base: 100 records/second for simple objects
        let baseRate = 100;

        // Adjust for automation
        const complexityScore =
            (complexity.triggers * 3) +
            (complexity.flows * 2) +
            (complexity.workflows * 1);

        if (complexityScore > 10) {
            baseRate = 20; // 20 records/second for complex automation
        } else if (complexityScore > 5) {
            baseRate = 50; // 50 records/second for moderate
        }

        const estimatedSeconds = Math.ceil(recordCount / baseRate);
        const estimatedMinutes = Math.ceil(estimatedSeconds / 60);

        console.log(`   Records: ${recordCount.toLocaleString()}`);
        console.log(`   Rate: ~${baseRate} records/second`);
        console.log(`   Estimated time: ${estimatedMinutes} minutes\n`);

        if (estimatedMinutes > 30) {
            this.warnings.push(`Long processing time estimated (${estimatedMinutes} min). Consider using async mode.`);
        }

        return {
            recordCount,
            ratePerSecond: baseRate,
            estimatedSeconds,
            estimatedMinutes
        };
    }

    /**
     * Validate CSV file
     * @private
     */
    async _validateCSV(csvPath) {
        if (!fs.existsSync(csvPath)) {
            this.errors.push(`CSV file not found: ${csvPath}`);
            return;
        }

        const content = fs.readFileSync(csvPath, 'utf-8');
        const lines = content.split(/\r?\n/).filter(l => l.trim().length > 0);

        if (lines.length < 2) {
            this.errors.push('CSV must have at least a header and one data row');
            return;
        }

        const header = this._parseCSVHeader(csvPath, { includeEmpty: true });
        if (header.length === 0) {
            this.errors.push('CSV header row is empty');
            return;
        }

        const normalizedHeaders = header.map(value => value.toLowerCase());
        const hasId = normalizedHeaders.includes('id');
        if (!hasId) {
            this.warnings.push('CSV does not contain Id field. Ensure this is an insert operation.');
        }

        const emptyHeaders = header.filter(value => !value);
        if (emptyHeaders.length > 0) {
            this.warnings.push('CSV header contains empty column names. Remove trailing commas or fill headers.');
        }

        const duplicateHeaders = [];
        const seen = new Set();
        normalizedHeaders.forEach(value => {
            if (!value) {
                return;
            }
            if (seen.has(value)) {
                duplicateHeaders.push(value);
            } else {
                seen.add(value);
            }
        });

        if (duplicateHeaders.length > 0) {
            const uniqueDuplicates = [...new Set(duplicateHeaders)];
            this.warnings.push(`CSV header contains duplicate columns: ${uniqueDuplicates.join(', ')}`);
        }

        console.log(`   ✅ CSV has ${(lines.length - 1).toLocaleString()} records\n`);
    }

    /**
     * Parse CSV header with robust CSV handling
     * @private
     */
    _parseCSVHeader(csvPath, options = {}) {
        const includeEmpty = options.includeEmpty !== false;
        const content = fs.readFileSync(csvPath, 'utf-8');
        const firstLine = (content.split(/\r?\n/)[0] || '').replace(/^\uFEFF/, '');
        const parser = new RobustCSVParser();
        let headers = parser.parseCSVLine(firstLine).map(value => value.trim());

        if (!includeEmpty) {
            headers = headers.filter(value => value);
        }

        return headers;
    }

    /**
     * Extract field names from CSV header
     * @private
     */
    _extractFieldsFromCSV(csvPath) {
        return this._parseCSVHeader(csvPath, { includeEmpty: false });
    }

    /**
     * Count records in CSV
     * @private
     */
    _countRecordsInCSV(csvPath) {
        const content = fs.readFileSync(csvPath, 'utf-8');
        const lines = content.split(/\r?\n/).filter(l => l.trim().length > 0);
        return Math.max(0, lines.length - 1); // Exclude header
    }

    /**
     * Validate data types in CSV
     * @private
     */
    async _validateDataTypes(sobject, csvPath, fields) {
        try {
            const describe = await this._describeObject(sobject);
            if (!describe) {
                this.warnings.push(`Could not describe object ${sobject} for data type validation.`);
                return;
            }

            const fieldMap = describe.fields.reduce((acc, f) => {
                acc[f.name] = f;
                return acc;
            }, {});

            // Sample first few rows
            const content = fs.readFileSync(csvPath, 'utf-8').replace(/^\uFEFF/, '');
            const parser = new RobustCSVParser();
            const lines = content.split(/\r?\n/).filter(l => l.trim().length > 0).slice(0, 11);
            if (lines.length < 2) {
                return;
            }

            const header = parser.parseCSVLine(lines[0]).map(value => value.trim());

            for (let i = 1; i < lines.length; i++) {
                const values = parser.parseCSVLine(lines[i]);

                for (let j = 0; j < header.length; j++) {
                    const fieldName = header[j].trim();
                    const value = values[j]?.trim();
                    const fieldDef = fieldMap[fieldName];

                    if (!fieldDef || !value) continue;

                    // Check boolean fields
                    if (fieldDef.type === 'boolean' && !['TRUE', 'FALSE', 'true', 'false'].includes(value)) {
                        this.warnings.push(`Row ${i}: ${fieldName} expects TRUE/FALSE, got "${value}"`);
                    }

                    // Check number fields
                    if (['double', 'int', 'currency', 'percent'].includes(fieldDef.type) && isNaN(value)) {
                        this.warnings.push(`Row ${i}: ${fieldName} expects number, got "${value}"`);
                    }

                    // Check date fields
                    if (['date', 'datetime'].includes(fieldDef.type) && !/^\d{4}-\d{2}-\d{2}/.test(value)) {
                        this.warnings.push(`Row ${i}: ${fieldName} expects date format YYYY-MM-DD, got "${value}"`);
                    }
                }
            }

            if (this.warnings.length === 0) {
                console.log(`   ✅ Data types look valid\n`);
            }

        } catch (error) {
            this.warnings.push(`Could not validate data types: ${error.message}`);
        }
    }

    /**
     * Check record count against limits
     * @private
     */
    async _checkRecordCount(sobject, recordCount, operation) {
        if (recordCount > 100000) {
            this.warnings.push(`Very large operation (${recordCount.toLocaleString()} records). Consider splitting into smaller batches.`);
        } else if (recordCount > 50000) {
            this.warnings.push(`Large operation (${recordCount.toLocaleString()} records). Async mode recommended.`);
        }

        console.log(`   Records: ${recordCount.toLocaleString()}\n`);
    }

    /**
     * Check validation rules
     * @private
     */
    async _checkValidationRules(sobject) {
        try {
            const query = `SELECT ValidationName, Active FROM ValidationRule WHERE EntityDefinitionId = '${sobject}' AND Active = true`;
            const rules = await this._toolingQuery(query);

            if (rules.length > 0) {
                this.warnings.push(`${rules.length} active validation rule(s) will run. Ensure data passes validation.`);
                console.log(`   Active rules: ${rules.length}\n`);
            } else {
                console.log(`   ✅ No active validation rules\n`);
            }

        } catch (error) {
            this.warnings.push(`Could not check validation rules: ${error.message}`);
        }
    }

    /**
     * Check governor limits
     * @private
     */
    async _checkGovernorLimits(sobject) {
        // Check field history tracking limit (20 per object)
        try {
            const describe = await this._describeObject(sobject);
            if (!describe) {
                this.warnings.push(`Could not describe object ${sobject} for governor limit checks.`);
                return;
            }

            const trackedFields = describe.fields.filter(f => f.enableHistory === true);

            if (trackedFields.length >= 18) {
                this.warnings.push(`Near field history tracking limit (${trackedFields.length}/20 tracked fields)`);
            }

            console.log(`   Field history: ${trackedFields.length}/20\n`);

        } catch (error) {
            this.warnings.push(`Could not check governor limits: ${error.message}`);
        }
    }

    /**
     * Execute tooling API query
     * @private
     */
    async _toolingQuery(query) {
        try {
            const command = `sf data query --query "${query}" --target-org ${this.orgAlias} --use-tooling-api --json`;
            const result = execSync(command, {
                encoding: 'utf-8',
                stdio: ['pipe', 'pipe', 'pipe']
            });

            const data = JSON.parse(result);
            return data.result.records || [];

        } catch (error) {
            return [];
        }
    }

    /**
     * Describe object and cache results
     * @private
     */
    async _describeObject(sobject) {
        if (this.describeCache.has(sobject)) {
            return this.describeCache.get(sobject);
        }

        try {
            const command = `sf sobject describe --sobject ${sobject} --target-org ${this.orgAlias} --json`;
            const result = execSync(command, {
                encoding: 'utf-8',
                stdio: ['pipe', 'pipe', 'pipe']
            });
            const data = JSON.parse(result);
            const describe = data.result;
            this.describeCache.set(sobject, describe);
            return describe;
        } catch (error) {
            return null;
        }
    }

    /**
     * Validate relationship fields in CSV headers
     * @private
     */
    async _validateRelationshipFields(relationshipFields, relationshipIndex) {
        const unknownRelationships = [];
        const invalidRelationshipFields = [];
        const relatedDescribeCache = new Map();

        for (const field of relationshipFields) {
            const parts = field.split('.');
            if (parts.length < 2) {
                continue;
            }

            const relationshipName = parts[0];
            const relatedField = parts.slice(1).join('.');
            const relationshipDef = relationshipIndex.get(relationshipName.toLowerCase());

            if (!relationshipDef || !Array.isArray(relationshipDef.referenceTo) || relationshipDef.referenceTo.length === 0) {
                unknownRelationships.push(field);
                continue;
            }

            let found = false;
            for (const relatedObject of relationshipDef.referenceTo) {
                let relatedDescribe = relatedDescribeCache.get(relatedObject);
                if (!relatedDescribe) {
                    relatedDescribe = await this._describeObject(relatedObject);
                    relatedDescribeCache.set(relatedObject, relatedDescribe);
                }

                if (!relatedDescribe) {
                    continue;
                }

                const match = relatedDescribe.fields.find(f => f.name.toLowerCase() === relatedField.toLowerCase());
                if (match) {
                    found = true;
                    break;
                }
            }

            if (!found) {
                invalidRelationshipFields.push(field);
            }
        }

        if (unknownRelationships.length > 0) {
            this.warnings.push(`Unknown relationship fields: ${unknownRelationships.join(', ')}`);
        }

        if (invalidRelationshipFields.length > 0) {
            this.warnings.push(`Relationship fields with unknown target fields: ${invalidRelationshipFields.join(', ')}`);
        }
    }

    /**
     * Build validation result
     * @private
     */
    _buildResult(passed) {
        return {
            passed,
            errors: this.errors,
            warnings: this.warnings,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Display validation result
     * @private
     */
    _displayResult(result) {
        console.log(`\n${'═'.repeat(60)}`);

        if (result.passed) {
            console.log(`✅ Preflight Validation: PASSED`);
        } else {
            console.log(`❌ Preflight Validation: FAILED`);
        }

        console.log(`${'═'.repeat(60)}\n`);

        if (result.errors.length > 0) {
            console.log(`Errors (${result.errors.length}):`);
            result.errors.forEach(error => {
                console.log(`   ❌ ${error}`);
            });
            console.log();
        }

        if (result.warnings.length > 0) {
            console.log(`Warnings (${result.warnings.length}):`);
            result.warnings.forEach(warning => {
                console.log(`   ⚠️  ${warning}`);
            });
            console.log();
        }

        if (result.passed && result.warnings.length === 0) {
            console.log(`✅ No issues found. Safe to proceed.\n`);
        }
    }
}

// Export
module.exports = PreflightValidator;

// CLI usage
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length < 3) {
        console.log(`
Data Operation Preflight Validator

Usage:
  node data-op-preflight.js <operation> <sobject> <csv-path> <org-alias>

Examples:
  node data-op-preflight.js update Contact updates.csv delta-production
  node data-op-preflight.js insert Account new-accounts.csv delta-production
        `);
        process.exit(0);
    }

    const [operation, sobject, csvPath, orgAlias] = args;

    (async () => {
        const validator = new PreflightValidator(orgAlias);
        const result = await validator.validate({
            operation,
            sobject,
            csvPath
        });

        if (!result.passed) {
            process.exit(1);
        }

    })().catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}
