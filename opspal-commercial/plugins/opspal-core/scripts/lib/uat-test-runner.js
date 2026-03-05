#!/usr/bin/env node

/**
 * UAT Test Runner
 *
 * Main orchestrator for UAT test execution with:
 * - Test suite management and filtering
 * - Progress tracking and real-time output
 * - Result aggregation and summary generation
 * - Cleanup of created test records
 *
 * @module uat-test-runner
 * @version 1.0.0
 *
 * @example
 * const { UATTestRunner } = require('./uat-test-runner');
 *
 * const runner = new UATTestRunner({
 *   platform: 'salesforce',
 *   orgAlias: 'my-sandbox',
 *   verbose: true
 * });
 *
 * const results = await runner.runFromCSV('/path/to/test-cases.csv');
 * console.log(results.summary);
 */

const UATCSVParser = require('./uat-csv-parser');
const { UATPlatformAdapter } = require('./uat-platform-adapter');
const { UATStepExecutor, StepStatus } = require('./uat-step-executor');
const { UATInputValidator } = require('./uat-input-validator');
const { UATPreflightValidator } = require('./uat-preflight-validator');
const { UATExecutionLedger } = require('./uat-execution-ledger');
const { UATValidationError, UATPreflightError, wrapError } = require('./uat-errors');

/**
 * Test suite execution status
 */
const SuiteStatus = {
  PENDING: 'pending',
  RUNNING: 'running',
  PASSED: 'passed',
  FAILED: 'failed',
  PARTIAL: 'partial',
  SKIPPED: 'skipped'
};

/**
 * UAT Test Runner - Main orchestrator
 */
class UATTestRunner {
  /**
   * Create a test runner
   * @param {Object} options - Runner configuration
   * @param {string} options.platform - Platform name ('salesforce', 'hubspot')
   * @param {string} [options.orgAlias] - Salesforce org alias
   * @param {string} [options.portalId] - HubSpot portal ID
   * @param {boolean} [options.verbose=false] - Enable verbose logging
   * @param {boolean} [options.dryRun=false] - Dry run mode (no actual operations)
   * @param {boolean} [options.stopOnFailure=false] - Stop suite on first failure
   * @param {boolean} [options.cleanup=true] - Clean up created records after test
   * @param {boolean} [options.preflight=true] - Run pre-flight validation
   * @param {boolean} [options.enableLedger=true] - Enable crash recovery ledger
   * @param {string} [options.sessionId] - Resume from existing session ID
   * @param {Function} [options.onProgress] - Progress callback (percent, message)
   */
  constructor(options = {}) {
    this.platform = options.platform || 'salesforce';
    this.verbose = options.verbose || false;
    this.dryRun = options.dryRun || false;
    this.stopOnFailure = options.stopOnFailure || false;
    this.cleanup = options.cleanup !== false;
    this.preflight = options.preflight !== false;
    this.enableLedger = options.enableLedger !== false;
    this.sessionId = options.sessionId || null;
    this.onProgress = options.onProgress || null;

    // Platform configuration
    this.platformConfig = {
      orgAlias: options.orgAlias,
      portalId: options.portalId,
      verbose: this.verbose,
      dryRun: this.dryRun
    };

    // Initialize components
    this.parser = new UATCSVParser({ verbose: this.verbose });
    this.validator = new UATInputValidator({ verbose: this.verbose });
    this.adapter = null;
    this.executor = null;
    this.ledger = null;

    // Execution state
    this.testCases = [];
    this.results = [];
    this.startTime = null;
    this.endTime = null;
  }

  /**
   * Initialize the test runner
   * @returns {Promise<void>}
   */
  async initialize() {
    this.log('Initializing UAT Test Runner...');

    // Create platform adapter
    this.adapter = new UATPlatformAdapter(this.platform, this.platformConfig);

    // Create step executor
    this.executor = new UATStepExecutor(this.adapter, {
      verbose: this.verbose,
      stopOnFailure: this.stopOnFailure,
      collectEvidence: true
    });

    this.log(`  Platform: ${this.platform}`);
    this.log(`  Dry Run: ${this.dryRun}`);
    this.log(`  Stop on Failure: ${this.stopOnFailure}`);
    this.log('  Runner initialized');
  }

  /**
   * Run tests from a CSV file
   * @param {string} csvPath - Path to CSV file
   * @param {Object} [filters] - Test case filters
   * @param {string} [filters.epic] - Filter by epic name
   * @param {string} [filters.scenario] - Filter by scenario pattern
   * @param {Object} [testData] - Additional test data to inject
   * @returns {Promise<Object>} Test execution results
   */
  async runFromCSV(csvPath, filters = {}, testData = {}) {
    this.startTime = Date.now();

    try {
      // ============================================
      // PHASE 1: INPUT VALIDATION (fail fast)
      // ============================================
      this.log('\n─ Input Validation ─');

      const validationResult = this.validator.validateAll({
        csvPath,
        platform: this.platform,
        config: this.platformConfig,
        testData,
        filters
      });

      if (!validationResult.valid) {
        const error = new UATValidationError('Input validation failed', {
          errors: validationResult.errors,
          warnings: validationResult.warnings,
          suggestions: validationResult.suggestions
        });
        this.log(error.toDisplayString());
        return this.createValidationErrorResult(error);
      }

      // Log warnings even if valid
      for (const warning of validationResult.warnings) {
        this.log(`  ⚠ ${warning}`);
      }
      this.log('  ✓ Validation passed');

      // ============================================
      // PHASE 2: INITIALIZATION
      // ============================================
      if (!this.adapter) {
        await this.initialize();
      }

      // ============================================
      // PHASE 3: PRE-FLIGHT CHECKS (if enabled)
      // ============================================
      if (this.preflight && !this.dryRun) {
        this.log('\n─ Pre-flight Checks ─');

        const preflightValidator = new UATPreflightValidator({
          platform: this.platform,
          orgAlias: this.platformConfig.orgAlias,
          portalId: this.platformConfig.portalId,
          verbose: this.verbose
        });

        const preflightResult = await preflightValidator.runAllChecks();

        if (!preflightResult.passed) {
          const error = new UATPreflightError('Pre-flight validation failed', {
            blockers: preflightResult.blockers,
            checks: preflightResult.checks,
            suggestions: preflightResult.checks
              .filter(c => !c.passed && c.suggestion)
              .map(c => c.suggestion)
          });
          this.log(preflightValidator.formatReport(preflightResult));
          return this.createPreflightErrorResult(error);
        }

        this.log('  ✓ Pre-flight passed');
      }

      // ============================================
      // PHASE 4: LEDGER INITIALIZATION (crash recovery)
      // ============================================
      if (this.enableLedger) {
        if (this.sessionId) {
          // Resume existing session
          this.ledger = UATExecutionLedger.load(this.sessionId);
          if (this.ledger && this.ledger.isResumable()) {
            this.log(`\n─ Resuming Session: ${this.sessionId} ─`);
            this.log(`  Completed steps: ${this.ledger.getCompletedSteps().length}`);
          } else {
            this.ledger = new UATExecutionLedger(this.sessionId);
          }
        } else {
          this.ledger = new UATExecutionLedger();
          this.log(`\n─ Session: ${this.ledger.sessionId} ─`);
        }
      }

      // ============================================
      // PHASE 5: PARSE & FILTER TEST CASES
      // ============================================
      this.log(`\nLoading test cases from: ${csvPath}`);
      const parseResult = this.parser.parseFile(csvPath);

      if (!parseResult.success) {
        return this.createErrorResult(`Failed to parse CSV: ${parseResult.errors.join(', ')}`);
      }

      this.testCases = parseResult.testCases;
      this.log(`  Found ${this.testCases.length} test case(s)`);

      // Apply filters
      const filteredCases = this.filterTestCases(this.testCases, filters);
      this.log(`  After filters: ${filteredCases.length} test case(s)`);

      if (filteredCases.length === 0) {
        return this.createErrorResult('No test cases match the specified filters');
      }

      // Initialize ledger with test metadata
      if (this.ledger) {
        this.ledger.initialize({
          csvPath,
          platform: this.platform,
          orgAlias: this.platformConfig.orgAlias,
          totalTests: filteredCases.length,
          totalSteps: filteredCases.reduce((sum, tc) => sum + (tc.steps?.length || 0), 0),
          filters
        });
      }

      // ============================================
      // PHASE 6: EXECUTE TEST CASES
      // ============================================
      return await this.runTestCases(filteredCases, testData);

    } catch (error) {
      const wrappedError = wrapError(error, { platform: this.platform });
      return this.createErrorResult(wrappedError.message, wrappedError);
    }
  }

  /**
   * Run parsed test cases
   * @param {Array} testCases - Array of test case objects
   * @param {Object} [testData] - Additional test data to inject
   * @returns {Promise<Object>} Test execution results
   */
  async runTestCases(testCases, testData = {}) {
    this.log('\n' + '='.repeat(60));
    this.log('UAT TEST EXECUTION');
    this.log('='.repeat(60));

    const totalCases = testCases.length;
    let completedCases = 0;
    let passedCases = 0;
    let failedCases = 0;

    // Restore context from ledger if resuming
    if (this.ledger) {
      const savedContext = this.ledger.getContext();
      if (Object.keys(savedContext).length > 0 && this.executor) {
        for (const [key, value] of Object.entries(savedContext)) {
          this.executor.setContext(key, value);
        }
        this.log(`  Restored ${Object.keys(savedContext).length} context variable(s)`);
      }
    }

    for (let testIndex = 0; testIndex < testCases.length; testIndex++) {
      const testCase = testCases[testIndex];

      // Report progress
      this.reportProgress(
        Math.round((completedCases / totalCases) * 100),
        `Running: ${testCase.epic || 'Test Case'} - ${testCase.userStory || testCase.scenario}`
      );

      const caseResult = await this.runTestCase(testCase, testData, testIndex);
      this.results.push(caseResult);

      completedCases++;

      if (caseResult.status === SuiteStatus.PASSED) {
        passedCases++;
      } else if (caseResult.status === SuiteStatus.FAILED) {
        failedCases++;

        // Record error in ledger
        if (this.ledger) {
          const failedStep = caseResult.steps?.find(s => s.status === StepStatus.FAILED);
          this.ledger.recordError({
            testIndex,
            stepNumber: failedStep?.stepNumber,
            message: failedStep?.error || 'Test case failed'
          });
        }

        if (this.stopOnFailure) {
          this.log('\n[STOPPED] Stop on failure triggered');
          break;
        }
      }
    }

    // Cleanup created records
    if (this.cleanup && !this.dryRun) {
      await this.cleanupRecords();
    }

    this.endTime = Date.now();

    // Mark ledger as complete
    if (this.ledger) {
      if (failedCases === 0) {
        this.ledger.markComplete();
      } else {
        this.ledger.markFailed(`${failedCases} test case(s) failed`);
      }
    }

    // Generate summary
    return this.generateSummary();
  }

  /**
   * Run a single test case
   * @param {Object} testCase - Test case definition
   * @param {Object} [testData] - Additional test data
   * @param {number} [testIndex=0] - Index of test case (for ledger tracking)
   * @returns {Promise<Object>} Test case result
   */
  async runTestCase(testCase, testData = {}, testIndex = 0) {
    const caseResult = {
      epic: testCase.epic,
      userStory: testCase.userStory,
      scenario: testCase.scenario,
      status: SuiteStatus.PENDING,
      steps: [],
      startTime: Date.now(),
      endTime: null,
      duration: 0
    };

    this.log(`\n${'─'.repeat(50)}`);
    this.log(`Epic: ${testCase.epic || 'N/A'}`);
    this.log(`User Story: ${testCase.userStory || 'N/A'}`);
    this.log(`Scenario: ${testCase.scenario || 'N/A'}`);
    this.log(`Steps: ${testCase.steps?.length || 0}`);
    this.log('─'.repeat(50));

    // Clear executor context for new test case (unless resuming)
    if (!this.sessionId) {
      this.executor.clearContext();
    }

    // Merge test case data with provided test data
    const mergedTestData = {
      ...testCase.testData,
      ...testData
    };

    caseResult.status = SuiteStatus.RUNNING;

    // Execute each step
    const steps = testCase.steps || [];
    let hasFailure = false;
    let hasManual = false;

    for (const step of steps) {
      // Skip if already completed (crash recovery)
      if (this.ledger && this.ledger.isStepComplete(testIndex, step.stepNumber)) {
        this.log(`    ○ Step ${step.stepNumber}: SKIPPED (already complete)`);
        continue;
      }

      try {
        const stepResult = await this.executor.executeStep(step, mergedTestData);
        caseResult.steps.push(stepResult);

        // Record step completion in ledger
        if (this.ledger) {
          this.ledger.recordStepComplete(testIndex, step.stepNumber, {
            status: stepResult.status,
            duration: stepResult.duration
          });

          // Track created records for cleanup
          if (stepResult.result?.id && step.action === 'create') {
            this.ledger.recordCreatedRecord(
              step.object,
              stepResult.result.id,
              { testIndex, stepNumber: step.stepNumber }
            );
          }

          // Save executor context to ledger
          this.ledger.setContext(this.executor.getContext());
        }

        if (stepResult.status === StepStatus.FAILED) {
          hasFailure = true;
          if (this.stopOnFailure) {
            break;
          }
        } else if (stepResult.status === StepStatus.MANUAL) {
          hasManual = true;
        }
      } catch (error) {
        const wrappedError = wrapError(error, {
          stepNumber: step.stepNumber,
          action: step.action,
          object: step.object,
          platform: this.platform
        });

        caseResult.steps.push({
          stepNumber: step.stepNumber,
          raw: step.raw,
          status: StepStatus.FAILED,
          error: wrappedError.message,
          suggestions: wrappedError.suggestions
        });
        hasFailure = true;
        if (this.stopOnFailure) {
          break;
        }
      }
    }

    // Determine final status
    if (hasFailure) {
      caseResult.status = SuiteStatus.FAILED;
    } else if (hasManual) {
      caseResult.status = SuiteStatus.PARTIAL;
    } else {
      caseResult.status = SuiteStatus.PASSED;
    }

    caseResult.endTime = Date.now();
    caseResult.duration = caseResult.endTime - caseResult.startTime;

    // Log result
    const icon = caseResult.status === SuiteStatus.PASSED ? '✓' :
                 caseResult.status === SuiteStatus.FAILED ? '✗' :
                 caseResult.status === SuiteStatus.PARTIAL ? '◐' : '○';

    this.log(`\nResult: ${icon} ${caseResult.status.toUpperCase()} (${caseResult.duration}ms)`);

    return caseResult;
  }

  /**
   * Filter test cases
   * @param {Array} testCases - All test cases
   * @param {Object} filters - Filter criteria
   * @returns {Array} Filtered test cases
   */
  filterTestCases(testCases, filters) {
    let filtered = [...testCases];

    // Filter by epic
    if (filters.epic) {
      const epicPattern = filters.epic.toLowerCase();
      filtered = filtered.filter(tc =>
        (tc.epic || '').toLowerCase().includes(epicPattern)
      );
    }

    // Filter by scenario
    if (filters.scenario) {
      const scenarioPattern = filters.scenario.toLowerCase();
      filtered = filtered.filter(tc =>
        (tc.scenario || '').toLowerCase().includes(scenarioPattern)
      );
    }

    // Filter by user story
    if (filters.userStory) {
      const storyPattern = filters.userStory.toLowerCase();
      filtered = filtered.filter(tc =>
        (tc.userStory || '').toLowerCase().includes(storyPattern)
      );
    }

    return filtered;
  }

  /**
   * Cleanup created records
   */
  async cleanupRecords() {
    const createdRecords = this.executor.getCreatedRecords();

    if (createdRecords.length === 0) {
      return;
    }

    this.log('\n' + '─'.repeat(50));
    this.log('CLEANUP');
    this.log('─'.repeat(50));
    this.log(`Cleaning up ${createdRecords.length} record(s)...`);

    const cleanupResult = await this.adapter.cleanup(createdRecords);

    if (cleanupResult.success) {
      this.log('  ✓ Cleanup complete');
    } else {
      this.log('  ⚠ Cleanup partial - some records may remain');
      for (const result of cleanupResult.results) {
        if (!result.success) {
          this.log(`    - Failed: ${result.objectType} ${result.id}: ${result.error}`);
        }
      }
    }
  }

  /**
   * Generate execution summary
   * @returns {Object} Summary object
   */
  generateSummary() {
    const totalCases = this.results.length;
    const passedCases = this.results.filter(r => r.status === SuiteStatus.PASSED).length;
    const failedCases = this.results.filter(r => r.status === SuiteStatus.FAILED).length;
    const partialCases = this.results.filter(r => r.status === SuiteStatus.PARTIAL).length;
    const skippedCases = this.results.filter(r => r.status === SuiteStatus.SKIPPED).length;

    const totalSteps = this.results.reduce((sum, r) => sum + (r.steps?.length || 0), 0);
    const passedSteps = this.results.reduce((sum, r) =>
      sum + (r.steps?.filter(s => s.status === StepStatus.PASSED).length || 0), 0);
    const failedSteps = this.results.reduce((sum, r) =>
      sum + (r.steps?.filter(s => s.status === StepStatus.FAILED).length || 0), 0);
    const manualSteps = this.results.reduce((sum, r) =>
      sum + (r.steps?.filter(s => s.status === StepStatus.MANUAL).length || 0), 0);

    const duration = this.endTime - this.startTime;
    const passRate = totalCases > 0 ? Math.round((passedCases / totalCases) * 100) : 0;

    const summary = {
      success: failedCases === 0,
      platform: this.platform,
      dryRun: this.dryRun,
      execution: {
        startTime: new Date(this.startTime).toISOString(),
        endTime: new Date(this.endTime).toISOString(),
        duration,
        durationFormatted: this.formatDuration(duration)
      },
      testCases: {
        total: totalCases,
        passed: passedCases,
        failed: failedCases,
        partial: partialCases,
        skipped: skippedCases,
        passRate
      },
      steps: {
        total: totalSteps,
        passed: passedSteps,
        failed: failedSteps,
        manual: manualSteps
      },
      results: this.results,
      evidence: this.executor.getEvidence(),
      createdRecords: this.executor.getCreatedRecords()
    };

    // Print summary
    this.log('\n' + '='.repeat(60));
    this.log('TEST EXECUTION SUMMARY');
    this.log('='.repeat(60));
    this.log(`Platform: ${this.platform}`);
    this.log(`Duration: ${summary.execution.durationFormatted}`);
    this.log('');
    this.log('Test Cases:');
    this.log(`  Total:   ${totalCases}`);
    this.log(`  Passed:  ${passedCases} ✓`);
    this.log(`  Failed:  ${failedCases} ${failedCases > 0 ? '✗' : ''}`);
    this.log(`  Partial: ${partialCases} ${partialCases > 0 ? '◐' : ''}`);
    this.log(`  Skipped: ${skippedCases}`);
    this.log(`  Pass Rate: ${passRate}%`);
    this.log('');
    this.log('Steps:');
    this.log(`  Total:   ${totalSteps}`);
    this.log(`  Passed:  ${passedSteps}`);
    this.log(`  Failed:  ${failedSteps}`);
    this.log(`  Manual:  ${manualSteps}`);
    this.log('='.repeat(60));

    if (failedCases > 0) {
      this.log('\nFailed Test Cases:');
      for (const result of this.results.filter(r => r.status === SuiteStatus.FAILED)) {
        this.log(`  ✗ ${result.scenario || result.userStory}`);
        const failedStep = result.steps?.find(s => s.status === StepStatus.FAILED);
        if (failedStep) {
          this.log(`    Step ${failedStep.stepNumber}: ${failedStep.error || failedStep.raw}`);
        }
      }
    }

    return summary;
  }

  /**
   * Report progress
   * @param {number} percent - Progress percentage (0-100)
   * @param {string} message - Progress message
   */
  reportProgress(percent, message) {
    if (this.onProgress) {
      this.onProgress(percent, message);
    }
  }

  /**
   * Format duration in human-readable format
   * @param {number} ms - Duration in milliseconds
   * @returns {string} Formatted duration
   */
  formatDuration(ms) {
    if (ms < 1000) {
      return `${ms}ms`;
    } else if (ms < 60000) {
      return `${(ms / 1000).toFixed(1)}s`;
    } else {
      const minutes = Math.floor(ms / 60000);
      const seconds = Math.round((ms % 60000) / 1000);
      return `${minutes}m ${seconds}s`;
    }
  }

  /**
   * Calculate pass rate as percentage
   * @param {number} passed - Number of passed items
   * @param {number} total - Total number of items
   * @returns {number} Pass rate as integer percentage (0-100)
   */
  calculatePassRate(passed, total) {
    if (total === 0) return 0;
    return Math.round((passed / total) * 100);
  }

  /**
   * Create error result
   * @param {string} message - Error message
   * @param {Object} [errorObject] - Optional UATError object with additional context
   * @returns {Object} Error result object
   */
  createErrorResult(message, errorObject = null) {
    this.endTime = Date.now();

    // Mark ledger as failed if enabled
    if (this.ledger) {
      this.ledger.markFailed(message);
    }

    const result = {
      success: false,
      error: message,
      platform: this.platform,
      execution: {
        startTime: this.startTime ? new Date(this.startTime).toISOString() : null,
        endTime: new Date(this.endTime).toISOString(),
        duration: this.startTime ? this.endTime - this.startTime : 0
      },
      testCases: {
        total: 0,
        passed: 0,
        failed: 0,
        partial: 0,
        skipped: 0,
        passRate: 0
      },
      steps: {
        total: 0,
        passed: 0,
        failed: 0,
        manual: 0
      },
      results: []
    };

    // Add structured error details if available
    if (errorObject) {
      result.errorDetails = errorObject.toJSON ? errorObject.toJSON() : errorObject;
      result.suggestions = errorObject.suggestions || [];
    }

    return result;
  }

  /**
   * Create validation error result
   * @param {UATValidationError} error - Validation error
   * @returns {Object} Error result object
   */
  createValidationErrorResult(error) {
    const result = this.createErrorResult(error.message, error);
    result.errorType = 'validation';
    result.validationErrors = error.errors || [];
    result.validationWarnings = error.warnings || [];
    return result;
  }

  /**
   * Create pre-flight error result
   * @param {UATPreflightError} error - Pre-flight error
   * @returns {Object} Error result object
   */
  createPreflightErrorResult(error) {
    const result = this.createErrorResult(error.message, error);
    result.errorType = 'preflight';
    result.blockers = error.blockers || [];
    result.preflightChecks = error.checks || [];
    return result;
  }

  /**
   * Logging helper
   */
  log(message) {
    if (this.verbose) {
      console.log(message);
    }
  }

  /**
   * Get execution context
   * @returns {Object} Current context
   */
  getContext() {
    return this.executor ? this.executor.getContext() : {};
  }

  /**
   * Get current session ID
   * @returns {string|null} Session ID or null
   */
  getSessionId() {
    return this.ledger ? this.ledger.sessionId : null;
  }

  /**
   * Get ledger summary (for crash recovery info)
   * @returns {Object|null} Ledger summary or null
   */
  getLedgerSummary() {
    return this.ledger ? this.ledger.getSummary() : null;
  }

  // ============================================
  // STATIC METHODS
  // ============================================

  /**
   * Find resumable sessions
   * @param {string} [outputDir='.uat-sessions'] - Sessions directory
   * @returns {Array<Object>} Resumable session summaries
   */
  static findResumableSessions(outputDir = '.uat-sessions') {
    return UATExecutionLedger.findResumable(outputDir);
  }

  /**
   * Clean up old session ledgers
   * @param {string} [outputDir='.uat-sessions'] - Sessions directory
   * @param {number} [maxAgeDays=7] - Max age in days
   * @returns {number} Number of files deleted
   */
  static cleanupOldSessions(outputDir = '.uat-sessions', maxAgeDays = 7) {
    return UATExecutionLedger.cleanup(outputDir, maxAgeDays);
  }
}

module.exports = {
  UATTestRunner,
  SuiteStatus
};
