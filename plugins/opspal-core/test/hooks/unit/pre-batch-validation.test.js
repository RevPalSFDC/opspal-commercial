#!/usr/bin/env node

/**
 * Unit Tests for pre-batch-validation.sh
 *
 * Covers missing arguments and missing analysis file behavior.
 *
 * @copyright 2024-2026 RevPal Partners, LLC
 */

const assert = require('assert');
const path = require('path');
const { spawnSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '../../../../..');
const HOOK_PATH = path.join(PROJECT_ROOT, 'plugins/opspal-salesforce/hooks/pre-batch-validation.sh');

async function runTest(name, testFn) {
  process.stdout.write(`  ${name}... `);
  try {
    await testFn();
    console.log('OK');
    return { passed: true, name };
  } catch (e) {
    console.log('FAIL');
    console.log(`    Error: ${e.message}`);
    return { passed: false, name, error: e.message };
  }
}

async function runAllTests() {
  console.log('\n[Tests] pre-batch-validation.sh Tests\n');

  const results = [];

  results.push(await runTest('Hook exists and is valid', async () => {
    const result = spawnSync('bash', ['-n', HOOK_PATH], { encoding: 'utf8' });
    assert.strictEqual(result.status, 0, 'Hook should have valid bash syntax');
  }));

  results.push(await runTest('Fails when arguments missing', async () => {
    const result = spawnSync('bash', [HOOK_PATH], {
      encoding: 'utf8',
      cwd: PROJECT_ROOT
    });

    assert.strictEqual(result.status, 5, 'Should exit with config error');
  }));

  results.push(await runTest('Fails when analysis file missing', async () => {
    const result = spawnSync('bash', [HOOK_PATH, '/tmp/missing-analysis.json', 'testOrg'], {
      encoding: 'utf8',
      cwd: PROJECT_ROOT
    });

    assert.strictEqual(result.status, 1, 'Should exit with validation error');
  }));

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);

  if (failed > 0) {
    console.log('Failed tests:');
    for (const r of results.filter(r => !r.passed)) {
      console.log(`  - ${r.name}: ${r.error}`);
    }
    process.exit(1);
  }
}

runAllTests().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
