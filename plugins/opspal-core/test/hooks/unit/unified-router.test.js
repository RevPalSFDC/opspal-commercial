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
const fs = require('fs');
const os = require('os');

const { HookTester } = require('../runner');

// =============================================================================
// Test Configuration
// =============================================================================

const HOOK_PATH = 'plugins/opspal-core/hooks/unified-router.sh';
const PRETOOL_HOOK_PATH = 'plugins/opspal-core/hooks/pre-tool-use-contract-validation.sh';
// From unit/ directory: unit -> hooks -> test -> opspal-core -> plugins -> project-root (5 levels)
const PROJECT_ROOT = path.resolve(__dirname, '../../../../..');
const PLUGIN_ROOT = path.join(PROJECT_ROOT, 'plugins/opspal-core');
const { sanitizeSessionKey } = require(path.join(PLUGIN_ROOT, 'scripts/lib/routing-state-manager.js'));

// =============================================================================
// Test Helpers
// =============================================================================

function createTester() {
  return new HookTester(HOOK_PATH, {
    timeout: 15000,
    verbose: process.env.VERBOSE === '1'
  });
}

function createIsolatedEnv(extra = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'router-hook-home-'));
  const sessionId = `router-session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  return {
    CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
    HOME: home,
    CLAUDE_SESSION_ID: sessionId,
    USER_PROMPT_MANDATORY_HARD_BLOCKING: '0',
    ENABLE_COMPLEXITY_HARD_BLOCKING: '0',
    ...extra
  };
}

function readRoutingState(env) {
  const filePath = path.join(
    env.HOME,
    '.claude',
    'routing-state',
    `${sanitizeSessionKey(env.CLAUDE_SESSION_ID)}.json`
  );
  if (!fs.existsSync(filePath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function assertPendingExecutionRoute(state, expectedAgent) {
  assert(state, 'Should persist routing state');
  assert.strictEqual(state.required_agent, expectedAgent, 'Should persist the required specialist');
  assert.strictEqual(state.route_pending_clearance, true, 'Should keep the route pending');
  assert.strictEqual(state.execution_block_until_cleared, true, 'Should keep the execution gate active');
  assert.strictEqual(state.prompt_blocked, false, 'Prompt-time routing should remain non-blocking');
}

function assertComplexitySpecialistRoute(metadata, message) {
  assert.strictEqual(metadata?.routeKind, 'complexity_specialist', `${message} should use the complexity specialist route kind`);
  assert.strictEqual(metadata?.guidanceAction, 'require_specialist', `${message} should require the specialist explicitly`);
}

function assertMandatorySpecialistRoute(metadata, message) {
  assert.strictEqual(metadata?.routeKind, 'mandatory_specialist', `${message} should use the mandatory specialist route kind`);
  assert.strictEqual(metadata?.guidanceAction, 'require_specialist', `${message} should require the mandatory specialist explicitly`);
}

function assertAdvisorySpecialistRoute(metadata, message) {
  assert.strictEqual(metadata?.routeKind, 'advisory_specialist', `${message} should remain advisory`);
  assert.strictEqual(metadata?.guidanceAction, 'recommend_specialist', `${message} should only recommend the specialist`);
}

function assertIntakeSpecialistRoute(metadata, message) {
  assert.strictEqual(metadata?.routeKind, 'intake_specialist', `${message} should use the intake specialist route kind`);
  assert.strictEqual(metadata?.guidanceAction, 'require_intake', `${message} should require intake explicitly`);
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
  const pretoolTester = new HookTester(PRETOOL_HOOK_PATH, {
    timeout: 15000,
    verbose: process.env.VERBOSE === '1'
  });
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
    const env = createIsolatedEnv();
    const result = await tester.run({
      input: { userPrompt: 'test prompt' },
      env
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
    // The router should return some form of output
    assert(result.stdout.length > 0, 'Should produce output');
    assert.strictEqual(readRoutingState(env), null, 'Should not persist routing state for non-blocking prompts');
  }));

  // Test 3: CPQ keyword detection should enforce specialist routing without hard-blocking by default
  results.push(await runTest('Routes high-complexity CPQ prompts without hard-blocking by default', async () => {
    const env = createIsolatedEnv();
    const result = await tester.run({
      input: { userPrompt: 'Run a CPQ assessment for our org' },
      env
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0 to preserve structured hook output');
    assert(result.output && typeof result.output === 'object', 'Should return JSON output');
    assert.strictEqual(result.output.decision, undefined, 'Should not emit decision=block by default');
    assertComplexitySpecialistRoute(result.output.metadata, 'CPQ routing');
    assert.strictEqual(result.output.metadata?.executionBlockUntilCleared, true, 'Should still gate execution-time routing');
    assert.strictEqual(result.output.metadata?.promptBlocked, false, 'Should not prompt-block by default');
    assert.strictEqual(result.output.metadata?.overrideApplied, false, 'Should not apply override');
    assert.strictEqual(
      result.output.metadata?.suggestedAgent,
      'opspal-salesforce:sfdc-cpq-assessor',
      'Should recommend CPQ assessor'
    );
    assertPendingExecutionRoute(readRoutingState(env), 'opspal-salesforce:sfdc-cpq-assessor');
  }));

  results.push(await runTest('Prefers specific dashboard creation routing over broad pipeline audit keywords', async () => {
    const env = createIsolatedEnv();
    const result = await tester.run({
      input: { userPrompt: 'Create a Salesforce dashboard for executive pipeline visibility' },
      env
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0 to preserve structured hook output');
    assertComplexitySpecialistRoute(result.output?.metadata, 'Dashboard creation routing');
    assert.strictEqual(
      result.output?.metadata?.suggestedAgent,
      'opspal-salesforce:sfdc-reports-dashboards',
      'Dashboard creation should route to the reports and dashboards specialist'
    );
    assertPendingExecutionRoute(readRoutingState(env), 'opspal-salesforce:sfdc-reports-dashboards');
  }));

  // Test 4: RevOps keyword detection should also avoid hard block by default
  results.push(await runTest('Routes high-complexity RevOps prompts without hard-blocking by default', async () => {
    const env = createIsolatedEnv();
    const result = await tester.run({
      input: { userPrompt: 'Analyze our pipeline and forecast' },
      env
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0 to preserve structured hook output');
    assert.strictEqual(result.output?.decision, undefined, 'Should not emit decision=block by default');
    assertComplexitySpecialistRoute(result.output?.metadata, 'RevOps routing');
    assert.strictEqual(result.output?.metadata?.promptBlocked, false, 'Should not enforce prompt-time hard blocking');
  }));

  // Test 5: Merge/dedup operations should be recommendation-only by default
  results.push(await runTest('Keeps mandatory merge routing as non-blocking by default', async () => {
    const env = createIsolatedEnv();
    const result = await tester.run({
      input: { userPrompt: 'Merge duplicate Salesforce Accounts for Acme Corp' },
      env
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0 to preserve structured hook output');
    assert.strictEqual(result.output?.decision, undefined, 'Should not emit decision=block by default');
    assertMandatorySpecialistRoute(result.output?.metadata, 'Mandatory merge routing');
    assert.strictEqual(result.output?.metadata?.executionBlockUntilCleared, true, 'Should gate execution-time routing');
    assert.strictEqual(result.output?.metadata?.promptBlocked, false, 'Should not enforce prompt-time hard blocking');
    assert.strictEqual(
      result.output?.metadata?.suggestedAgent,
      'opspal-salesforce:sfdc-merge-orchestrator',
      'Should recommend merge orchestrator'
    );
    assert.strictEqual(result.output?.metadata?.autoDelegationEligible, true, 'Mandatory merge route should stage auto-delegation');
  }));

  // Test 6: Legacy mandatory hard-block env no longer rejects prompt submission
  results.push(await runTest('Suppresses USER_PROMPT_MANDATORY_HARD_BLOCKING=1 into downstream routing enforcement', async () => {
    const env = createIsolatedEnv({
      USER_PROMPT_MANDATORY_HARD_BLOCKING: '1'
    });
    const result = await tester.run({
      input: { userPrompt: 'Merge duplicate Salesforce Accounts for Acme Corp' },
      env
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0 to preserve structured hook output');
    assert.strictEqual(result.output?.decision, undefined, 'Should not emit decision=block for routing-only enforcement');
    assertMandatorySpecialistRoute(result.output?.metadata, 'Legacy hard-block suppression');
    assert.strictEqual(result.output?.metadata?.executionBlockUntilCleared, true, 'Should keep downstream execution gating');
    assert.strictEqual(result.output?.metadata?.promptBlocked, false, 'Should keep prompt submission non-blocking');
    assert.strictEqual(result.output?.metadata?.legacyPromptBlockRequested, true, 'Should surface legacy block request telemetry');
    assert.strictEqual(result.output?.metadata?.legacyPromptBlockSuppressed, true, 'Should surface suppressed prompt-block telemetry');
    assert.strictEqual(readRoutingState(env)?.route_pending_clearance, true, 'Should still persist pending specialist routing');
  }));

  // Test 7: Path strings should not trigger mandatory release routing
  results.push(await runTest('Does not hard-block when production/deploy appears only inside a file path', async () => {
    const env = createIsolatedEnv();
    const result = await tester.run({
      input: {
        userPrompt: 'I thought we fixed this pdf issue, the pdf should look similar to this styling C:\\Users\\cnace\\RevPal\\workspace\\orgs\\peregrine\\platforms\\salesforce\\production\\deploy-attribution-ocr'
      },
      env
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
    assert.strictEqual(result.output?.decision, undefined, 'Should not emit decision=block');
    assert.notStrictEqual(result.output?.metadata?.routeKind, 'mandatory_specialist', 'Should not classify as mandatory specialist routing');
  }));

  // Test 8: Empty prompt handling
  results.push(await runTest('Handles empty prompt gracefully', async () => {
    const env = createIsolatedEnv();
    const result = await tester.run({
      input: { userPrompt: '' },
      env
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
  }));

  // Test 9: Vague multi-keyword project prompt should route to active intake
  results.push(await runTest('Routes vague multi-keyword project prompts to intake in recommend mode', async () => {
    const env = createIsolatedEnv();
    const result = await tester.run({
      input: {
        userPrompt: 'I need to audit our automation, check CPQ config, and analyze the pipeline'
      },
      env
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0 to preserve structured hook output');
    assert.strictEqual(result.output?.decision, undefined, 'Should not emit decision=block by default');
    assert.strictEqual(result.output?.metadata?.suggestedAgent, 'opspal-core:intelligent-intake-orchestrator', 'Should route to intake orchestrator');
    assertAdvisorySpecialistRoute(result.output?.metadata, 'Recommend-mode intake routing');
    assert.strictEqual(result.output?.metadata?.executionBlockUntilCleared, false, 'Should remain guidance-only in recommend mode');
    assert.strictEqual(result.output?.metadata?.promptBlocked, false, 'Should not enforce hard block by default');
    assert.strictEqual(result.output?.metadata?.routingSource, 'intake-gate', 'Should mark intake-gate as routing source');
  }));

  // Test 10: Override token bypasses hard block
  results.push(await runTest('Allows override token to bypass hard block', async () => {
    const env = createIsolatedEnv({
      ENABLE_COMPLEXITY_HARD_BLOCKING: '1'
    });
    const result = await tester.run({
      input: { userPrompt: 'Run a CPQ assessment for our org [ROUTING_OVERRIDE]' },
      env
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
    assert.strictEqual(result.output?.decision, undefined, 'Should not emit decision=block when override is applied');
    assert.strictEqual(result.output?.metadata?.executionBlockUntilCleared, false, 'Override should disable execution gating');
    assert.strictEqual(result.output?.metadata?.promptBlocked, false, 'Should not enforce prompt-time hard block');
    assert.strictEqual(result.output?.metadata?.overrideApplied, true, 'Should mark override applied');
    const routingState = readRoutingState(env);
    assert(routingState, 'Should persist bypass telemetry');
    assert.strictEqual(routingState.clearance_status, 'bypassed', 'Should mark override state as bypassed');
  }));

  // Test 11: Complexity hard-block env is suppressed into downstream enforcement
  results.push(await runTest('Suppresses ENABLE_COMPLEXITY_HARD_BLOCKING=1 into downstream routing enforcement', async () => {
    const env = createIsolatedEnv({
      ENABLE_COMPLEXITY_HARD_BLOCKING: '1'
    });
    const result = await tester.run({
      input: { userPrompt: 'Run a CPQ assessment for our org' },
      env
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
    assert.strictEqual(result.output?.decision, undefined, 'Should not emit decision=block for routing-only enforcement');
    assert.strictEqual(result.output?.metadata?.executionBlockUntilCleared, true, 'Should still classify as execution-gated');
    assert.strictEqual(result.output?.metadata?.promptBlocked, false, 'Should keep prompt submission non-blocking');
    assert.strictEqual(result.output?.metadata?.legacyPromptBlockRequested, true, 'Should record legacy hard-block request');
    assert.strictEqual(result.output?.metadata?.legacyPromptBlockSuppressed, true, 'Should suppress user-visible prompt blocking');
  }));

  results.push(await runTest('Suppresses ENABLE_INTAKE_HARD_BLOCKING=1 into downstream intake enforcement', async () => {
    const env = createIsolatedEnv({
      ACTIVE_INTAKE_MODE: 'require',
      ENABLE_INTAKE_HARD_BLOCKING: '1'
    });
    const result = await tester.run({
      input: { userPrompt: 'We need to redesign lead routing in Salesforce with territory-based assignment and approval chains' },
      env
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
    assert.strictEqual(result.output?.decision, undefined, 'Should not emit decision=block for intake routing');
    assertIntakeSpecialistRoute(result.output?.metadata, 'Legacy intake hard-block suppression');
    assert.strictEqual(result.output?.metadata?.promptBlocked, false, 'Should keep prompt submission non-blocking');
    assert.strictEqual(result.output?.metadata?.legacyPromptBlockRequested, true, 'Should record legacy intake block request');
    assert.strictEqual(result.output?.metadata?.legacyPromptBlockSuppressed, true, 'Should suppress user-visible prompt blocking');
    assert.strictEqual(readRoutingState(env)?.route_pending_clearance, true, 'Should still persist pending intake route');
  }));

  // Test 12: Permission-set field updates should route without hard-blocking
  results.push(await runTest('Routes permission-set field maintenance prompts as recommended', async () => {
    const env = createIsolatedEnv();
    const result = await tester.run({
      input: { userPrompt: 'Add all new fields to the Account Taxonomy Permission Set' },
      env
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
    assert.strictEqual(result.output?.decision, undefined, 'Should not emit decision=block');
    assert.strictEqual(result.output?.metadata?.suggestedAgent, 'opspal-salesforce:sfdc-permission-orchestrator', 'Should route to permission orchestrator');
    assertAdvisorySpecialistRoute(result.output?.metadata, 'Permission-set maintenance routing');
    assert.strictEqual(result.output?.metadata?.executionBlockUntilCleared, false, 'Should not classify as execution-gated');
    assert.strictEqual(result.output?.metadata?.promptBlocked, false, 'Should not enforce hard block');
    assert.strictEqual(readRoutingState(env), null, 'Recommended routes should stay advisory and not persist pending state');
  }));

  results.push(await runTest('Routes permission/security write prompts through the mandatory canonical specialist path', async () => {
    const env = createIsolatedEnv();
    const result = await tester.run({
      input: { userPrompt: 'Create a new permission set with FLS in Salesforce for account fields' },
      env
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
    assert.strictEqual(result.output?.metadata?.suggestedAgent, 'opspal-salesforce:sfdc-permission-orchestrator', 'Should route to the canonical permission orchestrator');
    assertMandatorySpecialistRoute(result.output?.metadata, 'Permission/security write routing');
    assert.strictEqual(result.output?.metadata?.autoDelegationEligible, true, 'Permission/security write routing should stage the auto-delegation bridge');
    assertPendingExecutionRoute(readRoutingState(env), 'opspal-salesforce:sfdc-permission-orchestrator');
  }));

  results.push(await runTest('Routes Fireflies transcript analysis prompts to the meeting intelligence specialist', async () => {
    const env = createIsolatedEnv();
    const result = await tester.run({
      input: { userPrompt: 'Fetch Fireflies transcripts and extract action items from last week' },
      env
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
    assert.strictEqual(
      result.output?.metadata?.suggestedAgent,
      'opspal-core:fireflies-meeting-intelligence-agent',
      'Should route read-only Fireflies transcript work to the meeting intelligence agent'
    );
    assertAdvisorySpecialistRoute(result.output?.metadata, 'Fireflies transcript analysis');
  }));

  results.push(await runTest('Routes implicit meeting transcript action-item prompts to Fireflies meeting intelligence', async () => {
    const env = createIsolatedEnv();
    const result = await tester.run({
      input: { userPrompt: 'Review the meeting transcript and identify action items with owners' },
      env
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
    assert.strictEqual(
      result.output?.metadata?.suggestedAgent,
      'opspal-core:fireflies-meeting-intelligence-agent',
      'Implicit transcript analysis should route to the meeting intelligence specialist'
    );
    assertAdvisorySpecialistRoute(result.output?.metadata, 'Implicit transcript analysis');
  }));

  results.push(await runTest('Routes combined Gong and Fireflies requests to the conversation intelligence aggregator', async () => {
    const env = createIsolatedEnv();
    const result = await tester.run({
      input: { userPrompt: 'Combine Gong and Fireflies transcripts for cross-platform meeting analysis' },
      env
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
    assert.strictEqual(
      result.output?.metadata?.suggestedAgent,
      'opspal-core:conversation-intelligence-aggregator',
      'Should route multi-platform conversation intelligence work to the aggregator'
    );
    assertAdvisorySpecialistRoute(result.output?.metadata, 'Cross-platform transcript analysis');
  }));

  results.push(await runTest('Routes Gong deal-risk prompts to the Gong specialist instead of generic pipeline intelligence', async () => {
    const env = createIsolatedEnv();
    const result = await tester.run({
      input: { userPrompt: 'Review the Gong call and surface deal risk for this opportunity' },
      env
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
    assert.strictEqual(
      result.output?.metadata?.suggestedAgent,
      'opspal-core:gong-deal-intelligence-agent',
      'Gong prompts should prefer the Gong specialist'
    );
  }));

  results.push(await runTest('Routes Salesforce org inspection prompts to state discovery', async () => {
    const env = createIsolatedEnv();
    const result = await tester.run({
      input: { userPrompt: 'Inspect the Salesforce org schema and describe objects before we make changes' },
      env
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
    assert.strictEqual(
      result.output?.metadata?.suggestedAgent,
      'opspal-salesforce:sfdc-state-discovery',
      'Should route schema inspection to state discovery'
    );
    assertAdvisorySpecialistRoute(result.output?.metadata, 'Schema inspection');
  }));

  results.push(await runTest('Routes Salesforce implementation planning prompts to the planner specialist', async () => {
    const env = createIsolatedEnv();
    const result = await tester.run({
      input: { userPrompt: 'Plan a Salesforce implementation rollout for lead assignment and approvals' },
      env
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
    assert.strictEqual(
      result.output?.metadata?.suggestedAgent,
      'opspal-salesforce:sfdc-planner',
      'Should route implementation planning to the planner specialist'
    );
    assertAdvisorySpecialistRoute(result.output?.metadata, 'Implementation planning');
  }));

  results.push(await runTest('Routes field usage audits to the field analyzer specialist', async () => {
    const env = createIsolatedEnv();
    const result = await tester.run({
      input: { userPrompt: 'Run a pricing field usage audit and analyze validation dependencies in Salesforce' },
      env
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
    assert.strictEqual(
      result.output?.metadata?.suggestedAgent,
      'opspal-salesforce:sfdc-field-analyzer',
      'Should route field usage analysis to the field analyzer specialist'
    );
    assert.strictEqual(result.output?.decision, undefined, 'Field analysis should remain advisory at prompt time');
    assert.strictEqual(result.output?.metadata?.promptBlocked, false, 'Field analysis should not be prompt-blocked');
  }));

  results.push(await runTest('Routes Salesforce data quality audits to the quality auditor specialist', async () => {
    const env = createIsolatedEnv();
    const result = await tester.run({
      input: { userPrompt: 'Audit data quality issues across Salesforce objects and orphan contacts' },
      env
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
    assert.strictEqual(
      result.output?.metadata?.suggestedAgent,
      'opspal-salesforce:sfdc-quality-auditor',
      'Salesforce data quality audits should route to the quality auditor'
    );
    assertAdvisorySpecialistRoute(result.output?.metadata, 'Data quality audit routing');
  }));

  results.push(await runTest('Routes HubSpot workflow audit prompts to the workflow auditor specialist', async () => {
    const env = createIsolatedEnv();
    const result = await tester.run({
      input: { userPrompt: 'Audit a HubSpot workflow and identify automation issues' },
      env
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
    assert.strictEqual(
      result.output?.metadata?.suggestedAgent,
      'opspal-hubspot:hubspot-workflow-auditor',
      'Workflow audit prompts should prefer the auditor over the builder'
    );
  }));

  results.push(await runTest('Downgrades procedural specialist requests to recommended routing', async () => {
    const env = createIsolatedEnv({
      ENABLE_HARD_BLOCKING: '1',
      ENABLE_COMPLEXITY_HARD_BLOCKING: '1'
    });
    const result = await tester.run({
      input: { userPrompt: 'Write a step-by-step runbook for a CPQ assessment in our org' },
      env
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
    assert.strictEqual(result.output?.decision, undefined, 'Should not emit decision=block for procedural requests');
    assert.strictEqual(result.output?.metadata?.suggestedAgent, 'opspal-salesforce:sfdc-cpq-assessor', 'Should keep the specialist recommendation');
    assertAdvisorySpecialistRoute(result.output?.metadata, 'Procedural specialist routing');
    assert.strictEqual(result.output?.metadata?.executionBlockUntilCleared, false, 'Procedural requests should not remain execution-gated');
    assert.strictEqual(result.output?.metadata?.proceduralRequest, true, 'Should mark procedural intent');
    assert.strictEqual(readRoutingState(env), null, 'Procedural requests should not persist pending routing state');
  }));

  results.push(await runTest('Avoids GTM market-intelligence false positives from SOM substring matches', async () => {
    const env = createIsolatedEnv({
      ENABLE_HARD_BLOCKING: '1',
      ENABLE_COMPLEXITY_HARD_BLOCKING: '1'
    });
    const result = await tester.run({
      input: {
        userPrompt: 'I\'d imagine we should change our current working directory to /home/chris/Desktop/RevPal/Agents/opspal-release/ as to not accidently do something in this directory. I need you to develop a plan to address the operational gap with encryptions as updates are made'
      },
      env
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
    assert.strictEqual(result.output?.decision, undefined, 'Should not emit decision=block');
    assert.notStrictEqual(
      result.output?.metadata?.suggestedAgent,
      'opspal-gtm-planning:gtm-market-intelligence',
      'Should not route generic planning prompts to GTM market intelligence'
    );
    assert.notStrictEqual(result.output?.metadata?.routeKind, 'complexity_specialist', 'Should not classify the prompt as execution-gated complexity routing');
    assert.strictEqual(readRoutingState(env), null, 'False-positive prompt should not persist pending routing state');
  }));

  // Test 13: Adaptive continue fallback softens non-mandatory complexity blocks
  results.push(await runTest('Allows continue-intent prompt to proceed with ROUTING_ADAPTIVE_CONTINUE=1', async () => {
    const env = createIsolatedEnv({
      ROUTING_ADAPTIVE_CONTINUE: '1'
    });
    const result = await tester.run({
      input: { userPrompt: 'Please continue with the CPQ assessment from earlier' },
      env
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
    assert.strictEqual(result.output?.decision, undefined, 'Should not emit decision=block');
    assert.strictEqual(result.output?.metadata?.executionBlockUntilCleared, true, 'Should still classify as execution-gated');
    assert.strictEqual(result.output?.metadata?.promptBlocked, false, 'Should not enforce hard block');
    assert.strictEqual(
      result.output?.metadata?.blockOverrideReason,
      'adaptive_continue_fallback',
      'Should surface adaptive fallback reason'
    );
    assert.strictEqual(result.output?.metadata?.adaptiveFallbackApplied, true, 'Should mark adaptive fallback applied');
  }));

  // Test 14: Vague project prompts should require intake-first routing in require mode
  results.push(await runTest('Requires intake-first routing in ACTIVE_INTAKE_MODE=require', async () => {
    const env = createIsolatedEnv({
      ACTIVE_INTAKE_MODE: 'require'
    });
    const result = await tester.run({
      input: { userPrompt: 'We need to redesign lead routing in Salesforce with territory-based assignment and approval chains' },
      env
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
    assert.strictEqual(result.output?.decision, undefined, 'Should avoid prompt-time hard block by default');
    assertIntakeSpecialistRoute(result.output?.metadata, 'Require-mode intake routing');
    assert.strictEqual(result.output?.metadata?.suggestedAgent, 'opspal-core:intelligent-intake-orchestrator', 'Should route to intake orchestrator');
    assert.strictEqual(result.output?.metadata?.intakeRequired, true, 'Should mark intakeRequired=true');
    assert.strictEqual(result.output?.metadata?.promptBlocked, false, 'Should leave prompt blocking disabled by default');
    assert.strictEqual(result.output?.metadata?.intakeGateApplied, true, 'Should mark intake gating as applied');
    assert.strictEqual(result.output?.metadata?.routingSource, 'intake-gate', 'Should use intake-gate source');
    assert.strictEqual(readRoutingState(env)?.route_pending_clearance, true, 'Should persist pending routing state for PreToolUse enforcement');
  }));

  // Test 15: Continue-intent still avoids prompt rejection even with legacy hard-block env
  results.push(await runTest('Keeps continue-intent prompt non-blocking when legacy hard-block env is enabled', async () => {
    const env = createIsolatedEnv({
      ENABLE_COMPLEXITY_HARD_BLOCKING: '1'
    });
    const result = await tester.run({
      input: { userPrompt: 'Please continue with the CPQ assessment from earlier' },
      env
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
    assert.strictEqual(result.output?.decision, undefined, 'Should not emit decision=block');
    assert.strictEqual(result.output?.metadata?.promptBlocked, false, 'Should keep prompt submission non-blocking');
    assert.strictEqual(result.output?.metadata?.legacyPromptBlockRequested, true, 'Should record legacy block request');
    assert.strictEqual(result.output?.metadata?.legacyPromptBlockSuppressed, true, 'Should suppress user-visible prompt blocking');
    assert.notStrictEqual(
      result.output?.metadata?.blockOverrideReason,
      'adaptive_continue_fallback',
      'Should not apply adaptive fallback by default'
    );
  }));

  // Test 16: Require mode should not block clear specialist prompts that have adequate detail
  results.push(await runTest('Does not force intake in require mode for clear specialist prompts', async () => {
    const env = createIsolatedEnv({
      ACTIVE_INTAKE_MODE: 'require'
    });
    const result = await tester.run({
      input: {
        userPrompt: 'Run a CPQ assessment for our org'
      },
      env
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
    assert.notStrictEqual(result.output?.metadata?.routeKind, 'intake_specialist', 'Should not classify as intake routing');
    assert.strictEqual(result.output?.metadata?.suggestedAgent, 'opspal-salesforce:sfdc-cpq-assessor', 'Should keep specialist routing');
  }));

  // Test 17: Transcript payload should extract latest user intent and avoid noisy misroutes
  results.push(await runTest('Extracts latest user intent from transcript-style payload', async () => {
    const env = createIsolatedEnv();
    const result = await tester.run({
      input: {
        message: `UserPromptSubmit operation blocked by hook:
High-complexity routing enforcement: use Agent(subagent_type='opspal-salesforce:sfdc-permission-orchestrator') before proceeding.
Original prompt: Please continue - looks like the last session hanged
@metadata-manager❯ Acknowledged, standing by for Task #6
Build FM territory name stamping flow › blocked by #3, #4`
      },
      env
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
    const env = createIsolatedEnv({
      ROUTING_ADAPTIVE_CONTINUE: '1'
    });
    const result = await tester.run({
      input: { userPrompt: 'Please continue and merge duplicate Salesforce Accounts for Acme Corp' },
      env
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
    assert.strictEqual(result.output?.decision, undefined, 'Should not emit decision=block by default');
    assert.strictEqual(result.output?.metadata?.routeKind, 'mandatory_specialist', 'Should remain mandatory');
    assert.strictEqual(result.output?.metadata?.promptBlocked, false, 'Should not enforce hard block by default');
    assert.notStrictEqual(
      result.output?.metadata?.blockOverrideReason,
      'adaptive_continue_fallback',
      'Should not apply adaptive fallback to mandatory routing'
    );
  }));

  results.push(await runTest('Keeps prior pending routing state on non-blocking follow-up prompts', async () => {
    const env = createIsolatedEnv();

    const first = await tester.run({
      input: { userPrompt: 'Run a CPQ assessment for our org' },
      env
    });
    assert.strictEqual(first.exitCode, 0, 'Initial blocking prompt should succeed');
    assert(readRoutingState(env), 'Should persist state after blocking prompt');

    const second = await tester.run({
      input: { userPrompt: 'What time is it?' },
      env
    });
    assert.strictEqual(second.exitCode, 0, 'Follow-up prompt should succeed');

    const routingState = readRoutingState(env);
    assert(routingState, 'Non-blocking follow-up should preserve pending routing state');
    assert.strictEqual(routingState.route_pending_clearance, true, 'Pending route should remain unresolved after harmless follow-up');

    const blockedDirect = await pretoolTester.run({
      input: {
        tool: 'Bash',
        sessionKey: env.CLAUDE_SESSION_ID,
        input: { command: 'echo "still gated"' }
      },
      env
    });

    assert.strictEqual(blockedDirect.exitCode, 0, 'Pending route should still use structured deny semantics');
    assert.strictEqual(
      blockedDirect.output?.hookSpecificOutput?.permissionDecision,
      'deny',
      'Pending route should still deny direct operational execution after harmless follow-up'
    );
  }));

  results.push(await runTest('Routes production deployment planning to release coordinator without user-facing block', async () => {
    const env = createIsolatedEnv({
      USER_PROMPT_MANDATORY_HARD_BLOCKING: '1'
    });
    const result = await tester.run({
      input: { userPrompt: 'Develop the final plan to deploy to production ultrathink' },
      env
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
    assert.strictEqual(result.output?.decision, undefined, 'Should not emit decision=block for deployment planning');
    assert.strictEqual(
      result.output?.metadata?.suggestedAgent,
      'opspal-core:release-coordinator',
      'Should route production deployment planning to release coordinator'
    );
    assert.strictEqual(result.output?.metadata?.routeKind, 'mandatory_specialist', 'Should mark release routing as mandatory');
    assert.strictEqual(result.output?.metadata?.executionBlockUntilCleared, true, 'Should still classify the route as execution-gated for downstream enforcement');
    assert.strictEqual(result.output?.metadata?.promptBlocked, false, 'Should avoid prompt-time hard block');
    assert.strictEqual(result.output?.metadata?.autoDelegationEligible, true, 'Release routing should stage auto-delegation');
    assert.strictEqual(readRoutingState(env)?.route_pending_clearance, true, 'Should persist pending release routing state');
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
