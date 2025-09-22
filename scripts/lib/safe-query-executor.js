/**
 * Safe Query Executor
 * 
 * Purpose: Wrapper for all data queries that ensures real data is retrieved
 * and never simulated without explicit disclosure.
 * 
 * This module provides:
 * - Safe execution of queries with full metadata tracking
 * - Automatic failure reporting without fallback to fake data
 * - Complete audit trail of all query attempts
 * - Data source verification and labeling
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { DataAccessError, requireRealData } = require('./data-access-error');

class QueryExecutionError extends Error {
  constructor(execution) {
    super(`Query failed: ${execution.error || 'Unknown error'}`);
    this.name = 'QueryExecutionError';
    this.execution = execution;
    this.timestamp = execution.timestamp;
    this.query = execution.query;
  }
}

class SafeQueryExecutor {
  constructor(config = {}) {
    this.config = {
      enforceRealData: config.enforceRealData !== false,
      requireMetadata: config.requireMetadata !== false,
      logQueries: config.logQueries !== false,
      logDir: config.logDir || path.join(process.cwd(), '.claude', 'logs', 'queries'),
      ...config
    };
    
    this.queryLog = [];
    this.sessionId = crypto.randomBytes(8).toString('hex');
  }

  /**
   * Execute a query safely with full tracking
   */
  async executeQuery(query, options = {}) {
    const execution = {
      queryId: this.generateQueryId(),
      sessionId: this.sessionId,
      query,
      timestamp: new Date().toISOString(),
      dataSource: 'UNKNOWN',
      success: false,
      recordCount: 0,
      executionTime: 0,
      metadata: {},
      options
    };

    const startTime = Date.now();

    try {
      // Validate query before execution
      this.validateQuery(query);
      
      // Attempt to execute via MCP first
      let result = await this.executeMCPQuery(query, options);
      
      // If MCP fails and CLI is allowed as fallback
      if (!result && options.allowCLIFallback) {
        execution.metadata.fallbackUsed = true;
        result = await this.executeCLIQuery(query, options);
      }

      // If still no result and we're in strict mode
      if (!result && this.config.enforceRealData) {
        throw new DataAccessError(
          'Salesforce Query',
          'Unable to execute query - no data source available',
          { query: query.substring(0, 500), options }
        );
      }

      // Process successful result
      if (result) {
        // Validate the data is real
        const validatedData = requireRealData(
          result.source || 'UNKNOWN',
          result.data,
          { query: query.substring(0, 500) }
        );

        execution.success = true;
        execution.dataSource = result.source || 'UNKNOWN';
        execution.data = validatedData;
        execution.recordCount = Array.isArray(validatedData) ? validatedData.length : 1;
        execution.metadata = { ...execution.metadata, ...result.metadata };
      }

    } catch (error) {
      execution.success = false;
      execution.error = error.message;
      execution.dataSource = 'QUERY_FAILED';
      execution.errorDetails = {
        message: error.message,
        stack: error.stack,
        query: query.substring(0, 500)
      };

      // In strict mode, always throw
      if (this.config.enforceRealData) {
        await this.logExecution(execution);
        throw new QueryExecutionError(execution);
      }
    } finally {
      execution.executionTime = Date.now() - startTime;
    }

    // Log the execution
    await this.logExecution(execution);

    // Return wrapped result
    return this.wrapResult(execution);
  }

  /**
   * Execute query via MCP tools
   */
  async executeMCPQuery(query, options) {
    try {
      // This would integrate with actual MCP tools
      // For now, we'll simulate the interface
      
      // Check if MCP is available
      const mcpAvailable = await this.checkMCPAvailability();
      if (!mcpAvailable) {
        throw new Error('MCP tools not available');
      }

      // Execute via MCP
      // In real implementation, this would call the actual MCP tool
      const result = await this.callMCPTool('mcp_salesforce_data_query', { query });
      
      return {
        source: 'MCP_SALESFORCE',
        data: result.data,
        metadata: {
          tool: 'mcp_salesforce_data_query',
          instance: result.instance,
          queryTime: result.executionTime
        }
      };
    } catch (error) {
      console.error('MCP query failed:', error.message);
      return null;
    }
  }

  /**
   * Execute query via CLI (fallback only)
   */
  async executeCLIQuery(query, options) {
    try {
      const { exec } = require('child_process');
      const util = require('util');
      const execPromise = util.promisify(exec);
      const { prepareQuery } = require('./soql-guard');

      // Build CLI command
      const prep = prepareQuery(query, { allowRewrite: false });
      const queryToRun = prep.query.replace(/"/g, '\\"');
      const flags = prep.flags.join(' ');
      const command = `sf data query --query "${queryToRun}" ${flags} --json`;

      // Execute
      const { stdout } = await execPromise(command);
      const result = JSON.parse(stdout);

      if (result.status === 0 && result.result) {
        return {
          source: 'CLI_SALESFORCE',
          data: result.result.records,
          metadata: {
            tool: 'sf_cli',
            totalSize: result.result.totalSize,
            queryTime: Date.now(),
            tooling: prep.useToolingApi || false,
            issues: (prep.issues || []).map(i => i.id)
          }
        };
      }

      throw new Error(result.message || 'CLI query failed');
    } catch (error) {
      console.error('CLI query failed:', error.message);
      return null;
    }
  }

  /**
   * Validate query before execution
   */
  validateQuery(query) {
    if (!query || typeof query !== 'string') {
      throw new Error('Invalid query: must be a non-empty string');
    }

    // Basic SOQL validation
    if (!query.trim().toUpperCase().startsWith('SELECT')) {
      throw new Error('Invalid SOQL: query must start with SELECT');
    }

    // Check for obvious test data patterns
    const suspiciousPatterns = [
      /Lead \d+/i,
      /Test.*Data/i,
      /Example.*Record/i,
      /Demo.*Account/i
    ];

    for (const pattern of suspiciousPatterns) {
      if (pattern.test(query)) {
        console.warn(`⚠️ Warning: Query contains suspicious pattern: ${pattern}`);
      }
    }

    return true;
  }

  /**
   * Check MCP availability
   */
  async checkMCPAvailability() {
    // In real implementation, this would check actual MCP status
    // For now, we'll check if MCP config exists
    try {
      await fs.access(path.join(process.cwd(), '.mcp.json'));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Call MCP tool (stub for real implementation)
   */
  async callMCPTool(toolName, params) {
    // This would be replaced with actual MCP tool invocation
    // For now, throw to indicate it needs implementation
    throw new Error(`MCP tool ${toolName} not implemented - this requires MCP integration`);
  }

  /**
   * Wrap result with metadata and verification
   */
  wrapResult(execution) {
    const wrapped = {
      success: execution.success,
      data: execution.data || null,
      metadata: {
        queryId: execution.queryId,
        timestamp: execution.timestamp,
        dataSource: execution.dataSource,
        recordCount: execution.recordCount,
        executionTime: execution.executionTime,
        query: execution.query,
        ...execution.metadata
      }
    };

    // Add data source label
    wrapped.dataSourceLabel = this.getDataSourceLabel(execution.dataSource);

    // Add confidence score
    wrapped.confidence = this.calculateConfidence(execution);

    // Add verification status
    wrapped.verified = execution.success && execution.dataSource !== 'UNKNOWN';

    return wrapped;
  }

  /**
   * Get human-readable data source label
   */
  getDataSourceLabel(source) {
    const labels = {
      'MCP_SALESFORCE': '✅ VERIFIED - Live Salesforce (MCP)',
      'CLI_SALESFORCE': '✅ VERIFIED - Live Salesforce (CLI)',
      'QUERY_FAILED': '❌ FAILED - Query could not be executed',
      'UNKNOWN': '❓ UNKNOWN - Data source cannot be determined'
    };

    return labels[source] || '❓ UNKNOWN';
  }

  /**
   * Calculate confidence score for the data
   */
  calculateConfidence(execution) {
    if (!execution.success) return 0;

    let confidence = 0;

    // Base confidence from source
    if (execution.dataSource === 'MCP_SALESFORCE') confidence = 0.99;
    else if (execution.dataSource === 'CLI_SALESFORCE') confidence = 0.95;
    else if (execution.dataSource === 'UNKNOWN') confidence = 0.1;

    // Adjust based on record count
    if (execution.recordCount === 0) confidence *= 0.8;
    else if (execution.recordCount > 1000) confidence *= 0.95;

    // Adjust based on execution time
    if (execution.executionTime < 10) confidence *= 0.9; // Too fast, might be cached
    else if (execution.executionTime > 10000) confidence *= 0.95; // Slow query

    return Math.min(confidence, 1.0);
  }

  /**
   * Generate unique query ID
   */
  generateQueryId() {
    return `q_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  }

  /**
   * Log execution details
   */
  async logExecution(execution) {
    if (!this.config.logQueries) return;

    try {
      // Ensure log directory exists
      await fs.mkdir(this.config.logDir, { recursive: true });

      // Add to in-memory log
      this.queryLog.push(execution);

      // Write to file
      const logFile = path.join(this.config.logDir, `${this.sessionId}.json`);
      await fs.writeFile(logFile, JSON.stringify(this.queryLog, null, 2));

      // Also log failures to separate file
      if (!execution.success) {
        const errorFile = path.join(this.config.logDir, 'errors.json');
        let errors = [];
        try {
          errors = JSON.parse(await fs.readFile(errorFile, 'utf-8'));
        } catch (e) {
          // File doesn't exist yet
        }
        errors.push(execution);
        await fs.writeFile(errorFile, JSON.stringify(errors, null, 2));
      }
    } catch (error) {
      console.error('Failed to log query execution:', error.message);
    }
  }

  /**
   * Get execution summary
   */
  getSummary() {
    const summary = {
      sessionId: this.sessionId,
      totalQueries: this.queryLog.length,
      successfulQueries: this.queryLog.filter(q => q.success).length,
      failedQueries: this.queryLog.filter(q => !q.success).length,
      dataSources: {}
    };

    // Count by data source
    for (const execution of this.queryLog) {
      summary.dataSources[execution.dataSource] = 
        (summary.dataSources[execution.dataSource] || 0) + 1;
    }

    return summary;
  }

  /**
   * Validate that data is real (not simulated)
   */
  static validateRealData(data) {
    if (!data) return { isReal: false, reason: 'No data provided' };

    const dataStr = JSON.stringify(data);
    
    // Check for obvious fake patterns
    const fakePatterns = [
      /Lead \d{2,}/g,
      /Opportunity \d{2,}/g,
      /Account \d{2,}/g,
      /00[QAC]0{14}/g, // Fake Salesforce IDs
      /Example \d+/g,
      /Test Data/gi
    ];

    for (const pattern of fakePatterns) {
      const matches = dataStr.match(pattern);
      if (matches && matches.length > 2) {
        return {
          isReal: false,
          reason: `Detected fake data pattern: ${pattern}`,
          matches: matches.slice(0, 5)
        };
      }
    }

    // Check for suspicious round numbers
    const numbers = dataStr.match(/\b\d+\.0+\b/g);
    if (numbers && numbers.length > 5) {
      return {
        isReal: false,
        reason: 'Too many round numbers detected',
        suspicious: numbers.slice(0, 5)
      };
    }

    return { isReal: true };
  }
}

// Export for use in other modules
module.exports = SafeQueryExecutor;
