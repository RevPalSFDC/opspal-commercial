#!/usr/bin/env node

/**
 * Unit Tests for intake-suggestion.sh
 *
 * Validates non-blocking guidance behavior and payload compatibility.
 *
 * @copyright 2024-2026 RevPal Partners, LLC
 */

const path = require('path');
const assert = require('assert');

const { HookTester } = require('../runner');

const HOOK_PATH = 'plugins/opspal-core/hooks/intake-suggestion.sh';
const PROJECT_ROOT = path.resolve(__dirname, '../../../../..');
const PLUGIN_ROOT = path.join(PROJECT_ROOT, 'plugins/opspal-core');

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
    console.log('✅');
    return { passed: true, name };
  } catch (e) {
    console.log('❌');
    console.log(`    Error: ${e.message}`);
    return { passed: false, name, error: e.message };
  }
}

async function runAllTests() {
  console.log('\n🧪 intake-suggestion.sh Tests\n');

  const tester = createTester();
  const results = [];

  results.push(await runTest('Hook exists and is valid', async () => {
    const validation = tester.validate();
    assert(validation.exists, 'Hook file should exist');
    assert(validation.executable, 'Hook should be executable');
    assert(validation.syntaxValid, 'Hook should have valid bash syntax');
  }));

  results.push(await runTest('Suggests intake for project-level message payload', async () => {
    const result = await tester.run({
      input: {
        message: 'We need to redesign lead routing in Salesforce with territory-based assignment and approval chains'
      },
      env: { CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT }
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
    assert(result.output && typeof result.output === 'object', 'Should return JSON output');
    assert(result.output.hookSpecificOutput?.additionalContext, 'Should provide additionalContext');
  }));

  results.push(await runTest('Supports userPrompt payload shape', async () => {
    const result = await tester.run({
      input: {
        userPrompt: 'I want to migrate 50k contacts from HubSpot to Salesforce with dedup and phased rollout'
      },
      env: { CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT }
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
    assert(result.output && typeof result.output === 'object', 'Should return JSON output');
    assert(result.output.hookSpecificOutput?.additionalContext, 'Should provide additionalContext for userPrompt payload');
  }));

  results.push(await runTest('Skips when /intake command is already used', async () => {
    const result = await tester.run({
      input: {
        message: '/intake Build a CPQ workflow'
      },
      env: { CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT }
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
    assert.deepStrictEqual(result.output, {}, 'Should not suggest when /intake already used');
  }));

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);

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
