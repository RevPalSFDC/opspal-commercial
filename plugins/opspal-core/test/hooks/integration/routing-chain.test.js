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
const fs = require('fs');
const os = require('os');

const { HookTester, HookChainTester } = require('../runner');

// =============================================================================
// Test Configuration
// =============================================================================

// From integration/ directory: integration -> hooks -> test -> opspal-core -> plugins -> project-root (5 levels)
const PROJECT_ROOT = path.resolve(__dirname, '../../../../..');
const PLUGIN_ROOT = path.join(PROJECT_ROOT, 'plugins/opspal-core');
const { sanitizeSessionKey } = require(path.join(PLUGIN_ROOT, 'scripts/lib/routing-state-manager.js'));

const ROUTING_CHAIN = [
  'plugins/opspal-core/hooks/unified-router.sh',
  'plugins/opspal-core/hooks/pre-task-agent-validator.sh'
];
const PRETOOL_HOOK = 'plugins/opspal-core/hooks/pre-tool-use-contract-validation.sh';
const SUBAGENT_STOP_HOOK = 'plugins/opspal-core/hooks/post-subagent-verification.sh';

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

function createAgentEvent(toolInput = {}) {
  return {
    tool_name: 'Agent',
    tool_input: toolInput
  };
}

function createIsolatedEnv(extra = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'routing-chain-home-'));
  const sessionId = `routing-chain-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  return {
    CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
    HOME: home,
    CLAUDE_SESSION_ID: sessionId,
    USER_PROMPT_MANDATORY_HARD_BLOCKING: '0',
    ...extra
  };
}

function getRoutingStatePath(env) {
  return path.join(
    env.HOME,
    '.claude',
    'routing-state',
    `${sanitizeSessionKey(env.CLAUDE_SESSION_ID)}.json`
  );
}

function readRoutingState(env) {
  const filePath = getRoutingStatePath(env);
  if (!fs.existsSync(filePath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function assertNoStructuredDeny(result, message) {
  assert(
    result.output == null || (typeof result.output === 'object' && Object.keys(result.output).length === 0),
    message
  );
}

function assertStructuredRoutingDeny(result, reasonFragment, message) {
  assert.strictEqual(result.exitCode, 0, `${message} should use structured deny semantics`);
  assert.strictEqual(
    result.output?.hookSpecificOutput?.permissionDecision,
    'deny',
    `${message} should deny tool execution`
  );
  assert(
    (result.output?.hookSpecificOutput?.permissionDecisionReason || '').includes(reasonFragment),
    `${message} should mention ${reasonFragment}`
  );
}

async function assertPendingRouteLifecycle({
  name,
  prompt,
  directTool,
  expectedRouteAgent,
  approvedTaskAgent,
  wrongTaskAgent = null,
  envExtra = {}
}) {
  const env = createIsolatedEnv(envExtra);
  const router = new HookTester(ROUTING_CHAIN[0]);
  const pretool = new HookTester(PRETOOL_HOOK);
  const validator = new HookTester(ROUTING_CHAIN[1]);

  const routerResult = await router.run({
    input: { userPrompt: prompt },
    env
  });
  assert.strictEqual(routerResult.exitCode, 0, `${name}: router should complete`);
  assert.strictEqual(
    routerResult.output?.metadata?.suggestedAgent,
    expectedRouteAgent,
    `${name}: router should recommend the expected specialist`
  );
  assert.strictEqual(readRoutingState(env)?.route_pending_clearance, true, `${name}: router should persist pending state`);

  const blockedDirect = await pretool.run({
    input: {
      ...directTool,
      sessionKey: env.CLAUDE_SESSION_ID
    },
    env
  });
  assert.strictEqual(blockedDirect.exitCode, 0, `${name}: direct operational tool should use structured deny`);
  assert.strictEqual(
    blockedDirect.output?.hookSpecificOutput?.permissionDecision,
    'deny',
    `${name}: pending route should deny direct operational execution`
  );

  if (wrongTaskAgent) {
    const wrongTask = await validator.run({
      input: createAgentEvent({
        subagent_type: wrongTaskAgent,
        prompt
      }),
      env
    });
    assert.strictEqual(wrongTask.exitCode, 0, `${name}: wrong Agent should still use structured contract handling`);
    assert.strictEqual(
      wrongTask.output?.hookSpecificOutput?.permissionDecision,
      'deny',
      `${name}: wrong Agent family should be denied`
    );
    assert.strictEqual(readRoutingState(env)?.route_pending_clearance, true, `${name}: wrong Agent should not clear pending state`);
  }

  const clearTask = await validator.run({
    input: createAgentEvent({
      subagent_type: approvedTaskAgent,
      prompt
    }),
    env
  });
  assert.strictEqual(clearTask.exitCode, 0, `${name}: approved Agent should pass`);
  assert.strictEqual(readRoutingState(env)?.clearance_status, 'cleared', `${name}: approved Agent should clear pending state`);

  const allowedAfterClear = await pretool.run({
    input: {
      ...directTool,
      sessionKey: env.CLAUDE_SESSION_ID
    },
    env
  });
  assert.strictEqual(allowedAfterClear.exitCode, 0, `${name}: direct tool should continue after clearance`);
  assertNoStructuredDeny(allowedAfterClear, `${name}: no deny should be emitted after clearance`);
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
    const env = createIsolatedEnv();

    const result = await chain.run({
      input: {
        userPrompt: 'Run a CPQ assessment for our org'
      },
      env
    });

    assert(result.allPassed, 'All hooks should pass');
    assert.strictEqual(result.executedCount, 2, 'Should execute both hooks');
  }));

  // Test 3: Mandatory merge/dedup operations persist pending route state through chain
  results.push(await runTest('Mandatory merge dedup routing persists pending state through chain', async () => {
    const chain = new HookChainTester(ROUTING_CHAIN);
    const env = createIsolatedEnv();

    const result = await chain.run({
      input: {
        userPrompt: 'Merge duplicate Salesforce Accounts for Acme Corp'
      },
      env
    });

    assert(result.allPassed, 'All hooks should pass');
    assert.strictEqual(result.executedCount, 2, 'Should execute both hooks');
    assert.strictEqual(result.results[0]?.output?.decision, undefined, 'Router should not prompt-block by default');
    assert.strictEqual(result.results[0]?.output?.metadata?.routeKind, 'mandatory_specialist', 'Router should flag the route as mandatory');
    assert.strictEqual(result.results[0]?.output?.metadata?.promptBlocked, false, 'Router should avoid prompt-time hard block by default');
    assert.strictEqual(
      result.results[0]?.output?.metadata?.suggestedAgent,
      'opspal-salesforce:sfdc-merge-orchestrator',
      'Router should direct to merge orchestrator'
    );
    assert.strictEqual(result.results[0]?.output?.metadata?.autoDelegationEligible, true, 'Mandatory merge route should stage auto-delegation');
    const routingState = readRoutingState(env);
    assert(routingState, 'Mandatory route should persist pending routing state');
    assert.strictEqual(routingState.route_pending_clearance, true, 'Mandatory route should remain pending until Agent clears it');
  }));

  results.push(await runTest('Production deployment planning routes to release coordinator without prompt rejection', async () => {
    const chain = new HookChainTester(ROUTING_CHAIN);
    const pretool = new HookTester(PRETOOL_HOOK);
    const env = createIsolatedEnv({
      USER_PROMPT_MANDATORY_HARD_BLOCKING: '1'
    });

    const result = await chain.run({
      input: {
        userPrompt: 'Develop the final plan to deploy to production ultrathink'
      },
      env
    });

    assert(result.allPassed, 'All hooks should pass');
    assert.strictEqual(result.results[0]?.output?.decision, undefined, 'Router should not reject the prompt');
    assert.strictEqual(
      result.results[0]?.output?.metadata?.suggestedAgent,
      'opspal-core:release-coordinator',
      'Router should direct deployment planning to release coordinator'
    );
    assert.strictEqual(result.results[0]?.output?.metadata?.routeKind, 'mandatory_specialist', 'Router should flag the route as mandatory');
    assert.strictEqual(result.results[0]?.output?.metadata?.promptBlocked, false, 'Router should suppress prompt-time hard block');
    assert.strictEqual(result.results[0]?.output?.metadata?.autoDelegationEligible, true, 'Router should stage the auto-delegation bridge');
    assert.strictEqual(readRoutingState(env)?.route_pending_clearance, true, 'Router should persist pending release routing state');

    const blockedDirect = await pretool.run({
      input: {
        tool: 'Bash',
        sessionKey: env.CLAUDE_SESSION_ID,
        input: {
          command: 'sf project deploy start --target-org production'
        }
      },
      env
    });

    assert.strictEqual(blockedDirect.exitCode, 0, 'Direct deploy should use structured deny semantics');
    assert.strictEqual(
      blockedDirect.output?.hookSpecificOutput?.permissionDecision,
      'deny',
      'Direct deploy should remain blocked downstream until the specialist path clears the route'
    );
  }));

  results.push(await runTest('Mandatory deployment route auto-delegates helper Agent calls through the bridge', async () => {
    const env = createIsolatedEnv({
      USER_PROMPT_MANDATORY_HARD_BLOCKING: '1'
    });
    const router = new HookTester(ROUTING_CHAIN[0]);
    const validator = new HookTester(ROUTING_CHAIN[1]);

    const routed = await router.run({
      input: {
        userPrompt: 'Develop the final plan to deploy to production ultrathink'
      },
      env
    });
    assert.strictEqual(routed.exitCode, 0, 'Router should complete');
    assert.strictEqual(routed.output?.metadata?.autoDelegationEligible, true, 'Route should activate the auto-delegation bridge');

    const autoDelegated = await validator.run({
      input: createAgentEvent({
        subagent_type: 'Plan',
        prompt: 'Develop the final plan to deploy to production ultrathink'
      }),
      env
    });

    assert.strictEqual(autoDelegated.exitCode, 0, 'Validator should keep Agent handling structured');
    assert.strictEqual(
      autoDelegated.output?.hookSpecificOutput?.updatedInput?.subagent_type,
      'opspal-core:release-coordinator',
      'Helper Agent call should be rewritten to the required release specialist'
    );
    assert(
      (autoDelegated.output?.hookSpecificOutput?.additionalContext || '').includes('ROUTING_AUTO_DELEGATED'),
      'Validator should explain that the mandatory route was auto-delegated'
    );
    assert.strictEqual(readRoutingState(env)?.clearance_status, 'cleared', 'Auto-delegated specialist should clear the pending route');
  }));

  // Test 4: Short name resolution works through chain
  results.push(await runTest('Short name resolved through chain', async () => {
    // Run validator directly with short name
    const validator = new HookTester(ROUTING_CHAIN[1]);

    const result = await validator.run({
      input: createAgentEvent({
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
      const env = createIsolatedEnv();

      const result = await validator.run({
        input: createAgentEvent({
          subagent_type: scenario.input,
          prompt: `test ${scenario.name}`
        }),
        env
      });

      assert.strictEqual(result.exitCode, 0, `${scenario.name} should exit 0`);
    }));
  }

  // Test 6: Chain handles errors gracefully
  results.push(await runTest('Chain handles non-existent agent gracefully', async () => {
    const validator = new HookTester(ROUTING_CHAIN[1]);
    const env = createIsolatedEnv();

    const result = await validator.run({
      input: createAgentEvent({
        subagent_type: 'completely-fake-agent-xyz-123',
        prompt: 'test'
      }),
      env
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
    const env = createIsolatedEnv({
      ROUTING_ADAPTIVE_CONTINUE: '1'
    });

    const result = await chain.run({
      input: {
        userPrompt: 'Please continue with the CPQ assessment from earlier'
      },
      env
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
  results.push(await runTest('Chain requires intake-first routing in require mode for vague project prompts', async () => {
    const chain = new HookChainTester(ROUTING_CHAIN);
    const env = createIsolatedEnv({
      ACTIVE_INTAKE_MODE: 'require'
    });

    const result = await chain.run({
      input: {
        userPrompt: 'We need to redesign lead routing in Salesforce with territory-based assignment and approval chains'
      },
      env
    });

    assert(result.allPassed, 'All hooks should pass');
    assert.strictEqual(result.executedCount, 2, 'Should execute both hooks');
    assert.strictEqual(result.results[0]?.output?.decision, undefined, 'Router should avoid prompt-time hard block by default');
    assert.strictEqual(result.results[0]?.output?.metadata?.routeKind, 'intake_specialist', 'Router should use the intake specialist route kind');
    assert.strictEqual(result.results[0]?.output?.metadata?.guidanceAction, 'require_intake', 'Router should require intake explicitly');
    assert.strictEqual(result.results[0]?.output?.metadata?.promptBlocked, false, 'Router should leave hard blocking off by default');
    assert.strictEqual(result.results[0]?.output?.metadata?.intakeGateApplied, true, 'Router should mark intake gate as applied');
    assert.strictEqual(
      result.results[0]?.output?.metadata?.suggestedAgent,
      'opspal-core:intelligent-intake-orchestrator',
      'Router should direct to intake orchestrator'
    );
  }));

  // Test 9: Chain timing is reasonable
  results.push(await runTest('Chain executes in reasonable time (<2s)', async () => {
    const chain = new HookChainTester(ROUTING_CHAIN);
    const env = createIsolatedEnv();

    const result = await chain.run({
      input: {
        userPrompt: 'Analyze our pipeline and forecast'
      },
      env
    });

    assert(result.totalDuration < 2000, `Chain took ${result.totalDuration}ms, should be <2000ms`);
  }));

  results.push(await runTest('Pending route denies operational tool until approved Agent clears it', async () => {
    await assertPendingRouteLifecycle({
      name: 'reports dashboards route',
      prompt: 'Create a Salesforce dashboard for executive pipeline visibility',
      directTool: {
        tool: 'Bash',
        input: { command: 'echo "attempt direct operation"' }
      },
      expectedRouteAgent: 'opspal-salesforce:sfdc-reports-dashboards',
      approvedTaskAgent: 'opspal-salesforce:sfdc-reports-dashboards'
    });
  }));

  results.push(await runTest('Recommended specialist route stays advisory for direct operational tools', async () => {
    const env = createIsolatedEnv();
    const router = new HookTester(ROUTING_CHAIN[0]);
    const pretool = new HookTester(PRETOOL_HOOK);

    const routed = await router.run({
      input: { userPrompt: 'Add all new fields to the Account Taxonomy Permission Set' },
      env
    });
    assert.strictEqual(routed.exitCode, 0, 'Recommended routing prompt should succeed');
    assert.strictEqual(
      routed.output?.metadata?.suggestedAgent,
      'opspal-salesforce:sfdc-permission-orchestrator',
      'Permission maintenance should still recommend the specialist'
    );
    assert.strictEqual(routed.output?.metadata?.routeKind, 'advisory_specialist', 'Permission maintenance should remain advisory');
    assert.strictEqual(routed.output?.metadata?.guidanceAction, 'recommend_specialist', 'Permission maintenance should remain recommendation-only');
    assert.strictEqual(readRoutingState(env), null, 'Recommendation-only routing should not persist pending state');

    const allowedDirect = await pretool.run({
      input: {
        tool: 'Edit',
        sessionKey: env.CLAUDE_SESSION_ID,
        input: { file_path: 'force-app/main/default/permissionsets/Account_Taxonomy.permissionset-meta.xml' }
      },
      env
    });
    assert.strictEqual(allowedDirect.exitCode, 0, 'Recommendation-only routing should not block direct operational tools');
    assertNoStructuredDeny(allowedDirect, 'Recommendation-only routing should remain advisory');
  }));

  results.push(await runTest('Release routing denies mutating MCP tool until deployment specialist clears it', async () => {
    await assertPendingRouteLifecycle({
      name: 'release route',
      prompt: 'Deploy validation rules to production and tag version 2.3.1',
      directTool: {
        tool: 'mcp_salesforce_metadata_deploy',
        input: { manifestPath: 'package.xml', targetOrg: 'prod' }
      },
      expectedRouteAgent: 'opspal-core:release-coordinator',
      approvedTaskAgent: 'opspal-salesforce:sfdc-deployment-manager'
    });
  }));

  results.push(await runTest('Permission routing denies mutating MCP tool until the canonical orchestrator clears it', async () => {
    await assertPendingRouteLifecycle({
      name: 'permission route',
      prompt: 'Create a new permission set with FLS in Salesforce for account fields',
      directTool: {
        tool: 'mcp_salesforce_permission_assign',
        input: { assigneeId: '005xx', permissionSetId: '0PSxx' }
      },
      expectedRouteAgent: 'opspal-salesforce:sfdc-permission-orchestrator',
      approvedTaskAgent: 'opspal-salesforce:sfdc-permission-orchestrator',
      envExtra: {
        ACTIVE_INTAKE_MODE: 'suggest'
      }
    });
  }));

  results.push(await runTest('Permission/security write routing auto-delegates helper Agent calls to the canonical orchestrator', async () => {
    const env = createIsolatedEnv({
      ACTIVE_INTAKE_MODE: 'suggest'
    });
    const router = new HookTester(ROUTING_CHAIN[0]);
    const validator = new HookTester(ROUTING_CHAIN[1]);

    const routed = await router.run({
      input: { userPrompt: 'Create a new permission set with FLS in Salesforce for account fields' },
      env
    });
    assert.strictEqual(routed.exitCode, 0, 'Router should complete');
    assert.strictEqual(routed.output?.metadata?.suggestedAgent, 'opspal-salesforce:sfdc-permission-orchestrator', 'Should route to the canonical permission orchestrator');
    assert.strictEqual(routed.output?.metadata?.autoDelegationEligible, true, 'Permission/security write route should activate the auto-delegation bridge');

    const autoDelegated = await validator.run({
      input: createAgentEvent({
        subagent_type: 'Plan',
        prompt: 'Create a new permission set with FLS in Salesforce for account fields'
      }),
      env
    });

    assert.strictEqual(autoDelegated.exitCode, 0, 'Validator should keep Agent handling structured');
    assert.strictEqual(
      autoDelegated.output?.hookSpecificOutput?.updatedInput?.subagent_type,
      'opspal-salesforce:sfdc-permission-orchestrator',
      'Helper Agent call should be rewritten to the canonical permission specialist'
    );
    assert(
      (autoDelegated.output?.hookSpecificOutput?.additionalContext || '').includes('ROUTING_AUTO_DELEGATED'),
      'Validator should explain that the permission route was auto-delegated'
    );
    assert.strictEqual(readRoutingState(env)?.clearance_status, 'cleared', 'Auto-delegated permission specialist should clear the pending route');
  }));

  results.push(await runTest('HubSpot assessment routing denies mutating MCP tool until assessment specialist clears it', async () => {
    await assertPendingRouteLifecycle({
      name: 'hubspot assessment route',
      prompt: 'Run a HubSpot assessment and audit our portal health',
      directTool: {
        tool: 'mcp_hubspot_enhanced_v3_blogs_update_post',
        input: { blogId: 1, postId: 2, name: 'Updated' }
      },
      expectedRouteAgent: 'opspal-hubspot:hubspot-assessment-analyzer',
      approvedTaskAgent: 'opspal-hubspot:hubspot-assessment-analyzer'
    });
  }));

  results.push(await runTest('Marketo lead-quality routing denies mutating MCP tool until lead-quality specialist clears it', async () => {
    await assertPendingRouteLifecycle({
      name: 'marketo lead-quality route',
      prompt: 'Audit our Marketo lead quality and database health',
      directTool: {
        tool: 'mcp__marketo__lead_update',
        input: { leads: [{ id: 1, leadStatus: 'MQL' }] }
      },
      expectedRouteAgent: 'opspal-marketo:marketo-lead-quality-assessor',
      approvedTaskAgent: 'opspal-marketo:marketo-lead-quality-assessor'
    });
  }));

  results.push(await runTest('Harmless follow-up prompt does not clear pending route before execution gate', async () => {
    const env = createIsolatedEnv();
    const router = new HookTester(ROUTING_CHAIN[0]);
    const pretool = new HookTester(PRETOOL_HOOK);

    const first = await router.run({
      input: { userPrompt: 'Create a Salesforce dashboard for executive pipeline visibility' },
      env
    });
    assert.strictEqual(first.exitCode, 0, 'Initial routing prompt should succeed');
    assert.strictEqual(readRoutingState(env)?.route_pending_clearance, true, 'Initial prompt should persist pending routing state');

    const second = await router.run({
      input: { userPrompt: 'What time is it?' },
      env
    });
    assert.strictEqual(second.exitCode, 0, 'Harmless follow-up should succeed');
    assert.strictEqual(readRoutingState(env)?.route_pending_clearance, true, 'Harmless follow-up should not clear pending routing state');

    const blockedDirect = await pretool.run({
      input: {
        tool: 'Bash',
        sessionKey: env.CLAUDE_SESSION_ID,
        input: { command: 'echo "still blocked"' }
      },
      env
    });
    assert.strictEqual(blockedDirect.exitCode, 0, 'Execution gate should use structured deny');
    assert.strictEqual(
      blockedDirect.output?.hookSpecificOutput?.permissionDecision,
      'deny',
      'Execution gate should still deny operational execution after harmless follow-up'
    );
  }));

  results.push(await runTest('Procedural recommended prompt stays advisory and does not activate pending route gate', async () => {
    const env = createIsolatedEnv({
      ENABLE_HARD_BLOCKING: '1',
      ENABLE_COMPLEXITY_HARD_BLOCKING: '1'
    });
    const router = new HookTester(ROUTING_CHAIN[0]);
    const pretool = new HookTester(PRETOOL_HOOK);

    const routed = await router.run({
      input: { userPrompt: 'Write a step-by-step runbook for a CPQ assessment in our org' },
      env
    });
    assert.strictEqual(routed.exitCode, 0, 'Procedural routing prompt should succeed');
    assert.strictEqual(routed.output?.metadata?.routeKind, 'advisory_specialist', 'Procedural routing should remain advisory');
    assert.strictEqual(routed.output?.metadata?.guidanceAction, 'recommend_specialist', 'Procedural routing should remain recommendation-only');
    assert.strictEqual(readRoutingState(env), null, 'Procedural recommendation should not persist pending routing state');

    const allowedDirect = await pretool.run({
      input: {
        tool: 'Bash',
        sessionKey: env.CLAUDE_SESSION_ID,
        input: { command: 'echo "procedural follow-up"' }
      },
      env
    });
    assert.strictEqual(allowedDirect.exitCode, 0, 'Procedural recommendation should not block direct operational tools');
    assertNoStructuredDeny(allowedDirect, 'Procedural recommendation should stay advisory');
  }));

  results.push(await runTest('Mixed Salesforce cleanup routing stays on the specialist path and blocks parent recovery', async () => {
    const env = createIsolatedEnv();
    const router = new HookTester(ROUTING_CHAIN[0]);
    const validator = new HookTester(ROUTING_CHAIN[1]);
    const pretool = new HookTester(PRETOOL_HOOK);
    const prompt = 'Verify the accounts, count Contacts, generate a CSV, reparent 101 Contacts, and delete the duplicate Account in Salesforce';

    const routed = await router.run({
      input: { userPrompt: prompt },
      env
    });

    assert.strictEqual(routed.exitCode, 0, 'Mixed cleanup routing prompt should succeed');
    assert.strictEqual(
      routed.output?.metadata?.suggestedAgent,
      'opspal-salesforce:sfdc-orchestrator',
      'Mixed cleanup workflow should route to the Salesforce orchestrator'
    );
    assert.strictEqual(routed.output?.metadata?.routeKind, 'mandatory_specialist', 'Mixed cleanup route should be mandatory');
    assert.strictEqual(readRoutingState(env)?.route_pending_clearance, true, 'Mixed cleanup route should persist pending state');

    const blockedBeforeClear = await pretool.run({
      input: {
        tool: 'Bash',
        sessionKey: env.CLAUDE_SESSION_ID,
        input: {
          command: 'sf data bulk update --sobject Contact --file ./contacts.csv --target-org sandbox'
        }
      },
      env
    });

    assertStructuredRoutingDeny(blockedBeforeClear, 'ROUTING_REQUIRED_BEFORE_OPERATION', 'Pending mixed cleanup route');

    const clearTask = await validator.run({
      input: createAgentEvent({
        subagent_type: 'opspal-salesforce:sfdc-orchestrator',
        prompt
      }),
      env
    });

    assert.strictEqual(clearTask.exitCode, 0, 'Canonical cleanup orchestrator should clear the route');
    assert.strictEqual(readRoutingState(env)?.clearance_status, 'cleared', 'Cleanup orchestrator should clear pending state');

    const parentFallback = await pretool.run({
      input: {
        tool: 'Bash',
        sessionKey: env.CLAUDE_SESSION_ID,
        input: {
          command: 'sf data bulk update --sobject Contact --file ./contacts.csv --target-org sandbox'
        }
      },
      env
    });

    assertStructuredRoutingDeny(parentFallback, 'ROUTING_SPECIALIST_TOOL_PROJECTION_MISMATCH', 'Parent fallback after specialist clearance');
  }));

  results.push(await runTest('Merge/delete cleanup routing stays on the merge specialist path and blocks parent recovery', async () => {
    const env = createIsolatedEnv();
    const router = new HookTester(ROUTING_CHAIN[0]);
    const validator = new HookTester(ROUTING_CHAIN[1]);
    const pretool = new HookTester(PRETOOL_HOOK);
    const prompt = 'Merge duplicate Contacts, delete the obsolete duplicate records, and clean up Salesforce follow-up tasks';

    const routed = await router.run({
      input: { userPrompt: prompt },
      env
    });

    assert.strictEqual(routed.exitCode, 0, 'Merge/delete cleanup routing prompt should succeed');
    assert.strictEqual(
      routed.output?.metadata?.suggestedAgent,
      'opspal-salesforce:sfdc-merge-orchestrator',
      'Merge/delete cleanup should route to the merge orchestrator'
    );
    assert.strictEqual(routed.output?.metadata?.routeKind, 'mandatory_specialist', 'Merge/delete cleanup route should be mandatory');
    assert.strictEqual(readRoutingState(env)?.route_pending_clearance, true, 'Merge/delete cleanup route should persist pending state');

    const blockedBeforeClear = await pretool.run({
      input: {
        tool: 'Bash',
        sessionKey: env.CLAUDE_SESSION_ID,
        input: {
          command: 'sf data bulk update --sobject Contact --file ./merge-cleanup.csv --target-org sandbox'
        }
      },
      env
    });

    assertStructuredRoutingDeny(blockedBeforeClear, 'ROUTING_REQUIRED_BEFORE_OPERATION', 'Pending merge cleanup route');

    const clearTask = await validator.run({
      input: createAgentEvent({
        subagent_type: 'opspal-salesforce:sfdc-merge-orchestrator',
        prompt
      }),
      env
    });

    assert.strictEqual(clearTask.exitCode, 0, 'Merge orchestrator should clear the route');
    assert.strictEqual(readRoutingState(env)?.clearance_status, 'cleared', 'Merge orchestrator should clear pending state');

    const parentFallback = await pretool.run({
      input: {
        tool: 'Bash',
        sessionKey: env.CLAUDE_SESSION_ID,
        input: {
          command: 'sf data bulk update --sobject Contact --file ./merge-cleanup.csv --target-org sandbox'
        }
      },
      env
    });

    assertStructuredRoutingDeny(parentFallback, 'ROUTING_SPECIALIST_TOOL_PROJECTION_MISMATCH', 'Parent fallback after merge specialist clearance');
  }));

  // =========================================================================
  // Vague opener / rich body routing tests
  // =========================================================================

  results.push(await runTest('Vague opener with rich embedded body routes to sfdc-orchestrator', async () => {
    const env = createIsolatedEnv();
    const router = new HookTester(ROUTING_CHAIN[0]);
    const prompt = 'Fix 5 account naming issues\n\nStep 1: Verify accounts by running a SOQL query\nStep 2: Count contacts per account and generate a CSV\nStep 3: Reparent 103 contacts to the correct accounts\nStep 4: Delete the duplicate account records';

    const routed = await router.run({
      input: { userPrompt: prompt },
      env
    });

    assert.strictEqual(routed.exitCode, 0, 'Router should complete');
    const agent = routed.output?.metadata?.suggestedAgent;
    assert.strictEqual(
      agent,
      'opspal-salesforce:sfdc-orchestrator',
      `Rich body with compound cleanup signals should route to orchestrator, got: ${agent}`
    );
  }));

  results.push(await runTest('Continuation prompt with embedded cleanup body routes to sfdc-orchestrator', async () => {
    const env = createIsolatedEnv();
    const router = new HookTester(ROUTING_CHAIN[0]);
    const prompt = 'Resume the work using the appropriate opspal sub-agents\n\nThe remaining steps are:\n- Verify account names in Salesforce\n- Reparent contacts from duplicate account\n- Generate CSV of all affected contacts\n- Delete duplicate account record\n- Verify final contact count';

    const routed = await router.run({
      input: { userPrompt: prompt },
      env
    });

    assert.strictEqual(routed.exitCode, 0, 'Router should complete');
    const agent = routed.output?.metadata?.suggestedAgent;
    assert.strictEqual(
      agent,
      'opspal-salesforce:sfdc-orchestrator',
      `Continuation with compound cleanup body should route to orchestrator, got: ${agent}`
    );
  }));

  // =========================================================================
  // Projection-loss detection and circuit-breaker tests
  // =========================================================================

  results.push(await runTest('SubagentStop detects projection loss in specialist output', async () => {
    const env = createIsolatedEnv();
    const tester = new HookTester(SUBAGENT_STOP_HOOK);
    const output = [
      'Routed to opspal-salesforce:sfdc-data-operations.',
      'That agent couldn\'t execute the Salesforce CLI command — it only has Read/Write tools.',
      'Attempting to fall back to direct execution.'
    ].join('\n');

    const result = await tester.run({
      stdin: output,
      env: {
        CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
        CLAUDE_SESSION_ID: env.CLAUDE_SESSION_ID,
        HOME: env.HOME
      }
    });

    assert.strictEqual(result.exitCode, 0, 'SubagentStop hook should exit 0');
    const context = result.output?.hookSpecificOutput?.additionalContext || '';
    assert(
      context.includes('SUBAGENT_PROJECTION_LOSS'),
      `Should emit SUBAGENT_PROJECTION_LOSS, got: ${context.substring(0, 200)}`
    );
  }));

  results.push(await runTest('Circuit breaker fires after second projection loss on different specialist', async () => {
    const env = createIsolatedEnv();
    const tester = new HookTester(SUBAGENT_STOP_HOOK);

    // First projection loss
    const output1 = 'Routed to opspal-salesforce:sfdc-data-operations. That agent only has Read/Write tools.';
    await tester.run({
      stdin: output1,
      env: {
        CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
        CLAUDE_SESSION_ID: env.CLAUDE_SESSION_ID,
        HOME: env.HOME
      }
    });

    // Second projection loss on different agent
    const output2 = 'Routed to opspal-salesforce:sfdc-bulkops-orchestrator. That agent also couldn\'t execute — no Bash tool available.';
    const result2 = await tester.run({
      stdin: output2,
      env: {
        CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
        CLAUDE_SESSION_ID: env.CLAUDE_SESSION_ID,
        HOME: env.HOME
      }
    });

    assert.strictEqual(result2.exitCode, 0, 'SubagentStop hook should exit 0');
    const context = result2.output?.hookSpecificOutput?.additionalContext || '';
    assert(
      context.includes('PROJECTION_LOSS_CIRCUIT_BREAK'),
      `Second projection loss on different agent should trigger circuit break, got: ${context.substring(0, 200)}`
    );
  }));

  results.push(await runTest('Parent Bash blocked after projection-loss circuit break', async () => {
    const env = createIsolatedEnv();
    const pretool = new HookTester(PRETOOL_HOOK);

    // Seed circuit-broken state via CLI subprocess (uses test HOME)
    const stateManagerPath = path.join(PLUGIN_ROOT, 'scripts/lib/routing-state-manager.js');
    const { execSync } = require('child_process');
    execSync(
      `node "${stateManagerPath}" record-projection-loss "${env.CLAUDE_SESSION_ID}" "opspal-salesforce:sfdc-data-operations" "only has Read/Write"`,
      { env: { ...process.env, HOME: env.HOME } }
    );
    execSync(
      `node "${stateManagerPath}" record-projection-loss "${env.CLAUDE_SESSION_ID}" "opspal-salesforce:sfdc-bulkops-orchestrator" "no Bash"`,
      { env: { ...process.env, HOME: env.HOME } }
    );

    // Verify circuit-broken state
    const state = readRoutingState(env);
    assert.strictEqual(state?.projection_loss_circuit_broken, true, 'State should be circuit-broken');

    const bashResult = await pretool.run({
      input: {
        tool: 'Bash',
        sessionKey: env.CLAUDE_SESSION_ID,
        input: {
          command: 'sf data query --query "SELECT Id FROM Account LIMIT 5" --target-org sandbox'
        }
      },
      env
    });

    assertStructuredRoutingDeny(bashResult, 'PROJECTION_LOSS_CIRCUIT_BREAK', 'Bash should be blocked after circuit break');
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
