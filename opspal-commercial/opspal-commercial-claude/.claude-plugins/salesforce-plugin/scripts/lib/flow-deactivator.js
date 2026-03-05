#!/usr/bin/env node

/**
 * Flow Deactivator Utility
 * 
 * Standalone utility for deactivating Salesforce flows.
 * Can be used independently or as part of the removal process.
 * 
 * Usage:
 *   node flow-deactivator.js --flow "FlowDeveloperName" --org myorg
 *   node flow-deactivator.js --label "Flow Master Label" --org myorg
 *   node flow-deactivator.js --all --filter "Old_" --org myorg
 */

const { execSync } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

class FlowDeactivator {
    constructor(orgAlias) {
        this.orgAlias = orgAlias;
        this.tempDir = path.join(__dirname, '..', '..', '.flow-deactivation-temp');
    }

    /**
     * Deactivate a single flow by DeveloperName
     */
    async deactivateByDeveloperName(developerName) {
        console.log(`🔄 Deactivating flow: ${developerName}`);
        
        try {
            // Get current flow status
            const flowInfo = await this.getFlowInfo(developerName);
            
            if (!flowInfo) {
                console.log('❌ Flow not found');
                return false;
            }
            
            if (flowInfo.Status === 'Inactive' || flowInfo.Status === 'Draft') {
                console.log(`✅ Flow is already ${flowInfo.Status}`);
                return true;
            }
            
            if (flowInfo.Status === 'Obsolete') {
                console.log('ℹ️ Flow is obsolete (deleted)');
                return true;
            }
            
            // Perform deactivation
            return await this.performDeactivation(developerName, flowInfo);
            
        } catch (error) {
            console.error(`❌ Error: ${error.message}`);
            return false;
        }
    }

    /**
     * Deactivate a flow by MasterLabel
     */
    async deactivateByLabel(masterLabel) {
        console.log(`🔍 Finding flow by label: "${masterLabel}"`);
        
        try {
            const query = `
                SELECT Definition.DeveloperName, Status, VersionNumber 
                FROM Flow 
                WHERE MasterLabel = '${masterLabel}' 
                AND Status = 'Active'
                ORDER BY VersionNumber DESC 
                LIMIT 1
            `.trim().replace(/\s+/g, ' ');
            
            const cmd = `sf data query --query "${query}" --use-tooling-api --json --target-org ${this.orgAlias}`;
            const result = JSON.parse(execSync(cmd, { encoding: 'utf8' }));
            
            if (result.status === 0 && result.result.records.length > 0) {
                const flow = result.result.records[0];
                const developerName = flow.Definition?.DeveloperName;
                
                if (developerName) {
                    return await this.deactivateByDeveloperName(developerName);
                }
            }
            
            console.log('❌ No active flow found with that label');
            return false;
            
        } catch (error) {
            console.error(`❌ Error: ${error.message}`);
            return false;
        }
    }

    /**
     * Deactivate multiple flows matching a filter
     */
    async deactivateMultiple(filter = '', options = {}) {
        console.log(`🔄 Deactivating flows matching: "${filter || '*'}"`);
        
        try {
            // Query for active flows
            let query = `
                SELECT Definition.DeveloperName, MasterLabel, Status, VersionNumber 
                FROM Flow 
                WHERE Status = 'Active'
            `.trim();
            
            if (filter) {
                query += ` AND (MasterLabel LIKE '%${filter}%' OR Definition.DeveloperName LIKE '%${filter}%')`;
            }
            
            query += ' ORDER BY MasterLabel';
            query = query.replace(/\s+/g, ' ');
            
            const cmd = `sf data query --query "${query}" --use-tooling-api --json --target-org ${this.orgAlias}`;
            const result = JSON.parse(execSync(cmd, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }));
            
            if (result.status !== 0 || !result.result.records.length) {
                console.log('No active flows found matching criteria');
                return true;
            }
            
            const flows = result.result.records;
            console.log(`\nFound ${flows.length} active flow(s) to deactivate`);
            
            if (!options.skipConfirmation) {
                flows.forEach(flow => {
                    console.log(`  - ${flow.MasterLabel} (${flow.Definition?.DeveloperName})`);
                });
                
                const response = await this.prompt('\nProceed with deactivation? (y/N): ');
                if (response.toLowerCase() !== 'y') {
                    console.log('Cancelled');
                    return false;
                }
            }
            
            // Deactivate each flow
            let successCount = 0;
            for (const flow of flows) {
                const developerName = flow.Definition?.DeveloperName;
                if (developerName) {
                    console.log(`\nDeactivating: ${flow.MasterLabel}`);
                    const success = await this.performDeactivation(developerName, flow);
                    if (success) successCount++;
                }
            }
            
            console.log(`\n✅ Deactivated ${successCount} of ${flows.length} flows`);
            return successCount === flows.length;
            
        } catch (error) {
            console.error(`❌ Error: ${error.message}`);
            return false;
        }
    }

    /**
     * Perform the actual deactivation
     */
    async performDeactivation(developerName, flowInfo) {
        try {
            // Create temp directory
            await fs.mkdir(this.tempDir, { recursive: true });
            const flowDir = path.join(this.tempDir, 'flows');
            await fs.mkdir(flowDir, { recursive: true });
            
            // Create deactivation metadata
            const flowPath = path.join(flowDir, `${developerName}.flow-meta.xml`);
            
            // Try to retrieve existing flow first
            let flowContent = null;
            try {
                const retrieveCmd = `sf project retrieve start --metadata "Flow:${developerName}" --target-org ${this.orgAlias} --output-dir ${this.tempDir}`;
                execSync(retrieveCmd, { encoding: 'utf8', stdio: 'pipe' });
                
                // Try to read retrieved file
                const retrievedPath = path.join(flowDir, `${developerName}.flow-meta.xml`);
                flowContent = await fs.readFile(retrievedPath, 'utf8').catch(() => null);
            } catch (e) {
                // Retrieval failed, will create minimal metadata
            }
            
            if (flowContent) {
                // Update existing content
                flowContent = flowContent.replace(
                    /<status>Active<\/status>/gi,
                    '<status>Inactive</status>'
                );
                
                if (!flowContent.includes('<status>')) {
                    flowContent = flowContent.replace(
                        '</Flow>',
                        '    <status>Inactive</status>\n</Flow>'
                    );
                }
            } else {
                // Create minimal deactivation metadata
                flowContent = `<?xml version="1.0" encoding="UTF-8"?>
<Flow xmlns="http://soap.sforce.com/2006/04/metadata">
    <apiVersion>62.0</apiVersion>
    <status>Inactive</status>
    <label>${flowInfo.MasterLabel || developerName}</label>
    <processType>${flowInfo.ProcessType || 'AutoLaunchedFlow'}</processType>
</Flow>`;
            }
            
            await fs.writeFile(flowPath, flowContent, 'utf8');
            
            // Deploy the deactivation
            const deployCmd = `sf project deploy start --source-dir "${flowDir}" --target-org ${this.orgAlias} --wait 10`;
            
            try {
                execSync(deployCmd, { encoding: 'utf8', stdio: 'pipe' });
                
                // Verify deactivation
                const updatedInfo = await this.getFlowInfo(developerName);
                if (updatedInfo && updatedInfo.Status !== 'Active') {
                    console.log(`   ✅ Flow deactivated successfully`);
                    return true;
                } else {
                    console.log(`   ⚠️ Flow may still be active`);
                    return false;
                }
            } catch (deployError) {
                console.error(`   ❌ Deployment failed: ${deployError.message}`);
                return false;
            }
            
        } catch (error) {
            console.error(`   ❌ Error: ${error.message}`);
            return false;
        } finally {
            // Cleanup
            await this.cleanup();
        }
    }

    /**
     * Get flow information
     */
    async getFlowInfo(developerName) {
        try {
            const query = `
                SELECT Id, MasterLabel, Status, VersionNumber, ProcessType 
                FROM Flow 
                WHERE Definition.DeveloperName = '${developerName}' 
                AND Status != 'Obsolete'
                ORDER BY VersionNumber DESC 
                LIMIT 1
            `.trim().replace(/\s+/g, ' ');
            
            const cmd = `sf data query --query "${query}" --use-tooling-api --json --target-org ${this.orgAlias}`;
            const result = JSON.parse(execSync(cmd, { encoding: 'utf8' }));
            
            if (result.status === 0 && result.result.records.length > 0) {
                return result.result.records[0];
            }
            
            return null;
        } catch (error) {
            return null;
        }
    }

    /**
     * Cleanup temporary files
     */
    async cleanup() {
        try {
            await fs.rm(this.tempDir, { recursive: true, force: true });
        } catch (error) {
            // Ignore cleanup errors
        }
    }

    /**
     * Simple prompt helper
     */
    async prompt(question) {
        const readline = require('readline').createInterface({
            input: process.stdin,
            output: process.stdout
        });
        
        return new Promise(resolve => {
            readline.question(question, answer => {
                readline.close();
                resolve(answer);
            });
        });
    }
}

// CLI Interface
async function main() {
    const args = process.argv.slice(2);
    
    // Parse arguments
    const options = {};
    for (let i = 0; i < args.length; i++) {
        if (args[i].startsWith('--')) {
            const key = args[i].slice(2);
            const value = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true;
            options[key] = value;
        }
    }
    
    const orgAlias = options.org || process.env.SF_TARGET_ORG || 'myorg';
    const deactivator = new FlowDeactivator(orgAlias);
    
    try {
        let success = false;
        
        if (options.flow) {
            // Deactivate by DeveloperName
            success = await deactivator.deactivateByDeveloperName(options.flow);
        } else if (options.label) {
            // Deactivate by MasterLabel
            success = await deactivator.deactivateByLabel(options.label);
        } else if (options.all) {
            // Deactivate multiple
            success = await deactivator.deactivateMultiple(options.filter, {
                skipConfirmation: options.force === true
            });
        } else {
            // Show help
            console.log('Flow Deactivator Utility\n');
            console.log('Usage:');
            console.log('  node flow-deactivator.js --flow <DeveloperName> --org <alias>');
            console.log('  node flow-deactivator.js --label <MasterLabel> --org <alias>');
            console.log('  node flow-deactivator.js --all [--filter <text>] --org <alias>');
            console.log('\nOptions:');
            console.log('  --flow <name>    - Flow DeveloperName to deactivate');
            console.log('  --label <label>  - Flow MasterLabel to deactivate');
            console.log('  --all            - Deactivate all active flows (or filtered)');
            console.log('  --filter <text>  - Filter flows when using --all');
            console.log('  --org <alias>    - Target org (default: SF_TARGET_ORG)');
            console.log('  --force          - Skip confirmation prompts');
            console.log('\nExamples:');
            console.log('  node flow-deactivator.js --flow "Lead_Assignment_v2" --org production');
            console.log('  node flow-deactivator.js --label "Lead Assignment Flow" --org production');
            console.log('  node flow-deactivator.js --all --filter "Old_" --org sandbox');
            process.exit(0);
        }
        
        process.exit(success ? 0 : 1);
        
    } catch (error) {
        console.error('\n❌ Error:', error.message);
        process.exit(1);
    }
}

// Export for use as module
module.exports = FlowDeactivator;

// Run if called directly
if (require.main === module) {
    main();
}