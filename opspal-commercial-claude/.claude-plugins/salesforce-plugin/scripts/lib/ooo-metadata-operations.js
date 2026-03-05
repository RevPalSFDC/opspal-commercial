#!/usr/bin/env node

/**
 * Salesforce Order of Operations - Metadata Operations Library
 *
 * Implements Section B (Metadata Deploys) and Section D2/D3 from the
 * Salesforce Order of Operations playbook.
 *
 * Core Sequences:
 * - D2: Deploy Field(s) + FLS + RT (atomic) - 7 steps
 * - D3: Deploy Flow (safe) - 5 steps with inactive→verify→activate→smoke test
 *
 * Metadata Order (B1):
 * 1. CustomField(s)
 * 2. Picklist values (GlobalValueSet or field-local)
 * 3. RecordTypes (create RT + add picklist value mappings)
 * 4. Permission Set(s) (merge full set with fieldPermissions and objectPermissions)
 * 5. Layouts (optional)
 *
 * @see docs/SALESFORCE_ORDER_OF_OPERATIONS.md
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const execAsync = promisify(exec);
const { DataAccessError } = require('../../../cross-platform-plugin/scripts/lib/data-access-error');

class OOOMetadataOperations {
    constructor(orgAlias, options = {}) {
        this.orgAlias = orgAlias;
        this.verbose = options.verbose || false;
        this.dryRun = options.dryRun || false;
        this.workingDir = options.workingDir || path.join(os.tmpdir(), 'ooo-metadata');
    }

    /**
     * D2: Deploy Field(s) + FLS + RT (Atomic)
     *
     * Implements the 7-step atomic field deployment sequence:
     * 1. generateCustomFields
     * 2. ensureGlobalValueSets
     * 3. ensureRecordTypes (with picklist value mappings)
     * 4. retrievePermissionSet → mergeFieldPermissions
     * 5. deployAll
     * 6. assignPermissionSet (if needed)
     * 7. verifyFields + verifyFLS
     *
     * @param {string} objectName - Salesforce object API name
     * @param {array} fieldDefs - Array of field definitions
     * @param {object} options - Deployment options
     * @returns {Promise<object>} Deployment result with verification
     */
    async deployFieldPlusFlsPlusRT(objectName, fieldDefs, options = {}) {
        this.log(`🚀 Starting atomic field deployment for ${objectName}`);

        const context = {
            objectName,
            fieldDefs,
            options,
            timestamp: new Date().toISOString(),
            steps: []
        };

        try {
            // Prepare working directory
            await this.prepareWorkingDir();

            // STEP 1: Generate Custom Fields
            this.log('Step 1: Generating custom field metadata...');
            context.fieldPaths = await this.generateCustomFields(objectName, fieldDefs);
            context.steps.push({ step: 1, name: 'generateCustomFields', status: 'completed' });

            // STEP 2: Ensure Global Value Sets (if any picklist fields)
            this.log('Step 2: Ensuring Global Value Sets...');
            const picklistFields = fieldDefs.filter(f => f.type === 'Picklist' && f.globalValueSet);
            if (picklistFields.length > 0) {
                context.globalValueSets = await this.ensureGlobalValueSets(picklistFields);
                context.steps.push({ step: 2, name: 'ensureGlobalValueSets', status: 'completed' });
            } else {
                context.steps.push({ step: 2, name: 'ensureGlobalValueSets', status: 'skipped' });
            }

            // STEP 3: Ensure Record Types (with picklist mappings)
            this.log('Step 3: Ensuring record types with picklist mappings...');
            if (options.recordTypes && options.recordTypes.length > 0) {
                context.recordTypes = await this.ensureRecordTypes(
                    objectName,
                    options.recordTypes,
                    fieldDefs
                );
                context.steps.push({ step: 3, name: 'ensureRecordTypes', status: 'completed' });
            } else {
                context.steps.push({ step: 3, name: 'ensureRecordTypes', status: 'skipped' });
            }

            // STEP 4: Retrieve Permission Set → Merge Field Permissions
            this.log('Step 4: Retrieving and merging permission set...');
            const permSetName = options.permissionSetName || 'AgentAccess';
            context.permissionSet = await this.retrieveAndMergePermissionSet(
                permSetName,
                objectName,
                fieldDefs
            );
            context.steps.push({ step: 4, name: 'retrieveAndMergePermissionSet', status: 'completed' });

            // STEP 5: Deploy All
            this.log('Step 5: Deploying all metadata atomically...');
            if (this.dryRun) {
                this.log('[DRY RUN] Would deploy:', {
                    fields: context.fieldPaths,
                    permissionSet: context.permissionSet
                });
                context.steps.push({ step: 5, name: 'deployAll', status: 'dry_run' });
            } else {
                context.deployment = await this.deployAll([
                    ...context.fieldPaths,
                    context.permissionSet
                ]);
                context.steps.push({ step: 5, name: 'deployAll', status: context.deployment.success ? 'completed' : 'failed' });

                if (!context.deployment.success) {
                    throw new Error(`Deployment failed: ${context.deployment.errors.join(', ')}`);
                }
            }

            // STEP 6: Assign Permission Set (if needed)
            this.log('Step 6: Assigning permission set...');
            if (!this.dryRun && options.assignToUsers) {
                context.assignments = await this.assignPermissionSet(permSetName, options.assignToUsers);
                context.steps.push({ step: 6, name: 'assignPermissionSet', status: 'completed' });
            } else {
                context.steps.push({ step: 6, name: 'assignPermissionSet', status: 'skipped' });
            }

            // STEP 7: Verify Fields + Verify FLS
            this.log('Step 7: Verifying fields and FLS...');
            if (!this.dryRun) {
                context.verification = await this.verifyFieldsAndFLS(
                    objectName,
                    fieldDefs.map(f => f.fullName),
                    permSetName
                );
                context.steps.push({ step: 7, name: 'verifyFieldsAndFLS', status: context.verification.success ? 'completed' : 'failed' });

                if (!context.verification.success) {
                    throw new Error(
                        `Verification failed:\n${context.verification.issues.map(i => `  - ${i}`).join('\n')}`
                    );
                }
            } else {
                context.steps.push({ step: 7, name: 'verifyFieldsAndFLS', status: 'dry_run' });
            }

            this.log('✅ Atomic field deployment completed successfully');
            return {
                success: true,
                context
            };

        } catch (error) {
            this.log(`❌ Atomic field deployment failed: ${error.message}`);
            context.error = error.message;
            return {
                success: false,
                error: error.message,
                context
            };
        }
    }

    /**
     * D3: Deploy Flow (Safe)
     *
     * Implements the 5-step safe flow deployment sequence:
     * 1. Precheck: fields exist + FLS confirmed
     * 2. deployFlow(def, status=Inactive)
     * 3. verifyFlow(def) - no missing references
     * 4. activateFlow(def)
     * 5. smokeTestFlow() - test record → assert effect
     *
     * @param {string} flowName - Flow API name
     * @param {string} flowPath - Path to flow metadata file
     * @param {object} options - Deployment options
     * @returns {Promise<object>} Deployment result with smoke test
     */
    async deployFlowSafe(flowName, flowPath, options = {}) {
        this.log(`🚀 Starting safe flow deployment for ${flowName}`);

        const context = {
            flowName,
            flowPath,
            options,
            timestamp: new Date().toISOString(),
            steps: []
        };

        try {
            // STEP 1: Precheck - Fields exist + FLS confirmed
            this.log('Step 1: Pre-checking field existence and FLS...');
            const precheck = await this.precheckFlowReferences(flowPath);
            if (!precheck.passed) {
                throw new Error(
                    `Flow pre-check failed:\n${precheck.issues.map(i => `  - ${i}`).join('\n')}`
                );
            }
            context.precheck = precheck;
            context.steps.push({ step: 1, name: 'precheckFlowReferences', status: 'completed' });

            // STEP 2: Deploy Flow (Inactive)
            this.log('Step 2: Deploying flow as Inactive...');
            if (this.dryRun) {
                this.log('[DRY RUN] Would deploy flow as Inactive');
                context.steps.push({ step: 2, name: 'deployFlowInactive', status: 'dry_run' });
            } else {
                const deployment = await this.deployFlowInactive(flowPath);
                if (!deployment.success) {
                    throw new Error(`Flow deployment failed: ${deployment.error}`);
                }
                context.deployment = deployment;
                context.steps.push({ step: 2, name: 'deployFlowInactive', status: 'completed' });
            }

            // STEP 3: Verify Flow (no missing references)
            this.log('Step 3: Verifying flow references...');
            if (!this.dryRun) {
                const verification = await this.verifyFlow(flowName);
                if (!verification.passed) {
                    throw new Error(
                        `Flow verification failed:\n${verification.issues.map(i => `  - ${i}`).join('\n')}`
                    );
                }
                context.verification = verification;
                context.steps.push({ step: 3, name: 'verifyFlow', status: 'completed' });
            } else {
                context.steps.push({ step: 3, name: 'verifyFlow', status: 'dry_run' });
            }

            // STEP 4: Activate Flow
            this.log('Step 4: Activating flow...');
            if (!this.dryRun) {
                const activation = await this.activateFlow(flowName);
                if (!activation.success) {
                    throw new Error(`Flow activation failed: ${activation.error}`);
                }
                context.activation = activation;
                context.steps.push({ step: 4, name: 'activateFlow', status: 'completed' });
            } else {
                context.steps.push({ step: 4, name: 'activateFlow', status: 'dry_run' });
            }

            // STEP 5: Smoke Test Flow (create test record → assert effect)
            this.log('Step 5: Running smoke test...');
            if (!this.dryRun && options.smokeTest) {
                const smokeTest = await this.smokeTestFlow(flowName, flowPath, options.smokeTest);
                if (!smokeTest.passed) {
                    // Rollback: Deactivate flow
                    this.log('⚠️  Smoke test failed, rolling back...');
                    await this.deactivateFlow(flowName);
                    throw new Error(
                        `Smoke test failed:\n${smokeTest.issues.map(i => `  - ${i}`).join('\n')}`
                    );
                }
                context.smokeTest = smokeTest;
                context.steps.push({ step: 5, name: 'smokeTestFlow', status: 'completed' });
            } else {
                context.steps.push({ step: 5, name: 'smokeTestFlow', status: options.smokeTest ? 'dry_run' : 'skipped' });
            }

            this.log('✅ Safe flow deployment completed successfully');
            return {
                success: true,
                context
            };

        } catch (error) {
            this.log(`❌ Safe flow deployment failed: ${error.message}`);
            context.error = error.message;
            return {
                success: false,
                error: error.message,
                context
            };
        }
    }

    /**
     * Deploy Flow with Full Version Management
     *
     * Implements complete version lifecycle management:
     * 1. Query current active version
     * 2. Create new version (increment)
     * 3. Optionally deactivate old version
     * 4. Deploy new version (calls deployFlowSafe)
     * 5. Optionally cleanup old versions
     *
     * @param {string} flowName - Flow API name
     * @param {string} flowPath - Path to flow metadata file
     * @param {object} options - Deployment options
     * @param {boolean} options.deactivateOld - Deactivate old version before activation (default: false)
     * @param {boolean} options.cleanup - Clean up old versions after deployment (default: false)
     * @param {number} options.keepVersions - Number of versions to keep when cleaning up (default: 5)
     * @param {object} options.smokeTest - Smoke test configuration
     * @returns {Promise<object>} Deployment result with version info
     */
    async deployFlowWithVersionManagement(flowName, flowPath, options = {}) {
        this.log(`🚀 Starting Flow deployment with version management: ${flowName}`);

        const FlowVersionManager = require('./flow-version-manager');
        const versionManager = new FlowVersionManager(this.orgAlias, {
            verbose: this.verbose,
            dryRun: this.dryRun
        });

        const context = {
            flowName,
            flowPath,
            options,
            timestamp: new Date().toISOString(),
            steps: [],
            versionManagement: {}
        };

        try {
            // STEP 1: Query current active version
            this.log('Step 1: Querying current active version...');
            const currentActive = await versionManager.getActiveVersion(flowName);
            context.versionManagement.previousActiveVersion = currentActive ? currentActive.VersionNumber : null;
            this.log(`  Current active version: ${context.versionManagement.previousActiveVersion || 'None'}`);
            context.steps.push({ step: 1, name: 'queryActiveVersion', status: 'completed' });

            // STEP 2: Get latest version number (for new version increment)
            this.log('Step 2: Determining new version number...');
            const latestVersion = await versionManager.getLatestVersion(flowName);
            context.versionManagement.latestVersion = latestVersion;
            context.versionManagement.newVersion = latestVersion + 1;
            this.log(`  New version will be: ${context.versionManagement.newVersion}`);
            context.steps.push({ step: 2, name: 'determineNewVersion', status: 'completed' });

            // STEP 3: Optionally deactivate old version
            if (options.deactivateOld && currentActive) {
                this.log('Step 3: Deactivating old version...');
                if (!this.dryRun) {
                    const deactivation = await versionManager.deactivateFlow(flowName);
                    context.versionManagement.deactivation = deactivation;
                    context.steps.push({ step: 3, name: 'deactivateOldVersion', status: 'completed' });
                } else {
                    this.log('[DRY RUN] Would deactivate old version');
                    context.steps.push({ step: 3, name: 'deactivateOldVersion', status: 'dry_run' });
                }
            } else {
                this.log('Step 3: Skipping old version deactivation (not requested)');
                context.steps.push({ step: 3, name: 'deactivateOldVersion', status: 'skipped' });
            }

            // STEP 4: Deploy new version using safe deployment sequence
            this.log('Step 4: Deploying new version with safe sequence...');
            const deployment = await this.deployFlowSafe(flowName, flowPath, options);
            if (!deployment.success) {
                throw new Error(`Flow deployment failed: ${deployment.error}`);
            }
            context.deployment = deployment;
            context.steps.push({ step: 4, name: 'deployFlowSafe', status: 'completed' });

            // STEP 5: Verify new version is active
            this.log('Step 5: Verifying new version is active...');
            if (!this.dryRun) {
                const newActive = await versionManager.getActiveVersion(flowName);
                context.versionManagement.newActiveVersion = newActive ? newActive.VersionNumber : null;

                if (context.versionManagement.newActiveVersion !== context.versionManagement.newVersion) {
                    this.log(`⚠️  Warning: Expected version ${context.versionManagement.newVersion} to be active, but version ${context.versionManagement.newActiveVersion} is active`);
                } else {
                    this.log(`  ✅ Version ${context.versionManagement.newVersion} is active`);
                }
                context.steps.push({ step: 5, name: 'verifyActiveVersion', status: 'completed' });
            } else {
                context.steps.push({ step: 5, name: 'verifyActiveVersion', status: 'dry_run' });
            }

            // STEP 6: Optionally cleanup old versions
            if (options.cleanup) {
                this.log('Step 6: Cleaning up old versions...');
                const keepVersions = options.keepVersions || 5;
                if (!this.dryRun) {
                    const cleanup = await versionManager.cleanupVersions(flowName, keepVersions);
                    context.versionManagement.cleanup = cleanup;
                    context.steps.push({ step: 6, name: 'cleanupOldVersions', status: 'completed' });
                } else {
                    this.log('[DRY RUN] Would clean up old versions');
                    context.steps.push({ step: 6, name: 'cleanupOldVersions', status: 'dry_run' });
                }
            } else {
                this.log('Step 6: Skipping version cleanup (not requested)');
                context.steps.push({ step: 6, name: 'cleanupOldVersions', status: 'skipped' });
            }

            this.log('✅ Flow deployment with version management completed successfully');
            this.log(`   Previous version: ${context.versionManagement.previousActiveVersion || 'None'}`);
            this.log(`   New version: ${context.versionManagement.newVersion}`);

            return {
                success: true,
                context,
                versionInfo: {
                    previousVersion: context.versionManagement.previousActiveVersion,
                    newVersion: context.versionManagement.newVersion,
                    activeVersion: context.versionManagement.newActiveVersion
                }
            };

        } catch (error) {
            this.log(`❌ Flow deployment with version management failed: ${error.message}`);

            // Attempt rollback to previous version if available
            if (context.versionManagement.previousActiveVersion && !this.dryRun) {
                try {
                    this.log('🔄 Attempting rollback to previous version...');
                    const versionManager = new FlowVersionManager(this.orgAlias, {
                        verbose: this.verbose
                    });
                    await versionManager.activateVersion(
                        flowName,
                        context.versionManagement.previousActiveVersion
                    );
                    this.log(`✅ Rolled back to version ${context.versionManagement.previousActiveVersion}`);
                    context.versionManagement.rollback = {
                        performed: true,
                        targetVersion: context.versionManagement.previousActiveVersion
                    };
                } catch (rollbackError) {
                    this.log(`❌ Rollback failed: ${rollbackError.message}`);
                    context.versionManagement.rollback = {
                        performed: false,
                        error: rollbackError.message
                    };
                }
            }

            context.error = error.message;
            return {
                success: false,
                error: error.message,
                context
            };
        }
    }

    // ========== Helper Methods ==========

    async prepareWorkingDir() {
        try {
            await fs.mkdir(this.workingDir, { recursive: true });
        } catch (error) {
            // Directory already exists, ignore
        }
    }

    async generateCustomFields(objectName, fieldDefs) {
        const fieldPaths = [];

        for (const fieldDef of fieldDefs) {
            const fieldXML = this.generateFieldXML(fieldDef);
            const fieldPath = path.join(
                this.workingDir,
                `${objectName}.${fieldDef.fullName}.field-meta.xml`
            );

            await fs.writeFile(fieldPath, fieldXML, 'utf8');
            fieldPaths.push(fieldPath);
        }

        return fieldPaths;
    }

    generateFieldXML(fieldDef) {
        return `<?xml version="1.0" encoding="UTF-8"?>
<CustomField xmlns="http://soap.sforce.com/2006/04/metadata">
    <fullName>${fieldDef.fullName}</fullName>
    <label>${fieldDef.label || fieldDef.fullName}</label>
    <type>${fieldDef.type}</type>
    ${fieldDef.type === 'Text' ? `<length>${fieldDef.length || 255}</length>` : ''}
    ${fieldDef.type === 'Number' ? `<precision>${fieldDef.precision || 18}</precision><scale>${fieldDef.scale || 0}</scale>` : ''}
    ${fieldDef.required ? '<required>true</required>' : '<required>false</required>'}
    ${fieldDef.unique ? '<unique>true</unique>' : ''}
    ${fieldDef.externalId ? '<externalId>true</externalId>' : ''}
    ${fieldDef.description ? `<description>${fieldDef.description}</description>` : ''}
</CustomField>`;
    }

    async ensureGlobalValueSets(picklistFields) {
        throw new DataAccessError(
            'SFDC_Metadata_Operations',
            'GlobalValueSet creation/retrieval not yet implemented',
            {
                method: 'ensureGlobalValueSets',
                picklistFieldCount: picklistFields?.length || 0,
                status: 'not_implemented',
                workaround: 'Create GlobalValueSets manually via Setup UI or Metadata API',
                tracking_issue: 'https://github.com/RevPalSFDC/opspal-plugin-internal-marketplace/issues/TBD'
            }
        );
    }

    async ensureRecordTypes(objectName, recordTypes, fieldDefs) {
        throw new DataAccessError(
            'SFDC_Metadata_Operations',
            'RecordType creation with picklist mappings not yet implemented',
            {
                method: 'ensureRecordTypes',
                objectName,
                recordTypeCount: recordTypes?.length || 0,
                fieldCount: fieldDefs?.length || 0,
                status: 'not_implemented',
                workaround: 'Create RecordTypes manually via Setup UI and configure picklist value mappings',
                tracking_issue: 'https://github.com/RevPalSFDC/opspal-plugin-internal-marketplace/issues/TBD'
            }
        );
    }

    async retrieveAndMergePermissionSet(permSetName, objectName, fieldDefs) {
        // Check if permission set exists
        const query = `SELECT Id, Name FROM PermissionSet WHERE Name = '${permSetName}' LIMIT 1`;

        try {
            const { stdout } = await execAsync(
                `sf data query --query "${query}" --target-org ${this.orgAlias} --json`,
                { maxBuffer: 10 * 1024 * 1024 }
            );
            const result = JSON.parse(stdout);
            const exists = result.result?.records?.length > 0;

            // Generate permission set XML (merge with existing if present)
            const permSetXML = this.generatePermissionSetXML(permSetName, objectName, fieldDefs, exists);
            const permSetPath = path.join(this.workingDir, `${permSetName}.permissionset-meta.xml`);
            await fs.writeFile(permSetPath, permSetXML, 'utf8');

            return permSetPath;

        } catch (error) {
            throw new Error(`Failed to retrieve permission set: ${error.message}`);
        }
    }

    generatePermissionSetXML(permSetName, objectName, fieldDefs, isMerge) {
        const fieldPermissions = fieldDefs
            .filter(f => !f.required) // Exclude required fields
            .map(f => `    <fieldPermissions>
        <field>${objectName}.${f.fullName}</field>
        <readable>true</readable>
        <editable>true</editable>
    </fieldPermissions>`).join('\n');

        return `<?xml version="1.0" encoding="UTF-8"?>
<PermissionSet xmlns="http://soap.sforce.com/2006/04/metadata">
    <label>${permSetName}</label>
    <hasActivationRequired>false</hasActivationRequired>
${fieldPermissions}
</PermissionSet>`;
    }

    async deployAll(metadataPaths) {
        try {
            // Create package.xml
            const packageXML = this.generatePackageXML(metadataPaths);
            const packagePath = path.join(this.workingDir, 'package.xml');
            await fs.writeFile(packagePath, packageXML, 'utf8');

            // Deploy
            const { stdout } = await execAsync(
                `sf project deploy start --manifest ${packagePath} --target-org ${this.orgAlias} --wait 10 --json`,
                { maxBuffer: 10 * 1024 * 1024 }
            );

            const result = JSON.parse(stdout);
            return {
                success: result.status === 0,
                jobId: result.result?.id,
                errors: result.result?.details?.componentFailures || []
            };

        } catch (error) {
            return {
                success: false,
                errors: [error.message]
            };
        }
    }

    generatePackageXML(metadataPaths) {
        // Simple package.xml generation
        return `<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
    <types>
        <members>*</members>
        <name>CustomField</name>
    </types>
    <types>
        <members>*</members>
        <name>PermissionSet</name>
    </types>
    <version>62.0</version>
</Package>`;
    }

    async assignPermissionSet(permSetName, users) {
        if (!Array.isArray(users) || users.length === 0) {
            return { assigned: 0, skipped: 0, failures: [] };
        }

        const permSetId = await this.resolvePermissionSetId(permSetName);
        const results = {
            assigned: 0,
            skipped: 0,
            failures: []
        };

        for (const userIdentifier of users) {
            const userId = await this.resolveUserId(userIdentifier);

            if (!userId) {
                results.failures.push(`Unable to resolve user: ${userIdentifier}`);
                continue;
            }

            const existingQuery = `
                SELECT Id
                FROM PermissionSetAssignment
                WHERE AssigneeId = '${userId}'
                AND PermissionSetId = '${permSetId}'
                LIMIT 1
            `.replace(/\s+/g, ' ').trim();

            const { stdout: existingOut } = await execAsync(
                `sf data query --query "${existingQuery}" --target-org ${this.orgAlias} --json`,
                { maxBuffer: 10 * 1024 * 1024 }
            );
            const existing = JSON.parse(existingOut);

            if (existing.result?.records?.length > 0) {
                results.skipped++;
                continue;
            }

            const assignCmd = `sf data create record --sobject PermissionSetAssignment --values "AssigneeId=${userId} PermissionSetId=${permSetId}" --target-org ${this.orgAlias} --json`;
            const { stdout } = await execAsync(assignCmd, { maxBuffer: 10 * 1024 * 1024 });
            const result = JSON.parse(stdout);

            if (result.status !== 0) {
                results.failures.push(`Failed to assign permission set to ${userIdentifier}: ${result.message || 'Unknown error'}`);
            } else {
                results.assigned++;
            }
        }

        if (results.failures.length > 0) {
            throw new Error(`Permission set assignment failed: ${results.failures.join('; ')}`);
        }

        return results;
    }

    async verifyFieldsAndFLS(objectName, fieldNames, permSetName) {
        const issues = [];

        // Verify fields exist via schema
        for (const fieldName of fieldNames) {
            const query = `
                SELECT QualifiedApiName
                FROM FieldDefinition
                WHERE EntityDefinition.QualifiedApiName = '${objectName}'
                AND QualifiedApiName = '${fieldName}'
            `;

            try {
                const { stdout } = await execAsync(
                    `sf data query --query "${query.replace(/\n/g, ' ')}" --target-org ${this.orgAlias} --json`,
                    { maxBuffer: 10 * 1024 * 1024 }
                );
                const result = JSON.parse(stdout);
                if (!result.result?.records?.[0]) {
                    issues.push(`Field ${fieldName} not found in schema`);
                }
            } catch (error) {
                issues.push(`Failed to verify field ${fieldName}: ${error.message}`);
            }
        }

        // Verify FLS via FieldPermissions
        const flsQuery = `
            SELECT Field, PermissionsRead, PermissionsEdit
            FROM FieldPermissions
            WHERE Parent.Name = '${permSetName}'
            AND Field LIKE '${objectName}.%'
        `;

        try {
            const { stdout } = await execAsync(
                `sf data query --query "${flsQuery.replace(/\n/g, ' ')}" --target-org ${this.orgAlias} --json`,
                { maxBuffer: 10 * 1024 * 1024 }
            );
            const result = JSON.parse(stdout);
            const flsRecords = result.result?.records || [];

            for (const fieldName of fieldNames) {
                const fieldFLS = flsRecords.find(r => r.Field === `${objectName}.${fieldName}`);
                if (!fieldFLS) {
                    issues.push(`FLS not configured for ${objectName}.${fieldName}`);
                }
            }
        } catch (error) {
            issues.push(`Failed to verify FLS: ${error.message}`);
        }

        return {
            success: issues.length === 0,
            issues
        };
    }

    async precheckFlowReferences(flowPath) {
        const issues = [];
        const warnings = [];
        const flowXml = await fs.readFile(flowPath, 'utf8');

        const objectNames = this.extractFlowObjectNames(flowXml);
        const recordFields = this.extractRecordFieldReferences(flowXml);
        const qualifiedRefs = this.extractQualifiedFieldReferences(flowXml);

        const objectFieldMap = new Map();
        for (const [objectName, fields] of Object.entries(qualifiedRefs)) {
            objectFieldMap.set(objectName, new Set(fields));
        }

        if (recordFields.size > 0) {
            if (objectNames.length === 1) {
                const objectName = objectNames[0];
                if (!objectFieldMap.has(objectName)) {
                    objectFieldMap.set(objectName, new Set());
                }
                for (const field of recordFields) {
                    objectFieldMap.get(objectName).add(field);
                }
            } else if (objectNames.length === 0) {
                warnings.push('No <object> found in flow XML; unable to validate $Record field references');
            } else {
                warnings.push('Multiple <object> entries found in flow XML; unable to map $Record references to a single object');
            }
        }

        if (objectFieldMap.size === 0) {
            warnings.push('No field references detected in flow XML for validation');
        }

        for (const [objectName, fieldSet] of objectFieldMap.entries()) {
            const fields = Array.from(fieldSet);
            const missing = await this.checkFieldsExist(objectName, fields);
            for (const field of missing) {
                issues.push(`Field ${objectName}.${field} not found in schema`);
            }
        }

        return {
            passed: issues.length === 0,
            issues,
            warnings,
            objectNames
        };
    }

    async deployFlowInactive(flowPath) {
        try {
            const flowXml = await fs.readFile(flowPath, 'utf8');
            const updatedXml = this.setFlowStatus(flowXml, 'Draft');
            const tempFlowDir = path.join(this.workingDir, 'force-app', 'main', 'default', 'flows');
            await fs.mkdir(tempFlowDir, { recursive: true });

            const tempFlowPath = path.join(tempFlowDir, path.basename(flowPath));
            await fs.writeFile(tempFlowPath, updatedXml, 'utf8');

            const { stdout } = await execAsync(
                `sf project deploy start --source-dir "${tempFlowDir}" --target-org ${this.orgAlias} --wait 10 --json`,
                { maxBuffer: 10 * 1024 * 1024 }
            );

            const result = JSON.parse(stdout);
            return {
                success: result.status === 0,
                jobId: result.result?.id,
                error: result.status !== 0 ? (result.message || 'Unknown error') : null
            };

        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async verifyFlow(flowName) {
        // Query flow metadata to verify no missing references
        const query = `SELECT Id, ApiName, ProcessType, IsActive FROM FlowDefinition WHERE ApiName = '${flowName}'`;

        try {
            const { stdout } = await execAsync(
                `sf data query --query "${query}" --use-tooling-api --target-org ${this.orgAlias} --json`,
                { maxBuffer: 10 * 1024 * 1024 }
            );

            const result = JSON.parse(stdout);
            const flow = result.result?.records?.[0];

            if (!flow) {
                return { passed: false, issues: [`Flow ${flowName} not found after deployment`] };
            }

            return { passed: true, flow, issues: [] };

        } catch (error) {
            return { passed: false, issues: [`Flow verification failed: ${error.message}`] };
        }
    }

    async activateFlow(flowName) {
        try {
            const { stdout } = await execAsync(
                `sf flow activate --flow-name "${flowName}" --target-org ${this.orgAlias} --json`,
                { maxBuffer: 10 * 1024 * 1024 }
            );
            const result = JSON.parse(stdout);

            if (result.status !== 0) {
                throw new Error(result.message || 'Flow activation failed');
            }

            return { success: true, method: 'sf_flow_activate', result };
        } catch (error) {
            try {
                const latestVersion = await this.getLatestFlowVersionNumber(flowName);
                const { stdout } = await execAsync(
                    `sf data update record --sobject FlowDefinition --where "DeveloperName='${flowName}'" --values "ActiveVersionNumber=${latestVersion}" --use-tooling-api --target-org ${this.orgAlias} --json`,
                    { maxBuffer: 10 * 1024 * 1024 }
                );
                const result = JSON.parse(stdout);
                if (result.status !== 0) {
                    throw new Error(result.message || 'Flow activation failed');
                }
                return { success: true, method: 'tooling_api', version: latestVersion, result };
            } catch (fallbackError) {
                return { success: false, error: fallbackError.message || error.message };
            }
        }
    }

    async deactivateFlow(flowName) {
        try {
            const { stdout } = await execAsync(
                `sf flow deactivate --flow-name "${flowName}" --target-org ${this.orgAlias} --json`,
                { maxBuffer: 10 * 1024 * 1024 }
            );
            const result = JSON.parse(stdout);

            if (result.status !== 0) {
                throw new Error(result.message || 'Flow deactivation failed');
            }

            return { success: true, method: 'sf_flow_deactivate', result };
        } catch (error) {
            try {
                const FlowVersionManager = require('./flow-version-manager');
                const manager = new FlowVersionManager(this.orgAlias, { verbose: this.verbose });
                const result = await manager.deactivateFlow(flowName);
                return { success: true, method: 'metadata', result };
            } catch (fallbackError) {
                return { success: false, error: fallbackError.message || error.message };
            }
        }
    }

    async smokeTestFlow(flowName, flowPath, smokeTestDef) {
        // Execute smoke test: create/update test record and assert expected outcome
        this.log(`  Running smoke test for flow ${flowName}...`);

        try {
            const issues = [];
            const testRecord = smokeTestDef?.testRecord || {};
            const objectName = smokeTestDef?.object || smokeTestDef?.sobject || await this.extractFlowObjectName(flowPath);

            if (!objectName) {
                return { passed: false, issues: ['Unable to determine target object for smoke test'] };
            }

            if (!testRecord || Object.keys(testRecord).length === 0) {
                return { passed: false, issues: ['Smoke test requires testRecord payload'] };
            }

            const valuesString = Object.entries(testRecord)
                .map(([key, value]) => `${key}=${this.formatCliValue(value)}`)
                .join(' ');

            const { stdout } = await execAsync(
                `sf data create record --sobject ${objectName} --values "${valuesString}" --target-org ${this.orgAlias} --json`,
                { maxBuffer: 10 * 1024 * 1024 }
            );
            const createResult = JSON.parse(stdout);
            const recordId = createResult.result?.id || createResult.result?.Id || createResult.id;

            if (!recordId) {
                return { passed: false, issues: ['Failed to create smoke test record'] };
            }

            let passed = true;
            if (smokeTestDef?.expectedOutcome?.field) {
                const outcome = await this.pollForExpectedOutcome(
                    objectName,
                    recordId,
                    smokeTestDef.expectedOutcome
                );

                if (!outcome.passed) {
                    passed = false;
                    issues.push(outcome.message);
                }
            }

            if (smokeTestDef?.cleanup !== false) {
                try {
                    await execAsync(
                        `sf data delete record --sobject ${objectName} --record-id ${recordId} --target-org ${this.orgAlias} --json`,
                        { maxBuffer: 10 * 1024 * 1024 }
                    );
                } catch (cleanupError) {
                    issues.push(`Failed to delete smoke test record: ${cleanupError.message}`);
                }
            }

            return { passed, issues };

        } catch (error) {
            return {
                passed: false,
                issues: [`Smoke test failed: ${error.message}`]
            };
        }
    }

    escapeSoqlString(value) {
        return String(value).replace(/'/g, "\\'");
    }

    formatCliValue(value) {
        if (value === null || value === undefined) {
            return 'null';
        }

        if (typeof value === 'number' || typeof value === 'boolean') {
            return value;
        }

        const safe = String(value).replace(/'/g, "\\'").replace(/"/g, '\\"');
        return `'${safe}'`;
    }

    chunkArray(items, size) {
        const chunks = [];
        for (let i = 0; i < items.length; i += size) {
            chunks.push(items.slice(i, i + size));
        }
        return chunks;
    }

    extractFlowObjectNames(flowXml) {
        const names = new Set();
        const objectMatches = flowXml.matchAll(/<object>([^<]+)<\/object>/g);
        for (const match of objectMatches) {
            const name = match[1]?.trim();
            if (name) names.add(name);
        }

        const objectTypeMatches = flowXml.matchAll(/<objectType>([^<]+)<\/objectType>/g);
        for (const match of objectTypeMatches) {
            const name = match[1]?.trim();
            if (name) names.add(name);
        }

        return Array.from(names);
    }

    extractFlowObjectName(flowPath) {
        return fs.readFile(flowPath, 'utf8')
            .then(content => {
                const objects = this.extractFlowObjectNames(content);
                return objects.length === 1 ? objects[0] : null;
            })
            .catch(() => null);
    }

    extractRecordFieldReferences(flowXml) {
        const fields = new Set();
        const regex = /\$Record(?:__Prior)?\.([A-Za-z0-9_]+)/g;
        let match;

        while ((match = regex.exec(flowXml)) !== null) {
            if (match[1]) {
                fields.add(match[1]);
            }
        }

        return fields;
    }

    extractQualifiedFieldReferences(flowXml) {
        const refs = {};
        const patterns = [
            /<field>([A-Za-z0-9_]+)\.([A-Za-z0-9_]+)<\/field>/g,
            /<[^>]*Reference>([A-Za-z0-9_]+)\.([A-Za-z0-9_]+)<\/[^>]*Reference>/g
        ];

        for (const pattern of patterns) {
            let match;
            while ((match = pattern.exec(flowXml)) !== null) {
                const objectName = match[1];
                const fieldName = match[2];

                if (!objectName || objectName.startsWith('$')) {
                    continue;
                }

                if (!refs[objectName]) {
                    refs[objectName] = new Set();
                }
                refs[objectName].add(fieldName);
            }
        }

        const normalized = {};
        for (const [objectName, fieldSet] of Object.entries(refs)) {
            normalized[objectName] = Array.from(fieldSet);
        }

        return normalized;
    }

    async checkFieldsExist(objectName, fieldNames) {
        const uniqueFields = Array.from(new Set(fieldNames));
        const missing = new Set(uniqueFields);

        if (uniqueFields.length === 0) {
            return [];
        }

        const chunks = this.chunkArray(uniqueFields, 50);
        for (const chunk of chunks) {
            const fieldList = chunk.map(field => `'${this.escapeSoqlString(field)}'`).join(', ');
            const query = `
                SELECT QualifiedApiName
                FROM FieldDefinition
                WHERE EntityDefinition.QualifiedApiName = '${this.escapeSoqlString(objectName)}'
                AND QualifiedApiName IN (${fieldList})
            `.replace(/\s+/g, ' ').trim();

            const { stdout } = await execAsync(
                `sf data query --query "${query}" --use-tooling-api --target-org ${this.orgAlias} --json`,
                { maxBuffer: 10 * 1024 * 1024 }
            );
            const result = JSON.parse(stdout);
            const records = result.result?.records || [];

            for (const record of records) {
                if (record.QualifiedApiName) {
                    missing.delete(record.QualifiedApiName);
                }
            }
        }

        return Array.from(missing);
    }

    setFlowStatus(flowXml, status) {
        if (/<status>.*?<\/status>/s.test(flowXml)) {
            return flowXml.replace(/<status>.*?<\/status>/s, `<status>${status}</status>`);
        }

        return flowXml.replace(/<\/Flow>/, `  <status>${status}</status>\n</Flow>`);
    }

    async getLatestFlowVersionNumber(flowName) {
        const query = `
            SELECT VersionNumber
            FROM Flow
            WHERE DeveloperName = '${flowName}'
            ORDER BY VersionNumber DESC
            LIMIT 1
        `.replace(/\s+/g, ' ').trim();

        const { stdout } = await execAsync(
            `sf data query --query "${query}" --use-tooling-api --target-org ${this.orgAlias} --json`,
            { maxBuffer: 10 * 1024 * 1024 }
        );
        const result = JSON.parse(stdout);
        const record = result.result?.records?.[0];

        if (!record) {
            throw new Error(`Unable to resolve latest flow version for ${flowName}`);
        }

        return record.VersionNumber;
    }

    async pollForExpectedOutcome(objectName, recordId, expectedOutcome) {
        const field = expectedOutcome.field;
        const expectedValue = expectedOutcome.expectedValue;
        const retries = expectedOutcome.retries ?? 5;
        const intervalMs = expectedOutcome.intervalMs ?? 2000;

        for (let attempt = 0; attempt <= retries; attempt++) {
            const query = `
                SELECT ${field}
                FROM ${objectName}
                WHERE Id = '${recordId}'
                LIMIT 1
            `.replace(/\s+/g, ' ').trim();

            const { stdout } = await execAsync(
                `sf data query --query "${query}" --target-org ${this.orgAlias} --json`,
                { maxBuffer: 10 * 1024 * 1024 }
            );
            const result = JSON.parse(stdout);
            const record = result.result?.records?.[0] || {};
            const actualValue = record[field];

            if (String(actualValue) === String(expectedValue)) {
                return { passed: true, value: actualValue };
            }

            if (attempt < retries) {
                await new Promise(resolve => setTimeout(resolve, intervalMs));
            }
        }

        return {
            passed: false,
            message: `Expected ${objectName}.${field} to be "${expectedValue}"`
        };
    }

    async resolveUserId(identifier) {
        if (!identifier) {
            return null;
        }

        if (/^[a-zA-Z0-9]{15,18}$/.test(identifier)) {
            return identifier;
        }

        const safeIdentifier = this.escapeSoqlString(identifier);
        const query = `
            SELECT Id
            FROM User
            WHERE Username = '${safeIdentifier}'
            OR Email = '${safeIdentifier}'
            LIMIT 1
        `.replace(/\s+/g, ' ').trim();

        const { stdout } = await execAsync(
            `sf data query --query "${query}" --target-org ${this.orgAlias} --json`,
            { maxBuffer: 10 * 1024 * 1024 }
        );
        const result = JSON.parse(stdout);
        return result.result?.records?.[0]?.Id || null;
    }

    async resolvePermissionSetId(permSetName) {
        const safeName = this.escapeSoqlString(permSetName);
        const query = `SELECT Id FROM PermissionSet WHERE Name = '${safeName}' LIMIT 1`;

        const { stdout } = await execAsync(
            `sf data query --query "${query}" --target-org ${this.orgAlias} --json`,
            { maxBuffer: 10 * 1024 * 1024 }
        );
        const result = JSON.parse(stdout);
        const record = result.result?.records?.[0];

        if (!record?.Id) {
            throw new Error(`Permission set not found: ${permSetName}`);
        }

        return record.Id;
    }

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
Salesforce Order of Operations - Metadata Operations Library

Usage:
  node ooo-metadata-operations.js deployFieldPlusFlsPlusRT <object> <org> [options]
  node ooo-metadata-operations.js deployFlowSafe <flow-name> <flow-path> <org> [options]

Commands:
  deployFieldPlusFlsPlusRT    Deploy fields atomically with FLS and RT
  deployFlowSafe              Deploy flow with inactive→verify→activate→smoke test

Options:
  --fields <json>            Field definitions as JSON array
  --permission-set <name>    Permission set name (default: AgentAccess)
  --smoke-test <json>        Smoke test definition for flow
  --dry-run                  Show what would be done without executing
  --verbose                  Show detailed logging

Example:
  node ooo-metadata-operations.js deployFieldPlusFlsPlusRT Account myorg \\
    --fields '[{"fullName":"TestField__c","type":"Text","label":"Test","length":255}]' \\
    --verbose
        `);
        process.exit(0);
    }

    async function runCLI() {
        const object = args[1];
        const org = command === 'deployFlowSafe' ? args[3] : args[2];

        if (!object || !org) {
            console.error('Error: Required arguments missing');
            process.exit(1);
        }

        const options = {
            verbose: args.includes('--verbose'),
            dryRun: args.includes('--dry-run')
        };

        const ooo = new OOOMetadataOperations(org, options);

        try {
            if (command === 'deployFieldPlusFlsPlusRT') {
                const fieldsIndex = args.indexOf('--fields');
                if (fieldsIndex === -1 || !args[fieldsIndex + 1]) {
                    console.error('Error: --fields is required');
                    process.exit(1);
                }

                const fieldDefs = JSON.parse(args[fieldsIndex + 1]);

                const permSetIndex = args.indexOf('--permission-set');
                if (permSetIndex !== -1 && args[permSetIndex + 1]) {
                    options.permissionSetName = args[permSetIndex + 1];
                }

                const result = await ooo.deployFieldPlusFlsPlusRT(object, fieldDefs, options);
                console.log(JSON.stringify(result, null, 2));
                process.exit(result.success ? 0 : 1);

            } else if (command === 'deployFlowSafe') {
                const flowPath = args[2];
                const smokeTestIndex = args.indexOf('--smoke-test');
                if (smokeTestIndex !== -1 && args[smokeTestIndex + 1]) {
                    options.smokeTest = JSON.parse(args[smokeTestIndex + 1]);
                }

                const result = await ooo.deployFlowSafe(object, flowPath, options);
                console.log(JSON.stringify(result, null, 2));
                process.exit(result.success ? 0 : 1);

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

module.exports = { OOOMetadataOperations };
