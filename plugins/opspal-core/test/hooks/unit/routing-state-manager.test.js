#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const childProcess = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '../../../../..');
const STATE_MANAGER = path.join(PROJECT_ROOT, 'plugins/opspal-core/scripts/lib/routing-state-manager.js');

function createTempHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'routing-state-manager-'));
}

function getStateFile(home, sessionKey) {
  return path.join(home, '.claude', 'routing-state', `${sessionKey}.json`);
}

function runStateManager(command, sessionKey, options = {}) {
  const env = {
    ...process.env,
    HOME: options.home
  };

  return childProcess.execFileSync(
    'node',
    [STATE_MANAGER, command, sessionKey, ...(options.extraArgs || [])],
    {
      cwd: PROJECT_ROOT,
      env,
      input: options.input
    }
  ).toString();
}

async function runTest(name, testFn) {
  process.stdout.write(`  ${name}... `);
  try {
    await testFn();
    console.log('OK');
    return { passed: true };
  } catch (error) {
    console.log('FAIL');
    console.log(`    Error: ${error.message}`);
    return { passed: false };
  }
}

async function runAllTests() {
  console.log('\n[Tests] routing-state-manager.js\n');
  const results = [];

  results.push(await runTest('Writes only explicit routing fields for new state', async () => {
    const home = createTempHome();
    const sessionKey = 'explicit-state';
    const stateFile = getStateFile(home, sessionKey);

    try {
      runStateManager('save', sessionKey, {
        home,
        input: JSON.stringify({
          session_key: sessionKey,
          route_kind: 'complexity_specialist',
          guidance_action: 'require_specialist',
          required_agent: 'opspal-salesforce:sfdc-cpq-assessor',
          clearance_agents: ['opspal-salesforce:sfdc-cpq-assessor'],
          requires_specialist: true,
          prompt_guidance_only: true,
          prompt_blocked: false,
          execution_block_until_cleared: true,
          route_pending_clearance: true,
          route_cleared: false,
          clearance_status: 'pending_clearance',
          routing_confidence: 0.97
        })
      });

      const persisted = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
      assert(!Object.prototype.hasOwnProperty.call(persisted, 'recommended_agent'), 'New state should not persist recommended_agent');
      assert(!Object.prototype.hasOwnProperty.call(persisted, 'blocked'), 'New state should not persist blocked');
      assert(!Object.prototype.hasOwnProperty.call(persisted, 'action'), 'New state should not persist action');
      assert(!Object.prototype.hasOwnProperty.call(persisted, 'status'), 'New state should not persist status');
      assert.strictEqual(persisted.clearance_status, 'pending_clearance', 'New state should persist clearance_status');
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  }));

  results.push(await runTest('Does not infer explicit routing semantics from legacy-only state aliases', async () => {
    const home = createTempHome();
    const sessionKey = 'legacy-state';
    const stateDir = path.join(home, '.claude', 'routing-state');
    const stateFile = getStateFile(home, sessionKey);

    try {
      fs.mkdirSync(stateDir, { recursive: true });
      fs.writeFileSync(stateFile, JSON.stringify({
        session_key: sessionKey,
        recommended_agent: 'opspal-salesforce:sfdc-cpq-assessor',
        action: 'BLOCKED',
        blocked: true,
        status: 'pending',
        created_at: Math.floor(Date.now() / 1000),
        updated_at: Math.floor(Date.now() / 1000),
        expires_at: Math.floor(Date.now() / 1000) + 600
      }, null, 2));

      const normalized = JSON.parse(runStateManager('get', sessionKey, { home }));
      assert.strictEqual(normalized.required_agent, null, 'Legacy recommended_agent should no longer normalize to required_agent');
      assert.strictEqual(normalized.execution_block_until_cleared, false, 'Legacy blocked/action should no longer normalize to execution_block_until_cleared');
      assert.strictEqual(normalized.guidance_action, 'recommend_specialist', 'Legacy action should no longer normalize to guidance_action');
      assert.strictEqual(normalized.clearance_status, 'cleared', 'Legacy status alias should no longer normalize to clearance_status');
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  }));

  // =========================================================================
  // Cross-family stale route detection tests
  // =========================================================================

  results.push(await runTest('extractAgentFamily returns correct families via clear-stale same_family response', async () => {
    const home = createTempHome();
    const sessionKey = 'family-extract-test';

    try {
      const oldTimestamp = Math.floor(Date.now() / 1000) - 600;
      const stateDir = path.join(home, '.claude', 'routing-state');
      const stateFile = path.join(stateDir, `${sessionKey}.json`);
      fs.mkdirSync(stateDir, { recursive: true });
      fs.writeFileSync(stateFile, JSON.stringify({
        session_key: sessionKey,
        required_agent: 'opspal-salesforce:sfdc-cpq-assessor',
        clearance_agents: ['opspal-salesforce:sfdc-cpq-assessor'],
        execution_block_until_cleared: true,
        route_pending_clearance: true,
        clearance_status: 'pending_clearance',
        created_at: oldTimestamp,
        updated_at: oldTimestamp,
        expires_at: oldTimestamp + 900
      }));

      const output = runStateManager('clear-stale', sessionKey, {
        home,
        extraArgs: ['salesforce']
      });
      const result = JSON.parse(output);
      assert.strictEqual(result.cleared, false, 'Same family should not be cleared');
      assert.strictEqual(result.reason, 'same_family');
      assert.strictEqual(result.pendingFamily, 'salesforce');
      assert.strictEqual(result.requestedFamily, 'salesforce');
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  }));

  results.push(await runTest('clear-stale clears cross-family stale state when old enough', async () => {
    const home = createTempHome();
    const sessionKey = 'cross-family-clear-test';

    try {
      const oldTimestamp = Math.floor(Date.now() / 1000) - 600; // 10 minutes ago
      const stateDir = path.join(home, '.claude', 'routing-state');
      const stateFile = path.join(stateDir, `${sessionKey}.json`);
      fs.mkdirSync(stateDir, { recursive: true });
      fs.writeFileSync(stateFile, JSON.stringify({
        session_key: sessionKey,
        required_agent: 'opspal-marketo:marketo-data-operations',
        clearance_agents: ['opspal-marketo:marketo-data-operations'],
        execution_block_until_cleared: true,
        route_pending_clearance: true,
        clearance_status: 'pending_clearance',
        created_at: oldTimestamp,
        updated_at: oldTimestamp,
        expires_at: oldTimestamp + 900
      }));

      const output = runStateManager('clear-stale', sessionKey, {
        home,
        extraArgs: ['salesforce']
      });
      const result = JSON.parse(output);
      assert.strictEqual(result.cleared, true, 'Cross-family stale state should be cleared');
      assert.strictEqual(result.reason, 'cross_family_stale_carryover');
      assert.strictEqual(result.pendingFamily, 'marketo');
      assert.strictEqual(result.requestedFamily, 'salesforce');
      assert.ok(!fs.existsSync(stateFile), 'State file should have been deleted');
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  }));

  results.push(await runTest('clear-stale preserves same-family pending state', async () => {
    const home = createTempHome();
    const sessionKey = 'same-family-preserve-test';

    try {
      const oldTimestamp = Math.floor(Date.now() / 1000) - 600;
      const stateDir = path.join(home, '.claude', 'routing-state');
      const stateFile = path.join(stateDir, `${sessionKey}.json`);
      fs.mkdirSync(stateDir, { recursive: true });
      fs.writeFileSync(stateFile, JSON.stringify({
        session_key: sessionKey,
        required_agent: 'opspal-salesforce:sfdc-cpq-assessor',
        clearance_agents: ['opspal-salesforce:sfdc-cpq-assessor'],
        execution_block_until_cleared: true,
        route_pending_clearance: true,
        clearance_status: 'pending_clearance',
        created_at: oldTimestamp,
        updated_at: oldTimestamp,
        expires_at: oldTimestamp + 900
      }));

      const output = runStateManager('clear-stale', sessionKey, {
        home,
        extraArgs: ['salesforce']
      });
      const result = JSON.parse(output);
      assert.strictEqual(result.cleared, false);
      assert.strictEqual(result.reason, 'same_family');
      assert.ok(fs.existsSync(stateFile), 'State file should still exist');
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  }));

  results.push(await runTest('clear-stale preserves cross-family state when too recent', async () => {
    const home = createTempHome();
    const sessionKey = 'cross-family-recent-test';

    try {
      const recentTimestamp = Math.floor(Date.now() / 1000) - 60; // 1 minute ago
      const stateDir = path.join(home, '.claude', 'routing-state');
      const stateFile = path.join(stateDir, `${sessionKey}.json`);
      fs.mkdirSync(stateDir, { recursive: true });
      fs.writeFileSync(stateFile, JSON.stringify({
        session_key: sessionKey,
        required_agent: 'opspal-marketo:marketo-data-operations',
        clearance_agents: ['opspal-marketo:marketo-data-operations'],
        execution_block_until_cleared: true,
        route_pending_clearance: true,
        clearance_status: 'pending_clearance',
        created_at: recentTimestamp,
        updated_at: recentTimestamp,
        expires_at: recentTimestamp + 900
      }));

      const output = runStateManager('clear-stale', sessionKey, {
        home,
        extraArgs: ['salesforce']
      });
      const result = JSON.parse(output);
      assert.strictEqual(result.cleared, false, 'Recent cross-family state should not be cleared');
      assert.strictEqual(result.reason, 'too_recent_for_auto_clear');
      assert.ok(fs.existsSync(stateFile), 'State file should still exist');
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  }));

  results.push(await runTest('clear-stale returns no_state when no pending route exists', async () => {
    const home = createTempHome();
    const sessionKey = 'no-state-test';

    try {
      const stateDir = path.join(home, '.claude', 'routing-state');
      fs.mkdirSync(stateDir, { recursive: true });

      const output = runStateManager('clear-stale', sessionKey, {
        home,
        extraArgs: ['salesforce']
      });
      const result = JSON.parse(output);
      assert.strictEqual(result.cleared, false);
      assert.strictEqual(result.reason, 'no_state');
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  }));

  results.push(await runTest('clear-explicit-override clears pending route for approved explicit agents', async () => {
    const home = createTempHome();
    const sessionKey = 'explicit-override-clear-test';

    try {
      const timestamp = Math.floor(Date.now() / 1000);
      const stateDir = path.join(home, '.claude', 'routing-state');
      const stateFile = path.join(stateDir, `${sessionKey}.json`);
      fs.mkdirSync(stateDir, { recursive: true });
      fs.writeFileSync(stateFile, JSON.stringify({
        session_key: sessionKey,
        required_agent: 'opspal-salesforce:sfdc-automation-auditor',
        clearance_agents: [
          'opspal-salesforce:sfdc-automation-auditor',
          'opspal-salesforce:sfdc-automation-builder'
        ],
        execution_block_until_cleared: true,
        route_pending_clearance: true,
        route_cleared: false,
        clearance_status: 'pending_clearance',
        created_at: timestamp,
        updated_at: timestamp,
        expires_at: timestamp + 900
      }));

      const output = runStateManager('clear-explicit-override', sessionKey, {
        home,
        extraArgs: ['opspal-salesforce:sfdc-automation-builder']
      });
      const result = JSON.parse(output);
      assert.strictEqual(result.cleared, true, 'Approved explicit agent should clear pending state');
      assert.strictEqual(result.reason, 'explicit_agent_override');
      assert.strictEqual(result.clearedAgent, 'opspal-salesforce:sfdc-automation-builder');

      const persisted = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
      assert.strictEqual(persisted.clearance_status, 'cleared', 'State should be marked cleared');
      assert.strictEqual(persisted.last_resolved_agent, 'opspal-salesforce:sfdc-automation-builder', 'State should record the explicit override agent');
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  }));

  results.push(await runTest('clear-explicit-override preserves pending route when explicit agent lacks clearance', async () => {
    const home = createTempHome();
    const sessionKey = 'explicit-override-deny-test';

    try {
      const timestamp = Math.floor(Date.now() / 1000);
      const stateDir = path.join(home, '.claude', 'routing-state');
      const stateFile = path.join(stateDir, `${sessionKey}.json`);
      fs.mkdirSync(stateDir, { recursive: true });
      fs.writeFileSync(stateFile, JSON.stringify({
        session_key: sessionKey,
        required_agent: 'opspal-salesforce:sfdc-automation-auditor',
        clearance_agents: ['opspal-salesforce:sfdc-automation-auditor'],
        execution_block_until_cleared: true,
        route_pending_clearance: true,
        route_cleared: false,
        clearance_status: 'pending_clearance',
        created_at: timestamp,
        updated_at: timestamp,
        expires_at: timestamp + 900
      }));

      const output = runStateManager('clear-explicit-override', sessionKey, {
        home,
        extraArgs: ['opspal-salesforce:sfdc-automation-builder']
      });
      const result = JSON.parse(output);
      assert.strictEqual(result.cleared, false, 'Non-cleared agents should not clear the route');
      assert.strictEqual(result.reason, 'agent_not_in_clearance_list');

      const persisted = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
      assert.strictEqual(persisted.clearance_status, 'pending_clearance', 'Pending state should remain active');
      assert.strictEqual(persisted.route_pending_clearance, true, 'Pending clearance flag should remain true');
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  }));

  results.push(await runTest('clear-stale with custom threshold-seconds overrides default', async () => {
    const home = createTempHome();
    const sessionKey = 'custom-threshold-test';

    try {
      // State is 120 seconds old - default threshold (300s) would preserve it,
      // but custom threshold of 60s should clear it
      const timestamp = Math.floor(Date.now() / 1000) - 120;
      const stateDir = path.join(home, '.claude', 'routing-state');
      const stateFile = path.join(stateDir, `${sessionKey}.json`);
      fs.mkdirSync(stateDir, { recursive: true });
      fs.writeFileSync(stateFile, JSON.stringify({
        session_key: sessionKey,
        required_agent: 'opspal-marketo:marketo-data-operations',
        clearance_agents: ['opspal-marketo:marketo-data-operations'],
        execution_block_until_cleared: true,
        route_pending_clearance: true,
        clearance_status: 'pending_clearance',
        created_at: timestamp,
        updated_at: timestamp,
        expires_at: timestamp + 900
      }));

      const output = runStateManager('clear-stale', sessionKey, {
        home,
        extraArgs: ['salesforce', '--threshold-seconds=60']
      });
      const result = JSON.parse(output);
      assert.strictEqual(result.cleared, true, 'Custom threshold should allow clearing');
      assert.strictEqual(result.reason, 'cross_family_stale_carryover');
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  }));

  results.push(await runTest('Regression: stale Marketo route does not block Salesforce after clear-stale', async () => {
    const home = createTempHome();
    const sessionKey = 'regression-marketo-sf-test';

    try {
      const oldTimestamp = Math.floor(Date.now() / 1000) - 600;
      const stateDir = path.join(home, '.claude', 'routing-state');
      const stateFile = path.join(stateDir, `${sessionKey}.json`);
      fs.mkdirSync(stateDir, { recursive: true });
      fs.writeFileSync(stateFile, JSON.stringify({
        session_key: sessionKey,
        required_agent: 'opspal-marketo:marketo-data-operations',
        clearance_agents: ['opspal-marketo:marketo-data-operations'],
        route_kind: 'complexity_specialist',
        guidance_action: 'require_specialist',
        requires_specialist: true,
        execution_block_until_cleared: true,
        route_pending_clearance: true,
        route_cleared: false,
        clearance_status: 'pending_clearance',
        routing_confidence: 0.9,
        created_at: oldTimestamp,
        updated_at: oldTimestamp,
        expires_at: oldTimestamp + 900
      }));

      // Step 1: clear-stale should remove Marketo state when Salesforce is requested
      const clearOutput = runStateManager('clear-stale', sessionKey, {
        home,
        extraArgs: ['salesforce']
      });
      const clearResult = JSON.parse(clearOutput);
      assert.strictEqual(clearResult.cleared, true, 'Stale Marketo state should be cleared for Salesforce');

      // Step 2: check should now report no active state
      const checkOutput = runStateManager('check', sessionKey, { home });
      const checkResult = JSON.parse(checkOutput);
      assert.strictEqual(checkResult.hasState, false, 'No state should remain after cross-family clear');
      assert.strictEqual(checkResult.executionBlockActive, false, 'No execution block should be active');
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  }));

  results.push(await runTest('record-integrity-stop persists proof-failure execution block metadata', async () => {
    const home = createTempHome();
    const sessionKey = 'integrity-stop-record-test';

    try {
      const output = runStateManager('record-integrity-stop', sessionKey, {
        home,
        extraArgs: ['sfdc-automation-auditor', 'salesforce', 'missing_receipt', 'plan_only=2; execution=0']
      });
      const result = JSON.parse(output);
      assert.strictEqual(result.recorded, true);
      assert.strictEqual(result.integrity_stop_active, true);
      assert.strictEqual(result.integrity_stop_agent, 'sfdc-automation-auditor');
      assert.strictEqual(result.integrity_stop_platform, 'salesforce');
      assert.strictEqual(result.integrity_stop_reason, 'missing_receipt');

      const checkOutput = runStateManager('check', sessionKey, { home });
      const checkResult = JSON.parse(checkOutput);
      assert.strictEqual(checkResult.integrityStopActive, true, 'Check output should expose active integrity stop');
      assert.strictEqual(checkResult.integrityStopAgent, 'sfdc-automation-auditor');
      assert.strictEqual(checkResult.integrityStopPlatform, 'salesforce');
      assert.strictEqual(checkResult.integrityStopReason, 'missing_receipt');
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  }));

  results.push(await runTest('mark-cleared clears integrity-stop metadata for a re-delegated specialist', async () => {
    const home = createTempHome();
    const sessionKey = 'integrity-stop-clear-test';

    try {
      runStateManager('record-integrity-stop', sessionKey, {
        home,
        extraArgs: ['sfdc-automation-auditor', 'salesforce', 'missing_receipt', 'heuristic_execution=4; plan_only=0']
      });

      runStateManager('mark-cleared', sessionKey, {
        home,
        extraArgs: ['opspal-salesforce:sfdc-automation-auditor']
      });

      const checkOutput = runStateManager('check', sessionKey, { home });
      const checkResult = JSON.parse(checkOutput);
      assert.strictEqual(checkResult.integrityStopActive, false, 'mark-cleared should clear integrity stop');
      assert.strictEqual(checkResult.routeCleared, true, 'Route should remain cleared after specialist re-delegation');
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  }));

  const passed = results.filter((result) => result.passed).length;
  const failed = results.length - passed;

  console.log(`\nPassed: ${passed}`);
  console.log(`Failed: ${failed}`);

  if (failed > 0) {
    process.exit(1);
  }
}

runAllTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
