#!/usr/bin/env node

/**
 * Unified Authentication Manager
 *
 * Centralized authentication layer for cross-platform operations.
 * Supports Salesforce, HubSpot, and Marketo with:
 * - Single credential management
 * - Token refresh handling
 * - Session pooling (connection reuse)
 * - Memory + file caching
 * - Exponential backoff for retries
 *
 * Part of Phase 4: Authentication Centralization
 * Addresses: 4-6 hours saved monthly from duplicated auth code
 *
 * @module unified-auth-manager
 * @version 1.0.0
 * @since 2025-12-13
 *
 * Usage:
 *   const { UnifiedAuthManager } = require('./unified-auth-manager');
 *   const auth = new UnifiedAuthManager();
 *
 *   // Get Salesforce auth
 *   const sfAuth = await auth.getAuth('salesforce', { orgAlias: 'production' });
 *
 *   // Get HubSpot auth
 *   const hsAuth = await auth.getAuth('hubspot');
 *
 *   // Get Marketo auth
 *   const mkAuth = await auth.getAuth('marketo', { instanceName: 'default' });
 *
 *   // Pool connections for batch operations
 *   const pool = auth.getConnectionPool('salesforce', { orgAlias: 'production' });
 *   const conn = await pool.acquire();
 *   // ... use connection
 *   pool.release(conn);
 *
 * CLI:
 *   node unified-auth-manager.js status              # Show all auth status
 *   node unified-auth-manager.js test <platform>    # Test platform auth
 *   node unified-auth-manager.js refresh <platform> # Force refresh
 *   node unified-auth-manager.js clear              # Clear all cached tokens
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

// =============================================================================
// Configuration
// =============================================================================

const CONFIG = {
  // Cache settings
  cache: {
    directory: path.join(process.env.HOME || '/tmp', '.claude', 'auth-cache'),
    memoryTTL: 5 * 60 * 1000,        // 5 minutes in-memory cache
    fileTTL: 55 * 60 * 1000,          // 55 minutes file cache (tokens usually valid for 1 hour)
    refreshBuffer: 5 * 60 * 1000,     // Refresh 5 minutes before expiry
  },

  // Connection pool settings
  pool: {
    maxConnections: 10,
    minConnections: 2,
    acquireTimeout: 30000,
    idleTimeout: 300000,              // 5 minutes idle
    maxWaitQueue: 50,
  },

  // Retry settings
  retry: {
    maxAttempts: 3,
    initialBackoff: 1000,
    maxBackoff: 30000,
    backoffMultiplier: 2,
  },

  // Platform-specific settings
  platforms: {
    salesforce: {
      envVars: ['SALESFORCE_ORG_ALIAS', 'SF_TARGET_ORG', 'SFDX_DEFAULTUSERNAME'],
      requiredFields: ['instanceUrl', 'accessToken'],
    },
    hubspot: {
      envVars: ['HUBSPOT_ACCESS_TOKEN', 'HUBSPOT_API_KEY', 'HUBSPOT_PRIVATE_APP_TOKEN'],
      portalEnv: 'HUBSPOT_PORTAL_ID',
      requiredFields: ['accessToken'],
      apiBase: 'api.hubapi.com',
    },
    marketo: {
      envVars: ['MARKETO_CLIENT_ID', 'MARKETO_CLIENT_SECRET', 'MARKETO_BASE_URL'],
      instanceEnv: 'MARKETO_INSTANCE_NAME',
      requiredFields: ['accessToken', 'baseUrl'],
    },
  },
};

// =============================================================================
// In-Memory Cache
// =============================================================================

const memoryCache = new Map();

function getCacheKey(platform, identifier) {
  return `${platform}:${identifier || 'default'}`;
}

function getFromMemoryCache(key) {
  const cached = memoryCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }
  memoryCache.delete(key);
  return null;
}

function setMemoryCache(key, data, ttl = CONFIG.cache.memoryTTL) {
  memoryCache.set(key, {
    data,
    expiresAt: Date.now() + ttl,
    cachedAt: Date.now(),
  });
}

// =============================================================================
// File Cache
// =============================================================================

function ensureCacheDir() {
  if (!fs.existsSync(CONFIG.cache.directory)) {
    fs.mkdirSync(CONFIG.cache.directory, { recursive: true, mode: 0o700 });
  }
}

function getCacheFilePath(platform, identifier) {
  return path.join(CONFIG.cache.directory, `${platform}-${identifier || 'default'}.json`);
}

function getFromFileCache(platform, identifier) {
  const filePath = getCacheFilePath(platform, identifier);

  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    // Check expiry with buffer
    if (data.expiresAt && data.expiresAt > Date.now() + CONFIG.cache.refreshBuffer) {
      return data;
    }
  } catch (error) {
    // Invalid cache file, remove it
    try {
      fs.unlinkSync(filePath);
    } catch (e) {
      // Ignore
    }
  }

  return null;
}

function setFileCache(platform, identifier, data) {
  ensureCacheDir();
  const filePath = getCacheFilePath(platform, identifier);

  const cacheData = {
    ...data,
    cachedAt: Date.now(),
    platform,
    identifier,
  };

  fs.writeFileSync(filePath, JSON.stringify(cacheData, null, 2), { mode: 0o600 });
}

function clearFileCache(platform, identifier) {
  const filePath = getCacheFilePath(platform, identifier);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

// =============================================================================
// Salesforce Authentication
// =============================================================================

async function getSalesforceAuth(options = {}) {
  const orgAlias = options.orgAlias ||
    process.env.SALESFORCE_ORG_ALIAS ||
    process.env.SF_TARGET_ORG ||
    process.env.SFDX_DEFAULTUSERNAME;

  if (!orgAlias) {
    throw new Error(
      'Salesforce org alias required. Set SALESFORCE_ORG_ALIAS, SF_TARGET_ORG, ' +
      'or SFDX_DEFAULTUSERNAME environment variable, or pass orgAlias option.'
    );
  }

  const cacheKey = getCacheKey('salesforce', orgAlias);

  // Check memory cache first
  const memoryCached = getFromMemoryCache(cacheKey);
  if (memoryCached && !options.forceRefresh) {
    return memoryCached;
  }

  // Check file cache
  const fileCached = getFromFileCache('salesforce', orgAlias);
  if (fileCached && !options.forceRefresh) {
    // Store in memory cache
    setMemoryCache(cacheKey, fileCached);
    return fileCached;
  }

  // Get fresh auth from SF CLI
  try {
    const result = execSync(
      `sf org display --target-org "${orgAlias}" --json`,
      { encoding: 'utf8', timeout: 30000 }
    );

    const data = JSON.parse(result);

    if (!data.result || !data.result.accessToken) {
      throw new Error(`Failed to get access token for org: ${orgAlias}`);
    }

    const authData = {
      platform: 'salesforce',
      orgAlias,
      instanceUrl: data.result.instanceUrl,
      accessToken: data.result.accessToken,
      username: data.result.username,
      orgId: data.result.id,
      apiVersion: data.result.apiVersion || '62.0',
      expiresAt: Date.now() + CONFIG.cache.fileTTL,
    };

    // Cache the auth data
    setMemoryCache(cacheKey, authData);
    setFileCache('salesforce', orgAlias, authData);

    return authData;

  } catch (error) {
    throw new Error(`Salesforce authentication failed for ${orgAlias}: ${error.message}`);
  }
}

// =============================================================================
// HubSpot Authentication
// =============================================================================

async function getHubSpotAuth(options = {}) {
  const accessToken = options.accessToken ||
    process.env.HUBSPOT_PRIVATE_APP_TOKEN ||
    process.env.HUBSPOT_ACCESS_TOKEN ||
    process.env.HUBSPOT_API_KEY;

  const portalId = options.portalId || process.env.HUBSPOT_PORTAL_ID;

  if (!accessToken) {
    throw new Error(
      'HubSpot access token required. Set HUBSPOT_PRIVATE_APP_TOKEN, ' +
      'HUBSPOT_ACCESS_TOKEN, or HUBSPOT_API_KEY environment variable, ' +
      'or pass accessToken option.'
    );
  }

  const identifier = portalId || 'default';
  const cacheKey = getCacheKey('hubspot', identifier);

  // Check memory cache first
  const memoryCached = getFromMemoryCache(cacheKey);
  if (memoryCached && !options.forceRefresh) {
    return memoryCached;
  }

  // Check file cache
  const fileCached = getFromFileCache('hubspot', identifier);
  if (fileCached && !options.forceRefresh) {
    setMemoryCache(cacheKey, fileCached);
    return fileCached;
  }

  // Validate token by making a test API call
  if (options.validate !== false) {
    try {
      await validateHubSpotToken(accessToken);
    } catch (error) {
      throw new Error(`HubSpot authentication validation failed: ${error.message}`);
    }
  }

  const authData = {
    platform: 'hubspot',
    accessToken,
    portalId,
    apiBase: CONFIG.platforms.hubspot.apiBase,
    expiresAt: Date.now() + CONFIG.cache.fileTTL,
  };

  // Cache the auth data
  setMemoryCache(cacheKey, authData);
  setFileCache('hubspot', identifier, authData);

  return authData;
}

function validateHubSpotToken(token) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: CONFIG.platforms.hubspot.apiBase,
      port: 443,
      path: '/crm/v3/objects/contacts?limit=1',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    };

    const req = https.request(options, (res) => {
      if (res.statusCode === 200) {
        resolve(true);
      } else if (res.statusCode === 401) {
        reject(new Error('Invalid or expired access token'));
      } else {
        // Other status codes might be OK (e.g., 403 for permission issues)
        // but the token is valid
        resolve(true);
      }
    });

    req.on('error', (error) => {
      reject(new Error(`API validation request failed: ${error.message}`));
    });

    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('API validation request timed out'));
    });

    req.end();
  });
}

// =============================================================================
// Marketo Authentication
// =============================================================================

async function getMarketoAuth(options = {}) {
  const clientId = options.clientId || process.env.MARKETO_CLIENT_ID;
  const clientSecret = options.clientSecret || process.env.MARKETO_CLIENT_SECRET;
  const baseUrl = options.baseUrl || process.env.MARKETO_BASE_URL;
  const instanceName = options.instanceName || process.env.MARKETO_INSTANCE_NAME || 'default';

  if (!clientId || !clientSecret || !baseUrl) {
    throw new Error(
      'Marketo credentials required. Set MARKETO_CLIENT_ID, MARKETO_CLIENT_SECRET, ' +
      'and MARKETO_BASE_URL environment variables, or pass options.'
    );
  }

  const cacheKey = getCacheKey('marketo', instanceName);

  // Check memory cache first
  const memoryCached = getFromMemoryCache(cacheKey);
  if (memoryCached && !options.forceRefresh) {
    return memoryCached;
  }

  // Check file cache
  const fileCached = getFromFileCache('marketo', instanceName);
  if (fileCached && !options.forceRefresh) {
    setMemoryCache(cacheKey, fileCached);
    return fileCached;
  }

  // Get fresh token via OAuth 2.0 client credentials flow
  const authData = await refreshMarketoToken({
    clientId,
    clientSecret,
    baseUrl,
    instanceName,
  });

  // Cache the auth data
  setMemoryCache(cacheKey, authData);
  setFileCache('marketo', instanceName, authData);

  return authData;
}

function refreshMarketoToken(config) {
  return new Promise((resolve, reject) => {
    const normalizedBaseUrl = config.baseUrl.replace(/\/$/, '');
    const tokenUrl = new URL(`${normalizedBaseUrl}/identity/oauth/token`);
    tokenUrl.searchParams.set('grant_type', 'client_credentials');
    tokenUrl.searchParams.set('client_id', config.clientId);
    tokenUrl.searchParams.set('client_secret', config.clientSecret);

    const options = {
      hostname: tokenUrl.hostname,
      port: 443,
      path: tokenUrl.pathname + tokenUrl.search,
      method: 'GET',
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const response = JSON.parse(data);

          if (response.access_token) {
            const expiresIn = response.expires_in || 3600;
            resolve({
              platform: 'marketo',
              instanceName: config.instanceName,
              accessToken: response.access_token,
              baseUrl: normalizedBaseUrl,
              scope: response.scope,
              tokenType: response.token_type || 'bearer',
              expiresAt: Date.now() + (expiresIn * 1000) - CONFIG.cache.refreshBuffer,
              munchkinId: extractMunchkinId(normalizedBaseUrl),
            });
          } else {
            reject(new Error(`Marketo auth failed: ${response.error_description || response.error || 'Unknown error'}`));
          }
        } catch (error) {
          reject(new Error(`Failed to parse Marketo token response: ${error.message}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(new Error(`Marketo token request failed: ${error.message}`));
    });

    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Marketo token request timed out'));
    });

    req.end();
  });
}

function extractMunchkinId(baseUrl) {
  const match = baseUrl.match(/https?:\/\/(\d{3}-\w{3}-\d{3})/);
  return match ? match[1] : null;
}

// =============================================================================
// Connection Pool
// =============================================================================

class ConnectionPool {
  constructor(platform, options = {}) {
    this.platform = platform;
    this.options = {
      ...CONFIG.pool,
      ...options,
    };
    this.connections = [];
    this.waitQueue = [];
    this.activeCount = 0;
  }

  async acquire() {
    // Check if we have an available connection
    const available = this.connections.find(c => !c.inUse && !c.expired);
    if (available) {
      available.inUse = true;
      available.lastUsed = Date.now();
      this.activeCount++;
      return available;
    }

    // Check if we can create a new connection
    if (this.connections.length < this.options.maxConnections) {
      const auth = await getAuth(this.platform, this.options);
      const connection = {
        id: `${this.platform}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        auth,
        inUse: true,
        createdAt: Date.now(),
        lastUsed: Date.now(),
        expired: false,
      };
      this.connections.push(connection);
      this.activeCount++;
      return connection;
    }

    // Wait for a connection to become available
    if (this.waitQueue.length >= this.options.maxWaitQueue) {
      throw new Error('Connection pool exhausted - max wait queue reached');
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        const index = this.waitQueue.findIndex(w => w.resolve === resolve);
        if (index > -1) {
          this.waitQueue.splice(index, 1);
        }
        reject(new Error('Connection acquire timeout'));
      }, this.options.acquireTimeout);

      this.waitQueue.push({ resolve, reject, timeout });
    });
  }

  release(connection) {
    connection.inUse = false;
    connection.lastUsed = Date.now();
    this.activeCount--;

    // Check if connection should be expired
    if (connection.auth.expiresAt && connection.auth.expiresAt < Date.now() + CONFIG.cache.refreshBuffer) {
      connection.expired = true;
    }

    // Process wait queue
    if (this.waitQueue.length > 0) {
      const waiter = this.waitQueue.shift();
      clearTimeout(waiter.timeout);

      if (!connection.expired) {
        connection.inUse = true;
        connection.lastUsed = Date.now();
        this.activeCount++;
        waiter.resolve(connection);
      } else {
        // Get a fresh connection for the waiter
        this.acquire()
          .then(waiter.resolve)
          .catch(waiter.reject);
      }
    }
  }

  async refreshAll() {
    // Refresh all connections
    for (const conn of this.connections) {
      if (!conn.inUse) {
        try {
          conn.auth = await getAuth(this.platform, { ...this.options, forceRefresh: true });
          conn.expired = false;
        } catch (error) {
          conn.expired = true;
        }
      }
    }
  }

  cleanup() {
    const now = Date.now();
    this.connections = this.connections.filter(conn => {
      // Remove expired or idle connections
      if (conn.expired || (!conn.inUse && now - conn.lastUsed > this.options.idleTimeout)) {
        return false;
      }
      // Keep minimum connections
      return this.connections.length <= this.options.minConnections || conn.inUse;
    });
  }

  getStats() {
    return {
      platform: this.platform,
      total: this.connections.length,
      active: this.activeCount,
      available: this.connections.filter(c => !c.inUse && !c.expired).length,
      expired: this.connections.filter(c => c.expired).length,
      waitQueue: this.waitQueue.length,
    };
  }

  destroy() {
    // Clear wait queue
    for (const waiter of this.waitQueue) {
      clearTimeout(waiter.timeout);
      waiter.reject(new Error('Pool destroyed'));
    }
    this.waitQueue = [];
    this.connections = [];
    this.activeCount = 0;
  }
}

// Connection pool instances
const pools = new Map();

function getConnectionPool(platform, options = {}) {
  const poolKey = getCacheKey(platform, options.orgAlias || options.portalId || options.instanceName);

  if (!pools.has(poolKey)) {
    pools.set(poolKey, new ConnectionPool(platform, options));
  }

  return pools.get(poolKey);
}

// =============================================================================
// Unified Authentication Interface
// =============================================================================

async function getAuth(platform, options = {}) {
  switch (platform.toLowerCase()) {
    case 'salesforce':
    case 'sfdc':
    case 'sf':
      return getSalesforceAuth(options);

    case 'hubspot':
    case 'hs':
      return getHubSpotAuth(options);

    case 'marketo':
    case 'mk':
    case 'mkto':
      return getMarketoAuth(options);

    default:
      throw new Error(`Unknown platform: ${platform}. Supported: salesforce, hubspot, marketo`);
  }
}

async function testAuth(platform, options = {}) {
  try {
    const auth = await getAuth(platform, { ...options, validate: true, forceRefresh: true });
    return {
      success: true,
      platform,
      ...auth,
      accessToken: auth.accessToken ? `${auth.accessToken.substring(0, 10)}...` : null,
    };
  } catch (error) {
    return {
      success: false,
      platform,
      error: error.message,
    };
  }
}

async function getAllAuthStatus() {
  const results = {};

  for (const platform of Object.keys(CONFIG.platforms)) {
    try {
      const auth = await getAuth(platform, { validate: false });
      results[platform] = {
        status: 'authenticated',
        expiresAt: auth.expiresAt,
        identifier: auth.orgAlias || auth.portalId || auth.instanceName || 'default',
      };
    } catch (error) {
      results[platform] = {
        status: 'not_configured',
        error: error.message,
      };
    }
  }

  return results;
}

function clearAllCache() {
  // Clear memory cache
  memoryCache.clear();

  // Clear file cache
  if (fs.existsSync(CONFIG.cache.directory)) {
    const files = fs.readdirSync(CONFIG.cache.directory);
    for (const file of files) {
      if (file.endsWith('.json')) {
        fs.unlinkSync(path.join(CONFIG.cache.directory, file));
      }
    }
  }

  // Destroy all pools
  for (const [key, pool] of pools) {
    pool.destroy();
  }
  pools.clear();

  return { cleared: true };
}

// =============================================================================
// Retry with Exponential Backoff
// =============================================================================

async function withRetry(fn, options = {}) {
  const {
    maxAttempts = CONFIG.retry.maxAttempts,
    initialBackoff = CONFIG.retry.initialBackoff,
    maxBackoff = CONFIG.retry.maxBackoff,
    backoffMultiplier = CONFIG.retry.backoffMultiplier,
    onRetry = () => {},
  } = options;

  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;

      // Check if error is retryable
      const retryable = isRetryableError(error);

      if (!retryable || attempt === maxAttempts) {
        throw error;
      }

      // Calculate backoff
      const backoff = Math.min(
        initialBackoff * Math.pow(backoffMultiplier, attempt - 1),
        maxBackoff
      );

      onRetry(attempt, backoff, error);

      await sleep(backoff);
    }
  }

  throw lastError;
}

function isRetryableError(error) {
  const message = error.message || '';

  // Network errors
  if (message.includes('ECONNREFUSED') ||
      message.includes('ETIMEDOUT') ||
      message.includes('ENOTFOUND') ||
      message.includes('socket hang up')) {
    return true;
  }

  // Rate limiting
  if (message.includes('rate limit') ||
      message.includes('429') ||
      message.includes('too many requests')) {
    return true;
  }

  // Temporary server errors
  if (message.includes('503') ||
      message.includes('502') ||
      message.includes('500')) {
    return true;
  }

  return false;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// =============================================================================
// UnifiedAuthManager Class
// =============================================================================

class UnifiedAuthManager {
  constructor(options = {}) {
    this.options = options;
  }

  async getAuth(platform, options = {}) {
    return withRetry(
      () => getAuth(platform, { ...this.options, ...options }),
      { onRetry: (attempt, backoff) => {
        if (this.options.verbose) {
          console.error(`Auth retry ${attempt}, waiting ${backoff}ms...`);
        }
      }}
    );
  }

  async testAuth(platform, options = {}) {
    return testAuth(platform, { ...this.options, ...options });
  }

  async getAllStatus() {
    return getAllAuthStatus();
  }

  getConnectionPool(platform, options = {}) {
    return getConnectionPool(platform, { ...this.options, ...options });
  }

  clearCache() {
    return clearAllCache();
  }

  async withAuth(platform, fn, options = {}) {
    const auth = await this.getAuth(platform, options);
    return fn(auth);
  }

  async withPooledConnection(platform, fn, options = {}) {
    const pool = this.getConnectionPool(platform, options);
    const connection = await pool.acquire();

    try {
      return await fn(connection.auth);
    } finally {
      pool.release(connection);
    }
  }
}

// =============================================================================
// CLI Interface
// =============================================================================

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const platform = args[1];

  switch (command) {
    case 'status': {
      const status = await getAllAuthStatus();
      console.log(JSON.stringify(status, null, 2));
      break;
    }

    case 'test': {
      if (!platform) {
        console.error('Usage: unified-auth-manager.js test <platform>');
        process.exit(1);
      }
      const result = await testAuth(platform);
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.success ? 0 : 1);
      break;
    }

    case 'refresh': {
      if (!platform) {
        console.error('Usage: unified-auth-manager.js refresh <platform>');
        process.exit(1);
      }
      try {
        const auth = await getAuth(platform, { forceRefresh: true });
        console.log(JSON.stringify({
          success: true,
          platform,
          expiresAt: auth.expiresAt,
        }, null, 2));
      } catch (error) {
        console.log(JSON.stringify({
          success: false,
          platform,
          error: error.message,
        }, null, 2));
        process.exit(1);
      }
      break;
    }

    case 'clear': {
      const result = clearAllCache();
      console.log(JSON.stringify(result, null, 2));
      break;
    }

    case 'pool-stats': {
      const stats = {};
      for (const [key, pool] of pools) {
        stats[key] = pool.getStats();
      }
      console.log(JSON.stringify(stats, null, 2));
      break;
    }

    default:
      console.log(`
Unified Authentication Manager - Cross-Platform Auth Centralization

Usage:
  node unified-auth-manager.js <command> [options]

Commands:
  status              Show authentication status for all platforms
  test <platform>     Test authentication for a platform (salesforce, hubspot, marketo)
  refresh <platform>  Force refresh authentication token
  clear               Clear all cached tokens
  pool-stats          Show connection pool statistics

Platforms:
  salesforce (aliases: sfdc, sf)
  hubspot (aliases: hs)
  marketo (aliases: mk, mkto)

Environment Variables:
  Salesforce:
    SALESFORCE_ORG_ALIAS, SF_TARGET_ORG, SFDX_DEFAULTUSERNAME

  HubSpot:
    HUBSPOT_PRIVATE_APP_TOKEN, HUBSPOT_ACCESS_TOKEN, HUBSPOT_API_KEY
    HUBSPOT_PORTAL_ID

  Marketo:
    MARKETO_CLIENT_ID, MARKETO_CLIENT_SECRET, MARKETO_BASE_URL
    MARKETO_INSTANCE_NAME

Examples:
  node unified-auth-manager.js status
  node unified-auth-manager.js test salesforce
  node unified-auth-manager.js refresh hubspot
  node unified-auth-manager.js clear
      `);
  }
}

// =============================================================================
// Exports
// =============================================================================

module.exports = {
  UnifiedAuthManager,
  getAuth,
  testAuth,
  getAllAuthStatus,
  clearAllCache,
  getConnectionPool,
  withRetry,
  ConnectionPool,
  CONFIG,
};

// Run CLI if called directly
if (require.main === module) {
  main().catch((error) => {
    console.error('Error:', error.message);
    process.exit(1);
  });
}
