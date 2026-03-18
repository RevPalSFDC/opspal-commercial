#!/usr/bin/env node

/**
 * Unit Tests for validate-sfdc-project-location.sh
 *
 * Covers valid and invalid project paths.
 *
 * @copyright 2024-2026 RevPal Partners, LLC
 */

const assert = require('assert');
const path = require('path');
const { spawnSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '../../../../..');
const HOOK_PATH = path.join(
  PROJECT_ROOT,
  'plugins/opspal-salesforce/hooks/validate-sfdc-project-location.sh'
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
  console.log('\n[Tests] validate-sfdc-project-location.sh Tests\n');

  const results = [];

  results.push(await runTest('Hook exists and is valid', async () => {
    const result = spawnSync('bash', ['-n', HOOK_PATH], { encoding: 'utf8' });
    assert.strictEqual(result.status, 0, 'Hook should have valid bash syntax');
  }));

  results.push(await runTest('Rejects invalid instances path', async () => {
    const result = spawnSync('bash', [HOOK_PATH, '/tmp/opspal-internal/instances/foo/bar'], {
      encoding: 'utf8'
    });

    assert.strictEqual(result.status, 1, 'Should exit with validation error');
  }));

  results.push(await runTest('Accepts valid SFDC instances path', async () => {
    const result = spawnSync('bash', [HOOK_PATH, '/tmp/opspal-internal/SFDC/instances/foo/bar'], {
      encoding: 'utf8'
    });

    assert.strictEqual(result.status, 0, 'Should exit with success');
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
