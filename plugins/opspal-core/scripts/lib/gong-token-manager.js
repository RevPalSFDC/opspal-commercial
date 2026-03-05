#!/usr/bin/env node

/**
 * Gong Credential Manager
 *
 * Supports Basic Auth (internal API keys) and OAuth 2.0 (multi-tenant).
 * For Basic Auth: validates env vars, builds Authorization header.
 * For OAuth: single-flight refresh per tenant with atomic token writes.
 *
 * Usage:
 *   const { GongTokenManager } = require('./gong-token-manager');
 *   const manager = new GongTokenManager();
 *   const headers = await manager.getAuthHeaders();
 *
 * @module gong-token-manager
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const TOKEN_DIR = path.join(process.env.HOME || '/tmp', '.claude', 'gong-tokens');

class GongTokenManager {
  constructor(options = {}) {
    this.mode = options.mode || 'basic'; // 'basic' or 'oauth'
    this.baseUrl = options.baseUrl || 'https://api.gong.io';
    this.verbose = options.verbose || false;

    // OAuth refresh locks (single-flight per tenant)
    this._refreshInProgress = new Map();
  }

  /**
   * Get auth headers for Gong API requests.
   * @param {string} [tenantId] - Tenant ID for OAuth multi-tenant
   * @returns {Promise<Object>} Headers object with Authorization
   */
  async getAuthHeaders(tenantId) {
    if (this.mode === 'oauth' && tenantId) {
      return this._getOAuthHeaders(tenantId);
    }
    return this._getBasicAuthHeaders();
  }

  /**
   * Build Basic Auth headers from env vars.
   * @returns {Object} Headers with Basic Authorization
   */
  _getBasicAuthHeaders() {
    const keyId = process.env.GONG_ACCESS_KEY_ID;
    const keySecret = process.env.GONG_ACCESS_KEY_SECRET;

    if (!keyId || !keySecret) {
      throw new Error(
        'Missing Gong credentials. Set GONG_ACCESS_KEY_ID and GONG_ACCESS_KEY_SECRET environment variables.\n' +
        'Get your API keys from: Gong Admin > Company Settings > API'
      );
    }

    const encoded = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
    return {
      'Authorization': `Basic ${encoded}`,
      'Content-Type': 'application/json'
    };
  }

  /**
   * Get OAuth headers with automatic refresh.
   * @param {string} tenantId - Tenant identifier
   * @returns {Promise<Object>} Headers with Bearer token
   */
  async _getOAuthHeaders(tenantId) {
    let token = this._loadToken(tenantId);

    if (!token || this._isExpired(token)) {
      token = await this._refreshToken(tenantId, token);
    }

    return {
      'Authorization': `Bearer ${token.access_token}`,
      'Content-Type': 'application/json'
    };
  }

  _loadToken(tenantId) {
    const tokenFile = path.join(TOKEN_DIR, `${tenantId}.json`);
    try {
      if (fs.existsSync(tokenFile)) {
        return JSON.parse(fs.readFileSync(tokenFile, 'utf8'));
      }
    } catch { /* no token */ }
    return null;
  }

  _saveToken(tenantId, tokenData) {
    if (!fs.existsSync(TOKEN_DIR)) {
      fs.mkdirSync(TOKEN_DIR, { recursive: true, mode: 0o700 });
    }
    const tokenFile = path.join(TOKEN_DIR, `${tenantId}.json`);
    const tmpFile = `${tokenFile}.tmp.${process.pid}`;
    fs.writeFileSync(tmpFile, JSON.stringify(tokenData, null, 2), { mode: 0o600 });
    fs.renameSync(tmpFile, tokenFile); // atomic
  }

  _isExpired(token) {
    if (!token.expires_at) return true;
    return Date.now() >= (token.expires_at - 60000); // 1-minute buffer
  }

  /**
   * Refresh OAuth token with single-flight protection.
   * @param {string} tenantId
   * @param {Object} currentToken
   * @returns {Promise<Object>} New token data
   */
  async _refreshToken(tenantId, currentToken) {
    // Single-flight: if refresh is already in progress, wait for it
    if (this._refreshInProgress.has(tenantId)) {
      return this._refreshInProgress.get(tenantId);
    }

    const refreshPromise = this._doRefresh(tenantId, currentToken);
    this._refreshInProgress.set(tenantId, refreshPromise);

    try {
      const result = await refreshPromise;
      return result;
    } finally {
      this._refreshInProgress.delete(tenantId);
    }
  }

  async _doRefresh(tenantId, currentToken) {
    if (!currentToken || !currentToken.refresh_token) {
      throw new Error(`No refresh token available for tenant ${tenantId}. Re-authenticate via OAuth flow.`);
    }

    const clientId = process.env.GONG_OAUTH_CLIENT_ID;
    const clientSecret = process.env.GONG_OAUTH_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error('Missing GONG_OAUTH_CLIENT_ID or GONG_OAUTH_CLIENT_SECRET for OAuth refresh.');
    }

    const body = JSON.stringify({
      grant_type: 'refresh_token',
      refresh_token: currentToken.refresh_token,
      client_id: clientId,
      client_secret: clientSecret
    });

    const response = await this._httpPost('https://app.gong.io/oauth2/generate-customer-token', body);

    const tokenData = {
      access_token: response.access_token,
      refresh_token: response.refresh_token || currentToken.refresh_token,
      expires_at: Date.now() + (response.expires_in * 1000),
      api_base_url_for_customer: response.api_base_url_for_customer || this.baseUrl,
      updated_at: new Date().toISOString()
    };

    this._saveToken(tenantId, tokenData);

    if (this.verbose) {
      console.error(`[gong-token] Refreshed token for tenant ${tenantId}`);
    }

    return tokenData;
  }

  _httpPost(url, body) {
    return new Promise((resolve, reject) => {
      const parsed = new URL(url);
      const req = https.request({
        hostname: parsed.hostname,
        path: parsed.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body)
        }
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(JSON.parse(data));
          } else {
            reject(new Error(`Token refresh failed (${res.statusCode}): ${data}`));
          }
        });
      });
      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }

  /**
   * Validate credentials by calling GET /v2/users?limit=1.
   * @returns {Promise<Object>} Validation result
   */
  async validateCredentials() {
    const headers = await this.getAuthHeaders();
    return new Promise((resolve, reject) => {
      const parsed = new URL(`${this.baseUrl}/v2/users`);
      const req = https.request({
        hostname: parsed.hostname,
        path: `${parsed.pathname}?limit=1`,
        method: 'GET',
        headers
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode === 200) {
            const body = JSON.parse(data);
            resolve({
              valid: true,
              message: 'Gong credentials are valid',
              userCount: (body.users || []).length,
              requestId: res.headers['request-id'] || null
            });
          } else if (res.statusCode === 401 || res.statusCode === 403) {
            resolve({
              valid: false,
              message: `Authentication failed (${res.statusCode}). Check your GONG_ACCESS_KEY_ID and GONG_ACCESS_KEY_SECRET.`,
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
      req.end();
    });
  }
}

// CLI usage
if (require.main === module) {
  const cmd = process.argv[2];
  const manager = new GongTokenManager({ verbose: true });

  if (cmd === 'validate' || cmd === 'test') {
    manager.validateCredentials().then(result => {
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.valid ? 0 : 1);
    });
  } else if (cmd === 'check') {
    try {
      manager._getBasicAuthHeaders();
      console.log('Gong credentials found in environment.');
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }
  } else {
    console.log('Usage: gong-token-manager.js [validate|check]');
    console.log('  validate  - Test credentials against Gong API');
    console.log('  check     - Verify env vars are set');
  }
}

module.exports = { GongTokenManager };
