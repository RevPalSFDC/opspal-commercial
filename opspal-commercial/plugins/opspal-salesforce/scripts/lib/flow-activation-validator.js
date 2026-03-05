#!/usr/bin/env node

/**
 * Flow Activation Validator
 *
 * Detects flows that invoke Apex classes and validates whether programmatic
 * activation will succeed based on user profile and permissions.
 *
 * Usage:
 *   node scripts/lib/flow-activation-validator.js <org-alias> <flow-directory>
 *   node scripts/lib/flow-activation-validator.js delta-sandbox force-app/main/default/flows
 *
 * Exit codes:
 *   0 = All flows can be activated programmatically
 *   1 = Manual activation required (System Admin needed)
 *   2 = Validation error or missing parameters
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class FlowActivationValidator {
    constructor(orgAlias, flowDirectory) {
        this.orgAlias = orgAlias;
        this.flowDirectory = flowDirectory;
        this.issues = [];
        this.warnings = [];
    }

    /**
     * Main validation entry point
     */
    async validate() {
        console.log('═══════════════════════════════════════════════════════');
        console.log('Flow Activation Validator');
        console.log('═══════════════════════════════════════════════════════\n');

        // Step 1: Find all flow files
        const flowFiles = this.findFlowFiles();
        console.log(`Found ${flowFiles.length} flow files\n`);

        if (flowFiles.length === 0) {
            console.log('✅ No flows to validate');
            return 0;
        }

        // Step 2: Parse flows and detect Apex invocations
        const flowsWithApex = this.detectApexInvocations(flowFiles);
        console.log(`Found ${flowsWithApex.length} flows invoking Apex classes\n`);

        if (flowsWithApex.length === 0) {
            console.log('✅ No flows invoke Apex - programmatic activation will work');
            return 0;
        }

        // Step 3: Check deploying user profile
        const userProfile = this.checkUserProfile();
        console.log(`Deploying user profile: ${userProfile}\n`);

        // Step 4: Generate report
        const requiresManualActivation = userProfile !== 'System Administrator';

        if (requiresManualActivation) {
            console.log('⚠️  MANUAL ACTIVATION REQUIRED\n');
            console.log('Reason: Flows invoking Apex classes require System Administrator profile');
            console.log('        for programmatic activation. Permission sets cannot delegate this.\n');

            this.generateManualActivationGuide(flowsWithApex);
            return 1;
        } else {
            console.log('✅ Programmatic activation will work (System Administrator profile detected)\n');
            this.generateProgrammaticActivationGuide(flowsWithApex);
            return 0;
        }
    }

    /**
     * Find all .flow-meta.xml files in directory
     */
    findFlowFiles() {
        const files = [];

        if (!fs.existsSync(this.flowDirectory)) {
            console.error(`❌ Error: Flow directory not found: ${this.flowDirectory}`);
            process.exit(2);
        }

        const findFiles = (dir) => {
            const entries = fs.readdirSync(dir, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);

                if (entry.isDirectory()) {
                    findFiles(fullPath);
                } else if (entry.name.endsWith('.flow-meta.xml')) {
                    files.push(fullPath);
                }
            }
        };

        findFiles(this.flowDirectory);
        return files;
    }

    /**
     * Parse flow XML and detect Apex invocations
     */
    detectApexInvocations(flowFiles) {
        const flowsWithApex = [];

        for (const flowFile of flowFiles) {
            const flowXml = fs.readFileSync(flowFile, 'utf-8');
            const flowName = path.basename(flowFile, '.flow-meta.xml');

            // Check for Apex action calls
            if (flowXml.includes('<actionType>apex</actionType>')) {
                // Extract Apex class names
                const apexClasses = this.extractApexClasses(flowXml);

                flowsWithApex.push({
                    file: flowFile,
                    name: flowName,
                    apexClasses: apexClasses,
                    status: this.extractFlowStatus(flowXml)
                });
            }
        }

        return flowsWithApex;
    }

    /**
     * Extract Apex class names from flow XML
     */
    extractApexClasses(flowXml) {
        const classes = [];
        const actionNameRegex = /<actionName>([^<]+)<\/actionName>/g;
        let match;

        while ((match = actionNameRegex.exec(flowXml)) !== null) {
            // Only include if it's an Apex action (not Flow action)
            const actionBlock = flowXml.substring(
                Math.max(0, match.index - 200),
                Math.min(flowXml.length, match.index + 200)
            );

            if (actionBlock.includes('<actionType>apex</actionType>')) {
                classes.push(match[1]);
            }
        }

        return [...new Set(classes)]; // Remove duplicates
    }

    /**
     * Extract flow status from XML
     */
    extractFlowStatus(flowXml) {
        const statusMatch = flowXml.match(/<status>([^<]+)<\/status>/);
        return statusMatch ? statusMatch[1] : 'Unknown';
    }

    /**
     * Check deploying user's profile
     */
    checkUserProfile() {
        try {
            const query = `SELECT Profile.Name FROM User WHERE Username = '${this.getCurrentUsername()}'`;
            const result = execSync(
                `sf data query --query "${query}" --target-org ${this.orgAlias} --json`,
                { encoding: 'utf-8' }
            );

            const data = JSON.parse(result);

            if (data.result && data.result.records && data.result.records.length > 0) {
                return data.result.records[0].Profile.Name;
            }

            return 'Unknown';
        } catch (error) {
            console.warn('⚠️  Warning: Could not determine user profile');
            console.warn(`   Assuming non-System Administrator\n`);
            return 'Unknown (Non-Admin)';
        }
    }

    /**
     * Get current username for org
     */
    getCurrentUsername() {
        try {
            const result = execSync(
                `sf org display --target-org ${this.orgAlias} --json`,
                { encoding: 'utf-8' }
            );

            const data = JSON.parse(result);
            return data.result.username || '';
        } catch (error) {
            return '';
        }
    }

    /**
     * Generate manual activation guide
     */
    generateManualActivationGuide(flowsWithApex) {
        console.log('═══════════════════════════════════════════════════════');
        console.log('MANUAL ACTIVATION REQUIRED');
        console.log('═══════════════════════════════════════════════════════\n');

        console.log('Flows requiring manual activation:\n');

        flowsWithApex.forEach((flow, index) => {
            console.log(`${index + 1}. ${flow.name}`);
            console.log(`   Status: ${flow.status}`);
            console.log(`   Apex Classes: ${flow.apexClasses.join(', ')}`);
            console.log('');
        });

        console.log('ACTIVATION STEPS:\n');
        console.log('1. Login to Salesforce as System Administrator');
        console.log('2. Navigate to Setup → Flows');
        console.log('3. For each flow listed above:');
        console.log('   a. Click flow name to open in Flow Builder');
        console.log('   b. Click "Activate" button');
        console.log('   c. Verify status changes from "Draft" to "Active"');
        console.log('');
        console.log('VERIFICATION QUERY:\n');
        console.log(`sf data query --query "SELECT MasterLabel, VersionNumber, Status FROM Flow WHERE MasterLabel IN ('${flowsWithApex.map(f => f.name.replace(/_/g, ' ')).join("','")}') ORDER BY MasterLabel" --use-tooling-api --target-org ${this.orgAlias}`);
        console.log('');
        console.log(`Estimated time: ${flowsWithApex.length * 2} minutes (${flowsWithApex.length} flows × 2 min each)`);
        console.log('');
    }

    /**
     * Generate programmatic activation guide
     */
    generateProgrammaticActivationGuide(flowsWithApex) {
        console.log('═══════════════════════════════════════════════════════');
        console.log('PROGRAMMATIC ACTIVATION AVAILABLE');
        console.log('═══════════════════════════════════════════════════════\n');

        console.log('Flows that can be activated programmatically:\n');

        flowsWithApex.forEach((flow, index) => {
            console.log(`${index + 1}. ${flow.name}`);
            console.log(`   Apex Classes: ${flow.apexClasses.join(', ')}`);
            console.log('');
        });

        console.log('DEPLOYMENT STEPS:\n');
        console.log('1. Create FlowDefinition metadata files for each flow');
        console.log('2. Deploy flows + FlowDefinition files together');
        console.log('3. Flows will activate automatically\n');

        console.log('Example FlowDefinition (force-app/main/default/flowDefinitions/):\n');
        console.log('<?xml version="1.0" encoding="UTF-8"?>');
        console.log('<FlowDefinition xmlns="http://soap.sforce.com/2006/04/metadata">');
        console.log('    <activeVersionNumber>1</activeVersionNumber>');
        console.log('</FlowDefinition>\n');
    }
}

// CLI execution
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length < 2) {
        console.error('Usage: node flow-activation-validator.js <org-alias> <flow-directory>');
        console.error('Example: node flow-activation-validator.js delta-sandbox force-app/main/default/flows');
        process.exit(2);
    }

    const [orgAlias, flowDirectory] = args;
    const validator = new FlowActivationValidator(orgAlias, flowDirectory);

    validator.validate().then(exitCode => {
        process.exit(exitCode);
    }).catch(error => {
        console.error('❌ Validation error:', error.message);
        process.exit(2);
    });
}

module.exports = FlowActivationValidator;
