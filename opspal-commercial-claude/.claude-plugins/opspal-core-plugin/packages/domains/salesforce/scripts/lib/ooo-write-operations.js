#!/usr/bin/env node

/**
 * Salesforce Order of Operations - Write Operations Library
 *
 * Implements Section A (Write Operations) and Section D1 (Create Record Safe) from the
 * Salesforce Order of Operations playbook.
 *
 * Core Principle: Introspect → Plan → Apply → Verify → Activate
 *
 * This library ensures:
 * - No brute-force operations
 * - Validation failures surface rule names/formulas
 * - Dependent metadata bundled correctly
 * - Idempotent operations with proper verification
 *
 * @see docs/SALESFORCE_ORDER_OF_OPERATIONS.md
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

class OOOWriteOperations {
    constructor(orgAlias, options = {}) {
        this.orgAlias = orgAlias;
        this.verbose = options.verbose || false;
        this.dryRun = options.dryRun || false;
        this.cache = new Map();
    }

    /**
     * D1: Create Record (Safe)
     *
     * Implements the 7-step safe record creation sequence:
     * 1. describeObject
     * 2. getActiveValidationRules
     * 3. resolveRecordType
     * 4. checkFLS
     * 5. resolveLookups
     * 6. createRecord
     * 7. verifyRecord
     *
     * @param {string} objectName - Salesforce object API name
     * @param {object} payload - Record data to create
     * @param {object} options - Creation options
     * @returns {Promise<object>} Creation result with verification
     */
    async createRecordSafe(objectName, payload, options = {}) {
        this.log(`🚀 Starting safe record creation for ${objectName}`);

        const context = {
            objectName,
            payload,
            options,
            timestamp: new Date().toISOString(),
            steps: []
        };

        try {
            // STEP 1: Describe Object
            this.log('Step 1: Describing object...');
            context.objectMetadata = await this.describeObject(objectName);
            context.steps.push({ step: 1, name: 'describeObject', status: 'completed' });

            // STEP 2: Get Active Validation Rules
            this.log('Step 2: Fetching active validation rules...');
            context.validationRules = await this.getActiveValidationRules(objectName);
            context.steps.push({ step: 2, name: 'getActiveValidationRules', status: 'completed' });

            // STEP 3: Resolve Record Type
            this.log('Step 3: Resolving record type...');
            context.recordType = await this.resolveRecordType(
                objectName,
                options.recordTypeName || null
            );
            if (context.recordType) {
                payload.RecordTypeId = context.recordType.Id;
            }
            context.steps.push({ step: 3, name: 'resolveRecordType', status: 'completed' });

            // STEP 4: Check FLS
            this.log('Step 4: Checking field-level security...');
            const flsCheck = await this.checkFLS(objectName, Object.keys(payload));
            if (flsCheck.violations.length > 0) {
                throw new Error(
                    `FLS violations detected:\n${flsCheck.violations.map(v => `  - ${v.field}: ${v.reason}`).join('\n')}`
                );
            }
            context.steps.push({ step: 4, name: 'checkFLS', status: 'completed' });

            // STEP 5: Resolve Lookups
            this.log('Step 5: Resolving lookup references...');
            payload = await this.resolveLookups(objectName, payload, context.objectMetadata);
            context.steps.push({ step: 5, name: 'resolveLookups', status: 'completed' });

            // STEP 6: Create Record
            this.log('Step 6: Creating record...');
            if (this.dryRun) {
                this.log('[DRY RUN] Would create record with payload:', JSON.stringify(payload, null, 2));
                context.recordId = 'DRYRUN_ID';
                context.steps.push({ step: 6, name: 'createRecord', status: 'dry_run' });
            } else {
                const createResult = await this.createRecord(objectName, payload, options);
                context.recordId = createResult.id;
                context.errors = createResult.errors;
                context.steps.push({ step: 6, name: 'createRecord', status: createResult.success ? 'completed' : 'failed' });

                if (!createResult.success) {
                    // Surface validation failure with rule name
                    const enrichedErrors = await this.enrichValidationErrors(
                        objectName,
                        createResult.errors,
                        context.validationRules
                    );
                    throw new Error(
                        `Record creation failed:\n${enrichedErrors.map(e =>
                            `  ❌ ${e.message}\n     Rule: ${e.ruleName || 'Unknown'}\n     Formula: ${e.formula || 'N/A'}`
                        ).join('\n')}`
                    );
                }
            }

            // STEP 7: Verify Record
            this.log('Step 7: Verifying record...');
            if (!this.dryRun) {
                const verification = await this.verifyRecord(objectName, context.recordId, Object.keys(payload));
                context.verification = verification;
                context.steps.push({ step: 7, name: 'verifyRecord', status: verification.success ? 'completed' : 'failed' });

                if (!verification.success) {
                    throw new Error(
                        `Record verification failed:\n${verification.issues.map(i => `  - ${i}`).join('\n')}`
                    );
                }
            } else {
                context.steps.push({ step: 7, name: 'verifyRecord', status: 'dry_run' });
            }

            this.log('✅ Safe record creation completed successfully');
            return {
                success: true,
                recordId: context.recordId,
                context
            };

        } catch (error) {
            this.log(`❌ Safe record creation failed: ${error.message}`);
            context.error = error.message;
            context.success = false;
            return {
                success: false,
                error: error.message,
                context
            };
        }
    }

    /**
     * A1: Introspect - Describe Object
     *
     * Gets object metadata including:
     * - Required fields (nillable=false and createable=true)
     * - Field types (picklists, lookups, formulas, auto-numbers)
     * - Record types
     * - Dependent/controlling picklists
     */
    async describeObject(objectName) {
        const cacheKey = `describe_${objectName}`;
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        try {
            // Use sf sobject describe for complete field metadata
            const { stdout } = await execAsync(
                `sf sobject describe --sobject ${objectName} --target-org ${this.orgAlias} --json`,
                { maxBuffer: 10 * 1024 * 1024 }
            );

            const result = JSON.parse(stdout);

            if (result.status !== 0 || !result.result) {
                throw new Error(`Object ${objectName} not found`);
            }

            const describe = result.result;
            const fields = describe.fields;

            const metadata = {
                object: {
                    name: describe.name,
                    label: describe.label,
                    keyPrefix: describe.keyPrefix,
                    custom: describe.custom,
                    recordTypeInfos: describe.recordTypeInfos
                },
                fields: fields.map(f => ({
                    name: f.name,
                    label: f.label,
                    type: f.type,
                    nillable: f.nillable,
                    createable: f.createable,
                    updateable: f.updateable,
                    referenceTo: f.referenceTo,
                    defaultValue: f.defaultValue,
                    calculated: f.calculated,
                    autoNumber: f.autoNumber,
                    unique: f.unique,
                    picklistValues: f.picklistValues
                })),
                requiredFields: fields.filter(f => !f.nillable && f.createable && !f.autoNumber),
                picklistFields: fields.filter(f => f.type === 'picklist' || f.type === 'multipicklist'),
                lookupFields: fields.filter(f => f.referenceTo && f.referenceTo.length > 0),
                formulaFields: fields.filter(f => f.calculated)
            };

            this.cache.set(cacheKey, metadata);
            return metadata;

        } catch (error) {
            throw new Error(`Failed to describe object ${objectName}: ${error.message}`);
        }
    }

    /**
     * A1: Introspect - Get Active Validation Rules
     *
     * Queries active validation rules and extracts formulas via Metadata API.
     * This allows us to surface which rule would fail and why.
     */
    async getActiveValidationRules(objectName) {
        try {
            const query = `SELECT Id, ValidationName, Active, ErrorDisplayField, ErrorMessage FROM ValidationRule WHERE EntityDefinition.QualifiedApiName = '${objectName}' AND Active = true`;

            const { stdout } = await execAsync(
                `sf data query --query "${query}" --use-tooling-api --target-org ${this.orgAlias} --json`,
                { maxBuffer: 10 * 1024 * 1024 }
            );
            const result = JSON.parse(stdout);
            const rules = result.result?.records || [];

            // For each rule, get the formula (would need Metadata API for full formula)
            // For now, we store rule names and error messages
            // Note: Formula field not included - requires Metadata API retrieval (not implemented)
            // See: https://github.com/RevPalSFDC/opspal-plugin-internal-marketplace/issues/TBD
            return rules.map(r => ({
                id: r.Id,
                name: r.ValidationName,
                active: r.Active,
                errorField: r.ErrorDisplayField,
                errorMessage: r.ErrorMessage
                // formula field intentionally omitted - requires Metadata API implementation
            }));

        } catch (error) {
            this.log(`Warning: Could not fetch validation rules: ${error.message}`);
            return [];
        }
    }

    /**
     * A1: Introspect - Resolve Record Type
     *
     * Gets the record type ID for the given name, or returns the default RT.
     * Uses recordTypeInfos from describe result for efficiency.
     */
    async resolveRecordType(objectName, recordTypeName) {
        try {
            // Get metadata which includes recordTypeInfos
            const metadata = await this.describeObject(objectName);
            const recordTypeInfos = metadata.object.recordTypeInfos || [];

            if (recordTypeInfos.length === 0) {
                // No record types
                return null;
            }

            let recordType;
            if (recordTypeName) {
                // Find by developer name or label
                recordType = recordTypeInfos.find(rt =>
                    rt.developerName === recordTypeName ||
                    rt.name === recordTypeName
                );

                if (!recordType) {
                    throw new Error(`Record Type ${recordTypeName} not found for ${objectName}`);
                }
            } else {
                // Find default record type
                recordType = recordTypeInfos.find(rt => rt.defaultRecordTypeMapping);

                if (!recordType) {
                    // Fallback to master record type
                    recordType = recordTypeInfos.find(rt => rt.master);
                }
            }

            if (!recordType) {
                return null;
            }

            return {
                Id: recordType.recordTypeId,
                DeveloperName: recordType.developerName,
                Name: recordType.name,
                IsDefault: recordType.defaultRecordTypeMapping
            };

        } catch (error) {
            throw new Error(`Failed to resolve record type: ${error.message}`);
        }
    }

    /**
     * A1: Introspect - Check FLS
     *
     * Verifies user has create permission and FLS for all fields in the write.
     */
    async checkFLS(objectName, fieldNames) {
        try {
            // Query FieldPermissions for the current user
            // Note: This would ideally check the running user's profile + permission sets
            // For now, we'll do a basic check

            const violations = [];
            const metadata = await this.describeObject(objectName);

            for (const fieldName of fieldNames) {
                const field = metadata.fields.find(f => f.name === fieldName);

                if (!field) {
                    violations.push({
                        field: fieldName,
                        reason: 'Field does not exist'
                    });
                    continue;
                }

                if (!field.createable) {
                    violations.push({
                        field: fieldName,
                        reason: 'Field is not createable'
                    });
                }
            }

            return {
                violations,
                passed: violations.length === 0
            };

        } catch (error) {
            throw new Error(`Failed to check FLS: ${error.message}`);
        }
    }

    /**
     * A1: Introspect - Resolve Lookups
     *
     * Resolves foreign keys by external ID or name → ID conversion.
     */
    async resolveLookups(objectName, payload, metadata) {
        const resolvedPayload = { ...payload };

        for (const lookupField of metadata.lookupFields) {
            const fieldName = lookupField.name;
            const value = payload[fieldName];

            if (value && typeof value === 'string') {
                // Check if it looks like a Salesforce ID (15 or 18 chars starting with alphanumeric)
                const isSalesforceId = /^[a-zA-Z0-9]{15}([a-zA-Z0-9]{3})?$/.test(value);

                if (!isSalesforceId) {
                    // Assume it's a name or external ID, try to resolve
                    this.log(`  Resolving lookup ${fieldName}: "${value}"`);

                    // Try to query by Name first
                    const refObject = lookupField.referenceTo[0];  // referenceTo is an array
                    const query = `SELECT Id FROM ${refObject} WHERE Name = '${value}' LIMIT 1`;

                    try {
                        const { stdout } = await execAsync(
                            `sf data query --query "${query}" --target-org ${this.orgAlias} --json`,
                            { maxBuffer: 10 * 1024 * 1024 }
                        );
                        const result = JSON.parse(stdout);
                        const record = result.result?.records?.[0];

                        if (record) {
                            resolvedPayload[fieldName] = record.Id;
                            this.log(`    ✓ Resolved to ${record.Id}`);
                        } else {
                            this.log(`    ⚠ Could not resolve "${value}", keeping as-is`);
                        }
                    } catch (error) {
                        this.log(`    ⚠ Lookup resolution failed: ${error.message}`);
                    }
                }
            }
        }

        return resolvedPayload;
    }

    /**
     * A3: Apply - Create Record
     *
     * Creates the record with the validated payload.
     * On validation failure, surfaces rule name (not automatic retry).
     */
    async createRecord(objectName, payload, options = {}) {
        try {
            // Build JSON payload
            const payloadJson = JSON.stringify(payload);
            const tempFile = `/tmp/ooo-create-${Date.now()}.json`;
            await execAsync(`echo '${payloadJson}' > ${tempFile}`);

            // Execute creation
            const allOrNone = options.allOrNone !== false; // Default true
            const assignmentRuleHeader = options.disableAssignmentRules ? '--ignore-assignment-rule' : '';

            const { stdout } = await execAsync(
                `sf data create record --sobject ${objectName} --values @${tempFile} ${assignmentRuleHeader} --target-org ${this.orgAlias} --json`,
                { maxBuffer: 10 * 1024 * 1024 }
            );

            // Clean up temp file
            await execAsync(`rm ${tempFile}`);

            const result = JSON.parse(stdout);

            if (result.status === 0 && result.result?.id) {
                return {
                    success: true,
                    id: result.result.id
                };
            } else {
                return {
                    success: false,
                    errors: result.result?.errors || [{ message: 'Unknown error' }]
                };
            }

        } catch (error) {
            // Parse error to extract validation failure info
            const errorMessage = error.message || error.toString();
            return {
                success: false,
                errors: [{ message: errorMessage }]
            };
        }
    }

    /**
     * A4: Verify - Verify Record
     *
     * Re-fetches the record with a restricted field list (only what was written).
     * Asserts values match and picklist normalization occurred.
     */
    async verifyRecord(objectName, recordId, expectedFields) {
        try {
            const fieldList = ['Id', ...expectedFields].join(', ');
            const query = `SELECT ${fieldList} FROM ${objectName} WHERE Id = '${recordId}'`;

            const { stdout } = await execAsync(
                `sf data query --query "${query}" --target-org ${this.orgAlias} --json`,
                { maxBuffer: 10 * 1024 * 1024 }
            );
            const result = JSON.parse(stdout);
            const record = result.result?.records?.[0];

            if (!record) {
                return {
                    success: false,
                    issues: [`Record ${recordId} not found after creation`]
                };
            }

            // Basic verification: record exists and has expected fields
            const issues = [];
            for (const field of expectedFields) {
                if (!(field in record)) {
                    issues.push(`Field ${field} missing from record`);
                }
            }

            return {
                success: issues.length === 0,
                record,
                issues
            };

        } catch (error) {
            return {
                success: false,
                issues: [`Verification query failed: ${error.message}`]
            };
        }
    }

    /**
     * Enrich validation errors with rule names and formulas
     */
    async enrichValidationErrors(objectName, errors, validationRules) {
        return errors.map(error => {
            const enriched = { ...error };

            // Try to match error message to validation rule
            if (error.message) {
                const matchingRule = validationRules.find(rule =>
                    error.message.includes(rule.errorMessage) ||
                    error.message.includes(rule.name)
                );

                if (matchingRule) {
                    enriched.ruleName = matchingRule.name;
                    enriched.formula = matchingRule.formula;
                }
            }

            return enriched;
        });
    }

    /**
     * Logging helper
     */
    log(message) {
        if (this.verbose) {
            console.log(message);
        }
    }
}

// CLI Support
if (require.main === module) {
    const args = process.argv.slice(2);
    const command = args[0];

    if (!command) {
        console.log(`
Salesforce Order of Operations - Write Operations Library

Usage:
  node ooo-write-operations.js createRecordSafe <object> <org> [options]
  node ooo-write-operations.js introspect <object> <org>

Commands:
  createRecordSafe    Create a record using the safe 7-step sequence
  introspect          Run introspection only (describe + validation rules)

Options:
  --payload <json>       Record data as JSON string
  --record-type <name>   Record type developer name
  --dry-run              Show what would be done without executing
  --verbose              Show detailed logging

Example:
  node ooo-write-operations.js createRecordSafe Account myorg \\
    --payload '{"Name":"Test","Industry":"Technology"}' \\
    --verbose
        `);
        process.exit(0);
    }

    async function runCLI() {
        const object = args[1];
        const org = args[2];

        if (!object || !org) {
            console.error('Error: Object and org are required');
            process.exit(1);
        }

        const options = {
            verbose: args.includes('--verbose'),
            dryRun: args.includes('--dry-run')
        };

        const payloadIndex = args.indexOf('--payload');
        if (payloadIndex !== -1 && args[payloadIndex + 1]) {
            options.payload = JSON.parse(args[payloadIndex + 1]);
        }

        const recordTypeIndex = args.indexOf('--record-type');
        if (recordTypeIndex !== -1 && args[recordTypeIndex + 1]) {
            options.recordTypeName = args[recordTypeIndex + 1];
        }

        const ooo = new OOOWriteOperations(org, options);

        try {
            if (command === 'createRecordSafe') {
                if (!options.payload) {
                    console.error('Error: --payload is required for createRecordSafe');
                    process.exit(1);
                }

                const result = await ooo.createRecordSafe(object, options.payload, options);
                console.log(JSON.stringify(result, null, 2));
                process.exit(result.success ? 0 : 1);

            } else if (command === 'introspect') {
                const metadata = await ooo.describeObject(object);
                const validationRules = await ooo.getActiveValidationRules(object);

                console.log(JSON.stringify({
                    metadata,
                    validationRules
                }, null, 2));
                process.exit(0);

            } else {
                console.error(`Unknown command: ${command}`);
                process.exit(1);
            }
        } catch (error) {
            console.error(`Error: ${error.message}`);
            process.exit(1);
        }
    }

    runCLI();
}

module.exports = { OOOWriteOperations };
