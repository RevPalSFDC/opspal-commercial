/**
 * BatchOptimizer - Parallel processing and early termination for batch matching
 *
 * Optimizes large-scale entity matching through:
 * - Parallel batch processing with configurable concurrency
 * - Early termination for obvious non-matches
 * - Memory-efficient streaming for large datasets
 * - Progress tracking and statistics
 *
 * @module batch/batch-optimizer
 */

'use strict';

/**
 * Market uniqueness levels for quick rejection
 */
const MARKET_UNIQUENESS = {
  HIGH: 'HIGH',       // Government, healthcare - names usually unique
  MEDIUM: 'MEDIUM',   // Professional services - moderate uniqueness
  LOW: 'LOW'          // Franchise, retail - common names expected
};

/**
 * Default market uniqueness mappings
 */
const DEFAULT_MARKET_UNIQUENESS = {
  government: MARKET_UNIQUENESS.HIGH,
  healthcare: MARKET_UNIQUENESS.HIGH,
  financial: MARKET_UNIQUENESS.HIGH,
  nonprofit: MARKET_UNIQUENESS.HIGH,
  legal: MARKET_UNIQUENESS.HIGH,
  utilities: MARKET_UNIQUENESS.HIGH,
  education: MARKET_UNIQUENESS.HIGH,
  'media-broadcasting': MARKET_UNIQUENESS.HIGH,

  'property-management': MARKET_UNIQUENESS.MEDIUM,
  'professional-services': MARKET_UNIQUENESS.MEDIUM,
  'insurance-agencies': MARKET_UNIQUENESS.MEDIUM,
  automotive: MARKET_UNIQUENESS.MEDIUM,
  construction: MARKET_UNIQUENESS.MEDIUM,
  staffing: MARKET_UNIQUENESS.MEDIUM,
  'senior-living': MARKET_UNIQUENESS.MEDIUM,
  'dental-medical': MARKET_UNIQUENESS.MEDIUM,

  franchise: MARKET_UNIQUENESS.LOW,
  retail: MARKET_UNIQUENESS.LOW,
  technology: MARKET_UNIQUENESS.LOW,
  veterinary: MARKET_UNIQUENESS.LOW
};

/**
 * Quick rejection rules by market uniqueness
 */
const REJECTION_RULES = {
  [MARKET_UNIQUENESS.HIGH]: {
    // High uniqueness markets - be strict
    requireSameState: true,
    requireNameOverlap: true,
    minNameTokenOverlap: 0.3
  },
  [MARKET_UNIQUENESS.MEDIUM]: {
    // Medium uniqueness - moderate strictness
    requireSameState: false,
    requireNameOverlap: true,
    minNameTokenOverlap: 0.2
  },
  [MARKET_UNIQUENESS.LOW]: {
    // Low uniqueness - permissive (franchises may have same name everywhere)
    requireSameState: false,
    requireNameOverlap: false,
    minNameTokenOverlap: 0
  }
};

/**
 * Processing status
 */
const PROCESS_STATUS = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED'
};

class BatchOptimizer {
  /**
   * Create a BatchOptimizer
   *
   * @param {Object} options - Configuration options
   * @param {number} options.batchSize - Records per batch (default: 100)
   * @param {number} options.maxConcurrency - Maximum parallel batches (default: 4)
   * @param {Object} options.marketUniqueness - Market uniqueness mappings
   * @param {Function} options.processor - Processing function for record pairs
   * @param {Function} options.onProgress - Progress callback
   * @param {boolean} options.enableQuickReject - Enable early termination (default: true)
   */
  constructor(options = {}) {
    this.batchSize = options.batchSize ?? 100;
    this.maxConcurrency = options.maxConcurrency ?? 4;
    this.marketUniqueness = { ...DEFAULT_MARKET_UNIQUENESS, ...options.marketUniqueness };
    this.processor = options.processor;
    this.onProgress = options.onProgress;
    this.enableQuickReject = options.enableQuickReject ?? true;

    // Statistics
    this.stats = {
      totalRecords: 0,
      processedRecords: 0,
      batchesCompleted: 0,
      totalBatches: 0,
      quickRejections: 0,
      processingTimeMs: 0,
      avgBatchTimeMs: 0,
      errors: 0
    };

    // State
    this._cancelled = false;
    this._batchTimes = [];
  }

  /**
   * Process records in parallel batches
   *
   * @param {Array} records - Records to process
   * @param {Object} options - Processing options
   * @returns {Promise<Object>} Processing results
   */
  async processBatch(records, options = {}) {
    const startTime = Date.now();
    this._cancelled = false;

    const {
      market = null,
      existingRecords = null,
      mode = 'all-pairs',  // 'all-pairs' | 'incremental' | 'within-batch'
      minConfidence = 0
    } = options;

    this.stats.totalRecords = records.length;
    this.stats.processedRecords = 0;
    this.stats.batchesCompleted = 0;
    this.stats.quickRejections = 0;
    this.stats.errors = 0;

    // Split into batches
    const batches = this._chunk(records, this.batchSize);
    this.stats.totalBatches = batches.length;

    // Process with controlled concurrency
    const results = [];
    const activeBatches = [];

    for (let i = 0; i < batches.length && !this._cancelled; i++) {
      // Wait if at max concurrency
      if (activeBatches.length >= this.maxConcurrency) {
        const completed = await Promise.race(activeBatches);
        results.push(completed);
        activeBatches.splice(activeBatches.indexOf(completed), 1);
      }

      // Start new batch
      const batchPromise = this._processSingleBatch(batches[i], i, {
        market,
        existingRecords,
        mode,
        minConfidence,
        allBatches: batches
      });

      activeBatches.push(batchPromise);
    }

    // Wait for remaining batches
    const remaining = await Promise.all(activeBatches);
    results.push(...remaining);

    this.stats.processingTimeMs = Date.now() - startTime;
    this.stats.avgBatchTimeMs = this._batchTimes.length > 0
      ? this._batchTimes.reduce((a, b) => a + b, 0) / this._batchTimes.length
      : 0;

    return {
      matches: results.flat(),
      stats: this.getStats(),
      cancelled: this._cancelled
    };
  }

  /**
   * Process a single batch
   *
   * @private
   */
  async _processSingleBatch(batch, batchIndex, options) {
    const batchStart = Date.now();
    const { market, existingRecords, mode, minConfidence, allBatches } = options;
    const matches = [];

    try {
      let pairs;

      switch (mode) {
        case 'incremental':
          // Compare batch against existing records
          if (existingRecords) {
            pairs = this._generatePairs(batch, existingRecords, 'cross');
          } else {
            pairs = [];
          }
          break;

        case 'within-batch':
          // Only compare within this batch
          pairs = this._generatePairs(batch, null, 'self');
          break;

        case 'all-pairs':
        default:
          // Compare with all previous batches + within batch
          const previousRecords = allBatches
            .slice(0, batchIndex)
            .flat();
          pairs = [
            ...this._generatePairs(batch, null, 'self'),
            ...this._generatePairs(batch, previousRecords, 'cross')
          ];
          break;
      }

      // Process pairs
      for (const [recordA, recordB] of pairs) {
        if (this._cancelled) break;

        // Apply quick rejection
        if (this.enableQuickReject) {
          const reject = this.quickReject(recordA, recordB, market);
          if (reject) {
            this.stats.quickRejections++;
            continue;
          }
        }

        // Process pair
        if (this.processor) {
          try {
            const result = await this.processor(recordA, recordB, { market });
            if (result && result.confidence >= minConfidence) {
              matches.push(result);
            }
          } catch (error) {
            this.stats.errors++;
          }
        }
      }

      this.stats.processedRecords += batch.length;
      this.stats.batchesCompleted++;

      // Track batch time
      const batchTime = Date.now() - batchStart;
      this._batchTimes.push(batchTime);

      // Report progress
      if (this.onProgress) {
        this.onProgress({
          batch: batchIndex + 1,
          totalBatches: this.stats.totalBatches,
          processedRecords: this.stats.processedRecords,
          totalRecords: this.stats.totalRecords,
          matchesFound: matches.length,
          quickRejections: this.stats.quickRejections,
          batchTimeMs: batchTime
        });
      }

    } catch (error) {
      this.stats.errors++;
      console.error(`Batch ${batchIndex} failed:`, error.message);
    }

    return matches;
  }

  /**
   * Quick rejection for obvious non-matches
   *
   * @param {Object} recordA - First record
   * @param {Object} recordB - Second record
   * @param {string} [market] - Market identifier
   * @returns {boolean} True if pair should be rejected without full comparison
   */
  quickReject(recordA, recordB, market = null) {
    // Get uniqueness level
    const uniqueness = market
      ? (this.marketUniqueness[market] || MARKET_UNIQUENESS.MEDIUM)
      : MARKET_UNIQUENESS.MEDIUM;

    const rules = REJECTION_RULES[uniqueness];

    // Rule 1: State mismatch for high uniqueness markets
    if (rules.requireSameState) {
      const stateA = this._getState(recordA);
      const stateB = this._getState(recordB);

      if (stateA && stateB && stateA !== stateB) {
        return true;
      }
    }

    // Rule 2: No name overlap
    if (rules.requireNameOverlap) {
      const nameA = this._getName(recordA);
      const nameB = this._getName(recordB);

      if (nameA && nameB) {
        const tokensA = this._tokenize(nameA);
        const tokensB = this._tokenize(nameB);

        if (tokensA.length > 0 && tokensB.length > 0) {
          const intersection = tokensA.filter(t => tokensB.includes(t));
          const smaller = Math.min(tokensA.length, tokensB.length);
          const overlap = intersection.length / smaller;

          if (overlap < rules.minNameTokenOverlap) {
            return true;
          }
        }
      }
    }

    // Rule 3: Completely different domains
    const domainA = this._getDomain(recordA);
    const domainB = this._getDomain(recordB);
    if (domainA && domainB) {
      // Normalize domains
      const normA = domainA.replace(/^(https?:\/\/)?(www\.)?/i, '').toLowerCase();
      const normB = domainB.replace(/^(https?:\/\/)?(www\.)?/i, '').toLowerCase();

      // If both have domains but they're completely different
      if (normA !== normB) {
        // Extract root domain (e.g., 'example.com' from 'sub.example.com')
        const rootA = normA.split('.').slice(-2).join('.');
        const rootB = normB.split('.').slice(-2).join('.');

        // If root domains are different and we're in a high uniqueness market
        if (rootA !== rootB && uniqueness === MARKET_UNIQUENESS.HIGH) {
          return true;
        }
      }
    }

    // Rule 4: Same record (by ID)
    const idA = recordA.Id || recordA.id;
    const idB = recordB.Id || recordB.id;
    if (idA && idB && idA === idB) {
      return true;  // Don't compare record with itself
    }

    return false;
  }

  /**
   * Cancel ongoing processing
   */
  cancel() {
    this._cancelled = true;
  }

  /**
   * Get processing statistics
   */
  getStats() {
    return {
      ...this.stats,
      rejectionRate: this.stats.totalRecords > 0
        ? (this.stats.quickRejections / this.stats.totalRecords * 100).toFixed(2) + '%'
        : '0%',
      errorRate: this.stats.totalRecords > 0
        ? (this.stats.errors / this.stats.totalRecords * 100).toFixed(2) + '%'
        : '0%',
      throughput: this.stats.processingTimeMs > 0
        ? Math.round(this.stats.processedRecords / (this.stats.processingTimeMs / 1000)) + ' records/sec'
        : 'N/A'
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      totalRecords: 0,
      processedRecords: 0,
      batchesCompleted: 0,
      totalBatches: 0,
      quickRejections: 0,
      processingTimeMs: 0,
      avgBatchTimeMs: 0,
      errors: 0
    };
    this._batchTimes = [];
    this._cancelled = false;
  }

  /**
   * Create memory-efficient stream processor for very large datasets
   *
   * @param {Object} options - Stream options
   * @returns {Object} Stream processor interface
   */
  createStreamProcessor(options = {}) {
    const self = this;
    const { highWaterMark = 1000 } = options;

    let buffer = [];
    let processedCount = 0;
    let allMatches = [];

    return {
      /**
       * Add record to buffer, process when full
       */
      async push(record) {
        buffer.push(record);

        if (buffer.length >= highWaterMark) {
          const results = await self.processBatch(buffer, options);
          allMatches.push(...results.matches);
          processedCount += buffer.length;
          buffer = [];
          return results;
        }

        return null;
      },

      /**
       * Process remaining buffered records
       */
      async flush() {
        if (buffer.length > 0) {
          const results = await self.processBatch(buffer, options);
          allMatches.push(...results.matches);
          processedCount += buffer.length;
          buffer = [];
          return results;
        }
        return { matches: [], stats: self.getStats() };
      },

      /**
       * Get all accumulated matches
       */
      getMatches() {
        return allMatches;
      },

      /**
       * Get total processed count
       */
      getProcessedCount() {
        return processedCount;
      },

      /**
       * Get buffer size
       */
      getBufferSize() {
        return buffer.length;
      }
    };
  }

  // ========== Private Helper Methods ==========

  /**
   * Split array into chunks
   */
  _chunk(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Generate pairs for comparison
   */
  _generatePairs(batch, otherRecords, mode) {
    const pairs = [];

    if (mode === 'self') {
      // All pairs within batch
      for (let i = 0; i < batch.length; i++) {
        for (let j = i + 1; j < batch.length; j++) {
          pairs.push([batch[i], batch[j]]);
        }
      }
    } else if (mode === 'cross' && otherRecords) {
      // Cross product with other records
      for (const batchRecord of batch) {
        for (const otherRecord of otherRecords) {
          pairs.push([batchRecord, otherRecord]);
        }
      }
    }

    return pairs;
  }

  /**
   * Extract state from record
   */
  _getState(record) {
    const state = record.State || record.state || record.BillingState;
    return state ? state.toUpperCase().trim() : null;
  }

  /**
   * Extract name from record
   */
  _getName(record) {
    return record.Name || record.name || record.CompanyName || null;
  }

  /**
   * Extract domain from record
   */
  _getDomain(record) {
    return record.Domain || record.domain || record.Website || null;
  }

  /**
   * Tokenize a string for comparison
   */
  _tokenize(value) {
    return value
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length >= 2);
  }
}

module.exports = {
  BatchOptimizer,
  MARKET_UNIQUENESS,
  DEFAULT_MARKET_UNIQUENESS,
  REJECTION_RULES,
  PROCESS_STATUS
};
