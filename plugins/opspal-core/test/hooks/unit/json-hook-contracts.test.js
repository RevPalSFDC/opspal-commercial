#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const { HookTester } = require('../runner');

const PROJECT_ROOT = path.resolve(__dirname, '../../../../..');
const PRE_TASK_GRAPH_TRIGGER = path.join(PROJECT_ROOT, 'plugins/opspal-core/hooks/pre-task-graph-trigger.sh');

function createTester(hookPath) {
  return new HookTester(hookPath, {
    timeout: 15000,
    verbose: process.env.VERBOSE === '1'
  });
}

function assertJsonStdout(result, message) {
  assert.strictEqual(result.exitCode, 0, `${message} should exit with 0`);
  assert.strictEqual(result.parseError, null, `${message} should emit parseable JSON`);
  assert(result.stdout.trim().startsWith('{'), `${message} should emit JSON on stdout`);
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
  console.log('\n[Tests] json hook contracts\n');

  const results = [];

  results.push(await runTest('pre-task-graph-trigger emits JSON on disabled no-op', async () => {
    const result = spawnSync('bash', [PRE_TASK_GRAPH_TRIGGER, 'Complex migration planning task'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        TASK_GRAPH_ENABLED: '0'
      }
    });

    assert.strictEqual(result.status, 0, 'Hook should exit with 0');
    assert(result.stdout.trim().startsWith('{'), 'Hook should emit JSON on stdout');
    assert.doesNotThrow(() => JSON.parse(result.stdout), 'Hook stdout should parse as JSON');
  }));

  const hookCases = [
    {
      name: 'subagent-start-context emits JSON no-op',
      hookPath: 'plugins/opspal-core/hooks/subagent-start-context.sh',
      input: { hook_event_name: 'SubagentStart' }
    },
    {
      name: 'pre-stop-org-verification emits JSON no-op',
      hookPath: 'plugins/opspal-core/hooks/pre-stop-org-verification.sh',
      input: { stop_response: 'Short response for skip.' }
    },
    {
      name: 'task-scope-selector emits JSON no-op',
      hookPath: 'plugins/opspal-core/hooks/task-scope-selector.sh',
      input: {}
    },
    {
      name: 'routing-context-refresher emits JSON no-op',
      hookPath: 'plugins/opspal-core/hooks/routing-context-refresher.sh',
      input: {
        hook_event_name: 'UserPromptSubmit',
        message: 'Audit Salesforce flow deployment blockers in staging.'
      },
      env: {
        ROUTING_REFRESH_INTERVAL: '0'
      }
    },
    {
      name: 'session-end emits JSON no-op',
      hookPath: 'plugins/opspal-core/hooks/session-end.sh',
      input: {},
      env: {
        SKIP_SCRATCHPAD: '1',
        SKIP_CLEANUP: '1'
      }
    },
    {
      name: 'session-end-reliability emits JSON no-op',
      hookPath: 'plugins/opspal-core/hooks/session-end-reliability.sh',
      input: {},
      env: {
        ENABLE_AUTO_RELIABILITY: '0'
      }
    },
    {
      name: 'stop-session-silent-failure-summary emits JSON no-op',
      hookPath: 'plugins/opspal-core/hooks/stop-session-silent-failure-summary.sh',
      input: { hook_event_name: 'Stop' }
    },
    {
      name: 'pre-tool-use-contract-validation emits JSON no-op',
      hookPath: 'plugins/opspal-core/hooks/pre-tool-use-contract-validation.sh',
      input: {}
    }
  ];

  for (const hookCase of hookCases) {
    results.push(await runTest(hookCase.name, async () => {
      const tester = createTester(hookCase.hookPath);
      const home = fs.mkdtempSync(path.join(os.tmpdir(), 'json-hook-contract-'));

      try {
        const result = await tester.run({
          input: hookCase.input,
          env: {
            HOME: home,
            ...(hookCase.env || {})
          }
        });

        assertJsonStdout(result, hookCase.name);
      } finally {
        fs.rmSync(home, { recursive: true, force: true });
      }
    }));
  }

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
