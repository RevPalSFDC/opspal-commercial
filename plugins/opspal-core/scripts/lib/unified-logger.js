#!/usr/bin/env node
/**
 * Unified Logger - Centralized Logging System
 *
 * Provides consistent structured logging across all plugins with:
 * - JSON structured output
 * - Correlation IDs for request tracing
 * - Severity levels (error, warn, info, debug)
 * - File and console output
 * - Plugin/operation context
 *
 * Part of Phase 1 Centralization from Plugin Enhancement Plan.
 * Addresses inconsistent logging patterns across 378+ console.log calls.
 *
 * Usage:
 *   const logger = require('./unified-logger');
 *
 *   // Basic logging
 *   logger.info('Operation started', { plugin: 'salesforce', operation: 'deploy' });
 *   logger.error('Deployment failed', { error: err.message, stack: err.stack });
 *
 *   // With correlation ID (for request tracing)
 *   const log = logger.withCorrelationId('req-abc123');
 *   log.info('Processing request');
 *   log.info('Request completed');
 *
 *   // Plugin-scoped logger
 *   const sfLog = logger.forPlugin('salesforce-plugin');
 *   sfLog.info('Metadata deploy', { objects: 15 });
 *
 * Environment Variables:
 *   LOG_LEVEL - Minimum log level (error, warn, info, debug). Default: info
 *   LOG_FORMAT - Output format (json, text). Default: json
 *   LOG_FILE - Optional file path for log output
 *   LOG_CORRELATION_ID - Inherited correlation ID
 *
 * @module unified-logger
 * @version 1.0.0
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { randomBytes } = require('crypto');

// ============================================================================
// CONSTANTS
// ============================================================================

const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3
};

const DEFAULT_LOG_DIR = path.join(os.homedir(), '.claude', 'logs');
const DEFAULT_LOG_FILE = path.join(DEFAULT_LOG_DIR, 'unified.jsonl');

// ============================================================================
// LOGGER CLASS
// ============================================================================

class UnifiedLogger {
  constructor(options = {}) {
    this.level = LOG_LEVELS[options.level || process.env.LOG_LEVEL || 'info'] ?? LOG_LEVELS.info;
    this.format = options.format || process.env.LOG_FORMAT || 'json';
    this.logFile = options.logFile || process.env.LOG_FILE || null;
    this.correlationId = options.correlationId || process.env.LOG_CORRELATION_ID || null;
    this.plugin = options.plugin || null;
    this.operation = options.operation || null;
    this.silent = options.silent || false;

    // Ensure log directory exists if file logging enabled
    if (this.logFile) {
      this._ensureLogDir();
    }
  }

  /**
   * Generate a new correlation ID
   */
  static generateCorrelationId() {
    return `${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`;
  }

  /**
   * Create a logger with a specific correlation ID
   * @param {string} correlationId - Correlation ID for request tracing
   * @returns {UnifiedLogger} New logger instance with correlation ID
   */
  withCorrelationId(correlationId) {
    return new UnifiedLogger({
      level: Object.keys(LOG_LEVELS).find(k => LOG_LEVELS[k] === this.level),
      format: this.format,
      logFile: this.logFile,
      correlationId,
      plugin: this.plugin,
      operation: this.operation,
      silent: this.silent
    });
  }

  /**
   * Create a plugin-scoped logger
   * @param {string} plugin - Plugin name
   * @param {string} [operation] - Optional operation name
   * @returns {UnifiedLogger} New logger instance with plugin context
   */
  forPlugin(plugin, operation = null) {
    return new UnifiedLogger({
      level: Object.keys(LOG_LEVELS).find(k => LOG_LEVELS[k] === this.level),
      format: this.format,
      logFile: this.logFile,
      correlationId: this.correlationId,
      plugin,
      operation,
      silent: this.silent
    });
  }

  /**
   * Create an operation-scoped logger
   * @param {string} operation - Operation name
   * @returns {UnifiedLogger} New logger instance with operation context
   */
  forOperation(operation) {
    return new UnifiedLogger({
      level: Object.keys(LOG_LEVELS).find(k => LOG_LEVELS[k] === this.level),
      format: this.format,
      logFile: this.logFile,
      correlationId: this.correlationId,
      plugin: this.plugin,
      operation,
      silent: this.silent
    });
  }

  /**
   * Log at ERROR level
   */
  error(message, data = {}) {
    this._log('error', message, data);
  }

  /**
   * Log at WARN level
   */
  warn(message, data = {}) {
    this._log('warn', message, data);
  }

  /**
   * Log at INFO level
   */
  info(message, data = {}) {
    this._log('info', message, data);
  }

  /**
   * Log at DEBUG level
   */
  debug(message, data = {}) {
    this._log('debug', message, data);
  }

  /**
   * Log with timing information
   * @param {string} operation - Operation being timed
   * @param {Function} fn - Async function to time
   * @returns {Promise<*>} Result of the function
   */
  async timed(operation, fn) {
    const start = Date.now();
    this.debug(`${operation} started`);

    try {
      const result = await fn();
      const duration = Date.now() - start;
      this.info(`${operation} completed`, { duration_ms: duration });
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      this.error(`${operation} failed`, {
        duration_ms: duration,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Create a child logger that inherits context
   */
  child(additionalContext = {}) {
    const childLogger = new UnifiedLogger({
      level: Object.keys(LOG_LEVELS).find(k => LOG_LEVELS[k] === this.level),
      format: this.format,
      logFile: this.logFile,
      correlationId: this.correlationId,
      plugin: additionalContext.plugin || this.plugin,
      operation: additionalContext.operation || this.operation,
      silent: this.silent
    });
    childLogger._additionalContext = additionalContext;
    return childLogger;
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  _log(level, message, data) {
    if (LOG_LEVELS[level] > this.level) {
      return;
    }

    const entry = this._buildEntry(level, message, data);

    if (!this.silent) {
      this._writeToConsole(level, entry);
    }

    if (this.logFile) {
      this._writeToFile(entry);
    }
  }

  _buildEntry(level, message, data) {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...data
    };

    // Add context fields
    if (this.correlationId) entry.correlationId = this.correlationId;
    if (this.plugin) entry.plugin = this.plugin;
    if (this.operation) entry.operation = this.operation;
    if (this._additionalContext) {
      Object.assign(entry, this._additionalContext);
    }

    // Add process info for error level
    if (level === 'error') {
      entry.pid = process.pid;
      entry.hostname = os.hostname();
    }

    return entry;
  }

  _writeToConsole(level, entry) {
    if (this.format === 'json') {
      const output = JSON.stringify(entry);
      if (level === 'error') {
        console.error(output);
      } else if (level === 'warn') {
        console.warn(output);
      } else {
        console.log(output);
      }
    } else {
      // Text format
      const prefix = this._getPrefix(level, entry);
      const msg = `${prefix} ${entry.message}`;

      if (level === 'error') {
        console.error(msg, this._formatData(entry));
      } else if (level === 'warn') {
        console.warn(msg, this._formatData(entry));
      } else {
        console.log(msg, this._formatData(entry));
      }
    }
  }

  _getPrefix(level, entry) {
    const levelIcon = {
      error: '\u274c',  // red X
      warn: '\u26a0\ufe0f',   // warning
      info: '\u2139\ufe0f',   // info
      debug: '\ud83d\udd0d'  // magnifying glass
    };

    const parts = [
      entry.timestamp.split('T')[1].split('.')[0], // HH:MM:SS
      levelIcon[level] || level.toUpperCase(),
    ];

    if (entry.plugin) parts.push(`[${entry.plugin}]`);
    if (entry.operation) parts.push(`(${entry.operation})`);
    if (entry.correlationId) parts.push(`<${entry.correlationId.slice(0, 8)}>`);

    return parts.join(' ');
  }

  _formatData(entry) {
    const exclude = ['timestamp', 'level', 'message', 'plugin', 'operation', 'correlationId'];
    const data = {};

    for (const [key, value] of Object.entries(entry)) {
      if (!exclude.includes(key) && value !== undefined) {
        data[key] = value;
      }
    }

    return Object.keys(data).length > 0 ? data : '';
  }

  _writeToFile(entry) {
    try {
      fs.appendFileSync(this.logFile, JSON.stringify(entry) + '\n');
    } catch (error) {
      // Fail silently - logging should never break the main flow
      console.error(`[Logger] Failed to write to file: ${error.message}`);
    }
  }

  _ensureLogDir() {
    const dir = path.dirname(this.logFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

// Create default logger instance
const defaultLogger = new UnifiedLogger();

// Export both the class and singleton methods
module.exports = {
  // Singleton methods
  error: (...args) => defaultLogger.error(...args),
  warn: (...args) => defaultLogger.warn(...args),
  info: (...args) => defaultLogger.info(...args),
  debug: (...args) => defaultLogger.debug(...args),
  timed: (...args) => defaultLogger.timed(...args),

  // Factory methods
  withCorrelationId: (id) => defaultLogger.withCorrelationId(id),
  forPlugin: (plugin, operation) => defaultLogger.forPlugin(plugin, operation),
  forOperation: (operation) => defaultLogger.forOperation(operation),
  child: (context) => defaultLogger.child(context),
  generateCorrelationId: UnifiedLogger.generateCorrelationId,

  // Class export for custom instances
  UnifiedLogger,

  // Constants
  LOG_LEVELS
};

// ============================================================================
// CLI INTERFACE
// ============================================================================

if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'test':
      console.log('Testing unified logger...\n');

      const testLogger = new UnifiedLogger({ format: 'text' });
      testLogger.info('Test info message', { count: 42 });
      testLogger.warn('Test warning', { issue: 'minor' });
      testLogger.error('Test error', { code: 'ERR001' });
      testLogger.debug('Test debug', { detail: 'verbose' });

      console.log('\n--- With correlation ID ---');
      const corrLog = testLogger.withCorrelationId('req-abc123');
      corrLog.info('Request received');
      corrLog.info('Request completed', { status: 200 });

      console.log('\n--- Plugin scoped ---');
      const sfLog = testLogger.forPlugin('salesforce-plugin', 'metadata-deploy');
      sfLog.info('Deploying metadata', { objects: 15 });
      sfLog.info('Deployment complete');

      console.log('\n--- JSON format ---');
      const jsonLog = new UnifiedLogger({ format: 'json' });
      jsonLog.info('JSON log entry', { key: 'value' });

      console.log('\nLogger test complete!');
      break;

    case 'levels':
      console.log('Available log levels:');
      Object.entries(LOG_LEVELS).forEach(([level, priority]) => {
        console.log(`  ${level}: ${priority}`);
      });
      break;

    default:
      console.log(`
Unified Logger - Centralized Logging System

Usage: node unified-logger.js <command>

Commands:
  test    Run logger test with sample output
  levels  Show available log levels

Environment Variables:
  LOG_LEVEL          Minimum log level (error, warn, info, debug)
  LOG_FORMAT         Output format (json, text)
  LOG_FILE           Optional file path for log output
  LOG_CORRELATION_ID Inherited correlation ID

Programmatic Usage:
  const logger = require('./unified-logger');
  logger.info('Message', { data: 'value' });

  const sfLog = logger.forPlugin('salesforce-plugin');
  sfLog.info('Plugin-scoped message');

  const reqLog = logger.withCorrelationId('req-123');
  reqLog.info('Request-scoped message');
      `);
  }
}
