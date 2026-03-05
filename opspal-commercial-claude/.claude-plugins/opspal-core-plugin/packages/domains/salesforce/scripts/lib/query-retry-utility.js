#!/usr/bin/env node
/**
 * Query Retry Utility
 *
 * Provides reusable retry logic with exponential backoff for Salesforce API queries.
 * Handles transient errors, extracts error IDs, and provides consistent retry behavior
 * across all automation audit query types.
 *
 * Features:
 * - Exponential backoff (1s, 2s, 4s, 8s, ...)
 * - Configurable retry attempts
 * - Salesforce ErrorId extraction
 * - Query result validation
 * - Detailed error context tracking
 *
 * Usage:
 *   const QueryRetryUtility = require('./query-retry-utility');
 *   const retry = new QueryRetryUtility();
 *
 *   // Basic retry
 *   const result = await retry.queryWithRetry(() => executeQuery(sql));
 *
 *   // With custom options
 *   const result = await retry.queryWithRetry(() => executeQuery(sql), {
 *     maxRetries: 5,
 *     baseDelay: 2000,
 *     validateResult: (r) => r.records.length > 0
 *   });
 *
 * @version 1.0.0
 * @date 2025-10-20
 */

class QueryRetryUtility {
  /**
   * Execute query function with retry logic and exponential backoff
   *
   * @param {Function} queryFn - Async function that executes the query
   * @param {Object} options - Retry configuration options
   * @param {number} options.maxRetries - Maximum retry attempts (default: 3)
   * @param {number} options.baseDelay - Base delay in milliseconds (default: 1000)
   * @param {Function} options.validateResult - Optional result validation function
   * @param {boolean} options.logRetries - Log retry attempts (default: true)
   * @returns {Promise<any>} Query result
   * @throws {Error} If all retries exhausted
   */
  async queryWithRetry(queryFn, options = {}) {
    const maxRetries = options.maxRetries || 3;
    const baseDelay = options.baseDelay || 1000;
    const validateResult = options.validateResult || null;
    const logRetries = options.logRetries !== false;

    let lastError = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const result = await queryFn();

        // Validate result if validator provided
        if (validateResult && !validateResult(result)) {
          throw new Error('Query result validation failed');
        }

        // Success - return result
        if (attempt > 0 && logRetries) {
          console.log(`✓ Query succeeded on attempt ${attempt + 1}`);
        }

        return result;

      } catch (error) {
        lastError = error;

        // If this is the last attempt, throw the error
        if (attempt === maxRetries - 1) {
          if (logRetries) {
            console.error(`❌ Query failed after ${maxRetries} attempts`);
            console.error(`Last error: ${error.message}`);
          }
          throw this.enhanceError(error, attempt + 1);
        }

        // Log retry attempt
        if (logRetries) {
          const delay = this.calculateDelay(baseDelay, attempt);
          console.warn(`⚠️  Query attempt ${attempt + 1}/${maxRetries} failed: ${error.message}`);
          console.warn(`   Retrying in ${delay}ms...`);
        }

        // Wait before next retry (exponential backoff)
        await this.delay(this.calculateDelay(baseDelay, attempt));
      }
    }

    // Should never reach here, but just in case
    throw lastError;
  }

  /**
   * Calculate exponential backoff delay with jitter
   * Formula: baseDelay * (2 ^ attempt) + random jitter
   * Example: 1000ms → ~1s, ~2s, ~4s, ~8s, ~16s (with 0-1000ms jitter)
   *
   * Jitter prevents thundering herd problem when multiple queries retry simultaneously
   *
   * @param {number} baseDelay - Base delay in milliseconds
   * @param {number} attempt - Current attempt number (0-indexed)
   * @returns {number} Delay in milliseconds with jitter
   */
  calculateDelay(baseDelay, attempt) {
    const exponential = baseDelay * Math.pow(2, attempt);
    const jitter = Math.random() * 1000; // Add 0-1000ms jitter
    return Math.floor(exponential + jitter);
  }

  /**
   * Delay execution for specified milliseconds
   *
   * @param {number} ms - Milliseconds to delay
   * @returns {Promise<void>}
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Extract Salesforce ErrorId from error message
   * Matches patterns like:
   * - "ErrorId: 1984091204-57823"
   * - "Please include this ErrorId if you contact support: 1984091204-57823 (1408067414)"
   *
   * @param {Error|string} error - Error object or error message
   * @returns {string|null} Extracted ErrorId or null if not found
   */
  extractErrorId(error) {
    const message = typeof error === 'string' ? error : error.message || '';

    // Pattern 1: "ErrorId: XXXXX-XXXXX"
    const pattern1 = /ErrorId:\s*(\d+-\d+)/i;
    const match1 = message.match(pattern1);
    if (match1) return match1[1];

    // Pattern 2: "XXXXX-XXXXX (XXXXXXXXXX)" - full error format
    const pattern2 = /(\d+-\d+)\s*\(\d+\)/;
    const match2 = message.match(pattern2);
    if (match2) return match2[1];

    // Pattern 3: Just the error ID number
    const pattern3 = /\b(\d{10,}-\d{4,})\b/;
    const match3 = message.match(pattern3);
    if (match3) return match3[1];

    return null;
  }

  /**
   * Extract Salesforce error code from error message
   * Matches patterns like:
   * - "errorCode": "UNKNOWN_EXCEPTION"
   * - "Error Code: INVALID_FIELD"
   *
   * @param {Error|string} error - Error object or error message
   * @returns {string|null} Extracted error code or null if not found
   */
  extractErrorCode(error) {
    const message = typeof error === 'string' ? error : error.message || '';

    // Pattern 1: JSON error code
    const pattern1 = /"errorCode"\s*:\s*"([A-Z_]+)"/;
    const match1 = message.match(pattern1);
    if (match1) return match1[1];

    // Pattern 2: Text format "Error Code: XXXXX"
    const pattern2 = /Error Code:\s*([A-Z_]+)/i;
    const match2 = message.match(pattern2);
    if (match2) return match2[1];

    return null;
  }

  /**
   * Enhance error object with additional context
   *
   * @param {Error} error - Original error
   * @param {number} attempts - Number of attempts made
   * @returns {Error} Enhanced error with additional properties
   */
  enhanceError(error, attempts) {
    const enhancedError = new Error(error.message);
    enhancedError.originalError = error;
    enhancedError.attempts = attempts;
    enhancedError.errorId = this.extractErrorId(error);
    enhancedError.errorCode = this.extractErrorCode(error);
    enhancedError.stack = error.stack;

    return enhancedError;
  }

  /**
   * Classify error by type for better error handling and reporting
   *
   * @param {Error|string} error - Error to classify
   * @returns {string} Error classification
   */
  classifyError(error) {
    const message = typeof error === 'string' ? error : error.message || '';

    // Check for specific error patterns
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
   * Check if error is retryable
   * Some errors should not be retried (e.g., permission errors, invalid queries)
   *
   * @param {Error} error - Error to check
   * @returns {boolean} True if error is retryable
   */
  isRetryableError(error) {
    const message = error.message || '';
    const errorCode = this.extractErrorCode(error);

    // Non-retryable error codes
    const nonRetryableCodes = [
      'INVALID_FIELD',
      'INVALID_TYPE',
      'MALFORMED_QUERY',
      'INSUFFICIENT_ACCESS',
      'NOT_SUPPORTED',
      'INVALID_CROSS_REFERENCE_KEY'
    ];

    if (errorCode && nonRetryableCodes.includes(errorCode)) {
      return false;
    }

    // Non-retryable error messages
    const nonRetryablePatterns = [
      /not supported/i,
      /invalid field/i,
      /malformed query/i,
      /insufficient.*access/i,
      /permission/i
    ];

    for (const pattern of nonRetryablePatterns) {
      if (pattern.test(message)) {
        return false;
      }
    }

    // Default: retry unknown errors
    return true;
  }

  /**
   * Build error context object for logging and tracking
   *
   * @param {Error} error - Error object
   * @param {string} queryType - Type of query that failed
   * @param {string} component - Component name (e.g., 'Flows', 'Validation Rules')
   * @returns {Object} Error context object
   */
  buildErrorContext(error, queryType, component) {
    return {
      component,
      queryType,
      error: error.message,
      errorId: this.extractErrorId(error),
      errorCode: this.extractErrorCode(error),
      isRetryable: this.isRetryableError(error),
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = QueryRetryUtility;
