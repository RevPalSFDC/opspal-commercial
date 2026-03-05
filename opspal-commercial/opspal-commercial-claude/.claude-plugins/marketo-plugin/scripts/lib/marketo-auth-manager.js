#!/usr/bin/env node

/**
 * Marketo Authentication Manager
 *
 * Manages OAuth 2.0 client credentials flow for Marketo API.
 * Used by hooks and scripts outside the MCP server context.
 *
 * @module marketo-auth-manager
 * @version 1.0.0
 *
 * Usage:
 *   node marketo-auth-manager.js test           # Test authentication
 *   node marketo-auth-manager.js token          # Get current token info
 *   node marketo-auth-manager.js refresh        # Force token refresh
 *   node marketo-auth-manager.js validate       # Validate configuration
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Plugin root (two levels up from scripts/lib)
const PLUGIN_ROOT = path.resolve(__dirname, '../..');

// Token cache file
const TOKEN_CACHE_DIR = path.join(PLUGIN_ROOT, 'portals', '.token-cache');
const CONFIG_FILE = path.join(PLUGIN_ROOT, 'portals', 'config.json');

// In-memory cache
let tokenCache = {
  accessToken: null,
  expiresAt: null
};

/**
 * Get configuration from environment or config file
 * @param {string} instanceName - Optional instance name
 * @returns {Object} Configuration
 */
export function getConfig(instanceName = null) {
  // Try environment variables first
  const clientId = process.env.MARKETO_CLIENT_ID;
  const clientSecret = process.env.MARKETO_CLIENT_SECRET;
  const baseUrl = process.env.MARKETO_BASE_URL;

  if (clientId && clientSecret && baseUrl) {
    return {
      clientId,
      clientSecret,
      baseUrl: baseUrl.replace(/\/$/, ''),
      munchkinId: process.env.MARKETO_MUNCHKIN_ID || extractMunchkinId(baseUrl),
      source: 'environment'
    };
  }

  // Try config file
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      const instance = instanceName || process.env.MARKETO_INSTANCE_NAME || 'default';

      if (config.instances && config.instances[instance]) {
        const inst = config.instances[instance];
        return {
          clientId: inst.clientId,
          clientSecret: inst.clientSecret,
          baseUrl: inst.baseUrl.replace(/\/$/, ''),
          munchkinId: inst.munchkinId || extractMunchkinId(inst.baseUrl),
          instanceName: instance,
          source: 'config'
        };
      }
    } catch (error) {
      throw new Error(`Failed to read config file: ${error.message}`);
    }
  }

  throw new Error(
    'Marketo configuration not found. Set environment variables ' +
    '(MARKETO_CLIENT_ID, MARKETO_CLIENT_SECRET, MARKETO_BASE_URL) ' +
    'or create portals/config.json'
  );
}

/**
 * Extract Munchkin ID from base URL
 */
function extractMunchkinId(baseUrl) {
  const match = baseUrl.match(/https?:\/\/(\d{3}-\w{3}-\d{3})/);
  return match ? match[1] : null;
}

/**
 * Get cached token from file
 */
function getCachedToken(instanceName = 'default') {
  const cacheFile = path.join(TOKEN_CACHE_DIR, `${instanceName}.json`);

  if (fs.existsSync(cacheFile)) {
    try {
      const cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));

      // Check if expired
      if (cache.expiresAt && Date.now() < cache.expiresAt - 300000) {
        return cache;
      }
    } catch (error) {
      // Ignore cache read errors
    }
  }

  return null;
}

/**
 * Save token to cache file
 */
function saveTokenCache(instanceName, tokenData) {
  if (!fs.existsSync(TOKEN_CACHE_DIR)) {
    fs.mkdirSync(TOKEN_CACHE_DIR, { recursive: true });
  }

  const cacheFile = path.join(TOKEN_CACHE_DIR, `${instanceName}.json`);
  fs.writeFileSync(cacheFile, JSON.stringify(tokenData, null, 2));
}

/**
 * Get access token (from cache or fresh)
 */
export async function getAccessToken(instanceName = 'default') {
  // Check memory cache
  if (tokenCache.accessToken && tokenCache.expiresAt > Date.now() + 300000) {
    return tokenCache.accessToken;
  }

  // Check file cache
  const cached = getCachedToken(instanceName);
  if (cached) {
    tokenCache = cached;
    return cached.accessToken;
  }

  // Get fresh token
  return await refreshToken(instanceName);
}

/**
 * Refresh access token
 */
export async function refreshToken(instanceName = 'default') {
  const config = getConfig(instanceName);

  const tokenUrl = `${config.baseUrl}/identity/oauth/token?` +
    `grant_type=client_credentials&` +
    `client_id=${config.clientId}&` +
    `client_secret=${config.clientSecret}`;

  const response = await fetch(tokenUrl, {
    method: 'GET',
    headers: { 'Accept': 'application/json' }
  });

  if (!response.ok) {
    throw new Error(`Token request failed: ${response.status}`);
  }

  const data = await response.json();

  if (data.error) {
    throw new Error(`Marketo OAuth error: ${data.error} - ${data.error_description}`);
  }

  // Update caches
  tokenCache = {
    accessToken: data.access_token,
    expiresAt: Date.now() + (data.expires_in * 1000),
    tokenType: data.token_type,
    scope: data.scope
  };

  saveTokenCache(instanceName, tokenCache);

  return data.access_token;
}

/**
 * Make authenticated API request
 */
export async function apiRequest(endpoint, options = {}, instanceName = 'default') {
  const config = getConfig(instanceName);
  const token = await getAccessToken(instanceName);

  const url = `${config.baseUrl}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...options.headers
    }
  });

  const data = await response.json();

  // Handle token expiration
  if (!data.success && data.errors?.[0]?.code === '601') {
    tokenCache = {};
    const newToken = await refreshToken(instanceName);

    const retryResponse = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${newToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...options.headers
      }
    });

    return await retryResponse.json();
  }

  return data;
}

/**
 * Test authentication
 */
export async function testAuth(instanceName = 'default') {
  try {
    const config = getConfig(instanceName);
    console.log(`Testing authentication for instance: ${instanceName || 'default'}`);
    console.log(`Base URL: ${config.baseUrl}`);
    console.log(`Munchkin ID: ${config.munchkinId}`);

    const token = await getAccessToken(instanceName);
    console.log(`Token obtained successfully`);

    // Test API call
    const result = await apiRequest('/rest/v1/leads/describe.json', {}, instanceName);

    if (result.success) {
      console.log(`API test successful - ${result.result?.length || 0} lead fields found`);
      return { success: true, fields: result.result?.length || 0 };
    } else {
      console.error(`API test failed: ${result.errors?.[0]?.message}`);
      return { success: false, error: result.errors?.[0]?.message };
    }

  } catch (error) {
    console.error(`Authentication test failed: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Get token info
 */
export function getTokenInfo(instanceName = 'default') {
  const cached = getCachedToken(instanceName);

  return {
    hasToken: !!cached?.accessToken,
    expiresAt: cached?.expiresAt ? new Date(cached.expiresAt).toISOString() : null,
    expiresIn: cached?.expiresAt ? Math.max(0, Math.floor((cached.expiresAt - Date.now()) / 1000)) : 0,
    scope: cached?.scope
  };
}

/**
 * Validate configuration
 */
export function validateConfig(instanceName = 'default') {
  try {
    const config = getConfig(instanceName);

    const validation = {
      valid: true,
      checks: {
        clientId: !!config.clientId,
        clientSecret: !!config.clientSecret,
        baseUrl: !!config.baseUrl,
        munchkinId: !!config.munchkinId,
        baseUrlFormat: /^https:\/\/\d{3}-\w{3}-\d{3}\.mktorest\.com$/.test(config.baseUrl)
      },
      source: config.source
    };

    validation.valid = Object.values(validation.checks).every(v => v);

    return validation;

  } catch (error) {
    return {
      valid: false,
      error: error.message
    };
  }
}

// CLI handling
const args = process.argv.slice(2);
const command = args[0];
const instanceName = args[1] || process.env.MARKETO_INSTANCE_NAME || 'default';

if (command) {
  (async () => {
    switch (command) {
      case 'test':
        const testResult = await testAuth(instanceName);
        process.exit(testResult.success ? 0 : 1);
        break;

      case 'token':
        const tokenInfo = getTokenInfo(instanceName);
        console.log(JSON.stringify(tokenInfo, null, 2));
        break;

      case 'refresh':
        try {
          await refreshToken(instanceName);
          console.log('Token refreshed successfully');
        } catch (error) {
          console.error(`Token refresh failed: ${error.message}`);
          process.exit(1);
        }
        break;

      case 'validate':
        const validation = validateConfig(instanceName);
        console.log(JSON.stringify(validation, null, 2));
        process.exit(validation.valid ? 0 : 1);
        break;

      default:
        console.log('Usage: node marketo-auth-manager.js <command> [instance]');
        console.log('Commands: test, token, refresh, validate');
        process.exit(1);
    }
  })();
}

export default {
  getConfig,
  getAccessToken,
  refreshToken,
  apiRequest,
  testAuth,
  getTokenInfo,
  validateConfig
};
