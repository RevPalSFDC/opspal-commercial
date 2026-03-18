#!/usr/bin/env node

/**
 * Resilient Salesforce Deployment Handler
 * Instance-agnostic tool for handling "Report is Obsolete" and other deployment failures
 *
 * Features:
 * - Handles "Report is Obsolete" errors gracefully
 * - Automatic verification fallback
 * - Job reattachment on failure
 * - Metadata type-specific verifiers
 * - Folder creation for reports
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const path = require('path');
const fs = require('fs');

class ResilientDeployer {
    constructor(orgAlias) {
        this.orgAlias = orgAlias;
        this.apiVersion = '60.0';
        this.verifiers = this.initializeVerifiers();
    }

    /**
     * Initialize metadata-specific verifiers
     */
    initializeVerifiers() {
        return {
            Report: async (components) => this.verifyReports(components),
            CustomField: async (components) => this.verifyFields(components),
            Flow: async (components) => this.verifyFlows(components),
            CustomObject: async (components) => this.verifyObjects(components),
            Layout: async (components) => this.verifyLayouts(components),
            PermissionSet: async (components) => this.verifyPermissionSets(components)
        };
    }

    /**
     * Check if error is "Report is Obsolete"
     */
    isObsoleteErr(e) {
        const s = (e?.message || e?.stderr || e?.stdout || '').toLowerCase();
        return s.includes('report is obsolete');
    }

    /**
     * Check if error is folder-related
     */
    isFolderErr(e) {
        const s = (e?.message || e?.stderr || e?.stdout || '').toLowerCase();
        return s.includes('cannot find folder') || s.includes('folder not found');
    }

    /**
     * Try to reattach to most recent deploy
     */
    async reattachMostRecent() {
        try {
            const cmd = `sf project deploy report --json --target-org ${this.orgAlias} --use-most-recent`;
            const result = await execAsync(cmd);
            const r = JSON.parse(result.stdout);
            return r?.result?.id || r?.id || null;
        } catch {
            return null;
        }
    }

    /**
     * Execute JSON command
     */
    async exJSON(cmd) {
        try {
            const result = await execAsync(cmd);
            return JSON.parse(result.stdout);
        } catch (e) {
            if (e.stdout) {
                try {
                    return JSON.parse(e.stdout);
                } catch {}
            }
            throw e;
        }
    }

    /**
     * Extract components from deployment path
     */
    extractComponents(sourcePath) {
        const components = [];

        // Check if it's a report path
        if (sourcePath.includes('/reports/')) {
            const files = fs.existsSync(sourcePath)
                ? fs.readdirSync(sourcePath).filter(f => f.endsWith('.report-meta.xml'))
                : [];

            files.forEach(file => {
                const name = file.replace('.report-meta.xml', '');
                components.push({
                    type: 'Report',
                    name: name,
                    path: path.join(sourcePath, file)
                });
            });
        }

        // Add other metadata type detection as needed

        return components;
    }

    /**
     * Verify reports exist in org
     */
    async verifyReports(components) {
        try {
            const reportNames = components
                .filter(c => c.type === 'Report')
                .map(c => c.name.replace(/_/g, ' '));

            if (reportNames.length === 0) return false;

            const nameList = reportNames.map(n => `'${n}'`).join(',');
            const query = `SELECT Id, Name, DeveloperName FROM Report WHERE Name IN (${nameList})`;
            const cmd = `sf data query --query "${query}" --target-org ${this.orgAlias} --json`;

            const result = await this.exJSON(cmd);
            const foundReports = result?.result?.records || [];

            console.log(`  ✓ Verification: Found ${foundReports.length} of ${reportNames.length} reports`);
            foundReports.forEach(r => console.log(`    - ${r.Name} (${r.Id})`));

            return foundReports.length === reportNames.length;
        } catch (e) {
            console.log('  ✗ Report verification failed:', e.message);
            return false;
        }
    }

    /**
     * Verify fields exist on objects
     */
    async verifyFields(components) {
        try {
            const fields = components.filter(c => c.type === 'CustomField');
            if (fields.length === 0) return false;

            for (const field of fields) {
                const [objectName, fieldName] = field.name.split('.');
                const query = `SELECT QualifiedApiName FROM FieldDefinition WHERE EntityDefinition.QualifiedApiName = '${objectName}' AND QualifiedApiName = '${fieldName}'`;
                const cmd = `sf data query --query "${query}" --target-org ${this.orgAlias} --use-tooling-api --json`;

                const result = await this.exJSON(cmd);
                if (!result?.result?.records?.length) {
                    console.log(`  ✗ Field not found: ${field.name}`);
                    return false;
                }
            }

            console.log(`  ✓ All ${fields.length} fields verified`);
            return true;
        } catch (e) {
            console.log('  ✗ Field verification failed:', e.message);
            return false;
        }
    }

    /**
     * Verify flows exist in org
     */
    async verifyFlows(components) {
        try {
            const flows = components.filter(c => c.type === 'Flow');
            if (flows.length === 0) return false;

            const flowNames = flows.map(f => `'${f.name}'`).join(',');
            const query = `SELECT Id, MasterLabel, DeveloperName FROM Flow WHERE DeveloperName IN (${flowNames})`;
            const cmd = `sf data query --query "${query}" --target-org ${this.orgAlias} --use-tooling-api --json`;

            const result = await this.exJSON(cmd);
            const foundFlows = result?.result?.records || [];

            console.log(`  ✓ Found ${foundFlows.length} of ${flows.length} flows`);
            return foundFlows.length === flows.length;
        } catch (e) {
            console.log('  ✗ Flow verification failed:', e.message);
            return false;
        }
    }

    /**
     * Verify objects exist in org
     */
    async verifyObjects(components) {
        try {
            const objects = components.filter(c => c.type === 'CustomObject');
            if (objects.length === 0) return false;

            for (const obj of objects) {
                const query = `SELECT QualifiedApiName FROM EntityDefinition WHERE QualifiedApiName = '${obj.name}'`;
                const cmd = `sf data query --query "${query}" --target-org ${this.orgAlias} --use-tooling-api --json`;

                const result = await this.exJSON(cmd);
                if (!result?.result?.records?.length) {
                    console.log(`  ✗ Object not found: ${obj.name}`);
                    return false;
                }
            }

            console.log(`  ✓ All ${objects.length} objects verified`);
            return true;
        } catch (e) {
            console.log('  ✗ Object verification failed:', e.message);
            return false;
        }
    }

    /**
     * Verify layouts exist
     */
    async verifyLayouts(components) {
        try {
            const layouts = components.filter(c => c.type === 'Layout');
            if (layouts.length === 0) return false;

            for (const layout of layouts) {
                const [objectName, layoutName] = layout.name.split('-');
                const query = `SELECT Name FROM Layout WHERE TableEnumOrId = '${objectName}' AND Name LIKE '%${layoutName}%'`;
                const cmd = `sf data query --query "${query}" --target-org ${this.orgAlias} --use-tooling-api --json`;

                const result = await this.exJSON(cmd);
                if (!result?.result?.records?.length) {
                    console.log(`  ✗ Layout not found: ${layout.name}`);
                    return false;
                }
            }

            console.log(`  ✓ All ${layouts.length} layouts verified`);
            return true;
        } catch (e) {
            console.log('  ✗ Layout verification failed:', e.message);
            return false;
        }
    }

    /**
     * Verify permission sets exist
     */
    async verifyPermissionSets(components) {
        try {
            const permSets = components.filter(c => c.type === 'PermissionSet');
            if (permSets.length === 0) return false;

            const names = permSets.map(ps => `'${ps.name}'`).join(',');
            const query = `SELECT Name FROM PermissionSet WHERE Name IN (${names})`;
            const cmd = `sf data query --query "${query}" --target-org ${this.orgAlias} --json`;

            const result = await this.exJSON(cmd);
            const found = result?.result?.records || [];

            console.log(`  ✓ Found ${found.length} of ${permSets.length} permission sets`);
            return found.length === permSets.length;
        } catch (e) {
            console.log('  ✗ Permission set verification failed:', e.message);
            return false;
        }
    }

    /**
     * Create folder if needed for reports
     */
    async ensureReportFolder(folderName) {
        try {
            // Check if folder exists
            const checkQuery = `SELECT Id, Name FROM Folder WHERE Name = '${folderName}' AND Type = 'Report'`;
            const checkCmd = `sf data query --query "${checkQuery}" --target-org ${this.orgAlias} --json`;

            const checkResult = await this.exJSON(checkCmd);
            const existingFolder = checkResult?.result?.records?.[0];

            if (existingFolder) {
                console.log(`  ✓ Folder exists: ${folderName} (${existingFolder.Id})`);
                return existingFolder.Id;
            }

            // Create folder
            console.log(`  Creating folder: ${folderName}`);
            const devName = folderName.replace(/\s+/g, '_');
            const createCmd = `sf data create record --sobject Folder --values "Name='${folderName}' Type=Report DeveloperName=${devName} AccessType=Public" --target-org ${this.orgAlias} --json`;

            const createResult = await this.exJSON(createCmd);
            const folderId = createResult?.result?.id;

            if (folderId) {
                console.log(`  ✓ Created folder: ${folderName} (${folderId})`);
                return folderId;
            }
        } catch (e) {
            console.log(`  ⚠️  Could not ensure folder: ${e.message}`);
        }
        return null;
    }

    /**
     * Deploy with resilient polling
     */
    async deployWithResilientPolling(sourcePath, options = {}) {
        console.log(`\n🚀 Starting resilient deployment from: ${sourcePath}`);

        // Extract components for verification
        const components = this.extractComponents(sourcePath);

        // Check for report folders
        if (components.some(c => c.type === 'Report') && sourcePath.includes('/')) {
            const folderMatch = sourcePath.match(/\/([^\/]+)\/[^\/]+$/);
            if (folderMatch && folderMatch[1] !== 'unfiled$public') {
                const folderName = folderMatch[1].replace(/_/g, ' ');
                await this.ensureReportFolder(folderName);
            }
        }

        // Start async deployment
        let deployCmd = `sf project deploy start --source-dir ${sourcePath} --target-org ${this.orgAlias} --async --json`;

        if (options.metadata) {
            deployCmd = `sf project deploy start --metadata ${options.metadata} --target-org ${this.orgAlias} --async --json`;
        }

        if (options.testLevel) {
            deployCmd += ` --test-level ${options.testLevel}`;
        } else {
            deployCmd += ' --test-level NoTestRun'; // Default to avoid long windows
        }

        let jobId;
        try {
            const startResult = await this.exJSON(deployCmd);
            jobId = startResult?.result?.id;

            if (!jobId) {
                throw new Error('No job ID returned from deploy start');
            }

            console.log(`✓ Deploy started with Job ID: ${jobId}`);
        } catch (e) {
            // Check if it's a folder error
            if (this.isFolderErr(e)) {
                console.log('⚠️  Folder error detected, creating folder and retrying...');
                // Extract folder name and create it
                const folderMatch = sourcePath.match(/\/([^\/]+)$/);
                if (folderMatch) {
                    await this.ensureReportFolder(folderMatch[1].replace(/_/g, ' '));
                    // Retry deployment
                    return this.deployWithResilientPolling(sourcePath, options);
                }
            }

            console.error('✗ Failed to start deployment:', e.message);
            throw e;
        }

        // Poll for status with obsolete tolerance
        const maxAttempts = 60;
        const pollInterval = 2000;
        let lastStatus = '';

        for (let i = 0; i < maxAttempts; i++) {
            await new Promise(resolve => setTimeout(resolve, pollInterval));

            try {
                const reportCmd = `sf project deploy report --json --job-id ${jobId} --target-org ${this.orgAlias}`;
                const report = await this.exJSON(reportCmd);

                const status = report?.result?.status || report?.status;

                if (status !== lastStatus) {
                    console.log(`  Status [${i + 1}/${maxAttempts}]: ${status}`);
                    lastStatus = status;
                }

                if (status === 'Succeeded') {
                    console.log('✅ Deployment succeeded!');
                    return {
                        ok: true,
                        jobId,
                        deployedComponents: report?.result?.numberComponentsDeployed
                    };
                }

                if (status === 'Failed') {
                    const failures = report?.result?.details?.componentFailures || [];

                    // Check if all failures are "Report is Obsolete"
                    const allObsolete = failures.every(f =>
                        f.problem && f.problem.includes('Report is Obsolete')
                    );

                    if (allObsolete && options.verifier) {
                        console.log('⚠️  All failures are "Report is Obsolete" - checking org state...');
                        const verified = await options.verifier(components);
                        if (verified) {
                            console.log('✅ Deployment verified via org state despite obsolete errors!');
                            return {
                                ok: true,
                                jobId,
                                note: 'Deployment had "Report is Obsolete" errors but was verified via org state'
                            };
                        }
                    }

                    console.error('❌ Deployment failed!');
                    failures.forEach(f => {
                        console.error(`  - ${f.componentType}: ${f.fullName} - ${f.problem}`);
                    });

                    throw new Error(`Deployment failed with ${failures.length} component failures`);
                }

            } catch (e) {
                if (this.isObsoleteErr(e)) {
                    console.log('⚠️  Report is obsolete during polling - attempting recovery...');

                    // 1) Try immediate org-state verification
                    if (options.verifier || components.length > 0) {
                        const verifier = options.verifier || (async () => {
                            // Auto-detect verifier based on components
                            for (const component of components) {
                                const typeVerifier = this.verifiers[component.type];
                                if (typeVerifier) {
                                    const verified = await typeVerifier([component]);
                                    if (!verified) return false;
                                }
                            }
                            return true;
                        });

                        const verified = await verifier(components);
                        if (verified === true) {
                            console.log('✅ Deployment verified via org state!');
                            return {
                                ok: true,
                                jobId,
                                note: 'Report was obsolete; success verified via org state.'
                            };
                        }
                    }

                    // 2) Try to reattach to most recent deploy
                    const recentJobId = await this.reattachMostRecent();
                    if (recentJobId && recentJobId !== jobId) {
                        console.log(`  Reattached to job: ${recentJobId}`);
                        jobId = recentJobId;
                        continue; // Continue polling with new job ID
                    }

                    // 3) Last resort - clear error with instructions
                    const error = new Error('Report is Obsolete and verification failed');
                    error.code = 'ReportObsolete';
                    error.tip = 'Deploy likely completed but SFDC dropped the report. Re-run verification or redeploy idempotently.';
                    error.orgAlias = this.orgAlias;
                    error.apiVersion = this.apiVersion;
                    error.jobId = jobId;

                    console.error(`\n❌ ${error.message}`);
                    console.error(`💡 Tip: ${error.tip}`);
                    throw error;
                }

                // Not an obsolete error - re-throw
                throw e;
            }
        }

        throw new Error(`Deployment timed out after ${maxAttempts * pollInterval / 1000} seconds`);
    }

    /**
     * Deploy reports with automatic verification
     */
    async deployReports(reportPath, folderName = null) {
        // Ensure folder exists if specified
        if (folderName) {
            await this.ensureReportFolder(folderName);
        }

        // Extract components
        const components = this.extractComponents(reportPath);

        // Deploy with verification fallback
        const result = await this.deployWithResilientPolling(reportPath, {
            testLevel: 'NoTestRun',
            verifier: () => this.verifyReports(components)
        });

        return result;
    }

    /**
     * Deploy any metadata with automatic verification
     */
    async deploy(sourcePath, options = {}) {
        const components = this.extractComponents(sourcePath);

        // Build verifier based on component types
        const verifier = async () => {
            const componentsByType = {};
            components.forEach(c => {
                if (!componentsByType[c.type]) {
                    componentsByType[c.type] = [];
                }
                componentsByType[c.type].push(c);
            });

            for (const [type, typeComponents] of Object.entries(componentsByType)) {
                const typeVerifier = this.verifiers[type];
                if (typeVerifier) {
                    const verified = await typeVerifier(typeComponents);
                    if (!verified) return false;
                }
            }
            return true;
        };

        return this.deployWithResilientPolling(sourcePath, {
            ...options,
            verifier
        });
    }
}

// Export for use as module
module.exports = { ResilientDeployer };

// CLI interface
async function main() {
    const args = process.argv.slice(2);

    if (args.length < 2) {
        console.log('Usage: node resilient-deployer.js <org-alias> <source-path> [options]');
        console.log('Options:');
        console.log('  --reports [folder]  Deploy reports to specified folder');
        console.log('  --metadata <type>   Deploy specific metadata type');
        console.log('  --test-level <level> Specify test level (NoTestRun, RunLocalTests, etc.)');
        console.log('\nExamples:');
        console.log('  node resilient-deployer.js myorg force-app/main/default/reports --reports "Sales Reports"');
        console.log('  node resilient-deployer.js myorg force-app/main/default/flows');
        process.exit(1);
    }

    const [orgAlias, sourcePath, ...options] = args;
    const deployer = new ResilientDeployer(orgAlias);

    try {
        let result;
        const opts = {};

        // Parse options
        for (let i = 0; i < options.length; i += 2) {
            const flag = options[i];
            const value = options[i + 1];

            if (flag === '--reports') {
                result = await deployer.deployReports(sourcePath, value);
            } else if (flag === '--metadata') {
                opts.metadata = value;
            } else if (flag === '--test-level') {
                opts.testLevel = value;
            }
        }

        if (!result) {
            result = await deployer.deploy(sourcePath, opts);
        }

        console.log('\n✅ Deployment completed successfully!');
        console.log(JSON.stringify(result, null, 2));

    } catch (e) {
        console.error('\n❌ Deployment failed:', e.message);
        if (e.code === 'ReportObsolete') {
            console.log('\n📋 Next steps:');
            console.log('1. Check the org for deployed components');
            console.log('2. Re-run with verification');
            console.log('3. Or redeploy idempotently');
        }
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    main().catch(console.error);
}