#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { HookTester } = require('../runner');

const HOOK_PATH = 'plugins/opspal-core/hooks/task-completed-metrics.sh';

function createTester() {
  return new HookTester(HOOK_PATH, {
    timeout: 15000,
    verbose: process.env.VERBOSE === '1'
  });
}

function createTempHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'task-completed-home-'));
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
  console.log('\n[Tests] task-completed-metrics.sh\n');

  const tester = createTester();
  const results = [];

  results.push(await runTest('Hook exists and is valid', async () => {
    const validation = tester.validate();
    assert(validation.exists, 'Hook file should exist');
    assert(validation.executable, 'Hook should be executable');
    assert(validation.syntaxValid, 'Hook should have valid bash syntax');
  }));

  results.push(await runTest('Logs completed subagent metrics to JSONL', async () => {
    const home = createTempHome();

    try {
      const result = await tester.run({
        input: {
          hook_event_name: 'TaskCompleted',
          agent_type: 'opspal-salesforce:sfdc-deployment-manager',
          agent_id: 'agent-456',
          duration_ms: 1500,
          token_count: 321,
          tool_uses: 4,
          success: true
        },
        env: {
          HOME: home
        }
      });

      assert.strictEqual(result.exitCode, 0, 'Should exit with 0');

      const logPath = path.join(home, '.claude/logs/task-completions.jsonl');
      assert(fs.existsSync(logPath), 'Should create the task completion log');

      const entries = fs.readFileSync(logPath, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
      assert.strictEqual(entries.length, 1, 'Should record one task completion');
      assert.strictEqual(entries[0].agent, 'opspal-salesforce:sfdc-deployment-manager');
      assert.strictEqual(entries[0].agent_id, 'agent-456');
      assert.strictEqual(entries[0].duration_ms, 1500);
      assert.strictEqual(entries[0].token_count, 321);
      assert.strictEqual(entries[0].tool_uses, 4);
      assert.strictEqual(entries[0].success, true);
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  }));

  results.push(await runTest('Preserves explicit failed task results in the metrics log', async () => {
    const home = createTempHome();

    try {
      const result = await tester.run({
        input: {
          hook_event_name: 'TaskCompleted',
          agent_type: 'opspal-salesforce:sfdc-deployment-manager',
          agent_id: 'agent-789',
          duration_ms: 2800,
          token_count: 512,
          tool_uses: 6,
          success: false
        },
        env: {
          HOME: home
        }
      });

      assert.strictEqual(result.exitCode, 0, 'Should exit with 0');

      const logPath = path.join(home, '.claude/logs/task-completions.jsonl');
      assert(fs.existsSync(logPath), 'Should create the task completion log');

      const entries = fs.readFileSync(logPath, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
      assert.strictEqual(entries.length, 1, 'Should record one task completion');
      assert.strictEqual(entries[0].agent_id, 'agent-789');
      assert.strictEqual(entries[0].success, false, 'Should preserve explicit task failure state');
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
