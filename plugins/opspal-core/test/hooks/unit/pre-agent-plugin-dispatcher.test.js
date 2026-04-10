#!/usr/bin/env node

const assert = require('assert');
const { HookTester } = require('../runner');

const HOOK_PATH = 'plugins/opspal-core/hooks/pre-agent-plugin-dispatcher.sh';

function createTester() {
  return new HookTester(HOOK_PATH, {
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
  } catch (error) {
    console.log('FAIL');
    console.log(`    Error: ${error.message}`);
    return { passed: false, name, error: error.message };
  }
}

async function runAllTests() {
  console.log('\n[Tests] Pre-Agent Plugin Dispatcher\n');

  const tester = createTester();
  const results = [];

  results.push(await runTest('Hook exists and is valid', async () => {
    const validation = tester.validate();
    assert(validation.exists, 'Hook file should exist');
    assert(validation.executable, 'Hook should be executable');
    assert(validation.syntaxValid, 'Hook should have valid bash syntax');
  }));

  results.push(await runTest('Ignores non-Agent tool events', async () => {
    const result = await tester.run({
      input: {
        hook_event_name: 'PreToolUse',
        tool_name: 'Bash',
        tool_input: {
          command: 'echo hello'
        }
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
    assert.strictEqual(result.output, null, 'Should stay silent for non-Agent events');
  }));

  results.push(await runTest('Routes destructive HubSpot agents through governance', async () => {
    const result = await tester.run({
      input: {
        hook_event_name: 'PreToolUse',
        tool_name: 'Agent',
        tool_input: {
          subagent_type: 'opspal-hubspot:hubspot-orchestrator',
          prompt: 'Delete all contacts and clear all portal data in production.'
        }
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Structured deny should preserve exit code 0');
    assert.strictEqual(result.parseError, null, 'Should emit valid JSON');
    assert.strictEqual(result.output?.hookSpecificOutput?.permissionDecision, 'allow', 'Should emit advisory allow for destructive HubSpot work');
    assert(
      (result.output?.hookSpecificOutput?.permissionDecisionReason || '').includes('HUBSPOT_GOVERNANCE_ADVISORY'),
      'Should preserve the HubSpot governance advisory reason'
    );
  }));

  results.push(await runTest('Routes Monday destructive agents through governance', async () => {
    const result = await tester.run({
      input: {
        hook_event_name: 'PreToolUse',
        tool_name: 'Agent',
        tool_input: {
          subagent_type: 'monday-board-manager',
          prompt: 'Delete all boards in the workspace.'
        }
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Structured deny should preserve exit code 0');
    assert.strictEqual(result.parseError, null, 'Should emit valid JSON');
    assert.strictEqual(result.output?.hookSpecificOutput?.permissionDecision, 'allow', 'Should emit advisory allow for destructive Monday work');
    assert(
      (result.output?.hookSpecificOutput?.permissionDecisionReason || '').includes('MONDAY_GOVERNANCE_ADVISORY'),
      'Should preserve the Monday governance advisory reason'
    );
  }));

  results.push(await runTest('Routes Marketo high-risk agents through governance', async () => {
    const result = await tester.run({
      input: {
        hook_event_name: 'PreToolUse',
        tool_name: 'Agent',
        tool_input: {
          subagent_type: 'marketo-smart-campaign-api-specialist',
          prompt: 'Activate the live production campaign for all leads in the entire workspace.'
        }
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Structured guidance should preserve exit code 0');
    assert.strictEqual(result.parseError, null, 'Should emit valid JSON');
    assert.strictEqual(result.output?.hookSpecificOutput?.permissionDecision, 'allow', 'Should allow with approval guidance');
    assert(
      (result.output?.hookSpecificOutput?.permissionDecisionReason || '').includes('MARKETO_GOVERNANCE_APPROVAL_RECOMMENDED'),
      'Should preserve the Marketo approval guidance'
    );
  }));

  const failed = results.filter((result) => !result.passed);
  console.log(`\nPassed: ${results.length - failed.length}/${results.length}`);

  if (failed.length > 0) {
    console.log('\nFailures:');
    failed.forEach((result) => console.log(`  - ${result.name}: ${result.error}`));
    process.exit(1);
  }
}

runAllTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
