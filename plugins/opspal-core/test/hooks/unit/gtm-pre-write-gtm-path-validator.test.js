#!/usr/bin/env node

const assert = require('assert');
const { HookTester } = require('../runner');

const HOOK_PATH = 'plugins/opspal-gtm-planning/hooks/pre-write-gtm-path-validator.sh';

function createTester() {
  return new HookTester(HOOK_PATH, {
    timeout: 15000,
    verbose: process.env.VERBOSE === '1'
  });
}

function createWriteInput(filePath) {
  return {
    hook_event_name: 'PreToolUse',
    tool_name: 'Write',
    file_path: filePath,
    tool_input: {
      file_path: filePath
    }
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
  console.log('\n[Tests] GTM pre-write path validator\n');

  const tester = createTester();
  const results = [];

  results.push(await runTest('Hook exists and is valid', async () => {
    const validation = tester.validate();
    assert(validation.exists, 'Hook file should exist');
    assert(validation.executable, 'Hook should be executable');
    assert(validation.syntaxValid, 'Hook should have valid bash syntax');
  }));

  results.push(await runTest('Skips non-GTM writes', async () => {
    const result = await tester.run({
      input: createWriteInput('docs/notes.md'),
      env: { ORG_SLUG: 'acme' }
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
    assert.strictEqual(result.parseError, null, 'Should not emit invalid stdout');
    assert.deepStrictEqual(result.output, {}, 'Should emit structured no-op JSON for non-GTM paths');
  }));

  results.push(await runTest('Emits structured guidance for off-path GTM writes', async () => {
    const result = await tester.run({
      input: createWriteInput('tmp/gtm-plan.md'),
      env: { ORG_SLUG: 'acme' }
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
    assert.strictEqual(result.parseError, null, 'Should emit valid JSON');
    assert.strictEqual(
      result.output?.hookSpecificOutput?.hookEventName,
      'PreToolUse',
      'Should identify the Claude hook event'
    );
    assert.strictEqual(
      result.output?.hookSpecificOutput?.permissionDecision,
      'allow',
      'Guidance path should allow the write'
    );
    assert(
      (result.output?.hookSpecificOutput?.additionalContext || '').includes('orgs/acme/platforms/gtm-planning/'),
      'Should direct the user toward the standard GTM path'
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
