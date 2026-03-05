/**
 * structured-logger.js
 *
 * Provides consistent, structured logging across all OpsPal plugin scripts
 * Features:
 * - JSON structured logging with multiple levels
 * - Automatic context capture (file, function, timestamp)
 * - Log rotation and archival
 * - Query/filter capabilities
 * - Error stack trace formatting
 *
 * Usage:
 *   const { createLogger } = require('./scripts/lib/structured-logger');
 *   const logger = createLogger('my-script');
 *
 *   logger.info('Processing started', { recordCount: 100 });
 *   logger.error('Failed to process', error, { recordId: 'abc123' });
 */

const fs = require('fs');
const path = require('path');
const { promisify } = require('util');

const appendFile = promisify(fs.appendFile);
const mkdir = promisify(fs.mkdir);
const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);
const unlink = promisify(fs.unlink);

// Log levels with priority
const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  FATAL: 4
};

// Default configuration
const DEFAULT_CONFIG = {
  level: process.env.LOG_LEVEL || 'INFO',
  format: process.env.LOG_FORMAT || 'json', // 'json' or 'pretty'
  output: process.env.LOG_OUTPUT || 'both', // 'console', 'file', 'both'
  logDir: process.env.LOG_DIR || '.claude/logs',
  maxFileSize: parseInt(process.env.LOG_MAX_FILE_SIZE || '10485760'), // 10MB
  maxFiles: parseInt(process.env.LOG_MAX_FILES || '10'),
  includeTimestamp: true,
  includeContext: true,
  colorize: process.stdout.isTTY
};

// ANSI color codes
const COLORS = {
  DEBUG: '\x1b[36m', // Cyan
  INFO: '\x1b[32m',  // Green
  WARN: '\x1b[33m',  // Yellow
  ERROR: '\x1b[31m', // Red
  FATAL: '\x1b[35m', // Magenta
  RESET: '\x1b[0m'
};

class StructuredLogger {
  constructor(name, config = {}) {
    this.name = name;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logFile = null;
    this.logRotationPromise = null;

    // Initialize log directory and file
    this.initialize();
  }

  async initialize() {
    if (this.config.output === 'file' || this.config.output === 'both') {
      try {
        // Create log directory if it doesn't exist
        await mkdir(this.config.logDir, { recursive: true });

        // Set log file path
        const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        this.logFile = path.join(
          this.config.logDir,
          `${this.name}-${timestamp}.log`
        );

        // Check if rotation is needed
        await this.checkRotation();
      } catch (error) {
        console.error(`Failed to initialize logger: ${error.message}`);
      }
    }
  }

  async checkRotation() {
    if (!this.logFile) return;

    try {
      const stats = await stat(this.logFile);
      if (stats.size >= this.config.maxFileSize) {
        await this.rotateLog();
      }
    } catch (error) {
      // File doesn't exist yet, that's okay
    }
  }

  async rotateLog() {
    if (this.logRotationPromise) {
      // Rotation already in progress
      return this.logRotationPromise;
    }

    this.logRotationPromise = (async () => {
      try {
        const timestamp = new Date().toISOString().replace(/:/g, '-');
        const rotatedFile = this.logFile.replace('.log', `-${timestamp}.log`);

        // Rename current log file
        await fs.promises.rename(this.logFile, rotatedFile);

        // Clean up old log files
        await this.cleanupOldLogs();
      } catch (error) {
        console.error(`Failed to rotate log: ${error.message}`);
      } finally {
        this.logRotationPromise = null;
      }
    })();

    return this.logRotationPromise;
  }

  async cleanupOldLogs() {
    try {
      const files = await readdir(this.config.logDir);
      const logFiles = files
        .filter(f => f.startsWith(this.name) && f.endsWith('.log'))
        .map(f => path.join(this.config.logDir, f));

      // Sort by modification time (oldest first)
      const fileStats = await Promise.all(
        logFiles.map(async f => ({ path: f, stat: await stat(f) }))
      );
      fileStats.sort((a, b) => a.stat.mtime - b.stat.mtime);

      // Delete oldest files if we exceed maxFiles
      const filesToDelete = fileStats.slice(0, Math.max(0, fileStats.length - this.config.maxFiles));
      for (const { path: filePath } of filesToDelete) {
        await unlink(filePath);
      }
    } catch (error) {
      console.error(`Failed to cleanup old logs: ${error.message}`);
    }
  }

  shouldLog(level) {
    const configLevel = LOG_LEVELS[this.config.level.toUpperCase()] || LOG_LEVELS.INFO;
    const messageLevel = LOG_LEVELS[level.toUpperCase()] || LOG_LEVELS.INFO;
    return messageLevel >= configLevel;
  }

  getContext() {
    if (!this.config.includeContext) {
      return {};
    }

    const error = new Error();
    const stack = error.stack.split('\n');

    // Find the first stack frame outside this file
    const callerFrame = stack.find(line =>
      !line.includes('structured-logger.js') &&
      !line.includes('at Object.')
    );

    if (callerFrame) {
      const match = callerFrame.match(/at\s+(?:(.+?)\s+\()?(.+):(\d+):(\d+)/);
      if (match) {
        const [, functionName, file, line, column] = match;
        return {
          file: path.basename(file),
          function: functionName || '<anonymous>',
          line: parseInt(line),
          column: parseInt(column)
        };
      }
    }

    return {};
  }

  formatMessage(level, message, metadata = {}, error = null) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level: level.toUpperCase(),
      logger: this.name,
      message,
      ...this.getContext(),
      ...metadata
    };

    if (error) {
      logEntry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
        ...error
      };
    }

    return logEntry;
  }

  formatPretty(logEntry) {
    const color = this.config.colorize ? COLORS[logEntry.level] : '';
    const reset = this.config.colorize ? COLORS.RESET : '';

    let output = `${color}[${logEntry.timestamp}] [${logEntry.level}]${reset} ${logEntry.message}`;

    if (logEntry.file) {
      output += ` (${logEntry.file}:${logEntry.line})`;
    }

    if (Object.keys(logEntry).length > 5) {
      const metadata = { ...logEntry };
      delete metadata.timestamp;
      delete metadata.level;
      delete metadata.logger;
      delete metadata.message;
      delete metadata.file;
      delete metadata.function;
      delete metadata.line;
      delete metadata.column;

      output += `\n  ${JSON.stringify(metadata, null, 2)}`;
    }

    return output;
  }

  async write(level, message, metadata = {}, error = null) {
    if (!this.shouldLog(level)) {
      return;
    }

    const logEntry = this.formatMessage(level, message, metadata, error);

    // Console output
    if (this.config.output === 'console' || this.config.output === 'both') {
      const output = this.config.format === 'json'
        ? JSON.stringify(logEntry)
        : this.formatPretty(logEntry);

      if (level === 'ERROR' || level === 'FATAL') {
        console.error(output);
      } else {
        console.log(output);
      }
    }

    // File output
    if (this.config.output === 'file' || this.config.output === 'both') {
      if (this.logFile) {
        await this.checkRotation();
        const line = JSON.stringify(logEntry) + '\n';
        await appendFile(this.logFile, line).catch(err => {
          console.error(`Failed to write log: ${err.message}`);
        });
      }
    }
  }

  debug(message, metadata = {}) {
    return this.write('DEBUG', message, metadata);
  }

  info(message, metadata = {}) {
    return this.write('INFO', message, metadata);
  }

  warn(message, metadata = {}) {
    return this.write('WARN', message, metadata);
  }

  error(message, error = null, metadata = {}) {
    return this.write('ERROR', message, metadata, error);
  }

  fatal(message, error = null, metadata = {}) {
    return this.write('FATAL', message, metadata, error);
  }

  // Convenience method for timing operations
  timer(operationName) {
    const start = Date.now();
    return {
      end: (metadata = {}) => {
        const duration = Date.now() - start;
        this.info(`${operationName} completed`, {
          ...metadata,
          duration_ms: duration
        });
        return duration;
      },
      fail: (error, metadata = {}) => {
        const duration = Date.now() - start;
        this.error(`${operationName} failed`, error, {
          ...metadata,
          duration_ms: duration
        });
        return duration;
      }
    };
  }

  // Create child logger with additional context
  child(additionalContext = {}) {
    const childLogger = new StructuredLogger(this.name, this.config);
    childLogger.defaultMetadata = { ...this.defaultMetadata, ...additionalContext };
    return childLogger;
  }
}

/**
 * Create a new logger instance
 * @param {string} name - Logger name (typically script name)
 * @param {object} config - Optional configuration overrides
 * @returns {StructuredLogger}
 */
function createLogger(name, config = {}) {
  return new StructuredLogger(name, config);
}

/**
 * Query log files
 * @param {object} options - Query options
 * @param {string} options.logger - Logger name to query
 * @param {string} options.level - Minimum log level
 * @param {string} options.since - ISO timestamp to query from
 * @param {string} options.pattern - Regex pattern to match in message
 * @param {number} options.limit - Maximum number of entries to return
 * @returns {Array} Log entries matching query
 */
async function queryLogs(options = {}) {
  const {
    logger = null,
    level = 'INFO',
    since = null,
    pattern = null,
    limit = 100
  } = options;

  const logDir = process.env.LOG_DIR || '.claude/logs';
  const results = [];

  try {
    const files = await readdir(logDir);
    let logFiles = files.filter(f => f.endsWith('.log'));

    if (logger) {
      logFiles = logFiles.filter(f => f.startsWith(logger));
    }

    // Sort by modification time (newest first)
    const fileStats = await Promise.all(
      logFiles.map(async f => ({
        path: path.join(logDir, f),
        stat: await stat(path.join(logDir, f))
      }))
    );
    fileStats.sort((a, b) => b.stat.mtime - a.stat.mtime);

    const minLevel = LOG_LEVELS[level.toUpperCase()] || LOG_LEVELS.INFO;
    const regex = pattern ? new RegExp(pattern, 'i') : null;
    const sinceTime = since ? new Date(since).getTime() : 0;

    for (const { path: filePath } of fileStats) {
      const content = await fs.promises.readFile(filePath, 'utf-8');
      const lines = content.trim().split('\n');

      for (const line of lines) {
        if (results.length >= limit) {
          return results;
        }

        try {
          const entry = JSON.parse(line);

          // Filter by level
          const entryLevel = LOG_LEVELS[entry.level] || LOG_LEVELS.INFO;
          if (entryLevel < minLevel) {
            continue;
          }

          // Filter by time
          if (sinceTime && new Date(entry.timestamp).getTime() < sinceTime) {
            continue;
          }

          // Filter by pattern
          if (regex && !regex.test(entry.message)) {
            continue;
          }

          results.push(entry);
        } catch (error) {
          // Skip malformed lines
        }
      }
    }
  } catch (error) {
    console.error(`Failed to query logs: ${error.message}`);
  }

  return results;
}

module.exports = {
  createLogger,
  queryLogs,
  LOG_LEVELS
};

// Example usage (if run directly)
if (require.main === module) {
  (async () => {
    console.log('Structured Logger Example\n');

    const logger = createLogger('example-script', {
      level: 'DEBUG',
      format: 'pretty'
    });

    logger.debug('This is a debug message', { debugInfo: 'detailed context' });
    logger.info('Processing started', { recordCount: 100 });
    logger.warn('Resource limit approaching', { usage: '85%', threshold: '90%' });

    try {
      throw new Error('Something went wrong');
    } catch (error) {
      logger.error('Operation failed', error, { recordId: 'abc123' });
    }

    // Timing example
    const timer = logger.timer('database query');
    await new Promise(resolve => setTimeout(resolve, 100)); // Simulate work
    timer.end({ query: 'SELECT * FROM users', rows: 42 });

    // Query logs
    console.log('\n\nQuerying logs...\n');
    const logs = await queryLogs({
      logger: 'example-script',
      level: 'INFO',
      limit: 10
    });
    console.log(`Found ${logs.length} log entries`);
    logs.forEach(log => {
      console.log(`  [${log.level}] ${log.message}`);
    });
  })();
}
