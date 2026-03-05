#!/usr/bin/env node

/**
 * Unit Tests for unified-router.sh
 *
 * Tests the primary routing logic that determines which agent to use.
 *
 * @copyright 2024-2026 RevPal Partners, LLC
 */

const path = require('path');
const assert = require('assert');

const { HookTester } = require('../runner');

// =============================================================================
// Test Configuration
// =============================================================================

const HOOK_PATH = 'plugins/opspal-core/hooks/unified-router.sh';
// From unit/ directory: unit -> hooks -> test -> opspal-core -> plugins -> project-root (5 levels)
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

// =============================================================================
// Tests
// =============================================================================

async function runAllTests() {
  console.log('\n🧪 unified-router.sh Tests\n');

  const tester = createTester();
  const results = [];

  // Test 1: Hook validation
  results.push(await runTest('Hook exists and is valid', async () => {
    const validation = tester.validate();
    assert(validation.exists, 'Hook file should exist');
    assert(validation.executable, 'Hook should be executable');
    assert(validation.syntaxValid, 'Hook should have valid bash syntax');
  }));

  // Test 2: Basic routing functionality
  results.push(await runTest('Returns valid JSON output', async () => {
    const result = await tester.run({
      input: { userPrompt: 'test prompt' },
      env: { CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT }
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
    // The router should return some form of output
    assert(result.stdout.length > 0, 'Should produce output');
  }));

  // Test 3: CPQ keyword detection should enforce specialist routing without hard-blocking by default
  results.push(await runTest('Routes high-complexity CPQ prompts without hard-blocking by default', async () => {
    const result = await tester.run({
      input: { userPrompt: 'Run a CPQ assessment for our org' },
      env: { CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT }
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0 to preserve structured hook output');
    assert(result.output && typeof result.output === 'object', 'Should return JSON output');
    assert.strictEqual(result.output.decision, undefined, 'Should not emit decision=block by default');
    assert.strictEqual(result.output.metadata?.action, 'BLOCKED', 'Should classify as BLOCKED');
    assert.strictEqual(result.output.metadata?.blocked, true, 'Should still mark blocked=true for routing enforcement');
    assert.strictEqual(result.output.metadata?.enforcedBlock, false, 'Should not enforce hard block by default');
    assert.strictEqual(result.output.metadata?.overrideApplied, false, 'Should not apply override');
    assert.strictEqual(
      result.output.metadata?.agent,
      'opspal-salesforce:sfdc-cpq-assessor',
      'Should recommend CPQ assessor'
    );
  }));

  // Test 4: RevOps keyword detection should also avoid hard block by default
  results.push(await runTest('Routes high-complexity RevOps prompts without hard-blocking by default', async () => {
    const result = await tester.run({
      input: { userPrompt: 'Analyze our pipeline and forecast' },
      env: { CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT }
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0 to preserve structured hook output');
    assert.strictEqual(result.output?.decision, undefined, 'Should not emit decision=block by default');
    assert.strictEqual(result.output?.metadata?.action, 'BLOCKED', 'Should classify as BLOCKED');
    assert.strictEqual(result.output?.metadata?.enforcedBlock, false, 'Should not enforce hard block by default');
  }));

  // Test 5: Merge/dedup operations should be recommendation-only by default
  results.push(await runTest('Keeps mandatory merge routing as non-blocking by default', async () => {
    const result = await tester.run({
      input: { userPrompt: 'Merge duplicate Salesforce Accounts for Acme Corp' },
      env: { CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT }
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0 to preserve structured hook output');
    assert.strictEqual(result.output?.decision, undefined, 'Should not emit decision=block by default');
    assert.strictEqual(result.output?.metadata?.action, 'MANDATORY_BLOCKED', 'Should classify as MANDATORY_BLOCKED');
    assert.strictEqual(result.output?.metadata?.blocked, true, 'Should mark blocked=true');
    assert.strictEqual(result.output?.metadata?.mandatory, true, 'Should mark mandatory=true');
    assert.strictEqual(result.output?.metadata?.enforcedBlock, false, 'Should not enforce hard block by default');
    assert.strictEqual(
      result.output?.metadata?.agent,
      'opspal-salesforce:sfdc-merge-orchestrator',
      'Should recommend merge orchestrator'
    );
  }));

  // Test 6: Legacy mandatory hard-block can be explicitly enabled
  results.push(await runTest('Respects USER_PROMPT_MANDATORY_HARD_BLOCKING=1 for mandatory prompts', async () => {
    const result = await tester.run({
      input: { userPrompt: 'Merge duplicate Salesforce Accounts for Acme Corp' },
      env: {
        CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
        ENABLE_HARD_BLOCKING: '1',
        USER_PROMPT_MANDATORY_HARD_BLOCKING: '1'
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0 to preserve structured hook output');
    assert.strictEqual(result.output?.decision, 'block', 'Should emit decision=block in legacy hard-block mode');
    assert.strictEqual(result.output?.metadata?.action, 'MANDATORY_BLOCKED', 'Should classify as MANDATORY_BLOCKED');
    assert.strictEqual(result.output?.metadata?.blocked, true, 'Should mark blocked=true');
    assert.strictEqual(result.output?.metadata?.mandatory, true, 'Should mark mandatory=true');
    assert.strictEqual(result.output?.metadata?.enforcedBlock, true, 'Should enforce hard block when legacy flag is enabled');
  }));

  // Test 7: Path strings should not trigger mandatory release routing
  results.push(await runTest('Does not hard-block when production/deploy appears only inside a file path', async () => {
    const result = await tester.run({
      input: {
        userPrompt: 'I thought we fixed this pdf issue, the pdf should look similar to this styling C:\\Users\\cnace\\RevPal\\workspace\\orgs\\peregrine\\platforms\\salesforce\\production\\deploy-attribution-ocr'
      },
      env: { CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT }
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
    assert.strictEqual(result.output?.decision, undefined, 'Should not emit decision=block');
    assert.notStrictEqual(result.output?.metadata?.action, 'MANDATORY_BLOCKED', 'Should not classify as mandatory blocked');
  }));

  // Test 8: Empty prompt handling
  results.push(await runTest('Handles empty prompt gracefully', async () => {
    const result = await tester.run({
      input: { userPrompt: '' },
      env: { CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT }
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
  }));

  // Test 9: Vague multi-keyword project prompt should route to active intake
  results.push(await runTest('Routes vague multi-keyword project prompts to intake in recommend mode', async () => {
    const result = await tester.run({
      input: {
        userPrompt: 'I need to audit our automation, check CPQ config, and analyze the pipeline'
      },
      env: { CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT }
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0 to preserve structured hook output');
    assert.strictEqual(result.output?.decision, undefined, 'Should not emit decision=block by default');
    assert.strictEqual(result.output?.metadata?.agent, 'opspal-core:intelligent-intake-orchestrator', 'Should route to intake orchestrator');
    assert.strictEqual(result.output?.metadata?.action, 'RECOMMENDED', 'Should classify as RECOMMENDED');
    assert.strictEqual(result.output?.metadata?.blocked, false, 'Should not mark blocked=true in recommend mode');
    assert.strictEqual(result.output?.metadata?.enforcedBlock, false, 'Should not enforce hard block by default');
    assert.strictEqual(result.output?.metadata?.routingSource, 'intake-gate', 'Should mark intake-gate as routing source');
  }));

  // Test 10: Override token bypasses hard block
  results.push(await runTest('Allows override token to bypass hard block', async () => {
    const result = await tester.run({
      input: { userPrompt: 'Run a CPQ assessment for our org [ROUTING_OVERRIDE]' },
      env: {
        CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
        ENABLE_COMPLEXITY_HARD_BLOCKING: '1'
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
    assert.strictEqual(result.output?.decision, undefined, 'Should not emit decision=block when override is applied');
    assert.strictEqual(result.output?.metadata?.blocked, true, 'Should still classify as blocked');
    assert.strictEqual(result.output?.metadata?.enforcedBlock, false, 'Should not enforce hard block');
    assert.strictEqual(result.output?.metadata?.overrideApplied, true, 'Should mark override applied');
  }));

  // Test 11: Complexity hard-block can be explicitly enabled
  results.push(await runTest('Respects ENABLE_COMPLEXITY_HARD_BLOCKING=1', async () => {
    const result = await tester.run({
      input: { userPrompt: 'Run a CPQ assessment for our org' },
      env: {
        CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
        ENABLE_COMPLEXITY_HARD_BLOCKING: '1'
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
    assert.strictEqual(result.output?.decision, 'block', 'Should emit decision=block when hard blocking is enabled');
    assert.strictEqual(result.output?.metadata?.blocked, true, 'Should still classify as blocked');
    assert.strictEqual(result.output?.metadata?.enforcedBlock, true, 'Should enforce hard block when explicitly enabled');
  }));

  // Test 12: Permission-set field updates should route without hard-blocking
  results.push(await runTest('Routes permission-set field maintenance prompts as recommended', async () => {
    const result = await tester.run({
      input: { userPrompt: 'Add all new fields to the Account Taxonomy Permission Set' },
      env: { CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT }
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
    assert.strictEqual(result.output?.decision, undefined, 'Should not emit decision=block');
    assert.strictEqual(result.output?.metadata?.agent, 'opspal-salesforce:sfdc-permission-orchestrator', 'Should route to permission orchestrator');
    assert.strictEqual(result.output?.metadata?.action, 'RECOMMENDED', 'Should classify as RECOMMENDED');
    assert.strictEqual(result.output?.metadata?.blocked, false, 'Should not classify as blocked');
    assert.strictEqual(result.output?.metadata?.enforcedBlock, false, 'Should not enforce hard block');
  }));

  // Test 13: Adaptive continue fallback softens non-mandatory complexity blocks
  results.push(await runTest('Allows continue-intent prompt to proceed with ROUTING_ADAPTIVE_CONTINUE=1', async () => {
    const result = await tester.run({
      input: { userPrompt: 'Please continue with the CPQ assessment from earlier' },
      env: {
        CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
        ROUTING_ADAPTIVE_CONTINUE: '1'
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
    assert.strictEqual(result.output?.decision, undefined, 'Should not emit decision=block');
    assert.strictEqual(result.output?.metadata?.blocked, true, 'Should still classify as blocked');
    assert.strictEqual(result.output?.metadata?.enforcedBlock, false, 'Should not enforce hard block');
    assert.strictEqual(
      result.output?.metadata?.blockOverrideReason,
      'adaptive_continue_fallback',
      'Should surface adaptive fallback reason'
    );
    assert.strictEqual(result.output?.metadata?.adaptiveFallbackApplied, true, 'Should mark adaptive fallback applied');
  }));

  // Test 14: Vague project prompts should be blocked in require mode and sent to intake first
  results.push(await runTest('Blocks vague project prompts in ACTIVE_INTAKE_MODE=require', async () => {
    const result = await tester.run({
      input: { userPrompt: 'We need to redesign lead routing in Salesforce with territory-based assignment and approval chains' },
      env: {
        CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
        ACTIVE_INTAKE_MODE: 'require'
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
    assert.strictEqual(result.output?.decision, 'block', 'Should emit decision=block');
    assert.strictEqual(result.output?.metadata?.action, 'INTAKE_REQUIRED', 'Should classify as INTAKE_REQUIRED');
    assert.strictEqual(result.output?.metadata?.agent, 'opspal-core:intelligent-intake-orchestrator', 'Should route to intake orchestrator');
    assert.strictEqual(result.output?.metadata?.intakeRequired, true, 'Should mark intakeRequired=true');
    assert.strictEqual(result.output?.metadata?.enforcedBlock, true, 'Should enforce hard block for intake gating');
    assert.strictEqual(result.output?.metadata?.routingSource, 'intake-gate', 'Should use intake-gate source');
  }));

  // Test 15: Continue-intent still blocks when hard blocking is explicitly enabled and adaptive mode is disabled
  results.push(await runTest('Keeps hard block for continue-intent prompt when adaptive mode is disabled and hard blocking is enabled', async () => {
    const result = await tester.run({
      input: { userPrompt: 'Please continue with the CPQ assessment from earlier' },
      env: {
        CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
        ENABLE_COMPLEXITY_HARD_BLOCKING: '1'
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
    assert.strictEqual(result.output?.decision, 'block', 'Should emit decision=block');
    assert.strictEqual(result.output?.metadata?.enforcedBlock, true, 'Should enforce hard block');
    assert.notStrictEqual(
      result.output?.metadata?.blockOverrideReason,
      'adaptive_continue_fallback',
      'Should not apply adaptive fallback by default'
    );
  }));

  // Test 16: Require mode should not block clear specialist prompts that have adequate detail
  results.push(await runTest('Does not force intake in require mode for clear specialist prompts', async () => {
    const result = await tester.run({
      input: {
        userPrompt: 'Run a CPQ assessment for our org'
      },
      env: {
        CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
        ACTIVE_INTAKE_MODE: 'require'
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
    assert.notStrictEqual(result.output?.metadata?.action, 'INTAKE_REQUIRED', 'Should not classify as INTAKE_REQUIRED');
    assert.strictEqual(result.output?.metadata?.agent, 'opspal-salesforce:sfdc-cpq-assessor', 'Should keep specialist routing');
  }));

  // Test 17: Transcript payload should extract latest user intent and avoid noisy misroutes
  results.push(await runTest('Extracts latest user intent from transcript-style payload', async () => {
    const result = await tester.run({
      input: {
        message: `UserPromptSubmit operation blocked by hook:
High-complexity routing enforcement: use Task(subagent_type='opspal-salesforce:sfdc-permission-orchestrator') before proceeding.
Original prompt: Please continue - looks like the last session hanged
@metadata-manager❯ Acknowledged, standing by for Task #6
Build FM territory name stamping flow › blocked by #3, #4`
      },
      env: { CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT }
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
    assert.strictEqual(result.output?.decision, undefined, 'Should not emit decision=block');
    const normalizedPreview = result.output?.metadata?.normalizedMessagePreview || '';
    if (normalizedPreview) {
      assert(
        normalizedPreview.toLowerCase().includes('please continue'),
        'Should normalize to the latest user intent line'
      );
    } else {
      assert.deepStrictEqual(result.output, {}, 'Should allow direct execution when normalization removes noisy routing keywords');
    }
  }));

  // Test 18: Mandatory routes stay non-adaptive and recommendation-only by default
  results.push(await runTest('Keeps mandatory routing non-adaptive and non-blocking in adaptive mode by default', async () => {
    const result = await tester.run({
      input: { userPrompt: 'Please continue and merge duplicate Salesforce Accounts for Acme Corp' },
      env: {
        CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
        ROUTING_ADAPTIVE_CONTINUE: '1'
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
    assert.strictEqual(result.output?.decision, undefined, 'Should not emit decision=block by default');
    assert.strictEqual(result.output?.metadata?.mandatory, true, 'Should remain mandatory');
    assert.strictEqual(result.output?.metadata?.enforcedBlock, false, 'Should not enforce hard block by default');
    assert.notStrictEqual(
      result.output?.metadata?.blockOverrideReason,
      'adaptive_continue_fallback',
      'Should not apply adaptive fallback to mandatory routing'
    );
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
