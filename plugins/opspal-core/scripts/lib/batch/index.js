/**
 * Batch Processing Module
 *
 * Provides high-performance batch processing capabilities for entity matching:
 * - Cluster detection using Union-Find algorithm
 * - Incremental matching with inverted indexes
 * - Parallel batch processing with early termination
 *
 * @module batch
 */

'use strict';

const {
  EntityClusterDetector,
  UnionFind,
  MASTER_STRATEGIES,
  DEFAULT_COMPLETENESS_FIELDS
} = require('./entity-cluster-detector');

// Alias for backward compatibility
const SELECTION_STRATEGIES = MASTER_STRATEGIES;

const {
  IncrementalMatcher,
  INDEX_TYPES,
  DEFAULT_INDEX_CONFIG,
  BLOCKING_STRATEGIES
} = require('./incremental-matcher');

const {
  BatchOptimizer,
  MARKET_UNIQUENESS,
  DEFAULT_MARKET_UNIQUENESS,
  REJECTION_RULES,
  PROCESS_STATUS
} = require('./batch-optimizer');

/**
 * Create a complete batch processing pipeline
 *
 * @param {Object} options - Pipeline configuration
 * @returns {Object} Pipeline with matcher, clusterer, and optimizer
 */
function createBatchPipeline(options = {}) {
  const {
    indexConfig = DEFAULT_INDEX_CONFIG,
    blockingStrategies = ['BY_STATE', 'BY_NAME_PREFIX', 'BY_DOMAIN'],
    batchSize = 100,
    maxConcurrency = 4,
    scorer = null,
    market = null,
    onProgress = null
  } = options;

  // Create components
  const matcher = new IncrementalMatcher({
    indexConfig,
    blockingStrategies,
    scorer
  });

  const clusterer = new EntityClusterDetector();

  const optimizer = new BatchOptimizer({
    batchSize,
    maxConcurrency,
    processor: scorer || ((a, b) => matcher._simpleScore(a, b, 1)),
    onProgress
  });

  return {
    matcher,
    clusterer,
    optimizer,

    /**
     * Run complete deduplication pipeline
     *
     * @param {Array} records - Records to deduplicate
     * @param {Object} pipelineOptions - Pipeline options
     * @returns {Promise<Object>} Deduplication results
     */
    async deduplicate(records, pipelineOptions = {}) {
      const {
        minConfidence = 70,
        masterStrategy = 'MOST_COMPLETE',
        returnClusters = true
      } = pipelineOptions;

      // Step 1: Build index
      const indexStats = matcher.buildIndex(records);

      // Step 2: Find candidates and score matches
      const allMatches = [];
      const recordsById = new Map();

      // Build lookup map
      for (const record of records) {
        const id = record.Id || record.id;
        recordsById.set(id, record);
      }

      for (const record of records) {
        const matches = matcher.matchNewRecord(record, {
          topN: 5,
          minConfidence
        });

        for (const match of matches) {
          // Avoid duplicates
          const recordId = record.Id || record.id;
          if (recordId !== match.candidateId) {
            allMatches.push({
              // Use recordA/recordB format expected by EntityClusterDetector
              recordA: record,
              recordB: match.candidate,
              confidence: match.confidence,
              signals: match.blockHits
            });
          }
        }
      }

      // Deduplicate match pairs
      const seenPairs = new Set();
      const uniqueMatches = allMatches.filter(m => {
        const idA = m.recordA.Id || m.recordA.id;
        const idB = m.recordB.Id || m.recordB.id;
        const pairKey = [idA, idB].sort().join('|');
        if (seenPairs.has(pairKey)) return false;
        seenPairs.add(pairKey);
        return true;
      });

      // Step 3: Detect clusters
      const clusters = clusterer.detectClusters(uniqueMatches, {
        minConfidence,
        selectMaster: true,
        masterStrategy
      });

      // Step 4: Build results
      const results = {
        totalRecords: records.length,
        uniqueMatches: uniqueMatches.length,
        clusters: clusters.length,
        duplicatesFound: clusters.reduce((sum, c) => sum + c.members.length - 1, 0),
        indexStats,
        matcherStats: matcher.getStats()
      };

      if (returnClusters) {
        results.clusterDetails = clusters;
      }

      return results;
    },

    /**
     * Process new records incrementally against existing index
     *
     * @param {Array} newRecords - New records to match
     * @param {Object} incOptions - Incremental options
     * @returns {Promise<Object>} Match results
     */
    async processIncremental(newRecords, incOptions = {}) {
      const {
        minConfidence = 70,
        batchMode = true
      } = incOptions;

      if (batchMode) {
        // Use batch optimizer for parallel processing
        return optimizer.processBatch(newRecords, {
          market,
          existingRecords: matcher.getAllRecords(),
          mode: 'incremental',
          minConfidence
        });
      }

      // Sequential processing
      const results = [];
      for (const record of newRecords) {
        const matches = matcher.matchNewRecord(record, {
          minConfidence
        });
        results.push({
          record,
          matches
        });
      }

      return {
        matches: results,
        stats: matcher.getStats()
      };
    },

    /**
     * Add records to the index
     */
    addToIndex(records) {
      if (Array.isArray(records)) {
        for (const record of records) {
          matcher.addToIndex(record);
        }
      } else {
        matcher.addToIndex(records);
      }
    },

    /**
     * Get pipeline statistics
     */
    getStats() {
      return {
        matcher: matcher.getStats(),
        optimizer: optimizer.getStats()
      };
    },

    /**
     * Reset pipeline state
     */
    reset() {
      matcher.buildIndex([]);
      optimizer.resetStats();
    }
  };
}

module.exports = {
  // Core classes
  EntityClusterDetector,
  UnionFind,
  IncrementalMatcher,
  BatchOptimizer,

  // Constants
  SELECTION_STRATEGIES,
  MASTER_STRATEGIES,
  DEFAULT_COMPLETENESS_FIELDS,
  INDEX_TYPES,
  DEFAULT_INDEX_CONFIG,
  BLOCKING_STRATEGIES,
  MARKET_UNIQUENESS,
  DEFAULT_MARKET_UNIQUENESS,
  REJECTION_RULES,
  PROCESS_STATUS,

  // Factory
  createBatchPipeline
};
