#!/usr/bin/env node

/**
 * API Cache Manager
 *
 * Intelligent caching for external API responses:
 * - Per-endpoint TTL configuration
 * - Cache invalidation hints
 * - Retry with cache-bust option
 * - Memory + file-based caching
 *
 * @version 1.0.0
 * @date 2025-12-19
 *
 * Addresses: external-api cohort (cache delays, stale data)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Live-first configuration: query API first, use cache as fallback
const LIVE_FIRST = process.env.GLOBAL_LIVE_FIRST !== 'false' &&
                   process.env.API_CACHE_LIVE_FIRST !== 'false';

class APICacheManager {
    constructor(options = {}) {
        this.verbose = options.verbose || false;

        // Cache directories
        this.cacheDir = options.cacheDir || path.join(process.env.HOME || '/tmp', '.claude', 'cache', 'api');

        // Default TTLs (in milliseconds)
        this.defaultTTL = options.defaultTTL || 5 * 60 * 1000; // 5 minutes

        // Per-endpoint TTL configuration
        this.endpointTTLs = {
            // Salesforce - metadata caches for 2-5 minutes
            'salesforce:metadata': 2 * 60 * 1000,
            'salesforce:describe': 5 * 60 * 1000,
            'salesforce:limits': 30 * 1000, // 30 seconds (changes frequently)
            'salesforce:query': 60 * 1000, // 1 minute

            // HubSpot - properties change less frequently
            'hubspot:properties': 10 * 60 * 1000,
            'hubspot:schemas': 15 * 60 * 1000,
            'hubspot:contacts': 2 * 60 * 1000,

            // Marketo
            'marketo:leads': 2 * 60 * 1000,
            'marketo:programs': 10 * 60 * 1000,

            // Generic
            'default': 5 * 60 * 1000,
            ...options.endpointTTLs
        };

        // In-memory cache for fast access
        this.memoryCache = new Map();
        this.memoryCacheTTL = options.memoryCacheTTL || 60 * 1000; // 1 minute

        // Invalidation tracking
        this.invalidationHints = new Map();

        // Ensure cache directory exists
        if (!fs.existsSync(this.cacheDir)) {
            fs.mkdirSync(this.cacheDir, { recursive: true });
        }
    }

    /**
     * Get cached value for key
     * @param {string} key - Cache key
     * @param {Object} options - Options (skipMemory, skipFile, useCacheFirst)
     * @returns {Object|null} Cached value or null
     */
    get(key, options = {}) {
        // In live-first mode, skip cache unless explicitly requested
        if (LIVE_FIRST && !options.useCacheFirst) {
            if (this.verbose) {
                console.log(`[cache] Live-first mode: skipping cache for ${key}`);
            }
            return null;
        }

        const cacheKey = this._normalizeKey(key);

        // Check memory cache first (fastest)
        if (!options.skipMemory) {
            const memoryEntry = this.memoryCache.get(cacheKey);
            if (memoryEntry && !this._isExpired(memoryEntry)) {
                if (this.verbose) {
                    console.log(`[cache] Memory hit: ${key}`);
                }
                return {
                    value: memoryEntry.value,
                    source: 'memory',
                    age: Date.now() - memoryEntry.timestamp,
                    ttl: memoryEntry.ttl - (Date.now() - memoryEntry.timestamp)
                };
            }
        }

        // Check file cache
        if (!options.skipFile) {
            const fileEntry = this._getFromFile(cacheKey);
            if (fileEntry && !this._isExpired(fileEntry)) {
                // Populate memory cache
                this.memoryCache.set(cacheKey, fileEntry);

                if (this.verbose) {
                    console.log(`[cache] File hit: ${key}`);
                }

                return {
                    value: fileEntry.value,
                    source: 'file',
                    age: Date.now() - fileEntry.timestamp,
                    ttl: fileEntry.ttl - (Date.now() - fileEntry.timestamp)
                };
            }
        }

        if (this.verbose) {
            console.log(`[cache] Miss: ${key}`);
        }

        return null;
    }

    /**
     * Get cached value with cache-first behavior (for fallback scenarios)
     * @param {string} key - Cache key
     * @param {Object} options - Options (skipMemory, skipFile)
     * @returns {Object|null} Cached value or null
     */
    getFallback(key, options = {}) {
        return this.get(key, { ...options, useCacheFirst: true });
    }

    /**
     * Set cache value
     * @param {string} key - Cache key
     * @param {*} value - Value to cache
     * @param {Object} options - Options (ttl, endpoint, skipFile)
     */
    set(key, value, options = {}) {
        const cacheKey = this._normalizeKey(key);

        // Determine TTL
        const ttl = options.ttl || this._getTTLForEndpoint(options.endpoint) || this.defaultTTL;

        const entry = {
            key: cacheKey,
            value,
            timestamp: Date.now(),
            ttl,
            endpoint: options.endpoint,
            metadata: options.metadata || {}
        };

        // Store in memory cache
        this.memoryCache.set(cacheKey, entry);

        // Store in file cache (unless skipFile)
        if (!options.skipFile) {
            this._setToFile(cacheKey, entry);
        }

        if (this.verbose) {
            console.log(`[cache] Set: ${key} (TTL: ${ttl}ms)`);
        }

        return entry;
    }

    /**
     * Invalidate cache entry
     * @param {string} key - Cache key or pattern
     * @param {Object} options - Options (pattern for glob matching)
     * @returns {number} Number of entries invalidated
     */
    invalidate(key, options = {}) {
        let count = 0;

        if (options.pattern) {
            // Pattern-based invalidation
            const regex = new RegExp(key);

            // Memory cache
            for (const cacheKey of this.memoryCache.keys()) {
                if (regex.test(cacheKey)) {
                    this.memoryCache.delete(cacheKey);
                    this._deleteFromFile(cacheKey);
                    count++;
                }
            }

            // File cache (scan directory)
            const files = fs.readdirSync(this.cacheDir);
            for (const file of files) {
                if (file.endsWith('.json') && regex.test(file.replace('.json', ''))) {
                    fs.unlinkSync(path.join(this.cacheDir, file));
                    count++;
                }
            }
        } else {
            // Single key invalidation
            const cacheKey = this._normalizeKey(key);
            if (this.memoryCache.has(cacheKey)) {
                this.memoryCache.delete(cacheKey);
                count++;
            }
            if (this._deleteFromFile(cacheKey)) {
                count++;
            }
        }

        if (this.verbose) {
            console.log(`[cache] Invalidated ${count} entries for: ${key}`);
        }

        return count;
    }

    /**
     * Register an invalidation hint
     * @param {string} triggerKey - Key that triggers invalidation
     * @param {string[]} invalidateKeys - Keys to invalidate when triggered
     */
    registerInvalidationHint(triggerKey, invalidateKeys) {
        this.invalidationHints.set(triggerKey, invalidateKeys);
    }

    /**
     * Process invalidation hints for a key
     * @param {string} key - Trigger key
     */
    processInvalidationHints(key) {
        const hints = this.invalidationHints.get(key);
        if (hints) {
            for (const invalidateKey of hints) {
                this.invalidate(invalidateKey);
            }
        }
    }

    /**
     * Get with fetch fallback
     * @param {string} key - Cache key
     * @param {Function} fetchFn - Async function to fetch data if cache miss
     * @param {Object} options - Cache options
     * @returns {*} Cached or fetched value
     */
    async getOrFetch(key, fetchFn, options = {}) {
        // In live-first mode, always try fetch first (unless forceCacheFirst)
        if (LIVE_FIRST && !options.forceCacheFirst) {
            try {
                const value = await fetchFn();
                this.set(key, value, options);
                return {
                    value,
                    cached: false,
                    source: 'fetch'
                };
            } catch (error) {
                // On error in live-first mode, try cache as fallback
                const fallback = this.getFallback(key, options);
                if (fallback) {
                    console.warn(`[cache] API failed, using cache fallback for ${key}: ${error.message}`);
                    return {
                        value: fallback.value,
                        cached: true,
                        source: 'fallback',
                        error: error.message,
                        age: fallback.age
                    };
                }
                throw error;
            }
        }

        // Original cache-first behavior (when LIVE_FIRST=false or forceCacheFirst=true)
        // Check cache first (unless forceFetch)
        if (!options.forceFetch) {
            const cached = this.get(key, { ...options, useCacheFirst: true });
            if (cached) {
                return {
                    value: cached.value,
                    cached: true,
                    source: cached.source,
                    age: cached.age
                };
            }
        }

        // Fetch fresh data
        try {
            const value = await fetchFn();

            // Cache the result
            this.set(key, value, options);

            return {
                value,
                cached: false,
                source: 'fetch'
            };
        } catch (error) {
            // On error, return stale cache if available
            if (options.useStaleOnError) {
                const stale = this.get(key, { ...options, useCacheFirst: true, ignoreExpiry: true });
                if (stale) {
                    return {
                        value: stale.value,
                        cached: true,
                        source: 'stale',
                        error: error.message
                    };
                }
            }
            throw error;
        }
    }

    /**
     * Get cache statistics
     * @returns {Object} Cache statistics
     */
    getStats() {
        const memoryEntries = this.memoryCache.size;
        let fileEntries = 0;
        let totalFileSize = 0;
        let expiredCount = 0;

        try {
            const files = fs.readdirSync(this.cacheDir);
            fileEntries = files.filter(f => f.endsWith('.json')).length;

            for (const file of files) {
                if (file.endsWith('.json')) {
                    const filePath = path.join(this.cacheDir, file);
                    const stats = fs.statSync(filePath);
                    totalFileSize += stats.size;

                    // Check if expired
                    try {
                        const entry = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
                        if (this._isExpired(entry)) {
                            expiredCount++;
                        }
                    } catch (e) {
                        // Invalid file
                    }
                }
            }
        } catch (e) {
            // Directory doesn't exist
        }

        return {
            memoryEntries,
            fileEntries,
            totalFileSize,
            expiredCount,
            cacheDir: this.cacheDir,
            defaultTTL: this.defaultTTL
        };
    }

    /**
     * Clear all cache entries
     * @param {Object} options - Options (onlyExpired)
     * @returns {number} Number of entries cleared
     */
    clear(options = {}) {
        let count = 0;

        if (options.onlyExpired) {
            // Clear only expired entries
            for (const [key, entry] of this.memoryCache.entries()) {
                if (this._isExpired(entry)) {
                    this.memoryCache.delete(key);
                    count++;
                }
            }

            // File cache
            try {
                const files = fs.readdirSync(this.cacheDir);
                for (const file of files) {
                    if (file.endsWith('.json')) {
                        const filePath = path.join(this.cacheDir, file);
                        try {
                            const entry = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
                            if (this._isExpired(entry)) {
                                fs.unlinkSync(filePath);
                                count++;
                            }
                        } catch (e) {
                            // Invalid file, delete it
                            fs.unlinkSync(filePath);
                            count++;
                        }
                    }
                }
            } catch (e) {
                // Directory doesn't exist
            }
        } else {
            // Clear all
            count = this.memoryCache.size;
            this.memoryCache.clear();

            try {
                const files = fs.readdirSync(this.cacheDir);
                for (const file of files) {
                    if (file.endsWith('.json')) {
                        fs.unlinkSync(path.join(this.cacheDir, file));
                        count++;
                    }
                }
            } catch (e) {
                // Directory doesn't exist
            }
        }

        return count;
    }

    // === Private Methods ===

    _normalizeKey(key) {
        // Create a safe filename from the key
        return crypto.createHash('md5').update(key).digest('hex');
    }

    _getTTLForEndpoint(endpoint) {
        if (!endpoint) return null;

        // Try exact match
        if (this.endpointTTLs[endpoint]) {
            return this.endpointTTLs[endpoint];
        }

        // Try prefix match
        for (const [pattern, ttl] of Object.entries(this.endpointTTLs)) {
            if (endpoint.startsWith(pattern)) {
                return ttl;
            }
        }

        return null;
    }

    _isExpired(entry, ignoreExpiry = false) {
        if (ignoreExpiry) return false;
        return Date.now() > entry.timestamp + entry.ttl;
    }

    _getFromFile(cacheKey) {
        const filePath = path.join(this.cacheDir, `${cacheKey}.json`);

        try {
            if (fs.existsSync(filePath)) {
                return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            }
        } catch (e) {
            // Invalid cache file
        }

        return null;
    }

    _setToFile(cacheKey, entry) {
        const filePath = path.join(this.cacheDir, `${cacheKey}.json`);

        try {
            fs.writeFileSync(filePath, JSON.stringify(entry));
        } catch (e) {
            if (this.verbose) {
                console.error(`[cache] Failed to write file cache: ${e.message}`);
            }
        }
    }

    _deleteFromFile(cacheKey) {
        const filePath = path.join(this.cacheDir, `${cacheKey}.json`);

        try {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                return true;
            }
        } catch (e) {
            // Failed to delete
        }

        return false;
    }
}

// CLI interface
if (require.main === module) {
    const args = process.argv.slice(2);
    const command = args[0];

    const cache = new APICacheManager({ verbose: true });

    switch (command) {
        case 'get':
            const getKey = args[1];
            if (!getKey) {
                console.error('Usage: api-cache-manager get <key>');
                process.exit(1);
            }
            const result = cache.get(getKey);
            if (result) {
                console.log(JSON.stringify(result, null, 2));
            } else {
                console.log('Cache miss');
                process.exit(1);
            }
            break;

        case 'set':
            const setKey = args[1];
            const setValue = args[2];
            const ttl = args[3] ? parseInt(args[3]) : undefined;
            if (!setKey || !setValue) {
                console.error('Usage: api-cache-manager set <key> <value> [ttl_ms]');
                process.exit(1);
            }
            cache.set(setKey, setValue, { ttl });
            console.log('Cached successfully');
            break;

        case 'invalidate':
            const invalidateKey = args[1];
            const pattern = args.includes('--pattern');
            if (!invalidateKey) {
                console.error('Usage: api-cache-manager invalidate <key> [--pattern]');
                process.exit(1);
            }
            const invalidated = cache.invalidate(invalidateKey, { pattern });
            console.log(`Invalidated ${invalidated} entries`);
            break;

        case 'stats':
            const stats = cache.getStats();
            console.log(JSON.stringify(stats, null, 2));
            break;

        case 'clear':
            const onlyExpired = args.includes('--expired');
            const cleared = cache.clear({ onlyExpired });
            console.log(`Cleared ${cleared} entries`);
            break;

        default:
            console.log(`
API Cache Manager - Intelligent caching for external APIs

Usage:
  api-cache-manager get <key>                    Get cached value
  api-cache-manager set <key> <value> [ttl_ms]   Set cache value
  api-cache-manager invalidate <key> [--pattern] Invalidate cache
  api-cache-manager stats                        Show cache statistics
  api-cache-manager clear [--expired]            Clear cache entries

Endpoint TTLs (pre-configured):
  salesforce:metadata  - 2 minutes
  salesforce:describe  - 5 minutes
  salesforce:limits    - 30 seconds
  hubspot:properties   - 10 minutes
  hubspot:schemas      - 15 minutes
  default              - 5 minutes

Examples:
  api-cache-manager set "salesforce:Account:describe" '{"fields":...}' 300000
  api-cache-manager get "salesforce:Account:describe"
  api-cache-manager invalidate "salesforce:*" --pattern
  api-cache-manager clear --expired
            `);
    }
}

module.exports = { APICacheManager };
