#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { HookTester } = require('../runner');

const HOOK_PATH = 'plugins/opspal-core/hooks/subagent-stop-capture.sh';

function createTester() {
  return new HookTester(HOOK_PATH, {
    timeout: 15000,
    verbose: process.env.VERBOSE === '1'
  });
}

function createTempHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'subagent-stop-home-'));
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
  console.log('\n[Tests] subagent-stop-capture.sh\n');

  const tester = createTester();
  const results = [];

  results.push(await runTest('Hook exists and is valid', async () => {
    const validation = tester.validate();
    assert(validation.exists, 'Hook file should exist');
    assert(validation.executable, 'Hook should be executable');
    assert(validation.syntaxValid, 'Hook should have valid bash syntax');
  }));

  results.push(await runTest('Skips successful subagent completions', async () => {
    const home = createTempHome();

    try {
      const result = await tester.run({
        input: {
          hook_event_name: 'SubagentStop',
          agent_type: 'opspal-salesforce:sfdc-deployment-manager',
          success: true
        },
        env: {
          HOME: home
        }
      });

      assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
      assert.strictEqual(
        fs.existsSync(path.join(home, '.claude/logs/subagent-stops.jsonl')),
        false,
        'Successful runs should not be logged as failures'
      );
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  }));

  results.push(await runTest('Logs failed subagent executions to the lifecycle log', async () => {
    const home = createTempHome();

    try {
      const result = await tester.run({
        input: {
          hook_event_name: 'SubagentStop',
          agent_type: 'opspal-salesforce:sfdc-deployment-manager',
          agent_id: 'agent-123',
          success: false,
          error: 'Flow validation failed',
          duration_ms: 3400
        },
        env: {
          HOME: home
        }
      });

      assert.strictEqual(result.exitCode, 0, 'Should exit with 0');

      const logPath = path.join(home, '.claude/logs/subagent-stops.jsonl');
      assert(fs.existsSync(logPath), 'Should create the subagent stop log');

      const entries = fs.readFileSync(logPath, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
      assert.strictEqual(entries.length, 1, 'Should record one failed stop event');
      assert.strictEqual(entries[0].agent, 'opspal-salesforce:sfdc-deployment-manager');
      assert.strictEqual(entries[0].agent_id, 'agent-123');
      assert.strictEqual(entries[0].success, false);
      assert(entries[0].error.includes('Flow validation failed'), 'Should record the failure reason');
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
