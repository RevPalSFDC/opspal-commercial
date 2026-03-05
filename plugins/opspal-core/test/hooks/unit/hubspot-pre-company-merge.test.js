#!/usr/bin/env node

/**
 * Unit Tests for HubSpot pre-company-merge.sh
 *
 * Syntax validation + skip-path validation (safe, non-executing).
 *
 * @copyright 2024-2026 RevPal Partners, LLC
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '../../../../..');
const HOOK_PATH = path.join(
  PROJECT_ROOT,
  'plugins/opspal-hubspot/hooks/pre-company-merge.sh'
);

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'hubspot-pre-merge-'));
}

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
  console.log('\n[Tests] HubSpot pre-company-merge.sh Tests\n');

  const results = [];

  results.push(await runTest('Hook exists and is valid', async () => {
    assert(fs.existsSync(HOOK_PATH), 'Hook file should exist');
    const result = spawnSync('bash', ['-n', HOOK_PATH], { encoding: 'utf8' });
    assert.strictEqual(result.status, 0, 'Hook should have valid bash syntax');
  }));

  results.push(await runTest('Skips when not a merge operation', async () => {
    const tempDir = createTempDir();
    const result = spawnSync('bash', [HOOK_PATH, 'list companies'], {
      encoding: 'utf8',
      cwd: tempDir,
      env: { ...process.env, CLAUDE_PLUGIN_ROOT: PROJECT_ROOT }
    });

    fs.rmSync(tempDir, { recursive: true, force: true });

    assert.strictEqual(result.status, 0, 'Should exit with 0');
    assert.ok(
      result.stdout.includes('Not a merge operation'),
      'Should report non-merge skip'
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
