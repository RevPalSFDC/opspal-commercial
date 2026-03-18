#!/usr/bin/env node
/**
 * HubSpot Batch Associations v4
 *
 * Purpose: v4 Associations API wrapper with batch operations
 * 100x faster than v3 sequential association creation
 *
 * CRITICAL: v4 API requires BOTH fields:
 * - associationCategory (e.g., 'HUBSPOT_DEFINED')
 * - associationTypeId (e.g., 1 for primary)
 *
 * Missing either field causes 400 Bad Request errors
 *
 * BEFORE: v3 sequential (1 API call per association)
 * AFTER: v4 batch (100 associations per call) + parallelization
 *
 * Expected Performance: 100x speedup on association-heavy operations
 *
 * Rate Limit Integration (v1.1.0):
 * - Uses HubSpotRequestThrottle for global request coordination
 * - Parses X-HubSpot-RateLimit-* headers for adaptive throttling
 * - Circuit breaker protection against 429 storms
 *
 * @version 1.1.0
 * @phase Bulk Operations Integration (Phase 2) + Rate Limit Integration
 */

const { getThrottle } = require('./hubspot-request-throttle');
const { parseRateLimitHeaders, formatForLog } = require('./hubspot-rate-limit-parser');

const HUBSPOT_API_BASE = 'https://api.hubapi.com';
const MAX_BATCH_SIZE = 100;  // HubSpot allows 100 associations per batch request
const MAX_CONCURRENT = 10;
const DEFAULT_RETRY_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY = 1000;
const LOCK_RETRY_DELAY = 2000; // Minimum 2s for 423 Locked
const MAX_LOCK_RETRIES = 3;

/**
 * Common association type IDs (HubSpot default)
 */
const ASSOCIATION_TYPES = {
  // Contact to Company
  CONTACT_TO_COMPANY_PRIMARY: { category: 'HUBSPOT_DEFINED', typeId: 1 },
  CONTACT_TO_COMPANY_UNLABELED: { category: 'HUBSPOT_DEFINED', typeId: 279 },

  // Company to Contact
  COMPANY_TO_CONTACT_PRIMARY: { category: 'HUBSPOT_DEFINED', typeId: 2 },
  COMPANY_TO_CONTACT_UNLABELED: { category: 'HUBSPOT_DEFINED', typeId: 280 },

  // Contact to Deal
  CONTACT_TO_DEAL: { category: 'HUBSPOT_DEFINED', typeId: 3 },
  DEAL_TO_CONTACT: { category: 'HUBSPOT_DEFINED', typeId: 4 },

  // Company to Deal
  COMPANY_TO_DEAL: { category: 'HUBSPOT_DEFINED', typeId: 5 },
  DEAL_TO_COMPANY: { category: 'HUBSPOT_DEFINED', typeId: 6 },

  // Deal to Line Item
  DEAL_TO_LINE_ITEM: { category: 'HUBSPOT_DEFINED', typeId: 19 },
  LINE_ITEM_TO_DEAL: { category: 'HUBSPOT_DEFINED', typeId: 20 }
};

/**
 * Batch Associations v4 Wrapper
 *
 * Usage:
 * const associator = new BatchAssociationsV4(accessToken);
 * await associator.batchCreateAssociations({
 *   fromObjectType: 'companies',
 *   toObjectType: 'contacts',
 *   associations: [...]
 * });
 */
class BatchAssociationsV4 {
  constructor(accessToken, options = {}) {
    if (!accessToken) {
      throw new Error('BatchAssociationsV4 requires accessToken');
    }

    this.accessToken = accessToken;
    this.batchSize = options.batchSize || MAX_BATCH_SIZE;
    this.maxConcurrent = options.maxConcurrent || MAX_CONCURRENT;
    this.retryAttempts = options.retryAttempts || DEFAULT_RETRY_ATTEMPTS;
    this.retryDelay = options.retryDelay || DEFAULT_RETRY_DELAY;
    this.verbose = options.verbose || false;

    // Initialize throttle for rate limit coordination
    this.useThrottle = options.useThrottle !== false; // Default: enabled
    this.tier = options.tier || process.env.HUBSPOT_TIER || 'starter';
    if (this.useThrottle) {
      this.throttle = getThrottle({ tier: this.tier, verbose: this.verbose });
    }

    this.stats = {
      totalAssociations: 0,
      successfulBatches: 0,
      failedBatches: 0,
      partialBatches: 0,
      totalApiCalls: 0,
      rateLimitHits: 0,
      lockHits: 0,
      startTime: null,
      endTime: null,
      lastCorrelationId: null
    };
  }

  /**
   * Batch create associations
   * @param {Object} config - Association configuration
   * @param {string} config.fromObjectType - Source object type (e.g., 'companies')
   * @param {string} config.toObjectType - Target object type (e.g., 'contacts')
   * @param {Array} config.associations - Array of associations:
   *   [{
   *     fromId: '123',
   *     toId: '456',
   *     associationTypeId: 1,
   *     associationCategory: 'HUBSPOT_DEFINED'
   *   }, ...]
   * @returns {Promise<Object>} Results with success/failure counts
   */
  async batchCreateAssociations(config) {
    this.stats.startTime = Date.now();
    const { fromObjectType, toObjectType, associations } = config;

    if (!fromObjectType || !toObjectType || !associations || associations.length === 0) {
      throw new Error('batchCreateAssociations requires fromObjectType, toObjectType, and associations array');
    }

    this.stats.totalAssociations = associations.length;

    // Validate all associations have required fields
    this.validateAssociations(associations);

    // Split into batches
    const batches = this.chunkArray(associations, this.batchSize);

    if (this.verbose) {
      console.log(`Batch Create Associations: ${associations.length} associations → ${batches.length} batches (${this.batchSize} per batch)`);
      console.log(`  From: ${fromObjectType} → To: ${toObjectType}`);
    }

    // Process batches in parallel (up to maxConcurrent)
    const results = [];
    for (let i = 0; i < batches.length; i += this.maxConcurrent) {
      const parallelBatches = batches.slice(i, i + this.maxConcurrent);

      const batchPromises = parallelBatches.map((batch, idx) =>
        this.createAssociationBatch(fromObjectType, toObjectType, batch, i + idx)
      );

      const batchResults = await Promise.allSettled(batchPromises);
      results.push(...batchResults);

      // Rate limit delay between parallel groups (adaptive via throttle)
      if (i + this.maxConcurrent < batches.length) {
        await this.delay(this.getAdaptiveDelay());
      }
    }

    this.stats.endTime = Date.now();
    return this.aggregateResults(results);
  }

  /**
   * Batch delete associations
   */
  async batchDeleteAssociations(config) {
    this.stats.startTime = Date.now();
    const { fromObjectType, toObjectType, associations } = config;

    if (!fromObjectType || !toObjectType || !associations || associations.length === 0) {
      throw new Error('batchDeleteAssociations requires fromObjectType, toObjectType, and associations array');
    }

    this.stats.totalAssociations = associations.length;
    this.validateAssociations(associations);

    const batches = this.chunkArray(associations, this.batchSize);

    if (this.verbose) {
      console.log(`Batch Delete Associations: ${associations.length} associations → ${batches.length} batches`);
    }

    const results = [];
    for (let i = 0; i < batches.length; i += this.maxConcurrent) {
      const parallelBatches = batches.slice(i, i + this.maxConcurrent);

      const batchPromises = parallelBatches.map((batch, idx) =>
        this.deleteAssociationBatch(fromObjectType, toObjectType, batch, i + idx)
      );

      const batchResults = await Promise.allSettled(batchPromises);
      results.push(...batchResults);

      if (i + this.maxConcurrent < batches.length) {
        await this.delay(this.getAdaptiveDelay());
      }
    }

    this.stats.endTime = Date.now();
    return this.aggregateResults(results);
  }

  /**
   * Create a single association batch via v4 API
   */
  async createAssociationBatch(fromObjectType, toObjectType, batch, batchIndex) {
    const url = `${HUBSPOT_API_BASE}/crm/v4/associations/${fromObjectType}/${toObjectType}/batch/create`;

    const payload = {
      inputs: batch.map(assoc => ({
        from: { id: String(assoc.fromId) },
        to: { id: String(assoc.toId) },
        types: [{
          associationCategory: assoc.associationCategory,
          associationTypeId: assoc.associationTypeId
        }]
      }))
    };

    return await this.makeRequest(url, payload, 'POST', batchIndex, 'create');
  }

  /**
   * Delete a single association batch via v4 API
   */
  async deleteAssociationBatch(fromObjectType, toObjectType, batch, batchIndex) {
    const url = `${HUBSPOT_API_BASE}/crm/v4/associations/${fromObjectType}/${toObjectType}/batch/archive`;

    const payload = {
      inputs: batch.map(assoc => ({
        from: { id: String(assoc.fromId) },
        to: { id: String(assoc.toId) },
        types: [{
          associationCategory: assoc.associationCategory,
          associationTypeId: assoc.associationTypeId
        }]
      }))
    };

    return await this.makeRequest(url, payload, 'POST', batchIndex, 'delete');
  }

  /**
   * Validate associations have required v4 fields
   */
  validateAssociations(associations) {
    const errors = [];

    associations.forEach((assoc, index) => {
      if (!assoc.fromId) {
        errors.push(`Association ${index}: Missing fromId`);
      }
      if (!assoc.toId) {
        errors.push(`Association ${index}: Missing toId`);
      }
      if (!assoc.associationCategory) {
        errors.push(`Association ${index}: Missing associationCategory (required for v4)`);
      }
      if (assoc.associationTypeId === undefined || assoc.associationTypeId === null) {
        errors.push(`Association ${index}: Missing associationTypeId (required for v4)`);
      }
    });

    if (errors.length > 0) {
      throw new Error(`Association validation failed:\n${errors.join('\n')}`);
    }
  }

  /**
   * H3: Choose between v3 and v4 association endpoints.
   * Default: v4. Exception: company-to-company may 405 on v4 batch → fall back to v3 PUT.
   *
   * @param {string} fromType
   * @param {string} toType
   * @param {boolean} needsLabels - If true, v4 is mandatory (v3 has no label support)
   * @returns {{ version: string, note: string }}
   */
  static chooseAssociationEndpoint(fromType, toType, needsLabels = false) {
    if (needsLabels) {
      return { version: 'v4', note: 'v4 required for labeled associations' };
    }
    // Company-to-company associations may return 405 on v4 batch endpoints
    if (fromType === 'companies' && toType === 'companies') {
      return { version: 'v3_fallback', note: 'Company-to-company may 405 on v4 batch; use v3 PUT as fallback' };
    }
    return { version: 'v4', note: 'Default: v4 batch associations' };
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
   * Make HTTP request with retry logic, rate limit integration,
   * 207 multi-status handling (C1), and 423 locked handling (H2)
   */
  async makeRequest(url, payload, method, batchIndex, operation) {
    let lastError;
    let lockRetries = 0;

    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        this.stats.totalApiCalls++;

        // Use throttle if enabled for coordinated rate limiting
        const requestFn = async () => {
          return await fetch(url, {
            method,
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
          const succeeded = result.results || [];
          const failed = result.errors || [];
          if (this.verbose) {
            console.log(`⚠ Batch ${batchIndex} (${operation}): 207 Multi-Status - ${succeeded.length} succeeded, ${failed.length} failed [correlationId: ${correlationId}]`);
          }
          return { status: 'partial', partial: true, succeeded, failed, data: result, batchIndex, correlationId };
        }

        if (!response.ok) {
          const errorBody = await response.text();

          // Handle 429 rate limit errors specifically
          if (response.status === 429) {
            this.stats.rateLimitHits++;
            const retryAfter = response.headers?.get('Retry-After') || 10;
            throw { status: 429, message: `Rate limited. Retry after ${retryAfter}s`, retryAfter, correlationId };
          }

          // H2: Handle 423 Locked
          if (response.status === 423) {
            this.stats.lockHits++;
            lockRetries++;
            if (lockRetries <= MAX_LOCK_RETRIES) {
              if (this.verbose) {
                console.log(`⚠ Batch ${batchIndex} (${operation}): 423 Locked, waiting ${LOCK_RETRY_DELAY}ms (retry ${lockRetries}/${MAX_LOCK_RETRIES}) [correlationId: ${correlationId}]`);
              }
              await this.delay(LOCK_RETRY_DELAY);
              continue;
            }
            throw new Error(`HTTP 423 Locked: Record still locked after ${MAX_LOCK_RETRIES} retries [correlationId: ${correlationId}]`);
          }

          throw new Error(`HTTP ${response.status}: ${errorBody} [correlationId: ${correlationId}]`);
        }

        const result = await response.json();

        if (this.verbose) {
          console.log(`✓ Batch ${batchIndex} (${operation}): ${payload.inputs.length} associations - Success [correlationId: ${correlationId}]`);
        }

        this.stats.successfulBatches++;
        return { status: 'success', data: result, batchIndex, correlationId };

      } catch (error) {
        lastError = error;

        // Special handling for rate limit errors
        if (error.status === 429) {
          const waitTime = (error.retryAfter || 10) * 1000;
          if (this.verbose) {
            console.log(`⚠ Batch ${batchIndex} (${operation}): Rate limited, waiting ${waitTime}ms [correlationId: ${error.correlationId}]`);
          }
          await this.delay(waitTime);
          continue; // Don't count against retry attempts
        }

        if (attempt < this.retryAttempts) {
          if (this.verbose) {
            console.log(`⚠ Batch ${batchIndex} (${operation}): Retry ${attempt}/${this.retryAttempts} - ${error.message}`);
          }
          await this.delay(this.retryDelay * attempt);
        }
      }
    }

    // All retries failed
    this.stats.failedBatches++;
    if (this.verbose) {
      console.error(`✗ Batch ${batchIndex} (${operation}): Failed after ${this.retryAttempts} attempts - ${lastError.message || lastError}`);
    }

    return { status: 'failed', error: lastError.message || String(lastError), batchIndex };
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
   * Aggregate batch results (C1: handles 207 partial results)
   */
  aggregateResults(results) {
    const summary = {
      success: 0,
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
          summary.success++;
          summary.results.push(value.data);
        } else if (value.status === 'partial') {
          summary.partial++;
          summary.results.push(value.data);
          if (value.failed && value.failed.length > 0) {
            summary.failedRecords.push(...value.failed);
          }
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

    return summary;
  }

  /**
   * Get performance statistics
   */
  getStats() {
    const duration = this.stats.endTime - this.stats.startTime;
    const associationsPerSecond = duration > 0 ? (this.stats.totalAssociations / (duration / 1000)).toFixed(2) : 0;

    const stats = {
      ...this.stats,
      duration: `${duration}ms`,
      associationsPerSecond,
      successRate: this.stats.successfulBatches > 0
        ? ((this.stats.successfulBatches / (this.stats.successfulBatches + this.stats.failedBatches)) * 100).toFixed(2) + '%'
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

  /**
   * Get association type by name (convenience method)
   */
  static getAssociationType(name) {
    return ASSOCIATION_TYPES[name] || null;
  }

  /**
   * List all available association types
   */
  static listAssociationTypes() {
    return Object.keys(ASSOCIATION_TYPES);
  }
}

module.exports = BatchAssociationsV4;
module.exports.ASSOCIATION_TYPES = ASSOCIATION_TYPES;

// CLI usage
if (require.main === module) {
  console.log('BatchAssociationsV4 - HubSpot v4 Associations Batch API');
  console.log('100x faster than v3 sequential association creation');
  console.log('');
  console.log('Usage: const associator = new BatchAssociationsV4(accessToken);');
  console.log('       await associator.batchCreateAssociations({ fromObjectType, toObjectType, associations });');
  console.log('');
  console.log('CRITICAL: v4 API requires BOTH fields:');
  console.log('  - associationCategory (e.g., "HUBSPOT_DEFINED")');
  console.log('  - associationTypeId (e.g., 1 for primary)');
  console.log('');
  console.log('Common Association Types:');
  Object.entries(ASSOCIATION_TYPES).forEach(([name, value]) => {
    console.log(`  - ${name}: { category: '${value.category}', typeId: ${value.typeId} }`);
  });
}
