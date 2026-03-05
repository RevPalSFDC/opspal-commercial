#!/usr/bin/env node

/**
 * Unit Tests for post-reflect.sh
 *
 * Syntax validation + safe skip-path validation (safe, non-executing).
 *
 * @copyright 2024-2026 RevPal Partners, LLC
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '../../../../..');
const HOOK_PATH = path.join(PROJECT_ROOT, 'plugins/opspal-core/hooks/reflection/post-reflect.sh');

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
  console.log('\n[Tests] post-reflect.sh Tests\n');

  const results = [];

  results.push(await runTest('Hook exists and is valid', async () => {
    assert(fs.existsSync(HOOK_PATH), 'Hook file should exist');
    const result = spawnSync('bash', ['-n', HOOK_PATH], { encoding: 'utf8' });
    assert.strictEqual(result.status, 0, 'Hook should have valid bash syntax');
  }));

  results.push(await runTest('Skips when no reflection file is present', async () => {
    const result = spawnSync('bash', [HOOK_PATH], {
      encoding: 'utf8',
      cwd: os.tmpdir(),
      env: { ...process.env }
    });

    assert.strictEqual(result.status, 0, 'Should exit with 0');
    assert(
      result.stdout.includes('No reflection file found') || result.stdout.includes('No reflection file'),
      'Should note missing reflection file'
    );
  }));

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  console.log(`
Results: ${passed} passed, ${failed} failed
`);

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
