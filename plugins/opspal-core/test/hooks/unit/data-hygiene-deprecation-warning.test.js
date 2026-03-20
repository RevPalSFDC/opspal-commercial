#!/usr/bin/env node

const assert = require('assert');
const { HookTester } = require('../runner');

const HOOK_PATH = 'plugins/opspal-data-hygiene/hooks/deprecation-warning.sh';

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
  console.log('\n[Tests] data-hygiene deprecation warning hook\n');

  const tester = createTester();
  const results = [];

  results.push(await runTest('Hook exists and is valid', async () => {
    const validation = tester.validate();
    assert(validation.exists, 'Hook file should exist');
    assert(validation.executable, 'Hook should be executable');
    assert(validation.syntaxValid, 'Hook should have valid bash syntax');
  }));

  results.push(await runTest('Returns empty JSON when prompt is unrelated', async () => {
    const result = await tester.run({
      stdin: 'Please summarize this meeting and draft a status email.'
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
    assert.deepStrictEqual(result.output, {}, 'Unrelated prompts should get an empty JSON response');
  }));

  results.push(await runTest('Injects deprecation guidance for hygiene prompts', async () => {
    const result = await tester.run({
      stdin: 'Need to deduplicate duplicate accounts and clean up data hygiene issues.'
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
    assert.strictEqual(result.parseError, null, 'Should emit valid JSON');
    assert.strictEqual(
      result.output?.hookSpecificOutput?.hookEventName,
      'UserPromptSubmit',
      'Should return the documented hook event name'
    );
    assert(
      (result.output?.hookSpecificOutput?.additionalContext || '').includes('deprecated'),
      'Should tell the user the plugin is deprecated'
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
