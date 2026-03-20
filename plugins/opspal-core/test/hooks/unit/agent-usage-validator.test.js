#!/usr/bin/env node

/**
 * Unit Tests for agent-usage-validator.sh
 *
 * Focus on advisory behavior for Salesforce keyword detection.
 *
 * @copyright 2024-2026 RevPal Partners, LLC
 */

const assert = require('assert');
const { HookTester } = require('../runner');

const HOOK_PATH = 'plugins/opspal-salesforce/hooks/agent-usage-validator.sh';

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
  } catch (e) {
    console.log('FAIL');
    console.log(`    Error: ${e.message}`);
    return { passed: false, name, error: e.message };
  }
}

async function runAllTests() {
  console.log('\n[Tests] agent-usage-validator.sh Tests\n');

  const tester = createTester();
  const results = [];

  results.push(await runTest('Hook exists and is valid', async () => {
    const validation = tester.validate();
    assert(validation.exists, 'Hook file should exist');
    assert(validation.executable, 'Hook should be executable');
    assert(validation.syntaxValid, 'Hook should have valid bash syntax');
  }));

  results.push(await runTest('Skips when no user message provided', async () => {
    const result = await tester.run({
      input: {},
      env: {}
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
  }));

  results.push(await runTest('Suggests agent when Salesforce keywords present', async () => {
    const result = await tester.run({
      input: {},
      env: {
        CLAUDE_USER_MESSAGE: 'Deploy a flow to production'
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
    assert(
      result.stderr.includes('Suggested agent'),
      'Should emit a suggested agent reminder'
    );
    assert(
      result.stderr.includes('Agent tool'),
      'Should reference the Agent tool in advisory guidance'
    );
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
