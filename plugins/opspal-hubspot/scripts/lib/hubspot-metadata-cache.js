#!/usr/bin/env node

/**
 * HubSpot Metadata Cache
 *
 * Caches portal metadata for instant lookups to dramatically speed up
 * property and workflow discovery operations. Per HubSpot docs: "Settings
 * should be cached when possible" for properties, owners, forms, pipelines.
 *
 * Features:
 * - TTL-based expiration (default: 1 hour for properties, 24h for pipelines)
 * - File-based persistence for cross-session caching
 * - In-memory LRU cache for hot data
 * - Rate-limit-aware API calls via HubSpotRequestThrottle
 * - Automatic cache warming on init
 *
 * Usage:
 *   node scripts/lib/hubspot-metadata-cache.js init <portal-name> --token <access-token>
 *   node scripts/lib/hubspot-metadata-cache.js info <portal-name>
 *   node scripts/lib/hubspot-metadata-cache.js query <portal-name> <object-type>
 *   node scripts/lib/hubspot-metadata-cache.js find-property <portal-name> <object-type> <pattern>
 *   node scripts/lib/hubspot-metadata-cache.js refresh <portal-name> --token <access-token>
 *
 * @version 2.0.0
 * @phase Rate Limit Integration (Gap Analysis Fix)
 */

const fs = require('fs');
const path = require('path');
const { getThrottle } = require('./hubspot-request-throttle');

const HUBSPOT_API_BASE = 'https://api.hubapi.com';

// TTL defaults (in milliseconds)
const TTL = {
  properties: 60 * 60 * 1000,      // 1 hour
  pipelines: 24 * 60 * 60 * 1000,  // 24 hours
  owners: 60 * 60 * 1000,          // 1 hour
  workflows: 6 * 60 * 60 * 1000,   // 6 hours
  lists: 60 * 60 * 1000,           // 1 hour
  forms: 60 * 60 * 1000            // 1 hour
};

// Supported object types for properties
const OBJECT_TYPES = ['contacts', 'companies', 'deals', 'tickets', 'products', 'line_items', 'quotes'];

class HubSpotMetadataCache {
  constructor(portalName, options = {}) {
    this.portalName = portalName;
    this.accessToken = options.accessToken || process.env.HUBSPOT_ACCESS_TOKEN;
    this.verbose = options.verbose || false;
    this.cacheDir = path.join(__dirname, '../../.cache/metadata');
    this.cachePath = path.join(this.cacheDir, `${portalName}.json`);

    // In-memory cache for hot data
    this.memoryCache = new Map();
    this.memoryCacheMaxSize = options.memoryCacheMaxSize || 1000;

    // Initialize throttle for rate-limited API calls
    this.throttle = getThrottle({ tier: options.tier || 'starter', verbose: this.verbose });

    // Load persistent cache
    this.cache = this.loadCache();
  }

  /**
   * Load cache from disk
   */
  loadCache() {
    if (fs.existsSync(this.cachePath)) {
      try {
        const data = JSON.parse(fs.readFileSync(this.cachePath, 'utf8'));
        this.log(`Cache loaded from ${this.cachePath}`);
        return data;
      } catch (error) {
        this.log(`Error loading cache: ${error.message}`);
      }
    }

    return this.createEmptyCache();
  }

  /**
   * Create empty cache structure
   */
  createEmptyCache() {
    const properties = {};
    OBJECT_TYPES.forEach(type => {
      properties[type] = { data: [], cachedAt: null };
    });

    return {
      portalName: this.portalName,
      properties,
      pipelines: { deals: { data: [], cachedAt: null }, tickets: { data: [], cachedAt: null } },
      owners: { data: [], cachedAt: null },
      workflows: { data: [], cachedAt: null },
      lists: { data: [], cachedAt: null },
      forms: { data: [], cachedAt: null },
      lastUpdated: null,
      version: '2.0.0'
    };
  }

  /**
   * Save cache to disk
   */
  saveCache() {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }

    this.cache.lastUpdated = new Date().toISOString();
    fs.writeFileSync(this.cachePath, JSON.stringify(this.cache, null, 2));
    this.log(`Cache saved to ${this.cachePath}`);
  }

  /**
   * Check if cached data is still valid
   */
  isCacheValid(cachedAt, ttlMs) {
    if (!cachedAt) return false;
    const age = Date.now() - new Date(cachedAt).getTime();
    return age < ttlMs;
  }

  /**
   * Make throttled API request
   */
  async apiRequest(endpoint, options = {}) {
    if (!this.accessToken) {
      throw new Error('Access token required. Set HUBSPOT_ACCESS_TOKEN or pass --token');
    }

    const url = `${HUBSPOT_API_BASE}${endpoint}`;

    const requestFn = async () => {
      const response = await fetch(url, {
        method: options.method || 'GET',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
          ...options.headers
        },
        body: options.body ? JSON.stringify(options.body) : undefined
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`HubSpot API error ${response.status}: ${errorBody}`);
      }

      return response.json();
    };

    // Use throttle for rate-limited requests
    return this.throttle.enqueue(requestFn);
  }

  // ============================================
  // PROPERTIES CACHING
  // ============================================

  /**
   * Get properties for an object type (with caching)
   */
  async getProperties(objectType, forceRefresh = false) {
    // Check memory cache first
    const memKey = `properties:${objectType}`;
    if (!forceRefresh && this.memoryCache.has(memKey)) {
      const cached = this.memoryCache.get(memKey);
      if (this.isCacheValid(cached.cachedAt, TTL.properties)) {
        this.log(`Properties for ${objectType}: memory cache hit`);
        return cached.data;
      }
    }

    // Check disk cache
    const diskCache = this.cache.properties[objectType];
    if (!forceRefresh && diskCache && this.isCacheValid(diskCache.cachedAt, TTL.properties)) {
      this.log(`Properties for ${objectType}: disk cache hit`);
      // Populate memory cache
      this.setMemoryCache(memKey, diskCache);
      return diskCache.data;
    }

    // Fetch from API
    this.log(`Properties for ${objectType}: fetching from API`);
    const properties = await this.fetchProperties(objectType);

    // Update caches
    const cacheEntry = { data: properties, cachedAt: new Date().toISOString() };
    this.cache.properties[objectType] = cacheEntry;
    this.setMemoryCache(memKey, cacheEntry);
    this.saveCache();

    return properties;
  }

  /**
   * Fetch properties from HubSpot API
   */
  async fetchProperties(objectType) {
    try {
      const result = await this.apiRequest(`/crm/v3/properties/${objectType}`);
      return (result.results || []).map(prop => ({
        name: prop.name,
        label: prop.label,
        type: prop.type,
        fieldType: prop.fieldType,
        groupName: prop.groupName,
        description: prop.description,
        options: prop.options,
        hasUniqueValue: prop.hasUniqueValue,
        calculated: prop.calculated,
        externalOptions: prop.externalOptions
      }));
    } catch (error) {
      this.log(`Error fetching properties for ${objectType}: ${error.message}`);
      return [];
    }
  }

  /**
   * Cache all properties for common object types
   */
  async cacheAllProperties() {
    console.log('  📋 Caching properties for all object types...');

    for (const objectType of OBJECT_TYPES) {
      try {
        const props = await this.getProperties(objectType, true);
        console.log(`    - ${objectType}: ${props.length} properties`);
      } catch (error) {
        console.log(`    - ${objectType}: ❌ ${error.message}`);
      }
    }
  }

  // ============================================
  // PIPELINES CACHING
  // ============================================

  /**
   * Get pipelines for an object type (deals or tickets)
   */
  async getPipelines(objectType = 'deals', forceRefresh = false) {
    const memKey = `pipelines:${objectType}`;

    // Check memory cache
    if (!forceRefresh && this.memoryCache.has(memKey)) {
      const cached = this.memoryCache.get(memKey);
      if (this.isCacheValid(cached.cachedAt, TTL.pipelines)) {
        this.log(`Pipelines for ${objectType}: memory cache hit`);
        return cached.data;
      }
    }

    // Check disk cache
    const diskCache = this.cache.pipelines[objectType];
    if (!forceRefresh && diskCache && this.isCacheValid(diskCache.cachedAt, TTL.pipelines)) {
      this.log(`Pipelines for ${objectType}: disk cache hit`);
      this.setMemoryCache(memKey, diskCache);
      return diskCache.data;
    }

    // Fetch from API
    this.log(`Pipelines for ${objectType}: fetching from API`);
    const pipelines = await this.fetchPipelines(objectType);

    // Update caches
    const cacheEntry = { data: pipelines, cachedAt: new Date().toISOString() };
    this.cache.pipelines[objectType] = cacheEntry;
    this.setMemoryCache(memKey, cacheEntry);
    this.saveCache();

    return pipelines;
  }

  /**
   * Fetch pipelines from HubSpot API
   */
  async fetchPipelines(objectType) {
    try {
      const result = await this.apiRequest(`/crm/v3/pipelines/${objectType}`);
      return (result.results || []).map(pipeline => ({
        id: pipeline.pipelineId,
        label: pipeline.label,
        displayOrder: pipeline.displayOrder,
        stages: (pipeline.stages || []).map(stage => ({
          id: stage.stageId,
          label: stage.label,
          displayOrder: stage.displayOrder,
          metadata: stage.metadata
        }))
      }));
    } catch (error) {
      this.log(`Error fetching pipelines for ${objectType}: ${error.message}`);
      return [];
    }
  }

  /**
   * Cache all pipelines
   */
  async cacheAllPipelines() {
    console.log('  🔄 Caching pipelines...');

    for (const objectType of ['deals', 'tickets']) {
      try {
        const pipelines = await this.getPipelines(objectType, true);
        console.log(`    - ${objectType}: ${pipelines.length} pipelines`);
      } catch (error) {
        console.log(`    - ${objectType}: ❌ ${error.message}`);
      }
    }
  }

  // ============================================
  // OWNERS CACHING
  // ============================================

  /**
   * Get all owners (with caching)
   */
  async getOwners(forceRefresh = false) {
    const memKey = 'owners';

    // Check memory cache
    if (!forceRefresh && this.memoryCache.has(memKey)) {
      const cached = this.memoryCache.get(memKey);
      if (this.isCacheValid(cached.cachedAt, TTL.owners)) {
        this.log('Owners: memory cache hit');
        return cached.data;
      }
    }

    // Check disk cache
    if (!forceRefresh && this.isCacheValid(this.cache.owners.cachedAt, TTL.owners)) {
      this.log('Owners: disk cache hit');
      this.setMemoryCache(memKey, this.cache.owners);
      return this.cache.owners.data;
    }

    // Fetch from API
    this.log('Owners: fetching from API');
    const owners = await this.fetchOwners();

    // Update caches
    const cacheEntry = { data: owners, cachedAt: new Date().toISOString() };
    this.cache.owners = cacheEntry;
    this.setMemoryCache(memKey, cacheEntry);
    this.saveCache();

    return owners;
  }

  /**
   * Fetch owners from HubSpot API
   */
  async fetchOwners() {
    try {
      const result = await this.apiRequest('/crm/v3/owners');
      return (result.results || []).map(owner => ({
        id: owner.id,
        email: owner.email,
        firstName: owner.firstName,
        lastName: owner.lastName,
        userId: owner.userId,
        teams: owner.teams
      }));
    } catch (error) {
      this.log(`Error fetching owners: ${error.message}`);
      return [];
    }
  }

  // ============================================
  // FORMS CACHING
  // ============================================

  /**
   * Get all forms (with caching)
   */
  async getForms(forceRefresh = false) {
    const memKey = 'forms';

    if (!forceRefresh && this.memoryCache.has(memKey)) {
      const cached = this.memoryCache.get(memKey);
      if (this.isCacheValid(cached.cachedAt, TTL.forms)) {
        this.log('Forms: memory cache hit');
        return cached.data;
      }
    }

    if (!forceRefresh && this.isCacheValid(this.cache.forms.cachedAt, TTL.forms)) {
      this.log('Forms: disk cache hit');
      this.setMemoryCache(memKey, this.cache.forms);
      return this.cache.forms.data;
    }

    this.log('Forms: fetching from API');
    const forms = await this.fetchForms();

    const cacheEntry = { data: forms, cachedAt: new Date().toISOString() };
    this.cache.forms = cacheEntry;
    this.setMemoryCache(memKey, cacheEntry);
    this.saveCache();

    return forms;
  }

  /**
   * Fetch forms from HubSpot API
   */
  async fetchForms() {
    try {
      const result = await this.apiRequest('/marketing/v3/forms');
      return (result.results || []).map(form => ({
        id: form.id,
        name: form.name,
        createdAt: form.createdAt,
        updatedAt: form.updatedAt,
        fieldGroups: form.fieldGroups?.length || 0
      }));
    } catch (error) {
      this.log(`Error fetching forms: ${error.message}`);
      return [];
    }
  }

  // ============================================
  // MEMORY CACHE MANAGEMENT
  // ============================================

  /**
   * Set item in memory cache with LRU eviction
   */
  setMemoryCache(key, value) {
    // Evict oldest if at capacity
    if (this.memoryCache.size >= this.memoryCacheMaxSize) {
      const firstKey = this.memoryCache.keys().next().value;
      this.memoryCache.delete(firstKey);
    }

    // Delete and re-add to maintain LRU order
    this.memoryCache.delete(key);
    this.memoryCache.set(key, value);
  }

  /**
   * Clear memory cache
   */
  clearMemoryCache() {
    this.memoryCache.clear();
    this.log('Memory cache cleared');
  }

  // ============================================
  // INITIALIZATION & REFRESH
  // ============================================

  /**
   * Initialize cache with all metadata
   */
  async initCache() {
    console.log(`\n🚀 Initializing metadata cache for: ${this.portalName}`);
    console.log('This may take a few minutes...\n');

    try {
      await this.cacheAllProperties();
      await this.cacheAllPipelines();

      console.log('  👥 Caching owners...');
      const owners = await this.getOwners(true);
      console.log(`    - ${owners.length} owners`);

      console.log('  📝 Caching forms...');
      const forms = await this.getForms(true);
      console.log(`    - ${forms.length} forms`);

      this.saveCache();
      console.log('\n✅ Metadata cache initialized successfully');
      this.printCacheInfo();
    } catch (error) {
      console.error('❌ Error initializing cache:', error.message);
      throw error;
    }
  }

  /**
   * Refresh entire cache
   */
  async refreshCache() {
    console.log(`🔄 Refreshing metadata cache for: ${this.portalName}`);
    this.clearMemoryCache();
    await this.initCache();
  }

  // ============================================
  // QUERY METHODS
  // ============================================

  /**
   * Find property by pattern
   */
  findProperty(objectType, pattern) {
    const properties = this.cache.properties[objectType]?.data || [];
    const regex = new RegExp(pattern, 'i');

    return properties.filter(prop =>
      regex.test(prop.name) || regex.test(prop.label)
    );
  }

  /**
   * Get property by name
   */
  getProperty(objectType, propertyName) {
    const properties = this.cache.properties[objectType]?.data || [];
    return properties.find(prop => prop.name === propertyName);
  }

  /**
   * Get object metadata summary
   */
  getObjectMetadata(objectType) {
    const propCache = this.cache.properties[objectType];
    return {
      objectType,
      properties: propCache?.data || [],
      count: propCache?.data?.length || 0,
      cachedAt: propCache?.cachedAt,
      isStale: !this.isCacheValid(propCache?.cachedAt, TTL.properties)
    };
  }

  // ============================================
  // INFO & UTILITIES
  // ============================================

  /**
   * Print cache information
   */
  printCacheInfo() {
    console.log('\n📊 Cache Information');
    console.log('====================\n');
    console.log(`Portal: ${this.cache.portalName}`);
    console.log(`Last Updated: ${this.cache.lastUpdated || 'Never'}`);
    console.log(`Version: ${this.cache.version}\n`);

    console.log('Properties Cached:');
    Object.entries(this.cache.properties).forEach(([objectType, cache]) => {
      const stale = !this.isCacheValid(cache.cachedAt, TTL.properties);
      const count = cache.data?.length || 0;
      console.log(`  - ${objectType}: ${count} properties${stale ? ' (stale)' : ''}`);
    });

    console.log('\nPipelines Cached:');
    Object.entries(this.cache.pipelines).forEach(([objectType, cache]) => {
      const count = cache.data?.length || 0;
      console.log(`  - ${objectType}: ${count} pipelines`);
    });

    console.log(`\nOwners: ${this.cache.owners.data?.length || 0}`);
    console.log(`Forms: ${this.cache.forms.data?.length || 0}`);

    const age = this.getCacheAge();
    if (age) {
      console.log(`\nCache age: ${age}`);
    }
  }

  /**
   * Get cache age as human-readable string
   */
  getCacheAge() {
    if (!this.cache.lastUpdated) return null;

    const ageMs = Date.now() - new Date(this.cache.lastUpdated).getTime();
    const ageHours = ageMs / (1000 * 60 * 60);
    const ageDays = ageHours / 24;

    if (ageDays > 1) return `${ageDays.toFixed(1)} days`;
    if (ageHours > 1) return `${ageHours.toFixed(1)} hours`;
    return `${(ageMs / (1000 * 60)).toFixed(0)} minutes`;
  }

  /**
   * Check if cache is stale
   */
  isCacheStale(maxAgeHours = 1) {
    if (!this.cache.lastUpdated) return true;
    const ageMs = Date.now() - new Date(this.cache.lastUpdated).getTime();
    return ageMs > maxAgeHours * 60 * 60 * 1000;
  }

  /**
   * Logging utility
   */
  log(message) {
    if (this.verbose) {
      console.log(`[MetadataCache] ${message}`);
    }
  }

  /**
   * Query cache (for CLI)
   */
  queryCache(objectType, propertyName = null) {
    if (propertyName) {
      const property = this.getProperty(objectType, propertyName);
      if (property) {
        console.log(JSON.stringify(property, null, 2));
      } else {
        console.log(`Property not found: ${propertyName}`);
        process.exit(1);
      }
    } else {
      const metadata = this.getObjectMetadata(objectType);
      console.log(JSON.stringify(metadata, null, 2));
    }
  }
}

// ============================================
// CLI Interface
// ============================================

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const portalName = args[1];

  // Parse --token flag
  const tokenIndex = args.indexOf('--token');
  const accessToken = tokenIndex !== -1 ? args[tokenIndex + 1] : process.env.HUBSPOT_ACCESS_TOKEN;

  // Parse --verbose flag
  const verbose = args.includes('--verbose') || args.includes('-v');

  if (!command) {
    console.log(`
HubSpot Metadata Cache v2.0.0
Caches portal metadata for fast lookups with TTL-based expiration.

Usage:
  node hubspot-metadata-cache.js init <portal-name> --token <access-token>
  node hubspot-metadata-cache.js info <portal-name>
  node hubspot-metadata-cache.js query <portal-name> <object-type> [property-name]
  node hubspot-metadata-cache.js find-property <portal-name> <object-type> <pattern>
  node hubspot-metadata-cache.js refresh <portal-name> --token <access-token>

Options:
  --token <token>    HubSpot access token (or set HUBSPOT_ACCESS_TOKEN env var)
  --verbose, -v      Enable verbose logging

Examples:
  node hubspot-metadata-cache.js init production --token pat-xxx
  node hubspot-metadata-cache.js info production
  node hubspot-metadata-cache.js query production contacts email
  node hubspot-metadata-cache.js find-property production contacts "lead.*score"
  node hubspot-metadata-cache.js refresh production --token pat-xxx

TTL Settings:
  - Properties: 1 hour
  - Pipelines: 24 hours
  - Owners: 1 hour
  - Forms: 1 hour

Cache Location: .cache/metadata/<portal-name>.json
`);
    process.exit(0);
  }

  if (!portalName) {
    console.error('❌ Portal name required');
    process.exit(1);
  }

  const cache = new HubSpotMetadataCache(portalName, { accessToken, verbose });

  try {
    switch (command) {
      case 'init':
        if (!accessToken) {
          console.error('❌ Access token required. Use --token or set HUBSPOT_ACCESS_TOKEN');
          process.exit(1);
        }
        await cache.initCache();
        break;

      case 'info':
        cache.printCacheInfo();
        break;

      case 'query': {
        const objectType = args[2];
        const propertyName = args[3];
        if (!objectType) {
          console.error('❌ Object type required');
          process.exit(1);
        }
        cache.queryCache(objectType, propertyName);
        break;
      }

      case 'find-property': {
        const objectType = args[2];
        const pattern = args[3];
        if (!objectType || !pattern) {
          console.error('❌ Object type and pattern required');
          process.exit(1);
        }
        const matches = cache.findProperty(objectType, pattern);
        if (matches.length > 0) {
          console.log(`Found ${matches.length} matching properties:\n`);
          matches.forEach(prop => {
            console.log(`  - ${prop.name} (${prop.type})`);
            console.log(`    Label: ${prop.label}`);
          });
        } else {
          console.log(`No properties found matching pattern: ${pattern}`);
        }
        break;
      }

      case 'refresh':
        if (!accessToken) {
          console.error('❌ Access token required. Use --token or set HUBSPOT_ACCESS_TOKEN');
          process.exit(1);
        }
        await cache.refreshCache();
        break;

      default:
        console.error(`Unknown command: ${command}`);
        process.exit(1);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { HubSpotMetadataCache, TTL, OBJECT_TYPES };
