#!/usr/bin/env node

/**
 * Flow Discovery & Mapping Service
 * 
 * CRITICAL: This service prevents flow deployment failures by ensuring
 * we always UPDATE existing flows rather than creating duplicates.
 * 
 * The primary issue this solves:
 * - Salesforce flows have MasterLabel (display name) like "Opp: Contract Generation"
 * - But DeveloperName (API name) like "Opp_Contract_Generation_v2"
 * - Deploying with wrong name creates NEW flow instead of updating existing
 * 
 * Usage:
 *   node flow-discovery-mapper.js discover --org myorg
 *   node flow-discovery-mapper.js map --label "Opp: Contract Generation" --org myorg
 *   node flow-discovery-mapper.js validate --file MyFlow.flow-meta.xml --org myorg
 */

const { execSync } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

class FlowDiscoveryMapper {
    constructor(orgAlias) {
        this.orgAlias = orgAlias;
        this.mappingFile = path.join(__dirname, '..', '..', `.flow-mappings-${orgAlias}.json`);
        this.mappings = {};
    }

    /**
     * Load existing mappings from file
     */
    async loadMappings() {
        try {
            const data = await fs.readFile(this.mappingFile, 'utf8');
            this.mappings = JSON.parse(data);
            console.log(`📚 Loaded ${Object.keys(this.mappings).length} flow mappings`);
        } catch (error) {
            if (error.code !== 'ENOENT') {
                console.error('⚠️ Error loading mappings:', error.message);
            }
            this.mappings = {};
        }
    }

    /**
     * Save mappings to file
     */
    async saveMappings() {
        try {
            await fs.writeFile(
                this.mappingFile, 
                JSON.stringify(this.mappings, null, 2),
                'utf8'
            );
            console.log(`💾 Saved ${Object.keys(this.mappings).length} flow mappings`);
        } catch (error) {
            console.error('❌ Error saving mappings:', error.message);
        }
    }

    /**
     * Discover all flows in the org and create mappings
     */
    async discoverFlows() {
        console.log(`🔍 Discovering all flows in org: ${this.orgAlias}`);
        
        try {
            // Query both active and inactive flows to get complete picture
            const query = `
                SELECT Id, DeveloperName, MasterLabel, VersionNumber,
                       Status, ProcessType, Description,
                       LastModifiedDate, CreatedDate
                FROM Flow
                ORDER BY MasterLabel, VersionNumber DESC
            `.trim().replace(/\s+/g, ' ');
            
            const cmd = `sf data query --query "${query}" --use-tooling-api --json --target-org ${this.orgAlias}`;
            const result = JSON.parse(execSync(cmd, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }));
            
            if (result.status !== 0) {
                throw new Error(`Query failed: ${result.message}`);
            }
            
            const flows = result.result.records || [];
            console.log(`📊 Found ${flows.length} flow versions in org`);
            
            // Group by MasterLabel to get latest version of each flow
            const flowsByLabel = {};
            flows.forEach(flow => {
                const label = flow.MasterLabel;
                if (!flowsByLabel[label] || 
                    flow.VersionNumber > flowsByLabel[label].VersionNumber) {
                    flowsByLabel[label] = flow;
                }
            });
            
            // Create mappings
            this.mappings = {};
            for (const [label, flow] of Object.entries(flowsByLabel)) {
                // Generate expected file name from DeveloperName
                const fileName = `${flow.DeveloperName}.flow-meta.xml`;
                
                this.mappings[label] = {
                    developerName: flow.DeveloperName,
                    fileName: fileName,
                    lastKnownVersion: flow.VersionNumber,
                    status: flow.Status,
                    processType: flow.ProcessType,
                    lastModified: flow.LastModifiedDate,
                    id: flow.Id,
                    // Track if name follows standard pattern
                    hasNonStandardName: this.detectNonStandardName(label, flow.DeveloperName)
                };
            }
            
            await this.saveMappings();
            
            // Report findings
            console.log('\n📋 Flow Discovery Summary:');
            console.log(`   Total unique flows: ${Object.keys(this.mappings).length}`);
            
            const nonStandard = Object.entries(this.mappings)
                .filter(([_, mapping]) => mapping.hasNonStandardName);
            
            if (nonStandard.length > 0) {
                console.log('\n⚠️  Flows with non-standard naming:');
                nonStandard.forEach(([label, mapping]) => {
                    console.log(`   - "${label}" → ${mapping.developerName}`);
                });
            }
            
            return this.mappings;
            
        } catch (error) {
            console.error('❌ Flow discovery failed:', error.message);
            throw error;
        }
    }

    /**
     * Detect if DeveloperName doesn't follow standard pattern from MasterLabel
     */
    detectNonStandardName(masterLabel, developerName) {
        // Standard pattern: replace spaces and special chars with underscores
        const expectedName = masterLabel
            .replace(/[:\s\-\/\\]/g, '_')  // Replace common separators
            .replace(/[^a-zA-Z0-9_]/g, '')  // Remove other special chars
            .replace(/_+/g, '_')             // Collapse multiple underscores
            .replace(/^_|_$/g, '');          // Trim underscores
        
        // Check if developer name starts with expected pattern
        // (may have version suffix like _v2)
        return !developerName.startsWith(expectedName);
    }

    /**
     * Get mapping for a specific flow by label
     */
    async getFlowMapping(masterLabel) {
        await this.loadMappings();
        
        if (this.mappings[masterLabel]) {
            return this.mappings[masterLabel];
        }
        
        // Try case-insensitive search
        const labelLower = masterLabel.toLowerCase();
        for (const [label, mapping] of Object.entries(this.mappings)) {
            if (label.toLowerCase() === labelLower) {
                console.log(`ℹ️ Found mapping with different case: "${label}"`);
                return mapping;
            }
        }
        
        // Try partial match
        const partialMatches = Object.entries(this.mappings)
            .filter(([label]) => label.includes(masterLabel) || masterLabel.includes(label));
        
        if (partialMatches.length === 1) {
            console.log(`ℹ️ Found partial match: "${partialMatches[0][0]}"`);
            return partialMatches[0][1];
        } else if (partialMatches.length > 1) {
            console.log('⚠️ Multiple partial matches found:');
            partialMatches.forEach(([label]) => console.log(`   - ${label}`));
        }
        
        return null;
    }

    /**
     * Validate a flow file before deployment
     */
    async validateFlowFile(flowFilePath) {
        console.log(`🔍 Validating flow file: ${flowFilePath}`);
        
        try {
            // Parse flow file to get MasterLabel
            const content = await fs.readFile(flowFilePath, 'utf8');
            const labelMatch = content.match(/<label>([^<]+)<\/label>/);
            
            if (!labelMatch) {
                console.error('❌ Could not find <label> in flow file');
                return false;
            }
            
            const masterLabel = labelMatch[1];
            console.log(`📝 Flow label: "${masterLabel}"`);
            
            // Get mapping
            const mapping = await this.getFlowMapping(masterLabel);
            
            if (!mapping) {
                console.log('⚠️ No existing flow found with this label');
                console.log('   This will CREATE a new flow, not update existing');
                
                // Discover flows to get latest info
                await this.discoverFlows();
                
                return {
                    valid: false,
                    isNew: true,
                    masterLabel,
                    message: 'Will create NEW flow - no existing flow with this label'
                };
            }
            
            // Check if file name matches expected
            const fileName = path.basename(flowFilePath);
            const expectedFileName = mapping.fileName;
            
            if (fileName !== expectedFileName) {
                console.log(`⚠️ File name mismatch!`);
                console.log(`   Current: ${fileName}`);
                console.log(`   Expected: ${expectedFileName}`);
                console.log(`   DeveloperName in org: ${mapping.developerName}`);
                
                return {
                    valid: false,
                    isNew: false,
                    masterLabel,
                    mapping,
                    message: `File should be named ${expectedFileName} to update existing flow`,
                    suggestion: `Rename file or use DeveloperName: ${mapping.developerName}`
                };
            }
            
            console.log('✅ Flow file validated successfully');
            console.log(`   Will update: ${mapping.developerName} (v${mapping.lastKnownVersion})`);
            
            return {
                valid: true,
                isNew: false,
                masterLabel,
                mapping,
                message: 'Ready to update existing flow'
            };
            
        } catch (error) {
            console.error('❌ Validation failed:', error.message);
            return {
                valid: false,
                error: error.message
            };
        }
    }

    /**
     * Retrieve a flow with correct DeveloperName
     */
    async retrieveFlow(masterLabel) {
        console.log(`📥 Retrieving flow: "${masterLabel}"`);
        
        const mapping = await this.getFlowMapping(masterLabel);
        
        if (!mapping) {
            console.error('❌ No mapping found for this flow');
            console.log('   Run discovery first: node flow-discovery-mapper.js discover');
            return false;
        }
        
        console.log(`   DeveloperName: ${mapping.developerName}`);
        console.log(`   Current version: ${mapping.lastKnownVersion}`);
        console.log(`   Status: ${mapping.status}`);
        
        try {
            const cmd = `sf project retrieve start --metadata "Flow:${mapping.developerName}" --target-org ${this.orgAlias}`;
            console.log(`\n📡 Executing: ${cmd}`);
            
            const result = execSync(cmd, { encoding: 'utf8' });
            console.log(result);
            
            console.log('✅ Flow retrieved successfully');
            console.log(`   Check: force-app/main/default/flows/${mapping.fileName}`);
            
            return true;
            
        } catch (error) {
            console.error('❌ Retrieval failed:', error.message);
            return false;
        }
    }
}

// CLI Interface
async function main() {
    const args = process.argv.slice(2);
    const command = args[0];
    
    // Parse arguments
    const options = {};
    for (let i = 1; i < args.length; i += 2) {
        if (args[i].startsWith('--')) {
            options[args[i].slice(2)] = args[i + 1];
        }
    }
    
    const orgAlias = options.org || process.env.SF_TARGET_ORG || 'myorg';
    const mapper = new FlowDiscoveryMapper(orgAlias);
    
    try {
        switch (command) {
            case 'discover':
                console.log('🚀 Starting flow discovery...\n');
                await mapper.discoverFlows();
                break;
                
            case 'map':
                if (!options.label) {
                    console.error('❌ Required: --label "Flow Master Label"');
                    process.exit(1);
                }
                const mapping = await mapper.getFlowMapping(options.label);
                if (mapping) {
                    console.log('\n📋 Flow Mapping:');
                    console.log(JSON.stringify(mapping, null, 2));
                } else {
                    console.log('❌ No mapping found');
                }
                break;
                
            case 'validate':
                if (!options.file) {
                    console.error('❌ Required: --file path/to/flow.flow-meta.xml');
                    process.exit(1);
                }
                const validation = await mapper.validateFlowFile(options.file);
                if (!validation.valid) {
                    process.exit(1);
                }
                break;
                
            case 'retrieve':
                if (!options.label) {
                    console.error('❌ Required: --label "Flow Master Label"');
                    process.exit(1);
                }
                const success = await mapper.retrieveFlow(options.label);
                if (!success) {
                    process.exit(1);
                }
                break;
                
            default:
                console.log('Flow Discovery & Mapping Service\n');
                console.log('Commands:');
                console.log('  discover              - Discover all flows in org');
                console.log('  map --label "..."     - Get mapping for specific flow');
                console.log('  validate --file ...   - Validate flow file before deployment');
                console.log('  retrieve --label "..." - Retrieve flow with correct name');
                console.log('\nOptions:');
                console.log('  --org <alias>         - Target org (default: SF_TARGET_ORG)');
                console.log('\nExamples:');
                console.log('  node flow-discovery-mapper.js discover --org myorg');
                console.log('  node flow-discovery-mapper.js map --label "Opp: Contract Generation" --org myorg');
                console.log('  node flow-discovery-mapper.js validate --file MyFlow.flow-meta.xml --org myorg');
                console.log('  node flow-discovery-mapper.js retrieve --label "Quote to Subscription Sync" --org myorg');
        }
    } catch (error) {
        console.error('\n❌ Error:', error.message);
        process.exit(1);
    }
}

// Export for use as module
module.exports = FlowDiscoveryMapper;

// Run if called directly
if (require.main === module) {
    main();
}