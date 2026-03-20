#!/usr/bin/env node

/**
 * Unit Tests for pre-task-hook.sh
 *
 * Validates mandatory agent enforcement for high-risk operations.
 *
 * @copyright 2024-2026 RevPal Partners, LLC
 */

const assert = require('assert');
const path = require('path');
const { spawnSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '../../../../..');
const HOOK_PATH = path.join(PROJECT_ROOT, 'plugins/opspal-salesforce/hooks/pre-task-hook.sh');

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
  console.log('\n[Tests] pre-task-hook.sh Tests\n');

  const results = [];

  results.push(await runTest('Hook exists and is valid', async () => {
    const result = spawnSync('bash', ['-n', HOOK_PATH], { encoding: 'utf8' });
    assert.strictEqual(result.status, 0, 'Hook should have valid bash syntax');
  }));

  results.push(await runTest('Blocks high-risk operations without agent', async () => {
    const result = spawnSync('bash', [HOOK_PATH, 'delete field on Account'], {
      encoding: 'utf8',
      cwd: PROJECT_ROOT
    });
    const combinedOutput = `${result.stdout || ''}${result.stderr || ''}`;

    assert.strictEqual(result.status, 10, 'Should exit with agent-required code');
    assert(
      combinedOutput.includes('Agent tool'),
      'Should reference the Agent tool in blocking guidance'
    );
  }));

  results.push(await runTest('Allows non-high-risk tasks', async () => {
    const result = spawnSync('bash', [HOOK_PATH, 'analyze report usage'], {
      encoding: 'utf8',
      cwd: PROJECT_ROOT
    });

    assert.strictEqual(result.status, 0, 'Should exit with 0');
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
