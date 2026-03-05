/**
 * FlowErrorTaxonomy
 *
 * Defines error classification system for flow operations.
 * Categorizes errors as: RECOVERABLE, PERMANENT, USER_INDUCED, SYSTEM_ERROR
 * Guides retry strategies and error handling decisions.
 */

class FlowErrorTaxonomy {
    constructor() {
        this.errorClasses = this.buildErrorClasses();
    }

    /**
     * Classify an error
     */
    classify(error) {
        const message = error.message || error.toString();

        for (const errorClass of this.errorClasses) {
            if (errorClass.test(message)) {
                return {
                    class: errorClass.class,
                    category: errorClass.category,
                    retryable: errorClass.retryable,
                    maxRetries: errorClass.maxRetries,
                    severity: errorClass.severity,
                    userActionRequired: errorClass.userActionRequired,
                    description: errorClass.description,
                    originalError: message
                };
            }
        }

        // Unknown error - default to non-retryable
        return {
            class: 'UNKNOWN',
            category: 'UNKNOWN',
            retryable: false,
            maxRetries: 0,
            severity: 'HIGH',
            userActionRequired: true,
            description: 'Unknown error - manual investigation required',
            originalError: message
        };
    }

    /**
     * Build error classification system
     */
    buildErrorClasses() {
        return [
            // === RECOVERABLE ERRORS (retry with backoff) ===
            {
                class: 'RECOVERABLE',
                category: 'LOCK_CONTENTION',
                test: (msg) => /unable to lock row/i.test(msg),
                retryable: true,
                maxRetries: 5,
                severity: 'MEDIUM',
                userActionRequired: false,
                description: 'Temporary row lock - will resolve automatically'
            },

            {
                class: 'RECOVERABLE',
                category: 'QUERY_TIMEOUT',
                test: (msg) => /query.*timeout/i.test(msg),
                retryable: true,
                maxRetries: 2,
                severity: 'MEDIUM',
                userActionRequired: false,
                description: 'Query timeout - will retry with optimized query'
            },

            {
                class: 'RECOVERABLE',
                category: 'NETWORK_TIMEOUT',
                test: (msg) => /(ETIMEDOUT|ECONNRESET|connection.*timeout)/i.test(msg),
                retryable: true,
                maxRetries: 3,
                severity: 'MEDIUM',
                userActionRequired: false,
                description: 'Network issue - temporary connectivity problem'
            },

            {
                class: 'RECOVERABLE',
                category: 'RATE_LIMIT',
                test: (msg) => /rate limit exceeded/i.test(msg),
                retryable: true,
                maxRetries: 5,
                severity: 'LOW',
                userActionRequired: false,
                description: 'API rate limit - will retry with backoff'
            },

            // === PERMANENT ERRORS (do not retry) ===
            {
                class: 'PERMANENT',
                category: 'MISSING_FIELD',
                test: (msg) => /field .+ does not exist/i.test(msg),
                retryable: false,
                maxRetries: 0,
                severity: 'HIGH',
                userActionRequired: true,
                description: 'Field does not exist - deployment required'
            },

            {
                class: 'PERMANENT',
                category: 'MISSING_OBJECT',
                test: (msg) => /object .+ does not exist/i.test(msg),
                retryable: false,
                maxRetries: 0,
                severity: 'CRITICAL',
                userActionRequired: true,
                description: 'Object does not exist - metadata deployment required'
            },

            {
                class: 'PERMANENT',
                category: 'INVALID_FLOW_XML',
                test: (msg) => /(invalid xml|malformed|parse error)/i.test(msg),
                retryable: false,
                maxRetries: 0,
                severity: 'CRITICAL',
                userActionRequired: true,
                description: 'Flow XML is invalid - manual correction required'
            },

            {
                class: 'PERMANENT',
                category: 'CIRCULAR_DEPENDENCY',
                test: (msg) => /circular.*dependency/i.test(msg),
                retryable: false,
                maxRetries: 0,
                severity: 'HIGH',
                userActionRequired: true,
                description: 'Circular dependency detected - flow redesign required'
            },

            // === USER-INDUCED ERRORS (fix configuration) ===
            {
                class: 'USER_INDUCED',
                category: 'INSUFFICIENT_PERMISSION',
                test: (msg) => /insufficient.*permission/i.test(msg),
                retryable: false,
                maxRetries: 0,
                severity: 'HIGH',
                userActionRequired: true,
                description: 'User lacks required permissions - grant access'
            },

            {
                class: 'USER_INDUCED',
                category: 'VALIDATION_ERROR',
                test: (msg) => /(validation|required field|invalid value)/i.test(msg),
                retryable: false,
                maxRetries: 0,
                severity: 'MEDIUM',
                userActionRequired: true,
                description: 'Validation rule failure - fix input data'
            },

            {
                class: 'USER_INDUCED',
                category: 'DML_IN_LOOP',
                test: (msg) => /dml.*inside.*loop/i.test(msg),
                retryable: false,
                maxRetries: 0,
                severity: 'CRITICAL',
                userActionRequired: true,
                description: 'Anti-pattern detected - refactor flow design'
            },

            // === SYSTEM ERRORS (platform issues) ===
            {
                class: 'SYSTEM_ERROR',
                category: 'GOVERNOR_LIMIT',
                test: (msg) => /too many (soql|dml|cpu|heap)/i.test(msg),
                retryable: false,
                maxRetries: 0,
                severity: 'CRITICAL',
                userActionRequired: true,
                description: 'Governor limit exceeded - optimize flow'
            },

            {
                class: 'SYSTEM_ERROR',
                category: 'APEX_ERROR',
                test: (msg) => /(apex.*error|system\..*exception)/i.test(msg),
                retryable: false,
                maxRetries: 0,
                severity: 'HIGH',
                userActionRequired: true,
                description: 'Apex execution error - check Apex code'
            },

            {
                class: 'SYSTEM_ERROR',
                category: 'PLATFORM_UNAVAILABLE',
                test: (msg) => /(service unavailable|maintenance|outage)/i.test(msg),
                retryable: true,
                maxRetries: 10,
                severity: 'CRITICAL',
                userActionRequired: false,
                description: 'Salesforce platform unavailable - wait for resolution'
            }
        ];
    }

    /**
     * Get retry strategy for error
     */
    getRetryStrategy(errorClassification) {
        if (!errorClassification.retryable) {
            return {
                shouldRetry: false,
                reason: `Error class ${errorClassification.class} is not retryable`,
                recommendation: 'Fix underlying issue before retrying'
            };
        }

        return {
            shouldRetry: true,
            maxRetries: errorClassification.maxRetries,
            baseDelay: this.getBaseDelay(errorClassification.category),
            exponentialBackoff: true,
            jitter: true
        };
    }

    /**
     * Get base delay for error category
     */
    getBaseDelay(category) {
        const delays = {
            LOCK_CONTENTION: 1000,      // 1 second
            NETWORK_TIMEOUT: 2000,      // 2 seconds
            RATE_LIMIT: 5000,           // 5 seconds
            QUERY_TIMEOUT: 3000,        // 3 seconds
            PLATFORM_UNAVAILABLE: 30000 // 30 seconds
        };

        return delays[category] || 1000;
    }

    /**
     * Format error classification for logging
     */
    format(classification) {
        return `
Error Classification:
  Class: ${classification.class}
  Category: ${classification.category}
  Retryable: ${classification.retryable ? 'Yes' : 'No'}
  ${classification.retryable ? `Max Retries: ${classification.maxRetries}` : ''}
  Severity: ${classification.severity}
  User Action Required: ${classification.userActionRequired ? 'Yes' : 'No'}
  Description: ${classification.description}
        `.trim();
    }
}

module.exports = FlowErrorTaxonomy;
