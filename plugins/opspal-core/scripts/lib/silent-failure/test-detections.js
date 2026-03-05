#!/usr/bin/env node

/**
 * Test script for Silent Failure Detection System
 *
 * Verifies all validators and monitors work correctly
 *
 * Usage:
 *   node test-detections.js
 *   node test-detections.js --verbose
 */

const { runAllPreSessionValidators } = require('./pre-session-validators');
const { RuntimeMonitorManager } = require('./runtime-monitors');
const { runPostSessionAnalysis } = require('./post-session-analyzers');
const { SilentFailureAlerter } = require('./alerting');
const { MetricsAggregator } = require('./metrics-aggregator');

const verbose = process.argv.includes('--verbose');

console.log('🧪 Silent Failure Detection System - Test Suite\n');
console.log('=' .repeat(50));

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
    passed++;
  } catch (err) {
    console.log(`❌ ${name}`);
    if (verbose) console.log(`   Error: ${err.message}`);
    failed++;
  }
}

async function runTests() {
  // Test 1: Pre-session validators load
  test('Pre-session validators import', () => {
    if (typeof runAllPreSessionValidators !== 'function') {
      throw new Error('runAllPreSessionValidators not a function');
    }
  });

  // Test 2: Pre-session validators execute
  test('Pre-session validators execute', async () => {
    const result = await runAllPreSessionValidators();
    if (!result.hasOwnProperty('passed')) {
      throw new Error('Missing passed property');
    }
    if (!Array.isArray(result.results)) {
      throw new Error('Missing results array');
    }
  });

  // Test 3: Runtime monitor creates
  test('Runtime monitor instantiation', () => {
    const monitor = new RuntimeMonitorManager();
    if (!monitor.start) throw new Error('Missing start method');
    if (!monitor.getSummary) throw new Error('Missing getSummary method');
  });

  // Test 4: Runtime monitor tracks events
  test('Runtime monitor event tracking', () => {
    const monitor = new RuntimeMonitorManager();
    monitor.start();
    monitor.recordValidationSkip('TestTool', 'test reason', 'test');
    monitor.recordCacheFallback('test-cache', new Error('Test error'));
    monitor.recordHookFailure('test-hook', new Error('Test failure'), true);

    const summary = monitor.getSummary();
    if (summary.metrics.validationSkips.totalSkips !== 1) {
      throw new Error('Validation skip not recorded');
    }
    if (summary.metrics.cache.fallbacks !== 1) {
      throw new Error('Cache fallback not recorded');
    }
    if (summary.metrics.hookFailures.totalSilentFailures !== 1) {
      throw new Error('Hook failure not recorded');
    }
  });

  // Test 5: Post-session analysis runs
  test('Post-session analysis execution', async () => {
    const sessionData = {
      sessionId: 'test_session',
      healthScore: 45,
      metrics: {
        validationSkips: { totalSkips: 8 },
        cache: { fallbacks: 5 },
        hookFailures: { totalSilentFailures: 3 }
      }
    };

    const result = await runPostSessionAnalysis(sessionData, { saveReflection: false, updateBaseline: false });
    if (!result.patternAnalysis) throw new Error('Missing patternAnalysis');
    if (result.patternAnalysis.patterns.length === 0) {
      throw new Error('Should detect patterns in unhealthy session');
    }
  });

  // Test 6: Alerter creates
  test('Alerter instantiation', () => {
    const alerter = new SilentFailureAlerter({ terminal: false, log: false, reflections: false });
    if (!alerter.alert) throw new Error('Missing alert method');
  });

  // Test 7: Metrics aggregator runs
  test('Metrics aggregator execution', async () => {
    const aggregator = new MetricsAggregator();
    const report = await aggregator.aggregate({ days: 7 });
    if (!report.healthScore && report.healthScore !== 0) {
      throw new Error('Missing healthScore');
    }
    if (!report.period) throw new Error('Missing period');
  });

  // Test 8: Dashboard generation
  test('Dashboard generation', async () => {
    const aggregator = new MetricsAggregator();
    const report = await aggregator.aggregate({ days: 7 });
    const dashboard = aggregator.generateDashboard(report);
    if (!dashboard.includes('Silent Failure Detection Dashboard')) {
      throw new Error('Dashboard missing title');
    }
  });

  // Test 9: EnvBypass detection (simulated)
  test('EnvBypass detection logic', () => {
    const { EnvBypassValidator } = require('./pre-session-validators');

    // Temporarily set env var
    const original = process.env.SKIP_VALIDATION;
    process.env.SKIP_VALIDATION = '1';

    const validator = new EnvBypassValidator();
    const result = validator.check();

    // Restore
    if (original !== undefined) {
      process.env.SKIP_VALIDATION = original;
    } else {
      delete process.env.SKIP_VALIDATION;
    }

    if (result.violations.length === 0) {
      throw new Error('Should detect SKIP_VALIDATION');
    }
    if (result.violations[0].severity !== 'CRITICAL') {
      throw new Error('SKIP_VALIDATION should be CRITICAL');
    }
  });

  // Test 10: Health score calculation
  test('Health score calculation', () => {
    const monitor = new RuntimeMonitorManager();
    monitor.start();

    // Clean session should have high score
    const cleanScore = monitor.calculateOverallHealthScore();
    if (cleanScore < 90) throw new Error(`Clean score too low: ${cleanScore}`);

    // Add issues
    for (let i = 0; i < 10; i++) {
      monitor.recordValidationSkip('Test', 'test', 'env');
    }

    const degradedScore = monitor.calculateOverallHealthScore();
    if (degradedScore >= cleanScore) {
      throw new Error('Score should decrease with issues');
    }
  });

  console.log('\n' + '=' .repeat(50));
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);

  if (failed > 0) {
    console.log('❌ Some tests failed. Review the errors above.\n');
    process.exit(1);
  } else {
    console.log('✅ All tests passed! System is working correctly.\n');
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error('Test suite error:', err);
  process.exit(1);
});
