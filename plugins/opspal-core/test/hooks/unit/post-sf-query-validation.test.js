#!/usr/bin/env node

/**
 * Unit Tests for post-sf-query-validation.sh
 *
 * Covers non-query pass-through and structured PostToolUse feedback.
 *
 * @copyright 2024-2026 RevPal Partners, LLC
 */

const assert = require('assert');
const { HookTester } = require('../runner');

const HOOK_PATH = 'plugins/opspal-salesforce/hooks/post-sf-query-validation.sh';

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
  console.log('\n[Tests] post-sf-query-validation.sh Tests\n');

  const tester = createTester();
  const results = [];

  results.push(await runTest('Hook exists and is valid', async () => {
    const validation = tester.validate();
    assert(validation.exists, 'Hook file should exist');
    assert(validation.executable, 'Hook should be executable');
    assert(validation.syntaxValid, 'Hook should have valid bash syntax');
  }));

  results.push(await runTest('Passes through non-query tool', async () => {
    const result = await tester.run({
      input: {
        tool_name: 'Bash',
        tool_input: { command: 'echo ok' },
        tool_response: { stdout: 'ok' }
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
    assert.strictEqual(result.output, null, 'Should stay silent for non-query tools');
  }));

  results.push(await runTest('Warns on empty query results', async () => {
    const result = await tester.run({
      input: {
        hook_event_name: 'PostToolUse',
        tool_name: 'Bash',
        tool_input: {
          command: 'sf data query --query "SELECT Id FROM Account" --json'
        },
        tool_response: {
          stdout: '{"totalSize":0,"records":[]}'
        }
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
    assert.strictEqual(result.output.suppressOutput, true, 'Should suppress verbose stdout noise');
    assert(
      result.output.hookSpecificOutput.hookEventName === 'PostToolUse',
      'Should target the PostToolUse event'
    );
    assert(
      result.output.hookSpecificOutput.additionalContext.includes('0 records'),
      'Should warn about empty results'
    );
  }));

  results.push(await runTest('Blocks on query output that still contains field errors', async () => {
    const result = await tester.run({
      input: {
        hook_event_name: 'PostToolUse',
        tool_name: 'Bash',
        tool_input: {
          command: 'sf data query --query "SELECT ApiName FROM FlowVersionView" --json'
        },
        tool_response: {
          stdout: 'INVALID_FIELD: No such column ApiName on entity FlowVersionView'
        }
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
    assert.strictEqual(result.output.decision, 'block', 'Should block follow-on processing');
    assert(
      result.output.reason.includes('Data quality validation failed'),
      'Should explain why Claude should pause'
    );
    assert.strictEqual(result.output.hookSpecificOutput.hookEventName, 'PostToolUse', 'Should target PostToolUse');
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
