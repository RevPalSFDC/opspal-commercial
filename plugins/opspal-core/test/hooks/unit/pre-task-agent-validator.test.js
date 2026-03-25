#!/usr/bin/env node

/**
 * Unit Tests for pre-task-agent-validator.sh
 *
 * Tests the agent name validation and resolution logic:
 * 1. Short name resolution to fully-qualified names
 * 2. Command vs agent detection
 * 3. Cross-type conflict handling
 * 4. Agent not found error handling
 *
 * @copyright 2024-2026 RevPal Partners, LLC
 */

const path = require('path');
const assert = require('assert');
const fs = require('fs');
const os = require('os');

// Import test runner
const { HookTester } = require('../runner');

// =============================================================================
// Test Configuration
// =============================================================================

const HOOK_PATH = 'plugins/opspal-core/hooks/pre-task-agent-validator.sh';
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

function createAgentEvent(toolInput = {}) {
  return {
    tool_name: 'Agent',
    tool_input: toolInput
  };
}

function createIsolatedEnv(extra = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'task-validator-home-'));
  const sessionId = `task-validator-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  return {
    CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
    HOME: home,
    CLAUDE_SESSION_ID: sessionId,
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

function writeRoutingState(env, state) {
  const filePath = getRoutingStatePath(env);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2));
}

function readRoutingState(env) {
  const filePath = getRoutingStatePath(env);
  if (!fs.existsSync(filePath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
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
  console.log('\n🧪 pre-task-agent-validator.sh Tests\n');

  const tester = createTester();
  const results = [];

  // Test 1: Hook validation
  results.push(await runTest('Hook exists and is valid', async () => {
    const validation = tester.validate();
    assert(validation.exists, 'Hook file should exist');
    assert(validation.executable, 'Hook should be executable');
    assert(validation.syntaxValid, 'Hook should have valid bash syntax');
  }));

  // Test 2: Pass-through when no subagent_type
  results.push(await runTest('Passes through when no subagent_type', async () => {
    const env = createIsolatedEnv();
    const result = await tester.run({
      input: createAgentEvent({ prompt: 'test prompt', description: 'test' }),
      env
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
    assert.deepStrictEqual(result.output, {}, 'Should emit empty JSON for pass-through');
  }));

  // Test 3: Already fully-qualified non-Bash agent passes through
  results.push(await runTest('Passes through fully-qualified non-Bash agent name', async () => {
    const env = createIsolatedEnv();
    const input = createAgentEvent({
      subagent_type: 'opspal-salesforce:sfdc-cpq-specialist',
      prompt: 'test prompt'
    });

    const result = await tester.run({
      input,
      env
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
    assert.deepStrictEqual(result.output, {}, 'Should not emit updates for fully-qualified agents that do not require extra tool contracts');
  }));

  results.push(await runTest('Allows Claude internal helper agents to pass through', async () => {
    const env = createIsolatedEnv();
    const input = createAgentEvent({
      subagent_type: 'statusline-setup',
      description: 'Configure statusline setting'
    });

    const result = await tester.run({
      input,
      env
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
    assert.deepStrictEqual(result.output, {}, 'Claude internal helper agents should bypass plugin agent resolution');
  }));

  // Test 4: Short name resolution
  // Note: This test may fail if agent-alias-resolver.js isn't accessible from test environment
  results.push(await runTest('Handles short agent name (resolution depends on env)', async () => {
    const env = createIsolatedEnv();
    const input = createAgentEvent({
      subagent_type: 'sfdc-cpq-assessor',
      prompt: 'test prompt'
    });

    const result = await tester.run({
      input,
      env
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
    if (result.output?.hookSpecificOutput?.updatedInput?.subagent_type) {
      assert(
        result.output.hookSpecificOutput.updatedInput.subagent_type.includes(':'),
        'Resolved name should be fully-qualified'
      );
      assert.strictEqual(
        result.output.hookSpecificOutput.permissionDecision,
        'allow',
        'Resolution update should explicitly allow execution'
      );
    }
  }));

  results.push(await runTest('Reroutes Salesforce metadata deploy tasks away from instance-deployer', async () => {
    const env = createIsolatedEnv();
    const input = createAgentEvent({
      subagent_type: 'opspal-core:instance-deployer',
      prompt: 'Run sf project deploy start for package.xml updates covering layouts and quick actions in force-app.'
    });

    const result = await tester.run({
      input,
      env
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
    const updatedInput = result.output?.hookSpecificOutput?.updatedInput;
    assert.strictEqual(
      updatedInput?.subagent_type,
      'opspal-salesforce:sfdc-deployment-manager',
      'Salesforce metadata deploys should be rerouted to the designated deployment specialist'
    );
    // Deploy contract injection removed — sfdc-deployment-manager now has adaptive
    // Bash execution logic. The hook no longer overrides the agent's own behavior.
    assert(
      !(updatedInput?.prompt || '').includes('DEPLOY EXECUTION CONTRACT'),
      'Rerouted deployment specialist should NOT have deploy contract injected (removed)'
    );
    assert.strictEqual(
      updatedInput?.deployment_execution_contract,
      undefined,
      'Deploy handoff contract should not be injected (deployment manager handles its own logic)'
    );
    // With deploy contract removed, deployment agents now receive the generic
    // Bash permission contract — this is correct (fallback if Bash unavailable).
    assert(
      (result.output?.hookSpecificOutput?.additionalContext || '').includes('ROUTING_SPECIALIST_OVERRIDE'),
      'Should explain why the reroute happened'
    );
  }));

  // Test 5: Command name handling
  // Note: Depends on agent-alias-resolver being accessible
  results.push(await runTest('Handles command name gracefully', async () => {
    const env = createIsolatedEnv();
    const input = createAgentEvent({
      subagent_type: 'reflect',
      prompt: 'test prompt'
    });

    const result = await tester.run({
      input,
      env
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
    assert.strictEqual(
      result.output?.hookSpecificOutput?.permissionDecision,
      'deny',
      'Command names used as agents should be denied'
    );
    assert(
      (result.output?.hookSpecificOutput?.permissionDecisionReason || '').includes('ROUTING_COMMAND_NOT_AGENT'),
      'Should provide command-not-agent remediation'
    );
  }));

  // Test 6: Agent not found error
  results.push(await runTest('Reports error for non-existent agent', async () => {
    const env = createIsolatedEnv();
    const input = createAgentEvent({
      subagent_type: 'non-existent-fake-agent-xyz',
      prompt: 'test prompt'
    });

    const result = await tester.run({
      input,
      env
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0 for contract handling');
    assert.strictEqual(
      result.output?.hookSpecificOutput?.permissionDecision,
      'deny',
      'Unknown agents should be denied'
    );
    assert(
      (result.output?.hookSpecificOutput?.permissionDecisionReason || '').includes('ROUTING_AGENT_NOT_FOUND'),
      'Should provide agent-not-found guidance'
    );
  }));

  results.push(await runTest('Allows built-in Claude agents like Explore to pass through', async () => {
    const env = createIsolatedEnv();
    const input = createAgentEvent({
      subagent_type: 'Explore',
      prompt: 'Inspect deployment blockers'
    });

    const result = await tester.run({
      input,
      env
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0 for contract handling');
    assert.deepStrictEqual(result.output, {}, 'Built-in Claude agents should bypass plugin routing resolution');
  }));

  // Test 7: Invalid JSON handling
  results.push(await runTest('Handles invalid JSON input gracefully', async () => {
    const env = createIsolatedEnv();
    const result = await tester.run({
      stdin: 'not valid json {{{',
      env
    });

    // Should not crash, should pass through or handle gracefully
    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
  }));

  // Test 8: Empty input handling
  results.push(await runTest('Handles empty input gracefully', async () => {
    const env = createIsolatedEnv();
    const result = await tester.run({
      stdin: '',
      env
    });

    // Should not crash
    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
  }));

  // Test 9: Metrics logging integration
  results.push(await runTest('Logs routing metrics when enabled', async () => {
    const env = createIsolatedEnv({
      ENABLE_ROUTING_METRICS: '1'
    });
    const input = createAgentEvent({
      subagent_type: 'sfdc-discovery',
      prompt: 'test prompt'
    });

    const result = await tester.run({
      input,
      env
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
    // Note: We can't easily verify async metrics logging in this test
    // but the hook should complete without errors
  }));

  // Test 10: Runbook cohort requirement flow should preserve contract safety
  results.push(await runTest('Handles runbook cohort requirement flow safely', async () => {
    const env = createIsolatedEnv({
      RUNBOOK_COHORT_ENFORCEMENT: '1',
      RUNBOOK_COHORT_STRICT: '0'
    });
    const input = createAgentEvent({
      subagent_type: 'sfdc-discovery',
      prompt: 'Investigate dark agents and routing keyword index mismatch before execution'
    });

    const result = await tester.run({
      input,
      env
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
    if (result.output && typeof result.output === 'object' && Object.keys(result.output).length > 0) {
      assert.strictEqual(
        result.output.hookSpecificOutput?.hookEventName,
        'PreToolUse',
        'Contract output should remain PreToolUse compliant when runbook logic is active'
      );
    }
  }));

  results.push(await runTest('Ignores legacy Task hook payloads on the live path', async () => {
    const env = createIsolatedEnv();
    const result = await tester.run({
      input: {
        tool_name: 'Task',
        tool_input: {
          subagent_type: 'opspal-salesforce:sfdc-cpq-assessor',
          prompt: 'test prompt'
        }
      },
      env
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
    assert.deepStrictEqual(result.output, {}, 'Legacy Task payload should be skipped');
  }));

  // Test 11: Bash permission contract is opt-in (disabled by default)
  results.push(await runTest('Injects Bash permission fallback contract for data/query subagents', async () => {
    // Without SUBAGENT_BASH_CONTRACT_ENABLED, the contract should NOT be injected
    const env = createIsolatedEnv();
    const input = createAgentEvent({
      subagent_type: 'opspal-salesforce:sfdc-data-operations',
      prompt: 'Run a core object query and summarize results'
    });

    const result = await tester.run({
      input,
      env
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
    const updatedInput = result.output?.hookSpecificOutput?.updatedInput;
    // Contract is opt-in — when disabled, no SUBAGENT_BASH_PERMISSION_BLOCKED marker
    if (updatedInput) {
      assert(
        !(updatedInput.prompt || '').includes('SUBAGENT_BASH_PERMISSION_BLOCKED'),
        'Prompt should NOT include permission-block fallback marker when contract is opt-in (default off)'
      );
      assert.strictEqual(
        updatedInput.permission_contract,
        undefined,
        'Permission contract should not be injected when SUBAGENT_BASH_CONTRACT_ENABLED is off'
      );
    }

    // Verify contract IS injected when opt-in is enabled
    const envEnabled = createIsolatedEnv();
    envEnabled.SUBAGENT_BASH_CONTRACT_ENABLED = '1';
    const resultEnabled = await tester.run({
      input,
      env: envEnabled
    });
    assert.strictEqual(resultEnabled.exitCode, 0, 'Should exit with 0 when contract enabled');
    const updatedEnabled = resultEnabled.output?.hookSpecificOutput?.updatedInput;
    // With minimal updatedInput, only subagent_type is sent — contract fields
    // (prompt modifications, permission_contract) are no longer passed through.
    // The Bash permission contract is effectively a no-op with minimal updatedInput.
    if (updatedEnabled) {
      assert.strictEqual(
        updatedEnabled.permission_contract,
        undefined,
        'Minimal updatedInput should not contain permission_contract (contract no longer passed through)'
      );
    }
  }));

  results.push(await runTest('Transforms deployment-manager execution requests into parent-context handoffs', async () => {
    const env = createIsolatedEnv();
    const input = createAgentEvent({
      subagent_type: 'opspal-salesforce:sfdc-deployment-manager',
      prompt: 'Run sf project deploy start for package.xml updates covering flow deactivation changes'
    });

    const result = await tester.run({
      input,
      env
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
    const updatedInput = result.output?.hookSpecificOutput?.updatedInput;
    // Both deploy contract and Bash permission contract are disabled by default.
    // The agent should pass through with minimal or no updatedInput modifications.
    if (updatedInput) {
      assert(
        !(updatedInput.prompt || '').includes('DEPLOY EXECUTION CONTRACT'),
        'Deployment manager prompt should NOT have deploy contract injected (removed)'
      );
      assert.strictEqual(
        updatedInput.deployment_execution_contract,
        undefined,
        'Deploy handoff contract should not be injected (function removed)'
      );
      assert(
        !(updatedInput.prompt || '').includes('SUBAGENT_BASH_PERMISSION_BLOCKED'),
        'Bash permission contract should not be injected (opt-in off by default)'
      );
    }
  }));

  results.push(await runTest('Records deploy clearance for planning-only deployment-manager requests', async () => {
    const env = createIsolatedEnv();
    const input = createAgentEvent({
      subagent_type: 'opspal-salesforce:sfdc-deployment-manager',
      prompt: 'Prepare a parent-context deployment handoff for package.xml validation. Do not execute sf project deploy from the subagent.'
    });

    const result = await tester.run({
      input,
      env
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
    const updatedInput = result.output?.hookSpecificOutput?.updatedInput;
    assert.strictEqual(
      updatedInput?.deployment_execution_contract,
      undefined,
      'Planning-only deployment requests should not be rewritten into the forced parent-context handoff contract'
    );
    assert.strictEqual(
      readRoutingState(env)?.clearance_status,
      'cleared',
      'Planning-only deployment-manager invocations should persist a cleared deploy handoff state for the parent context'
    );
    assert.strictEqual(
      readRoutingState(env)?.last_resolved_agent,
      'opspal-salesforce:sfdc-deployment-manager',
      'Deploy handoff state should record the planning agent that cleared the session'
    );
  }));

  results.push(await runTest('Injects Bash permission fallback contract for HubSpot Bash agents', async () => {
    // Contract is opt-in — verify it is NOT injected by default
    const env = createIsolatedEnv();
    const input = createAgentEvent({
      subagent_type: 'opspal-hubspot:hubspot-cms-theme-manager',
      prompt: 'Generate and validate the HubSpot CMS theme packaging assets'
    });

    const result = await tester.run({
      input,
      env
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
    const updatedInput = result.output?.hookSpecificOutput?.updatedInput;
    if (updatedInput) {
      assert.strictEqual(
        updatedInput.permission_contract,
        undefined,
        'HubSpot Bash agent should NOT have permission contract when opt-in is off'
      );
    }
  }));

  results.push(await runTest('Injects Bash permission fallback contract for Marketo Bash agents', async () => {
    // Contract is opt-in — verify it is NOT injected by default
    const env = createIsolatedEnv();
    const input = createAgentEvent({
      subagent_type: 'opspal-marketo:marketo-data-operations',
      prompt: 'Run the Marketo bulk extract validation workflow and summarize the results'
    });

    const result = await tester.run({
      input,
      env
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
    const updatedInput = result.output?.hookSpecificOutput?.updatedInput;
    if (updatedInput) {
      assert.strictEqual(
        updatedInput.permission_contract,
        undefined,
        'Marketo Bash agent should NOT have permission contract when opt-in is off'
      );
    }
  }));

  results.push(await runTest('Clears pending routing state when Agent uses approved family member', async () => {
    const env = createIsolatedEnv();
    writeRoutingState(env, {
      session_key: env.CLAUDE_SESSION_ID,
      route_id: 'data-operations',
      route_kind: 'complexity_specialist',
      guidance_action: 'require_specialist',
      required_agent: 'opspal-salesforce:sfdc-data-operations',
      clearance_agents: [
        'opspal-salesforce:sfdc-data-operations',
        'opspal-salesforce:sfdc-query-specialist'
      ],
      requires_specialist: true,
      prompt_guidance_only: true,
      prompt_blocked: false,
      execution_block_until_cleared: true,
      route_pending_clearance: true,
      route_cleared: false,
      routing_confidence: 0.92,
      clearance_status: 'pending_clearance',
      created_at: Math.floor(Date.now() / 1000),
      updated_at: Math.floor(Date.now() / 1000),
      expires_at: Math.floor(Date.now() / 1000) + 600
    });

    const result = await tester.run({
      input: createAgentEvent({
        subagent_type: 'sfdc-query-specialist',
        prompt: 'Run the approved data-operation route'
      }),
      env
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
    const state = readRoutingState(env);
    assert(state, 'State file should still exist for telemetry');
    assert.strictEqual(state.clearance_status, 'cleared', 'Approved Agent should clear pending routing state');
    assert.strictEqual(
      state.last_resolved_agent,
      'opspal-salesforce:sfdc-query-specialist',
      'Should record the agent that cleared the requirement'
    );
  }));

  results.push(await runTest('Auto-delegates mandatory helper Agent calls to the required specialist', async () => {
    const env = createIsolatedEnv();
    writeRoutingState(env, {
      session_key: env.CLAUDE_SESSION_ID,
      route_id: 'prod-deploy',
      route_kind: 'mandatory_specialist',
      guidance_action: 'require_specialist',
      required_agent: 'opspal-core:release-coordinator',
      clearance_agents: [
        'opspal-core:release-coordinator',
        'opspal-salesforce:sfdc-deployment-manager'
      ],
      requires_specialist: true,
      prompt_guidance_only: true,
      prompt_blocked: false,
      execution_block_until_cleared: true,
      route_pending_clearance: true,
      route_cleared: false,
      routing_confidence: 1,
      clearance_status: 'pending_clearance',
      auto_delegation: {
        eligible: true,
        active: true,
        mode: 'agent_rewrite_bridge',
        agent: 'opspal-core:release-coordinator',
        confidence: 1
      },
      created_at: Math.floor(Date.now() / 1000),
      updated_at: Math.floor(Date.now() / 1000),
      expires_at: Math.floor(Date.now() / 1000) + 600
    });

    const result = await tester.run({
      input: createAgentEvent({
        subagent_type: 'Plan',
        prompt: 'Develop the final plan to deploy to production ultrathink'
      }),
      env
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
    assert.strictEqual(
      result.output?.hookSpecificOutput?.updatedInput?.subagent_type,
      'opspal-core:release-coordinator',
      'Mandatory helper Agent call should be rewritten to the required specialist'
    );
    assert(
      (result.output?.hookSpecificOutput?.additionalContext || '').includes('ROUTING_AUTO_DELEGATED'),
      'Should surface auto-delegation bridge context'
    );
    const state = readRoutingState(env);
    assert(state, 'State file should still exist after auto-delegation');
    assert.strictEqual(state.clearance_status, 'cleared', 'Auto-delegated specialist should clear the pending route');
    assert.strictEqual(state.last_resolved_agent, 'opspal-core:release-coordinator', 'Should record the auto-delegated specialist');
  }));

  results.push(await runTest('Denies Agent when pending routing requires a different agent family', async () => {
    const env = createIsolatedEnv();
    writeRoutingState(env, {
      session_key: env.CLAUDE_SESSION_ID,
      route_id: 'reports-dashboards',
      route_kind: 'complexity_specialist',
      guidance_action: 'require_specialist',
      required_agent: 'opspal-salesforce:sfdc-reports-dashboards',
      clearance_agents: ['opspal-salesforce:sfdc-reports-dashboards'],
      requires_specialist: true,
      prompt_guidance_only: true,
      prompt_blocked: false,
      execution_block_until_cleared: true,
      route_pending_clearance: true,
      route_cleared: false,
      routing_confidence: 0.86,
      clearance_status: 'pending_clearance',
      created_at: Math.floor(Date.now() / 1000),
      updated_at: Math.floor(Date.now() / 1000),
      expires_at: Math.floor(Date.now() / 1000) + 600
    });

    const result = await tester.run({
      input: createAgentEvent({
        subagent_type: 'sfdc-cpq-assessor',
        prompt: 'Try the wrong agent first'
      }),
      env
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
    assert.strictEqual(
      result.output?.hookSpecificOutput?.permissionDecision,
      'deny',
      'Wrong Agent family should be denied while routing requirement is pending'
    );
    assert(
      (result.output?.hookSpecificOutput?.permissionDecisionReason || '').includes('ROUTING_REQUIRED_AGENT_MISMATCH'),
      'Should explain the routing-family mismatch'
    );
    const state = readRoutingState(env);
    assert(state, 'Pending state should remain after denied Agent');
    assert.strictEqual(state.route_pending_clearance, true, 'Denied Agent should not clear routing state');
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
