#!/usr/bin/env node
/**
 * HubSpot Batch Update Wrapper
 *
 * Purpose: Generic batch CRUD operations for HubSpot API with parallelization
 * Eliminates sequential bias and N+1 patterns
 *
 * BEFORE: Sequential loops (1 API call per record)
 * AFTER: Batch operations (100 records per call) + parallelization (10 concurrent)
 *
 * Expected Performance: 10-100x speedup on bulk operations
 *
 * @version 1.0.0
 * @phase Bulk Operations Integration (Phase 2)
 */

const HUBSPOT_API_BASE = 'https://api.hubapi.com';
const MAX_BATCH_SIZE = 100;  // HubSpot allows 100 objects per batch request
const MAX_CONCURRENT = 10;   // Max parallel requests (within rate limits)
const RATE_LIMIT_DELAY = 100; // ms delay between batches
const DEFAULT_RETRY_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY = 1000;

/**
 * Batch Update Wrapper for HubSpot API
 *
 * Usage:
 * const updater = new BatchUpdateWrapper(accessToken);
 * await updater.batchUpdate('contacts', records, { batchSize: 100, maxConcurrent: 10 });
 */
class BatchUpdateWrapper {
  constructor(accessToken, options = {}) {
    if (!accessToken) {
      throw new Error('BatchUpdateWrapper requires accessToken');
    }

    this.accessToken = accessToken;
    this.batchSize = options.batchSize || MAX_BATCH_SIZE;
    this.maxConcurrent = options.maxConcurrent || MAX_CONCURRENT;
    this.retryAttempts = options.retryAttempts || DEFAULT_RETRY_ATTEMPTS;
    this.retryDelay = options.retryDelay || DEFAULT_RETRY_DELAY;
    this.verbose = options.verbose || false;

    this.stats = {
      totalRecords: 0,
      successfulBatches: 0,
      failedBatches: 0,
      totalApiCalls: 0,
      startTime: null,
      endTime: null
    };
  }

  /**
   * Batch update records
   * @param {string} objectType - HubSpot object type (contacts, companies, deals, etc.)
   * @param {Array} records - Array of records to update [{id, properties}, ...]
   * @param {Object} options - Optional config (batchSize, maxConcurrent, preProcess, postProcess)
   * @returns {Promise<Object>} Results with success/failure counts
   */
  async batchUpdate(objectType, records, options = {}) {
    this.stats.startTime = Date.now();
    this.stats.totalRecords = records.length;

    if (!records || records.length === 0) {
      return { success: 0, failed: 0, results: [] };
    }

    const batchSize = options.batchSize || this.batchSize;
    const maxConcurrent = options.maxConcurrent || this.maxConcurrent;

    // Optional pre-processing hook
    if (options.preProcess && typeof options.preProcess === 'function') {
      records = await Promise.all(records.map(r => options.preProcess(r)));
    }

    // Split into batches
    const batches = this.chunkArray(records, batchSize);

    if (this.verbose) {
      console.log(`Batch Update: ${records.length} records → ${batches.length} batches (${batchSize} per batch)`);
    }

    // Process batches in parallel (up to maxConcurrent)
    const results = [];
    for (let i = 0; i < batches.length; i += maxConcurrent) {
      const parallelBatches = batches.slice(i, i + maxConcurrent);

      const batchPromises = parallelBatches.map((batch, idx) =>
        this.updateBatch(objectType, batch, i + idx)
      );

      const batchResults = await Promise.allSettled(batchPromises);
      results.push(...batchResults);

      // Rate limit delay between parallel groups
      if (i + maxConcurrent < batches.length) {
        await this.delay(RATE_LIMIT_DELAY);
      }
    }

    // Optional post-processing hook
    if (options.postProcess && typeof options.postProcess === 'function') {
      await Promise.all(records.map(r => options.postProcess(r)));
    }

    this.stats.endTime = Date.now();
    return this.aggregateResults(results);
  }

  /**
   * Batch create records
   */
  async batchCreate(objectType, records, options = {}) {
    this.stats.startTime = Date.now();
    this.stats.totalRecords = records.length;

    if (!records || records.length === 0) {
      return { success: 0, failed: 0, results: [] };
    }

    const batchSize = options.batchSize || this.batchSize;
    const maxConcurrent = options.maxConcurrent || this.maxConcurrent;
    const batches = this.chunkArray(records, batchSize);

    if (this.verbose) {
      console.log(`Batch Create: ${records.length} records → ${batches.length} batches`);
    }

    const results = [];
    for (let i = 0; i < batches.length; i += maxConcurrent) {
      const parallelBatches = batches.slice(i, i + maxConcurrent);

      const batchPromises = parallelBatches.map((batch, idx) =>
        this.createBatch(objectType, batch, i + idx)
      );

      const batchResults = await Promise.allSettled(batchPromises);
      results.push(...batchResults);

      if (i + maxConcurrent < batches.length) {
        await this.delay(RATE_LIMIT_DELAY);
      }
    }

    this.stats.endTime = Date.now();
    return this.aggregateResults(results);
  }

  /**
   * Batch archive (delete) records
   */
  async batchArchive(objectType, recordIds, options = {}) {
    this.stats.startTime = Date.now();
    this.stats.totalRecords = recordIds.length;

    if (!recordIds || recordIds.length === 0) {
      return { success: 0, failed: 0, results: [] };
    }

    const batchSize = options.batchSize || this.batchSize;
    const maxConcurrent = options.maxConcurrent || this.maxConcurrent;
    const batches = this.chunkArray(recordIds, batchSize);

    if (this.verbose) {
      console.log(`Batch Archive: ${recordIds.length} records → ${batches.length} batches`);
    }

    const results = [];
    for (let i = 0; i < batches.length; i += maxConcurrent) {
      const parallelBatches = batches.slice(i, i + maxConcurrent);

      const batchPromises = parallelBatches.map((batch, idx) =>
        this.archiveBatch(objectType, batch, i + idx)
      );

      const batchResults = await Promise.allSettled(batchPromises);
      results.push(...batchResults);

      if (i + maxConcurrent < batches.length) {
        await this.delay(RATE_LIMIT_DELAY);
      }
    }

    this.stats.endTime = Date.now();
    return this.aggregateResults(results);
  }

  /**
   * Update a single batch via HubSpot batch API
   */
  async updateBatch(objectType, batch, batchIndex) {
    const url = `${HUBSPOT_API_BASE}/crm/v3/objects/${objectType}/batch/update`;

    const payload = {
      inputs: batch.map(record => ({
        id: record.id,
        properties: record.properties
      }))
    };

    return await this.makeRequest(url, payload, 'POST', batchIndex, 'update');
  }

  /**
   * Create a single batch via HubSpot batch API
   */
  async createBatch(objectType, batch, batchIndex) {
    const url = `${HUBSPOT_API_BASE}/crm/v3/objects/${objectType}/batch/create`;

    const payload = {
      inputs: batch.map(record => ({
        properties: record.properties || record
      }))
    };

    return await this.makeRequest(url, payload, 'POST', batchIndex, 'create');
  }

  /**
   * Archive a single batch via HubSpot batch API
   */
  async archiveBatch(objectType, batch, batchIndex) {
    const url = `${HUBSPOT_API_BASE}/crm/v3/objects/${objectType}/batch/archive`;

    const payload = {
      inputs: batch.map(id => ({ id: String(id) }))
    };

    return await this.makeRequest(url, payload, 'POST', batchIndex, 'archive');
  }

  /**
   * Make HTTP request with retry logic
   */
  async makeRequest(url, payload, method, batchIndex, operation) {
    let lastError;

    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        this.stats.totalApiCalls++;

        const response = await fetch(url, {
          method,
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
          const errorBody = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorBody}`);
        }

        const result = await response.json();

        if (this.verbose) {
          console.log(`✓ Batch ${batchIndex} (${operation}): ${payload.inputs.length} records - Success`);
        }

        this.stats.successfulBatches++;
        return { status: 'success', data: result, batchIndex };

      } catch (error) {
        lastError = error;

        if (attempt < this.retryAttempts) {
          if (this.verbose) {
            console.log(`⚠ Batch ${batchIndex} (${operation}): Retry ${attempt}/${this.retryAttempts} - ${error.message}`);
          }
          await this.delay(this.retryDelay * attempt); // Exponential backoff
        }
      }
    }

    // All retries failed
    this.stats.failedBatches++;
    if (this.verbose) {
      console.error(`✗ Batch ${batchIndex} (${operation}): Failed after ${this.retryAttempts} attempts - ${lastError.message}`);
    }

    return { status: 'failed', error: lastError.message, batchIndex };
  }

  /**
   * Aggregate batch results
   */
  aggregateResults(results) {
    const summary = {
      success: 0,
      failed: 0,
      results: [],
      stats: this.getStats()
    };

    results.forEach(result => {
      if (result.status === 'fulfilled' && result.value.status === 'success') {
        summary.success++;
        summary.results.push(result.value.data);
      } else {
        summary.failed++;
        summary.results.push({
          error: result.reason || result.value?.error || 'Unknown error',
          batchIndex: result.value?.batchIndex
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
    const recordsPerSecond = duration > 0 ? (this.stats.totalRecords / (duration / 1000)).toFixed(2) : 0;

    return {
      ...this.stats,
      duration: `${duration}ms`,
      recordsPerSecond,
      successRate: this.stats.successfulBatches > 0
        ? ((this.stats.successfulBatches / (this.stats.successfulBatches + this.stats.failedBatches)) * 100).toFixed(2) + '%'
        : '0%'
    };
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

module.exports = BatchUpdateWrapper;

// CLI usage
if (require.main === module) {
  console.log('BatchUpdateWrapper - HubSpot Batch Operations Library');
  console.log('Usage: const updater = new BatchUpdateWrapper(accessToken);');
  console.log('       await updater.batchUpdate(objectType, records, options);');
  console.log('');
  console.log('Methods:');
  console.log('  - batchUpdate(objectType, records, options)   - Update records in batches');
  console.log('  - batchCreate(objectType, records, options)   - Create records in batches');
  console.log('  - batchArchive(objectType, recordIds, options) - Archive records in batches');
  console.log('');
  console.log('Options:');
  console.log('  - batchSize: 100 (max)');
  console.log('  - maxConcurrent: 10 (parallel batches)');
  console.log('  - preProcess: function(record) - Run before update');
  console.log('  - postProcess: function(record) - Run after update');
  console.log('  - verbose: true - Enable logging');
}
