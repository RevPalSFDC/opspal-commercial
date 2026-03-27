#!/usr/bin/env node

/**
 * Chain Tokenizer Tests for classify-bash-command.sh
 *
 * Tests classify_command_chain(), split_command_chain(), classify_pipe_segments(),
 * and strip_env_prefix() — the new chain-aware classification layer.
 *
 * @copyright 2024-2026 RevPal Partners, LLC
 */

const assert = require('assert');
const path = require('path');
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

function runClassifier(functionName, command, extraEnv = {}) {
  const result = runShell(
    `source "${LIB_PATH}"; ${functionName} "$COMMAND_INPUT"`,
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
  console.log('\n[Tests] classify-bash-command.sh Chain Tokenizer Tests\n');

  const results = [];

  // =========================================================================
  // strip_env_prefix tests
  // =========================================================================

  results.push(await runTest('ENV-01: strip_env_prefix removes env VAR=val prefix', async () => {
    const result = runClassifier('strip_env_prefix', 'env TOKEN=xxx sf data delete bulk --sobject Account');
    assert.strictEqual(result, 'sf data delete bulk --sobject Account');
  }));

  results.push(await runTest('ENV-02: strip_env_prefix removes bare VAR=val prefix', async () => {
    const result = runClassifier('strip_env_prefix', 'SF_ACCESS_TOKEN=xxx sf data query --target-org prod');
    assert.strictEqual(result, 'sf data query --target-org prod');
  }));

  results.push(await runTest('ENV-03: strip_env_prefix removes multiple VAR=val', async () => {
    const result = runClassifier('strip_env_prefix', 'env A=1 B=2 sf data delete --sobject Account');
    assert.strictEqual(result, 'sf data delete --sobject Account');
  }));

  results.push(await runTest('ENV-04: strip_env_prefix preserves command without prefix', async () => {
    const result = runClassifier('strip_env_prefix', 'sf data query --target-org prod');
    assert.strictEqual(result, 'sf data query --target-org prod');
  }));

  // =========================================================================
  // classify_command_chain — safe chains (should remain read/unknown)
  // =========================================================================

  results.push(await runTest('CHAIN-01: sf query && echo done → read', async () => {
    const result = runClassifier(
      'classify_command_chain',
      'sf data query --query "SELECT Id FROM Account" -o sandbox && echo done'
    );
    assert.strictEqual(result, 'read');
  }));

  results.push(await runTest('CHAIN-02: mkdir -p output && sf query → read', async () => {
    const result = runClassifier(
      'classify_command_chain',
      'mkdir -p output && sf data query --query "SELECT Id FROM Account" > output/result.json'
    );
    assert.strictEqual(result, 'read');
  }));

  results.push(await runTest('CHAIN-03: sf query | jq → read (pipe to jq is safe)', async () => {
    const result = runClassifier(
      'classify_command_chain',
      'sf data query --query "SELECT Id FROM Account" --target-org prod --json | jq ".records"'
    );
    assert.strictEqual(result, 'read');
  }));

  results.push(await runTest('CHAIN-04: Single sf query (no chain) → read', async () => {
    const result = runClassifier(
      'classify_command_chain',
      'sf data query --query "SELECT Id FROM Account" --target-org prod --json'
    );
    assert.strictEqual(result, 'read');
  }));

  results.push(await runTest('CHAIN-05: echo hello && echo world → unknown', async () => {
    const result = runClassifier(
      'classify_command_chain',
      'echo hello && echo world'
    );
    assert.strictEqual(result, 'unknown');
  }));

  // =========================================================================
  // classify_command_chain — unsafe chains (should detect mutations)
  // =========================================================================

  results.push(await runTest('CHAIN-06: sf query && sf delete → mutate', async () => {
    const result = runClassifier(
      'classify_command_chain',
      'sf data query --query "SELECT Id FROM Account WHERE Name=\'Test\'" --target-org prod && sf data delete bulk --sobject Account --where "Name=\'Test\'" --target-org prod'
    );
    assert.strictEqual(result, 'mutate',
      'Chain with delete after query should classify as mutate');
  }));

  results.push(await runTest('CHAIN-07: sf query ; sf delete → mutate', async () => {
    const result = runClassifier(
      'classify_command_chain',
      'sf data query --query "SELECT Id FROM Account" --target-org prod; sf data delete bulk --sobject Account --target-org prod'
    );
    assert.strictEqual(result, 'mutate',
      'Semicolon-separated chain with delete should classify as mutate');
  }));

  results.push(await runTest('CHAIN-08: sf deploy start && sf deploy report → deploy', async () => {
    const result = runClassifier(
      'classify_command_chain',
      'sf project deploy start --source-dir force-app --target-org prod && sf project deploy report --target-org prod'
    );
    // Both segments contain deploy commands
    assert.strictEqual(result, 'deploy',
      'Deploy + deploy report chain should classify as deploy');
  }));

  results.push(await runTest('CHAIN-09: sf data create && sf data query → mutate', async () => {
    const result = runClassifier(
      'classify_command_chain',
      'sf data create record --sobject Account --values "Name=Test" --target-org prod && sf data query --query "SELECT Id FROM Account WHERE Name=\'Test\'" --target-org prod'
    );
    assert.strictEqual(result, 'mutate',
      'Create followed by verification query should classify as mutate (highest risk wins)');
  }));

  results.push(await runTest('CHAIN-10: sf data bulk upsert && echo done → bulk-mutate', async () => {
    const result = runClassifier(
      'classify_command_chain',
      'sf data bulk upsert --sobject Lead --file leads.csv --target-org prod && echo "Import complete"'
    );
    assert.strictEqual(result, 'bulk-mutate',
      'Bulk upsert chain should classify as bulk-mutate');
  }));

  // =========================================================================
  // classify_command_chain — pipe mutations
  // =========================================================================

  results.push(await runTest('CHAIN-11: sf query | sf data upsert --file - → bulk-mutate', async () => {
    const result = runClassifier(
      'classify_command_chain',
      'sf data query --query "SELECT Id FROM Account" --target-org prod | sf data upsert bulk --sobject Account --file - --target-org prod'
    );
    // The pipe feeds a bulk upsert
    const isMutation = result === 'mutate' || result === 'bulk-mutate';
    assert(isMutation,
      `Piped upsert should classify as mutation, got: ${result}`);
  }));

  results.push(await runTest('CHAIN-11b: sf query | xargs sf data delete → mutate', async () => {
    const result = runClassifier(
      'classify_command_chain',
      'sf data query --query "SELECT Id FROM Account" --target-org prod --json | xargs sf data delete bulk --sobject Account --target-org prod'
    );
    assert.strictEqual(result, 'mutate',
      'xargs-hidden delete should classify as mutate');
  }));

  results.push(await runTest('CHAIN-11c: eval-wrapped delete stays mutate', async () => {
    const result = runClassifier(
      'classify_command_chain',
      'CMD="sf data delete bulk --sobject Account --target-org prod"; eval "$CMD"'
    );
    assert.strictEqual(result, 'mutate',
      'eval-wrapped delete should classify as mutate');
  }));

  results.push(await runTest('CHAIN-11d: command substitution read is ambiguous, not read', async () => {
    const result = runClassifier(
      'classify_command_chain',
      'RESULT=$(sf data query --query "SELECT Id FROM Account" --target-org prod --json); echo "$RESULT"'
    );
    assert.strictEqual(result, 'unknown',
      'Command substitution should not be treated as a safe read');
  }));

  // =========================================================================
  // classify_command_chain — env prefix stripping in chains
  // =========================================================================

  results.push(await runTest('CHAIN-12: env prefix + sf delete → mutate (single command)', async () => {
    const result = runClassifier(
      'classify_command_chain',
      'env SF_ACCESS_TOKEN=xxx sf data delete bulk --sobject Account --target-org prod'
    );
    assert.strictEqual(result, 'mutate',
      'env-prefixed SF delete should be detected after stripping');
  }));

  // =========================================================================
  // classify_command_chain — || (OR) operator
  // =========================================================================

  results.push(await runTest('CHAIN-13: sf query || sf delete → mutate', async () => {
    const result = runClassifier(
      'classify_command_chain',
      'sf data query --query "SELECT Id FROM Account" --target-org prod || sf data delete bulk --sobject Account --target-org prod'
    );
    assert.strictEqual(result, 'mutate',
      'OR chain with delete should classify as mutate');
  }));

  // =========================================================================
  // classify_command_chain — is_read_only_command integration
  // =========================================================================

  results.push(await runTest('CHAIN-14: is_read_only_command false for query && delete', async () => {
    const isRead = runPredicate(
      'is_read_only_command',
      'sf data query --query "SELECT Id FROM Account" --target-org prod && sf data delete bulk --sobject Account --target-org prod'
    );
    assert.strictEqual(isRead, false,
      'Chain with any mutation should not be read-only');
  }));

  results.push(await runTest('CHAIN-15: is_read_only_command true for query && echo', async () => {
    const isRead = runPredicate(
      'is_read_only_command',
      'sf data query --query "SELECT Id FROM Account" --target-org prod && echo "done"'
    );
    assert.strictEqual(isRead, true,
      'Chain with only reads and unknowns should be read-only');
  }));

  results.push(await runTest('CHAIN-16: is_read_only_command true for query | jq', async () => {
    const isRead = runPredicate(
      'is_read_only_command',
      'sf data query --query "SELECT Id FROM Account" --target-org prod --json | jq ".records"'
    );
    assert.strictEqual(isRead, true,
      'Pipe to jq should remain read-only');
  }));

  // =========================================================================
  // Backward compatibility — single commands work identically
  // =========================================================================

  results.push(await runTest('COMPAT-01: Single sf read → read (no regression)', async () => {
    const result = runClassifier(
      'classify_command_chain',
      'sf data query --query "SELECT Id FROM Account" --target-org sandbox --json'
    );
    assert.strictEqual(result, 'read');
  }));

  results.push(await runTest('COMPAT-02: Single sf deploy → deploy (no regression)', async () => {
    const result = runClassifier(
      'classify_command_chain',
      'sfdx force:source:deploy --manifest package.xml --target-org production'
    );
    assert.strictEqual(result, 'deploy');
  }));

  results.push(await runTest('COMPAT-03: Non-SF command → unknown (no regression)', async () => {
    const result = runClassifier(
      'classify_command_chain',
      'echo "hello world"'
    );
    assert.strictEqual(result, 'unknown');
  }));

  results.push(await runTest('COMPAT-04: curl to HubSpot → unknown from chain classifier', async () => {
    // classify_command_chain only handles SF commands — HubSpot curl returns unknown
    // is_read_only_command handles HubSpot/Marketo classification separately
    const result = runClassifier(
      'classify_command_chain',
      'curl -s https://api.hubapi.com/crm/v3/objects/contacts/123'
    );
    assert.strictEqual(result, 'unknown',
      'Chain classifier delegates HubSpot to is_read_only_command, not classify_command_chain');
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
