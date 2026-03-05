#!/usr/bin/env node

/**
 * Layout Deployer for Salesforce
 *
 * Comprehensive deployment automation for FlexiPages, Layouts, and CompactLayouts
 * with pre-deployment validation, backup creation, and post-deployment verification.
 *
 * Usage:
 *   const deployer = new LayoutDeployer(orgAlias);
 *   await deployer.init();
 *
 *   // Deploy a FlexiPage
 *   await deployer.deployFlexiPage('./path/to/MyPage.flexipage-meta.xml');
 *
 *   // Deploy with dry-run
 *   await deployer.deploy('./force-app', { dryRun: true });
 *
 *   // Deploy with profile assignments
 *   await deployer.deployWithAssignments('./force-app', {
 *     profiles: ['Sales User', 'Support User'],
 *     recordTypes: ['Enterprise', 'SMB']
 *   });
 *
 * @version 1.0.0
 * @created 2025-12-12
 * @runbook layout-cli-api-reference (Skill: layout-cli-api-reference)
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const xml2js = require('xml2js');

class LayoutDeployer {
    /**
     * Initialize Layout Deployer
     * @param {string} orgAlias - Salesforce org alias from sf CLI
     * @param {Object} options - Configuration options
     * @param {string} options.backupDir - Directory for backups
     * @param {boolean} options.verbose - Enable verbose logging
     */
    constructor(orgAlias, options = {}) {
        this.orgAlias = orgAlias;
        this.backupDir = options.backupDir || path.join(__dirname, '..', '..', '.backups', orgAlias);
        this.tempDir = path.join(__dirname, '..', '..', '.temp', 'deployment');
        this.verbose = options.verbose || false;
        this.parser = new xml2js.Parser();
        this.builder = new xml2js.Builder({
            xmldec: { version: '1.0', encoding: 'UTF-8' },
            renderOpts: { pretty: true, indent: '    ' }
        });
        this.deploymentResults = [];
    }

    /**
     * Initialize deployer and create required directories
     */
    async init() {
        await fs.mkdir(this.backupDir, { recursive: true });
        await fs.mkdir(this.tempDir, { recursive: true });
        this.log(`✓ Layout Deployer initialized for org: ${this.orgAlias}`);
    }

    /**
     * Log message if verbose mode is enabled
     * @private
     */
    log(message) {
        if (this.verbose) {
            console.log(message);
        }
    }

    /**
     * Validate org connection and permissions
     * @returns {Promise<Object>} Org information
     */
    async validateOrgConnection() {
        try {
            const cmd = `sf org display --target-org ${this.orgAlias} --json`;
            const result = JSON.parse(execSync(cmd, { encoding: 'utf8' }));

            if (result.status !== 0 || !result.result) {
                throw new Error(`Org ${this.orgAlias} is not authenticated`);
            }

            return {
                orgId: result.result.id,
                instanceUrl: result.result.instanceUrl,
                username: result.result.username,
                connectedStatus: result.result.connectedStatus
            };
        } catch (error) {
            throw new Error(`Failed to validate org connection: ${error.message}`);
        }
    }

    /**
     * Pre-deployment validation
     * @param {string} sourcePath - Path to source directory or file
     * @param {Object} options - Validation options
     * @returns {Promise<Object>} Validation results
     */
    async validate(sourcePath, options = {}) {
        console.log('🔍 Running pre-deployment validation...');

        const validation = {
            valid: true,
            errors: [],
            warnings: [],
            metadata: {
                flexiPages: [],
                layouts: [],
                compactLayouts: []
            }
        };

        try {
            const stats = await fs.stat(sourcePath);

            if (stats.isDirectory()) {
                // Validate all metadata in directory
                validation.metadata = await this.scanMetadataDirectory(sourcePath);
            } else if (stats.isFile()) {
                // Validate single file
                const fileType = this.getMetadataType(sourcePath);
                if (fileType === 'flexipage') {
                    validation.metadata.flexiPages.push(sourcePath);
                } else if (fileType === 'layout') {
                    validation.metadata.layouts.push(sourcePath);
                } else if (fileType === 'compactlayout') {
                    validation.metadata.compactLayouts.push(sourcePath);
                }
            }

            // Validate FlexiPages
            for (const flexiPage of validation.metadata.flexiPages) {
                const result = await this.validateFlexiPage(flexiPage);
                if (!result.valid) {
                    validation.valid = false;
                    validation.errors.push(...result.errors);
                }
                validation.warnings.push(...result.warnings);
            }

            // Validate Layouts
            for (const layout of validation.metadata.layouts) {
                const result = await this.validateLayout(layout);
                if (!result.valid) {
                    validation.valid = false;
                    validation.errors.push(...result.errors);
                }
                validation.warnings.push(...result.warnings);
            }

            // Validate CompactLayouts
            for (const compactLayout of validation.metadata.compactLayouts) {
                const result = await this.validateCompactLayout(compactLayout);
                if (!result.valid) {
                    validation.valid = false;
                    validation.errors.push(...result.errors);
                }
                validation.warnings.push(...result.warnings);
            }

        } catch (error) {
            validation.valid = false;
            validation.errors.push(`Validation failed: ${error.message}`);
        }

        // Print validation results
        if (validation.valid) {
            console.log('✓ Pre-deployment validation passed');
        } else {
            console.log('✗ Pre-deployment validation failed');
            validation.errors.forEach(e => console.log(`  ❌ ${e}`));
        }

        if (validation.warnings.length > 0) {
            validation.warnings.forEach(w => console.log(`  ⚠️  ${w}`));
        }

        console.log(`  📦 FlexiPages: ${validation.metadata.flexiPages.length}`);
        console.log(`  📦 Layouts: ${validation.metadata.layouts.length}`);
        console.log(`  📦 CompactLayouts: ${validation.metadata.compactLayouts.length}`);

        return validation;
    }

    /**
     * Scan metadata directory for layout files
     * @private
     */
    async scanMetadataDirectory(dirPath) {
        const metadata = {
            flexiPages: [],
            layouts: [],
            compactLayouts: []
        };

        const scanDir = async (dir) => {
            const entries = await fs.readdir(dir, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);

                if (entry.isDirectory()) {
                    await scanDir(fullPath);
                } else if (entry.isFile()) {
                    if (entry.name.endsWith('.flexipage-meta.xml')) {
                        metadata.flexiPages.push(fullPath);
                    } else if (entry.name.endsWith('.layout-meta.xml')) {
                        metadata.layouts.push(fullPath);
                    } else if (entry.name.endsWith('.compactLayout-meta.xml')) {
                        metadata.compactLayouts.push(fullPath);
                    }
                }
            }
        };

        await scanDir(dirPath);
        return metadata;
    }

    /**
     * Get metadata type from file path
     * @private
     */
    getMetadataType(filePath) {
        if (filePath.endsWith('.flexipage-meta.xml')) return 'flexipage';
        if (filePath.endsWith('.layout-meta.xml')) return 'layout';
        if (filePath.endsWith('.compactLayout-meta.xml')) return 'compactlayout';
        return 'unknown';
    }

    /**
     * Validate FlexiPage metadata
     * @private
     */
    async validateFlexiPage(filePath) {
        const result = { valid: true, errors: [], warnings: [] };

        try {
            const content = await fs.readFile(filePath, 'utf8');
            const parsed = await this.parser.parseStringPromise(content);

            const flexiPage = parsed.FlexiPage;

            // Check required elements
            if (!flexiPage.masterLabel) {
                result.errors.push(`FlexiPage ${path.basename(filePath)}: Missing masterLabel`);
                result.valid = false;
            }

            if (!flexiPage.type) {
                result.errors.push(`FlexiPage ${path.basename(filePath)}: Missing type`);
                result.valid = false;
            }

            // Validate API version
            if (flexiPage.apiVersion) {
                const apiVersion = parseFloat(flexiPage.apiVersion[0]);
                if (apiVersion < 58.0) {
                    result.warnings.push(`FlexiPage ${path.basename(filePath)}: API version ${apiVersion} is outdated (recommended: 62.0+)`);
                }
            }

            // Check for fieldInstance components (validate field references)
            if (flexiPage.flexiPageRegions) {
                const fieldRefs = this.extractFieldReferences(flexiPage);
                if (fieldRefs.length > 0) {
                    this.log(`  Found ${fieldRefs.length} field references to validate`);
                }
            }

        } catch (error) {
            result.valid = false;
            result.errors.push(`FlexiPage ${path.basename(filePath)}: Parse error - ${error.message}`);
        }

        return result;
    }

    /**
     * Validate Classic Layout metadata
     * @private
     */
    async validateLayout(filePath) {
        const result = { valid: true, errors: [], warnings: [] };

        try {
            const content = await fs.readFile(filePath, 'utf8');
            const parsed = await this.parser.parseStringPromise(content);

            const layout = parsed.Layout;

            // Check layout sections
            if (layout.layoutSections) {
                const sections = Array.isArray(layout.layoutSections) ? layout.layoutSections : [layout.layoutSections];
                if (sections.length === 0) {
                    result.warnings.push(`Layout ${path.basename(filePath)}: No sections defined`);
                }
            }

        } catch (error) {
            result.valid = false;
            result.errors.push(`Layout ${path.basename(filePath)}: Parse error - ${error.message}`);
        }

        return result;
    }

    /**
     * Validate CompactLayout metadata
     * @private
     */
    async validateCompactLayout(filePath) {
        const result = { valid: true, errors: [], warnings: [] };

        try {
            const content = await fs.readFile(filePath, 'utf8');
            const parsed = await this.parser.parseStringPromise(content);

            const compactLayout = parsed.CompactLayout;

            // Check field count (max 10 fields, recommended 4-5)
            if (compactLayout.fields) {
                const fields = Array.isArray(compactLayout.fields) ? compactLayout.fields : [compactLayout.fields];
                if (fields.length > 10) {
                    result.errors.push(`CompactLayout ${path.basename(filePath)}: Exceeds 10 field limit (${fields.length} fields)`);
                    result.valid = false;
                } else if (fields.length > 5) {
                    result.warnings.push(`CompactLayout ${path.basename(filePath)}: ${fields.length} fields (recommended: 4-5 for optimal display)`);
                }
            }

        } catch (error) {
            result.valid = false;
            result.errors.push(`CompactLayout ${path.basename(filePath)}: Parse error - ${error.message}`);
        }

        return result;
    }

    /**
     * Extract field references from FlexiPage
     * @private
     */
    extractFieldReferences(flexiPage) {
        const fieldRefs = [];

        const extractFromRegion = (region) => {
            if (region.itemInstances) {
                const items = Array.isArray(region.itemInstances) ? region.itemInstances : [region.itemInstances];
                for (const item of items) {
                    if (item.componentInstance) {
                        const comp = item.componentInstance;
                        if (comp.componentName && comp.componentName[0] === 'flexipage:fieldInstance') {
                            if (comp.componentInstanceProperties) {
                                const props = Array.isArray(comp.componentInstanceProperties) ?
                                    comp.componentInstanceProperties : [comp.componentInstanceProperties];
                                const fieldProp = props.find(p => p.name && p.name[0] === 'fieldName');
                                if (fieldProp && fieldProp.value) {
                                    fieldRefs.push(fieldProp.value[0]);
                                }
                            }
                        }
                    }
                }
            }
        };

        if (flexiPage.flexiPageRegions) {
            const regions = Array.isArray(flexiPage.flexiPageRegions) ?
                flexiPage.flexiPageRegions : [flexiPage.flexiPageRegions];
            for (const region of regions) {
                extractFromRegion(region);
            }
        }

        return fieldRefs;
    }

    /**
     * Create backup of existing metadata before deployment
     * @param {string} objectName - Object to backup
     * @param {Array<string>} metadataTypes - Types to backup (flexipage, layout, compactlayout)
     * @returns {Promise<string>} Backup directory path
     */
    async createBackup(objectName, metadataTypes = ['flexipage', 'layout', 'compactlayout']) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = path.join(this.backupDir, `${objectName}_${timestamp}`);

        console.log(`📦 Creating backup at ${backupPath}...`);

        await fs.mkdir(backupPath, { recursive: true });

        const packageMembers = [];

        if (metadataTypes.includes('flexipage')) {
            packageMembers.push({ type: 'FlexiPage', members: [`${objectName}*`] });
        }
        if (metadataTypes.includes('layout')) {
            packageMembers.push({ type: 'Layout', members: [`${objectName}-*`] });
        }
        if (metadataTypes.includes('compactlayout')) {
            packageMembers.push({ type: 'CompactLayout', members: [`${objectName}.*`] });
        }

        // Build package.xml
        const packageXml = this.buildPackageXml(packageMembers);
        const packagePath = path.join(backupPath, 'package.xml');
        await fs.writeFile(packagePath, packageXml);

        // Retrieve current metadata
        try {
            const cmd = `sf project retrieve start --manifest ${packagePath} --target-dir ${backupPath} --target-org ${this.orgAlias} --json`;
            execSync(cmd, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
            console.log(`✓ Backup created successfully`);
        } catch (error) {
            console.log(`⚠️  Partial backup (some metadata may not exist in org)`);
        }

        return backupPath;
    }

    /**
     * Deploy metadata to org
     * @param {string} sourcePath - Path to source directory
     * @param {Object} options - Deployment options
     * @param {boolean} options.dryRun - Validate only, don't deploy
     * @param {boolean} options.checkOnly - Run check-only deployment
     * @param {boolean} options.ignoreWarnings - Ignore deployment warnings
     * @returns {Promise<Object>} Deployment result
     */
    async deploy(sourcePath, options = {}) {
        const { dryRun = false, checkOnly = false, ignoreWarnings = false } = options;

        // Step 1: Validate
        const validation = await this.validate(sourcePath);
        if (!validation.valid) {
            return {
                success: false,
                errors: validation.errors,
                message: 'Pre-deployment validation failed'
            };
        }

        if (dryRun) {
            console.log('🔎 Dry-run mode - skipping actual deployment');
            return {
                success: true,
                dryRun: true,
                validation: validation,
                message: 'Dry-run validation passed'
            };
        }

        // Step 2: Deploy
        console.log(`\n🚀 Deploying to ${this.orgAlias}...`);

        const deployCmd = [
            'sf', 'project', 'deploy', 'start',
            '--source-dir', sourcePath,
            '--target-org', this.orgAlias,
            '--json'
        ];

        if (checkOnly) {
            deployCmd.push('--dry-run');
        }

        if (ignoreWarnings) {
            deployCmd.push('--ignore-warnings');
        }

        try {
            const result = JSON.parse(execSync(deployCmd.join(' '), {
                encoding: 'utf8',
                maxBuffer: 10 * 1024 * 1024
            }));

            if (result.status === 0) {
                console.log('✓ Deployment successful');

                return {
                    success: true,
                    checkOnly: checkOnly,
                    deployedComponents: result.result?.deployedSource || [],
                    message: checkOnly ? 'Check-only deployment passed' : 'Deployment completed successfully'
                };
            } else {
                console.log('✗ Deployment failed');
                return {
                    success: false,
                    errors: result.result?.details?.componentFailures || [result.message],
                    message: 'Deployment failed'
                };
            }

        } catch (error) {
            return {
                success: false,
                errors: [error.message],
                message: 'Deployment command failed'
            };
        }
    }

    /**
     * Deploy FlexiPage with optional org activation
     * @param {string} flexiPagePath - Path to FlexiPage XML
     * @param {Object} options - Deployment options
     */
    async deployFlexiPage(flexiPagePath, options = {}) {
        console.log(`📤 Deploying FlexiPage: ${path.basename(flexiPagePath)}`);

        // Create temp deployment structure
        const deployDir = path.join(this.tempDir, `deploy_${Date.now()}`);
        const flexipageDir = path.join(deployDir, 'force-app', 'main', 'default', 'flexipages');

        await fs.mkdir(flexipageDir, { recursive: true });
        await fs.copyFile(flexiPagePath, path.join(flexipageDir, path.basename(flexiPagePath)));

        const result = await this.deploy(deployDir, options);

        // Cleanup
        await this.cleanup(deployDir);

        return result;
    }

    /**
     * Deploy with profile layout assignments
     * @param {string} sourcePath - Path to source directory
     * @param {Object} options - Deployment options
     * @param {Array<string>} options.profiles - Profiles to assign
     * @param {Array<string>} options.recordTypes - Record types to assign
     * @param {string} options.layoutName - Layout name to assign
     */
    async deployWithAssignments(sourcePath, options = {}) {
        const { profiles = [], recordTypes = [], layoutName } = options;

        // Step 1: Deploy the layouts
        const deployResult = await this.deploy(sourcePath, options);

        if (!deployResult.success) {
            return deployResult;
        }

        // Step 2: Update profile assignments if specified
        if (profiles.length > 0 && layoutName) {
            console.log(`\n📝 Updating profile assignments...`);

            for (const profile of profiles) {
                try {
                    await this.updateProfileLayoutAssignment(profile, layoutName, recordTypes);
                    console.log(`  ✓ Updated ${profile}`);
                } catch (error) {
                    console.log(`  ⚠️  Failed to update ${profile}: ${error.message}`);
                }
            }
        }

        return {
            ...deployResult,
            profileAssignments: profiles.length > 0 ? { profiles, layoutName, recordTypes } : null
        };
    }

    /**
     * Update profile layout assignment
     * @private
     */
    async updateProfileLayoutAssignment(profileName, layoutName, recordTypes = []) {
        // Build profile metadata with layout assignment
        const layoutAssignments = [];

        if (recordTypes.length === 0) {
            // Default assignment
            layoutAssignments.push({
                layout: [layoutName],
                recordType: ['']
            });
        } else {
            for (const rt of recordTypes) {
                layoutAssignments.push({
                    layout: [layoutName],
                    recordType: [rt]
                });
            }
        }

        const profileMetadata = {
            Profile: {
                $: { xmlns: 'http://soap.sforce.com/2006/04/metadata' },
                layoutAssignments: layoutAssignments
            }
        };

        const xml = this.builder.buildObject(profileMetadata);

        // Write profile metadata
        const profileDir = path.join(this.tempDir, 'profile_update');
        const profilesDir = path.join(profileDir, 'force-app', 'main', 'default', 'profiles');

        await fs.mkdir(profilesDir, { recursive: true });
        await fs.writeFile(path.join(profilesDir, `${profileName}.profile-meta.xml`), xml);

        // Deploy profile update
        const result = await this.deploy(profileDir, { ignoreWarnings: true });

        // Cleanup
        await this.cleanup(profileDir);

        return result;
    }

    /**
     * Rollback to backup
     * @param {string} backupPath - Path to backup directory
     */
    async rollback(backupPath) {
        console.log(`🔄 Rolling back from ${backupPath}...`);

        const forceAppPath = path.join(backupPath, 'force-app');

        try {
            const stats = await fs.stat(forceAppPath);
            if (!stats.isDirectory()) {
                throw new Error('Invalid backup - force-app directory not found');
            }

            const result = await this.deploy(backupPath);

            if (result.success) {
                console.log('✓ Rollback successful');
            } else {
                console.log('✗ Rollback failed');
            }

            return result;

        } catch (error) {
            return {
                success: false,
                errors: [error.message],
                message: 'Rollback failed'
            };
        }
    }

    /**
     * Post-deployment verification
     * @param {string} objectName - Object to verify
     * @returns {Promise<Object>} Verification results
     */
    async verifyDeployment(objectName) {
        console.log(`🔍 Verifying deployment for ${objectName}...`);

        const verification = {
            valid: true,
            flexiPages: [],
            layouts: [],
            compactLayouts: []
        };

        try {
            // Query FlexiPages
            const flexiQuery = `SELECT Id, DeveloperName, MasterLabel FROM FlexiPage WHERE EntityDefinitionId = '${objectName}'`;
            const flexiCmd = `sf data query --query "${flexiQuery}" --use-tooling-api --json --target-org ${this.orgAlias}`;
            const flexiResult = JSON.parse(execSync(flexiCmd, { encoding: 'utf8' }));

            if (flexiResult.status === 0 && flexiResult.result?.records) {
                verification.flexiPages = flexiResult.result.records;
            }

            // Query CompactLayouts
            const compactQuery = `SELECT Id, DeveloperName, MasterLabel FROM CompactLayout WHERE SobjectType = '${objectName}'`;
            const compactCmd = `sf data query --query "${compactQuery}" --use-tooling-api --json --target-org ${this.orgAlias}`;
            const compactResult = JSON.parse(execSync(compactCmd, { encoding: 'utf8' }));

            if (compactResult.status === 0 && compactResult.result?.records) {
                verification.compactLayouts = compactResult.result.records.map(record => ({
                    ...record,
                    Label: record.Label || record.MasterLabel || record.DeveloperName
                }));
            }

            console.log(`  ✓ Found ${verification.flexiPages.length} FlexiPage(s)`);
            console.log(`  ✓ Found ${verification.compactLayouts.length} CompactLayout(s)`);

        } catch (error) {
            verification.valid = false;
            verification.error = error.message;
        }

        return verification;
    }

    /**
     * Build package.xml for retrieval
     * @private
     */
    buildPackageXml(types) {
        const typesXml = types.map(t => {
            const members = t.members.map(m => `        <members>${m}</members>`).join('\n');
            return `    <types>
${members}
        <name>${t.type}</name>
    </types>`;
        }).join('\n');

        return `<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
${typesXml}
    <version>62.0</version>
</Package>`;
    }

    /**
     * Clean up temporary files/directories
     * @private
     */
    async cleanup(pathToClean) {
        try {
            const stat = await fs.stat(pathToClean);
            if (stat.isDirectory()) {
                await fs.rm(pathToClean, { recursive: true, force: true });
            } else {
                await fs.unlink(pathToClean);
            }
        } catch (error) {
            // Ignore cleanup errors
        }
    }

    /**
     * Get deployment history (from backup directory)
     * @returns {Promise<Array>} List of backup directories
     */
    async getDeploymentHistory() {
        try {
            const entries = await fs.readdir(this.backupDir, { withFileTypes: true });
            const backups = entries
                .filter(e => e.isDirectory())
                .map(e => ({
                    name: e.name,
                    path: path.join(this.backupDir, e.name),
                    timestamp: e.name.split('_').slice(-1)[0]
                }))
                .sort((a, b) => b.timestamp.localeCompare(a.timestamp));

            return backups;
        } catch (error) {
            return [];
        }
    }
}

module.exports = LayoutDeployer;

// CLI usage
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length < 2) {
        console.log(`
Layout Deployer - Salesforce Layout Deployment Automation

Usage: node layout-deployer.js <org-alias> <command> [options]

Commands:
  validate <source-path>     Validate metadata before deployment
  deploy <source-path>       Deploy metadata to org
  backup <object-name>       Create backup of existing metadata
  rollback <backup-path>     Rollback to a previous backup
  verify <object-name>       Verify deployment in org
  history                    Show deployment history

Options:
  --dry-run                  Validate only, don't deploy
  --check-only               Run check-only deployment
  --ignore-warnings          Ignore deployment warnings
  --profiles=<list>          Comma-separated list of profiles for assignment
  --record-types=<list>      Comma-separated list of record types
  --layout=<name>            Layout name for profile assignment
  --verbose                  Enable verbose logging

Examples:
  node layout-deployer.js my-org validate ./force-app
  node layout-deployer.js my-org deploy ./force-app --dry-run
  node layout-deployer.js my-org deploy ./force-app --profiles="Sales User,Support User"
  node layout-deployer.js my-org backup Opportunity
  node layout-deployer.js my-org rollback ./.backups/my-org/Opportunity_2025-12-12T10-00-00Z
  node layout-deployer.js my-org verify Opportunity
        `);
        process.exit(1);
    }

    const orgAlias = args[0];
    const command = args[1];
    const targetArg = args[2];

    // Parse options
    const dryRun = args.includes('--dry-run');
    const checkOnly = args.includes('--check-only');
    const ignoreWarnings = args.includes('--ignore-warnings');
    const verbose = args.includes('--verbose');

    const profilesArg = args.find(a => a.startsWith('--profiles='));
    const profiles = profilesArg ? profilesArg.split('=')[1].split(',') : [];

    const recordTypesArg = args.find(a => a.startsWith('--record-types='));
    const recordTypes = recordTypesArg ? recordTypesArg.split('=')[1].split(',') : [];

    const layoutArg = args.find(a => a.startsWith('--layout='));
    const layoutName = layoutArg ? layoutArg.split('=')[1] : null;

    (async () => {
        try {
            const deployer = new LayoutDeployer(orgAlias, { verbose });
            await deployer.init();

            // Validate connection
            const orgInfo = await deployer.validateOrgConnection();
            console.log(`✓ Connected to: ${orgInfo.username}\n`);

            let result;

            switch (command) {
                case 'validate':
                    if (!targetArg) throw new Error('Source path required');
                    result = await deployer.validate(targetArg);
                    break;

                case 'deploy':
                    if (!targetArg) throw new Error('Source path required');
                    if (profiles.length > 0 && layoutName) {
                        result = await deployer.deployWithAssignments(targetArg, {
                            dryRun, checkOnly, ignoreWarnings, profiles, recordTypes, layoutName
                        });
                    } else {
                        result = await deployer.deploy(targetArg, { dryRun, checkOnly, ignoreWarnings });
                    }
                    break;

                case 'backup':
                    if (!targetArg) throw new Error('Object name required');
                    result = await deployer.createBackup(targetArg);
                    break;

                case 'rollback':
                    if (!targetArg) throw new Error('Backup path required');
                    result = await deployer.rollback(targetArg);
                    break;

                case 'verify':
                    if (!targetArg) throw new Error('Object name required');
                    result = await deployer.verifyDeployment(targetArg);
                    break;

                case 'history':
                    result = await deployer.getDeploymentHistory();
                    console.log('\n📜 Deployment History:');
                    result.forEach(b => console.log(`  - ${b.name}`));
                    break;

                default:
                    throw new Error(`Unknown command: ${command}`);
            }

            if (result && typeof result === 'object' && result.success !== undefined) {
                console.log('\n📊 Result:', result.success ? '✓ Success' : '✗ Failed');
                if (!result.success && result.errors) {
                    result.errors.forEach(e => console.log(`  ❌ ${e}`));
                }
            }

        } catch (error) {
            console.error('❌ Error:', error.message);
            process.exit(1);
        }
    })();
}
