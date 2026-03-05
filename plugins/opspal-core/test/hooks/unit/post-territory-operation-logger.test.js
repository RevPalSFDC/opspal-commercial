#!/usr/bin/env node

/**
 * Unit Tests for post-territory-operation-logger.sh
 *
 * Verifies non-territory operations are ignored.
 *
 * @copyright 2024-2026 RevPal Partners, LLC
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '../../../../..');
const HOOK_PATH = path.join(PROJECT_ROOT, 'plugins/opspal-salesforce/hooks/post-territory-operation-logger.sh');
const LOG_DIR = path.join(PROJECT_ROOT, 'plugins/opspal-salesforce/logs/territory');
const LOG_FILE = path.join(LOG_DIR, 'territory-operations.log');

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
  console.log('\n[Tests] post-territory-operation-logger.sh Tests\n');

  const results = [];

  results.push(await runTest('Hook exists and is valid', async () => {
    const result = spawnSync('bash', ['-n', HOOK_PATH], { encoding: 'utf8' });
    assert.strictEqual(result.status, 0, 'Hook should have valid bash syntax');
  }));

  results.push(await runTest('Skips non-territory operation', async () => {
    const logDirExisted = fs.existsSync(LOG_DIR);

    const result = spawnSync('bash', [HOOK_PATH, 'sf data query --sobject Account', '0'], {
      encoding: 'utf8',
      env: { ...process.env }
    });

    assert.strictEqual(result.status, 0, 'Should exit with 0');
    assert(!fs.existsSync(LOG_FILE), 'Should not create territory log file');

    if (!logDirExisted) {
      fs.rmSync(LOG_DIR, { recursive: true, force: true });
    }
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
