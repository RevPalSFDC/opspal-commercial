#!/usr/bin/env node

/**
 * Cross-Plugin Universal Agent Governance Tests
 *
 * Tests all per-plugin universal-agent-governance.sh hooks with cross-domain
 * agent names, crafted names, governance disable flags, and sub-agent context.
 *
 * @copyright 2024-2026 RevPal Partners, LLC
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

const { HookTester } = require('../runner');

const PROJECT_ROOT = path.resolve(__dirname, '../../../../..');

const GOVERNANCE_HOOKS = {
  salesforce: 'plugins/opspal-salesforce/hooks/universal-agent-governance.sh',
  hubspot: 'plugins/opspal-hubspot/hooks/universal-agent-governance.sh',
  marketo: 'plugins/opspal-marketo/hooks/universal-agent-governance.sh',
  monday: 'plugins/opspal-monday/hooks/universal-agent-governance.sh'
};

function createTester(plugin) {
  return new HookTester(GOVERNANCE_HOOKS[plugin], { timeout: 15000 });
}

function hookExists(plugin) {
  const hookPath = GOVERNANCE_HOOKS[plugin];
  const fullPath = path.isAbsolute(hookPath)
    ? hookPath
    : path.join(PROJECT_ROOT, hookPath);
  return fs.existsSync(fullPath);
}

function createAgentInput(agentName, prompt = 'Test operation') {
  return {
    tool_name: 'Agent',
    tool_input: {
      subagent_type: agentName,
      prompt
    }
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

function assertNotDenied(result, message) {
  assert.strictEqual(result.exitCode, 0, `${message} — should exit 0`);
  if (result.output && typeof result.output === 'object' && result.output.hookSpecificOutput) {
    const decision = result.output.hookSpecificOutput.permissionDecision;
    assert.notStrictEqual(decision, 'deny',
      `${message} — should NOT deny (got: ${result.output.hookSpecificOutput.permissionDecisionReason || 'none'})`);
  }
}

const BASE_ENV = {
  HOOK_TEST_MODE: '1'
};

async function runAllTests() {
  console.log('\n[Tests] Universal Agent Governance Cross-Plugin Tests\n');

  const results = [];

  // =========================================================================
  // ADV-GOV-01: SF governance recognizes org-prefixed SF agent
  // =========================================================================
  if (hookExists('salesforce')) {
    results.push(await runTest('ADV-GOV-01: SF governance handles acme-salesforce-reviewer', async () => {
      const tester = createTester('salesforce');
      const result = await tester.run({
        input: createAgentInput('acme-salesforce-reviewer', 'Review Salesforce configuration'),
        env: BASE_ENV
      });
      // Should enter SF governance (pattern *salesforce* matches) but not crash
      assert.strictEqual(result.exitCode, 0, 'Should exit 0');
    }));
  }

  // =========================================================================
  // ADV-GOV-02: HubSpot governance ignores SF agent
  // =========================================================================
  if (hookExists('hubspot')) {
    results.push(await runTest('ADV-GOV-02: HS governance passes through SF agent', async () => {
      const tester = createTester('hubspot');
      const result = await tester.run({
        input: createAgentInput('sfdc-deployment-manager', 'Deploy Salesforce metadata'),
        env: BASE_ENV
      });
      assertNotDenied(result, 'HS governance should not govern SF agents');
    }));
  }

  // =========================================================================
  // ADV-GOV-03: Monday governance ignores generic agent
  // =========================================================================
  if (hookExists('monday')) {
    results.push(await runTest('ADV-GOV-03: Monday governance passes through generic agent', async () => {
      const tester = createTester('monday');
      const result = await tester.run({
        input: createAgentInput('claude', 'What time is it?'),
        env: BASE_ENV
      });
      assertNotDenied(result, 'Monday governance should not govern generic agents');
    }));
  }

  // =========================================================================
  // ADV-GOV-04: Marketo governance with marketo-named agent
  // =========================================================================
  if (hookExists('marketo')) {
    results.push(await runTest('ADV-GOV-04: MK governance handles marketo agent', async () => {
      const tester = createTester('marketo');
      const result = await tester.run({
        input: createAgentInput('marketo-lead-manager', 'Query leads'),
        env: BASE_ENV
      });
      // Should enter MK governance and handle gracefully
      assert.strictEqual(result.exitCode, 0, 'Should exit 0');
    }));
  }

  // =========================================================================
  // ADV-GOV-05: SF governance disabled via env var
  // =========================================================================
  if (hookExists('salesforce')) {
    results.push(await runTest('ADV-GOV-05: SF governance disabled via AGENT_GOVERNANCE_ENABLED=false', async () => {
      const tester = createTester('salesforce');
      const result = await tester.run({
        input: createAgentInput('sfdc-deployment-manager', 'Deploy to production'),
        env: {
          ...BASE_ENV,
          AGENT_GOVERNANCE_ENABLED: 'false'
        }
      });
      assert.strictEqual(result.exitCode, 0, 'Should exit 0 when governance disabled');
    }));
  }

  // =========================================================================
  // ADV-GOV-06: HubSpot governance disabled via env var
  // =========================================================================
  if (hookExists('hubspot')) {
    results.push(await runTest('ADV-GOV-06: HS governance disabled via HS_AGENT_GOVERNANCE_ENABLED=false', async () => {
      const tester = createTester('hubspot');
      const result = await tester.run({
        input: createAgentInput('hubspot-data-operations-manager', 'Bulk delete contacts'),
        env: {
          ...BASE_ENV,
          HS_AGENT_GOVERNANCE_ENABLED: 'false'
        }
      });
      assert.strictEqual(result.exitCode, 0, 'Should exit 0 when governance disabled');
    }));
  }

  // =========================================================================
  // ADV-GOV-07: Marketo governance disabled via env var
  // =========================================================================
  if (hookExists('marketo')) {
    results.push(await runTest('ADV-GOV-07: MK governance disabled via MARKETO_AGENT_GOVERNANCE_ENABLED=false', async () => {
      const tester = createTester('marketo');
      const result = await tester.run({
        input: createAgentInput('marketo-automation-orchestrator', 'Mass campaign activation'),
        env: {
          ...BASE_ENV,
          MARKETO_AGENT_GOVERNANCE_ENABLED: 'false'
        }
      });
      assert.strictEqual(result.exitCode, 0, 'Should exit 0 when governance disabled');
    }));
  }

  // =========================================================================
  // ADV-GOV-08: Monday governance disabled via env var
  // =========================================================================
  if (hookExists('monday')) {
    results.push(await runTest('ADV-GOV-08: Monday governance disabled via MONDAY_AGENT_GOVERNANCE_ENABLED=0', async () => {
      const tester = createTester('monday');
      const result = await tester.run({
        input: createAgentInput('opspal-monday:monday-board-manager', 'Delete all boards'),
        env: {
          ...BASE_ENV,
          MONDAY_AGENT_GOVERNANCE_ENABLED: '0'
        }
      });
      assert.strictEqual(result.exitCode, 0, 'Should exit 0 when governance disabled');
    }));
  }

  // =========================================================================
  // ADV-GOV-09: Cross-plugin agent spawn — SF governance ignores HubSpot agent
  // =========================================================================
  if (hookExists('salesforce')) {
    results.push(await runTest('ADV-GOV-09: SF governance passes through HS agent', async () => {
      const tester = createTester('salesforce');
      const result = await tester.run({
        input: createAgentInput('opspal-hubspot:hubspot-contact-manager', 'Update contacts'),
        env: BASE_ENV
      });
      assertNotDenied(result, 'SF governance should not govern HubSpot agents');
    }));
  }

  // =========================================================================
  // ADV-GOV-10: Empty stdin — all hooks handle gracefully
  // =========================================================================
  for (const [plugin, hookPath] of Object.entries(GOVERNANCE_HOOKS)) {
    if (!hookExists(plugin)) continue;

    results.push(await runTest(`ADV-GOV-10: ${plugin} governance handles empty stdin`, async () => {
      const tester = createTester(plugin);
      const result = await tester.run({
        stdin: '',
        env: BASE_ENV
      });
      assert.strictEqual(result.exitCode, 0,
        `${plugin} governance must not crash on empty stdin`);
    }));
  }

  // =========================================================================
  // ADV-GOV-11: Malformed JSON — all hooks handle gracefully
  // =========================================================================
  for (const [plugin, hookPath] of Object.entries(GOVERNANCE_HOOKS)) {
    if (!hookExists(plugin)) continue;

    results.push(await runTest(`ADV-GOV-11: ${plugin} governance handles garbled JSON`, async () => {
      const tester = createTester(plugin);
      const result = await tester.run({
        stdin: '{{{not json',
        env: BASE_ENV
      });
      assert.strictEqual(result.exitCode, 0,
        `${plugin} governance must not crash on garbled JSON`);
    }));
  }

  // =========================================================================
  // ADV-GOV-12: Sub-agent context (CLAUDE_TASK_ID set)
  // =========================================================================
  if (hookExists('salesforce')) {
    results.push(await runTest('ADV-GOV-12: SF governance with CLAUDE_TASK_ID (sub-agent)', async () => {
      const tester = createTester('salesforce');
      const result = await tester.run({
        input: createAgentInput('sfdc-deployment-manager', 'Deploy to production'),
        env: {
          ...BASE_ENV,
          CLAUDE_TASK_ID: 'task-sub-agent-123'
        }
      });
      assert.strictEqual(result.exitCode, 0, 'Should exit 0 for sub-agent context');
    }));
  }

  // =========================================================================
  // Summary
  // =========================================================================
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
