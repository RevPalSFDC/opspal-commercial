#!/usr/bin/env node
/**
 * Progressive Disclosure Test Harness
 *
 * Tests the keyword detection and context loading system for sfdc-metadata-manager.
 * Validates that contexts are correctly identified and loaded based on user messages.
 *
 * Usage:
 *   node test/progressive-disclosure-test-harness.js [--scenario <number>] [--verbose]
 *
 * Options:
 *   --scenario N   Run only scenario N (1-10)
 *   --verbose      Show detailed output
 *   --report       Generate detailed test report
 */

const fs = require('fs').promises;
const path = require('path');
const { performance } = require('perf_hooks');

// ============================================================================
// Keyword Detection Simulator
// ============================================================================

class KeywordDetectionSimulator {
    constructor(keywordMapping) {
        this.mapping = keywordMapping;
        this.contexts = keywordMapping.contexts;
    }

    /**
     * Detect which contexts should be loaded for a given user message
     * @param {string} userMessage - The user's input message
     * @returns {Array} - Sorted array of {contextName, score, priority}
     */
    detectContexts(userMessage) {
        const scores = [];
        const detectedNames = new Set();

        // First pass: detect contexts based on keywords and patterns
        for (const context of this.contexts) {
            const score = this.calculateScore(userMessage, context);

            if (score > 0) {
                scores.push({
                    contextName: context.contextName,
                    score: score,
                    priority: context.priority,
                    estimatedTokens: context.estimatedTokens
                });
                detectedNames.add(context.contextName);
            }
        }

        // Second pass: add related contexts for high-scoring detections
        const relatedToAdd = [];
        for (const detected of scores) {
            // Only suggest related contexts for high-scoring detections (score >= 12)
            if (detected.score >= 12) {
                const context = this.contexts.find(c => c.contextName === detected.contextName);
                if (context && context.relatedContexts) {
                    for (const relatedName of context.relatedContexts) {
                        if (!detectedNames.has(relatedName)) {
                            const relatedContext = this.contexts.find(c => c.contextName === relatedName);
                            if (relatedContext) {
                                relatedToAdd.push({
                                    contextName: relatedName,
                                    score: 6, // Minimum score for related context
                                    priority: relatedContext.priority,
                                    estimatedTokens: relatedContext.estimatedTokens,
                                    suggestedBy: detected.contextName
                                });
                                detectedNames.add(relatedName);
                            }
                        }
                    }
                }
            }
        }

        // Combine and sort by score descending
        return [...scores, ...relatedToAdd].sort((a, b) => b.score - a.score);
    }

    /**
     * Calculate relevance score for a context
     * Formula: (keywordMatches × 1 + intentMatches × 2) × priorityWeight
     */
    calculateScore(message, context) {
        const lowerMessage = message.toLowerCase();

        // Count keyword matches
        let keywordMatches = 0;
        for (const keyword of context.keywords) {
            if (lowerMessage.includes(keyword.toLowerCase())) {
                keywordMatches++;
            }
        }

        // Count intent pattern matches
        let intentMatches = 0;
        for (const pattern of context.intentPatterns) {
            try {
                const regex = new RegExp(pattern, 'i');
                if (regex.test(message)) {
                    intentMatches++;
                }
            } catch (e) {
                console.warn(`Invalid regex pattern: ${pattern}`);
            }
        }

        // Priority weight
        const priorityWeight = context.priority === 'high' ? 3 :
                             context.priority === 'medium' ? 2 : 1;

        // Calculate final score
        return (keywordMatches * 1 + intentMatches * 2) * priorityWeight;
    }
}

// ============================================================================
// Context Loader
// ============================================================================

class ContextLoader {
    constructor(contextsDir) {
        this.contextsDir = contextsDir;
    }

    /**
     * Load a context file and measure performance
     * @param {string} contextName - Name of the context (without .md extension)
     * @returns {Object} - {contextName, content, tokens, loadTime, lineCount}
     */
    async loadContext(contextName) {
        const start = performance.now();

        const contextPath = path.join(this.contextsDir, `${contextName}.md`);

        try {
            const content = await fs.readFile(contextPath, 'utf8');
            const loadTime = performance.now() - start;

            const tokens = this.estimateTokens(content);
            const lineCount = content.split('\n').length;

            return {
                contextName,
                content,
                tokens,
                loadTime,
                lineCount,
                path: contextPath,
                success: true
            };
        } catch (error) {
            const loadTime = performance.now() - start;
            return {
                contextName,
                content: null,
                tokens: 0,
                loadTime,
                lineCount: 0,
                path: contextPath,
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Estimate token count (approximately 1 token per 4 characters)
     */
    estimateTokens(text) {
        return Math.ceil(text.length / 4);
    }
}

// ============================================================================
// Test Runner
// ============================================================================

class ProgressiveDisclosureTestRunner {
    constructor(keywordMapping, contextsDir) {
        this.detector = new KeywordDetectionSimulator(keywordMapping);
        this.loader = new ContextLoader(contextsDir);
        this.testScenarios = keywordMapping.testScenarios;
    }

    /**
     * Run all test scenarios
     */
    async runAllTests(options = {}) {
        const results = [];

        console.log('🧪 Progressive Disclosure Test Harness\n');
        console.log('=' .repeat(70));

        for (let i = 0; i < this.testScenarios.length; i++) {
            const scenario = this.testScenarios[i];

            // Skip if specific scenario requested
            if (options.scenario && options.scenario !== i + 1) {
                continue;
            }

            console.log(`\n📋 Scenario ${i + 1}: ${scenario.name}`);
            console.log('-'.repeat(70));

            const result = await this.runScenario(scenario, options);
            results.push(result);

            // Display result
            this.displayResult(result, options);
        }

        console.log('\n' + '='.repeat(70));
        console.log('📊 Test Summary\n');

        return this.generateSummary(results);
    }

    /**
     * Run a single test scenario
     */
    async runScenario(scenario, options = {}) {
        const startTime = performance.now();

        // Step 1: Detect contexts
        const detectedContexts = this.detector.detectContexts(scenario.prompt);

        // Step 2: Validate detection
        const validation = this.validateDetection(detectedContexts, scenario);

        // Step 3: Load contexts
        const loadedContexts = [];
        for (const detected of detectedContexts) {
            const loaded = await this.loader.loadContext(detected.contextName);
            loadedContexts.push(loaded);
        }

        // Step 4: Calculate metrics
        const totalTime = performance.now() - startTime;
        const totalTokens = loadedContexts.reduce((sum, ctx) => sum + ctx.tokens, 0);
        const avgLoadTime = loadedContexts.length > 0 ?
            loadedContexts.reduce((sum, ctx) => sum + ctx.loadTime, 0) / loadedContexts.length : 0;

        return {
            scenarioName: scenario.name,
            prompt: scenario.prompt,
            expectedContexts: scenario.expectedContexts,
            minimumScore: scenario.minimumScore,
            detectedContexts: detectedContexts,
            loadedContexts: loadedContexts,
            validation: validation,
            metrics: {
                totalTime,
                avgLoadTime,
                totalTokens,
                contextCount: loadedContexts.length
            },
            passed: validation.passed
        };
    }

    /**
     * Validate that detected contexts match expected contexts
     */
    validateDetection(detectedContexts, scenario) {
        const detectedNames = detectedContexts.map(c => c.contextName);
        const expected = scenario.expectedContexts;
        const minimumScore = scenario.minimumScore;

        // Check if all expected contexts were detected
        const missingContexts = expected.filter(e => !detectedNames.includes(e));
        const extraContexts = detectedNames.filter(d => !expected.includes(d));

        // Check if scores meet minimum
        // For multiple expected contexts, check COMBINED score
        const expectedDetected = detectedContexts.filter(c => expected.includes(c.contextName));
        let scoresMeetMinimum;

        if (expected.length === 0) {
            // No contexts expected: score check passes if no contexts detected
            scoresMeetMinimum = true;
        } else if (expected.length > 1) {
            // Multiple contexts: check combined score
            const combinedScore = expectedDetected.reduce((sum, c) => sum + c.score, 0);
            scoresMeetMinimum = combinedScore >= minimumScore;
        } else {
            // Single context: check individual score
            scoresMeetMinimum = expectedDetected.length > 0 && expectedDetected[0].score >= minimumScore;
        }

        const passed = missingContexts.length === 0 && scoresMeetMinimum;

        return {
            passed,
            missingContexts,
            extraContexts,
            scoresMeetMinimum,
            detectedCount: detectedContexts.length,
            expectedCount: expected.length,
            combinedScore: expectedDetected.reduce((sum, c) => sum + c.score, 0)
        };
    }

    /**
     * Display individual test result
     */
    displayResult(result, options) {
        const { validation, metrics } = result;

        console.log(`   Prompt: "${result.prompt}"`);
        console.log(`   Status: ${validation.passed ? '✅ PASS' : '❌ FAIL'}`);

        if (options.verbose) {
            console.log(`\n   Detected Contexts (${result.detectedContexts.length}):`);
            for (const ctx of result.detectedContexts) {
                const expected = result.expectedContexts.includes(ctx.contextName);
                const marker = expected ? '✓' : '?';
                console.log(`      ${marker} ${ctx.contextName} (score: ${ctx.score}, priority: ${ctx.priority})`);
            }

            if (validation.missingContexts.length > 0) {
                console.log(`\n   ❌ Missing Contexts: ${validation.missingContexts.join(', ')}`);
            }

            if (validation.extraContexts.length > 0) {
                console.log(`   ⚠️  Extra Contexts: ${validation.extraContexts.join(', ')}`);
            }

            console.log(`\n   Metrics:`);
            console.log(`      Total Time: ${metrics.totalTime.toFixed(2)}ms`);
            console.log(`      Avg Load Time: ${metrics.avgLoadTime.toFixed(2)}ms`);
            console.log(`      Total Tokens: ${metrics.totalTokens}`);
            console.log(`      Contexts Loaded: ${metrics.contextCount}`);
        }
    }

    /**
     * Generate summary report
     */
    generateSummary(results) {
        const passed = results.filter(r => r.passed).length;
        const failed = results.filter(r => !r.passed).length;
        const accuracy = (passed / results.length) * 100;

        const totalTokens = results.reduce((sum, r) => sum + r.metrics.totalTokens, 0);
        const avgTokens = totalTokens / results.length;

        const totalTime = results.reduce((sum, r) => sum + r.metrics.totalTime, 0);
        const avgTime = totalTime / results.length;

        const avgLoadTime = results.reduce((sum, r) => sum + r.metrics.avgLoadTime, 0) / results.length;

        console.log(`   Tests Passed: ${passed}/${results.length} (${accuracy.toFixed(1)}% accuracy)`);
        console.log(`   Tests Failed: ${failed}`);
        console.log(`\n   Performance:`);
        console.log(`      Avg Total Time: ${avgTime.toFixed(2)}ms`);
        console.log(`      Avg Load Time: ${avgLoadTime.toFixed(2)}ms`);
        console.log(`      Avg Tokens Loaded: ${avgTokens.toFixed(0)}`);

        // Success criteria
        console.log(`\n   Success Criteria:`);
        console.log(`      Accuracy > 90%: ${accuracy > 90 ? '✅' : '❌'} (${accuracy.toFixed(1)}%)`);
        console.log(`      Avg Load Time < 200ms: ${avgLoadTime < 200 ? '✅' : '❌'} (${avgLoadTime.toFixed(2)}ms)`);

        return {
            totalTests: results.length,
            passed,
            failed,
            accuracy,
            metrics: {
                avgTime,
                avgLoadTime,
                avgTokens
            },
            results
        };
    }
}

// ============================================================================
// Main Execution
// ============================================================================

async function main() {
    const args = process.argv.slice(2);
    const options = {
        verbose: args.includes('--verbose'),
        report: args.includes('--report'),
        scenario: null
    };

    // Parse scenario number
    const scenarioIndex = args.indexOf('--scenario');
    if (scenarioIndex !== -1 && args[scenarioIndex + 1]) {
        options.scenario = parseInt(args[scenarioIndex + 1], 10);
    }

    // Load keyword mapping
    const pluginDir = path.join(__dirname, '..');
    const keywordMappingPath = path.join(pluginDir, 'contexts', 'metadata-manager', 'keyword-mapping.json');
    const contextsDir = path.join(pluginDir, 'contexts', 'metadata-manager');

    let keywordMapping;
    try {
        const content = await fs.readFile(keywordMappingPath, 'utf8');
        keywordMapping = JSON.parse(content);
    } catch (error) {
        console.error(`❌ Failed to load keyword mapping: ${error.message}`);
        process.exit(1);
    }

    // Run tests
    const runner = new ProgressiveDisclosureTestRunner(keywordMapping, contextsDir);
    const summary = await runner.runAllTests(options);

    // Generate detailed report if requested
    if (options.report) {
        const reportPath = path.join(__dirname, '..', 'test-results.json');
        await fs.writeFile(reportPath, JSON.stringify(summary, null, 2));
        console.log(`\n📄 Detailed report saved to: ${reportPath}`);
    }

    // Exit with appropriate code
    process.exit(summary.failed === 0 ? 0 : 1);
}

if (require.main === module) {
    main().catch(error => {
        console.error('❌ Test harness error:', error);
        process.exit(1);
    });
}

module.exports = {
    KeywordDetectionSimulator,
    ContextLoader,
    ProgressiveDisclosureTestRunner
};
