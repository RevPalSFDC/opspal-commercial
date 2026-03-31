#!/usr/bin/env node

/**
 * Unit Tests for pre-bash-marketo-api.sh
 *
 * Covers direct Marketo curl detection for read and mutating operations.
 *
 * @copyright 2024-2026 RevPal Partners, LLC
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const { HookTester } = require('../runner');

const PROJECT_ROOT = path.resolve(__dirname, '../../../../..');
const MARKETO_PLUGIN_ROOT = path.join(PROJECT_ROOT, 'plugins/opspal-marketo');
const HOOK_PATH = 'plugins/opspal-marketo/hooks/pre-bash-marketo-api.sh';

function createTester() {
  return new HookTester(HOOK_PATH, {
    timeout: 10000,
    verbose: process.env.VERBOSE === '1'
  });
}

function createTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'marketo-pre-bash-'));
}

function createEnv(tempRoot) {
  return {
    HOME: tempRoot,
    CLAUDE_PLUGIN_ROOT: MARKETO_PLUGIN_ROOT,
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
  console.log('\n[Tests] pre-bash-marketo-api.sh Tests\n');

  const tester = createTester();
  const results = [];

  results.push(await runTest('Hook exists and is valid', async () => {
    const validation = tester.validate();
    assert(validation.exists, 'Hook file should exist');
    assert(validation.executable, 'Hook should be executable');
    assert(validation.syntaxValid, 'Hook should have valid bash syntax');
  }));

  results.push(await runTest('Skips non-Marketo curl commands', async () => {
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

  results.push(await runTest('Allows read-only Marketo GET requests', async () => {
    const tempRoot = createTempRoot();

    try {
      const result = await tester.run({
        input: {
          tool_name: 'Bash',
          tool_input: {
            command: 'curl -s https://123-ABC-456.mktorest.com/rest/v1/leads.json?filterType=id&filterValues=1'
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

  results.push(await runTest('Denies mutating Marketo bulk curl requests in main context', async () => {
    const tempRoot = createTempRoot();

    try {
      const result = await tester.run({
        input: {
          tool_name: 'Bash',
          tool_input: {
            command: `curl -s -X POST https://123-ABC-456.mktorest.com/bulk/v1/leads/import.json -d '{"format":"csv"}'`
          }
        },
        env: createEnv(tempRoot)
      });

      assert.strictEqual(result.exitCode, 0, 'Should use structured deny semantics');
      assert.strictEqual(result.parseError, null, 'Should emit parseable JSON');
      assert.strictEqual(result.output?.hookSpecificOutput?.permissionDecision, 'deny', 'Should deny direct Marketo writes');
      assert(
        result.output?.hookSpecificOutput?.permissionDecisionReason?.includes('opspal-marketo:marketo-data-operations'),
        'Bulk operations should route to the Marketo data operations specialist'
      );
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  }));

  results.push(await runTest('Denies smart campaign execution curl requests in main context', async () => {
    const tempRoot = createTempRoot();

    try {
      const result = await tester.run({
        input: {
          tool_name: 'Bash',
          tool_input: {
            command: `curl -s -X POST https://123-ABC-456.mktorest.com/rest/v1/campaigns/42/requestCampaign.json -d '{"cloneToProgram":"1234"}'`
          }
        },
        env: createEnv(tempRoot)
      });

      assert.strictEqual(result.exitCode, 0, 'Should use structured deny semantics');
      assert.strictEqual(result.parseError, null, 'Should emit parseable JSON');
      assert.strictEqual(result.output?.hookSpecificOutput?.permissionDecision, 'deny', 'Should deny direct smart campaign execution');
      assert(
        result.output?.hookSpecificOutput?.permissionDecisionReason?.includes('opspal-marketo:marketo-smart-campaign-api-specialist'),
        'Smart campaign execution should route to the Marketo smart campaign specialist'
      );
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  }));

  results.push(await runTest('Allows mutating Marketo curl when already inside agent context', async () => {
    const tempRoot = createTempRoot();

    try {
      const result = await tester.run({
        input: {
          tool_name: 'Bash',
          agent_type: 'opspal-marketo:marketo-data-operations',
          tool_input: {
            command: `curl -s -X POST https://123-ABC-456.mktorest.com/bulk/v1/leads/import.json -d '{"format":"csv"}'`
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
