#!/usr/bin/env node

/**
 * Auto-FLS Configurator
 * Automatically configures field-level security for newly deployed fields
 * Prevents the common issue of fields being inaccessible after deployment
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class AutoFLSConfigurator {
    constructor(options = {}) {
        this.orgAlias = options.orgAlias || process.env.SF_TARGET_ORG;
        this.verbose = options.verbose || false;
        this.dryRun = options.dryRun || false;

        // Default profiles that should have access to new fields
        this.defaultProfiles = options.defaultProfiles || [
            'System Administrator',
            'Standard User',
            'Contract Manager',
            'Sales User',
            'Marketing User'
        ];

        // Default permission sets to update
        this.defaultPermissionSets = options.defaultPermissionSets || [];
    }

    /**
     * Main method to configure field permissions
     */
    async configureFieldPermissions(objectName, fieldName, options = {}) {
        console.log(`\n🔐 Configuring Field-Level Security for ${objectName}.${fieldName}`);
        console.log('=' .repeat(60));

        try {
            // Validate field exists
            const fieldExists = await this.validateFieldExists(objectName, fieldName);
            if (!fieldExists) {
                throw new Error(`Field ${objectName}.${fieldName} does not exist in org ${this.orgAlias}`);
            }

            // Get profiles and permission sets to update
            const profilesToUpdate = options.profiles || this.defaultProfiles;
            const permissionSetsToUpdate = options.permissionSets || this.defaultPermissionSets;

            // Get existing permissions
            const existingPermissions = await this.getExistingPermissions(objectName, fieldName);
            this.log(`Found ${existingPermissions.length} existing permission entries`);

            // Update profiles
            const profileResults = await this.updateProfiles(
                objectName,
                fieldName,
                profilesToUpdate,
                options.permissions || { read: true, edit: true }
            );

            // Update permission sets
            const permSetResults = await this.updatePermissionSets(
                objectName,
                fieldName,
                permissionSetsToUpdate,
                options.permissions || { read: true, edit: true }
            );

            // Generate report
            const report = this.generateReport({
                objectName,
                fieldName,
                profileResults,
                permSetResults,
                existingPermissions
            });

            console.log(report);

            // Save report to file
            this.saveReport(report, objectName, fieldName);

            return {
                success: true,
                profilesUpdated: profileResults.filter(r => r.success).length,
                permissionSetsUpdated: permSetResults.filter(r => r.success).length,
                report
            };

        } catch (error) {
            console.error(`❌ Error configuring field permissions: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Validate that the field exists in the org
     */
    async validateFieldExists(objectName, fieldName) {
        try {
            const query = `SELECT QualifiedApiName FROM EntityParticle WHERE EntityDefinitionId = '${objectName}' AND QualifiedApiName = '${fieldName}'`;
            const result = this.executeQuery(query, true);
            const records = JSON.parse(result).result.records;
            return records && records.length > 0;
        } catch (error) {
            this.log(`Error validating field: ${error.message}`, 'error');
            return false;
        }
    }

    /**
     * Get existing field permissions
     */
    async getExistingPermissions(objectName, fieldName) {
        try {
            const query = `SELECT Id, Parent.Name, Parent.Type, Parent.ProfileId, PermissionsRead, PermissionsEdit
                          FROM FieldPermissions
                          WHERE SobjectType = '${objectName}'
                          AND Field = '${objectName}.${fieldName}'`;

            const result = this.executeQuery(query);
            const records = JSON.parse(result).result.records || [];

            return records.map(record => ({
                parentName: record.Parent?.Name,
                parentType: record.Parent?.Type,
                read: record.PermissionsRead,
                edit: record.PermissionsEdit
            }));
        } catch (error) {
            this.log(`Error getting existing permissions: ${error.message}`, 'error');
            return [];
        }
    }

    /**
     * Update profile permissions
     */
    async updateProfiles(objectName, fieldName, profiles, permissions) {
        const results = [];

        for (const profileName of profiles) {
            try {
                this.log(`Updating profile: ${profileName}`);

                if (this.dryRun) {
                    this.log(`[DRY RUN] Would update profile: ${profileName}`);
                    results.push({ profile: profileName, success: true, dryRun: true });
                    continue;
                }

                // Create metadata for the profile update
                const metadata = this.createProfileMetadata(objectName, fieldName, profileName, permissions);

                // Deploy the metadata
                const deployResult = await this.deployMetadata(metadata, 'Profile', profileName);

                results.push({
                    profile: profileName,
                    success: deployResult.success,
                    message: deployResult.message
                });

            } catch (error) {
                results.push({
                    profile: profileName,
                    success: false,
                    error: error.message
                });
            }
        }

        return results;
    }

    /**
     * Update permission set permissions
     */
    async updatePermissionSets(objectName, fieldName, permissionSets, permissions) {
        const results = [];

        for (const permSetName of permissionSets) {
            try {
                this.log(`Updating permission set: ${permSetName}`);

                if (this.dryRun) {
                    this.log(`[DRY RUN] Would update permission set: ${permSetName}`);
                    results.push({ permissionSet: permSetName, success: true, dryRun: true });
                    continue;
                }

                // Create metadata for the permission set update
                const metadata = this.createPermissionSetMetadata(objectName, fieldName, permSetName, permissions);

                // Deploy the metadata
                const deployResult = await this.deployMetadata(metadata, 'PermissionSet', permSetName);

                results.push({
                    permissionSet: permSetName,
                    success: deployResult.success,
                    message: deployResult.message
                });

            } catch (error) {
                results.push({
                    permissionSet: permSetName,
                    success: false,
                    error: error.message
                });
            }
        }

        return results;
    }

    /**
     * Create profile metadata XML
     */
    createProfileMetadata(objectName, fieldName, profileName, permissions) {
        return `<?xml version="1.0" encoding="UTF-8"?>
<Profile xmlns="http://soap.sforce.com/2006/04/metadata">
    <fieldPermissions>
        <editable>${permissions.edit}</editable>
        <field>${objectName}.${fieldName}</field>
        <readable>${permissions.read}</readable>
    </fieldPermissions>
</Profile>`;
    }

    /**
     * Create permission set metadata XML
     */
    createPermissionSetMetadata(objectName, fieldName, permSetName, permissions) {
        return `<?xml version="1.0" encoding="UTF-8"?>
<PermissionSet xmlns="http://soap.sforce.com/2006/04/metadata">
    <fieldPermissions>
        <editable>${permissions.edit}</editable>
        <field>${objectName}.${fieldName}</field>
        <readable>${permissions.read}</readable>
    </fieldPermissions>
</PermissionSet>`;
    }

    /**
     * Deploy metadata to the org
     */
    async deployMetadata(metadata, type, name) {
        try {
            // Create temporary directory for deployment
            const tempDir = path.join(process.cwd(), '.fls-deploy-temp', `${Date.now()}`);
            const metadataDir = path.join(tempDir, 'force-app', 'main', 'default', type.toLowerCase() + 's');

            // Create directory structure
            fs.mkdirSync(metadataDir, { recursive: true });

            // Write metadata file
            const fileName = `${name.replace(/\s/g, '_')}.${type.toLowerCase()}-meta.xml`;
            const filePath = path.join(metadataDir, fileName);
            fs.writeFileSync(filePath, metadata);

            // Deploy using sf
            const deployCmd = `sf project deploy start --source-dir ${tempDir} --target-org ${this.orgAlias} --wait 10`;
            const result = execSync(deployCmd, { encoding: 'utf8' });

            // Clean up temp directory
            fs.rmSync(tempDir, { recursive: true, force: true });

            return {
                success: true,
                message: 'Successfully deployed'
            };

        } catch (error) {
            return {
                success: false,
                message: error.message
            };
        }
    }

    /**
     * Execute SOQL query
     */
    executeQuery(query, useToolingApi = false) {
        const apiFlag = useToolingApi ? '--use-tooling-api' : '';
        const cmd = `sf data query --query "${query}" ${apiFlag} --target-org ${this.orgAlias} --json`;

        try {
            return execSync(cmd, { encoding: 'utf8' });
        } catch (error) {
            throw new Error(`Query failed: ${error.message}`);
        }
    }

    /**
     * Generate report
     */
    generateReport(data) {
        const { objectName, fieldName, profileResults, permSetResults, existingPermissions } = data;

        let report = `\n📊 Field-Level Security Configuration Report\n`;
        report += `${'='.repeat(60)}\n`;
        report += `Field: ${objectName}.${fieldName}\n`;
        report += `Org: ${this.orgAlias}\n`;
        report += `Timestamp: ${new Date().toISOString()}\n\n`;

        report += `📝 Previous Permissions (${existingPermissions.length}):\n`;
        existingPermissions.forEach(perm => {
            report += `  - ${perm.parentName} (${perm.parentType}): Read=${perm.read}, Edit=${perm.edit}\n`;
        });

        report += `\n✅ Profile Updates (${profileResults.length}):\n`;
        profileResults.forEach(result => {
            const status = result.success ? '✓' : '✗';
            const message = result.error || result.message || 'Success';
            report += `  ${status} ${result.profile}: ${message}\n`;
        });

        if (permSetResults.length > 0) {
            report += `\n✅ Permission Set Updates (${permSetResults.length}):\n`;
            permSetResults.forEach(result => {
                const status = result.success ? '✓' : '✗';
                const message = result.error || result.message || 'Success';
                report += `  ${status} ${result.permissionSet}: ${message}\n`;
            });
        }

        report += `\n${'='.repeat(60)}\n`;

        return report;
    }

    /**
     * Save report to file
     */
    saveReport(report, objectName, fieldName) {
        const reportsDir = path.join(process.cwd(), 'fls-reports');
        fs.mkdirSync(reportsDir, { recursive: true });

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const fileName = `fls-config-${objectName}-${fieldName}-${timestamp}.txt`;
        const filePath = path.join(reportsDir, fileName);

        fs.writeFileSync(filePath, report);
        this.log(`Report saved to: ${filePath}`);
    }

    /**
     * Logging helper
     */
    log(message, level = 'info') {
        if (this.verbose || level === 'error') {
            const prefix = level === 'error' ? '❌' : '📌';
            console.log(`${prefix} ${message}`);
        }
    }
}

// CLI interface
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length < 2) {
        console.log(`
Usage: node auto-fls-configurator.js <ObjectName> <FieldName> [options]

Options:
  --org <alias>           Salesforce org alias
  --profiles <list>       Comma-separated list of profiles to update
  --permission-sets <list> Comma-separated list of permission sets to update
  --read-only            Grant only read access
  --dry-run              Show what would be updated without making changes
  --verbose              Show detailed output

Examples:
  node auto-fls-configurator.js Account__c CustomField__c --org myorg
  node auto-fls-configurator.js Contact NewField__c --profiles "System Administrator,Sales User"
  node auto-fls-configurator.js Lead Score__c --read-only --dry-run
        `);
        process.exit(1);
    }

    const [objectName, fieldName] = args;
    const options = {
        orgAlias: args.find(a => a.startsWith('--org'))?.split('=')[1],
        verbose: args.includes('--verbose'),
        dryRun: args.includes('--dry-run')
    };

    // Parse profiles
    const profilesArg = args.find(a => a.startsWith('--profiles'));
    if (profilesArg) {
        options.defaultProfiles = profilesArg.split('=')[1].split(',');
    }

    // Parse permission sets
    const permSetsArg = args.find(a => a.startsWith('--permission-sets'));
    if (permSetsArg) {
        options.defaultPermissionSets = permSetsArg.split('=')[1].split(',');
    }

    // Parse permissions
    const permissions = {
        read: true,
        edit: !args.includes('--read-only')
    };

    const configurator = new AutoFLSConfigurator(options);
    configurator.configureFieldPermissions(objectName, fieldName, { permissions })
        .then(result => {
            process.exit(result.success ? 0 : 1);
        })
        .catch(error => {
            console.error(error);
            process.exit(1);
        });
}

module.exports = AutoFLSConfigurator;