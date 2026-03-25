#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { HookTester } = require('../runner');

const HOOK_PATH = 'plugins/opspal-salesforce/hooks/pre-deploy-agent-context-check.sh';
const PROJECT_ROOT = path.resolve(__dirname, '../../../../..');
const PLUGIN_ROOT = path.join(PROJECT_ROOT, 'plugins/opspal-core');
const { sanitizeSessionKey } = require(path.join(PLUGIN_ROOT, 'scripts/lib/routing-state-manager.js'));

function createTester() {
  return new HookTester(HOOK_PATH, {
    timeout: 15000,
    verbose: process.env.VERBOSE === '1'
  });
}

function createIsolatedEnv(extra = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pre-deploy-agent-context-'));
  const sessionId = `pre-deploy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  return {
    HOME: home,
    CLAUDE_SESSION_ID: sessionId,
    ...extra
  };
}

function writeRoutingState(env, state) {
  const filePath = path.join(
    env.HOME,
    '.claude',
    'routing-state',
    `${sanitizeSessionKey(env.CLAUDE_SESSION_ID)}.json`
  );

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2));
}

function writeSalesforceCache(env, alias, payload) {
  const cacheRoot = env.TMPDIR || path.join(env.HOME, 'tmp');
  const cachePath = path.join(cacheRoot, `sf-org-info-${alias}.json`);
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  fs.writeFileSync(cachePath, JSON.stringify(payload, null, 2));
}

async function runTest(name, testFn) {
  process.stdout.write(`  ${name}... `);
  try {
    await testFn();
    console.log('OK');
    return { passed: true, name };
  } catch (error) {
    console.log('FAIL');
    console.log(`    Error: ${error.message}`);
    return { passed: false, name, error: error.message };
  }
}

async function runAllTests() {
  console.log('\n[Tests] pre-deploy-agent-context-check.sh\n');

  const tester = createTester();
  const results = [];

  results.push(await runTest('Hook exists and is valid', async () => {
    const validation = tester.validate();
    assert(validation.exists, 'Hook file should exist');
    assert(validation.executable, 'Hook should be executable');
    assert(validation.syntaxValid, 'Hook should have valid bash syntax');
  }));

  results.push(await runTest('Blocks direct source-scoped deploy commands outside agent context', async () => {
    const env = createIsolatedEnv();

    try {
      const result = await tester.run({
        input: {
          hook_event_name: 'PreToolUse',
          tool_name: 'Bash',
          session_key: env.CLAUDE_SESSION_ID,
          tool_input: {
            command: 'sf project deploy start --source-dir force-app/main/default/layouts --target-org production'
          }
        },
        env
      });

      assert.strictEqual(result.exitCode, 0, 'Hook should exit 0 with JSON blockExecution (not exit 2)');
      assert(result.stdout.includes('blockExecution'), 'Should emit blockExecution JSON to stdout');
      assert(result.stderr.includes('DEPLOY BLOCKED'), 'Should explain the direct deploy block');
      assert(
        result.stderr.includes('parent-context deployment handoff'),
        'Block guidance should steer the caller toward planning plus parent-context execution'
      );
    } finally {
      fs.rmSync(env.HOME, { recursive: true, force: true });
    }
  }));

  results.push(await runTest('Allows direct source-scoped deploys to sandbox-like target orgs', async () => {
    const result = await tester.run({
      input: {
        hook_event_name: 'PreToolUse',
        tool_name: 'Bash',
        tool_input: {
          command: 'sf project deploy start --source-dir force-app/main/default/layouts --target-org peregrine-sandbox'
        }
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Sandbox-like target orgs should bypass the agent deadlock');
    assert(
      result.stderr.includes('sandbox-like target org'),
      'Should explain why the direct deploy was allowed'
    );
  }));

  results.push(await runTest('Allows direct deploys when cached org info marks the target as sandbox', async () => {
    const env = createIsolatedEnv({
      TMPDIR: path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pre-deploy-cache-')), 'tmp')
    });

    try {
      writeSalesforceCache(env, 'client-primary', {
        orgType: 'sandbox',
        isSandbox: true
      });

      const result = await tester.run({
        input: {
          hook_event_name: 'PreToolUse',
          tool_name: 'Bash',
          tool_input: {
            command: 'sf project deploy start --source-dir force-app/main/default/layouts --target-org client-primary'
          }
        },
        env
      });

      assert.strictEqual(result.exitCode, 0, 'Cache-backed sandbox targets should bypass the direct deploy block');
      assert(
        result.stderr.includes('sandbox-like target org'),
        'Should explain that shared environment detection allowed the sandbox target'
      );
    } finally {
      fs.rmSync(path.dirname(env.TMPDIR), { recursive: true, force: true });
      fs.rmSync(env.HOME, { recursive: true, force: true });
    }
  }));

  results.push(await runTest('Ignores deploy lifecycle and status commands', async () => {
    const result = await tester.run({
      input: {
        hook_event_name: 'PreToolUse',
        tool_name: 'Bash',
        tool_input: {
          command: 'sf project deploy report --job-id 0Af000000000123AAA --target-org peregrine-sandbox --json'
        }
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Deploy report commands should pass through');
    assert(!result.stderr.includes('DEPLOY BLOCKED'), 'Lifecycle commands should not trigger deploy routing');
  }));

  results.push(await runTest('Allows approved deployment agents to run source-scoped deploys', async () => {
    const result = await tester.run({
      input: {
        hook_event_name: 'PreToolUse',
        tool_name: 'Bash',
        tool_input: {
          command: 'sf project deploy start --source-dir force-app/main/default/layouts --target-org production'
        }
      },
      env: {
        CLAUDE_AGENT_NAME: 'opspal-salesforce:sfdc-deployment-manager'
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Approved deployment agents should pass through');
  }));

  results.push(await runTest('Blocks planning-only orchestrators from running direct production deploys', async () => {
    const result = await tester.run({
      input: {
        hook_event_name: 'PreToolUse',
        tool_name: 'Bash',
        tool_input: {
          command: 'sf project deploy start --source-dir force-app/main/default/layouts --target-org production'
        }
      },
      env: {
        CLAUDE_AGENT_NAME: 'opspal-core:release-coordinator'
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Planning-only orchestrators should still use structured block semantics');
    assert(result.stdout.includes('blockExecution'), 'Should emit a structured deploy block');
    assert(result.stderr.includes('DEPLOY BLOCKED'), 'Should explain the blocked direct deploy');
  }));

  results.push(await runTest('Allows parent-context deploys after approved deployment planning clears the session', async () => {
    const env = createIsolatedEnv();

    try {
      writeRoutingState(env, {
        session_key: env.CLAUDE_SESSION_ID,
        route_kind: 'deployment_handoff',
        guidance_action: 'recommend_specialist',
        required_agent: 'opspal-salesforce:sfdc-deployment-manager',
        clearance_agents: ['opspal-salesforce:sfdc-deployment-manager'],
        requires_specialist: false,
        prompt_guidance_only: true,
        prompt_blocked: false,
        execution_block_until_cleared: false,
        route_pending_clearance: false,
        route_cleared: true,
        clearance_status: 'cleared',
        created_at: Math.floor(Date.now() / 1000),
        updated_at: Math.floor(Date.now() / 1000),
        expires_at: Math.floor(Date.now() / 1000) + 900,
        ttl_seconds: 900,
        last_resolved_agent: 'opspal-salesforce:sfdc-deployment-manager'
      });

      const result = await tester.run({
        input: {
          hook_event_name: 'PreToolUse',
          tool_name: 'Bash',
          session_key: env.CLAUDE_SESSION_ID,
          tool_input: {
            command: 'sf project deploy start --source-dir force-app/main/default/layouts --target-org production'
          }
        },
        env
      });

      assert.strictEqual(result.exitCode, 0, 'Cleared deploy handoff state should allow parent-context execution');
      assert(
        result.stderr.includes('approved deployment planning'),
        'Should explain why the direct deploy is now allowed'
      );
    } finally {
      fs.rmSync(env.HOME, { recursive: true, force: true });
    }
  }));

  results.push(await runTest('Allows parent-context deploys after release coordination planning clears the session', async () => {
    const env = createIsolatedEnv();

    try {
      writeRoutingState(env, {
        session_key: env.CLAUDE_SESSION_ID,
        route_kind: 'deployment_handoff',
        guidance_action: 'recommend_specialist',
        required_agent: 'opspal-core:release-coordinator',
        clearance_agents: ['opspal-core:release-coordinator'],
        requires_specialist: false,
        prompt_guidance_only: true,
        prompt_blocked: false,
        execution_block_until_cleared: false,
        route_pending_clearance: false,
        route_cleared: true,
        clearance_status: 'cleared',
        created_at: Math.floor(Date.now() / 1000),
        updated_at: Math.floor(Date.now() / 1000),
        expires_at: Math.floor(Date.now() / 1000) + 900,
        ttl_seconds: 900,
        last_resolved_agent: 'opspal-core:release-coordinator'
      });

      const result = await tester.run({
        input: {
          hook_event_name: 'PreToolUse',
          tool_name: 'Bash',
          session_key: env.CLAUDE_SESSION_ID,
          tool_input: {
            command: 'sf project deploy start --source-dir force-app/main/default/layouts --target-org production'
          }
        },
        env
      });

      assert.strictEqual(result.exitCode, 0, 'Release planning capability should clear parent-context deploy execution');
      assert(
        result.stderr.includes('approved deployment planning'),
        'Should explain that planning clearance unlocked the parent-context deploy'
      );
    } finally {
      fs.rmSync(env.HOME, { recursive: true, force: true });
    }
  }));

  results.push(await runTest('Bypasses deploy routing when agent_type marks sub-agent context', async () => {
    const result = await tester.run({
      input: {
        hook_event_name: 'PreToolUse',
        tool_name: 'Bash',
        agent_type: 'opspal-salesforce:sfdc-cpq-assessor',
        tool_input: {
          command: 'sf project deploy start --source-dir force-app/main/default/layouts --target-org production'
        }
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Sub-agent context should bypass deploy routing checks');
    assert(!result.stdout.includes('blockExecution'), 'Sub-agent bypass should not emit a deploy block');
  }));

  const passed = results.filter((result) => result.passed).length;
  const failed = results.filter((result) => !result.passed).length;

  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runAllTests().catch((error) => {
  console.error('Test runner error:', error);
  process.exit(1);
});
