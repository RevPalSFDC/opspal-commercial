#!/usr/bin/env node

/**
 * Unit Tests for pre-sfdc-metadata-manager-invocation.sh
 *
 * Covers missing message handling and pass-through when no contexts match.
 *
 * @copyright 2024-2026 RevPal Partners, LLC
 */

const assert = require('assert');
const path = require('path');
const { spawnSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '../../../../..');
const HOOK_PATH = path.join(
  PROJECT_ROOT,
  'plugins/opspal-salesforce/hooks/pre-sfdc-metadata-manager-invocation.sh'
);

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
  console.log('\n[Tests] pre-sfdc-metadata-manager-invocation.sh Tests\n');

  const results = [];

  results.push(await runTest('Hook exists and is valid', async () => {
    const result = spawnSync('bash', ['-n', HOOK_PATH], { encoding: 'utf8' });
    assert.strictEqual(result.status, 0, 'Hook should have valid bash syntax');
  }));

  results.push(await runTest('Fails when user message missing', async () => {
    const result = spawnSync('bash', [HOOK_PATH], {
      encoding: 'utf8',
      cwd: PROJECT_ROOT
    });

    assert.strictEqual(result.status, 5, 'Should exit with config error');
  }));

  results.push(await runTest('Passes through when no contexts matched', async () => {
    const message = 'hello world';
    const result = spawnSync('bash', [HOOK_PATH, message], {
      encoding: 'utf8',
      cwd: PROJECT_ROOT
    });

    assert.strictEqual(result.status, 0, 'Should exit with 0');
    assert.strictEqual(result.stdout.trim(), message, 'Should echo original message');
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
