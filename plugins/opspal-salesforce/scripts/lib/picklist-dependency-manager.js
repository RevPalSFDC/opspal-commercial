#!/usr/bin/env node

const path = require('path');
const fs = require('fs');
const xml2js = require('xml2js');
const UnifiedPicklistManager = require('./unified-picklist-manager');
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
 * PicklistDependencyManager
 * =========================
 * Manages picklist field dependencies (controlling/dependent relationships) with
 * complete valueSettings mapping and record type enablement.
 *
 * Capabilities:
 * - Create new controlling/dependent field relationships
 * - Modify existing dependency matrices (valueSettings)
 * - Validate dependency configurations before deployment
 * - Generate CustomField XML with dependency metadata
 * - Deploy dependencies atomically (field + record types + dependencies)
 * - Support both field-specific and Global Value Set picklists
 *
 * Based on Salesforce Picklist Field Dependencies Playbook
 *
 * @extends UnifiedPicklistManager
 */
class PicklistDependencyManager extends UnifiedPicklistManager {
    constructor(options = {}) {
        super({
            ...options,
            name: 'PicklistDependencyManager',
            version: '1.0.0'
        });

        this.parser = new xml2js.Parser();
        this.builder = new xml2js.Builder({
            xmldec: { version: '1.0', encoding: 'UTF-8' },
            renderOpts: { pretty: true, indent: '    ', newline: '\n' }
        });
    }

    /**
     * Create a new controlling/dependent field relationship.
     *
     * This implements Step 4 of the playbook:
     * "Create/update the dependent picklist field with dependency"
     *
     * @param {Object} params - Configuration object
     * @param {string} params.objectName - Salesforce object API name (e.g., 'Account')
     * @param {string} params.controllingFieldApiName - Controlling field API name
     * @param {string} params.dependentFieldApiName - Dependent field API name
     * @param {Object} params.dependencyMatrix - Dependency mapping
     *   Format: { 'ControllingValue1': ['DependentValue1', 'DependentValue2'], ... }
     * @param {string[]} [params.recordTypes='all'] - Record types to update
     * @param {string} [params.targetOrg] - Target Salesforce org alias
     * @param {string} [params.apiVersion] - Salesforce API version
     * @param {boolean} [params.validateBeforeDeploy=true] - Run validation before deployment
     *
     * @returns {Promise<Object>} Result with deployment details
     *
     * @example
     * const manager = new PicklistDependencyManager({ org: 'myorg' });
     *
     * await manager.createDependency({
     *     objectName: 'Account',
     *     controllingFieldApiName: 'Industry',
     *     dependentFieldApiName: 'Account_Type__c',
     *     dependencyMatrix: {
     *         'Technology': ['SaaS', 'Hardware', 'Services'],
     *         'Finance': ['Banking', 'Insurance', 'Investment']
     *     },
     *     recordTypes: 'all'
     * });
     */
    async createDependency(params) {
        this.validateParams(params, [
            'objectName',
            'controllingFieldApiName',
            'dependentFieldApiName',
            'dependencyMatrix'
        ]);

        const {
            objectName,
            controllingFieldApiName,
            dependentFieldApiName,
            dependencyMatrix,
            recordTypes = 'all',
            targetOrg,
            apiVersion = API_VERSION,
            validateBeforeDeploy = true
        } = params;

        const alias = targetOrg || this.org;

        this.logOperation('create_dependency_start', {
            objectName,
            controllingField: controllingFieldApiName,
            dependentField: dependentFieldApiName
        });

        try {
            // Step 1: Validate dependency matrix if requested
            if (validateBeforeDeploy) {
                this.logOperation('validating_dependency_matrix', { objectName });
                const validation = await this.validateDependencyMatrix({
                    objectName,
                    controllingFieldApiName,
                    dependentFieldApiName,
                    dependencyMatrix,
                    targetOrg: alias
                });

                if (!validation.valid) {
                    throw this.enhanceError(
                        new Error(`Dependency matrix validation failed: ${validation.errors.join(', ')}`),
                        { operation: 'createDependency', validation }
                    );
                }
            }

            // Step 2: Discover record types
            const activeRecordTypes = await this.discoverRecordTypes(objectName, alias);
            const recordTypesToUpdate = recordTypes === 'all'
                ? activeRecordTypes.map(rt => rt.DeveloperName)
                : recordTypes;

            this.logOperation('recordtypes_discovered', {
                count: activeRecordTypes.length,
                updating: recordTypesToUpdate.length
            });

            // Step 3: Update dependent field metadata with controlling field reference
            await this.updateDependentFieldMetadata(
                objectName,
                controllingFieldApiName,
                dependentFieldApiName,
                dependencyMatrix,
                alias,
                apiVersion
            );

            // Step 4: Update record type metadata for both fields
            await this.updateRecordTypeMetadata(
                objectName,
                dependentFieldApiName,
                recordTypesToUpdate,
                Object.values(dependencyMatrix).flat(),
                [],
                alias,
                apiVersion
            );

            // Step 5: Deploy everything atomically
            const deployResult = await this.deployDependency(
                objectName,
                controllingFieldApiName,
                dependentFieldApiName,
                recordTypesToUpdate,
                alias,
                apiVersion
            );

            // Step 6: Post-deployment verification
            const verificationResult = await this.verifyDependencyDeployment(
                objectName,
                controllingFieldApiName,
                dependentFieldApiName,
                dependencyMatrix,
                alias
            );

            this.logOperation('create_dependency_success', {
                objectName,
                controllingField: controllingFieldApiName,
                dependentField: dependentFieldApiName,
                recordTypesUpdated: recordTypesToUpdate.length
            });

            return {
                success: true,
                objectName,
                controllingField: controllingFieldApiName,
                dependentField: dependentFieldApiName,
                dependencyMatrix,
                recordTypesUpdated: recordTypesToUpdate,
                deploymentId: deployResult.deploymentId,
                verification: verificationResult,
                auditTrail: this.getAuditTrail()
            };

        } catch (error) {
            this.logOperation('create_dependency_error', {
                objectName,
                error: error.message
            });
            throw this.enhanceError(error, {
                operation: 'createDependency',
                objectName,
                controllingField: controllingFieldApiName,
                dependentField: dependentFieldApiName
            });
        }
    }

    /**
     * Update an existing dependency matrix (modify valueSettings).
     *
     * This allows changing which dependent values are available for each controlling value
     * without recreating the entire dependency.
     *
     * @param {Object} params - Configuration object
     * @param {string} params.objectName - Salesforce object API name
     * @param {string} params.controllingFieldApiName - Controlling field API name
     * @param {string} params.dependentFieldApiName - Dependent field API name
     * @param {Object} params.newDependencyMatrix - New dependency mapping
     * @param {string[]} [params.recordTypes='all'] - Record types to update
     * @param {string} [params.targetOrg] - Target org alias
     *
     * @returns {Promise<Object>} Result with deployment details
     */
    async updateDependencyMatrix(params) {
        this.validateParams(params, [
            'objectName',
            'controllingFieldApiName',
            'dependentFieldApiName',
            'newDependencyMatrix'
        ]);

        const {
            objectName,
            controllingFieldApiName,
            dependentFieldApiName,
            newDependencyMatrix,
            recordTypes = 'all',
            targetOrg
        } = params;

        const alias = targetOrg || this.org;

        this.logOperation('update_dependency_matrix_start', {
            objectName,
            controllingField: controllingFieldApiName,
            dependentField: dependentFieldApiName
        });

        try {
            // Backup existing metadata
            await this.backupFieldMetadata(objectName, dependentFieldApiName, alias);

            // Update the dependency matrix in field metadata
            await this.updateDependentFieldMetadata(
                objectName,
                controllingFieldApiName,
                dependentFieldApiName,
                newDependencyMatrix,
                alias,
                API_VERSION
            );

            // Discover and update record types
            const activeRecordTypes = await this.discoverRecordTypes(objectName, alias);
            const recordTypesToUpdate = recordTypes === 'all'
                ? activeRecordTypes.map(rt => rt.DeveloperName)
                : recordTypes;

            // Deploy updated metadata
            const deployResult = await this.deployDependency(
                objectName,
                controllingFieldApiName,
                dependentFieldApiName,
                recordTypesToUpdate,
                alias,
                API_VERSION
            );

            this.logOperation('update_dependency_matrix_success', {
                objectName,
                deploymentId: deployResult.deploymentId
            });

            return {
                success: true,
                objectName,
                controllingField: controllingFieldApiName,
                dependentField: dependentFieldApiName,
                newDependencyMatrix,
                deploymentId: deployResult.deploymentId,
                auditTrail: this.getAuditTrail()
            };

        } catch (error) {
            this.logOperation('update_dependency_matrix_error', {
                objectName,
                error: error.message
            });

            // Attempt rollback
            await this.rollbackFieldMetadata(objectName, dependentFieldApiName, alias);

            throw this.enhanceError(error, {
                operation: 'updateDependencyMatrix',
                objectName
            });
        }
    }

    /**
     * Validate dependency matrix before deployment.
     *
     * Checks:
     * - All controlling values exist in controlling field
     * - All dependent values exist in dependent field
     * - No orphaned values (dependent values with no controlling values)
     * - All controlling values have at least one dependent value
     * - Matrix structure is valid
     *
     * @param {Object} params - Configuration object
     * @returns {Promise<Object>} Validation result
     */
    async validateDependencyMatrix(params) {
        this.validateParams(params, [
            'objectName',
            'controllingFieldApiName',
            'dependentFieldApiName',
            'dependencyMatrix'
        ]);

        const {
            objectName,
            controllingFieldApiName,
            dependentFieldApiName,
            dependencyMatrix,
            targetOrg
        } = params;

        const alias = targetOrg || this.org;
        const errors = [];
        const warnings = [];

        try {
            // Get field metadata for both fields
            const controllingFieldMetadata = await this.loadFieldMetadata(
                objectName,
                controllingFieldApiName,
                alias,
                API_VERSION
            );
            const dependentFieldMetadata = await this.loadFieldMetadata(
                objectName,
                dependentFieldApiName,
                alias,
                API_VERSION
            );

            // Extract picklist values
            const controllingValues = this.extractPicklistValues(controllingFieldMetadata.doc);
            const dependentValues = this.extractPicklistValues(dependentFieldMetadata.doc);

            // Validate controlling values exist
            const controllingValueSet = new Set(controllingValues.map(v => v.fullName));
            for (const controllingValue of Object.keys(dependencyMatrix)) {
                if (!controllingValueSet.has(controllingValue)) {
                    errors.push(
                        `Controlling value '${controllingValue}' not found in ${controllingFieldApiName}`
                    );
                }
            }

            // Validate dependent values exist
            const dependentValueSet = new Set(dependentValues.map(v => v.fullName));
            const allDependentValuesInMatrix = new Set(
                Object.values(dependencyMatrix).flat()
            );

            for (const dependentValue of allDependentValuesInMatrix) {
                if (!dependentValueSet.has(dependentValue)) {
                    errors.push(
                        `Dependent value '${dependentValue}' not found in ${dependentFieldApiName}`
                    );
                }
            }

            // Check for orphaned dependent values
            const dependentValuesNotMapped = dependentValues
                .map(v => v.fullName)
                .filter(v => !allDependentValuesInMatrix.has(v));

            if (dependentValuesNotMapped.length > 0) {
                warnings.push(
                    `Dependent values not mapped to any controlling value: ${dependentValuesNotMapped.join(', ')}`
                );
            }

            // Check all controlling values have at least one dependent value
            for (const [controllingValue, dependentValuesArray] of Object.entries(dependencyMatrix)) {
                if (!dependentValuesArray || dependentValuesArray.length === 0) {
                    errors.push(
                        `Controlling value '${controllingValue}' has no dependent values mapped`
                    );
                }
            }

            return {
                valid: errors.length === 0,
                errors,
                warnings,
                stats: {
                    controllingValues: Object.keys(dependencyMatrix).length,
                    dependentValues: allDependentValuesInMatrix.size,
                    totalMappings: Object.values(dependencyMatrix).flat().length
                }
            };

        } catch (error) {
            throw this.enhanceError(error, {
                operation: 'validateDependencyMatrix',
                objectName
            });
        }
    }

    /**
     * Update dependent field metadata with controlling field reference and valueSettings.
     *
     * This is the core of dependency creation - it sets the controllingField attribute
     * and builds the valueSettings array that defines which dependent values are
     * available for each controlling value.
     *
     * @private
     */
    async updateDependentFieldMetadata(
        objectName,
        controllingFieldApiName,
        dependentFieldApiName,
        dependencyMatrix,
        alias,
        apiVersion
    ) {
        const fieldState = await this.loadFieldMetadata(
            objectName,
            dependentFieldApiName,
            alias,
            apiVersion
        );

        const doc = fieldState.doc;

        // Set controlling field reference
        doc.CustomField.controllingField = [controllingFieldApiName];

        // Ensure valueSet exists
        const definition = this.ensureValueSetDefinition(doc);

        // Build valueSettings array from dependency matrix
        definition.valueSettings = this.buildValueSettings(dependencyMatrix);

        // Write updated metadata
        await this.writeFieldMetadata(fieldState.path, doc);

        this.logOperation('dependent_field_metadata_updated', {
            objectName,
            dependentField: dependentFieldApiName,
            controllingField: controllingFieldApiName
        });
    }

    /**
     * Build valueSettings array from dependency matrix.
     *
     * Format per Salesforce metadata:
     * Each entry in valueSettings represents allowed controlling values for one dependent value.
     *
     * @private
     */
    buildValueSettings(dependencyMatrix) {
        const valueSettings = [];

        // Invert the matrix: for each dependent value, list its allowed controlling values
        const invertedMatrix = {};
        for (const [controllingValue, dependentValues] of Object.entries(dependencyMatrix)) {
            for (const dependentValue of dependentValues) {
                if (!invertedMatrix[dependentValue]) {
                    invertedMatrix[dependentValue] = [];
                }
                invertedMatrix[dependentValue].push(controllingValue);
            }
        }

        // Build valueSettings entries
        for (const [dependentValue, controllingValues] of Object.entries(invertedMatrix)) {
            valueSettings.push({
                controllingFieldValue: controllingValues,
                valueName: [dependentValue]
            });
        }

        return valueSettings;
    }

    /**
     * Extract picklist values from field metadata.
     *
     * @private
     */
    extractPicklistValues(fieldDoc) {
        const valueSet = fieldDoc.CustomField?.valueSet?.[0];
        if (!valueSet) return [];

        const definition = valueSet.valueSetDefinition?.[0];
        if (!definition) return [];

        return (definition.value || []).map(v => ({
            fullName: v.fullName?.[0],
            label: v.label?.[0],
            isActive: v.isActive?.[0] === 'true'
        }));
    }

    /**
     * Deploy dependency atomically (field metadata + record type metadata).
     *
     * @private
     */
    async deployDependency(
        objectName,
        controllingFieldApiName,
        dependentFieldApiName,
        recordTypeNames,
        alias,
        apiVersion
    ) {
        const tempRoot = await createTempDir('picklist-dependency', this.projectPath);
        await ensureProjectScaffold(tempRoot, apiVersion);

        // Stage dependent field metadata (contains controllingField + valueSettings)
        const relativeDependentField = path.join(
            'force-app', 'main', 'default', 'objects', objectName,
            'fields', `${dependentFieldApiName}.field-meta.xml`
        );
        await stageFile(
            path.join(this.projectPath, relativeDependentField),
            tempRoot,
            relativeDependentField
        );

        // Stage controlling field metadata
        const relativeControllingField = path.join(
            'force-app', 'main', 'default', 'objects', objectName,
            'fields', `${controllingFieldApiName}.field-meta.xml`
        );
        const controllingFieldPath = path.join(this.projectPath, relativeControllingField);
        if (fs.existsSync(controllingFieldPath)) {
            await stageFile(controllingFieldPath, tempRoot, relativeControllingField);
        }

        // Stage all record type metadata files
        for (const recordTypeName of recordTypeNames) {
            const relativeRecordType = path.join(
                'force-app', 'main', 'default', 'objects', objectName,
                'recordTypes', `${recordTypeName}.recordType-meta.xml`
            );
            const recordTypePath = path.join(this.projectPath, relativeRecordType);

            if (fs.existsSync(recordTypePath)) {
                await stageFile(recordTypePath, tempRoot, relativeRecordType);
            }
        }

        // Build package.xml
        const manifestMembers = {
            CustomField: [
                `${objectName}.${dependentFieldApiName}`,
                `${objectName}.${controllingFieldApiName}`
            ],
            RecordType: recordTypeNames.map(name => `${objectName}.${name}`)
        };

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
                operation: 'deployDependency',
                objectName,
                controllingField: controllingFieldApiName,
                dependentField: dependentFieldApiName
            });
        }
    }

    /**
     * Verify dependency deployment by checking field metadata and testing dependency.
     *
     * @private
     */
    async verifyDependencyDeployment(
        objectName,
        controllingFieldApiName,
        dependentFieldApiName,
        dependencyMatrix,
        alias
    ) {
        try {
            // Check both fields exist via describe
            const describeCommand = `sf sobject describe --sobject ${objectName} --target-org ${alias} --json`;
            const result = await this.executeCommand(describeCommand);
            const parsed = this.parseJSON(result.stdout, { operation: 'verifyDependency' });

            const controllingField = parsed.result?.fields?.find(f => f.name === controllingFieldApiName);
            const dependentField = parsed.result?.fields?.find(f => f.name === dependentFieldApiName);

            if (!controllingField) {
                return {
                    success: false,
                    message: `Controlling field ${controllingFieldApiName} not found after deployment`
                };
            }

            if (!dependentField) {
                return {
                    success: false,
                    message: `Dependent field ${dependentFieldApiName} not found after deployment`
                };
            }

            // Check dependency exists
            if (!dependentField.dependentPicklist) {
                return {
                    success: false,
                    message: `Dependent field ${dependentFieldApiName} is not marked as dependent after deployment`
                };
            }

            if (dependentField.controllerName !== controllingFieldApiName) {
                return {
                    success: false,
                    message: `Dependent field controlling reference is incorrect (expected: ${controllingFieldApiName}, got: ${dependentField.controllerName})`
                };
            }

            return {
                success: true,
                message: 'Dependency verified successfully',
                controllingField: controllingFieldApiName,
                dependentField: dependentFieldApiName,
                dependencyConfirmed: true
            };

        } catch (error) {
            return {
                success: false,
                message: `Verification failed: ${firstLine(error.message)}`,
                error: error.message
            };
        }
    }

    /**
     * Backup field metadata before modifications.
     *
     * @private
     */
    async backupFieldMetadata(objectName, fieldApiName, alias) {
        const backupDir = path.join(this.projectPath, '.backup', 'field-metadata');
        await fs.promises.mkdir(backupDir, { recursive: true });

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = path.join(
            backupDir,
            `${objectName}_${fieldApiName}_${timestamp}.xml`
        );

        const fieldPath = path.join(
            this.projectPath,
            'force-app', 'main', 'default', 'objects', objectName,
            'fields', `${fieldApiName}.field-meta.xml`
        );

        if (fs.existsSync(fieldPath)) {
            await fs.promises.copyFile(fieldPath, backupPath);
            this.logOperation('field_metadata_backed_up', {
                objectName,
                fieldApiName,
                backupPath
            });
        }
    }

    /**
     * Rollback field metadata from backup.
     *
     * @private
     */
    async rollbackFieldMetadata(objectName, fieldApiName, alias) {
        const backupDir = path.join(this.projectPath, '.backup', 'field-metadata');

        try {
            const files = await fs.promises.readdir(backupDir);
            const backupFiles = files
                .filter(f => f.startsWith(`${objectName}_${fieldApiName}_`))
                .sort()
                .reverse();

            if (backupFiles.length > 0) {
                const latestBackup = path.join(backupDir, backupFiles[0]);
                const fieldPath = path.join(
                    this.projectPath,
                    'force-app', 'main', 'default', 'objects', objectName,
                    'fields', `${fieldApiName}.field-meta.xml`
                );

                await fs.promises.copyFile(latestBackup, fieldPath);
                this.logOperation('field_metadata_rolled_back', {
                    objectName,
                    fieldApiName,
                    backupPath: latestBackup
                });
            }
        } catch (error) {
            this.logOperation('rollback_failed', {
                objectName,
                fieldApiName,
                error: error.message
            });
        }
    }
}

module.exports = PicklistDependencyManager;
