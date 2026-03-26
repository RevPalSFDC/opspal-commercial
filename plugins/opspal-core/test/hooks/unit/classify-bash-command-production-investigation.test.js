#!/usr/bin/env node

/**
 * Regression Tests: Production Investigation Pattern
 *
 * Covers the incident class where:
 * - sf project retrieve was misclassified as 'unknown' and triggered PRODUCTION_DETECTED
 * - sf data query (read-only) was correctly allowed on production
 * - Invalid query objects/fields were not caught
 * - One failed query cancelled sibling parallel work
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

// ==========================================
// Test Suite
// ==========================================

async function main() {
  console.log('');
  console.log('=== Production Investigation Regression Tests ===');
  console.log('');
  const results = [];

  // --- Section 1: sf project retrieve classification ---
  console.log('[1] sf project retrieve classification');

  results.push(await runTest('classify sf project retrieve start as retrieve', () => {
    const cls = runClassifier('classify_sf_command', 'sf project retrieve start --target-org wedgewood-production');
    assert.strictEqual(cls, 'retrieve', `Expected 'retrieve', got '${cls}'`);
  }));

  results.push(await runTest('classify sfdx force:source:retrieve as retrieve', () => {
    const cls = runClassifier('classify_sf_command', 'sfdx force:source:retrieve --target-org prod');
    assert.strictEqual(cls, 'retrieve', `Expected 'retrieve', got '${cls}'`);
  }));

  results.push(await runTest('sf project generate manifest classified as retrieve', () => {
    const cls = runClassifier('classify_sf_command', 'sf project generate manifest --target-org production');
    assert.strictEqual(cls, 'retrieve', `Expected 'retrieve', got '${cls}'`);
  }));

  results.push(await runTest('is_sf_retrieve_command returns true for retrieve', () => {
    assert.strictEqual(runPredicate('is_sf_retrieve_command', 'sf project retrieve start --target-org prod'), true);
  }));

  results.push(await runTest('is_sf_retrieve_command returns false for deploy', () => {
    assert.strictEqual(runPredicate('is_sf_retrieve_command', 'sf project deploy start --target-org prod'), false);
  }));

  // --- Section 2: retrieve is read-only for production policy ---
  console.log('');
  console.log('[2] retrieve treated as read-only for production policy');

  results.push(await runTest('is_read_only_command true for sf project retrieve', () => {
    assert.strictEqual(
      runPredicate('is_read_only_command', 'sf project retrieve start --target-org wedgewood-production'),
      true
    );
  }));

  results.push(await runTest('is_read_only_command true for sf data query on production', () => {
    assert.strictEqual(
      runPredicate('is_read_only_command', 'sf data query --query "SELECT Id FROM Account" --target-org production'),
      true
    );
  }));

  results.push(await runTest('is_read_only_command false for sf project deploy on production', () => {
    assert.strictEqual(
      runPredicate('is_read_only_command', 'sf project deploy start --target-org production'),
      false
    );
  }));

  results.push(await runTest('is_read_only_command false for sf data delete on production', () => {
    assert.strictEqual(
      runPredicate('is_read_only_command', 'sf data delete record --target-org production --sobject Account'),
      false
    );
  }));

  // --- Section 3: risk level ordering includes retrieve ---
  console.log('');
  console.log('[3] risk level ordering');

  results.push(await runTest('retrieve is lower risk than deploy', () => {
    const higher = runClassifier('_higher_risk_classification', '', {}, 'retrieve deploy');
    // Need to call with two args
    const result = runShell(
      `source "${LIB_PATH}"; _higher_risk_classification retrieve deploy`,
      {}
    );
    assert.strictEqual(result.status, 0);
    assert.strictEqual(result.stdout.trim(), 'deploy');
  }));

  results.push(await runTest('retrieve is higher risk than read', () => {
    const result = runShell(
      `source "${LIB_PATH}"; _higher_risk_classification retrieve read`,
      {}
    );
    assert.strictEqual(result.status, 0);
    assert.strictEqual(result.stdout.trim(), 'retrieve');
  }));

  // --- Section 4: chain classification with retrieve ---
  console.log('');
  console.log('[4] chain classification with retrieve');

  results.push(await runTest('retrieve && query chain classified as retrieve (highest)', () => {
    const cls = runClassifier(
      'classify_command_chain',
      'sf project retrieve start --target-org prod && sf data query --query "SELECT Id FROM Account" --target-org prod'
    );
    assert.strictEqual(cls, 'retrieve', `Expected 'retrieve', got '${cls}'`);
  }));

  results.push(await runTest('deploy && retrieve chain classified as deploy (highest)', () => {
    const cls = runClassifier(
      'classify_command_chain',
      'sf project deploy start --target-org sandbox && sf project retrieve start --target-org prod'
    );
    assert.strictEqual(cls, 'deploy', `Expected 'deploy', got '${cls}'`);
  }));

  // --- Section 5: Existing read-only commands still work ---
  console.log('');
  console.log('[5] Existing read-only classifications unchanged');

  results.push(await runTest('sf data query still classified as read', () => {
    const cls = runClassifier('classify_sf_command', 'sf data query --query "SELECT Id FROM Account"');
    assert.strictEqual(cls, 'read');
  }));

  results.push(await runTest('sf sobject describe still classified as read', () => {
    const cls = runClassifier('classify_sf_command', 'sf sobject describe Account');
    assert.strictEqual(cls, 'read');
  }));

  results.push(await runTest('sf project deploy still classified as deploy', () => {
    const cls = runClassifier('classify_sf_command', 'sf project deploy start --target-org sandbox');
    assert.strictEqual(cls, 'deploy');
  }));

  results.push(await runTest('sf data delete still classified as mutate', () => {
    const cls = runClassifier('classify_sf_command', 'sf data delete record --sobject Account');
    assert.strictEqual(cls, 'mutate');
  }));

  // --- Summary ---
  console.log('');
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  console.log(`Results: ${passed} passed, ${failed} failed out of ${results.length} tests`);

  if (failed > 0) {
    console.log('');
    console.log('Failed tests:');
    results.filter(r => !r.passed).forEach(r => {
      console.log(`  ❌ ${r.name}: ${r.error}`);
    });
    process.exit(1);
  }

  process.exit(0);
}

main();
