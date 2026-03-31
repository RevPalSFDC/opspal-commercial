#!/usr/bin/env node

/**
 * Unit Tests for pre-bash-hubspot-api.sh
 *
 * Covers direct HubSpot curl detection for read, read-like POST, and mutating
 * operations.
 *
 * @copyright 2024-2026 RevPal Partners, LLC
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const { HookTester } = require('../runner');

const PROJECT_ROOT = path.resolve(__dirname, '../../../../..');
const HUBSPOT_PLUGIN_ROOT = path.join(PROJECT_ROOT, 'plugins/opspal-hubspot');
const HOOK_PATH = 'plugins/opspal-hubspot/hooks/pre-bash-hubspot-api.sh';

function createTester() {
  return new HookTester(HOOK_PATH, {
    timeout: 10000,
    verbose: process.env.VERBOSE === '1'
  });
}

function createTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'hubspot-pre-bash-'));
}

function createEnv(tempRoot) {
  return {
    HOME: tempRoot,
    CLAUDE_PLUGIN_ROOT: HUBSPOT_PLUGIN_ROOT,
    CLAUDE_PROJECT_ROOT: tempRoot
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

async function runAllTests() {
  console.log('\n[Tests] pre-bash-hubspot-api.sh Tests\n');

  const tester = createTester();
  const results = [];

  results.push(await runTest('Hook exists and is valid', async () => {
    const validation = tester.validate();
    assert(validation.exists, 'Hook file should exist');
    assert(validation.executable, 'Hook should be executable');
    assert(validation.syntaxValid, 'Hook should have valid bash syntax');
  }));

  results.push(await runTest('Skips non-HubSpot curl commands', async () => {
    const tempRoot = createTempRoot();

    try {
      const result = await tester.run({
        input: {
          tool_name: 'Bash',
          tool_input: {
            command: 'curl -s https://api.example.com/v1/health'
          }
        },
        env: createEnv(tempRoot)
      });

      assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
      assert.deepStrictEqual(result.output, {}, 'Should emit a JSON no-op for unrelated curl commands');
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  }));

  results.push(await runTest('Allows read-only HubSpot GET requests', async () => {
    const tempRoot = createTempRoot();

    try {
      const result = await tester.run({
        input: {
          tool_name: 'Bash',
          tool_input: {
            command: 'curl -s https://api.hubapi.com/crm/v3/objects/contacts/123'
          }
        },
        env: createEnv(tempRoot)
      });

      assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
      assert.deepStrictEqual(result.output, {}, 'Read-only GET should remain allowed');
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  }));

  results.push(await runTest('Allows read-like HubSpot search POST requests', async () => {
    const tempRoot = createTempRoot();

    try {
      const result = await tester.run({
        input: {
          tool_name: 'Bash',
          tool_input: {
            command: `curl -s -X POST https://api.hubapi.com/crm/v3/objects/contacts/search -d '{"filterGroups":[]}'`
          }
        },
        env: createEnv(tempRoot)
      });

      assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
      assert.deepStrictEqual(result.output, {}, 'Search POST should be treated as read-only');
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  }));

  results.push(await runTest('Denies mutating HubSpot CRM curl requests in main context', async () => {
    const tempRoot = createTempRoot();

    try {
      const result = await tester.run({
        input: {
          tool_name: 'Bash',
          tool_input: {
            command: `curl -s -X PATCH https://api.hubapi.com/crm/v3/objects/contacts/123 -d '{"properties":{"firstname":"Updated"}}'`
          }
        },
        env: createEnv(tempRoot)
      });

      assert.strictEqual(result.exitCode, 0, 'Should use structured deny semantics');
      assert.strictEqual(result.parseError, null, 'Should emit parseable JSON');
      assert.strictEqual(result.output?.hookSpecificOutput?.permissionDecision, 'deny', 'Should deny direct HubSpot writes');
      assert(
        result.output?.hookSpecificOutput?.permissionDecisionReason?.includes('opspal-hubspot:hubspot-data-operations-manager'),
        'Should route CRM data writes to the HubSpot data operations specialist'
      );
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  }));

  results.push(await runTest('Allows mutating HubSpot curl when already inside agent context', async () => {
    const tempRoot = createTempRoot();

    try {
      const result = await tester.run({
        input: {
          tool_name: 'Bash',
          agent_type: 'opspal-hubspot:hubspot-data-operations-manager',
          tool_input: {
            command: `curl -s -X PATCH https://api.hubapi.com/crm/v3/objects/contacts/123 -d '{"properties":{"firstname":"Updated"}}'`
          }
        },
        env: createEnv(tempRoot)
      });

      assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
      assert.deepStrictEqual(result.output, {}, 'Approved agent context should not be re-blocked');
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
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
