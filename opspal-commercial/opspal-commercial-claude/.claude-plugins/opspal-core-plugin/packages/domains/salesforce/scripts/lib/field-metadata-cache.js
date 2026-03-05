#!/usr/bin/env node
/**
 * Field Metadata Cache
 *
 * Purpose: LRU cache with TTL to eliminate redundant metadata API calls
 * Performance: 80%+ cache hit rate expected, near-zero latency for cached entries
 *
 * BEFORE: Repeated API calls for same fields across operations
 * ```javascript
 * const batchMeta = new BatchFieldMetadata();
 * const meta1 = await batchMeta.getMetadata(['Account.Name']); // API call
 * const meta2 = await batchMeta.getMetadata(['Account.Name']); // Same API call again!
 * ```
 *
 * AFTER: Cached metadata with TTL
 * ```javascript
 * const cache = new FieldMetadataCache({ maxSize: 1000, ttl: 3600000 }); // 1 hour TTL
 * const batchMeta = new BatchFieldMetadata({ cache });
 * const meta1 = await batchMeta.getMetadata(['Account.Name']); // API call + cache
 * const meta2 = await batchMeta.getMetadata(['Account.Name']); // Cache hit! (0ms)
 * ```
 *
 * @version 1.0.0
 * @phase Performance Optimization (Week 2 - Phase 3)
 */

/**
 * LRU Cache with TTL for field metadata
 */
class FieldMetadataCache {
  constructor(options = {}) {
    this.maxSize = options.maxSize || 1000; // Maximum number of entries
    this.ttl = options.ttl || 3600000; // Time to live in ms (default: 1 hour)
    this.cache = new Map(); // key → { value, timestamp, accessCount }
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      sets: 0,
      deletes: 0,
      ttlExpires: 0
    };
  }

  /**
   * Get value from cache
   * @param {string} key - Cache key (field API name)
   * @returns {*} Cached value or undefined
   */
  get(key) {
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      return undefined;
    }

    // Check if entry has expired
    const now = Date.now();
    const age = now - entry.timestamp;

    if (age > this.ttl) {
      this.cache.delete(key);
      this.stats.ttlExpires++;
      this.stats.misses++;
      return undefined;
    }

    // Update access tracking for LRU
    entry.accessCount++;
    entry.lastAccess = now;

    // Move to end of Map (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);

    this.stats.hits++;
    return entry.value;
  }

  /**
   * Set value in cache
   * @param {string} key - Cache key
   * @param {*} value - Value to cache
   */
  set(key, value) {
    const now = Date.now();

    // If key already exists, update it
    if (this.cache.has(key)) {
      const entry = this.cache.get(key);
      entry.value = value;
      entry.timestamp = now;
      entry.lastAccess = now;
      entry.accessCount++;

      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, entry);

      this.stats.sets++;
      return;
    }

    // If cache is full, evict least recently used
    if (this.cache.size >= this.maxSize) {
      this._evictLRU();
    }

    // Add new entry
    this.cache.set(key, {
      value,
      timestamp: now,
      lastAccess: now,
      accessCount: 0
    });

    this.stats.sets++;
  }

  /**
   * Check if key exists and is not expired
   * @param {string} key - Cache key
   * @returns {boolean}
   */
  has(key) {
    const entry = this.cache.get(key);

    if (!entry) {
      return false;
    }

    // Check expiration
    const now = Date.now();
    const age = now - entry.timestamp;

    if (age > this.ttl) {
      this.cache.delete(key);
      this.stats.ttlExpires++;
      return false;
    }

    return true;
  }

  /**
   * Delete entry from cache
   * @param {string} key - Cache key
   * @returns {boolean} True if entry was deleted
   */
  delete(key) {
    const deleted = this.cache.delete(key);
    if (deleted) {
      this.stats.deletes++;
    }
    return deleted;
  }

  /**
   * Clear all entries
   */
  clear() {
    const size = this.cache.size;
    this.cache.clear();
    this.stats.deletes += size;
  }

  /**
   * Get all keys (non-expired)
   * @returns {string[]}
   */
  keys() {
    const now = Date.now();
    const validKeys = [];

    for (const [key, entry] of this.cache.entries()) {
      const age = now - entry.timestamp;
      if (age <= this.ttl) {
        validKeys.push(key);
      }
    }

    return validKeys;
  }

  /**
   * Get cache size (non-expired entries)
   * @returns {number}
   */
  size() {
    this._cleanExpired();
    return this.cache.size;
  }

  /**
   * Get cache statistics
   * @returns {Object}
   */
  getStats() {
    const totalRequests = this.stats.hits + this.stats.misses;
    const hitRate = totalRequests > 0 ? (this.stats.hits / totalRequests) * 100 : 0;
    const missRate = totalRequests > 0 ? (this.stats.misses / totalRequests) * 100 : 0;

    return {
      ...this.stats,
      size: this.cache.size,
      maxSize: this.maxSize,
      totalRequests,
      hitRate: hitRate.toFixed(2) + '%',
      missRate: missRate.toFixed(2) + '%',
      hitRateNumeric: parseFloat(hitRate.toFixed(2)),
      evictionRate: this.stats.sets > 0
        ? ((this.stats.evictions / this.stats.sets) * 100).toFixed(2) + '%'
        : '0%'
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      sets: 0,
      deletes: 0,
      ttlExpires: 0
    };
  }

  /**
   * Evict least recently used entry
   * @private
   */
  _evictLRU() {
    // Map maintains insertion order, first entry is least recently used
    const firstKey = this.cache.keys().next().value;

    if (firstKey !== undefined) {
      this.cache.delete(firstKey);
      this.stats.evictions++;
    }
  }

  /**
   * Clean expired entries
   * @private
   */
  _cleanExpired() {
    const now = Date.now();
    const expiredKeys = [];

    for (const [key, entry] of this.cache.entries()) {
      const age = now - entry.timestamp;
      if (age > this.ttl) {
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      this.cache.delete(key);
      this.stats.ttlExpires++;
    }
  }

  /**
   * Get entry details for debugging
   * @param {string} key - Cache key
   * @returns {Object|null}
   */
  getEntryDetails(key) {
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    const now = Date.now();
    const age = now - entry.timestamp;
    const timeSinceAccess = now - entry.lastAccess;

    return {
      key,
      age,
      ageFormatted: this._formatDuration(age),
      timeSinceAccess,
      timeSinceAccessFormatted: this._formatDuration(timeSinceAccess),
      accessCount: entry.accessCount,
      expired: age > this.ttl,
      ttl: this.ttl,
      ttlRemaining: Math.max(0, this.ttl - age),
      ttlRemainingFormatted: this._formatDuration(Math.max(0, this.ttl - age))
    };
  }

  /**
   * Format duration in milliseconds to human-readable string
   * @private
   */
  _formatDuration(ms) {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
    return `${(ms / 3600000).toFixed(1)}h`;
  }
}

/**
 * Test cache performance
 */
async function testCachePerformance() {
  console.log('\n📊 Testing Field Metadata Cache Performance\n');

  const cache = new FieldMetadataCache({
    maxSize: 100,
    ttl: 5000 // 5 seconds for testing
  });

  // Test 1: Basic operations
  console.log('Test 1: Basic Cache Operations');
  cache.set('Account.Name', { type: 'String', label: 'Account Name' });
  cache.set('Contact.Email', { type: 'Email', label: 'Email' });

  console.log('  Get Account.Name:', cache.get('Account.Name') ? '✅ Hit' : '❌ Miss');
  console.log('  Get Contact.Email:', cache.get('Contact.Email') ? '✅ Hit' : '❌ Miss');
  console.log('  Get NonExistent:', cache.get('Opportunity.Amount') ? '✅ Hit' : '❌ Miss');

  // Test 2: Cache hit rate
  console.log('\nTest 2: Cache Hit Rate (100 operations)');
  const testFields = Array.from({ length: 20 }, (_, i) => `Account.Field${i}__c`);

  // Prime cache with 20 fields
  testFields.forEach(field => {
    cache.set(field, { type: 'String', label: field });
  });

  // Perform 100 random accesses (should have high hit rate)
  for (let i = 0; i < 100; i++) {
    const randomField = testFields[Math.floor(Math.random() * testFields.length)];
    cache.get(randomField);
  }

  const stats = cache.getStats();
  console.log(`  Total Requests: ${stats.totalRequests}`);
  console.log(`  Cache Hits: ${stats.hits} (${stats.hitRate})`);
  console.log(`  Cache Misses: ${stats.misses} (${stats.missRate})`);

  // Test 3: LRU eviction
  console.log('\nTest 3: LRU Eviction (maxSize: 100)');
  cache.clear();
  cache.resetStats();

  // Add 150 entries (should evict 50)
  for (let i = 0; i < 150; i++) {
    cache.set(`Field${i}`, { value: i });
  }

  const finalStats = cache.getStats();
  console.log(`  Entries Added: 150`);
  console.log(`  Cache Size: ${finalStats.size}/${finalStats.maxSize}`);
  console.log(`  Evictions: ${finalStats.evictions}`);

  // Test 4: TTL expiration
  console.log('\nTest 4: TTL Expiration (5 second TTL)');
  const shortCache = new FieldMetadataCache({ maxSize: 10, ttl: 2000 }); // 2 seconds

  shortCache.set('TempField', { value: 'temporary' });
  console.log('  Immediate access:', shortCache.get('TempField') ? '✅ Hit' : '❌ Miss');

  console.log('  Waiting 2.5 seconds for TTL expiration...');
  await new Promise(resolve => setTimeout(resolve, 2500));

  console.log('  After TTL:', shortCache.get('TempField') ? '✅ Hit' : '❌ Miss (expected)');
  console.log('  TTL Expires:', shortCache.getStats().ttlExpires);

  console.log('\n✅ Cache Performance Tests Complete\n');
}

/**
 * CLI for testing cache
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help') {
    console.log(`
Field Metadata Cache - LRU Cache with TTL

Usage:
  node field-metadata-cache.js <command> [options]

Commands:
  test              Run performance tests
  benchmark         Run comprehensive benchmark

Examples:
  # Run performance tests
  node field-metadata-cache.js test

  # Run benchmark
  node field-metadata-cache.js benchmark
    `);
    process.exit(0);
  }

  const command = args[0];

  switch (command) {
    case 'test':
      await testCachePerformance();
      break;

    case 'benchmark':
      await testCachePerformance();
      break;

    default:
      console.error(`Unknown command: ${command}`);
      console.log('Run with --help for usage information');
      process.exit(1);
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });
}

module.exports = FieldMetadataCache;
