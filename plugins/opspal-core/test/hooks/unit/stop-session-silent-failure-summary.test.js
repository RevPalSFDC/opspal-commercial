#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { HookTester } = require('../runner');

const PROJECT_ROOT = path.resolve(__dirname, '../../../../..');
const HOOK_PATH = 'plugins/opspal-core/hooks/stop-session-silent-failure-summary.sh';
const MONITOR_SCRIPT = path.join(
  PROJECT_ROOT,
  'plugins/opspal-core/scripts/lib/silent-failure/runtime-monitors.js'
);

function createTester() {
  return new HookTester(HOOK_PATH, {
    timeout: 15000,
    verbose: process.env.VERBOSE === '1'
  });
}

function createTempHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'stop-silent-failure-home-'));
}

function runMonitorCommand(home, sessionId, command) {
  return spawnSync('node', [MONITOR_SCRIPT, command], {
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME: home,
      CLAUDE_SESSION_ID: sessionId
    }
  });
}

async function runTest(name, testFn) {
  process.stdout.write(`  ${name}... `);
  try {
    await testFn();
    console.log('OK');
    return { passed: true, name };
  } catch (error) {
    console.log('FAIL');
    console.log(`    Error: ${error.message}`);
    return { passed: false, name, error: error.message };
  }
}

async function runAllTests() {
  console.log('\n[Tests] stop-session-silent-failure-summary.sh\n');

  const tester = createTester();
  const results = [];

  results.push(await runTest('Hook exists and is valid', async () => {
    const validation = tester.validate();
    assert(validation.exists, 'Hook file should exist');
    assert(validation.executable, 'Hook should be executable');
    assert(validation.syntaxValid, 'Hook should have valid bash syntax');
  }));

  results.push(await runTest('Analyzes persisted runtime monitor state and resets it', async () => {
    const home = createTempHome();
    const sessionId = `stop-summary-${Date.now()}`;

    try {
      const simulate = runMonitorCommand(home, sessionId, 'simulate');
      assert.strictEqual(simulate.status, 0, 'Should seed runtime monitor state');

      const before = runMonitorCommand(home, sessionId, 'status');
      assert.strictEqual(before.status, 0, 'Should read runtime monitor state before Stop');
      const beforeSummary = JSON.parse(before.stdout);
      assert.strictEqual(beforeSummary.metrics.validationSkips.totalSkips, 2, 'Should persist validation skip count');
      assert.strictEqual(beforeSummary.metrics.cache.fallbacks, 1, 'Should persist cache fallback count');
      assert.strictEqual(beforeSummary.metrics.hookFailures.totalFailures, 1, 'Should persist explicit hook failure count');

      const result = await tester.run({
        input: {
          hook_event_name: 'Stop'
        },
        env: {
          HOME: home,
          CLAUDE_SESSION_ID: sessionId
        }
      });

      assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
      assert.strictEqual(result.parseError, null, 'Should emit valid JSON');
      assert.deepStrictEqual(result.output, {}, 'Should emit a JSON no-op envelope');

      const logPath = path.join(home, '.claude/logs/silent-failure-session.log');
      assert(fs.existsSync(logPath), 'Should write a Stop-hook log');

      const logContent = fs.readFileSync(logPath, 'utf8');
      assert(
        logContent.includes('Session had 4 silent failure indicators'),
        'Should summarize the persisted validation, fallback, and hook failure counts'
      );
      assert(logContent.includes('Post-session analysis complete'), 'Should record analysis completion');

      const after = runMonitorCommand(home, sessionId, 'status');
      assert.strictEqual(after.status, 0, 'Should read runtime monitor state after Stop');
      const afterSummary = JSON.parse(after.stdout);
      assert.strictEqual(afterSummary.metrics.validationSkips.totalSkips, 0, 'Stop hook should reset validation skip state');
      assert.strictEqual(afterSummary.metrics.cache.fallbacks, 0, 'Stop hook should reset cache fallback state');
      assert.strictEqual(afterSummary.metrics.hookFailures.totalFailures, 0, 'Stop hook should reset hook failure state');
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  }));

  const passed = results.filter((result) => result.passed).length;
  const failed = results.filter((result) => !result.passed).length;

  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runAllTests().catch((error) => {
  console.error('Test runner error:', error);
  process.exit(1);
});
