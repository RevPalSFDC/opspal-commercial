#!/usr/bin/env node

const path = require('path');
const EnhancedMCPTool = require('../../mcp-extensions/tools/base/enhanced-mcp-tool');
const RecordTypeManager = require('./recordtype-manager');
const { API_VERSION } = require('../../config/apiVersion');

/**
 * PicklistRecordTypeValidator
 * ============================
 * Post-deployment validation for picklist values on record types.
 *
 * Purpose:
 * --------
 * After deploying picklist metadata, verify that values are actually accessible
 * on all record types. Salesforce has two metadata layers:
 * 1. Field metadata (defines values org-wide)
 * 2. Record Type metadata (controls accessibility)
 *
 * This tool validates #2 and can auto-fix discrepancies.
 *
 * @extends EnhancedMCPTool
 */
class PicklistRecordTypeValidator extends EnhancedMCPTool {
    constructor(options = {}) {
        super({
            name: 'PicklistRecordTypeValidator',
            version: '1.0.0',
            stage: options.stage || 'production',
            description: 'Validates picklist accessibility on record types',
            ...options
        });

        this.org = options.org || process.env.SF_TARGET_ORG;
        this.projectPath = options.projectPath || path.join(__dirname, '..', '..');
        this.recordTypeManager = new RecordTypeManager(options);
    }

    /**
     * Verify picklist values are accessible on specified record types.
     *
     * @param {Object} params - Configuration object
     * @param {string} params.objectName - Salesforce object API name
     * @param {string} params.fieldApiName - Picklist field API name
     * @param {string[]} params.expectedValues - Values that should be accessible
     * @param {string[]|string} [params.recordTypes='all'] - Record types to check
     * @param {string} [params.targetOrg] - Target org alias
     * @returns {Promise<Object>} Validation results with any discrepancies
     *
     * @example
     * const validator = new PicklistRecordTypeValidator({ org: 'myorg' });
     *
     * const result = await validator.verifyPicklistAvailability({
     *     objectName: 'Account',
     *     fieldApiName: 'Major_Territory__c',
     *     expectedValues: ['NE Majors', 'SE Majors'],
     *     recordTypes: 'all'
     * });
     *
     * if (!result.success) {
     *     console.log('Discrepancies found:', result.discrepancies);
     * }
     */
    async verifyPicklistAvailability(params) {
        this.validateParams(params, ['objectName', 'fieldApiName', 'expectedValues']);

        const {
            objectName,
            fieldApiName,
            expectedValues,
            recordTypes = 'all',
            targetOrg
        } = params;

        const alias = targetOrg || this.org;

        this.logOperation('picklist_validation_start', {
            objectName,
            fieldApiName,
            expectedValues
        });

        try {
            // Step 1: Get all active record types
            const allRecordTypes = await this.discoverRecordTypes(objectName, alias);
            const recordTypesToCheck = recordTypes === 'all'
                ? allRecordTypes
                : allRecordTypes.filter(rt => recordTypes.includes(rt.DeveloperName));

            if (recordTypesToCheck.length === 0) {
                throw new Error(`No active record types found for ${objectName}`);
            }

            // Step 2: Check each record type's picklist values
            const discrepancies = [];
            const checks = [];

            for (const recordType of recordTypesToCheck) {
                const check = await this.checkRecordTypePicklistValues(
                    objectName,
                    recordType,
                    fieldApiName,
                    expectedValues,
                    alias
                );

                checks.push(check);

                if (!check.success) {
                    discrepancies.push(check);
                }
            }

            const allPassed = discrepancies.length === 0;

            this.logOperation(allPassed ? 'picklist_validation_success' : 'picklist_validation_discrepancies', {
                objectName,
                fieldApiName,
                recordTypesChecked: recordTypesToCheck.length,
                discrepanciesFound: discrepancies.length
            });

            return {
                success: allPassed,
                objectName,
                fieldApiName,
                recordTypesChecked: recordTypesToCheck.length,
                allChecks: checks,
                discrepancies: discrepancies,
                message: allPassed
                    ? `All ${recordTypesToCheck.length} record types have expected values accessible`
                    : `${discrepancies.length} of ${recordTypesToCheck.length} record types have missing values`,
                auditTrail: this.getAuditTrail()
            };

        } catch (error) {
            this.logOperation('picklist_validation_error', {
                objectName,
                fieldApiName,
                error: error.message
            });
            throw this.enhanceError(error, {
                operation: 'verifyPicklistAvailability',
                objectName,
                fieldApiName
            });
        }
    }

    /**
     * Auto-fix record type picklist discrepancies.
     *
     * @param {Object} params - Configuration object
     * @param {Array} params.discrepancies - Discrepancies from verifyPicklistAvailability
     * @param {string} [params.targetOrg] - Target org alias
     * @returns {Promise<Object>} Fix results
     *
     * @example
     * const result = await validator.verifyPicklistAvailability({ ... });
     * if (!result.success) {
     *     await validator.autoFixRecordTypePicklists({
     *         discrepancies: result.discrepancies
     *     });
     * }
     */
    async autoFixRecordTypePicklists(params) {
        this.validateParams(params, ['discrepancies']);

        const { discrepancies, targetOrg } = params;
        const alias = targetOrg || this.org;

        this.logOperation('auto_fix_start', {
            discrepancyCount: discrepancies.length
        });

        const fixes = [];

        for (const discrepancy of discrepancies) {
            try {
                const fixResult = await this.recordTypeManager.updatePicklistValuesForRecordType({
                    objectName: discrepancy.objectName,
                    recordTypeName: discrepancy.recordTypeName,
                    fieldApiName: discrepancy.fieldApiName,
                    valuesToAdd: discrepancy.missingValues,
                    targetOrg: alias
                });

                fixes.push({
                    recordTypeName: discrepancy.recordTypeName,
                    success: true,
                    valuesAdded: fixResult.valuesAdded
                });

                this.logOperation('auto_fix_record_type_success', {
                    recordTypeName: discrepancy.recordTypeName,
                    valuesAdded: fixResult.valuesAdded.length
                });

            } catch (error) {
                fixes.push({
                    recordTypeName: discrepancy.recordTypeName,
                    success: false,
                    error: error.message
                });

                this.logOperation('auto_fix_record_type_error', {
                    recordTypeName: discrepancy.recordTypeName,
                    error: error.message
                });
            }
        }

        const allFixed = fixes.every(f => f.success);

        return {
            success: allFixed,
            fixes: fixes,
            message: allFixed
                ? `Successfully fixed all ${fixes.length} discrepancies`
                : `Fixed ${fixes.filter(f => f.success).length} of ${fixes.length} discrepancies`,
            auditTrail: this.getAuditTrail()
        };
    }

    /**
     * Check picklist values for a single record type.
     * @private
     */
    async checkRecordTypePicklistValues(objectName, recordType, fieldApiName, expectedValues, alias) {
        try {
            // Use UI API to get actual picklist values for this record type
            // Format: /services/data/vXX.0/ui-api/object-info/{objectName}/picklist-values/{recordTypeId}/{fieldApiName}
            const uiApiEndpoint = `/services/data/v${API_VERSION}/ui-api/object-info/${objectName}/picklist-values/${recordType.Id}/${fieldApiName}`;
            const command = `sf api request rest "${uiApiEndpoint}" --target-org ${alias} --json`;

            const result = await this.executeCommand(command);
            const parsed = this.parseJSON(result.stdout, { operation: 'getPicklistValues' });

            // Extract available values
            const availableValues = (parsed.result?.values || []).map(v => v.value);
            const missingValues = expectedValues.filter(v => !availableValues.includes(v));

            return {
                success: missingValues.length === 0,
                objectName,
                recordTypeName: recordType.DeveloperName,
                recordTypeId: recordType.Id,
                fieldApiName,
                expectedValues,
                availableValues,
                missingValues
            };

        } catch (error) {
            // If UI API fails, fall back to a warning (some fields may not be accessible via UI API)
            return {
                success: false,
                objectName,
                recordTypeName: recordType.DeveloperName,
                recordTypeId: recordType.Id,
                fieldApiName,
                error: `Unable to verify: ${error.message}`,
                expectedValues,
                availableValues: [],
                missingValues: expectedValues
            };
        }
    }

    /**
     * Discover all active record types for an object.
     * @private
     */
    async discoverRecordTypes(objectName, alias) {
        const query = `SELECT Id, DeveloperName, Name FROM RecordType WHERE SobjectType = '${objectName}' AND IsActive = true ORDER BY Name`;
        const command = `sf data query --query "${query}" --target-org ${alias} --json`;

        try {
            const result = await this.executeCommand(command);
            const parsed = this.parseJSON(result.stdout, { operation: 'discoverRecordTypes' });
            return parsed.result?.records || [];
        } catch (error) {
            throw this.enhanceError(new Error(`Failed to discover record types: ${error.message}`), {
                operation: 'discoverRecordTypes',
                objectName
            });
        }
    }

    /**
     * Convenience method: Verify and auto-fix in one call.
     *
     * @param {Object} params - Same as verifyPicklistAvailability
     * @param {boolean} [params.autoFix=false] - Automatically fix discrepancies
     * @returns {Promise<Object>} Combined verification and fix results
     *
     * @example
     * const result = await validator.verifyAndFix({
     *     objectName: 'Account',
     *     fieldApiName: 'Major_Territory__c',
     *     expectedValues: ['NE Majors', 'SE Majors'],
     *     recordTypes: 'all',
     *     autoFix: true
     * });
     */
    async verifyAndFix(params) {
        const { autoFix = false, ...verifyParams } = params;

        const verificationResult = await this.verifyPicklistAvailability(verifyParams);

        if (!verificationResult.success && autoFix) {
            const fixResult = await this.autoFixRecordTypePicklists({
                discrepancies: verificationResult.discrepancies,
                targetOrg: verifyParams.targetOrg
            });

            return {
                ...verificationResult,
                autoFixApplied: true,
                fixResult
            };
        }

        return {
            ...verificationResult,
            autoFixApplied: false
        };
    }
}

module.exports = PicklistRecordTypeValidator;

// CLI usage
if (require.main === module) {
    const validator = new PicklistRecordTypeValidator();

    const args = process.argv.slice(2);
    if (args.length === 0) {
        console.log(`
Usage: node picklist-recordtype-validator.js <command> [options]

Commands:
  verify     Verify picklist availability on record types
  fix        Auto-fix missing picklist values
  verify-fix Verify and auto-fix in one command

Options:
  --object <name>        Object API name (required)
  --field <name>         Field API name (required)
  --values <v1,v2,...>   Expected values (required)
  --record-types <r1,r2> Record types to check (default: all)
  --org <alias>          Target org alias
  --auto-fix             Auto-fix discrepancies (for verify command)

Examples:
  node picklist-recordtype-validator.js verify \\
    --object Account \\
    --field Major_Territory__c \\
    --values "NE Majors,SE Majors" \\
    --org peregrine-main

  node picklist-recordtype-validator.js verify-fix \\
    --object Account \\
    --field Major_Territory__c \\
    --values "NE Majors,SE Majors" \\
    --org peregrine-main \\
    --auto-fix
        `);
        process.exit(0);
    }

    const command = args[0];
    const options = {};

    for (let i = 1; i < args.length; i += 2) {
        const key = args[i].replace(/^--/, '');
        const value = args[i + 1];
        options[key] = value;
    }

    (async () => {
        try {
            if (command === 'verify' || command === 'verify-fix') {
                const result = await validator.verifyAndFix({
                    objectName: options.object,
                    fieldApiName: options.field,
                    expectedValues: options.values.split(',').map(v => v.trim()),
                    recordTypes: options['record-types'] ? options['record-types'].split(',') : 'all',
                    targetOrg: options.org,
                    autoFix: options['auto-fix'] === 'true' || command === 'verify-fix'
                });

                console.log(JSON.stringify(result, null, 2));
                process.exit(result.success ? 0 : 1);
            }
        } catch (error) {
            console.error('Error:', error.message);
            process.exit(1);
        }
    })();
}
