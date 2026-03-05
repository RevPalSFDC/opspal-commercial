#!/usr/bin/env node

/**
 * Fireflies.ai Credential Manager
 *
 * Supports API key authentication (single key, Bearer scheme).
 * Validates env vars, builds Authorization header, and provides
 * per-tenant key storage in ~/.claude/fireflies-tokens/ for
 * future multi-tenant extension.
 *
 * Usage:
 *   const { FirefliesTokenManager } = require('./fireflies-token-manager');
 *   const manager = new FirefliesTokenManager();
 *   const headers = await manager.getAuthHeaders();
 *
 * @module fireflies-token-manager
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const TOKEN_DIR = path.join(process.env.HOME || '/tmp', '.claude', 'fireflies-tokens');
const GRAPHQL_ENDPOINT = 'https://api.fireflies.ai/graphql';

class FirefliesTokenManager {
  constructor(options = {}) {
    this.verbose = options.verbose || false;

    // Future: per-tenant key overrides stored in TOKEN_DIR
    this._tenantKeys = new Map();
  }

  /**
   * Get auth headers for Fireflies API requests.
   * @param {string} [tenantId] - Optional tenant override (for future multi-tenant)
   * @returns {Promise<Object>} Headers object with Authorization and Content-Type
   */
  async getAuthHeaders(tenantId) {
    const apiKey = tenantId
      ? this._loadTenantKey(tenantId)
      : process.env.FIREFLIES_API_KEY;

    if (!apiKey) {
      if (tenantId) {
        throw new Error(
          `No Fireflies API key found for tenant "${tenantId}".\n` +
          `Store a key with: FirefliesTokenManager.saveTenantKey("${tenantId}", "<key>")\n` +
          `Or set the FIREFLIES_API_KEY environment variable as a fallback.`
        );
      }
      throw new Error(
        'Missing Fireflies credentials. Set the FIREFLIES_API_KEY environment variable.\n' +
        'Get your API key from: https://app.fireflies.ai/login -> Integrations -> Fireflies API'
      );
    }

    return {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    };
  }

  /**
   * Load a per-tenant API key from disk.
   * Falls back to FIREFLIES_API_KEY env var if tenant file not found.
   * @param {string} tenantId
   * @returns {string|null}
   */
  _loadTenantKey(tenantId) {
    // Check in-memory cache first
    if (this._tenantKeys.has(tenantId)) {
      return this._tenantKeys.get(tenantId);
    }

    const keyFile = path.join(TOKEN_DIR, `${tenantId}.json`);
    try {
      if (fs.existsSync(keyFile)) {
        const data = JSON.parse(fs.readFileSync(keyFile, 'utf8'));
        if (data.api_key) {
          this._tenantKeys.set(tenantId, data.api_key);
          return data.api_key;
        }
      }
    } catch { /* no key file */ }

    // Fall back to env var
    return process.env.FIREFLIES_API_KEY || null;
  }

  /**
   * Persist a per-tenant API key to disk.
   * File is written atomically with mode 0600.
   * @param {string} tenantId
   * @param {string} apiKey
   */
  saveTenantKey(tenantId, apiKey) {
    if (!fs.existsSync(TOKEN_DIR)) {
      fs.mkdirSync(TOKEN_DIR, { recursive: true, mode: 0o700 });
    }

    const keyFile = path.join(TOKEN_DIR, `${tenantId}.json`);
    const tmpFile = `${keyFile}.tmp.${process.pid}`;
    const data = {
      api_key: apiKey,
      tenant_id: tenantId,
      saved_at: new Date().toISOString()
    };

    fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), { mode: 0o600 });
    fs.renameSync(tmpFile, keyFile); // atomic

    this._tenantKeys.set(tenantId, apiKey);

    if (this.verbose) {
      console.error(`[fireflies-token] Saved API key for tenant ${tenantId}`);
    }
  }

  /**
   * Remove a per-tenant API key from disk and in-memory cache.
   * @param {string} tenantId
   */
  clearTenantKey(tenantId) {
    this._tenantKeys.delete(tenantId);
    const keyFile = path.join(TOKEN_DIR, `${tenantId}.json`);
    try {
      if (fs.existsSync(keyFile)) {
        fs.unlinkSync(keyFile);
      }
    } catch { /* non-critical */ }
  }

  /**
   * Validate credentials by sending a minimal GraphQL query to Fireflies.
   * Uses: { user { email } }
   * @param {string} [tenantId] - Optional tenant to validate
   * @returns {Promise<Object>} Validation result
   */
  async validateCredentials(tenantId) {
    let headers;
    try {
      headers = await this.getAuthHeaders(tenantId);
    } catch (err) {
      return {
        valid: false,
        message: err.message
      };
    }

    const query = '{ user { email } }';
    const body = JSON.stringify({ query });

    return new Promise((resolve) => {
      const parsed = new URL(GRAPHQL_ENDPOINT);
      const req = https.request({
        hostname: parsed.hostname,
        path: parsed.pathname,
        method: 'POST',
        headers: {
          ...headers,
          'Content-Length': Buffer.byteLength(body)
        }
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (this.verbose) {
            console.error(`[fireflies-token] validate -> HTTP ${res.statusCode}`);
          }

          if (res.statusCode === 200) {
            let parsed;
            try {
              parsed = JSON.parse(data);
            } catch {
              resolve({
                valid: false,
                message: `Invalid JSON in response: ${data}`
              });
              return;
            }

            if (parsed.errors && parsed.errors.length > 0) {
              const err = parsed.errors[0];
              const code = err.extensions?.code || err.code || 'unknown';
              if (code === 'forbidden' || res.statusCode === 401) {
                resolve({
                  valid: false,
                  message: 'Authentication failed. Check your FIREFLIES_API_KEY.',
                  errorCode: code
                });
              } else {
                resolve({
                  valid: false,
                  message: `GraphQL error: ${err.message}`,
                  errorCode: code
                });
              }
            } else {
              const email = parsed.data?.user?.email || null;
              resolve({
                valid: true,
                message: 'Fireflies credentials are valid',
                userEmail: email
              });
            }
          } else if (res.statusCode === 401 || res.statusCode === 403) {
            resolve({
              valid: false,
              message: `Authentication failed (${res.statusCode}). Check your FIREFLIES_API_KEY.`,
              statusCode: res.statusCode
            });
          } else {
            resolve({
              valid: false,
              message: `Unexpected response (${res.statusCode}): ${data}`,
              statusCode: res.statusCode
            });
          }
        });
      });

      req.on('error', err => {
        resolve({
          valid: false,
          message: `Connection error: ${err.message}`
        });
      });

      req.write(body);
      req.end();
    });
  }
}

// CLI usage
if (require.main === module) {
  const cmd = process.argv[2];
  const manager = new FirefliesTokenManager({ verbose: true });

  if (cmd === 'validate' || cmd === 'test') {
    manager.validateCredentials().then(result => {
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.valid ? 0 : 1);
    });
  } else if (cmd === 'check') {
    const key = process.env.FIREFLIES_API_KEY;
    if (key) {
      console.log('Fireflies API key found in environment (FIREFLIES_API_KEY).');
    } else {
      console.error('FIREFLIES_API_KEY is not set.');
      console.error('Get your key from: https://app.fireflies.ai/login -> Integrations -> Fireflies API');
      process.exit(1);
    }
  } else {
    console.log('Usage: fireflies-token-manager.js [validate|check]');
    console.log('  validate  - Test credentials against Fireflies API');
    console.log('  check     - Verify FIREFLIES_API_KEY env var is set');
  }
}

module.exports = { FirefliesTokenManager };
