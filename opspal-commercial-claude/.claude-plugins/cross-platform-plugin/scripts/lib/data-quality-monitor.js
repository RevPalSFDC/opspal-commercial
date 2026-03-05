#!/usr/bin/env node

/**
 * Data Quality Monitor
 *
 * Rule-based validation framework for preventing data quality issues
 * across Salesforce, HubSpot, and other platforms.
 *
 * Addresses the data-quality cohort from reflection analysis:
 * - 5 reflections with $90k annual ROI
 * - Root cause: Missing data quality monitoring
 *
 * Features:
 * - Configurable validation rules
 * - Built-in rules for common patterns
 * - Severity levels (error, warning, info)
 * - Violation tracking and reporting
 * - Platform-specific validators
 * - Batch validation with performance optimization
 *
 * @module data-quality-monitor
 * @version 1.0.0
 */

'use strict';

// ============================================================================
// BUILT-IN VALIDATION RULES
// ============================================================================

/**
 * Rule: No null values in required fields
 */
const noNullRequired = {
  name: 'noNullRequired',
  description: 'Required fields must not be null or undefined',
  severity: 'error',
  validate: (value, fieldName, options = {}) => {
    const { allowEmpty = false } = options;

    if (value === null || value === undefined) {
      return {
        valid: false,
        message: `Required field '${fieldName}' is null or undefined`,
        rule: 'noNullRequired',
        severity: 'error'
      };
    }

    if (!allowEmpty && value === '') {
      return {
        valid: false,
        message: `Required field '${fieldName}' is empty`,
        rule: 'noNullRequired',
        severity: 'error'
      };
    }

    return { valid: true };
  }
};

/**
 * Rule: Valid Salesforce ID format (15 or 18 character)
 */
const validSalesforceId = {
  name: 'validSalesforceId',
  description: 'Salesforce IDs must be valid 15 or 18 character format',
  severity: 'error',
  validate: (value, fieldName, options = {}) => {
    const { allowNull = false, prefix = null } = options;

    // Allow null if specified
    if (allowNull && (value === null || value === undefined || value === '')) {
      return { valid: true };
    }

    if (typeof value !== 'string') {
      return {
        valid: false,
        message: `Field '${fieldName}' must be a string, got ${typeof value}`,
        rule: 'validSalesforceId',
        severity: 'error'
      };
    }

    // Check length (15 or 18 characters)
    if (value.length !== 15 && value.length !== 18) {
      return {
        valid: false,
        message: `Field '${fieldName}' has invalid Salesforce ID length: ${value.length} (expected 15 or 18)`,
        rule: 'validSalesforceId',
        severity: 'error',
        actual: value
      };
    }

    // Check character set (alphanumeric only)
    if (!/^[a-zA-Z0-9]+$/.test(value)) {
      return {
        valid: false,
        message: `Field '${fieldName}' contains invalid characters for Salesforce ID`,
        rule: 'validSalesforceId',
        severity: 'error',
        actual: value
      };
    }

    // Check prefix if specified
    if (prefix && !value.startsWith(prefix)) {
      return {
        valid: false,
        message: `Field '${fieldName}' does not start with expected prefix '${prefix}'`,
        rule: 'validSalesforceId',
        severity: 'error',
        actual: value,
        expected: `${prefix}...`
      };
    }

    // Detect obviously fake IDs (common in mock data)
    const fakePatterns = [
      /^0{14,17}[1-9]$/,           // All zeros except last digit
      /^(.)\1{14,17}$/,             // All same character
      /^00[A-Z]0{12,15}$/,          // Placeholder format
      /^test/i,                      // Starts with 'test'
      /^fake/i,                      // Starts with 'fake'
      /^mock/i                       // Starts with 'mock'
    ];

    for (const pattern of fakePatterns) {
      if (pattern.test(value)) {
        return {
          valid: false,
          message: `Field '${fieldName}' appears to be a fake/mock Salesforce ID`,
          rule: 'validSalesforceId',
          severity: 'error',
          actual: value,
          hint: 'This looks like placeholder data, not a real Salesforce ID'
        };
      }
    }

    return { valid: true };
  }
};

/**
 * Rule: Array must not be empty
 */
const nonEmptyArray = {
  name: 'nonEmptyArray',
  description: 'Array fields must contain at least one element',
  severity: 'error',
  validate: (value, fieldName, options = {}) => {
    const { minLength = 1, allowNull = false } = options;

    if (allowNull && (value === null || value === undefined)) {
      return { valid: true };
    }

    if (!Array.isArray(value)) {
      return {
        valid: false,
        message: `Field '${fieldName}' must be an array, got ${typeof value}`,
        rule: 'nonEmptyArray',
        severity: 'error'
      };
    }

    if (value.length < minLength) {
      return {
        valid: false,
        message: `Field '${fieldName}' must have at least ${minLength} element(s), has ${value.length}`,
        rule: 'nonEmptyArray',
        severity: 'error',
        actual: value.length,
        expected: minLength
      };
    }

    return { valid: true };
  }
};

/**
 * Rule: Valid email format
 */
const validEmail = {
  name: 'validEmail',
  description: 'Email fields must be valid email format',
  severity: 'error',
  validate: (value, fieldName, options = {}) => {
    const { allowNull = false } = options;

    if (allowNull && (value === null || value === undefined || value === '')) {
      return { valid: true };
    }

    if (typeof value !== 'string') {
      return {
        valid: false,
        message: `Field '${fieldName}' must be a string for email validation`,
        rule: 'validEmail',
        severity: 'error'
      };
    }

    // Basic email regex - not overly strict
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(value)) {
      return {
        valid: false,
        message: `Field '${fieldName}' is not a valid email format`,
        rule: 'validEmail',
        severity: 'error',
        actual: value
      };
    }

    // Check for obviously fake emails
    const fakeEmailPatterns = [
      /^test@test\.com$/i,
      /^example@example\.com$/i,
      /^fake@fake\.com$/i,
      /^user@domain\.com$/i,
      /^email@email\.com$/i,
      /^noreply@example\./i,
      /^john\.doe@/i,
      /^jane\.doe@/i
    ];

    for (const pattern of fakeEmailPatterns) {
      if (pattern.test(value)) {
        return {
          valid: false,
          message: `Field '${fieldName}' appears to be a fake/placeholder email`,
          rule: 'validEmail',
          severity: 'warning',
          actual: value,
          hint: 'This looks like example data, not a real email'
        };
      }
    }

    return { valid: true };
  }
};

/**
 * Rule: Valid date format
 */
const validDate = {
  name: 'validDate',
  description: 'Date fields must be valid and parseable',
  severity: 'error',
  validate: (value, fieldName, options = {}) => {
    const { allowNull = false, minDate = null, maxDate = null, allowFuture = true, allowPast = true } = options;

    if (allowNull && (value === null || value === undefined || value === '')) {
      return { valid: true };
    }

    let date;
    if (value instanceof Date) {
      date = value;
    } else if (typeof value === 'string' || typeof value === 'number') {
      date = new Date(value);
    } else {
      return {
        valid: false,
        message: `Field '${fieldName}' cannot be parsed as a date`,
        rule: 'validDate',
        severity: 'error',
        actual: typeof value
      };
    }

    if (isNaN(date.getTime())) {
      return {
        valid: false,
        message: `Field '${fieldName}' is not a valid date`,
        rule: 'validDate',
        severity: 'error',
        actual: value
      };
    }

    const now = new Date();

    if (!allowFuture && date > now) {
      return {
        valid: false,
        message: `Field '${fieldName}' cannot be a future date`,
        rule: 'validDate',
        severity: 'error',
        actual: date.toISOString()
      };
    }

    if (!allowPast && date < now) {
      return {
        valid: false,
        message: `Field '${fieldName}' cannot be a past date`,
        rule: 'validDate',
        severity: 'error',
        actual: date.toISOString()
      };
    }

    if (minDate && date < new Date(minDate)) {
      return {
        valid: false,
        message: `Field '${fieldName}' is before minimum date ${minDate}`,
        rule: 'validDate',
        severity: 'error',
        actual: date.toISOString(),
        minDate: minDate
      };
    }

    if (maxDate && date > new Date(maxDate)) {
      return {
        valid: false,
        message: `Field '${fieldName}' is after maximum date ${maxDate}`,
        rule: 'validDate',
        severity: 'error',
        actual: date.toISOString(),
        maxDate: maxDate
      };
    }

    return { valid: true };
  }
};

/**
 * Rule: Valid currency/money format
 */
const validCurrency = {
  name: 'validCurrency',
  description: 'Currency fields must be valid numbers with reasonable precision',
  severity: 'error',
  validate: (value, fieldName, options = {}) => {
    const {
      allowNull = false,
      minValue = null,
      maxValue = null,
      allowNegative = true,
      maxDecimalPlaces = 2
    } = options;

    if (allowNull && (value === null || value === undefined || value === '')) {
      return { valid: true };
    }

    let numValue = value;

    // Handle string currency values (e.g., "$1,234.56")
    if (typeof value === 'string') {
      numValue = parseFloat(value.replace(/[$,]/g, ''));
    }

    if (typeof numValue !== 'number' || isNaN(numValue)) {
      return {
        valid: false,
        message: `Field '${fieldName}' is not a valid currency value`,
        rule: 'validCurrency',
        severity: 'error',
        actual: value
      };
    }

    if (!allowNegative && numValue < 0) {
      return {
        valid: false,
        message: `Field '${fieldName}' cannot be negative`,
        rule: 'validCurrency',
        severity: 'error',
        actual: numValue
      };
    }

    if (minValue !== null && numValue < minValue) {
      return {
        valid: false,
        message: `Field '${fieldName}' is below minimum value ${minValue}`,
        rule: 'validCurrency',
        severity: 'error',
        actual: numValue,
        minValue: minValue
      };
    }

    if (maxValue !== null && numValue > maxValue) {
      return {
        valid: false,
        message: `Field '${fieldName}' exceeds maximum value ${maxValue}`,
        rule: 'validCurrency',
        severity: 'error',
        actual: numValue,
        maxValue: maxValue
      };
    }

    // Check decimal places
    const decimalPlaces = (numValue.toString().split('.')[1] || '').length;
    if (decimalPlaces > maxDecimalPlaces) {
      return {
        valid: false,
        message: `Field '${fieldName}' has too many decimal places (${decimalPlaces} > ${maxDecimalPlaces})`,
        rule: 'validCurrency',
        severity: 'warning',
        actual: numValue
      };
    }

    // Check for suspiciously round numbers (potential fake data)
    const roundPatterns = [
      { value: 1000, threshold: 100000 },
      { value: 10000, threshold: 1000000 },
      { value: 100000, threshold: 10000000 }
    ];

    for (const pattern of roundPatterns) {
      if (numValue >= pattern.threshold && numValue % pattern.value === 0) {
        return {
          valid: true,
          warning: `Field '${fieldName}' has suspiciously round value (${numValue}) - verify this is real data`,
          severity: 'info'
        };
      }
    }

    return { valid: true };
  }
};

/**
 * Rule: Valid percentage (0-100 or 0-1)
 */
const validPercentage = {
  name: 'validPercentage',
  description: 'Percentage fields must be valid and within expected range',
  severity: 'error',
  validate: (value, fieldName, options = {}) => {
    const { allowNull = false, format = 'percent', allowOver100 = false } = options;
    // format: 'percent' (0-100) or 'decimal' (0-1)

    if (allowNull && (value === null || value === undefined || value === '')) {
      return { valid: true };
    }

    let numValue = value;

    if (typeof value === 'string') {
      numValue = parseFloat(value.replace(/%/g, ''));
    }

    if (typeof numValue !== 'number' || isNaN(numValue)) {
      return {
        valid: false,
        message: `Field '${fieldName}' is not a valid percentage`,
        rule: 'validPercentage',
        severity: 'error',
        actual: value
      };
    }

    const maxValue = format === 'decimal' ? 1 : 100;
    const minValue = 0;

    if (numValue < minValue) {
      return {
        valid: false,
        message: `Field '${fieldName}' cannot be negative percentage`,
        rule: 'validPercentage',
        severity: 'error',
        actual: numValue
      };
    }

    if (!allowOver100 && numValue > maxValue) {
      return {
        valid: false,
        message: `Field '${fieldName}' exceeds ${maxValue}${format === 'percent' ? '%' : ''}`,
        rule: 'validPercentage',
        severity: 'error',
        actual: numValue,
        maxValue: maxValue
      };
    }

    // Warn on suspiciously round percentages (common in fake data)
    const roundPercentages = [10, 15, 20, 25, 30, 35, 40, 45, 50, 60, 70, 75, 80, 90];
    if (roundPercentages.includes(numValue)) {
      return {
        valid: true,
        warning: `Field '${fieldName}' has round percentage value (${numValue}%) - verify this is calculated, not placeholder data`,
        severity: 'info'
      };
    }

    return { valid: true };
  }
};

/**
 * Rule: Valid phone number format
 */
const validPhone = {
  name: 'validPhone',
  description: 'Phone fields must be valid phone number format',
  severity: 'warning',
  validate: (value, fieldName, options = {}) => {
    const { allowNull = false, country = 'US' } = options;

    if (allowNull && (value === null || value === undefined || value === '')) {
      return { valid: true };
    }

    if (typeof value !== 'string') {
      return {
        valid: false,
        message: `Field '${fieldName}' must be a string for phone validation`,
        rule: 'validPhone',
        severity: 'error'
      };
    }

    // Strip common formatting characters
    const cleaned = value.replace(/[\s\-().+]/g, '');

    // Must be digits only after cleaning
    if (!/^\d+$/.test(cleaned)) {
      return {
        valid: false,
        message: `Field '${fieldName}' contains invalid characters for phone number`,
        rule: 'validPhone',
        severity: 'error',
        actual: value
      };
    }

    // US numbers: 10-11 digits
    if (country === 'US' && (cleaned.length < 10 || cleaned.length > 11)) {
      return {
        valid: false,
        message: `Field '${fieldName}' is not a valid US phone number length`,
        rule: 'validPhone',
        severity: 'error',
        actual: value,
        digitsFound: cleaned.length
      };
    }

    // Check for obviously fake numbers
    const fakePatterns = [
      /^555/,           // 555 prefix (reserved for fiction)
      /^123456/,        // Sequential
      /^000000/,        // All zeros
      /^111111/,        // All ones
      /^(\d)\1{9,}/     // All same digit
    ];

    for (const pattern of fakePatterns) {
      if (pattern.test(cleaned)) {
        return {
          valid: false,
          message: `Field '${fieldName}' appears to be a fake phone number`,
          rule: 'validPhone',
          severity: 'warning',
          actual: value,
          hint: 'This looks like placeholder data, not a real phone number'
        };
      }
    }

    return { valid: true };
  }
};

/**
 * Rule: Enum/Picklist validation
 */
const validEnum = {
  name: 'validEnum',
  description: 'Field must be one of the allowed values',
  severity: 'error',
  validate: (value, fieldName, options = {}) => {
    const { allowNull = false, allowedValues = [], caseSensitive = false } = options;

    if (allowNull && (value === null || value === undefined || value === '')) {
      return { valid: true };
    }

    if (!allowedValues || allowedValues.length === 0) {
      return {
        valid: false,
        message: `Rule 'validEnum' requires 'allowedValues' option`,
        rule: 'validEnum',
        severity: 'error'
      };
    }

    const compareValue = caseSensitive ? value : (value || '').toLowerCase();
    const compareAllowed = caseSensitive
      ? allowedValues
      : allowedValues.map(v => (v || '').toLowerCase());

    if (!compareAllowed.includes(compareValue)) {
      return {
        valid: false,
        message: `Field '${fieldName}' has invalid value '${value}'. Allowed: [${allowedValues.join(', ')}]`,
        rule: 'validEnum',
        severity: 'error',
        actual: value,
        allowedValues: allowedValues
      };
    }

    return { valid: true };
  }
};

/**
 * Rule: String length validation
 */
const validLength = {
  name: 'validLength',
  description: 'String must be within specified length bounds',
  severity: 'error',
  validate: (value, fieldName, options = {}) => {
    const { allowNull = false, minLength = null, maxLength = null } = options;

    if (allowNull && (value === null || value === undefined || value === '')) {
      return { valid: true };
    }

    if (typeof value !== 'string') {
      return {
        valid: false,
        message: `Field '${fieldName}' must be a string for length validation`,
        rule: 'validLength',
        severity: 'error',
        actual: typeof value
      };
    }

    if (minLength !== null && value.length < minLength) {
      return {
        valid: false,
        message: `Field '${fieldName}' is too short (${value.length} < ${minLength})`,
        rule: 'validLength',
        severity: 'error',
        actual: value.length,
        minLength: minLength
      };
    }

    if (maxLength !== null && value.length > maxLength) {
      return {
        valid: false,
        message: `Field '${fieldName}' is too long (${value.length} > ${maxLength})`,
        rule: 'validLength',
        severity: 'error',
        actual: value.length,
        maxLength: maxLength
      };
    }

    return { valid: true };
  }
};

/**
 * Rule: No duplicate values in array
 */
const noDuplicates = {
  name: 'noDuplicates',
  description: 'Array must not contain duplicate values',
  severity: 'warning',
  validate: (value, fieldName, options = {}) => {
    const { allowNull = false, keyField = null } = options;

    if (allowNull && (value === null || value === undefined)) {
      return { valid: true };
    }

    if (!Array.isArray(value)) {
      return {
        valid: false,
        message: `Field '${fieldName}' must be an array for duplicate check`,
        rule: 'noDuplicates',
        severity: 'error'
      };
    }

    const seen = new Set();
    const duplicates = [];

    for (const item of value) {
      const key = keyField && typeof item === 'object' ? item[keyField] : item;
      const keyStr = JSON.stringify(key);

      if (seen.has(keyStr)) {
        duplicates.push(key);
      } else {
        seen.add(keyStr);
      }
    }

    if (duplicates.length > 0) {
      return {
        valid: false,
        message: `Field '${fieldName}' contains ${duplicates.length} duplicate value(s)`,
        rule: 'noDuplicates',
        severity: 'warning',
        duplicates: duplicates.slice(0, 5) // Show first 5 duplicates
      };
    }

    return { valid: true };
  }
};

// ============================================================================
// BUILT-IN RULES REGISTRY
// ============================================================================

const BUILT_IN_RULES = {
  noNullRequired,
  validSalesforceId,
  nonEmptyArray,
  validEmail,
  validDate,
  validCurrency,
  validPercentage,
  validPhone,
  validEnum,
  validLength,
  noDuplicates
};

// ============================================================================
// DATA QUALITY MONITOR CLASS
// ============================================================================

class DataQualityMonitor {
  /**
   * Create a new DataQualityMonitor
   * @param {Object} options - Configuration options
   * @param {Object} options.customRules - Custom validation rules
   * @param {boolean} options.throwOnError - Throw exception on first error
   * @param {boolean} options.trackViolations - Track all violations for reporting
   * @param {string} options.platform - Target platform (salesforce, hubspot, etc.)
   */
  constructor(options = {}) {
    this.rules = { ...BUILT_IN_RULES };
    this.throwOnError = options.throwOnError || false;
    this.trackViolations = options.trackViolations !== false;
    this.platform = options.platform || 'generic';

    // Violation tracking
    this.violations = [];
    this.stats = {
      totalChecks: 0,
      passed: 0,
      failed: 0,
      warnings: 0,
      byRule: {},
      byField: {},
      bySeverity: { error: 0, warning: 0, info: 0 }
    };

    // Add custom rules
    if (options.customRules) {
      for (const [name, rule] of Object.entries(options.customRules)) {
        this.addRule(name, rule);
      }
    }

    // Add platform-specific rules
    this.initPlatformRules();
  }

  /**
   * Initialize platform-specific validation rules
   */
  initPlatformRules() {
    if (this.platform === 'salesforce') {
      // Salesforce-specific ID prefixes
      this.addRule('validAccountId', {
        name: 'validAccountId',
        description: 'Account ID must have valid prefix',
        severity: 'error',
        validate: (value, fieldName, options) => {
          return validSalesforceId.validate(value, fieldName, { ...options, prefix: '001' });
        }
      });

      this.addRule('validContactId', {
        name: 'validContactId',
        description: 'Contact ID must have valid prefix',
        severity: 'error',
        validate: (value, fieldName, options) => {
          return validSalesforceId.validate(value, fieldName, { ...options, prefix: '003' });
        }
      });

      this.addRule('validOpportunityId', {
        name: 'validOpportunityId',
        description: 'Opportunity ID must have valid prefix',
        severity: 'error',
        validate: (value, fieldName, options) => {
          return validSalesforceId.validate(value, fieldName, { ...options, prefix: '006' });
        }
      });

      this.addRule('validLeadId', {
        name: 'validLeadId',
        description: 'Lead ID must have valid prefix',
        severity: 'error',
        validate: (value, fieldName, options) => {
          return validSalesforceId.validate(value, fieldName, { ...options, prefix: '00Q' });
        }
      });
    }

    if (this.platform === 'hubspot') {
      // HubSpot-specific validations
      this.addRule('validHubSpotId', {
        name: 'validHubSpotId',
        description: 'HubSpot ID must be a positive integer',
        severity: 'error',
        validate: (value, fieldName, options = {}) => {
          const { allowNull = false } = options;

          if (allowNull && (value === null || value === undefined || value === '')) {
            return { valid: true };
          }

          const numValue = parseInt(value, 10);

          if (isNaN(numValue) || numValue <= 0) {
            return {
              valid: false,
              message: `Field '${fieldName}' must be a positive integer HubSpot ID`,
              rule: 'validHubSpotId',
              severity: 'error',
              actual: value
            };
          }

          return { valid: true };
        }
      });
    }
  }

  /**
   * Add a custom validation rule
   * @param {string} name - Rule name
   * @param {Object} rule - Rule definition with validate function
   */
  addRule(name, rule) {
    if (!rule.validate || typeof rule.validate !== 'function') {
      throw new Error(`Rule '${name}' must have a validate function`);
    }

    this.rules[name] = {
      name,
      description: rule.description || `Custom rule: ${name}`,
      severity: rule.severity || 'error',
      validate: rule.validate
    };
  }

  /**
   * Validate a single field value
   * @param {*} value - Value to validate
   * @param {string} fieldName - Field name for error messages
   * @param {string|string[]} rules - Rule name(s) to apply
   * @param {Object} options - Options to pass to rules
   * @returns {Object} Validation result
   */
  validateField(value, fieldName, rules, options = {}) {
    const ruleNames = Array.isArray(rules) ? rules : [rules];
    const results = [];

    for (const ruleName of ruleNames) {
      const rule = this.rules[ruleName];

      if (!rule) {
        results.push({
          valid: false,
          message: `Unknown rule: ${ruleName}`,
          rule: ruleName,
          severity: 'error'
        });
        continue;
      }

      this.stats.totalChecks++;
      this.stats.byRule[ruleName] = (this.stats.byRule[ruleName] || 0) + 1;
      this.stats.byField[fieldName] = (this.stats.byField[fieldName] || 0) + 1;

      const result = rule.validate(value, fieldName, options);

      if (!result.valid) {
        this.stats.failed++;
        this.stats.bySeverity[result.severity || 'error']++;

        const violation = {
          timestamp: new Date().toISOString(),
          field: fieldName,
          value: this.sanitizeValue(value),
          ...result
        };

        if (this.trackViolations) {
          this.violations.push(violation);
        }

        results.push(violation);

        if (this.throwOnError && result.severity === 'error') {
          throw new DataQualityError(violation);
        }
      } else {
        this.stats.passed++;

        // Track warnings
        if (result.warning) {
          this.stats.warnings++;
          this.stats.bySeverity['info']++;

          if (this.trackViolations) {
            this.violations.push({
              timestamp: new Date().toISOString(),
              field: fieldName,
              value: this.sanitizeValue(value),
              valid: true,
              warning: result.warning,
              severity: 'info'
            });
          }
        }

        results.push(result);
      }
    }

    const hasErrors = results.some(r => !r.valid && r.severity === 'error');
    const hasWarnings = results.some(r => !r.valid && r.severity === 'warning');

    return {
      valid: !hasErrors,
      hasWarnings,
      results
    };
  }

  /**
   * Validate an object against a schema
   * @param {Object} data - Object to validate
   * @param {Object} schema - Validation schema { fieldName: { rules: [...], options: {} } }
   * @returns {Object} Validation result
   */
  validateObject(data, schema) {
    const results = {};
    let allValid = true;
    let hasWarnings = false;

    for (const [fieldName, config] of Object.entries(schema)) {
      const value = this.getNestedValue(data, fieldName);
      const rules = Array.isArray(config) ? config : (config.rules || [config.rule]);
      const options = config.options || {};

      const fieldResult = this.validateField(value, fieldName, rules, options);
      results[fieldName] = fieldResult;

      if (!fieldResult.valid) {
        allValid = false;
      }

      if (fieldResult.hasWarnings) {
        hasWarnings = true;
      }
    }

    return {
      valid: allValid,
      hasWarnings,
      results
    };
  }

  /**
   * Validate an array of objects (batch validation)
   * @param {Array} dataArray - Array of objects to validate
   * @param {Object} schema - Validation schema
   * @param {Object} options - Batch options
   * @returns {Object} Batch validation result
   */
  validateBatch(dataArray, schema, options = {}) {
    const { stopOnFirstError = false, maxErrors = 100 } = options;

    const batchResults = {
      totalRecords: dataArray.length,
      validRecords: 0,
      invalidRecords: 0,
      errors: [],
      warnings: [],
      recordResults: []
    };

    for (let i = 0; i < dataArray.length; i++) {
      const record = dataArray[i];
      const result = this.validateObject(record, schema);

      result.recordIndex = i;
      batchResults.recordResults.push(result);

      if (result.valid) {
        batchResults.validRecords++;
      } else {
        batchResults.invalidRecords++;

        // Collect errors
        for (const [fieldName, fieldResult] of Object.entries(result.results)) {
          if (!fieldResult.valid) {
            for (const violation of fieldResult.results) {
              if (!violation.valid) {
                batchResults.errors.push({
                  recordIndex: i,
                  field: fieldName,
                  ...violation
                });

                if (batchResults.errors.length >= maxErrors) {
                  batchResults.truncated = true;
                  break;
                }
              }
            }
          }
        }

        if (stopOnFirstError || batchResults.truncated) {
          break;
        }
      }

      if (result.hasWarnings) {
        for (const [fieldName, fieldResult] of Object.entries(result.results)) {
          if (fieldResult.hasWarnings) {
            for (const warning of fieldResult.results.filter(r => r.warning)) {
              batchResults.warnings.push({
                recordIndex: i,
                field: fieldName,
                warning: warning.warning
              });
            }
          }
        }
      }
    }

    batchResults.valid = batchResults.invalidRecords === 0;
    batchResults.errorRate = batchResults.totalRecords > 0
      ? (batchResults.invalidRecords / batchResults.totalRecords * 100).toFixed(2) + '%'
      : '0%';

    return batchResults;
  }

  /**
   * Get nested value from object using dot notation
   * @param {Object} obj - Source object
   * @param {string} path - Dot-notation path (e.g., 'account.name')
   * @returns {*} Value at path
   */
  getNestedValue(obj, path) {
    if (!obj || !path) return undefined;

    const parts = path.split('.');
    let current = obj;

    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }
      current = current[part];
    }

    return current;
  }

  /**
   * Sanitize value for logging (hide sensitive data)
   * @param {*} value - Value to sanitize
   * @returns {*} Sanitized value
   */
  sanitizeValue(value) {
    if (value === null || value === undefined) {
      return value;
    }

    if (typeof value === 'string') {
      // Mask potential sensitive data
      if (value.length > 50) {
        return value.substring(0, 20) + '...' + value.substring(value.length - 10);
      }

      // Check for email-like patterns
      if (/@/.test(value)) {
        const parts = value.split('@');
        return parts[0].substring(0, 2) + '***@' + parts[1];
      }
    }

    return value;
  }

  /**
   * Get current statistics
   * @returns {Object} Validation statistics
   */
  getStats() {
    return {
      ...this.stats,
      passRate: this.stats.totalChecks > 0
        ? ((this.stats.passed / this.stats.totalChecks) * 100).toFixed(2) + '%'
        : 'N/A',
      violationCount: this.violations.length
    };
  }

  /**
   * Get all recorded violations
   * @param {Object} filters - Optional filters
   * @returns {Array} Filtered violations
   */
  getViolations(filters = {}) {
    let violations = [...this.violations];

    if (filters.severity) {
      violations = violations.filter(v => v.severity === filters.severity);
    }

    if (filters.rule) {
      violations = violations.filter(v => v.rule === filters.rule);
    }

    if (filters.field) {
      violations = violations.filter(v => v.field === filters.field);
    }

    if (filters.since) {
      const sinceDate = new Date(filters.since);
      violations = violations.filter(v => new Date(v.timestamp) >= sinceDate);
    }

    return violations;
  }

  /**
   * Generate a quality report
   * @returns {Object} Quality report
   */
  generateReport() {
    const stats = this.getStats();
    const violations = this.getViolations();

    // Group violations by field
    const byField = {};
    for (const violation of violations) {
      if (!byField[violation.field]) {
        byField[violation.field] = [];
      }
      byField[violation.field].push(violation);
    }

    // Group violations by rule
    const byRule = {};
    for (const violation of violations) {
      if (!byRule[violation.rule]) {
        byRule[violation.rule] = [];
      }
      byRule[violation.rule].push(violation);
    }

    // Find most problematic fields
    const problematicFields = Object.entries(byField)
      .map(([field, violations]) => ({
        field,
        violationCount: violations.length,
        errorCount: violations.filter(v => v.severity === 'error').length,
        warningCount: violations.filter(v => v.severity === 'warning').length
      }))
      .sort((a, b) => b.violationCount - a.violationCount)
      .slice(0, 10);

    // Find most common rules violated
    const commonViolations = Object.entries(byRule)
      .map(([rule, violations]) => ({
        rule,
        count: violations.length,
        description: this.rules[rule]?.description || 'Unknown rule'
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      generated: new Date().toISOString(),
      platform: this.platform,
      summary: {
        totalChecks: stats.totalChecks,
        passRate: stats.passRate,
        totalViolations: violations.length,
        errorCount: stats.bySeverity.error,
        warningCount: stats.bySeverity.warning,
        infoCount: stats.bySeverity.info
      },
      problematicFields,
      commonViolations,
      recommendations: this.generateRecommendations(problematicFields, commonViolations),
      details: {
        byField,
        byRule
      }
    };
  }

  /**
   * Generate recommendations based on violations
   */
  generateRecommendations(problematicFields, commonViolations) {
    const recommendations = [];

    // Check for high error rates
    const stats = this.getStats();
    const passRateNum = parseFloat(stats.passRate);

    if (passRateNum < 90) {
      recommendations.push({
        priority: 'HIGH',
        type: 'data_quality',
        message: `Overall pass rate is ${stats.passRate} - consider data cleanup before processing`,
        action: 'Review and fix validation errors in source data'
      });
    }

    // Check for Salesforce ID issues
    const sfIdViolations = commonViolations.find(v => v.rule === 'validSalesforceId');
    if (sfIdViolations && sfIdViolations.count > 5) {
      recommendations.push({
        priority: 'HIGH',
        type: 'data_integrity',
        message: `${sfIdViolations.count} Salesforce ID validation failures detected`,
        action: 'Verify data source is returning real Salesforce IDs, not mock data'
      });
    }

    // Check for null required fields
    const nullViolations = commonViolations.find(v => v.rule === 'noNullRequired');
    if (nullViolations && nullViolations.count > 10) {
      recommendations.push({
        priority: 'MEDIUM',
        type: 'completeness',
        message: `${nullViolations.count} required fields are null`,
        action: 'Review data extraction to ensure required fields are populated'
      });
    }

    // Check for fake data patterns
    const fakeDataHints = this.violations.filter(v =>
      v.hint && v.hint.includes('placeholder') || v.hint && v.hint.includes('fake')
    );
    if (fakeDataHints.length > 0) {
      recommendations.push({
        priority: 'CRITICAL',
        type: 'data_authenticity',
        message: `${fakeDataHints.length} potential fake/mock data patterns detected`,
        action: 'URGENT: Verify data source is returning real data, not test/mock data'
      });
    }

    return recommendations;
  }

  /**
   * Reset statistics and violations
   */
  reset() {
    this.violations = [];
    this.stats = {
      totalChecks: 0,
      passed: 0,
      failed: 0,
      warnings: 0,
      byRule: {},
      byField: {},
      bySeverity: { error: 0, warning: 0, info: 0 }
    };
  }

  /**
   * List all available rules
   * @returns {Object[]} Rule information
   */
  listRules() {
    return Object.entries(this.rules).map(([name, rule]) => ({
      name,
      description: rule.description,
      severity: rule.severity
    }));
  }
}

// ============================================================================
// CUSTOM ERROR CLASS
// ============================================================================

class DataQualityError extends Error {
  constructor(violation) {
    super(violation.message);
    this.name = 'DataQualityError';
    this.violation = violation;
    this.field = violation.field;
    this.rule = violation.rule;
    this.severity = violation.severity;
  }
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Create a pre-configured monitor for Salesforce data
 * @param {Object} options - Additional options
 * @returns {DataQualityMonitor} Configured monitor
 */
function createSalesforceMonitor(options = {}) {
  return new DataQualityMonitor({
    ...options,
    platform: 'salesforce'
  });
}

/**
 * Create a pre-configured monitor for HubSpot data
 * @param {Object} options - Additional options
 * @returns {DataQualityMonitor} Configured monitor
 */
function createHubSpotMonitor(options = {}) {
  return new DataQualityMonitor({
    ...options,
    platform: 'hubspot'
  });
}

/**
 * Quick validation without creating a monitor instance
 * @param {*} value - Value to validate
 * @param {string} fieldName - Field name
 * @param {string} rule - Rule to apply
 * @param {Object} options - Rule options
 * @returns {Object} Validation result
 */
function quickValidate(value, fieldName, rule, options = {}) {
  const builtInRule = BUILT_IN_RULES[rule];
  if (!builtInRule) {
    return {
      valid: false,
      message: `Unknown rule: ${rule}`,
      severity: 'error'
    };
  }
  return builtInRule.validate(value, fieldName, options);
}

// ============================================================================
// CLI INTERFACE
// ============================================================================

if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  console.log('Data Quality Monitor v1.0.0\n');

  if (command === 'list-rules') {
    const monitor = new DataQualityMonitor();
    const rules = monitor.listRules();

    console.log('Available Validation Rules:\n');
    console.log('-'.repeat(80));

    for (const rule of rules) {
      console.log(`\n${rule.name}`);
      console.log(`  Description: ${rule.description}`);
      console.log(`  Default severity: ${rule.severity}`);
    }

    console.log('\n' + '-'.repeat(80));
    console.log(`\nTotal: ${rules.length} rules available`);

  } else if (command === 'validate') {
    const dataFile = args[1];
    const schemaFile = args[2];

    if (!dataFile || !schemaFile) {
      console.error('Usage: data-quality-monitor.js validate <data.json> <schema.json>');
      process.exit(1);
    }

    const fs = require('fs');

    try {
      const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
      const schema = JSON.parse(fs.readFileSync(schemaFile, 'utf8'));

      const monitor = new DataQualityMonitor({ platform: schema.platform || 'generic' });

      const isArray = Array.isArray(data);
      const result = isArray
        ? monitor.validateBatch(data, schema.fields || schema)
        : monitor.validateObject(data, schema.fields || schema);

      console.log('Validation Result:\n');
      console.log(JSON.stringify(result, null, 2));

      if (!result.valid) {
        process.exit(1);
      }

    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }

  } else if (command === 'test') {
    // Run self-test
    console.log('Running self-tests...\n');

    const monitor = new DataQualityMonitor({ platform: 'salesforce' });

    // Test validSalesforceId
    console.log('Testing validSalesforceId:');
    console.log('  Valid ID (18-char):', quickValidate('001000000000001AAA', 'testId', 'validSalesforceId'));
    console.log('  Valid ID (15-char):', quickValidate('001000000000001', 'testId', 'validSalesforceId'));
    console.log('  Invalid length:', quickValidate('001', 'testId', 'validSalesforceId'));
    console.log('  Fake ID:', quickValidate('000000000000001', 'testId', 'validSalesforceId'));

    // Test noNullRequired
    console.log('\nTesting noNullRequired:');
    console.log('  Valid value:', quickValidate('test', 'testField', 'noNullRequired'));
    console.log('  Null value:', quickValidate(null, 'testField', 'noNullRequired'));
    console.log('  Empty string:', quickValidate('', 'testField', 'noNullRequired'));

    // Test validEmail
    console.log('\nTesting validEmail:');
    console.log('  Valid email:', quickValidate('user@example.com', 'email', 'validEmail'));
    console.log('  Invalid email:', quickValidate('not-an-email', 'email', 'validEmail'));
    console.log('  Fake email:', quickValidate('test@test.com', 'email', 'validEmail'));

    // Test validPercentage
    console.log('\nTesting validPercentage:');
    console.log('  Valid percentage:', quickValidate(42.5, 'rate', 'validPercentage'));
    console.log('  Over 100:', quickValidate(150, 'rate', 'validPercentage'));
    console.log('  Round number warning:', quickValidate(50, 'rate', 'validPercentage'));

    console.log('\nSelf-tests complete.');

  } else {
    console.log('Usage: data-quality-monitor.js <command> [options]');
    console.log('\nCommands:');
    console.log('  list-rules              List all available validation rules');
    console.log('  validate <data> <schema> Validate data file against schema');
    console.log('  test                    Run self-tests');
    console.log('\nExamples:');
    console.log('  node data-quality-monitor.js list-rules');
    console.log('  node data-quality-monitor.js validate data.json schema.json');
    console.log('  node data-quality-monitor.js test');
  }
}

// ============================================================================
// MODULE EXPORTS
// ============================================================================

module.exports = {
  DataQualityMonitor,
  DataQualityError,
  createSalesforceMonitor,
  createHubSpotMonitor,
  quickValidate,
  BUILT_IN_RULES
};
