#!/usr/bin/env node

/**
 * Claude Log Parser
 *
 * Parses Claude Code logs to extract errors, warnings, and patterns.
 * Groups by error type and identifies systemic vs isolated issues.
 */

const fs = require('fs');
const path = require('path');

class ClaudeLogParser {
  constructor(options = {}) {
    this.verbose = options.verbose || false;
    this.hours = options.hours || 24;
    this.errorType = options.errorType || null;

    this.logDir = path.join(
      process.env.HOME || process.env.USERPROFILE,
      '.claude',
      'logs'
    );

    this.results = {
      errors: [],
      warnings: [],
      patterns: new Map(),
      timeline: []
    };
  }

  /**
   * Parse all logs
   */
  async parse() {
    console.log(`🔍 Parsing Claude Code logs (last ${this.hours} hours)...\n`);

    if (!fs.existsSync(this.logDir)) {
      console.warn(`⚠️ Log directory not found: ${this.logDir}`);
      return { passed: true, note: 'No logs found' };
    }

    // Find log files
    const logFiles = this.findLogFiles();

    if (logFiles.length === 0) {
      console.log('No log files found in the specified timeframe.');
      return { passed: true, note: 'No logs' };
    }

    console.log(`Found ${logFiles.length} log file(s) to parse...`);

    // Parse each log file
    for (const logFile of logFiles) {
      await this.parseLogFile(logFile);
    }

    // Analyze patterns
    this.analyzePatterns();

    return this.generateSummary();
  }

  /**
   * Find log files within timeframe
   */
  findLogFiles() {
    const files = [];
    const cutoffTime = Date.now() - (this.hours * 60 * 60 * 1000);

    try {
      const entries = fs.readdirSync(this.logDir);

      for (const entry of entries) {
        const fullPath = path.join(this.logDir, entry);

        try {
          const stats = fs.statSync(fullPath);

          if (stats.isFile() && stats.mtimeMs >= cutoffTime) {
            // Include .log and .json files
            if (entry.endsWith('.log') || entry.endsWith('.json')) {
              files.push({ path: fullPath, name: entry, mtime: stats.mtimeMs });
            }
          }
        } catch (statError) {
          // Skip files that can't be accessed
        }
      }

      // Sort by modification time (newest first)
      files.sort((a, b) => b.mtime - a.mtime);

    } catch (error) {
      console.error(`Error finding log files: ${error.message}`);
    }

    return files.map(f => f.path);
  }

  /**
   * Parse a single log file
   */
  async parseLogFile(logFile) {
    try {
      const content = fs.readFileSync(logFile, 'utf-8');
      const lines = content.split('\n').filter(l => l.trim());

      for (const line of lines) {
        this.parseLine(line, path.basename(logFile));
      }

    } catch (error) {
      if (this.verbose) {
        console.error(`Error parsing ${logFile}: ${error.message}`);
      }
    }
  }

  /**
   * Parse a single log line
   */
  parseLine(line, source) {
    // Try JSON parsing first
    try {
      const entry = JSON.parse(line);
      this.parseJSONEntry(entry, source);
      return;
    } catch (e) {
      // Not JSON, parse as plain text
    }

    // Plain text error patterns
    if (this.isError(line)) {
      this.extractPlainTextError(line, source);
    } else if (this.isWarning(line)) {
      this.extractPlainTextWarning(line, source);
    }
  }

  /**
   * Parse JSON log entry
   */
  parseJSONEntry(entry, source) {
    const timestamp = entry.timestamp || entry.time || new Date().toISOString();
    const level = entry.level || entry.severity || 'unknown';

    if (level === 'error' || entry.error) {
      this.results.errors.push({
        timestamp,
        type: this.classifyError(entry),
        message: entry.message || entry.error || 'Unknown error',
        stack: entry.stack || entry.stackTrace,
        context: entry.context || {},
        source
      });

      this.results.timeline.push({
        timestamp,
        type: 'error',
        message: entry.message || entry.error
      });
    } else if (level === 'warning' || level === 'warn') {
      this.results.warnings.push({
        timestamp,
        message: entry.message || 'Unknown warning',
        context: entry.context || {},
        source
      });
    }
  }

  /**
   * Check if line is an error
   */
  isError(line) {
    const errorKeywords = ['ERROR', 'Error:', 'error:', 'FATAL', 'Fatal:', 'Exception:', 'failed:', 'FAILED'];
    return errorKeywords.some(keyword => line.includes(keyword));
  }

  /**
   * Check if line is a warning
   */
  isWarning(line) {
    const warningKeywords = ['WARNING', 'Warning:', 'warn:', 'WARN'];
    return warningKeywords.some(keyword => line.includes(keyword));
  }

  /**
   * Extract plain text error
   */
  extractPlainTextError(line, source) {
    const error = {
      timestamp: this.extractTimestamp(line) || new Date().toISOString(),
      type: this.classifyErrorFromText(line),
      message: this.extractMessage(line),
      source
    };

    this.results.errors.push(error);

    this.results.timeline.push({
      timestamp: error.timestamp,
      type: 'error',
      message: error.message
    });
  }

  /**
   * Extract plain text warning
   */
  extractPlainTextWarning(line, source) {
    this.results.warnings.push({
      timestamp: this.extractTimestamp(line) || new Date().toISOString(),
      message: this.extractMessage(line),
      source
    });
  }

  /**
   * Extract timestamp from log line
   */
  extractTimestamp(line) {
    // ISO 8601 format
    const isoMatch = line.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?/);
    if (isoMatch) return isoMatch[0];

    // Bracket format [timestamp]
    const bracketMatch = line.match(/\[([^\]]+)\]/);
    if (bracketMatch) return bracketMatch[1];

    return null;
  }

  /**
   * Extract message from log line
   */
  extractMessage(line) {
    // Remove timestamp
    let msg = line.replace(/^\[?[\d\-:T.Z]+\]?\s*/, '');

    // Remove log level
    msg = msg.replace(/^(ERROR|FATAL|WARNING|WARN|INFO):\s*/i, '');

    return msg.trim();
  }

  /**
   * Classify error type from JSON entry
   */
  classifyError(entry) {
    const message = (entry.message || entry.error || '').toLowerCase();
    const code = (entry.code || '').toLowerCase();

    if (message.includes('agent') || message.includes('discovery')) {
      return 'agent_discovery_failure';
    }
    if (message.includes('mcp') || message.includes('connection')) {
      return 'mcp_connection_failure';
    }
    if (message.includes('hook')) {
      return 'hook_execution_failure';
    }
    if (message.includes('plugin') || message.includes('manifest')) {
      return 'plugin_error';
    }
    if (message.includes('timeout')) {
      return 'timeout';
    }
    if (message.includes('permission') || message.includes('access denied')) {
      return 'permission_error';
    }
    if (code.includes('enoent') || message.includes('not found')) {
      return 'file_not_found';
    }
    if (code.includes('econnrefused') || message.includes('connection refused')) {
      return 'connection_refused';
    }

    return 'unknown';
  }

  /**
   * Classify error type from plain text
   */
  classifyErrorFromText(line) {
    const lineLower = line.toLowerCase();

    if (lineLower.includes('agent') && lineLower.includes('load')) {
      return 'agent_discovery_failure';
    }
    if (lineLower.includes('mcp') || lineLower.includes('connection')) {
      return 'mcp_connection_failure';
    }
    if (lineLower.includes('hook')) {
      return 'hook_execution_failure';
    }
    if (lineLower.includes('plugin')) {
      return 'plugin_error';
    }
    if (lineLower.includes('timeout')) {
      return 'timeout';
    }
    if (lineLower.includes('permission') || lineLower.includes('access denied')) {
      return 'permission_error';
    }
    if (lineLower.includes('not found') || lineLower.includes('enoent')) {
      return 'file_not_found';
    }

    return 'unknown';
  }

  /**
   * Analyze error patterns
   */
  analyzePatterns() {
    // Group errors by type
    for (const error of this.results.errors) {
      if (!this.results.patterns.has(error.type)) {
        this.results.patterns.set(error.type, {
          type: error.type,
          count: 0,
          examples: [],
          firstSeen: null,
          lastSeen: null
        });
      }

      const pattern = this.results.patterns.get(error.type);
      pattern.count++;

      // Store up to 3 examples
      if (pattern.examples.length < 3) {
        pattern.examples.push({
          message: error.message,
          timestamp: error.timestamp,
          source: error.source
        });
      }

      // Update timestamps
      if (!pattern.firstSeen || error.timestamp < pattern.firstSeen) {
        pattern.firstSeen = error.timestamp;
      }
      if (!pattern.lastSeen || error.timestamp > pattern.lastSeen) {
        pattern.lastSeen = error.timestamp;
      }
    }
  }

  /**
   * Generate summary report
   */
  generateSummary() {
    console.log('\n' + '─'.repeat(60));
    console.log('📋 CLAUDE CODE LOG ANALYSIS');
    console.log('─'.repeat(60));

    if (this.results.errors.length === 0 && this.results.warnings.length === 0) {
      console.log('No errors or warnings found in the specified timeframe.');
      console.log('─'.repeat(60) + '\n');
      return { passed: true, note: 'No issues' };
    }

    // Overall statistics
    console.log(`Errors: ${this.results.errors.length}`);
    console.log(`Warnings: ${this.results.warnings.length}`);

    // Error patterns
    if (this.results.patterns.size > 0) {
      console.log('\nError Patterns:');
      const patterns = Array.from(this.results.patterns.values())
        .sort((a, b) => b.count - a.count);

      for (const pattern of patterns) {
        console.log(`\n  ⚠️ ${this.formatErrorType(pattern.type)} (${pattern.count} occurrence${pattern.count > 1 ? 's' : ''})`);

        if (pattern.examples.length > 0) {
          console.log(`    Example: ${pattern.examples[0].message.substring(0, 80)}${pattern.examples[0].message.length > 80 ? '...' : ''}`);
        }

        if (pattern.lastSeen) {
          const lastSeenDate = new Date(pattern.lastSeen);
          const timeSince = this.timeSince(lastSeenDate);
          console.log(`    Last seen: ${timeSince} ago`);
        }

        // Add fix suggestions
        const fix = this.suggestFix(pattern.type, pattern.examples[0]);
        if (fix) {
          console.log(`    💡 Fix: ${fix}`);
        }
      }
    }

    console.log('\n' + '─'.repeat(60));

    const passed = this.results.errors.length === 0;
    const status = passed
      ? 'NO ERRORS ✓'
      : `${this.results.errors.length} ERROR(S) DETECTED ✗`;

    console.log(`Overall Status: ${status}`);
    console.log('─'.repeat(60) + '\n');

    return {
      passed,
      errors: this.results.errors,
      warnings: this.results.warnings,
      patterns: Array.from(this.results.patterns.values()),
      timeline: this.results.timeline
    };
  }

  /**
   * Format error type for display
   */
  formatErrorType(type) {
    return type
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Calculate time since timestamp
   */
  timeSince(date) {
    const seconds = Math.floor((new Date() - date) / 1000);

    if (seconds < 60) return `${seconds} second${seconds !== 1 ? 's' : ''}`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''}`;
    const days = Math.floor(hours / 24);
    return `${days} day${days !== 1 ? 's' : ''}`;
  }

  /**
   * Suggest fix for error pattern
   */
  suggestFix(errorType, example) {
    const fixes = {
      'agent_discovery_failure': 'Check agent YAML frontmatter syntax and required fields',
      'mcp_connection_failure': 'Verify MCP server credentials and network connectivity',
      'hook_execution_failure': 'Check hook dependencies (e.g., jq) and permissions',
      'plugin_error': 'Validate plugin manifest (plugin.json) schema',
      'timeout': 'Increase timeout or check for blocking operations',
      'permission_error': 'Check file permissions: chmod +x or check user access rights',
      'file_not_found': 'Verify file path exists or create missing directories',
      'connection_refused': 'Check service is running and firewall settings'
    };

    return fixes[errorType] || null;
  }

  /**
   * Get JSON report
   */
  getJSONReport() {
    return {
      timestamp: new Date().toISOString(),
      timeframe: `${this.hours} hours`,
      summary: {
        totalErrors: this.results.errors.length,
        totalWarnings: this.results.warnings.length,
        uniqueErrorTypes: this.results.patterns.size,
        passed: this.results.errors.length === 0
      },
      errors: this.results.errors,
      warnings: this.results.warnings,
      patterns: Array.from(this.results.patterns.values()),
      timeline: this.results.timeline
    };
  }
}

// CLI execution
if (require.main === module) {
  const args = process.argv.slice(2);
  const options = {
    verbose: args.includes('--verbose') || args.includes('-v'),
    json: args.includes('--json')
  };

  // Get hours if specified
  const hoursFlag = args.indexOf('--hours');
  if (hoursFlag !== -1 && args[hoursFlag + 1]) {
    options.hours = parseInt(args[hoursFlag + 1], 10);
  }

  // Get error type if specified
  const typeFlag = args.indexOf('--error-type');
  if (typeFlag !== -1 && args[typeFlag + 1]) {
    options.errorType = args[typeFlag + 1];
  }

  const parser = new ClaudeLogParser(options);

  parser.parse().then(result => {
    if (options.json) {
      console.log(JSON.stringify(parser.getJSONReport(), null, 2));
    }

    process.exit(result.passed ? 0 : 1);
  }).catch(error => {
    console.error('Fatal error:', error.message);
    process.exit(2);
  });
}

module.exports = ClaudeLogParser;
