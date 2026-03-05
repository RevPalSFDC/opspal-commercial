#!/usr/bin/env node

/**
 * Validator Telemetry System
 *
 * Tracks validator execution metrics for production validation:
 * - Execution time
 * - Errors/warnings found
 * - Outcomes (blocked/passed/warnings)
 * - User feedback (false positives/negatives)
 *
 * Usage:
 *   const ValidatorTelemetry = require('./validator-telemetry');
 *   const telemetry = new ValidatorTelemetry('metadata-dependency-analyzer');
 *
 *   const result = await validator.analyze(...);
 *   telemetry.logValidation(result);
 *
 * @see PHASE_1_PRODUCTION_VALIDATION_PLAN.md
 */

const fs = require('fs');
const path = require('path');

class ValidatorTelemetry {
  constructor(validatorName, options = {}) {
    this.validatorName = validatorName;
    this.enabled = options.enabled !== false && process.env.VALIDATOR_TELEMETRY_ENABLED !== '0';
    this.logDir = options.logDir || path.join(__dirname, '../../logs/telemetry');
    this.logFile = path.join(this.logDir, `${validatorName}.jsonl`);
    this.verbose = options.verbose || false;

    // Create log directory if it doesn't exist
    if (this.enabled && !fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  /**
   * Log validation execution
   * @param {Object} result - Validation result
   * @param {number} result.executionTime - Execution time in milliseconds
   * @param {Array} result.errors - Array of errors found
   * @param {Array} result.warnings - Array of warnings found
   * @param {string} result.outcome - Outcome: 'blocked', 'passed', 'warnings_only'
   * @param {Object} metadata - Additional metadata (org, user, operation type, etc.)
   */
  logValidation(result, metadata = {}) {
    if (!this.enabled) {
      return;
    }

    const telemetry = {
      timestamp: new Date().toISOString(),
      validator: this.validatorName,
      executionTime: result.executionTime || 0,
      errorsFound: (result.errors || []).length,
      warningsFound: (result.warnings || []).length,
      outcome: result.outcome || this.determineOutcome(result),
      metadata: {
        org: metadata.org || process.env.SF_ORG_ALIAS || 'unknown',
        user: metadata.user || process.env.USER_EMAIL || 'unknown',
        operationType: metadata.operationType || 'unknown',
        ...metadata
      },
      userFeedback: {
        falsePositive: null,  // Set by user feedback
        falseNegative: null,  // Set by user feedback
        satisfied: null,      // Set by user feedback
        timeSaved: null       // Set by user feedback (minutes)
      }
    };

    try {
      fs.appendFileSync(this.logFile, JSON.stringify(telemetry) + '\n');

      if (this.verbose) {
        console.log(`📊 Telemetry logged: ${this.validatorName}`);
        console.log(`   Outcome: ${telemetry.outcome}`);
        console.log(`   Errors: ${telemetry.errorsFound}, Warnings: ${telemetry.warningsFound}`);
        console.log(`   Execution: ${telemetry.executionTime}ms`);
      }
    } catch (error) {
      console.error(`⚠️  Failed to log telemetry: ${error.message}`);
    }
  }

  /**
   * Log user feedback for a specific validation
   * @param {string} timestamp - Timestamp of original validation
   * @param {Object} feedback - User feedback
   */
  logFeedback(timestamp, feedback) {
    if (!this.enabled) {
      return;
    }

    const feedbackEntry = {
      timestamp: new Date().toISOString(),
      originalTimestamp: timestamp,
      validator: this.validatorName,
      feedback: {
        accurate: feedback.accurate || null,
        falsePositive: feedback.falsePositive || false,
        falseNegative: feedback.falseNegative || false,
        timeSaved: feedback.timeSaved || null,
        satisfied: feedback.satisfied || null,
        comments: feedback.comments || ''
      }
    };

    const feedbackFile = path.join(this.logDir, `${this.validatorName}-feedback.jsonl`);

    try {
      fs.appendFileSync(feedbackFile, JSON.stringify(feedbackEntry) + '\n');

      if (this.verbose) {
        console.log(`📝 Feedback logged: ${this.validatorName}`);
        console.log(`   Accurate: ${feedbackEntry.feedback.accurate}`);
        console.log(`   Time Saved: ${feedbackEntry.feedback.timeSaved}min`);
      }
    } catch (error) {
      console.error(`⚠️  Failed to log feedback: ${error.message}`);
    }
  }

  /**
   * Determine outcome from validation result
   */
  determineOutcome(result) {
    if ((result.errors || []).length > 0) {
      return 'blocked';
    } else if ((result.warnings || []).length > 0) {
      return 'warnings_only';
    } else {
      return 'passed';
    }
  }

  /**
   * Get telemetry statistics
   * @param {Object} options - Filter options
   * @returns {Object} Statistics
   */
  getStatistics(options = {}) {
    if (!fs.existsSync(this.logFile)) {
      return {
        totalValidations: 0,
        blocked: 0,
        passed: 0,
        warningsOnly: 0,
        averageExecutionTime: 0,
        errorRate: 0
      };
    }

    const lines = fs.readFileSync(this.logFile, 'utf-8').trim().split('\n').filter(Boolean);
    const entries = lines.map(line => JSON.parse(line));

    // Apply date filter if provided
    let filteredEntries = entries;
    if (options.since) {
      const sinceDate = new Date(options.since);
      filteredEntries = entries.filter(e => new Date(e.timestamp) >= sinceDate);
    }
    if (options.until) {
      const untilDate = new Date(options.until);
      filteredEntries = filteredEntries.filter(e => new Date(e.timestamp) <= untilDate);
    }

    const stats = {
      totalValidations: filteredEntries.length,
      blocked: filteredEntries.filter(e => e.outcome === 'blocked').length,
      passed: filteredEntries.filter(e => e.outcome === 'passed').length,
      warningsOnly: filteredEntries.filter(e => e.outcome === 'warnings_only').length,
      averageExecutionTime: 0,
      errorRate: 0,
      totalErrors: filteredEntries.reduce((sum, e) => sum + e.errorsFound, 0),
      totalWarnings: filteredEntries.reduce((sum, e) => sum + e.warningsFound, 0)
    };

    if (stats.totalValidations > 0) {
      const totalTime = filteredEntries.reduce((sum, e) => sum + e.executionTime, 0);
      stats.averageExecutionTime = Math.round(totalTime / stats.totalValidations);
      stats.errorRate = Math.round((stats.blocked / stats.totalValidations) * 100);
    }

    return stats;
  }

  /**
   * Get feedback statistics
   * @returns {Object} Feedback statistics
   */
  getFeedbackStatistics() {
    const feedbackFile = path.join(this.logDir, `${this.validatorName}-feedback.jsonl`);

    if (!fs.existsSync(feedbackFile)) {
      return {
        totalFeedback: 0,
        accuracyRate: 0,
        falsePositiveRate: 0,
        falseNegativeRate: 0,
        averageTimeSaved: 0,
        satisfactionRate: 0
      };
    }

    const lines = fs.readFileSync(feedbackFile, 'utf-8').trim().split('\n').filter(Boolean);
    const entries = lines.map(line => JSON.parse(line));

    const stats = {
      totalFeedback: entries.length,
      accuracyRate: 0,
      falsePositiveRate: 0,
      falseNegativeRate: 0,
      averageTimeSaved: 0,
      satisfactionRate: 0
    };

    if (entries.length === 0) {
      return stats;
    }

    const accurate = entries.filter(e => e.feedback.accurate === true).length;
    const falsePositives = entries.filter(e => e.feedback.falsePositive === true).length;
    const falseNegatives = entries.filter(e => e.feedback.falseNegative === true).length;
    const timeSavedEntries = entries.filter(e => e.feedback.timeSaved !== null);
    const totalTimeSaved = timeSavedEntries.reduce((sum, e) => sum + (e.feedback.timeSaved || 0), 0);
    const satisfiedEntries = entries.filter(e => e.feedback.satisfied !== null);
    const totalSatisfaction = satisfiedEntries.reduce((sum, e) => sum + (e.feedback.satisfied || 0), 0);

    stats.accuracyRate = Math.round((accurate / entries.length) * 100);
    stats.falsePositiveRate = Math.round((falsePositives / entries.length) * 100);
    stats.falseNegativeRate = Math.round((falseNegatives / entries.length) * 100);
    stats.averageTimeSaved = timeSavedEntries.length > 0
      ? Math.round(totalTimeSaved / timeSavedEntries.length)
      : 0;
    stats.satisfactionRate = satisfiedEntries.length > 0
      ? (totalSatisfaction / satisfiedEntries.length).toFixed(2)
      : 0;

    return stats;
  }

  /**
   * Generate telemetry report
   * @param {Object} options - Report options
   * @returns {string} Formatted report
   */
  generateReport(options = {}) {
    const stats = this.getStatistics(options);
    const feedback = this.getFeedbackStatistics();

    const report = [];
    report.push('═══════════════════════════════════════════════════════════');
    report.push(`  VALIDATOR TELEMETRY REPORT: ${this.validatorName}`);
    report.push('═══════════════════════════════════════════════════════════');
    report.push('');
    report.push('📊 EXECUTION STATISTICS');
    report.push(`   Total Validations: ${stats.totalValidations}`);
    report.push(`   Blocked: ${stats.blocked} (${stats.errorRate}%)`);
    report.push(`   Passed: ${stats.passed}`);
    report.push(`   Warnings Only: ${stats.warningsOnly}`);
    report.push(`   Average Execution Time: ${stats.averageExecutionTime}ms`);
    report.push(`   Total Errors Found: ${stats.totalErrors}`);
    report.push(`   Total Warnings Found: ${stats.totalWarnings}`);
    report.push('');
    report.push('📝 USER FEEDBACK');
    report.push(`   Total Feedback: ${feedback.totalFeedback}`);
    report.push(`   Accuracy Rate: ${feedback.accuracyRate}%`);
    report.push(`   False Positive Rate: ${feedback.falsePositiveRate}%`);
    report.push(`   False Negative Rate: ${feedback.falseNegativeRate}%`);
    report.push(`   Average Time Saved: ${feedback.averageTimeSaved} minutes`);
    report.push(`   Satisfaction Rate: ${feedback.satisfactionRate}/5`);
    report.push('');
    report.push('═══════════════════════════════════════════════════════════');

    return report.join('\n');
  }
}

// CLI Interface
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length < 2 || args[0] !== 'report') {
    console.error('Usage: node validator-telemetry.js report <validator-name> [--since YYYY-MM-DD] [--until YYYY-MM-DD]');
    process.exit(1);
  }

  const validatorName = args[1];
  const telemetry = new ValidatorTelemetry(validatorName, { verbose: true });

  const options = {};
  const sinceIndex = args.indexOf('--since');
  if (sinceIndex !== -1 && args[sinceIndex + 1]) {
    options.since = args[sinceIndex + 1];
  }
  const untilIndex = args.indexOf('--until');
  if (untilIndex !== -1 && args[untilIndex + 1]) {
    options.until = args[untilIndex + 1];
  }

  console.log(telemetry.generateReport(options));
}

// Report-specific event types for the CRUD pipeline
ValidatorTelemetry.REPORT_EVENT_TYPES = {
  REPORT_CREATE: 'report_create',
  REPORT_UPDATE: 'report_update',
  REPORT_DELETE: 'report_delete',
  REPORT_PREFLIGHT: 'report_preflight',
  REPORT_DISAMBIGUATE: 'report_disambiguate',
  REPORT_TYPE_FALLBACK: 'report_type_fallback',
  REPORT_CONSTRAINT_FIX: 'report_constraint_fix',
  REPORT_SILENT_DROP: 'report_silent_drop',
  REPORT_DEPENDENCY_CHECK: 'report_dependency_check',
  REPORT_ARCHIVE: 'report_archive'
};

module.exports = ValidatorTelemetry;
