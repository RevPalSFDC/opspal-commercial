#!/usr/bin/env node

/**
 * Parallel Bulk Merge Executor - Phase 2 Optimization
 *
 * Extends BulkMergeExecutor with parallel batch processing using worker pool pattern.
 * Processes multiple merge pairs simultaneously for 5x throughput improvement.
 *
 * Features:
 * - Parallel execution with configurable worker pool (default: 5 workers)
 * - Job queue for distributing work across workers
 * - Progress tracking with real-time updates
 * - Same safety controls as serial executor
 * - Backward compatible with all existing options
 *
 * Performance:
 * - Serial: 49.5s per pair (1.2 pairs/min)
 * - Parallel (5 workers): ~10s per pair (6+ pairs/min)
 * - Expected: 5x faster for 100+ pairs
 *
 * Usage:
 *   node bulk-merge-executor-parallel.js --org <alias> --decisions <file> [options]
 *
 * Options (all from BulkMergeExecutor plus):
 *   --workers <n>       Number of parallel workers (default: 5, max: 10)
 *   --serial            Disable parallel processing (use serial mode)
 *
 * @version 3.3.0
 * @phase 5 - Phase 2 Optimization
 */

const BulkMergeExecutor = require('./bulk-merge-executor');

class ParallelBulkMergeExecutor extends BulkMergeExecutor {
  constructor(orgAlias, config = {}) {
    super(orgAlias, config);

    this.maxWorkers = config.maxWorkers || 5;
    this.useParallel = config.useParallel !== false; // Default true

    // Ensure maxWorkers is reasonable
    if (this.maxWorkers > 10) {
      console.warn(`⚠️  Warning: ${this.maxWorkers} workers may overwhelm Salesforce API. Limiting to 10.`);
      this.maxWorkers = 10;
    }

    this.activeWorkers = 0;
    this.workerStats = {
      totalStarted: 0,
      totalCompleted: 0,
      totalFailed: 0,
      avgDurationMs: 0,
      durations: []
    };
  }

  /**
   * Execute a batch with parallel processing
   * Overrides parent method to add parallelization
   */
  async executeBatch(batch, batchNumber) {
    if (!this.useParallel || batch.length === 1) {
      // Fall back to serial processing for single items or if disabled
      return super.executeBatch(batch, batchNumber);
    }

    const batchLog = {
      batch_id: `batch_${batchNumber}`,
      pair_ids: batch.map(d => d.pair_id),
      results: [],
      parallel_workers: this.maxWorkers,
      execution_mode: 'PARALLEL'
    };

    console.log(`   🚀 Processing ${batch.length} pairs with ${this.maxWorkers} parallel workers`);

    // Split batch into worker chunks
    const workerChunks = this.createWorkerChunks(batch, this.maxWorkers);

    // Execute all chunks in parallel
    const workerPromises = workerChunks.map((chunk, workerIndex) =>
      this.executeWorkerChunk(chunk, workerIndex + 1, batchNumber)
    );

    // Wait for all workers to complete
    const workerResults = await Promise.allSettled(workerPromises);

    // Aggregate results from all workers
    workerResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        batchLog.results.push(...result.value);
      } else {
        // Worker failed completely - mark all its pairs as failed
        const failedChunk = workerChunks[index];
        failedChunk.forEach(decision => {
          batchLog.results.push({
            pair_id: decision.pair_id,
            status: 'FAILED',
            error: `Worker ${index + 1} failed: ${result.reason}`,
            timestamp: new Date().toISOString()
          });
          console.log(`❌ ${decision.pair_id}: FAILED (worker error)`);
        });
      }
    });

    // Display summary
    const successCount = batchLog.results.filter(r => r.status === 'SUCCESS').length;
    const failedCount = batchLog.results.filter(r => r.status === 'FAILED').length;
    console.log(`   Batch complete: ${successCount} success, ${failedCount} failed`);

    return batchLog;
  }

  /**
   * Execute a chunk of work for a single worker
   */
  async executeWorkerChunk(chunk, workerIndex, batchNumber) {
    const results = [];
    this.activeWorkers++;

    try {
      for (const decision of chunk) {
        const startTime = Date.now();

        try {
          const result = await this.executeMerge(decision);
          results.push(result);

          const duration = Date.now() - startTime;
          this.workerStats.durations.push(duration);
          this.workerStats.totalCompleted++;

          const statusIcon = result.status === 'SUCCESS' ? '✅' : '❌';
          console.log(`${statusIcon} [Worker ${workerIndex}] ${decision.pair_id}: ${result.status} (${(duration/1000).toFixed(1)}s)`);

          if (result.error) {
            console.log(`   Error: ${result.error}`);
            this.workerStats.totalFailed++;
          }

        } catch (error) {
          results.push({
            pair_id: decision.pair_id,
            status: 'FAILED',
            error: error.message,
            timestamp: new Date().toISOString()
          });
          this.workerStats.totalFailed++;
          console.log(`❌ [Worker ${workerIndex}] ${decision.pair_id}: FAILED - ${error.message}`);
        }
      }
    } finally {
      this.activeWorkers--;
    }

    return results;
  }

  /**
   * Create worker chunks from batch
   * Distributes pairs evenly across workers
   */
  createWorkerChunks(batch, workerCount) {
    const actualWorkers = Math.min(workerCount, batch.length);
    const chunks = Array.from({ length: actualWorkers }, () => []);

    // Round-robin distribution
    batch.forEach((decision, index) => {
      const workerIndex = index % actualWorkers;
      chunks[workerIndex].push(decision);
    });

    return chunks.filter(chunk => chunk.length > 0);
  }

  /**
   * Get enhanced progress with worker stats
   */
  getProgress() {
    const baseProgress = super.getProgress();

    // Calculate average duration
    const avgDurationMs = this.workerStats.durations.length > 0
      ? this.workerStats.durations.reduce((a, b) => a + b, 0) / this.workerStats.durations.length
      : 0;

    return {
      ...baseProgress,
      parallel: {
        workers: this.maxWorkers,
        activeWorkers: this.activeWorkers,
        avgDurationSeconds: (avgDurationMs / 1000).toFixed(1),
        totalCompleted: this.workerStats.totalCompleted
      }
    };
  }

  /**
   * Save execution log with parallel stats
   */
  async saveExecutionLog() {
    // Add parallel execution stats to log
    this.executionLog.parallel_stats = {
      workers: this.maxWorkers,
      execution_mode: this.useParallel ? 'PARALLEL' : 'SERIAL',
      avg_duration_seconds: this.workerStats.durations.length > 0
        ? (this.workerStats.durations.reduce((a, b) => a + b, 0) / this.workerStats.durations.length / 1000).toFixed(1)
        : 0,
      total_merges: this.workerStats.totalCompleted,
      total_failures: this.workerStats.totalFailed
    };

    return super.saveExecutionLog();
  }
}

// CLI execution
if (require.main === module) {
  const fs = require('fs');
  const path = require('path');
  const args = process.argv.slice(2);

  if (args.includes('--help')) {
    console.log(`
Parallel Bulk Merge Executor v3.3.0

Usage:
  node bulk-merge-executor-parallel.js --org <alias> --decisions <file> [options]

Arguments:
  --org <alias>       Target Salesforce org alias (required)
  --decisions <file>  Path to decisions JSON file (required)

Options:
  --batch-size <n>    Pairs per batch (default: 10)
  --workers <n>       Parallel workers per batch (default: 5, max: 10)
  --dry-run           Validate without executing
  --max-pairs <n>     Limit total pairs to process
  --auto-approve      Skip confirmation for APPROVE decisions
  --serial            Disable parallel processing (use serial mode)

Performance:
  - Serial mode: ~49s per pair (1.2 pairs/min)
  - Parallel mode (5 workers): ~10s per pair (6+ pairs/min)
  - Expected: 5x faster for large batches

Examples:
  # Process with 5 parallel workers (default)
  node bulk-merge-executor-parallel.js --org production --decisions decisions.json

  # Use 10 workers for maximum throughput
  node bulk-merge-executor-parallel.js --org production --decisions decisions.json --workers 10

  # Dry run with parallel simulation
  node bulk-merge-executor-parallel.js --org sandbox --decisions decisions.json --dry-run

  # Serial mode (backward compatible)
  node bulk-merge-executor-parallel.js --org production --decisions decisions.json --serial
    `);
    process.exit(0);
  }

  const getArg = (name, defaultValue = null) => {
    const index = args.indexOf(`--${name}`);
    if (index === -1) return defaultValue;
    return args[index + 1] || defaultValue;
  };

  const hasFlag = (name) => args.includes(`--${name}`);

  const orgAlias = getArg('org');
  const decisionsFile = getArg('decisions');
  const batchSize = parseInt(getArg('batch-size', '10'));
  const maxWorkers = parseInt(getArg('workers', '5'));
  const maxPairs = getArg('max-pairs') ? parseInt(getArg('max-pairs')) : null;
  const dryRun = hasFlag('dry-run');
  const autoApprove = hasFlag('auto-approve');
  const useParallel = !hasFlag('serial');

  if (!orgAlias || !decisionsFile) {
    console.error('❌ Missing required arguments');
    console.error('\nUsage: node bulk-merge-executor-parallel.js --org <alias> --decisions <file> [options]');
    console.error('Run with --help for full documentation');
    process.exit(1);
  }

  // Load decisions
  const decisionsPath = path.resolve(decisionsFile);
  if (!fs.existsSync(decisionsPath)) {
    console.error(`❌ Decisions file not found: ${decisionsPath}`);
    process.exit(1);
  }

  const decisions = JSON.parse(fs.readFileSync(decisionsPath, 'utf8'));

  // Create parallel executor
  const executor = new ParallelBulkMergeExecutor(orgAlias, {
    batchSize,
    maxWorkers,
    useParallel,
    dryRun,
    autoApprove,
    maxPairs
  });

  console.log(`📊 Configuration:`);
  console.log(`   Org: ${orgAlias}`);
  console.log(`   Batch size: ${batchSize}`);
  console.log(`   Workers: ${maxWorkers} (${useParallel ? 'PARALLEL' : 'SERIAL'} mode)`);
  console.log(`   Dry run: ${dryRun ? 'Yes' : 'No'}`);
  if (maxPairs) {
    console.log(`   Max pairs: ${maxPairs}`);
  }
  console.log('');

  // Execute
  executor.execute(decisions)
    .then(result => {
      console.log('\n✅ Execution complete');

      // Display performance stats
      const progress = executor.getProgress();
      if (progress.parallel) {
        console.log(`\n📊 Performance Stats:`);
        console.log(`   Average time per merge: ${progress.parallel.avgDurationSeconds}s`);
        console.log(`   Total merges: ${progress.parallel.totalCompleted}`);
        console.log(`   Workers used: ${progress.parallel.workers}`);
      }

      process.exit(result.failed > 0 ? 1 : 0);
    })
    .catch(error => {
      console.error('\n❌ Execution failed:', error.message);
      if (error.stack) {
        console.error('\nStack trace:');
        console.error(error.stack);
      }
      process.exit(1);
    });
}

module.exports = ParallelBulkMergeExecutor;
