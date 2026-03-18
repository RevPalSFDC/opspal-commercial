#!/usr/bin/env node

/**
 * Fireflies.ai API Client
 *
 * Production-quality GraphQL client for the Fireflies.ai API.
 * Handles auth, rate limiting, retry with exponential backoff + jitter,
 * offset-based pagination (skip/limit, max 50/page), and date-windowed
 * pagination for large date ranges.
 *
 * Usage:
 *   const { FirefliesAPIClient } = require('./fireflies-api-client');
 *   const client = new FirefliesAPIClient();
 *   const transcripts = await client.getTranscripts({ limit: 10 });
 *
 * @module fireflies-api-client
 * @version 1.0.0
 */

const https = require('https');
const { URL } = require('url');
const { FirefliesTokenManager } = require('./fireflies-token-manager');
const { getThrottle } = require('./fireflies-throttle');

const GRAPHQL_ENDPOINT = 'https://api.fireflies.ai/graphql';
const PAGE_SIZE = 50; // Fireflies max per page
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 1000;

// Error codes that should never be retried
const NON_RETRYABLE_CODES = new Set([
  'paid_required',
  'invalid_arguments',
  'forbidden',
  'object_not_found'
]);

class FirefliesAPIClient {
  constructor(options = {}) {
    this.endpoint = options.endpoint || GRAPHQL_ENDPOINT;
    this.verbose = options.verbose || false;
    this.tokenManager = options.tokenManager || new FirefliesTokenManager();
    this.throttle = options.throttle || getThrottle();

    this.stats = {
      requests: 0,
      errors: 0,
      retries: 0,
      rateLimited: 0
    };
  }

  // ── Core request machinery ────────────────────────────────────────────────

  /**
   * Execute an authenticated, rate-limited, retry-aware GraphQL request.
   * @param {string} query - GraphQL query string
   * @param {Object} [variables] - GraphQL variables
   * @param {string} [tenantId] - Optional tenant override
   * @returns {Promise<Object>} Parsed `data` field from GraphQL response
   */
  async query(query, variables = {}, tenantId) {
    const headers = await this.tokenManager.getAuthHeaders(tenantId);
    const requestFn = () => this._doRequest(query, variables, headers);
    return this.throttle.enqueue(() => this._withRetry(requestFn));
  }

  async _doRequest(query, variables, headers) {
    this.stats.requests++;

    const body = JSON.stringify({ query, variables });

    return new Promise((resolve, reject) => {
      const parsed = new URL(this.endpoint);
      const reqOptions = {
        hostname: parsed.hostname,
        path: parsed.pathname,
        method: 'POST',
        headers: {
          ...headers,
          'Content-Length': Buffer.byteLength(body)
        }
      };

      const req = https.request(reqOptions, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (this.verbose) {
            console.error(`[fireflies-api] POST /graphql -> HTTP ${res.statusCode}`);
          }

          // Fireflies always returns 200 for GraphQL; errors are in body
          if (res.statusCode === 200) {
            let parsed;
            try {
              parsed = JSON.parse(data);
            } catch {
              reject(Object.assign(new Error(`Invalid JSON from Fireflies API: ${data}`), {
                retryable: false
              }));
              return;
            }

            if (parsed.errors && parsed.errors.length > 0) {
              const gqlErr = parsed.errors[0];
              reject(this._buildGraphQLError(gqlErr));
            } else {
              resolve(parsed.data);
            }
          } else if (res.statusCode === 429) {
            this.stats.rateLimited++;
            const retryAfter = parseInt(res.headers['retry-after'] || '60', 10);
            this.throttle.setRetryAfter(retryAfter);
            reject(Object.assign(
              new Error(`Rate limited (429). Retry after ${retryAfter}s`),
              { statusCode: 429, retryAfter, retryable: true }
            ));
          } else if (res.statusCode === 401 || res.statusCode === 403) {
            reject(Object.assign(
              new Error(`Fireflies authentication failed (${res.statusCode}). Check FIREFLIES_API_KEY.`),
              { statusCode: res.statusCode, retryable: false }
            ));
          } else if (res.statusCode >= 500) {
            reject(Object.assign(
              new Error(`Fireflies server error (${res.statusCode}): ${data}`),
              { statusCode: res.statusCode, retryable: true }
            ));
          } else {
            reject(Object.assign(
              new Error(`Fireflies API error (${res.statusCode}): ${data}`),
              { statusCode: res.statusCode, retryable: false }
            ));
          }
        });
      });

      req.on('error', err => {
        this.stats.errors++;
        reject(Object.assign(err, { retryable: true }));
      });

      req.write(body);
      req.end();
    });
  }

  /**
   * Build a structured error from a GraphQL error object.
   * @param {Object} gqlErr - Element from response.errors[]
   * @returns {Error}
   */
  _buildGraphQLError(gqlErr) {
    const code = gqlErr.extensions?.code || gqlErr.code || 'unknown';
    const status = gqlErr.extensions?.status || null;
    const friendlyMsg = gqlErr.friendly || gqlErr.message;
    const isRetryable = code === 'too_many_requests' || (!NON_RETRYABLE_CODES.has(code) && (status === null || status >= 500));

    const err = new Error(`Fireflies GraphQL error [${code}]: ${friendlyMsg}`);

    err.code = code;
    err.status = status;
    err.retryable = isRetryable;
    err.graphqlError = gqlErr;

    // Extract retryAfter hint if provided by API
    if (code === 'too_many_requests') {
      const retryAfterSec = gqlErr.extensions?.retryAfter || 60;
      err.retryAfter = retryAfterSec;
      this.throttle.setRetryAfter(retryAfterSec);
      this.stats.rateLimited++;
    }

    return err;
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
        console.error(`[fireflies-api] Retry ${attempt + 1}/${MAX_RETRIES} in ${Math.round(delay)}ms (${err.code || err.message})`);
      }

      await new Promise(r => setTimeout(r, delay));
      return this._withRetry(fn, attempt + 1);
    }
  }

  // ── Pagination helpers ────────────────────────────────────────────────────

  /**
   * Paginate a GraphQL query using offset-based skip/limit with optional
   * date-windowing for large date ranges.
   *
   * The query MUST accept `$skip: Int` and `$limit: Int` variables.
   * If `fromDate`/`toDate` variables are provided in the initial `variables`
   * object, date-windowing is enabled: the helper iterates over 30-day
   * windows, paginating within each window, until `toDate` is reached.
   *
   * @param {string} query - GraphQL query string (must use $skip/$limit vars)
   * @param {Object} variables - Initial variables (may include fromDate/toDate)
   * @param {string} dataPath - Dot-separated path into data to extract array
   *   e.g. "transcripts" or "user.transcripts"
   * @param {Object} [options] - Pagination options
   * @param {number} [options.pageSize] - Items per page (default 50, max 50)
   * @param {number} [options.maxPages] - Safety page limit per window (default 200)
   * @param {number} [options.windowDays] - Date window size in days (default 30)
   * @param {string} [options.tenantId] - Tenant override
   * @returns {Promise<Array>} All results concatenated
   */
  async paginateQuery(query, variables, dataPath, options = {}) {
    const pageSize = Math.min(options.pageSize || PAGE_SIZE, PAGE_SIZE);
    const maxPages = options.maxPages || 200;
    const windowDays = options.windowDays || 30;
    const tenantId = options.tenantId;

    const hasDateWindow = variables.fromDate && variables.toDate;

    if (hasDateWindow) {
      return this._paginateWithDateWindows(query, variables, dataPath, {
        pageSize, maxPages, windowDays, tenantId
      });
    }

    return this._paginateOffsets(query, variables, dataPath, {
      pageSize, maxPages, tenantId
    });
  }

  /**
   * Paginate within a single date range using skip/limit.
   * @private
   */
  async _paginateOffsets(query, variables, dataPath, options) {
    const { pageSize, maxPages, tenantId } = options;
    const allItems = [];
    let skip = 0;
    let page = 0;

    do {
      const vars = { ...variables, skip, limit: pageSize };
      const data = await this.query(query, vars, tenantId);
      const items = this._extractPath(data, dataPath);

      allItems.push(...items);

      if (items.length < pageSize) break; // last page
      skip += pageSize;
      page++;
    } while (page < maxPages);

    return allItems;
  }

  /**
   * Iterate over 30-day date windows, paginating within each window.
   * Prevents hitting per-page limits on large date ranges.
   * @private
   */
  async _paginateWithDateWindows(query, variables, dataPath, options) {
    const { pageSize, maxPages, windowDays, tenantId } = options;
    const allItems = [];

    let windowStart = new Date(variables.fromDate);
    const rangeEnd = new Date(variables.toDate);

    while (windowStart < rangeEnd) {
      const windowEnd = new Date(windowStart);
      windowEnd.setDate(windowEnd.getDate() + windowDays);
      if (windowEnd > rangeEnd) windowEnd.setTime(rangeEnd.getTime());

      const windowVars = {
        ...variables,
        fromDate: windowStart.toISOString(),
        toDate: windowEnd.toISOString()
      };

      const windowItems = await this._paginateOffsets(query, windowVars, dataPath, {
        pageSize, maxPages, tenantId
      });
      allItems.push(...windowItems);

      if (this.verbose) {
        console.error(
          `[fireflies-api] Window ${windowStart.toISOString().slice(0, 10)} → ` +
          `${windowEnd.toISOString().slice(0, 10)}: ${windowItems.length} items`
        );
      }

      windowStart = new Date(windowEnd);
      windowStart.setSeconds(windowStart.getSeconds() + 1); // avoid overlap
    }

    return allItems;
  }

  /**
   * Extract a value at a dot-separated path from an object.
   * Returns [] if path is missing or result is not an array.
   * @param {Object} obj
   * @param {string} dotPath - e.g. "transcripts" or "user.transcripts"
   * @returns {Array}
   */
  _extractPath(obj, dotPath) {
    if (!obj) return [];
    const parts = dotPath.split('.');
    let current = obj;
    for (const part of parts) {
      if (current == null || typeof current !== 'object') return [];
      current = current[part];
    }
    return Array.isArray(current) ? current : [];
  }

  // ── Transcripts ───────────────────────────────────────────────────────────

  /**
   * Fetch a page of transcripts.
   * @param {Object} [variables] - Query variables
   * @param {number} [variables.skip] - Offset (default 0)
   * @param {number} [variables.limit] - Page size (default 10, max 50)
   * @param {string} [variables.fromDate] - ISO 8601 start date
   * @param {string} [variables.toDate] - ISO 8601 end date
   * @returns {Promise<Array>} Array of transcript objects
   */
  async getTranscripts(variables = {}) {
    const gql = `
      query GetTranscripts($skip: Int, $limit: Int, $fromDate: String, $toDate: String) {
        transcripts(skip: $skip, limit: $limit, fromDate: $fromDate, toDate: $toDate) {
          id
          title
          date
          duration
          organizer_email
          transcript_url
          meeting_attendees {
            displayName
            email
          }
        }
      }
    `;
    const data = await this.query(gql, {
      skip: variables.skip || 0,
      limit: Math.min(variables.limit || 10, PAGE_SIZE),
      fromDate: variables.fromDate || null,
      toDate: variables.toDate || null
    });
    return data?.transcripts || [];
  }

  /**
   * Fetch all transcripts in a date range, auto-paginating.
   * @param {string} fromDate - ISO 8601 start
   * @param {string} toDate - ISO 8601 end
   * @param {Object} [options] - Pagination options (pageSize, windowDays)
   * @returns {Promise<Array>} All transcript objects
   */
  async getAllTranscripts(fromDate, toDate, options = {}) {
    const gql = `
      query GetTranscripts($skip: Int, $limit: Int, $fromDate: String, $toDate: String) {
        transcripts(skip: $skip, limit: $limit, fromDate: $fromDate, toDate: $toDate) {
          id
          title
          date
          duration
          organizer_email
          transcript_url
          meeting_attendees {
            displayName
            email
          }
        }
      }
    `;
    return this.paginateQuery(gql, { fromDate, toDate }, 'transcripts', options);
  }

  // ── Transcript detail ─────────────────────────────────────────────────────

  /**
   * Fetch full transcript detail by ID, including sentences.
   * @param {string} transcriptId - Fireflies transcript ID
   * @returns {Promise<Object>} Full transcript object
   */
  async getTranscriptById(transcriptId) {
    const gql = `
      query GetTranscript($id: String!) {
        transcript(id: $id) {
          id
          title
          date
          duration
          organizer_email
          transcript_url
          meeting_attendees {
            displayName
            email
          }
          sentences {
            index
            speaker_name
            speaker_id
            text
            start_time
            end_time
          }
          summary {
            gist
            bullet_gist
            keywords
            action_items
            outline
            overview
          }
        }
      }
    `;
    const data = await this.query(gql, { id: transcriptId });
    return data?.transcript || null;
  }

  // ── Users ─────────────────────────────────────────────────────────────────

  /**
   * Get current user info (validates credentials, returns email/name).
   * @returns {Promise<Object>} User object
   */
  async getUser() {
    const gql = `
      {
        user {
          email
          name
          num_transcripts
        }
      }
    `;
    const data = await this.query(gql);
    return data?.user || null;
  }

  // ── Stats ─────────────────────────────────────────────────────────────────

  /**
   * Get request statistics.
   * @returns {Object} Stats object
   */
  getStats() {
    return { ...this.stats };
  }
}

// ── CLI usage ─────────────────────────────────────────────────────────────

if (require.main === module) {
  const cmd = process.argv[2];
  const client = new FirefliesAPIClient({ verbose: true });

  if (cmd === 'test' || cmd === 'validate') {
    client.tokenManager.validateCredentials().then(result => {
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.valid ? 0 : 1);
    });
  } else if (cmd === 'user') {
    client.getUser().then(user => {
      console.log(JSON.stringify(user, null, 2));
    }).catch(err => {
      console.error(err.message);
      process.exit(1);
    });
  } else if (cmd === 'stats') {
    console.log(JSON.stringify(client.getStats(), null, 2));
  } else if (cmd === 'throttle') {
    console.log(JSON.stringify(client.throttle.getStatus(), null, 2));
  } else {
    console.log('Usage: fireflies-api-client.js [test|user|stats|throttle]');
    console.log('  test     - Validate API credentials');
    console.log('  user     - Fetch current user info');
    console.log('  stats    - Show request statistics');
    console.log('  throttle - Show rate limit status');
  }
}

module.exports = { FirefliesAPIClient, PAGE_SIZE, NON_RETRYABLE_CODES };
