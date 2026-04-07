#!/usr/bin/env node

const path = require('path');
const fs = require('fs');
const xml2js = require('xml2js');
const EnhancedMCPTool = require('../../mcp-extensions/tools/base/enhanced-mcp-tool');
const { firstLine, withTimeout } = require('./utils/mcp-helpers');
const { API_VERSION } = require('../../config/apiVersion');

/**
 * RecordTypeManager
 * =================
 * Utility for creating record types and managing profile visibility/defaults.
 */
class RecordTypeManager extends EnhancedMCPTool {
    constructor(options = {}) {
        super({
            name: 'RecordTypeManager',
            version: '1.0.0',
            stage: options.stage || 'production',
            description: 'Salesforce record type management toolkit',
            ...options
        });

        this.org = options.org || process.env.SF_TARGET_ORG;
        this.projectPath = options.projectPath || path.join(__dirname, '..', '..');
        this.parser = new xml2js.Parser();
        this.builder = new xml2js.Builder({
            xmldec: { version: '1.0', encoding: 'UTF-8' },
            renderOpts: { pretty: true, indent: '    ', newline: '\n' }
        });
    }

    /**
     * Create a record type on an object via metadata deploy.
     */
    async createRecordType(params) {
        this.validateParams(params, ['objectName', 'developerName', 'label']);

        const {
            objectName,
            developerName,
            label,
            description = '',
            active = true,
            businessProcess,
            picklistSettings = [],
            skipProfileAssignment = false
        } = params;

        this.logOperation('recordtype_create_start', { objectName, developerName, businessProcess });

        try {
            const tempRoot = await this.createTempDir('recordtype-create');
            const objectDir = path.join(tempRoot, 'force-app', 'main', 'default', 'objects', objectName);
            const recordTypeDir = path.join(objectDir, 'recordTypes');
            await fs.promises.mkdir(recordTypeDir, { recursive: true });

            const recordTypeXmlPath = path.join(recordTypeDir, `${developerName}.recordType-meta.xml`);
            const recordTypeXml = this.buildRecordTypeXml({
                developerName,
                label,
                description,
                active,
                businessProcess,
                picklistSettings
            });
            await fs.promises.writeFile(recordTypeXmlPath, recordTypeXml, 'utf8');

            const command = `sf project deploy start --source-dir "${path.join(tempRoot, 'force-app')}"${this.org ? ` --target-org ${this.org}` : ''} --json`;
            const result = await this.executeCommand(command);

            this.logOperation('recordtype_create_success', { objectName, developerName });

            // Auto-assign to System Administrator profile to prevent INVALID_CROSS_REFERENCE_KEY errors
            if (!skipProfileAssignment) {
                try {
                    this.logOperation('recordtype_auto_assign_start', { objectName, developerName });
                    await this.assignRecordTypeToProfiles({
                        objectName,
                        developerName,
                        profileNames: ['Admin', 'System Administrator'],
                        makeDefault: false,
                        targetOrg: this.org
                    });
                    this.logOperation('recordtype_auto_assign_success', { objectName, developerName });
                } catch (assignError) {
                    // Log but don't fail the overall creation — profile assignment is best-effort
                    this.logOperation('recordtype_auto_assign_warning', {
                        objectName,
                        developerName,
                        error: assignError.message
                    });
                }
            }

            return {
                success: true,
                output: this.parseJSON(result.stdout, { operation: 'createRecordType' }),
                error: result.stderr,
                filePath: recordTypeXmlPath,
                auditTrail: this.getAuditTrail()
            };
        } catch (error) {
            this.logOperation('recordtype_create_error', { objectName, developerName, error: error.message });
            throw this.enhanceError(error, { operation: 'createRecordType', params });
        }
    }

    /**
     * Ensure profiles have visibility to a record type and optionally set default.
     */
    async assignRecordTypeToProfiles(params) {
        this.validateParams(params, ['objectName', 'developerName', 'profileNames']);

        const {
            objectName,
            developerName,
            profileNames,
            makeDefault = false,
            targetOrg
        } = params;

        const org = targetOrg || this.org;
        const recordTypeFullName = `${objectName}.${developerName}`;
        const results = [];

        this.logOperation('recordtype_assign_start', {
            objectName,
            developerName,
            profiles: profileNames,
            makeDefault
        });

        const successfulProfiles = [];

        for (const profileName of profileNames) {
            try {
                const profilePath = await this.ensureProfileMetadata(profileName, org);
                const profileXml = await fs.promises.readFile(profilePath, 'utf8');
                const profileObj = await this.parser.parseStringPromise(profileXml);

                profileObj.Profile.recordTypeVisibilities = profileObj.Profile.recordTypeVisibilities || [];
                if (!Array.isArray(profileObj.Profile.recordTypeVisibilities)) {
                    profileObj.Profile.recordTypeVisibilities = [profileObj.Profile.recordTypeVisibilities];
                }

                profileObj.Profile.recordTypeVisibilities = profileObj.Profile.recordTypeVisibilities.filter(rt =>
                    rt.recordType?.[0] !== recordTypeFullName
                );

                if (makeDefault) {
                    profileObj.Profile.recordTypeVisibilities.forEach(rt => {
                        if (rt.recordType?.[0]?.startsWith(`${objectName}.`)) {
                            rt.default = ['false'];
                        }
                    });
                }

                profileObj.Profile.recordTypeVisibilities.push({
                    recordType: [recordTypeFullName],
                    visible: ['true'],
                    default: [makeDefault ? 'true' : 'false']
                });

                const updatedXml = this.builder.buildObject(profileObj);
                await fs.promises.writeFile(profilePath, updatedXml, 'utf8');

                results.push({
                    profileName,
                    success: true,
                    output: null
                });
                successfulProfiles.push(profileName);
            } catch (error) {
                results.push({
                    profileName,
                    success: false,
                    error: firstLine(error.message)
                });
                this.logOperation('recordtype_assign_error', { profileName, error: error.message });
            }
        }

        if (successfulProfiles.length > 0) {
            const metadataParam = successfulProfiles.map(name => `Profile:"${name}"`).join(',');
            const deployCommand = `sf project deploy start --metadata ${metadataParam} --target-org ${org} --api-version ${API_VERSION} --json`;
            const deployResult = await withTimeout(() => this.executeCommand(deployCommand), 60000, 'deploy record type assignments');
            const parsed = this.parseJSON(deployResult.stdout, { operation: 'assignRecordTypeBatch' });
            results.forEach(entry => {
                if (entry.success) {
                    entry.output = parsed;
                }
            });
        }

        const overallSuccess = results.every(r => r.success);
        this.logOperation(overallSuccess ? 'recordtype_assign_success' : 'recordtype_assign_partial', {
            objectName,
            developerName,
            successCount: results.filter(r => r.success).length,
            failureCount: results.filter(r => !r.success).length
        });

        return {
            success: overallSuccess,
            results,
            auditTrail: this.getAuditTrail()
        };
    }

    /**
     * Convenience helper to set default record type for a single profile.
     */
    async setDefaultRecordType(params) {
        this.validateParams(params, ['objectName', 'developerName', 'profileName']);

        const { objectName, developerName, profileName, targetOrg } = params;

        return await this.assignRecordTypeToProfiles({
            objectName,
            developerName,
            profileNames: [profileName],
            makeDefault: true,
            targetOrg
        });
    }

    buildRecordTypeXml({ developerName, label, description, active, businessProcess, picklistSettings }) {
        const picklistXml = Array.isArray(picklistSettings) && picklistSettings.length > 0
            ? picklistSettings.map(setting => `    <picklistValues>
        <picklist>${setting.picklist}</picklist>
        <values>
            <fullName>${setting.value}</fullName>
            <default>${setting.default || false}</default>
        </values>
    </picklistValues>`).join('\n')
            : '';

        return `<?xml version="1.0" encoding="UTF-8"?>
<RecordType xmlns="http://soap.sforce.com/2006/04/metadata">
    <active>${active}</active>
    ${businessProcess ? `<businessProcess>${businessProcess}</businessProcess>` : ''}
    <description>${description}</description>
    <label>${label}</label>
    <fullName>${developerName}</fullName>
${picklistXml}
</RecordType>`;
    }

    async ensureProfileMetadata(profileName, targetOrg) {
        const metadataProfileName = this.normalizeProfileName(profileName);
        const profilePath = path.join(
            this.projectPath,
            'force-app',
            'main',
            'default',
            'profiles',
            `${metadataProfileName}.profile-meta.xml`
        );

        if (fs.existsSync(profilePath)) {
            return profilePath;
        }

        const primaryRetrieve = await this.retrieveProfileMetadata(this.normalizeProfileName(profileName), targetOrg);
        const resolvedPrimary = await this.resolveProfilePath(primaryRetrieve);
        if (resolvedPrimary) {
            return resolvedPrimary;
        }

        const altRetrieve = await this.retrieveProfileMetadata(profileName, targetOrg);
        const resolvedAlt = await this.resolveProfilePath(altRetrieve);
        if (resolvedAlt) {
            return resolvedAlt;
        }

        const profilesDir = path.join(this.projectPath, 'force-app', 'main', 'default', 'profiles');
        try {
            const files = await fs.promises.readdir(profilesDir);
            const normalizedTarget = profileName.replace(/\s+/g, '').toLowerCase();
            const found = files.find(file => file.toLowerCase() === `${normalizedTarget}.profile-meta.xml`);
            if (found) {
                return path.join(profilesDir, found);
            }
        } catch (error) {
            if (error.code !== 'ENOENT') {
                throw error;
            }
        }

        throw new Error(`Profile metadata not found for ${profileName}`);
    }

    async createTempDir(label) {
        const tempPath = path.join(this.projectPath, '.mcp-temp', `${label}-${Date.now()}`);
        await fs.promises.mkdir(tempPath, { recursive: true });
        return tempPath;
    }

    normalizeProfileName(profileName) {
        return profileName.replace(/\s+/g, '');
    }

    async retrieveProfileMetadata(memberName, targetOrg) {
        const command = `sf project retrieve start --metadata Profile:"${memberName}" --target-org ${targetOrg} --api-version ${API_VERSION} --json`;

        try {
            const result = await withTimeout(() => this.executeCommand(command), 60000, `retrieve profile ${memberName}`);
            return this.parseJSON(result.stdout, { operation: 'retrieveProfile', profileName: memberName });
        } catch (error) {
            this.logOperation('profile_retrieve_warning', {
                profileName: memberName,
                message: firstLine(error.originalError?.stderr || error.stderr || error.message)
            });
            return null;
        }
    }

    async resolveProfilePath(parsedResult) {
        if (!parsedResult || !parsedResult.result || !Array.isArray(parsedResult.result.files)) {
            return null;
        }

        for (const file of parsedResult.result.files) {
            if (!file.filePath) {
                continue;
            }

            const absolutePath = path.isAbsolute(file.filePath)
                ? file.filePath
                : path.join(this.projectPath, file.filePath);

            if (fs.existsSync(absolutePath)) {
                return absolutePath;
            }
        }

        return null;
    }

    /**
     * Update picklist values for a specific record type.
     * Allows adding new values or deactivating existing ones.
     *
     * @param {Object} params - Configuration object
     * @param {string} params.objectName - Salesforce object API name
     * @param {string} params.recordTypeName - Record type developer name
     * @param {string} params.fieldApiName - Picklist field API name
     * @param {string[]} [params.valuesToAdd=[]] - Values to add to the record type
     * @param {string[]} [params.valuesToDeactivate=[]] - Values to deactivate (not used yet, kept for future)
     * @param {string} [params.targetOrg] - Target org alias
     * @returns {Promise<Object>} Result with success status and updated metadata
     *
     * @example
     * const manager = new RecordTypeManager({ org: 'myorg' });
     *
     * await manager.updatePicklistValuesForRecordType({
     *     objectName: 'Account',
     *     recordTypeName: 'Prospect',
     *     fieldApiName: 'Major_Territory__c',
     *     valuesToAdd: ['NE Majors', 'SE Majors']
     * });
     */
    async updatePicklistValuesForRecordType(params) {
        this.validateParams(params, ['objectName', 'recordTypeName', 'fieldApiName']);

        const {
            objectName,
            recordTypeName,
            fieldApiName,
            valuesToAdd = [],
            valuesToDeactivate = [],
            targetOrg
        } = params;

        const org = targetOrg || this.org;

        this.logOperation('recordtype_picklist_update_start', {
            objectName,
            recordTypeName,
            fieldApiName,
            valuesToAdd
        });

        try {
            // Retrieve record type metadata
            const recordTypePath = await this.retrieveRecordTypeMetadata(objectName, recordTypeName, org);
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

            const actuallyAdded = [];
            valuesToAdd.forEach(value => {
                if (!existingValueNames.has(value)) {
                    fieldPicklistEntry.values.push({
                        fullName: [value],
                        default: ['false']
                    });
                    actuallyAdded.push(value);
                }
            });

            // Write updated record type metadata
            const updatedXml = this.builder.buildObject(recordTypeDoc);
            await fs.promises.writeFile(recordTypePath, updatedXml, 'utf8');

            this.logOperation('recordtype_picklist_update_success', {
                objectName,
                recordTypeName,
                fieldApiName,
                valuesAdded: actuallyAdded.length
            });

            return {
                success: true,
                objectName,
                recordTypeName,
                fieldApiName,
                valuesAdded: actuallyAdded,
                recordTypePath,
                auditTrail: this.getAuditTrail()
            };

        } catch (error) {
            this.logOperation('recordtype_picklist_update_error', {
                objectName,
                recordTypeName,
                fieldApiName,
                error: error.message
            });
            throw this.enhanceError(error, {
                operation: 'updatePicklistValuesForRecordType',
                params
            });
        }
    }

    /**
     * Retrieve record type metadata file (helper method).
     * @private
     */
    async retrieveRecordTypeMetadata(objectName, recordTypeName, targetOrg) {
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
            const command = `sf project retrieve start --metadata RecordType:${objectName}.${recordTypeName} --target-org ${targetOrg} --api-version ${API_VERSION} --output-dir "${this.projectPath}" --json`;
            try {
                const result = await this.executeCommand(command);
                this.parseJSON(result.stdout, { operation: 'retrieveRecordType', objectName, recordTypeName });
            } catch (error) {
                throw new Error(`Unable to retrieve record type ${objectName}.${recordTypeName}: ${firstLine(error.stderr || error.message)}`);
            }
        }

        return localPath;
    }
}

module.exports = RecordTypeManager;
