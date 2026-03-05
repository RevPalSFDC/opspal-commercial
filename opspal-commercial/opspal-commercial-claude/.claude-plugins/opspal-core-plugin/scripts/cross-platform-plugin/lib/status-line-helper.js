#!/usr/bin/env node

/**
 * StatusLine Helper Library
 *
 * Purpose: Provides real-time status updates during long-running operations
 *          using the statusLine JSON output pattern from claude-code-hooks-mastery.
 *
 * Pattern: Adopted from claude-code-hooks-mastery repository
 *          https://github.com/disler/claude-code-hooks-mastery
 *
 * Usage:
 *   const StatusLine = require('./status-line-helper');
 *   const status = new StatusLine();
 *
 *   status.update('Processing item 1/100', { progress: 1 });
 *   status.update('Processing item 50/100', { progress: 50 });
 *   status.complete('Processed 100 items');
 *
 * Features:
 *   - Real-time progress updates
 *   - Percentage calculation
 *   - Time estimation
 *   - Status templates
 *   - JSON output for hooks
 */

class StatusLine {
  constructor(options = {}) {
    this.options = {
      enabled: process.env.ENABLE_STATUS_LINE !== '0',
      showProgress: options.showProgress !== false,
      showTime: options.showTime !== false,
      template: options.template || 'default',
      ...options
    };

    this.startTime = Date.now();
    this.lastUpdate = Date.now();
    this.totalItems = options.total || 0;
    this.processedItems = 0;
  }

  /**
   * Update status line with current progress
   * @param {string} message - Status message
   * @param {object} data - Additional data (progress, current, total, etc.)
   */
  update(message, data = {}) {
    if (!this.options.enabled) return;

    this.lastUpdate = Date.now();

    if (data.current !== undefined && data.total !== undefined) {
      this.processedItems = data.current;
      this.totalItems = data.total;
    } else if (data.progress !== undefined) {
      this.processedItems = data.progress;
    }

    const statusData = this._buildStatusData(message, data);

    // Output to stderr for hooks
    if (process.env.HOOK_CONTEXT === '1') {
      console.error(JSON.stringify({
        statusLine: statusData.statusLine
      }));
    } else {
      // Output to stdout for scripts
      console.log(this._formatStatus(statusData));
    }
  }

  /**
   * Mark operation as complete
   * @param {string} message - Completion message
   * @param {object} data - Additional data
   */
  complete(message, data = {}) {
    if (!this.options.enabled) return;

    const elapsed = this._getElapsedTime();
    const statusData = this._buildStatusData(message, {
      ...data,
      complete: true,
      elapsed
    });

    if (process.env.HOOK_CONTEXT === '1') {
      console.error(JSON.stringify({
        statusLine: statusData.statusLine
      }));
    } else {
      console.log(this._formatStatus(statusData));
    }
  }

  /**
   * Mark operation as failed
   * @param {string} message - Error message
   * @param {object} data - Additional data
   */
  fail(message, data = {}) {
    if (!this.options.enabled) return;

    const elapsed = this._getElapsedTime();
    const statusData = this._buildStatusData(message, {
      ...data,
      failed: true,
      elapsed
    });

    if (process.env.HOOK_CONTEXT === '1') {
      console.error(JSON.stringify({
        statusLine: statusData.statusLine
      }));
    } else {
      console.error(this._formatStatus(statusData));
    }
  }

  /**
   * Build status data object
   * @private
   */
  _buildStatusData(message, data) {
    const percentage = this._calculatePercentage();
    const eta = this._estimateTimeRemaining();

    let statusLine = message;

    // Add progress indicator
    if (this.options.showProgress && this.totalItems > 0) {
      statusLine += ` [${this.processedItems}/${this.totalItems}]`;
    }

    // Add percentage
    if (percentage !== null && this.options.showProgress) {
      statusLine += ` (${percentage}%)`;
    }

    // Add ETA
    if (eta && this.options.showTime && !data.complete && !data.failed) {
      statusLine += ` - ETA: ${eta}`;
    }

    // Add elapsed time for completed operations
    if (data.elapsed && (data.complete || data.failed)) {
      statusLine += ` - Completed in ${data.elapsed}`;
    }

    // Add status indicator
    if (data.complete) {
      statusLine = `✅ ${statusLine}`;
    } else if (data.failed) {
      statusLine = `❌ ${statusLine}`;
    } else {
      statusLine = `⏳ ${statusLine}`;
    }

    return {
      statusLine,
      message,
      percentage,
      eta,
      processed: this.processedItems,
      total: this.totalItems,
      ...data
    };
  }

  /**
   * Calculate progress percentage
   * @private
   */
  _calculatePercentage() {
    if (this.totalItems === 0) return null;
    return Math.round((this.processedItems / this.totalItems) * 100);
  }

  /**
   * Estimate time remaining
   * @private
   */
  _estimateTimeRemaining() {
    if (this.processedItems === 0 || this.totalItems === 0) return null;

    const elapsed = Date.now() - this.startTime;
    const avgTimePerItem = elapsed / this.processedItems;
    const remainingItems = this.totalItems - this.processedItems;
    const remainingMs = avgTimePerItem * remainingItems;

    return this._formatDuration(remainingMs);
  }

  /**
   * Get elapsed time
   * @private
   */
  _getElapsedTime() {
    const elapsed = Date.now() - this.startTime;
    return this._formatDuration(elapsed);
  }

  /**
   * Format duration in human-readable format
   * @private
   */
  _formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  /**
   * Format status for console output
   * @private
   */
  _formatStatus(statusData) {
    return statusData.statusLine;
  }
}

/**
 * Create a status line for batch operations
 * @param {number} total - Total number of items
 * @param {string} itemName - Name of items being processed (singular)
 */
StatusLine.forBatch = function(total, itemName = 'item', options = {}) {
  const status = new StatusLine({ total, ...options });

  return {
    start: (message) => {
      status.update(message || `Starting ${itemName} processing`, { current: 0, total });
    },

    progress: (current, customMessage) => {
      const message = customMessage || `Processing ${itemName} ${current}/${total}`;
      status.update(message, { current, total });
    },

    complete: (customMessage) => {
      const message = customMessage || `Processed all ${total} ${itemName}s successfully`;
      status.complete(message, { current: total, total });
    },

    fail: (error, current) => {
      const message = `Failed at ${itemName} ${current}/${total}: ${error}`;
      status.fail(message, { current, total });
    }
  };
};

/**
 * CLI usage
 */
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === 'demo') {
    // Demo the status line
    const status = new StatusLine({ total: 100 });

    status.update('Starting batch processing', { current: 0, total: 100 });

    let i = 0;
    const interval = setInterval(() => {
      i += 10;
      status.update(`Processing items`, { current: i, total: 100 });

      if (i >= 100) {
        clearInterval(interval);
        status.complete('Batch processing complete');
      }
    }, 500);

  } else if (command === 'test-batch') {
    // Test batch helper
    const batch = StatusLine.forBatch(50, 'record');

    batch.start();

    let i = 0;
    const interval = setInterval(() => {
      i += 5;
      batch.progress(i);

      if (i >= 50) {
        clearInterval(interval);
        batch.complete();
      }
    }, 300);

  } else {
    console.log('StatusLine Helper - Usage:');
    console.log('  node status-line-helper.js demo       # Run demo');
    console.log('  node status-line-helper.js test-batch # Test batch helper');
    console.log('');
    console.log('Library usage:');
    console.log('  const StatusLine = require("./status-line-helper");');
    console.log('  const status = new StatusLine({ total: 100 });');
    console.log('  status.update("Processing", { current: 50, total: 100 });');
    console.log('  status.complete("Done");');
  }
}

module.exports = StatusLine;
