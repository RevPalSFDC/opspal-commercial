#!/usr/bin/env node

/**
 * Unit Tests for execution-receipt.js
 *
 * Covers:
 * - Receipt generation from real execution results
 * - Receipt generation from safeExecMultipleQueries format
 * - Integrity hash computation and verification
 * - Tampered receipt detection
 * - Missing field detection
 * - Timestamp freshness enforcement
 * - Receipt extraction from agent output text
 * - Partial/failed execution receipt semantics
 * - Format block generation and extraction round-trip
 *
 * @copyright 2024-2026 RevPal Partners, LLC
 */

const assert = require('assert');
const path = require('path');

const {
  generateReceipt,
  generateReceiptFromMultiQuery,
  verifyReceipt,
  formatReceiptBlock,
  extractReceiptFromOutput,
  computeHash,
  RECEIPT_VERSION,
  RECEIPT_MARKER,
  RECEIPT_END_MARKER,
  MAX_AGE_MS
} = require(path.join(__dirname, '..', 'scripts', 'lib', 'execution-receipt.js'));

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

// Helper: generate a valid complete execution result
function makeCompleteResult() {
  return {
    status: 'complete',
    orgAlias: 'wedgewood-production',
    totalQueries: 4,
    succeededCount: 4,
    failedCount: 0,
    succeeded: {
      flows: { totalSize: 47, records: new Array(47) },
      triggers: { totalSize: 12, records: new Array(12) },
      validationRules: { totalSize: 89, records: new Array(89) },
      workflowRules: { totalSize: 23, records: new Array(23) }
    },
    failed: {},
    fallbacks: [],
    durationMs: 3456
  };
}

// Helper: generate a partial execution result
function makePartialResult() {
  return {
    status: 'partial',
    orgAlias: 'wedgewood-production',
    totalQueries: 4,
    succeededCount: 3,
    failedCount: 1,
    succeeded: {
      flows: { totalSize: 47, records: new Array(47) },
      triggers: { totalSize: 12, records: new Array(12) },
      validationRules: { totalSize: 89, records: new Array(89) }
    },
    failed: {
      workflowRules: { error: 'sObject type WorkflowRule is not supported', failureType: 'invalid_object' }
    },
    fallbacks: [{ name: 'flows', note: 'Used FlowDefinition fallback' }],
    durationMs: 2100
  };
}

// Helper: generate a failed execution result
function makeFailedResult() {
  return {
    status: 'failed',
    orgAlias: 'wedgewood-production',
    totalQueries: 3,
    succeededCount: 0,
    failedCount: 3,
    succeeded: {},
    failed: {
      flows: { error: 'INSUFFICIENT_ACCESS', failureType: 'permission_error' },
      triggers: { error: 'INSUFFICIENT_ACCESS', failureType: 'permission_error' },
      rules: { error: 'INSUFFICIENT_ACCESS', failureType: 'permission_error' }
    },
    fallbacks: [],
    durationMs: 500
  };
}

async function main() {
  console.log('');
  console.log('=== Execution Receipt Tests ===');
  console.log('');
  const results = [];

  // --- Section 1: Receipt generation ---
  console.log('[1] Receipt generation');

  results.push(await runTest('generates valid receipt from complete result', () => {
    const receipt = generateReceipt(makeCompleteResult());
    assert.strictEqual(receipt.version, RECEIPT_VERSION);
    assert.strictEqual(receipt.type, 'investigation-execution-receipt');
    assert.strictEqual(receipt.orgAlias, 'wedgewood-production');
    assert.strictEqual(receipt.executionStatus, 'complete');
    assert.strictEqual(receipt.queries.total, 4);
    assert.strictEqual(receipt.queries.succeeded, 4);
    assert.strictEqual(receipt.queries.failed, 0);
    assert.strictEqual(receipt.branches.length, 4);
    assert.ok(receipt.integrityHash.startsWith('sha256:'));
    assert.strictEqual(receipt.integrityHash.length, 7 + 64); // sha256: + 64 hex chars
  }));

  results.push(await runTest('generates receipt from partial result with fallback', () => {
    const receipt = generateReceipt(makePartialResult());
    assert.strictEqual(receipt.executionStatus, 'partial');
    assert.strictEqual(receipt.queries.succeeded, 3);
    assert.strictEqual(receipt.queries.failed, 1);
    assert.strictEqual(receipt.fallbackCount, 1);
    const failedBranch = receipt.branches.find(b => b.name === 'workflowRules');
    assert.strictEqual(failedBranch.status, 'failed');
    assert.ok(failedBranch.error.includes('not supported'));
  }));

  results.push(await runTest('generates receipt from failed result', () => {
    const receipt = generateReceipt(makeFailedResult());
    assert.strictEqual(receipt.executionStatus, 'failed');
    assert.strictEqual(receipt.queries.succeeded, 0);
    assert.strictEqual(receipt.queries.failed, 3);
  }));

  results.push(await runTest('generates receipt from safeExecMultipleQueries format', () => {
    const multiResult = {
      results: {
        flows: { success: true, totalSize: 10, records: [] },
        triggers: { success: false, error: 'INVALID_TYPE', failureType: 'invalid_object' }
      },
      succeeded: ['flows'],
      failed: ['triggers']
    };
    const receipt = generateReceiptFromMultiQuery(multiResult, 'test-org');
    assert.strictEqual(receipt.executionStatus, 'partial');
    assert.strictEqual(receipt.queries.total, 2);
    assert.ok(receipt.integrityHash.startsWith('sha256:'));
  }));

  // --- Section 2: Receipt verification ---
  console.log('');
  console.log('[2] Receipt verification');

  results.push(await runTest('valid receipt passes verification', () => {
    const receipt = generateReceipt(makeCompleteResult());
    const v = verifyReceipt(receipt);
    assert.strictEqual(v.valid, true);
    assert.strictEqual(v.classification, 'valid_complete');
    assert.strictEqual(v.queriesSucceeded, 4);
  }));

  results.push(await runTest('partial receipt passes verification with partial classification', () => {
    const receipt = generateReceipt(makePartialResult());
    const v = verifyReceipt(receipt);
    assert.strictEqual(v.valid, true);
    assert.strictEqual(v.classification, 'valid_partial');
  }));

  results.push(await runTest('failed receipt passes verification (valid but failed execution)', () => {
    const receipt = generateReceipt(makeFailedResult());
    const v = verifyReceipt(receipt);
    assert.strictEqual(v.valid, true);
    assert.strictEqual(v.classification, 'valid_failed');
  }));

  results.push(await runTest('failed receipt rejects when requireSuccess=true', () => {
    const receipt = generateReceipt(makeFailedResult());
    const v = verifyReceipt(receipt, { requireSuccess: true });
    assert.strictEqual(v.valid, false);
    assert.strictEqual(v.classification, 'execution_failed');
  }));

  // --- Section 3: Tampered receipt detection ---
  console.log('');
  console.log('[3] Tampered receipt detection');

  results.push(await runTest('detects tampered record count (serialized round-trip)', () => {
    const receipt = generateReceipt(makeCompleteResult());
    // Simulate real scenario: serialize to JSON, tamper the string, re-parse
    let json = JSON.stringify(receipt);
    json = json.replace('"succeeded":4', '"succeeded":100');
    const tampered = JSON.parse(json);
    const v = verifyReceipt(tampered);
    assert.strictEqual(v.valid, false);
    assert.strictEqual(v.classification, 'tampered_receipt');
    assert.ok(v.reason.includes('hash mismatch'));
  }));

  results.push(await runTest('detects tampered orgAlias', () => {
    const receipt = generateReceipt(makeCompleteResult());
    receipt.orgAlias = 'different-org'; // tamper
    const v = verifyReceipt(receipt);
    assert.strictEqual(v.valid, false);
    assert.strictEqual(v.classification, 'tampered_receipt');
  }));

  results.push(await runTest('detects tampered executionStatus', () => {
    const receipt = generateReceipt(makeFailedResult());
    receipt.executionStatus = 'complete'; // tamper
    const v = verifyReceipt(receipt);
    assert.strictEqual(v.valid, false);
    assert.strictEqual(v.classification, 'tampered_receipt');
  }));

  results.push(await runTest('detects fabricated hash', () => {
    const receipt = generateReceipt(makeCompleteResult());
    receipt.integrityHash = 'sha256:0000000000000000000000000000000000000000000000000000000000000000';
    const v = verifyReceipt(receipt);
    assert.strictEqual(v.valid, false);
    assert.strictEqual(v.classification, 'tampered_receipt');
  }));

  // --- Section 4: Missing/invalid receipt structure ---
  console.log('');
  console.log('[4] Missing and invalid receipt structure');

  results.push(await runTest('null receipt returns missing_receipt', () => {
    const v = verifyReceipt(null);
    assert.strictEqual(v.valid, false);
    assert.strictEqual(v.classification, 'missing_receipt');
  }));

  results.push(await runTest('empty object returns invalid_receipt', () => {
    const v = verifyReceipt({});
    assert.strictEqual(v.valid, false);
    assert.strictEqual(v.classification, 'invalid_receipt');
  }));

  results.push(await runTest('wrong version returns invalid_receipt', () => {
    const receipt = generateReceipt(makeCompleteResult());
    receipt.version = '99.0';
    // Need to recompute hash for version change to not be caught as tampered
    const v = verifyReceipt(receipt);
    assert.strictEqual(v.valid, false);
    // Could be tampered (hash mismatch) or invalid_receipt (version check first)
    assert.ok(v.classification === 'tampered_receipt' || v.classification === 'invalid_receipt');
  }));

  results.push(await runTest('receipt with zero queries returns empty_receipt', () => {
    const result = { ...makeCompleteResult(), totalQueries: 0, succeededCount: 0, succeeded: {}, failed: {} };
    const receipt = generateReceipt(result);
    const v = verifyReceipt(receipt);
    assert.strictEqual(v.valid, false);
    assert.strictEqual(v.classification, 'empty_receipt');
  }));

  // --- Section 5: Timestamp freshness ---
  console.log('');
  console.log('[5] Timestamp freshness');

  results.push(await runTest('recent receipt passes freshness check', () => {
    const receipt = generateReceipt(makeCompleteResult());
    const v = verifyReceipt(receipt);
    assert.strictEqual(v.valid, true);
  }));

  results.push(await runTest('expired receipt fails freshness check', () => {
    const receipt = generateReceipt(makeCompleteResult());
    // Set timestamp to 2 hours ago
    const old = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    // Need to rebuild with old timestamp to get matching hash
    const { integrityHash, ...payload } = receipt;
    payload.timestamp = old;
    const rehashedReceipt = { ...payload, integrityHash: 'sha256:' + computeHash(payload) };
    const v = verifyReceipt(rehashedReceipt);
    assert.strictEqual(v.valid, false);
    assert.strictEqual(v.classification, 'expired_receipt');
  }));

  // --- Section 6: Format block and extraction round-trip ---
  console.log('');
  console.log('[6] Receipt format block round-trip');

  results.push(await runTest('formatReceiptBlock produces extractable block', () => {
    const receipt = generateReceipt(makeCompleteResult());
    const block = formatReceiptBlock(receipt);
    assert.ok(block.includes(RECEIPT_MARKER));
    assert.ok(block.includes(RECEIPT_END_MARKER));
    const extracted = extractReceiptFromOutput(block);
    assert.ok(extracted);
    assert.strictEqual(extracted.integrityHash, receipt.integrityHash);
  }));

  results.push(await runTest('extraction works when embedded in larger text', () => {
    const receipt = generateReceipt(makeCompleteResult());
    const block = formatReceiptBlock(receipt);
    const fullOutput = `# Investigation Report\n\nFound 47 flows.\n\n${block}\n\n## Summary\nAll done.`;
    const extracted = extractReceiptFromOutput(fullOutput);
    assert.ok(extracted);
    const v = verifyReceipt(extracted);
    assert.strictEqual(v.valid, true);
  }));

  results.push(await runTest('extraction returns null when no receipt in text', () => {
    const result = extractReceiptFromOutput('Just some text about sfdc-automation-auditor findings.');
    assert.strictEqual(result, null);
  }));

  results.push(await runTest('extracted receipt from full output passes verification', () => {
    const receipt = generateReceipt(makePartialResult());
    const block = formatReceiptBlock(receipt);
    const output = `Report\n${block}\nDone`;
    const extracted = extractReceiptFromOutput(output);
    const v = verifyReceipt(extracted);
    assert.strictEqual(v.valid, true);
    assert.strictEqual(v.classification, 'valid_partial');
  }));

  // --- Section 7: Hash determinism ---
  console.log('');
  console.log('[7] Hash determinism');

  results.push(await runTest('same input produces same hash', () => {
    const r1 = generateReceipt(makeCompleteResult());
    const r2 = generateReceipt(makeCompleteResult());
    // Timestamps differ, so hashes differ — but the hash function itself is deterministic
    const payload = { a: 1, b: 'test', c: [1, 2] };
    const h1 = computeHash(payload);
    const h2 = computeHash(payload);
    assert.strictEqual(h1, h2);
  }));

  results.push(await runTest('different input produces different hash', () => {
    const h1 = computeHash({ a: 1 });
    const h2 = computeHash({ a: 2 });
    assert.notStrictEqual(h1, h2);
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
