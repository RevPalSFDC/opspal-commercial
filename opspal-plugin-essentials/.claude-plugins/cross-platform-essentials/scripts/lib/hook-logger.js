#!/usr/bin/env node

/**
 * Hook Logger - Structured JSON Logging for Hooks
 *
 * Purpose: Provides comprehensive structured logging for all hook operations
 *          to enable debugging, analytics, and performance monitoring.
 *
 * Pattern: Adopted from claude-code-hooks-mastery repository
 *          https://github.com/disler/claude-code-hooks-mastery
 *
 * Usage:
 *   const HookLogger = require('./hook-logger');
 *   const logger = new HookLogger('pre-compact');
 *
 *   logger.info('Starting backup', { files: 3 });
 *   logger.warn('Backup directory full', { usage: '95%' });
 *   logger.error('Backup failed', new Error('Disk full'));
 *
 * Features:
 *   - Structured JSON logging
 *   - Multiple log levels (debug, info, warn, error)
 *   - Automatic metadata (timestamp, hook name, etc.)
 *   - Performance tracking
 *   - Log rotation
 *   - Analytics queries
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

class HookLogger {
  constructor(hookName, options = {}) {
    this.hookName = hookName;
    this.options = {
      enabled: process.env.HOOK_LOGGING_ENABLED !== '0',
      level: process.env.HOOK_LOG_LEVEL || 'info',
      logDir: options.logDir || path.join(os.homedir(), '.claude', 'logs', 'hooks'),
      maxFileSize: options.maxFileSize || 10 * 1024 * 1024, // 10MB
      maxFiles: options.maxFiles || 7, // Keep 7 days
      ...options
    };

    this.levels = {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3
    };

    this.currentLevel = this.levels[this.options.level] || this.levels.info;

    this._ensureLogDirectory();
    this.startTime = Date.now();
  }

  /**
   * Log debug message
   */
  debug(message, data = {}) {
    this._log('debug', message, data);
  }

  /**
   * Log info message
   */
  info(message, data = {}) {
    this._log('info', message, data);
  }

  /**
   * Log warning message
   */
  warn(message, data = {}) {
    this._log('warn', message, data);
  }

  /**
   * Log error message
   */
  error(message, error, data = {}) {
    const errorData = error instanceof Error ? {
      message: error.message,
      stack: error.stack,
      ...data
    } : { ...data };

    this._log('error', message, errorData);
  }

  /**
   * Start a timer
   */
  startTimer(label) {
    if (!this.timers) this.timers = {};
    this.timers[label] = Date.now();
  }

  /**
   * End a timer and log duration
   */
  endTimer(label, message, data = {}) {
    if (!this.timers || !this.timers[label]) {
      this.warn(`Timer '${label}' not found`);
      return;
    }

    const duration = Date.now() - this.timers[label];
    delete this.timers[label];

    this.info(message || `${label} completed`, {
      ...data,
      duration,
      durationMs: duration,
      durationFormatted: this._formatDuration(duration)
    });

    return duration;
  }

  /**
   * Log hook execution start
   */
  hookStart(input = {}) {
    this.info('Hook execution started', {
      input,
      pid: process.pid,
      cwd: process.cwd()
    });
  }

  /**
   * Log hook execution end
   */
  hookEnd(exitCode, output = {}) {
    const duration = Date.now() - this.startTime;

    this.info('Hook execution completed', {
      exitCode,
      output,
      duration,
      durationMs: duration,
      durationFormatted: this._formatDuration(duration)
    });
  }

  /**
   * Internal logging method
   * @private
   */
  _log(level, message, data) {
    if (!this.options.enabled) return;
    if (this.levels[level] < this.currentLevel) return;

    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      hook: this.hookName,
      message,
      ...data,
      pid: process.pid,
      hostname: os.hostname()
    };

    // Write to file
    this._writeLog(logEntry);

    // Also write to stderr if error/warn and not in quiet mode
    if ((level === 'error' || level === 'warn') && process.env.HOOK_QUIET !== '1') {
      const formatted = this._formatLogEntry(logEntry);
      console.error(formatted);
    }
  }

  /**
   * Write log entry to file
   * @private
   */
  _writeLog(logEntry) {
    try {
      const logFile = this._getLogFile();
      const logLine = JSON.stringify(logEntry) + '\n';

      fs.appendFileSync(logFile, logLine);

      // Check file size and rotate if needed
      this._rotateLogsIfNeeded(logFile);
    } catch (error) {
      // Fail silently - don't break hook execution
      if (process.env.HOOK_LOGGING_DEBUG === '1') {
        console.error(`Failed to write log: ${error.message}`);
      }
    }
  }

  /**
   * Get current log file path
   * @private
   */
  _getLogFile() {
    const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    return path.join(this.options.logDir, `${this.hookName}-${date}.jsonl`);
  }

  /**
   * Ensure log directory exists
   * @private
   */
  _ensureLogDirectory() {
    try {
      if (!fs.existsSync(this.options.logDir)) {
        fs.mkdirSync(this.options.logDir, { recursive: true });
      }
    } catch (error) {
      // Fail silently
    }
  }

  /**
   * Rotate logs if file size exceeds limit
   * @private
   */
  _rotateLogsIfNeeded(logFile) {
    try {
      const stats = fs.statSync(logFile);

      if (stats.size > this.options.maxFileSize) {
        // Rename current log file
        const timestamp = Date.now();
        const rotatedFile = logFile.replace('.jsonl', `.${timestamp}.jsonl`);
        fs.renameSync(logFile, rotatedFile);

        // Clean up old logs
        this._cleanupOldLogs();
      }
    } catch (error) {
      // Fail silently
    }
  }

  /**
   * Clean up old log files
   * @private
   */
  _cleanupOldLogs() {
    try {
      const files = fs.readdirSync(this.options.logDir)
        .filter(f => f.startsWith(this.hookName) && f.endsWith('.jsonl'))
        .map(f => ({
          name: f,
          path: path.join(this.options.logDir, f),
          time: fs.statSync(path.join(this.options.logDir, f)).mtime.getTime()
        }))
        .sort((a, b) => b.time - a.time);

      // Keep only the most recent files
      files.slice(this.options.maxFiles).forEach(file => {
        fs.unlinkSync(file.path);
      });
    } catch (error) {
      // Fail silently
    }
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
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else if (seconds > 0) {
      return `${seconds}s`;
    } else {
      return `${ms}ms`;
    }
  }

  /**
   * Format log entry for console output
   * @private
   */
  _formatLogEntry(logEntry) {
    const timestamp = new Date(logEntry.timestamp).toLocaleTimeString();
    const level = logEntry.level.toUpperCase().padEnd(5);
    const icon = {
      debug: '🔍',
      info: 'ℹ️ ',
      warn: '⚠️ ',
      error: '❌'
    }[logEntry.level] || '';

    return `${icon} [${timestamp}] [${level}] [${logEntry.hook}] ${logEntry.message}`;
  }

  /**
   * Query logs
   */
  static query(options = {}) {
    const logDir = options.logDir || path.join(os.homedir(), '.claude', 'logs', 'hooks');
    const hookName = options.hook || '*';
    const level = options.level;
    const since = options.since; // Date or timestamp
    const until = options.until; // Date or timestamp

    try {
      const pattern = hookName === '*' ? '*.jsonl' : `${hookName}-*.jsonl`;
      const files = fs.readdirSync(logDir).filter(f => f.match(pattern));

      let logs = [];

      files.forEach(file => {
        const filePath = path.join(logDir, file);
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.trim().split('\n').filter(line => line);

        lines.forEach(line => {
          try {
            const log = JSON.parse(line);

            // Filter by level
            if (level && log.level !== level) return;

            // Filter by time range
            const logTime = new Date(log.timestamp).getTime();
            if (since && logTime < new Date(since).getTime()) return;
            if (until && logTime > new Date(until).getTime()) return;

            logs.push(log);
          } catch (error) {
            // Skip invalid JSON lines
          }
        });
      });

      return logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    } catch (error) {
      console.error(`Failed to query logs: ${error.message}`);
      return [];
    }
  }

  /**
   * Get analytics summary
   */
  static analytics(options = {}) {
    const logs = HookLogger.query(options);

    const summary = {
      total: logs.length,
      byHook: {},
      byLevel: {
        debug: 0,
        info: 0,
        warn: 0,
        error: 0
      },
      avgDuration: 0,
      errors: []
    };

    let totalDuration = 0;
    let durationCount = 0;

    logs.forEach(log => {
      // Count by hook
      summary.byHook[log.hook] = (summary.byHook[log.hook] || 0) + 1;

      // Count by level
      summary.byLevel[log.level]++;

      // Track durations
      if (log.durationMs) {
        totalDuration += log.durationMs;
        durationCount++;
      }

      // Collect errors
      if (log.level === 'error') {
        summary.errors.push({
          timestamp: log.timestamp,
          hook: log.hook,
          message: log.message
        });
      }
    });

    summary.avgDuration = durationCount > 0 ? totalDuration / durationCount : 0;

    return summary;
  }
}

/**
 * CLI usage
 */
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === 'query') {
    const hookName = args[1] || '*';
    const level = args[2];

    const logs = HookLogger.query({ hook: hookName, level });

    logs.slice(0, 50).forEach(log => {
      console.log(JSON.stringify(log, null, 2));
    });

    console.log(`\nTotal: ${logs.length} log entries`);

  } else if (command === 'analytics') {
    const hookName = args[1];

    const summary = HookLogger.analytics({ hook: hookName });

    console.log('Hook Analytics Summary:');
    console.log(JSON.stringify(summary, null, 2));

  } else if (command === 'test') {
    // Test the logger
    const logger = new HookLogger('test-hook');

    logger.info('Test info message', { test: true });
    logger.warn('Test warning', { warning: 'sample' });
    logger.error('Test error', new Error('Sample error'), { context: 'test' });

    logger.startTimer('operation');
    setTimeout(() => {
      logger.endTimer('operation', 'Test operation completed');
    }, 100);

  } else {
    console.log('Hook Logger - Usage:');
    console.log('  node hook-logger.js query [hook] [level]  # Query logs');
    console.log('  node hook-logger.js analytics [hook]      # Get analytics');
    console.log('  node hook-logger.js test                  # Test logger');
    console.log('');
    console.log('Library usage:');
    console.log('  const HookLogger = require("./hook-logger");');
    console.log('  const logger = new HookLogger("my-hook");');
    console.log('  logger.info("Message", { data });');
  }
}

module.exports = HookLogger;
