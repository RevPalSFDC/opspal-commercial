#!/usr/bin/env node

const assert = require('assert');
const { HookTester } = require('../runner');

const HOOK_PATH = 'plugins/opspal-mcp-client/hooks/pre-opspal-compute.sh';

function createTester() {
  return new HookTester(HOOK_PATH, {
    timeout: 15000,
    verbose: process.env.VERBOSE === '1'
  });
}

function createEvent(toolName, toolInput) {
  return {
    hook_event_name: 'PreToolUse',
    tool_name: toolName,
    tool_input: toolInput
  };
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
  console.log('\n[Tests] MCP client pre-opspal compute hook\n');

  const tester = createTester();
  const results = [];

  results.push(await runTest('Hook exists and is valid', async () => {
    const validation = tester.validate();
    assert(validation.exists, 'Hook file should exist');
    assert(validation.executable, 'Hook should be executable');
    assert(validation.syntaxValid, 'Hook should have valid bash syntax');
  }));

  results.push(await runTest('Blocks revenue model calls missing baseArr', async () => {
    const result = await tester.run({
      input: createEvent('mcp__opspal__compute_revenue_model', {
        projectionYears: 3
      })
    });

    assert.strictEqual(result.exitCode, 2, 'Missing baseArr should block execution');
    assert(result.stderr.includes('requires \'baseArr\''), 'Should explain the missing required field');
  }));

  results.push(await runTest('Allows revenue model calls and warns on oversized Monte Carlo passes', async () => {
    const result = await tester.run({
      input: createEvent('mcp__opspal__compute_revenue_model', {
        baseArr: 1200000,
        monteCarloPasses: 15001
      })
    });

    assert.strictEqual(result.exitCode, 0, 'Valid compute call should pass');
    assert.strictEqual(result.parseError, null, 'Should not emit invalid stdout');
    assert(
      result.stderr.includes('monteCarloPasses=15001 is very high'),
      'Should warn when the compute request is unusually expensive'
    );
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
