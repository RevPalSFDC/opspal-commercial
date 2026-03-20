#!/usr/bin/env node

/**
 * Unit Tests for pre-task-runbook-policy-enforcer.sh
 *
 * Validates contract-safe no-op behavior on the live Agent hook path.
 *
 * @copyright 2024-2026 RevPal Partners, LLC
 */

const assert = require('assert');
const { HookTester } = require('../runner');

const HOOK_PATH = 'plugins/opspal-core/hooks/pre-task-runbook-policy-enforcer.sh';

function createTester() {
  return new HookTester(HOOK_PATH, {
    timeout: 15000,
    verbose: process.env.VERBOSE === '1'
  });
}

function createAgentEvent(toolInput = {}) {
  return {
    tool_name: 'Agent',
    tool_input: toolInput
  };
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
  console.log('\n[Tests] pre-task-runbook-policy-enforcer.sh Tests\n');

  const tester = createTester();
  const results = [];

  results.push(await runTest('Hook exists and is valid', async () => {
    const validation = tester.validate();
    assert(validation.exists, 'Hook file should exist');
    assert(validation.executable, 'Hook should be executable');
    assert(validation.syntaxValid, 'Hook should have valid bash syntax');
  }));

  results.push(await runTest('Emits no-op JSON when disabled', async () => {
    const result = await tester.run({
      input: createAgentEvent({
        subagent_type: 'sfdc-report-designer',
        prompt: 'Build a revenue report'
      }),
      env: {
        RUNBOOK_POLICY_ENABLED: '0'
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
    assert.deepStrictEqual(result.output, {}, 'Disabled hook should emit a no-op response');
    assert.strictEqual(result.parseError, null, 'Should not emit invalid stdout');
  }));

  results.push(await runTest('Emits no-op JSON when context is insufficient', async () => {
    const result = await tester.run({
      input: createAgentEvent({
        subagent_type: 'sfdc-report-designer',
        prompt: 'Build a revenue report without org or object context'
      })
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
    assert.deepStrictEqual(result.output, {}, 'Missing context should not echo raw input');
    assert.strictEqual(result.parseError, null, 'Should not emit invalid stdout');
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
