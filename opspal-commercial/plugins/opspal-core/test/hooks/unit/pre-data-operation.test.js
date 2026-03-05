#!/usr/bin/env node

/**
 * Unit Tests for pre-data-operation.sh
 *
 * Validates syntax and non-blocking banner behavior.
 *
 * @copyright 2024-2026 RevPal Partners, LLC
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '../../../../..');
const HOOK_PATH = path.join(
  PROJECT_ROOT,
  'plugins/.claude/hooks/pre-data-operation.sh'
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
  console.log('\n[Tests] pre-data-operation.sh Tests\n');

  const results = [];

  results.push(await runTest('Hook exists and is valid', async () => {
    assert(fs.existsSync(HOOK_PATH), 'Hook file should exist');
    const result = spawnSync('bash', ['-n', HOOK_PATH], { encoding: 'utf8' });
    assert.strictEqual(result.status, 0, 'Hook should have valid bash syntax');
  }));

  results.push(await runTest('No prompt exits cleanly', async () => {
    const result = spawnSync('bash', [HOOK_PATH], { encoding: 'utf8' });
    assert.strictEqual(result.status, 0, 'Should exit with 0');
    assert.strictEqual(result.stdout.trim(), '', 'Should not emit output without prompt');
  }));

  results.push(await runTest('Shows banner for bulk data prompt', async () => {
    const result = spawnSync('bash', [HOOK_PATH, 'Import CSV of contacts'], {
      encoding: 'utf8'
    });
    assert.strictEqual(result.status, 0, 'Should exit with 0');
    assert(
      result.stdout.includes('BATCH PATTERN RECOMMENDED'),
      'Should emit recommendation banner'
    );
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
