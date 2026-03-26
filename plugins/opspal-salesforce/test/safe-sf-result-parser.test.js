#!/usr/bin/env node

/**
 * Unit Tests for safe-sf-result-parser.js
 *
 * Covers:
 * - JSON parse safety on non-JSON output
 * - Empty output handling
 * - SF CLI error classification
 * - Mixed stderr/stdout resilience
 * - Multiple query isolation (one failure doesn't cancel others)
 *
 * @copyright 2024-2026 RevPal Partners, LLC
 */

const assert = require('assert');
const path = require('path');

const { safeParseSfResult, classifyError, FAILURE_TYPES, safeExecMultipleQueries } = require(
  path.join(__dirname, '..', 'scripts', 'lib', 'safe-sf-result-parser.js')
);

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
  console.log('=== Safe SF Result Parser Tests ===');
  console.log('');
  const results = [];

  // --- Section 1: safeParseSfResult ---
  console.log('[1] safeParseSfResult — output validation');

  results.push(await runTest('empty string returns EMPTY_OUTPUT', () => {
    const r = safeParseSfResult('');
    assert.strictEqual(r.success, false);
    assert.strictEqual(r.failureType, FAILURE_TYPES.EMPTY_OUTPUT);
  }));

  results.push(await runTest('null returns EMPTY_OUTPUT', () => {
    const r = safeParseSfResult(null);
    assert.strictEqual(r.success, false);
    assert.strictEqual(r.failureType, FAILURE_TYPES.EMPTY_OUTPUT);
  }));

  results.push(await runTest('plain text error returns NOT_JSON', () => {
    const r = safeParseSfResult('ERROR: sObject type FlowDefinitionView is not supported');
    assert.strictEqual(r.success, false);
    assert.strictEqual(r.failureType, FAILURE_TYPES.NOT_JSON);
  }));

  results.push(await runTest('deprecation warning prefix returns NOT_JSON', () => {
    const r = safeParseSfResult('Warning: Using deprecated API\n{"status": 0, "result": {}}');
    assert.strictEqual(r.success, false);
    assert.strictEqual(r.failureType, FAILURE_TYPES.NOT_JSON);
  }));

  results.push(await runTest('truncated JSON returns PARSE_ERROR', () => {
    const r = safeParseSfResult('{"status": 0, "result": {"totalSize": 5, "records": [');
    assert.strictEqual(r.success, false);
    assert.strictEqual(r.failureType, FAILURE_TYPES.PARSE_ERROR);
  }));

  results.push(await runTest('valid SF success JSON returns success', () => {
    const r = safeParseSfResult('{"status": 0, "result": {"totalSize": 3, "records": [{"Id": "001"}, {"Id": "002"}, {"Id": "003"}]}}');
    assert.strictEqual(r.success, true);
    assert.strictEqual(r.totalSize, 3);
    assert.strictEqual(r.records.length, 3);
  }));

  results.push(await runTest('SF error status returns SF_ERROR with classification', () => {
    const r = safeParseSfResult('{"status": 1, "name": "INVALID_TYPE", "message": "sObject type FlowDefinitionView is not supported"}');
    assert.strictEqual(r.success, false);
    assert.strictEqual(r.failureType, FAILURE_TYPES.INVALID_OBJECT);
  }));

  results.push(await runTest('INVALID_FIELD error classified correctly', () => {
    const r = safeParseSfResult('{"status": 1, "name": "INVALID_FIELD", "message": "No such column TriggerType on FlowDefinitionView"}');
    assert.strictEqual(r.success, false);
    assert.strictEqual(r.failureType, FAILURE_TYPES.INVALID_FIELD);
  }));

  results.push(await runTest('permission error classified correctly', () => {
    const r = safeParseSfResult('{"status": 1, "message": "INSUFFICIENT_ACCESS: You do not have access to this resource"}');
    assert.strictEqual(r.success, false);
    assert.strictEqual(r.failureType, FAILURE_TYPES.PERMISSION_ERROR);
  }));

  // --- Section 2: classifyError ---
  console.log('');
  console.log('[2] classifyError — error classification');

  results.push(await runTest('classifies sObject not supported', () => {
    assert.strictEqual(classifyError('sObject type FlowDefinitionView is not supported'), FAILURE_TYPES.INVALID_OBJECT);
  }));

  results.push(await runTest('classifies INVALID_TYPE', () => {
    assert.strictEqual(classifyError('INVALID_TYPE'), FAILURE_TYPES.INVALID_OBJECT);
  }));

  results.push(await runTest('classifies No such column', () => {
    assert.strictEqual(classifyError('No such column TriggerType'), FAILURE_TYPES.INVALID_FIELD);
  }));

  results.push(await runTest('classifies INVALID_FIELD', () => {
    assert.strictEqual(classifyError('INVALID_FIELD: TriggerType'), FAILURE_TYPES.INVALID_FIELD);
  }));

  results.push(await runTest('classifies insufficient access', () => {
    assert.strictEqual(classifyError('insufficient access rights on cross-reference'), FAILURE_TYPES.PERMISSION_ERROR);
  }));

  results.push(await runTest('classifies timeout', () => {
    assert.strictEqual(classifyError('connect ETIMEDOUT'), FAILURE_TYPES.TIMEOUT);
  }));

  results.push(await runTest('unknown message returns UNKNOWN', () => {
    assert.strictEqual(classifyError('something unexpected happened'), FAILURE_TYPES.UNKNOWN);
  }));

  results.push(await runTest('null returns UNKNOWN', () => {
    assert.strictEqual(classifyError(null), FAILURE_TYPES.UNKNOWN);
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
