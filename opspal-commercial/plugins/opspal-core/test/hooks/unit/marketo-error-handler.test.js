#!/usr/bin/env node

/**
 * Unit Tests for Marketo hooks/lib/error-handler.sh
 *
 * Syntax validation + require_env failure path (safe, non-executing).
 *
 * @copyright 2024-2026 RevPal Partners, LLC
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '../../../../..');
const HANDLER_PATH = path.join(
  PROJECT_ROOT,
  'plugins/opspal-marketo/hooks/lib/error-handler.sh'
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
  console.log('\n[Tests] Marketo error-handler.sh Tests\n');

  const results = [];

  results.push(await runTest('Handler exists and is valid', async () => {
    assert(fs.existsSync(HANDLER_PATH), 'Error handler file should exist');
    const result = spawnSync('bash', ['-n', HANDLER_PATH], { encoding: 'utf8' });
    assert.strictEqual(result.status, 0, 'Handler should have valid bash syntax');
  }));

  results.push(await runTest('require_env exits when missing', async () => {
    const result = spawnSync('bash', ['-c', `source "${HANDLER_PATH}"; require_env MARKETO_CLIENT_ID`], {
      encoding: 'utf8'
    });

    assert.strictEqual(result.status, 3, 'Should exit with 3 for missing env');
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
