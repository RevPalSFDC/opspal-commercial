#!/usr/bin/env node

const path = require('path');
const fs = require('fs');
const xml2js = require('xml2js');
const PicklistManager = require('./picklist-manager');
const RecordTypeManager = require('./recordtype-manager');
const {
    createTempDir,
    ensureProjectScaffold,
    firstLine,
    projectDeployWithPoll,
    stageFile,
    writeManifest
} = require('./utils/mcp-helpers');
const { API_VERSION } = require('../../config/apiVersion');

/**
 * UnifiedPicklistManager
 * =======================
 * Manages picklist modifications across BOTH field metadata AND record type metadata.
 *
 * The Problem:
 * ------------
 * Salesforce picklist modifications require TWO separate metadata operations:
 * 1. Field metadata - Defines picklist values org-wide
 * 2. Record Type metadata - Makes values selectable on each record type
 *
 * This class handles both operations atomically to ensure picklist values are
 * accessible on all record types after deployment.
 *
 * Instance-Agnostic:
 * ------------------
 * - Auto-discovers all active record types
 * - Works on any Salesforce org
 * - No hardcoded record type names
 *
 * @extends PicklistManager
 */
class UnifiedPicklistManager extends PicklistManager {
    constructor(options = {}) {
        super(options);
        this.recordTypeManager = new RecordTypeManager(options);
        this.parser = new xml2js.Parser();
        this.builder = new xml2js.Builder({
            xmldec: { version: '1.0', encoding: 'UTF-8' },
            renderOpts: { pretty: true, indent: '    ', newline: '\n' }
        });
    }

    /**
     * Update picklist field AND all associated record types in a single atomic operation.
     *
     * @param {Object} params - Configuration object
     * @param {string} params.objectName - Salesforce object API name (e.g., 'Account')
     * @param {string} params.fieldApiName - Field API name (e.g., 'Major_Territory__c')
     * @param {string[]} [params.valuesToAdd=[]] - Picklist values to add
     * @param {string[]} [params.valuesToDeactivate=[]] - Picklist values to deactivate (not delete)
     * @param {string[]|string} [params.recordTypes='all'] - Record types to update ('all' or array of names)
     * @param {string} [params.targetOrg] - Target Salesforce org alias
     * @param {string} [params.apiVersion] - Salesforce API version
     * @returns {Promise<Object>} Result with deployment details and audit trail
     *
     * @example
     * const manager = new UnifiedPicklistManager({ org: 'peregrine-main' });
     *
     * await manager.updatePicklistAcrossRecordTypes({
     *     objectName: 'Account',
     *     fieldApiName: 'Major_Territory__c',
     *     valuesToAdd: ['NE Majors', 'SE Majors'],
     *     valuesToDeactivate: ['East Major'],
     *     recordTypes: 'all'
     * });
     */
    async updatePicklistAcrossRecordTypes(params) {
        this.validateParams(params, ['objectName', 'fieldApiName']);

        const {
            objectName,
            fieldApiName,
            valuesToAdd = [],
            valuesToDeactivate = [],
            recordTypes = 'all',
            targetOrg,
            apiVersion = API_VERSION
        } = params;

        const alias = targetOrg || this.org;

        this.logOperation('unified_picklist_update_start', {
            objectName,
            fieldApiName,
            valuesToAdd,
            valuesToDeactivate
        });

        try {
            // Step 1: Discover record types
            const activeRecordTypes = await this.discoverRecordTypes(objectName, alias);

            if (activeRecordTypes.length === 0) {
                throw this.enhanceError(new Error(`No active record types found for ${objectName}`), {
                    operation: 'updatePicklistAcrossRecordTypes',
                    objectName
                });
            }

            const recordTypesToUpdate = recordTypes === 'all'
                ? activeRecordTypes.map(rt => rt.DeveloperName)
                : recordTypes;

            this.logOperation('recordtypes_discovered', {
                count: activeRecordTypes.length,
                updating: recordTypesToUpdate.length
            });

            // Step 2: Update field metadata
            await this.updateFieldMetadata(objectName, fieldApiName, valuesToAdd, valuesToDeactivate, alias, apiVersion);

            // Step 3: Update record type metadata
            const recordTypeResults = await this.updateRecordTypeMetadata(
                objectName,
                fieldApiName,
                recordTypesToUpdate,
                valuesToAdd,
                valuesToDeactivate,
                alias,
                apiVersion
            );

            // Step 4: Deploy everything together
            const deployResult = await this.deployAtomicUpdate(
                objectName,
                fieldApiName,
                recordTypesToUpdate,
                alias,
                apiVersion
            );

            // Step 5: Post-deployment verification (optional but recommended)
            const verificationResult = await this.verifyDeployment(
                objectName,
                fieldApiName,
                valuesToAdd,
                recordTypesToUpdate,
                alias
            );

            this.logOperation('unified_picklist_update_success', {
                objectName,
                fieldApiName,
                recordTypesUpdated: recordTypesToUpdate.length,
                valuesAdded: valuesToAdd.length,
                valuesDeactivated: valuesToDeactivate.length
            });

            return {
                success: true,
                objectName,
                fieldApiName,
                recordTypesUpdated: recordTypesToUpdate,
                valuesAdded: valuesToAdd,
                valuesDeactivated: valuesToDeactivate,
                deploymentId: deployResult.deploymentId,
                verification: verificationResult,
                auditTrail: this.getAuditTrail()
            };

        } catch (error) {
            this.logOperation('unified_picklist_update_error', {
                objectName,
                fieldApiName,
                error: error.message
            });
            throw this.enhanceError(error, {
                operation: 'updatePicklistAcrossRecordTypes',
                objectName,
                fieldApiName
            });
        }
    }

    /**
     * Discover all active record types for an object.
     * Instance-agnostic - works on any org.
     *
     * @param {string} objectName - Salesforce object API name
     * @param {string} alias - Org alias
     * @returns {Promise<Array>} Array of record type objects with Id, DeveloperName, Name
     * @private
     */
    async discoverRecordTypes(objectName, alias) {
        const query = `SELECT Id, DeveloperName, Name FROM RecordType WHERE SobjectType = '${objectName}' AND IsActive = true ORDER BY Name`;
        const command = `sf data query --query "${query}" --target-org ${alias} --json`;

        try {
            const result = await this.executeCommand(command);
            const parsed = this.parseJSON(result.stdout, { operation: 'discoverRecordTypes', objectName });
            return parsed.result?.records || [];
        } catch (error) {
            throw this.enhanceError(new Error(`Failed to discover record types for ${objectName}: ${firstLine(error.message)}`), {
                operation: 'discoverRecordTypes',
                objectName
            });
        }
    }

    /**
     * Update field metadata with new/deactivated values.
     *
     * @private
     */
    async updateFieldMetadata(objectName, fieldApiName, valuesToAdd, valuesToDeactivate, alias, apiVersion) {
        const fieldState = await this.loadFieldMetadata(objectName, fieldApiName, alias, apiVersion);
        const definition = this.ensureValueSetDefinition(fieldState.doc);

        // Add new values
        const existingValues = new Set((definition.value || []).map(entry => entry.fullName?.[0]));
        valuesToAdd.forEach(value => {
            if (!existingValues.has(value)) {
                definition.value = definition.value || [];
                definition.value.push({
                    fullName: [value],
                    default: ['false'],
                    label: [value],
                    isActive: ['true']
                });
            }
        });

        // Deactivate values (keep them for historical records)
        const deactivateSet = new Set(valuesToDeactivate.map(v => v.toLowerCase()));
        (definition.value || []).forEach(entry => {
            if (deactivateSet.has((entry.fullName?.[0] || '').toLowerCase())) {
                entry.isActive = ['false'];
            }
        });

        await this.writeFieldMetadata(fieldState.path, fieldState.doc);

        this.logOperation('field_metadata_updated', { objectName, fieldApiName });
    }

    /**
     * Update record type metadata for all specified record types.
     *
     * @private
     */
    async updateRecordTypeMetadata(objectName, fieldApiName, recordTypeNames, valuesToAdd, valuesToDeactivate, alias, apiVersion) {
        const results = [];

        for (const recordTypeName of recordTypeNames) {
            try {
                const recordTypePath = await this.retrieveRecordTypeMetadata(objectName, recordTypeName, alias, apiVersion);
                const recordTypeXml = await fs.promises.readFile(recordTypePath, 'utf8');
                const recordTypeDoc = await this.parser.parseStringPromise(recordTypeXml);

                // Ensure picklistValues array exists
                recordTypeDoc.RecordType = recordTypeDoc.RecordType || {};
                recordTypeDoc.RecordType.picklistValues = recordTypeDoc.RecordType.picklistValues || [];

                if (!Array.isArray(recordTypeDoc.RecordType.picklistValues)) {
                    recordTypeDoc.RecordType.picklistValues = [recordTypeDoc.RecordType.picklistValues];
                }

                // Find or create picklistValues entry for this field
                let fieldPicklistEntry = recordTypeDoc.RecordType.picklistValues.find(
                    pv => pv.picklist?.[0] === fieldApiName
                );

                if (!fieldPicklistEntry) {
                    fieldPicklistEntry = {
                        picklist: [fieldApiName],
                        values: []
                    };
                    recordTypeDoc.RecordType.picklistValues.push(fieldPicklistEntry);
                }

                // Ensure values is an array
                if (!Array.isArray(fieldPicklistEntry.values)) {
                    fieldPicklistEntry.values = fieldPicklistEntry.values ? [fieldPicklistEntry.values] : [];
                }

                // Add new values
                const existingValueNames = new Set(
                    fieldPicklistEntry.values.map(v => v.fullName?.[0]).filter(Boolean)
                );

                valuesToAdd.forEach(value => {
                    if (!existingValueNames.has(value)) {
                        fieldPicklistEntry.values.push({
                            fullName: [value],
                            default: ['false']
                        });
                    }
                });

                // Note: We don't remove deactivated values from record types
                // They remain in the XML for historical records but will be inactive in field metadata

                // Write updated record type metadata
                const updatedXml = this.builder.buildObject(recordTypeDoc);
                await fs.promises.writeFile(recordTypePath, updatedXml, 'utf8');

                results.push({ recordTypeName, success: true });
                this.logOperation('recordtype_metadata_updated', { objectName, recordTypeName, fieldApiName });

            } catch (error) {
                results.push({
                    recordTypeName,
                    success: false,
                    error: firstLine(error.message)
                });
                this.logOperation('recordtype_metadata_update_error', {
                    objectName,
                    recordTypeName,
                    error: error.message
                });
            }
        }

        return results;
    }

    /**
     * Retrieve record type metadata file.
     *
     * @private
     */
    async retrieveRecordTypeMetadata(objectName, recordTypeName, alias, apiVersion) {
        const localPath = path.join(
            this.projectPath,
            'force-app',
            'main',
            'default',
            'objects',
            objectName,
            'recordTypes',
            `${recordTypeName}.recordType-meta.xml`
        );

        if (!fs.existsSync(localPath)) {
            const command = `sf project retrieve start --metadata RecordType:${objectName}.${recordTypeName} --target-org ${alias} --api-version ${apiVersion} --output-dir "${this.projectPath}" --json`;
            try {
                const result = await this.executeCommand(command);
                this.parseJSON(result.stdout, { operation: 'retrieveRecordType', objectName, recordTypeName });
            } catch (error) {
                throw this.enhanceError(
                    new Error(`Unable to retrieve record type ${objectName}.${recordTypeName}: ${firstLine(error.stderr || error.message)}`),
                    { operation: 'retrieveRecordTypeMetadata', objectName, recordTypeName }
                );
            }
        }

        return localPath;
    }

    /**
     * Deploy field + all record types atomically.
     *
     * @private
     */
    async deployAtomicUpdate(objectName, fieldApiName, recordTypeNames, alias, apiVersion) {
        const tempRoot = await createTempDir('unified-picklist', this.projectPath);
        await ensureProjectScaffold(tempRoot, apiVersion);

        // Stage field metadata
        const relativeField = path.join('force-app', 'main', 'default', 'objects', objectName, 'fields', `${fieldApiName}.field-meta.xml`);
        await stageFile(path.join(this.projectPath, relativeField), tempRoot, relativeField);

        // Stage all record type metadata files
        for (const recordTypeName of recordTypeNames) {
            const relativeRecordType = path.join('force-app', 'main', 'default', 'objects', objectName, 'recordTypes', `${recordTypeName}.recordType-meta.xml`);
            const recordTypePath = path.join(this.projectPath, relativeRecordType);

            if (fs.existsSync(recordTypePath)) {
                await stageFile(recordTypePath, tempRoot, relativeRecordType);
            }
        }

        // Stage object metadata if exists
        const objectMetaPath = path.join(this.projectPath, 'force-app', 'main', 'default', 'objects', objectName, `${objectName}.object-meta.xml`);
        const manifestMembers = {
            CustomField: [`${objectName}.${fieldApiName}`],
            RecordType: recordTypeNames.map(name => `${objectName}.${name}`)
        };

        if (fs.existsSync(objectMetaPath)) {
            await stageFile(objectMetaPath, tempRoot, path.join('force-app', 'main', 'default', 'objects', objectName, `${objectName}.object-meta.xml`));
            manifestMembers.CustomObject = [objectName];
        }

        const manifestPath = await writeManifest(tempRoot, manifestMembers, apiVersion);

        try {
            const deployResult = await projectDeployWithPoll(this, {
                projectDir: tempRoot,
                manifestPath,
                alias,
                apiVersion
            });

            return {
                success: true,
                deploymentId: deployResult?.id || 'unknown'
            };
        } catch (error) {
            throw this.enhanceError(error, {
                operation: 'deployAtomicUpdate',
                objectName,
                fieldApiName,
                recordTypeCount: recordTypeNames.length
            });
        }
    }

    /**
     * Verify deployment was successful by checking picklist availability.
     *
     * @private
     */
    async verifyDeployment(objectName, fieldApiName, expectedValues, recordTypeNames, alias) {
        // Basic verification - check field exists and has values
        try {
            const describeCommand = `sf sobject describe --sobject ${objectName} --target-org ${alias} --json`;
            const result = await this.executeCommand(describeCommand);
            const parsed = this.parseJSON(result.stdout, { operation: 'verifyDeployment' });

            const field = parsed.result?.fields?.find(f => f.name === fieldApiName);
            if (!field) {
                return {
                    success: false,
                    message: `Field ${fieldApiName} not found after deployment`
                };
            }

            const actualValues = (field.picklistValues || []).map(pv => pv.value);
            const missingValues = expectedValues.filter(v => !actualValues.includes(v));

            if (missingValues.length > 0) {
                return {
                    success: false,
                    message: `Missing expected values: ${missingValues.join(', ')}`,
                    missingValues
                };
            }

            return {
                success: true,
                message: 'All expected values present in field metadata',
                recordTypesUpdated: recordTypeNames.length
            };

        } catch (error) {
            return {
                success: false,
                message: `Verification failed: ${firstLine(error.message)}`,
                error: error.message
            };
        }
    }
}

module.exports = UnifiedPicklistManager;
