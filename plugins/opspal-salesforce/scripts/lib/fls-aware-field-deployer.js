#!/usr/bin/env node

/**
 * FLS-Aware Field Deployer
 *
 * Implements Salesforce best practice for field deployment:
 * 1. Create field metadata
 * 2. Create/update PermissionSet with fieldPermissions
 * 3. Deploy BOTH together in single transaction
 * 4. Assign PermissionSet to integration user
 * 5. Verify using schema (not SOQL - doesn't require FLS)
 * 6. Assert FLS applied correctly
 *
 * This prevents the common issue where fields are deployed but inaccessible
 * because FLS wasn't configured atomically with the field creation.
 *
 * Based on: https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_permissionset.htm
 *
 * @author Post-deployment FLS verification learnings
 * @date 2025-10-10
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { XMLParser, XMLBuilder } = require('fast-xml-parser');
const { createTempSalesforceProject } = require('./temp-salesforce-project');

class FLSAwareFieldDeployer {
    constructor(options = {}) {
        this.orgAlias = options.orgAlias || process.env.SF_TARGET_ORG;
        this.verbose = options.verbose || false;
        this.dryRun = options.dryRun || false;

        // Default permission set for agent/integration access
        this.agentPermissionSet = options.agentPermissionSet || 'AgentAccess';

        // Default user to assign permission set (current auth user)
        this.assignToCurrentUser = options.assignToCurrentUser !== false;
    }

    /**
     * Deploy field with FLS in single atomic operation
     */
    async deployFieldWithFLS(objectName, fieldMetadata, options = {}) {
        console.log(`\n${'='.repeat(70)}`);
        console.log('FLS-AWARE FIELD DEPLOYMENT');
        console.log(`${'='.repeat(70)}`);
        console.log(`Org: ${this.orgAlias}`);
        console.log(`Object: ${objectName}`);
        console.log(`Field: ${fieldMetadata.fullName || fieldMetadata.name}`);
        console.log(`Permission Set: ${this.agentPermissionSet}`);
        console.log(`${'='.repeat(70)}\n`);

        const result = {
            success: false,
            steps: {},
            errors: []
        };

        try {
            // Step 1: Generate field metadata
            console.log('📝 Step 1: Generating field metadata...');
            const fieldXML = this.generateFieldXML(objectName, fieldMetadata);
            result.steps.generateField = { success: true };
            console.log('✅ Field metadata generated\n');

            // Step 2: Ensure permission set metadata exists with FLS
            console.log('🔐 Step 2: Ensuring permission set with FLS...');
            const permSetXML = await this.ensurePermissionSetWithFLS(
                objectName,
                fieldMetadata.fullName || fieldMetadata.name,
                options.permissions || { read: true, edit: true }
            );
            result.steps.ensurePermissionSet = { success: true };
            console.log('✅ Permission set metadata prepared\n');

            // Step 3: Deploy both together in single transaction
            console.log('🚀 Step 3: Deploying field + permission set together...');
            const deployResult = await this.deployBundled(objectName, fieldMetadata, fieldXML, permSetXML);
            result.steps.deploy = deployResult;

            if (!deployResult.success) {
                throw new Error(`Deployment failed: ${deployResult.error}`);
            }
            console.log('✅ Deployment successful\n');

            // Step 4: Assign permission set to integration user
            console.log('👤 Step 4: Assigning permission set to integration user...');
            const assignResult = await this.assignPermissionSet();
            result.steps.assignPermissionSet = assignResult;

            if (!assignResult.success) {
                console.log(`⚠️  Warning: Could not assign permission set: ${assignResult.error}\n`);
            } else {
                console.log('✅ Permission set assigned\n');
            }

            // Step 5: Verify field exists using schema (doesn't require FLS)
            console.log('🔍 Step 5: Verifying field via schema...');
            const verifyResult = await this.verifyFieldViaSchema(objectName, fieldMetadata.fullName || fieldMetadata.name);
            result.steps.verifyField = verifyResult;

            if (!verifyResult.success) {
                throw new Error(`Field verification failed: ${verifyResult.error}`);
            }
            console.log('✅ Field verified in org\n');

            // Step 6: Assert FLS applied correctly
            console.log('✅ Step 6: Asserting FLS configuration...');
            const flsResult = await this.assertFLSApplied(objectName, fieldMetadata.fullName || fieldMetadata.name);
            result.steps.assertFLS = flsResult;

            if (!flsResult.success) {
                console.log(`⚠️  Warning: FLS verification incomplete: ${flsResult.error}\n`);
            } else {
                console.log('✅ FLS verified\n');
            }

            result.success = true;
            this.printSuccessSummary(result);
            return result;

        } catch (error) {
            result.success = false;
            result.errors.push(error.message);
            this.printFailureSummary(result, error);
            return result;
        }
    }

    /**
     * Generate field metadata XML
     */
    generateFieldXML(objectName, fieldMetadata) {
        const defaultMetadata = {
            type: 'Text',
            length: 255,
            required: false,
            unique: false,
            externalId: false
        };

        const metadata = { ...defaultMetadata, ...fieldMetadata };
        const fieldName = metadata.fullName || metadata.name;

        let xml = `<?xml version="1.0" encoding="UTF-8"?>
<CustomField xmlns="http://soap.sforce.com/2006/04/metadata">
    <fullName>${fieldName}</fullName>
    <label>${metadata.label || fieldName.replace('__c', '').replace(/_/g, ' ')}</label>`;

        if (metadata.description) {
            xml += `\n    <description>${this.escapeXML(metadata.description)}</description>`;
        }

        // Field type-specific attributes
        switch (metadata.type.toLowerCase()) {
            case 'text':
                xml += `\n    <length>${metadata.length}</length>`;
                xml += `\n    <type>Text</type>`;
                break;

            case 'number':
                xml += `\n    <precision>${metadata.precision || 18}</precision>`;
                xml += `\n    <scale>${metadata.scale || 0}</scale>`;
                xml += `\n    <type>Number</type>`;
                break;

            case 'currency':
                xml += `\n    <precision>${metadata.precision || 18}</precision>`;
                xml += `\n    <scale>${metadata.scale || 2}</scale>`;
                xml += `\n    <type>Currency</type>`;
                break;

            case 'date':
                xml += `\n    <type>Date</type>`;
                break;

            case 'datetime':
                xml += `\n    <type>DateTime</type>`;
                break;

            case 'checkbox':
                xml += `\n    <defaultValue>${metadata.defaultValue || false}</defaultValue>`;
                xml += `\n    <type>Checkbox</type>`;
                break;

            case 'picklist':
                xml += `\n    <type>Picklist</type>`;
                xml += `\n    <valueSet>`;
                xml += `\n        <restricted>true</restricted>`;
                if (metadata.values && metadata.values.length > 0) {
                    metadata.values.forEach(val => {
                        xml += `\n        <valueSetDefinition>`;
                        xml += `\n            <value>`;
                        xml += `\n                <fullName>${val.fullName || val}</fullName>`;
                        xml += `\n                <default>${val.default || false}</default>`;
                        xml += `\n                <label>${val.label || val.fullName || val}</label>`;
                        xml += `\n            </value>`;
                        xml += `\n        </valueSetDefinition>`;
                    });
                }
                xml += `\n    </valueSet>`;
                break;

            case 'lookup':
                xml += `\n    <referenceTo>${metadata.referenceTo}</referenceTo>`;
                xml += `\n    <relationshipLabel>${metadata.relationshipLabel || metadata.label}</relationshipLabel>`;
                xml += `\n    <relationshipName>${metadata.relationshipName || fieldName.replace('__c', '')}</relationshipName>`;
                xml += `\n    <type>Lookup</type>`;
                break;

            default:
                xml += `\n    <type>${metadata.type}</type>`;
        }

        xml += `\n    <required>${metadata.required}</required>`;

        if (metadata.unique) {
            xml += `\n    <unique>${metadata.unique}</unique>`;
        }

        if (metadata.externalId) {
            xml += `\n    <externalId>${metadata.externalId}</externalId>`;
        }

        xml += `\n</CustomField>`;

        return xml;
    }

    /**
     * Ensure permission set exists with FLS for this field
     * Uses retrieve-merge-deploy pattern to preserve existing field permissions
     */
    async ensurePermissionSetWithFLS(objectName, fieldName, permissions) {
        const fullFieldName = `${objectName}.${fieldName}`;

        // Check if permission set exists
        const permSetExists = await this.checkPermissionSetExists();

        if (!permSetExists) {
            this.log(`Permission set '${this.agentPermissionSet}' doesn't exist, will create it`);
            return this.generateNewPermissionSetXML(fullFieldName, permissions);
        }

        // Permission set exists - retrieve current state from org
        this.log(`Permission set '${this.agentPermissionSet}' exists, retrieving current state...`);

        const retrievedXML = await this.retrievePermissionSet();
        if (!retrievedXML) {
            this.log('Could not retrieve existing permission set, creating new one');
            return this.generateNewPermissionSetXML(fullFieldName, permissions);
        }

        // Parse existing field permissions
        const existingPermissions = this.parsePermissionSetXML(retrievedXML);
        this.log(`Found ${existingPermissions.length} existing field permission(s)`);

        // Merge new field permission with existing ones
        const mergedXML = this.mergeFieldPermissions(retrievedXML, fullFieldName, permissions);
        this.log(`Merged permission set includes ${existingPermissions.length + 1} field permission(s)`);

        return mergedXML;
    }

    /**
     * Retrieve current Permission Set from org
     * Returns XML string or null if retrieval fails
     */
    async retrievePermissionSet() {
        try {
            // Create temporary directory for retrieval
            const retrieveDir = path.join(process.cwd(), '.fls-retrieve-temp', Date.now().toString());
            fs.mkdirSync(retrieveDir, { recursive: true });

            // Retrieve Permission Set using Metadata API
            const retrieveCmd = `sf project retrieve start -m PermissionSet:${this.agentPermissionSet} --target-org ${this.orgAlias} --target-metadata-dir ${retrieveDir}`;

            try {
                execSync(retrieveCmd, { encoding: 'utf8', stdio: 'pipe' });
            } catch (error) {
                this.log(`Retrieve command failed: ${error.message}`, 'error');
                fs.rmSync(retrieveDir, { recursive: true, force: true });
                return null;
            }

            // SF CLI creates unpackaged.zip - extract it
            const zipFile = path.join(retrieveDir, 'unpackaged.zip');
            if (!fs.existsSync(zipFile)) {
                this.log('No unpackaged.zip found in retrieve directory', 'error');
                fs.rmSync(retrieveDir, { recursive: true, force: true });
                return null;
            }

            // Extract zip file
            try {
                execSync(`cd ${retrieveDir} && unzip -q unpackaged.zip`, { stdio: 'pipe' });
            } catch (error) {
                this.log(`Failed to extract zip: ${error.message}`, 'error');
                fs.rmSync(retrieveDir, { recursive: true, force: true });
                return null;
            }

            // Look for the Permission Set file in unpackaged/permissionsets/
            // File is named {PermissionSetName}.permissionset (no -meta.xml suffix)
            const permSetFile = path.join(retrieveDir, 'unpackaged', 'permissionsets', `${this.agentPermissionSet}.permissionset`);

            let xml = null;

            if (fs.existsSync(permSetFile)) {
                xml = fs.readFileSync(permSetFile, 'utf8');
                this.log('Retrieved permission set successfully');
            } else {
                this.log(`Permission set file not found at ${permSetFile}`, 'error');
            }

            // Clean up temp directory
            fs.rmSync(retrieveDir, { recursive: true, force: true });

            return xml;

        } catch (error) {
            this.log(`Error retrieving permission set: ${error.message}`, 'error');
            return null;
        }
    }

    /**
     * Reconstruct Permission Set XML from decomposed format (API >= 64)
     */
    reconstructFromDecomposed(decomposedDir) {
        // For now, return a basic structure - will need to handle decomposed format
        // This is a placeholder for future enhancement
        this.log('Warning: Decomposed format not fully supported yet, using basic structure');
        return null;
    }

    /**
     * Parse Permission Set XML to extract existing field permissions
     * Returns array of field permission objects
     */
    parsePermissionSetXML(xml) {
        try {
            const parser = new XMLParser({ ignoreAttributes: false, parseAttributeValue: false });
            const parsed = parser.parse(xml);

            const ps = parsed.PermissionSet;
            if (!ps || !ps.fieldPermissions) {
                return [];
            }

            // Handle both single field permission and array of field permissions
            const fieldPerms = Array.isArray(ps.fieldPermissions)
                ? ps.fieldPermissions
                : [ps.fieldPermissions];

            return fieldPerms.map(fp => ({
                field: fp.field,
                readable: fp.readable === 'true' || fp.readable === true,
                editable: fp.editable === 'true' || fp.editable === true
            }));

        } catch (error) {
            this.log(`Error parsing permission set XML: ${error.message}`, 'error');
            return [];
        }
    }

    /**
     * Merge new field permission into existing Permission Set XML
     * Implements upgrade-only logic (never downgrade permissions)
     */
    mergeFieldPermissions(existingXML, fullFieldName, newPermissions) {
        try {
            const parser = new XMLParser({ ignoreAttributes: false, parseAttributeValue: false, parseTagValue: false });
            const builder = new XMLBuilder({ ignoreAttributes: false, format: true, ignoreDeclaration: false });

            const parsed = parser.parse(existingXML);
            const ps = parsed.PermissionSet;

            // Ensure field permissions is an array
            if (!ps.fieldPermissions) {
                ps.fieldPermissions = [];
            } else if (!Array.isArray(ps.fieldPermissions)) {
                ps.fieldPermissions = [ps.fieldPermissions];
            }

            // Build map of existing permissions by field name
            const fieldPermMap = new Map();
            ps.fieldPermissions.forEach(fp => {
                fieldPermMap.set(fp.field, fp);
            });

            // Add or upgrade field permission
            const existing = fieldPermMap.get(fullFieldName);
            if (existing) {
                // Upgrade permissions (never downgrade)
                existing.readable = String(newPermissions.read || existing.readable === 'true' || existing.readable === true);
                existing.editable = String(newPermissions.edit || existing.editable === 'true' || existing.editable === true);
            } else {
                // Add new field permission
                ps.fieldPermissions.push({
                    field: fullFieldName,
                    readable: String(!!newPermissions.read),
                    editable: String(!!newPermissions.edit)
                });
            }

            // Sort field permissions for deterministic output
            ps.fieldPermissions.sort((a, b) => a.field.localeCompare(b.field));

            // Build final XML with XML declaration
            const xmlContent = builder.build({ PermissionSet: ps });
            return `<?xml version="1.0" encoding="UTF-8"?>\n${xmlContent}`;

        } catch (error) {
            this.log(`Error merging field permissions: ${error.message}`, 'error');
            // Fallback to creating new permission set
            return this.generateNewPermissionSetXML(fullFieldName, newPermissions);
        }
    }

    /**
     * Check if permission set exists in org
     */
    async checkPermissionSetExists() {
        try {
            const query = `SELECT Id FROM PermissionSet WHERE Name = '${this.agentPermissionSet}' LIMIT 1`;
            const cmd = `sf data query --query "${query}" --target-org ${this.orgAlias} --json`;
            const result = JSON.parse(execSync(cmd, { encoding: 'utf8', stdio: 'pipe' }));
            return result.result && result.result.totalSize > 0;
        } catch {
            return false;
        }
    }

    /**
     * Generate new permission set XML with field permission
     */
    generateNewPermissionSetXML(fullFieldName, permissions) {
        return `<?xml version="1.0" encoding="UTF-8"?>
<PermissionSet xmlns="http://soap.sforce.com/2006/04/metadata">
    <description>Agent/Integration access to custom fields and objects</description>
    <hasActivationRequired>false</hasActivationRequired>
    <label>Agent Access</label>
    <fieldPermissions>
        <editable>${permissions.edit}</editable>
        <field>${fullFieldName}</field>
        <readable>${permissions.read}</readable>
    </fieldPermissions>
</PermissionSet>`;
    }

    /**
     * Generate permission set update XML (adds field permission)
     */
    generatePermissionSetUpdateXML(fullFieldName, permissions) {
        // When updating, we must include all required fields
        // Salesforce will merge field permissions with existing ones
        return `<?xml version="1.0" encoding="UTF-8"?>
<PermissionSet xmlns="http://soap.sforce.com/2006/04/metadata">
    <description>Agent/Integration access to custom fields and objects</description>
    <hasActivationRequired>false</hasActivationRequired>
    <label>Agent Access</label>
    <fieldPermissions>
        <editable>${permissions.edit}</editable>
        <field>${fullFieldName}</field>
        <readable>${permissions.read}</readable>
    </fieldPermissions>
</PermissionSet>`;
    }

    /**
     * Deploy field + permission set in single transaction
     */
    async deployBundled(objectName, fieldMetadata, fieldXML, permSetXML) {
        let project = null;

        try {
            project = createTempSalesforceProject('fls-field-deploy');

            const fieldFileName = `${fieldMetadata.fullName || fieldMetadata.name}.field-meta.xml`;
            project.writeMetadataFile(
                path.join('objects', objectName, 'fields', fieldFileName),
                fieldXML
            );

            const permSetFileName = `${this.agentPermissionSet}.permissionset-meta.xml`;
            project.writeMetadataFile(
                path.join('permissionsets', permSetFileName),
                permSetXML
            );

            if (this.dryRun) {
                this.log('[DRY RUN] Would deploy field + permission set');
                this.log(`Field XML written to: ${path.join(project.metadataDir, 'objects', objectName, 'fields', fieldFileName)}`);
                this.log(`PermissionSet XML written to: ${path.join(project.metadataDir, 'permissionsets', permSetFileName)}`);

                // Don't clean up in dry run so user can inspect
                return {
                    success: true,
                    dryRun: true,
                    deployDir: project.rootDir
                };
            }

            // Deploy using sf CLI
            const deployCmd = `sf project deploy start --source-dir ${project.sourceDir} --target-org ${this.orgAlias} --wait 10 --json`;
            this.log(`Executing: ${deployCmd}`);

            const deployOutput = execSync(deployCmd, {
                cwd: project.rootDir,
                encoding: 'utf8'
            });
            const deployResult = JSON.parse(deployOutput);

            if (deployResult.status === 0 && deployResult.result?.deployedSource) {
                return {
                    success: true,
                    deploymentId: deployResult.result.id,
                    deployedFiles: deployResult.result.deployedSource.length
                };
            } else {
                return {
                    success: false,
                    error: deployResult.message || 'Deployment failed'
                };
            }

        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        } finally {
            if (!this.dryRun && project) {
                project.cleanup();
            }
        }
    }

    /**
     * Assign permission set to current integration user
     */
    async assignPermissionSet() {
        try {
            // Get current user info
            const userCmd = `sf org display --target-org ${this.orgAlias} --json`;
            const userResult = JSON.parse(execSync(userCmd, { encoding: 'utf8' }));
            const username = userResult.result?.username;

            if (!username) {
                return {
                    success: false,
                    error: 'Could not determine current user'
                };
            }

            if (this.dryRun) {
                this.log(`[DRY RUN] Would assign ${this.agentPermissionSet} to ${username}`);
                return {
                    success: true,
                    dryRun: true
                };
            }

            // Assign permission set
            const assignCmd = `sf org assign permset --name ${this.agentPermissionSet} --target-org ${this.orgAlias}`;
            execSync(assignCmd, { stdio: 'pipe' });

            return {
                success: true,
                username
            };

        } catch (error) {
            // Permission set might already be assigned
            if (error.message.includes('already assigned') || error.message.includes('DUPLICATE')) {
                return {
                    success: true,
                    alreadyAssigned: true
                };
            }

            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Verify field exists using schema (doesn't require FLS)
     */
    async verifyFieldViaSchema(objectName, fieldName) {
        try {
            // Use sf sobject describe - doesn't require FLS on individual fields
            const cmd = `sf sobject describe --sobject ${objectName} --target-org ${this.orgAlias} --json`;
            const result = JSON.parse(execSync(cmd, { encoding: 'utf8' }));

            if (!result.result || !Array.isArray(result.result.fields)) {
                return {
                    success: false,
                    error: 'Could not retrieve field list'
                };
            }

            const field = result.result.fields.find(f => f.name === fieldName);

            if (!field) {
                return {
                    success: false,
                    error: `Field ${fieldName} not found in schema`
                };
            }

            return {
                success: true,
                field: {
                    name: field.name,
                    type: field.type,
                    custom: field.custom
                }
            };

        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Assert FLS was applied correctly
     */
    async assertFLSApplied(objectName, fieldName) {
        const fullFieldName = `${objectName}.${fieldName}`;

        try {
            // Query FieldPermissions to confirm FLS entry exists
            const fpQuery = `
                SELECT Id, Parent.Name, Field, PermissionsRead, PermissionsEdit
                FROM FieldPermissions
                WHERE Field = '${fullFieldName}'
                AND Parent.Name = '${this.agentPermissionSet}'
            `.replace(/\n/g, ' ').trim();

            const fpCmd = `sf data query --query "${fpQuery}" --target-org ${this.orgAlias} --json`;
            const fpResult = JSON.parse(execSync(fpCmd, { encoding: 'utf8', stdio: 'pipe' }));

            if (!fpResult.result || fpResult.result.totalSize === 0) {
                return {
                    success: false,
                    error: `No field permission found for ${fullFieldName} in ${this.agentPermissionSet}`
                };
            }

            const fieldPerm = fpResult.result.records[0];

            // Query PermissionSetAssignment to confirm it's assigned
            const psaQuery = `
                SELECT Id, Assignee.Username, PermissionSet.Name
                FROM PermissionSetAssignment
                WHERE PermissionSet.Name = '${this.agentPermissionSet}'
            `.replace(/\n/g, ' ').trim();

            const psaCmd = `sf data query --query "${psaQuery}" --target-org ${this.orgAlias} --json`;
            const psaResult = JSON.parse(execSync(psaCmd, { encoding: 'utf8', stdio: 'pipe' }));

            return {
                success: true,
                fieldPermission: {
                    read: fieldPerm.PermissionsRead,
                    edit: fieldPerm.PermissionsEdit
                },
                assignedToUsers: psaResult.result?.totalSize || 0
            };

        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Helper methods
     */

    escapeXML(str) {
        if (!str) return '';
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }

    log(message) {
        if (this.verbose) {
            console.log(`  ${message}`);
        }
    }

    printSuccessSummary(result) {
        console.log(`\n${'='.repeat(70)}`);
        console.log('✅ DEPLOYMENT SUCCESSFUL');
        console.log(`${'='.repeat(70)}\n`);
        console.log('Field deployed with FLS in single atomic transaction.\n');
        console.log('Summary:');
        console.log(`  ✓ Field created and deployed`);
        console.log(`  ✓ Permission set ${result.steps.ensurePermissionSet?.success ? 'configured' : 'skipped'}`);
        console.log(`  ✓ Permission set ${result.steps.assignPermissionSet?.success ? 'assigned' : 'assignment skipped'}`);
        console.log(`  ✓ Field verified in schema`);
        console.log(`  ✓ FLS ${result.steps.assertFLS?.success ? 'verified' : 'partially verified'}`);
        console.log(`\n${'='.repeat(70)}\n`);
    }

    printFailureSummary(result, error) {
        console.log(`\n${'='.repeat(70)}`);
        console.log('❌ DEPLOYMENT FAILED');
        console.log(`${'='.repeat(70)}\n`);
        console.log(`Error: ${error.message}\n`);

        console.log('Steps completed:');
        Object.entries(result.steps).forEach(([step, stepResult]) => {
            const status = stepResult?.success ? '✓' : '✗';
            console.log(`  ${status} ${step}`);
        });

        console.log(`\n${'='.repeat(70)}\n`);
    }
}

// CLI interface
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length < 2) {
        console.log(`
Usage: node fls-aware-field-deployer.js <ObjectName> <FieldMetadata> [options]

Options:
  --org <alias>               Salesforce org alias
  --permission-set <name>     Permission set name (default: AgentAccess)
  --read-only                 Grant read-only FLS
  --dry-run                   Show what would be deployed without deploying
  --verbose                   Show detailed output

Field metadata can be:
  1. JSON file path: path/to/field.json
  2. Inline JSON: '{"fullName":"CustomField__c","type":"Text","length":100}'

Examples:
  # Deploy field with full edit access
  node fls-aware-field-deployer.js Account field.json --org myorg

  # Deploy read-only field
  node fls-aware-field-deployer.js Contact '{"fullName":"Score__c","type":"Number"}' --read-only

  # Dry run to preview
  node fls-aware-field-deployer.js Lead '{"fullName":"Status__c","type":"Text"}' --dry-run --verbose
        `);
        process.exit(1);
    }

    const [objectName, fieldInput] = args;

    // Parse field metadata
    let fieldMetadata;
    try {
        if (fieldInput.startsWith('{')) {
            fieldMetadata = JSON.parse(fieldInput);
        } else {
            const filePath = path.resolve(fieldInput);
            const fileContent = fs.readFileSync(filePath, 'utf8');
            fieldMetadata = JSON.parse(fileContent);
        }
    } catch (error) {
        console.error(`Error parsing field metadata: ${error.message}`);
        process.exit(1);
    }

    const options = {
        orgAlias: args.find(a => a.startsWith('--org'))?.split('=')[1],
        agentPermissionSet: args.find(a => a.startsWith('--permission-set'))?.split('=')[1] || 'AgentAccess',
        dryRun: args.includes('--dry-run'),
        verbose: args.includes('--verbose'),
        permissions: {
            read: true,
            edit: !args.includes('--read-only')
        }
    };

    const deployer = new FLSAwareFieldDeployer(options);

    deployer.deployFieldWithFLS(objectName, fieldMetadata, options)
        .then(result => {
            process.exit(result.success ? 0 : 1);
        })
        .catch(error => {
            console.error(error);
            process.exit(1);
        });
}

module.exports = FLSAwareFieldDeployer;
