#!/usr/bin/env node

/**
 * Agent Behavior Validator
 *
 * Detects and prevents agent behavior violations, specifically premature
 * completion claims without proper validation evidence.
 *
 * **Problem Solved (Reflection Cohort #1, P0):**
 * - Agents mark workflows complete when they fail (user trust violation)
 * - Example: "Preparation was not complete, there was a pretty critical failure"
 * - No detection mechanism for completion claims without evidence
 *
 * **Solution:**
 * - Post-task validation hooks that check completion claims
 * - Integration with WorkflowStateMachine for evidence verification
 * - Automatic alerts on trust violations
 * - Monitoring dashboard for behavior patterns
 *
 * **ROI:** $15,000/year by preventing trust violations and failed workflows
 *
 * @module agent-behavior-validator
 */

const fs = require('fs').promises;
const path = require('path');
const { WorkflowStateMachine } = require('./workflow-state-machine');

/**
 * Violation Types
 */
const ViolationType = {
  PREMATURE_COMPLETION: 'premature_completion',    // Claimed complete without evidence
  MISSING_VALIDATION: 'missing_validation',         // No validation step before completion
  MISSING_REQUIREMENTS: 'missing_requirements',     // No requirements gathering for deliverable
  FILE_NOT_FOUND: 'file_not_found',                // Claimed file created but doesn't exist
  COUNT_MISMATCH: 'count_mismatch',                // Record count doesn't match claim
  STATE_VIOLATION: 'state_violation'               // Invalid state transition
};

/**
 * Severity Levels
 */
const Severity = {
  CRITICAL: 'CRITICAL',  // P0 - User trust violation
  HIGH: 'HIGH',          // P1 - Data integrity issue
  MEDIUM: 'MEDIUM',      // P2 - Workflow inefficiency
  LOW: 'LOW'             // P3 - Best practice deviation
};

/**
 * Agent Behavior Validator
 *
 * Validates agent behavior against expected patterns and detects violations.
 *
 * @example
 * const validator = new AgentBehaviorValidator({
 *   workflowId: 'dedup-prepare-rentable',
 *   agentName: 'sfdc-orchestrator',
 *   validationRules: ['require_backup_evidence', 'require_validation_step']
 * });
 *
 * const result = await validator.validate({
 *   completionClaim: true,
 *   expectedFiles: ['./backup/account.csv'],
 *   expectedRecordCount: 29123
 * });
 *
 * if (!result.passed) {
 *   console.error('❌ Validation failed:', result.violations);
 * }
 */
class AgentBehaviorValidator {
  /**
   * Create a validator instance
   *
   * @param {Object} config - Configuration
   * @param {string} config.workflowId - Workflow identifier
   * @param {string} config.agentName - Agent being validated
   * @param {Array<string>} [config.validationRules] - Rules to enforce
   * @param {string} [config.logFile] - Path to validation log
   */
  constructor(config) {
    this.workflowId = config.workflowId;
    this.agentName = config.agentName;
    this.validationRules = config.validationRules || this._getDefaultRules();
    this.logFile = config.logFile || './logs/agent-behavior-validation.log';
    this.violations = [];
  }

  /**
   * Validate agent behavior
   *
   * Checks for violations based on validation rules and workflow state.
   *
   * @param {Object} context - Validation context
   * @param {boolean} context.completionClaim - Agent claimed completion
   * @param {Array<string>} [context.expectedFiles] - Files that should exist
   * @param {number} [context.expectedRecordCount] - Expected record count
   * @param {number} [context.actualRecordCount] - Actual record count
   * @param {boolean} [context.validationStepRun] - Whether validation was run
   * @param {boolean} [context.requirementsGathered] - Whether requirements were gathered
   * @param {string} [context.stateMachineFile] - Path to state machine file
   * @returns {Promise<Object>} - Validation result
   */
  async validate(context) {
    this.violations = [];
    const startTime = Date.now();

    console.log(`\n🔍 Validating agent behavior: ${this.agentName}`);
    console.log(`   Workflow: ${this.workflowId}`);
    console.log(`   Rules: ${this.validationRules.length} active`);

    // Rule 1: Check for premature completion claims
    if (context.completionClaim && this.validationRules.includes('require_validation_evidence')) {
      await this._checkCompletionEvidence(context);
    }

    // Rule 2: Check for missing validation step
    if (context.completionClaim && this.validationRules.includes('require_validation_step')) {
      this._checkValidationStep(context);
    }

    // Rule 3: Check file existence claims
    if (context.expectedFiles && this.validationRules.includes('verify_file_existence')) {
      await this._checkFileExistence(context.expectedFiles);
    }

    // Rule 4: Check record count claims
    if (context.expectedRecordCount && this.validationRules.includes('verify_record_counts')) {
      this._checkRecordCounts(context);
    }

    // Rule 5: Check requirements gathering for deliverables
    if (this.validationRules.includes('require_requirements_gathering')) {
      this._checkRequirementsGathering(context);
    }

    // Rule 6: Check workflow state machine consistency
    if (context.stateMachineFile && this.validationRules.includes('verify_state_machine')) {
      await this._checkStateMachine(context.stateMachineFile);
    }

    const duration = Date.now() - startTime;
    const passed = this.violations.length === 0;

    const result = {
      workflowId: this.workflowId,
      agentName: this.agentName,
      passed,
      violations: this.violations,
      validationTime: duration,
      timestamp: new Date().toISOString()
    };

    // Log result
    await this._logValidation(result);

    // Print summary
    this._printSummary(result);

    return result;
  }

  /**
   * Get validation report for a time period
   *
   * @param {Object} options - Report options
   * @param {Date} options.startDate - Start date
   * @param {Date} options.endDate - End date
   * @param {string} [options.agentName] - Filter by agent
   * @returns {Promise<Object>} - Validation report
   */
  async getReport(options) {
    try {
      const logContent = await fs.readFile(this.logFile, 'utf8');
      const lines = logContent.split('\n').filter(l => l.trim());

      const validations = lines
        .map(line => {
          try {
            return JSON.parse(line);
          } catch {
            return null;
          }
        })
        .filter(v => v !== null);

      // Filter by date range
      const filtered = validations.filter(v => {
        const timestamp = new Date(v.timestamp);
        return timestamp >= options.startDate && timestamp <= options.endDate;
      });

      // Filter by agent if specified
      const agentFiltered = options.agentName
        ? filtered.filter(v => v.agentName === options.agentName)
        : filtered;

      // Calculate statistics
      const stats = {
        totalValidations: agentFiltered.length,
        passedCount: agentFiltered.filter(v => v.passed).length,
        failedCount: agentFiltered.filter(v => !v.passed).length,
        violationsByType: {},
        violationsBySeverity: {},
        agentStats: {}
      };

      // Count violations by type and severity
      agentFiltered.forEach(v => {
        if (!v.passed) {
          v.violations.forEach(violation => {
            // By type
            stats.violationsByType[violation.type] = (stats.violationsByType[violation.type] || 0) + 1;

            // By severity
            stats.violationsBySeverity[violation.severity] = (stats.violationsBySeverity[violation.severity] || 0) + 1;
          });

          // By agent
          if (!stats.agentStats[v.agentName]) {
            stats.agentStats[v.agentName] = { total: 0, violations: 0 };
          }
          stats.agentStats[v.agentName].total++;
          stats.agentStats[v.agentName].violations++;
        } else {
          if (!stats.agentStats[v.agentName]) {
            stats.agentStats[v.agentName] = { total: 0, violations: 0 };
          }
          stats.agentStats[v.agentName].total++;
        }
      });

      return {
        period: {
          start: options.startDate.toISOString(),
          end: options.endDate.toISOString()
        },
        stats,
        recentViolations: agentFiltered
          .filter(v => !v.passed)
          .slice(-10) // Last 10 violations
      };
    } catch (error) {
      console.error(`❌ Failed to generate report: ${error.message}`);
      return null;
    }
  }

  // ========================================
  // PRIVATE METHODS - VALIDATION CHECKS
  // ========================================

  /**
   * Check completion evidence
   * @private
   */
  async _checkCompletionEvidence(context) {
    // If completion is claimed but no validation step was run and no files exist,
    // this is a premature completion claim
    const hasEvidence = context.validationStepRun ||
                       (context.expectedFiles && context.expectedFiles.length > 0);

    if (!hasEvidence) {
      this.violations.push({
        type: ViolationType.PREMATURE_COMPLETION,
        severity: Severity.CRITICAL,
        message: 'Agent claimed completion without validation evidence',
        details: 'No validation step was run and no expected files were specified',
        recommendation: 'Integrate WorkflowStateMachine with evidence validation before claiming completion'
      });
    }
  }

  /**
   * Check validation step
   * @private
   */
  _checkValidationStep(context) {
    if (!context.validationStepRun) {
      this.violations.push({
        type: ViolationType.MISSING_VALIDATION,
        severity: Severity.HIGH,
        message: 'Completion claimed without running validation step',
        details: 'Agent transitioned to complete state without validating results',
        recommendation: 'Add validation step before completion using WorkflowStateMachine.validate()'
      });
    }
  }

  /**
   * Check file existence
   * @private
   */
  async _checkFileExistence(expectedFiles) {
    for (const filePath of expectedFiles) {
      try {
        await fs.access(filePath);
        // File exists - no violation
      } catch {
        this.violations.push({
          type: ViolationType.FILE_NOT_FOUND,
          severity: Severity.CRITICAL,
          message: `Expected file not found: ${filePath}`,
          details: `Agent claimed file was created but it does not exist`,
          recommendation: `Verify file creation before claiming completion, use WorkflowStateMachine evidence validation`
        });
      }
    }
  }

  /**
   * Check record counts
   * @private
   */
  _checkRecordCounts(context) {
    if (context.expectedRecordCount !== context.actualRecordCount) {
      this.violations.push({
        type: ViolationType.COUNT_MISMATCH,
        severity: Severity.HIGH,
        message: `Record count mismatch`,
        details: `Expected ${context.expectedRecordCount}, got ${context.actualRecordCount}`,
        recommendation: `Verify record counts before claiming completion, use WorkflowStateMachine with record_count evidence type`
      });
    }
  }

  /**
   * Check requirements gathering
   * @private
   */
  _checkRequirementsGathering(context) {
    if (!context.requirementsGathered) {
      this.violations.push({
        type: ViolationType.MISSING_REQUIREMENTS,
        severity: Severity.MEDIUM,
        message: 'Requirements not gathered before creating deliverable',
        details: 'User preferences not confirmed via AskUserQuestion',
        recommendation: 'Use requirements gathering template from developer-tools-plugin before creating deliverables'
      });
    }
  }

  /**
   * Check state machine consistency
   * @private
   */
  async _checkStateMachine(stateMachineFile) {
    try {
      const machine = await WorkflowStateMachine.load(stateMachineFile);
      const state = machine.getState();

      // Check for invalid state
      if (state.currentState === 'complete' && state.evidence.length === 0) {
        this.violations.push({
          type: ViolationType.STATE_VIOLATION,
          severity: Severity.CRITICAL,
          message: 'Workflow in complete state without validation evidence',
          details: `State machine shows complete but no evidence was recorded`,
          recommendation: 'Use WorkflowStateMachine.validate() before transitioning to complete state'
        });
      }

      // Check for failed validations
      if (state.currentState === 'complete' && state.validationResults) {
        const failedValidations = state.validationResults.filter(r => !r.passed);
        if (failedValidations.length > 0) {
          this.violations.push({
            type: ViolationType.STATE_VIOLATION,
            severity: Severity.CRITICAL,
            message: 'Workflow in complete state with failed validations',
            details: `${failedValidations.length} validation(s) failed but workflow marked complete`,
            recommendation: 'Fix validation failures or rollback workflow state'
          });
        }
      }
    } catch (error) {
      // State machine file not found or invalid - this itself is a violation
      this.violations.push({
        type: ViolationType.MISSING_VALIDATION,
        severity: Severity.HIGH,
        message: 'State machine file not found or invalid',
        details: error.message,
        recommendation: 'Integrate WorkflowStateMachine into workflow'
      });
    }
  }

  /**
   * Get default validation rules
   * @private
   */
  _getDefaultRules() {
    return [
      'require_validation_evidence',
      'require_validation_step',
      'verify_file_existence',
      'verify_record_counts',
      'require_requirements_gathering',
      'verify_state_machine'
    ];
  }

  /**
   * Log validation result
   * @private
   */
  async _logValidation(result) {
    try {
      const logDir = path.dirname(this.logFile);
      await fs.mkdir(logDir, { recursive: true });

      const logLine = JSON.stringify(result) + '\n';
      await fs.appendFile(this.logFile, logLine);
    } catch (error) {
      console.error(`⚠️  Failed to log validation: ${error.message}`);
    }
  }

  /**
   * Print validation summary
   * @private
   */
  _printSummary(result) {
    console.log(`\n📊 Validation Summary`);
    console.log(`   Status: ${result.passed ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`   Violations: ${result.violations.length}`);
    console.log(`   Duration: ${result.validationTime}ms\n`);

    if (!result.passed) {
      console.log('🚨 Violations Detected:\n');
      result.violations.forEach((v, i) => {
        console.log(`${i + 1}. [${v.severity}] ${v.type}`);
        console.log(`   ${v.message}`);
        console.log(`   Details: ${v.details}`);
        console.log(`   Fix: ${v.recommendation}\n`);
      });
    }
  }
}

// ========================================
// EXPORTS
// ========================================

module.exports = {
  AgentBehaviorValidator,
  ViolationType,
  Severity
};

// ========================================
// CLI USAGE
// ========================================

if (require.main === module) {
  console.log('Agent Behavior Validator - CLI Usage\n');
  console.log('const { AgentBehaviorValidator } = require("./agent-behavior-validator");');
  console.log('');
  console.log('Example:');
  console.log('const validator = new AgentBehaviorValidator({');
  console.log('  workflowId: "dedup-prepare-rentable",');
  console.log('  agentName: "sfdc-orchestrator"');
  console.log('});');
  console.log('');
  console.log('const result = await validator.validate({');
  console.log('  completionClaim: true,');
  console.log('  expectedFiles: ["./backup/account.csv"],');
  console.log('  validationStepRun: false');
  console.log('});');
  console.log('');
  console.log('if (!result.passed) {');
  console.log('  console.error("Violations:", result.violations);');
  console.log('}');
}
