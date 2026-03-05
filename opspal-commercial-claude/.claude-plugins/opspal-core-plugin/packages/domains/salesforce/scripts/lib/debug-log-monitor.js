#!/usr/bin/env node

/**
 * DebugLogMonitor - Real-time Salesforce debug log monitoring
 *
 * @module debug-log-monitor
 * @version 1.0.0
 * @description Provides real-time monitoring of Salesforce debug logs with
 *              filtering, parsing, and alerting capabilities.
 *
 * @example
 * const { DebugLogMonitor } = require('./debug-log-monitor');
 *
 * const monitor = new DebugLogMonitor('myorg', {
 *   pollInterval: 5000,
 *   filterErrors: true
 * });
 *
 * monitor.on('newLog', (log) => console.log('New log:', log.Id));
 * monitor.on('error', (error) => console.error('Error detected:', error));
 *
 * await monitor.start();
 * // ... later
 * monitor.stop();
 */

const { EventEmitter } = require('events');
const { execSync } = require('child_process');

/**
 * Real-time debug log monitor
 * @extends EventEmitter
 */
class DebugLogMonitor extends EventEmitter {
  /**
   * Create a new DebugLogMonitor instance
   *
   * @param {string} orgAlias - Salesforce org alias
   * @param {object} options - Configuration options
   * @param {number} [options.pollInterval=5000] - Polling interval in ms
   * @param {boolean} [options.filterErrors=false] - Only show logs with errors
   * @param {string} [options.user] - Filter by user email
   * @param {string} [options.operation] - Filter by operation type (Apex, Flow, etc.)
   * @param {boolean} [options.verbose=false] - Enable verbose output
   * @param {boolean} [options.parseContent=true] - Parse log content for errors/warnings
   * @param {number} [options.maxLogs=100] - Maximum logs to track (prevents memory issues)
   */
  constructor(orgAlias, options = {}) {
    super();

    if (!orgAlias) {
      throw new Error('orgAlias is required');
    }

    this.orgAlias = orgAlias;
    this.options = {
      pollInterval: 5000,
      filterErrors: false,
      user: null,
      operation: null,
      verbose: false,
      parseContent: true,
      maxLogs: 100,
      ...options
    };

    this.isRunning = false;
    this.pollTimer = null;
    this.seenLogIds = new Set();
    this.stats = {
      startTime: null,
      logsProcessed: 0,
      errorsFound: 0,
      warningsFound: 0
    };

    this.log = this.options.verbose ? console.log : () => {};
  }

  /**
   * Execute SF CLI command
   * @private
   */
  _execSfCommand(command, timeout = 30000) {
    try {
      const output = execSync(command, {
        timeout,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe']
      });
      return output.trim();
    } catch (error) {
      throw new Error(`SF CLI command failed: ${error.message}`);
    }
  }

  /**
   * Parse JSON result from SF CLI
   * @private
   */
  _parseSfResult(output) {
    try {
      const data = JSON.parse(output);
      if (data.status !== 0) {
        throw new Error(data.message || 'SF CLI returned non-zero status');
      }
      return data.result;
    } catch (error) {
      if (error.message.includes('SF CLI')) throw error;
      throw new Error(`Failed to parse SF CLI output: ${error.message}`);
    }
  }

  /**
   * Get recent logs (since last check)
   * @private
   */
  async _getRecentLogs() {
    let query = `SELECT Id, LogLength, Application, DurationMilliseconds, Operation, Request, StartTime, Status, LogUserId FROM ApexLog`;
    const conditions = [];

    if (this.options.user) {
      // Get user ID first
      const userQuery = `SELECT Id FROM User WHERE Username = '${this.options.user}' LIMIT 1`;
      const userCommand = `sf data query --query "${userQuery}" --target-org ${this.orgAlias} --json`;
      const userOutput = this._execSfCommand(userCommand);
      const userResult = this._parseSfResult(userOutput);
      if (userResult.records && userResult.records.length > 0) {
        conditions.push(`LogUserId = '${userResult.records[0].Id}'`);
      }
    }

    if (this.options.operation) {
      conditions.push(`Operation LIKE '%${this.options.operation}%'`);
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    query += ` ORDER BY StartTime DESC LIMIT 20`;

    const command = `sf data query --query "${query}" --target-org ${this.orgAlias} --json --use-tooling-api`;

    const output = this._execSfCommand(command);
    const result = this._parseSfResult(output);

    return result.records || [];
  }

  /**
   * Get log body content
   * @private
   */
  async _getLogBody(logId) {
    // Get org details for REST call
    const orgCommand = `sf org display --target-org ${this.orgAlias} --json`;
    const orgOutput = this._execSfCommand(orgCommand);
    const orgResult = this._parseSfResult(orgOutput);

    const instanceUrl = orgResult.instanceUrl;
    const accessToken = orgResult.accessToken;

    // Use curl for REST call
    const restCommand = `curl -s -H "Authorization: Bearer ${accessToken}" "${instanceUrl}/services/data/v62.0/tooling/sobjects/ApexLog/${logId}/Body"`;

    try {
      const body = execSync(restCommand, {
        timeout: 30000,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe']
      });
      return body;
    } catch (error) {
      return null;
    }
  }

  /**
   * Parse log content for errors and warnings
   * @private
   */
  _parseLogContent(body) {
    const errors = [];
    const warnings = [];

    if (!body) return { errors, warnings };

    const lines = body.split('\n');

    const errorPatterns = [
      { pattern: /EXCEPTION_THROWN\|([^\|]+)\|(.+)$/, type: 'exception' },
      { pattern: /FATAL_ERROR\|(.+)$/, type: 'fatal' },
      { pattern: /System\.DmlException:(.+)$/, type: 'dml' },
      { pattern: /System\.NullPointerException/, type: 'null_pointer' },
      { pattern: /System\.QueryException:(.+)$/, type: 'query' },
      { pattern: /System\.LimitException:(.+)$/, type: 'limit' },
      { pattern: /VALIDATION_ERROR\|(.+)$/, type: 'validation' },
      { pattern: /FLOW_ELEMENT_ERROR\|(.+)$/, type: 'flow_error' }
    ];

    const warningPatterns = [
      { pattern: /HEAP_ALLOCATE\|.*?(\d+).*?limit.*?(\d+)/, type: 'heap_warning', threshold: 0.8 },
      { pattern: /Maximum CPU time exceeded/, type: 'cpu_limit' },
      { pattern: /Maximum trigger recursion depth/, type: 'recursion' }
    ];

    for (const line of lines) {
      // Check error patterns
      for (const { pattern, type } of errorPatterns) {
        const match = line.match(pattern);
        if (match) {
          errors.push({
            type,
            message: match[1] || match[0],
            line: line.trim()
          });
        }
      }

      // Check warning patterns
      for (const { pattern, type, threshold } of warningPatterns) {
        const match = line.match(pattern);
        if (match) {
          if (threshold && match[1] && match[2]) {
            const ratio = parseInt(match[1]) / parseInt(match[2]);
            if (ratio >= threshold) {
              warnings.push({
                type,
                message: `${(ratio * 100).toFixed(1)}% of limit`,
                line: line.trim()
              });
            }
          } else {
            warnings.push({
              type,
              message: match[1] || 'Limit warning',
              line: line.trim()
            });
          }
        }
      }
    }

    return { errors, warnings };
  }

  /**
   * Format log for display
   * @private
   */
  _formatLog(log, errors = [], warnings = []) {
    const time = new Date(log.StartTime).toLocaleTimeString();
    const sizeKB = (log.LogLength / 1024).toFixed(1);
    const duration = log.DurationMilliseconds || 0;

    let status = '✓';
    if (errors.length > 0) {
      status = '✗';
    } else if (warnings.length > 0) {
      status = '⚠';
    }

    let output = `\n${status} [${time}] ${log.Operation} | ${log.Status} | ${duration}ms | ${sizeKB}KB`;

    if (errors.length > 0) {
      output += '\n  Errors:';
      for (const err of errors.slice(0, 3)) {
        output += `\n    ✗ ${err.type}: ${err.message.substring(0, 100)}`;
      }
      if (errors.length > 3) {
        output += `\n    ... and ${errors.length - 3} more`;
      }
    }

    if (warnings.length > 0 && errors.length === 0) {
      output += '\n  Warnings:';
      for (const warn of warnings.slice(0, 3)) {
        output += `\n    ⚠ ${warn.type}: ${warn.message}`;
      }
    }

    return output;
  }

  /**
   * Poll for new logs
   * @private
   */
  async _poll() {
    if (!this.isRunning) return;

    try {
      const logs = await this._getRecentLogs();

      for (const log of logs) {
        if (this.seenLogIds.has(log.Id)) continue;

        // Add to seen set (with size limit)
        this.seenLogIds.add(log.Id);
        if (this.seenLogIds.size > this.options.maxLogs) {
          const iterator = this.seenLogIds.values();
          this.seenLogIds.delete(iterator.next().value);
        }

        this.stats.logsProcessed++;

        let errors = [];
        let warnings = [];

        if (this.options.parseContent) {
          const body = await this._getLogBody(log.Id);
          const parsed = this._parseLogContent(body);
          errors = parsed.errors;
          warnings = parsed.warnings;

          this.stats.errorsFound += errors.length;
          this.stats.warningsFound += warnings.length;
        }

        // Apply error filter if enabled
        if (this.options.filterErrors && errors.length === 0) {
          continue;
        }

        // Emit events
        this.emit('newLog', { log, errors, warnings });

        if (errors.length > 0) {
          for (const error of errors) {
            this.emit('error', { log, error });
          }
        }

        if (warnings.length > 0) {
          for (const warning of warnings) {
            this.emit('warning', { log, warning });
          }
        }

        // Console output
        console.log(this._formatLog(log, errors, warnings));
      }

    } catch (error) {
      this.emit('pollError', error);
      this.log(`Poll error: ${error.message}`);
    }

    // Schedule next poll
    if (this.isRunning) {
      this.pollTimer = setTimeout(() => this._poll(), this.options.pollInterval);
    }
  }

  /**
   * Start monitoring
   * @returns {Promise<void>}
   */
  async start() {
    if (this.isRunning) {
      throw new Error('Monitor is already running');
    }

    this.isRunning = true;
    this.stats.startTime = new Date();

    console.log(`\n🔍 Debug Log Monitor Started`);
    console.log(`   Org: ${this.orgAlias}`);
    console.log(`   Poll Interval: ${this.options.pollInterval}ms`);
    if (this.options.filterErrors) console.log(`   Filter: Errors only`);
    if (this.options.user) console.log(`   User: ${this.options.user}`);
    if (this.options.operation) console.log(`   Operation: ${this.options.operation}`);
    console.log(`\n   Press Ctrl+C to stop...\n`);

    this.emit('started');

    // Initial poll
    await this._poll();
  }

  /**
   * Stop monitoring
   */
  stop() {
    if (!this.isRunning) return;

    this.isRunning = false;

    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }

    const duration = ((Date.now() - this.stats.startTime.getTime()) / 1000).toFixed(0);

    console.log(`\n📊 Monitor Summary:`);
    console.log(`   Duration: ${duration}s`);
    console.log(`   Logs Processed: ${this.stats.logsProcessed}`);
    console.log(`   Errors Found: ${this.stats.errorsFound}`);
    console.log(`   Warnings Found: ${this.stats.warningsFound}`);

    this.emit('stopped', this.stats);
  }

  /**
   * Get current statistics
   * @returns {object} Statistics
   */
  getStats() {
    return {
      ...this.stats,
      isRunning: this.isRunning,
      seenLogs: this.seenLogIds.size
    };
  }
}

// ========================================
// CLI Mode
// ========================================

if (require.main === module) {
  const args = process.argv.slice(2);
  const orgAlias = args[0];

  if (!orgAlias || args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: node debug-log-monitor.js <org-alias> [options]

Options:
  --interval <ms>     Polling interval in milliseconds (default: 5000)
  --errors-only       Only show logs with errors
  --user <email>      Filter by user email
  --operation <type>  Filter by operation type (Apex, Flow, etc.)
  --no-parse          Don't parse log content (faster, less info)
  --verbose           Enable verbose output

Examples:
  node debug-log-monitor.js myorg
  node debug-log-monitor.js myorg --interval 3000 --errors-only
  node debug-log-monitor.js myorg --user admin@company.com
  node debug-log-monitor.js myorg --operation Flow

Press Ctrl+C to stop monitoring.
`);
    process.exit(orgAlias ? 0 : 1);
  }

  // Parse options
  const options = {
    pollInterval: 5000,
    filterErrors: false,
    user: null,
    operation: null,
    verbose: false,
    parseContent: true
  };

  const intervalIdx = args.indexOf('--interval');
  if (intervalIdx > 0) {
    options.pollInterval = parseInt(args[intervalIdx + 1]) || 5000;
  }

  if (args.includes('--errors-only')) {
    options.filterErrors = true;
  }

  const userIdx = args.indexOf('--user');
  if (userIdx > 0) {
    options.user = args[userIdx + 1];
  }

  const opIdx = args.indexOf('--operation');
  if (opIdx > 0) {
    options.operation = args[opIdx + 1];
  }

  if (args.includes('--no-parse')) {
    options.parseContent = false;
  }

  if (args.includes('--verbose')) {
    options.verbose = true;
  }

  // Create and start monitor
  const monitor = new DebugLogMonitor(orgAlias, options);

  // Handle Ctrl+C
  process.on('SIGINT', () => {
    monitor.stop();
    process.exit(0);
  });

  // Start monitoring
  monitor.start().catch((error) => {
    console.error(`\nError: ${error.message}`);
    process.exit(1);
  });
}

module.exports = { DebugLogMonitor };
