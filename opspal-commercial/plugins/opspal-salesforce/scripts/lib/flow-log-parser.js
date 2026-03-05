#!/usr/bin/env node

/**
 * FlowLogParser - Parse Salesforce debug logs to extract Flow execution details
 *
 * @module flow-log-parser
 * @version 3.43.0
 * @description Parses debug logs to extract Flow executions, elements, decisions, errors,
 *              and governor limit usage. Part of Runbook 7: Flow Testing & Diagnostic Framework.
 *
 * @see docs/runbooks/flow-xml-development/07-testing-and-diagnostics.md (Section 3)
 * @see docs/FLOW_DIAGNOSTIC_SCRIPT_INTERFACES.md (Section 3)
 *
 * @example
 * const { FlowLogParser } = require('./flow-log-parser');
 *
 * const parser = new FlowLogParser('gamma-corp', { verbose: true });
 * const result = await parser.parseLog('07Lxx000000XXXX');
 *
 * console.log('Flow executions:', result.flowExecutions.length);
 * console.log('Errors found:', result.errors.length);
 */

const { execSync } = require('child_process');
const fs = require('fs');

/**
 * Custom error class for log parsing failures
 */
class LogParseError extends Error {
  /**
   * @param {string} message - Error message
   * @param {string} code - Error code
   * @param {object} details - Additional details
   */
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'LogParseError';
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, LogParseError);
  }
}

/**
 * Flow LogParser - Parse debug logs for Flow execution analysis
 */
class FlowLogParser {
  /**
   * Create a new FlowLogParser instance
   *
   * @param {string} orgAlias - Salesforce org alias
   * @param {object} options - Configuration options
   * @param {boolean} [options.verbose=false] - Enable detailed logging
   * @param {boolean} [options.extractOnlyErrors=false] - Extract only error lines
   * @param {boolean} [options.parseFormulas=true] - Parse formula evaluations
   * @param {boolean} [options.parseDecisions=true] - Parse decision outcomes
   */
  constructor(orgAlias, options = {}) {
    if (!orgAlias) {
      throw new LogParseError('orgAlias is required', 'INVALID_ARGUMENT');
    }

    this.orgAlias = orgAlias;
    this.options = {
      verbose: false,
      extractOnlyErrors: false,
      parseFormulas: true,
      parseDecisions: true,
      ...options
    };

    this.log = this.options.verbose ? console.log : () => {};

    // Log parsing patterns
    this.patterns = {
      flowStart: /FLOW_START_INTERVIEWS_BEGIN\s*\|.*FlowDefinition:\s*([^\s]+)/,
      flowEnd: /FLOW_START_INTERVIEWS_END/,
      flowElement: /FLOW_ELEMENT_BEGIN\s*\|.*\[.*\]\s*element:\s*([^\s]+)/,
      flowElementEnd: /FLOW_ELEMENT_END/,
      flowError: /FLOW_ELEMENT_ERROR\s*\|.*element:\s*([^\s]+).*error:\s*(.+)/,
      decision: /FLOW_DECISION\s*\|.*element:\s*([^\s]+).*outcome:\s*(\w+)/,
      validation: /VALIDATION_ERROR\s*\|.*message:\s*(.+)/,
      dml: /DML_BEGIN\s*\|.*Op:(\w+)\|Type:([^\|]+)/,
      soql: /SOQL_EXECUTE_BEGIN\s*\|.*query:(.+)/,
      cpuTime: /LIMIT_USAGE_FOR_NS.*\s*(\d+)\s*out of\s*(\d+)/,
      heapSize: /MAXIMUM_HEAP_SIZE\s*\|.*\|(\d+)\|(\d+)/
    };
  }

  /**
   * Emit observability event
   *
   * @private
   */
  _emitEvent(event) {
    const fullEvent = {
      ...event,
      orgAlias: this.orgAlias,
      timestamp: new Date().toISOString()
    };

    if (process.env.ENABLE_OBSERVABILITY === '1') {
      console.log(`[OBSERVABILITY] ${JSON.stringify(fullEvent)}`);
    }
  }

  /**
   * Execute SF CLI command
   *
   * @private
   */
  _execSfCommand(command, timeout = 60000) {
    try {
      const output = execSync(command, {
        timeout,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe']
      });
      return output.trim();
    } catch (error) {
      throw new LogParseError(
        `SF CLI command failed: ${error.message}`,
        'CLI_ERROR',
        { command }
      );
    }
  }

  /**
   * Retrieve debug log content
   *
   * @private
   * @param {string} logId - Debug log ID
   * @returns {string} Log content
   */
  _retrieveLogContent(logId) {
    try {
      const logContent = this._retrieveLogContentViaCli(logId);
      if (logContent) {
        return logContent;
      }
    } catch (error) {
      this.log(`CLI log retrieval failed, falling back to Tooling API: ${error.message}`);
    }

    try {
      // Use Tooling API to retrieve log
      const query = `SELECT Id, Application, DurationMilliseconds, Operation, Request, StartTime, Status FROM ApexLog WHERE Id = '${logId}' LIMIT 1`;
      const command = `sf data query --query "${query}" --target-org ${this.orgAlias} --json --use-tooling-api`;

      const output = this._execSfCommand(command);
      const data = JSON.parse(output);

      if (data.status !== 0 || !data.result?.records?.length) {
        throw new LogParseError(
          `Debug log not found: ${logId}`,
          'LOG_NOT_FOUND',
          { logId }
        );
      }

      // Get actual log body
      const bodyCommand = `sf data query --query "SELECT Body FROM ApexLog WHERE Id = '${logId}'" --target-org ${this.orgAlias} --json --use-tooling-api`;
      const bodyOutput = this._execSfCommand(bodyCommand);
      const bodyData = JSON.parse(bodyOutput);

      if (bodyData.status === 0 && bodyData.result?.records?.length > 0) {
        return bodyData.result.records[0].Body;
      }

      throw new LogParseError(
        `Could not retrieve log body for: ${logId}`,
        'LOG_BODY_MISSING',
        { logId }
      );

    } catch (error) {
      if (error instanceof LogParseError) {
        throw error;
      }
      throw new LogParseError(
        'Failed to retrieve debug log',
        'RETRIEVE_FAILED',
        { logId, error: error.message }
      );
    }
  }

  _retrieveLogContentViaCli(logId) {
    const command = `sf apex get log --log-id ${logId} --target-org ${this.orgAlias}`;
    const output = this._execSfCommand(command);
    const trimmed = output.trim();

    if (!trimmed) {
      throw new LogParseError('Empty log output', 'LOG_BODY_MISSING', { logId });
    }

    if (trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed);
        const body = parsed?.result?.log
          || parsed?.result?.logContents
          || parsed?.result?.body
          || parsed?.result?.text;
        if (body) {
          return body;
        }
      } catch (error) {
        // Ignore JSON parse failures and treat as raw log output.
      }
    }

    return output;
  }

  /**
   * Parse a single debug log
   *
   * @param {string} logId - Debug log ID (15 or 18 char)
   * @returns {Promise<ParsedLog>} Parsed log data
   *
   * @example
   * const result = await parser.parseLog('07Lxx000000XXXX');
   * console.log('Elements executed:', result.elementsExecuted.length);
   */
  async parseLog(logId) {
    const startTime = Date.now();
    this.log(`\n=== Parsing Debug Log: ${logId} ===`);

    try {
      // Retrieve log content
      this.log('Retrieving log content...');
      const logContent = this._retrieveLogContent(logId);
      const lines = logContent.split('\n');

      const result = {
        logId,
        timestamp: new Date().toISOString(),
        duration: 0,
        flowExecutions: [],
        elementsExecuted: [],
        decisionsEvaluated: [],
        errors: [],
        governorLimits: {
          soqlQueries: { used: 0, max: 100 },
          soqlRows: { used: 0, max: 50000 },
          dmlStatements: { used: 0, max: 150 },
          dmlRows: { used: 0, max: 10000 },
          cpuTime: { used: 0, max: 10000 },
          heapSize: { used: 0, max: 6000000 }
        },
        validationRules: []
      };

      let currentFlow = null;
      let currentElement = null;
      let lineNumber = 0;

      // Parse log line by line
      for (const line of lines) {
        lineNumber++;

        // Flow start
        const flowStartMatch = line.match(this.patterns.flowStart);
        if (flowStartMatch) {
          currentFlow = {
            flowApiName: flowStartMatch[1],
            flowVersionNumber: null,
            startLine: lineNumber,
            endLine: null,
            duration: 0,
            outcome: 'success'
          };
          this.log(`Found Flow: ${currentFlow.flowApiName}`);
        }

        // Flow end
        if (line.match(this.patterns.flowEnd) && currentFlow) {
          currentFlow.endLine = lineNumber;
          result.flowExecutions.push(currentFlow);
          currentFlow = null;
        }

        // Element start
        const elementMatch = line.match(this.patterns.flowElement);
        if (elementMatch) {
          currentElement = {
            elementName: elementMatch[1],
            elementType: this._guessElementType(line),
            startLine: lineNumber,
            endLine: null,
            duration: 0,
            outcome: 'success'
          };
        }

        // Element end
        if (line.match(this.patterns.flowElementEnd) && currentElement) {
          currentElement.endLine = lineNumber;
          result.elementsExecuted.push(currentElement);
          currentElement = null;
        }

        // Flow errors
        const errorMatch = line.match(this.patterns.flowError);
        if (errorMatch) {
          result.errors.push({
            type: 'FLOW_ERROR',
            message: errorMatch[2],
            element: errorMatch[1],
            line: lineNumber,
            stackTrace: null
          });

          if (currentFlow) {
            currentFlow.outcome = 'failed';
          }
        }

        // Decisions
        if (this.options.parseDecisions) {
          const decisionMatch = line.match(this.patterns.decision);
          if (decisionMatch) {
            result.decisionsEvaluated.push({
              elementName: decisionMatch[1],
              condition: 'Unknown',
              outcome: decisionMatch[2] === 'true',
              branchTaken: decisionMatch[2],
              line: lineNumber
            });
          }
        }

        // Validation errors
        const validationMatch = line.match(this.patterns.validation);
        if (validationMatch) {
          result.errors.push({
            type: 'VALIDATION_ERROR',
            message: validationMatch[1],
            line: lineNumber
          });

          result.validationRules.push({
            ruleName: 'Unknown',
            outcome: 'failed',
            errorMessage: validationMatch[1],
            line: lineNumber
          });
        }

        // SOQL queries
        const soqlMatch = line.match(this.patterns.soql);
        if (soqlMatch) {
          result.governorLimits.soqlQueries.used++;
        }

        // DML operations
        const dmlMatch = line.match(this.patterns.dml);
        if (dmlMatch) {
          result.governorLimits.dmlStatements.used++;
        }

        // CPU time (usually at end of log)
        const cpuMatch = line.match(this.patterns.cpuTime);
        if (cpuMatch) {
          result.governorLimits.cpuTime.used = parseInt(cpuMatch[1]);
          result.governorLimits.cpuTime.max = parseInt(cpuMatch[2]);
        }

        // Heap size
        const heapMatch = line.match(this.patterns.heapSize);
        if (heapMatch) {
          result.governorLimits.heapSize.used = parseInt(heapMatch[1]);
          result.governorLimits.heapSize.max = parseInt(heapMatch[2]);
        }
      }

      result.duration = Date.now() - startTime;

      this._emitEvent({
        type: 'flow_log_parsed',
        logId,
        flowsFound: result.flowExecutions.length,
        errorsFound: result.errors.length,
        duration: result.duration
      });

      this.log(`✓ Parsed log: ${result.flowExecutions.length} Flows, ${result.errors.length} errors`);
      return result;

    } catch (error) {
      this._emitEvent({
        type: 'flow_log_parsed',
        logId,
        outcome: 'failure',
        duration: Date.now() - startTime,
        error: error.message
      });

      if (error instanceof LogParseError) {
        throw error;
      }

      throw new LogParseError(
        'Failed to parse debug log',
        'PARSE_FAILED',
        { logId, error: error.message }
      );
    }
  }

  /**
   * Guess element type from log line
   *
   * @private
   */
  _guessElementType(line) {
    if (line.includes('Decision')) return 'Decision';
    if (line.includes('Assignment')) return 'Assignment';
    if (line.includes('RecordLookup')) return 'RecordLookup';
    if (line.includes('RecordCreate')) return 'RecordCreate';
    if (line.includes('RecordUpdate')) return 'RecordUpdate';
    if (line.includes('RecordDelete')) return 'RecordDelete';
    if (line.includes('Loop')) return 'Loop';
    if (line.includes('Subflow')) return 'Subflow';
    return 'Unknown';
  }

  /**
   * Parse multiple logs (batch mode)
   *
   * @param {Array<string>} logIds - Array of debug log IDs
   * @returns {Promise<Array<ParsedLog>>} Array of parsed logs
   *
   * @example
   * const results = await parser.parseMultipleLogs([
   *   '07Lxx000000XXXX1',
   *   '07Lxx000000XXXX2'
   * ]);
   */
  async parseMultipleLogs(logIds) {
    this.log(`\n=== Parsing ${logIds.length} Debug Logs ===`);

    const results = [];
    for (const logId of logIds) {
      try {
        const result = await this.parseLog(logId);
        results.push(result);
      } catch (error) {
        this.log(`Warning: Failed to parse ${logId}: ${error.message}`);
        results.push({
          logId,
          error: error.message,
          success: false
        });
      }
    }

    return results;
  }

  /**
   * Extract only Flow errors from log
   *
   * @param {string} logId - Debug log ID
   * @returns {Promise<Array<FlowError>>} Array of Flow errors
   *
   * @example
   * const errors = await parser.extractFlowErrors('07Lxx000000XXXX');
   * console.log('Errors:', errors.length);
   */
  async extractFlowErrors(logId) {
    this.log(`\n=== Extracting Flow Errors from ${logId} ===`);

    try {
      const parsedLog = await this.parseLog(logId);
      return parsedLog.errors.map(error => ({
        flowApiName: parsedLog.flowExecutions[0]?.flowApiName || 'Unknown',
        elementName: error.element || null,
        errorType: error.type,
        errorMessage: error.message,
        lineNumber: error.line,
        stackTrace: error.stackTrace || null,
        recommendation: this._generateRecommendation(error)
      }));

    } catch (error) {
      throw new LogParseError(
        'Failed to extract Flow errors',
        'EXTRACT_FAILED',
        { logId, error: error.message }
      );
    }
  }

  /**
   * Generate error recommendation
   *
   * @private
   */
  _generateRecommendation(error) {
    if (error.type === 'VALIDATION_ERROR') {
      return 'Check validation rules and ensure Flow populates all required fields';
    }
    if (error.message?.includes('FIELD_CUSTOM_VALIDATION_EXCEPTION')) {
      return 'Flow violates a validation rule - add logic to satisfy the rule';
    }
    if (error.message?.includes('INSUFFICIENT_ACCESS')) {
      return 'Check field-level security and object permissions';
    }
    return 'Review Flow logic at the failed element';
  }

  /**
   * Get latest debug log for user/Flow
   *
   * @param {string} username - Salesforce username or 'Automated Process'
   * @param {object} [options] - Filter options
   * @param {string} [options.flowName] - Filter by Flow name
   * @param {number} [options.maxAgeDays=1] - Only consider logs from last N days
   * @returns {Promise<ParsedLog|null>} Latest parsed log or null
   *
   * @example
   * const log = await parser.getLatestLog('Automated Process', {
   *   flowName: 'Account_Validation_Flow',
   *   maxAgeDays: 1
   * });
   */
  async getLatestLog(username, options = {}) {
    this.log(`\n=== Fetching Latest Log for ${username} ===`);

    try {
      // Query for latest log
      const maxAgeDays = options.maxAgeDays || 1;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - maxAgeDays);
      const startDateStr = startDate.toISOString();

      const query = `SELECT Id FROM ApexLog WHERE StartTime >= ${startDateStr} ORDER BY StartTime DESC LIMIT 1`;
      const command = `sf data query --query "${query}" --target-org ${this.orgAlias} --json --use-tooling-api`;

      const output = this._execSfCommand(command);
      const data = JSON.parse(output);

      if (data.status === 0 && data.result?.records?.length > 0) {
        const logId = data.result.records[0].Id;
        return await this.parseLog(logId);
      }

      this.log('No recent logs found');
      return null;

    } catch (error) {
      throw new LogParseError(
        'Failed to fetch latest log',
        'FETCH_FAILED',
        { username, error: error.message }
      );
    }
  }
}

// Export classes
module.exports = {
  FlowLogParser,
  LogParseError
};

// CLI entry point
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('Usage: flow-log-parser.js <org-alias> <log-id>');
    console.error('       flow-log-parser.js <org-alias> latest [--username "Automated Process"]');
    process.exit(1);
  }

  const orgAlias = args[0];
  const logIdOrCommand = args[1];

  const parser = new FlowLogParser(orgAlias, { verbose: true });

  let promise;
  if (logIdOrCommand === 'latest') {
    const username = args.find(arg => arg.startsWith('--username'))
      ? args[args.indexOf('--username') + 1]
      : 'Automated Process';

    promise = parser.getLatestLog(username);
  } else {
    promise = parser.parseLog(logIdOrCommand);
  }

  promise
    .then(result => {
      console.log(JSON.stringify(result, null, 2));
      process.exit(0);
    })
    .catch(error => {
      console.error('Parse failed:', error.message);
      process.exit(1);
    });
}
