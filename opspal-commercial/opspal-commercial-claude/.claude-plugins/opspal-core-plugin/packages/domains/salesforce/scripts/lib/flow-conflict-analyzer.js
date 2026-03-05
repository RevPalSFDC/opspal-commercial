#!/usr/bin/env node

/**
 * Flow Conflict Analyzer
 *
 * Purpose: Detect Flows with hard-coded values that may conflict with:
 * - Profile default record types
 * - Business logic expectations
 * - Data quality standards
 * - Future configuration changes
 *
 * Features:
 * - Scans all active Flows on specified objects
 * - Detects hard-coded RecordTypeId assignments
 * - Identifies hard-coded picklist values
 * - Finds hard-coded text/number field values
 * - Ranks conflicts by severity
 * - Provides specific remediation steps
 *
 * Usage:
 *   node flow-conflict-analyzer.js <org-alias> [object-name]
 *   node flow-conflict-analyzer.js wedgewood-uat Contact
 *   node flow-conflict-analyzer.js wedgewood-production  # Scans all objects
 *
 * Output:
 *   Comprehensive conflict report with severity ratings and solutions
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class FlowConflictAnalyzer {
    constructor(orgAlias, objectName = null) {
        this.orgAlias = orgAlias;
        this.objectName = objectName;
        this.conflicts = [];
        this.warnings = [];
        this.flowsAnalyzed = 0;
        this.flowsWithConflicts = 0;
    }

    /**
     * Execute SF CLI command
     */
    execSfCommand(command) {
        try {
            const result = execSync(command, {
                encoding: 'utf8',
                maxBuffer: 10 * 1024 * 1024,
                stdio: ['pipe', 'pipe', 'pipe']
            });
            return JSON.parse(result);
        } catch (error) {
            console.error(`Error executing: ${command}`);
            console.error(error.message);
            return null;
        }
    }

    /**
     * Run comprehensive Flow analysis
     */
    async analyze() {
        console.log(`\n⚡ Flow Conflict Analyzer v1.0`);
        console.log(`================================\n`);
        console.log(`Org: ${this.orgAlias}`);
        console.log(`Object: ${this.objectName || 'All objects'}\n`);

        // Step 1: Get all active Flows
        console.log('📋 Fetching active Flows...');
        this.flows = await this.fetchActiveFlows();
        console.log(`   ✓ Found ${this.flows.length} active Flow(s)\n`);

        if (this.flows.length === 0) {
            console.log('No active Flows found.');
            return;
        }

        // Step 2: Analyze each Flow
        console.log('🔍 Analyzing Flows for conflicts...\n');
        for (const flow of this.flows) {
            await this.analyzeFlow(flow);
        }

        console.log(`\n✓ Analyzed ${this.flowsAnalyzed} Flow(s)`);
        console.log(`✓ Found conflicts in ${this.flowsWithConflicts} Flow(s)\n`);

        // Step 3: Generate report
        this.generateReport();
    }

    /**
     * Fetch all active Flows
     */
    async fetchActiveFlows() {
        const query = `SELECT Id, MasterLabel, ProcessType, Description, DefinitionId FROM Flow WHERE Status = 'Active' AND ProcessType = 'AutoLaunchedFlow'`;

        const result = this.execSfCommand(
            `sf data query --query "${query}" --use-tooling-api --json --target-org ${this.orgAlias}`
        );

        if (!result || !result.result || !result.result.records) {
            return [];
        }

        return result.result.records;
    }

    /**
     * Analyze individual Flow for conflicts
     */
    async analyzeFlow(flow) {
        this.flowsAnalyzed++;

        console.log(`   Analyzing: ${flow.MasterLabel}...`);

        // Get full Flow metadata
        const flowMetadata = await this.fetchFlowMetadata(flow.Id);

        if (!flowMetadata) {
            this.warnings.push(`Failed to fetch metadata for Flow: ${flow.MasterLabel}`);
            return;
        }

        // Check if Flow is on the object we're interested in
        if (this.objectName && flowMetadata.start && flowMetadata.start.object !== this.objectName) {
            return; // Skip Flows on other objects
        }

        if (!flowMetadata.start || !flowMetadata.start.object) {
            return; // Skip Flows without object trigger
        }

        const targetObject = flowMetadata.start.object;
        const triggerType = flowMetadata.start.triggerType;
        const recordTriggerType = flowMetadata.start.recordTriggerType;

        // Check for conflicts
        const conflicts = [];

        // 1. Check for hard-coded RecordTypeId
        const recordTypeConflicts = this.checkHardCodedRecordTypeId(flowMetadata, targetObject);
        conflicts.push(...recordTypeConflicts);

        // 2. Check for hard-coded picklist values
        const picklistConflicts = this.checkHardCodedPicklistValues(flowMetadata, targetObject);
        conflicts.push(...picklistConflicts);

        // 3. Check for hard-coded text/number values
        const valueConflicts = this.checkHardCodedValues(flowMetadata, targetObject);
        conflicts.push(...valueConflicts);

        // 4. Check for potential timing issues
        const timingIssues = this.checkTimingIssues(flowMetadata, targetObject);
        conflicts.push(...timingIssues);

        if (conflicts.length > 0) {
            this.flowsWithConflicts++;
            this.conflicts.push({
                flowName: flow.MasterLabel,
                flowId: flow.Id,
                object: targetObject,
                triggerType: triggerType,
                recordTriggerType: recordTriggerType,
                description: flow.Description,
                conflicts: conflicts
            });

            console.log(`      ⚠️  Found ${conflicts.length} conflict(s)`);
        } else {
            console.log(`      ✅ No conflicts`);
        }
    }

    /**
     * Fetch Flow metadata
     */
    async fetchFlowMetadata(flowId) {
        const result = this.execSfCommand(
            `sf data query --query "SELECT Metadata FROM Flow WHERE Id = '${flowId}'" --use-tooling-api --json --target-org ${this.orgAlias}`
        );

        if (!result || !result.result || !result.result.records || result.result.records.length === 0) {
            return null;
        }

        return result.result.records[0].Metadata;
    }

    /**
     * Check for hard-coded RecordTypeId assignments
     */
    checkHardCodedRecordTypeId(metadata, objectName) {
        const conflicts = [];

        if (!metadata.recordUpdates) {
            return conflicts;
        }

        const updates = Array.isArray(metadata.recordUpdates) ? metadata.recordUpdates : [metadata.recordUpdates];

        for (const update of updates) {
            if (!update.inputAssignments) continue;

            const assignments = Array.isArray(update.inputAssignments) ? update.inputAssignments : [update.inputAssignments];

            for (const assignment of assignments) {
                if (assignment.field === 'RecordTypeId' && assignment.value && assignment.value.stringValue) {
                    // This is a hard-coded RecordTypeId!
                    conflicts.push({
                        severity: 'CRITICAL',
                        type: 'HARD_CODED_RECORD_TYPE',
                        field: 'RecordTypeId',
                        value: assignment.value.stringValue,
                        updateElement: update.name,
                        message: `Hard-codes RecordTypeId to '${assignment.value.stringValue}'. This OVERRIDES Profile defaults.`,
                        impact: 'Users cannot use their Profile default record types. Changing Profile defaults will have NO effect.',
                        solution: this.getSolutionForRecordTypeConflict()
                    });
                }
            }
        }

        return conflicts;
    }

    /**
     * Check for hard-coded picklist values
     */
    checkHardCodedPicklistValues(metadata, objectName) {
        const conflicts = [];

        if (!metadata.recordUpdates) {
            return conflicts;
        }

        const updates = Array.isArray(metadata.recordUpdates) ? metadata.recordUpdates : [metadata.recordUpdates];

        // Common picklist fields that shouldn't be hard-coded
        const criticalPicklists = ['Type__c', 'Status', 'StageName', 'LeadSource', 'Priority', 'Category'];

        for (const update of updates) {
            if (!update.inputAssignments) continue;

            const assignments = Array.isArray(update.inputAssignments) ? update.inputAssignments : [update.inputAssignments];

            for (const assignment of assignments) {
                // Check if this looks like a picklist field (ends in __c or is a known picklist)
                const fieldName = assignment.field;
                const isPicklist = fieldName.endsWith('__c') || criticalPicklists.includes(fieldName);

                if (isPicklist && assignment.value && assignment.value.stringValue && !assignment.value.elementReference) {
                    conflicts.push({
                        severity: 'HIGH',
                        type: 'HARD_CODED_PICKLIST',
                        field: fieldName,
                        value: assignment.value.stringValue,
                        updateElement: update.name,
                        message: `Hard-codes picklist field '${fieldName}' to '${assignment.value.stringValue}'.`,
                        impact: 'Limits flexibility. Cannot dynamically assign based on business logic.',
                        solution: this.getSolutionForPicklistConflict(fieldName)
                    });
                }
            }
        }

        return conflicts;
    }

    /**
     * Check for other hard-coded values
     */
    checkHardCodedValues(metadata, objectName) {
        const conflicts = [];

        if (!metadata.recordUpdates) {
            return conflicts;
        }

        const updates = Array.isArray(metadata.recordUpdates) ? metadata.recordUpdates : [metadata.recordUpdates];

        for (const update of updates) {
            if (!update.inputAssignments) continue;

            const assignments = Array.isArray(update.inputAssignments) ? update.inputAssignments : [update.inputAssignments];

            for (const assignment of assignments) {
                // Skip RecordTypeId and picklists (already checked)
                if (assignment.field === 'RecordTypeId' || assignment.field.endsWith('__c')) {
                    continue;
                }

                // Check for hard-coded text values
                if (assignment.value && assignment.value.stringValue && !assignment.value.elementReference) {
                    conflicts.push({
                        severity: 'MEDIUM',
                        type: 'HARD_CODED_VALUE',
                        field: assignment.field,
                        value: assignment.value.stringValue,
                        updateElement: update.name,
                        message: `Hard-codes field '${assignment.field}' to '${assignment.value.stringValue}'.`,
                        impact: 'Reduced flexibility. May conflict with future business requirements.',
                        solution: this.getSolutionForValueConflict(assignment.field)
                    });
                }
            }
        }

        return conflicts;
    }

    /**
     * Check for potential timing issues
     */
    checkTimingIssues(metadata, objectName) {
        const issues = [];

        if (!metadata.start) {
            return issues;
        }

        const triggerType = metadata.start.triggerType;
        const recordTriggerType = metadata.start.recordTriggerType;

        // Check if Flow runs after save but sets required fields
        if (triggerType === 'RecordAfterSave' && metadata.recordUpdates) {
            const updates = Array.isArray(metadata.recordUpdates) ? metadata.recordUpdates : [metadata.recordUpdates];

            // Check if updating required fields
            for (const update of updates) {
                if (update.inputReference === '$Record') {
                    // This is updating the triggering record
                    issues.push({
                        severity: 'LOW',
                        type: 'TIMING_ISSUE',
                        field: 'Multiple fields',
                        message: 'Flow runs AFTER save but updates the triggering record.',
                        impact: 'May require additional save operation. Consider before-save timing for efficiency.',
                        solution: this.getSolutionForTimingIssue()
                    });
                    break;
                }
            }
        }

        return issues;
    }

    /**
     * Get solution for RecordType conflict
     */
    getSolutionForRecordTypeConflict() {
        return [
            {
                option: 1,
                title: 'Use Conditional Logic Based on RecordType',
                description: 'Replace hard-coded RecordTypeId with dynamic logic that respects Profile defaults',
                steps: [
                    'Retrieve Flow metadata',
                    'Add RecordType lookup at start of Flow',
                    'Use Decision element to check RecordType.DeveloperName',
                    'Set other fields dynamically based on RecordType',
                    'Do NOT set RecordTypeId - let Profile default apply',
                    'Deploy and test'
                ],
                estimatedTime: '30-60 minutes',
                benefits: ['Respects Profile defaults', 'More flexible', 'Easier to maintain']
            },
            {
                option: 2,
                title: 'Deactivate Flow and Handle Differently',
                description: 'Remove automation and handle via other means',
                steps: [
                    'Document what the Flow currently does',
                    'Determine if logic is still needed',
                    'Implement via validation rule, default value, or formula field instead',
                    'Deactivate Flow'
                ],
                estimatedTime: '15-30 minutes',
                benefits: ['Simpler solution', 'Fewer moving parts', 'Better performance']
            }
        ];
    }

    /**
     * Get solution for picklist conflict
     */
    getSolutionForPicklistConflict(fieldName) {
        return [
            {
                option: 1,
                title: 'Use Formula or Decision Logic',
                description: `Set ${fieldName} dynamically based on other field values or RecordType`,
                steps: [
                    'Identify business logic for determining value',
                    'Add Decision element to Flow',
                    'Set value conditionally based on logic',
                    'Remove hard-coded value'
                ],
                estimatedTime: '20-30 minutes',
                benefits: ['Dynamic assignment', 'Adapts to business changes']
            },
            {
                option: 2,
                title: 'Set Default Value on Field',
                description: 'If value should always be the same, use field default instead',
                steps: [
                    `Navigate to: Setup → Object Manager → [Object] → ${fieldName}`,
                    'Set Default Value',
                    'Remove assignment from Flow'
                ],
                estimatedTime: '5 minutes',
                benefits: ['Simpler', 'No Flow overhead', 'Easier to change']
            }
        ];
    }

    /**
     * Get solution for value conflict
     */
    getSolutionForValueConflict(fieldName) {
        return [
            {
                option: 1,
                title: 'Make Value Configurable',
                description: 'Use Custom Metadata or Custom Setting instead of hard-coding',
                steps: [
                    'Create Custom Metadata Type for configuration',
                    'Add Get Records element to Flow to fetch value',
                    'Use variable reference instead of hard-coded value'
                ],
                estimatedTime: '30 minutes',
                benefits: ['Configurable without deployment', 'Supports multiple values', 'Best practice']
            },
            {
                option: 2,
                title: 'Review if Assignment is Still Needed',
                description: 'Determine if field assignment serves a current business purpose',
                steps: [
                    'Check with business stakeholders',
                    'Review when value was last changed',
                    'Remove assignment if no longer needed'
                ],
                estimatedTime: '10 minutes',
                benefits: ['Simplifies Flow', 'Reduces maintenance']
            }
        ];
    }

    /**
     * Get solution for timing issue
     */
    getSolutionForTimingIssue() {
        return [
            {
                option: 1,
                title: 'Change to Before-Save Trigger',
                description: 'Move Flow logic to before-save for efficiency',
                steps: [
                    'Retrieve Flow metadata',
                    'Change triggerType to RecordBeforeSave',
                    'Review and adjust logic as needed',
                    'Deploy and test'
                ],
                estimatedTime: '15 minutes',
                benefits: ['Single save operation', 'Better performance', 'Avoids recursion']
            }
        ];
    }

    /**
     * Generate conflict report
     */
    generateReport() {
        console.log('\n' + '='.repeat(80));
        console.log('📊 FLOW CONFLICT ANALYSIS REPORT');
        console.log('='.repeat(80) + '\n');

        // Summary
        console.log('SUMMARY');
        console.log('-------');
        console.log(`Flows Analyzed: ${this.flowsAnalyzed}`);
        console.log(`Flows with Conflicts: ${this.flowsWithConflicts}`);

        const criticalCount = this.conflicts.reduce((sum, f) =>
            sum + f.conflicts.filter(c => c.severity === 'CRITICAL').length, 0);
        const highCount = this.conflicts.reduce((sum, f) =>
            sum + f.conflicts.filter(c => c.severity === 'HIGH').length, 0);
        const mediumCount = this.conflicts.reduce((sum, f) =>
            sum + f.conflicts.filter(c => c.severity === 'MEDIUM').length, 0);

        console.log(`\nConflicts by Severity:`);
        console.log(`  CRITICAL: ${criticalCount}`);
        console.log(`  HIGH: ${highCount}`);
        console.log(`  MEDIUM: ${mediumCount}`);
        console.log();

        // Detailed conflicts
        if (this.conflicts.length > 0) {
            console.log('DETAILED FINDINGS');
            console.log('=================\n');

            this.conflicts.forEach((flowConflict, index) => {
                console.log(`${index + 1}. ${flowConflict.flowName}`);
                console.log(`   Object: ${flowConflict.object}`);
                console.log(`   Trigger: ${flowConflict.triggerType} (${flowConflict.recordTriggerType})`);
                console.log();

                flowConflict.conflicts.forEach((conflict, cIndex) => {
                    console.log(`   ${cIndex + 1}.${index + 1} [${conflict.severity}] ${conflict.type}`);
                    console.log(`       Field: ${conflict.field}`);
                    if (conflict.value) {
                        console.log(`       Value: "${conflict.value}"`);
                    }
                    console.log(`       Issue: ${conflict.message}`);
                    console.log(`       Impact: ${conflict.impact}`);
                    console.log();

                    console.log(`       SOLUTIONS:`);
                    conflict.solution.forEach(sol => {
                        console.log(`       Option ${sol.option}: ${sol.title} (${sol.estimatedTime})`);
                        console.log(`         ${sol.description}`);
                        console.log(`         Benefits: ${sol.benefits.join(', ')}`);
                        console.log();
                    });
                });

                console.log();
            });
        } else {
            console.log('✅ No conflicts found! All Flows follow best practices.\n');
        }

        // Warnings
        if (this.warnings.length > 0) {
            console.log('WARNINGS');
            console.log('========\n');
            this.warnings.forEach(w => console.log(`  ⚠️  ${w}`));
            console.log();
        }

        // Recommendations
        console.log('RECOMMENDED ACTIONS');
        console.log('===================\n');

        if (criticalCount > 0) {
            console.log('1. ADDRESS CRITICAL CONFLICTS IMMEDIATELY');
            console.log('   - Hard-coded RecordTypeId prevents Profile default changes');
            console.log('   - Review solutions above and implement corrected Flows\n');
        }

        if (highCount > 0) {
            console.log('2. REVIEW HIGH PRIORITY CONFLICTS');
            console.log('   - Hard-coded picklist values reduce flexibility');
            console.log('   - Consider making values configurable\n');
        }

        if (mediumCount > 0) {
            console.log('3. CLEAN UP MEDIUM PRIORITY ISSUES');
            console.log('   - Review hard-coded values for business relevance');
            console.log('   - Remove unnecessary assignments\n');
        }

        if (this.conflicts.length === 0) {
            console.log('✅ No action needed. Continue monitoring Flows during development.\n');
        }

        // Save report
        this.saveReport();
    }

    /**
     * Save report to file
     */
    saveReport() {
        const instancesDir = path.join(__dirname, '..', '..', 'instances', this.orgAlias);

        if (!fs.existsSync(instancesDir)) {
            fs.mkdirSync(instancesDir, { recursive: true });
        }

        const reportDir = path.join(instancesDir, `flow-conflict-analysis-${Date.now()}`);
        fs.mkdirSync(reportDir, { recursive: true });

        const reportPath = path.join(reportDir, 'conflict-report.json');
        const report = {
            version: '1.0',
            timestamp: new Date().toISOString(),
            orgAlias: this.orgAlias,
            objectName: this.objectName,
            flowsAnalyzed: this.flowsAnalyzed,
            flowsWithConflicts: this.flowsWithConflicts,
            conflicts: this.conflicts,
            warnings: this.warnings
        };

        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
        console.log(`📁 Full report saved to: ${reportPath}\n`);
    }
}

// CLI Interface
async function main() {
    const args = process.argv.slice(2);

    if (args.length < 1) {
        console.log(`
Flow Conflict Analyzer
======================

Usage:
  node flow-conflict-analyzer.js <org-alias> [object-name]

Examples:
  node flow-conflict-analyzer.js wedgewood-uat Contact
  node flow-conflict-analyzer.js wedgewood-production

This tool will:
  ✓ Scan all active Flows
  ✓ Detect hard-coded RecordTypeId assignments
  ✓ Identify hard-coded picklist values
  ✓ Find other hard-coded field values
  ✓ Rank conflicts by severity
  ✓ Provide specific solutions
        `);
        process.exit(1);
    }

    const [orgAlias, objectName] = args;

    try {
        const analyzer = new FlowConflictAnalyzer(orgAlias, objectName);
        await analyzer.analyze();
    } catch (error) {
        console.error(`\n❌ Error: ${error.message}\n`);
        console.error(error.stack);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = FlowConflictAnalyzer;
