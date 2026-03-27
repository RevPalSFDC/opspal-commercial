#!/usr/bin/env node

/**
 * Unit Tests for Salesforce pre-bash-soql-validator.sh
 *
 * Validates pass-through behavior and known SOQL warning detection.
 *
 * @copyright 2024-2026 RevPal Partners, LLC
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '../../../../..');
const HOOK_PATH = path.join(
  PROJECT_ROOT,
  'plugins/opspal-salesforce/hooks/pre-bash-soql-validator.sh'
);

function hasJq() {
  const result = spawnSync('jq', ['--version'], { encoding: 'utf8' });
  return result.status === 0;
}

function runHook(payload) {
  return spawnSync('bash', ['-c', 'printf \'%s\' "$HOOK_INPUT" | bash "$HOOK_PATH"'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      HOOK_PATH,
      HOOK_INPUT: JSON.stringify(payload)
    }
  });
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
  console.log('\n[Tests] Salesforce pre-bash-soql-validator.sh Tests\n');

  const results = [];

  results.push(await runTest('Hook exists and is valid', async () => {
    assert(fs.existsSync(HOOK_PATH), 'Hook file should exist');
    const result = spawnSync('bash', ['-n', HOOK_PATH], { encoding: 'utf8' });
    assert.strictEqual(result.status, 0, 'Hook should have valid bash syntax');
  }));

  results.push(await runTest('Passes through non-query commands', async () => {
    if (!hasJq()) {
      return;
    }

    const result = runHook({
      tool_input: {
        command: 'sf org list --json'
      }
    });

    assert.strictEqual(result.status, 0, 'Should exit with 0');
    assert.strictEqual(result.stdout.trim(), '', 'Should not emit warnings for non-query commands');
  }));

  results.push(await runTest('Warns for known FlowVersionView field mismatch patterns', async () => {
    if (!hasJq()) {
      return;
    }

    const result = runHook({
      tool_input: {
        command: 'sf data query --query "SELECT Id, ApiName FROM FlowVersionView" --target-org test --json'
      }
    });

    assert.strictEqual(result.status, 0, 'Should exit with 0');
    const output = JSON.parse(result.stdout.trim());
    assert(
      output.hookSpecificOutput &&
      output.hookSpecificOutput.additionalContext.includes('FlowVersionView uses DeveloperName'),
      'Should warn about ApiName vs DeveloperName mismatch'
    );
    assert(
      output.hookSpecificOutput &&
      output.hookSpecificOutput.additionalContext.includes('--use-tooling-api'),
      'Should warn about missing Tooling API flag'
    );
  }));

  results.push(await runTest('Blocks deprecated sf data query bulk flag usage', async () => {
    if (!hasJq()) {
      return;
    }

    const result = runHook({
      tool_input: {
        command: 'sf data query --bulk --query "SELECT Id FROM Account" --target-org test --json'
      }
    });

    assert.strictEqual(result.status, 0, 'Should exit with 0 for structured deny');
    const output = JSON.parse(result.stdout.trim());
    assert.strictEqual(output.hookSpecificOutput?.permissionDecision, 'deny', 'Should deny deprecated bulk query usage');
    assert(
      (output.hookSpecificOutput?.permissionDecisionReason || '').includes('SOQL_BULK_FLAG_DEPRECATED'),
      'Should identify deprecated bulk flag usage'
    );
    assert(
      (output.hookSpecificOutput?.additionalContext || '').includes('sf data export bulk'),
      'Should suggest sf data export bulk as the replacement'
    );
  }));

  results.push(await runTest('Blocks invalid Inactive Flow status filters', async () => {
    if (!hasJq()) {
      return;
    }

    const result = runHook({
      tool_input: {
        command: 'sf data query --query "SELECT Id FROM FlowDefinitionView WHERE Status = \'Inactive\'" --target-org test --use-tooling-api --json'
      }
    });

    assert.strictEqual(result.status, 0, 'Should exit with 0 for structured deny');
    const output = JSON.parse(result.stdout.trim());
    assert.strictEqual(output.hookSpecificOutput?.permissionDecision, 'deny', 'Should deny invalid Flow status filters');
    assert(
      (output.hookSpecificOutput?.permissionDecisionReason || '').includes('FLOW_VERSION_STATUS_INVALID'),
      'Should identify invalid FlowVersionStatus usage'
    );
    assert(
      (output.hookSpecificOutput?.additionalContext || '').includes('Active, Draft, Obsolete'),
      'Should list valid FlowVersionStatus values'
    );
  }));

  results.push(await runTest('Blocks unescaped apostrophes in SOQL string literals', async () => {
    if (!hasJq()) {
      return;
    }

    const result = runHook({
      tool_input: {
        command: 'sf data query --query "SELECT Id FROM Account WHERE Name IN (\'O\'Brien\')" --target-org test --json'
      }
    });

    assert.strictEqual(result.status, 0, 'Should exit with 0 for structured deny');
    const output = JSON.parse(result.stdout.trim());
    assert.strictEqual(output.hookSpecificOutput?.permissionDecision, 'deny', 'Should deny malformed apostrophe usage');
    assert(
      (output.hookSpecificOutput?.permissionDecisionReason || '').includes('SOQL_APOSTROPHE_ESCAPE'),
      'Should identify the apostrophe escaping issue'
    );
    assert(
      (output.hookSpecificOutput?.additionalContext || '').includes('O\\\'Brien'),
      'Should provide an escaped remediation example'
    );
  }));

  results.push(await runTest('Allows properly escaped apostrophes in SOQL string literals', async () => {
    if (!hasJq()) {
      return;
    }

    const result = runHook({
      tool_input: {
        command: 'sf data query --query "SELECT Id FROM Account WHERE Name IN (\'O\\\'Brien\')" --target-org test --json'
      }
    });

    assert.strictEqual(result.status, 0, 'Should exit with 0');
    assert.strictEqual(result.stdout.trim(), '', 'Should allow already-escaped apostrophes');
  }));

  results.push(await runTest('Handles empty payload gracefully', async () => {
    if (!hasJq()) {
      return;
    }

    const result = runHook({});
    assert.strictEqual(result.status, 0, 'Should exit with 0');
    assert.strictEqual(result.stdout.trim(), '', 'Should not emit warnings for empty payload');
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
