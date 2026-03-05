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
 * const checker = new FlowPreflightChecker('gamma-corp', { verbose: true });
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
const { FlowChangeStrategyEngine } = require('./flow-change-strategy-engine');
const FlowVersionManager = require('./flow-version-manager');
const FlowEntryCriteriaValidator = require('./flow-entry-criteria-validator');
const FlowConflictAnalyzer = require('./flow-conflict-analyzer');

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
   * @param {string} orgAlias - Salesforce org alias (e.g., 'gamma-corp', 'production')
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
    this.strategyEngine = new FlowChangeStrategyEngine({ verbose: this.options.verbose });
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
   * Normalize a value to boolean
   * @private
   * @param {boolean|string|undefined} value
   * @param {boolean} fallback
   * @returns {boolean}
   */
  _normalizeBoolean(value, fallback = false) {
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'string') {
      return value.toLowerCase() === 'true';
    }
    return fallback;
  }

  /**
   * Normalize enforcement mode input
   * @private
   * @param {string} mode
   * @returns {'risk-based'|'strict'|'advisory'}
   */
  _normalizeEnforcementMode(mode) {
    const normalized = (mode || 'risk-based').toLowerCase();
    if (normalized === 'strict' || normalized === 'advisory') {
      return normalized;
    }
    return 'risk-based';
  }

  /**
   * Map human trigger timing to Salesforce trigger type values.
   * @private
   * @param {string} triggerType
   * @returns {string[]}
   */
  _mapTriggerTypeToFlowVersionValues(triggerType) {
    const map = {
      'before-save': ['RecordBeforeSave'],
      'after-save': ['RecordAfterSave'],
      'before-delete': ['RecordBeforeDelete'],
      'after-delete': ['RecordAfterDelete'],
      'async': ['RecordAfterSave', 'RecordAfterSaveAsync']
    };
    return map[triggerType] || [];
  }

  /**
   * Map Salesforce trigger type back to timing label.
   * @private
   * @param {string|null} triggerType
   * @returns {string|null}
   */
  _mapFlowVersionTriggerToTiming(triggerType) {
    const map = {
      RecordBeforeSave: 'before-save',
      RecordAfterSave: 'after-save',
      RecordBeforeDelete: 'before-delete',
      RecordAfterDelete: 'after-delete'
    };
    return map[triggerType] || null;
  }

  /**
   * Try to locate a local Flow XML file by API name.
   * @private
   * @param {string} flowApiName
   * @returns {string|null}
   */
  _findLocalFlowFile(flowApiName) {
    const candidates = [
      path.join('force-app', 'main', 'default', 'flows', `${flowApiName}.flow-meta.xml`),
      path.join('flows', `${flowApiName}.flow-meta.xml`),
      path.join('instances', this.orgAlias, 'flows', `${flowApiName}.flow-meta.xml`)
    ];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }

    return null;
  }

  /**
   * Estimate flow complexity using lightweight metadata signals.
   * @private
   * @param {object} flowMetadata
   * @param {object} competingAutomation
   * @returns {{score:number, source:string}}
   */
  _estimateComplexity(flowMetadata = {}, competingAutomation = {}) {
    let score = 4;
    const flowCount = competingAutomation?.flows?.length || 0;
    const triggerCount = competingAutomation?.triggers?.length || 0;

    if (flowMetadata?.flow?.processType === 'Workflow') {
      score += 2;
    }
    if (flowCount >= 3) {
      score += 3;
    }
    if (triggerCount >= 2) {
      score += 2;
    }

    return {
      score,
      source: 'metadata-heuristic'
    };
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
        const versionQuery = `SELECT VersionNumber, Status, ProcessType, TriggerType, TriggerOrder, ApiVersion, RunInMode FROM FlowVersionView WHERE DurableId = '${flowDef.ActiveVersionId}' LIMIT 1`;
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
          id: flowDef.Id,
          apiName: flowDef.DeveloperName,
          label: flowDef.Label,
          processType: flowDef.ProcessType,
          triggerType: flowVersion?.TriggerType || null,
          triggerOrder: flowVersion?.TriggerOrder ?? null,
          object: flowDef.TriggerObjectOrEventLabel || null,
          status: flowVersion ? flowVersion.Status : 'Inactive',
          activeVersionId: flowDef.ActiveVersionId || null,
          activeVersionNumber: flowVersion?.VersionNumber || null,
          runInMode: flowVersion?.RunInMode || null,
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
        objectName,
        triggerType,
        hasConflicts: false,
        flows: [],
        triggers: [],
        processBuilders: [],
        workflowRules: [],
        conflicts: [],
        totalAutomation: 0
      };

      // Query active Flow definitions on this object first.
      const flowQuery = `SELECT Id, DeveloperName, Label, ActiveVersionId, TriggerObjectOrEventLabel FROM FlowDefinition WHERE TriggerObjectOrEventLabel = '${objectName}' AND ActiveVersionId != null`;
      const flowCommand = `sf data query --query "${flowQuery}" --target-org ${this.orgAlias} --json`;
      const allowedTriggerTypes = this._mapTriggerTypeToFlowVersionValues(triggerType);

      try {
        const flowOutput = this._execSfCommand(flowCommand);
        const flowData = JSON.parse(flowOutput);

        if (flowData.status === 0 && flowData.result?.records) {
          const flows = [];

          for (const flowDefinition of flowData.result.records) {
            let versionDetails = null;

            if (flowDefinition.ActiveVersionId) {
              try {
                const versionQuery = `SELECT VersionNumber, Status, TriggerType, TriggerOrder, ProcessType FROM FlowVersionView WHERE DurableId = '${flowDefinition.ActiveVersionId}' LIMIT 1`;
                const versionCommand = `sf data query --query "${versionQuery}" --target-org ${this.orgAlias} --json --use-tooling-api`;
                const versionOutput = this._execSfCommand(versionCommand);
                const versionData = JSON.parse(versionOutput);
                if (versionData.status === 0 && versionData.result?.records?.length > 0) {
                  versionDetails = versionData.result.records[0];
                }
              } catch (versionError) {
                this.log(`Warning: Could not query FlowVersionView for ${flowDefinition.DeveloperName}: ${versionError.message}`);
              }
            }

            if (
              allowedTriggerTypes.length > 0 &&
              versionDetails?.TriggerType &&
              !allowedTriggerTypes.includes(versionDetails.TriggerType)
            ) {
              continue;
            }

            flows.push({
              id: flowDefinition.Id,
              apiName: flowDefinition.DeveloperName,
              label: flowDefinition.Label,
              status: versionDetails?.Status || 'Active',
              processType: versionDetails?.ProcessType || null,
              triggerType: versionDetails?.TriggerType || null,
              triggerOrder: versionDetails?.TriggerOrder ?? null,
              versionNumber: versionDetails?.VersionNumber ?? null,
              entryCriteria: null
            });
          }

          result.flows = flows;
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
      result.flows
        .filter(flow => flow.triggerOrder !== null && flow.triggerOrder !== undefined)
        .forEach(flow => {
          const orderKey = String(flow.triggerOrder);
          orderCounts[orderKey] = (orderCounts[orderKey] || 0) + 1;
        });

      const unorderedFlows = result.flows.filter(flow => flow.triggerOrder === null || flow.triggerOrder === undefined);
      if (unorderedFlows.length > 0 && result.flows.length > 1) {
        result.hasConflicts = true;
        result.conflicts.push({
          type: 'trigger_order_missing',
          severity: 'warning',
          message: `${unorderedFlows.length} Flow(s) have no explicit trigger order in a multi-flow context`,
          recommendation: 'Set explicit trigger order to stabilize execution sequence'
        });
      }

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
      result.totalAutomation = totalAutomation;
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
        blockingRules: [],
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
   * Retrieve Flow version lifecycle information.
   * @param {string} flowApiName
   * @returns {Promise<object>}
   */
  async getFlowVersionInfo(flowApiName) {
    try {
      const manager = new FlowVersionManager(this.orgAlias, {
        verbose: this.options.verbose
      });

      const versions = await manager.listVersions(flowApiName);
      const activeVersion = await manager.getActiveVersion(flowApiName);
      const latestVersion = versions.length > 0 ? versions[0] : null;

      return {
        success: true,
        totalVersions: versions.length,
        versions,
        activeVersion,
        latestVersion,
        versionSkew: Math.max(
          0,
          Number(latestVersion?.VersionNumber || 0) - Number(activeVersion?.VersionNumber || 0)
        )
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        totalVersions: 0,
        versions: [],
        activeVersion: null,
        latestVersion: null,
        versionSkew: 0
      };
    }
  }

  /**
   * Validate local Flow entry criteria contradictions when local metadata exists.
   * @param {string} flowApiName
   * @returns {Promise<object>}
   */
  async checkEntryCriteriaAlignment(flowApiName) {
    const flowPath = this._findLocalFlowFile(flowApiName);
    if (!flowPath) {
      return {
        success: true,
        skipped: true,
        reason: 'local_flow_file_not_found',
        summary: { contradictions: 0 },
        issues: [],
        warnings: ['Local Flow XML not found; skipped entry-criteria contradiction analysis.']
      };
    }

    try {
      const validator = new FlowEntryCriteriaValidator({
        verbose: this.options.verbose
      });
      const flowXml = validator.loadFromFile(flowPath);
      const parsedFlow = validator.parseFlowXml(flowXml);
      const validation = validator.validate(parsedFlow);

      return {
        success: true,
        skipped: false,
        flowPath,
        ...validation
      };
    } catch (error) {
      return {
        success: false,
        skipped: false,
        flowPath,
        summary: { contradictions: 0 },
        issues: [],
        warnings: [],
        error: error.message
      };
    }
  }

  /**
   * Check hard-coded assignment conflict risks by reusing flow conflict analyzer utilities.
   * @param {object} flowMetadataResult
   * @returns {Promise<object>}
   */
  async inspectHardcodedConflictRisk(flowMetadataResult) {
    const flowId = flowMetadataResult?.flow?.activeVersionId || flowMetadataResult?.flow?.id;
    const objectName = flowMetadataResult?.flow?.object || null;

    if (!flowId) {
      return {
        success: true,
        skipped: true,
        summary: {
          critical: 0,
          high: 0,
          medium: 0
        },
        conflicts: []
      };
    }

    try {
      const analyzer = new FlowConflictAnalyzer(this.orgAlias, objectName);
      const metadataQuery = `SELECT Metadata FROM Flow WHERE Id = '${flowId}'`;
      const metadataCommand = `sf data query --query "${metadataQuery}" --use-tooling-api --json --target-org ${this.orgAlias}`;
      const metadataOutput = this._execSfCommand(metadataCommand);
      const metadataData = JSON.parse(metadataOutput);
      const metadata = metadataData?.result?.records?.[0]?.Metadata;

      if (!metadata) {
        return {
          success: false,
          skipped: true,
          error: 'Flow metadata payload unavailable for conflict analysis',
          summary: {
            critical: 0,
            high: 0,
            medium: 0
          },
          conflicts: []
        };
      }

      const conflicts = [
        ...analyzer.checkHardCodedRecordTypeId(metadata, objectName),
        ...analyzer.checkHardCodedPicklistValues(metadata, objectName),
        ...analyzer.checkHardCodedValues(metadata, objectName)
      ];

      return {
        success: true,
        skipped: false,
        conflicts,
        summary: {
          critical: conflicts.filter(conflict => conflict.severity === 'CRITICAL').length,
          high: conflicts.filter(conflict => conflict.severity === 'HIGH').length,
          medium: conflicts.filter(conflict => conflict.severity === 'MEDIUM').length
        }
      };
    } catch (error) {
      return {
        success: false,
        skipped: false,
        error: error.message,
        summary: {
          critical: 0,
          high: 0,
          medium: 0
        },
        conflicts: []
      };
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
    const enforcementMode = this._normalizeEnforcementMode(options.enforcement);
    const skipLoggingSetup = options.skipLoggingSetup === true || options.setupLogging === false;

    const result = {
      success: true,
      canProceed: true,
      checks: {},
      criticalIssues: [],
      warnings: [],
      recommendations: [],
      enforcementMode,
      decision: null,
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

      // 3. Version lifecycle context (non-blocking)
      result.checks.versionInfo = await this.getFlowVersionInfo(flowApiName);
      if (!result.checks.versionInfo.success) {
        result.warnings.push(`Flow version inventory unavailable: ${result.checks.versionInfo.error}`);
      }

      // 4. Competing automation check
      const objectForAutomation = options.object || result.checks.flowMetadata?.flow?.object || null;
      const triggerForAutomation = options.triggerType ||
        this._mapFlowVersionTriggerToTiming(result.checks.flowMetadata?.flow?.triggerType);

      if (objectForAutomation && triggerForAutomation) {
        result.checks.competingAutomation = await this.checkCompetingAutomation(
          objectForAutomation,
          triggerForAutomation
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
      } else {
        result.checks.competingAutomation = {
          success: true,
          skipped: true,
          hasConflicts: false,
          flows: [],
          triggers: [],
          processBuilders: [],
          workflowRules: [],
          conflicts: [],
          totalAutomation: 0
        };
        result.warnings.push('Skipped competing automation check: object and trigger type were not fully resolved.');
      }

      // 5. Validation rules check (if object provided)
      if (objectForAutomation) {
        result.checks.validationRules = await this.checkValidationRules(objectForAutomation);
        if (result.checks.validationRules.recommendations) {
          result.recommendations.push(...result.checks.validationRules.recommendations);
        }
      } else {
        result.checks.validationRules = {
          success: true,
          skipped: true,
          validationRules: [],
          requiredFields: [],
          duplicateRules: [],
          blockingRules: [],
          recommendations: []
        };
      }

      // 6. Entry criteria contradiction analysis (best effort)
      result.checks.entryCriteriaAnalysis = await this.checkEntryCriteriaAlignment(flowApiName);
      if (!result.checks.entryCriteriaAnalysis.success) {
        result.warnings.push(`Entry criteria analysis failed: ${result.checks.entryCriteriaAnalysis.error}`);
      } else if (result.checks.entryCriteriaAnalysis.warnings?.length) {
        result.warnings.push(...result.checks.entryCriteriaAnalysis.warnings);
      }

      // 7. Hard-coded value conflict risk analysis (best effort)
      result.checks.hardcodedConflictRisk = await this.inspectHardcodedConflictRisk(
        result.checks.flowMetadata
      );
      if (!result.checks.hardcodedConflictRisk.success && !result.checks.hardcodedConflictRisk.skipped) {
        result.warnings.push(`Hard-coded conflict analysis failed: ${result.checks.hardcodedConflictRisk.error}`);
      } else if (
        result.checks.hardcodedConflictRisk.success &&
        result.checks.hardcodedConflictRisk.summary?.critical > 0
      ) {
        result.warnings.push(
          `Detected ${result.checks.hardcodedConflictRisk.summary.critical} critical hard-coded assignment pattern(s).`
        );
      }

      // 8. Debug logging setup (if enabled)
      if (!skipLoggingSetup && this.options.autoSetupLogging) {
        result.checks.debugLogging = await this.setupDebugLogging('Automated Process', {
          duration: 30
        });
        if (!result.checks.debugLogging.success) {
          result.warnings.push(`Debug logging setup failed: ${result.checks.debugLogging.error}`);
        }
      } else {
        result.checks.debugLogging = {
          success: true,
          skipped: true
        };
      }

      // 9. Strategy decision + enforcement
      const securityContext = {
        runContext: result.checks.flowMetadata?.flow?.runInMode || 'system_without_sharing',
        expandsPrivilegedScope: this._normalizeBoolean(options.expandsPrivilegedScope, false),
        hasGuardConditions: this._normalizeBoolean(options.hasGuardConditions, false)
      };
      const complexity = this._estimateComplexity(
        result.checks.flowMetadata,
        result.checks.competingAutomation
      );
      const totalAutomation = result.checks.competingAutomation?.totalAutomation || 0;

      result.decision = this.strategyEngine.evaluate({
        proposedAction: options.proposedAction || 'auto',
        capabilityDomain: options.capabilityDomain || '',
        entryCriteria: options.entryCriteria || '',
        requiresAsyncOrdering: this._normalizeBoolean(options.requiresAsyncOrdering, false),
        flowMetadata: result.checks.flowMetadata?.flow || {},
        versionInfo: result.checks.versionInfo || {},
        competingAutomation: result.checks.competingAutomation || {},
        entryCriteriaAnalysis: result.checks.entryCriteriaAnalysis || {},
        security: securityContext,
        complexity,
        totalAutomation
      });

      result.recommendations.push(...(result.decision.requiredActions || []));
      result.warnings.push(...(result.decision.warnings || []));

      const blockingIssues = result.decision.blockingIssues || [];
      if (enforcementMode === 'strict') {
        const allStrictIssues = [...blockingIssues, ...result.warnings];
        if (allStrictIssues.length > 0) {
          result.criticalIssues.push(...allStrictIssues);
          result.canProceed = false;
        }
      } else if (enforcementMode === 'risk-based') {
        if (blockingIssues.length > 0) {
          result.criticalIssues.push(...blockingIssues);
          result.canProceed = false;
        }
      } else {
        // Advisory mode keeps all strategy findings as warnings.
        result.warnings.push(...blockingIssues.map(issue => `Advisory: ${issue}`));
      }

      // Determine final status
      result.criticalIssues = [...new Set(result.criticalIssues)];
      result.warnings = [...new Set(result.warnings)];
      result.recommendations = [...new Set(result.recommendations)];

      result.success = result.criticalIssues.length === 0;
      if (options.continueOnWarnings === false && result.warnings.length > 0) {
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

  if (args.length < 2 || args.includes('--help') || args.includes('-h')) {
    console.error('Usage: flow-preflight-checker.js <org-alias> [run-all] <flow-api-name> [options]');
    console.error('Options:');
    console.error('  --object <ObjectName>');
    console.error('  --trigger-type <before-save|after-save|before-delete|after-delete>');
    console.error('  --proposed-action <update|new|auto>');
    console.error('  --capability-domain <domain>');
    console.error('  --entry-criteria "<criteria summary>"');
    console.error('  --requires-async-ordering <true|false>');
    console.error('  --enforcement <risk-based|strict|advisory>');
    console.error('  --expands-privileged-scope <true|false>');
    console.error('  --has-guard-conditions <true|false>');
    console.error('  --skip-logging');
    console.error('  --json');
    process.exit(1);
  }

  const orgAlias = args[0];
  const hasCommandToken = args[1] === 'run-all';
  const flowApiName = hasCommandToken ? args[2] : args[1];
  const optionStartIndex = hasCommandToken ? 3 : 2;

  if (!flowApiName) {
    console.error('Error: flow API name is required');
    process.exit(1);
  }

  // Parse options (supports --flag and --key value)
  const options = {};
  for (let i = optionStartIndex; i < args.length; i++) {
    if (!args[i].startsWith('--')) {
      continue;
    }

    const key = args[i].replace('--', '');
    const next = args[i + 1];
    if (next && !next.startsWith('--')) {
      options[key] = next;
      i += 1;
    } else {
      options[key] = true;
    }
  }

  // Run checks
  const checker = new FlowPreflightChecker(orgAlias, { verbose: true });
  checker.runAllChecks(flowApiName, {
    object: options.object,
    triggerType: options['trigger-type'] || options.triggerType,
    skipLoggingSetup: options['skip-logging'] === true || String(options['skip-logging']).toLowerCase() === 'true',
    proposedAction: options['proposed-action'] || options.proposedAction,
    capabilityDomain: options['capability-domain'] || options.capabilityDomain,
    entryCriteria: options['entry-criteria'] || options.entryCriteria,
    requiresAsyncOrdering: options['requires-async-ordering'] || options.requiresAsyncOrdering,
    enforcement: options.enforcement,
    expandsPrivilegedScope: options['expands-privileged-scope'] || options.expandsPrivilegedScope,
    hasGuardConditions: options['has-guard-conditions'] || options.hasGuardConditions
  })
    .then(result => {
      if (options.json === true) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(`Decision: ${result.decision?.recommendedStrategy || 'n/a'}`);
        console.log(`Can Proceed: ${result.canProceed ? 'YES' : 'NO'}`);
        console.log(`Critical Issues: ${result.criticalIssues.length}`);
        console.log(`Warnings: ${result.warnings.length}`);
        if (result.decision?.rationale?.length) {
          console.log('Rationale:');
          result.decision.rationale.forEach(line => console.log(`  - ${line}`));
        }
      }
      process.exit(result.canProceed ? 0 : 1);
    })
    .catch(error => {
      console.error('Preflight check failed:', error.message);
      process.exit(1);
    });
}
