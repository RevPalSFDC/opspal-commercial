#!/usr/bin/env node

const assert = require('assert');
const { HookTester } = require('../runner');

const HOOK_PATH = 'plugins/opspal-mcp-client/hooks/pre-opspal-scoring.sh';

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
  console.log('\n[Tests] MCP client pre-opspal scoring hook\n');

  const tester = createTester();
  const results = [];

  results.push(await runTest('Hook exists and is valid', async () => {
    const validation = tester.validate();
    assert(validation.exists, 'Hook file should exist');
    assert(validation.executable, 'Hook should be executable');
    assert(validation.syntaxValid, 'Hook should have valid bash syntax');
  }));

  results.push(await runTest('Blocks customer health scoring without signals', async () => {
    const result = await tester.run({
      input: createEvent('mcp__opspal__score_customer_health', {})
    });

    assert.strictEqual(result.exitCode, 2, 'Missing signals should block execution');
    assert(result.stderr.includes('score_customer_health requires a \'signals\' object'));
  }));

  results.push(await runTest('Allows lead-quality scoring when fit and engagement are present', async () => {
    const result = await tester.run({
      input: createEvent('mcp__opspal__score_lead_quality', {
        fit: {
          companySize: '100-250',
          industry: 'Software',
          geography: 'North America',
          revenue: 12000000
        },
        engagement: {
          actions: ['webinar', 'pricing-page']
        }
      })
    });

    assert.strictEqual(result.exitCode, 0, 'Valid scoring input should pass');
    assert.strictEqual(result.parseError, null, 'Should not emit invalid stdout');
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
