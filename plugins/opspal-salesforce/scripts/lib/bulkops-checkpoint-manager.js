#!/usr/bin/env node

/**
 * Bulk Operations Checkpoint Manager
 *
 * Manages checkpoint creation, resumption, and rollback data for bulk DML
 * operations. Enables interrupted operations to resume from last completed batch.
 *
 * Storage: orgs/{org-slug}/platforms/salesforce/{instance}/audit/bulkops/checkpoints/
 *
 * @module bulkops-checkpoint-manager
 * @version 1.0.0
 * @since 2026-02-08
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class CheckpointManager {
  constructor(options = {}) {
    this.baseDir = options.baseDir || process.cwd();
    this.orgSlug = options.orgSlug || process.env.ORG_SLUG || 'default';
    this.instance = options.instance || process.env.SF_TARGET_ORG || 'default';
  }

  /**
   * Get checkpoint directory for an operation
   */
  getCheckpointDir() {
    return path.join(
      this.baseDir, 'orgs', this.orgSlug,
      'platforms', 'salesforce', this.instance,
      'audit', 'bulkops', 'checkpoints'
    );
  }

  /**
   * Generate a unique operation ID
   */
  generateOperationId(operation, sobject) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const hash = crypto.randomBytes(4).toString('hex');
    return `${operation}-${sobject}-${timestamp}-${hash}`;
  }

  /**
   * Create initial checkpoint for a new operation
   */
  createCheckpoint(operationId, metadata) {
    const dir = this.getCheckpointDir();
    fs.mkdirSync(dir, { recursive: true });

    const checkpoint = {
      operationId,
      status: 'in_progress',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata: {
        operation: metadata.operation,
        sobject: metadata.sobject,
        orgAlias: metadata.orgAlias,
        totalRecords: metadata.totalRecords,
        batchSize: metadata.batchSize,
        isProduction: metadata.isProduction || false,
        csvPath: metadata.csvPath || null,
      },
      progress: {
        completedBatches: 0,
        totalBatches: Math.ceil(metadata.totalRecords / metadata.batchSize),
        processedRecords: 0,
        successCount: 0,
        failureCount: 0,
        lastCompletedBatchIndex: -1,
      },
      batches: [],
    };

    const filePath = path.join(dir, `${operationId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(checkpoint, null, 2));
    return checkpoint;
  }

  /**
   * Update checkpoint after batch completion
   */
  updateCheckpoint(operationId, batchResult) {
    const filePath = path.join(this.getCheckpointDir(), `${operationId}.json`);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Checkpoint not found: ${operationId}`);
    }

    const checkpoint = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    checkpoint.updatedAt = new Date().toISOString();
    checkpoint.progress.completedBatches++;
    checkpoint.progress.processedRecords += batchResult.recordCount;
    checkpoint.progress.successCount += batchResult.successCount;
    checkpoint.progress.failureCount += batchResult.failureCount;
    checkpoint.progress.lastCompletedBatchIndex = batchResult.batchIndex;

    checkpoint.batches.push({
      batchIndex: batchResult.batchIndex,
      recordCount: batchResult.recordCount,
      successCount: batchResult.successCount,
      failureCount: batchResult.failureCount,
      failedRecordIds: batchResult.failedRecordIds || [],
      completedAt: new Date().toISOString(),
    });

    fs.writeFileSync(filePath, JSON.stringify(checkpoint, null, 2));
    return checkpoint;
  }

  /**
   * Mark operation as complete
   */
  completeCheckpoint(operationId) {
    const filePath = path.join(this.getCheckpointDir(), `${operationId}.json`);
    if (!fs.existsSync(filePath)) return null;

    const checkpoint = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    checkpoint.status = 'completed';
    checkpoint.updatedAt = new Date().toISOString();
    checkpoint.completedAt = new Date().toISOString();

    fs.writeFileSync(filePath, JSON.stringify(checkpoint, null, 2));
    return checkpoint;
  }

  /**
   * Mark operation as failed
   */
  failCheckpoint(operationId, error) {
    const filePath = path.join(this.getCheckpointDir(), `${operationId}.json`);
    if (!fs.existsSync(filePath)) return null;

    const checkpoint = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    checkpoint.status = 'failed';
    checkpoint.updatedAt = new Date().toISOString();
    checkpoint.error = error;

    fs.writeFileSync(filePath, JSON.stringify(checkpoint, null, 2));
    return checkpoint;
  }

  /**
   * Load checkpoint for resumption
   */
  loadCheckpoint(operationId) {
    const filePath = path.join(this.getCheckpointDir(), `${operationId}.json`);
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }

  /**
   * List all operations (optionally filtered by status)
   */
  listOperations(status = null) {
    const dir = this.getCheckpointDir();
    if (!fs.existsSync(dir)) return [];

    return fs.readdirSync(dir)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        try {
          const cp = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
          return {
            operationId: cp.operationId,
            status: cp.status,
            operation: cp.metadata.operation,
            sobject: cp.metadata.sobject,
            totalRecords: cp.metadata.totalRecords,
            processedRecords: cp.progress.processedRecords,
            createdAt: cp.createdAt,
            updatedAt: cp.updatedAt,
          };
        } catch {
          return null;
        }
      })
      .filter(op => op && (!status || op.status === status))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }
}

module.exports = { CheckpointManager };

// CLI
if (require.main === module) {
  const args = process.argv.slice(2);
  const cmd = args[0];
  const manager = new CheckpointManager();

  if (cmd === 'list') {
    const ops = manager.listOperations(args[1] || null);
    if (ops.length === 0) {
      console.log('No operations found.');
    } else {
      console.log(`\n${'Operation'.padEnd(50)} ${'Status'.padEnd(12)} ${'Records'.padEnd(10)} Created`);
      console.log('-'.repeat(90));
      for (const op of ops) {
        console.log(
          `${op.operationId.padEnd(50)} ${op.status.padEnd(12)} ${String(op.processedRecords + '/' + op.totalRecords).padEnd(10)} ${op.createdAt}`
        );
      }
    }
  } else if (cmd === 'get' && args[1]) {
    const cp = manager.loadCheckpoint(args[1]);
    console.log(cp ? JSON.stringify(cp, null, 2) : 'Not found');
  } else {
    console.log('Usage: bulkops-checkpoint-manager.js <list [status]|get <operationId>>');
  }
}
