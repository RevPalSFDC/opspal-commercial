#!/usr/bin/env node

/**
 * Flow Deployment Wrapper
 * 
 * CRITICAL: This wrapper ensures flows are ALWAYS updated, never duplicated.
 * It enforces the correct deployment process:
 * 1. Discover existing flow
 * 2. Retrieve with correct DeveloperName
 * 3. Update and deploy
 * 4. Verify version increment
 * 
 * Usage:
 *   node flow-deployment-wrapper.js deploy --file MyFlow.flow-meta.xml --org myorg
 *   node flow-deployment-wrapper.js deploy --label "My Flow Label" --org myorg
 */

const { execSync } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const FlowDiscoveryMapper = require('./flow-discovery-mapper');

function getPlaybookVersion(playbookPath) {
    try {
        const repoRoot = path.resolve(__dirname, '..', '..');
        const output = execSync(`git -C "${repoRoot}" log -1 --pretty=format:%h -- "${playbookPath}"`, {
            stdio: ['ignore', 'pipe', 'ignore'],
        }).toString().trim();
        return output || 'untracked';
    } catch (error) {
        return 'unknown';
    }
}

function logPlaybookUsage() {
    const retrievalVersion = getPlaybookVersion('docs/playbooks/metadata-retrieval.md');
    const validationVersion = getPlaybookVersion('docs/playbooks/pre-deployment-validation.md');
    const rollbackVersion = getPlaybookVersion('docs/playbooks/deployment-rollback.md');
    console.log(`📘 Playbook: docs/playbooks/metadata-retrieval.md (version: ${retrievalVersion})`);
    console.log(`📘 Playbook: docs/playbooks/pre-deployment-validation.md (version: ${validationVersion})`);
    console.log(`📘 Playbook: docs/playbooks/deployment-rollback.md (version: ${rollbackVersion})`);
}

class FlowDeploymentWrapper {
    constructor(orgAlias) {
        this.orgAlias = orgAlias;
        this.mapper = new FlowDiscoveryMapper(orgAlias);
        logPlaybookUsage();
    }

    /**
     * Deploy a flow ensuring it updates existing rather than creates new
     */
    async deployFlow(options) {
        const { file, label, skipValidation = false } = options;
        
        console.log('🚀 Flow Deployment Wrapper - Preventing Duplicate Flows');
        console.log('=' * 55);
        
        try {
            // Step 1: Determine what we're deploying
            let masterLabel, flowFilePath;
            
            if (file) {
                flowFilePath = path.resolve(file);
                masterLabel = await this.extractLabelFromFile(flowFilePath);
            } else if (label) {
                masterLabel = label;
            } else {
                throw new Error('Either --file or --label must be specified');
            }
            
            console.log(`\n📋 Flow to deploy: "${masterLabel}"`);
            
            // Step 2: Discover if flow exists
            console.log('\n🔍 Step 1: Checking for existing flow...');
            await this.mapper.discoverFlows();
            const mapping = await this.mapper.getFlowMapping(masterLabel);
            
            if (!mapping) {
                console.log('ℹ️ No existing flow found with this label');
                
                if (!skipValidation) {
                    const response = await this.prompt('Create NEW flow? (y/N): ');
                    if (response.toLowerCase() !== 'y') {
                        console.log('❌ Deployment cancelled');
                        return false;
                    }
                }
                
                // Deploy as new flow
                return await this.deployNewFlow(flowFilePath || masterLabel);
            }
            
            // Step 3: Flow exists - ensure we update it
            console.log(`✅ Found existing flow: ${mapping.developerName}`);
            console.log(`   Current version: ${mapping.lastKnownVersion}`);
            console.log(`   Status: ${mapping.status}`);
            
            // Step 4: If file provided, validate it matches
            if (flowFilePath) {
                const fileName = path.basename(flowFilePath);
                const expectedFileName = mapping.fileName;
                
                if (fileName !== expectedFileName) {
                    console.log(`\n⚠️ WARNING: File name mismatch!`);
                    console.log(`   Your file: ${fileName}`);
                    console.log(`   Expected: ${expectedFileName}`);
                    console.log(`   This would create a DUPLICATE flow!`);
                    
                    if (!skipValidation) {
                        console.log('\n📝 Options:');
                        console.log(`   1. Rename your file to: ${expectedFileName}`);
                        console.log(`   2. Retrieve existing flow and modify it`);
                        
                        const response = await this.prompt('\nRetrieve existing flow? (Y/n): ');
                        if (response.toLowerCase() !== 'n') {
                            await this.retrieveAndPrepareFlow(mapping);
                            console.log(`\n✅ Flow retrieved to: force-app/main/default/flows/${mapping.fileName}`);
                            console.log('   Please modify this file and run deployment again');
                            return false;
                        }
                    }
                    
                    throw new Error('File name mismatch would create duplicate flow');
                }
            } else {
                // No file provided, retrieve existing
                console.log('\n📥 Step 2: Retrieving existing flow...');
                await this.retrieveAndPrepareFlow(mapping);
                flowFilePath = path.join('force-app/main/default/flows', mapping.fileName);
                console.log(`✅ Retrieved to: ${flowFilePath}`);
            }

            // Step 4.5: Validate API version (NEW)
            console.log('\n🔍 Step 2.5: Validating API version compatibility...');
            const versionCheck = await this.validateApiVersion(flowFilePath);

            if (!versionCheck.valid) {
                console.log(`\n❌ API version incompatibility detected!`);
                console.log(`   ${versionCheck.recommendation}`);

                if (!skipValidation) {
                    const response = await this.prompt('\nProceed anyway? (y/N): ');
                    if (response.toLowerCase() !== 'y') {
                        console.log('❌ Deployment cancelled');
                        return false;
                    }
                } else {
                    throw new Error('API version incompatibility');
                }
            } else if (versionCheck.warning) {
                console.log(`\n⚠️  ${versionCheck.recommendation}`);
            }

            // Step 5: Deploy the flow
            console.log('\n📦 Step 3: Deploying flow update...');
            const deployed = await this.deployExistingFlow(mapping, flowFilePath);
            
            if (!deployed) {
                throw new Error('Deployment failed');
            }
            
            // Step 6: Verify version increment
            console.log('\n🔍 Step 4: Verifying deployment...');
            const newVersion = await this.verifyVersionIncrement(mapping);
            
            if (newVersion > mapping.lastKnownVersion) {
                console.log(`✅ Successfully updated flow!`);
                console.log(`   Version: ${mapping.lastKnownVersion} → ${newVersion}`);
                return true;
            } else {
                console.log('⚠️ Flow deployed but version not incremented');
                console.log('   This might indicate the flow was not actually updated');
                return false;
            }
            
        } catch (error) {
            console.error(`\n❌ Deployment failed: ${error.message}`);
            return false;
        }
    }

    /**
     * Extract MasterLabel from flow file
     */
    async extractLabelFromFile(filePath) {
        try {
            const content = await fs.readFile(filePath, 'utf8');
            const match = content.match(/<label>([^<]+)<\/label>/);
            if (match) {
                return match[1];
            }
            throw new Error('Could not find <label> in flow file');
        } catch (error) {
            throw new Error(`Failed to read flow file: ${error.message}`);
        }
    }

    /**
     * Validate Flow API version compatibility (NEW)
     * Checks if Flow API version is compatible with target org
     */
    async validateApiVersion(filePath) {
        try {
            const content = await fs.readFile(filePath, 'utf8');

            // Extract Flow API version
            const versionMatch = content.match(/<apiVersion>([0-9.]+)<\/apiVersion>/);
            if (!versionMatch) {
                console.log('   ⚠️  No API version found in Flow - using default');
                return { valid: true };
            }

            const flowVersion = parseFloat(versionMatch[1]);
            console.log(`   Flow API Version: ${flowVersion}`);

            // Get org API version
            try {
                const result = execSync(
                    `sf org display --target-org ${this.orgAlias} --json`,
                    { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
                );
                const orgInfo = JSON.parse(result);
                const orgVersion = parseFloat(orgInfo.result.apiVersion);
                console.log(`   Org API Version: ${orgVersion}`);

                // Check compatibility
                if (flowVersion > orgVersion) {
                    console.log(`\n⚠️  API VERSION MISMATCH!`);
                    console.log(`   Flow uses v${flowVersion}, but org supports up to v${orgVersion}`);
                    console.log(`   This may cause deployment failure.`);

                    // Check for version-specific properties
                    const versionSpecificIssues = this.checkVersionSpecificProperties(content, flowVersion, orgVersion);

                    if (versionSpecificIssues.length > 0) {
                        console.log(`\n❌ CRITICAL: Version-specific properties detected:`);
                        versionSpecificIssues.forEach(issue => {
                            console.log(`   - ${issue.property}: Only available in v${issue.minVersion}+`);
                        });

                        return {
                            valid: false,
                            flowVersion,
                            orgVersion,
                            issues: versionSpecificIssues,
                            recommendation: `Downgrade Flow to API v${orgVersion} and remove version-specific properties`
                        };
                    }

                    return {
                        valid: true, // Warn but allow (might work)
                        warning: true,
                        flowVersion,
                        orgVersion,
                        recommendation: `Consider downgrading Flow to API v${orgVersion} for compatibility`
                    };
                }

                console.log(`   ✅ API version compatible`);
                return { valid: true, flowVersion, orgVersion };

            } catch (error) {
                console.log(`   ⚠️  Could not verify org API version: ${error.message}`);
                return { valid: true }; // Allow deployment if we can't check
            }

        } catch (error) {
            console.log(`   ⚠️  API version check failed: ${error.message}`);
            return { valid: true }; // Allow deployment if validation fails
        }
    }

    /**
     * Check for version-specific Flow properties
     */
    checkVersionSpecificProperties(flowContent, flowVersion, orgVersion) {
        const issues = [];

        // List of version-specific properties
        const versionSpecificProps = [
            { property: 'areMetricsLoggedToDataCloud', minVersion: 62.0, pattern: /<areMetricsLoggedToDataCloud>/ },
            { property: 'areTimeResumeValuesStored', minVersion: 62.0, pattern: /<areTimeResumeValuesStored>/ },
            { property: 'dataType (DateTime)', minVersion: 61.0, pattern: /<dataType>DateTime<\/dataType>/ },
            // Add more as discovered
        ];

        for (const prop of versionSpecificProps) {
            if (prop.minVersion > orgVersion && prop.pattern.test(flowContent)) {
                issues.push({
                    property: prop.property,
                    minVersion: prop.minVersion,
                    currentOrgVersion: orgVersion
                });
            }
        }

        return issues;
    }

    /**
     * Retrieve existing flow for modification
     */
    async retrieveAndPrepareFlow(mapping) {
        const cmd = `sf project retrieve start --metadata "Flow:${mapping.developerName}" --target-org ${this.orgAlias}`;
        
        try {
            console.log(`   Executing: ${cmd}`);
            execSync(cmd, { encoding: 'utf8' });
            
            // Backup existing if present
            const flowPath = path.join('force-app/main/default/flows', mapping.fileName);
            const backupPath = flowPath + '.backup-' + new Date().toISOString().slice(0, 10);
            
            try {
                await fs.copyFile(flowPath, backupPath);
                console.log(`   Backup created: ${backupPath}`);
            } catch (e) {
                // File might not exist yet
            }
            
            return true;
        } catch (error) {
            throw new Error(`Failed to retrieve flow: ${error.message}`);
        }
    }

    /**
     * Deploy an existing flow (update)
     */
    async deployExistingFlow(mapping, filePath) {
        try {
            // Ensure file has correct name
            const correctPath = path.join(path.dirname(filePath), mapping.fileName);
            if (filePath !== correctPath) {
                await fs.rename(filePath, correctPath);
                console.log(`   Renamed file to: ${mapping.fileName}`);
                filePath = correctPath;
            }
            
            const cmd = `sf project deploy start --source-dir "${path.dirname(filePath)}" --target-org ${this.orgAlias} --wait 10`;
            console.log(`   Executing: ${cmd}`);
            
            const result = execSync(cmd, { encoding: 'utf8' });
            console.log('   Deployment output:', result);
            
            return true;
        } catch (error) {
            console.error('   Deployment error:', error.message);
            return false;
        }
    }

    /**
     * Deploy a new flow (create)
     */
    async deployNewFlow(filePathOrLabel) {
        try {
            let filePath;
            
            if (filePathOrLabel.endsWith('.xml')) {
                filePath = filePathOrLabel;
            } else {
                // Create a basic flow file
                console.log('   Creating new flow from template...');
                // This would need a template or user would provide file
                throw new Error('Creating new flows requires a flow file');
            }
            
            const cmd = `sf project deploy start --source-dir "${path.dirname(filePath)}" --target-org ${this.orgAlias} --wait 10`;
            console.log(`   Executing: ${cmd}`);
            
            const result = execSync(cmd, { encoding: 'utf8' });
            console.log('   Deployment output:', result);
            
            return true;
        } catch (error) {
            console.error('   Deployment error:', error.message);
            return false;
        }
    }

    /**
     * Verify the flow version was incremented
     */
    async verifyVersionIncrement(oldMapping) {
        try {
            const query = `
                SELECT VersionNumber, Status, LastModifiedDate
                FROM Flow 
                WHERE DeveloperName = '${oldMapping.developerName}'
                ORDER BY VersionNumber DESC
                LIMIT 1
            `.trim().replace(/\s+/g, ' ');
            
            const cmd = `sf data query --query "${query}" --use-tooling-api --json --target-org ${this.orgAlias}`;
            const result = JSON.parse(execSync(cmd, { encoding: 'utf8' }));
            
            if (result.status === 0 && result.result.records.length > 0) {
                const flow = result.result.records[0];
                return flow.VersionNumber;
            }
            
            return oldMapping.lastKnownVersion;
        } catch (error) {
            console.error('   Verification error:', error.message);
            return oldMapping.lastKnownVersion;
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
     * Run post-deployment tests
     */
    async runPostDeploymentTests(flowLabel) {
        console.log('\n🧪 Running post-deployment tests...');
        
        try {
            // Test 1: Check flow is active
            const activeQuery = `
                SELECT Id, ApiName, IsActive 
                FROM FlowDefinitionView 
                WHERE Label = '${flowLabel}' AND IsActive = true
            `.trim().replace(/\s+/g, ' ');
            
            const cmd = `sf data query --query "${activeQuery}" --use-tooling-api --json --target-org ${this.orgAlias}`;
            const result = JSON.parse(execSync(cmd, { encoding: 'utf8' }));
            
            if (result.status === 0 && result.result.totalSize > 0) {
                console.log('   ✅ Flow is active');
            } else {
                console.log('   ⚠️ Flow is not active');
            }
            
            // Additional tests could be added here

        } catch (error) {
            console.error('   Test error:', error.message);
        }
    }

    /**
     * Check activation permissions before attempting
     * Part of Phase 0.5: Security & Permission Escalation Warnings
     */
    async checkActivationPermissions(flowName) {
        this.log('Checking activation permissions...');

        try {
            // Check if user has ManageFlows permission
            const userInfo = await this.getUserInfo();

            if (!userInfo.profile.includes('System Administrator')) {
                console.log('⚠️  WARNING: You are not a System Administrator');
            }

            // Check if flow has Apex invocations
            const hasApexInvocation = await this.detectApexInvocation(flowName);

            if (hasApexInvocation && !userInfo.profile.includes('System Administrator')) {
                console.log('\n' + '⚠️ '.repeat(40));
                console.log('🚨 PERMISSION ESCALATION REQUIRED');
                console.log('⚠️ '.repeat(40));
                console.log('\nThis flow invokes Apex and requires System Administrator privileges to activate.');
                console.log('\nOptions:');
                console.log('  1. Use Apex activation service (automatic fallback)');
                console.log('  2. Request System Administrator to activate manually');
                console.log('  3. Deploy as inactive and activate later');
                console.log('\nProceeding with Apex activation service...\n');

                return {
                    requiresEscalation: true,
                    method: 'apex_service',
                    reason: 'Flow invokes Apex - System Admin required'
                };
            }

            return {
                requiresEscalation: false,
                method: 'metadata_api'
            };

        } catch (error) {
            if (error.message.includes('INSUFFICIENT_ACCESS')) {
                console.log('\n' + '❌ '.repeat(40));
                console.log('🔒 INSUFFICIENT ACCESS');
                console.log('❌ '.repeat(40));
                console.log('\nYou do not have permission to check user info or activate flows.');
                console.log('\nRequired Permissions:');
                console.log('  - ManageFlows (standard)');
                console.log('  - Flow_Activation_API (custom permission for Apex service)');
                console.log('\nAction Required:');
                console.log('  Contact your Salesforce administrator to grant the required permissions.');
                console.log('\nTemporary Workaround:');
                console.log('  Deploy flow as inactive: --deploy-inactive flag');
                console.log('  Then activate manually via Setup UI\n');

                throw new Error('INSUFFICIENT_ACCESS: Cannot activate flow without required permissions');
            }

            throw error;
        }
    }

    /**
     * Activate with automatic fallback handling
     * Part of Phase 0.5: Security & Permission Escalation Warnings
     */
    async activateWithFallback(flowName) {
        // Check permissions first
        const permissionCheck = await this.checkActivationPermissions(flowName);

        if (permissionCheck.requiresEscalation) {
            console.log(`Using ${permissionCheck.method} due to: ${permissionCheck.reason}`);

            try {
                if (permissionCheck.method === 'apex_service') {
                    return await this.activateViaApexService(flowName);
                }
            } catch (error) {
                if (error.message.includes('INSUFFICIENT_ACCESS')) {
                    console.log('\n⚠️  Apex activation service also failed due to permissions');
                    console.log('Falling back to: Deploy inactive + manual activation guide\n');

                    this.generateManualActivationGuide(flowName);

                    return {
                        success: false,
                        requiresManualActivation: true,
                        message: 'Flow deployed but not activated - manual activation required'
                    };
                }

                throw error;
            }
        }

        // Standard activation
        return await this.activateViaMetadataAPI(flowName);
    }

    /**
     * Generate manual activation guide
     * Part of Phase 0.5: Security & Permission Escalation Warnings
     */
    generateManualActivationGuide(flowName) {
        console.log('\n' + '='.repeat(80));
        console.log('📋 MANUAL ACTIVATION GUIDE');
        console.log('='.repeat(80));
        console.log(`\nFlow Name: ${flowName}`);
        console.log('\nSteps to activate manually:');
        console.log('  1. Open Salesforce Setup');
        console.log('  2. Search for "Flows" in Quick Find');
        console.log(`  3. Find flow: ${flowName}`);
        console.log('  4. Click "Activate" button');
        console.log('  5. Verify activation in flow list');
        console.log('\nAlternative (CLI):');
        console.log(`  sf data update record --sobject FlowDefinition --where "DeveloperName='${flowName}'" --values "ActiveVersionNumber=<latest_version>" --use-tooling-api`);
        console.log('\n' + '='.repeat(80) + '\n');

        // Also save to file
        const guideFile = `./manual-activation-guide-${flowName}.txt`;
        require('fs').writeFileSync(guideFile, this.formatManualActivationGuide(flowName), 'utf8');
        console.log(`Guide saved to: ${guideFile}\n`);
    }

    /**
     * Format manual activation guide for file output
     * Part of Phase 0.5: Security & Permission Escalation Warnings
     */
    formatManualActivationGuide(flowName) {
        return `
MANUAL ACTIVATION GUIDE
=======================

Flow Name: ${flowName}
Generated: ${new Date().toISOString()}

STEPS TO ACTIVATE MANUALLY:

1. Open Salesforce Setup
2. Search for "Flows" in Quick Find
3. Find flow: ${flowName}
4. Click "Activate" button
5. Verify activation in flow list

ALTERNATIVE (CLI):

sf data update record --sobject FlowDefinition --where "DeveloperName='${flowName}'" --values "ActiveVersionNumber=<latest_version>" --use-tooling-api

WHY MANUAL ACTIVATION IS NEEDED:

This flow invokes Apex code and requires System Administrator privileges to activate.
Your current user profile does not have sufficient permissions to activate via API.

NEXT STEPS:

Either request a System Administrator to activate the flow, or ask your
Salesforce administrator to grant you the required permissions.

=======================
`.trim();
    }

    /**
     * Get user information via Salesforce API
     * Part of Phase 0.5: Security & Permission Escalation Warnings
     */
    async getUserInfo() {
        try {
            // Query current user info
            const result = JSON.parse(execSync(
                `sf data query --query "SELECT Id, Username, Profile.Name FROM User WHERE Username = '$(sf org display --target-org ${this.orgAlias} --json | jq -r '.result.username')' LIMIT 1" --target-org ${this.orgAlias} --json`,
                { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
            ));

            if (result.status === 0 && result.result.records.length > 0) {
                const user = result.result.records[0];
                return {
                    profile: user.Profile?.Name || 'Unknown',
                    username: user.Username,
                    userId: user.Id
                };
            }

            // Fallback if query fails
            return {
                profile: 'Unknown',
                username: process.env.USER || 'unknown',
                userId: null
            };

        } catch (error) {
            this.log(`Failed to get user info: ${error.message}`);
            // Return minimal info on failure
            return {
                profile: 'Unknown',
                username: process.env.USER || 'unknown',
                userId: null
            };
        }
    }

    /**
     * Detect if flow has Apex invocations via XML parsing
     * Part of Phase 0.5: Security & Permission Escalation Warnings
     */
    async detectApexInvocation(flowName) {
        try {
            // Query latest flow metadata via Tooling API
            const result = JSON.parse(execSync(
                `sf data query --query "SELECT Id, Metadata FROM Flow WHERE DeveloperName = '${flowName}' ORDER BY VersionNumber DESC LIMIT 1" --target-org ${this.orgAlias} --use-tooling-api --json`,
                { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
            ));

            if (result.status === 0 && result.result.records.length > 0) {
                const metadata = result.result.records[0].Metadata;
                const definition = typeof metadata === 'string'
                    ? metadata
                    : metadata
                        ? JSON.stringify(metadata)
                        : '';

                // Check for Apex action calls in XML
                // actionCalls with actionType="apex" indicate Apex invocation
                if (definition && typeof definition === 'string') {
                    // Check for apex actionType
                    const hasApexAction = /<actionType>apex<\/actionType>/i.test(definition)
                        || /"actionType"\s*:\s*"apex"/i.test(definition);

                    // Check for apexCallout type
                    const hasApexCallout = /<actionType>apexCallout<\/actionType>/i.test(definition)
                        || /"actionType"\s*:\s*"apexCallout"/i.test(definition);

                    // Check for direct Apex class references
                    const hasApexClass = /<apexClass>/i.test(definition)
                        || /"apexClass"\s*:/i.test(definition);

                    return hasApexAction || hasApexCallout || hasApexClass;
                }
            }

            // If we can't determine, assume no Apex (safe default)
            return false;

        } catch (error) {
            this.log(`Failed to detect Apex invocation: ${error.message}`);
            // On error, assume no Apex to avoid false escalation
            return false;
        }
    }

    /**
     * Activate via Apex service (Apex invocation wrapper)
     * Part of Phase 0.5: Security & Permission Escalation Warnings
     */
    async activateViaApexService(flowName) {
        const apexClass = process.env.FLOW_ACTIVATION_APEX_CLASS || 'FlowActivationService';
        const apexMethod = process.env.FLOW_ACTIVATION_APEX_METHOD || 'activate';
        const escapedFlowName = flowName.replace(/'/g, "\\'");
        const apexCode = `${apexClass}.${apexMethod}('${escapedFlowName}');`;
        const tempFile = path.join(os.tmpdir(), `flow-activation-${Date.now()}-${Math.random().toString(16).slice(2)}.apex`);

        await fs.writeFile(tempFile, apexCode, 'utf8');

        try {
            const output = execSync(
                `sf apex run --file "${tempFile}" --target-org ${this.orgAlias} --json`,
                { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
            );
            const result = JSON.parse(output);

            if (result.status !== 0) {
                throw new Error(result.message || 'Apex activation failed');
            }

            return { success: true, method: 'apex', result };
        } catch (error) {
            throw new Error(`Apex activation failed: ${error.message}`);
        } finally {
            try {
                await fs.unlink(tempFile);
            } catch (cleanupError) {
                // ignore cleanup failure
            }
        }
    }

    /**
     * Activate via CLI + Tooling API fallback
     * Part of Phase 0.5: Security & Permission Escalation Warnings
     */
    async activateViaMetadataAPI(flowName) {
        try {
            const output = execSync(
                `sf flow activate --flow-name "${flowName}" --target-org ${this.orgAlias} --json`,
                { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
            );
            const result = JSON.parse(output);

            if (result.status !== 0) {
                throw new Error(result.message || 'Flow activation failed');
            }

            return { success: true, method: 'sf_flow_activate', result };
        } catch (error) {
            // Fallback: update FlowDefinition ActiveVersionNumber via Tooling API
            const latestVersion = await this.getLatestFlowVersionNumber(flowName);
            const updateCmd = `sf data update record --sobject FlowDefinition --where "DeveloperName='${flowName}'" --values "ActiveVersionNumber=${latestVersion}" --use-tooling-api --target-org ${this.orgAlias} --json`;
            const output = execSync(updateCmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
            const result = JSON.parse(output);

            if (result.status !== 0) {
                throw new Error(result.message || 'Flow activation failed');
            }

            return { success: true, method: 'tooling_api', version: latestVersion, result };
        }
    }

    async getLatestFlowVersionNumber(flowName) {
        const query = `
            SELECT VersionNumber
            FROM Flow
            WHERE DeveloperName = '${flowName}'
            ORDER BY VersionNumber DESC
            LIMIT 1
        `.trim().replace(/\s+/g, ' ');

        const cmd = `sf data query --query "${query}" --use-tooling-api --json --target-org ${this.orgAlias}`;
        const result = JSON.parse(execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));

        if (result.status !== 0 || !result.result?.records?.[0]) {
            throw new Error(`Unable to resolve latest version for flow ${flowName}`);
        }

        return result.result.records[0].VersionNumber;
    }

    /**
     * Log helper
     * Part of Phase 0.5: Security & Permission Escalation Warnings
     */
    log(message) {
        if (this.verbose) {
            console.log(`[FlowDeploymentWrapper] ${message}`);
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
    
    if (command === 'deploy') {
        const wrapper = new FlowDeploymentWrapper(orgAlias);
        const success = await wrapper.deployFlow(options);
        
        if (success && options.test !== 'false') {
            const label = options.label || await wrapper.extractLabelFromFile(options.file);
            await wrapper.runPostDeploymentTests(label);
        }
        
        process.exit(success ? 0 : 1);
    } else if (command === 'remove' || command === 'deactivate') {
        // Use the FlowRemovalManager for removal operations
        const FlowRemovalManager = require('./flow-removal-manager');
        const removalManager = new FlowRemovalManager(orgAlias);
        
        if (!options.flow && !options.label) {
            console.error('❌ Required: --flow <DeveloperName> or --label <MasterLabel>');
            process.exit(1);
        }
        
        let flowName = options.flow;
        
        // If label provided, need to find DeveloperName
        if (options.label && !flowName) {
            const FlowDiscoveryMapper = require('./flow-discovery-mapper');
            const mapper = new FlowDiscoveryMapper(orgAlias);
            await mapper.loadMappings();
            const mapping = await mapper.getFlowMapping(options.label);
            if (mapping) {
                flowName = mapping.developerName;
            } else {
                console.error('❌ Flow not found with that label');
                process.exit(1);
            }
        }
        
        if (command === 'deactivate') {
            const success = await removalManager.deactivateFlow(flowName);
            process.exit(success ? 0 : 1);
        } else {
            const success = await removalManager.removeFlow(flowName, {
                skipConfirmation: options.force === true
            });
            process.exit(success ? 0 : 1);
        }
    } else {
        console.log('Flow Deployment Wrapper\n');
        console.log('Commands:');
        console.log('  deploy      - Deploy a flow file');
        console.log('  deactivate  - Deactivate a flow');
        console.log('  remove      - Remove a flow (deactivate + delete)');
        console.log('\nDeploy Options:');
        console.log('  --file <path>   - Flow file to deploy');
        console.log('  --label <label> - Deploy by retrieving existing flow');
        console.log('  --org <alias>   - Target org');
        console.log('  --skip-validation - Skip confirmation prompts');
        console.log('  --test false    - Skip post-deployment tests');
        console.log('\nRemove/Deactivate Options:');
        console.log('  --flow <name>   - Flow DeveloperName');
        console.log('  --label <label> - Flow MasterLabel');
        console.log('  --org <alias>   - Target org');
        console.log('  --force         - Skip confirmations');
        console.log('\nExamples:');
        console.log('  node flow-deployment-wrapper.js deploy --file MyFlow.flow-meta.xml --org myorg');
        console.log('  node flow-deployment-wrapper.js remove --flow "Old_Lead_Flow" --org myorg');
        console.log('  node flow-deployment-wrapper.js deactivate --label "Obsolete Process" --org myorg');
    }
}

// Export for use as module
module.exports = FlowDeploymentWrapper;

// Run if called directly
if (require.main === module) {
    main();
}
