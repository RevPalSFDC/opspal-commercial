#!/usr/bin/env node

/**
 * Operation Registry - Idempotent Operation Framework
 *
 * Tracks completed operations to prevent duplicates and enable safe retries.
 *
 * Key Features:
 * - Operation fingerprinting (hash of operation context)
 * - State checkpointing (before/after snapshots)
 * - Duplicate detection
 * - Safe retry logic
 *
 * Addresses: Cohort 4 (operation/idempotency) - 7 reflections, $10.5K ROI
 *
 * Prevention Target: Operations run multiple times causing duplicates/inconsistency
 *
 * Usage:
 *   const { OperationRegistry } = require('./operation-registry');
 *   const registry = new OperationRegistry({ storageDir: './operations' });
 *
 *   // Check if operation already completed
 *   const existing = await registry.findOperation('deployMetadata', context);
 *   if (existing && existing.status === 'completed') {
 *     console.log('Operation already completed, skipping');
 *     return existing.result;
 *   }
 *
 *   // Register new operation
 *   const opId = await registry.registerOperation('deployMetadata', context);
 *
 *   try {
 *     const result = await performOperation();
 *     await registry.completeOperation(opId, result);
 *     return result;
 *   } catch (error) {
 *     await registry.failOperation(opId, error);
 *     throw error;
 *   }
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class OperationRegistry {
  constructor(options = {}) {
    this.storageDir = options.storageDir || './.operation-registry';
    this.hashAlgorithm = options.hashAlgorithm || 'sha256';
    this.ttlDays = options.ttlDays || 30; // Operations older than 30 days can be removed
  }

  /**
   * Initialize storage directory
   */
  async initialize() {
    await fs.mkdir(this.storageDir, { recursive: true });
  }

  /**
   * Generate fingerprint for operation context
   *
   * @param {string} operationType - Type of operation (e.g., 'deployMetadata')
   * @param {Object} context - Operation context (params, target, etc.)
   * @returns {string} - Fingerprint hash
   */
  generateFingerprint(operationType, context) {
    // Normalize context for consistent hashing
    const normalized = this._normalizeContext(context);

    // Create hash of operation type + context
    const hash = crypto.createHash(this.hashAlgorithm);
    hash.update(JSON.stringify({ operationType, context: normalized }));
    return hash.digest('hex');
  }

  /**
   * Normalize context for consistent hashing
   * - Sort object keys
   * - Remove volatile fields (timestamps, random IDs)
   * - Canonicalize paths
   */
  _normalizeContext(context) {
    if (typeof context !== 'object' || context === null) {
      return context;
    }

    if (Array.isArray(context)) {
      return context.map(item => this._normalizeContext(item));
    }

    // Remove volatile fields
    const { timestamp, requestId, sessionId, ...stable } = context;

    // Sort keys for consistent ordering
    const sorted = {};
    Object.keys(stable).sort().forEach(key => {
      sorted[key] = this._normalizeContext(stable[key]);
    });

    return sorted;
  }

  /**
   * Find existing operation by fingerprint
   *
   * @param {string} operationType - Type of operation
   * @param {Object} context - Operation context
   * @returns {Object|null} - Operation record or null if not found
   */
  async findOperation(operationType, context) {
    const fingerprint = this.generateFingerprint(operationType, context);
    const filePath = path.join(this.storageDir, `${fingerprint}.json`);

    try {
      const data = await fs.readFile(filePath, 'utf8');
      const operation = JSON.parse(data);

      // Check if operation is expired
      if (this._isExpired(operation)) {
        await this._cleanupOperation(fingerprint);
        return null;
      }

      return operation;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return null; // Operation not found
      }
      throw error;
    }
  }

  /**
   * Register new operation
   *
   * @param {string} operationType - Type of operation
   * @param {Object} context - Operation context
   * @param {Object} options - Additional options
   * @returns {string} - Operation ID (fingerprint)
   */
  async registerOperation(operationType, context, options = {}) {
    await this.initialize();

    const fingerprint = this.generateFingerprint(operationType, context);
    const operation = {
      id: fingerprint,
      operationType,
      context,
      status: 'in_progress',
      startedAt: new Date().toISOString(),
      beforeState: options.beforeState || null,
      metadata: options.metadata || {}
    };

    const filePath = path.join(this.storageDir, `${fingerprint}.json`);
    await fs.writeFile(filePath, JSON.stringify(operation, null, 2));

    return fingerprint;
  }

  /**
   * Complete operation with result
   *
   * @param {string} operationId - Operation ID (fingerprint)
   * @param {any} result - Operation result
   * @param {Object} options - Additional options (afterState, etc.)
   */
  async completeOperation(operationId, result, options = {}) {
    const operation = await this._loadOperation(operationId);

    operation.status = 'completed';
    operation.completedAt = new Date().toISOString();
    operation.result = result;
    operation.afterState = options.afterState || null;
    operation.duration = this._calculateDuration(operation.startedAt);

    await this._saveOperation(operationId, operation);
  }

  /**
   * Mark operation as failed
   *
   * @param {string} operationId - Operation ID (fingerprint)
   * @param {Error} error - Error that caused failure
   * @param {Object} options - Additional options
   */
  async failOperation(operationId, error, options = {}) {
    const operation = await this._loadOperation(operationId);

    operation.status = 'failed';
    operation.failedAt = new Date().toISOString();
    operation.error = {
      message: error.message,
      stack: error.stack,
      code: error.code
    };
    operation.retryable = options.retryable !== false; // Default to retryable
    operation.duration = this._calculateDuration(operation.startedAt);

    await this._saveOperation(operationId, operation);
  }

  /**
   * Check if operation can be safely retried
   *
   * @param {string} operationType - Type of operation
   * @param {Object} context - Operation context
   * @returns {Object} - { canRetry: boolean, reason: string, previousOperation: Object }
   */
  async canRetry(operationType, context) {
    const existing = await this.findOperation(operationType, context);

    if (!existing) {
      return { canRetry: true, reason: 'no_previous_operation', previousOperation: null };
    }

    if (existing.status === 'completed') {
      return {
        canRetry: false,
        reason: 'already_completed',
        previousOperation: existing,
        result: existing.result
      };
    }

    if (existing.status === 'in_progress') {
      // Check if operation has been running for too long (stale)
      const maxDuration = 3600000; // 1 hour in milliseconds
      const elapsed = Date.now() - new Date(existing.startedAt).getTime();

      if (elapsed > maxDuration) {
        return {
          canRetry: true,
          reason: 'stale_operation',
          previousOperation: existing
        };
      }

      return {
        canRetry: false,
        reason: 'operation_in_progress',
        previousOperation: existing
      };
    }

    if (existing.status === 'failed') {
      if (!existing.retryable) {
        return {
          canRetry: false,
          reason: 'not_retryable',
          previousOperation: existing
        };
      }

      return {
        canRetry: true,
        reason: 'retry_after_failure',
        previousOperation: existing
      };
    }

    return { canRetry: true, reason: 'unknown_status', previousOperation: existing };
  }

  /**
   * Get operation statistics
   *
   * @returns {Object} - Statistics about operations
   */
  async getStatistics() {
    await this.initialize();

    const files = await fs.readdir(this.storageDir);
    const operations = await Promise.all(
      files
        .filter(f => f.endsWith('.json'))
        .map(async f => {
          const data = await fs.readFile(path.join(this.storageDir, f), 'utf8');
          return JSON.parse(data);
        })
    );

    const stats = {
      total: operations.length,
      byStatus: {
        completed: 0,
        failed: 0,
        in_progress: 0
      },
      byType: {},
      averageDuration: 0,
      oldestOperation: null,
      newestOperation: null
    };

    let totalDuration = 0;
    let completedCount = 0;

    operations.forEach(op => {
      // Status counts
      stats.byStatus[op.status] = (stats.byStatus[op.status] || 0) + 1;

      // Type counts
      stats.byType[op.operationType] = (stats.byType[op.operationType] || 0) + 1;

      // Duration stats (only for completed operations)
      if (op.status === 'completed' && op.duration) {
        totalDuration += op.duration;
        completedCount++;
      }

      // Oldest/newest operations
      if (!stats.oldestOperation || op.startedAt < stats.oldestOperation.startedAt) {
        stats.oldestOperation = op;
      }
      if (!stats.newestOperation || op.startedAt > stats.newestOperation.startedAt) {
        stats.newestOperation = op;
      }
    });

    stats.averageDuration = completedCount > 0 ? Math.round(totalDuration / completedCount) : 0;

    return stats;
  }

  /**
   * Cleanup old operations
   *
   * @param {number} olderThanDays - Remove operations older than this many days
   * @returns {Object} - { removed: number, errors: number }
   */
  async cleanup(olderThanDays = null) {
    await this.initialize();

    const ttl = olderThanDays !== null ? olderThanDays : this.ttlDays;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - ttl);

    const files = await fs.readdir(this.storageDir);
    let removed = 0;
    let errors = 0;

    for (const file of files) {
      if (!file.endsWith('.json')) continue;

      try {
        const filePath = path.join(this.storageDir, file);
        const data = await fs.readFile(filePath, 'utf8');
        const operation = JSON.parse(data);

        const operationDate = new Date(operation.completedAt || operation.failedAt || operation.startedAt);

        if (operationDate < cutoffDate) {
          await fs.unlink(filePath);
          removed++;
        }
      } catch (error) {
        errors++;
        console.error(`Error cleaning up ${file}:`, error.message);
      }
    }

    return { removed, errors };
  }

  // Private helper methods

  async _loadOperation(operationId) {
    const filePath = path.join(this.storageDir, `${operationId}.json`);
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data);
  }

  async _saveOperation(operationId, operation) {
    const filePath = path.join(this.storageDir, `${operationId}.json`);
    await fs.writeFile(filePath, JSON.stringify(operation, null, 2));
  }

  async _cleanupOperation(operationId) {
    const filePath = path.join(this.storageDir, `${operationId}.json`);
    await fs.unlink(filePath);
  }

  _isExpired(operation) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.ttlDays);

    const operationDate = new Date(operation.completedAt || operation.failedAt || operation.startedAt);
    return operationDate < cutoffDate;
  }

  _calculateDuration(startedAt) {
    const start = new Date(startedAt).getTime();
    const end = Date.now();
    return end - start; // Duration in milliseconds
  }
}

// CLI interface
if (require.main === module) {
  const [,, command, ...args] = process.argv;

  const registry = new OperationRegistry();

  async function main() {
    switch (command) {
      case 'stats':
        const stats = await registry.getStatistics();
        console.log(JSON.stringify(stats, null, 2));
        break;

      case 'cleanup':
        const days = args[0] ? parseInt(args[0]) : null;
        const result = await registry.cleanup(days);
        console.log(`Cleanup complete: ${result.removed} removed, ${result.errors} errors`);
        break;

      case 'check':
        const operationType = args[0];
        const context = JSON.parse(args[1] || '{}');
        const retryCheck = await registry.canRetry(operationType, context);
        console.log(JSON.stringify(retryCheck, null, 2));
        break;

      default:
        console.log(`
Operation Registry - Idempotent Operation Framework

Usage:
  node operation-registry.js stats                              # Show statistics
  node operation-registry.js cleanup [days]                     # Cleanup old operations
  node operation-registry.js check <type> '<context-json>'      # Check if operation can retry

Examples:
  node operation-registry.js stats
  node operation-registry.js cleanup 30
  node operation-registry.js check deployMetadata '{"org":"production","files":["layout.xml"]}'
        `);
    }
  }

  main().catch(error => {
    console.error('Error:', error.message);
    process.exit(1);
  });
}

module.exports = { OperationRegistry };
