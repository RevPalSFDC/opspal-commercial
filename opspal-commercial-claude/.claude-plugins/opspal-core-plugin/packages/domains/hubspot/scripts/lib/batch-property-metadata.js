#!/usr/bin/env node
/**
 * HubSpot Batch Property Metadata
 *
 * Purpose: Batch property and object metadata fetching for HubSpot API to eliminate N+1 patterns
 * Adapted from: Salesforce BatchFieldMetadata (Week 2 optimization)
 *
 * BEFORE: Individual API calls per property/object (N+1 pattern)
 * AFTER: Batch fetching with LRU cache (70-90% improvement expected)
 *
 * HubSpot API Batch Capabilities:
 * - Batch Read: 100 objects per request (/crm/v3/objects/batch/read)
 * - Properties API: Get all properties at once (/crm/v3/properties/{objectType})
 * - Rate Limits: 100 requests/10 seconds (handled automatically)
 *
 * @version 1.0.0
 * @phase Performance Optimization (HubSpot Phase 1 Pilot)
 */

const { DataAccessError } = require('./data-access-error');

const HUBSPOT_API_BASE = 'https://api.hubapi.com';
const MAX_BATCH_SIZE = 100;  // HubSpot allows 100 objects per batch request
const DEFAULT_CACHE_SIZE = 1000;
const DEFAULT_CACHE_TTL = 3600000;  // 1 hour
const RATE_LIMIT_PER_10S = 100;

class LRUCache {
  constructor(maxSize = DEFAULT_CACHE_SIZE, ttl = DEFAULT_CACHE_TTL) {
    this.maxSize = maxSize;
    this.ttl = ttl;
    this.cache = new Map();
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0
    };
  }

  get(key) {
    if (!this.cache.has(key)) {
      this.stats.misses++;
      return null;
    }

    const item = this.cache.get(key);

    // Check expiration
    if (Date.now() - item.timestamp > this.ttl) {
      this.cache.delete(key);
      this.stats.misses++;
      return null;
    }

    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, item);
    this.stats.hits++;

    return item.value;
  }

  set(key, value) {
    // Remove old entry if exists
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }

    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
      this.stats.evictions++;
    }

    this.cache.set(key, {
      value,
      timestamp: Date.now()
    });
  }

  clear() {
    this.cache.clear();
  }

  getStats() {
    const total = this.stats.hits + this.stats.misses;
    return {
      ...this.stats,
      size: this.cache.size,
      hitRate: total > 0 ? (this.stats.hits / total) : 0
    };
  }
}

class BatchPropertyMetadata {
  constructor(options = {}) {
    this.accessToken = options.accessToken || process.env.HUBSPOT_ACCESS_TOKEN;
    this.portalId = options.portalId || process.env.HUBSPOT_PORTAL_ID;
    this.simulateMode = options.simulateMode || !this.accessToken;  // Auto-enable if no credentials
    this.cache = new LRUCache(
      options.cacheSize || DEFAULT_CACHE_SIZE,
      options.cacheTtl || DEFAULT_CACHE_TTL
    );

    this.stats = {
      totalRequests: 0,
      batchRequests: 0,
      individualRequests: 0,
      cacheHits: 0,
      cacheMisses: 0,
      totalDuration: 0,
      errors: 0
    };

    this.rateLimitQueue = [];
    this.rateLimitWindow = 10000; // 10 seconds
  }

  /**
   * Get properties for multiple objects (batch operation)
   * @param {Array} keys - Array of { objectType, id, properties[] } or { objectType } for all properties
   * @returns {Promise<Array>} Array of property metadata
   */
  async getProperties(keys) {
    const startTime = Date.now();
    this.stats.totalRequests++;

    try {
      // Check cache first
      const uncachedKeys = [];
      const cachedResults = [];

      for (const key of keys) {
        const cacheKey = this._getCacheKey(key);
        const cached = this.cache.get(cacheKey);

        if (cached) {
          cachedResults.push(cached);
          this.stats.cacheHits++;
        } else {
          uncachedKeys.push(key);
          this.stats.cacheMisses++;
        }
      }

      // If all cached, return immediately
      if (uncachedKeys.length === 0) {
        return cachedResults;
      }

      // Group by object type for efficient batching
      const groupedKeys = this._groupByObjectType(uncachedKeys);
      const fetchedResults = [];

      for (const [objectType, typeKeys] of Object.entries(groupedKeys)) {
        if (typeKeys[0].fetchAllProperties) {
          // Fetch all properties for this object type at once
          const properties = await this._fetchAllProperties(objectType);
          for (const key of typeKeys) {
            const cacheKey = this._getCacheKey(key);
            this.cache.set(cacheKey, properties);
            fetchedResults.push(properties);
          }
        } else {
          // Batch fetch specific objects
          const batches = this._chunk(typeKeys, MAX_BATCH_SIZE);
          for (const batch of batches) {
            const batchResults = await this._fetchBatch(objectType, batch);
            for (let i = 0; i < batch.length; i++) {
              const cacheKey = this._getCacheKey(batch[i]);
              this.cache.set(cacheKey, batchResults[i]);
              fetchedResults.push(batchResults[i]);
            }
          }
        }
      }

      const allResults = [...cachedResults, ...fetchedResults];
      this.stats.totalDuration += Date.now() - startTime;

      return allResults;

    } catch (error) {
      this.stats.errors++;
      throw error;
    }
  }

  /**
   * Fetch all properties for an object type (GET /crm/v3/properties/{objectType})
   */
  async _fetchAllProperties(objectType) {
    console.log(`📦 Fetching all properties for ${objectType}...`);

    // Simulation mode disabled - no mock data allowed
    if (this.simulateMode) {
      throw new DataAccessError(
        'HubSpot API',
        'Simulate mode enabled - no real data available',
        {
          objectType,
          operation: 'fetchAllProperties',
          reason: 'NO_MOCKS_POLICY_VIOLATION'
        }
      );
    }

    const url = `${HUBSPOT_API_BASE}/crm/v3/properties/${objectType}`;

    const response = await this._rateLimitedFetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch properties for ${objectType}: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log(`✅ Fetched ${data.results?.length || 0} properties for ${objectType}`);

    return data.results || [];
  }

  /**
   * Batch fetch specific objects with properties
   */
  async _fetchBatch(objectType, batch) {
    this.stats.batchRequests++;
    console.log(`📦 Batch fetching ${batch.length} ${objectType} objects (attempt 1/3)`);

    // Simulation mode disabled - no mock data allowed
    if (this.simulateMode) {
      throw new DataAccessError(
        'HubSpot API',
        'Simulate mode enabled - no real data available',
        {
          objectType,
          batchSize: batch.length,
          operation: 'fetchBatch',
          reason: 'NO_MOCKS_POLICY_VIOLATION'
        }
      );
    }

    const url = `${HUBSPOT_API_BASE}/crm/v3/objects/${objectType}/batch/read`;
    const requestBody = {
      inputs: batch.map(key => ({ id: key.id })),
      properties: batch[0].properties || []
    };

    const response = await this._rateLimitedFetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      throw new Error(`Batch fetch failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log(`✅ Batch fetched ${data.results?.length || 0} ${objectType} successfully`);

    return data.results || [];
  }

  /**
   * Rate-limited fetch (respects HubSpot's 100 req/10s limit)
   */
  async _rateLimitedFetch(url, options, retries = 3) {
    // Clean up old entries from rate limit queue
    const now = Date.now();
    this.rateLimitQueue = this.rateLimitQueue.filter(timestamp => now - timestamp < this.rateLimitWindow);

    // Wait if we're at the rate limit
    if (this.rateLimitQueue.length >= RATE_LIMIT_PER_10S) {
      const oldestRequest = this.rateLimitQueue[0];
      const waitTime = this.rateLimitWindow - (now - oldestRequest) + 100;  // Add 100ms buffer
      console.log(`⏸️  Rate limit reached, waiting ${waitTime}ms...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    // Add this request to the queue
    this.rateLimitQueue.push(Date.now());

    // Attempt fetch with retry logic
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const response = await fetch(url, options);

        // Success or non-retryable error
        if (response.ok || (response.status >= 400 && response.status < 500 && response.status !== 429)) {
          return response;
        }

        // Retry on 429 or 5xx
        if (response.status === 429 || response.status >= 500) {
          if (attempt < retries) {
            const delay = Math.pow(2, attempt) * 1000;  // Exponential backoff
            console.log(`⚠️  Request failed (${response.status}), retrying in ${delay}ms (attempt ${attempt}/${retries})...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
        }

        return response;

      } catch (error) {
        if (attempt < retries) {
          const delay = Math.pow(2, attempt) * 1000;
          console.log(`⚠️  Network error, retrying in ${delay}ms (attempt ${attempt}/${retries})...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          throw error;
        }
      }
    }

    throw new Error(`Failed after ${retries} attempts`);
  }

  /**
   * Group keys by object type for efficient batching
   */
  _groupByObjectType(keys) {
    const groups = {};

    for (const key of keys) {
      if (!groups[key.objectType]) {
        groups[key.objectType] = [];
      }
      groups[key.objectType].push(key);
    }

    return groups;
  }

  /**
   * Split array into chunks
   */
  _chunk(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Generate cache key from metadata key
   */
  _getCacheKey(key) {
    if (key.fetchAllProperties) {
      return `${key.objectType}:all-properties`;
    }
    return `${key.objectType}:${key.id}:${(key.properties || []).join(',')}`;
  }

  /**
   * Get cache and request statistics
   */
  getStats() {
    const cacheStats = this.cache.getStats();
    return {
      ...this.stats,
      cacheHitRate: cacheStats.hitRate,
      cacheSize: cacheStats.size,
      cacheEvictions: cacheStats.evictions,
      avgDurationPerRequest: this.stats.totalRequests > 0
        ? Math.round(this.stats.totalDuration / this.stats.totalRequests)
        : 0
    };
  }

  /**
   * Reset statistics (useful for benchmarking)
   */
  resetStats() {
    this.stats = {
      totalRequests: 0,
      batchRequests: 0,
      individualRequests: 0,
      cacheHits: 0,
      cacheMisses: 0,
      totalDuration: 0,
      errors: 0
    };
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * Factory method: Create with cache enabled
   */
  static withCache(options = {}) {
    return new BatchPropertyMetadata({
      ...options,
      cacheSize: options.maxSize || DEFAULT_CACHE_SIZE,
      cacheTtl: options.ttl || DEFAULT_CACHE_TTL
    });
  }
}

module.exports = BatchPropertyMetadata;
