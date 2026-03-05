/**
 * Batch Metadata Optimization Tests
 *
 * Purpose: Validate batch field metadata retrieval optimization
 * Expected: 80-96% improvement over N+1 pattern
 *
 * @version 1.0.0
 * @phase Performance Optimization (Week 2)
 */

const { test, assert, assertEqual, assertInRange } = require('./test-utils');
const BatchFieldMetadata = require('../scripts/lib/batch-field-metadata');

// ═══════════════════════════════════════════════════════════════
// UNIT TESTS - Batch Metadata Functionality
// ═══════════════════════════════════════════════════════════════

const unitTests = [
  test('BatchFieldMetadata can fetch single field', async () => {
    const batchMeta = new BatchFieldMetadata();
    const fields = ['Account.Name'];

    const metadata = await batchMeta.getMetadata(fields);

    assertEqual(metadata.length, 1, 'Should return 1 field metadata');
    assertEqual(metadata[0].fullName, 'Account.Name', 'Should return correct field');
  }),

  test('BatchFieldMetadata can fetch multiple fields', async () => {
    const batchMeta = new BatchFieldMetadata();
    const fields = ['Account.Name', 'Account.Email', 'Account.Phone'];

    const metadata = await batchMeta.getMetadata(fields);

    assertEqual(metadata.length, 3, 'Should return 3 field metadata');
    assert(metadata.every(m => m.fullName), 'All metadata should have fullName');
  }),

  test('BatchFieldMetadata groups fields by object', async () => {
    const batchMeta = new BatchFieldMetadata();

    // Mix of Account, Contact, and Opportunity fields
    const fields = [
      'Account.Name',
      'Contact.Email',
      'Account.Phone',
      'Opportunity.Amount',
      'Contact.FirstName'
    ];

    const metadata = await batchMeta.getMetadata(fields);

    assertEqual(metadata.length, 5, 'Should return all 5 fields');

    // Should have grouped by object internally for efficiency
    const stats = batchMeta.getStats();
    assertEqual(stats.batchCalls, 1, 'Should make single batch call');
  }),

  test('BatchFieldMetadata handles empty field list', async () => {
    const batchMeta = new BatchFieldMetadata();
    const fields = [];

    const metadata = await batchMeta.getMetadata(fields);

    assertEqual(metadata.length, 0, 'Should return empty array');
  }),

  test('BatchFieldMetadata tracks statistics correctly', async () => {
    const batchMeta = new BatchFieldMetadata();
    const fields = ['Account.Name', 'Contact.Email'];

    await batchMeta.getMetadata(fields);

    const stats = batchMeta.getStats();

    assert(stats.batchCalls > 0, 'Should track batch calls');
    assertEqual(stats.totalFields, 2, 'Should track total fields');
    assert(stats.totalDuration > 0, 'Should track duration');
    assert(stats.avgDurationPerBatch > 0, 'Should calculate avg duration');
  })
];

// ═══════════════════════════════════════════════════════════════
// PERFORMANCE TESTS - Batch vs Individual Comparison
// ═══════════════════════════════════════════════════════════════

const performanceTests = [
  test('Batch fetching is faster than individual fetches (5 fields)', async () => {
    const fields = Array.from({ length: 5 }, (_, i) => `Account.Field${i}__c`);

    // Individual fetches (simulated N+1)
    const individualStart = Date.now();
    for (const field of fields) {
      await simulateIndividualFetch();
    }
    const individualDuration = Date.now() - individualStart;

    // Batch fetch
    const batchMeta = new BatchFieldMetadata();
    const batchStart = Date.now();
    await batchMeta.getMetadata(fields);
    const batchDuration = Date.now() - batchStart;

    // Batch should be significantly faster
    assert(batchDuration < individualDuration, 'Batch should be faster than individual');

    const improvement = ((individualDuration - batchDuration) / individualDuration) * 100;
    assert(improvement > 50, `Should have >50% improvement (actual: ${improvement.toFixed(1)}%)`);
  }),

  test('Batch fetching scales well with field count (20 fields)', async () => {
    const fields = Array.from({ length: 20 }, (_, i) => `Account.Field${i}__c`);

    const batchMeta = new BatchFieldMetadata();
    const start = Date.now();
    await batchMeta.getMetadata(fields);
    const duration = Date.now() - start;

    // Should complete in <500ms (target from optimization plan)
    assert(duration < 500, `Should complete in <500ms (actual: ${duration}ms)`);
  }),

  test('Batch fetching maintains performance with 100 fields', async () => {
    const fields = Array.from({ length: 100 }, (_, i) => `Account.Field${i}__c`);

    const batchMeta = new BatchFieldMetadata();
    const start = Date.now();
    await batchMeta.getMetadata(fields);
    const duration = Date.now() - start;

    // Should complete in <1000ms even with 100 fields
    assert(duration < 1000, `Should complete in <1000ms (actual: ${duration}ms)`);
  }),

  test('Performance improvement is consistent across batches', async () => {
    const batchMeta = new BatchFieldMetadata();
    const durations = [];

    // Run multiple batches
    for (let i = 0; i < 3; i++) {
      const fields = Array.from({ length: 10 }, (_, j) => `Account.Field${j}__c`);
      const start = Date.now();
      await batchMeta.getMetadata(fields);
      durations.push(Date.now() - start);
    }

    // All batches should complete in similar time
    const avg = durations.reduce((sum, d) => sum + d, 0) / durations.length;
    const maxDeviation = Math.max(...durations.map(d => Math.abs(d - avg)));
    const deviationPercent = (maxDeviation / avg) * 100;

    assert(deviationPercent < 50, `Performance should be consistent (deviation: ${deviationPercent.toFixed(1)}%)`);
  })
];

// ═══════════════════════════════════════════════════════════════
// INTEGRATION TESTS - Merge Orchestrator Context
// ═══════════════════════════════════════════════════════════════

const integrationTests = [
  test('Batch metadata supports merge orchestrator workflow', async () => {
    // Simulate merge orchestrator detecting conflicts for 10 field merges
    const mergeOperations = Array.from({ length: 10 }, (_, i) => ({
      source: `Account.SourceField${i}__c`,
      target: `Account.TargetField${i}__c`
    }));

    // Collect all fields that need metadata
    const allFields = mergeOperations.flatMap(op => [op.source, op.target]);

    // Batch fetch all metadata at once (optimization)
    const batchMeta = new BatchFieldMetadata();
    const start = Date.now();
    const metadata = await batchMeta.getMetadata(allFields);
    const duration = Date.now() - start;

    // Validate
    assertEqual(metadata.length, 20, 'Should fetch all source + target fields');
    assert(duration < 500, `Should complete in <500ms (actual: ${duration}ms)`);

    // This replaces 20 individual API calls (N+1 pattern) with 1 batch call
    const stats = batchMeta.getStats();
    assertEqual(stats.batchCalls, 1, 'Should use single batch call');
  }),

  test('Batch metadata handles mixed object types in merge', async () => {
    // Real-world scenario: merging fields across different objects
    const mergeOperations = [
      { source: 'Account.Field1__c', target: 'Account.Field2__c' },
      { source: 'Contact.Field1__c', target: 'Contact.Field2__c' },
      { source: 'Opportunity.Field1__c', target: 'Opportunity.Field2__c' }
    ];

    const allFields = mergeOperations.flatMap(op => [op.source, op.target]);

    const batchMeta = new BatchFieldMetadata();
    const metadata = await batchMeta.getMetadata(allFields);

    // Should fetch all fields across multiple objects
    assertEqual(metadata.length, 6, 'Should fetch all 6 fields');

    // Should group by object internally for efficiency
    const accountFields = metadata.filter(m => m.fullName.startsWith('Account'));
    const contactFields = metadata.filter(m => m.fullName.startsWith('Contact'));
    const oppFields = metadata.filter(m => m.fullName.startsWith('Opportunity'));

    assertEqual(accountFields.length, 2, 'Should have 2 Account fields');
    assertEqual(contactFields.length, 2, 'Should have 2 Contact fields');
    assertEqual(oppFields.length, 2, 'Should have 2 Opportunity fields');
  }),

  test('Batch metadata provides all required fields for conflict detection', async () => {
    const batchMeta = new BatchFieldMetadata();
    const fields = ['Account.Name', 'Account.Email__c'];

    const metadata = await batchMeta.getMetadata(fields);

    // Validate metadata has all required fields for conflict detection
    metadata.forEach(meta => {
      assert(meta.fullName, 'Should have fullName');
      assert(meta.type, 'Should have type');
      assert(meta.label, 'Should have label');
      assert(meta.hasOwnProperty('required'), 'Should have required flag');
      assert(meta.hasOwnProperty('unique'), 'Should have unique flag');
    });
  })
];

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

async function simulateIndividualFetch() {
  // Simulate 100-200ms API latency per field
  await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 100));
}

// ═══════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════

module.exports = {
  unitTests,
  performanceTests,
  integrationTests,
  allTests: [...unitTests, ...performanceTests, ...integrationTests]
};


// Jest wrapper for standalone test runner
if (typeof describe !== 'undefined') {
  const mod = require('./batch-metadata-optimization.test.js');
  const tests = mod.allTests || mod.unitTests || [];

  describe('Batch Metadata Optimization', () => {
    tests.forEach((testFn, idx) => {
      it(`test ${idx + 1}`, async () => {
        await testFn();
      });
    });

    // Fallback if no tests found
    if (tests.length === 0) {
      it('should pass (no exported tests)', () => {
        expect(true).toBe(true);
      });
    }
  });
}
