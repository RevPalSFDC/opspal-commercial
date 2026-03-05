#!/usr/bin/env node

/**
 * UAT Error Classes
 *
 * Structured error classes with context and actionable suggestions
 * for the UAT framework. All errors include:
 * - Context (step number, action, object, etc.)
 * - Suggestions for fixing the issue
 * - JSON serialization for logging
 * - Human-readable display formatting
 *
 * @module uat-errors
 * @version 1.0.0
 *
 * @example
 * const { UATValidationError, UATExecutionError } = require('./uat-errors');
 *
 * throw new UATValidationError('CSV file not found', {
 *   filePath: '/path/to/file.csv',
 *   suggestions: ['Check file path', 'Use absolute path']
 * });
 */

/**
 * Base UAT Error class with context and suggestions
 */
class UATError extends Error {
  /**
   * Create a UAT error
   * @param {string} message - Error message
   * @param {Object} [context={}] - Error context
   * @param {Array<string>} [context.suggestions] - Suggestions for fixing the error
   */
  constructor(message, context = {}) {
    super(message);
    this.name = this.constructor.name;
    this.context = context;
    this.timestamp = new Date().toISOString();
    this.suggestions = context.suggestions || [];

    // Capture stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Serialize error to JSON
   * @returns {Object} JSON representation
   */
  toJSON() {
    const json = {
      name: this.name,
      message: this.message,
      timestamp: this.timestamp
    };

    // Add context (excluding suggestions since they're at top level)
    const contextWithoutSuggestions = { ...this.context };
    delete contextWithoutSuggestions.suggestions;

    if (Object.keys(contextWithoutSuggestions).length > 0) {
      json.context = contextWithoutSuggestions;
    }

    if (this.suggestions.length > 0) {
      json.suggestions = this.suggestions;
    }

    return json;
  }

  /**
   * Format error for display
   * @returns {string} Human-readable error string
   */
  toDisplayString() {
    let output = `\n❌ ${this.name}: ${this.message}\n`;

    // Add context
    const contextWithoutSuggestions = { ...this.context };
    delete contextWithoutSuggestions.suggestions;

    if (Object.keys(contextWithoutSuggestions).length > 0) {
      output += '\n📋 Context:\n';
      for (const [key, value] of Object.entries(contextWithoutSuggestions)) {
        const displayValue = typeof value === 'object'
          ? JSON.stringify(value, null, 2).split('\n').map((l, i) => i === 0 ? l : `      ${l}`).join('\n')
          : value;
        output += `   • ${key}: ${displayValue}\n`;
      }
    }

    // Add suggestions
    if (this.suggestions.length > 0) {
      output += '\n💡 Suggestions:\n';
      for (const suggestion of this.suggestions) {
        output += `   → ${suggestion}\n`;
      }
    }

    return output;
  }

  /**
   * Check if error has a specific suggestion
   * @param {string} pattern - Pattern to search for in suggestions
   * @returns {boolean} True if matching suggestion found
   */
  hasSuggestion(pattern) {
    const lowerPattern = pattern.toLowerCase();
    return this.suggestions.some(s => s.toLowerCase().includes(lowerPattern));
  }

  /**
   * Add a suggestion to the error
   * @param {string} suggestion - Suggestion to add
   * @returns {UATError} This error instance for chaining
   */
  addSuggestion(suggestion) {
    if (!this.suggestions.includes(suggestion)) {
      this.suggestions.push(suggestion);
    }
    return this;
  }
}

/**
 * Validation Error - For input, configuration, and structure validation failures
 *
 * @example
 * throw new UATValidationError('Invalid CSV structure', {
 *   errors: ['Missing required column: Test Scenario'],
 *   warnings: ['File has no .csv extension'],
 *   suggestions: ['Add Test Scenario column']
 * });
 */
class UATValidationError extends UATError {
  /**
   * Create a validation error
   * @param {string} message - Error message
   * @param {Object} [context={}] - Error context
   * @param {Array<string>} [context.errors] - Validation errors
   * @param {Array<string>} [context.warnings] - Validation warnings
   * @param {Array<string>} [context.suggestions] - Suggestions for fixing
   */
  constructor(message, context = {}) {
    super(message, context);
    this.errors = context.errors || [];
    this.warnings = context.warnings || [];
  }

  toJSON() {
    const json = super.toJSON();
    if (this.errors.length > 0) {
      json.errors = this.errors;
    }
    if (this.warnings.length > 0) {
      json.warnings = this.warnings;
    }
    return json;
  }

  toDisplayString() {
    let output = super.toDisplayString();

    if (this.errors.length > 0) {
      output += '\n🚫 Validation Errors:\n';
      for (const error of this.errors) {
        output += `   • ${error}\n`;
      }
    }

    if (this.warnings.length > 0) {
      output += '\n⚠️  Warnings:\n';
      for (const warning of this.warnings) {
        output += `   • ${warning}\n`;
      }
    }

    return output;
  }
}

/**
 * Execution Error - For test execution failures
 *
 * @example
 * throw new UATExecutionError('Step 3 failed: INVALID_FIELD', {
 *   stepNumber: 3,
 *   action: 'create',
 *   object: 'Account',
 *   originalError: 'INVALID_FIELD: Field not found',
 *   suggestions: ['Check field API name', 'Run sf sobject describe Account']
 * });
 */
class UATExecutionError extends UATError {
  /**
   * Create an execution error
   * @param {string} message - Error message
   * @param {Object} [context={}] - Error context
   * @param {number} [context.stepNumber] - Step number that failed
   * @param {string} [context.action] - Action being executed (create, update, verify)
   * @param {string} [context.object] - Object type being operated on
   * @param {string} [context.originalError] - Original error message
   */
  constructor(message, context = {}) {
    super(message, context);
    this.stepNumber = context.stepNumber;
    this.action = context.action;
    this.object = context.object;
    this.originalError = context.originalError;
  }

  toJSON() {
    const json = super.toJSON();
    if (this.stepNumber !== undefined) {
      json.stepNumber = this.stepNumber;
    }
    if (this.action) {
      json.action = this.action;
    }
    if (this.object) {
      json.object = this.object;
    }
    if (this.originalError) {
      json.originalError = this.originalError;
    }
    return json;
  }

  toDisplayString() {
    let output = `\n❌ ${this.name}: ${this.message}\n`;

    // Step-specific context
    if (this.stepNumber !== undefined) {
      output += `\n📍 Step ${this.stepNumber}`;
      if (this.action) {
        output += ` (${this.action}`;
        if (this.object) {
          output += ` ${this.object}`;
        }
        output += ')';
      }
      output += '\n';
    }

    // Original error
    if (this.originalError) {
      output += `\n🔍 Original Error:\n   ${this.originalError}\n`;
    }

    // Other context
    const displayContext = { ...this.context };
    delete displayContext.suggestions;
    delete displayContext.stepNumber;
    delete displayContext.action;
    delete displayContext.object;
    delete displayContext.originalError;

    if (Object.keys(displayContext).length > 0) {
      output += '\n📋 Additional Context:\n';
      for (const [key, value] of Object.entries(displayContext)) {
        const displayValue = typeof value === 'object' ? JSON.stringify(value) : value;
        output += `   • ${key}: ${displayValue}\n`;
      }
    }

    // Suggestions
    if (this.suggestions.length > 0) {
      output += '\n💡 Suggestions:\n';
      for (const suggestion of this.suggestions) {
        output += `   → ${suggestion}\n`;
      }
    }

    return output;
  }
}

/**
 * Adapter Error - For platform adapter failures (Salesforce, HubSpot)
 *
 * @example
 * throw new UATAdapterError('Salesforce query failed', {
 *   platform: 'salesforce',
 *   operation: 'query',
 *   soql: 'SELECT Id FROM Account',
 *   originalError: 'INVALID_TYPE',
 *   suggestions: ['Check object exists', 'Verify API name']
 * });
 */
class UATAdapterError extends UATError {
  /**
   * Create an adapter error
   * @param {string} message - Error message
   * @param {Object} [context={}] - Error context
   * @param {string} [context.platform] - Platform name (salesforce, hubspot)
   * @param {string} [context.operation] - Operation that failed
   * @param {string} [context.originalError] - Original error message
   */
  constructor(message, context = {}) {
    super(message, context);
    this.platform = context.platform;
    this.operation = context.operation;
    this.originalError = context.originalError;
  }

  toJSON() {
    const json = super.toJSON();
    if (this.platform) {
      json.platform = this.platform;
    }
    if (this.operation) {
      json.operation = this.operation;
    }
    if (this.originalError) {
      json.originalError = this.originalError;
    }
    return json;
  }
}

/**
 * Preflight Error - For pre-flight validation failures
 *
 * @example
 * throw new UATPreflightError('Pre-flight checks failed', {
 *   blockers: ['Not authenticated to org'],
 *   checks: [
 *     { name: 'Authentication', passed: false, message: 'Not authenticated' },
 *     { name: 'Permissions', passed: true, message: 'CRUD access confirmed' }
 *   ],
 *   suggestions: ['Run: sf org login web --alias my-sandbox']
 * });
 */
class UATPreflightError extends UATError {
  /**
   * Create a preflight error
   * @param {string} message - Error message
   * @param {Object} [context={}] - Error context
   * @param {Array<string>} [context.blockers] - Blocking issues
   * @param {Array<Object>} [context.checks] - Pre-flight check results
   */
  constructor(message, context = {}) {
    super(message, context);
    this.blockers = context.blockers || [];
    this.checks = context.checks || [];
  }

  toJSON() {
    const json = super.toJSON();
    if (this.blockers.length > 0) {
      json.blockers = this.blockers;
    }
    if (this.checks.length > 0) {
      json.checks = this.checks;
    }
    return json;
  }

  toDisplayString() {
    let output = super.toDisplayString();

    if (this.blockers.length > 0) {
      output += '\n🚧 Blockers:\n';
      for (const blocker of this.blockers) {
        output += `   • ${blocker}\n`;
      }
    }

    if (this.checks.length > 0) {
      output += '\n📋 Pre-flight Checks:\n';
      for (const check of this.checks) {
        const icon = check.passed ? '✓' : '✗';
        output += `   ${icon} ${check.name}: ${check.message}\n`;
      }
    }

    return output;
  }
}

/**
 * Get suggestions for common Salesforce errors
 * @param {string} errorMessage - Error message to analyze
 * @param {Object} [context={}] - Additional context
 * @returns {Array<string>} Suggestions for fixing the error
 */
function getSuggestionsForSalesforceError(errorMessage, context = {}) {
  const suggestions = [];
  const msg = errorMessage.toLowerCase();

  // Field errors
  if (msg.includes('invalid_field') || msg.includes('no such column')) {
    suggestions.push(`Check that field exists on ${context.object || 'the object'}`);
    suggestions.push('Run: sf sobject describe <object> to see available fields');
    suggestions.push('Verify field API name (not label)');
  }

  // Permission errors
  if (msg.includes('insufficient_access') || msg.includes('insufficient access')) {
    suggestions.push('Check user permissions for this object');
    suggestions.push('Verify profile/permission set CRUD access');
    suggestions.push('Check sharing rules if accessing other users\' records');
  }

  // Required field errors
  if (msg.includes('required_field_missing') || msg.includes('required field')) {
    suggestions.push('Add required fields to test data');
    suggestions.push('Check object configuration for required fields');
    suggestions.push('Review page layouts for conditionally required fields');
  }

  // Authentication errors
  if (msg.includes('invalid_session') || msg.includes('session expired') || msg.includes('not authenticated')) {
    suggestions.push(`Run: sf org login web --alias ${context.orgAlias || '<your-org>'}`);
    suggestions.push('Check if access token has expired');
  }

  // Validation rule errors
  if (msg.includes('field_custom_validation') || msg.includes('validation error')) {
    suggestions.push('Check validation rules on the object');
    suggestions.push('Review required field values for validation');
    suggestions.push('Run: sf data query to check validation rule formulas');
  }

  // Duplicate rule errors
  if (msg.includes('duplicate_value') || msg.includes('duplicates_detected')) {
    suggestions.push('Check duplicate rules configuration');
    suggestions.push('Use unique values in test data');
  }

  // Record type errors
  if (msg.includes('invalid_record_type') || msg.includes('record type')) {
    suggestions.push('Verify record type ID is valid');
    suggestions.push('Check user has access to the record type');
  }

  // Object not found
  if (msg.includes('invalid_type') || msg.includes('object does not exist')) {
    suggestions.push('Verify object API name (not label)');
    suggestions.push('Check if object is deployed to the target org');
    suggestions.push('Run: sf org list to verify connected org');
  }

  // Rate limit
  if (msg.includes('request_limit') || msg.includes('rate limit')) {
    suggestions.push('Wait and retry after rate limit resets');
    suggestions.push('Reduce batch size or add delays between requests');
  }

  return suggestions;
}

/**
 * Create an appropriate error type from an unknown error
 * @param {Error} error - Original error
 * @param {Object} [context={}] - Additional context
 * @returns {UATError} Wrapped UAT error
 */
function wrapError(error, context = {}) {
  // Already a UAT error
  if (error instanceof UATError) {
    // Add additional context
    Object.assign(error.context, context);
    return error;
  }

  // Determine appropriate error type
  const message = error.message || String(error);

  // Salesforce-specific errors
  if (context.platform === 'salesforce' || message.includes('sf ') || message.includes('sfdx')) {
    const suggestions = getSuggestionsForSalesforceError(message, context);
    return new UATAdapterError(message, {
      ...context,
      platform: 'salesforce',
      originalError: message,
      suggestions
    });
  }

  // Execution context present
  if (context.stepNumber !== undefined) {
    return new UATExecutionError(message, {
      ...context,
      originalError: message,
      suggestions: getSuggestionsForSalesforceError(message, context)
    });
  }

  // Default to base error
  return new UATError(message, {
    ...context,
    originalError: message
  });
}

module.exports = {
  UATError,
  UATValidationError,
  UATExecutionError,
  UATAdapterError,
  UATPreflightError,
  getSuggestionsForSalesforceError,
  wrapError
};
