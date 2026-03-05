#!/usr/bin/env node

/**
 * UAT Execution Ledger
 *
 * Execution ledger for crash recovery with:
 * - Step completion tracking
 * - Context persistence
 * - Session resumption
 * - Created records tracking for cleanup
 *
 * Pattern adopted from: Wire Test Framework's ledger-based idempotency
 *
 * @module uat-execution-ledger
 * @version 1.0.0
 *
 * @example
 * const { UATExecutionLedger } = require('./uat-execution-ledger');
 *
 * // Create new ledger or resume existing
 * const ledger = new UATExecutionLedger('session-123');
 *
 * // Record step completion
 * ledger.recordStepComplete(0, 1, { status: 'passed' });
 *
 * // Check if step already done (for resumption)
 * if (!ledger.isStepComplete(0, 1)) {
 *   // Execute step
 * }
 *
 * // Find resumable sessions
 * const sessions = UATExecutionLedger.findResumable();
 */

const fs = require('fs');
const path = require('path');

/**
 * Ledger status values
 */
const LedgerStatus = {
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  FAILED: 'failed',
  ABANDONED: 'abandoned'
};

/**
 * UAT Execution Ledger
 */
class UATExecutionLedger {
  /**
   * Create an execution ledger
   * @param {string} [sessionId] - Session ID (generated if not provided)
   * @param {string} [outputDir='.uat-sessions'] - Directory for ledger files
   */
  constructor(sessionId, outputDir = '.uat-sessions') {
    this.sessionId = sessionId || this.generateSessionId();
    this.outputDir = outputDir;
    this.ledgerPath = path.join(outputDir, `${this.sessionId}.ledger.json`);
    this.ledger = this.load();
  }

  /**
   * Generate a unique session ID
   * @returns {string} Session ID
   */
  generateSessionId() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `uat-${timestamp}-${random}`;
  }

  /**
   * Load ledger from disk or create new
   * @returns {Object} Ledger data
   */
  load() {
    if (fs.existsSync(this.ledgerPath)) {
      try {
        const data = fs.readFileSync(this.ledgerPath, 'utf8');
        const ledger = JSON.parse(data);
        this.log(`Loaded existing ledger: ${this.sessionId}`);
        return ledger;
      } catch (error) {
        this.log(`Failed to load ledger, creating new: ${error.message}`);
      }
    }

    return this.createNew();
  }

  /**
   * Create a new ledger
   * @returns {Object} New ledger data
   */
  createNew() {
    return {
      sessionId: this.sessionId,
      version: '1.0.0',
      startedAt: new Date().toISOString(),
      status: LedgerStatus.IN_PROGRESS,
      csvPath: null,
      platform: null,
      orgAlias: null,
      completedSteps: [],
      context: {},
      createdRecords: [],
      errors: [],
      metadata: {}
    };
  }

  /**
   * Save ledger to disk
   */
  save() {
    try {
      fs.mkdirSync(this.outputDir, { recursive: true });
      fs.writeFileSync(this.ledgerPath, JSON.stringify(this.ledger, null, 2));
    } catch (error) {
      console.error(`Failed to save ledger: ${error.message}`);
    }
  }

  /**
   * Initialize ledger with test run metadata
   * @param {Object} metadata - Test run metadata
   * @param {string} metadata.csvPath - Path to CSV file
   * @param {string} metadata.platform - Platform name
   * @param {string} [metadata.orgAlias] - Org alias
   * @param {number} [metadata.totalTests] - Total number of tests
   * @param {number} [metadata.totalSteps] - Total number of steps
   */
  initialize(metadata) {
    this.ledger.csvPath = metadata.csvPath;
    this.ledger.platform = metadata.platform;
    this.ledger.orgAlias = metadata.orgAlias;
    this.ledger.metadata = {
      ...this.ledger.metadata,
      totalTests: metadata.totalTests,
      totalSteps: metadata.totalSteps,
      filters: metadata.filters
    };
    this.save();
  }

  /**
   * Record a step as complete
   * @param {number} testIndex - Test case index
   * @param {number} stepNumber - Step number within test
   * @param {Object} result - Step result
   */
  recordStepComplete(testIndex, stepNumber, result) {
    const stepKey = `${testIndex}.${stepNumber}`;

    // Don't record duplicate completions
    if (this.isStepComplete(testIndex, stepNumber)) {
      return;
    }

    this.ledger.completedSteps.push({
      testIndex,
      stepNumber,
      key: stepKey,
      completedAt: new Date().toISOString(),
      status: result.status || 'unknown',
      duration: result.duration
    });

    this.ledger.lastCompletedStep = {
      testIndex,
      stepNumber,
      timestamp: new Date().toISOString()
    };

    this.save();
  }

  /**
   * Record a created record for cleanup tracking
   * @param {string} objectType - Salesforce object type
   * @param {string} recordId - Record ID
   * @param {Object} [metadata] - Additional metadata
   */
  recordCreatedRecord(objectType, recordId, metadata = {}) {
    this.ledger.createdRecords.push({
      objectType,
      recordId,
      createdAt: new Date().toISOString(),
      ...metadata
    });
    this.save();
  }

  /**
   * Update execution context
   * @param {string} key - Context key
   * @param {*} value - Context value
   */
  updateContext(key, value) {
    this.ledger.context[key] = value;
    this.save();
  }

  /**
   * Set multiple context values
   * @param {Object} contextObj - Context object to merge
   */
  setContext(contextObj) {
    this.ledger.context = {
      ...this.ledger.context,
      ...contextObj
    };
    this.save();
  }

  /**
   * Get current context
   * @returns {Object} Current context
   */
  getContext() {
    return { ...this.ledger.context };
  }

  /**
   * Check if a step is already complete
   * @param {number} testIndex - Test case index
   * @param {number} stepNumber - Step number
   * @returns {boolean} True if step is complete
   */
  isStepComplete(testIndex, stepNumber) {
    const stepKey = `${testIndex}.${stepNumber}`;
    return this.ledger.completedSteps.some(s => s.key === stepKey);
  }

  /**
   * Get all completed steps
   * @returns {Array} Completed steps
   */
  getCompletedSteps() {
    return [...this.ledger.completedSteps];
  }

  /**
   * Get the next step to execute
   * @param {Array<Object>} testCases - All test cases
   * @returns {Object|null} Next step info or null if all complete
   */
  getNextStep(testCases) {
    for (let testIndex = 0; testIndex < testCases.length; testIndex++) {
      const testCase = testCases[testIndex];
      const steps = testCase.steps || [];

      for (const step of steps) {
        if (!this.isStepComplete(testIndex, step.stepNumber)) {
          return {
            testIndex,
            testCase,
            step,
            stepNumber: step.stepNumber
          };
        }
      }
    }
    return null;
  }

  /**
   * Get records created during this session (for cleanup)
   * @returns {Array} Created records
   */
  getRecordsForCleanup() {
    return [...this.ledger.createdRecords];
  }

  /**
   * Record an error
   * @param {Object} error - Error information
   * @param {number} [error.testIndex] - Test case index
   * @param {number} [error.stepNumber] - Step number
   * @param {string} error.message - Error message
   */
  recordError(error) {
    this.ledger.errors.push({
      ...error,
      recordedAt: new Date().toISOString()
    });
    this.save();
  }

  /**
   * Mark ledger as complete
   */
  markComplete() {
    this.ledger.status = LedgerStatus.COMPLETED;
    this.ledger.completedAt = new Date().toISOString();
    this.ledger.duration = new Date(this.ledger.completedAt) - new Date(this.ledger.startedAt);
    this.save();
  }

  /**
   * Mark ledger as failed
   * @param {string} [reason] - Failure reason
   */
  markFailed(reason) {
    this.ledger.status = LedgerStatus.FAILED;
    this.ledger.failedAt = new Date().toISOString();
    this.ledger.failureReason = reason;
    this.save();
  }

  /**
   * Mark ledger as abandoned
   */
  markAbandoned() {
    this.ledger.status = LedgerStatus.ABANDONED;
    this.ledger.abandonedAt = new Date().toISOString();
    this.save();
  }

  /**
   * Get ledger status
   * @returns {string} Current status
   */
  getStatus() {
    return this.ledger.status;
  }

  /**
   * Check if ledger is resumable
   * @returns {boolean} True if can be resumed
   */
  isResumable() {
    return this.ledger.status === LedgerStatus.IN_PROGRESS;
  }

  /**
   * Get summary of current state
   * @returns {Object} State summary
   */
  getSummary() {
    return {
      sessionId: this.sessionId,
      status: this.ledger.status,
      startedAt: this.ledger.startedAt,
      completedSteps: this.ledger.completedSteps.length,
      createdRecords: this.ledger.createdRecords.length,
      errors: this.ledger.errors.length,
      lastStep: this.ledger.lastCompletedStep,
      csvPath: this.ledger.csvPath,
      platform: this.ledger.platform
    };
  }

  /**
   * Delete ledger file
   */
  delete() {
    if (fs.existsSync(this.ledgerPath)) {
      fs.unlinkSync(this.ledgerPath);
      this.log(`Deleted ledger: ${this.sessionId}`);
    }
  }

  /**
   * Log message (debug)
   */
  log(message) {
    // Debug logging - enable via DEBUG env var if needed
    if (process.env.UAT_DEBUG) {
      console.log(`[Ledger] ${message}`);
    }
  }

  // ============================================
  // STATIC METHODS
  // ============================================

  /**
   * Find all resumable sessions
   * @param {string} [outputDir='.uat-sessions'] - Directory to search
   * @returns {Array<Object>} Resumable session summaries
   */
  static findResumable(outputDir = '.uat-sessions') {
    if (!fs.existsSync(outputDir)) {
      return [];
    }

    const files = fs.readdirSync(outputDir)
      .filter(f => f.endsWith('.ledger.json'));

    const resumable = [];

    for (const file of files) {
      try {
        const filePath = path.join(outputDir, file);
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

        if (data.status === LedgerStatus.IN_PROGRESS) {
          resumable.push({
            sessionId: data.sessionId,
            startedAt: data.startedAt,
            csvPath: data.csvPath,
            platform: data.platform,
            orgAlias: data.orgAlias,
            completedSteps: data.completedSteps?.length || 0,
            lastStep: data.lastCompletedStep,
            filePath
          });
        }
      } catch (error) {
        // Skip invalid files
        console.warn(`Invalid ledger file: ${file}`);
      }
    }

    // Sort by most recent first
    resumable.sort((a, b) =>
      new Date(b.startedAt) - new Date(a.startedAt)
    );

    return resumable;
  }

  /**
   * Clean up old completed ledgers
   * @param {string} [outputDir='.uat-sessions'] - Directory to clean
   * @param {number} [maxAgeDays=7] - Max age in days
   * @returns {number} Number of files deleted
   */
  static cleanup(outputDir = '.uat-sessions', maxAgeDays = 7) {
    if (!fs.existsSync(outputDir)) {
      return 0;
    }

    const maxAge = maxAgeDays * 24 * 60 * 60 * 1000;
    const now = Date.now();
    let deleted = 0;

    const files = fs.readdirSync(outputDir)
      .filter(f => f.endsWith('.ledger.json'));

    for (const file of files) {
      try {
        const filePath = path.join(outputDir, file);
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

        // Only delete completed or failed sessions
        if (data.status === LedgerStatus.IN_PROGRESS) {
          continue;
        }

        const endTime = data.completedAt || data.failedAt || data.abandonedAt;
        if (!endTime) continue;

        const age = now - new Date(endTime).getTime();
        if (age > maxAge) {
          fs.unlinkSync(filePath);
          deleted++;
        }
      } catch (error) {
        // Skip files that can't be processed
      }
    }

    return deleted;
  }

  /**
   * Load a specific session by ID
   * @param {string} sessionId - Session ID to load
   * @param {string} [outputDir='.uat-sessions'] - Directory to search
   * @returns {UATExecutionLedger|null} Ledger instance or null
   */
  static load(sessionId, outputDir = '.uat-sessions') {
    const ledgerPath = path.join(outputDir, `${sessionId}.ledger.json`);

    if (!fs.existsSync(ledgerPath)) {
      return null;
    }

    return new UATExecutionLedger(sessionId, outputDir);
  }
}

module.exports = {
  UATExecutionLedger,
  LedgerStatus
};
