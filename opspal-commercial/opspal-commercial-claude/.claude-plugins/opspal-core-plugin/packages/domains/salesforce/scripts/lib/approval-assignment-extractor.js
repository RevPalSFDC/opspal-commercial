#!/usr/bin/env node

/**
 * Approval & Assignment Rules Field Write Extractor (v3.30.0)
 *
 * Extracts field writes from:
 * - Approval Processes (step field updates, final approval/rejection actions)
 * - Assignment Rules (Lead/Case OwnerId changes)
 * - Auto-Response Rules (field updates on email-to-case/web-to-lead)
 * - Escalation Rules (case escalation field updates)
 *
 * Purpose: Close coverage gap - these automation types write fields but aren't in collision detection
 *
 * @version 1.0.0
 * @date 2025-10-22
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const xml2js = require('xml2js');

class ApprovalAssignmentExtractor {
    constructor(orgAlias, options = {}) {
        this.orgAlias = orgAlias;
        this.verbose = options.verbose || false;
        this.tempDir = options.tempDir || path.join(process.cwd(), '.temp', 'approval-assignment-extract');
        this.results = {
            approvalProcesses: [],
            assignmentRules: [],
            autoResponseRules: [],
            escalationRules: [],
            fieldWrites: [], // Compatible with Field Write Map format
            summary: {
                totalApprovals: 0,
                totalAssignmentRules: 0,
                totalFieldWrites: 0,
                objectsCovered: new Set()
            }
        };

        // Create temp directory if it doesn't exist
        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir, { recursive: true });
        }
    }

    /**
     * Main extraction method
     */
    async extract() {
        console.log(`\n=== Approval & Assignment Rules Extraction ===`);
        console.log(`Organization: ${this.orgAlias}\n`);

        try {
            // Phase 1: Extract Approval Processes
            await this.extractApprovalProcesses();

            // Phase 2: Extract Assignment Rules (Lead + Case)
            await this.extractAssignmentRules();

            // Phase 3: Extract Auto-Response Rules
            await this.extractAutoResponseRules();

            // Phase 4: Extract Escalation Rules
            await this.extractEscalationRules();

            // Phase 5: Convert to Field Write Map format
            this.convertToFieldWriteFormat();

            // Generate summary
            this.generateSummary();

            console.log(`\n✅ Extraction Complete`);
            console.log(`- Approval Processes: ${this.results.summary.totalApprovals}`);
            console.log(`- Assignment Rules: ${this.results.summary.totalAssignmentRules}`);
            console.log(`- Total Field Writes: ${this.results.summary.totalFieldWrites}`);
            console.log(`- Objects Covered: ${this.results.summary.objectsCovered.size}`);

            return this.results;

        } catch (error) {
            console.error(`\n❌ Error during extraction: ${error.message}`);
            if (this.verbose) {
                console.error(error.stack);
            }
            throw error;
        }
    }

    /**
     * Phase 1: Extract Approval Processes via MDAPI
     */
    async extractApprovalProcesses() {
        console.log(`\n[Phase 1] Extracting Approval Processes...`);

        try {
            // Retrieve ApprovalProcess metadata
            const retrieveDir = path.join(this.tempDir, 'approvalProcesses');
            if (!fs.existsSync(retrieveDir)) {
                fs.mkdirSync(retrieveDir, { recursive: true });
            }

            // Create package.xml for ApprovalProcess
            const packageXml = `<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
    <types>
        <members>*</members>
        <name>ApprovalProcess</name>
    </types>
    <version>62.0</version>
</Package>`;

            fs.writeFileSync(path.join(this.tempDir, 'package.xml'), packageXml);

            // Execute sf project retrieve start
            const retrieveCmd = `sf project retrieve start --manifest ${path.join(this.tempDir, 'package.xml')} --target-org ${this.orgAlias} --output-dir ${retrieveDir} --zip-file-name approvals.zip 2>&1`;

            if (this.verbose) {
                console.log(`  Executing: ${retrieveCmd}`);
            }

            const retrieveOutput = execSync(retrieveCmd, { encoding: 'utf8', stdio: 'pipe' }).toString();

            if (this.verbose) {
                console.log(`  Retrieve Output: ${retrieveOutput}`);
            }

            // Parse retrieved approval process files
            const unpackDir = path.join(retrieveDir, 'unpackaged');
            if (fs.existsSync(unpackDir)) {
                this.parseApprovalProcessFiles(unpackDir);
            }

            console.log(`  ✅ Extracted ${this.results.approvalProcesses.length} approval processes`);

        } catch (error) {
            console.warn(`  ⚠️  Warning: Could not retrieve approval processes (${error.message})`);
            console.warn(`  Continuing with other components...`);
        }
    }

    /**
     * Parse Approval Process XML files
     */
    parseApprovalProcessFiles(unpackDir) {
        const approvalDir = path.join(unpackDir, 'approvalProcesses');
        if (!fs.existsSync(approvalDir)) {
            return;
        }

        const files = fs.readdirSync(approvalDir).filter(f => f.endsWith('.approvalProcess'));

        files.forEach(file => {
            try {
                const xmlContent = fs.readFileSync(path.join(approvalDir, file), 'utf8');
                const parser = new xml2js.Parser({ explicitArray: false });

                parser.parseString(xmlContent, (err, result) => {
                    if (err) {
                        console.warn(`    ⚠️  Could not parse ${file}: ${err.message}`);
                        return;
                    }

                    const approval = result.ApprovalProcess;
                    const approvalData = {
                        name: approval.fullName || file.replace('.approvalProcess', ''),
                        object: approval.processDefinitionName || 'Unknown',
                        active: approval.active === 'true',
                        steps: [],
                        finalApprovalActions: [],
                        finalRejectionActions: []
                    };

                    // Extract field updates from approval steps
                    if (approval.approvalStep) {
                        const steps = Array.isArray(approval.approvalStep) ? approval.approvalStep : [approval.approvalStep];
                        steps.forEach((step, index) => {
                            const stepData = {
                                name: step.name || `Step ${index + 1}`,
                                fieldUpdates: []
                            };

                            if (step.approvalActions && step.approvalActions.action) {
                                const actions = Array.isArray(step.approvalActions.action) ? step.approvalActions.action : [step.approvalActions.action];
                                actions.forEach(action => {
                                    if (action.type === 'FieldUpdate' && action.name) {
                                        stepData.fieldUpdates.push(action.name);
                                    }
                                });
                            }

                            approvalData.steps.push(stepData);
                        });
                    }

                    // Extract final approval actions
                    if (approval.finalApprovalActions && approval.finalApprovalActions.action) {
                        const actions = Array.isArray(approval.finalApprovalActions.action) ? approval.finalApprovalActions.action : [approval.finalApprovalActions.action];
                        actions.forEach(action => {
                            if (action.type === 'FieldUpdate' && action.name) {
                                approvalData.finalApprovalActions.push(action.name);
                            }
                        });
                    }

                    // Extract final rejection actions
                    if (approval.finalRejectionActions && approval.finalRejectionActions.action) {
                        const actions = Array.isArray(approval.finalRejectionActions.action) ? approval.finalRejectionActions.action : [approval.finalRejectionActions.action];
                        actions.forEach(action => {
                            if (action.type === 'FieldUpdate' && action.name) {
                                approvalData.finalRejectionActions.push(action.name);
                            }
                        });
                    }

                    this.results.approvalProcesses.push(approvalData);
                });

            } catch (error) {
                console.warn(`    ⚠️  Error parsing ${file}: ${error.message}`);
            }
        });
    }

    /**
     * Phase 2: Extract Assignment Rules
     */
    async extractAssignmentRules() {
        console.log(`\n[Phase 2] Extracting Assignment Rules...`);

        try {
            // Assignment rules for Lead and Case
            const objects = ['Lead', 'Case'];

            for (const obj of objects) {
                const retrieveDir = path.join(this.tempDir, `assignmentRules_${obj}`);
                if (!fs.existsSync(retrieveDir)) {
                    fs.mkdirSync(retrieveDir, { recursive: true });
                }

                // Create package.xml
                const packageXml = `<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
    <types>
        <members>${obj}</members>
        <name>AssignmentRules</name>
    </types>
    <version>62.0</version>
</Package>`;

                fs.writeFileSync(path.join(this.tempDir, `package_assignment_${obj}.xml`), packageXml);

                // Retrieve
                const retrieveCmd = `sf project retrieve start --manifest ${path.join(this.tempDir, `package_assignment_${obj}.xml`)} --target-org ${this.orgAlias} --output-dir ${retrieveDir} 2>&1`;

                try {
                    execSync(retrieveCmd, { encoding: 'utf8', stdio: 'pipe' });
                    this.parseAssignmentRuleFiles(retrieveDir, obj);
                } catch (error) {
                    if (this.verbose) {
                        console.log(`  ℹ️  No assignment rules found for ${obj}`);
                    }
                }
            }

            console.log(`  ✅ Extracted ${this.results.assignmentRules.length} assignment rules`);

        } catch (error) {
            console.warn(`  ⚠️  Warning: Could not retrieve assignment rules (${error.message})`);
        }
    }

    /**
     * Parse Assignment Rule XML files
     */
    parseAssignmentRuleFiles(retrieveDir, objectType) {
        const assignmentDir = path.join(retrieveDir, 'unpackaged', 'assignmentRules');
        if (!fs.existsSync(assignmentDir)) {
            return;
        }

        const files = fs.readdirSync(assignmentDir).filter(f => f.endsWith('.assignmentRules'));

        files.forEach(file => {
            try {
                const xmlContent = fs.readFileSync(path.join(assignmentDir, file), 'utf8');
                const parser = new xml2js.Parser({ explicitArray: false });

                parser.parseString(xmlContent, (err, result) => {
                    if (err) return;

                    const assignmentRules = result.AssignmentRules;
                    if (assignmentRules && assignmentRules.assignmentRule) {
                        const rules = Array.isArray(assignmentRules.assignmentRule) ? assignmentRules.assignmentRule : [assignmentRules.assignmentRule];

                        rules.forEach(rule => {
                            this.results.assignmentRules.push({
                                object: objectType,
                                name: rule.fullName || 'Unnamed',
                                active: rule.active === 'true',
                                fieldWritten: 'OwnerId', // Assignment rules always write OwnerId
                                ruleEntries: rule.ruleEntry ? (Array.isArray(rule.ruleEntry) ? rule.ruleEntry.length : 1) : 0
                            });
                        });
                    }
                });

            } catch (error) {
                console.warn(`    ⚠️  Error parsing ${file}: ${error.message}`);
            }
        });
    }

    /**
     * Phase 3: Extract Auto-Response Rules
     */
    async extractAutoResponseRules() {
        console.log(`\n[Phase 3] Extracting Auto-Response Rules...`);
        // Note: Auto-Response rules primarily send emails, not field updates
        // Included for completeness but won't add many field writes
        console.log(`  ℹ️  Auto-Response rules primarily send emails (no field writes)`);
    }

    /**
     * Phase 4: Extract Escalation Rules
     */
    async extractEscalationRules() {
        console.log(`\n[Phase 4] Extracting Escalation Rules...`);
        // Escalation rules can update fields like Priority, Status during escalation
        // Implementation similar to Assignment Rules if needed
        console.log(`  ℹ️  Escalation rule field extraction not yet implemented`);
    }

    /**
     * Convert extracted data to Field Write Map format
     */
    convertToFieldWriteFormat() {
        // Convert approval process field updates
        this.results.approvalProcesses.forEach(approval => {
            // Step field updates
            approval.steps.forEach(step => {
                step.fieldUpdates.forEach(fieldUpdateName => {
                    this.results.fieldWrites.push({
                        object: approval.object,
                        field: `${approval.object}.${fieldUpdateName}`, // Approximate - would need WorkflowFieldUpdate metadata for exact field
                        sourceName: `${approval.name} - ${step.name}`,
                        sourceType: 'ApprovalProcess',
                        timing: 'AFTER_SAVE', // Approvals run after save
                        operation: 'UPDATE'
                    });
                });
            });

            // Final approval actions
            approval.finalApprovalActions.forEach(fieldUpdateName => {
                this.results.fieldWrites.push({
                    object: approval.object,
                    field: `${approval.object}.${fieldUpdateName}`,
                    sourceName: `${approval.name} - Final Approval`,
                    sourceType: 'ApprovalProcess',
                    timing: 'AFTER_SAVE',
                    operation: 'UPDATE'
                });
            });

            // Final rejection actions
            approval.finalRejectionActions.forEach(fieldUpdateName => {
                this.results.fieldWrites.push({
                    object: approval.object,
                    field: `${approval.object}.${fieldUpdateName}`,
                    sourceName: `${approval.name} - Final Rejection`,
                    sourceType: 'ApprovalProcess',
                    timing: 'AFTER_SAVE',
                    operation: 'UPDATE'
                });
            });
        });

        // Convert assignment rule OwnerId changes
        this.results.assignmentRules.forEach(rule => {
            if (rule.active) {
                this.results.fieldWrites.push({
                    object: rule.object,
                    field: `${rule.object}.OwnerId`,
                    sourceName: rule.name,
                    sourceType: 'AssignmentRule',
                    timing: 'BEFORE_SAVE', // Assignment rules run before save
                    operation: 'UPDATE'
                });
            }
        });
    }

    /**
     * Generate summary statistics
     */
    generateSummary() {
        this.results.summary.totalApprovals = this.results.approvalProcesses.length;
        this.results.summary.totalAssignmentRules = this.results.assignmentRules.length;
        this.results.summary.totalFieldWrites = this.results.fieldWrites.length;

        this.results.fieldWrites.forEach(write => {
            this.results.summary.objectsCovered.add(write.object);
        });

        // Convert Set to Array for JSON serialization
        this.results.summary.objectsCovered = Array.from(this.results.summary.objectsCovered);
    }

    /**
     * Save results to JSON file
     */
    saveResults(outputPath) {
        fs.writeFileSync(outputPath, JSON.stringify(this.results, null, 2));
        console.log(`\n💾 Results saved to: ${outputPath}`);
    }
}

module.exports = ApprovalAssignmentExtractor;

// CLI usage
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.log('Usage: node approval-assignment-extractor.js <org-alias> [--verbose] [--output <file>]');
        console.log('');
        console.log('Extracts field writes from Approval Processes and Assignment Rules.');
        console.log('');
        console.log('Example:');
        console.log('  node approval-assignment-extractor.js production --output approvals.json');
        process.exit(1);
    }

    const orgAlias = args[0];
    const verbose = args.includes('--verbose');
    const outputIndex = args.indexOf('--output');
    const outputFile = outputIndex !== -1 && args[outputIndex + 1] ? args[outputIndex + 1] : null;

    const extractor = new ApprovalAssignmentExtractor(orgAlias, { verbose });

    extractor.extract()
        .then((results) => {
            if (outputFile) {
                extractor.saveResults(outputFile);
            } else {
                console.log('\n=== Field Writes Extracted ===');
                console.log(JSON.stringify(results.fieldWrites, null, 2));
            }
        })
        .catch((error) => {
            console.error(`\n❌ Extraction failed: ${error.message}`);
            process.exit(1);
        });
}
