#!/usr/bin/env node

/**
 * Integration Tests for Routing Chain
 *
 * Tests the complete routing chain: unified-router → pre-task-agent-validator
 * Verifies end-to-end routing behavior.
 *
 * @copyright 2024-2026 RevPal Partners, LLC
 */

const path = require('path');
const assert = require('assert');

const { HookTester, HookChainTester } = require('../runner');

// =============================================================================
// Test Configuration
// =============================================================================

// From integration/ directory: integration -> hooks -> test -> opspal-core -> plugins -> project-root (5 levels)
const PROJECT_ROOT = path.resolve(__dirname, '../../../../..');
const PLUGIN_ROOT = path.join(PROJECT_ROOT, 'plugins/opspal-core');

const ROUTING_CHAIN = [
  'plugins/opspal-core/hooks/unified-router.sh',
  'plugins/opspal-core/hooks/pre-task-agent-validator.sh'
];

// =============================================================================
// Test Helpers
// =============================================================================

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

function createTaskEvent(toolInput = {}) {
  return {
    tool_name: 'Task',
    tool_input: toolInput
  };
}

// =============================================================================
// Tests
// =============================================================================

async function runAllTests() {
  console.log('\n🧪 Routing Chain Integration Tests\n');

  const results = [];

  // Test 1: Both hooks exist and are valid
  results.push(await runTest('All hooks in chain are valid', async () => {
    for (const hookPath of ROUTING_CHAIN) {
      const tester = new HookTester(hookPath);
      const validation = tester.validate();
      assert(validation.exists, `Hook should exist: ${hookPath}`);
      assert(validation.executable, `Hook should be executable: ${hookPath}`);
      assert(validation.syntaxValid, `Hook should have valid syntax: ${hookPath}`);
    }
  }));

  // Test 2: Chain completes without errors
  results.push(await runTest('Chain completes without errors', async () => {
    const chain = new HookChainTester(ROUTING_CHAIN);

    const result = await chain.run({
      input: {
        userPrompt: 'Run a CPQ assessment for our org'
      },
      env: { CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT }
    });

    assert(result.allPassed, 'All hooks should pass');
    assert.strictEqual(result.executedCount, 2, 'Should execute both hooks');
  }));

  // Test 3: Mandatory merge/dedup operations are fail-closed through chain
  results.push(await runTest('Mandatory merge dedup routing is enforced through chain', async () => {
    const chain = new HookChainTester(ROUTING_CHAIN);

    const result = await chain.run({
      input: {
        userPrompt: 'Merge duplicate Salesforce Accounts for Acme Corp'
      },
      env: { CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT }
    });

    assert(result.allPassed, 'All hooks should pass');
    assert.strictEqual(result.executedCount, 2, 'Should execute both hooks');
    assert.strictEqual(result.results[0]?.output?.decision, 'block', 'Router should enforce decision=block');
    assert.strictEqual(result.results[0]?.output?.metadata?.mandatory, true, 'Router should flag mandatory=true');
    assert.strictEqual(result.results[0]?.output?.metadata?.enforcedBlock, true, 'Router should enforce hard block');
    assert.strictEqual(
      result.results[0]?.output?.metadata?.agent,
      'opspal-salesforce:sfdc-merge-orchestrator',
      'Router should direct to merge orchestrator'
    );
  }));

  // Test 4: Short name resolution works through chain
  results.push(await runTest('Short name resolved through chain', async () => {
    // Run validator directly with short name
    const validator = new HookTester(ROUTING_CHAIN[1]);

    const result = await validator.run({
      input: createTaskEvent({
        subagent_type: 'sfdc-discovery',
        prompt: 'discover org'
      }),
      env: { CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT }
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit 0');

    if (result.output?.hookSpecificOutput?.updatedInput?.subagent_type) {
      assert(
        result.output.hookSpecificOutput.updatedInput.subagent_type.includes(':'),
        'Should resolve to fully-qualified name'
      );
    }
  }));

  // Test 5: Chain handles multiple routing scenarios
  const scenarios = [
    { name: 'CPQ', input: 'sfdc-cpq-assessor' },
    { name: 'RevOps', input: 'sfdc-revops-auditor' },
    { name: 'Discovery', input: 'sfdc-discovery' },
    { name: 'Diagram', input: 'diagram-generator' }
  ];

  for (const scenario of scenarios) {
    results.push(await runTest(`Handles ${scenario.name} routing`, async () => {
      const validator = new HookTester(ROUTING_CHAIN[1]);

      const result = await validator.run({
        input: createTaskEvent({
          subagent_type: scenario.input,
          prompt: `test ${scenario.name}`
        }),
        env: { CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT }
      });

      assert.strictEqual(result.exitCode, 0, `${scenario.name} should exit 0`);
    }));
  }

  // Test 6: Chain handles errors gracefully
  results.push(await runTest('Chain handles non-existent agent gracefully', async () => {
    const validator = new HookTester(ROUTING_CHAIN[1]);

    const result = await validator.run({
      input: createTaskEvent({
        subagent_type: 'completely-fake-agent-xyz-123',
        prompt: 'test'
      }),
      env: { CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT }
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit 0 even on error');
    assert.strictEqual(
      result.output?.hookSpecificOutput?.permissionDecision,
      'deny',
      'Should deny invalid agent invocations'
    );
    assert(
      (result.output?.hookSpecificOutput?.permissionDecisionReason || '').includes('ROUTING_AGENT_NOT_FOUND'),
      'Should indicate agent-not-found error'
    );
  }));

  // Test 7: Chain honors adaptive continue fallback for non-mandatory complexity matches
  results.push(await runTest('Chain allows continue-intent prompt with adaptive fallback enabled', async () => {
    const chain = new HookChainTester(ROUTING_CHAIN);

    const result = await chain.run({
      input: {
        userPrompt: 'Please continue with the CPQ assessment from earlier'
      },
      env: {
        CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
        ROUTING_ADAPTIVE_CONTINUE: '1'
      }
    });

    assert(result.allPassed, 'All hooks should pass');
    assert.strictEqual(result.executedCount, 2, 'Should execute both hooks');
    assert.strictEqual(result.results[0]?.output?.decision, undefined, 'Router should avoid decision=block');
    assert.strictEqual(result.results[0]?.output?.metadata?.adaptiveFallbackApplied, true, 'Router should apply adaptive fallback');
    assert.strictEqual(
      result.results[0]?.output?.metadata?.blockOverrideReason,
      'adaptive_continue_fallback',
      'Router should emit adaptive fallback reason'
    );
  }));

  // Test 8: Chain timing is reasonable
  results.push(await runTest('Chain enforces intake-first in require mode for vague project prompts', async () => {
    const chain = new HookChainTester(ROUTING_CHAIN);

    const result = await chain.run({
      input: {
        userPrompt: 'We need to redesign lead routing in Salesforce with territory-based assignment and approval chains'
      },
      env: {
        CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
        ACTIVE_INTAKE_MODE: 'require'
      }
    });

    assert(result.allPassed, 'All hooks should pass');
    assert.strictEqual(result.executedCount, 2, 'Should execute both hooks');
    assert.strictEqual(result.results[0]?.output?.decision, 'block', 'Router should enforce decision=block');
    assert.strictEqual(result.results[0]?.output?.metadata?.action, 'INTAKE_REQUIRED', 'Router should mark intake required');
    assert.strictEqual(
      result.results[0]?.output?.metadata?.agent,
      'opspal-core:intelligent-intake-orchestrator',
      'Router should direct to intake orchestrator'
    );
  }));

  // Test 9: Chain timing is reasonable
  results.push(await runTest('Chain executes in reasonable time (<2s)', async () => {
    const chain = new HookChainTester(ROUTING_CHAIN);

    const result = await chain.run({
      input: {
        userPrompt: 'Analyze our pipeline and forecast'
      },
      env: { CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT }
    });

    assert(result.totalDuration < 2000, `Chain took ${result.totalDuration}ms, should be <2000ms`);
  }));

  // Summary
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

// Run tests
runAllTests().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
