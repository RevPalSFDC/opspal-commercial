#!/usr/bin/env node

/**
 * Flow Trigger Validator
 *
 * Validates that record-triggered flows are properly registered in Salesforce.
 *
 * PROBLEM: Salesforce CLI deployments sometimes register record-triggered flows
 * as AutoLaunchedFlow, preventing them from triggering automatically on
 * record create/update operations.
 *
 * This script:
 * 1. Reads flow metadata to determine expected trigger configuration
 * 2. Queries Salesforce to check actual ProcessType registration
 * 3. Detects mismatches and provides remediation steps
 *
 * Usage:
 *   node flow-trigger-validator.js --file MyFlow.flow-meta.xml --org myorg
 *   node flow-trigger-validator.js --name Quote_Approval_Evaluation --org myorg
 *
 * Exit Codes:
 *   0 - Validation passed (flow correctly registered)
 *   1 - Validation failed (mismatch detected)
 *   2 - Error during validation (missing file, query failure, etc.)
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const xml2js = require('xml2js');

class FlowTriggerValidator {
    constructor(orgAlias) {
        this.orgAlias = orgAlias;
    }

    /**
     * Parse flow metadata XML to extract trigger configuration
     */
    async parseFlowMetadata(flowFile) {
        try {
            const xmlContent = fs.readFileSync(flowFile, 'utf8');
            const parser = new xml2js.Parser();
            const result = await parser.parseStringPromise(xmlContent);

            const flow = result.Flow;
            if (!flow) {
                throw new Error('Invalid flow metadata XML');
            }

            // Extract trigger configuration
            const start = flow.start?.[0];
            if (!start) {
                return {
                    isRecordTriggered: false,
                    triggerType: null,
                    recordTriggerType: null,
                    object: null
                };
            }

            const isRecordTriggered = !!(start.triggerType && start.recordTriggerType && start.object);

            return {
                isRecordTriggered,
                triggerType: start.triggerType?.[0],
                recordTriggerType: start.recordTriggerType?.[0],
                object: start.object?.[0],
                masterLabel: flow.label?.[0] || path.basename(flowFile, '.flow-meta.xml')
            };
        } catch (error) {
            throw new Error(`Failed to parse flow metadata: ${error.message}`);
        }
    }

    /**
     * Query Salesforce to get actual flow registration
     */
    queryFlowRegistration(flowName) {
        try {
            const query = `SELECT Id, Definition.DeveloperName, MasterLabel, VersionNumber, Status, ProcessType FROM Flow WHERE Definition.DeveloperName = '${flowName}' ORDER BY VersionNumber DESC LIMIT 1`;

            const cmd = `sf data query --query "${query}" --use-tooling-api --json --target-org ${this.orgAlias}`;
            const result = JSON.parse(execSync(cmd, { encoding: 'utf8' }));

            if (result.status !== 0) {
                throw new Error(`Query failed: ${result.message}`);
            }

            const records = result.result?.records || [];
            if (records.length === 0) {
                return null;
            }

            return {
                id: records[0].Id,
                developerName: records[0].Definition?.DeveloperName,
                masterLabel: records[0].MasterLabel,
                versionNumber: records[0].VersionNumber,
                status: records[0].Status,
                processType: records[0].ProcessType
            };
        } catch (error) {
            throw new Error(`Failed to query flow: ${error.message}`);
        }
    }

    /**
     * Validate flow trigger registration
     */
    async validate(flowFile) {
        console.log('🔍 Flow Trigger Registration Validator');
        console.log('=' .repeat(60));
        console.log();

        // Step 1: Parse metadata
        console.log(`📄 Parsing flow metadata: ${path.basename(flowFile)}`);
        const metadata = await this.parseFlowMetadata(flowFile);

        if (!metadata.isRecordTriggered) {
            console.log('ℹ️  Flow is not record-triggered (no validation needed)');
            console.log(`   Trigger Type: ${metadata.triggerType || 'Not specified'}`);
            return { valid: true, reason: 'not-record-triggered' };
        }

        console.log('✅ Flow metadata indicates record-triggered flow:');
        console.log(`   Object: ${metadata.object}`);
        console.log(`   Trigger Type: ${metadata.triggerType}`);
        console.log(`   Record Trigger Type: ${metadata.recordTriggerType}`);
        console.log();

        // Step 2: Determine flow name from file
        const flowName = path.basename(flowFile, '.flow-meta.xml');

        // Step 3: Query actual registration
        console.log(`🔍 Querying Salesforce registration for: ${flowName}`);
        const registration = this.queryFlowRegistration(flowName);

        if (!registration) {
            console.log('⚠️  Flow not found in org (may not be deployed yet)');
            return { valid: true, reason: 'not-deployed', warning: true };
        }

        console.log(`✅ Found flow in org:`);
        console.log(`   Version: ${registration.versionNumber}`);
        console.log(`   Status: ${registration.status}`);
        console.log(`   Process Type: ${registration.processType}`);
        console.log();

        // Step 4: Validate ProcessType
        const expectedProcessType = 'Workflow'; // Record-triggered flows should be Workflow, not AutoLaunchedFlow

        if (registration.processType === 'AutoLaunchedFlow') {
            console.log('❌ VALIDATION FAILED: Flow registered as AutoLaunchedFlow');
            console.log();
            console.log('🔴 ISSUE: Record-triggered flow is not properly registered');
            console.log('   Expected: Workflow or Flow (record-triggered)');
            console.log('   Actual: AutoLaunchedFlow');
            console.log();
            console.log('📋 IMPACT:');
            console.log('   ❌ Flow will NOT trigger automatically on record create/update');
            console.log('   ❌ Automation will not execute');
            console.log();
            console.log('🔧 REMEDIATION STEPS:');
            console.log('   1. Open Salesforce Setup → Flows');
            console.log(`   2. Search for: ${registration.masterLabel || flowName}`);
            console.log('   3. Click on the flow to open it');
            console.log('   4. Click "Save As" → Keep same name → Click "Save"');
            console.log('   5. Click "Activate" on the new version');
            console.log('   6. Re-run this validator to confirm fix');
            console.log();
            console.log('💡 TIP: This is a known Salesforce limitation with CLI deployments');
            console.log('   See: docs/SALESFORCE_PLATFORM_LIMITATIONS.md');
            console.log();

            return {
                valid: false,
                reason: 'process-type-mismatch',
                expected: expectedProcessType,
                actual: registration.processType,
                flowName: registration.masterLabel || flowName,
                version: registration.versionNumber
            };
        }

        console.log('✅ VALIDATION PASSED: Flow correctly registered');
        console.log(`   Process Type: ${registration.processType}`);
        console.log();

        return {
            valid: true,
            reason: 'correct-registration',
            processType: registration.processType
        };
    }
}

// CLI Interface
async function main() {
    const args = process.argv.slice(2);

    let flowFile = null;
    let flowName = null;
    let orgAlias = null;

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--file' && args[i + 1]) {
            flowFile = args[i + 1];
            i++;
        } else if (args[i] === '--name' && args[i + 1]) {
            flowName = args[i + 1];
            i++;
        } else if (args[i] === '--org' && args[i + 1]) {
            orgAlias = args[i + 1];
            i++;
        }
    }

    if (!orgAlias) {
        console.error('❌ Error: --org parameter is required');
        console.error('Usage: node flow-trigger-validator.js --file MyFlow.flow-meta.xml --org myorg');
        console.error('   or: node flow-trigger-validator.js --name FlowDeveloperName --org myorg');
        process.exit(2);
    }

    if (!flowFile && !flowName) {
        console.error('❌ Error: Either --file or --name parameter is required');
        console.error('Usage: node flow-trigger-validator.js --file MyFlow.flow-meta.xml --org myorg');
        console.error('   or: node flow-trigger-validator.js --name FlowDeveloperName --org myorg');
        process.exit(2);
    }

    // If name provided, try to find file in common locations
    if (flowName && !flowFile) {
        const possiblePaths = [
            `force-app/main/default/flows/${flowName}.flow-meta.xml`,
            `flows/${flowName}.flow-meta.xml`,
            `instances/${orgAlias}/flows/${flowName}.flow-meta.xml`
        ];

        for (const p of possiblePaths) {
            if (fs.existsSync(p)) {
                flowFile = p;
                break;
            }
        }

        if (!flowFile) {
            console.error(`❌ Error: Could not find flow file for: ${flowName}`);
            console.error('Searched in:');
            possiblePaths.forEach(p => console.error(`  - ${p}`));
            console.error('\nPlease specify --file with full path');
            process.exit(2);
        }
    }

    // Validate file exists
    if (!fs.existsSync(flowFile)) {
        console.error(`❌ Error: Flow file not found: ${flowFile}`);
        process.exit(2);
    }

    try {
        const validator = new FlowTriggerValidator(orgAlias);
        const result = await validator.validate(flowFile);

        if (!result.valid) {
            process.exit(1); // Validation failed
        }

        if (result.warning) {
            process.exit(0); // Warning but not failure
        }

        process.exit(0); // Success
    } catch (error) {
        console.error(`❌ Validation error: ${error.message}`);
        process.exit(2);
    }
}

// Run if called directly
if (require.main === module) {
    main().catch(error => {
        console.error(`❌ Fatal error: ${error.message}`);
        process.exit(2);
    });
}

module.exports = FlowTriggerValidator;
