#!/usr/bin/env node

const assert = require('assert');

const { calculateStats } = require('../../../scripts/lib/routing-metrics');

async function runTest(name, testFn) {
  process.stdout.write(`  ${name}... `);
  try {
    await testFn();
    console.log('OK');
    return { passed: true, name };
  } catch (error) {
    console.log('FAIL');
    console.log(`    Error: ${error.message}`);
    return { passed: false, name, error: error.message };
  }
}

async function runAllTests() {
  console.log('\n[Tests] routing-metrics.js\n');

  const results = [];

  results.push(await runTest('Includes override counts in stats with routing decisions', async () => {
    const stats = calculateStats([
      {
        type: 'routing_decision',
        output: {
          executionBlockUntilCleared: true,
          requiresSpecialist: true,
          promptGuidanceOnly: true,
          wasResolved: true
        },
        metrics: { durationMs: 42 }
      },
      {
        type: 'override_audit',
        sessionId: 'session-1'
      },
      {
        type: 'override_warning',
        sessionId: 'session-1'
      }
    ]);

    assert.strictEqual(stats.totalDecisions, 1, 'Should count routing decisions');
    assert.strictEqual(stats.executionGateCount, 1, 'Should count execution-gated specialist routes');
    assert.strictEqual(stats.overrideAuditCount, 1, 'Should count override audit events');
    assert.strictEqual(stats.overrideWarningCount, 1, 'Should count override warning events');
    assert.strictEqual(stats.sessionsWithOverrides, 1, 'Should count sessions with overrides');
  }));

  results.push(await runTest('Includes override counts when no routing decisions exist', async () => {
    const stats = calculateStats([
      {
        type: 'override_audit',
        sessionId: 'session-2'
      }
    ]);

    assert.strictEqual(stats.totalDecisions, 0, 'Should report zero routing decisions');
    assert.strictEqual(stats.overrideAuditCount, 1, 'Should still count override events');
    assert.strictEqual(stats.overrideWarningCount, 0, 'Should report zero override warnings');
    assert.strictEqual(stats.sessionsWithOverrides, 1, 'Should report overridden sessions');
    assert.strictEqual(stats.resolutionRate, 0, 'Should provide zero defaults for missing routing data');
  }));

  const passed = results.filter((result) => result.passed).length;
  const failed = results.filter((result) => !result.passed).length;

  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runAllTests().catch((error) => {
  console.error('Test runner error:', error);
  process.exit(1);
});
