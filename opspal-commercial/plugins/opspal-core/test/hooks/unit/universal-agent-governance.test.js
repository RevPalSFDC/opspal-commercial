#!/usr/bin/env node

/**
 * Unit Tests for universal-agent-governance.sh
 *
 * Covers governance disabled path and unknown agent tier handling.
 *
 * @copyright 2024-2026 RevPal Partners, LLC
 */

const assert = require('assert');
const { HookTester } = require('../runner');

const HOOK_PATH = 'plugins/opspal-salesforce/hooks/universal-agent-governance.sh';

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
  console.log('\n[Tests] universal-agent-governance.sh Tests\n');

  const tester = createTester();
  const results = [];

  results.push(await runTest('Hook exists and is valid', async () => {
    const validation = tester.validate();
    assert(validation.exists, 'Hook file should exist');
    assert(validation.executable, 'Hook should be executable');
    assert(validation.syntaxValid, 'Hook should have valid bash syntax');
  }));

  results.push(await runTest('Skips when governance disabled', async () => {
    const result = await tester.run({
      input: {},
      env: {
        AGENT_GOVERNANCE_ENABLED: 'false'
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
  }));

  results.push(await runTest('Allows unknown agent not in matrix', async () => {
    const result = await tester.run({
      input: {},
      env: {
        AGENT_NAME: 'new-agent'
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
    assert(
      result.stdout.includes('permission matrix'),
      'Should warn about missing agent in matrix'
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
