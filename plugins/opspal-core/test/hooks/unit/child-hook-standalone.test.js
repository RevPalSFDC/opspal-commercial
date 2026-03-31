#!/usr/bin/env node

/**
 * Child Hook Standalone Guard Tests
 *
 * Verifies that child hooks invoked by pre-bash-dispatcher.sh exit cleanly
 * when run standalone (without dispatcher context).
 *
 * @copyright 2024-2026 RevPal Partners, LLC
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '../../../../..');

const CHILD_HOOKS = [
  'plugins/opspal-salesforce/hooks/pre-deploy-agent-context-check.sh',
  'plugins/opspal-salesforce/hooks/pre-deployment-comprehensive-validation.sh',
  'plugins/opspal-salesforce/hooks/pre-deploy-flow-validation.sh',
  'plugins/opspal-salesforce/hooks/pre-deploy-report-quality-gate.sh',
  'plugins/opspal-salesforce/hooks/pre-bash-soql-validator.sh',
  'plugins/opspal-salesforce/hooks/pre-bash-jq-validator.sh'
];

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
  console.log('\n[Tests] Child Hook Standalone Guard\n');

  const results = [];

  for (const hookRelPath of CHILD_HOOKS) {
    const hookPath = path.join(PROJECT_ROOT, hookRelPath);
    const hookName = path.basename(hookRelPath);

    if (!fs.existsSync(hookPath)) {
      results.push(await runTest(`${hookName}: SKIP (not found)`, async () => {}));
      continue;
    }

    // Test 1: Standalone invocation (no pipe, no DISPATCHER_CONTEXT) — should exit 0
    results.push(await runTest(`${hookName}: standalone exits 0`, async () => {
      // Run with a TTY-like context by NOT piping stdin
      // spawnSync with stdio: 'pipe' means stdin is NOT a TTY, so we also set
      // DISPATCHER_CONTEXT to explicitly not be 1
      const result = spawnSync('bash', [hookPath], {
        encoding: 'utf8',
        env: {
          ...process.env,
          DISPATCHER_CONTEXT: '0',
          HOOK_TEST_MODE: '1'
        },
        input: '', // empty stdin (not a TTY, but DISPATCHER_CONTEXT=0 triggers guard)
        timeout: 10000
      });

      assert.strictEqual(result.status, 0,
        `${hookName} must exit 0 standalone (got ${result.status}). stderr: ${(result.stderr || '').substring(0, 200)}`);
    }));

    // Test 2: With DISPATCHER_CONTEXT=1 and piped input — should process normally
    results.push(await runTest(`${hookName}: dispatched context processes`, async () => {
      const hookInput = JSON.stringify({
        tool_name: 'Bash',
        tool_input: {
          command: 'sf data query --query "SELECT Id FROM Account" --target-org sandbox --json'
        }
      });

      const result = spawnSync('bash', [hookPath], {
        encoding: 'utf8',
        env: {
          ...process.env,
          DISPATCHER_CONTEXT: '1',
          HOOK_TEST_MODE: '1'
        },
        input: hookInput,
        timeout: 10000
      });

      assert.strictEqual(result.status, 0,
        `${hookName} must exit 0 in dispatcher context (got ${result.status}). stderr: ${(result.stderr || '').substring(0, 200)}`);
    }));
  }

  // Test: Verify DISPATCHER_CONTEXT guard exists in each hook
  for (const hookRelPath of CHILD_HOOKS) {
    const hookPath = path.join(PROJECT_ROOT, hookRelPath);
    const hookName = path.basename(hookRelPath);

    if (!fs.existsSync(hookPath)) continue;

    results.push(await runTest(`${hookName}: has DISPATCHER_CONTEXT guard`, async () => {
      const content = fs.readFileSync(hookPath, 'utf8');
      assert(content.includes('DISPATCHER_CONTEXT'),
        `${hookName} must contain DISPATCHER_CONTEXT guard`);
    }));
  }

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
