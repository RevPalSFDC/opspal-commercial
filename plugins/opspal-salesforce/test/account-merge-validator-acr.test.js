#!/usr/bin/env node

/**
 * Unit tests for AccountMergeValidator ACR resolution planning.
 */

const assert = require('assert');
const AccountMergeValidator = require('../scripts/lib/validators/account-merge-validator');

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
  console.log('\n[Tests] AccountMergeValidator ACR Resolution\n');

  let passed = 0;
  let failed = 0;

  const validator = new AccountMergeValidator('test-org', { verbose: false });

  if (await runTest('Plans auto-resolution for loser non-direct ACR links', async () => {
    const plan = validator.buildSharedContactResolutionPlan([
      {
        contactId: '003AAA000000000AAA',
        contactName: 'Auto Resolvable Contact',
        masterRelationships: [{ id: '07kAAA000000001AAA', isDirect: true }],
        duplicateRelationships: [{ id: '07kAAA000000002AAA', isDirect: false }]
      }
    ], {
      validation: { autoResolveIndirectAcrConflicts: true }
    });

    assert.strictEqual(plan.autoResolvableConflicts.length, 1, 'Expected one auto-resolvable conflict');
    assert.strictEqual(plan.manualConflicts.length, 0, 'Expected zero manual conflicts');
    assert.deepStrictEqual(plan.deleteRelationshipIds, ['07kAAA000000002AAA']);
  })) {
    passed += 1;
  } else {
    failed += 1;
  }

  if (await runTest('Flags direct loser ACR links for manual resolution', async () => {
    const plan = validator.buildSharedContactResolutionPlan([
      {
        contactId: '003AAA000000001AAA',
        contactName: 'Manual Contact',
        masterRelationships: [{ id: '07kAAA000000003AAA', isDirect: true }],
        duplicateRelationships: [{ id: '07kAAA000000004AAA', isDirect: true }]
      }
    ], {
      validation: { autoResolveIndirectAcrConflicts: true }
    });

    assert.strictEqual(plan.autoResolvableConflicts.length, 0, 'Expected zero auto-resolvable conflicts');
    assert.strictEqual(plan.manualConflicts.length, 1, 'Expected one manual conflict');
    assert.ok(
      plan.manualConflicts[0].reason.includes('requires manual choice'),
      'Expected manual reason for direct loser relationship'
    );
  })) {
    passed += 1;
  } else {
    failed += 1;
  }

  if (await runTest('Dry-run cleanup returns deletion plan without mutating', async () => {
    const mock = new AccountMergeValidator('test-org', { verbose: false });

    mock.checkAccountContactRelationEnabled = async () => true;
    mock.querySharedContactRelationships = async () => ([
      {
        contactId: '003AAA000000002AAA',
        contactName: 'Dry Run Contact',
        masterRelationships: [{ id: '07kAAA000000005AAA', isDirect: true }],
        duplicateRelationships: [{ id: '07kAAA000000006AAA', isDirect: false }]
      }
    ]);

    let deleteCalls = 0;
    mock.deleteAccountContactRelation = async () => {
      deleteCalls += 1;
    };

    const cleanup = await mock.cleanupSharedContactConflicts(
      '001AAA000000001AAA',
      '001AAA000000002AAA',
      { validation: { autoResolveIndirectAcrConflicts: true } },
      { dryRun: true, failOnManualConflicts: true }
    );

    assert.strictEqual(cleanup.autoDeletedCount, 1, 'Expected one planned deletion');
    assert.strictEqual(deleteCalls, 0, 'Dry run should not execute deletions');
  })) {
    passed += 1;
  } else {
    failed += 1;
  }

  if (await runTest('Fails when manual conflicts remain and failOnManualConflicts is true', async () => {
    const mock = new AccountMergeValidator('test-org', { verbose: false });

    mock.checkAccountContactRelationEnabled = async () => true;
    mock.querySharedContactRelationships = async () => ([
      {
        contactId: '003AAA000000003AAA',
        contactName: 'Manual Required',
        masterRelationships: [{ id: '07kAAA000000007AAA', isDirect: true }],
        duplicateRelationships: [{ id: '07kAAA000000008AAA', isDirect: true }]
      }
    ]);

    await assert.rejects(
      mock.cleanupSharedContactConflicts(
        '001AAA000000003AAA',
        '001AAA000000004AAA',
        { validation: { autoResolveIndirectAcrConflicts: true } },
        { dryRun: true, failOnManualConflicts: true }
      ),
      /Shared contact conflicts require manual resolution/
    );
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
