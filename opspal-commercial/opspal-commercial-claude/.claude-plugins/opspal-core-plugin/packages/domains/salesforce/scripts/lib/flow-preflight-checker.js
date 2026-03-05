#!/usr/bin/env node

/**
 * FlowPreflightChecker - Automated pre-flight validation before Flow execution or deployment
 *
 * @module flow-preflight-checker
 * @version 3.43.0
 * @description Runs comprehensive pre-flight checks to catch common issues before Flow
 *              testing or deployment. Part of Runbook 7: Flow Testing & Diagnostic Framework.
 *
 * @see docs/runbooks/flow-xml-development/07-testing-and-diagnostics.md (Section 1)
 * @see docs/FLOW_DIAGNOSTIC_SCRIPT_INTERFACES.md (Section 1)
 *
 * @example
 * const { FlowPreflightChecker } = require('./flow-preflight-checker');
 *
 * const checker = new FlowPreflightChecker('neonone', { verbose: true });
 * const result = await checker.runAllChecks('Account_Validation_Flow', {
 *   object: 'Account',
 *   triggerType: 'after-save'
 * });
 *
 * if (!result.canProceed) {
 *   console.error('Preflight failed:', result.criticalIssues);
 *   process.exit(1);
 * }
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Custom error class for pre-flight check failures
 */
class PreflightError extends Error {
  /**
   * @param {string} message - Error message
   * @param {string} code - Error code (e.g., 'AUTH_FAILED', 'FLOW_NOT_FOUND')
   * @param {object} details - Additional error details
   */
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'PreflightError';
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, PreflightError);
  }
}

/**
 * FlowPreflightChecker - Automated pre-flight validation
 */
class FlowPreflightChecker {
  /**
   * Create a new FlowPreflightChecker instance
   *
   * @param {string} orgAlias - Salesforce org alias (e.g., 'neonone', 'production')
   * @param {object} options - Configuration options
   * @param {boolean} [options.verbose=false] - Enable detailed logging
   * @param {number} [options.timeout=120000] - Operation timeout in milliseconds
   * @param {boolean} [options.skipConnectivityCheck=false] - Skip initial connectivity validation
   * @param {boolean} [options.autoSetupLogging=true] - Automatically configure debug logging
   */
  constructor(orgAlias, options = {}) {
    if (!orgAlias) {
      throw new PreflightError('orgAlias is required', 'INVALID_ARGUMENT');
    }

    this.orgAlias = orgAlias;
    this.options = {
      verbose: false,
      timeout: 120000,
      skipConnectivityCheck: false,
      autoSetupLogging: true,
      ...options
    };

    this.log = this.options.verbose ? console.log : () => {};
  }

  /**
   * Emit observability event for Living Runbook System
   *
   * @private
   * @param {object} event - Event data
   */
  _emitEvent(event) {
    const fullEvent = {
      ...event,
      orgAlias: this.orgAlias,
      timestamp: new Date().toISOString()
    };

    // Emit to stdout as JSON for observation hooks to capture
    if (process.env.ENABLE_OBSERVABILITY === '1') {
      console.log(`[OBSERVABILITY] ${JSON.stringify(fullEvent)}`);
    }
  }

  /**
   * Execute Salesforce CLI command with timeout
   *
   * @private
   * @param {string} command - CLI command to execute
   * @param {number} [timeout] - Command timeout (defaults to constructor timeout)
   * @returns {string} Command output
   * @throws {PreflightError} If command fails or times out
   */
  _execSfCommand(command, timeout = null) {
    try {
      const output = execSync(command, {
        timeout: timeout || this.options.timeout,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe']
      });
      return output.trim();
    } catch (error) {
      if (error.killed) {
        throw new PreflightError(
          `Command timed out after ${timeout || this.options.timeout}ms`,
          'TIMEOUT',
          { command }
        );
      }
      throw new PreflightError(
        `SF CLI command failed: ${error.message}`,
        'CLI_ERROR',
        { command, stderr: error.stderr?.toString() }
      );
    }
  }

  /**
   * Check connectivity to Salesforce org
   *
   * @returns {Promise<ConnectivityResult>} Connectivity check result
   *
   * @example
   * const result = await checker.checkConnectivity();
   * if (!result.success) {
   *   console.error('Cannot connect:', result.error);
   * }
   */
  async checkConnectivity() {
    const startTime = Date.now();
    this.log('Checking org connectivity...');

    try {
      // Use sf org display to verify authentication
      const command = `sf org display --target-org ${this.orgAlias} --json`;
      const output = this._execSfCommand(command);
      const data = JSON.parse(output);

      if (data.status !== 0) {
        throw new PreflightError(
          `Org display failed: ${data.message}`,
          'AUTH_FAILED',
          { orgAlias: this.orgAlias }
        );
      }

      const result = {
        success: true,
        orgId: data.result.id,
        orgType: data.result.instanceUrl.includes('sandbox') ? 'Sandbox' :
                 data.result.instanceUrl.includes('scratch') ? 'Scratch' : 'Production',
        username: data.result.username,
        apiVersion: data.result.apiVersion || 'v62.0',
        timestamp: new Date().toISOString()
      };

      this._emitEvent({
        type: 'flow_preflight_check',
        checkType: 'connectivity',
        outcome: 'success',
        duration: Date.now() - startTime
      });

      this.log(`✓ Connected to ${result.orgType} org: ${result.orgId}`);
      return result;

    } catch (error) {
      this._emitEvent({
        type: 'flow_preflight_check',
        checkType: 'connectivity',
        outcome: 'failure',
        duration: Date.now() - startTime,
        error: error.message
      });

      if (error instanceof PreflightError) {
        return { success: false, error: error.message, timestamp: new Date().toISOString() };
      }

      throw new PreflightError(
        'Failed to connect to org',
        'AUTH_FAILED',
        { orgAlias: this.orgAlias, originalError: error.message }
      );
    }
  }

  /**
   * Check Flow metadata and validate Flow definition
   *
   * @param {string} flowApiName - Flow API name (DeveloperName)
   * @returns {Promise<FlowMetadataResult>} Flow metadata check result
   *
   * @example
   * const result = await checker.checkFlowMetadata('Account_Validation_Flow');
   * console.log('Flow status:', result.flow.status);
   */
  async checkFlowMetadata(flowApiName) {
    const startTime = Date.now();
    this.log(`Checking Flow metadata: ${flowApiName}...`);

    try {
      // Query FlowDefinition to get Flow info
      const query = `SELECT Id, ActiveVersionId, DeveloperName, Label, ProcessType, TriggerObjectOrEventLabel, Description FROM FlowDefinition WHERE DeveloperName = '${flowApiName}' LIMIT 1`;
      const command = `sf data query --query "${query}" --target-org ${this.orgAlias} --json`;

      const output = this._execSfCommand(command);
      const data = JSON.parse(output);

      if (data.status !== 0 || !data.result || data.result.records.length === 0) {
        throw new PreflightError(
          `Flow not found: ${flowApiName}`,
          'FLOW_NOT_FOUND',
          { flowApiName, orgAlias: this.orgAlias }
        );
      }

      const flowDef = data.result.records[0];

      // Get active version details if exists
      let flowVersion = null;
      if (flowDef.ActiveVersionId) {
        const versionQuery = `SELECT VersionNumber, Status, ProcessType, TriggerType, ApiVersion FROM FlowVersionView WHERE DurableId = '${flowDef.ActiveVersionId}' LIMIT 1`;
        const versionCommand = `sf data query --query "${versionQuery}" --target-org ${this.orgAlias} --json --use-tooling-api`;

        const versionOutput = this._execSfCommand(versionCommand);
        const versionData = JSON.parse(versionOutput);

        if (versionData.status === 0 && versionData.result?.records?.length > 0) {
          flowVersion = versionData.result.records[0];
        }
      }

      const result = {
        success: true,
        flow: {
          apiName: flowDef.DeveloperName,
          label: flowDef.Label,
          processType: flowDef.ProcessType,
          triggerType: flowVersion?.TriggerType || null,
          object: flowDef.TriggerObjectOrEventLabel || null,
          status: flowVersion ? flowVersion.Status : 'Inactive',
          activeVersionNumber: flowVersion?.VersionNumber || null,
          description: flowDef.Description || null
        },
        warnings: []
      };

      // Add warnings
      if (!flowDef.ActiveVersionId) {
        result.warnings.push('Flow has no active version');
      }
      if (result.flow.status !== 'Active') {
        result.warnings.push(`Flow status is ${result.flow.status}, not Active`);
      }

      this._emitEvent({
        type: 'flow_preflight_check',
        flowApiName,
        checkType: 'metadata',
        outcome: 'success',
        duration: Date.now() - startTime,
        findings: { status: result.flow.status, hasWarnings: result.warnings.length > 0 }
      });

      this.log(`✓ Flow found: ${result.flow.label} (${result.flow.status})`);
      return result;

    } catch (error) {
      this._emitEvent({
        type: 'flow_preflight_check',
        flowApiName,
        checkType: 'metadata',
        outcome: 'failure',
        duration: Date.now() - startTime,
        error: error.message
      });

      if (error instanceof PreflightError) {
        return { success: false, error: error.message };
      }

      throw error;
    }
  }

  /**
   * Check for competing automation on object/trigger
   *
   * @param {string} objectName - Object API name (e.g., 'Account')
   * @param {string} triggerType - Trigger type: 'before-save', 'after-save', 'before-delete', 'after-delete'
   * @returns {Promise<CompetingAutomationResult>} Competing automation check result
   *
   * @example
   * const result = await checker.checkCompetingAutomation('Account', 'after-save');
   * if (result.hasConflicts) {
   *   console.warn('Conflicts:', result.conflicts);
   * }
   */
  async checkCompetingAutomation(objectName, triggerType) {
    const startTime = Date.now();
    this.log(`Checking competing automation on ${objectName} (${triggerType})...`);

    try {
      const result = {
        success: true,
        hasConflicts: false,
        flows: [],
        triggers: [],
        processBuilders: [],
        workflowRules: [],
        conflicts: []
      };

      // Map triggerType to Flow trigger filter
      const triggerTypeMap = {
        'before-save': 'beforeSave',
        'after-save': 'afterSave',
        'before-delete': 'beforeDelete',
        'after-delete': 'afterDelete'
      };
      const flowTriggerType = triggerTypeMap[triggerType];

      // Query active Flows on this object
      const flowQuery = `SELECT DeveloperName, Label, TriggerType, TriggerOrder FROM FlowDefinition WHERE TriggerObjectOrEventLabel = '${objectName}' AND ActiveVersionId != null`;
      const flowCommand = `sf data query --query "${flowQuery}" --target-org ${this.orgAlias} --json`;

      try {
        const flowOutput = this._execSfCommand(flowCommand);
        const flowData = JSON.parse(flowOutput);

        if (flowData.status === 0 && flowData.result?.records) {
          result.flows = flowData.result.records.map(f => ({
            apiName: f.DeveloperName,
            label: f.Label,
            status: 'Active',
            triggerOrder: f.TriggerOrder || 100,
            entryCriteria: null // Would need separate query to get full metadata
          }));
        }
      } catch (err) {
        this.log(`Warning: Could not query Flows: ${err.message}`);
      }

      // Query Apex triggers on this object
      const triggerQuery = `SELECT Name, Status, TableEnumOrId FROM ApexTrigger WHERE TableEnumOrId = '${objectName}'`;
      const triggerCommand = `sf data query --query "${triggerQuery}" --target-org ${this.orgAlias} --json --use-tooling-api`;

      try {
        const triggerOutput = this._execSfCommand(triggerCommand);
        const triggerData = JSON.parse(triggerOutput);

        if (triggerData.status === 0 && triggerData.result?.records) {
          result.triggers = triggerData.result.records.map(t => ({
            name: t.Name,
            status: t.Status,
            events: [] // Would need to parse trigger body to get events
          }));
        }
      } catch (err) {
        this.log(`Warning: Could not query Apex triggers: ${err.message}`);
      }

      // Detect conflicts
      // 1. Multiple Flows with same trigger order
      const orderCounts = {};
      result.flows.forEach(f => {
        orderCounts[f.triggerOrder] = (orderCounts[f.triggerOrder] || 0) + 1;
      });

      Object.entries(orderCounts).forEach(([order, count]) => {
        if (count > 1) {
          result.hasConflicts = true;
          result.conflicts.push({
            type: 'race_condition',
            severity: 'warning',
            message: `${count} Flows have same trigger order (${order})`,
            recommendation: 'Set explicit trigger order to avoid race conditions'
          });
        }
      });

      // 2. Apex triggers might override Flow changes
      if (result.triggers.length > 0 && result.flows.length > 0) {
        result.hasConflicts = true;
        result.conflicts.push({
          type: 'override',
          severity: 'warning',
          message: `${result.triggers.length} Apex trigger(s) found on ${objectName}`,
          recommendation: 'Coordinate Flow and Apex trigger logic to avoid conflicts'
        });
      }

      // 3. Too many automations (governor limit risk)
      const totalAutomation = result.flows.length + result.triggers.length +
                              result.processBuilders.length + result.workflowRules.length;
      if (totalAutomation > 5) {
        result.hasConflicts = true;
        result.conflicts.push({
          type: 'governor_limit',
          severity: 'warning',
          message: `${totalAutomation} total automations on ${objectName}`,
          recommendation: 'Consider consolidating automation to reduce governor limit usage'
        });
      }

      this._emitEvent({
        type: 'flow_preflight_check',
        checkType: 'competing_automation',
        outcome: result.hasConflicts ? 'warning' : 'success',
        duration: Date.now() - startTime,
        findings: {
          flows: result.flows.length,
          triggers: result.triggers.length,
          conflicts: result.conflicts.length
        }
      });

      this.log(`✓ Automation check: ${result.flows.length} Flows, ${result.triggers.length} triggers${result.hasConflicts ? ' (conflicts detected)' : ''}`);
      return result;

    } catch (error) {
      this._emitEvent({
        type: 'flow_preflight_check',
        checkType: 'competing_automation',
        outcome: 'failure',
        duration: Date.now() - startTime,
        error: error.message
      });

      if (error instanceof PreflightError) {
        return { success: false, error: error.message };
      }

      throw error;
    }
  }

  /**
   * Check validation rules on object
   *
   * @param {string} objectName - Object API name (e.g., 'Account')
   * @returns {Promise<ValidationRulesResult>} Validation rules check result
   *
   * @example
   * const result = await checker.checkValidationRules('Account');
   * console.log('Active rules:', result.validationRules.length);
   */
  async checkValidationRules(objectName) {
    const startTime = Date.now();
    this.log(`Checking validation rules on ${objectName}...`);

    try {
      const result = {
        success: true,
        validationRules: [],
        requiredFields: [],
        duplicateRules: [],
        recommendations: []
      };

      // Query active validation rules
      const query = `SELECT ValidationName, Active, ErrorMessage, ErrorDisplayField FROM ValidationRule WHERE EntityDefinition.QualifiedApiName = '${objectName}' AND Active = true`;
      const command = `sf data query --query "${query}" --target-org ${this.orgAlias} --json --use-tooling-api`;

      try {
        const output = this._execSfCommand(command);
        const data = JSON.parse(output);

        if (data.status === 0 && data.result?.records) {
          result.validationRules = data.result.records.map(r => ({
            apiName: r.ValidationName,
            active: r.Active,
            formula: null, // Would need separate metadata query to get formula
            errorMessage: r.ErrorMessage,
            errorDisplayField: r.ErrorDisplayField,
            impact: 'Flow must satisfy this validation rule'
          }));
        }
      } catch (err) {
        this.log(`Warning: Could not query validation rules: ${err.message}`);
      }

      // Query required fields
      const fieldQuery = `SELECT QualifiedApiName, DataType FROM FieldDefinition WHERE EntityDefinition.QualifiedApiName = '${objectName}' AND IsNillable = false AND IsCalculated = false`;
      const fieldCommand = `sf data query --query "${fieldQuery}" --target-org ${this.orgAlias} --json --use-tooling-api`;

      try {
        const fieldOutput = this._execSfCommand(fieldCommand);
        const fieldData = JSON.parse(fieldOutput);

        if (fieldData.status === 0 && fieldData.result?.records) {
          result.requiredFields = fieldData.result.records.map(f => ({
            fieldName: f.QualifiedApiName,
            fieldType: f.DataType,
            isCustom: f.QualifiedApiName.endsWith('__c')
          }));
        }
      } catch (err) {
        this.log(`Warning: Could not query required fields: ${err.message}`);
      }

      // Generate recommendations
      if (result.validationRules.length > 0) {
        result.recommendations.push(`Flow must satisfy ${result.validationRules.length} active validation rule(s)`);
      }
      if (result.requiredFields.length > 0) {
        result.recommendations.push(`Flow must populate ${result.requiredFields.length} required field(s)`);
      }

      this._emitEvent({
        type: 'flow_preflight_check',
        checkType: 'validation_rules',
        outcome: 'success',
        duration: Date.now() - startTime,
        findings: {
          validationRules: result.validationRules.length,
          requiredFields: result.requiredFields.length
        }
      });

      this.log(`✓ Validation check: ${result.validationRules.length} rules, ${result.requiredFields.length} required fields`);
      return result;

    } catch (error) {
      this._emitEvent({
        type: 'flow_preflight_check',
        checkType: 'validation_rules',
        outcome: 'failure',
        duration: Date.now() - startTime,
        error: error.message
      });

      if (error instanceof PreflightError) {
        return { success: false, error: error.message };
      }

      throw error;
    }
  }

  /**
   * Setup debug logging for Flow execution tracing
   *
   * @param {string} username - Username to trace (or 'Automated Process')
   * @param {object} [options] - Logging options
   * @param {number} [options.duration=30] - Trace flag duration in minutes
   * @param {object} [options.categories] - Log category levels
   * @returns {Promise<DebugLoggingResult>} Debug logging setup result
   *
   * @example
   * const result = await checker.setupDebugLogging('admin@company.com', {
   *   duration: 30,
   *   categories: { workflow: 'FINEST', apex: 'INFO' }
   * });
   */
  async setupDebugLogging(username, options = {}) {
    const startTime = Date.now();
    this.log(`Setting up debug logging for ${username}...`);

    const duration = options.duration || 30;
    const categories = options.categories || {
      workflow: 'FINEST',
      validation: 'INFO',
      apex: 'INFO',
      database: 'INFO',
      callout: 'INFO'
    };

    try {
      // Import DebugLogManager for TraceFlag/DebugLevel management
      const { DebugLogManager } = require('./debug-log-manager');
      const debugManager = new DebugLogManager(this.orgAlias, {
        verbose: this.options.verbose
      });

      // Map category names to Salesforce API field names
      const sfCategories = {
        ApexCode: categories.apex || 'INFO',
        ApexProfiling: 'INFO',
        Callout: categories.callout || 'INFO',
        Database: categories.database || 'INFO',
        System: 'DEBUG',
        Validation: categories.validation || 'INFO',
        Visualforce: 'NONE',
        Workflow: categories.workflow || 'FINEST'
      };

      // Resolve user ID
      let userId;
      if (username.toLowerCase() === 'automated process') {
        userId = await debugManager.getAutomatedProcessUserId();
      } else if (username.includes('@')) {
        userId = await debugManager.getUserIdByUsername(username);
      } else {
        // Assume it's already a user ID or get current user
        userId = await debugManager.getCurrentUserId();
      }

      // Create/get debug level
      const debugLevelName = 'FlowDiagnostic_Level';
      const debugLevel = await debugManager.ensureDebugLevel(debugLevelName, sfCategories);

      // Create trace flag
      const traceFlag = await debugManager.createTraceFlag(userId, debugLevel.Id, duration);

      const result = {
        success: true,
        debugLevelId: debugLevel.Id,
        debugLevelName: debugLevelName,
        traceFlagId: traceFlag.Id,
        username: username,
        userId: userId,
        duration: duration,
        expiresAt: traceFlag.ExpirationDate
      };

      this._emitEvent({
        type: 'flow_preflight_check',
        checkType: 'debug_logging',
        outcome: 'success',
        duration: Date.now() - startTime,
        findings: { username, duration, traceFlagId: traceFlag.Id }
      });

      this.log(`✓ Debug logging configured (expires: ${result.expiresAt})`);
      return result;

    } catch (error) {
      this._emitEvent({
        type: 'flow_preflight_check',
        checkType: 'debug_logging',
        outcome: 'failure',
        duration: Date.now() - startTime,
        error: error.message
      });

      if (error instanceof PreflightError) {
        return { success: false, error: error.message };
      }

      // Return failure result instead of throwing for non-critical errors
      this.log(`✗ Failed to setup debug logging: ${error.message}`);
      return {
        success: false,
        error: error.message,
        username: username,
        duration: duration
      };
    }
  }

  /**
   * Run all pre-flight checks
   *
   * @param {string} flowApiName - Flow API name
   * @param {object} [options] - Check options
   * @param {string} [options.object] - Object name for competing automation check
   * @param {string} [options.triggerType] - Trigger type for competing automation check
   * @param {boolean} [options.skipLoggingSetup=false] - Skip debug logging setup
   * @param {boolean} [options.continueOnWarnings=true] - Continue if warnings found
   * @returns {Promise<PreflightResult>} Complete preflight check result
   *
   * @example
   * const result = await checker.runAllChecks('Account_Validation_Flow', {
   *   object: 'Account',
   *   triggerType: 'after-save'
   * });
   *
   * if (!result.canProceed) {
   *   console.error('Critical issues:', result.criticalIssues);
   *   process.exit(1);
   * }
   */
  async runAllChecks(flowApiName, options = {}) {
    const startTime = Date.now();
    this.log(`\n=== Running All Pre-Flight Checks for ${flowApiName} ===\n`);

    const result = {
      success: true,
      canProceed: true,
      checks: {},
      criticalIssues: [],
      warnings: [],
      recommendations: [],
      timestamp: new Date().toISOString()
    };

    try {
      // 1. Connectivity check
      if (!this.options.skipConnectivityCheck) {
        result.checks.connectivity = await this.checkConnectivity();
        if (!result.checks.connectivity.success) {
          result.criticalIssues.push(`Connectivity failed: ${result.checks.connectivity.error}`);
          result.canProceed = false;
        }
      }

      // 2. Flow metadata check
      result.checks.flowMetadata = await this.checkFlowMetadata(flowApiName);
      if (!result.checks.flowMetadata.success) {
        result.criticalIssues.push(`Flow metadata check failed: ${result.checks.flowMetadata.error}`);
        result.canProceed = false;
      } else if (result.checks.flowMetadata.warnings) {
        result.warnings.push(...result.checks.flowMetadata.warnings);
      }

      // 3. Competing automation check (if object provided)
      if (options.object && options.triggerType) {
        result.checks.competingAutomation = await this.checkCompetingAutomation(
          options.object,
          options.triggerType
        );

        if (result.checks.competingAutomation.hasConflicts) {
          result.checks.competingAutomation.conflicts.forEach(conflict => {
            if (conflict.severity === 'critical') {
              result.criticalIssues.push(conflict.message);
            } else {
              result.warnings.push(conflict.message);
            }
            result.recommendations.push(conflict.recommendation);
          });
        }
      }

      // 4. Validation rules check (if object provided)
      if (options.object) {
        result.checks.validationRules = await this.checkValidationRules(options.object);
        if (result.checks.validationRules.recommendations) {
          result.recommendations.push(...result.checks.validationRules.recommendations);
        }
      }

      // 5. Debug logging setup (if enabled)
      if (!options.skipLoggingSetup && this.options.autoSetupLogging) {
        result.checks.debugLogging = await this.setupDebugLogging('Automated Process', {
          duration: 30
        });
        if (!result.checks.debugLogging.success) {
          result.warnings.push(`Debug logging setup failed: ${result.checks.debugLogging.error}`);
        }
      }

      // Determine final status
      result.success = result.criticalIssues.length === 0;
      if (!options.continueOnWarnings && result.warnings.length > 0) {
        result.canProceed = false;
      }

      this._emitEvent({
        type: 'flow_preflight_complete',
        flowApiName,
        outcome: result.canProceed ? 'success' : 'failure',
        duration: Date.now() - startTime,
        criticalIssues: result.criticalIssues.length,
        warnings: result.warnings.length
      });

      this.log(`\n=== Pre-Flight Check Summary ===`);
      this.log(`Critical Issues: ${result.criticalIssues.length}`);
      this.log(`Warnings: ${result.warnings.length}`);
      this.log(`Can Proceed: ${result.canProceed ? 'YES' : 'NO'}\n`);

      return result;

    } catch (error) {
      this._emitEvent({
        type: 'flow_preflight_complete',
        flowApiName,
        outcome: 'error',
        duration: Date.now() - startTime,
        error: error.message
      });

      throw error;
    }
  }
}

// Export classes
module.exports = {
  FlowPreflightChecker,
  PreflightError
};

// CLI entry point
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('Usage: flow-preflight-checker.js <org-alias> <flow-api-name> [--object Object] [--trigger-type after-save]');
    process.exit(1);
  }

  const orgAlias = args[0];
  const flowApiName = args[1];

  // Parse options
  const options = {};
  for (let i = 2; i < args.length; i += 2) {
    const key = args[i].replace('--', '');
    const value = args[i + 1];
    options[key] = value;
  }

  // Run checks
  const checker = new FlowPreflightChecker(orgAlias, { verbose: true });
  checker.runAllChecks(flowApiName, {
    object: options.object,
    triggerType: options['trigger-type'] || options.triggerType
  })
    .then(result => {
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.canProceed ? 0 : 1);
    })
    .catch(error => {
      console.error('Preflight check failed:', error.message);
      process.exit(1);
    });
}
