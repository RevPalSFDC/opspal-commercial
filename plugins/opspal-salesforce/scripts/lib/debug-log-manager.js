#!/usr/bin/env node

/**
 * DebugLogManager - Manage Salesforce debug logging via Tooling API
 *
 * @module debug-log-manager
 * @version 1.0.0
 * @description Provides programmatic management of TraceFlags, DebugLevels, and ApexLogs
 *              via the Salesforce Tooling API. Supports setting up debug logging for users,
 *              retrieving logs, and cleanup operations.
 *
 * @see docs/runbooks/flow-xml-development/07-testing-and-diagnostics.md
 * @see Salesforce Debug Logs API Playbook
 *
 * @example
 * const { DebugLogManager } = require('./debug-log-manager');
 *
 * const manager = new DebugLogManager('myorg', { verbose: true });
 *
 * // Start debug logging for current user
 * const result = await manager.startDebugLogging({ preset: 'standard', duration: 30 });
 *
 * // Retrieve recent logs
 * const logs = await manager.getRecentLogs({ limit: 5 });
 *
 * // Get log content
 * const logBody = await manager.getLogBody(logs[0].Id);
 *
 * // Stop and cleanup
 * await manager.stopDebugLogging();
 */

const { execSync } = require('child_process');
const fs = require('fs');

/**
 * Custom error class for debug log operations
 */
class DebugLogError extends Error {
  /**
   * @param {string} message - Error message
   * @param {string} code - Error code
   * @param {object} details - Additional details
   */
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'DebugLogError';
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, DebugLogError);
  }
}

/**
 * DebugLogManager - Manage Salesforce debug logging lifecycle
 */
class DebugLogManager {
  /**
   * Debug Level Presets
   * @type {Object.<string, Object>}
   */
  static PRESETS = {
    quick: {
      ApexCode: 'INFO',
      ApexProfiling: 'NONE',
      Callout: 'INFO',
      Database: 'NONE',
      System: 'INFO',
      Validation: 'INFO',
      Visualforce: 'NONE',
      Workflow: 'INFO'
    },
    standard: {
      ApexCode: 'DEBUG',
      ApexProfiling: 'INFO',
      Callout: 'INFO',
      Database: 'INFO',
      System: 'DEBUG',
      Validation: 'INFO',
      Visualforce: 'INFO',
      Workflow: 'INFO'
    },
    detailed: {
      ApexCode: 'FINE',
      ApexProfiling: 'FINE',
      Callout: 'FINEST',
      Database: 'FINEST',
      System: 'DEBUG',
      Validation: 'INFO',
      Visualforce: 'FINE',
      Workflow: 'FINEST'
    },
    flow: {
      ApexCode: 'INFO',
      ApexProfiling: 'NONE',
      Callout: 'INFO',
      Database: 'INFO',
      System: 'DEBUG',
      Validation: 'INFO',
      Visualforce: 'NONE',
      Workflow: 'FINEST'
    },
    apex: {
      ApexCode: 'FINEST',
      ApexProfiling: 'FINE',
      Callout: 'DEBUG',
      Database: 'DEBUG',
      System: 'DEBUG',
      Validation: 'INFO',
      Visualforce: 'NONE',
      Workflow: 'INFO'
    }
  };

  /**
   * Create a new DebugLogManager instance
   *
   * @param {string} orgAlias - Salesforce org alias
   * @param {object} options - Configuration options
   * @param {boolean} [options.verbose=false] - Enable detailed logging
   * @param {number} [options.timeout=60000] - Command timeout in ms
   */
  constructor(orgAlias, options = {}) {
    if (!orgAlias) {
      throw new DebugLogError('orgAlias is required', 'INVALID_ARGUMENT');
    }

    this.orgAlias = orgAlias;
    this.options = {
      verbose: false,
      timeout: 60000,
      ...options
    };

    this.log = this.options.verbose ? console.log : () => {};

    // Track created resources for cleanup
    this._createdTraceFlagIds = [];
    this._createdDebugLevelIds = [];
  }

  /**
   * Emit observability event
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
   * @private
   */
  _execSfCommand(command, timeout = this.options.timeout) {
    try {
      this.log(`[DEBUG] Executing: ${command}`);
      const output = execSync(command, {
        timeout,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe']
      });
      return output.trim();
    } catch (error) {
      throw new DebugLogError(
        `SF CLI command failed: ${error.message}`,
        'CLI_ERROR',
        { command, stderr: error.stderr?.toString() }
      );
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
        throw new DebugLogError(
          data.message || 'SF CLI returned non-zero status',
          'CLI_ERROR',
          { result: data }
        );
      }
      return data.result;
    } catch (error) {
      if (error instanceof DebugLogError) throw error;
      throw new DebugLogError(
        `Failed to parse SF CLI output: ${error.message}`,
        'PARSE_ERROR',
        { output }
      );
    }
  }

  // ========================================
  // User Resolution Methods
  // ========================================

  /**
   * Get the current user's ID from org display
   * @returns {Promise<string>} User ID
   */
  async getCurrentUserId() {
    const command = `sf org display --target-org ${this.orgAlias} --json`;
    const output = this._execSfCommand(command);
    const result = this._parseSfResult(output);

    if (!result.id) {
      throw new DebugLogError('Could not determine current user ID', 'USER_NOT_FOUND');
    }

    this.log(`Current user ID: ${result.id}`);
    return result.id;
  }

  /**
   * Get user ID by username
   * @param {string} username - Username (email)
   * @returns {Promise<string>} User ID
   */
  async getUserIdByUsername(username) {
    const query = `SELECT Id, Username FROM User WHERE Username = '${username}' LIMIT 1`;
    const command = `sf data query --query "${query}" --target-org ${this.orgAlias} --json`;

    const output = this._execSfCommand(command);
    const result = this._parseSfResult(output);

    if (!result.records || result.records.length === 0) {
      throw new DebugLogError(`User not found: ${username}`, 'USER_NOT_FOUND', { username });
    }

    this.log(`Found user ${username}: ${result.records[0].Id}`);
    return result.records[0].Id;
  }

  /**
   * Get the Automated Process user ID
   * @returns {Promise<string>} User ID
   */
  async getAutomatedProcessUserId() {
    const query = `SELECT Id, Name FROM User WHERE Name = 'Automated Process' LIMIT 1`;
    const command = `sf data query --query "${query}" --target-org ${this.orgAlias} --json`;

    const output = this._execSfCommand(command);
    const result = this._parseSfResult(output);

    if (!result.records || result.records.length === 0) {
      throw new DebugLogError('Automated Process user not found', 'USER_NOT_FOUND');
    }

    this.log(`Automated Process user ID: ${result.records[0].Id}`);
    return result.records[0].Id;
  }

  // ========================================
  // Debug Level Management
  // ========================================

  /**
   * Get an existing debug level by DeveloperName
   * @param {string} developerName - Debug level DeveloperName
   * @returns {Promise<object|null>} Debug level record or null
   */
  async getDebugLevel(developerName) {
    const query = `SELECT Id, DeveloperName, MasterLabel, ApexCode, ApexProfiling, Callout, Database, System, Validation, Visualforce, Workflow FROM DebugLevel WHERE DeveloperName = '${developerName}' LIMIT 1`;
    const command = `sf data query --query "${query}" --target-org ${this.orgAlias} --json --use-tooling-api`;

    const output = this._execSfCommand(command);
    const result = this._parseSfResult(output);

    if (!result.records || result.records.length === 0) {
      this.log(`Debug level not found: ${developerName}`);
      return null;
    }

    this.log(`Found debug level: ${developerName} (${result.records[0].Id})`);
    return result.records[0];
  }

  /**
   * Create a new debug level
   * @param {string} name - DeveloperName and MasterLabel
   * @param {object} categories - Category log levels
   * @returns {Promise<object>} Created debug level record
   */
  async createDebugLevel(name, categories) {
    const payload = {
      DeveloperName: name,
      MasterLabel: name,
      ApexCode: categories.ApexCode || 'DEBUG',
      ApexProfiling: categories.ApexProfiling || 'NONE',
      Callout: categories.Callout || 'INFO',
      Database: categories.Database || 'INFO',
      System: categories.System || 'DEBUG',
      Validation: categories.Validation || 'INFO',
      Visualforce: categories.Visualforce || 'NONE',
      Workflow: categories.Workflow || 'INFO'
    };

    // Use sf data create record for Tooling API
    const values = Object.entries(payload)
      .map(([k, v]) => `${k}=${v}`)
      .join(' ');

    const command = `sf data create record --sobject DebugLevel --values "${values}" --target-org ${this.orgAlias} --json --use-tooling-api`;

    const output = this._execSfCommand(command);
    const result = this._parseSfResult(output);

    if (!result.id) {
      throw new DebugLogError('Failed to create debug level', 'CREATE_FAILED', { name, categories });
    }

    this._createdDebugLevelIds.push(result.id);
    this.log(`Created debug level: ${name} (${result.id})`);

    this._emitEvent({
      type: 'debug_log_operation',
      operation: 'create_debug_level',
      debugLevelId: result.id,
      name
    });

    return { Id: result.id, ...payload };
  }

  /**
   * Ensure a debug level exists, creating if necessary
   * @param {string} name - DeveloperName
   * @param {object} categories - Category log levels
   * @returns {Promise<object>} Debug level record
   */
  async ensureDebugLevel(name, categories) {
    const existing = await this.getDebugLevel(name);
    if (existing) {
      return existing;
    }
    return this.createDebugLevel(name, categories);
  }

  /**
   * Delete a debug level
   * @param {string} debugLevelId - Debug level ID
   * @returns {Promise<boolean>} Success
   */
  async deleteDebugLevel(debugLevelId) {
    const command = `sf data delete record --sobject DebugLevel --record-id ${debugLevelId} --target-org ${this.orgAlias} --json --use-tooling-api`;

    try {
      this._execSfCommand(command);
      this.log(`Deleted debug level: ${debugLevelId}`);
      return true;
    } catch (error) {
      this.log(`Failed to delete debug level ${debugLevelId}: ${error.message}`);
      return false;
    }
  }

  // ========================================
  // TraceFlag Management
  // ========================================

  /**
   * Create a trace flag for a user
   * @param {string} userId - User ID to trace
   * @param {string} debugLevelId - Debug level ID
   * @param {number} durationMinutes - Duration in minutes (max 480)
   * @returns {Promise<object>} Created trace flag record
   */
  async createTraceFlag(userId, debugLevelId, durationMinutes = 30) {
    // Calculate expiration date
    const expirationDate = new Date(Date.now() + durationMinutes * 60 * 1000);
    const expirationISO = expirationDate.toISOString();

    const values = `TracedEntityId=${userId} DebugLevelId=${debugLevelId} LogType=USER_DEBUG ExpirationDate=${expirationISO}`;

    const command = `sf data create record --sobject TraceFlag --values "${values}" --target-org ${this.orgAlias} --json --use-tooling-api`;

    const output = this._execSfCommand(command);
    const result = this._parseSfResult(output);

    if (!result.id) {
      throw new DebugLogError('Failed to create trace flag', 'CREATE_FAILED', { userId, debugLevelId });
    }

    this._createdTraceFlagIds.push(result.id);
    this.log(`Created trace flag: ${result.id} (expires: ${expirationISO})`);

    this._emitEvent({
      type: 'debug_log_operation',
      operation: 'create_trace_flag',
      traceFlagId: result.id,
      userId,
      debugLevelId,
      expiresAt: expirationISO
    });

    return {
      Id: result.id,
      TracedEntityId: userId,
      DebugLevelId: debugLevelId,
      LogType: 'USER_DEBUG',
      ExpirationDate: expirationISO
    };
  }

  /**
   * Get active trace flags, optionally filtered by user
   * @param {string} [userId] - Optional user ID filter
   * @returns {Promise<Array>} Array of trace flag records
   */
  async getActiveTraceFlags(userId = null) {
    const now = new Date().toISOString();
    let query = `SELECT Id, TracedEntityId, DebugLevelId, LogType, ExpirationDate, StartDate FROM TraceFlag WHERE ExpirationDate > ${now}`;

    if (userId) {
      query += ` AND TracedEntityId = '${userId}'`;
    }

    const command = `sf data query --query "${query}" --target-org ${this.orgAlias} --json --use-tooling-api`;

    const output = this._execSfCommand(command);
    const result = this._parseSfResult(output);

    this.log(`Found ${result.records?.length || 0} active trace flag(s)`);
    return result.records || [];
  }

  /**
   * Delete a trace flag
   * @param {string} traceFlagId - Trace flag ID
   * @returns {Promise<boolean>} Success
   */
  async deleteTraceFlag(traceFlagId) {
    const command = `sf data delete record --sobject TraceFlag --record-id ${traceFlagId} --target-org ${this.orgAlias} --json --use-tooling-api`;

    try {
      this._execSfCommand(command);
      this.log(`Deleted trace flag: ${traceFlagId}`);

      this._emitEvent({
        type: 'debug_log_operation',
        operation: 'delete_trace_flag',
        traceFlagId
      });

      return true;
    } catch (error) {
      this.log(`Failed to delete trace flag ${traceFlagId}: ${error.message}`);
      return false;
    }
  }

  /**
   * Extend a trace flag's expiration
   * @param {string} traceFlagId - Trace flag ID
   * @param {number} additionalMinutes - Additional minutes
   * @returns {Promise<object>} Updated trace flag
   */
  async extendTraceFlag(traceFlagId, additionalMinutes) {
    // Get current trace flag
    const query = `SELECT Id, ExpirationDate FROM TraceFlag WHERE Id = '${traceFlagId}' LIMIT 1`;
    const command = `sf data query --query "${query}" --target-org ${this.orgAlias} --json --use-tooling-api`;

    const output = this._execSfCommand(command);
    const result = this._parseSfResult(output);

    if (!result.records || result.records.length === 0) {
      throw new DebugLogError(`Trace flag not found: ${traceFlagId}`, 'NOT_FOUND');
    }

    // Calculate new expiration
    const currentExpiration = new Date(result.records[0].ExpirationDate);
    const newExpiration = new Date(Math.max(currentExpiration.getTime(), Date.now()) + additionalMinutes * 60 * 1000);
    const newExpirationISO = newExpiration.toISOString();

    // Update
    const updateCommand = `sf data update record --sobject TraceFlag --record-id ${traceFlagId} --values "ExpirationDate=${newExpirationISO}" --target-org ${this.orgAlias} --json --use-tooling-api`;

    this._execSfCommand(updateCommand);
    this.log(`Extended trace flag ${traceFlagId} to ${newExpirationISO}`);

    return { Id: traceFlagId, ExpirationDate: newExpirationISO };
  }

  // ========================================
  // Log Retrieval Methods
  // ========================================

  /**
   * Get recent debug logs
   * @param {object} options - Query options
   * @param {number} [options.limit=10] - Max logs to return
   * @param {string} [options.userId] - Filter by user ID
   * @param {string} [options.operation] - Filter by operation type
   * @returns {Promise<Array>} Array of log records
   */
  async getRecentLogs(options = {}) {
    const { limit = 10, userId, operation } = options;

    let query = `SELECT Id, LogLength, Application, DurationMilliseconds, Operation, Request, StartTime, Status, LogUserId FROM ApexLog`;
    const conditions = [];

    if (userId) {
      conditions.push(`LogUserId = '${userId}'`);
    }
    if (operation) {
      conditions.push(`Operation LIKE '%${operation}%'`);
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    query += ` ORDER BY StartTime DESC LIMIT ${limit}`;

    const command = `sf data query --query "${query}" --target-org ${this.orgAlias} --json --use-tooling-api`;

    const output = this._execSfCommand(command);
    const result = this._parseSfResult(output);

    this.log(`Retrieved ${result.records?.length || 0} log(s)`);
    return result.records || [];
  }

  /**
   * Get a specific log by ID
   * @param {string} logId - ApexLog ID
   * @returns {Promise<object>} Log record
   */
  async getLogById(logId) {
    const query = `SELECT Id, LogLength, Application, DurationMilliseconds, Operation, Request, StartTime, Status, LogUserId FROM ApexLog WHERE Id = '${logId}' LIMIT 1`;
    const command = `sf data query --query "${query}" --target-org ${this.orgAlias} --json --use-tooling-api`;

    const output = this._execSfCommand(command);
    const result = this._parseSfResult(output);

    if (!result.records || result.records.length === 0) {
      throw new DebugLogError(`Log not found: ${logId}`, 'NOT_FOUND');
    }

    return result.records[0];
  }

  /**
   * Get the body content of a debug log
   * @param {string} logId - ApexLog ID
   * @returns {Promise<string>} Log body content
   */
  async getLogBody(logId) {
    // Note: The Body field requires a separate REST call, but we can use SOQL with Tooling API
    // The Body field is a blob, so we need to handle it specially
    const query = `SELECT Id, Body FROM ApexLog WHERE Id = '${logId}' LIMIT 1`;
    const command = `sf data query --query "${query}" --target-org ${this.orgAlias} --json --use-tooling-api`;

    try {
      const output = this._execSfCommand(command);
      const result = this._parseSfResult(output);

      if (!result.records || result.records.length === 0) {
        throw new DebugLogError(`Log not found: ${logId}`, 'NOT_FOUND');
      }

      // Body might be returned directly or need special handling
      const body = result.records[0].Body;
      if (!body) {
        // Try alternative approach using REST endpoint
        return this._getLogBodyViaRest(logId);
      }

      this.log(`Retrieved log body (${body.length} chars)`);
      return body;
    } catch (error) {
      // Fallback to REST approach
      return this._getLogBodyViaRest(logId);
    }
  }

  /**
   * Get log body via REST API (fallback)
   * @private
   */
  async _getLogBodyViaRest(logId) {
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
        timeout: this.options.timeout,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe']
      });

      this.log(`Retrieved log body via REST (${body.length} chars)`);
      return body;
    } catch (error) {
      throw new DebugLogError(
        `Failed to retrieve log body: ${error.message}`,
        'RETRIEVE_FAILED',
        { logId }
      );
    }
  }

  /**
   * Delete debug logs
   * @param {Array<string>} logIds - Array of log IDs to delete
   * @returns {Promise<object>} Results { deleted: number, failed: number }
   */
  async deleteLogs(logIds) {
    let deleted = 0;
    let failed = 0;

    for (const logId of logIds) {
      try {
        const command = `sf data delete record --sobject ApexLog --record-id ${logId} --target-org ${this.orgAlias} --json --use-tooling-api`;
        this._execSfCommand(command);
        deleted++;
        this.log(`Deleted log: ${logId}`);
      } catch (error) {
        failed++;
        this.log(`Failed to delete log ${logId}: ${error.message}`);
      }
    }

    this._emitEvent({
      type: 'debug_log_operation',
      operation: 'delete_logs',
      deleted,
      failed
    });

    return { deleted, failed };
  }

  /**
   * Delete logs older than specified days
   * @param {number} daysToKeep - Days to keep
   * @returns {Promise<object>} Results
   */
  async deleteOldLogs(daysToKeep = 7) {
    const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);
    const cutoffISO = cutoffDate.toISOString();

    // Get logs to delete
    const query = `SELECT Id FROM ApexLog WHERE StartTime < ${cutoffISO}`;
    const command = `sf data query --query "${query}" --target-org ${this.orgAlias} --json --use-tooling-api`;

    const output = this._execSfCommand(command);
    const result = this._parseSfResult(output);

    if (!result.records || result.records.length === 0) {
      this.log(`No logs older than ${daysToKeep} days`);
      return { deleted: 0, failed: 0 };
    }

    const logIds = result.records.map(r => r.Id);
    this.log(`Found ${logIds.length} logs older than ${daysToKeep} days`);

    return this.deleteLogs(logIds);
  }

  // ========================================
  // Convenience Methods
  // ========================================

  /**
   * Start debug logging (high-level convenience method)
   * @param {object} options - Options
   * @param {string} [options.preset='standard'] - Preset name
   * @param {string} [options.user] - Username (default: current user)
   * @param {number} [options.duration=30] - Duration in minutes
   * @returns {Promise<object>} Result with traceFlag and debugLevel info
   */
  async startDebugLogging(options = {}) {
    const {
      preset = 'standard',
      user,
      duration = 30
    } = options;

    const startTime = Date.now();
    this.log(`Starting debug logging (preset: ${preset}, duration: ${duration}m)`);

    // Validate preset
    const categories = DebugLogManager.PRESETS[preset];
    if (!categories) {
      throw new DebugLogError(
        `Invalid preset: ${preset}. Valid presets: ${Object.keys(DebugLogManager.PRESETS).join(', ')}`,
        'INVALID_PRESET'
      );
    }

    // Resolve user ID
    let userId;
    if (user) {
      if (user.toLowerCase() === 'automated process') {
        userId = await this.getAutomatedProcessUserId();
      } else {
        userId = await this.getUserIdByUsername(user);
      }
    } else {
      userId = await this.getCurrentUserId();
    }

    // Create/get debug level
    const debugLevelName = `OpsPal_${preset}_Level`;
    const debugLevel = await this.ensureDebugLevel(debugLevelName, categories);

    // Create trace flag
    const traceFlag = await this.createTraceFlag(userId, debugLevel.Id, duration);

    const result = {
      success: true,
      traceFlagId: traceFlag.Id,
      debugLevelId: debugLevel.Id,
      debugLevelName,
      userId,
      preset,
      duration,
      expiresAt: traceFlag.ExpirationDate,
      elapsedMs: Date.now() - startTime
    };

    this._emitEvent({
      type: 'debug_log_operation',
      operation: 'start_debug_logging',
      ...result
    });

    this.log(`Debug logging started (expires: ${result.expiresAt})`);
    return result;
  }

  /**
   * Stop debug logging and cleanup
   * @param {object} options - Options
   * @param {boolean} [options.all=false] - Delete all active trace flags
   * @param {boolean} [options.keepLogs=false] - Don't delete old logs
   * @param {string} [options.userId] - Specific user to stop tracing
   * @returns {Promise<object>} Cleanup result
   */
  async stopDebugLogging(options = {}) {
    const { all = false, keepLogs = false, userId } = options;

    const startTime = Date.now();
    this.log('Stopping debug logging...');

    let traceFlagsDeleted = 0;
    let debugLevelsDeleted = 0;

    // Delete trace flags created by this session
    for (const tfId of this._createdTraceFlagIds) {
      if (await this.deleteTraceFlag(tfId)) {
        traceFlagsDeleted++;
      }
    }
    this._createdTraceFlagIds = [];

    // If 'all' specified, delete all active trace flags
    if (all) {
      const activeFlags = await this.getActiveTraceFlags(userId);
      for (const flag of activeFlags) {
        if (await this.deleteTraceFlag(flag.Id)) {
          traceFlagsDeleted++;
        }
      }
    }

    // Clean up debug levels created by this session
    for (const dlId of this._createdDebugLevelIds) {
      if (await this.deleteDebugLevel(dlId)) {
        debugLevelsDeleted++;
      }
    }
    this._createdDebugLevelIds = [];

    // Optionally clean up old logs
    let logsCleanup = { deleted: 0, failed: 0 };
    if (!keepLogs) {
      logsCleanup = await this.deleteOldLogs(7);
    }

    const result = {
      success: true,
      traceFlagsDeleted,
      debugLevelsDeleted,
      logsDeleted: logsCleanup.deleted,
      elapsedMs: Date.now() - startTime
    };

    this._emitEvent({
      type: 'debug_log_operation',
      operation: 'stop_debug_logging',
      ...result
    });

    this.log(`Debug logging stopped (${traceFlagsDeleted} trace flags, ${debugLevelsDeleted} debug levels removed)`);
    return result;
  }

  /**
   * Cleanup expired trace flags
   * @returns {Promise<number>} Number of trace flags deleted
   */
  async cleanupExpiredTraceFlags() {
    const now = new Date().toISOString();
    const query = `SELECT Id FROM TraceFlag WHERE ExpirationDate < ${now}`;
    const command = `sf data query --query "${query}" --target-org ${this.orgAlias} --json --use-tooling-api`;

    const output = this._execSfCommand(command);
    const result = this._parseSfResult(output);

    if (!result.records || result.records.length === 0) {
      this.log('No expired trace flags to clean up');
      return 0;
    }

    let deleted = 0;
    for (const record of result.records) {
      if (await this.deleteTraceFlag(record.Id)) {
        deleted++;
      }
    }

    this.log(`Cleaned up ${deleted} expired trace flag(s)`);
    return deleted;
  }

  /**
   * Full cleanup - expired trace flags, orphaned debug levels, and old logs
   * @param {object} options - Cleanup options
   * @param {number} [options.retentionDays=7] - Days to keep logs
   * @param {boolean} [options.dryRun=false] - Preview without deleting
   * @param {boolean} [options.logsOnly=false] - Only clean logs
   * @param {boolean} [options.traceFlagsOnly=false] - Only clean trace flags
   * @returns {Promise<object>} Cleanup results
   */
  async fullCleanup(options = {}) {
    const {
      retentionDays = 7,
      dryRun = false,
      logsOnly = false,
      traceFlagsOnly = false
    } = options;

    const startTime = Date.now();
    this.log(`Starting full cleanup (retention: ${retentionDays} days, dryRun: ${dryRun})`);

    const result = {
      traceFlagsDeleted: 0,
      traceFlagsToDelete: [],
      debugLevelsDeleted: 0,
      debugLevelsToDelete: [],
      logsDeleted: 0,
      logsToDelete: [],
      storageSavedBytes: 0,
      dryRun
    };

    // 1. Clean up expired trace flags
    if (!logsOnly) {
      const now = new Date().toISOString();
      const expiredQuery = `SELECT Id, TracedEntityId, ExpirationDate FROM TraceFlag WHERE ExpirationDate < ${now}`;
      const expiredCommand = `sf data query --query "${expiredQuery}" --target-org ${this.orgAlias} --json --use-tooling-api`;

      try {
        const expiredOutput = this._execSfCommand(expiredCommand);
        const expiredResult = this._parseSfResult(expiredOutput);
        const expiredFlags = expiredResult.records || [];

        for (const flag of expiredFlags) {
          const daysAgo = Math.floor((Date.now() - new Date(flag.ExpirationDate).getTime()) / (1000 * 60 * 60 * 24));
          result.traceFlagsToDelete.push({
            id: flag.Id,
            expiredDaysAgo: daysAgo
          });

          if (!dryRun) {
            if (await this.deleteTraceFlag(flag.Id)) {
              result.traceFlagsDeleted++;
            }
          }
        }
      } catch (error) {
        this.log(`Error querying expired trace flags: ${error.message}`);
      }

      // 2. Clean up orphaned OpsPal debug levels (no active trace flags)
      const orphanedQuery = `SELECT Id, DeveloperName FROM DebugLevel WHERE DeveloperName LIKE 'OpsPal_%_Level'`;
      const orphanedCommand = `sf data query --query "${orphanedQuery}" --target-org ${this.orgAlias} --json --use-tooling-api`;

      try {
        const orphanedOutput = this._execSfCommand(orphanedCommand);
        const orphanedResult = this._parseSfResult(orphanedOutput);
        const debugLevels = orphanedResult.records || [];

        // Get all active trace flag debug level IDs
        const activeFlags = await this.getActiveTraceFlags();
        const activeDebugLevelIds = new Set(activeFlags.map(f => f.DebugLevelId));

        for (const level of debugLevels) {
          if (!activeDebugLevelIds.has(level.Id)) {
            result.debugLevelsToDelete.push({
              id: level.Id,
              name: level.DeveloperName
            });

            if (!dryRun) {
              if (await this.deleteDebugLevel(level.Id)) {
                result.debugLevelsDeleted++;
              }
            }
          }
        }
      } catch (error) {
        this.log(`Error querying orphaned debug levels: ${error.message}`);
      }
    }

    // 3. Clean up old logs
    if (!traceFlagsOnly) {
      const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
      const cutoffISO = cutoffDate.toISOString();

      const logsQuery = `SELECT Id, LogLength, StartTime FROM ApexLog WHERE StartTime < ${cutoffISO}`;
      const logsCommand = `sf data query --query "${logsQuery}" --target-org ${this.orgAlias} --json --use-tooling-api`;

      try {
        const logsOutput = this._execSfCommand(logsCommand);
        const logsResult = this._parseSfResult(logsOutput);
        const oldLogs = logsResult.records || [];

        for (const log of oldLogs) {
          result.logsToDelete.push({
            id: log.Id,
            size: log.LogLength,
            startTime: log.StartTime
          });
          result.storageSavedBytes += log.LogLength || 0;
        }

        if (!dryRun && oldLogs.length > 0) {
          const logIds = oldLogs.map(l => l.Id);
          const deleteResult = await this.deleteLogs(logIds);
          result.logsDeleted = deleteResult.deleted;
        }
      } catch (error) {
        this.log(`Error querying old logs: ${error.message}`);
      }
    }

    result.storageSavedMB = (result.storageSavedBytes / (1024 * 1024)).toFixed(2);
    result.elapsedMs = Date.now() - startTime;

    this._emitEvent({
      type: 'debug_log_operation',
      operation: 'full_cleanup',
      ...result
    });

    if (dryRun) {
      this.log(`[DRY RUN] Would delete: ${result.traceFlagsToDelete.length} trace flags, ${result.debugLevelsToDelete.length} debug levels, ${result.logsToDelete.length} logs (${result.storageSavedMB} MB)`);
    } else {
      this.log(`Cleanup complete: ${result.traceFlagsDeleted} trace flags, ${result.debugLevelsDeleted} debug levels, ${result.logsDeleted} logs deleted`);
    }

    return result;
  }

  /**
   * Get debug log storage usage
   * @returns {Promise<object>} Storage info
   */
  async getStorageUsage() {
    const query = `SELECT COUNT(Id) totalLogs, SUM(LogLength) totalSize FROM ApexLog`;
    const command = `sf data query --query "${query}" --target-org ${this.orgAlias} --json --use-tooling-api`;

    const output = this._execSfCommand(command);
    const result = this._parseSfResult(output);

    const record = result.records?.[0] || { totalLogs: 0, totalSize: 0 };
    const sizeMB = (record.totalSize || 0) / (1024 * 1024);

    return {
      totalLogs: record.totalLogs || 0,
      totalSizeBytes: record.totalSize || 0,
      totalSizeMB: sizeMB.toFixed(2),
      limitMB: 1000, // Salesforce limit
      usagePercent: ((sizeMB / 1000) * 100).toFixed(1)
    };
  }
}

// ========================================
// CLI Mode
// ========================================

if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];
  const orgAlias = args[1];

  if (!command || !orgAlias) {
    console.log(`
Usage: node debug-log-manager.js <command> <org-alias> [options]

Commands:
  start <org> [preset] [duration]     Start debug logging
  stop <org> [--all] [--keep-logs]    Stop debug logging
  logs <org> [--limit N]              List recent logs
  body <org> <log-id>                 Get log body content
  storage <org>                       Show storage usage
  cleanup <org> [options]             Full cleanup (trace flags, debug levels, logs)

Cleanup Options:
  --retention <days>    Days to keep logs (default: 7)
  --dry-run             Preview without deleting
  --logs-only           Only clean up old logs
  --trace-flags-only    Only clean up trace flags

Presets: quick, standard, detailed, flow, apex

Examples:
  node debug-log-manager.js start myorg standard 30
  node debug-log-manager.js logs myorg --limit 5
  node debug-log-manager.js body myorg 07Lxx000000XXXX
  node debug-log-manager.js stop myorg --all
  node debug-log-manager.js cleanup myorg --retention 3 --dry-run
`);
    process.exit(1);
  }

  const manager = new DebugLogManager(orgAlias, { verbose: true });

  (async () => {
    try {
      switch (command) {
        case 'start': {
          const preset = args[2] || 'standard';
          const duration = parseInt(args[3]) || 30;
          const result = await manager.startDebugLogging({ preset, duration });
          console.log('\nResult:', JSON.stringify(result, null, 2));
          break;
        }
        case 'stop': {
          const all = args.includes('--all');
          const keepLogs = args.includes('--keep-logs');
          const result = await manager.stopDebugLogging({ all, keepLogs });
          console.log('\nResult:', JSON.stringify(result, null, 2));
          break;
        }
        case 'logs': {
          const limitIdx = args.indexOf('--limit');
          const limit = limitIdx > 0 ? parseInt(args[limitIdx + 1]) : 10;
          const logs = await manager.getRecentLogs({ limit });
          console.log(`\nRecent Logs (${logs.length}):`);
          for (const log of logs) {
            console.log(`  ${log.Id} | ${log.StartTime} | ${log.Operation} | ${log.Status} | ${(log.LogLength/1024).toFixed(1)}KB`);
          }
          break;
        }
        case 'body': {
          const logId = args[2];
          if (!logId) {
            console.error('Error: Log ID required');
            process.exit(1);
          }
          const body = await manager.getLogBody(logId);
          console.log(body);
          break;
        }
        case 'storage': {
          const usage = await manager.getStorageUsage();
          console.log('\nDebug Log Storage:');
          console.log(`  Total Logs: ${usage.totalLogs}`);
          console.log(`  Total Size: ${usage.totalSizeMB} MB`);
          console.log(`  Limit: ${usage.limitMB} MB`);
          console.log(`  Usage: ${usage.usagePercent}%`);
          break;
        }
        case 'cleanup': {
          const retentionIdx = args.indexOf('--retention');
          const retentionDays = retentionIdx > 0 ? parseInt(args[retentionIdx + 1]) : 7;
          const dryRun = args.includes('--dry-run');
          const logsOnly = args.includes('--logs-only');
          const traceFlagsOnly = args.includes('--trace-flags-only');

          const result = await manager.fullCleanup({
            retentionDays,
            dryRun,
            logsOnly,
            traceFlagsOnly
          });

          if (dryRun) {
            console.log('\n[DRY RUN] Would delete:');
            console.log(`  Expired Trace Flags: ${result.traceFlagsToDelete.length}`);
            for (const tf of result.traceFlagsToDelete.slice(0, 5)) {
              console.log(`    - ${tf.id} (expired ${tf.expiredDaysAgo} days ago)`);
            }
            if (result.traceFlagsToDelete.length > 5) {
              console.log(`    ... and ${result.traceFlagsToDelete.length - 5} more`);
            }
            console.log(`\n  Orphaned Debug Levels: ${result.debugLevelsToDelete.length}`);
            for (const dl of result.debugLevelsToDelete) {
              console.log(`    - ${dl.name}`);
            }
            console.log(`\n  Old Logs (>${retentionDays} days): ${result.logsToDelete.length} logs (${result.storageSavedMB} MB)`);
            console.log('\nNo changes made. Run without --dry-run to execute.');
          } else {
            console.log('\nDebug Cleanup Summary:');
            console.log(`  Expired Trace Flags: ${result.traceFlagsDeleted} deleted`);
            console.log(`  Orphaned Debug Levels: ${result.debugLevelsDeleted} deleted`);
            console.log(`  Old Logs (>${retentionDays} days): ${result.logsDeleted} deleted`);
            console.log(`  Storage Freed: ${result.storageSavedMB} MB`);

            const storage = await manager.getStorageUsage();
            console.log('\nCurrent Storage:');
            console.log(`  Total Logs: ${storage.totalLogs} remaining`);
            console.log(`  Storage Used: ${storage.totalSizeMB} MB (${storage.usagePercent}% of ${storage.limitMB} MB limit)`);
          }
          console.log(`\nElapsed: ${(result.elapsedMs / 1000).toFixed(1)}s`);
          break;
        }
        default:
          console.error(`Unknown command: ${command}`);
          process.exit(1);
      }
    } catch (error) {
      console.error(`\nError: ${error.message}`);
      if (error.details) {
        console.error('Details:', JSON.stringify(error.details, null, 2));
      }
      process.exit(1);
    }
  })();
}

module.exports = { DebugLogManager, DebugLogError };
