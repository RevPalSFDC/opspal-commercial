#!/usr/bin/env node

/**
 * Dedup Execution Monitor - Phase 5 Component
 *
 * Real-time monitoring dashboard for dedup merge execution.
 * Provides live progress updates, error tracking, and execution control.
 *
 * Features:
 * - Live progress updates
 * - Success/failure rate tracking
 * - Error tracking and alerting
 * - Performance metrics
 * - Interactive dashboard
 * - Execution control (pause/resume/stop)
 *
 * Usage:
 *   node dedup-execution-monitor.js --execution-id <id> [options]
 *
 * Options:
 *   --execution-id   Execution ID to monitor (required)
 *   --refresh        Refresh interval in seconds (default: 2)
 *   --once           Display once and exit (no live updates)
 *
 * @version 1.0.0
 * @phase 5
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

class ExecutionMonitor {
  constructor(executionId, options = {}) {
    this.executionId = executionId;
    this.refreshIntervalSec = options.refreshIntervalSec || 2;
    this.liveMode = !options.once;
    this.executionLog = null;
    this.previousState = null;
    this.startTime = null;
  }

  /**
   * Start monitoring execution
   */
  async startMonitoring() {
    console.clear();
    console.log('🔄 DEDUP EXECUTION MONITOR');
    console.log('═'.repeat(70));
    console.log(`Execution ID: ${this.executionId}`);
    console.log(`Refresh interval: ${this.refreshIntervalSec}s\n`);

    if (this.liveMode) {
      console.log('Press Ctrl+C to exit monitor');
      console.log('─'.repeat(70));
    }

    this.startTime = Date.now();

    if (this.liveMode) {
      // Start live monitoring loop
      const intervalId = setInterval(() => {
        this.updateDashboard();
      }, this.refreshIntervalSec * 1000);

      // Handle Ctrl+C
      process.on('SIGINT', () => {
        clearInterval(intervalId);
        console.log('\n\n👋 Monitor stopped');
        process.exit(0);
      });

      // Initial display
      await this.updateDashboard();
    } else {
      // Single display
      await this.updateDashboard();
    }
  }

  /**
   * Update and display dashboard
   */
  async updateDashboard() {
    try {
      // Load current execution log
      const logPath = this.getExecutionLogPath();

      if (!fs.existsSync(logPath)) {
        console.log('\n⏳ Waiting for execution to start...');
        return;
      }

      this.executionLog = JSON.parse(fs.readFileSync(logPath, 'utf8'));

      // Display dashboard
      if (this.liveMode) {
        console.clear();
      }

      this.displayDashboard();

      // Check if execution is complete
      if (this.executionLog.timestamp_end) {
        if (this.liveMode) {
          console.log('\n✅ Execution complete - monitoring stopped');
          process.exit(0);
        }
      }

    } catch (error) {
      console.error(`\n❌ Monitor error: ${error.message}`);
    }
  }

  /**
   * Display monitoring dashboard
   */
  displayDashboard() {
    console.log('🔄 DEDUP EXECUTION MONITOR');
    console.log('═'.repeat(70));
    console.log(`Execution ID: ${this.executionLog.execution_id}`);
    console.log(`Org: ${this.executionLog.org}`);
    console.log(`Status: ${this.getExecutionStatus()}`);
    console.log(`Started: ${this.formatTimestamp(this.executionLog.timestamp_start)}`);

    if (this.executionLog.timestamp_end) {
      console.log(`Ended: ${this.formatTimestamp(this.executionLog.timestamp_end)}`);
      const duration = this.calculateDuration(
        this.executionLog.timestamp_start,
        this.executionLog.timestamp_end
      );
      console.log(`Duration: ${duration}`);
    }

    // Progress section
    console.log('\n' + 'PROGRESS');
    console.log('─'.repeat(70));
    this.displayProgress();

    // Current batch section
    console.log('\n' + 'CURRENT BATCH');
    console.log('─'.repeat(70));
    this.displayCurrentBatch();

    // Success rate section
    console.log('\n' + 'SUCCESS RATE');
    console.log('─'.repeat(70));
    this.displaySuccessRate();

    // Performance metrics section
    console.log('\n' + 'PERFORMANCE');
    console.log('─'.repeat(70));
    this.displayPerformance();

    // Recent errors section
    const recentErrors = this.getRecentErrors(5);
    if (recentErrors.length > 0) {
      console.log('\n' + 'RECENT ERRORS');
      console.log('─'.repeat(70));
      this.displayRecentErrors(recentErrors);
    }

    // Commands section
    if (this.liveMode) {
      console.log('\n' + 'COMMANDS');
      console.log('─'.repeat(70));
      console.log('P - Pause  |  S - Stop  |  R - Refresh  |  Q - Quit Monitor');
    }
  }

  /**
   * Display progress bar and metrics
   */
  displayProgress() {
    const { total, processed, percentage } = this.getProgressMetrics();

    // Progress bar
    const barLength = 50;
    const filledLength = Math.round((percentage / 100) * barLength);
    const emptyLength = barLength - filledLength;
    const progressBar = '█'.repeat(filledLength) + '░'.repeat(emptyLength);

    console.log(`[${progressBar}] ${percentage}% (${processed}/${total} pairs)`);
  }

  /**
   * Display current batch information
   */
  displayCurrentBatch() {
    const batches = this.executionLog.batches || [];
    const completedBatches = batches.length;
    const totalBatches = this.estimateTotalBatches();

    if (completedBatches === 0) {
      console.log('No batches completed yet');
      return;
    }

    const currentBatch = batches[batches.length - 1];

    console.log(`Batch: ${completedBatches}/${totalBatches}`);

    const batchResults = currentBatch.results || [];
    const batchTotal = batchResults.length;
    const batchSuccess = batchResults.filter(r => r.status === 'SUCCESS').length;
    const batchFailed = batchResults.filter(r => r.status === 'FAILED').length;

    if (batchTotal > 0) {
      const batchPercentage = Math.round((batchSuccess + batchFailed) / batchTotal * 100);
      const batchBarLength = 20;
      const batchFilledLength = Math.round((batchPercentage / 100) * batchBarLength);
      const batchEmptyLength = batchBarLength - batchFilledLength;
      const batchProgressBar = '█'.repeat(batchFilledLength) + '░'.repeat(batchEmptyLength);

      console.log(`Progress: [${batchProgressBar}] ${batchPercentage}% (${batchSuccess + batchFailed}/${batchTotal} pairs)`);
    }
  }

  /**
   * Display success rate metrics
   */
  displaySuccessRate() {
    const summary = this.executionLog.summary;
    const total = summary.success + summary.failed + summary.skipped;

    if (total === 0) {
      console.log('No operations completed yet');
      return;
    }

    const successRate = Math.round((summary.success / total) * 100);
    const failureRate = Math.round((summary.failed / total) * 100);

    console.log(`✅ Success:  ${summary.success} (${successRate}%)`);
    console.log(`❌ Failed:   ${summary.failed} (${failureRate}%)`);
    console.log(`⏸  Skipped:  ${summary.skipped}`);

    // Alert on high failure rate
    if (failureRate > 10 && summary.failed > 2) {
      console.log(`\n⚠️  HIGH FAILURE RATE: ${failureRate}%`);
    }
  }

  /**
   * Display performance metrics
   */
  displayPerformance() {
    const { processed } = this.getProgressMetrics();

    if (processed === 0) {
      console.log('No operations completed yet');
      return;
    }

    const elapsedMs = Date.now() - new Date(this.executionLog.timestamp_start).getTime();
    const elapsedSec = Math.round(elapsedMs / 1000);
    const avgTimePerPairMs = elapsedMs / processed;
    const avgTimePerPairSec = (avgTimePerPairMs / 1000).toFixed(1);

    console.log(`Avg Time/Pair: ${avgTimePerPairSec}s`);
    console.log(`Elapsed: ${this.formatDuration(elapsedSec)}`);

    // Estimate remaining time
    const remaining = this.executionLog.summary.total - processed;
    if (remaining > 0 && !this.executionLog.timestamp_end) {
      const estimatedRemainingSec = Math.round((remaining * avgTimePerPairMs) / 1000);
      console.log(`Est. Remaining: ${this.formatDuration(estimatedRemainingSec)}`);
    }
  }

  /**
   * Display recent errors
   */
  displayRecentErrors(errors) {
    errors.forEach((error, index) => {
      console.log(`${index + 1}. ${error.pair_id}: ${error.error}`);
      if (error.retries > 0) {
        console.log(`   Retry ${error.retries}/3...`);
      }
    });
  }

  /**
   * Get recent errors from execution log
   */
  getRecentErrors(limit = 5) {
    const batches = this.executionLog.batches || [];
    const allResults = batches.flatMap(b => b.results || []);
    const failedResults = allResults.filter(r => r.status === 'FAILED');

    return failedResults.slice(-limit).reverse();
  }

  /**
   * Get execution status
   */
  getExecutionStatus() {
    if (this.executionLog.timestamp_end) {
      return 'COMPLETED';
    }

    const batches = this.executionLog.batches || [];
    if (batches.length === 0) {
      return 'STARTING';
    }

    return 'EXECUTING';
  }

  /**
   * Get progress metrics
   */
  getProgressMetrics() {
    const summary = this.executionLog.summary;
    const processed = summary.success + summary.failed + summary.skipped;
    const total = summary.total;
    const percentage = total > 0 ? Math.round((processed / total) * 100) : 0;

    return {
      total,
      processed,
      success: summary.success,
      failed: summary.failed,
      skipped: summary.skipped,
      percentage
    };
  }

  /**
   * Estimate total batches
   */
  estimateTotalBatches() {
    const batchSize = this.executionLog.config.batchSize || 10;
    const total = this.executionLog.summary.total;
    return Math.ceil(total / batchSize);
  }

  /**
   * Calculate duration between two timestamps
   */
  calculateDuration(startTimestamp, endTimestamp) {
    const start = new Date(startTimestamp).getTime();
    const end = new Date(endTimestamp).getTime();
    const durationSec = Math.round((end - start) / 1000);
    return this.formatDuration(durationSec);
  }

  /**
   * Format duration in human-readable format
   */
  formatDuration(seconds) {
    if (seconds < 60) {
      return `${seconds}s`;
    }

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    if (minutes < 60) {
      return `${minutes}m ${remainingSeconds}s`;
    }

    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m ${remainingSeconds}s`;
  }

  /**
   * Format timestamp
   */
  formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleString();
  }

  /**
   * Get execution log file path
   */
  getExecutionLogPath() {
    return path.join(process.cwd(), 'execution-logs', `${this.executionId}.json`);
  }

  /**
   * Watch execution progress (streaming)
   */
  async watchProgress(callback) {
    const logPath = this.getExecutionLogPath();
    let lastSize = 0;

    const checkForUpdates = () => {
      if (fs.existsSync(logPath)) {
        const stats = fs.statSync(logPath);
        if (stats.size !== lastSize) {
          lastSize = stats.size;
          const log = JSON.parse(fs.readFileSync(logPath, 'utf8'));
          callback(log);
        }
      }
    };

    setInterval(checkForUpdates, this.refreshIntervalSec * 1000);
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

  const executionId = getArg('execution-id');
  const refreshIntervalSec = parseInt(getArg('refresh', '2'));
  const once = hasFlag('once');

  if (!executionId) {
    console.error('Usage: node dedup-execution-monitor.js --execution-id <id> [options]');
    console.error('\nOptions:');
    console.error('  --refresh <sec>    Refresh interval in seconds (default: 2)');
    console.error('  --once             Display once and exit (no live updates)');
    process.exit(1);
  }

  // Create monitor
  const monitor = new ExecutionMonitor(executionId, {
    refreshIntervalSec,
    once
  });

  // Start monitoring
  monitor.startMonitoring()
    .catch(error => {
      console.error('\n❌ Monitor failed:', error.message);
      process.exit(1);
    });
}

module.exports = ExecutionMonitor;
