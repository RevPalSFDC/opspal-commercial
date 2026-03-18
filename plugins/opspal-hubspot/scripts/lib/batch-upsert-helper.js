#!/usr/bin/env node
/**
 * HubSpot Batch Upsert Helper
 *
 * Purpose: Simplified API for batch upsert (create or update) operations
 * Wraps batch-update-wrapper with automatic create/update detection
 *
 * UPSERT = Create if doesn't exist, Update if exists
 *
 * BEFORE: Check existence → create OR update (2N API calls)
 * AFTER: Batch upsert API (N/100 API calls)
 *
 * Expected Performance: 10-20x speedup on upsert operations
 *
 * Rate Limit Integration (v1.1.0):
 * - Uses HubSpotRequestThrottle for global request coordination
 * - Parses X-HubSpot-RateLimit-* headers for adaptive throttling
 * - Circuit breaker protection against 429 storms
 *
 * @version 1.1.0
 * @phase Bulk Operations Integration (Phase 2) + Rate Limit Integration
 */

const { randomUUID } = require('crypto');
const { getThrottle } = require('./hubspot-request-throttle');
const { parseRateLimitHeaders, formatForLog } = require('./hubspot-rate-limit-parser');

const HUBSPOT_API_BASE = 'https://api.hubapi.com';
const MAX_BATCH_SIZE = 100;
const MAX_CONCURRENT = 10;
const LOCK_RETRY_DELAY = 2000; // Minimum 2s wait for 423 Locked
const MAX_LOCK_RETRIES = 3;

/**
 * Batch Upsert Helper
 *
 * Usage:
 * const upsert = new BatchUpsertHelper(accessToken);
 * await upsert.upsertRecords('contacts', records, 'email');
 */
class BatchUpsertHelper {
  constructor(accessToken, options = {}) {
    if (!accessToken) {
      throw new Error('BatchUpsertHelper requires accessToken');
    }

    this.accessToken = accessToken;
    this.batchSize = options.batchSize || MAX_BATCH_SIZE;
    this.maxConcurrent = options.maxConcurrent || MAX_CONCURRENT;
    this.verbose = options.verbose || false;

    // Initialize throttle for rate limit coordination
    this.useThrottle = options.useThrottle !== false; // Default: enabled
    this.tier = options.tier || process.env.HUBSPOT_TIER || 'starter';
    if (this.useThrottle) {
      this.throttle = getThrottle({ tier: this.tier, verbose: this.verbose });
    }

    this.stats = {
      totalRecords: 0,
      created: 0,
      updated: 0,
      failed: 0,
      partialBatches: 0,
      rateLimitHits: 0,
      lockHits: 0,
      startTime: null,
      endTime: null,
      lastCorrelationId: null
    };
  }

  /**
   * Upsert records (create or update)
   * @param {string} objectType - HubSpot object type
   * @param {Array} records - Records to upsert
   * @param {string} uniqueProperty - Property to use for uniqueness (e.g., 'email', 'domain')
   * @param {Object} options - Optional config
   * @returns {Promise<Object>} Results with created/updated counts
   */
  async upsertRecords(objectType, records, uniqueProperty, options = {}) {
    this.stats.startTime = Date.now();
    this.stats.totalRecords = records.length;

    if (!records || records.length === 0) {
      return { created: 0, updated: 0, failed: 0, results: [] };
    }

    if (!uniqueProperty) {
      throw new Error('upsertRecords requires uniqueProperty for identifying existing records');
    }

    if (this.verbose) {
      console.log(`Batch Upsert: ${records.length} ${objectType} records via ${uniqueProperty}`);
    }

    // Use HubSpot's native batch upsert endpoint
    const results = await this.batchUpsert(objectType, records, uniqueProperty, options);

    this.stats.endTime = Date.now();
    return results;
  }

  /**
   * Execute batch upsert via HubSpot batch/upsert endpoint
   */
  async batchUpsert(objectType, records, uniqueProperty, options = {}) {
    const url = `${HUBSPOT_API_BASE}/crm/v3/objects/${objectType}/batch/upsert`;

    const batches = this.chunkArray(records, this.batchSize);

    if (this.verbose) {
      console.log(`  Using batch/upsert endpoint: ${batches.length} batches`);
    }

    const results = [];

    for (let i = 0; i < batches.length; i += this.maxConcurrent) {
      const parallelBatches = batches.slice(i, i + this.maxConcurrent);

      const batchPromises = parallelBatches.map((batch, idx) => {
        const payload = {
          inputs: batch.map(record => {
            const input = {
              properties: record.properties || record,
              // C2: Inject objectWriteTraceId for per-record traceability
              objectWriteTraceId: record.objectWriteTraceId || randomUUID()
            };

            // Include unique property for matching
            if (record.id) {
              input.id = record.id;
            } else if (record.properties && record.properties[uniqueProperty]) {
              input.idProperty = uniqueProperty;
            } else if (record[uniqueProperty]) {
              input.idProperty = uniqueProperty;
            }

            return input;
          })
        };

        return this.makeUpsertRequest(url, payload, i + idx);
      });

      const batchResults = await Promise.allSettled(batchPromises);
      results.push(...batchResults);

      // Rate limit delay (adaptive via throttle)
      if (i + this.maxConcurrent < batches.length) {
        await this.delay(this.getAdaptiveDelay());
      }
    }

    return this.aggregateResults(results);
  }

  /**
   * Extract correlation ID from response headers (H1)
   */
  extractCorrelationId(response) {
    const correlationId = response.headers?.get('x-hubspot-correlation-id')
      || response.headers?.get('x-request-id');
    if (correlationId) {
      this.stats.lastCorrelationId = correlationId;
    }
    return correlationId;
  }

  /**
   * Make upsert request to HubSpot with rate limit integration,
   * 207 multi-status handling (C1), and 423 locked handling (H2)
   */
  async makeUpsertRequest(url, payload, batchIndex, _lockRetry = 0, _rateLimitRetry = 0) {
    try {
      // Use throttle if enabled for coordinated rate limiting
      const requestFn = async () => {
        return await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });
      };

      const response = this.useThrottle
        ? await this.throttle.enqueue(requestFn)
        : await requestFn();

      // H1: Extract correlation ID from every response
      const correlationId = this.extractCorrelationId(response);

      // Parse rate limit headers for adaptive behavior
      if (response.headers) {
        this.lastRateLimitInfo = parseRateLimitHeaders(response);
        if (this.verbose && this.lastRateLimitInfo.windowRemaining !== null) {
          console.log(`  Rate limit: ${formatForLog(this.lastRateLimitInfo)}`);
        }
      }

      // C1: Handle 207 Multi-Status (partial success)
      if (response.status === 207) {
        const result = await response.json();
        this.stats.partialBatches++;
        return this.parseMultiStatusUpsertResponse(result, batchIndex, correlationId);
      }

      if (!response.ok) {
        const errorBody = await response.text();

        // Handle 429 rate limit errors specifically
        if (response.status === 429) {
          this.stats.rateLimitHits++;
          const retryAfter = response.headers?.get('Retry-After') || 10;
          throw { status: 429, message: `Rate limited. Retry after ${retryAfter}s`, retryAfter, correlationId };
        }

        // H2: Handle 423 Locked (concurrent record lock)
        if (response.status === 423) {
          this.stats.lockHits++;
          if (_lockRetry < MAX_LOCK_RETRIES) {
            if (this.verbose) {
              console.log(`⚠ Batch ${batchIndex}: 423 Locked, waiting ${LOCK_RETRY_DELAY}ms (retry ${_lockRetry + 1}/${MAX_LOCK_RETRIES}) [correlationId: ${correlationId}]`);
            }
            await this.delay(LOCK_RETRY_DELAY);
            return this.makeUpsertRequest(url, payload, batchIndex, _lockRetry + 1);
          }
          throw new Error(`HTTP 423 Locked: Record still locked after ${MAX_LOCK_RETRIES} retries [correlationId: ${correlationId}]`);
        }

        throw new Error(`HTTP ${response.status}: ${errorBody} [correlationId: ${correlationId}]`);
      }

      const result = await response.json();

      if (this.verbose) {
        console.log(`✓ Batch ${batchIndex}: ${payload.inputs.length} records upserted [correlationId: ${correlationId}]`);
      }

      return {
        status: 'success',
        data: result,
        batchIndex,
        correlationId
      };

    } catch (error) {
      // Special handling for rate limit errors - retry with bounded counter
      if (error.status === 429) {
        const nextRateLimitRetry = _rateLimitRetry + 1;
        const MAX_RATE_LIMIT_RETRIES = 5;
        if (nextRateLimitRetry > MAX_RATE_LIMIT_RETRIES) {
          if (this.verbose) {
            console.error(`✗ Batch ${batchIndex}: Rate limit retries exhausted (${MAX_RATE_LIMIT_RETRIES})`);
          }
          return {
            status: 'failed',
            error: `Rate limit retries exhausted after ${MAX_RATE_LIMIT_RETRIES} attempts`,
            batchIndex
          };
        }
        const waitTime = (error.retryAfter || 10) * 1000;
        if (this.verbose) {
          console.log(`⚠ Batch ${batchIndex}: Rate limited (attempt ${nextRateLimitRetry}/${MAX_RATE_LIMIT_RETRIES}), waiting ${waitTime}ms [correlationId: ${error.correlationId}]`);
        }
        await this.delay(waitTime);
        return this.makeUpsertRequest(url, payload, batchIndex, _lockRetry, nextRateLimitRetry);
      }

      if (this.verbose) {
        console.error(`✗ Batch ${batchIndex}: ${error.message || error}`);
      }

      return {
        status: 'failed',
        error: error.message || String(error),
        batchIndex
      };
    }
  }

  /**
   * C1: Parse 207 Multi-Status response for upsert operations.
   */
  parseMultiStatusUpsertResponse(result, batchIndex, correlationId) {
    const succeeded = [];
    const failed = [];

    for (const record of (result.results || [])) {
      succeeded.push({
        id: record.id,
        objectWriteTraceId: record.objectWriteTraceId,
        status: record.new === true ? 'CREATED' : (record.status || 'UPDATED'),
        properties: record.properties
      });
    }

    for (const error of (result.errors || [])) {
      failed.push({
        objectWriteTraceId: error.objectWriteTraceId,
        status: error.status || 'ERROR',
        category: error.category,
        message: error.message,
        context: error.context
      });
    }

    if (this.verbose) {
      console.log(`⚠ Batch ${batchIndex}: 207 Multi-Status - ${succeeded.length} succeeded, ${failed.length} failed [correlationId: ${correlationId}]`);
    }

    return {
      status: 'partial',
      partial: true,
      succeeded,
      failed,
      data: result,
      batchIndex,
      correlationId
    };
  }

  /**
   * Get adaptive delay based on rate limit status
   */
  getAdaptiveDelay() {
    if (this.lastRateLimitInfo && this.lastRateLimitInfo.recommendedDelay > 0) {
      return this.lastRateLimitInfo.recommendedDelay;
    }
    // Default minimum delay
    return 100;
  }

  /**
   * Aggregate results and count created vs updated (C1: handles 207 partial)
   */
  aggregateResults(results) {
    const summary = {
      created: 0,
      updated: 0,
      failed: 0,
      partial: 0,
      results: [],
      failedRecords: [],
      stats: this.getStats()
    };

    results.forEach(result => {
      if (result.status === 'fulfilled') {
        const value = result.value;

        if (value.status === 'success') {
          const data = value.data;
          if (data.results) {
            data.results.forEach(record => {
              if (record.new === true || record.status === 'CREATED') {
                summary.created++;
              } else if (record.status === 'UPDATED' || record.status === 'SUCCESS') {
                summary.updated++;
              }
            });
          }
          summary.results.push(data);

        } else if (value.status === 'partial') {
          // C1: 207 Multi-Status
          summary.partial++;
          for (const s of (value.succeeded || [])) {
            if (s.status === 'CREATED') summary.created++;
            else summary.updated++;
          }
          summary.failedRecords.push(...(value.failed || []));
          summary.results.push(value.data);

        } else {
          summary.failed++;
          summary.results.push({
            error: value.error || 'Unknown error',
            batchIndex: value.batchIndex
          });
        }
      } else {
        summary.failed++;
        summary.results.push({
          error: result.reason || 'Unknown error'
        });
      }
    });

    this.stats.created = summary.created;
    this.stats.updated = summary.updated;
    this.stats.failed = summary.failed;

    return summary;
  }

  /**
   * Get performance statistics
   */
  getStats() {
    const duration = this.stats.endTime - this.stats.startTime;
    const recordsPerSecond = duration > 0 ? (this.stats.totalRecords / (duration / 1000)).toFixed(2) : 0;

    const stats = {
      ...this.stats,
      duration: `${duration}ms`,
      recordsPerSecond,
      successRate: this.stats.totalRecords > 0
        ? (((this.stats.created + this.stats.updated) / this.stats.totalRecords) * 100).toFixed(2) + '%'
        : '0%'
    };

    // Include throttle stats if available
    if (this.useThrottle && this.throttle) {
      stats.throttleStatus = this.throttle.getStatus();
    }

    // Include last rate limit info
    if (this.lastRateLimitInfo) {
      stats.lastRateLimitInfo = this.lastRateLimitInfo;
    }

    return stats;
  }

  /**
   * Utility: Chunk array into batches
   */
  chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Utility: Delay for rate limiting
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = BatchUpsertHelper;

// CLI usage
if (require.main === module) {
  console.log('BatchUpsertHelper - Simplified Batch Upsert Operations');
  console.log('Create or Update in a single operation');
  console.log('');
  console.log('Usage: const upsert = new BatchUpsertHelper(accessToken);');
  console.log('       await upsert.upsertRecords(objectType, records, uniqueProperty);');
  console.log('');
  console.log('Example:');
  console.log('  await upsert.upsertRecords("contacts", contacts, "email");');
  console.log('  // Creates new contacts or updates existing by email');
  console.log('');
  console.log('Common Unique Properties:');
  console.log('  - contacts: email');
  console.log('  - companies: domain');
  console.log('  - deals: dealname (or custom unique field)');
}
