#!/usr/bin/env node

/**
 * Unit tests for SalesforceNativeMerger ACR pre-merge resolution integration.
 */

const assert = require('assert');
const SalesforceNativeMerger = require('../scripts/lib/salesforce-native-merger');

class StubMerger extends SalesforceNativeMerger {
  constructor(options = {}) {
    super('test-org', options);
    this.calls = {
      resolveAcr: 0,
      delete: 0,
      reparent: 0,
      updateFields: 0
    };
  }

  async queryRecordWithAllFields(id) {
    return { Id: id, Name: `Account-${id}` };
  }

  async captureRelationships() {
    return {
      Contacts: [],
      Opportunities: [],
      Cases: [],
      Custom: []
    };
  }

  mergeFieldValues() {
    return [];
  }

  async resolveAccountContactRelationConflicts(masterId, duplicateId) {
    this.calls.resolveAcr += 1;
    return {
      hasAcr: true,
      sharedContactCount: 1,
      autoDeletedCount: this.dryRun ? 1 : 1,
      deletedRelationshipIds: ['07kAAA000000111AAA'],
      manualConflicts: [],
      autoResolvableConflicts: [
        { contactId: '003AAA000000111AAA', deleteRelationshipIds: ['07kAAA000000111AAA'] }
      ],
      masterId,
      duplicateId
    };
  }

  async executeFieldUpdates() {
    this.calls.updateFields += 1;
  }

  async reparentRelatedRecords() {
    this.calls.reparent += 1;
    return { Contacts: 0, Opportunities: 0, Cases: 0, Custom: 0 };
  }

  async executeDelete() {
    this.calls.delete += 1;
  }
}

async function runTest(name, fn) {
  process.stdout.write(`  ${name}... `);
  try {
    await fn();
    console.log('OK');
    return true;
  } catch (error) {
    console.log('FAIL');
    console.log(`    ${error.message}`);
    return false;
  }
}

async function main() {
  console.log('\n[Tests] SalesforceNativeMerger ACR Integration\n');

  let passed = 0;
  let failed = 0;

  if (await runTest('Dry run includes ACR resolution summary and skips destructive actions', async () => {
    const merger = new StubMerger({ dryRun: true, verbose: false });
    const result = await merger.mergeAccounts('001AAA000000001AAA', '001AAA000000002AAA');

    assert.strictEqual(merger.calls.resolveAcr, 1, 'Expected ACR resolution to run before merge');
    assert.strictEqual(merger.calls.delete, 0, 'Dry run should not delete duplicate account');
    assert.strictEqual(result.status, 'DRY_RUN_SUCCESS');
    assert.ok(result.acrResolution, 'Dry run result should include ACR resolution metadata');
    assert.strictEqual(result.acrResolution.autoDeletedCount, 1);
  })) {
    passed += 1;
  } else {
    failed += 1;
  }

  if (await runTest('Live merge includes ACR resolution summary and executes merge pipeline', async () => {
    const merger = new StubMerger({ dryRun: false, verbose: false });
    const result = await merger.mergeAccounts('001AAA000000003AAA', '001AAA000000004AAA');

    assert.strictEqual(merger.calls.resolveAcr, 1, 'Expected ACR resolution to run before merge');
    assert.strictEqual(merger.calls.reparent, 1, 'Expected reparenting stage to run');
    assert.strictEqual(merger.calls.delete, 1, 'Expected duplicate delete stage to run');
    assert.strictEqual(result.status, 'SUCCESS');
    assert.ok(result.acrResolution, 'Result should include ACR resolution metadata');
    assert.strictEqual(result.acrResolution.autoDeletedCount, 1);
  })) {
    passed += 1;
  } else {
    failed += 1;
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
