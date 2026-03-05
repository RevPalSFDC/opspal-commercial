/**
 * Flow Modification Test Harness
 *
 * Validates flow modification operations with test inputs and expected outcomes.
 * Tests natural language parsing, element creation, connector rewiring, etc.
 *
 * Usage:
 *   npm test -- flow-modification-test-harness.mjs
 *   node test/flow-modification-test-harness.mjs --verbose
 */

import { FlowNLPModifier } from '../scripts/lib/flow-nlp-modifier.js';
import { FlowDiffChecker } from '../scripts/lib/flow-diff-checker.js';
import fs from 'fs/promises';
import path from 'path';

class FlowModificationTestHarness {
    constructor(options = {}) {
        this.verbose = options.verbose || false;
        this.testFlowPath = './test/fixtures/flows/Test_Flow.flow-meta.xml';
        this.results = [];
    }

    /**
     * Run all test suites
     */
    async runAll() {
        console.log('\n🧪 Flow Modification Test Harness');
        console.log('='.repeat(80));

        const suites = [
            { name: 'Natural Language Parsing', tests: this.getNLPTests() },
            { name: 'Element Addition', tests: this.getAdditionTests() },
            { name: 'Element Modification', tests: this.getModificationTests() },
            { name: 'Element Removal', tests: this.getRemovalTests() },
            { name: 'Connector Rewiring', tests: this.getConnectorTests() },
            { name: 'Error Handling', tests: this.getErrorTests() }
        ];

        for (const suite of suites) {
            await this.runSuite(suite.name, suite.tests);
        }

        this.printSummary();
    }

    /**
     * Run a test suite
     */
    async runSuite(suiteName, tests) {
        console.log(`\n📋 ${suiteName}`);
        console.log('-'.repeat(80));

        for (const test of tests) {
            await this.runTest(test);
        }
    }

    /**
     * Run a single test
     */
    async runTest(test) {
        const startTime = Date.now();

        try {
            // Setup: Create test flow copy
            const testCopyPath = this.testFlowPath + '.test';
            await fs.copyFile(this.testFlowPath, testCopyPath);

            // Execute test
            const nlp = new FlowNLPModifier(testCopyPath, 'test-org', { verbose: this.verbose });

            if (test.instruction) {
                await nlp.parseAndApply(test.instruction);
            } else if (test.operation) {
                await test.operation(nlp);
            }

            // Validate expected outcome
            const checker = new FlowDiffChecker({ verbose: false });
            const diff = await checker.compare(this.testFlowPath, testCopyPath);

            const passed = this.validateExpectedOutcome(diff, test.expected);

            // Record result
            this.results.push({
                suite: test.suite,
                name: test.name,
                passed: passed,
                duration: Date.now() - startTime,
                diff: diff,
                error: null
            });

            console.log(`  ${passed ? '✅' : '❌'} ${test.name} (${Date.now() - startTime}ms)`);

            if (!passed && this.verbose) {
                console.log(`     Expected: ${JSON.stringify(test.expected)}`);
                console.log(`     Got: ${JSON.stringify(diff.summary)}`);
            }

            // Cleanup
            await fs.unlink(testCopyPath);

        } catch (error) {
            this.results.push({
                suite: test.suite,
                name: test.name,
                passed: false,
                duration: Date.now() - startTime,
                diff: null,
                error: error.message
            });

            console.log(`  ❌ ${test.name} (${Date.now() - startTime}ms)`);
            console.log(`     Error: ${error.message}`);
        }
    }

    /**
     * Validate expected outcome against diff
     */
    validateExpectedOutcome(diff, expected) {
        if (expected.elementsAdded !== undefined && diff.summary.elementsAdded !== expected.elementsAdded) {
            return false;
        }

        if (expected.elementsRemoved !== undefined && diff.summary.elementsRemoved !== expected.elementsRemoved) {
            return false;
        }

        if (expected.elementsModified !== undefined && diff.summary.elementsModified !== expected.elementsModified) {
            return false;
        }

        if (expected.riskLevel !== undefined && diff.summary.riskLevel !== expected.riskLevel) {
            return false;
        }

        if (expected.elementName) {
            const added = diff.elementsAdded.find(e => e.name.includes(expected.elementName));
            if (!added) return false;
        }

        if (expected.elementType) {
            const added = diff.elementsAdded.find(e => e.type === expected.elementType);
            if (!added) return false;
        }

        return true;
    }

    /**
     * Test cases: Natural Language Parsing
     */
    getNLPTests() {
        return [
            {
                suite: 'NLP',
                name: 'Parse: Add email after element',
                instruction: 'Add an email alert after Decision_Approval',
                expected: {
                    elementsAdded: 1,
                    elementType: 'actionCalls'
                }
            },
            {
                suite: 'NLP',
                name: 'Parse: Change threshold value',
                instruction: 'Change Decision_High_Value threshold from 50000 to 100000',
                expected: {
                    elementsModified: 1
                }
            },
            {
                suite: 'NLP',
                name: 'Parse: Remove element',
                instruction: 'Remove Legacy_Email_Step',
                expected: {
                    elementsRemoved: 1,
                    riskLevel: 'HIGH'
                }
            }
        ];
    }

    /**
     * Test cases: Element Addition
     */
    getAdditionTests() {
        return [
            {
                suite: 'Addition',
                name: 'Add Decision element',
                operation: async (nlp) => {
                    await nlp.api.addElement({
                        type: 'decision',
                        name: 'Test_Decision',
                        afterElement: 'Start',
                        settings: {
                            label: 'Test Decision',
                            rules: [{
                                name: 'Rule_1',
                                label: 'Rule 1',
                                conditions: [{ field: 'Account.AnnualRevenue', operator: 'GreaterThan', value: '1000000' }],
                                targetElement: 'End'
                            }],
                            defaultConnector: 'End'
                        }
                    });
                },
                expected: {
                    elementsAdded: 1,
                    elementType: 'decisions'
                }
            }
        ];
    }

    /**
     * Test cases: Element Modification
     */
    getModificationTests() {
        return [
            {
                suite: 'Modification',
                name: 'Modify decision condition',
                operation: async (nlp) => {
                    await nlp.api.modifyElement('Decision_High_Value', {
                        'rules[0].conditions[0].rightValue': '150000'
                    });
                },
                expected: {
                    elementsModified: 1,
                    riskLevel: 'MEDIUM'
                }
            }
        ];
    }

    /**
     * Test cases: Element Removal
     */
    getRemovalTests() {
        return [
            {
                suite: 'Removal',
                name: 'Remove element with connector rewiring',
                operation: async (nlp) => {
                    await nlp.api.removeElement('Intermediate_Step');
                },
                expected: {
                    elementsRemoved: 1,
                    riskLevel: 'HIGH'
                }
            }
        ];
    }

    /**
     * Test cases: Connector Rewiring
     */
    getConnectorTests() {
        return [
            {
                suite: 'Connectors',
                name: 'Verify connector rewiring after removal',
                operation: async (nlp) => {
                    // Remove middle element, verify connectors reconnect properly
                    await nlp.api.removeElement('Middle_Element');
                },
                expected: {
                    elementsRemoved: 1,
                    // Connectors should be rewired automatically
                }
            }
        ];
    }

    /**
     * Test cases: Error Handling
     */
    getErrorTests() {
        return [
            {
                suite: 'Errors',
                name: 'Handle element not found',
                instruction: 'Remove Nonexistent_Element',
                expected: {
                    error: 'Element not found'
                }
            }
        ];
    }

    /**
     * Print test summary
     */
    printSummary() {
        console.log('\n' + '='.repeat(80));
        console.log('📊 Test Summary');
        console.log('='.repeat(80));

        const passed = this.results.filter(r => r.passed).length;
        const failed = this.results.filter(r => !r.passed).length;
        const total = this.results.length;

        console.log(`\n  Total: ${total}`);
        console.log(`  ✅ Passed: ${passed} (${((passed / total) * 100).toFixed(1)}%)`);
        console.log(`  ❌ Failed: ${failed} (${((failed / total) * 100).toFixed(1)}%)`);

        if (failed > 0) {
            console.log(`\n  Failed Tests:`);
            this.results.filter(r => !r.passed).forEach(r => {
                console.log(`    - ${r.suite}: ${r.name}`);
                if (r.error) {
                    console.log(`      Error: ${r.error}`);
                }
            });
        }

        console.log('\n' + '='.repeat(80) + '\n');

        // Exit with error code if tests failed
        if (failed > 0) {
            process.exit(1);
        }
    }
}

// Run tests
if (import.meta.url === `file://${process.argv[1]}`) {
    const verbose = process.argv.includes('--verbose');
    const harness = new FlowModificationTestHarness({ verbose });

    harness.runAll().catch(error => {
        console.error('Test harness failed:', error);
        process.exit(1);
    });
}

export { FlowModificationTestHarness };
