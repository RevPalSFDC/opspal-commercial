#!/usr/bin/env node

/**
 * UAT Step Executor
 *
 * Executes individual test steps using platform adapters with:
 * - Context management (pass record IDs between steps)
 * - Precondition checking
 * - Step-level evidence collection
 * - Error handling with detailed diagnostics
 *
 * @module uat-step-executor
 * @version 1.0.0
 *
 * @example
 * const { UATStepExecutor } = require('./uat-step-executor');
 * const { UATPlatformAdapter } = require('./uat-platform-adapter');
 *
 * const adapter = new UATPlatformAdapter('salesforce', { orgAlias: 'my-sandbox' });
 * const executor = new UATStepExecutor(adapter);
 *
 * const result = await executor.executeStep({
 *   action: 'create',
 *   object: 'Account',
 *   data: { Name: 'Test Account' }
 * });
 */

const {
  UATExecutionError,
  UATAdapterError,
  wrapError,
  getSuggestionsForSalesforceError
} = require('./uat-errors');

/**
 * Step execution status
 */
const StepStatus = {
  PENDING: 'pending',
  RUNNING: 'running',
  PASSED: 'passed',
  FAILED: 'failed',
  SKIPPED: 'skipped',
  MANUAL: 'manual'
};

/**
 * UAT Step Executor
 */
class UATStepExecutor {
  /**
   * Create a step executor
   * @param {Object} adapter - Platform adapter (UATPlatformAdapter or raw adapter)
   * @param {Object} [options] - Executor options
   * @param {boolean} [options.verbose=false] - Enable verbose logging
   * @param {boolean} [options.stopOnFailure=true] - Stop test case on first failure
   * @param {boolean} [options.collectEvidence=true] - Collect evidence for each step
   */
  constructor(adapter, options = {}) {
    if (!adapter) {
      throw new Error('Platform adapter is required');
    }

    this.adapter = adapter;
    this.verbose = options.verbose || false;
    this.stopOnFailure = options.stopOnFailure !== false;
    this.collectEvidence = options.collectEvidence !== false;

    // Execution context for variable resolution
    this.context = {};

    // Evidence collection
    this.evidence = [];

    // Created records for cleanup
    this.createdRecords = [];
  }

  /**
   * Execute a single step
   * @param {Object} step - Step definition from CSV parser
   * @param {Object} [testData] - Additional test data for this step
   * @returns {Promise<Object>} Step execution result
   */
  async executeStep(step, testData = {}) {
    const startTime = Date.now();
    const stepResult = {
      stepNumber: step.stepNumber,
      raw: step.raw,
      action: step.action,
      status: StepStatus.PENDING,
      evidence: {}
    };

    this.log(`  Step ${step.stepNumber}: ${step.raw}`);

    try {
      // Check preconditions
      if (step.precondition) {
        const preconditionMet = await this.checkPrecondition(step.precondition);
        if (!preconditionMet) {
          stepResult.status = StepStatus.SKIPPED;
          stepResult.reason = `Precondition not met: ${JSON.stringify(step.precondition)}`;
          stepResult.duration = Date.now() - startTime;
          return stepResult;
        }
      }

      // Merge step data with test data
      const mergedData = this.mergeData(step.data || {}, testData);

      // Resolve context variables in data
      const resolvedData = this.resolveContext(mergedData);

      // Execute based on action type
      stepResult.status = StepStatus.RUNNING;

      switch (step.action) {
        case 'navigate':
          stepResult.result = await this.executeNavigate(step);
          break;

        case 'create':
          stepResult.result = await this.executeCreate(step, resolvedData);
          break;

        case 'update':
          stepResult.result = await this.executeUpdate(step, resolvedData);
          break;

        case 'verify':
          stepResult.result = await this.executeVerify(step, resolvedData);
          break;

        case 'verify_blocked':
          stepResult.result = await this.executeVerifyBlocked(step);
          break;

        case 'permission':
          stepResult.result = await this.executePermissionCheck(step);
          break;

        case 'submit_approval':
        case 'approve':
        case 'reject':
          stepResult.result = await this.executeApproval(step);
          break;

        case 'docusign_send':
        case 'docusign_sign':
          stepResult.result = await this.executeDocuSign(step);
          break;

        case 'negative_test':
          stepResult.result = await this.executeNegativeTest(step, resolvedData);
          break;

        case 'manual':
        default:
          stepResult.status = StepStatus.MANUAL;
          stepResult.result = {
            success: true,
            message: 'Manual step - requires human verification',
            instruction: step.raw
          };
          break;
      }

      // Determine final status
      if (stepResult.status === StepStatus.RUNNING) {
        stepResult.status = stepResult.result?.success ? StepStatus.PASSED : StepStatus.FAILED;

        // Propagate error and suggestions from result to top-level
        if (!stepResult.result?.success && stepResult.result?.error) {
          stepResult.error = stepResult.result.error;
          if (stepResult.result.suggestions) {
            stepResult.suggestions = stepResult.result.suggestions;
          }
        }
      }

      // Capture evidence
      if (this.collectEvidence && stepResult.result) {
        stepResult.evidence = {
          timestamp: new Date().toISOString(),
          recordId: stepResult.result.id,
          recordUrl: stepResult.result.recordUrl,
          data: resolvedData
        };
      }

    } catch (error) {
      // Wrap error with context and suggestions
      const wrappedError = wrapError(error, {
        stepNumber: step.stepNumber,
        action: step.action,
        object: step.object,
        platform: this.adapter?.platform || 'unknown'
      });

      stepResult.status = StepStatus.FAILED;
      stepResult.error = wrappedError.message;
      stepResult.suggestions = wrappedError.suggestions;
      stepResult.errorDetails = wrappedError.toJSON ? wrappedError.toJSON() : null;
    }

    stepResult.duration = Date.now() - startTime;

    // Add to evidence collection
    this.evidence.push(stepResult);

    // Log result
    const icon = stepResult.status === StepStatus.PASSED ? '✓' :
                 stepResult.status === StepStatus.FAILED ? '✗' :
                 stepResult.status === StepStatus.SKIPPED ? '○' :
                 stepResult.status === StepStatus.MANUAL ? '?' : '→';

    this.log(`    ${icon} ${stepResult.status.toUpperCase()} (${stepResult.duration}ms)`);

    if (stepResult.error) {
      this.log(`      Error: ${stepResult.error}`);
      if (stepResult.suggestions && stepResult.suggestions.length > 0) {
        this.log('      Suggestions:');
        for (const suggestion of stepResult.suggestions) {
          this.log(`        → ${suggestion}`);
        }
      }
    }

    return stepResult;
  }

  // ============================================
  // ACTION HANDLERS
  // ============================================

  /**
   * Execute navigate action (mostly a marker step)
   */
  async executeNavigate(step) {
    // Navigation is primarily for test readability
    // In automated mode, we just note which object we're working with
    const objectType = step.object;

    if (objectType) {
      this.context.currentObject = objectType;
    }

    return {
      success: true,
      objectType,
      message: `Navigated to ${objectType}`
    };
  }

  /**
   * Execute create action
   */
  async executeCreate(step, data) {
    const objectType = step.object;

    if (!objectType) {
      return {
        success: false,
        error: 'Object type not specified for create action',
        suggestions: [
          'Specify the object type in the step definition',
          'Example: "Create Account" or "Create SBQQ__Quote__c"'
        ]
      };
    }

    try {
      const result = await this.adapter.createRecord(objectType, data);

      if (result.success) {
        // Store in context for later reference
        this.context[`${objectType}Id`] = result.id;
        this.context[`last${objectType}Id`] = result.id;
        this.context.lastRecordId = result.id;
        this.context.lastRecordType = objectType;

        // Track for cleanup
        this.createdRecords.push({
          objectType,
          id: result.id
        });
      } else {
        // Add suggestions for failed creates
        result.suggestions = getSuggestionsForSalesforceError(
          result.error || 'Create failed',
          { object: objectType, orgAlias: this.adapter?.config?.orgAlias }
        );
      }

      return result;
    } catch (error) {
      const suggestions = getSuggestionsForSalesforceError(
        error.message,
        { object: objectType, orgAlias: this.adapter?.config?.orgAlias }
      );
      return {
        success: false,
        error: error.message,
        suggestions
      };
    }
  }

  /**
   * Execute update action
   */
  async executeUpdate(step, data) {
    const objectType = step.object || this.context.lastRecordType;
    const recordId = data.Id || this.context[`${objectType}Id`] || this.context.lastRecordId;

    if (!recordId) {
      return {
        success: false,
        error: `No record ID found for ${objectType} update`,
        suggestions: [
          'Ensure a record was created in a previous step',
          `Check that context contains ${objectType}Id or lastRecordId`,
          'Provide explicit Id in test data'
        ]
      };
    }

    // Handle special field updates
    if (step.field) {
      const fieldName = this.normalizeFieldName(step.field, objectType);
      const fieldValue = data[step.field] !== undefined ? data[step.field] : true;
      data = { [fieldName]: fieldValue };
    }

    try {
      const result = await this.adapter.updateRecord(objectType, recordId, data);

      if (!result.success) {
        result.suggestions = getSuggestionsForSalesforceError(
          result.error || 'Update failed',
          { object: objectType, orgAlias: this.adapter?.config?.orgAlias }
        );
      }

      return result;
    } catch (error) {
      const suggestions = getSuggestionsForSalesforceError(
        error.message,
        { object: objectType, orgAlias: this.adapter?.config?.orgAlias }
      );
      return {
        success: false,
        error: error.message,
        suggestions
      };
    }
  }

  /**
   * Execute verify action
   */
  async executeVerify(step, data) {
    // Verify rollups
    if (step.target === 'rollups') {
      return await this.verifyRollups(data);
    }

    // Verify specific field
    if (step.target) {
      const parts = step.target.split('.');
      if (parts.length === 2) {
        const [objectType, fieldName] = parts;
        const recordId = this.context[`${objectType}Id`];

        if (!recordId) {
          return {
            success: false,
            error: `No record ID found for ${objectType}`
          };
        }

        const expected = data.assertions?.[step.target] || data[fieldName];
        return await this.adapter.verifyField(objectType, recordId, fieldName, expected);
      }
    }

    // Generic verification
    return {
      success: true,
      message: 'Verification requires manual confirmation',
      target: step.target
    };
  }

  /**
   * Execute blocked verification (negative test)
   */
  async executeVerifyBlocked(step) {
    // This is typically a manual verification
    return {
      success: true,
      status: StepStatus.MANUAL,
      message: 'Verify action was blocked - requires manual confirmation',
      expectedOutcome: 'blocked'
    };
  }

  /**
   * Execute permission check
   */
  async executePermissionCheck(step) {
    const profile = step.profile;
    const objectType = step.object || this.context.lastRecordType;
    const action = step.data?.action || 'create';

    if (!profile) {
      return {
        success: false,
        error: 'Profile not specified for permission check'
      };
    }

    const result = await this.adapter.checkPermission(profile, objectType, action);

    // If this is a negative test (expecting blocked), invert the result
    if (step.expectedOutcome === 'blocked') {
      result.success = !result.allowed;
      result.message = result.allowed
        ? 'Action was allowed but expected to be blocked'
        : 'Action correctly blocked';
    } else {
      result.success = result.allowed;
    }

    return result;
  }

  /**
   * Execute approval action
   */
  async executeApproval(step) {
    // Approval actions typically require manual intervention or specific API calls
    return {
      success: true,
      status: StepStatus.MANUAL,
      message: `${step.action} requires manual execution or approval process automation`,
      action: step.action
    };
  }

  /**
   * Execute DocuSign action
   */
  async executeDocuSign(step) {
    // DocuSign integration requires external system interaction
    return {
      success: true,
      status: StepStatus.MANUAL,
      message: `${step.action} requires DocuSign integration - manual verification needed`,
      action: step.action
    };
  }

  /**
   * Execute negative test
   */
  async executeNegativeTest(step, data) {
    // Negative tests verify that something is blocked/fails
    return {
      success: true,
      status: StepStatus.MANUAL,
      message: 'Negative test - verify expected failure or block',
      expectedOutcome: 'failure_or_block'
    };
  }

  // ============================================
  // VERIFICATION HELPERS
  // ============================================

  /**
   * Verify rollup calculations
   */
  async verifyRollups(data) {
    const results = [];

    // Common CPQ rollups
    const rollupConfigs = [
      // Opportunity <- Primary Quote
      {
        parentObject: 'Opportunity',
        parentField: 'Amount',
        childObject: 'SBQQ__Quote__c',
        childField: 'SBQQ__NetAmount__c',
        relationshipField: 'SBQQ__Opportunity__c',
        filter: 'SBQQ__Primary__c = true'
      },
      // Quote <- Quote Lines
      {
        parentObject: 'SBQQ__Quote__c',
        parentField: 'SBQQ__NetAmount__c',
        childObject: 'SBQQ__QuoteLine__c',
        childField: 'SBQQ__NetTotal__c',
        relationshipField: 'SBQQ__Quote__c'
      }
    ];

    // Check which rollups we can verify based on context
    for (const config of rollupConfigs) {
      const parentId = this.context[`${config.parentObject}Id`];
      if (parentId) {
        const result = await this.adapter.verifyRollup(
          config.parentObject,
          parentId,
          config.childObject,
          config
        );
        results.push({
          rollup: `${config.parentObject}.${config.parentField}`,
          ...result
        });
      }
    }

    // Also check user-defined assertions
    if (data.assertions) {
      for (const [key, assertion] of Object.entries(data.assertions)) {
        const [objectType, fieldName] = key.split('.');
        const recordId = this.context[`${objectType}Id`];

        if (recordId) {
          const result = await this.adapter.verifyField(
            objectType,
            recordId,
            fieldName,
            assertion.expected || assertion,
            assertion.operator || 'equals'
          );
          results.push({
            assertion: key,
            ...result
          });
        }
      }
    }

    const allPassed = results.length > 0 && results.every(r => r.passed);

    return {
      success: allPassed,
      verified: results.length,
      passed: results.filter(r => r.passed).length,
      results
    };
  }

  // ============================================
  // CONTEXT MANAGEMENT
  // ============================================

  /**
   * Resolve context variables in data
   * Variables are referenced as {VariableName}
   */
  resolveContext(data) {
    if (!data || typeof data !== 'object') {
      return data;
    }

    const resolved = {};

    for (const [key, value] of Object.entries(data)) {
      if (typeof value === 'string' && value.startsWith('{') && value.endsWith('}')) {
        const varName = value.slice(1, -1);
        resolved[key] = this.context[varName] !== undefined ? this.context[varName] : value;
      } else if (typeof value === 'object' && value !== null) {
        resolved[key] = this.resolveContext(value);
      } else {
        resolved[key] = value;
      }
    }

    return resolved;
  }

  /**
   * Merge step data with test data
   */
  mergeData(stepData, testData) {
    return {
      ...stepData,
      ...testData
    };
  }

  /**
   * Check precondition
   */
  async checkPrecondition(precondition) {
    // Check stage precondition
    if (precondition.stage) {
      const oppId = this.context.OpportunityId;
      if (oppId) {
        const result = await this.adapter.queryRecord('Opportunity', oppId, ['StageName']);
        if (result.success) {
          const currentStage = result.record.StageName;
          // Check if current stage meets or exceeds required stage
          // This is a simplified check - real implementation would use stage order
          return currentStage === precondition.stage ||
                 this.isStageAtOrAfter(currentStage, precondition.stage);
        }
      }
    }

    // Check record exists precondition
    if (precondition.recordExists) {
      const recordId = this.context[precondition.recordExists];
      return !!recordId;
    }

    return true;
  }

  /**
   * Check if current stage is at or after required stage
   */
  isStageAtOrAfter(currentStage, requiredStage) {
    // Common Opportunity stage order
    const stageOrder = [
      'Prospecting',
      'Meeting Booked',
      'Discovery',
      'Qualification',
      'Proposal',
      'Negotiation',
      'Contract Sign',
      'Admin Review',
      'Closed Won',
      'Closed Lost'
    ];

    const currentIndex = stageOrder.findIndex(s => s.toLowerCase() === currentStage.toLowerCase());
    const requiredIndex = stageOrder.findIndex(s => s.toLowerCase() === requiredStage.toLowerCase());

    if (currentIndex === -1 || requiredIndex === -1) {
      return true; // Unknown stages, assume OK
    }

    return currentIndex >= requiredIndex;
  }

  /**
   * Normalize field name for specific object types
   */
  normalizeFieldName(fieldName, objectType) {
    // Handle common CPQ field name mappings
    const fieldMaps = {
      'SBQQ__Quote__c': {
        'primary': 'SBQQ__Primary__c',
        'Primary': 'SBQQ__Primary__c'
      }
    };

    const objectFieldMap = fieldMaps[objectType];
    if (objectFieldMap && objectFieldMap[fieldName]) {
      return objectFieldMap[fieldName];
    }

    return fieldName;
  }

  // ============================================
  // STATE MANAGEMENT
  // ============================================

  /**
   * Get current execution context
   */
  getContext() {
    return { ...this.context };
  }

  /**
   * Set context value
   */
  setContext(key, value) {
    this.context[key] = value;
  }

  /**
   * Clear context
   */
  clearContext() {
    this.context = {};
  }

  /**
   * Get collected evidence
   */
  getEvidence() {
    return [...this.evidence];
  }

  /**
   * Get created records for cleanup
   */
  getCreatedRecords() {
    return [...this.createdRecords];
  }

  /**
   * Logging helper
   */
  log(message) {
    if (this.verbose) {
      console.log(message);
    }
  }
}

module.exports = {
  UATStepExecutor,
  StepStatus
};
