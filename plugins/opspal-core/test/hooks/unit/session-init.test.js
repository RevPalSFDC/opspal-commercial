#!/usr/bin/env node

/**
 * Unit Tests for session-init.sh
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
const HOOK_PATH = path.join(PROJECT_ROOT, 'plugins/opspal-core/hooks/session-init.sh');

function createTester() {
  return new HookTester('plugins/opspal-core/hooks/session-init.sh', {
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
  console.log('\n[Tests] session-init.sh Tests\n');

  const results = [];
  const tester = createTester();

  results.push(await runTest('Hook exists and is valid', async () => {
    assert(fs.existsSync(HOOK_PATH), 'Hook file should exist');
    const result = spawnSync('bash', ['-n', HOOK_PATH], { encoding: 'utf8' });
    assert.strictEqual(result.status, 0, 'Hook should have valid bash syntax');
  }));

  results.push(await runTest('Runs with all steps skipped', async () => {
    const result = await tester.run({
      input: {},
      env: {
        SKIP_SCRATCHPAD: '1',
        SKIP_ENV_CHECK: '1',
        SKIP_VERSION_CHECK: '1'
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
    if (typeof result.output === 'string') {
      const lines = result.output.trim().split(/\n+/);
      assert.strictEqual(lines[lines.length - 1], '{}', 'Should return empty JSON');
    } else {
      assert.deepStrictEqual(result.output, {}, 'Should return empty JSON');
    }
  }));

  results.push(await runTest('Clears stale task scope state at session start', async () => {
    const home = fs.mkdtempSync(path.join(require('os').tmpdir(), 'session-init-scope-'));
    const stateDir = path.join(home, '.claude', 'session-context');
    const stateFile = path.join(stateDir, 'task-scope.json');
    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(stateFile, '{"selectedPlugins":["opspal-hubspot"]}\n', 'utf8');

    try {
      const result = await tester.run({
        input: {},
        env: {
          HOME: home,
          SKIP_SCRATCHPAD: '1',
          SKIP_ENV_CHECK: '1',
          SKIP_VERSION_CHECK: '1'
        }
      });

      assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
      assert.strictEqual(fs.existsSync(stateFile), false, 'Should remove stale task scope state');
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
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
