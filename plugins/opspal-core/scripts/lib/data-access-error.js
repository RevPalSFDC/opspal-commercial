#!/usr/bin/env node

/**
 * DataAccessError - Custom error for data access failures
 *
 * Purpose: Enforce fail-fast behavior when data cannot be retrieved from authoritative sources.
 * Prevents returning empty arrays/objects as fallbacks, which violates the No-Mocks policy.
 *
 * Usage:
 *   const { DataAccessError } = require('./data-access-error');
 *
 *   // When API is not implemented
 *   throw new DataAccessError('API_NAME', 'Feature not yet implemented', {
 *       endpoint: '/api/v1/resource',
 *       status: 'not_implemented'
 *   });
 *
 *   // When query fails
 *   throw new DataAccessError('Salesforce', 'Query execution failed', {
 *       query: 'SELECT Id FROM Account',
 *       orgAlias: 'production',
 *       originalError: error.message
 *   });
 *
 * @module data-access-error
 * @version 1.0.0
 * @created 2025-10-26
 */

/**
 * Custom error class for data access failures
 */
class DataAccessError extends Error {
    /**
     * Create a DataAccessError
     *
     * @param {string} source - Data source name (e.g., 'Salesforce', 'HubSpot_API', 'Supabase')
     * @param {string} message - Error message describing what failed
     * @param {Object} context - Additional context about the failure
     * @param {string} [context.status] - Status code or error type
     * @param {string} [context.endpoint] - API endpoint or query that failed
     * @param {string} [context.operation] - Operation being attempted
     * @param {Object} [context.originalError] - Original error object if available
     */
    constructor(source, message, context = {}) {
        super(message);

        this.name = 'DataAccessError';
        this.source = source;
        this.context = context;
        this.timestamp = new Date().toISOString();

        // Maintains proper stack trace for where our error was thrown (only available on V8)
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, DataAccessError);
        }
    }

    /**
     * Get formatted error message for logging
     *
     * @returns {string} Formatted error message
     */
    toString() {
        const contextStr = Object.keys(this.context).length > 0
            ? `\nContext: ${JSON.stringify(this.context, null, 2)}`
            : '';

        return `${this.name} [${this.source}]: ${this.message}${contextStr}`;
    }

    /**
     * Get structured error object for JSON logging
     *
     * @returns {Object} Structured error object
     */
    toJSON() {
        return {
            name: this.name,
            source: this.source,
            message: this.message,
            context: this.context,
            timestamp: this.timestamp,
            stack: this.stack
        };
    }

    /**
     * Check if error is a DataAccessError
     *
     * @param {Error} error - Error to check
     * @returns {boolean} True if error is a DataAccessError
     */
    static isDataAccessError(error) {
        return error instanceof DataAccessError;
    }
}

module.exports = { DataAccessError };
