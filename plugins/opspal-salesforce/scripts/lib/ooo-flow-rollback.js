#!/usr/bin/env node

/**
 * Salesforce Order of Operations - Flow Rollback Handler
 *
 * Implements Section F (Rollbacks) from the Salesforce Order of Operations playbook.
 *
 * Rule: On activation failure (smoke test), deactivate and surface diff.
 *
 * Purpose:
 * - Deactivate flows when smoke tests fail
 * - Generate diff between expected and actual outcomes
 * - Provide clear remediation guidance
 * - Maintain audit trail of rollbacks
 *
 * @see docs/SALESFORCE_ORDER_OF_OPERATIONS.md Section F
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');
const execAsync = promisify(exec);

class OOOFlowRollback {
    constructor(orgAlias, options = {}) {
        this.orgAlias = orgAlias;
        this.verbose = options.verbose || false;
    }

    /**
     * Handle Smoke Test Failure
     *
     * When a flow smoke test fails:
     * 1. Deactivate the flow immediately
     * 2. Generate diff between expected and actual
     * 3. Surface remediation guidance
     * 4. Log rollback for audit
     *
     * @param {string} flowName - Flow API name
     * @param {object} smokeTestResult - Failed smoke test result
     * @returns {Promise<object>} Rollback result
     */
    async handleSmokeTestFailure(flowName, smokeTestResult) {
        this.log(`⚠️  Handling smoke test failure for ${flowName}...`);

        const rollback = {
            flowName,
            timestamp: new Date().toISOString(),
            smokeTestResult,
            steps: []
        };

        try {
            // STEP 1: Deactivate flow
            this.log('Step 1: Deactivating flow...');
            const deactivation = await this.deactivateFlow(flowName);

            if (!deactivation.success) {
                throw new Error(`Failed to deactivate flow: ${deactivation.error}`);
            }

            rollback.deactivation = deactivation;
            rollback.steps.push({ step: 1, name: 'deactivateFlow', status: 'completed' });

            // STEP 2: Generate diff
            this.log('Step 2: Generating expected vs actual diff...');
            const diff = this.generateDiff(
                smokeTestResult.expected,
                smokeTestResult.actual
            );

            rollback.diff = diff;
            rollback.steps.push({ step: 2, name: 'generateDiff', status: 'completed' });

            // STEP 3: Surface remediation
            this.log('Step 3: Generating remediation guidance...');
            const remediation = this.generateRemediation(flowName, diff, smokeTestResult);

            rollback.remediation = remediation;
            rollback.steps.push({ step: 3, name: 'generateRemediation', status: 'completed' });

            // STEP 4: Log rollback
            this.log('Step 4: Logging rollback for audit...');
            await this.logRollback(rollback);
            rollback.steps.push({ step: 4, name: 'logRollback', status: 'completed' });

            this.log('✅ Rollback completed successfully');
            return {
                success: true,
                rollback
            };

        } catch (error) {
            this.log(`❌ Rollback failed: ${error.message}`);
            rollback.error = error.message;
            return {
                success: false,
                error: error.message,
                rollback
            };
        }
    }

    /**
     * Deactivate Flow
     *
     * Sets flow status to Inactive via Tooling API.
     *
     * @param {string} flowName - Flow API name
     * @returns {Promise<object>} Deactivation result
     */
    async deactivateFlow(flowName) {
        try {
            // Query flow definition
            const query = `SELECT Id, ActiveVersionId FROM FlowDefinition WHERE ApiName = '${flowName}'`;

            const { stdout } = await execAsync(
                `sf data query --query "${query}" --use-tooling-api --target-org ${this.orgAlias} --json`,
                { maxBuffer: 10 * 1024 * 1024 }
            );

            const result = JSON.parse(stdout);
            const flowDef = result.result?.records?.[0];

            if (!flowDef) {
                return {
                    success: false,
                    error: `Flow ${flowName} not found`
                };
            }

            if (!flowDef.ActiveVersionId) {
                return {
                    success: true,
                    alreadyInactive: true
                };
            }

            // Deactivate by setting ActiveVersionId to null
            const updateCmd = `sf data update record --sobject FlowDefinition --record-id ${flowDef.Id} --values "ActiveVersionId=null" --use-tooling-api --target-org ${this.orgAlias} --json`;

            const updateResult = await execAsync(updateCmd, { maxBuffer: 10 * 1024 * 1024 });
            const updateData = JSON.parse(updateResult.stdout);

            return {
                success: updateData.status === 0,
                flowDefId: flowDef.Id,
                previousActiveVersion: flowDef.ActiveVersionId,
                error: updateData.status !== 0 ? updateData.message : null
            };

        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Generate Diff
     *
     * Creates a detailed comparison between expected and actual outcomes.
     *
     * @param {object} expected - Expected smoke test outcome
     * @param {object} actual - Actual smoke test outcome
     * @returns {object} Diff object
     */
    generateDiff(expected, actual) {
        const diff = {
            fieldChanges: [],
            recordChanges: [],
            summary: ''
        };

        // Compare field values
        if (expected.fields && actual.fields) {
            for (const [field, expectedValue] of Object.entries(expected.fields)) {
                const actualValue = actual.fields[field];

                if (expectedValue !== actualValue) {
                    diff.fieldChanges.push({
                        field,
                        expected: expectedValue,
                        actual: actualValue,
                        match: false
                    });
                }
            }
        }

        // Compare record creation
        if (expected.recordsCreated !== actual.recordsCreated) {
            diff.recordChanges.push({
                expected: expected.recordsCreated || 0,
                actual: actual.recordsCreated || 0,
                type: 'RECORD_CREATION_MISMATCH'
            });
        }

        // Generate summary
        diff.summary = this.generateDiffSummary(diff);

        return diff;
    }

    generateDiffSummary(diff) {
        const lines = [];

        if (diff.fieldChanges.length > 0) {
            lines.push('Field Value Mismatches:');
            diff.fieldChanges.forEach(fc => {
                lines.push(`  ${fc.field}: Expected "${fc.expected}", got "${fc.actual}"`);
            });
        }

        if (diff.recordChanges.length > 0) {
            lines.push('Record Count Mismatches:');
            diff.recordChanges.forEach(rc => {
                lines.push(`  Expected ${rc.expected} records created, got ${rc.actual}`);
            });
        }

        return lines.join('\n');
    }

    /**
     * Generate Remediation
     *
     * Provides actionable guidance based on smoke test failure.
     *
     * @param {string} flowName - Flow API name
     * @param {object} diff - Diff between expected and actual
     * @param {object} smokeTestResult - Complete smoke test result
     * @returns {object} Remediation guidance
     */
    generateRemediation(flowName, diff, smokeTestResult) {
        const remediation = {
            flowName,
            issues: [],
            suggestions: [],
            nextSteps: []
        };

        // Analyze field changes
        if (diff.fieldChanges.length > 0) {
            diff.fieldChanges.forEach(fc => {
                remediation.issues.push(
                    `Flow did not update ${fc.field} to expected value "${fc.expected}"`
                );
                remediation.suggestions.push(
                    `Review flow logic for field update: ${fc.field}`
                );
            });
        }

        // Analyze record changes
        if (diff.recordChanges.length > 0) {
            diff.recordChanges.forEach(rc => {
                remediation.issues.push(
                    `Flow created ${rc.actual} records, expected ${rc.expected}`
                );
                remediation.suggestions.push(
                    'Review flow create record actions and entry criteria'
                );
            });
        }

        // Generate next steps
        remediation.nextSteps = [
            'Review flow metadata XML for logic errors',
            'Check flow entry criteria and filters',
            'Verify field update assignments',
            'Test with different test data',
            'Fix issues and redeploy using deployFlowSafe()'
        ];

        return remediation;
    }

    /**
     * Log Rollback
     *
     * Creates audit trail for rollback event.
     *
     * @param {object} rollback - Rollback context
     */
    async logRollback(rollback) {
        const logDir = './.ooo-logs';
        try {
            await fs.mkdir(logDir, { recursive: true });
            const logFile = path.join(logDir, `flow-rollback-${Date.now()}.json`);
            await fs.writeFile(logFile, JSON.stringify(rollback, null, 2), 'utf8');

            this.log(`  Rollback logged to ${logFile}`);
        } catch (error) {
            this.log(`  Warning: Failed to log rollback: ${error.message}`);
        }
    }

    log(message) {
        if (this.verbose) {
            console.log(message);
        }
    }
}

// CLI Support
if (require.main === module) {
    const args = process.argv.slice(2);
    const command = args[0];

    if (!command) {
        console.log(`
Salesforce Order of Operations - Flow Rollback Handler

Usage:
  node ooo-flow-rollback.js rollback <flow-name> <org> --smoke-test <json> [options]
  node ooo-flow-rollback.js deactivate <flow-name> <org>

Commands:
  rollback      Handle smoke test failure (deactivate + diff + remediation)
  deactivate    Deactivate flow only

Options:
  --smoke-test <json>    Smoke test result with expected/actual
  --verbose              Show detailed logging

Example:
  node ooo-flow-rollback.js rollback MyFlow myorg \
    --smoke-test '{"expected":{"fields":{"Status__c":"Approved"}},"actual":{"fields":{"Status__c":"Draft"}}}' \
    --verbose

  node ooo-flow-rollback.js deactivate MyFlow myorg --verbose
        `);
        process.exit(0);
    }

    async function runCLI() {
        const flowName = args[1];
        const org = args[2];

        if (!flowName || !org) {
            console.error('Error: Flow name and org are required');
            process.exit(1);
        }

        const options = {
            verbose: args.includes('--verbose')
        };

        const rollbackHandler = new OOOFlowRollback(org, options);

        try {
            if (command === 'rollback') {
                const smokeTestIndex = args.indexOf('--smoke-test');
                if (smokeTestIndex === -1 || !args[smokeTestIndex + 1]) {
                    console.error('Error: --smoke-test is required for rollback');
                    process.exit(1);
                }

                const smokeTestResult = JSON.parse(args[smokeTestIndex + 1]);
                const result = await rollbackHandler.handleSmokeTestFailure(flowName, smokeTestResult);

                console.log(JSON.stringify(result, null, 2));
                process.exit(result.success ? 0 : 1);

            } else if (command === 'deactivate') {
                const result = await rollbackHandler.deactivateFlow(flowName);

                console.log(JSON.stringify(result, null, 2));
                process.exit(result.success ? 0 : 1);

            } else {
                console.error(`Unknown command: ${command}`);
                process.exit(1);
            }
        } catch (error) {
            console.error(`Error: ${error.message}`);
            process.exit(1);
        }
    }

    runCLI();
}

module.exports = { OOOFlowRollback };
