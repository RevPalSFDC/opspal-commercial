#!/usr/bin/env node

/**
 * Unit Tests for user-prompt-router.sh
 *
 * Syntax validation + skip-path validation (safe, non-executing).
 *
 * @copyright 2024-2026 RevPal Partners, LLC
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const { HookTester } = require('../runner');

const PROJECT_ROOT = path.resolve(__dirname, '../../../../..');
const HOOK_PATH = path.join(PROJECT_ROOT, 'plugins/opspal-core/hooks/user-prompt-router.sh');

function createTester() {
  return new HookTester('plugins/opspal-core/hooks/user-prompt-router.sh', {
    timeout: 10000,
    verbose: process.env.VERBOSE === '1'
  });
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
  console.log('\n[Tests] user-prompt-router.sh Tests\n');

  const results = [];
  const tester = createTester();

  results.push(await runTest('Hook exists and is valid', async () => {
    assert(fs.existsSync(HOOK_PATH), 'Hook file should exist');
    const result = spawnSync('bash', ['-n', HOOK_PATH], { encoding: 'utf8' });
    assert.strictEqual(result.status, 0, 'Hook should have valid bash syntax');
  }));

  results.push(await runTest('Skips when auto-routing disabled', async () => {
    const prompt = 'Please summarize this.';
    const result = await tester.run({
      stdin: prompt,
      env: { ENABLE_AUTO_ROUTING: '0' }
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
    assert.ok(
      result.output === null || result.output === '',
      'Should produce no output when disabled'
    );
  }));

  results.push(await runTest('Passes through when user requests skip', async () => {
    const prompt = 'Please do this task. [SKIP_ROUTING]';
    const result = await tester.run({
      stdin: prompt,
      env: { ENABLE_AUTO_ROUTING: '1' }
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
    assert.strictEqual(result.output, prompt, 'Should echo prompt verbatim');
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
