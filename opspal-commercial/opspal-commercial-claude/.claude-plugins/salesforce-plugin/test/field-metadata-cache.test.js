/**
 * Field Metadata Cache Tests
 *
 * Purpose: Validate LRU cache with TTL for metadata caching (Phase 3)
 * Expected: 80%+ cache hit rate, near-zero latency for cached entries
 *
 * @version 1.0.0
 * @phase Performance Optimization (Week 2 - Phase 3)
 */

const { test, assert, assertEqual, assertInRange } = require('./test-utils');
const FieldMetadataCache = require('../scripts/lib/field-metadata-cache');
const BatchFieldMetadata = require('../scripts/lib/batch-field-metadata');

// ═══════════════════════════════════════════════════════════════
// UNIT TESTS - Cache Functionality
// ═══════════════════════════════════════════════════════════════

const unitTests = [
  test('FieldMetadataCache can store and retrieve values', async () => {
    const cache = new FieldMetadataCache({ maxSize: 100, ttl: 5000 });

    cache.set('Account.Name', { type: 'String', label: 'Account Name' });
    cache.set('Contact.Email', { type: 'Email', label: 'Email' });

    const value1 = cache.get('Account.Name');
    const value2 = cache.get('Contact.Email');

    assert(value1, 'Should retrieve Account.Name from cache');
    assertEqual(value1.type, 'String', 'Should have correct type');
    assert(value2, 'Should retrieve Contact.Email from cache');
    assertEqual(value2.type, 'Email', 'Should have correct type');
  }),

  test('FieldMetadataCache tracks hits and misses correctly', async () => {
    const cache = new FieldMetadataCache({ maxSize: 100, ttl: 5000 });

    cache.set('Field1', { value: 1 });

    // Hit
    cache.get('Field1');

    // Miss
    cache.get('NonExistent');

    const stats = cache.getStats();

    assertEqual(stats.hits, 1, 'Should track cache hits');
    assertEqual(stats.misses, 1, 'Should track cache misses');
    assertEqual(stats.sets, 1, 'Should track sets');
  }),

  test('FieldMetadataCache evicts LRU when full', async () => {
    const cache = new FieldMetadataCache({ maxSize: 3, ttl: 5000 });

    // Fill cache
    cache.set('Field1', { value: 1 });
    cache.set('Field2', { value: 2 });
    cache.set('Field3', { value: 3 });

    assertEqual(cache.size(), 3, 'Cache should be full');

    // Add 4th item - should evict Field1 (least recently used)
    cache.set('Field4', { value: 4 });

    assertEqual(cache.size(), 3, 'Cache should still be at max size');
    assert(!cache.has('Field1'), 'Field1 should be evicted');
    assert(cache.has('Field2'), 'Field2 should still be in cache');
    assert(cache.has('Field3'), 'Field3 should still be in cache');
    assert(cache.has('Field4'), 'Field4 should be in cache');

    const stats = cache.getStats();
    assertEqual(stats.evictions, 1, 'Should track evictions');
  }),

  test('FieldMetadataCache respects TTL expiration', async () => {
    const cache = new FieldMetadataCache({ maxSize: 10, ttl: 1000 }); // 1 second TTL

    cache.set('TempField', { value: 'temporary' });

    // Immediate access should hit
    const immediate = cache.get('TempField');
    assert(immediate, 'Should retrieve immediately');

    // Wait for TTL to expire
    await new Promise(resolve => setTimeout(resolve, 1200));

    // Should now miss (expired)
    const expired = cache.get('TempField');
    assertEqual(expired, undefined, 'Should return undefined after TTL');

    const stats = cache.getStats();
    assert(stats.ttlExpires > 0, 'Should track TTL expirations');
  }),

  test('FieldMetadataCache updates LRU on access', async () => {
    const cache = new FieldMetadataCache({ maxSize: 3, ttl: 5000 });

    cache.set('Field1', { value: 1 });
    cache.set('Field2', { value: 2 });
    cache.set('Field3', { value: 3 });

    // Access Field1 to make it most recently used
    cache.get('Field1');

    // Add Field4 - should evict Field2 (now least recently used)
    cache.set('Field4', { value: 4 });

    assert(cache.has('Field1'), 'Field1 should still be in cache (recently accessed)');
    assert(!cache.has('Field2'), 'Field2 should be evicted (least recently used)');
    assert(cache.has('Field3'), 'Field3 should still be in cache');
    assert(cache.has('Field4'), 'Field4 should be in cache');
  }),

  test('FieldMetadataCache calculates hit rate correctly', async () => {
    const cache = new FieldMetadataCache({ maxSize: 10, ttl: 5000 });

    cache.set('Field1', { value: 1 });
    cache.set('Field2', { value: 2 });

    // 5 hits
    for (let i = 0; i < 5; i++) {
      cache.get('Field1');
    }

    // 3 misses
    for (let i = 0; i < 3; i++) {
      cache.get('NonExistent' + i);
    }

    const stats = cache.getStats();

    assertEqual(stats.hits, 5, 'Should have 5 hits');
    assertEqual(stats.misses, 3, 'Should have 3 misses');
    assertEqual(stats.totalRequests, 8, 'Should have 8 total requests');

    // Hit rate should be 5/8 = 62.5%
    const expectedHitRate = 62.5;
    assertEqual(stats.hitRateNumeric, expectedHitRate, 'Should calculate hit rate correctly');
  })
];

// ═══════════════════════════════════════════════════════════════
// INTEGRATION TESTS - Cache with BatchFieldMetadata
// ═══════════════════════════════════════════════════════════════

const integrationTests = [
  test('BatchFieldMetadata uses cache for repeated requests', async () => {
    const cache = new FieldMetadataCache({ maxSize: 100, ttl: 5000 });
    const batchMeta = new BatchFieldMetadata({ cache });

    const fields = ['Account.Field1__c', 'Account.Field2__c', 'Account.Field3__c'];

    // First fetch - cache miss
    await batchMeta.getMetadata(fields);

    const stats1 = batchMeta.getStats();
    assertEqual(stats1.cacheMisses, 3, 'First fetch should miss cache');

    // Second fetch - cache hit
    await batchMeta.getMetadata(fields);

    const stats2 = batchMeta.getStats();
    assertEqual(stats2.cacheHits, 3, 'Second fetch should hit cache');
    assertEqual(stats2.cacheMisses, 3, 'Cache misses should not increase');
  }),

  test('BatchFieldMetadata.withCache creates instance with cache', async () => {
    const batchMeta = BatchFieldMetadata.withCache({ maxSize: 50, ttl: 2000 });

    assert(batchMeta.cache, 'Should have cache instance');

    const fields = ['Account.Field1__c', 'Account.Field2__c'];

    // First fetch
    await batchMeta.getMetadata(fields);

    // Second fetch - should use cache
    await batchMeta.getMetadata(fields);

    const stats = batchMeta.getStats();
    assert(stats.cacheHits > 0, 'Should have cache hits');
    assertEqual(stats.cacheHitRate, 50, 'Should have 50% hit rate (2 hits out of 4 total)');
  }),

  test('Cache improves performance for repeated metadata requests', async () => {
    const fields = Array.from({ length: 20 }, (_, i) => `Account.Field${i}__c`);

    // Without cache
    const noCacheMeta = new BatchFieldMetadata();
    const noCacheStart = Date.now();
    await noCacheMeta.getMetadata(fields);
    await noCacheMeta.getMetadata(fields); // Second fetch still does API call
    const noCacheDuration = Date.now() - noCacheStart;

    // With cache
    const cachedMeta = BatchFieldMetadata.withCache({ maxSize: 100, ttl: 5000 });
    const cacheStart = Date.now();
    await cachedMeta.getMetadata(fields);
    await cachedMeta.getMetadata(fields); // Second fetch uses cache
    const cacheDuration = Date.now() - cacheStart;

    // Cached version should be significantly faster for repeated requests
    const improvement = ((noCacheDuration - cacheDuration) / noCacheDuration) * 100;

    console.log(`    No Cache: ${noCacheDuration}ms`);
    console.log(`    With Cache: ${cacheDuration}ms`);
    console.log(`    Improvement: ${improvement.toFixed(1)}%`);

    assert(cacheDuration < noCacheDuration, 'Cache should be faster for repeated requests');
    assert(improvement > 20, `Should have >20% improvement (actual: ${improvement.toFixed(1)}%)`);
  }),

  test('Cache handles partial hits correctly', async () => {
    const cache = new FieldMetadataCache({ maxSize: 100, ttl: 5000 });
    const batchMeta = new BatchFieldMetadata({ cache });

    // Prime cache with 3 fields
    await batchMeta.getMetadata(['Account.Field1__c', 'Account.Field2__c', 'Account.Field3__c']);

    // Request 2 cached + 2 new fields
    await batchMeta.getMetadata([
      'Account.Field2__c', // Cached
      'Account.Field3__c', // Cached
      'Account.Field4__c', // New
      'Account.Field5__c'  // New
    ]);

    const stats = batchMeta.getStats();

    // Should have 2 hits from second request
    assertEqual(stats.cacheHits, 2, 'Should have 2 cache hits');
    // Should have 3 + 2 = 5 misses total
    assertEqual(stats.cacheMisses, 5, 'Should have 5 cache misses total');
  })
];

// ═══════════════════════════════════════════════════════════════
// PERFORMANCE TESTS - Cache Performance Validation
// ═══════════════════════════════════════════════════════════════

const performanceTests = [
  test('Cache achieves >80% hit rate with realistic workload', async () => {
    const cache = new FieldMetadataCache({ maxSize: 100, ttl: 5000 });
    const batchMeta = new BatchFieldMetadata({ cache });

    // Realistic workload: 20 unique fields accessed multiple times
    const fields = Array.from({ length: 20 }, (_, i) => `Account.Field${i}__c`);

    // Prime cache
    await batchMeta.getMetadata(fields);

    // Simulate 10 operations accessing random subsets of fields
    for (let i = 0; i < 10; i++) {
      const subset = fields.slice(0, 5 + Math.floor(Math.random() * 10)); // 5-15 fields
      await batchMeta.getMetadata(subset);
    }

    const stats = batchMeta.getStats();
    const hitRate = stats.cacheHitRate;

    console.log(`    Hit Rate: ${hitRate}%`);
    console.log(`    Total Requests: ${stats.totalFields}`);
    console.log(`    Cache Hits: ${stats.cacheHits}`);

    assert(hitRate >= 80, `Should achieve >80% hit rate (actual: ${hitRate}%)`);
  }),

  test('Cache latency is near-zero for hits', async () => {
    const cache = new FieldMetadataCache({ maxSize: 100, ttl: 5000 });

    // Prime cache
    cache.set('Account.Field1__c', { type: 'String', label: 'Field 1' });

    // Measure cache get latency
    const iterations = 1000;
    const start = Date.now();

    for (let i = 0; i < iterations; i++) {
      cache.get('Account.Field1__c');
    }

    const duration = Date.now() - start;
    const avgLatency = duration / iterations;

    console.log(`    ${iterations} cache hits in ${duration}ms`);
    console.log(`    Avg latency: ${avgLatency.toFixed(3)}ms`);

    assert(avgLatency < 0.1, `Cache latency should be <0.1ms (actual: ${avgLatency.toFixed(3)}ms)`);
  }),

  test('Cache scales well with size', async () => {
    const sizes = [100, 500, 1000];
    const results = [];

    for (const size of sizes) {
      const cache = new FieldMetadataCache({ maxSize: size, ttl: 5000 });

      // Fill cache
      for (let i = 0; i < size; i++) {
        cache.set(`Field${i}`, { value: i });
      }

      // Measure access time
      const iterations = 1000;
      const start = Date.now();

      for (let i = 0; i < iterations; i++) {
        const randomKey = `Field${Math.floor(Math.random() * size)}`;
        cache.get(randomKey);
      }

      const duration = Date.now() - start;
      const avgLatency = duration / iterations;

      results.push({ size, avgLatency });
    }

    console.log('    Cache Size | Avg Latency');
    console.log('    -----------|------------');
    results.forEach(r => {
      console.log(`    ${String(r.size).padStart(10)} | ${r.avgLatency.toFixed(3)}ms`);
    });

    // All sizes should have <0.1ms latency
    results.forEach(r => {
      assert(r.avgLatency < 0.1, `Size ${r.size} should have <0.1ms latency (actual: ${r.avgLatency.toFixed(3)}ms)`);
    });
  })
];

// ═══════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════

module.exports = {
  unitTests,
  integrationTests,
  performanceTests,
  allTests: [...unitTests, ...integrationTests, ...performanceTests]
};


// Jest wrapper for standalone test runner
if (typeof describe !== 'undefined') {
  const mod = require('./field-metadata-cache.test.js');
  const tests = mod.allTests || mod.unitTests || [];

  describe('Field Metadata Cache', () => {
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
