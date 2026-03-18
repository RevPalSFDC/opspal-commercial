#!/usr/bin/env node

/**
 * Enrichment Cache
 *
 * High-performance caching layer for external API responses to:
 * - Reduce API call costs and rate limit consumption
 * - Improve response times for repeated lookups
 * - Maintain data freshness with configurable TTLs
 *
 * Features:
 * - Per-identifier-type TTL configuration
 * - Memory + file-based persistence
 * - Cache statistics and hit rate monitoring
 * - Automatic expiration and cleanup
 * - Rate limit tracking per API
 *
 * Usage:
 *   const { EnrichmentCache } = require('./enrichment-cache');
 *   const cache = new EnrichmentCache();
 *
 *   // Store a validation result
 *   cache.set('NPI', '1234567890', { valid: true, name: 'Dr. Smith' });
 *
 *   // Retrieve cached result
 *   const result = cache.get('NPI', '1234567890');
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Live-first configuration: query API first, use cache as fallback
const LIVE_FIRST = process.env.GLOBAL_LIVE_FIRST !== 'false' &&
                   process.env.ENRICHMENT_LIVE_FIRST !== 'false';

// Default TTL values in milliseconds
const DEFAULT_TTL_BY_TYPE = {
  NPI: 30 * 24 * 60 * 60 * 1000,       // 30 days - NPI rarely changes
  EIN: 30 * 24 * 60 * 60 * 1000,       // 30 days - EIN is permanent
  DUNS: 7 * 24 * 60 * 60 * 1000,       // 7 days - company info may change
  FCC_CALLSIGN: 7 * 24 * 60 * 60 * 1000, // 7 days - broadcast licenses stable
  DOMAIN_WHOIS: 1 * 24 * 60 * 60 * 1000, // 1 day - ownership may change
  DOMAIN_DNS: 1 * 60 * 60 * 1000,       // 1 hour - DNS can change frequently
  DOMAIN_REDIRECT: 6 * 60 * 60 * 1000,  // 6 hours - redirects rarely change
  DEFAULT: 24 * 60 * 60 * 1000          // 24 hours default
};

// API rate limits (requests per time window)
const DEFAULT_RATE_LIMITS = {
  NPPES: { requests: 100, windowMs: 60 * 1000 },       // 100/minute
  IRS: { requests: 50, windowMs: 60 * 1000 },          // 50/minute
  DNB: { requests: 10, windowMs: 60 * 1000 },          // 10/minute (expensive API)
  FCC: { requests: 30, windowMs: 60 * 1000 },          // 30/minute
  WHOIS: { requests: 20, windowMs: 60 * 1000 },        // 20/minute
  DEFAULT: { requests: 60, windowMs: 60 * 1000 }
};

class EnrichmentCache {
  constructor(options = {}) {
    // Cache configuration
    this.ttlByType = { ...DEFAULT_TTL_BY_TYPE, ...options.ttlOverrides };
    this.rateLimits = { ...DEFAULT_RATE_LIMITS, ...options.rateLimitOverrides };

    // Memory cache
    this.memoryCache = new Map();
    this.maxMemoryEntries = options.maxMemoryEntries || 10000;

    // File-based persistence
    this.persistenceEnabled = options.persistence !== false;
    this.cacheDir = options.cacheDir ||
      path.join(__dirname, '..', '..', '..', 'data', 'enrichment-cache');

    // Statistics
    this.stats = {
      hits: 0,
      misses: 0,
      expired: 0,
      stored: 0,
      evicted: 0,
      apiCalls: {},
      rateLimitBlocks: 0
    };

    // Rate limit tracking
    this.rateLimitWindows = {};

    // Initialize
    this._ensureCacheDir();
    this._loadPersistedCache();

    // Periodic cleanup
    this.cleanupInterval = setInterval(() => this._cleanupExpired(), 5 * 60 * 1000);
  }

  /**
   * Get a cached value
   * @param {string} type - Identifier type (NPI, EIN, DUNS, etc.)
   * @param {string} identifier - The identifier value
   * @param {Object} options - Options (useCacheFirst)
   * @returns {Object|null} Cached data or null if not found/expired
   */
  get(type, identifier, options = {}) {
    // In live-first mode, skip cache unless explicitly requested
    if (LIVE_FIRST && !options.useCacheFirst) {
      this.stats.misses++;
      return null;
    }

    const key = this._generateKey(type, identifier);

    // Check memory cache first
    const cached = this.memoryCache.get(key);

    if (cached) {
      if (this._isExpired(cached, type)) {
        this.memoryCache.delete(key);
        this.stats.expired++;
        return null;
      }

      this.stats.hits++;
      return cached.data;
    }

    // Check file cache if persistence enabled
    if (this.persistenceEnabled) {
      const fileCached = this._loadFromFile(key);
      if (fileCached) {
        if (this._isExpired(fileCached, type)) {
          this._deleteFile(key);
          this.stats.expired++;
          return null;
        }

        // Promote to memory cache
        this.memoryCache.set(key, fileCached);
        this.stats.hits++;
        return fileCached.data;
      }
    }

    this.stats.misses++;
    return null;
  }

  /**
   * Get cached value with cache-first behavior (for fallback scenarios)
   * @param {string} type - Identifier type
   * @param {string} identifier - The identifier value
   * @returns {Object|null} Cached data or null
   */
  getFallback(type, identifier) {
    return this.get(type, identifier, { useCacheFirst: true });
  }

  /**
   * Store a value in cache
   * @param {string} type - Identifier type
   * @param {string} identifier - The identifier value
   * @param {Object} data - Data to cache
   * @param {Object} options - { ttl, persist }
   */
  set(type, identifier, data, options = {}) {
    const key = this._generateKey(type, identifier);
    const ttl = options.ttl || this.ttlByType[type] || this.ttlByType.DEFAULT;

    const entry = {
      type,
      identifier,
      data,
      storedAt: Date.now(),
      ttl,
      expiresAt: Date.now() + ttl
    };

    // Evict if memory cache is full
    if (this.memoryCache.size >= this.maxMemoryEntries) {
      this._evictOldest();
    }

    // Store in memory
    this.memoryCache.set(key, entry);
    this.stats.stored++;

    // Persist to file if enabled
    if (this.persistenceEnabled && options.persist !== false) {
      this._saveToFile(key, entry);
    }
  }

  /**
   * Check if a value exists and is valid
   * @param {string} type - Identifier type
   * @param {string} identifier - The identifier value
   * @param {Object} options - Options (useCacheFirst)
   * @returns {boolean}
   */
  has(type, identifier, options = {}) {
    return this.get(type, identifier, options) !== null;
  }

  /**
   * Check if a value exists (cache-first for fallback scenarios)
   * @param {string} type - Identifier type
   * @param {string} identifier - The identifier value
   * @returns {boolean}
   */
  hasFallback(type, identifier) {
    return this.has(type, identifier, { useCacheFirst: true });
  }

  /**
   * Delete a cached value
   * @param {string} type - Identifier type
   * @param {string} identifier - The identifier value
   */
  delete(type, identifier) {
    const key = this._generateKey(type, identifier);
    this.memoryCache.delete(key);

    if (this.persistenceEnabled) {
      this._deleteFile(key);
    }
  }

  /**
   * Clear all cached values for a type
   * @param {string} type - Identifier type
   */
  clearType(type) {
    const prefix = `${type}_`;

    for (const key of this.memoryCache.keys()) {
      if (key.startsWith(prefix)) {
        this.memoryCache.delete(key);
      }
    }

    // Clear persisted files for this type
    if (this.persistenceEnabled) {
      this._clearTypeFiles(type);
    }
  }

  /**
   * Clear entire cache
   */
  clear() {
    this.memoryCache.clear();

    if (this.persistenceEnabled) {
      this._clearAllFiles();
    }

    // Reset stats
    this.stats = {
      hits: 0,
      misses: 0,
      expired: 0,
      stored: 0,
      evicted: 0,
      apiCalls: {},
      rateLimitBlocks: 0
    };
  }

  /**
   * Check if API call is rate limited
   * @param {string} api - API name (NPPES, IRS, DNB, FCC, WHOIS)
   * @returns {Object} { allowed: boolean, retryAfter: ms }
   */
  checkRateLimit(api) {
    const limits = this.rateLimits[api] || this.rateLimits.DEFAULT;
    const now = Date.now();
    const windowKey = `${api}_window`;

    if (!this.rateLimitWindows[windowKey]) {
      this.rateLimitWindows[windowKey] = {
        start: now,
        count: 0
      };
    }

    const window = this.rateLimitWindows[windowKey];

    // Reset window if expired
    if (now - window.start > limits.windowMs) {
      window.start = now;
      window.count = 0;
    }

    // Check if under limit
    if (window.count < limits.requests) {
      return { allowed: true, retryAfter: 0 };
    }

    // Calculate retry time
    const retryAfter = limits.windowMs - (now - window.start);
    this.stats.rateLimitBlocks++;

    return { allowed: false, retryAfter };
  }

  /**
   * Record an API call for rate limiting
   * @param {string} api - API name
   */
  recordApiCall(api) {
    const windowKey = `${api}_window`;

    if (!this.rateLimitWindows[windowKey]) {
      this.rateLimitWindows[windowKey] = {
        start: Date.now(),
        count: 0
      };
    }

    this.rateLimitWindows[windowKey].count++;

    // Track stats
    if (!this.stats.apiCalls[api]) {
      this.stats.apiCalls[api] = 0;
    }
    this.stats.apiCalls[api]++;
  }

  /**
   * Get cache statistics
   * @returns {Object} Statistics
   */
  getStats() {
    const totalRequests = this.stats.hits + this.stats.misses;
    const hitRate = totalRequests > 0
      ? (this.stats.hits / totalRequests * 100).toFixed(2)
      : 0;

    return {
      ...this.stats,
      hitRate: `${hitRate}%`,
      memoryEntries: this.memoryCache.size,
      maxMemoryEntries: this.maxMemoryEntries,
      ttlConfig: this.ttlByType
    };
  }

  /**
   * Cleanup and close
   */
  close() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }

  // ========== Private Methods ==========

  _generateKey(type, identifier) {
    const normalized = String(identifier).toLowerCase().replace(/[^a-z0-9]/g, '');
    return `${type}_${normalized}`;
  }

  _isExpired(entry, type) {
    const ttl = entry.ttl || this.ttlByType[type] || this.ttlByType.DEFAULT;
    return Date.now() > entry.storedAt + ttl;
  }

  _evictOldest() {
    // Find oldest entry
    let oldestKey = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.memoryCache.entries()) {
      if (entry.storedAt < oldestTime) {
        oldestTime = entry.storedAt;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.memoryCache.delete(oldestKey);
      this.stats.evicted++;
    }
  }

  _cleanupExpired() {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.memoryCache.entries()) {
      if (now > entry.expiresAt) {
        this.memoryCache.delete(key);
        cleaned++;
      }
    }

    this.stats.expired += cleaned;
  }

  _ensureCacheDir() {
    if (this.persistenceEnabled && !fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  _getCacheFilePath(key) {
    const hash = crypto.createHash('md5').update(key).digest('hex');
    const subDir = hash.substring(0, 2);  // Use first 2 chars for sharding
    return path.join(this.cacheDir, subDir, `${hash}.json`);
  }

  _loadFromFile(key) {
    const filePath = this._getCacheFilePath(key);

    try {
      if (fs.existsSync(filePath)) {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        return data;
      }
    } catch (e) {
      // Ignore file read errors
    }

    return null;
  }

  _saveToFile(key, entry) {
    const filePath = this._getCacheFilePath(key);
    const dir = path.dirname(filePath);

    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(filePath, JSON.stringify(entry));
    } catch (e) {
      // Ignore file write errors
    }
  }

  _deleteFile(key) {
    const filePath = this._getCacheFilePath(key);

    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (e) {
      // Ignore file delete errors
    }
  }

  _clearTypeFiles(type) {
    // Would need to scan all files - expensive operation
    // For now, just clear memory cache for the type
    // Full file cleanup happens on next expiration check
  }

  _clearAllFiles() {
    try {
      if (fs.existsSync(this.cacheDir)) {
        fs.rmSync(this.cacheDir, { recursive: true, force: true });
        fs.mkdirSync(this.cacheDir, { recursive: true });
      }
    } catch (e) {
      // Ignore cleanup errors
    }
  }

  _loadPersistedCache() {
    // Load recent cache entries on startup
    // This is optional - we primarily rely on file lookups
    // Could implement LRU loading here if needed
  }
}

// Export
module.exports = {
  EnrichmentCache,
  DEFAULT_TTL_BY_TYPE,
  DEFAULT_RATE_LIMITS
};

// CLI Usage
if (require.main === module) {
  const args = process.argv.slice(2);
  const cache = new EnrichmentCache();

  if (args.length === 0) {
    console.log(`
Enrichment Cache CLI

Usage:
  node enrichment-cache.js stats           Show cache statistics
  node enrichment-cache.js get <type> <id> Get cached value
  node enrichment-cache.js clear           Clear all cache
  node enrichment-cache.js clear <type>    Clear cache for type

Examples:
  node enrichment-cache.js stats
  node enrichment-cache.js get NPI 1234567890
  node enrichment-cache.js clear NPI

Types: NPI, EIN, DUNS, FCC_CALLSIGN, DOMAIN_WHOIS, DOMAIN_DNS, DOMAIN_REDIRECT
`);
    process.exit(0);
  }

  const command = args[0];

  if (command === 'stats') {
    const stats = cache.getStats();
    console.log('\n=== Enrichment Cache Statistics ===\n');
    console.log(JSON.stringify(stats, null, 2));
    console.log('');

  } else if (command === 'get') {
    const type = args[1];
    const identifier = args[2];

    if (!type || !identifier) {
      console.error('Error: Type and identifier required');
      process.exit(1);
    }

    const result = cache.get(type, identifier);
    if (result) {
      console.log('\n=== Cached Value ===\n');
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log('\nNo cached value found.\n');
    }

  } else if (command === 'clear') {
    const type = args[1];

    if (type) {
      cache.clearType(type);
      console.log(`\nCleared cache for type: ${type}\n`);
    } else {
      cache.clear();
      console.log('\nCleared all cache.\n');
    }

  } else {
    console.error(`Unknown command: ${command}`);
    process.exit(1);
  }

  cache.close();
}
