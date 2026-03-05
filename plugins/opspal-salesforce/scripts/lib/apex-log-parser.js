#!/usr/bin/env node

/**
 * ApexLogParser - Parse Salesforce debug logs to extract Apex execution details
 *
 * @module apex-log-parser
 * @version 1.0.0
 * @description Parses debug logs to extract Apex method executions, SOQL queries,
 *              DML operations, exceptions, and governor limit usage. Complements
 *              flow-log-parser.js for complete debug log analysis.
 *
 * @see docs/runbooks/flow-xml-development/07-testing-and-diagnostics.md
 * @see Salesforce Debug Logs API Playbook
 *
 * @example
 * const { ApexLogParser } = require('./apex-log-parser');
 *
 * const parser = new ApexLogParser({ verbose: true });
 * const result = parser.parse(logContent);
 *
 * console.log('Methods:', result.methods.length);
 * console.log('SOQL Queries:', result.soqlQueries.length);
 * console.log('Exceptions:', result.exceptions.length);
 */

/**
 * Custom error class for log parsing failures
 */
class ApexLogParseError extends Error {
  /**
   * @param {string} message - Error message
   * @param {string} code - Error code
   * @param {object} details - Additional details
   */
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'ApexLogParseError';
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, ApexLogParseError);
  }
}

/**
 * ApexLogParser - Parse Apex execution events from debug logs
 */
class ApexLogParser {
  /**
   * Create a new ApexLogParser instance
   *
   * @param {object} options - Configuration options
   * @param {boolean} [options.verbose=false] - Enable detailed logging
   * @param {boolean} [options.includeTimings=true] - Include timing information
   * @param {boolean} [options.parseUserDebug=true] - Parse USER_DEBUG statements
   * @param {boolean} [options.extractStackTraces=true] - Extract exception stack traces
   */
  constructor(options = {}) {
    this.options = {
      verbose: false,
      includeTimings: true,
      parseUserDebug: true,
      extractStackTraces: true,
      ...options
    };

    this.log = this.options.verbose ? console.log : () => {};

    // Debug log parsing patterns
    this.patterns = {
      // Method execution
      methodEntry: /(\d+:\d+:\d+\.\d+)\s*\((\d+)\)\|METHOD_ENTRY\|(\[[^\]]+\])\|([^\|]+)\|?(.*)$/,
      methodExit: /(\d+:\d+:\d+\.\d+)\s*\((\d+)\)\|METHOD_EXIT\|(\[[^\]]+\])\|(.*)$/,

      // Code unit (triggers, classes)
      codeUnitStart: /(\d+:\d+:\d+\.\d+)\s*\((\d+)\)\|CODE_UNIT_STARTED\|(\[[^\]]+\])\|(.*)$/,
      codeUnitEnd: /(\d+:\d+:\d+\.\d+)\s*\((\d+)\)\|CODE_UNIT_FINISHED\|(.*)$/,

      // SOQL queries
      soqlBegin: /(\d+:\d+:\d+\.\d+)\s*\((\d+)\)\|SOQL_EXECUTE_BEGIN\|(\[[^\]]+\])\|Aggregations:(\d+)\|(.*)$/,
      soqlEnd: /(\d+:\d+:\d+\.\d+)\s*\((\d+)\)\|SOQL_EXECUTE_END\|(\[[^\]]+\])\|Rows:(\d+)$/,

      // DML operations
      dmlBegin: /(\d+:\d+:\d+\.\d+)\s*\((\d+)\)\|DML_BEGIN\|(\[[^\]]+\])\|Op:(\w+)\|Type:([^\|]+)\|Rows:(\d+)$/,
      dmlEnd: /(\d+:\d+:\d+\.\d+)\s*\((\d+)\)\|DML_END\|(\[[^\]]+\])$/,

      // Exceptions
      exception: /(\d+:\d+:\d+\.\d+)\s*\((\d+)\)\|EXCEPTION_THROWN\|(\[[^\]]+\])\|([^\|]+)\|?(.*)$/,
      fatalError: /(\d+:\d+:\d+\.\d+)\s*\((\d+)\)\|FATAL_ERROR\|(.*)$/,

      // USER_DEBUG statements
      userDebug: /(\d+:\d+:\d+\.\d+)\s*\((\d+)\)\|USER_DEBUG\|(\[[^\]]+\])\|(\w+)\|(.*)$/,

      // Governor limits
      limitUsage: /(\d+:\d+:\d+\.\d+)\s*\((\d+)\)\|LIMIT_USAGE_FOR_NS\|([^\|]+)\|/,
      cumulativeLimitUsage: /CUMULATIVE_LIMIT_USAGE$/,
      limitDetail: /\s+Number of (\w+[\w\s]*?):\s*(\d+)\s*out of\s*(\d+)/,

      // Heap
      heapAllocate: /(\d+:\d+:\d+\.\d+)\s*\((\d+)\)\|HEAP_ALLOCATE\|(\[[^\]]+\])\|Bytes:(\d+)$/,

      // Callouts
      calloutRequest: /(\d+:\d+:\d+\.\d+)\s*\((\d+)\)\|CALLOUT_REQUEST\|(\[[^\]]+\])\|(.*)$/,
      calloutResponse: /(\d+:\d+:\d+\.\d+)\s*\((\d+)\)\|CALLOUT_RESPONSE\|(\[[^\]]+\])\|(.*)$/,

      // Triggers
      triggerStart: /CODE_UNIT_STARTED\|.*\|trigger:\/\/([^\/]+)\/([^\|]+)/,
      triggerEnd: /CODE_UNIT_FINISHED\|.*\|trigger:\/\/([^\/]+)\/([^\|]+)/,

      // Execution context
      executionStarted: /(\d+:\d+:\d+\.\d+)\s*\((\d+)\)\|EXECUTION_STARTED$/,
      executionFinished: /(\d+:\d+:\d+\.\d+)\s*\((\d+)\)\|EXECUTION_FINISHED$/,

      // Log header
      logHeader: /^(\d+\.\d+)\s+APEX_CODE,(\w+);.*$/
    };
  }

  /**
   * Parse a debug log string
   * @param {string} logContent - Raw debug log content
   * @returns {object} Parsed log data
   */
  parse(logContent) {
    if (!logContent || typeof logContent !== 'string') {
      throw new ApexLogParseError('Log content is required', 'INVALID_INPUT');
    }

    const startTime = Date.now();
    this.log('Parsing Apex debug log...');

    const lines = logContent.split('\n');
    const result = {
      header: null,
      methods: [],
      soqlQueries: [],
      dmlOperations: [],
      exceptions: [],
      userDebugStatements: [],
      governorLimits: {},
      callouts: [],
      triggers: [],
      heapAllocations: [],
      summary: {
        totalLines: lines.length,
        methodCount: 0,
        soqlCount: 0,
        dmlCount: 0,
        exceptionCount: 0,
        userDebugCount: 0,
        calloutCount: 0,
        triggerCount: 0,
        warnings: [],
        errors: []
      }
    };

    // Track state during parsing
    const state = {
      methodStack: [],
      currentSoql: null,
      currentDml: null,
      inLimitUsage: false,
      currentLimitNs: null
    };

    // Parse each line
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      this._parseLine(line, i + 1, result, state);
    }

    // Update summary counts
    result.summary.methodCount = result.methods.length;
    result.summary.soqlCount = result.soqlQueries.length;
    result.summary.dmlCount = result.dmlOperations.length;
    result.summary.exceptionCount = result.exceptions.length;
    result.summary.userDebugCount = result.userDebugStatements.length;
    result.summary.calloutCount = result.callouts.length;
    result.summary.triggerCount = result.triggers.length;

    // Check for warnings
    this._checkForWarnings(result);

    result.parseTimeMs = Date.now() - startTime;
    this.log(`Parsed ${lines.length} lines in ${result.parseTimeMs}ms`);

    return result;
  }

  /**
   * Parse a single log line
   * @private
   */
  _parseLine(line, lineNumber, result, state) {
    // Skip empty lines
    if (!line.trim()) return;

    // Check for log header
    const headerMatch = line.match(this.patterns.logHeader);
    if (headerMatch) {
      result.header = {
        apiVersion: headerMatch[1],
        apexCodeLevel: headerMatch[2]
      };
      return;
    }

    // Method entry
    const methodEntryMatch = line.match(this.patterns.methodEntry);
    if (methodEntryMatch) {
      const method = {
        type: 'METHOD_ENTRY',
        timestamp: methodEntryMatch[1],
        heapTime: parseInt(methodEntryMatch[2]),
        location: methodEntryMatch[3],
        className: methodEntryMatch[4],
        methodName: methodEntryMatch[5] || '',
        lineNumber,
        duration: null,
        exitLine: null
      };
      state.methodStack.push(method);
      return;
    }

    // Method exit
    const methodExitMatch = line.match(this.patterns.methodExit);
    if (methodExitMatch && state.methodStack.length > 0) {
      const method = state.methodStack.pop();
      method.exitLine = lineNumber;
      method.exitTimestamp = methodExitMatch[1];
      method.duration = parseInt(methodExitMatch[2]) - method.heapTime;
      result.methods.push(method);
      return;
    }

    // SOQL begin
    const soqlBeginMatch = line.match(this.patterns.soqlBegin);
    if (soqlBeginMatch) {
      state.currentSoql = {
        timestamp: soqlBeginMatch[1],
        heapTime: parseInt(soqlBeginMatch[2]),
        location: soqlBeginMatch[3],
        aggregations: parseInt(soqlBeginMatch[4]),
        query: soqlBeginMatch[5],
        lineNumber,
        rows: null,
        duration: null
      };
      return;
    }

    // SOQL end
    const soqlEndMatch = line.match(this.patterns.soqlEnd);
    if (soqlEndMatch && state.currentSoql) {
      state.currentSoql.rows = parseInt(soqlEndMatch[4]);
      state.currentSoql.duration = parseInt(soqlEndMatch[2]) - state.currentSoql.heapTime;
      result.soqlQueries.push(state.currentSoql);
      state.currentSoql = null;
      return;
    }

    // DML begin
    const dmlBeginMatch = line.match(this.patterns.dmlBegin);
    if (dmlBeginMatch) {
      state.currentDml = {
        timestamp: dmlBeginMatch[1],
        heapTime: parseInt(dmlBeginMatch[2]),
        location: dmlBeginMatch[3],
        operation: dmlBeginMatch[4],
        objectType: dmlBeginMatch[5],
        rows: parseInt(dmlBeginMatch[6]),
        lineNumber,
        duration: null
      };
      return;
    }

    // DML end
    const dmlEndMatch = line.match(this.patterns.dmlEnd);
    if (dmlEndMatch && state.currentDml) {
      state.currentDml.duration = parseInt(dmlEndMatch[2]) - state.currentDml.heapTime;
      result.dmlOperations.push(state.currentDml);
      state.currentDml = null;
      return;
    }

    // Exception
    const exceptionMatch = line.match(this.patterns.exception);
    if (exceptionMatch) {
      result.exceptions.push({
        timestamp: exceptionMatch[1],
        heapTime: parseInt(exceptionMatch[2]),
        location: exceptionMatch[3],
        type: exceptionMatch[4],
        message: exceptionMatch[5] || '',
        lineNumber
      });
      result.summary.errors.push({
        type: 'EXCEPTION',
        message: `${exceptionMatch[4]}: ${exceptionMatch[5] || ''}`,
        lineNumber
      });
      return;
    }

    // Fatal error
    const fatalMatch = line.match(this.patterns.fatalError);
    if (fatalMatch) {
      result.exceptions.push({
        timestamp: fatalMatch[1],
        heapTime: parseInt(fatalMatch[2]),
        type: 'FATAL_ERROR',
        message: fatalMatch[3],
        lineNumber
      });
      result.summary.errors.push({
        type: 'FATAL_ERROR',
        message: fatalMatch[3],
        lineNumber
      });
      return;
    }

    // USER_DEBUG
    if (this.options.parseUserDebug) {
      const debugMatch = line.match(this.patterns.userDebug);
      if (debugMatch) {
        result.userDebugStatements.push({
          timestamp: debugMatch[1],
          heapTime: parseInt(debugMatch[2]),
          location: debugMatch[3],
          level: debugMatch[4],
          message: debugMatch[5],
          lineNumber
        });
        return;
      }
    }

    // Limit usage section
    const limitUsageMatch = line.match(this.patterns.limitUsage);
    if (limitUsageMatch) {
      state.inLimitUsage = true;
      state.currentLimitNs = limitUsageMatch[3];
      if (!result.governorLimits[state.currentLimitNs]) {
        result.governorLimits[state.currentLimitNs] = {};
      }
      return;
    }

    // Cumulative limit usage
    if (line.match(this.patterns.cumulativeLimitUsage)) {
      state.inLimitUsage = true;
      state.currentLimitNs = 'CUMULATIVE';
      if (!result.governorLimits.CUMULATIVE) {
        result.governorLimits.CUMULATIVE = {};
      }
      return;
    }

    // Limit detail
    if (state.inLimitUsage && state.currentLimitNs) {
      const limitDetailMatch = line.match(this.patterns.limitDetail);
      if (limitDetailMatch) {
        const limitName = limitDetailMatch[1].trim();
        const used = parseInt(limitDetailMatch[2]);
        const max = parseInt(limitDetailMatch[3]);
        result.governorLimits[state.currentLimitNs][limitName] = {
          used,
          max,
          percent: max > 0 ? ((used / max) * 100).toFixed(1) : 0
        };

        // Check for warning thresholds
        if (max > 0 && (used / max) >= 0.8) {
          result.summary.warnings.push({
            type: 'GOVERNOR_LIMIT',
            message: `${limitName}: ${used}/${max} (${((used / max) * 100).toFixed(1)}%)`,
            lineNumber
          });
        }
      }
      return;
    }

    // Heap allocation
    const heapMatch = line.match(this.patterns.heapAllocate);
    if (heapMatch) {
      result.heapAllocations.push({
        timestamp: heapMatch[1],
        heapTime: parseInt(heapMatch[2]),
        location: heapMatch[3],
        bytes: parseInt(heapMatch[4]),
        lineNumber
      });
      return;
    }

    // Callout request
    const calloutReqMatch = line.match(this.patterns.calloutRequest);
    if (calloutReqMatch) {
      result.callouts.push({
        type: 'REQUEST',
        timestamp: calloutReqMatch[1],
        heapTime: parseInt(calloutReqMatch[2]),
        location: calloutReqMatch[3],
        endpoint: calloutReqMatch[4],
        lineNumber
      });
      return;
    }

    // Callout response
    const calloutResMatch = line.match(this.patterns.calloutResponse);
    if (calloutResMatch) {
      result.callouts.push({
        type: 'RESPONSE',
        timestamp: calloutResMatch[1],
        heapTime: parseInt(calloutResMatch[2]),
        location: calloutResMatch[3],
        response: calloutResMatch[4],
        lineNumber
      });
      return;
    }

    // Trigger start
    const triggerStartMatch = line.match(this.patterns.triggerStart);
    if (triggerStartMatch) {
      result.triggers.push({
        type: 'START',
        object: triggerStartMatch[1],
        name: triggerStartMatch[2],
        lineNumber
      });
      return;
    }

    // Trigger end
    const triggerEndMatch = line.match(this.patterns.triggerEnd);
    if (triggerEndMatch) {
      result.triggers.push({
        type: 'END',
        object: triggerEndMatch[1],
        name: triggerEndMatch[2],
        lineNumber
      });
      return;
    }
  }

  /**
   * Check for warnings in parsed data
   * @private
   */
  _checkForWarnings(result) {
    // Check SOQL query counts
    if (result.soqlQueries.length >= 80) {
      result.summary.warnings.push({
        type: 'SOQL_COUNT',
        message: `High SOQL count: ${result.soqlQueries.length}/100 queries`
      });
    }

    // Check DML counts
    if (result.dmlOperations.length >= 120) {
      result.summary.warnings.push({
        type: 'DML_COUNT',
        message: `High DML count: ${result.dmlOperations.length}/150 operations`
      });
    }

    // Check for SOQL in loops (multiple identical queries)
    const queryMap = {};
    for (const q of result.soqlQueries) {
      const key = q.query.substring(0, 100);
      queryMap[key] = (queryMap[key] || 0) + 1;
    }
    for (const [query, count] of Object.entries(queryMap)) {
      if (count > 2) {
        result.summary.warnings.push({
          type: 'SOQL_IN_LOOP',
          message: `Possible SOQL in loop: Query executed ${count} times: ${query.substring(0, 50)}...`
        });
      }
    }
  }

  /**
   * Extract only exceptions from a log
   * @param {string} logContent - Raw debug log content
   * @returns {Array} Array of exception objects
   */
  extractExceptions(logContent) {
    const result = this.parse(logContent);
    return result.exceptions;
  }

  /**
   * Extract only SOQL queries from a log
   * @param {string} logContent - Raw debug log content
   * @returns {Array} Array of SOQL query objects
   */
  extractSOQLQueries(logContent) {
    const result = this.parse(logContent);
    return result.soqlQueries;
  }

  /**
   * Extract only DML operations from a log
   * @param {string} logContent - Raw debug log content
   * @returns {Array} Array of DML operation objects
   */
  extractDMLOperations(logContent) {
    const result = this.parse(logContent);
    return result.dmlOperations;
  }

  /**
   * Extract governor limit usage
   * @param {string} logContent - Raw debug log content
   * @returns {object} Governor limits object
   */
  extractGovernorLimits(logContent) {
    const result = this.parse(logContent);
    return result.governorLimits;
  }

  /**
   * Generate a summary report
   * @param {string} logContent - Raw debug log content
   * @returns {string} Formatted summary report
   */
  generateSummary(logContent) {
    const result = this.parse(logContent);

    let report = '# Apex Debug Log Analysis Summary\n\n';

    // Basic stats
    report += '## Execution Statistics\n\n';
    report += `| Metric | Count |\n|--------|-------|\n`;
    report += `| Total Lines | ${result.summary.totalLines} |\n`;
    report += `| Methods | ${result.summary.methodCount} |\n`;
    report += `| SOQL Queries | ${result.summary.soqlCount} |\n`;
    report += `| DML Operations | ${result.summary.dmlCount} |\n`;
    report += `| Callouts | ${result.summary.calloutCount} |\n`;
    report += `| Triggers | ${result.summary.triggerCount} |\n`;
    report += `| User Debug | ${result.summary.userDebugCount} |\n`;
    report += `| Exceptions | ${result.summary.exceptionCount} |\n\n`;

    // Governor limits
    if (result.governorLimits.CUMULATIVE) {
      report += '## Governor Limits (Cumulative)\n\n';
      report += `| Limit | Used | Max | % |\n|-------|------|-----|---|\n`;
      for (const [name, data] of Object.entries(result.governorLimits.CUMULATIVE)) {
        report += `| ${name} | ${data.used} | ${data.max} | ${data.percent}% |\n`;
      }
      report += '\n';
    }

    // Exceptions
    if (result.exceptions.length > 0) {
      report += '## Exceptions\n\n';
      for (const ex of result.exceptions) {
        report += `- **${ex.type}**: ${ex.message} (line ${ex.lineNumber})\n`;
      }
      report += '\n';
    }

    // Warnings
    if (result.summary.warnings.length > 0) {
      report += '## Warnings\n\n';
      for (const warn of result.summary.warnings) {
        report += `- **${warn.type}**: ${warn.message}\n`;
      }
      report += '\n';
    }

    // Top SOQL queries by rows
    if (result.soqlQueries.length > 0) {
      const topQueries = [...result.soqlQueries]
        .sort((a, b) => (b.rows || 0) - (a.rows || 0))
        .slice(0, 5);

      report += '## Top SOQL Queries (by rows)\n\n';
      for (const q of topQueries) {
        report += `- **${q.rows} rows** (${q.duration || '?'}ms): \`${q.query.substring(0, 60)}...\`\n`;
      }
      report += '\n';
    }

    // Top methods by duration
    if (result.methods.length > 0) {
      const topMethods = [...result.methods]
        .filter(m => m.duration !== null)
        .sort((a, b) => (b.duration || 0) - (a.duration || 0))
        .slice(0, 5);

      report += '## Slowest Methods\n\n';
      for (const m of topMethods) {
        report += `- **${m.duration}ms**: ${m.className}.${m.methodName}\n`;
      }
    }

    return report;
  }
}

// ========================================
// CLI Mode
// ========================================

if (require.main === module) {
  const fs = require('fs');
  const args = process.argv.slice(2);
  const command = args[0];
  const filePath = args[1];

  if (!command || !filePath) {
    console.log(`
Usage: node apex-log-parser.js <command> <file>

Commands:
  parse <file>       Parse log and output JSON
  summary <file>     Generate markdown summary
  exceptions <file>  Extract only exceptions
  soql <file>        Extract only SOQL queries
  limits <file>      Extract governor limits

Examples:
  node apex-log-parser.js parse ./debug.log
  node apex-log-parser.js summary ./debug.log > report.md
  node apex-log-parser.js exceptions ./debug.log
`);
    process.exit(1);
  }

  try {
    const logContent = fs.readFileSync(filePath, 'utf-8');
    const parser = new ApexLogParser({ verbose: process.env.VERBOSE === '1' });

    switch (command) {
      case 'parse':
        console.log(JSON.stringify(parser.parse(logContent), null, 2));
        break;
      case 'summary':
        console.log(parser.generateSummary(logContent));
        break;
      case 'exceptions':
        console.log(JSON.stringify(parser.extractExceptions(logContent), null, 2));
        break;
      case 'soql':
        console.log(JSON.stringify(parser.extractSOQLQueries(logContent), null, 2));
        break;
      case 'limits':
        console.log(JSON.stringify(parser.extractGovernorLimits(logContent), null, 2));
        break;
      default:
        console.error(`Unknown command: ${command}`);
        process.exit(1);
    }
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

module.exports = { ApexLogParser, ApexLogParseError };
