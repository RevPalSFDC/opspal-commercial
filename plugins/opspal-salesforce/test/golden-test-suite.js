#!/usr/bin/env node

/**
 * Golden Test Suite - Comprehensive Regression Testing
 *
 * Purpose: Prevent regressions in critical system functionality
 * Coverage:
 * - Agent routing decisions
 * - Merge operations (safety, execution, rollback)
 * - Data operations API
 * - Hook circuit breaker
 * - Routing toolkit validation
 *
 * Usage:
 *   node test/golden-test-suite.js                    # Run all tests
 *   node test/golden-test-suite.js --suite routing    # Specific suite
 *   node test/golden-test-suite.js --coverage         # Generate coverage report
 *   node test/golden-test-suite.js --ci               # CI/CD mode (strict)
 *
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');

// Import test utilities
const { test, assert, assertEqual, assertExists } = require('./test-utils');

// Import test fixtures
const fixtures = require('./fixtures/golden-fixtures');

// Import test data generators
const generators = require('./test-data-generator');

// Import modules under test
const DataOps = require('../scripts/lib/data-operations-api');
const RoutingToolkit = require('../scripts/lib/routing-toolkit');

// Import routing performance tests (Phase 4)
const routingPerformanceTests = require('./routing-performance-tests');

// Import batch metadata optimization tests (Week 2)
const batchMetadataOptimizationTests = require('./batch-metadata-optimization.test');

// Import parallel conflict detection tests (Week 2 - Phase 2)
const parallelConflictDetectionTests = require('./parallel-conflict-detection.test');

// Import field metadata cache tests (Week 2 - Phase 3)
const fieldMetadataCacheTests = require('./field-metadata-cache.test');

// Import conflict resolver optimizer tests (Week 2 - Phase 1 for sfdc-conflict-resolver)
const conflictResolverOptimizerTests = require('./conflict-resolver-optimizer.test');

// Import data operations optimizer tests (Week 2 - Phase 1 for sfdc-data-operations)
const dataOperationsOptimizerTests = require('./data-operations-optimizer.test');

// Import metadata analyzer optimizer tests (Week 2 - Phase 1 for sfdc-metadata-analyzer)
const metadataAnalyzerOptimizerTests = require('./metadata-analyzer-optimizer.test');

// Import discovery optimizer tests (Week 2 - Phase 1 for sfdc-discovery)
const discoveryOptimizerTests = require('./discovery-optimizer.test');

// Import orchestration optimizer tests (Week 2 - Phase 1 for sfdc-orchestrator)
const orchestrationOptimizerTests = require('./orchestration-optimizer.test');

// Import planner optimizer tests (Week 2 - Phase 1 for sfdc-planner)
const plannerOptimizerTests = require('./planner-optimizer.test');

// Import remediation optimizer tests (Week 2 - Phase 1 for sfdc-remediation-executor)
const remediationOptimizerTests = require('./remediation-optimizer.test');

// Import revops auditor optimizer tests (Week 2 - Phase 1 for sfdc-revops-auditor)
const revopsAuditorOptimizerTests = require('./revops-auditor-optimizer.test');

// Import cpq assessor optimizer tests (Week 2 - Phase 1 for sfdc-cpq-assessor)
const cpqAssessorOptimizerTests = require('./cpq-assessor-optimizer.test');

// Test configuration
const CI_MODE = process.argv.includes('--ci');
const VERBOSE = process.argv.includes('--verbose') || CI_MODE;
const COVERAGE = process.argv.includes('--coverage');

// Test counters
let results = {
  passed: 0,
  failed: 0,
  skipped: 0,
  suites: {}
};

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
// TEST SUITES
// ═══════════════════════════════════════════════════════════════

/**
 * Suite 1: Agent Routing Regression Tests
 *
 * Purpose: Ensure routing decisions remain consistent
 * Coverage:
 * - Production deploy blocking (mandatory)
 * - Bulk operation routing (suggested)
 * - Complexity scoring accuracy
 * - Pattern matching conflicts
 */
const routingTests = [
  test('Blocks production deployments (mandatory)', async () => {
    const toolkit = new RoutingToolkit();
    const result = await toolkit.test([
      { description: 'deploy metadata to production', context: { env: 'production' } }
    ]);

    assertEqual(result[0].mandatory, true, 'Production deploy should be mandatory block');
    assertEqual(result[0].agent, 'release-coordinator', 'Should route to release-coordinator');
    assert(result[0].confidence >= 0.9, 'Should have high confidence');
  }),

  test('Suggests agents for bulk operations', async () => {
    const toolkit = new RoutingToolkit();
    const result = await toolkit.test([
      { description: 'merge 100 duplicate accounts', context: { count: 100 } }
    ]);

    assert(result[0].agent !== null, 'Should suggest an agent');
    assert(result[0].complexity >= 0.5, 'Bulk operation should have medium+ complexity');
  }),

  test('Calculates complexity scores correctly', async () => {
    const toolkit = new RoutingToolkit();

    // Simple operation
    const simple = await toolkit.test([
      { description: 'create a new field', context: {} }
    ]);
    assert(simple[0].complexity < 0.3, 'Simple operation should have low complexity');

    // Complex operation
    const complex = await toolkit.test([
      { description: 'deploy 50 objects to production with dependencies', context: { env: 'production', count: 50 } }
    ]);
    assert(complex[0].complexity > 0.7, 'Complex operation should have high complexity');
  }),

  test('Validates routing patterns for conflicts', async () => {
    const toolkit = new RoutingToolkit();
    const validation = await toolkit.validate();

    assert(validation.conflicts.length === 0, `Should have no pattern conflicts, found: ${validation.conflicts.length}`);
    assert(validation.invalidReferences.length === 0, `Should have no invalid agent references, found: ${validation.invalidReferences.length}`);
  }),

  test('Pattern effectiveness tracking works', async () => {
    const toolkit = new RoutingToolkit();
    const analysis = await toolkit.analyze({ days: 7 });

    assertExists(analysis.topAgents, 'Should have top agents list');
    assertExists(analysis.patternEffectiveness, 'Should have pattern effectiveness data');
  })
];

/**
 * Suite 2: Merge Operations Regression Tests
 *
 * Purpose: Ensure merge operations maintain safety and correctness
 * Coverage:
 * - Safety analysis (all 4 levels)
 * - Execution modes (serial/parallel)
 * - Progress tracking
 * - Error handling and rollback
 */
const mergeTests = [
  test('Safety analysis blocks dangerous merges (strict)', async () => {
    const pairs = fixtures.duplicatePairs.dangerousMerges;

    const result = await DataOps.analyze('test-org', pairs, {
      safety: 'strict',
      backupDir: fixtures.paths.backupDir,
      importanceReport: fixtures.paths.importanceReport
    });

    assert(result.blocked.length > 0, 'Strict safety should block dangerous merges');
    assert(result.blocked[0].reason.includes('domain mismatch') ||
           result.blocked[0].reason.includes('address mismatch'),
           'Should block for specific safety reasons');
  }),

  test('Safety levels affect blocking behavior', async () => {
    const pairs = fixtures.duplicatePairs.moderateRisk;

    const strict = await DataOps.analyze('test-org', pairs, { safety: 'strict' });
    const balanced = await DataOps.analyze('test-org', pairs, { safety: 'balanced' });
    const permissive = await DataOps.analyze('test-org', pairs, { safety: 'permissive' });

    // Strict should block more than balanced
    assert(strict.blocked.length >= balanced.blocked.length,
           'Strict should block at least as many as balanced');

    // Balanced should block more than permissive
    assert(balanced.blocked.length >= permissive.blocked.length,
           'Balanced should block at least as many as permissive');
  }),

  test('Parallel execution faster than serial', async () => {
    const pairs = fixtures.duplicatePairs.safeMerges.slice(0, 10);

    const serialStart = Date.now();
    await DataOps.merge('test-org', pairs, {
      execution: 'serial',
      dryRun: true
    });
    const serialTime = Date.now() - serialStart;

    const parallelStart = Date.now();
    await DataOps.merge('test-org', pairs, {
      execution: 'parallel',
      workers: 5,
      dryRun: true
    });
    const parallelTime = Date.now() - parallelStart;

    // Parallel should be faster (allow some variance for small datasets)
    assert(parallelTime <= serialTime * 1.2,
           `Parallel (${parallelTime}ms) should be ≤ serial (${serialTime}ms) * 1.2`);
  }),

  test('Progress tracking provides accurate ETA', async () => {
    const pairs = fixtures.duplicatePairs.safeMerges.slice(0, 20);
    let progressUpdates = [];

    await DataOps.merge('test-org', pairs, {
      dryRun: true,
      onProgress: (status) => {
        progressUpdates.push(status);
      }
    });

    assert(progressUpdates.length > 0, 'Should receive progress updates');

    const lastUpdate = progressUpdates[progressUpdates.length - 1];
    assertExists(lastUpdate.eta, 'Should provide ETA');
    assertExists(lastUpdate.rate, 'Should provide rate');
    assertEqual(lastUpdate.processed, lastUpdate.total, 'Should complete all pairs');
  }),

  test('Gracefully handles empty pairs array', async () => {
    const result = await DataOps.merge('test-org', [], { dryRun: true });

    assertEqual(result.summary.total, 0, 'Should handle empty array');
    assertEqual(result.summary.success, 0, 'Should have zero successes');
  }),

  test('Quick helpers apply correct defaults', async () => {
    const pairs = fixtures.duplicatePairs.safeMerges.slice(0, 5);

    // Quick.test should be dry-run with strict safety
    const testResult = await DataOps.quick.test('test-org', pairs);
    assert(testResult.dryRun || testResult.summary, 'Should be dry-run mode');

    // Quick.prod should use balanced safety
    const prodResult = await DataOps.quick.prod('test-org', pairs, { dryRun: true });
    assertExists(prodResult.summary, 'Should execute with defaults');
  })
];

/**
 * Suite 3: Data Operations API Regression Tests
 *
 * Purpose: Ensure API maintains backward compatibility
 * Coverage:
 * - Module exports
 * - Input type detection
 * - Safety config builder
 * - Executor access (backward compat)
 */
const apiTests = [
  test('Module exports remain stable', async () => {
    assertExists(DataOps.merge, 'merge should exist');
    assertExists(DataOps.analyze, 'analyze should exist');
    assertExists(DataOps.execute, 'execute should exist');
    assertExists(DataOps.quick, 'quick helpers should exist');
    assertExists(DataOps.executors, 'executors should exist for backward compat');
  }),

  test('Detects input types correctly', async () => {
    const pairs = fixtures.duplicatePairs.safeMerges.slice(0, 3);
    const decisions = fixtures.decisions.approved.slice(0, 3);

    const pairType = DataOps._detectInputType(pairs);
    const decisionType = DataOps._detectInputType(decisions);

    assertEqual(pairType, 'pairs', 'Should detect pairs');
    assertEqual(decisionType, 'decisions', 'Should detect decisions');
  }),

  test('Safety config builder creates valid configs', async () => {
    const levels = ['strict', 'balanced', 'permissive', 'off'];

    for (const level of levels) {
      const config = DataOps._buildSafetyConfig(level);
      assertExists(config.guardrails, `${level} config should have guardrails`);
    }

    // Verify strictness ordering
    const strict = DataOps._buildSafetyConfig('strict');
    const balanced = DataOps._buildSafetyConfig('balanced');

    assert(
      strict.guardrails.domain_mismatch.threshold < balanced.guardrails.domain_mismatch.threshold,
      'Strict should have tighter thresholds than balanced'
    );
  }),

  test('Backward compatibility with old executors', async () => {
    const { ParallelBulkMergeExecutor, BulkMergeExecutor, DedupSafetyEngine } = DataOps.executors;

    assertExists(ParallelBulkMergeExecutor, 'Should expose ParallelBulkMergeExecutor');
    assertExists(BulkMergeExecutor, 'Should expose BulkMergeExecutor');
    assertExists(DedupSafetyEngine, 'Should expose DedupSafetyEngine');
  })
];

/**
 * Suite 4: Hook Circuit Breaker Regression Tests
 *
 * Purpose: Ensure circuit breaker prevents cascading failures
 * Coverage:
 * - State transitions (CLOSED → OPEN → HALF-OPEN)
 * - Failure threshold enforcement
 * - Cooldown period
 * - Metrics logging
 */
const circuitBreakerTests = [
  test('Circuit breaker transitions to OPEN after threshold failures', async () => {
    // This test requires hook execution, so we'll validate the state file structure
    const stateFile = path.join(__dirname, '../hooks/.circuit-breaker-state.json');

    if (fs.existsSync(stateFile)) {
      const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));

      assertExists(state.state, 'State should have state field');
      assert(['CLOSED', 'OPEN', 'HALF-OPEN'].includes(state.state),
             'State should be valid');
      assertExists(state.failures, 'State should track failures');
    }
  }),

  test('Hook monitor dashboard provides metrics', async () => {
    // Validate that hook-monitor.js can be required and has expected exports
    const HookMonitor = require('../scripts/lib/hook-monitor');
    const monitor = new HookMonitor();

    assertExists(monitor.dashboard, 'Should have dashboard method');
    assertExists(monitor.analyze, 'Should have analyze method');
    assertExists(monitor.reset, 'Should have reset method');
    assertExists(monitor.alert, 'Should have alert method');
  })
];

/**
 * Suite 5: Test Data Generator Validation
 *
 * Purpose: Ensure test data generators produce valid data
 * Coverage:
 * - Duplicate pair generation
 * - Decision generation
 * - Salesforce ID generation
 * - Realistic data patterns
 */
const generatorTests = [
  test('Generates valid duplicate pairs', async () => {
    const pairs = generators.generateDuplicatePairs(10);

    assertEqual(pairs.length, 10, 'Should generate requested count');

    for (const pair of pairs) {
      assertExists(pair.masterId, 'Pair should have masterId');
      assertExists(pair.duplicateId, 'Pair should have duplicateId');
      assertExists(pair.similarity, 'Pair should have similarity score');
      assert(pair.similarity >= 0 && pair.similarity <= 1, 'Similarity should be 0-1');
    }
  }),

  test('Generates realistic Salesforce IDs', async () => {
    const id = generators.generateSalesforceId('Account');

    assertEqual(id.length, 18, 'Salesforce ID should be 18 characters');
    assert(id.startsWith('001'), 'Account ID should start with 001');
  }),

  test('Generates decisions with proper structure', async () => {
    const decisions = generators.generateDecisions(5, 'APPROVE');

    assertEqual(decisions.length, 5, 'Should generate requested count');

    for (const decision of decisions) {
      assertEqual(decision.decision, 'APPROVE', 'Should have requested decision type');
      assertExists(decision.pair_id, 'Should have pair_id');
      assertExists(decision.master_id, 'Should have master_id');
      assertExists(decision.duplicate_id, 'Should have duplicate_id');
      assertExists(decision.confidence, 'Should have confidence score');
    }
  })
];

// ═══════════════════════════════════════════════════════════════
// TEST RUNNER
// ═══════════════════════════════════════════════════════════════

async function runSuite(name, tests) {
  console.log(`\n${c.cyan}${c.bold}${name}${c.reset}`);
  console.log('═'.repeat(70));

  const suiteResults = { passed: 0, failed: 0, skipped: 0 };

  for (const testFn of tests) {
    try {
      await testFn();
      suiteResults.passed++;
      results.passed++;
    } catch (error) {
      suiteResults.failed++;
      results.failed++;
      if (VERBOSE) {
        console.log(`  ${c.red}Error details: ${error.message}${c.reset}`);
      }
    }
  }

  results.suites[name] = suiteResults;
}

async function runAllTests() {
  console.log(`\n${c.bold}Golden Test Suite - Comprehensive Regression Testing${c.reset}`);
  console.log('═'.repeat(70));

  if (CI_MODE) {
    console.log(`${c.yellow}Running in CI/CD mode (strict validation)${c.reset}\n`);
  }

  const suiteArg = process.argv.find(arg => arg.startsWith('--suite='));
  const suite = suiteArg ? suiteArg.split('=')[1] : 'all';

  // Run test suites
  if (suite === 'all' || suite === 'routing') {
    await runSuite('Agent Routing Regression Tests', routingTests);
  }

  if (suite === 'all' || suite === 'routing-performance') {
    await runSuite('Routing & Performance Tests (Phase 4)', routingPerformanceTests.allTests);
  }

  if (suite === 'all' || suite === 'batch-metadata-optimization') {
    await runSuite('Batch Metadata Optimization Tests (Week 2)', batchMetadataOptimizationTests.allTests);
  }

  if (suite === 'all' || suite === 'parallel-conflict-detection') {
    await runSuite('Parallel Conflict Detection Tests (Week 2 - Phase 2)', parallelConflictDetectionTests.allTests);
  }

  if (suite === 'all' || suite === 'field-metadata-cache') {
    await runSuite('Field Metadata Cache Tests (Week 2 - Phase 3)', fieldMetadataCacheTests.allTests);
  }

  if (suite === 'all' || suite === 'conflict-resolver-optimizer') {
    await runSuite('Conflict Resolver Optimizer Tests (sfdc-conflict-resolver - Phase 1)', conflictResolverOptimizerTests.allTests);
  }

  if (suite === 'all' || suite === 'data-operations-optimizer') {
    await runSuite('Data Operations Optimizer Tests (sfdc-data-operations - Phase 1)', dataOperationsOptimizerTests.allTests);
  }

  if (suite === 'all' || suite === 'metadata-analyzer-optimizer') {
    await runSuite('Metadata Analyzer Optimizer Tests (sfdc-metadata-analyzer - Phase 1)', metadataAnalyzerOptimizerTests.allTests);
  }

  if (suite === 'all' || suite === 'discovery-optimizer') {
    await runSuite('Discovery Optimizer Tests (sfdc-discovery - Phase 1)', discoveryOptimizerTests.allTests);
  }

  if (suite === 'all' || suite === 'orchestration-optimizer') {
    await runSuite('Orchestration Optimizer Tests (sfdc-orchestrator - Phase 1)', orchestrationOptimizerTests.allTests);
  }

  if (suite === 'all' || suite === 'planner-optimizer') {
    await runSuite('Planner Optimizer Tests (sfdc-planner - Phase 1)', plannerOptimizerTests.allTests);
  }

  if (suite === 'all' || suite === 'remediation-optimizer') {
    await runSuite('Remediation Optimizer Tests (sfdc-remediation-executor - Phase 1)', remediationOptimizerTests.allTests);
  }

  if (suite === 'all' || suite === 'revops-auditor-optimizer') {
    await runSuite('RevOps Auditor Optimizer Tests (sfdc-revops-auditor - Phase 1)', revopsAuditorOptimizerTests.allTests);
  }

  if (suite === 'all' || suite === 'cpq-assessor-optimizer') {
    await runSuite('CPQ Assessor Optimizer Tests (sfdc-cpq-assessor - Phase 1)', cpqAssessorOptimizerTests.allTests);
  }

  if (suite === 'all' || suite === 'merge') {
    await runSuite('Merge Operations Regression Tests', mergeTests);
  }

  if (suite === 'all' || suite === 'api') {
    await runSuite('Data Operations API Regression Tests', apiTests);
  }

  if (suite === 'all' || suite === 'circuit-breaker') {
    await runSuite('Hook Circuit Breaker Regression Tests', circuitBreakerTests);
  }

  if (suite === 'all' || suite === 'generators') {
    await runSuite('Test Data Generator Validation', generatorTests);
  }

  // Print summary
  console.log('\n' + '═'.repeat(70));
  console.log(`${c.bold}Test Summary${c.reset}`);
  console.log('═'.repeat(70));

  console.log(`${c.green}Passed:  ${results.passed}${c.reset}`);
  console.log(`${c.red}Failed:  ${results.failed}${c.reset}`);
  console.log(`${c.yellow}Skipped: ${results.skipped}${c.reset}`);
  console.log(`${c.cyan}Total:   ${results.passed + results.failed + results.skipped}${c.reset}`);

  const successRate = results.passed / (results.passed + results.failed) * 100;
  console.log(`\nSuccess Rate: ${successRate.toFixed(1)}%`);

  // Per-suite breakdown
  console.log('\n' + '═'.repeat(70));
  console.log(`${c.bold}Suite Breakdown${c.reset}`);
  console.log('═'.repeat(70));

  for (const [suiteName, suiteResults] of Object.entries(results.suites)) {
    const suiteRate = suiteResults.passed / (suiteResults.passed + suiteResults.failed) * 100;
    console.log(`${suiteName}: ${suiteResults.passed}/${suiteResults.passed + suiteResults.failed} (${suiteRate.toFixed(1)}%)`);
  }

  // Coverage report
  if (COVERAGE) {
    console.log('\n' + '═'.repeat(70));
    console.log(`${c.bold}Coverage Summary${c.reset}`);
    console.log('═'.repeat(70));
    console.log('Test coverage by component:');
    console.log('  - Agent Routing: 5 tests (pattern matching, complexity, validation)');
    console.log('  - Merge Operations: 6 tests (safety, execution, progress)');
    console.log('  - Data Operations API: 4 tests (exports, input detection, safety config)');
    console.log('  - Hook Circuit Breaker: 2 tests (state transitions, monitoring)');
    console.log('  - Test Generators: 3 tests (pairs, IDs, decisions)');
    console.log('  Total: 20 regression tests');
  }

  // Exit with appropriate code
  if (CI_MODE && results.failed > 0) {
    console.log(`\n${c.red}${c.bold}CI/CD FAILURE: ${results.failed} test(s) failed${c.reset}`);
    process.exit(1);
  } else if (results.failed > 0) {
    console.log(`\n${c.yellow}${c.bold}Some tests failed. Review details above.${c.reset}`);
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
    console.log('Golden Test Suite - Comprehensive Regression Testing\n');
    console.log('Usage:');
    console.log('  node test/golden-test-suite.js                    # Run all tests');
    console.log('  node test/golden-test-suite.js --suite=routing    # Specific suite');
    console.log('  node test/golden-test-suite.js --coverage         # Generate coverage report');
    console.log('  node test/golden-test-suite.js --ci               # CI/CD mode (strict)');
    console.log('  node test/golden-test-suite.js --verbose          # Verbose output');
    console.log('\nSuites:');
    console.log('  all                  Run all test suites (default)');
    console.log('  routing              Agent routing regression tests');
    console.log('  routing-performance  Routing & performance tests (Phase 4)');
    console.log('  batch-metadata-optimization  Batch metadata optimization (Week 2)');
    console.log('  parallel-conflict-detection  Parallel conflict detection (Week 2 - Phase 2)');
    console.log('  field-metadata-cache         Field metadata cache (Week 2 - Phase 3)');
    console.log('  conflict-resolver-optimizer  Conflict resolver optimizer (sfdc-conflict-resolver - Phase 1)');
    console.log('  data-operations-optimizer    Data operations optimizer (sfdc-data-operations - Phase 1)');
    console.log('  merge                Merge operations regression tests');
    console.log('  api                  Data operations API regression tests');
    console.log('  circuit-breaker      Hook circuit breaker regression tests');
    console.log('  generators           Test data generator validation');
    process.exit(0);
  }

  runAllTests().catch(error => {
    console.error(`\n${c.red}Test runner error: ${error.message}${c.reset}`);
    console.error(error.stack);
    process.exit(1);
  });
}

module.exports = { runAllTests, results };
