#!/usr/bin/env node

/**
 * Gong API Client
 *
 * Production-quality HTTP client for Gong.io REST API v2.
 * Handles auth, rate limiting, retry with backoff, cursor-based pagination,
 * and method-aware cursor placement (query param for GET, body for POST).
 *
 * Usage:
 *   const { GongAPIClient } = require('./gong-api-client');
 *   const client = new GongAPIClient();
 *   const calls = await client.listCalls({ fromDateTime: '2026-01-01T00:00:00Z' });
 *
 * @module gong-api-client
 * @version 1.0.0
 */

const https = require('https');
const { URL } = require('url');
const { GongTokenManager } = require('./gong-token-manager');
const { getThrottle } = require('./gong-throttle');

// Default content selector for /v2/calls/extensive
const DEFAULT_CONTENT_SELECTOR = {
  exposedFields: {
    parties: true,
    content: {
      trackers: true,
      topics: true
    },
    interaction: {
      speakers: true
    }
  }
};

const MAX_RETRIES = 3;
const RETRY_BASE_MS = 1000;

class GongAPIClient {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || 'https://api.gong.io';
    this.verbose = options.verbose || false;
    this.tokenManager = options.tokenManager || new GongTokenManager({ baseUrl: this.baseUrl });
    this.throttle = options.throttle || getThrottle();

    this.stats = {
      requests: 0,
      errors: 0,
      retries: 0,
      rateLimited: 0
    };
  }

  /**
   * Make an authenticated, rate-limited, retry-aware API request.
   * @param {string} method - HTTP method
   * @param {string} endpoint - API endpoint path (e.g., /v2/calls)
   * @param {Object} [options] - Request options
   * @param {Object} [options.body] - Request body (for POST/PUT)
   * @param {Object} [options.params] - Query parameters
   * @returns {Promise<Object>} Parsed JSON response
   */
  async request(method, endpoint, options = {}) {
    const headers = await this.tokenManager.getAuthHeaders();
    const url = new URL(`${this.baseUrl}${endpoint}`);

    // Add query params
    if (options.params) {
      for (const [key, value] of Object.entries(options.params)) {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    const requestFn = () => this._doRequest(method, url, headers, options.body);

    // Rate limit via throttle
    return this.throttle.enqueue(() => this._withRetry(requestFn));
  }

  async _doRequest(method, url, headers, body) {
    this.stats.requests++;

    return new Promise((resolve, reject) => {
      const reqOptions = {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method,
        headers: { ...headers }
      };

      let bodyStr;
      if (body) {
        bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
        reqOptions.headers['Content-Length'] = Buffer.byteLength(bodyStr);
      }

      const req = https.request(reqOptions, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          const requestId = res.headers['request-id'];

          if (this.verbose) {
            console.error(`[gong-api] ${method} ${url.pathname} -> ${res.statusCode} (request-id: ${requestId || 'N/A'})`);
          }

          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              const parsed = JSON.parse(data);
              parsed._requestId = requestId;
              resolve(parsed);
            } catch {
              resolve({ _raw: data, _requestId: requestId });
            }
          } else if (res.statusCode === 429) {
            this.stats.rateLimited++;
            const retryAfter = parseInt(res.headers['retry-after'] || '5', 10);
            this.throttle.setRetryAfter(retryAfter);
            reject(Object.assign(new Error(`Rate limited (429). Retry after ${retryAfter}s`), {
              statusCode: 429,
              retryAfter,
              retryable: true
            }));
          } else if (res.statusCode >= 500) {
            reject(Object.assign(new Error(`Server error (${res.statusCode}): ${data}`), {
              statusCode: res.statusCode,
              retryable: true
            }));
          } else {
            reject(Object.assign(new Error(`Gong API error (${res.statusCode}): ${data}`), {
              statusCode: res.statusCode,
              retryable: false,
              requestId
            }));
          }
        });
      });

      req.on('error', err => {
        this.stats.errors++;
        reject(Object.assign(err, { retryable: true }));
      });

      if (bodyStr) req.write(bodyStr);
      req.end();
    });
  }

  async _withRetry(fn, attempt = 0) {
    try {
      return await fn();
    } catch (err) {
      if (!err.retryable || attempt >= MAX_RETRIES) {
        this.stats.errors++;
        throw err;
      }

      this.stats.retries++;
      const jitter = Math.random() * 500;
      const delay = err.retryAfter
        ? err.retryAfter * 1000
        : (RETRY_BASE_MS * Math.pow(2, attempt)) + jitter;

      if (this.verbose) {
        console.error(`[gong-api] Retry ${attempt + 1}/${MAX_RETRIES} in ${Math.round(delay)}ms`);
      }

      await new Promise(r => setTimeout(r, delay));
      return this._withRetry(fn, attempt + 1);
    }
  }

  // ──────────────────────────────────────────────
  // Calls endpoints
  // ──────────────────────────────────────────────

  /**
   * List calls with metadata (GET /v2/calls).
   * @param {Object} params - Query params
   * @param {string} [params.fromDateTime] - ISO 8601 start
   * @param {string} [params.toDateTime] - ISO 8601 end
   * @param {string} [params.cursor] - Pagination cursor
   * @returns {Promise<Object>} { calls[], records: { cursor, currentPageNumber, currentPageSize, totalRecords } }
   */
  async listCalls(params = {}) {
    return this.request('GET', '/v2/calls', { params });
  }

  /**
   * Get extensive call data (POST /v2/calls/extensive).
   * Includes parties, trackers, topics, interaction stats.
   * @param {Object} body - Request body
   * @param {Object} [body.filter] - Filter criteria
   * @param {string[]} [body.filter.callIds] - Specific call IDs
   * @param {string} [body.filter.fromDateTime] - ISO 8601 start
   * @param {string} [body.filter.toDateTime] - ISO 8601 end
   * @param {Object} [body.contentSelector] - Fields to include (defaults to full)
   * @param {string} [body.cursor] - Pagination cursor (placed in body for POST)
   * @returns {Promise<Object>} { calls[], records }
   */
  async getCallsExtensive(body = {}) {
    const requestBody = {
      ...body,
      contentSelector: body.contentSelector || DEFAULT_CONTENT_SELECTOR
    };
    return this.request('POST', '/v2/calls/extensive', { body: requestBody });
  }

  /**
   * Get call transcripts (POST /v2/calls/transcript).
   * @param {Object} body - Request body
   * @param {Object} body.filter - Filter
   * @param {string[]} body.filter.callIds - Call IDs to get transcripts for
   * @param {string} [body.cursor] - Pagination cursor
   * @returns {Promise<Object>} { callTranscripts[] }
   */
  async getTranscripts(body) {
    return this.request('POST', '/v2/calls/transcript', { body });
  }

  // ──────────────────────────────────────────────
  // Users endpoints
  // ──────────────────────────────────────────────

  /**
   * List Gong users (GET /v2/users).
   * @param {Object} [params] - Query params
   * @param {string} [params.cursor] - Pagination cursor
   * @returns {Promise<Object>} { users[] }
   */
  async listUsers(params = {}) {
    return this.request('GET', '/v2/users', { params });
  }

  // ──────────────────────────────────────────────
  // Trackers endpoints
  // ──────────────────────────────────────────────

  /**
   * List trackers (GET /v2/settings/trackers).
   * @param {Object} [params] - Query params
   * @param {string} [params.workspaceId] - Workspace filter
   * @returns {Promise<Object>} { trackers[] }
   */
  async listTrackers(params = {}) {
    return this.request('GET', '/v2/settings/trackers', { params });
  }

  // ──────────────────────────────────────────────
  // Pagination helpers
  // ──────────────────────────────────────────────

  /**
   * Auto-paginate a GET endpoint. Collects all pages.
   * @param {string} endpoint - GET endpoint
   * @param {Object} params - Initial query params
   * @param {string} dataKey - Key in response containing array items
   * @param {number} [maxPages=50] - Safety limit
   * @returns {Promise<Array>} All items across pages
   */
  async paginateGet(endpoint, params, dataKey, maxPages = 50) {
    const allItems = [];
    let cursor = null;
    let page = 0;

    do {
      const p = { ...params };
      if (cursor) p.cursor = cursor;

      const response = await this.request('GET', endpoint, { params: p });
      const items = response[dataKey] || [];
      allItems.push(...items);

      cursor = response.records?.cursor || null;
      page++;
    } while (cursor && page < maxPages);

    return allItems;
  }

  /**
   * Auto-paginate a POST endpoint. Cursor goes in request body.
   * @param {string} endpoint - POST endpoint
   * @param {Object} body - Initial request body
   * @param {string} dataKey - Key in response containing array items
   * @param {number} [maxPages=50] - Safety limit
   * @returns {Promise<Array>} All items across pages
   */
  async paginatePost(endpoint, body, dataKey, maxPages = 50) {
    const allItems = [];
    let cursor = null;
    let page = 0;

    do {
      const b = { ...body };
      if (cursor) b.cursor = cursor;

      const response = await this.request('POST', endpoint, { body: b });
      const items = response[dataKey] || [];
      allItems.push(...items);

      cursor = response.records?.cursor || null;
      page++;
    } while (cursor && page < maxPages);

    return allItems;
  }

  /**
   * Get all calls for a date range with full extensive data.
   * Auto-paginates POST /v2/calls/extensive.
   * @param {string} fromDateTime - ISO 8601
   * @param {string} toDateTime - ISO 8601
   * @param {Object} [contentSelector] - Override content selector
   * @returns {Promise<Array>} All call objects
   */
  async getAllCallsExtensive(fromDateTime, toDateTime, contentSelector) {
    return this.paginatePost('/v2/calls/extensive', {
      filter: { fromDateTime, toDateTime },
      contentSelector: contentSelector || DEFAULT_CONTENT_SELECTOR
    }, 'calls');
  }

  /**
   * Get stats.
   * @returns {Object} Request statistics
   */
  getStats() {
    return { ...this.stats };
  }
}

// CLI usage
if (require.main === module) {
  const cmd = process.argv[2];
  const client = new GongAPIClient({ verbose: true });

  if (cmd === 'test' || cmd === 'validate') {
    client.tokenManager.validateCredentials().then(result => {
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.valid ? 0 : 1);
    });
  } else if (cmd === 'stats') {
    console.log(JSON.stringify(client.getStats(), null, 2));
  } else {
    console.log('Usage: gong-api-client.js [test|stats]');
    console.log('  test   - Validate API credentials');
    console.log('  stats  - Show request statistics');
  }
}

module.exports = { GongAPIClient, DEFAULT_CONTENT_SELECTOR };
