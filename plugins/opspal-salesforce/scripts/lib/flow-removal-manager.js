#!/usr/bin/env node

/**
 * Flow Removal Manager
 * 
 * Handles the two-phase process of removing flows from Salesforce:
 * Phase 1: Deactivate the flow (set Status to Inactive)
 * Phase 2: Delete the flow using destructive changes
 * 
 * This prevents the "flow requires manual deactivation" error
 * 
 * Usage:
 *   node flow-removal-manager.js remove --flow "FlowDeveloperName" --org myorg
 *   node flow-removal-manager.js deactivate --flow "FlowDeveloperName" --org myorg
 *   node flow-removal-manager.js delete --flow "FlowDeveloperName" --org myorg [--force]
 */

const { execSync } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

class FlowRemovalManager {
    constructor(orgAlias) {
        this.orgAlias = orgAlias;
        this.tempDir = path.join(__dirname, '..', '..', '.flow-removal-temp');
    }

    /**
     * Complete two-phase removal process
     */
    async removeFlow(flowDeveloperName, options = {}) {
        console.log(`🗑️ Starting two-phase removal for flow: ${flowDeveloperName}`);
        console.log('=' .repeat(60));
        
        try {
            // Step 1: Check current flow status
            const flowInfo = await this.getFlowInfo(flowDeveloperName);
            
            if (!flowInfo) {
                console.log('❌ Flow not found in org');
                return false;
            }
            
            console.log(`\n📋 Flow Information:`);
            console.log(`   MasterLabel: ${flowInfo.MasterLabel}`);
            console.log(`   Status: ${flowInfo.Status}`);
            console.log(`   Version: ${flowInfo.VersionNumber}`);
            
            // Step 2: Deactivate if active
            if (flowInfo.Status === 'Active') {
                console.log('\n⚠️ Flow is active - deactivation required');
                
                if (!options.skipConfirmation) {
                    const response = await this.prompt('Proceed with deactivation? (y/N): ');
                    if (response.toLowerCase() !== 'y') {
                        console.log('❌ Removal cancelled');
                        return false;
                    }
                }
                
                const deactivated = await this.deactivateFlow(flowDeveloperName);
                if (!deactivated) {
                    console.log('❌ Failed to deactivate flow');
                    return false;
                }
                
                // Wait a moment for Salesforce to process
                console.log('⏳ Waiting for deactivation to process...');
                await this.sleep(3000);
                
                // Verify deactivation
                const updatedInfo = await this.getFlowInfo(flowDeveloperName);
                if (updatedInfo && updatedInfo.Status === 'Active') {
                    console.log('❌ Flow is still active after deactivation attempt');
                    return false;
                }
            } else {
                console.log('\n✅ Flow is already inactive');
            }
            
            // Step 3: Delete the flow
            console.log('\n🗑️ Phase 2: Deleting flow...');
            
            if (!options.skipConfirmation) {
                const response = await this.prompt('Proceed with deletion? This cannot be undone! (y/N): ');
                if (response.toLowerCase() !== 'y') {
                    console.log('❌ Deletion cancelled');
                    return false;
                }
            }
            
            const deleted = await this.deleteFlow(flowDeveloperName);
            
            if (deleted) {
                console.log('\n✅ Flow successfully removed!');
                return true;
            } else {
                console.log('\n❌ Flow deletion failed');
                return false;
            }
            
        } catch (error) {
            console.error(`\n❌ Error during removal: ${error.message}`);
            return false;
        } finally {
            // Cleanup temp directory
            await this.cleanup();
        }
    }

    /**
     * Get flow information from Salesforce
     */
    async getFlowInfo(flowDeveloperName) {
        try {
            const query = `
                SELECT Id, MasterLabel, Status, VersionNumber, Description 
                FROM Flow 
                WHERE Definition.DeveloperName = '${flowDeveloperName}' 
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
            console.error(`Error querying flow: ${error.message}`);
            return null;
        }
    }

    /**
     * Phase 1: Deactivate a flow
     */
    async deactivateFlow(flowDeveloperName) {
        console.log(`\n📥 Phase 1: Deactivating flow...`);
        
        try {
            // Create temp directory
            await fs.mkdir(this.tempDir, { recursive: true });
            const flowDir = path.join(this.tempDir, 'flows');
            await fs.mkdir(flowDir, { recursive: true });
            
            // First, retrieve the current flow
            console.log('   Retrieving current flow metadata...');
            const retrieveCmd = `sf project retrieve start --metadata "Flow:${flowDeveloperName}" --target-org ${this.orgAlias} --output-dir ${this.tempDir}`;
            execSync(retrieveCmd, { encoding: 'utf8' });
            
            // Find the flow file
            const files = await fs.readdir(flowDir).catch(() => []);
            const flowFile = files.find(f => f.includes(flowDeveloperName));
            
            if (!flowFile) {
                // If not found, create a minimal flow file to deactivate
                console.log('   Creating deactivation metadata...');
                const flowPath = path.join(flowDir, `${flowDeveloperName}.flow-meta.xml`);
                const flowMetadata = `<?xml version="1.0" encoding="UTF-8"?>
<Flow xmlns="http://soap.sforce.com/2006/04/metadata">
    <apiVersion>62.0</apiVersion>
    <status>Inactive</status>
</Flow>`;
                await fs.writeFile(flowPath, flowMetadata, 'utf8');
            } else {
                // Update existing flow file to set status to Inactive
                const flowPath = path.join(flowDir, flowFile);
                let content = await fs.readFile(flowPath, 'utf8');
                
                // Replace status
                content = content.replace(
                    /<status>Active<\/status>/gi,
                    '<status>Inactive</status>'
                );
                
                // If no status tag exists, add it
                if (!content.includes('<status>')) {
                    content = content.replace(
                        '</Flow>',
                        '    <status>Inactive</status>\n</Flow>'
                    );
                }
                
                await fs.writeFile(flowPath, content, 'utf8');
            }
            
            // Deploy the deactivation
            console.log('   Deploying deactivation...');
            const deployCmd = `sf project deploy start --source-dir "${flowDir}" --target-org ${this.orgAlias} --wait 10`;
            
            try {
                const result = execSync(deployCmd, { encoding: 'utf8' });
                console.log('   ✅ Flow deactivated successfully');
                return true;
            } catch (deployError) {
                console.error('   ❌ Deactivation failed:', deployError.message);
                return false;
            }
            
        } catch (error) {
            console.error(`   ❌ Error during deactivation: ${error.message}`);
            return false;
        }
    }

    /**
     * Phase 2: Delete a flow using destructive changes
     */
    async deleteFlow(flowDeveloperName) {
        console.log(`   Creating destructive changes...`);
        
        try {
            // Create temp directory if not exists
            await fs.mkdir(this.tempDir, { recursive: true });
            const manifestDir = path.join(this.tempDir, 'manifest');
            await fs.mkdir(manifestDir, { recursive: true });
            
            // Create destructive changes file
            const destructiveChangesPath = path.join(manifestDir, 'destructiveChanges.xml');
            const destructiveChanges = `<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
    <types>
        <members>${flowDeveloperName}</members>
        <name>Flow</name>
    </types>
    <version>62.0</version>
</Package>`;
            
            await fs.writeFile(destructiveChangesPath, destructiveChanges, 'utf8');
            
            // Create empty package.xml
            const packagePath = path.join(manifestDir, 'package.xml');
            const emptyPackage = `<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
    <version>62.0</version>
</Package>`;
            
            await fs.writeFile(packagePath, emptyPackage, 'utf8');
            
            // Deploy destructive changes
            console.log('   Deploying deletion...');
            const deployCmd = `sf project deploy start --manifest "${packagePath}" --post-destructive-changes "${destructiveChangesPath}" --target-org ${this.orgAlias} --wait 10`;
            
            try {
                execSync(deployCmd, { encoding: 'utf8' });
                
                // Verify deletion
                const verifyInfo = await this.getFlowInfo(flowDeveloperName);
                if (!verifyInfo || verifyInfo.Status === 'Obsolete') {
                    console.log('   ✅ Flow deleted successfully');
                    return true;
                } else {
                    console.log('   ⚠️ Flow may not be fully deleted');
                    return false;
                }
            } catch (deployError) {
                console.error('   ❌ Deletion failed:', deployError.message);
                return false;
            }
            
        } catch (error) {
            console.error(`   ❌ Error during deletion: ${error.message}`);
            return false;
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

    /**
     * Sleep helper
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * List all flows in the org
     */
    async listFlows(filter = '') {
        try {
            let query = `
                SELECT Definition.DeveloperName, MasterLabel, Status, VersionNumber, 
                       ProcessType, LastModifiedDate 
                FROM Flow 
                WHERE Status != 'Obsolete'
            `.trim();
            
            if (filter) {
                query += ` AND (MasterLabel LIKE '%${filter}%' OR Definition.DeveloperName LIKE '%${filter}%')`;
            }
            
            query += ' ORDER BY MasterLabel, VersionNumber DESC';
            query = query.replace(/\s+/g, ' ');
            
            const cmd = `sf data query --query "${query}" --use-tooling-api --json --target-org ${this.orgAlias}`;
            const result = JSON.parse(execSync(cmd, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }));
            
            if (result.status === 0 && result.result.records.length > 0) {
                console.log('\n📋 Flows in org:');
                console.log('=' .repeat(80));
                
                const flows = {};
                result.result.records.forEach(flow => {
                    const devName = flow.Definition?.DeveloperName || 'Unknown';
                    if (!flows[devName] || flow.VersionNumber > flows[devName].VersionNumber) {
                        flows[devName] = flow;
                    }
                });
                
                Object.values(flows).forEach(flow => {
                    const devName = flow.Definition?.DeveloperName || 'Unknown';
                    const status = flow.Status === 'Active' ? '🟢' : '⚫';
                    console.log(`${status} ${flow.MasterLabel}`);
                    console.log(`   DeveloperName: ${devName}`);
                    console.log(`   Status: ${flow.Status} (v${flow.VersionNumber})`);
                    console.log(`   Type: ${flow.ProcessType}`);
                    console.log('');
                });
                
                console.log(`Total: ${Object.keys(flows).length} flows`);
                return flows;
            } else {
                console.log('No flows found');
                return {};
            }
            
        } catch (error) {
            console.error(`Error listing flows: ${error.message}`);
            return {};
        }
    }
}

// CLI Interface
async function main() {
    const args = process.argv.slice(2);
    const command = args[0];
    
    // Parse arguments
    const options = {};
    for (let i = 1; i < args.length; i++) {
        if (args[i].startsWith('--')) {
            const key = args[i].slice(2);
            const value = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true;
            options[key] = value;
        }
    }
    
    const orgAlias = options.org || process.env.SF_TARGET_ORG || 'myorg';
    const manager = new FlowRemovalManager(orgAlias);
    
    try {
        switch (command) {
            case 'remove':
                if (!options.flow) {
                    console.error('❌ Required: --flow "FlowDeveloperName"');
                    process.exit(1);
                }
                const removed = await manager.removeFlow(options.flow, {
                    skipConfirmation: options.force === true
                });
                process.exit(removed ? 0 : 1);
                break;
                
            case 'deactivate':
                if (!options.flow) {
                    console.error('❌ Required: --flow "FlowDeveloperName"');
                    process.exit(1);
                }
                const deactivated = await manager.deactivateFlow(options.flow);
                process.exit(deactivated ? 0 : 1);
                break;
                
            case 'delete':
                if (!options.flow) {
                    console.error('❌ Required: --flow "FlowDeveloperName"');
                    process.exit(1);
                }
                
                // Check if flow is active first
                const info = await manager.getFlowInfo(options.flow);
                if (info && info.Status === 'Active' && !options.force) {
                    console.error('❌ Cannot delete active flow. Deactivate first or use --force');
                    process.exit(1);
                }
                
                const deleted = await manager.deleteFlow(options.flow);
                process.exit(deleted ? 0 : 1);
                break;
                
            case 'list':
                await manager.listFlows(options.filter);
                break;
                
            case 'info':
                if (!options.flow) {
                    console.error('❌ Required: --flow "FlowDeveloperName"');
                    process.exit(1);
                }
                const flowInfo = await manager.getFlowInfo(options.flow);
                if (flowInfo) {
                    console.log('\n📋 Flow Information:');
                    console.log(JSON.stringify(flowInfo, null, 2));
                } else {
                    console.log('❌ Flow not found');
                }
                break;
                
            default:
                console.log('Flow Removal Manager\n');
                console.log('Commands:');
                console.log('  remove      - Complete two-phase removal (deactivate + delete)');
                console.log('  deactivate  - Deactivate a flow only');
                console.log('  delete      - Delete a flow (must be inactive)');
                console.log('  list        - List all flows in org');
                console.log('  info        - Get flow information');
                console.log('\nOptions:');
                console.log('  --flow <name>   - Flow DeveloperName');
                console.log('  --org <alias>   - Target org');
                console.log('  --force         - Skip confirmations');
                console.log('  --filter <text> - Filter for list command');
                console.log('\nExamples:');
                console.log('  node flow-removal-manager.js remove --flow "Order_Processing_v2" --org myorg');
                console.log('  node flow-removal-manager.js deactivate --flow "Old_Lead_Flow" --org myorg');
                console.log('  node flow-removal-manager.js list --filter "Lead" --org myorg');
                console.log('\nNote: Flows must be deactivated before deletion!');
        }
    } catch (error) {
        console.error('\n❌ Error:', error.message);
        process.exit(1);
    }
}

// Export for use as module
module.exports = FlowRemovalManager;

// Run if called directly
if (require.main === module) {
    main();
}