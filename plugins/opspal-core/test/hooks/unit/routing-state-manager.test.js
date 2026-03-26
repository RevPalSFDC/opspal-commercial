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
