#!/usr/bin/env node

/**
 * FlowDiagnosticOrchestrator - Orchestrate end-to-end diagnostic workflows
 *
 * @module flow-diagnostic-orchestrator
 * @version 3.43.0
 * @description Coordinates all 5 diagnostic modules to run comprehensive Flow testing
 *              and diagnostic workflows. Implements 4 workflow types: preflight, execution,
 *              coverage, and full diagnostic.
 *
 * @see docs/runbooks/flow-xml-development/07-testing-and-diagnostics.md (Section 5)
 * @see docs/FLOW_DIAGNOSTIC_SCRIPT_INTERFACES.md (Section 6)
 *
 * @example
 * const { FlowDiagnosticOrchestrator } = require('./flow-diagnostic-orchestrator');
 *
 * const orchestrator = new FlowDiagnosticOrchestrator('gamma-corp');
 *
 * // Run full diagnostic
 * const result = await orchestrator.runFullDiagnostic('Account_Validation_Flow', {
 *   object: 'Account',
 *   triggerType: 'after-save',
 *   testCases: [
 *     { recordData: { Status__c: 'Active' } },
 *     { recordData: { Status__c: 'Inactive' } }
 *   ]
 * });
 *
 * console.log('Coverage:', result.overallSummary.coveragePercentage + '%');
 */

const { FlowPreflightChecker } = require('./flow-preflight-checker');
const { FlowExecutor } = require('./flow-executor');
const { FlowLogParser } = require('./flow-log-parser');
const { FlowStateSnapshot } = require('./flow-state-snapshot');
const { FlowBranchAnalyzer } = require('./flow-branch-analyzer');
const crypto = require('crypto');
const os = require('os');

/**
 * Custom error class for orchestration failures
 */
class OrchestrationError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'OrchestrationError';
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, OrchestrationError);
  }
}

/**
 * FlowDiagnosticOrchestrator - Coordinate diagnostic workflows
 */
class FlowDiagnosticOrchestrator {
  /**
   * Create a new FlowDiagnosticOrchestrator instance
   *
   * @param {string} orgAlias - Salesforce org alias
   * @param {object} options - Configuration options
   * @param {boolean} [options.verbose=false] - Enable detailed logging
   * @param {boolean} [options.continueOnWarnings=true] - Continue workflow despite warnings
   * @param {boolean} [options.captureObservations=true] - Emit events for Living Runbook System
   * @param {boolean} [options.generateReports=true] - Auto-generate reports
   */
  constructor(orgAlias, options = {}) {
    if (!orgAlias) {
      throw new OrchestrationError('orgAlias is required', 'INVALID_ARGUMENT');
    }

    this.orgAlias = orgAlias;
    this.options = {
      verbose: false,
      continueOnWarnings: true,
      captureObservations: true,
      generateReports: true,
      ...options
    };

    this.log = this.options.verbose ? console.log : () => {};

    // Initialize module instances
    this.preflightChecker = new FlowPreflightChecker(orgAlias, { verbose: this.options.verbose });
    this.executor = new FlowExecutor(orgAlias, { verbose: this.options.verbose });
    this.logParser = new FlowLogParser(orgAlias, { verbose: this.options.verbose });
    this.snapshot = new FlowStateSnapshot(orgAlias, { verbose: this.options.verbose });
    this.analyzer = new FlowBranchAnalyzer(orgAlias, { verbose: this.options.verbose });
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
   * Run complete pre-flight diagnostic workflow
   *
   * @param {string} flowApiName - Flow API name
   * @param {object} [options] - Diagnostic options
   * @param {string} [options.object] - Object API name (for competing automation check)
   * @param {string} [options.triggerType] - Trigger type (for competing automation check)
   * @param {boolean} [options.setupLogging=true] - Setup debug logging
   * @returns {Promise<PreflightDiagnosticResult>} Diagnostic result
   *
   * @example
   * const result = await orchestrator.runPreflightDiagnostic('Account_Validation_Flow', {
   *   object: 'Account',
   *   triggerType: 'after-save',
   *   setupLogging: true
   * });
   */
  async runPreflightDiagnostic(flowApiName, options = {}) {
    const startTime = Date.now();
    const workflowId = `preflight_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    this.log(`\n=== Pre-Flight Diagnostic Workflow: ${flowApiName} ===`);

    try {
      // Run all pre-flight checks
      const checks = await this.preflightChecker.runAllChecks(flowApiName, {
        object: options.object,
        triggerType: options.triggerType,
        setupLogging: options.setupLogging !== false
      });

      // Analyze results
      const summary = {
        totalChecks: 5,
        passed: 0,
        warnings: 0,
        criticalIssues: 0
      };

      const recommendations = [];
      const nextSteps = [];

      // Count check outcomes
      if (checks.connectivity.success) summary.passed++;
      if (checks.flowMetadata.success) summary.passed++;
      if (!checks.competingAutomation.hasConflicts) {
        summary.passed++;
      } else {
        summary.warnings++;
        recommendations.push('Review competing automation conflicts before deployment');
      }

      if (checks.validationRules.blockingRules.length === 0) {
        summary.passed++;
      } else {
        summary.warnings++;
        recommendations.push(`Disable ${checks.validationRules.blockingRules.length} blocking validation rules for testing`);
      }

      if (checks.debugLogging.traceFlags.length > 0) {
        summary.passed++;
      } else {
        summary.warnings++;
        recommendations.push('Setup debug logging to capture execution details');
      }

      // Determine if we can proceed
      const canProceed = summary.criticalIssues === 0 && (
        this.options.continueOnWarnings || summary.warnings === 0
      );

      // Next steps
      if (canProceed) {
        nextSteps.push('Pre-flight checks passed');
        nextSteps.push('Ready to proceed with Flow execution');
        if (summary.warnings > 0) {
          nextSteps.push(`Review ${summary.warnings} warning(s) before production deployment`);
        }
      } else {
        nextSteps.push('Fix critical issues before proceeding');
        recommendations.forEach(rec => nextSteps.push(rec));
      }

      const result = {
        success: checks.canProceed,
        canProceed,
        flowApiName,
        orgAlias: this.orgAlias,
        workflowId,
        checks,
        summary,
        recommendations,
        nextSteps,
        timestamp: new Date().toISOString()
      };

      // Generate report if enabled
      if (this.options.generateReports) {
        result.reportPath = this._generatePreflightReport(result);
      }

      this._emitEvent({
        type: 'flow_diagnostic_orchestration',
        flowApiName,
        workflowType: 'preflight',
        outcome: result.success ? 'success' : 'failed',
        duration: Date.now() - startTime,
        modulesInvoked: ['preflight-checker'],
        summary
      });

      this.log(`✓ Pre-flight diagnostic complete`);
      return result;

    } catch (error) {
      this._emitEvent({
        type: 'flow_diagnostic_orchestration',
        flowApiName,
        workflowType: 'preflight',
        outcome: 'error',
        duration: Date.now() - startTime,
        error: error.message
      });

      throw new OrchestrationError(
        `Pre-flight diagnostic failed: ${error.message}`,
        'PREFLIGHT_FAILED',
        { flowApiName, error: error.message }
      );
    }
  }

  /**
   * Run execution diagnostic workflow (execute + capture state + parse logs)
   *
   * @param {string} flowApiName - Flow API name
   * @param {object} testData - Test data configuration
   * @param {string} testData.object - Object API name
   * @param {string} testData.triggerType - 'before-save', 'after-save', 'before-delete', 'after-delete'
   * @param {string} testData.operation - 'insert', 'update', 'delete'
   * @param {object} testData.recordData - Record field values
   * @param {string} [testData.recordId] - Existing record ID (for update/delete)
   * @returns {Promise<ExecutionDiagnosticResult>} Diagnostic result
   *
   * @example
   * const result = await orchestrator.runExecutionDiagnostic('Account_Validation_Flow', {
   *   object: 'Account',
   *   triggerType: 'after-save',
   *   operation: 'insert',
   *   recordData: { Name: 'Test Account', Type: 'Customer' }
   * });
   */
  async runExecutionDiagnostic(flowApiName, testData) {
    const startTime = Date.now();
    const workflowId = `execution_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    this.log(`\n=== Execution Diagnostic Workflow: ${flowApiName} ===`);

    try {
      let beforeSnapshot = null;
      let afterSnapshot = null;
      let stateDiff = null;

      // Step 1: Capture before snapshot (for update/delete operations)
      if (testData.recordId && (testData.operation === 'update' || testData.operation === 'delete')) {
        this.log('Step 1: Capturing before snapshot...');
        beforeSnapshot = await this.snapshot.captureSnapshot(testData.recordId);
      }

      // Step 2: Execute Flow
      this.log('Step 2: Executing Flow...');
      const execution = await this.executor.executeRecordTriggeredFlow(flowApiName, testData);

      // Step 3: Capture after snapshot
      if (execution.createdRecordId || testData.recordId) {
        this.log('Step 3: Capturing after snapshot...');
        const recordIdToSnapshot = execution.createdRecordId || testData.recordId;
        afterSnapshot = await this.snapshot.captureSnapshot(recordIdToSnapshot);

        // Compare snapshots if we have before state
        if (beforeSnapshot) {
          this.log('Step 4: Comparing snapshots...');
          stateDiff = await this.snapshot.compareSnapshots(beforeSnapshot, afterSnapshot);
        }
      }

      // Step 5: Get latest debug log
      this.log('Step 5: Retrieving debug log...');
      const latestLog = await this.logParser.getLatestLog('', {
        filterByType: 'Workflow',
        maxResults: 1
      });

      // Step 6: Parse log
      let parsedLog = null;
      if (latestLog && latestLog.length > 0) {
        this.log('Step 6: Parsing log...');
        parsedLog = await this.logParser.parseLog(latestLog[0].Id);
      }

      // Build summary
      const summary = {
        executionSucceeded: execution.success,
        fieldsChanged: stateDiff ? stateDiff.totalFieldsChanged : 0,
        elementsExecuted: parsedLog ? parsedLog.flowExecutions[0]?.elementsExecuted?.length || 0 : 0,
        errors: parsedLog ? parsedLog.errors.length : 0,
        governorLimitWarnings: []
      };

      // Check governor limits
      if (parsedLog && parsedLog.governorLimits) {
        const limits = parsedLog.governorLimits;
        if (limits.cpuTimeUsed / limits.cpuTimeLimit > 0.8) {
          summary.governorLimitWarnings.push(`CPU time at ${Math.round(limits.cpuTimeUsed / limits.cpuTimeLimit * 100)}%`);
        }
        if (limits.heapSizeUsed / limits.heapSizeLimit > 0.8) {
          summary.governorLimitWarnings.push(`Heap size at ${Math.round(limits.heapSizeUsed / limits.heapSizeLimit * 100)}%`);
        }
      }

      // Generate recommendations
      const recommendations = [];
      if (!execution.success) {
        recommendations.push('Flow execution failed - review error messages');
      }
      if (summary.errors > 0) {
        recommendations.push(`${summary.errors} error(s) found in debug log - investigate root causes`);
      }
      if (summary.governorLimitWarnings.length > 0) {
        recommendations.push('Governor limit usage high - optimize Flow logic');
      }
      if (stateDiff && stateDiff.totalFieldsChanged === 0) {
        recommendations.push('No fields changed - verify Flow logic is executing correctly');
      }

      const result = {
        success: execution.success && summary.errors === 0,
        flowApiName,
        orgAlias: this.orgAlias,
        workflowId,
        execution,
        stateDiff,
        parsedLog,
        summary,
        recommendations,
        timestamp: new Date().toISOString()
      };

      // Generate report if enabled
      if (this.options.generateReports) {
        result.reportPath = this._generateExecutionReport(result);
      }

      this._emitEvent({
        type: 'flow_diagnostic_orchestration',
        flowApiName,
        workflowType: 'execution',
        outcome: result.success ? 'success' : 'failed',
        duration: Date.now() - startTime,
        modulesInvoked: ['executor', 'snapshot', 'log-parser'],
        summary
      });

      this.log(`✓ Execution diagnostic complete`);
      return result;

    } catch (error) {
      this._emitEvent({
        type: 'flow_diagnostic_orchestration',
        flowApiName,
        workflowType: 'execution',
        outcome: 'error',
        duration: Date.now() - startTime,
        error: error.message
      });

      throw new OrchestrationError(
        `Execution diagnostic failed: ${error.message}`,
        'EXECUTION_FAILED',
        { flowApiName, error: error.message }
      );
    }
  }

  /**
   * Run coverage diagnostic workflow (multiple executions + coverage analysis)
   *
   * @param {string} flowApiName - Flow API name
   * @param {Array<object>} testCases - Array of test case configurations
   * @returns {Promise<CoverageDiagnosticResult>} Diagnostic result
   *
   * @example
   * const result = await orchestrator.runCoverageDiagnostic('Account_Validation_Flow', [
   *   { recordData: { Status__c: 'Active' } },
   *   { recordData: { Status__c: 'Inactive' } },
   *   { recordData: { Status__c: 'Error' } }
   * ]);
   */
  async runCoverageDiagnostic(flowApiName, testCases) {
    const startTime = Date.now();
    const workflowId = `coverage_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    this.log(`\n=== Coverage Diagnostic Workflow: ${flowApiName} ===`);

    try {
      const executions = [];
      let passedTests = 0;
      let failedTests = 0;

      // Step 1: Execute all test cases
      this.log(`Step 1: Executing ${testCases.length} test cases...`);

      for (let i = 0; i < testCases.length; i++) {
        const testCase = testCases[i];
        this.log(`  Test ${i + 1}/${testCases.length}...`);

        try {
          const execution = await this.executor.executeRecordTriggeredFlow(flowApiName, testCase);
          executions.push(execution);

          if (execution.success) {
            passedTests++;
          } else {
            failedTests++;
          }
        } catch (error) {
          this.log(`  ✗ Test ${i + 1} failed: ${error.message}`);
          failedTests++;
        }
      }

      // Step 2: Analyze coverage
      this.log('Step 2: Analyzing branch coverage...');
      const coverage = await this.analyzer.analyzeFlowCoverage(flowApiName, executions);

      // Step 3: Generate test plan if coverage < 100%
      let testPlan = null;
      if (coverage.coveragePercentage < 100) {
        this.log('Step 3: Generating test plan for uncovered branches...');
        testPlan = await this.analyzer.generateTestPlan(flowApiName, coverage);
      }

      // Build summary
      const summary = {
        totalTests: testCases.length,
        passedTests,
        failedTests,
        coveragePercentage: coverage.coveragePercentage,
        uncoveredBranches: coverage.uncoveredBranches.length
      };

      // Generate recommendations
      const recommendations = [];
      if (coverage.coveragePercentage < 100) {
        recommendations.push(`Coverage at ${coverage.coveragePercentage.toFixed(1)}% - ${testPlan.estimatedTests} more test(s) needed`);
      } else {
        recommendations.push('Full coverage achieved - all decision branches tested');
      }
      if (failedTests > 0) {
        recommendations.push(`${failedTests} test(s) failed - investigate failures before deployment`);
      }
      if (coverage.uncoveredBranches.length > 0) {
        recommendations.push('Review uncovered branches to ensure all scenarios are tested');
      }

      const result = {
        success: failedTests === 0,
        flowApiName,
        orgAlias: this.orgAlias,
        workflowId,
        executions,
        coverage,
        testPlan,
        summary,
        recommendations,
        timestamp: new Date().toISOString()
      };

      // Generate report if enabled
      if (this.options.generateReports) {
        result.reportPath = this._generateCoverageReport(result);
      }

      this._emitEvent({
        type: 'flow_diagnostic_orchestration',
        flowApiName,
        workflowType: 'coverage',
        outcome: result.success ? 'success' : 'failed',
        duration: Date.now() - startTime,
        modulesInvoked: ['executor', 'branch-analyzer'],
        summary
      });

      this.log(`✓ Coverage diagnostic complete`);
      return result;

    } catch (error) {
      this._emitEvent({
        type: 'flow_diagnostic_orchestration',
        flowApiName,
        workflowType: 'coverage',
        outcome: 'error',
        duration: Date.now() - startTime,
        error: error.message
      });

      throw new OrchestrationError(
        `Coverage diagnostic failed: ${error.message}`,
        'COVERAGE_FAILED',
        { flowApiName, error: error.message }
      );
    }
  }

  /**
   * Run complete diagnostic workflow (preflight + execution + coverage)
   *
   * @param {string} flowApiName - Flow API name
   * @param {object} options - Diagnostic options
   * @param {string} options.object - Object API name
   * @param {string} options.triggerType - Trigger type
   * @param {Array<object>} options.testCases - Test case configurations
   * @returns {Promise<FullDiagnosticResult>} Diagnostic result
   *
   * @example
   * const result = await orchestrator.runFullDiagnostic('Account_Validation_Flow', {
   *   object: 'Account',
   *   triggerType: 'after-save',
   *   testCases: [
   *     { recordData: { Status__c: 'Active' } },
   *     { recordData: { Status__c: 'Inactive' } }
   *   ]
   * });
   */
  async runFullDiagnostic(flowApiName, options) {
    const startTime = Date.now();
    const workflowId = `full_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    this.log(`\n=== Full Diagnostic Workflow: ${flowApiName} ===`);

    try {
      // Phase 1: Pre-flight checks
      this.log('\nPhase 1: Pre-flight checks...');
      const preflight = await this.runPreflightDiagnostic(flowApiName, {
        object: options.object,
        triggerType: options.triggerType
      });

      if (!preflight.canProceed) {
        throw new OrchestrationError(
          'Pre-flight checks failed - cannot proceed',
          'PREFLIGHT_FAILED',
          { preflight }
        );
      }

      // Phase 2: Execution diagnostic (using first test case)
      this.log('\nPhase 2: Execution diagnostic...');
      const execution = await this.runExecutionDiagnostic(flowApiName, {
        object: options.object,
        triggerType: options.triggerType,
        operation: 'insert',
        ...(options.testCases && options.testCases[0])
      });

      // Phase 3: Coverage diagnostic (using all test cases)
      this.log('\nPhase 3: Coverage diagnostic...');
      const coverage = await this.runCoverageDiagnostic(flowApiName, options.testCases || []);

      // Build overall summary
      const criticalIssues = [];
      const warnings = [];

      if (!preflight.success) {
        criticalIssues.push('Pre-flight checks failed');
      }
      if (!execution.success) {
        criticalIssues.push('Flow execution failed');
      }
      if (execution.summary.errors > 0) {
        criticalIssues.push(`${execution.summary.errors} execution error(s) found`);
      }
      if (coverage.summary.failedTests > 0) {
        warnings.push(`${coverage.summary.failedTests} test(s) failed`);
      }
      if (coverage.summary.coveragePercentage < 80) {
        warnings.push(`Coverage below 80% (${coverage.summary.coveragePercentage.toFixed(1)}%)`);
      }

      const canDeploy = criticalIssues.length === 0;
      const readyForProduction = canDeploy && warnings.length === 0 && coverage.summary.coveragePercentage >= 80;

      const overallSummary = {
        canDeploy,
        readyForProduction,
        criticalIssues,
        warnings,
        coveragePercentage: coverage.summary.coveragePercentage
      };

      // Consolidated recommendations
      const recommendations = [];
      if (readyForProduction) {
        recommendations.push('✓ Flow is ready for production deployment');
      } else if (canDeploy) {
        recommendations.push('Flow can be deployed but has warnings');
        warnings.forEach(w => recommendations.push(`  - ${w}`));
      } else {
        recommendations.push('✗ Flow is NOT ready for deployment');
        criticalIssues.forEach(i => recommendations.push(`  - ${i}`));
      }

      const result = {
        success: canDeploy,
        flowApiName,
        orgAlias: this.orgAlias,
        workflowId,
        preflight,
        execution,
        coverage,
        overallSummary,
        recommendations,
        timestamp: new Date().toISOString()
      };

      // Generate consolidated report if enabled
      if (this.options.generateReports) {
        result.reportPath = this.generateConsolidatedReport(result, 'html');
      }

      this._emitEvent({
        type: 'flow_diagnostic_orchestration',
        flowApiName,
        workflowType: 'full_diagnostic',
        outcome: result.success ? 'success' : 'failed',
        duration: Date.now() - startTime,
        modulesInvoked: ['preflight', 'executor', 'log-parser', 'snapshot', 'branch-analyzer'],
        overallSummary
      });

      this.log(`\n✓ Full diagnostic complete`);
      return result;

    } catch (error) {
      this._emitEvent({
        type: 'flow_diagnostic_orchestration',
        flowApiName,
        workflowType: 'full_diagnostic',
        outcome: 'error',
        duration: Date.now() - startTime,
        error: error.message
      });

      throw new OrchestrationError(
        `Full diagnostic failed: ${error.message}`,
        'FULL_DIAGNOSTIC_FAILED',
        { flowApiName, error: error.message }
      );
    }
  }

  /**
   * Generate consolidated report from diagnostic results
   *
   * @param {object} diagnosticResults - Any diagnostic result object
   * @param {string} format - 'html', 'markdown', 'pdf', 'json'
   * @returns {string|Buffer} Formatted report (Buffer for PDF)
   */
  generateConsolidatedReport(diagnosticResults, format = 'markdown') {
    if (format === 'json') {
      return JSON.stringify(diagnosticResults, null, 2);
    }

    if (format === 'markdown') {
      return this._generateMarkdownReport(diagnosticResults);
    }

    if (format === 'html') {
      const markdown = this._generateMarkdownReport(diagnosticResults);
      return this._convertMarkdownToHtml(markdown);
    }

    if (format === 'pdf') {
      throw new OrchestrationError(
        'PDF generation not yet implemented',
        'UNSUPPORTED_FORMAT',
        { format }
      );
    }

    throw new OrchestrationError(
      `Unsupported report format: ${format}`,
      'UNSUPPORTED_FORMAT',
      { format }
    );
  }

  /**
   * Generate markdown report
   * @private
   */
  _generateMarkdownReport(results) {
    let report = `# Flow Diagnostic Report\n\n`;
    report += `**Flow**: ${results.flowApiName}\n`;
    report += `**Org**: ${results.orgAlias}\n`;
    report += `**Workflow**: ${results.workflowId}\n`;
    report += `**Timestamp**: ${results.timestamp}\n\n`;

    if (results.overallSummary) {
      // Full diagnostic
      report += `## Overall Summary\n\n`;
      report += `- **Can Deploy**: ${results.overallSummary.canDeploy ? '✓ Yes' : '✗ No'}\n`;
      report += `- **Production Ready**: ${results.overallSummary.readyForProduction ? '✓ Yes' : '⚠ Not Yet'}\n`;
      report += `- **Coverage**: ${results.overallSummary.coveragePercentage.toFixed(1)}%\n\n`;

      if (results.overallSummary.criticalIssues.length > 0) {
        report += `### Critical Issues\n\n`;
        results.overallSummary.criticalIssues.forEach(issue => {
          report += `- ✗ ${issue}\n`;
        });
        report += `\n`;
      }

      if (results.overallSummary.warnings.length > 0) {
        report += `### Warnings\n\n`;
        results.overallSummary.warnings.forEach(warning => {
          report += `- ⚠ ${warning}\n`;
        });
        report += `\n`;
      }

      report += `## Recommendations\n\n`;
      results.recommendations.forEach(rec => {
        report += `- ${rec}\n`;
      });
      report += `\n`;

      // Add phase summaries
      if (results.preflight) {
        report += `## Pre-Flight Checks\n\n`;
        report += `- **Status**: ${results.preflight.success ? '✓ Passed' : '✗ Failed'}\n`;
        report += `- **Checks Passed**: ${results.preflight.summary.passed}/${results.preflight.summary.totalChecks}\n`;
        report += `- **Warnings**: ${results.preflight.summary.warnings}\n\n`;
      }

      if (results.execution) {
        report += `## Execution Diagnostic\n\n`;
        report += `- **Status**: ${results.execution.success ? '✓ Success' : '✗ Failed'}\n`;
        report += `- **Fields Changed**: ${results.execution.summary.fieldsChanged}\n`;
        report += `- **Elements Executed**: ${results.execution.summary.elementsExecuted}\n`;
        report += `- **Errors**: ${results.execution.summary.errors}\n\n`;
      }

      if (results.coverage) {
        report += `## Coverage Analysis\n\n`;
        report += `- **Total Tests**: ${results.coverage.summary.totalTests}\n`;
        report += `- **Passed**: ${results.coverage.summary.passedTests}\n`;
        report += `- **Failed**: ${results.coverage.summary.failedTests}\n`;
        report += `- **Coverage**: ${results.coverage.summary.coveragePercentage.toFixed(1)}%\n`;
        report += `- **Uncovered Branches**: ${results.coverage.summary.uncoveredBranches}\n\n`;
      }

    } else {
      // Single diagnostic type
      report += `## Summary\n\n`;
      report += `- **Status**: ${results.success ? '✓ Success' : '✗ Failed'}\n\n`;

      if (results.summary) {
        Object.entries(results.summary).forEach(([key, value]) => {
          const label = key.replace(/([A-Z])/g, ' $1').trim();
          report += `- **${label}**: ${value}\n`;
        });
        report += `\n`;
      }

      report += `## Recommendations\n\n`;
      results.recommendations.forEach(rec => {
        report += `- ${rec}\n`;
      });
      report += `\n`;
    }

    return report;
  }

  /**
   * Convert markdown to HTML
   * @private
   */
  _convertMarkdownToHtml(markdown) {
    // Simple markdown to HTML conversion
    let html = '<html><head><style>';
    html += 'body { font-family: Arial, sans-serif; max-width: 900px; margin: 0 auto; padding: 20px; }';
    html += 'h1 { color: #1a73e8; border-bottom: 2px solid #1a73e8; }';
    html += 'h2 { color: #34a853; margin-top: 30px; }';
    html += 'h3 { color: #ea4335; }';
    html += 'code { background: #f5f5f5; padding: 2px 5px; border-radius: 3px; }';
    html += 'ul { line-height: 1.8; }';
    html += '</style></head><body>';

    // Convert markdown syntax to HTML
    html += markdown
      .replace(/### (.*)/g, '<h3>$1</h3>')
      .replace(/## (.*)/g, '<h2>$1</h2>')
      .replace(/# (.*)/g, '<h1>$1</h1>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/- (.*)/g, '<li>$1</li>')
      .replace(/\n\n/g, '</ul><p>')
      .replace(/<li>/g, '<ul><li>')
      .replace(/✓/g, '<span style="color: #34a853;">✓</span>')
      .replace(/✗/g, '<span style="color: #ea4335;">✗</span>')
      .replace(/⚠/g, '<span style="color: #fbbc04;">⚠</span>');

    html += '</body></html>';
    return html;
  }

  /**
   * Generate preflight report file
   * @private
   */
  _generatePreflightReport(result) {
    // Implementation would write to file system
    return `${os.tmpdir()}/flow-preflight-${result.flowApiName}-${Date.now()}.html`;
  }

  /**
   * Generate execution report file
   * @private
   */
  _generateExecutionReport(result) {
    return `${os.tmpdir()}/flow-execution-${result.flowApiName}-${Date.now()}.html`;
  }

  /**
   * Generate coverage report file
   * @private
   */
  _generateCoverageReport(result) {
    return `${os.tmpdir()}/flow-coverage-${result.flowApiName}-${Date.now()}.html`;
  }
}

// Export classes
module.exports = {
  FlowDiagnosticOrchestrator,
  OrchestrationError
};

// CLI entry point
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length < 3) {
    console.error('Usage: flow-diagnostic-orchestrator.js <org-alias> <workflow-type> <flow-api-name> [options-json]');
    console.error('Workflow types: preflight, execution, coverage, full');
    process.exit(1);
  }

  const orgAlias = args[0];
  const workflowType = args[1];
  const flowApiName = args[2];
  const options = args[3] ? JSON.parse(args[3]) : {};

  const orchestrator = new FlowDiagnosticOrchestrator(orgAlias, { verbose: true });

  (async () => {
    try {
      let result;

      switch (workflowType) {
        case 'preflight':
          result = await orchestrator.runPreflightDiagnostic(flowApiName, options);
          break;
        case 'execution':
          result = await orchestrator.runExecutionDiagnostic(flowApiName, options);
          break;
        case 'coverage':
          result = await orchestrator.runCoverageDiagnostic(flowApiName, options.testCases || []);
          break;
        case 'full':
          result = await orchestrator.runFullDiagnostic(flowApiName, options);
          break;
        default:
          console.error('Invalid workflow type:', workflowType);
          process.exit(1);
      }

      console.log(JSON.stringify(result, null, 2));
      process.exit(result.success ? 0 : 1);

    } catch (error) {
      console.error('Orchestration failed:', error.message);
      if (error.details) {
        console.error('Details:', JSON.stringify(error.details, null, 2));
      }
      process.exit(1);
    }
  })();
}
