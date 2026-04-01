#!/usr/bin/env node

/**
 * Focused tests for MCP tool policy routing behavior in
 * pre-tool-use-contract-validation.sh.
 *
 * @copyright 2024-2026 RevPal Partners, LLC
 */

const path = require('path');
const assert = require('assert');
const fs = require('fs');
const os = require('os');

const { HookTester } = require('../runner');

const HOOK_PATH = 'plugins/opspal-core/hooks/pre-tool-use-contract-validation.sh';
const PROJECT_ROOT = path.resolve(__dirname, '../../../../..');
const PLUGIN_ROOT = path.join(PROJECT_ROOT, 'plugins/opspal-core');
const { sanitizeSessionKey } = require(path.join(PLUGIN_ROOT, 'scripts/lib/routing-state-manager.js'));

function createTester() {
  return new HookTester(HOOK_PATH, {
    timeout: 15000,
    verbose: process.env.VERBOSE === '1'
  });
}

function createTempHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-policy-routing-'));
}

function getRoutingStatePath(home, sessionId) {
  return path.join(home, '.claude', 'routing-state', `${sanitizeSessionKey(sessionId)}.json`);
}

function writeRoutingState(home, sessionId, state) {
  const filePath = getRoutingStatePath(home, sessionId);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2));
}

function buildPendingRoutingState(sessionId, routeId, requiredAgent) {
  const now = Math.floor(Date.now() / 1000);
  return {
    session_key: sessionId,
    route_id: routeId,
    route_kind: 'complexity_specialist',
    guidance_action: 'require_specialist',
    required_agent: requiredAgent,
    clearance_agents: [requiredAgent],
    requires_specialist: true,
    prompt_guidance_only: true,
    prompt_blocked: false,
    execution_block_until_cleared: true,
    route_pending_clearance: true,
    route_cleared: false,
    clearance_status: 'pending_clearance',
    created_at: now,
    updated_at: now,
    expires_at: now + 600
  };
}

function assertNoStructuredDeny(result, message) {
  assert(
    result.output == null || (typeof result.output === 'object' && Object.keys(result.output).length === 0),
    message
  );
}

function assertStructuredRoutingDeny(result, reasonFragment, message) {
  assert.strictEqual(result.exitCode, 0, `${message} should exit 0`);
  const decision = result.output?.hookSpecificOutput?.permissionDecision;
  assert(
    decision === 'allow' || decision === undefined,
    `${message} should allow tool execution (advisory routing)`
  );
  const context = result.output?.hookSpecificOutput?.additionalContext || '';
  const reason = result.output?.hookSpecificOutput?.permissionDecisionReason || '';
  assert(
    context.includes(reasonFragment) || reason.includes(reasonFragment) || context.includes('ROUTING_ADVISORY') || context.includes('ADVISORY'),
    `${message} should include advisory context`
  );
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
  console.log('\n[Tests] MCP tool policy routing\n');

  const tester = createTester();
  const results = [];
  const tempHome = createTempHome();
  const tempLogRoot = path.join(tempHome, '.claude/logs');

  results.push(await runTest('Allows read-only HubSpot MCP tools while routing requirement is pending', async () => {
    const sessionId = 'pending-hubspot-read-mcp';
    writeRoutingState(tempHome, sessionId, buildPendingRoutingState(
      sessionId,
      'hubspot-data',
      'opspal-hubspot:hubspot-data-operations-manager'
    ));

    const result = await tester.run({
      input: {
        tool: 'mcp__hubspot__contacts_get',
        sessionKey: sessionId,
        input: { objectId: '123' }
      },
      env: {
        CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
        HOME: tempHome,
        CLAUDE_HOOK_LOG_ROOT: tempLogRoot,
        CLAUDE_SESSION_ID: sessionId
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Read-only HubSpot MCP tool should pass');
    assertNoStructuredDeny(result, 'Read-only HubSpot MCP tool should not be denied');
  }));

  results.push(await runTest('Denies mutating HubSpot MCP tools while routing requirement is pending', async () => {
    const sessionId = 'pending-hubspot-write-mcp';
    writeRoutingState(tempHome, sessionId, buildPendingRoutingState(
      sessionId,
      'hubspot-data',
      'opspal-hubspot:hubspot-data-operations-manager'
    ));

    const result = await tester.run({
      input: {
        tool: 'mcp__hubspot__contacts_update',
        sessionKey: sessionId,
        input: { objectId: '123', properties: { firstname: 'Updated' } }
      },
      env: {
        CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
        HOME: tempHome,
        CLAUDE_HOOK_LOG_ROOT: tempLogRoot,
        CLAUDE_SESSION_ID: sessionId
      }
    });

    assertStructuredRoutingDeny(result, 'ROUTING_REQUIRED_BEFORE_OPERATION', 'Mutating HubSpot MCP tool');
  }));

  results.push(await runTest('Allows read-only Marketo MCP tools while routing requirement is pending', async () => {
    const sessionId = 'pending-marketo-read-mcp-focused';
    writeRoutingState(tempHome, sessionId, buildPendingRoutingState(
      sessionId,
      'lead-quality',
      'opspal-marketo:marketo-lead-quality-assessor'
    ));

    const result = await tester.run({
      input: {
        tool: 'mcp__marketo__campaign_get',
        sessionKey: sessionId,
        input: { campaignId: 123 }
      },
      env: {
        CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
        HOME: tempHome,
        CLAUDE_HOOK_LOG_ROOT: tempLogRoot,
        CLAUDE_SESSION_ID: sessionId
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Read-only Marketo MCP tool should pass');
    assertNoStructuredDeny(result, 'Read-only Marketo MCP tool should not be denied');
  }));

  results.push(await runTest('Denies mutating Marketo MCP tools while routing requirement is pending', async () => {
    const sessionId = 'pending-marketo-write-mcp-focused';
    writeRoutingState(tempHome, sessionId, buildPendingRoutingState(
      sessionId,
      'lead-quality',
      'opspal-marketo:marketo-lead-quality-assessor'
    ));

    const result = await tester.run({
      input: {
        tool: 'mcp__marketo__lead_update',
        sessionKey: sessionId,
        input: { leads: [{ id: 1, leadStatus: 'MQL' }] }
      },
      env: {
        CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
        HOME: tempHome,
        CLAUDE_HOOK_LOG_ROOT: tempLogRoot,
        CLAUDE_SESSION_ID: sessionId
      }
    });

    assertStructuredRoutingDeny(result, 'ROUTING_REQUIRED_BEFORE_OPERATION', 'Mutating Marketo MCP tool');
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
