#!/usr/bin/env node
/**
 * Audit Error Logger
 *
 * Centralized structured error logging system for automation audits.
 * Provides machine-readable error reports with full context for debugging,
 * dashboards, and support escalation.
 *
 * Features:
 * - Structured error metadata (errorCode, ErrorId, fallback action, context)
 * - Error classification (API timeout, field missing, permission denied, etc.)
 * - Machine-readable JSON export
 * - Support context tracking (apiVersion, orgType, timestamp)
 * - Actionable recommendations
 *
 * Usage:
 *   const logger = new AuditErrorLogger();
 *   logger.log({
 *     component: 'ValidationRules',
 *     error: new Error('UNKNOWN_EXCEPTION'),
 *     fallback: 'Reduced query + separate mapping',
 *     context: { apiVersion: 'v59.0', orgType: 'Sandbox' }
 *   });
 *
 *   const report = logger.export();
 *
 * @version 1.0.0
 * @date 2025-10-20
 */

class AuditErrorLogger {
  constructor() {
    this.errors = [];
    this.context = {}; // Global context (org-level)
  }

  /**
   * Set global context for all errors
   * @param {object} context - Context data (apiVersion, orgAlias, orgType, etc.)
   */
  setGlobalContext(context) {
    this.context = { ...this.context, ...context };
  }

  /**
   * Log a structured error
   * @param {object} options - Error details
   * @param {string} options.component - Component that encountered error (e.g., 'ValidationRules', 'Flows')
   * @param {Error|string} options.error - Error object or message
   * @param {string} options.fallback - Fallback action taken (optional)
   * @param {object} options.context - Additional context (optional)
   * @param {string} options.recommendation - User-facing recommendation (optional)
   */
  log(options) {
    const {
      component,
      error,
      fallback = 'none',
      context = {},
      recommendation
    } = options;

    if (!component) {
      throw new Error('component is required for error logging');
    }

    if (!error) {
      throw new Error('error is required for error logging');
    }

    // Extract error details
    const errorMessage = typeof error === 'string' ? error : error.message;
    const errorStack = typeof error === 'object' ? error.stack : null;

    // Classify error
    const classification = this.classifyError(errorMessage);

    // Extract Salesforce ErrorId if present
    const errorId = this.extractErrorId(errorMessage);

    // Extract error code
    const errorCode = this.extractErrorCode(errorMessage);

    // Build structured error object
    const errorEntry = {
      component,
      classification,
      errorCode: errorCode || 'UNKNOWN',
      errorId: errorId || null,
      message: this.truncateMessage(errorMessage, 200),
      fullMessage: errorMessage,
      fallback,
      context: {
        ...this.context,
        ...context
      },
      recommendation: recommendation || this.generateRecommendation(classification, errorCode, errorId),
      timestamp: new Date().toISOString(),
      severity: this.calculateSeverity(classification, fallback)
    };

    if (errorStack && process.env.DEBUG) {
      errorEntry.stack = errorStack;
    }

    this.errors.push(errorEntry);

    // Log to console for immediate visibility
    this.consoleLog(errorEntry);

    return errorEntry;
  }

  /**
   * Classify error by type
   * @private
   */
  classifyError(message) {
    if (!message) return 'Unknown';

    // Check for specific patterns
    if (message.includes('1408067414') || message.includes('EntityDefinition')) {
      return 'Entity join failure';
    }
    if (message.includes('Timeout') || message.includes('QUERY_TIMEOUT')) {
      return 'API timeout';
    }
    if (message.includes('not supported') || message.includes('sObject type')) {
      return 'Object unavailable';
    }
    if (message.includes('INVALID_FIELD') || message.includes('No such column')) {
      return 'Field missing';
    }
    if (message.includes('INVALID_TYPE')) {
      return 'Invalid object type';
    }
    if (message.includes('INSUFFICIENT_ACCESS') || message.includes('permission')) {
      return 'Permission denied';
    }
    if (message.includes('UNKNOWN_EXCEPTION')) {
      return 'Salesforce backend error';
    }
    if (message.includes('exceeded')) {
      return 'Governor limit exceeded';
    }

    return 'Unknown error';
  }

  /**
   * Extract Salesforce ErrorId from error message
   * @private
   */
  extractErrorId(message) {
    if (!message) return null;

    // Pattern 1: ErrorId: XXXXX-XXXXX
    const pattern1 = /ErrorId:\s*(\d+-\d+)/i;
    const match1 = message.match(pattern1);
    if (match1) return match1[1];

    // Pattern 2: (XXXXX-XXXXX)
    const pattern2 = /\((\d+-\d+)\)/;
    const match2 = message.match(pattern2);
    if (match2) return match2[1];

    return null;
  }

  /**
   * Extract error code from message
   * @private
   */
  extractErrorCode(message) {
    if (!message) return null;

    const codes = [
      'UNKNOWN_EXCEPTION',
      'INVALID_FIELD',
      'INVALID_TYPE',
      'INSUFFICIENT_ACCESS',
      'QUERY_TIMEOUT',
      'INVALID_QUERY',
      'MALFORMED_QUERY',
      'TOO_MANY_QUERY_ROWS'
    ];

    for (const code of codes) {
      if (message.includes(code)) {
        return code;
      }
    }

    return null;
  }

  /**
   * Truncate message for summary display
   * @private
   */
  truncateMessage(message, maxLength) {
    if (!message || message.length <= maxLength) {
      return message;
    }
    return message.substring(0, maxLength) + '...';
  }

  /**
   * Generate recommendation based on error classification
   * @private
   */
  generateRecommendation(classification, errorCode, errorId) {
    switch (classification) {
      case 'Entity join failure':
        return 'Use separate queries to avoid EntityDefinition relationship joins';

      case 'API timeout':
        return 'Reduce batch size or add pagination to query';

      case 'Object unavailable':
        return 'Use fallback object (e.g., FlowDefinition instead of FlowDefinitionView)';

      case 'Field missing':
        return 'Check field availability with metadata describe before querying';

      case 'Permission denied':
        return 'Verify user has required object/field permissions';

      case 'Salesforce backend error':
        if (errorId) {
          return `Contact Salesforce Support with ErrorId: ${errorId}`;
        }
        return 'Retry query or contact Salesforce Support';

      case 'Governor limit exceeded':
        return 'Optimize query or split into multiple smaller queries';

      default:
        if (errorId) {
          return `Contact Salesforce Support with ErrorId: ${errorId}`;
        }
        return 'Review error details and retry';
    }
  }

  /**
   * Calculate severity level
   * @private
   */
  calculateSeverity(classification, fallback) {
    // If fallback succeeded, lower severity
    if (fallback && fallback !== 'none') {
      return 'warning'; // Error occurred but was handled
    }

    // Critical errors
    if (classification === 'Permission denied') {
      return 'critical';
    }

    // High severity
    if (['Entity join failure', 'Salesforce backend error'].includes(classification)) {
      return 'high';
    }

    // Medium severity
    if (['API timeout', 'Field missing', 'Object unavailable'].includes(classification)) {
      return 'medium';
    }

    // Default
    return 'low';
  }

  /**
   * Log error to console
   * @private
   */
  consoleLog(errorEntry) {
    const icon = {
      critical: '🔴',
      high: '🟠',
      medium: '🟡',
      warning: '⚠️',
      low: '🔵'
    }[errorEntry.severity] || '❌';

    console.error(`\n${icon} ${errorEntry.component}: ${errorEntry.classification}`);
    console.error(`  Message: ${errorEntry.message}`);
    if (errorEntry.errorCode) {
      console.error(`  Error Code: ${errorEntry.errorCode}`);
    }
    if (errorEntry.errorId) {
      console.error(`  Salesforce ErrorId: ${errorEntry.errorId}`);
    }
    if (errorEntry.fallback !== 'none') {
      console.error(`  Fallback: ${errorEntry.fallback}`);
    }
    console.error(`  Recommendation: ${errorEntry.recommendation}`);
    console.error('');
  }

  /**
   * Get all logged errors
   * @returns {array} Array of error objects
   */
  getErrors() {
    return [...this.errors];
  }

  /**
   * Get errors by component
   * @param {string} component - Component name
   * @returns {array} Filtered errors
   */
  getErrorsByComponent(component) {
    return this.errors.filter(e => e.component === component);
  }

  /**
   * Get errors by severity
   * @param {string} severity - Severity level
   * @returns {array} Filtered errors
   */
  getErrorsBySeverity(severity) {
    return this.errors.filter(e => e.severity === severity);
  }

  /**
   * Get summary statistics
   * @returns {object} Summary stats
   */
  getSummary() {
    const summary = {
      total: this.errors.length,
      bySeverity: {
        critical: 0,
        high: 0,
        medium: 0,
        warning: 0,
        low: 0
      },
      byComponent: {},
      byClassification: {}
    };

    this.errors.forEach(error => {
      // Count by severity
      summary.bySeverity[error.severity] = (summary.bySeverity[error.severity] || 0) + 1;

      // Count by component
      summary.byComponent[error.component] = (summary.byComponent[error.component] || 0) + 1;

      // Count by classification
      summary.byClassification[error.classification] = (summary.byClassification[error.classification] || 0) + 1;
    });

    return summary;
  }

  /**
   * Export errors to JSON
   * @param {object} options - Export options
   * @param {boolean} options.includeStack - Include stack traces (default: false)
   * @param {boolean} options.pretty - Pretty print JSON (default: true)
   * @returns {string} JSON string
   */
  export(options = {}) {
    const { includeStack = false, pretty = true } = options;

    const exportData = {
      summary: this.getSummary(),
      context: this.context,
      errors: this.errors.map(error => {
        const exported = { ...error };
        if (!includeStack) {
          delete exported.stack;
        }
        return exported;
      }),
      exportedAt: new Date().toISOString()
    };

    return pretty ? JSON.stringify(exportData, null, 2) : JSON.stringify(exportData);
  }

  /**
   * Clear all logged errors
   */
  clear() {
    this.errors = [];
    console.log('✓ Cleared all logged errors');
  }

  /**
   * Get count of errors
   * @returns {number} Error count
   */
  count() {
    return this.errors.length;
  }
}

module.exports = AuditErrorLogger;
