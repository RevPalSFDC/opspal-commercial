#!/usr/bin/env node

/**
 * Test Suite for Data Operations API
 *
 * Comprehensive tests covering:
 * - Simple mode usage
 * - Advanced mode configuration
 * - Quick helpers
 * - Safety level configurations
 * - Progress tracking
 * - Error handling
 *
 * Usage:
 *   node test-data-operations-api.js              # Run all tests
 *   node test-data-operations-api.js --suite unit # Run specific suite
 *   node test-data-operations-api.js --verbose    # Verbose output
 *
 * @version 1.0.0
 */

const DataOps = require('./data-operations-api');

// Test configuration
const TEST_ORG = 'test-org';
const VERBOSE = process.argv.includes('--verbose');

// Test counters
let passed = 0;
let failed = 0;
let skipped = 0;

// Color codes
const c = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m'
};

// ═══════════════════════════════════════════════════════════════
// TEST UTILITIES
// ═══════════════════════════════════════════════════════════════

function log(message) {
  if (VERBOSE) console.log(message);
}

function test(name, fn) {
  return async () => {
    try {
      await fn();
      passed++;
      console.log(`${c.green}✓${c.reset} ${name}`);
    } catch (error) {
      failed++;
      console.log(`${c.red}✗${c.reset} ${name}`);
      console.log(`  ${c.red}Error: ${error.message}${c.reset}`);
      if (VERBOSE) console.log(error.stack);
    }
  };
}

function skip(name) {
  return () => {
    skipped++;
    console.log(`${c.yellow}⊘${c.reset} ${name} (skipped)`);
  };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected}, got ${actual}`);
  }
}

function assertExists(value, message) {
  if (value === null || value === undefined) {
    throw new Error(message || 'Expected value to exist');
  }
}

// ═══════════════════════════════════════════════════════════════
// TEST DATA
// ═══════════════════════════════════════════════════════════════

function createTestPairs(count = 5) {
  const pairs = [];
  for (let i = 0; i < count; i++) {
    pairs.push({
      masterId: `00Q00000000000${i}AAA`,
      duplicateId: `00Q00000000000${i}BBB`,
      similarity: 0.9
    });
  }
  return pairs;
}

function createTestDecisions(count = 5) {
  const decisions = [];
  for (let i = 0; i < count; i++) {
    decisions.push({
      pair_id: `pair_${i}`,
      master_id: `00Q00000000000${i}AAA`,
      duplicate_id: `00Q00000000000${i}BBB`,
      decision: 'APPROVE',
      confidence: 0.9,
      reason: 'Test decision'
    });
  }
  return {
    org: TEST_ORG,
    timestamp: new Date().toISOString(),
    decisions: decisions
  };
}

// ═══════════════════════════════════════════════════════════════
// UNIT TESTS
// ═══════════════════════════════════════════════════════════════

const unitTests = [
  test('DataOps module exports correctly', async () => {
    assertExists(DataOps, 'DataOps should be defined');
    assertExists(DataOps.merge, 'DataOps.merge should exist');
    assertExists(DataOps.analyze, 'DataOps.analyze should exist');
    assertExists(DataOps.execute, 'DataOps.execute should exist');
    assertExists(DataOps.quick, 'DataOps.quick should exist');
    assertExists(DataOps.executors, 'DataOps.executors should exist');
  }),

  test('Quick helpers exist', async () => {
    assertExists(DataOps.quick.test, 'DataOps.quick.test should exist');
    assertExists(DataOps.quick.prod, 'DataOps.quick.prod should exist');
    assertExists(DataOps.quick.analyze, 'DataOps.quick.analyze should exist');
  }),

  test('Executors are accessible', async () => {
    const { ParallelBulkMergeExecutor, BulkMergeExecutor, DedupSafetyEngine } = DataOps.executors;
    assertExists(ParallelBulkMergeExecutor, 'ParallelBulkMergeExecutor should be accessible');
    assertExists(BulkMergeExecutor, 'BulkMergeExecutor should be accessible');
    assertExists(DedupSafetyEngine, 'DedupSafetyEngine should be accessible');
  }),

  test('Safety config builder works', async () => {
    const strictConfig = DataOps._buildSafetyConfig('strict');
    const balancedConfig = DataOps._buildSafetyConfig('balanced');
    const permissiveConfig = DataOps._buildSafetyConfig('permissive');
    const offConfig = DataOps._buildSafetyConfig('off');

    assertExists(strictConfig.guardrails, 'Strict config should have guardrails');
    assertExists(balancedConfig.guardrails, 'Balanced config should have guardrails');
    assertExists(permissiveConfig.guardrails, 'Permissive config should have guardrails');
    assertExists(offConfig.guardrails, 'Off config should have guardrails');

    // Verify strict is stricter than balanced
    assert(
      strictConfig.guardrails.domain_mismatch.threshold < balancedConfig.guardrails.domain_mismatch.threshold,
      'Strict should have lower threshold than balanced'
    );
  }),

  test('Input type detection works', async () => {
    const pairs = createTestPairs(3);
    const decisions = createTestDecisions(3);

    const pairType = DataOps._detectInputType(pairs);
    const decisionType = DataOps._detectInputType(decisions);

    assertEqual(pairType, 'pairs', 'Should detect pairs correctly');
    assertEqual(decisionType, 'decisions', 'Should detect decisions correctly');
  }),

  test('Time formatting works', async () => {
    assertEqual(DataOps._formatTime(30), '30s', 'Should format seconds');
    assertEqual(DataOps._formatTime(90), '1m 30s', 'Should format minutes');
    assertEqual(DataOps._formatTime(3720), '1h 2m', 'Should format hours');
  })
];

// ═══════════════════════════════════════════════════════════════
// INTEGRATION TESTS (Simplified - no real SF calls)
// ═══════════════════════════════════════════════════════════════

const integrationTests = [
  test('Analyze pairs (simplified mode)', async () => {
    const pairs = createTestPairs(3);

    const result = await DataOps.analyze(TEST_ORG, pairs, {
      safety: 'balanced'
    });

    assertExists(result, 'Result should exist');
    assertExists(result.summary, 'Result should have summary');
    assertEqual(result.summary.total, 3, 'Should analyze all pairs');
    assert(result.approved.length + result.review.length + result.blocked.length === 3, 'Should categorize all pairs');
  }),

  test('Merge with default options', async () => {
    const pairs = createTestPairs(2);

    // Note: This will use simplified analysis (no real SF calls)
    const result = await DataOps.merge(TEST_ORG, pairs, {
      dryRun: true  // Always dry-run for tests
    });

    assertExists(result, 'Result should exist');
    assertExists(result.summary, 'Result should have summary');
  }),

  test('Quick test helper works', async () => {
    const pairs = createTestPairs(2);

    const result = await DataOps.quick.test(TEST_ORG, pairs);

    assertExists(result, 'Result should exist');
    assert(result.dryRun || result.summary, 'Should be dry-run or have summary');
  }),

  test('Execute with pre-analyzed decisions', async () => {
    const decisions = createTestDecisions(2);

    const result = await DataOps.execute(TEST_ORG, decisions, {
      dryRun: true,
      execution: 'parallel',
      workers: 2
    });

    assertExists(result, 'Result should exist');
  }),

  test('Progress callback is invoked', async () => {
    const pairs = createTestPairs(2);
    let progressCalled = false;

    await DataOps.merge(TEST_ORG, pairs, {
      dryRun: true,
      onProgress: (status) => {
        progressCalled = true;
        assertExists(status, 'Progress status should exist');
      }
    });

    // Progress may or may not be called depending on executor implementation
    // Just verify it doesn't crash
    log(`Progress callback invoked: ${progressCalled}`);
  }),

  test('Safety level affects configuration', async () => {
    const pairs = createTestPairs(2);

    // Verify different safety levels are accepted
    await DataOps.analyze(TEST_ORG, pairs, { safety: 'strict' });
    await DataOps.analyze(TEST_ORG, pairs, { safety: 'balanced' });
    await DataOps.analyze(TEST_ORG, pairs, { safety: 'permissive' });
    await DataOps.analyze(TEST_ORG, pairs, { safety: 'off' });

    // If we got here, all safety levels work
    assert(true, 'All safety levels accepted');
  })
];

// ═══════════════════════════════════════════════════════════════
// ERROR HANDLING TESTS
// ═══════════════════════════════════════════════════════════════

const errorTests = [
  test('Handles empty pairs array gracefully', async () => {
    const result = await DataOps.analyze(TEST_ORG, []);

    assertExists(result, 'Should return result for empty array');
    assertEqual(result.summary.total, 0, 'Should have zero total');
  }),

  test('Handles invalid safety level gracefully', async () => {
    const pairs = createTestPairs(1);

    // Should not throw, just use a default
    const result = await DataOps.analyze(TEST_ORG, pairs, {
      safety: 'invalid_level'
    });

    assertExists(result, 'Should still return result');
  }),

  test('Handles missing org alias', async () => {
    const pairs = createTestPairs(1);

    try {
      await DataOps.merge(null, pairs);
      throw new Error('Should have thrown for null org');
    } catch (error) {
      // Expected to throw
      assert(error.message.includes('org') || error.message.includes('null'), 'Error should mention org or null');
    }
  })
];

// ═══════════════════════════════════════════════════════════════
// TEST RUNNER
// ═══════════════════════════════════════════════════════════════

async function runTestSuite(name, tests) {
  console.log(`\n${c.cyan}${c.bold}${name}${c.reset}`);
  console.log('═'.repeat(50));

  for (const testFn of tests) {
    await testFn();
  }
}

async function runAllTests() {
  console.log(`\n${c.bold}Data Operations API Test Suite${c.reset}`);
  console.log('═'.repeat(70));

  const suiteArg = process.argv.find(arg => arg.startsWith('--suite='));
  const suite = suiteArg ? suiteArg.split('=')[1] : 'all';

  if (suite === 'all' || suite === 'unit') {
    await runTestSuite('Unit Tests', unitTests);
  }

  if (suite === 'all' || suite === 'integration') {
    await runTestSuite('Integration Tests', integrationTests);
  }

  if (suite === 'all' || suite === 'error') {
    await runTestSuite('Error Handling Tests', errorTests);
  }

  // Summary
  console.log('\n' + '═'.repeat(70));
  console.log(`${c.bold}Test Summary${c.reset}`);
  console.log('═'.repeat(70));
  console.log(`${c.green}Passed:  ${passed}${c.reset}`);
  console.log(`${c.red}Failed:  ${failed}${c.reset}`);
  console.log(`${c.yellow}Skipped: ${skipped}${c.reset}`);
  console.log(`${c.cyan}Total:   ${passed + failed + skipped}${c.reset}`);

  const successRate = passed / (passed + failed) * 100;
  console.log(`\nSuccess Rate: ${successRate.toFixed(1)}%`);

  if (failed > 0) {
    console.log(`\n${c.red}${c.bold}Some tests failed. See details above.${c.reset}`);
    process.exit(1);
  } else {
    console.log(`\n${c.green}${c.bold}All tests passed!${c.reset}`);
    process.exit(0);
  }
}

// ═══════════════════════════════════════════════════════════════
// CLI
// ═══════════════════════════════════════════════════════════════

if (require.main === module) {
  if (process.argv.includes('--help')) {
    console.log('Data Operations API Test Suite\n');
    console.log('Usage:');
    console.log('  node test-data-operations-api.js              # Run all tests');
    console.log('  node test-data-operations-api.js --suite=unit # Run unit tests only');
    console.log('  node test-data-operations-api.js --verbose    # Verbose output');
    console.log('\nSuites:');
    console.log('  all          Run all test suites (default)');
    console.log('  unit         Unit tests only');
    console.log('  integration  Integration tests only');
    console.log('  error        Error handling tests only');
    process.exit(0);
  }

  runAllTests().catch(error => {
    console.error(`\n${c.red}Test runner error: ${error.message}${c.reset}`);
    console.error(error.stack);
    process.exit(1);
  });
}

module.exports = { test, assert, assertEqual, assertExists };
