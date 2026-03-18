#!/usr/bin/env node

/**
 * Unit Tests for Marketo pre-intelligence-analysis.sh
 *
 * Syntax validation + missing-data failure path (safe, non-executing).
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
  'plugins/opspal-marketo/hooks/pre-intelligence-analysis.sh'
);

function createTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'marketo-intel-'));
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
  console.log('\n[Tests] Marketo pre-intelligence-analysis.sh Tests\n');

  const results = [];

  results.push(await runTest('Hook exists and is valid', async () => {
    assert(fs.existsSync(HOOK_PATH), 'Hook file should exist');
    const result = spawnSync('bash', ['-n', HOOK_PATH], { encoding: 'utf8' });
    assert.strictEqual(result.status, 0, 'Hook should have valid bash syntax');
  }));

  results.push(await runTest('Blocks when data files missing', async () => {
    const tempRoot = createTempRoot();
    const result = spawnSync('bash', [HOOK_PATH], {
      encoding: 'utf8',
      env: {
        ...process.env,
        CLAUDE_PLUGIN_ROOT: tempRoot,
        MARKETO_INSTANCE: 'test'
      }
    });

    fs.rmSync(tempRoot, { recursive: true, force: true });

    assert.strictEqual(result.status, 1, 'Should exit with 1 when data missing');
    const output = JSON.parse(result.stdout.trim());
    assert.strictEqual(output.valid, false, 'Should report invalid data');
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
