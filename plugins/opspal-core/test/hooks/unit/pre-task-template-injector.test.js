#!/usr/bin/env node

/**
 * Unit Tests for pre-task-template-injector.sh
 *
 * Validates template injection and pass-through behavior.
 *
 * @copyright 2024-2026 RevPal Partners, LLC
 */

const path = require('path');
const assert = require('assert');

const { HookTester } = require('../runner');

// =============================================================================
// Test Configuration
// =============================================================================

const HOOK_PATH = 'plugins/opspal-core/hooks/pre-task-template-injector.sh';
const PROJECT_ROOT = path.resolve(__dirname, '../../../../..');
const PLUGIN_ROOT = path.join(PROJECT_ROOT, 'plugins/opspal-core');

// =============================================================================
// Test Helpers
// =============================================================================

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

// =============================================================================
// Tests
// =============================================================================

async function runAllTests() {
  console.log('\n[Tests] pre-task-template-injector.sh Tests\n');

  const tester = createTester();
  const results = [];

  // Test 1: Hook validation
  results.push(await runTest('Hook exists and is valid', async () => {
    const validation = tester.validate();
    assert(validation.exists, 'Hook file should exist');
    assert(validation.executable, 'Hook should be executable');
    assert(validation.syntaxValid, 'Hook should have valid bash syntax');
  }));

  // Test 2: Injects template guidance for known agent
  results.push(await runTest('Injects template guidance for known agent', async () => {
    const input = createAgentEvent({
      subagent_type: 'sfdc-cpq-assessor',
      prompt: 'Generate a CPQ assessment report'
    });

    const result = await tester.run({
      input,
      env: { CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT }
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
    assert(result.output && typeof result.output === 'object', 'Should output JSON');
    const updatedInput = result.output?.hookSpecificOutput?.updatedInput;
    assert(updatedInput, 'Should emit updatedInput for Agent hook updates');
    assert(result.parseError === null, 'Should not emit invalid stdout');
    assert(updatedInput.template_guidance, 'Should add template_guidance');
    assert.strictEqual(
      updatedInput.template_guidance.templates.pdfCover,
      'salesforce-audit',
      'Should set Salesforce audit cover'
    );
    assert(
      updatedInput.prompt.startsWith('[BRANDING:'),
      'Should prepend branding guidance to prompt'
    );
  }));

  // Test 3: No-op when disabled
  results.push(await runTest('Emits no-op JSON when disabled', async () => {
    const input = createAgentEvent({
      subagent_type: 'sfdc-cpq-assessor',
      prompt: 'Generate a CPQ assessment report'
    });

    const result = await tester.run({
      input,
      env: {
        CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
        TEMPLATE_INJECTION_ENABLED: '0'
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
    assert.deepStrictEqual(result.output, {}, 'Disabled hook should emit a no-op response');
    assert.strictEqual(result.parseError, null, 'Should not emit invalid stdout');
  }));

  // Summary
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
