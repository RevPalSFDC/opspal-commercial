/**
 * Flow Segment Tester (Phase 4.2)
 *
 * Test individual Flow segments in isolation to verify logic before integrating
 * into the complete flow. Provides test scenario generation, execution, and
 * assertion capabilities.
 *
 * Features:
 * - Test segments in isolation without full flow deployment
 * - Generate test scenarios from segment metadata
 * - Mock input variables and data
 * - Execute segment logic and capture results
 * - Assert expected outcomes
 * - Coverage analysis per segment
 *
 * Usage:
 * ```javascript
 * const SegmentTester = require('./flow-segment-tester');
 * const tester = new SegmentTester(flowAuthor, { verbose: true });
 *
 * // Generate test scenarios
 * const scenarios = await tester.generateTestScenarios('Validation', {
 *   coverage: 'decision-paths'
 * });
 *
 * // Run tests
 * const results = await tester.runSegmentTests('Validation', scenarios);
 *
 * console.log('Tests passed:', results.passed);
 * console.log('Coverage:', results.coverage + '%');
 * ```
 *
 * @see PHASE_4_SEGMENTATION_COMPLETE.md for implementation details
 * @author Claude (Sonnet 4.5)
 * @version 1.0.0
 */

const fs = require('fs').promises;
const path = require('path');

class FlowSegmentTester {
    /**
     * Create a new FlowSegmentTester
     *
     * @param {FlowAuthor} flowAuthor - FlowAuthor instance
     * @param {Object} options - Configuration options
     * @param {boolean} [options.verbose=false] - Enable verbose logging
     * @param {string} [options.testOutputDir='./test/segments'] - Output directory for test results
     * @param {boolean} [options.generateReports=true] - Generate detailed test reports
     */
    constructor(flowAuthor, options = {}) {
        this.flowAuthor = flowAuthor;
        this.verbose = options.verbose || false;
        this.testOutputDir = options.testOutputDir || './test/segments';
        this.generateReports = options.generateReports !== false;

        // Test results cache
        this.testResults = new Map();
    }

    /**
     * Generate test scenarios for a segment
     *
     * Analyzes segment structure and generates test scenarios covering:
     * - Decision paths (true/false branches)
     * - Null/empty data handling
     * - Boundary conditions
     * - Error conditions
     *
     * @param {string} segmentName - Name of segment to test
     * @param {Object} options - Test generation options
     * @param {string} [options.coverage='decision-paths'] - Coverage strategy: 'decision-paths', 'all-branches', 'boundary'
     * @param {boolean} [options.includeEdgeCases=true] - Include edge case scenarios
     * @returns {Promise<Array<Object>>} Generated test scenarios
     */
    async generateTestScenarios(segmentName, options = {}) {
        this.log(`Generating test scenarios for segment: ${segmentName}`);

        const segment = this._getSegment(segmentName);
        if (!segment) {
            throw new Error(`Segment not found: ${segmentName}`);
        }

        const coverage = options.coverage || 'decision-paths';
        const includeEdgeCases = options.includeEdgeCases !== false;

        const scenarios = [];

        // Analyze segment elements
        const elements = await this._analyzeSegmentElements(segment);

        // Generate scenarios based on coverage strategy
        switch (coverage) {
            case 'decision-paths':
                scenarios.push(...this._generateDecisionPathScenarios(elements, segment));
                break;

            case 'all-branches':
                scenarios.push(...this._generateAllBranchScenarios(elements, segment));
                break;

            case 'boundary':
                scenarios.push(...this._generateBoundaryScenarios(elements, segment));
                break;

            default:
                scenarios.push(...this._generateDecisionPathScenarios(elements, segment));
        }

        // Add edge cases if requested
        if (includeEdgeCases) {
            scenarios.push(...this._generateEdgeCaseScenarios(elements, segment));
        }

        this.log(`Generated ${scenarios.length} test scenarios`);

        return scenarios;
    }

    /**
     * Run tests for a segment with provided scenarios
     *
     * @param {string} segmentName - Name of segment to test
     * @param {Array<Object>} scenarios - Test scenarios
     * @param {Object} options - Test execution options
     * @param {boolean} [options.stopOnFailure=false] - Stop at first failure
     * @param {boolean} [options.parallel=false] - Run tests in parallel
     * @returns {Promise<Object>} Test results
     */
    async runSegmentTests(segmentName, scenarios, options = {}) {
        this.log(`Running ${scenarios.length} tests for segment: ${segmentName}`);

        const segment = this._getSegment(segmentName);
        if (!segment) {
            throw new Error(`Segment not found: ${segmentName}`);
        }

        const results = {
            segment: segmentName,
            totalTests: scenarios.length,
            passed: 0,
            failed: 0,
            skipped: 0,
            duration: 0,
            coverage: {
                decisionsPaths: 0,
                branchesCovered: 0,
                totalBranches: 0
            },
            tests: []
        };

        const startTime = Date.now();

        // Run tests sequentially or in parallel
        if (options.parallel) {
            const testPromises = scenarios.map(scenario =>
                this._runSingleTest(segment, scenario, options)
            );
            const testResults = await Promise.all(testPromises);
            results.tests = testResults;
        } else {
            for (const scenario of scenarios) {
                const testResult = await this._runSingleTest(segment, scenario, options);
                results.tests.push(testResult);

                // Stop on failure if requested
                if (!testResult.passed && options.stopOnFailure) {
                    results.skipped = scenarios.length - results.tests.length;
                    break;
                }
            }
        }

        results.duration = Date.now() - startTime;

        // Calculate statistics
        results.passed = results.tests.filter(t => t.passed).length;
        results.failed = results.tests.filter(t => !t.passed).length;

        // Calculate coverage
        results.coverage = this._calculateCoverage(segment, results.tests);

        // Cache results
        this.testResults.set(segmentName, results);

        // Generate report if requested
        if (this.generateReports) {
            await this._generateTestReport(segmentName, results);
        }

        this.log(`Tests completed: ${results.passed}/${results.totalTests} passed (${Math.round((results.passed / results.totalTests) * 100)}%)`);

        return results;
    }

    /**
     * Run a single test scenario
     *
     * @param {Object} segment - Segment metadata
     * @param {Object} scenario - Test scenario
     * @param {Object} options - Test options
     * @returns {Promise<Object>} Test result
     * @private
     */
    async _runSingleTest(segment, scenario, options) {
        const result = {
            name: scenario.name,
            description: scenario.description,
            passed: false,
            duration: 0,
            error: null,
            actual: null,
            expected: scenario.expected,
            assertions: []
        };

        const startTime = Date.now();

        try {
            // Set up test context with input variables
            const context = this._createTestContext(scenario.inputs);

            // Execute segment logic (simulated)
            const output = await this._executeSegmentLogic(segment, context);

            result.actual = output;

            // Run assertions
            for (const assertion of scenario.assertions) {
                const assertionResult = this._runAssertion(output, assertion);
                result.assertions.push(assertionResult);

                if (!assertionResult.passed) {
                    result.passed = false;
                    result.error = assertionResult.message;
                    break;
                }
            }

            // If all assertions passed
            if (result.assertions.every(a => a.passed)) {
                result.passed = true;
            }

        } catch (error) {
            result.passed = false;
            result.error = error.message;
        }

        result.duration = Date.now() - startTime;

        return result;
    }

    /**
     * Execute segment logic with test context
     *
     * @param {Object} segment - Segment metadata
     * @param {Object} context - Test context with variables
     * @returns {Promise<Object>} Execution output
     * @private
     */
    async _executeSegmentLogic(segment, context) {
        // In a real implementation, this would:
        // 1. Create a temporary flow with just this segment
        // 2. Deploy to a test/scratch org
        // 3. Execute the flow with test inputs
        // 4. Capture and return outputs

        // For now, simulate execution based on element analysis
        const output = {
            variables: { ...context.variables },
            decisions: [],
            records: [],
            errors: []
        };

        // Simulate decision logic
        const elements = segment.elements || [];
        for (const elementName of elements) {
            const element = this._findElementInFlow(elementName);
            if (!element) continue;

            const elementType = this._getElementType(elementName);

            if (elementType === 'decisions') {
                // Simulate decision evaluation
                const decisionResult = this._simulateDecision(element, context);
                output.decisions.push(decisionResult);

                // Update context based on decision outcome
                if (decisionResult.outcome) {
                    context.variables[`${element.name}_Result`] = decisionResult.outcome;
                }
            } else if (elementType === 'assignments') {
                // Simulate assignment execution
                this._simulateAssignment(element, context);
            } else if (elementType === 'recordLookups') {
                // Simulate record lookup
                const records = this._simulateRecordLookup(element, context);
                output.records.push(...records);
            }
        }

        return output;
    }

    /**
     * Simulate decision element execution
     *
     * @param {Object} decision - Decision element
     * @param {Object} context - Test context
     * @returns {Object} Decision result
     * @private
     */
    _simulateDecision(decision, context) {
        // Simple simulation - check if conditions are met
        // In reality, this would evaluate the actual decision logic

        const result = {
            name: decision.name,
            outcome: null,
            path: null
        };

        // Check if decision has rules
        if (decision.rules && Array.isArray(decision.rules)) {
            for (const rule of decision.rules) {
                // Evaluate rule conditions
                const conditionsMet = this._evaluateConditions(rule.conditions, context);

                if (conditionsMet) {
                    result.outcome = rule.label;
                    result.path = rule.connector?.targetReference || 'default';
                    break;
                }
            }
        }

        // If no rule matched, use default outcome
        if (!result.outcome) {
            result.outcome = 'default';
            result.path = decision.defaultConnector?.targetReference || 'end';
        }

        return result;
    }

    /**
     * Simulate assignment element execution
     *
     * @param {Object} assignment - Assignment element
     * @param {Object} context - Test context (modified in place)
     * @private
     */
    _simulateAssignment(assignment, context) {
        // Update context variables based on assignment
        if (assignment.assignmentItems) {
            const items = Array.isArray(assignment.assignmentItems) ? assignment.assignmentItems : [assignment.assignmentItems];

            for (const item of items) {
                if (item.assignToReference && item.value) {
                    // Simple assignment simulation
                    context.variables[item.assignToReference] = item.value.stringValue || item.value.numberValue || item.value.booleanValue;
                }
            }
        }
    }

    /**
     * Simulate record lookup element execution
     *
     * @param {Object} lookup - Record lookup element
     * @param {Object} context - Test context
     * @returns {Array<Object>} Simulated records
     * @private
     */
    _simulateRecordLookup(lookup, context) {
        // Return mock records for testing
        // In reality, this would query test data

        return [{
            Id: 'TEST001',
            Name: 'Test Record',
            Type: 'Test'
        }];
    }

    /**
     * Evaluate conditions against context
     *
     * @param {Array<Object>} conditions - Decision conditions
     * @param {Object} context - Test context
     * @returns {boolean} True if all conditions met
     * @private
     */
    _evaluateConditions(conditions, context) {
        if (!conditions || conditions.length === 0) {
            return true;
        }

        const conditionsArray = Array.isArray(conditions) ? conditions : [conditions];

        for (const condition of conditionsArray) {
            const leftValue = this._resolveValue(condition.leftValueReference, context);
            const rightValue = this._resolveValue(condition.rightValue, context);
            const operator = condition.operator;

            const conditionMet = this._compareValues(leftValue, rightValue, operator);

            if (!conditionMet) {
                return false;
            }
        }

        return true;
    }

    /**
     * Resolve a value reference from context
     *
     * @param {string|Object} valueRef - Value or reference
     * @param {Object} context - Test context
     * @returns {*} Resolved value
     * @private
     */
    _resolveValue(valueRef, context) {
        if (!valueRef) return null;

        // If it's a string reference, look it up in context
        if (typeof valueRef === 'string') {
            return context.variables[valueRef];
        }

        // If it's a value object, extract the value
        if (typeof valueRef === 'object') {
            return valueRef.stringValue || valueRef.numberValue || valueRef.booleanValue || null;
        }

        return valueRef;
    }

    /**
     * Compare two values with an operator
     *
     * @param {*} left - Left value
     * @param {*} right - Right value
     * @param {string} operator - Comparison operator
     * @returns {boolean} Comparison result
     * @private
     */
    _compareValues(left, right, operator) {
        switch (operator) {
            case 'EqualTo':
                return left === right;
            case 'NotEqualTo':
                return left !== right;
            case 'GreaterThan':
                return left > right;
            case 'LessThan':
                return left < right;
            case 'GreaterThanOrEqualTo':
                return left >= right;
            case 'LessThanOrEqualTo':
                return left <= right;
            case 'Contains':
                return String(left).includes(String(right));
            case 'StartsWith':
                return String(left).startsWith(String(right));
            case 'EndsWith':
                return String(left).endsWith(String(right));
            default:
                return false;
        }
    }

    /**
     * Run an assertion on output
     *
     * @param {Object} output - Execution output
     * @param {Object} assertion - Assertion to run
     * @returns {Object} Assertion result
     * @private
     */
    _runAssertion(output, assertion) {
        const result = {
            type: assertion.type,
            passed: false,
            message: ''
        };

        try {
            switch (assertion.type) {
                case 'equals':
                    result.passed = output.variables[assertion.variable] === assertion.value;
                    result.message = result.passed
                        ? `✅ ${assertion.variable} equals ${assertion.value}`
                        : `❌ ${assertion.variable} (${output.variables[assertion.variable]}) does not equal ${assertion.value}`;
                    break;

                case 'contains':
                    result.passed = String(output.variables[assertion.variable]).includes(assertion.value);
                    result.message = result.passed
                        ? `✅ ${assertion.variable} contains ${assertion.value}`
                        : `❌ ${assertion.variable} does not contain ${assertion.value}`;
                    break;

                case 'decision-path':
                    const decision = output.decisions.find(d => d.name === assertion.decision);
                    result.passed = decision && decision.outcome === assertion.expected;
                    result.message = result.passed
                        ? `✅ Decision ${assertion.decision} took expected path: ${assertion.expected}`
                        : `❌ Decision ${assertion.decision} took path: ${decision?.outcome || 'none'}, expected: ${assertion.expected}`;
                    break;

                case 'no-errors':
                    result.passed = output.errors.length === 0;
                    result.message = result.passed
                        ? `✅ No errors occurred`
                        : `❌ Errors occurred: ${output.errors.join(', ')}`;
                    break;

                default:
                    result.passed = false;
                    result.message = `❌ Unknown assertion type: ${assertion.type}`;
            }
        } catch (error) {
            result.passed = false;
            result.message = `❌ Assertion error: ${error.message}`;
        }

        return result;
    }

    /**
     * Generate decision path test scenarios
     *
     * @param {Object} elements - Analyzed segment elements
     * @param {Object} segment - Segment metadata
     * @returns {Array<Object>} Test scenarios
     * @private
     */
    _generateDecisionPathScenarios(elements, segment) {
        const scenarios = [];

        // For each decision, generate scenarios for true/false paths
        elements.decisions.forEach((decision, index) => {
            // True path scenario
            scenarios.push({
                name: `${segment.name}_Decision_${index + 1}_True`,
                description: `Test decision ${decision.name} taking true path`,
                inputs: this._generateInputsForDecision(decision, true),
                expected: { path: 'true' },
                assertions: [
                    {
                        type: 'decision-path',
                        decision: decision.name,
                        expected: decision.rules[0]?.label || 'true'
                    }
                ]
            });

            // False path scenario
            scenarios.push({
                name: `${segment.name}_Decision_${index + 1}_False`,
                description: `Test decision ${decision.name} taking false path`,
                inputs: this._generateInputsForDecision(decision, false),
                expected: { path: 'false' },
                assertions: [
                    {
                        type: 'decision-path',
                        decision: decision.name,
                        expected: 'default'
                    }
                ]
            });
        });

        return scenarios;
    }

    /**
     * Generate all branch test scenarios
     *
     * @param {Object} elements - Analyzed segment elements
     * @param {Object} segment - Segment metadata
     * @returns {Array<Object>} Test scenarios
     * @private
     */
    _generateAllBranchScenarios(elements, segment) {
        // Similar to decision paths but includes all possible branches
        const scenarios = this._generateDecisionPathScenarios(elements, segment);

        // Add combination scenarios for multiple decisions
        if (elements.decisions.length > 1) {
            scenarios.push({
                name: `${segment.name}_All_True`,
                description: 'All decisions take true path',
                inputs: this._generateInputsForAllDecisions(elements.decisions, true),
                expected: { allTrue: true },
                assertions: elements.decisions.map(d => ({
                    type: 'decision-path',
                    decision: d.name,
                    expected: d.rules[0]?.label || 'true'
                }))
            });
        }

        return scenarios;
    }

    /**
     * Generate boundary condition test scenarios
     *
     * @param {Object} elements - Analyzed segment elements
     * @param {Object} segment - Segment metadata
     * @returns {Array<Object>} Test scenarios
     * @private
     */
    _generateBoundaryScenarios(elements, segment) {
        const scenarios = [];

        // Test boundary values for numeric comparisons
        elements.decisions.forEach((decision, index) => {
            // Check if decision uses numeric comparison
            if (this._hasNumericCondition(decision)) {
                scenarios.push({
                    name: `${segment.name}_Decision_${index + 1}_Boundary_Min`,
                    description: `Test decision ${decision.name} with minimum boundary value`,
                    inputs: this._generateBoundaryInputs(decision, 'min'),
                    expected: { boundary: 'min' },
                    assertions: [
                        {
                            type: 'no-errors'
                        }
                    ]
                });

                scenarios.push({
                    name: `${segment.name}_Decision_${index + 1}_Boundary_Max`,
                    description: `Test decision ${decision.name} with maximum boundary value`,
                    inputs: this._generateBoundaryInputs(decision, 'max'),
                    expected: { boundary: 'max' },
                    assertions: [
                        {
                            type: 'no-errors'
                        }
                    ]
                });
            }
        });

        return scenarios;
    }

    /**
     * Generate edge case test scenarios
     *
     * @param {Object} elements - Analyzed segment elements
     * @param {Object} segment - Segment metadata
     * @returns {Array<Object>} Test scenarios
     * @private
     */
    _generateEdgeCaseScenarios(elements, segment) {
        return [
            {
                name: `${segment.name}_Null_Values`,
                description: 'Test with null input values',
                inputs: this._generateNullInputs(elements),
                expected: { handled: true },
                assertions: [
                    {
                        type: 'no-errors'
                    }
                ]
            },
            {
                name: `${segment.name}_Empty_Values`,
                description: 'Test with empty input values',
                inputs: this._generateEmptyInputs(elements),
                expected: { handled: true },
                assertions: [
                    {
                        type: 'no-errors'
                    }
                ]
            }
        ];
    }

    /**
     * Analyze segment elements
     *
     * @param {Object} segment - Segment metadata
     * @returns {Promise<Object>} Element analysis
     * @private
     */
    async _analyzeSegmentElements(segment) {
        const elements = {
            decisions: [],
            assignments: [],
            recordLookups: [],
            loops: []
        };

        for (const elementName of segment.elements) {
            const element = this._findElementInFlow(elementName);
            if (!element) continue;

            const elementType = this._getElementType(elementName);

            if (elementType === 'decisions') {
                elements.decisions.push(element);
            } else if (elementType === 'assignments') {
                elements.assignments.push(element);
            } else if (elementType === 'recordLookups') {
                elements.recordLookups.push(element);
            } else if (elementType === 'loops') {
                elements.loops.push(element);
            }
        }

        return elements;
    }

    /**
     * Calculate test coverage
     *
     * @param {Object} segment - Segment metadata
     * @param {Array<Object>} tests - Test results
     * @returns {Object} Coverage statistics
     * @private
     */
    _calculateCoverage(segment, tests) {
        // Calculate what percentage of segment logic was covered by tests
        const totalDecisionPaths = this._countDecisionPaths(segment);
        const coveredPaths = new Set();

        tests.forEach(test => {
            if (test.passed && test.actual?.decisions) {
                test.actual.decisions.forEach(decision => {
                    coveredPaths.add(`${decision.name}:${decision.outcome}`);
                });
            }
        });

        const coverage = totalDecisionPaths > 0
            ? Math.round((coveredPaths.size / totalDecisionPaths) * 100)
            : 100;

        return {
            decisionPathsCovered: coveredPaths.size,
            totalDecisionPaths,
            coveragePercentage: coverage,
            branchesCovered: coveredPaths.size,
            totalBranches: totalDecisionPaths
        };
    }

    /**
     * Count total decision paths in segment
     *
     * @param {Object} segment - Segment metadata
     * @returns {number} Total paths
     * @private
     */
    _countDecisionPaths(segment) {
        let pathCount = 0;

        for (const elementName of segment.elements) {
            const element = this._findElementInFlow(elementName);
            if (!element) continue;

            const elementType = this._getElementType(elementName);

            if (elementType === 'decisions') {
                // Count rules + default path
                const rulesCount = element.rules ? (Array.isArray(element.rules) ? element.rules.length : 1) : 0;
                pathCount += rulesCount + 1; // +1 for default path
            }
        }

        return pathCount;
    }

    /**
     * Generate test report
     *
     * @param {string} segmentName - Segment name
     * @param {Object} results - Test results
     * @returns {Promise<string>} Report path
     * @private
     */
    async _generateTestReport(segmentName, results) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const reportPath = path.join(this.testOutputDir, `${segmentName}_${timestamp}.md`);

        await fs.mkdir(this.testOutputDir, { recursive: true });

        const report = `# Segment Test Report: ${segmentName}

**Date**: ${new Date().toISOString()}
**Duration**: ${results.duration}ms

## Summary

- **Total Tests**: ${results.totalTests}
- **Passed**: ✅ ${results.passed} (${Math.round((results.passed / results.totalTests) * 100)}%)
- **Failed**: ❌ ${results.failed} (${Math.round((results.failed / results.totalTests) * 100)}%)
- **Skipped**: ⚠️ ${results.skipped}

## Coverage

- **Decision Paths**: ${results.coverage.decisionPathsCovered}/${results.coverage.totalDecisionPaths} (${results.coverage.coveragePercentage}%)
- **Branches**: ${results.coverage.branchesCovered}/${results.coverage.totalBranches}

## Test Results

${results.tests.map((test, index) => `
### Test ${index + 1}: ${test.name}

**Description**: ${test.description}
**Status**: ${test.passed ? '✅ PASSED' : '❌ FAILED'}
**Duration**: ${test.duration}ms
${test.error ? `**Error**: ${test.error}` : ''}

**Assertions**:
${test.assertions.map(a => `- ${a.message}`).join('\n')}
`).join('\n---\n')}

## Recommendations

${results.coverage.coveragePercentage < 80 ? '⚠️ Coverage below 80% - consider adding more test scenarios' : '✅ Coverage meets minimum threshold'}
${results.failed > 0 ? `❌ ${results.failed} test(s) failed - review and fix segment logic` : '✅ All tests passed'}
`;

        await fs.writeFile(reportPath, report, 'utf-8');

        this.log(`Test report generated: ${reportPath}`);

        return reportPath;
    }

    /**
     * Create test context with input variables
     *
     * @param {Object} inputs - Input variables
     * @returns {Object} Test context
     * @private
     */
    _createTestContext(inputs) {
        return {
            variables: { ...inputs }
        };
    }

    /**
     * Generate inputs for a decision (true/false path)
     *
     * @param {Object} decision - Decision element
     * @param {boolean} truePath - Generate inputs for true path
     * @returns {Object} Input variables
     * @private
     */
    _generateInputsForDecision(decision, truePath) {
        const inputs = {};

        // Analyze decision rules to generate appropriate inputs
        if (decision.rules && Array.isArray(decision.rules) && decision.rules.length > 0) {
            const rule = decision.rules[0];

            if (rule.conditions) {
                const conditions = Array.isArray(rule.conditions) ? rule.conditions : [rule.conditions];

                conditions.forEach(condition => {
                    const varName = condition.leftValueReference;

                    if (truePath) {
                        // Generate value that satisfies condition
                        inputs[varName] = this._generateSatisfyingValue(condition);
                    } else {
                        // Generate value that fails condition
                        inputs[varName] = this._generateFailingValue(condition);
                    }
                });
            }
        }

        return inputs;
    }

    /**
     * Generate value that satisfies a condition
     *
     * @param {Object} condition - Condition to satisfy
     * @returns {*} Satisfying value
     * @private
     */
    _generateSatisfyingValue(condition) {
        const operator = condition.operator;
        const rightValue = this._extractConditionValue(condition.rightValue);

        switch (operator) {
            case 'EqualTo':
                return rightValue;
            case 'NotEqualTo':
                return rightValue + '_different';
            case 'GreaterThan':
                return typeof rightValue === 'number' ? rightValue + 1 : rightValue;
            case 'LessThan':
                return typeof rightValue === 'number' ? rightValue - 1 : rightValue;
            case 'GreaterThanOrEqualTo':
                return rightValue;
            case 'LessThanOrEqualTo':
                return rightValue;
            case 'Contains':
                return String(rightValue);
            case 'StartsWith':
                return String(rightValue) + '_suffix';
            case 'EndsWith':
                return 'prefix_' + String(rightValue);
            default:
                return rightValue;
        }
    }

    /**
     * Generate value that fails a condition
     *
     * @param {Object} condition - Condition to fail
     * @returns {*} Failing value
     * @private
     */
    _generateFailingValue(condition) {
        const operator = condition.operator;
        const rightValue = this._extractConditionValue(condition.rightValue);

        switch (operator) {
            case 'EqualTo':
                return rightValue + '_different';
            case 'NotEqualTo':
                return rightValue;
            case 'GreaterThan':
                return typeof rightValue === 'number' ? rightValue - 1 : rightValue;
            case 'LessThan':
                return typeof rightValue === 'number' ? rightValue + 1 : rightValue;
            default:
                return null; // Null often fails conditions
        }
    }

    /**
     * Extract value from condition right value
     *
     * @param {Object} rightValue - Right value object
     * @returns {*} Extracted value
     * @private
     */
    _extractConditionValue(rightValue) {
        if (!rightValue) return null;

        if (typeof rightValue === 'object') {
            return rightValue.stringValue || rightValue.numberValue || rightValue.booleanValue || null;
        }

        return rightValue;
    }

    /**
     * Generate inputs for all decisions
     *
     * @param {Array<Object>} decisions - Decision elements
     * @param {boolean} truePath - True for all paths
     * @returns {Object} Input variables
     * @private
     */
    _generateInputsForAllDecisions(decisions, truePath) {
        const inputs = {};

        decisions.forEach(decision => {
            const decisionInputs = this._generateInputsForDecision(decision, truePath);
            Object.assign(inputs, decisionInputs);
        });

        return inputs;
    }

    /**
     * Generate boundary inputs
     *
     * @param {Object} decision - Decision element
     * @param {string} boundaryType - 'min' or 'max'
     * @returns {Object} Input variables
     * @private
     */
    _generateBoundaryInputs(decision, boundaryType) {
        const inputs = {};

        if (decision.rules && Array.isArray(decision.rules)) {
            const rule = decision.rules[0];

            if (rule.conditions) {
                const conditions = Array.isArray(rule.conditions) ? rule.conditions : [rule.conditions];

                conditions.forEach(condition => {
                    const varName = condition.leftValueReference;
                    const rightValue = this._extractConditionValue(condition.rightValue);

                    if (typeof rightValue === 'number') {
                        inputs[varName] = boundaryType === 'min' ? rightValue : rightValue + 1000000;
                    }
                });
            }
        }

        return inputs;
    }

    /**
     * Generate null inputs
     *
     * @param {Object} elements - Segment elements
     * @returns {Object} Null input variables
     * @private
     */
    _generateNullInputs(elements) {
        const inputs = {};

        // Set all potential variables to null
        elements.decisions.forEach(decision => {
            if (decision.rules && Array.isArray(decision.rules)) {
                decision.rules.forEach(rule => {
                    if (rule.conditions) {
                        const conditions = Array.isArray(rule.conditions) ? rule.conditions : [rule.conditions];
                        conditions.forEach(condition => {
                            inputs[condition.leftValueReference] = null;
                        });
                    }
                });
            }
        });

        return inputs;
    }

    /**
     * Generate empty inputs
     *
     * @param {Object} elements - Segment elements
     * @returns {Object} Empty input variables
     * @private
     */
    _generateEmptyInputs(elements) {
        const inputs = {};

        // Set all potential variables to empty string
        elements.decisions.forEach(decision => {
            if (decision.rules && Array.isArray(decision.rules)) {
                decision.rules.forEach(rule => {
                    if (rule.conditions) {
                        const conditions = Array.isArray(rule.conditions) ? rule.conditions : [rule.conditions];
                        conditions.forEach(condition => {
                            inputs[condition.leftValueReference] = '';
                        });
                    }
                });
            }
        });

        return inputs;
    }

    /**
     * Check if decision has numeric condition
     *
     * @param {Object} decision - Decision element
     * @returns {boolean} True if has numeric condition
     * @private
     */
    _hasNumericCondition(decision) {
        if (!decision.rules || !Array.isArray(decision.rules)) {
            return false;
        }

        return decision.rules.some(rule => {
            if (!rule.conditions) return false;

            const conditions = Array.isArray(rule.conditions) ? rule.conditions : [rule.conditions];

            return conditions.some(condition => {
                const operator = condition.operator;
                return ['GreaterThan', 'LessThan', 'GreaterThanOrEqualTo', 'LessThanOrEqualTo'].includes(operator);
            });
        });
    }

    /**
     * Get segment by name
     *
     * @param {string} segmentName - Segment name
     * @returns {Object|null} Segment metadata
     * @private
     */
    _getSegment(segmentName) {
        if (!this.flowAuthor.segmentManager) {
            throw new Error('Segmentation not enabled in FlowAuthor');
        }

        const segments = this.flowAuthor.segmentManager.segments;
        return segments.find(s => s.name === segmentName) || null;
    }

    /**
     * Find element in flow by name
     *
     * @param {string} elementName - Element name
     * @returns {Object|null} Element
     * @private
     */
    _findElementInFlow(elementName) {
        const flow = this.flowAuthor.flow;
        const elementTypes = [
            'decisions', 'assignments', 'actionCalls', 'recordLookups',
            'recordCreates', 'recordUpdates', 'recordDeletes',
            'loops', 'screens', 'subflows', 'waits'
        ];

        for (const type of elementTypes) {
            if (!flow[type]) continue;

            const elements = Array.isArray(flow[type]) ? flow[type] : [flow[type]];
            const element = elements.find(el => el.name === elementName);
            if (element) return element;
        }

        return null;
    }

    /**
     * Get element type by name
     *
     * @param {string} elementName - Element name
     * @returns {string|null} Element type
     * @private
     */
    _getElementType(elementName) {
        const flow = this.flowAuthor.flow;
        const elementTypes = [
            'decisions', 'assignments', 'actionCalls', 'recordLookups',
            'recordCreates', 'recordUpdates', 'recordDeletes',
            'loops', 'screens', 'subflows', 'waits'
        ];

        for (const type of elementTypes) {
            if (!flow[type]) continue;

            const elements = Array.isArray(flow[type]) ? flow[type] : [flow[type]];
            const element = elements.find(el => el.name === elementName);
            if (element) return type;
        }

        return null;
    }

    /**
     * Log helper
     *
     * @param {string} message - Message to log
     * @private
     */
    log(message) {
        if (this.verbose) {
            console.log(`[FlowSegmentTester] ${message}`);
        }
    }
}

module.exports = FlowSegmentTester;
