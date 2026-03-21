#!/usr/bin/env node

const assert = require('assert');
const { HookTester } = require('../runner');

const HOOK_PATH = 'plugins/opspal-salesforce/hooks/pre-deploy-agent-context-check.sh';

function createTester() {
  return new HookTester(HOOK_PATH, {
    timeout: 15000,
    verbose: process.env.VERBOSE === '1'
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
  console.log('\n[Tests] pre-deploy-agent-context-check.sh\n');

  const tester = createTester();
  const results = [];

  results.push(await runTest('Hook exists and is valid', async () => {
    const validation = tester.validate();
    assert(validation.exists, 'Hook file should exist');
    assert(validation.executable, 'Hook should be executable');
    assert(validation.syntaxValid, 'Hook should have valid bash syntax');
  }));

  results.push(await runTest('Blocks direct source-scoped deploy commands outside agent context', async () => {
    const result = await tester.run({
      input: {
        hook_event_name: 'PreToolUse',
        tool_name: 'Bash',
        tool_input: {
          command: 'sf project deploy start --source-dir force-app/main/default/layouts --target-org production'
        }
      }
    });

    assert.strictEqual(result.exitCode, 2, 'Direct deploy start should still be blocked by default');
    assert(result.stderr.includes('DEPLOY BLOCKED'), 'Should explain the direct deploy block');
  }));

  results.push(await runTest('Allows direct source-scoped deploys to sandbox-like target orgs', async () => {
    const result = await tester.run({
      input: {
        hook_event_name: 'PreToolUse',
        tool_name: 'Bash',
        tool_input: {
          command: 'sf project deploy start --source-dir force-app/main/default/layouts --target-org peregrine-sandbox'
        }
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Sandbox-like target orgs should bypass the agent deadlock');
    assert(
      result.stderr.includes('sandbox-like target org'),
      'Should explain why the direct deploy was allowed'
    );
  }));

  results.push(await runTest('Ignores deploy lifecycle and status commands', async () => {
    const result = await tester.run({
      input: {
        hook_event_name: 'PreToolUse',
        tool_name: 'Bash',
        tool_input: {
          command: 'sf project deploy report --job-id 0Af000000000123AAA --target-org peregrine-sandbox --json'
        }
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Deploy report commands should pass through');
    assert(!result.stderr.includes('DEPLOY BLOCKED'), 'Lifecycle commands should not trigger deploy routing');
  }));

  results.push(await runTest('Allows approved deployment agents to run source-scoped deploys', async () => {
    const result = await tester.run({
      input: {
        hook_event_name: 'PreToolUse',
        tool_name: 'Bash',
        tool_input: {
          command: 'sf project deploy start --source-dir force-app/main/default/layouts --target-org production'
        }
      },
      env: {
        CLAUDE_AGENT_NAME: 'opspal-salesforce:sfdc-deployment-manager'
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Approved deployment agents should pass through');
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
