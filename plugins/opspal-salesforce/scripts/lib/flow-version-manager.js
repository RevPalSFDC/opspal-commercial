#!/usr/bin/env node

/**
 * Salesforce Flow Version Manager
 *
 * Programmatic management of Flow versions via Tooling API.
 * Implements version lifecycle: create, activate, deactivate, cleanup.
 *
 * Key Capabilities:
 * - Query Flow versions and status
 * - Activate/deactivate specific versions
 * - Clean up old versions
 * - Support for rollback scenarios
 *
 * API References:
 * - FlowDefinitionView: Current active versions
 * - FlowVersionView: All versions with history
 * - See: docs/SALESFORCE_TOOLING_API_FLOW_OBJECTS.md
 * - See: docs/FLOW_VERSION_MANAGEMENT.md
 *
 * @see docs/FLOW_VERSION_MANAGEMENT.md
 * @see docs/SALESFORCE_TOOLING_API_FLOW_OBJECTS.md
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const execAsync = promisify(exec);

class FlowVersionManager {
    constructor(orgAlias, options = {}) {
        this.orgAlias = orgAlias;
        this.verbose = options.verbose || false;
        this.dryRun = options.dryRun || false;
    }

    /**
     * Log message if verbose mode enabled
     */
    log(message) {
        if (this.verbose) {
            console.log(`[FlowVersionManager] ${message}`);
        }
    }

    /**
     * Execute SOQL query via Tooling API
     */
    async executeQuery(soql) {
        this.log(`Executing query: ${soql}`);

        const cmd = `sf data query \\
            --query "${soql}" \\
            --target-org ${this.orgAlias} \\
            --use-tooling-api \\
            --json`;

        const { stdout } = await execAsync(cmd);
        const result = JSON.parse(stdout);

        if (result.status !== 0) {
            throw new Error(`Query failed: ${result.message}`);
        }

        return result.result.records || [];
    }

    /**
     * Get all versions of a Flow
     *
     * @param {string} flowName - Flow API name (DeveloperName)
     * @returns {Promise<Array>} Array of version objects
     */
    async listVersions(flowName) {
        this.log(`Listing all versions for Flow: ${flowName}`);

        const soql = `
            SELECT
                DeveloperName,
                VersionNumber,
                IsActive,
                LastModifiedDate,
                Description,
                ProcessType,
                RunInMode
            FROM FlowVersionView
            WHERE DeveloperName = '${flowName}'
            ORDER BY VersionNumber DESC
        `;

        const versions = await this.executeQuery(soql);

        if (this.verbose) {
            versions.forEach(v => {
                const status = v.IsActive ? 'ACTIVE' : 'Inactive';
                console.log(`  Version ${v.VersionNumber}: ${status} (Modified: ${v.LastModifiedDate})`);
            });
        }

        return versions;
    }

    /**
     * Get the currently active version of a Flow
     *
     * @param {string} flowName - Flow API name
     * @returns {Promise<Object>} Active version object or null
     */
    async getActiveVersion(flowName) {
        this.log(`Getting active version for Flow: ${flowName}`);

        const soql = `
            SELECT
                ApiName,
                ActiveVersionId,
                DurableId,
                LatestVersionId
            FROM FlowDefinitionView
            WHERE ApiName = '${flowName}'
        `;

        const results = await this.executeQuery(soql);

        if (results.length === 0) {
            throw new Error(`Flow not found: ${flowName}`);
        }

        const flowDef = results[0];

        if (!flowDef.ActiveVersionId) {
            this.log('  No active version');
            return null;
        }

        // Get details of active version
        const versionSoql = `
            SELECT
                DeveloperName,
                VersionNumber,
                IsActive,
                LastModifiedDate
            FROM FlowVersionView
            WHERE DeveloperName = '${flowName}' AND IsActive = true
        `;

        const activeVersions = await this.executeQuery(versionSoql);

        if (activeVersions.length === 0) {
            return null;
        }

        this.log(`  Active version: ${activeVersions[0].VersionNumber}`);
        return activeVersions[0];
    }

    /**
     * Get the latest version number (not necessarily active)
     *
     * @param {string} flowName - Flow API name
     * @returns {Promise<number>} Latest version number
     */
    async getLatestVersion(flowName) {
        this.log(`Getting latest version for Flow: ${flowName}`);

        const versions = await this.listVersions(flowName);

        if (versions.length === 0) {
            throw new Error(`Flow not found: ${flowName}`);
        }

        const latestVersion = versions[0].VersionNumber;
        this.log(`  Latest version: ${latestVersion}`);
        return latestVersion;
    }

    /**
     * Activate a specific version of a Flow
     *
     * @param {string} flowName - Flow API name
     * @param {number} versionNumber - Version to activate
     * @returns {Promise<Object>} Activation result
     */
    async activateVersion(flowName, versionNumber) {
        this.log(`Activating Flow: ${flowName}, Version: ${versionNumber}`);

        if (this.dryRun) {
            this.log('[DRY RUN] Would activate version');
            return { success: true, dryRun: true };
        }

        // Verify version exists
        const versions = await this.listVersions(flowName);
        const targetVersion = versions.find(v => v.VersionNumber === parseInt(versionNumber));

        if (!targetVersion) {
            throw new Error(`Version ${versionNumber} not found for Flow ${flowName}`);
        }

        if (targetVersion.IsActive) {
            this.log(`  Version ${versionNumber} is already active`);
            return { success: true, alreadyActive: true };
        }

        // Activation via metadata deployment
        // Create temporary metadata file with Active status
        const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'flow-activation-'));

        try {
            // Retrieve the specific version
            const retrieveCmd = `sf project retrieve start \\
                --metadata "Flow:${flowName}" \\
                --target-org ${this.orgAlias} \\
                --target-metadata-dir ${tempDir}`;

            await execAsync(retrieveCmd);

            // Modify metadata to set Status = Active
            const flowMetadataPath = path.join(tempDir, 'flows', `${flowName}.flow-meta.xml`);
            const metadataContent = await fs.readFile(flowMetadataPath, 'utf8');

            // Replace status
            const updatedMetadata = metadataContent.replace(
                /<status>.*?<\/status>/s,
                '<status>Active</status>'
            );

            await fs.writeFile(flowMetadataPath, updatedMetadata, 'utf8');

            // Deploy with active status
            const deployCmd = `sf project deploy start \\
                --metadata-dir ${tempDir} \\
                --target-org ${this.orgAlias} \\
                --wait 10 \\
                --json`;

            const { stdout: deployOut } = await execAsync(deployCmd);
            const deployResult = JSON.parse(deployOut);

            if (deployResult.status !== 0) {
                throw new Error(`Activation failed: ${deployResult.message}`);
            }
        } finally {
            await fs.rm(tempDir, { recursive: true, force: true });
        }

        this.log(`  ✅ Version ${versionNumber} activated successfully`);

        return {
            success: true,
            previousVersion: await this.getActiveVersion(flowName),
            newVersion: versionNumber
        };
    }

    /**
     * Deactivate a Flow (no active version)
     *
     * @param {string} flowName - Flow API name
     * @returns {Promise<Object>} Deactivation result
     */
    async deactivateFlow(flowName) {
        this.log(`Deactivating Flow: ${flowName}`);

        if (this.dryRun) {
            this.log('[DRY RUN] Would deactivate flow');
            return { success: true, dryRun: true };
        }

        const activeVersion = await this.getActiveVersion(flowName);

        if (!activeVersion) {
            this.log('  Flow is already inactive');
            return { success: true, alreadyInactive: true };
        }

        // Deactivation via FlowDefinition with activeVersionNumber = 0
        const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'flow-deactivation-'));
        const flowDefDir = path.join(tempDir, 'flowDefinitions');
        await fs.mkdir(flowDefDir, { recursive: true });

        const flowDefXml = `<?xml version="1.0" encoding="UTF-8"?>
<FlowDefinition xmlns="http://soap.sforce.com/2006/04/metadata">
    <activeVersionNumber>0</activeVersionNumber>
</FlowDefinition>`;

        await fs.writeFile(path.join(flowDefDir, `${flowName}.flowDefinition-meta.xml`), flowDefXml, 'utf8');

        const deployCmd = `sf project deploy start \\
            --metadata-dir ${tempDir} \\
            --target-org ${this.orgAlias} \\
            --wait 10 \\
            --json`;

        try {
            const { stdout: deployOut } = await execAsync(deployCmd);
            const deployResult = JSON.parse(deployOut);

            if (deployResult.status !== 0) {
                throw new Error(`Deactivation failed: ${deployResult.message}`);
            }
        } finally {
            await fs.rm(tempDir, { recursive: true, force: true });
        }

        this.log('  ✅ Flow deactivated successfully');

        return {
            success: true,
            previousVersion: activeVersion.VersionNumber
        };
    }

    /**
     * Clean up old Flow versions (keep only most recent N)
     *
     * @param {string} flowName - Flow API name
     * @param {number} keepCount - Number of versions to keep (default: 5)
     * @returns {Promise<Object>} Cleanup result
     */
    async cleanupVersions(flowName, keepCount = 5) {
        this.log(`Cleaning up old versions for Flow: ${flowName} (keep last ${keepCount})`);

        const versions = await this.listVersions(flowName);

        if (versions.length <= keepCount) {
            this.log(`  Only ${versions.length} versions exist, no cleanup needed`);
            return { success: true, deletedCount: 0 };
        }

        // Identify versions to delete (exclude last N and active)
        const activeVersion = await this.getActiveVersion(flowName);
        const activeVersionNumber = activeVersion ? activeVersion.VersionNumber : null;

        const versionsToDelete = versions
            .slice(keepCount) // Skip first N (most recent)
            .filter(v => v.VersionNumber !== activeVersionNumber); // Don't delete active

        if (versionsToDelete.length === 0) {
            this.log('  No versions eligible for deletion');
            return { success: true, deletedCount: 0 };
        }

        this.log(`  Will delete ${versionsToDelete.length} versions:`);
        versionsToDelete.forEach(v => {
            this.log(`    - Version ${v.VersionNumber} (Modified: ${v.LastModifiedDate})`);
        });

        if (this.dryRun) {
            this.log('[DRY RUN] Would delete versions');
            return { success: true, dryRun: true, wouldDelete: versionsToDelete.length };
        }

        const errors = [];
        let deletedCount = 0;

        const flowRecords = await this.executeQuery(`
            SELECT Id, VersionNumber, Status
            FROM Flow
            WHERE DeveloperName = '${flowName}'
        `.replace(/\s+/g, ' ').trim());

        const recordByVersion = new Map();
        for (const record of flowRecords) {
            recordByVersion.set(record.VersionNumber, record);
        }

        for (const version of versionsToDelete) {
            const record = recordByVersion.get(version.VersionNumber);
            if (!record) {
                errors.push(`Missing Flow record for version ${version.VersionNumber}`);
                continue;
            }

            if (record.Status === 'Active') {
                errors.push(`Version ${version.VersionNumber} is active and cannot be deleted`);
                continue;
            }

            try {
                const { stdout } = await execAsync(
                    `sf data delete record --sobject Flow --record-id ${record.Id} --use-tooling-api --target-org ${this.orgAlias} --json`,
                    { maxBuffer: 10 * 1024 * 1024 }
                );
                const result = JSON.parse(stdout);

                if (result.status !== 0) {
                    errors.push(`Failed to delete version ${version.VersionNumber}: ${result.message || 'Unknown error'}`);
                } else {
                    deletedCount++;
                }
            } catch (error) {
                errors.push(`Failed to delete version ${version.VersionNumber}: ${error.message}`);
            }
        }

        if (errors.length > 0) {
            return {
                success: false,
                deletedCount,
                errors,
                versionsToDelete: versionsToDelete.map(v => v.VersionNumber)
            };
        }

        return {
            success: true,
            deletedCount,
            versionsDeleted: versionsToDelete.map(v => v.VersionNumber)
        };
    }

    /**
     * Get version comparison details
     *
     * @param {string} flowName - Flow API name
     * @param {number} version1 - First version number
     * @param {number} version2 - Second version number
     * @returns {Promise<Object>} Comparison details
     */
    async compareVersions(flowName, version1, version2) {
        this.log(`Comparing versions ${version1} and ${version2} of Flow: ${flowName}`);

        const versions = await this.listVersions(flowName);

        const v1 = versions.find(v => v.VersionNumber === parseInt(version1));
        const v2 = versions.find(v => v.VersionNumber === parseInt(version2));

        if (!v1 || !v2) {
            throw new Error('One or both versions not found');
        }

        return {
            version1: {
                number: v1.VersionNumber,
                isActive: v1.IsActive,
                modified: v1.LastModifiedDate,
                description: v1.Description
            },
            version2: {
                number: v2.VersionNumber,
                isActive: v2.IsActive,
                modified: v2.LastModifiedDate,
                description: v2.Description
            },
            note: 'For detailed diff, use: git diff or retrieve both versions and compare XML'
        };
    }
}

// ========================================
// CLI Interface
// ========================================

if (require.main === module) {
    const args = process.argv.slice(2);
    const command = args[0];

    if (!command || command === '--help' || command === '-h') {
        console.log(`
Salesforce Flow Version Manager

Usage:
  node flow-version-manager.js <command> <flow-name> <org-alias> [options]

Commands:
  listVersions <flow-name> <org>                          List all versions
  getActiveVersion <flow-name> <org>                      Get active version
  getLatestVersion <flow-name> <org>                      Get latest version number
  activateVersion <flow-name> <version> <org>             Activate specific version
  deactivateFlow <flow-name> <org>                        Deactivate flow (no active)
  cleanupVersions <flow-name> <org> [--keep N]            Delete old versions (keep N)
  compareVersions <flow-name> <v1> <v2> <org>             Compare two versions

Options:
  --verbose                      Verbose output
  --dry-run                      Simulate actions without executing
  --keep <number>                Number of versions to keep (cleanupVersions)

Examples:
  # List all versions
  node flow-version-manager.js listVersions Account_Record_Trigger my-org --verbose

  # Activate version 5
  node flow-version-manager.js activateVersion Account_Record_Trigger 5 my-org

  # Cleanup old versions (keep last 5)
  node flow-version-manager.js cleanupVersions Account_Record_Trigger my-org --keep 5

  # Deactivate flow entirely
  node flow-version-manager.js deactivateFlow Account_Record_Trigger my-org
        `);
        process.exit(0);
    }

    async function runCLI() {
        const flowName = args[1];
        const org = args[2] || args[3]; // Flexible arg position

        if (!flowName || !org) {
            console.error('Error: flow-name and org-alias required');
            process.exit(1);
        }

        const options = {
            verbose: args.includes('--verbose'),
            dryRun: args.includes('--dry-run')
        };

        const manager = new FlowVersionManager(org, options);

        try {
            let result;

            switch (command) {
                case 'listVersions':
                    result = await manager.listVersions(flowName);
                    console.log(JSON.stringify(result, null, 2));
                    break;

                case 'getActiveVersion':
                    result = await manager.getActiveVersion(flowName);
                    console.log(JSON.stringify(result, null, 2));
                    break;

                case 'getLatestVersion':
                    result = await manager.getLatestVersion(flowName);
                    console.log(JSON.stringify({ latestVersion: result }, null, 2));
                    break;

                case 'activateVersion':
                    const versionToActivate = args[2];
                    const orgForActivate = args[3];
                    if (!versionToActivate || !orgForActivate) {
                        throw new Error('Usage: activateVersion <flow-name> <version> <org>');
                    }
                    const activateManager = new FlowVersionManager(orgForActivate, options);
                    result = await activateManager.activateVersion(flowName, versionToActivate);
                    console.log(JSON.stringify(result, null, 2));
                    break;

                case 'deactivateFlow':
                    result = await manager.deactivateFlow(flowName);
                    console.log(JSON.stringify(result, null, 2));
                    break;

                case 'cleanupVersions':
                    const keepIndex = args.indexOf('--keep');
                    const keepCount = keepIndex !== -1 ? parseInt(args[keepIndex + 1]) : 5;
                    result = await manager.cleanupVersions(flowName, keepCount);
                    console.log(JSON.stringify(result, null, 2));
                    break;

                case 'compareVersions':
                    const v1 = args[2];
                    const v2 = args[3];
                    const orgForCompare = args[4];
                    if (!v1 || !v2 || !orgForCompare) {
                        throw new Error('Usage: compareVersions <flow-name> <version1> <version2> <org>');
                    }
                    const compareManager = new FlowVersionManager(orgForCompare, options);
                    result = await compareManager.compareVersions(flowName, v1, v2);
                    console.log(JSON.stringify(result, null, 2));
                    break;

                default:
                    console.error(`Unknown command: ${command}`);
                    console.error('Run with --help for usage information');
                    process.exit(1);
            }

            process.exit(0);

        } catch (error) {
            console.error(`Error: ${error.message}`);
            if (options.verbose) {
                console.error(error.stack);
            }
            process.exit(1);
        }
    }

    runCLI();
}

module.exports = FlowVersionManager;
