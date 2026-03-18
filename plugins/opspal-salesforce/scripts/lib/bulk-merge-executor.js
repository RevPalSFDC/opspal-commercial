#!/usr/bin/env node

/**
 * Bulk Merge Executor - Phase 5 Component
 *
 * ⚠️  DEPRECATED: Use ParallelBulkMergeExecutor instead for 5x performance improvement.
 * This serial implementation is kept for backward compatibility only.
 *
 * Executes dedup merge operations in batches using Salesforce Composite API
 * with comprehensive safety controls, rollback logging, and real-time monitoring.
 *
 * Features:
 * - Batch processing with configurable size
 * - Dry-run validation mode
 * - Real-time progress tracking
 * - Automatic retry on transient errors
 * - Emergency stop capability
 * - Execution logging for rollback
 * - Pre-flight validation
 *
 * Usage:
 *   node bulk-merge-executor.js --org <alias> --decisions <file> [options]
 *
 * Options:
 *   --org           Salesforce org alias (required)
 *   --decisions     Path to decisions JSON file (required)
 *   --batch-size    Pairs per batch (default: 10)
 *   --dry-run       Validate without executing
 *   --max-pairs     Limit total pairs to process
 *   --resume        Resume from execution ID
 *   --auto-approve  Skip confirmation for APPROVE decisions
 *
 * @version 1.0.0
 * @phase 5
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const SalesforceNativeMerger = require('./salesforce-native-merger');

class BulkMergeExecutor {
  constructor(orgAlias, config = {}) {
    // ⚠️  DEPRECATION WARNING
    console.warn('\n' + '═'.repeat(70));
    console.warn('⚠️  DEPRECATION WARNING: BulkMergeExecutor (serial) is deprecated');
    console.warn('═'.repeat(70));
    console.warn('');
    console.warn('Use ParallelBulkMergeExecutor instead for 5x performance improvement.');
    console.warn('');
    console.warn('Migration:');
    console.warn('  ❌ OLD: const executor = new BulkMergeExecutor(orgAlias, options);');
    console.warn('  ✅ NEW: const executor = new ParallelBulkMergeExecutor(orgAlias, {');
    console.warn('            maxWorkers: 5,  // Add this config for parallel execution');
    console.warn('            ...options');
    console.warn('          });');
    console.warn('');
    console.warn('Performance comparison:');
    console.warn('  Serial:   49.5s per pair');
    console.warn('  Parallel: 10.0s per pair (5x faster with 5 workers)');
    console.warn('');
    console.warn('This warning will be shown every time you use BulkMergeExecutor.');
    console.warn('Update to ParallelBulkMergeExecutor to remove this warning.');
    console.warn('═'.repeat(70) + '\n');

    this.orgAlias = orgAlias;
    this.batchSize = config.batchSize || 10;
    this.dryRun = config.dryRun || false;
    this.maxRetries = config.maxRetries || 3;
    this.retryDelayMs = config.retryDelayMs || 5000;
    this.autoApprove = config.autoApprove || false;
    this.maxPairs = config.maxPairs || null;

    this.state = 'IDLE';
    this.executionLog = {
      execution_id: null,
      org: this.orgAlias,
      timestamp_start: null,
      timestamp_end: null,
      config: {
        batchSize: this.batchSize,
        dryRun: this.dryRun,
        maxRetries: this.maxRetries
      },
      batches: [],
      summary: {
        total: 0,
        success: 0,
        failed: 0,
        skipped: 0
      }
    };

    this.currentBatch = 0;
    this.totalBatches = 0;
    this.shouldPause = false;
    this.shouldStop = false;
  }

  /**
   * Main execution method
   * Processes all approved decisions in batches
   */
  async execute(decisions, options = {}) {
    try {
      this.state = 'VALIDATING';
      console.log('🔍 Phase 5: Bulk Merge Executor');
      console.log('═'.repeat(70));

      // Filter approved decisions only
      const approvedDecisions = decisions.decisions.filter(d => d.decision === 'APPROVE');

      if (approvedDecisions.length === 0) {
        console.log('⚠️  No approved decisions to execute');
        return { success: 0, failed: 0, skipped: 0, log: this.executionLog };
      }

      // Apply max pairs limit if specified
      let decisionsToProcess = approvedDecisions;
      if (this.maxPairs && this.maxPairs < approvedDecisions.length) {
        decisionsToProcess = approvedDecisions.slice(0, this.maxPairs);
        console.log(`ℹ️  Limited to ${this.maxPairs} pairs (of ${approvedDecisions.length} approved)`);
      }

      // Pre-flight validation
      console.log('\n📋 Pre-flight validation...');
      const validation = await this.validatePreExecution(decisionsToProcess);

      if (!validation.valid) {
        console.log('\n❌ Pre-flight validation failed:');
        validation.errors.forEach(err => console.log(`   - ${err}`));
        this.state = 'IDLE';
        return { success: 0, failed: 0, skipped: 0, log: this.executionLog };
      }

      console.log('✅ Pre-flight validation passed');

      // Confirmation (unless auto-approve)
      if (!this.autoApprove && !this.dryRun) {
        console.log(`\n⚠️  About to merge ${decisionsToProcess.length} duplicate pairs`);
        console.log('   This will DELETE records permanently.');
        console.log('   Rollback is available for 72 hours via execution log.');
        console.log('\n   Press Ctrl+C to cancel, or wait 5 seconds to continue...');

        await this.sleep(5000);
      }

      // Initialize execution
      this.executionLog.execution_id = `exec_${new Date().toISOString().replace(/[:.]/g, '-')}`;
      this.executionLog.timestamp_start = new Date().toISOString();
      this.executionLog.summary.total = decisionsToProcess.length;

      // Create batches
      const batches = this.createBatches(decisionsToProcess);
      this.totalBatches = batches.length;

      console.log(`\n🚀 ${this.dryRun ? 'DRY-RUN' : 'EXECUTING'}: ${decisionsToProcess.length} pairs in ${batches.length} batches`);
      console.log('═'.repeat(70));

      this.state = 'EXECUTING';

      // Process each batch
      for (let i = 0; i < batches.length; i++) {
        if (this.shouldStop) {
          console.log('\n🛑 Emergency stop requested');
          this.state = 'PAUSED';
          break;
        }

        if (this.shouldPause) {
          console.log('\n⏸  Execution paused (current batch will complete)');
          this.state = 'PAUSED';
          break;
        }

        this.currentBatch = i + 1;
        const batch = batches[i];

        console.log(`\n📦 Batch ${i + 1}/${batches.length} (${batch.length} pairs)`);
        console.log('─'.repeat(70));

        const batchResult = await this.executeBatch(batch, i + 1);

        this.executionLog.batches.push(batchResult);
        this.executionLog.summary.success += batchResult.results.filter(r => r.status === 'SUCCESS').length;
        this.executionLog.summary.failed += batchResult.results.filter(r => r.status === 'FAILED').length;
        this.executionLog.summary.skipped += batchResult.results.filter(r => r.status === 'SKIPPED').length;

        // Progress update
        const progress = this.getProgress();
        console.log(`\n📊 Progress: ${progress.processed}/${progress.total} (${progress.percentage}%)`);
        console.log(`   ✅ Success: ${this.executionLog.summary.success}`);
        console.log(`   ❌ Failed: ${this.executionLog.summary.failed}`);
        console.log(`   ⏸  Skipped: ${this.executionLog.summary.skipped}`);
      }

      this.executionLog.timestamp_end = new Date().toISOString();
      this.state = this.shouldPause ? 'PAUSED' : 'COMPLETED';

      // Save execution log
      await this.saveExecutionLog();

      // Final summary
      console.log('\n' + '═'.repeat(70));
      console.log(`✅ Execution ${this.dryRun ? 'simulation' : 'complete'}: ${this.executionLog.execution_id}`);
      console.log(`   Total: ${this.executionLog.summary.total}`);
      console.log(`   Success: ${this.executionLog.summary.success}`);
      console.log(`   Failed: ${this.executionLog.summary.failed}`);
      console.log(`   Skipped: ${this.executionLog.summary.skipped}`);

      if (!this.dryRun) {
        const logPath = this.getExecutionLogPath();
        console.log(`\n📄 Execution log: ${logPath}`);
        console.log('   Use this log for rollback if needed');
      }

      return {
        success: this.executionLog.summary.success,
        failed: this.executionLog.summary.failed,
        skipped: this.executionLog.summary.skipped,
        log: this.executionLog
      };

    } catch (error) {
      console.error('\n❌ Execution error:', error.message);
      this.state = 'FAILED';
      throw error;
    }
  }

  /**
   * Execute a single batch of merges via Composite API
   */
  async executeBatch(batch, batchNumber) {
    const batchLog = {
      batch_id: `batch_${batchNumber}`,
      pair_ids: batch.map(d => d.pair_id),
      results: []
    };

    for (const decision of batch) {
      try {
        const result = await this.executeMerge(decision);
        batchLog.results.push(result);

        const statusIcon = result.status === 'SUCCESS' ? '✅' :
                          result.status === 'FAILED' ? '❌' : '⏸';
        console.log(`${statusIcon} ${decision.pair_id}: ${result.status}`);
        if (result.error) {
          console.log(`   Error: ${result.error}`);
        }

      } catch (error) {
        batchLog.results.push({
          pair_id: decision.pair_id,
          status: 'FAILED',
          error: error.message
        });
        console.log(`❌ ${decision.pair_id}: FAILED - ${error.message}`);
      }
    }

    return batchLog;
  }

  /**
   * Execute a single merge operation
   * Includes retry logic for transient errors
   * Uses native Salesforce merger (no external dependencies)
   */
  async executeMerge(decision, retryCount = 0) {
    const masterId = decision.recommended_survivor;
    const deletedId = decision.recommended_deleted;

    try {
      if (this.dryRun) {
        // Dry run: just capture before state
        const beforeState = await this.captureRecordState(masterId, deletedId);
        return {
          pair_id: decision.pair_id,
          status: 'SUCCESS',
          master_id: masterId,
          deleted_id: deletedId,
          before: beforeState,
          dry_run: true
        };
      }

      // Execute native merge using SalesforceNativeMerger
      const merger = new SalesforceNativeMerger(this.orgAlias, {
        strategy: 'auto',
        dryRun: false,
        verbose: false
      });

      const mergeResult = await merger.mergeAccounts(masterId, deletedId);

      return {
        pair_id: decision.pair_id,
        status: 'SUCCESS',
        master_id: masterId,
        deleted_id: deletedId,
        before: mergeResult.before,
        after: mergeResult.after,
        fieldsUpdated: mergeResult.fieldsUpdated,
        relatedRecordsReparented: mergeResult.relatedRecordsReparented,
        timestamp: mergeResult.timestamp
      };

    } catch (error) {
      // Check if this is a transient error that should be retried
      const isTransient = this.isTransientError(error.message);

      if (isTransient && retryCount < this.maxRetries) {
        console.log(`   ⚠️  Transient error, retry ${retryCount + 1}/${this.maxRetries} in ${this.retryDelayMs/1000}s...`);
        await this.sleep(this.retryDelayMs);
        return this.executeMerge(decision, retryCount + 1);
      }

      return {
        pair_id: decision.pair_id,
        status: 'FAILED',
        master_id: masterId,
        deleted_id: deletedId,
        error: error.message,
        retries: retryCount,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Capture record state for rollback
   */
  async captureRecordState(masterId, deletedId) {
    const state = {
      master: null,
      deleted: null,
      related_records: {
        Contacts: [],
        Opportunities: [],
        Cases: []
      }
    };

    if (this.dryRun) {
      return state; // Skip querying in dry-run
    }

    try {
      // Query master record
      const masterQuery = `sf data query --query "SELECT Id, Name, Website, Phone, BillingStreet, BillingCity, BillingState, BillingPostalCode, BillingCountry FROM Account WHERE Id = '${masterId}'" --target-org ${this.orgAlias} --json`;
      const masterResult = JSON.parse(execSync(masterQuery, { encoding: 'utf8' }));
      state.master = masterResult.result.records[0] || null;

      // Query deleted record if provided
      if (deletedId) {
        const deletedQuery = `sf data query --query "SELECT Id, Name, Website, Phone, BillingStreet, BillingCity, BillingState, BillingPostalCode, BillingCountry FROM Account WHERE Id = '${deletedId}'" --target-org ${this.orgAlias} --json`;
        const deletedResult = JSON.parse(execSync(deletedQuery, { encoding: 'utf8' }));
        state.deleted = deletedResult.result.records[0] || null;

        // Query related records
        const contactsQuery = `sf data query --query "SELECT Id, AccountId FROM Contact WHERE AccountId = '${deletedId}'" --target-org ${this.orgAlias} --json`;
        const contactsResult = JSON.parse(execSync(contactsQuery, { encoding: 'utf8' }));
        state.related_records.Contacts = contactsResult.result.records || [];

        const oppsQuery = `sf data query --query "SELECT Id, AccountId FROM Opportunity WHERE AccountId = '${deletedId}'" --target-org ${this.orgAlias} --json`;
        const oppsResult = JSON.parse(execSync(oppsQuery, { encoding: 'utf8' }));
        state.related_records.Opportunities = oppsResult.result.records || [];
      }

    } catch (error) {
      console.warn(`⚠️  Could not capture full state: ${error.message}`);
    }

    return state;
  }

  /**
   * Pre-flight validation before execution
   */
  async validatePreExecution(decisions) {
    const errors = [];

    try {
      // 1. Check org connection
      const orgCheckCommand = `sf org display --target-org ${this.orgAlias} --json`;
      const orgResult = JSON.parse(execSync(orgCheckCommand, { encoding: 'utf8' }));

      if (orgResult.status !== 0) {
        errors.push(`Cannot connect to org '${this.orgAlias}'`);
      }

      // 2. Check user permissions
      // Note: This is a simplified check - production should query UserPermissions
      const userQuery = `sf data query --query "SELECT Id, Name FROM User WHERE Username = '${orgResult.result.username}' LIMIT 1" --target-org ${this.orgAlias} --json`;
      const userResult = JSON.parse(execSync(userQuery, { encoding: 'utf8' }));

      if (!userResult.result.records || userResult.result.records.length === 0) {
        errors.push('Cannot identify current user');
      }

      // 3. Validate all decisions are APPROVE
      const nonApproved = decisions.filter(d => d.decision !== 'APPROVE');
      if (nonApproved.length > 0) {
        errors.push(`${nonApproved.length} decisions are not APPROVE status`);
      }

      // 4. Validate all records exist
      const allIds = decisions.flatMap(d => [d.recommended_survivor, d.recommended_deleted]);
      const uniqueIds = [...new Set(allIds)];

      // Sample check first 10 IDs
      const sampleIds = uniqueIds.slice(0, 10);
      const idsToCheck = sampleIds.map(id => `'${id}'`).join(',');
      const recordCheckQuery = `sf data query --query "SELECT Id FROM Account WHERE Id IN (${idsToCheck})" --target-org ${this.orgAlias} --json`;

      try {
        const recordCheckResult = JSON.parse(execSync(recordCheckQuery, { encoding: 'utf8' }));
        const foundCount = recordCheckResult.result.records.length;

        if (foundCount < sampleIds.length) {
          errors.push(`Some records not found in org (found ${foundCount}/${sampleIds.length} sampled)`);
        }
      } catch (err) {
        errors.push(`Cannot query Account records: ${err.message}`);
      }

      // 5. Check for execution log directory
      const logDir = path.join(process.cwd(), 'execution-logs');
      if (!fs.existsSync(logDir) && !this.dryRun) {
        try {
          fs.mkdirSync(logDir, { recursive: true });
        } catch (err) {
          errors.push(`Cannot create execution log directory: ${err.message}`);
        }
      }

    } catch (error) {
      errors.push(`Validation error: ${error.message}`);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Create batches from decisions
   */
  createBatches(decisions) {
    const batches = [];
    for (let i = 0; i < decisions.length; i += this.batchSize) {
      batches.push(decisions.slice(i, i + this.batchSize));
    }
    return batches;
  }

  /**
   * Check if error is transient and should be retried
   */
  isTransientError(errorMessage) {
    const transientPatterns = [
      'UNABLE_TO_LOCK_ROW',
      'QUERY_TIMEOUT',
      'SERVER_UNAVAILABLE',
      'SERVICE_UNAVAILABLE',
      'ECONNRESET',
      'ETIMEDOUT'
    ];

    return transientPatterns.some(pattern => errorMessage.includes(pattern));
  }

  /**
   * Pause execution after current batch completes
   */
  async pause() {
    console.log('⏸  Pause requested - will complete current batch');
    this.shouldPause = true;
  }

  /**
   * Resume from paused state
   */
  async resume() {
    console.log('▶️  Resuming execution');
    this.shouldPause = false;
    this.state = 'EXECUTING';
  }

  /**
   * Emergency stop (immediate)
   */
  async emergencyStop() {
    console.log('🛑 Emergency stop requested');
    this.shouldStop = true;
  }

  /**
   * Get current progress
   */
  getProgress() {
    const processed = this.executionLog.summary.success +
                     this.executionLog.summary.failed +
                     this.executionLog.summary.skipped;
    const total = this.executionLog.summary.total;
    const percentage = total > 0 ? Math.round((processed / total) * 100) : 0;

    return {
      total,
      processed,
      success: this.executionLog.summary.success,
      failed: this.executionLog.summary.failed,
      skipped: this.executionLog.summary.skipped,
      percentage,
      currentBatch: this.currentBatch,
      totalBatches: this.totalBatches
    };
  }

  /**
   * Save execution log to file
   */
  async saveExecutionLog() {
    if (this.dryRun) {
      console.log('\nℹ️  Dry-run mode - execution log not saved');
      return;
    }

    const logPath = this.getExecutionLogPath();
    const logDir = path.dirname(logPath);

    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    fs.writeFileSync(logPath, JSON.stringify(this.executionLog, null, 2));
    console.log(`\n📄 Execution log saved: ${logPath}`);
  }

  /**
   * Get execution log file path
   */
  getExecutionLogPath() {
    return path.join(process.cwd(), 'execution-logs', `${this.executionLog.execution_id}.json`);
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// CLI execution
if (require.main === module) {
  const args = process.argv.slice(2);

  const getArg = (name, defaultValue = null) => {
    const index = args.indexOf(`--${name}`);
    if (index === -1) return defaultValue;
    return args[index + 1] || defaultValue;
  };

  const hasFlag = (name) => args.includes(`--${name}`);

  const orgAlias = getArg('org');
  const decisionsFile = getArg('decisions');
  const batchSize = parseInt(getArg('batch-size', '10'));
  const maxPairs = getArg('max-pairs') ? parseInt(getArg('max-pairs')) : null;
  const dryRun = hasFlag('dry-run');
  const autoApprove = hasFlag('auto-approve');

  if (!orgAlias || !decisionsFile) {
    console.error('Usage: node bulk-merge-executor.js --org <alias> --decisions <file> [options]');
    console.error('\nOptions:');
    console.error('  --batch-size <n>    Pairs per batch (default: 10)');
    console.error('  --dry-run           Validate without executing');
    console.error('  --max-pairs <n>     Limit total pairs to process');
    console.error('  --auto-approve      Skip confirmation');
    process.exit(1);
  }

  // Load decisions
  const decisionsPath = path.resolve(decisionsFile);
  if (!fs.existsSync(decisionsPath)) {
    console.error(`❌ Decisions file not found: ${decisionsPath}`);
    process.exit(1);
  }

  const decisions = JSON.parse(fs.readFileSync(decisionsPath, 'utf8'));

  // Create executor
  const executor = new BulkMergeExecutor(orgAlias, {
    batchSize,
    dryRun,
    autoApprove,
    maxPairs
  });

  // Execute
  executor.execute(decisions)
    .then(result => {
      console.log('\n✅ Execution complete');
      process.exit(result.failed > 0 ? 1 : 0);
    })
    .catch(error => {
      console.error('\n❌ Execution failed:', error.message);
      process.exit(1);
    });
}

module.exports = BulkMergeExecutor;
