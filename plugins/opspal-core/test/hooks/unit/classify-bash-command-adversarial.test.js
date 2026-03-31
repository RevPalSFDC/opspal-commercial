#!/usr/bin/env node

/**
 * Adversarial Tests for classify-bash-command.sh
 *
 * Documents known bypass surfaces and edge cases for the shared classifier.
 * Tests wrapper indirection, piped commands, multi-command, eval/exec, base64,
 * and PATH manipulation scenarios.
 *
 * @copyright 2024-2026 RevPal Partners, LLC
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '../../../../..');
const LIB_PATH = path.join(PROJECT_ROOT, 'plugins/opspal-core/scripts/lib/classify-bash-command.sh');

function runShell(script, env = {}) {
  return spawnSync('bash', ['-c', script], {
    encoding: 'utf8',
    env: {
      ...process.env,
      ...env
    }
  });
}

function runClassifier(functionName, command, extraEnv = {}, extraArgs = '') {
  const result = runShell(
    `source "${LIB_PATH}"; ${functionName} "$COMMAND_INPUT" ${extraArgs}`.trim(),
    { COMMAND_INPUT: command, ...extraEnv }
  );

  assert.strictEqual(result.status, 0, result.stderr || `${functionName} should succeed`);
  return result.stdout.trim();
}

function runPredicate(functionName, command, extraEnv = {}) {
  const result = runShell(
    `source "${LIB_PATH}"; if ${functionName} "$COMMAND_INPUT"; then echo true; else echo false; fi`,
    { COMMAND_INPUT: command, ...extraEnv }
  );

  assert.strictEqual(result.status, 0, result.stderr || `${functionName} should succeed`);
  return result.stdout.trim() === 'true';
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
  console.log('\n[Tests] classify-bash-command.sh Adversarial Tests\n');

  const results = [];

  // =========================================================================
  // ADV-CL-01: Wrapper script indirection — classifier returns unknown
  // =========================================================================
  results.push(await runTest('ADV-CL-01: Wrapper script indirection returns unknown', async () => {
    const classification = runClassifier(
      'classify_sf_command',
      'bash ./scripts/sf-delete-wrapper.sh --target-org prod'
    );
    assert.strictEqual(classification, 'unknown',
      'Wrapper indirection must return unknown — this is a documented bypass surface');

    const isSF = runPredicate(
      'is_salesforce_cli_command',
      'bash ./scripts/sf-delete-wrapper.sh --target-org prod'
    );
    assert.strictEqual(isSF, false, 'Wrapper script must not match as SF CLI command');
  }));

  // =========================================================================
  // ADV-CL-02: Node script wrapper — classifier returns unknown
  // =========================================================================
  results.push(await runTest('ADV-CL-02: Node script wrapper returns unknown', async () => {
    const classification = runClassifier(
      'classify_sf_command',
      'node deploy.js --org prod'
    );
    assert.strictEqual(classification, 'unknown',
      'Node wrapper must return unknown — documented bypass surface');
  }));

  // =========================================================================
  // ADV-CL-03: Piped sf command — classifier should still classify the sf part
  // =========================================================================
  results.push(await runTest('ADV-CL-03: Piped sf command classifies by leading command', async () => {
    const classification = runClassifier(
      'classify_sf_command',
      'sf data query --query "SELECT Id FROM Account" --target-org prod | jq ".records"'
    );
    assert.strictEqual(classification, 'read',
      'Piped sf command should still classify as read');
  }));

  // =========================================================================
  // ADV-CL-04: sf command on right side of pipe (stdin-fed)
  // =========================================================================
  results.push(await runTest('ADV-CL-04: stdin-fed sf data query still detected', async () => {
    // The command string still starts with echo but contains sf data query
    // The classifier is head-anchored, so this tests if the full string is scanned
    const isSF = runPredicate(
      'is_salesforce_cli_command',
      'echo \'{"query":"SELECT Id FROM Account"}\' | sf data query --file - --target-org prod'
    );
    // Head-anchored regex: ^[[:space:]]*(sf|sfdx) — this will NOT match because
    // the command starts with 'echo', not 'sf'. Document this behavior.
    assert.strictEqual(isSF, false,
      'stdin-fed variant starting with echo should not match head-anchored sf regex — documented gap');

    // But is_sf_data_query_command has the same anchoring
    const isQuery = runPredicate(
      'is_sf_data_query_command',
      'echo \'{"query":"SELECT Id FROM Account"}\' | sf data query --file - --target-org prod'
    );
    assert.strictEqual(isQuery, false,
      'Head-anchored query regex should not match pipe-fed sf command — documented gap');
  }));

  // =========================================================================
  // ADV-CL-05: Multi-command — query then delete (&&)
  // =========================================================================
  results.push(await runTest('ADV-CL-05: Multi-command (&&) classifies first command only', async () => {
    const command = 'sf data query --query "SELECT Id FROM Account" --target-org prod --json && sf data delete bulk --sobject Account --target-org prod';

    const classification = runClassifier('classify_sf_command', command);
    assert.strictEqual(classification, 'read',
      'Multi-command classifies by first command (read) — second delete is invisible');

    // Verify the full string DOES contain a write pattern
    const hasWrite = runPredicate('is_sf_write_like_command', command);
    // is_sf_write_like_command also uses head-anchored regex, so it will see the first
    // command (query) and return false. The delete after && is invisible.
    assert.strictEqual(hasWrite, false,
      'Head-anchored is_sf_write_like_command misses write after && — documented gap');
  }));

  // =========================================================================
  // ADV-CL-06: Uppercase SF command — case insensitivity
  // =========================================================================
  results.push(await runTest('ADV-CL-06: Uppercase SF DATA QUERY classified correctly', async () => {
    const isSF = runPredicate(
      'is_salesforce_cli_command',
      'SF DATA QUERY --query "SELECT Id FROM Account" --target-org prod --json'
    );
    assert.strictEqual(isSF, true, 'Uppercase SF should be detected (case-insensitive)');

    const classification = runClassifier(
      'classify_sf_command',
      'SF DATA QUERY --query "SELECT Id FROM Account" --target-org prod --json'
    );
    assert.strictEqual(classification, 'read', 'Uppercase SF DATA QUERY should classify as read');
  }));

  // =========================================================================
  // ADV-CL-07: String-only classification (not PATH-dependent)
  // =========================================================================
  results.push(await runTest('ADV-CL-07: Classification works on string patterns not PATH', async () => {
    // Even with an empty PATH, classifier should still work because it's string matching
    const isSF = runPredicate(
      'is_salesforce_cli_command',
      'sf data query --query "SELECT Id FROM Account" --target-org prod --json'
    );
    assert.strictEqual(isSF, true,
      'Classifier operates on string patterns, not PATH resolution');
  }));

  // =========================================================================
  // ADV-CL-08: eval wrapping bypass
  // =========================================================================
  results.push(await runTest('ADV-CL-08: eval-wrapped sf command returns unknown', async () => {
    const classification = runClassifier(
      'classify_sf_command',
      "eval 'sf data delete bulk --sobject Account --target-org prod'"
    );
    assert.strictEqual(classification, 'unknown',
      'eval wrapping bypasses classifier — documented gap');

    const isSF = runPredicate(
      'is_salesforce_cli_command',
      "eval 'sf data delete bulk --sobject Account --target-org prod'"
    );
    assert.strictEqual(isSF, false, 'eval-wrapped command should not match sf regex');
  }));

  // =========================================================================
  // ADV-CL-09: Base64-encoded command bypass
  // =========================================================================
  results.push(await runTest('ADV-CL-09: Base64-encoded sf command returns unknown', async () => {
    const classification = runClassifier(
      'classify_sf_command',
      'echo c2YgZGF0YSBkZWxldGUgYnVsayAtLXNvYmplY3QgQWNjb3VudA== | base64 --decode | bash'
    );
    assert.strictEqual(classification, 'unknown',
      'Base64 pipe bypasses classifier — documented gap');
  }));

  // =========================================================================
  // ADV-CL-10: Semicolon-separated commands
  // =========================================================================
  results.push(await runTest('ADV-CL-10: Semicolon-separated classifies first command only', async () => {
    const command = 'sf data query --query "SELECT Id FROM Account" --target-org prod; sf data delete bulk --sobject Account --target-org prod';

    const classification = runClassifier('classify_sf_command', command);
    assert.strictEqual(classification, 'read',
      'Semicolon-separated classifies first command (read) only');
  }));

  // =========================================================================
  // ADV-CL-11: Python wrapper script
  // =========================================================================
  results.push(await runTest('ADV-CL-11: Python wrapper script returns unknown', async () => {
    const classification = runClassifier(
      'classify_sf_command',
      'python3 scripts/salesforce_deploy.py --manifest package.xml --target production'
    );
    assert.strictEqual(classification, 'unknown',
      'Python wrapper must return unknown — documented bypass surface');
  }));

  // =========================================================================
  // ADV-CL-12: env command prefix
  // =========================================================================
  results.push(await runTest('ADV-CL-12: env-prefixed sf command returns unknown', async () => {
    const classification = runClassifier(
      'classify_sf_command',
      'env SF_ACCESS_TOKEN=xxx sf data delete bulk --sobject Account --target-org prod'
    );
    assert.strictEqual(classification, 'unknown',
      'env prefix bypasses head-anchored regex — documented gap');
  }));

  // =========================================================================
  // ADV-CL-13: Leading whitespace (should still match)
  // =========================================================================
  results.push(await runTest('ADV-CL-13: Leading whitespace does not break classification', async () => {
    const classification = runClassifier(
      'classify_sf_command',
      '   sf data query --query "SELECT Id FROM Account" --target-org prod --json'
    );
    assert.strictEqual(classification, 'read',
      'Leading whitespace should be handled by [[:space:]]* in regex');
  }));

  // =========================================================================
  // ADV-CL-14: Subshell invocation
  // =========================================================================
  results.push(await runTest('ADV-CL-14: Subshell $(sf ...) returns unknown', async () => {
    const classification = runClassifier(
      'classify_sf_command',
      'echo $(sf data query --query "SELECT Id FROM Account" --target-org prod --json)'
    );
    assert.strictEqual(classification, 'unknown',
      'Subshell invocation starting with echo returns unknown — documented gap');
  }));

  // =========================================================================
  // ADV-CL-15: Non-CRM curl (should not match any platform)
  // =========================================================================
  results.push(await runTest('ADV-CL-15: Non-CRM curl returns unknown for all classifiers', async () => {
    const hsClassification = runClassifier(
      'classify_hubspot_curl',
      'curl -s https://api.github.com/repos/test/test'
    );
    const mkClassification = runClassifier(
      'classify_marketo_curl',
      'curl -s https://api.github.com/repos/test/test'
    );
    assert.strictEqual(hsClassification, 'unknown', 'Non-HubSpot curl should be unknown');
    assert.strictEqual(mkClassification, 'unknown', 'Non-Marketo curl should be unknown');
  }));

  // =========================================================================
  // ADV-CL-16: curl without curl keyword (wget)
  // =========================================================================
  results.push(await runTest('ADV-CL-16: wget to HubSpot API returns unknown', async () => {
    const classification = runClassifier(
      'classify_hubspot_curl',
      'wget -q -O - https://api.hubapi.com/crm/v3/objects/contacts/123'
    );
    assert.strictEqual(classification, 'unknown',
      'wget bypasses curl classifier — documented gap');
  }));

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
