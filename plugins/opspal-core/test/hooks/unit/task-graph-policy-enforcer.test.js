#!/usr/bin/env node

/**
 * Unit Tests for task-graph-policy-enforcer.sh
 *
 * Syntax validation + allow-path validation (safe, non-executing).
 *
 * @copyright 2024-2026 RevPal Partners, LLC
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '../../../../..');
const HOOK_PATH = path.join(PROJECT_ROOT, 'plugins/opspal-core/hooks/task-graph-policy-enforcer.sh');

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
  console.log('\n[Tests] task-graph-policy-enforcer.sh Tests\n');

  const results = [];

  results.push(await runTest('Hook exists and is valid', async () => {
    assert(fs.existsSync(HOOK_PATH), 'Hook file should exist');
    const result = spawnSync('bash', ['-n', HOOK_PATH], { encoding: 'utf8' });
    assert.strictEqual(result.status, 0, 'Hook should have valid bash syntax');
  }));

  results.push(await runTest('Allows read-only tool without enforcement', async () => {
    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-test-home-'));
    const result = spawnSync('bash', [HOOK_PATH, 'Read', '{}'], {
      encoding: 'utf8',
      input: '{}',
      env: { ...process.env, HOME: tempHome }
    });

    fs.rmSync(tempHome, { recursive: true, force: true });
    assert.strictEqual(result.status, 0, 'Should allow read-only tool');
  }));

  results.push(await runTest('Does not fail when preferred log root is unwritable', async () => {
    const result = spawnSync('bash', [HOOK_PATH, 'Read', '{}'], {
      encoding: 'utf8',
      input: '{}',
      env: {
        ...process.env,
        CLAUDE_HOOK_LOG_ROOT: '/proc/1/forbidden-log-root'
      }
    });

    assert.strictEqual(result.status, 0, 'Should allow execution using fallback log root');
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
