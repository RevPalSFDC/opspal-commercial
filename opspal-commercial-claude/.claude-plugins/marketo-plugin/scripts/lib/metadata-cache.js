/**
 * Metadata Cache for Marketo API
 *
 * Provides caching for lead schema, program channels, and other metadata
 * with configurable TTL to avoid redundant API calls.
 * Pattern based on HubSpot batch-property-metadata.js.
 *
 * Features:
 * - In-memory caching with TTL
 * - Automatic cache invalidation
 * - Schema caching for leads, programs, custom objects
 * - Instance-aware caching
 *
 * @module metadata-cache
 * @version 1.0.0
 */

/**
 * Default cache configuration
 */
const DEFAULT_CONFIG = {
  ttlMs: 3600000,        // 1 hour default TTL
  maxEntries: 1000,      // Maximum cache entries
  cleanupInterval: 300000, // Cleanup every 5 minutes
};

/**
 * Cache storage
 */
const cache = new Map();

/**
 * Cache metadata (timestamps, hits)
 */
const metadata = new Map();

/**
 * Current configuration
 */
let config = { ...DEFAULT_CONFIG };

/**
 * Cleanup interval reference
 */
let cleanupTimer = null;

/**
 * Initialize the cache
 *
 * @param {Object} options - Cache options
 */
function initialize(options = {}) {
  config = { ...DEFAULT_CONFIG, ...options };

  // Start cleanup interval
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
  }
  cleanupTimer = setInterval(cleanup, config.cleanupInterval);
}

/**
 * Generate cache key
 *
 * @param {string} type - Cache type (e.g., 'leadSchema', 'programChannels')
 * @param {string} instance - Instance identifier
 * @param {string} subKey - Optional sub-key
 * @returns {string} Cache key
 */
function generateKey(type, instance = 'default', subKey = '') {
  return `${instance}:${type}:${subKey}`.replace(/:+$/, '');
}

/**
 * Get item from cache
 *
 * @param {string} key - Cache key
 * @returns {any} Cached value or undefined
 */
function get(key) {
  const entry = cache.get(key);
  if (!entry) return undefined;

  // Check TTL
  const meta = metadata.get(key);
  if (meta && Date.now() > meta.expiresAt) {
    cache.delete(key);
    metadata.delete(key);
    return undefined;
  }

  // Update hit count
  if (meta) {
    meta.hits++;
    meta.lastAccess = Date.now();
  }

  return entry;
}

/**
 * Set item in cache
 *
 * @param {string} key - Cache key
 * @param {any} value - Value to cache
 * @param {number} ttlMs - Optional custom TTL
 */
function set(key, value, ttlMs = config.ttlMs) {
  // Enforce max entries
  if (cache.size >= config.maxEntries) {
    evictOldest();
  }

  cache.set(key, value);
  metadata.set(key, {
    createdAt: Date.now(),
    expiresAt: Date.now() + ttlMs,
    lastAccess: Date.now(),
    hits: 0,
  });
}

/**
 * Check if key exists and is valid
 *
 * @param {string} key - Cache key
 * @returns {boolean} True if exists and not expired
 */
function has(key) {
  const meta = metadata.get(key);
  if (!meta) return false;
  if (Date.now() > meta.expiresAt) {
    cache.delete(key);
    metadata.delete(key);
    return false;
  }
  return true;
}

/**
 * Delete item from cache
 *
 * @param {string} key - Cache key
 */
function del(key) {
  cache.delete(key);
  metadata.delete(key);
}

/**
 * Clear all cache entries
 */
function clear() {
  cache.clear();
  metadata.clear();
}

/**
 * Clear cache entries for specific instance
 *
 * @param {string} instance - Instance identifier
 */
function clearInstance(instance) {
  const prefix = `${instance}:`;
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) {
      cache.delete(key);
      metadata.delete(key);
    }
  }
}

/**
 * Clear cache entries of specific type
 *
 * @param {string} type - Cache type
 * @param {string} instance - Optional instance
 */
function clearType(type, instance = null) {
  const pattern = instance ? `${instance}:${type}:` : `:${type}:`;
  for (const key of cache.keys()) {
    if (key.includes(pattern)) {
      cache.delete(key);
      metadata.delete(key);
    }
  }
}

/**
 * Evict oldest entries
 */
function evictOldest() {
  const entries = Array.from(metadata.entries())
    .sort((a, b) => a[1].lastAccess - b[1].lastAccess)
    .slice(0, Math.floor(config.maxEntries * 0.1)); // Evict 10%

  for (const [key] of entries) {
    cache.delete(key);
    metadata.delete(key);
  }
}

/**
 * Cleanup expired entries
 */
function cleanup() {
  const now = Date.now();
  for (const [key, meta] of metadata.entries()) {
    if (now > meta.expiresAt) {
      cache.delete(key);
      metadata.delete(key);
    }
  }
}

/**
 * Get cache statistics
 *
 * @returns {Object} Cache stats
 */
function getStats() {
  let totalHits = 0;
  let expiredCount = 0;
  const now = Date.now();

  for (const [key, meta] of metadata.entries()) {
    totalHits += meta.hits;
    if (now > meta.expiresAt) expiredCount++;
  }

  return {
    size: cache.size,
    maxEntries: config.maxEntries,
    utilization: Math.round((cache.size / config.maxEntries) * 100),
    totalHits,
    expiredPending: expiredCount,
    ttlMs: config.ttlMs,
  };
}

// =============================================================================
// Specialized Cache Methods for Marketo
// =============================================================================

/**
 * Cache lead schema
 *
 * @param {string} instance - Instance identifier
 * @param {Object} schema - Lead schema data
 * @param {number} ttlMs - Optional TTL
 */
function cacheLeadSchema(instance, schema, ttlMs = config.ttlMs) {
  const key = generateKey('leadSchema', instance);
  set(key, schema, ttlMs);
}

/**
 * Get cached lead schema
 *
 * @param {string} instance - Instance identifier
 * @returns {Object|undefined} Cached schema
 */
function getLeadSchema(instance) {
  const key = generateKey('leadSchema', instance);
  return get(key);
}

/**
 * Cache or get lead schema with auto-fetch
 *
 * @param {string} instance - Instance identifier
 * @param {Function} fetchFn - Function to fetch schema if not cached
 * @returns {Promise<Object>} Lead schema
 */
async function getOrFetchLeadSchema(instance, fetchFn) {
  const cached = getLeadSchema(instance);
  if (cached) return cached;

  const schema = await fetchFn();
  cacheLeadSchema(instance, schema);
  return schema;
}

/**
 * Cache program channels
 *
 * @param {string} instance - Instance identifier
 * @param {Array} channels - Channel data
 */
function cacheProgramChannels(instance, channels) {
  const key = generateKey('programChannels', instance);
  set(key, channels);
}

/**
 * Get cached program channels
 *
 * @param {string} instance - Instance identifier
 * @returns {Array|undefined} Cached channels
 */
function getProgramChannels(instance) {
  const key = generateKey('programChannels', instance);
  return get(key);
}

/**
 * Cache activity types
 *
 * @param {string} instance - Instance identifier
 * @param {Array} types - Activity types
 */
function cacheActivityTypes(instance, types) {
  const key = generateKey('activityTypes', instance);
  set(key, types);
}

/**
 * Get cached activity types
 *
 * @param {string} instance - Instance identifier
 * @returns {Array|undefined} Cached types
 */
function getActivityTypes(instance) {
  const key = generateKey('activityTypes', instance);
  return get(key);
}

/**
 * Cache custom object schema
 *
 * @param {string} instance - Instance identifier
 * @param {string} objectName - Custom object name
 * @param {Object} schema - Object schema
 */
function cacheCustomObjectSchema(instance, objectName, schema) {
  const key = generateKey('customObject', instance, objectName);
  set(key, schema);
}

/**
 * Get cached custom object schema
 *
 * @param {string} instance - Instance identifier
 * @param {string} objectName - Custom object name
 * @returns {Object|undefined} Cached schema
 */
function getCustomObjectSchema(instance, objectName) {
  const key = generateKey('customObject', instance, objectName);
  return get(key);
}

/**
 * Cache folders
 *
 * @param {string} instance - Instance identifier
 * @param {string} parentId - Parent folder ID
 * @param {Array} folders - Folder list
 */
function cacheFolders(instance, parentId, folders) {
  const key = generateKey('folders', instance, parentId);
  set(key, folders);
}

/**
 * Get cached folders
 *
 * @param {string} instance - Instance identifier
 * @param {string} parentId - Parent folder ID
 * @returns {Array|undefined} Cached folders
 */
function getFolders(instance, parentId) {
  const key = generateKey('folders', instance, parentId);
  return get(key);
}

/**
 * Cache field mapping (for sync)
 *
 * @param {string} instance - Instance identifier
 * @param {string} sourceSystem - Source system (e.g., 'salesforce')
 * @param {Object} mapping - Field mapping
 */
function cacheFieldMapping(instance, sourceSystem, mapping) {
  const key = generateKey('fieldMapping', instance, sourceSystem);
  set(key, mapping);
}

/**
 * Get cached field mapping
 *
 * @param {string} instance - Instance identifier
 * @param {string} sourceSystem - Source system
 * @returns {Object|undefined} Cached mapping
 */
function getFieldMapping(instance, sourceSystem) {
  const key = generateKey('fieldMapping', instance, sourceSystem);
  return get(key);
}

/**
 * Memoize function results
 *
 * @param {Function} fn - Function to memoize
 * @param {Function} keyFn - Function to generate cache key from args
 * @param {number} ttlMs - Cache TTL
 * @returns {Function} Memoized function
 */
function memoize(fn, keyFn, ttlMs = config.ttlMs) {
  return async function memoized(...args) {
    const key = keyFn(...args);
    const cached = get(key);
    if (cached !== undefined) return cached;

    const result = await fn(...args);
    set(key, result, ttlMs);
    return result;
  };
}

// Initialize on load
initialize();

module.exports = {
  initialize,
  generateKey,
  get,
  set,
  has,
  del,
  clear,
  clearInstance,
  clearType,
  cleanup,
  getStats,
  // Specialized methods
  cacheLeadSchema,
  getLeadSchema,
  getOrFetchLeadSchema,
  cacheProgramChannels,
  getProgramChannels,
  cacheActivityTypes,
  getActivityTypes,
  cacheCustomObjectSchema,
  getCustomObjectSchema,
  cacheFolders,
  getFolders,
  cacheFieldMapping,
  getFieldMapping,
  memoize,
  // Config
  DEFAULT_CONFIG,
};
