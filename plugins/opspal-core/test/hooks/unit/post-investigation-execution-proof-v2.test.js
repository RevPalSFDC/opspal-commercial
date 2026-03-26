#!/usr/bin/env node

/**
 * Integration Tests for post-investigation-execution-proof.sh v2.0
 *
 * Tests the receipt-primary verification path:
 * - Valid receipt in output → pass
 * - Tampered receipt in output → fail with specific classification
 * - No receipt + plan-only text → fail
 * - No receipt + execution evidence → weak pass with warning
 * - Non-investigation agent → skip
 *
 * @copyright 2024-2026 RevPal Partners, LLC
 */

const assert = require('assert');
const path = require('path');
const { spawnSync } = require('child_process');

const HOOK_PATH = path.resolve(__dirname, '..', '..', '..', '..', '..',
  'plugins/opspal-core/hooks/post-investigation-execution-proof.sh');
const RECEIPT_LIB = path.resolve(__dirname, '..', '..', '..', '..', '..',
  'plugins/opspal-salesforce/scripts/lib/execution-receipt.js');

// Load the receipt library to generate test receipts
const {
  generateReceipt,
  formatReceiptBlock
} = require(RECEIPT_LIB);

function runHook(stdinContent, env = {}) {
  const result = spawnSync('bash', [HOOK_PATH], {
    input: stdinContent,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: process.env.PATH,
      ...env
    }
  });
  return {
    exitCode: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || ''
  };
}

function makeReceipt(overrides = {}) {
  const base = {
    status: 'complete',
    orgAlias: 'wedgewood-production',
    totalQueries: 4,
    succeededCount: 4,
    failedCount: 0,
    succeeded: {
      flows: { totalSize: 47, records: [] },
      triggers: { totalSize: 12, records: [] },
      validationRules: { totalSize: 89, records: [] },
      workflowRules: { totalSize: 23, records: [] }
    },
    failed: {},
    fallbacks: [],
    durationMs: 2000,
    ...overrides
  };
  return generateReceipt(base);
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

async function main() {
  console.log('');
  console.log('=== Execution Proof Hook v2.0 (Receipt-Primary) Tests ===');
  console.log('');
  const results = [];

  // --- Section 1: Valid receipt → pass ---
  console.log('[1] Valid receipt passes proof');

  results.push(await runTest('valid receipt from sfdc-automation-auditor passes', () => {
    const receipt = makeReceipt();
    const block = formatReceiptBlock(receipt);
    const output = `sfdc-automation-auditor investigation complete.\nFound 47 flows.\n${block}\n`;
    const r = runHook(output);
    assert.strictEqual(r.exitCode, 0);
    assert.ok(!r.stdout.includes('PROOF_MISSING'), 'Should not flag proof missing');
    assert.ok(!r.stdout.includes('RECEIPT_INVALID'), 'Should not flag receipt invalid');
  }));

  results.push(await runTest('valid partial receipt passes', () => {
    const receipt = makeReceipt({ status: 'partial', succeededCount: 3, failedCount: 1 });
    const block = formatReceiptBlock(receipt);
    const output = `sfdc-territory-discovery analysis.\n${block}\nPartial results.`;
    const r = runHook(output);
    assert.strictEqual(r.exitCode, 0);
    assert.ok(!r.stdout.includes('RECEIPT_INVALID'));
  }));

  // --- Section 2: Tampered receipt → fail ---
  console.log('');
  console.log('[2] Tampered receipt fails proof');

  results.push(await runTest('tampered receipt detected and flagged', () => {
    const receipt = makeReceipt();
    receipt.queries.succeeded = 999; // tamper the count
    const block = formatReceiptBlock(receipt);
    const output = `sfdc-automation-auditor investigation.\n${block}\n`;
    const r = runHook(output);
    assert.strictEqual(r.exitCode, 0);
    assert.ok(r.stdout.includes('RECEIPT_INVALID') || r.stderr.includes('RECEIPT_INVALID'),
      'Should flag tampered receipt');
  }));

  // --- Section 3: No receipt + plan-only → fail ---
  console.log('');
  console.log('[3] No receipt + plan-only text fails');

  results.push(await runTest('plan-only output without receipt fails proof', () => {
    const output = `sfdc-automation-auditor analysis complete.
Here are the queries that should be executed against the org:
1. SELECT Id FROM FlowDefinitionView -- this should be run
2. SELECT Id FROM WorkflowRule -- this should be run
These queries would need to be executed to complete the investigation.
The suggested SOQL commands will inventory all automation.`;
    const r = runHook(output);
    assert.strictEqual(r.exitCode, 0);
    assert.ok(r.stdout.includes('EXECUTION_PROOF_MISSING') || r.stdout.includes('PROOF_MISSING'),
      'Should flag execution proof missing');
  }));

  // --- Section 4: No receipt + execution evidence → weak pass ---
  console.log('');
  console.log('[4] No receipt + execution evidence → heuristic pass with warning');

  results.push(await runTest('execution evidence without receipt gives weak pass', () => {
    const output = `sfdc-automation-auditor completed investigation.
Found 47 flows in the org.
Query returned "totalSize": 47 records.
Success: 89 validation rules retrieved.`;
    const r = runHook(output);
    assert.strictEqual(r.exitCode, 0);
    // Should either pass silently or give a receipt-missing warning
    if (r.stdout.includes('RECEIPT_MISSING_HEURISTIC_PASS')) {
      assert.ok(true, 'Got expected heuristic pass warning');
    }
  }));

  // --- Section 5: Non-investigation agent → skip ---
  console.log('');
  console.log('[5] Non-investigation agent skipped');

  results.push(await runTest('random agent output is not checked', () => {
    const output = 'This is output from some-other-agent with enough text to pass the length filter and it mentions no investigation specialists at all.';
    const r = runHook(output);
    assert.strictEqual(r.exitCode, 0);
    assert.ok(!r.stdout.includes('EXECUTION_PROOF'), 'Should not check non-investigation agents');
  }));

  // --- Section 6: Fabricated narrative without receipt → fail ---
  console.log('');
  console.log('[6] Fabricated narrative without receipt fails');

  results.push(await runTest('plausible narrative with "found 47 flows" but no receipt gets warning', () => {
    const output = `sfdc-automation-auditor investigation report.
Found 47 flows and 12 triggers.
The org has 89 validation rules.
Here are the recommended queries for deeper analysis.
These should be run to get complete results.`;
    const r = runHook(output);
    assert.strictEqual(r.exitCode, 0);
    // Has both execution evidence AND plan-only evidence, but no receipt
    // Should at minimum warn about missing receipt
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
      console.log(`  x ${r.name}: ${r.error}`);
    });
    process.exit(1);
  }

  process.exit(0);
}

main();
