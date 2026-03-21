#!/usr/bin/env node

const assert = require('assert');
const { HookTester } = require('../runner');

const HOOK_PATH = 'plugins/opspal-okrs/hooks/pre-write-okr-path-validator.sh';

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
  console.log('\n[Tests] OKR pre-write path validator\n');

  const tester = createTester();
  const results = [];

  results.push(await runTest('Hook exists and is valid', async () => {
    const validation = tester.validate();
    assert(validation.exists, 'Hook file should exist');
    assert(validation.executable, 'Hook should be executable');
    assert(validation.syntaxValid, 'Hook should have valid bash syntax');
  }));

  results.push(await runTest('Skips non-OKR writes', async () => {
    const result = await tester.run({
      input: createWriteInput('docs/status-update.md')
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
    assert.deepStrictEqual(result.output, {}, 'Should emit structured no-op JSON for non-OKR paths');
  }));

  results.push(await runTest('Blocks invalid OKR output paths by default', async () => {
    const result = await tester.run({
      input: createWriteInput('tmp/okr-quarterly-plan.md')
    });

    assert.strictEqual(result.exitCode, 0, 'Should return structured denial without shell failure');
    assert(
      result.stderr.includes('BLOCKED: OKR path validation'),
      'Should explain the block reason on stderr'
    );
    assert.strictEqual(
      result.output?.hookSpecificOutput?.permissionDecision,
      'deny',
      'Should deny invalid OKR output paths'
    );
    assert(
      (result.output?.hookSpecificOutput?.permissionDecisionReason || '').includes('OKR_PATH_VALIDATION_BLOCKED'),
      'Should include the structured denial reason'
    );
  }));

  results.push(await runTest('Allows writes under the OKR plugin directory', async () => {
    const result = await tester.run({
      input: createWriteInput('plugins/opspal-okrs/templates/okr-template.md')
    });

    assert.strictEqual(result.exitCode, 0, 'Plugin-local writes should be allowed');
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
