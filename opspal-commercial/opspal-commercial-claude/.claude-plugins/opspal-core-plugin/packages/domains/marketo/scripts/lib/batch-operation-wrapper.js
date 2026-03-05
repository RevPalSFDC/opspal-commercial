/**
 * Batch Operation Wrapper for Marketo API
 *
 * Provides 10-100x speedup via parallelization for bulk operations.
 * Pattern based on HubSpot batch-update-wrapper.js.
 *
 * Features:
 * - Chunks data into 300-record batches (Marketo limit)
 * - Parallel execution with configurable concurrency
 * - Automatic retry with exponential backoff
 * - Progress tracking and error aggregation
 * - Rate limit awareness
 *
 * @module batch-operation-wrapper
 * @version 1.0.0
 */

const rateLimitManager = require('./rate-limit-manager');

/**
 * Default batch processing options
 */
const DEFAULT_OPTIONS = {
  batchSize: 300,        // Marketo max records per batch
  concurrency: 5,        // Parallel batches
  retryAttempts: 3,      // Retries per batch
  retryDelay: 1000,      // Initial retry delay (ms)
  retryBackoff: 2,       // Exponential backoff multiplier
  onProgress: null,      // Progress callback
  onBatchComplete: null, // Batch completion callback
  onError: null,         // Error callback
  abortOnError: false,   // Stop all on first error
  validateBatch: null,   // Pre-batch validation function
};

/**
 * Process records in batches with parallelization
 *
 * @param {Array} records - Records to process
 * @param {Function} operation - Async function to process each batch
 * @param {Object} options - Processing options
 * @returns {Promise<BatchResult>} Aggregated results
 *
 * @example
 * const result = await batchProcess(leads, async (batch) => {
 *   return await mcp__marketo__lead_create({ leads: batch });
 * }, { batchSize: 300, concurrency: 5 });
 */
async function batchProcess(records, operation, options = {}) {
  const config = { ...DEFAULT_OPTIONS, ...options };
  const startTime = Date.now();

  // Validate inputs
  if (!Array.isArray(records)) {
    throw new Error('Records must be an array');
  }
  if (typeof operation !== 'function') {
    throw new Error('Operation must be a function');
  }

  // Handle empty records
  if (records.length === 0) {
    return createResult([], [], 0, startTime);
  }

  // Chunk records into batches
  const batches = chunkArray(records, config.batchSize);
  const totalBatches = batches.length;

  // Track results
  const results = {
    successful: [],
    failed: [],
    errors: [],
    batchResults: [],
  };

  // Process batches with controlled concurrency
  let completedBatches = 0;
  let aborted = false;

  // Create batch processing queue
  const processBatch = async (batch, batchIndex) => {
    if (aborted) return null;

    // Pre-batch validation
    if (config.validateBatch) {
      const validation = await config.validateBatch(batch, batchIndex);
      if (!validation.valid) {
        const error = new BatchError(
          `Batch ${batchIndex + 1} validation failed: ${validation.reason}`,
          batchIndex,
          batch
        );
        results.errors.push(error);
        results.failed.push(...batch);
        return { success: false, error };
      }
    }

    // Wait for rate limit
    await rateLimitManager.waitIfNeeded();

    // Process with retry
    let lastError;
    for (let attempt = 0; attempt < config.retryAttempts; attempt++) {
      try {
        const result = await operation(batch, batchIndex);
        rateLimitManager.recordCall();

        // Track successful results
        results.successful.push(...(result.records || batch));
        results.batchResults.push({
          batchIndex,
          success: true,
          count: batch.length,
          result,
        });

        completedBatches++;
        reportProgress(config, completedBatches, totalBatches, batch.length);

        if (config.onBatchComplete) {
          config.onBatchComplete(batchIndex, result);
        }

        return result;
      } catch (error) {
        lastError = error;

        // Check for rate limit errors
        if (isRateLimitError(error)) {
          const waitTime = extractRetryAfter(error) || (config.retryDelay * Math.pow(config.retryBackoff, attempt));
          await sleep(waitTime);
          continue;
        }

        // For other errors, apply backoff
        if (attempt < config.retryAttempts - 1) {
          await sleep(config.retryDelay * Math.pow(config.retryBackoff, attempt));
        }
      }
    }

    // All retries exhausted
    const error = new BatchError(
      `Batch ${batchIndex + 1} failed after ${config.retryAttempts} attempts: ${lastError.message}`,
      batchIndex,
      batch,
      lastError
    );
    results.errors.push(error);
    results.failed.push(...batch);
    results.batchResults.push({
      batchIndex,
      success: false,
      count: batch.length,
      error,
    });

    if (config.onError) {
      config.onError(error);
    }

    if (config.abortOnError) {
      aborted = true;
    }

    return { success: false, error };
  };

  // Process in parallel with concurrency limit
  await processWithConcurrency(batches, processBatch, config.concurrency);

  return createResult(results.successful, results.failed, results.errors, startTime, results.batchResults);
}

/**
 * Process items with controlled concurrency
 */
async function processWithConcurrency(items, processor, concurrency) {
  const queue = items.map((item, index) => ({ item, index }));
  const inProgress = new Set();
  const results = [];

  return new Promise((resolve) => {
    const processNext = () => {
      if (queue.length === 0 && inProgress.size === 0) {
        resolve(results);
        return;
      }

      while (inProgress.size < concurrency && queue.length > 0) {
        const { item, index } = queue.shift();
        const promise = processor(item, index)
          .then((result) => {
            results[index] = result;
            inProgress.delete(promise);
            processNext();
          })
          .catch((error) => {
            results[index] = { error };
            inProgress.delete(promise);
            processNext();
          });
        inProgress.add(promise);
      }
    };

    processNext();
  });
}

/**
 * Chunk array into smaller arrays
 */
function chunkArray(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Create result object
 */
function createResult(successful, failed, errors, startTime, batchResults = []) {
  const endTime = Date.now();
  return {
    success: failed.length === 0,
    summary: {
      total: successful.length + failed.length,
      successful: successful.length,
      failed: failed.length,
      errors: errors.length,
      duration: endTime - startTime,
      recordsPerSecond: Math.round(
        (successful.length + failed.length) / ((endTime - startTime) / 1000)
      ),
    },
    records: {
      successful,
      failed,
    },
    errors,
    batchResults,
  };
}

/**
 * Report progress
 */
function reportProgress(config, completed, total, batchSize) {
  if (config.onProgress) {
    config.onProgress({
      completed,
      total,
      percentage: Math.round((completed / total) * 100),
      batchSize,
    });
  }
}

/**
 * Check if error is rate limit related
 */
function isRateLimitError(error) {
  if (!error) return false;
  const code = error.code || error.errorCode;
  return code === 606 || code === 607 || error.message?.includes('rate limit');
}

/**
 * Extract retry-after from error
 */
function extractRetryAfter(error) {
  if (error.retryAfter) return error.retryAfter * 1000;
  if (error.headers?.['retry-after']) return parseInt(error.headers['retry-after']) * 1000;
  return null;
}

/**
 * Sleep utility
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Custom error class for batch failures
 */
class BatchError extends Error {
  constructor(message, batchIndex, records, cause = null) {
    super(message);
    this.name = 'BatchError';
    this.batchIndex = batchIndex;
    this.records = records;
    this.cause = cause;
  }
}

/**
 * Convenience method for lead operations
 */
async function batchLeadOperation(leads, operation, options = {}) {
  return batchProcess(leads, operation, {
    batchSize: 300,
    ...options,
  });
}

/**
 * Convenience method for program member operations
 */
async function batchProgramMemberOperation(members, operation, options = {}) {
  return batchProcess(members, operation, {
    batchSize: 300,
    ...options,
  });
}

/**
 * Convenience method for custom object operations
 */
async function batchCustomObjectOperation(records, operation, options = {}) {
  return batchProcess(records, operation, {
    batchSize: 300,
    ...options,
  });
}

/**
 * Create a batch operation builder for fluent API
 */
function createBatchOperation(records) {
  const builder = {
    records,
    options: { ...DEFAULT_OPTIONS },

    withBatchSize(size) {
      this.options.batchSize = size;
      return this;
    },

    withConcurrency(level) {
      this.options.concurrency = level;
      return this;
    },

    withRetries(attempts, delay = 1000) {
      this.options.retryAttempts = attempts;
      this.options.retryDelay = delay;
      return this;
    },

    onProgress(callback) {
      this.options.onProgress = callback;
      return this;
    },

    onBatchComplete(callback) {
      this.options.onBatchComplete = callback;
      return this;
    },

    onError(callback) {
      this.options.onError = callback;
      return this;
    },

    abortOnError(shouldAbort = true) {
      this.options.abortOnError = shouldAbort;
      return this;
    },

    validate(validator) {
      this.options.validateBatch = validator;
      return this;
    },

    async execute(operation) {
      return batchProcess(this.records, operation, this.options);
    },
  };

  return builder;
}

module.exports = {
  batchProcess,
  batchLeadOperation,
  batchProgramMemberOperation,
  batchCustomObjectOperation,
  createBatchOperation,
  BatchError,
  DEFAULT_OPTIONS,
};
