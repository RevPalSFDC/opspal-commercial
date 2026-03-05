/**
 * Tests for Early Terminator
 *
 * @module enrichment/early-terminator.test
 */

'use strict';

const { EarlyTerminator, TERMINATION_REASONS } = require('../../enrichment/early-terminator');

describe('EarlyTerminator', () => {
    describe('Exports', () => {
        test('exports EarlyTerminator class', () => {
            expect(EarlyTerminator).toBeDefined();
            expect(typeof EarlyTerminator).toBe('function');
        });

        test('exports TERMINATION_REASONS', () => {
            expect(TERMINATION_REASONS).toBeDefined();
            expect(typeof TERMINATION_REASONS).toBe('object');
        });

        test('TERMINATION_REASONS has expected values', () => {
            expect(TERMINATION_REASONS.ALL_FIELDS_CONFIDENT).toBe('all_required_fields_confident');
            expect(TERMINATION_REASONS.THRESHOLD_MET).toBe('confidence_threshold_met');
            expect(TERMINATION_REASONS.MAX_ITERATIONS).toBe('max_iterations_reached');
            expect(TERMINATION_REASONS.MAX_API_CALLS).toBe('max_api_calls_reached');
            expect(TERMINATION_REASONS.TIMEOUT).toBe('timeout_reached');
            expect(TERMINATION_REASONS.NO_PROGRESS).toBe('no_progress_detected');
            expect(TERMINATION_REASONS.COST_LIMIT).toBe('cost_limit_reached');
        });
    });

    describe('Constructor', () => {
        test('creates instance with defaults', () => {
            const terminator = new EarlyTerminator();

            expect(terminator.confidenceThreshold).toBe(4);
            expect(terminator.maxIterations).toBe(3);
            expect(terminator.maxApiCalls).toBe(10);
            expect(terminator.timeout_ms).toBe(30000);
            expect(terminator.requiredFields).toEqual([]);
            expect(terminator.optionalFields).toEqual([]);
            expect(terminator.costAware).toBe(true);
        });

        test('accepts custom options', () => {
            const terminator = new EarlyTerminator({
                confidenceThreshold: 3,
                maxIterations: 5,
                maxApiCalls: 20,
                timeout_ms: 60000,
                requiredFields: ['industry', 'employee_count'],
                optionalFields: ['founded_year'],
                costAware: false,
                costLimit: 100
            });

            expect(terminator.confidenceThreshold).toBe(3);
            expect(terminator.maxIterations).toBe(5);
            expect(terminator.maxApiCalls).toBe(20);
            expect(terminator.timeout_ms).toBe(60000);
            expect(terminator.requiredFields).toEqual(['industry', 'employee_count']);
            expect(terminator.optionalFields).toEqual(['founded_year']);
            expect(terminator.costAware).toBe(false);
            expect(terminator.costLimit).toBe(100);
        });

        test('sets allRequiredThreshold from confidenceThreshold if not specified', () => {
            const terminator = new EarlyTerminator({ confidenceThreshold: 3 });
            expect(terminator.allRequiredThreshold).toBe(3);
        });

        test('accepts separate allRequiredThreshold', () => {
            const terminator = new EarlyTerminator({
                confidenceThreshold: 4,
                allRequiredThreshold: 3
            });
            expect(terminator.allRequiredThreshold).toBe(3);
        });

        test('initializes state tracking to null/zero', () => {
            const terminator = new EarlyTerminator();

            expect(terminator.startTime).toBeNull();
            expect(terminator.iterationCount).toBe(0);
            expect(terminator.apiCallCount).toBe(0);
            expect(terminator.totalCost).toBe(0);
            expect(terminator.previousResults).toBeNull();
            expect(terminator.progressHistory).toEqual([]);
        });
    });

    describe('State Tracking', () => {
        let terminator;

        beforeEach(() => {
            terminator = new EarlyTerminator();
        });

        describe('start', () => {
            test('initializes start time', () => {
                terminator.start();
                expect(terminator.startTime).not.toBeNull();
                expect(typeof terminator.startTime).toBe('number');
            });

            test('resets all counters', () => {
                terminator.iterationCount = 5;
                terminator.apiCallCount = 10;
                terminator.totalCost = 100;
                terminator.previousResults = { test: 'data' };
                terminator.progressHistory = [{ iteration: 1 }];

                terminator.start();

                expect(terminator.iterationCount).toBe(0);
                expect(terminator.apiCallCount).toBe(0);
                expect(terminator.totalCost).toBe(0);
                expect(terminator.previousResults).toBeNull();
                expect(terminator.progressHistory).toEqual([]);
            });
        });

        describe('recordIteration', () => {
            test('increments iteration count', () => {
                terminator.start();
                terminator.recordIteration({});
                expect(terminator.iterationCount).toBe(1);

                terminator.recordIteration({});
                expect(terminator.iterationCount).toBe(2);
            });

            test('adds to progress history', () => {
                terminator.start();
                const results = {
                    industry: { confidence: 4 },
                    employee_count: { confidence: 3 }
                };

                terminator.recordIteration(results);

                expect(terminator.progressHistory).toHaveLength(1);
                expect(terminator.progressHistory[0].iteration).toBe(1);
                expect(terminator.progressHistory[0].fieldsEnriched).toBe(2);
                expect(terminator.progressHistory[0].avgConfidence).toBe(3.5);
            });

            test('stores previous results', () => {
                terminator.start();
                const results = { field1: { confidence: 4 } };

                terminator.recordIteration(results);

                expect(terminator.previousResults).toBe(results);
            });
        });

        describe('recordApiCalls', () => {
            test('increments API call count', () => {
                terminator.recordApiCalls(3);
                expect(terminator.apiCallCount).toBe(3);

                terminator.recordApiCalls(2);
                expect(terminator.apiCallCount).toBe(5);
            });

            test('defaults to 1 call', () => {
                terminator.recordApiCalls();
                expect(terminator.apiCallCount).toBe(1);
            });

            test('tracks total cost', () => {
                terminator.recordApiCalls(1, 0.5);
                terminator.recordApiCalls(2, 1.0);
                expect(terminator.totalCost).toBe(1.5);
            });

            test('defaults cost to 0', () => {
                terminator.recordApiCalls(1);
                expect(terminator.totalCost).toBe(0);
            });
        });

        describe('reset', () => {
            test('is alias for start', () => {
                terminator.iterationCount = 5;
                terminator.apiCallCount = 10;

                terminator.reset();

                expect(terminator.iterationCount).toBe(0);
                expect(terminator.apiCallCount).toBe(0);
                expect(terminator.startTime).not.toBeNull();
            });
        });
    });

    describe('shouldStop', () => {
        let terminator;

        beforeEach(() => {
            terminator = new EarlyTerminator({
                requiredFields: ['industry', 'employee_count'],
                optionalFields: ['founded_year'],
                confidenceThreshold: 4,
                maxIterations: 3,
                maxApiCalls: 10,
                timeout_ms: 5000
            });
            terminator.start();
        });

        describe('All Fields Confident (SUCCESS)', () => {
            test('returns stop=true when all required fields meet threshold', () => {
                const results = {
                    industry: { confidence: 4 },
                    employee_count: { confidence: 5 }
                };

                const decision = terminator.shouldStop(results);

                expect(decision.stop).toBe(true);
                expect(decision.reason).toBe(TERMINATION_REASONS.ALL_FIELDS_CONFIDENT);
            });

            test('returns stop=false when required fields below threshold', () => {
                const results = {
                    industry: { confidence: 4 },
                    employee_count: { confidence: 3 } // Below threshold
                };

                const decision = terminator.shouldStop(results);

                expect(decision.stop).toBe(false);
            });

            test('returns stop=false when required field missing', () => {
                const results = {
                    industry: { confidence: 4 }
                    // employee_count missing
                };

                const decision = terminator.shouldStop(results);

                expect(decision.stop).toBe(false);
            });

            test('includes field status in response', () => {
                const results = {
                    industry: { confidence: 4 },
                    employee_count: { confidence: 5 }
                };

                const decision = terminator.shouldStop(results);

                expect(decision.fieldStatus).toBeDefined();
                expect(decision.fieldStatus.industry.met).toBe(true);
                expect(decision.fieldStatus.employee_count.met).toBe(true);
            });
        });

        describe('No Required Fields', () => {
            test('stops when minimum fields enriched without required fields', () => {
                const noRequiredTerminator = new EarlyTerminator({
                    requiredFields: [],
                    minFieldsEnriched: 2
                });
                noRequiredTerminator.start();

                const results = {
                    field1: { confidence: 3 },
                    field2: { confidence: 4 }
                };

                const decision = noRequiredTerminator.shouldStop(results);

                expect(decision.stop).toBe(true);
                expect(decision.reason).toBe(TERMINATION_REASONS.ALL_FIELDS_CONFIDENT);
            });

            test('continues when below minimum fields', () => {
                const noRequiredTerminator = new EarlyTerminator({
                    requiredFields: [],
                    minFieldsEnriched: 3
                });
                noRequiredTerminator.start();

                const results = {
                    field1: { confidence: 3 },
                    field2: { confidence: 4 }
                };

                const decision = noRequiredTerminator.shouldStop(results);

                expect(decision.stop).toBe(false);
            });
        });

        describe('Timeout', () => {
            test('returns stop=true when timeout reached', async () => {
                const shortTerminator = new EarlyTerminator({
                    timeout_ms: 10 // Very short timeout
                });
                shortTerminator.start();

                // Wait for timeout
                await new Promise(resolve => setTimeout(resolve, 15));

                const decision = shortTerminator.shouldStop({});

                expect(decision.stop).toBe(true);
                expect(decision.reason).toBe(TERMINATION_REASONS.TIMEOUT);
            });

            test('returns stop=false when within timeout', () => {
                const decision = terminator.shouldStop({});

                // With fresh start and 5000ms timeout, should not be timed out
                expect(decision.stop).toBe(false);
            });
        });

        describe('Max Iterations', () => {
            test('returns stop=true when max iterations reached', () => {
                terminator.iterationCount = 3; // Max is 3

                const decision = terminator.shouldStop({});

                expect(decision.stop).toBe(true);
                expect(decision.reason).toBe(TERMINATION_REASONS.MAX_ITERATIONS);
                expect(decision.iterations).toBe(3);
            });

            test('returns stop=false when under max iterations', () => {
                terminator.iterationCount = 2;

                const decision = terminator.shouldStop({});

                expect(decision.stop).toBe(false);
            });
        });

        describe('Max API Calls', () => {
            test('returns stop=true when max API calls reached', () => {
                terminator.apiCallCount = 10; // Max is 10

                const decision = terminator.shouldStop({});

                expect(decision.stop).toBe(true);
                expect(decision.reason).toBe(TERMINATION_REASONS.MAX_API_CALLS);
                expect(decision.apiCalls).toBe(10);
            });

            test('returns stop=false when under max API calls', () => {
                terminator.apiCallCount = 5;

                const decision = terminator.shouldStop({});

                expect(decision.stop).toBe(false);
            });
        });

        describe('Cost Limit', () => {
            test('returns stop=true when cost limit reached', () => {
                const costTerminator = new EarlyTerminator({
                    costAware: true,
                    costLimit: 10
                });
                costTerminator.start();
                costTerminator.totalCost = 10;

                const decision = costTerminator.shouldStop({});

                expect(decision.stop).toBe(true);
                expect(decision.reason).toBe(TERMINATION_REASONS.COST_LIMIT);
            });

            test('ignores cost limit when costAware is false', () => {
                const noCostTerminator = new EarlyTerminator({
                    costAware: false,
                    costLimit: 10,
                    requiredFields: [],
                    minFieldsEnriched: 10 // High so it won't stop for other reasons
                });
                noCostTerminator.start();
                noCostTerminator.totalCost = 100;

                const decision = noCostTerminator.shouldStop({});

                expect(decision.reason).not.toBe(TERMINATION_REASONS.COST_LIMIT);
            });
        });

        describe('No Progress', () => {
            test('returns stop=true when no progress after iteration 2+', () => {
                terminator.start();

                // First iteration
                const results1 = {
                    industry: { confidence: 3 }
                };
                terminator.recordIteration(results1);

                // Second iteration - no change
                terminator.recordIteration(results1);

                const decision = terminator.shouldStop(results1);

                expect(decision.stop).toBe(true);
                expect(decision.reason).toBe(TERMINATION_REASONS.NO_PROGRESS);
            });

            test('returns stop=false on first iteration', () => {
                const results = {
                    industry: { confidence: 3 }
                };

                // Only one iteration
                terminator.recordIteration(results);

                const decision = terminator.shouldStop(results);

                // Should not trigger no-progress on first iteration
                expect(decision.reason).not.toBe(TERMINATION_REASONS.NO_PROGRESS);
            });

            test('continues when progress is made', () => {
                terminator.start();

                // First iteration
                const results1 = {
                    industry: { confidence: 3 }
                };
                terminator.recordIteration(results1);

                // Second iteration - progress!
                const results2 = {
                    industry: { confidence: 4 },
                    employee_count: { confidence: 3 }
                };
                // Check shouldStop BEFORE recordIteration (correct flow)
                const decision = terminator.shouldStop(results2);

                expect(decision.reason).not.toBe(TERMINATION_REASONS.NO_PROGRESS);
            });
        });

        describe('Priority Order', () => {
            test('success takes priority over other stop conditions', () => {
                terminator.iterationCount = 10; // Over max
                terminator.apiCallCount = 20; // Over max

                const results = {
                    industry: { confidence: 5 },
                    employee_count: { confidence: 5 }
                };

                const decision = terminator.shouldStop(results);

                expect(decision.stop).toBe(true);
                expect(decision.reason).toBe(TERMINATION_REASONS.ALL_FIELDS_CONFIDENT);
            });
        });

        describe('Continue Response', () => {
            test('includes progress summary when continuing', () => {
                terminator.iterationCount = 1;

                const results = {
                    industry: { confidence: 3 },
                    employee_count: { confidence: 2 }
                };

                const decision = terminator.shouldStop(results);

                expect(decision.stop).toBe(false);
                expect(decision.message).toBe('Continue enrichment');
                expect(decision.progress).toBeDefined();
                expect(decision.progress.fieldsEnriched).toBe(2);
            });
        });
    });

    describe('getMissingFields', () => {
        let terminator;

        beforeEach(() => {
            terminator = new EarlyTerminator({
                requiredFields: ['industry', 'employee_count', 'headquarters'],
                optionalFields: ['founded_year', 'description'],
                confidenceThreshold: 4
            });
        });

        test('identifies missing required fields', () => {
            const results = {
                industry: { confidence: 4 }
                // employee_count and headquarters missing
            };

            const missing = terminator.getMissingFields(results);

            expect(missing.required).toContain('employee_count');
            expect(missing.required).toContain('headquarters');
            expect(missing.required).not.toContain('industry');
        });

        test('identifies fields below threshold', () => {
            const results = {
                industry: { confidence: 4 },
                employee_count: { confidence: 2 }, // Below threshold
                headquarters: { confidence: 3 } // Below threshold
            };

            const missing = terminator.getMissingFields(results);

            expect(missing.belowThreshold).toHaveLength(2);
            expect(missing.belowThreshold[0].field).toBe('employee_count');
            expect(missing.belowThreshold[0].confidence).toBe(2);
            expect(missing.belowThreshold[0].needed).toBe(4);
        });

        test('identifies missing optional fields', () => {
            const results = {
                industry: { confidence: 4 },
                employee_count: { confidence: 4 },
                headquarters: { confidence: 4 }
                // optional fields missing
            };

            const missing = terminator.getMissingFields(results);

            expect(missing.optional).toContain('founded_year');
            expect(missing.optional).toContain('description');
        });

        test('handles null results', () => {
            const missing = terminator.getMissingFields(null);

            expect(missing.required).toHaveLength(3);
            expect(missing.optional).toHaveLength(2);
        });

        test('handles zero confidence as missing', () => {
            const results = {
                industry: { confidence: 0 }
            };

            const missing = terminator.getMissingFields(results);

            expect(missing.required).toContain('industry');
        });
    });

    describe('getPriorityFields', () => {
        let terminator;

        beforeEach(() => {
            terminator = new EarlyTerminator({
                requiredFields: ['industry', 'employee_count'],
                optionalFields: ['founded_year'],
                confidenceThreshold: 4
            });
        });

        test('prioritizes missing required fields first', () => {
            const results = {
                industry: { confidence: 4 }
                // employee_count missing
            };

            const priority = terminator.getPriorityFields(results);

            expect(priority[0]).toBe('employee_count');
        });

        test('prioritizes below-threshold fields second (sorted by confidence)', () => {
            const results = {
                industry: { confidence: 3 }, // Below threshold
                employee_count: { confidence: 2 } // Below threshold, lower
            };

            const priority = terminator.getPriorityFields(results);

            // Lower confidence should come first
            expect(priority[0]).toBe('employee_count');
            expect(priority[1]).toBe('industry');
        });

        test('includes optional fields last', () => {
            const results = {
                industry: { confidence: 4 },
                employee_count: { confidence: 4 }
                // founded_year missing (optional)
            };

            const priority = terminator.getPriorityFields(results);

            expect(priority[0]).toBe('founded_year');
        });

        test('returns empty array when all fields met', () => {
            const results = {
                industry: { confidence: 5 },
                employee_count: { confidence: 4 },
                founded_year: { confidence: 3 }
            };

            const priority = terminator.getPriorityFields(results);

            expect(priority).toEqual([]);
        });
    });

    describe('estimateRemaining', () => {
        let terminator;

        beforeEach(() => {
            terminator = new EarlyTerminator({
                requiredFields: ['industry', 'employee_count', 'headquarters'],
                maxIterations: 5,
                maxApiCalls: 20,
                timeout_ms: 30000
            });
            terminator.start();
        });

        test('estimates missing required fields', () => {
            const results = {
                industry: { confidence: 4 }
            };

            const estimate = terminator.estimateRemaining(results);

            expect(estimate.missingRequired).toBe(2);
        });

        test('estimates remaining iterations', () => {
            // After 1 iteration with 2 fields enriched
            terminator.recordIteration({
                industry: { confidence: 4 },
                employee_count: { confidence: 4 }
            });

            const results = {
                industry: { confidence: 4 },
                employee_count: { confidence: 3 } // Below threshold
            };

            const estimate = terminator.estimateRemaining(results);

            expect(estimate.estimatedIterations).toBeGreaterThanOrEqual(1);
        });

        test('includes remaining API calls', () => {
            terminator.apiCallCount = 5;

            const estimate = terminator.estimateRemaining({});

            expect(estimate.remainingApiCalls).toBe(15);
        });

        test('includes remaining time', () => {
            const estimate = terminator.estimateRemaining({});

            expect(estimate.remainingTime_ms).toBeGreaterThan(0);
            expect(estimate.remainingTime_ms).toBeLessThanOrEqual(30000);
        });

        test('includes canComplete flag', () => {
            terminator.iterationCount = 4; // Near max of 5

            const results = {
                // All required fields missing - needs 3 more iterations
            };

            const estimate = terminator.estimateRemaining(results);

            expect(typeof estimate.canComplete).toBe('boolean');
        });
    });

    describe('getSummary', () => {
        let terminator;

        beforeEach(() => {
            terminator = new EarlyTerminator({
                requiredFields: ['industry', 'employee_count']
            });
            terminator.start();
        });

        test('includes success status based on termination reason', () => {
            const successTermination = {
                reason: TERMINATION_REASONS.ALL_FIELDS_CONFIDENT,
                message: 'All fields confident'
            };

            const summary = terminator.getSummary({}, successTermination);

            expect(summary.success).toBe(true);
        });

        test('marks non-success for other termination reasons', () => {
            const failTermination = {
                reason: TERMINATION_REASONS.MAX_ITERATIONS,
                message: 'Max iterations reached'
            };

            const summary = terminator.getSummary({}, failTermination);

            expect(summary.success).toBe(false);
        });

        test('includes iteration and API call stats', () => {
            terminator.iterationCount = 3;
            terminator.apiCallCount = 8;
            terminator.totalCost = 2.5;

            const termination = { reason: 'test', message: 'test' };
            const summary = terminator.getSummary({}, termination);

            expect(summary.iterations).toBe(3);
            expect(summary.apiCalls).toBe(8);
            expect(summary.totalCost).toBe(2.5);
        });

        test('includes elapsed time', () => {
            // Wait a bit
            const summary = terminator.getSummary({}, { reason: 'test', message: 'test' });

            expect(summary.elapsed_ms).toBeGreaterThanOrEqual(0);
        });

        test('includes enrichment metrics', () => {
            const results = {
                industry: { confidence: 4 },
                employee_count: { confidence: 3 }
            };

            const summary = terminator.getSummary(results, { reason: 'test', message: 'test' });

            expect(summary.fieldsEnriched).toBe(2);
            expect(summary.averageConfidence).toBe(3.5);
        });

        test('includes missing fields', () => {
            const results = {
                industry: { confidence: 4 }
            };

            const summary = terminator.getSummary(results, { reason: 'test', message: 'test' });

            expect(summary.missingFields.required).toContain('employee_count');
        });

        test('includes progress history', () => {
            terminator.recordIteration({ field1: { confidence: 3 } });
            terminator.recordIteration({ field1: { confidence: 4 } });

            const summary = terminator.getSummary({}, { reason: 'test', message: 'test' });

            expect(summary.progressHistory).toHaveLength(2);
        });
    });

    describe('Static Methods', () => {
        test('REASONS returns all termination reasons', () => {
            const reasons = EarlyTerminator.REASONS;

            expect(reasons.ALL_FIELDS_CONFIDENT).toBeDefined();
            expect(reasons.MAX_ITERATIONS).toBeDefined();
            expect(reasons.TIMEOUT).toBeDefined();
            expect(reasons.NO_PROGRESS).toBeDefined();
        });

        test('REASONS returns copy (not reference)', () => {
            const reasons = EarlyTerminator.REASONS;
            reasons.NEW_REASON = 'test';

            expect(TERMINATION_REASONS.NEW_REASON).toBeUndefined();
        });
    });

    describe('Integration', () => {
        test('full enrichment loop simulation', () => {
            const terminator = new EarlyTerminator({
                requiredFields: ['industry', 'employee_count'],
                confidenceThreshold: 4,
                maxIterations: 5
            });

            terminator.start();

            // Iteration 1: Get industry with low confidence
            let results = {
                industry: { confidence: 2 }
            };
            terminator.recordApiCalls(2);
            let decision = terminator.shouldStop(results);
            expect(decision.stop).toBe(false);
            terminator.recordIteration(results); // Record AFTER shouldStop check

            // Iteration 2: Industry improves, get employee_count
            results = {
                industry: { confidence: 4 },
                employee_count: { confidence: 3 }
            };
            terminator.recordApiCalls(1);
            decision = terminator.shouldStop(results);
            expect(decision.stop).toBe(false);
            terminator.recordIteration(results); // Record AFTER shouldStop check

            // Iteration 3: Both fields meet threshold
            results = {
                industry: { confidence: 5 },
                employee_count: { confidence: 4 }
            };
            terminator.recordApiCalls(1);
            decision = terminator.shouldStop(results);
            expect(decision.stop).toBe(true);
            expect(decision.reason).toBe(TERMINATION_REASONS.ALL_FIELDS_CONFIDENT);
            terminator.recordIteration(results);

            // Get summary
            const summary = terminator.getSummary(results, decision);
            expect(summary.success).toBe(true);
            expect(summary.iterations).toBe(3);
            expect(summary.apiCalls).toBe(4);
        });

        test('termination due to no progress', () => {
            const terminator = new EarlyTerminator({
                requiredFields: ['industry', 'employee_count'],
                confidenceThreshold: 5, // Very high threshold
                maxIterations: 10
            });

            terminator.start();

            // Results that won't improve
            const results = {
                industry: { confidence: 3 }
            };

            // Simulate multiple iterations with no progress
            for (let i = 0; i < 3; i++) {
                terminator.recordIteration(results);
            }

            const decision = terminator.shouldStop(results);

            expect(decision.stop).toBe(true);
            expect(decision.reason).toBe(TERMINATION_REASONS.NO_PROGRESS);
        });
    });
});
