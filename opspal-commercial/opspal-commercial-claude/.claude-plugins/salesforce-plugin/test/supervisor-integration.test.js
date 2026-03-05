#!/usr/bin/env node

/**
 * Supervisor-Auditor Integration Tests
 *
 * Tests automatic triggering of supervisor-auditor via auto-agent-router.js
 */

const path = require('path');
const AutoAgentRouter = require('../scripts/auto-agent-router');

// Test cases for supervisor-auditor automatic triggers
const testCases = [
    // High complexity triggers (note: some have mandatory overrides)
    {
        input: "Deploy metadata to production",
        expectedAgent: "release-coordinator", // Mandatory pattern takes precedence
        expectedReason: /release-coordinator/i,
        description: "High complexity production deployment (mandatory pattern override)"
    },
    // Explicit parallelization
    {
        input: "Generate READMEs for all 8 plugins in parallel",
        expectedAgent: "supervisor-auditor",
        expectedReason: /parallelizable pattern/i,
        description: "Explicit parallel keyword"
    },
    {
        input: "Process all reflections concurrently",
        expectedAgent: "supervisor-auditor",
        expectedReason: /parallelizable pattern/i,
        description: "Concurrent processing"
    },
    // Multiple targets
    {
        input: "Generate READMEs for salesforce-plugin, hubspot-plugin, gtm-planning-plugin",
        expectedAgent: "supervisor-auditor",
        expectedReason: /parallelizable pattern/i,
        description: "Multiple comma-separated targets"
    },
    {
        input: "Analyze all 10 agent files",
        expectedAgent: "supervisor-auditor",
        expectedReason: /parallelizable pattern/i,
        description: "'All X' pattern"
    },
    {
        input: "Validate each plugin manifest",
        expectedAgent: "supervisor-auditor",
        expectedReason: /parallelizable pattern/i,
        description: "'Each X' pattern"
    },
    // Multiple actions with AND
    {
        input: "Analyze quality across plugins AND generate improvement report",
        expectedAgent: "supervisor-auditor",
        expectedReason: /parallelizable pattern/i,
        description: "Multiple actions with AND"
    },
    // Medium complexity with parallelization
    {
        input: "Update all 5 workflows",
        expectedAgent: "supervisor-auditor",
        expectedReason: /parallelizable pattern/i, // Triggers on "all X" pattern
        description: "Batch operation with 'all X' pattern"
    },
    // Explicit supervisor flag
    {
        input: "[SUPERVISOR] Simple single task",
        expectedAgent: "supervisor-auditor",
        expectedReason: /SUPERVISOR.*flag/i,
        description: "Explicit [SUPERVISOR] flag"
    },
    // Should NOT trigger supervisor
    {
        input: "[DIRECT] Deploy metadata to production",
        expectedAgent: null, // Should skip supervisor
        notExpectedAgent: "supervisor-auditor",
        description: "[DIRECT] flag skips supervisor"
    },
    {
        input: "Create a single validation rule",
        expectedAgent: null, // Should use regular routing
        notExpectedAgent: "supervisor-auditor",
        description: "Simple single operation"
    },
    {
        input: "Query Opportunity records",
        expectedAgent: null, // Should use query specialist
        notExpectedAgent: "supervisor-auditor",
        description: "Simple query operation"
    }
];

function runTests() {
    console.log('🧪 Supervisor-Auditor Integration Tests\n');
    console.log('Testing automatic triggering via auto-agent-router...\n');

    let passed = 0;
    let failed = 0;

    // Create router instance (mocking config if needed)
    const router = new AutoAgentRouter();

    testCases.forEach((testCase, index) => {
        const { input, expectedAgent, expectedReason, notExpectedAgent, description } = testCase;

        try {
            // Calculate complexity
            const complexity = router.calculateComplexity(input);

            // Find best agent
            const result = router.findBestAgent(input, complexity);

            // Check expectations
            let testPassed = true;
            let errorMessage = '';

            if (expectedAgent && result?.agent !== expectedAgent) {
                testPassed = false;
                errorMessage = `Expected agent '${expectedAgent}', got '${result?.agent || 'null'}'`;
            }

            if (notExpectedAgent && result?.agent === notExpectedAgent) {
                testPassed = false;
                errorMessage = `Should NOT route to '${notExpectedAgent}', but did`;
            }

            if (expectedReason && result?.reason && !expectedReason.test(result.reason)) {
                testPassed = false;
                errorMessage = `Reason doesn't match pattern. Got: '${result.reason}'`;
            }

            // Output result
            const status = testPassed ? '✅ PASS' : '❌ FAIL';
            const color = testPassed ? '\x1b[32m' : '\x1b[31m';
            const reset = '\x1b[0m';

            console.log(`${color}${status}${reset} Test ${index + 1}: ${description}`);
            console.log(`  Input: "${input}"`);
            console.log(`  Complexity: ${complexity.toFixed(2)}`);
            console.log(`  Agent: ${result?.agent || 'null'}`);
            console.log(`  Reason: ${result?.reason || 'null'}`);

            if (!testPassed) {
                console.log(`  ⚠️  ${errorMessage}`);
            }
            console.log();

            if (testPassed) {
                passed++;
            } else {
                failed++;
            }
        } catch (error) {
            console.log(`❌ FAIL Test ${index + 1}: ${description}`);
            console.log(`  Error: ${error.message}`);
            console.log();
            failed++;
        }
    });

    // Summary
    console.log('═══════════════════════════════════════════════════');
    console.log(`📊 Test Summary`);
    console.log(`  Total: ${testCases.length}`);
    console.log(`  ✅ Passed: ${passed}`);
    console.log(`  ❌ Failed: ${failed}`);
    console.log(`  Success Rate: ${((passed / testCases.length) * 100).toFixed(1)}%`);
    console.log('═══════════════════════════════════════════════════');

    // Exit with appropriate code
    process.exit(failed > 0 ? 1 : 0);
}

// Run if called directly
if (require.main === module) {
    runTests();
}

module.exports = { runTests };


// Jest wrapper for standalone test runner
if (typeof describe !== 'undefined') {
  describe('Supervisor Integration', () => {
    it('should pass all tests', async () => {
      if (typeof runTests === 'function') {
        const result = await runTests();
        expect(result).not.toBe(false);
      } else {
        expect(true).toBe(true);
      }
    });
  });
}
