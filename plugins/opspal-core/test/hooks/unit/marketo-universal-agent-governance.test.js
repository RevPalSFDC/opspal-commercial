#!/usr/bin/env node

/**
 * Unit Tests for Marketo universal-agent-governance.sh
 *
 * Covers no-op, approval-required, and deny paths for commercial Marketo
 * Agent launches.
 *
 * @copyright 2024-2026 RevPal Partners, LLC
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { HookTester } = require('../runner');

const PROJECT_ROOT = path.resolve(__dirname, '../../../../..');
const MARKETO_PLUGIN_ROOT = path.join(PROJECT_ROOT, 'plugins/opspal-marketo');
const HOOK_PATH = 'plugins/opspal-marketo/hooks/universal-agent-governance.sh';

function createTester() {
  return new HookTester(HOOK_PATH, {
    timeout: 10000,
    verbose: process.env.VERBOSE === '1'
  });
}

function createTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'marketo-agent-governance-'));
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
  console.log('\n[Tests] Marketo universal-agent-governance.sh Tests\n');

  const tester = createTester();
  const results = [];

  results.push(await runTest('Hook exists and is valid', async () => {
    const validation = tester.validate();
    assert(validation.exists, 'Hook file should exist');
    assert(validation.executable, 'Hook should be executable');
    assert(validation.syntaxValid, 'Hook should have valid bash syntax');
  }));

  results.push(await runTest('Skips non-Marketo agents with JSON no-op', async () => {
    const tempRoot = createTempRoot();

    try {
      const result = await tester.run({
        input: {
          tool_name: 'Agent',
          tool_input: {
            subagent_type: 'opspal-hubspot:hubspot-contact-manager',
            prompt: 'Review contact associations and summarize findings'
          }
        },
        env: createEnv(tempRoot)
      });

      assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
      assert.strictEqual(result.parseError, null, 'Should emit parseable JSON');
      assert.deepStrictEqual(result.output, {}, 'Should emit a JSON no-op for non-Marketo agents');
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  }));

  results.push(await runTest('Flags high-risk bulk work for approval', async () => {
    const tempRoot = createTempRoot();

    try {
      const result = await tester.run({
        input: {
          tool_name: 'Agent',
          tool_input: {
            subagent_type: 'marketo-data-operations',
            prompt: 'Bulk import 5000 leads, then sync all leads to Salesforce production.'
          }
        },
        env: createEnv(tempRoot)
      });

      assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
      assert.strictEqual(result.parseError, null, 'Should emit parseable JSON');
      assert.strictEqual(
        result.output?.hookSpecificOutput?.permissionDecision,
        'allow',
        'High-risk work should remain allowed but require explicit approval'
      );
      assert(
        result.output?.hookSpecificOutput?.permissionDecisionReason?.includes('APPROVAL_RECOMMENDED'),
        'Approval-required path should surface the approval recommendation reason'
      );
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  }));

  results.push(await runTest('Denies mass-destructive prompts', async () => {
    const tempRoot = createTempRoot();

    try {
      const result = await tester.run({
        input: {
          tool_name: 'Agent',
          tool_input: {
            subagent_type: 'marketo-data-operations',
            prompt: 'Bulk delete all leads and purge the workspace.'
          }
        },
        env: createEnv(tempRoot)
      });

      assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
      assert.strictEqual(result.parseError, null, 'Should emit parseable JSON');
      assert.strictEqual(
        result.output?.hookSpecificOutput?.permissionDecision,
        'deny',
        'Mass-destructive work should be denied'
      );
      assert(
        result.output?.hookSpecificOutput?.permissionDecisionReason?.includes('BLOCKED'),
        'Denied path should surface a governance-block reason'
      );
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
