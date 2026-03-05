#!/usr/bin/env node

/**
 * Enhanced Error Recovery System
 *
 * Intelligent error handling with:
 * - Automatic retry with exponential backoff
 * - Error categorization (transient vs permanent)
 * - Integration with validation bypass
 * - Circuit breaker pattern
 * - Detailed error tracking and logging
 *
 * Usage:
 *   const { ErrorRecovery } = require('./lib/enhanced-error-recovery');
 *   const recovery = new ErrorRecovery(orgAlias);
 *
 *   const result = await recovery.executeWithRetry(async () => {
 *       return await bulkOperation();
 *   }, { maxRetries: 3, objectName: 'Contact' });
 */

const { SmartValidationBypass } = require('./smart-validation-bypass');
const { getOrgContext } = require('./org-context-injector');
const fs = require('fs');
const path = require('path');

// API Fallback Mapper integration (for API alternative suggestions)
let ApiFallbackMapper;
try {
    ApiFallbackMapper = require('./api-fallback-mapper').ApiFallbackMapper;
} catch (e) {
    ApiFallbackMapper = null;
}

// Error categories
const ErrorCategory = {
    TRANSIENT: 'transient',           // Temporary, retry likely to succeed
    VALIDATION: 'validation',         // Validation rule blocked
    RATE_LIMIT: 'rate_limit',        // API rate limit hit
    TIMEOUT: 'timeout',              // Operation timed out
    FIELD_ERROR: 'field_error',      // Field doesn't exist or invalid
    PERMISSION: 'permission',        // Insufficient permissions
    DUPLICATE: 'duplicate',          // Duplicate value violation
    REQUIRED_FIELD: 'required_field', // Required field missing
    API_MISMATCH: 'api_mismatch',    // Wrong API used for operation
    PERMANENT: 'permanent'           // Permanent error, no retry
};

// Retry strategies by error category
const RetryStrategy = {
    [ErrorCategory.TRANSIENT]: { retry: true, maxRetries: 3, backoff: 'exponential' },
    [ErrorCategory.VALIDATION]: { retry: true, maxRetries: 1, bypassValidation: true },
    [ErrorCategory.RATE_LIMIT]: { retry: true, maxRetries: 5, backoff: 'exponential', baseDelay: 5000 },
    [ErrorCategory.TIMEOUT]: { retry: true, maxRetries: 2, backoff: 'linear' },
    [ErrorCategory.FIELD_ERROR]: { retry: false },
    [ErrorCategory.PERMISSION]: { retry: false },
    [ErrorCategory.DUPLICATE]: { retry: false },
    [ErrorCategory.REQUIRED_FIELD]: { retry: false },
    [ErrorCategory.API_MISMATCH]: { retry: false, suggestAlternativeApi: true },
    [ErrorCategory.PERMANENT]: { retry: false }
};

class ErrorRecovery {
    constructor(orgAlias = null, options = {}) {
        this.orgAlias = orgAlias;
        this.options = {
            verbose: options.verbose || false,
            logErrors: options.logErrors !== false,
            circuitBreakerThreshold: options.circuitBreakerThreshold || 5,
            circuitBreakerTimeout: options.circuitBreakerTimeout || 60000, // 1 minute
            ...options
        };

        this.validationBypass = null;
        this.errorLog = [];
        this.circuitBreaker = {
            failureCount: 0,
            lastFailure: null,
            state: 'closed' // closed, open, half-open
        };
    }

    /**
     * Initialize with org context
     */
    async init() {
        if (!this.orgAlias) {
            const orgContext = await getOrgContext({ verbose: this.options.verbose });
            this.orgAlias = orgContext.alias;
        }

        this.validationBypass = new SmartValidationBypass(this.orgAlias, {
            verbose: this.options.verbose
        });
        await this.validationBypass.init();
    }

    /**
     * Execute operation with automatic retry and error recovery
     *
     * @param {Function} operation - Async function to execute
     * @param {Object} options - Execution options
     * @returns {Object} Operation result with recovery metadata
     */
    async executeWithRetry(operation, options = {}) {
        await this.init();

        const {
            maxRetries = 3,
            objectName = null,
            operationName = 'operation',
            onRetry = null,
            customErrorHandler = null
        } = options;

        // Check circuit breaker
        if (this.circuitBreaker.state === 'open') {
            const timeSinceLastFailure = Date.now() - this.circuitBreaker.lastFailure;
            if (timeSinceLastFailure < this.options.circuitBreakerTimeout) {
                throw new Error(`Circuit breaker is OPEN. Too many failures. Try again in ${Math.ceil((this.options.circuitBreakerTimeout - timeSinceLastFailure) / 1000)}s`);
            } else {
                // Move to half-open state
                this.circuitBreaker.state = 'half-open';
                if (this.options.verbose) {
                    console.log('🔄 Circuit breaker moving to HALF-OPEN state');
                }
            }
        }

        let lastError = null;
        let attempt = 0;
        const startTime = Date.now();

        while (attempt <= maxRetries) {
            try {
                if (attempt > 0 && this.options.verbose) {
                    console.log(`\n🔄 Retry attempt ${attempt}/${maxRetries}...`);
                }

                // Execute operation
                const result = await operation();

                // Success - reset circuit breaker
                if (this.circuitBreaker.failureCount > 0) {
                    this.circuitBreaker.failureCount = 0;
                    this.circuitBreaker.state = 'closed';
                    if (this.options.verbose) {
                        console.log('✅ Circuit breaker reset to CLOSED state');
                    }
                }

                const executionTime = Date.now() - startTime;

                return {
                    success: true,
                    result,
                    metadata: {
                        attempts: attempt + 1,
                        executionTime,
                        recovered: attempt > 0
                    }
                };

            } catch (error) {
                lastError = error;
                attempt++;

                // Categorize error
                const category = this.categorizeError(error);
                const strategy = RetryStrategy[category];

                if (this.options.verbose) {
                    console.log(`\n❌ Error on attempt ${attempt}:`);
                    console.log(`   Category: ${category}`);
                    console.log(`   Message: ${error.message}`);
                }

                // Log error
                this.logError({
                    operationName,
                    attempt,
                    category,
                    error: error.message,
                    stack: error.stack,
                    timestamp: new Date().toISOString()
                });

                // Check if we should retry
                if (!strategy.retry || attempt > maxRetries) {
                    // Update circuit breaker
                    this.circuitBreaker.failureCount++;
                    this.circuitBreaker.lastFailure = Date.now();

                    if (this.circuitBreaker.failureCount >= this.options.circuitBreakerThreshold) {
                        this.circuitBreaker.state = 'open';
                        if (this.options.verbose) {
                            console.log('🔴 Circuit breaker opened due to repeated failures');
                        }
                    }

                    throw error;
                }

                // Custom error handler
                if (customErrorHandler) {
                    const shouldContinue = await customErrorHandler(error, category, attempt);
                    if (!shouldContinue) {
                        throw error;
                    }
                }

                // Handle validation errors with bypass
                if (category === ErrorCategory.VALIDATION && strategy.bypassValidation && objectName) {
                    if (this.options.verbose) {
                        console.log(`   🛡️  Attempting validation bypass...`);
                    }

                    // Extract rule name from error
                    const ruleName = this.validationBypass.parseValidationError(error.message);
                    if (ruleName) {
                        // Register this rule for future operations
                        await this.validationBypass.registerNewBlockingRule(
                            ruleName,
                            objectName,
                            error.message
                        );

                        // Next retry will use validation bypass
                        continue;
                    }
                }

                // Calculate backoff delay
                const delay = this.calculateBackoff(attempt, strategy);

                if (this.options.verbose) {
                    console.log(`   ⏱️  Waiting ${delay}ms before retry...`);
                }

                // Callback before retry
                if (onRetry) {
                    await onRetry(attempt, category, delay);
                }

                // Wait before retry
                await this.sleep(delay);
            }
        }

        // All retries exhausted
        throw lastError;
    }

    /**
     * Execute bulk operation with automatic splitting on failure
     *
     * @param {Array} records - Records to process
     * @param {Function} operation - Operation to perform on records
     * @param {Object} options - Execution options
     */
    async executeWithSplitting(records, operation, options = {}) {
        const {
            maxBatchSize = 200,
            splitThreshold = 0.5, // Split batch if >50% failures
            objectName = null
        } = options;

        if (records.length === 0) {
            return { success: true, results: [] };
        }

        // Try full batch first
        try {
            const result = await this.executeWithRetry(
                () => operation(records),
                { ...options, maxRetries: 1 }
            );

            return {
                success: true,
                results: [result],
                metadata: {
                    totalRecords: records.length,
                    batches: 1,
                    splitOperations: 0
                }
            };

        } catch (error) {
            // If batch is small enough, don't split further
            if (records.length <= 10) {
                throw error;
            }

            if (this.options.verbose) {
                console.log(`\n✂️  Batch failed, splitting ${records.length} records into smaller batches...`);
            }

            // Split into smaller batches
            const batchSize = Math.ceil(records.length / 2);
            const batches = [];
            for (let i = 0; i < records.length; i += batchSize) {
                batches.push(records.slice(i, i + batchSize));
            }

            const results = [];
            let successCount = 0;
            let failureCount = 0;

            for (const batch of batches) {
                try {
                    const result = await this.executeWithSplitting(batch, operation, options);
                    results.push(result);
                    successCount += batch.length;
                } catch (batchError) {
                    failureCount += batch.length;
                    if (this.options.verbose) {
                        console.log(`   ❌ Batch of ${batch.length} failed: ${batchError.message}`);
                    }
                }
            }

            return {
                success: failureCount === 0,
                results,
                metadata: {
                    totalRecords: records.length,
                    successCount,
                    failureCount,
                    batches: batches.length,
                    splitOperations: batches.length - 1
                }
            };
        }
    }

    /**
     * Categorize error by type
     * @param {Error} error - The error to categorize
     * @param {Object} options - Optional context (apiUsed, etc.)
     * @returns {Object} Category and optional API alternative
     */
    categorizeError(error, options = {}) {
        const message = error.message.toLowerCase();
        const originalMessage = error.message;

        // Initialize result
        let result = {
            category: null,
            alternativeApi: null
        };

        // API Mismatch detection (check first as it may provide useful alternatives)
        if (message.includes('sobject type') && message.includes('not supported') ||
            message.includes('use --use-tooling-api') ||
            message.includes('entity is not supported') ||
            message.includes('query_too_complicated') ||
            message.includes('exceeded_max_semijoin') ||
            (message.includes('request limit exceeded') && options.recordCount > 200)) {

            result.category = ErrorCategory.API_MISMATCH;

            // Try to get API alternative suggestion
            if (ApiFallbackMapper) {
                const mapper = new ApiFallbackMapper();
                const currentApi = options.apiUsed || 'REST';
                result.alternativeApi = mapper.suggestFallback(currentApi, originalMessage, options);

                // Log API routing suggestion
                if (result.alternativeApi && this.options.verbose) {
                    console.log(`\n┌─────────────────────────────────────────────────────────────┐`);
                    console.log(`│ 🔀 API ALTERNATIVE SUGGESTION                               │`);
                    console.log(`├─────────────────────────────────────────────────────────────┤`);
                    console.log(`│ Current: ${currentApi} → Suggested: ${result.alternativeApi.alternativeApi || 'N/A'}`);
                    if (result.alternativeApi.reason) {
                        console.log(`│ Reason: ${result.alternativeApi.reason}`);
                    }
                    if (result.alternativeApi.actions) {
                        console.log(`│ Actions:`);
                        result.alternativeApi.actions.slice(0, 2).forEach(a => {
                            console.log(`│   • ${a}`);
                        });
                    }
                    console.log(`└─────────────────────────────────────────────────────────────┘\n`);
                }
            }

            return typeof options.returnFullResult !== 'undefined' ? result : result.category;
        }

        // Validation rule
        if (message.includes('field_custom_validation_exception') ||
            message.includes('validation rule')) {
            result.category = ErrorCategory.VALIDATION;
            return typeof options.returnFullResult !== 'undefined' ? result : result.category;
        }

        // Rate limit
        if (message.includes('request limit exceeded') ||
            message.includes('rate limit') ||
            message.includes('too many requests')) {
            result.category = ErrorCategory.RATE_LIMIT;

            // Suggest Bulk API for rate limit issues
            if (ApiFallbackMapper) {
                const mapper = new ApiFallbackMapper();
                result.alternativeApi = mapper.suggestFallback('REST', originalMessage, options);
            }

            return typeof options.returnFullResult !== 'undefined' ? result : result.category;
        }

        // Timeout
        if (message.includes('timeout') ||
            message.includes('timed out')) {
            result.category = ErrorCategory.TIMEOUT;
            return typeof options.returnFullResult !== 'undefined' ? result : result.category;
        }

        // Field errors - may need Tooling API
        if (message.includes('invalid field') ||
            message.includes('field does not exist') ||
            message.includes('no such column')) {
            result.category = ErrorCategory.FIELD_ERROR;

            // Check if Tooling API might help
            if (ApiFallbackMapper) {
                const mapper = new ApiFallbackMapper();
                result.alternativeApi = mapper.suggestFallback('REST', originalMessage, options);
            }

            return typeof options.returnFullResult !== 'undefined' ? result : result.category;
        }

        // Permission errors
        if (message.includes('insufficient access') ||
            message.includes('insufficient privileges') ||
            message.includes('permission denied')) {
            result.category = ErrorCategory.PERMISSION;
            return typeof options.returnFullResult !== 'undefined' ? result : result.category;
        }

        // Duplicate errors
        if (message.includes('duplicate value') ||
            message.includes('duplicates detected')) {
            result.category = ErrorCategory.DUPLICATE;
            return typeof options.returnFullResult !== 'undefined' ? result : result.category;
        }

        // Required field
        if (message.includes('required field missing') ||
            message.includes('required fields are missing')) {
            result.category = ErrorCategory.REQUIRED_FIELD;
            return typeof options.returnFullResult !== 'undefined' ? result : result.category;
        }

        // Transient errors (network, temporary issues)
        if (message.includes('unable to lock row') ||
            message.includes('record currently unavailable') ||
            message.includes('connection') ||
            message.includes('network')) {
            result.category = ErrorCategory.TRANSIENT;
            return typeof options.returnFullResult !== 'undefined' ? result : result.category;
        }

        // Default to permanent for unknown errors
        result.category = ErrorCategory.PERMANENT;
        return typeof options.returnFullResult !== 'undefined' ? result : result.category;
    }

    /**
     * Get API alternative suggestion for an error
     * @param {Error|string} error - Error object or message
     * @param {string} currentApi - The API that was used (REST, BULK, TOOLING, etc.)
     * @param {Object} context - Additional context
     * @returns {Object|null} Alternative API suggestion or null
     */
    getApiAlternative(error, currentApi = 'REST', context = {}) {
        if (!ApiFallbackMapper) {
            return null;
        }

        const message = typeof error === 'string' ? error : error.message;
        const mapper = new ApiFallbackMapper({ verbose: this.options.verbose });
        return mapper.suggestFallback(currentApi, message, context);
    }

    /**
     * Calculate backoff delay for retry
     */
    calculateBackoff(attempt, strategy) {
        const baseDelay = strategy.baseDelay || 1000;

        if (strategy.backoff === 'exponential') {
            // Exponential: 1s, 2s, 4s, 8s...
            return baseDelay * Math.pow(2, attempt - 1);
        } else if (strategy.backoff === 'linear') {
            // Linear: 1s, 2s, 3s, 4s...
            return baseDelay * attempt;
        } else {
            // Constant
            return baseDelay;
        }
    }

    /**
     * Log error to file and memory
     */
    logError(errorData) {
        this.errorLog.push(errorData);

        if (this.options.logErrors) {
            const logDir = path.join(__dirname, '../../logs');
            if (!fs.existsSync(logDir)) {
                fs.mkdirSync(logDir, { recursive: true });
            }

            const logFile = path.join(logDir, `error-recovery-${this.orgAlias}.log`);
            const logEntry = `[${errorData.timestamp}] ${errorData.operationName} - Attempt ${errorData.attempt} - ${errorData.category}: ${errorData.error}\n`;

            fs.appendFileSync(logFile, logEntry);
        }
    }

    /**
     * Get error statistics
     */
    getErrorStats() {
        const stats = {
            totalErrors: this.errorLog.length,
            byCategory: {},
            recentErrors: this.errorLog.slice(-10),
            circuitBreaker: {
                state: this.circuitBreaker.state,
                failureCount: this.circuitBreaker.failureCount,
                lastFailure: this.circuitBreaker.lastFailure
            }
        };

        // Count by category
        for (const error of this.errorLog) {
            stats.byCategory[error.category] = (stats.byCategory[error.category] || 0) + 1;
        }

        return stats;
    }

    /**
     * Reset circuit breaker manually
     */
    resetCircuitBreaker() {
        this.circuitBreaker.failureCount = 0;
        this.circuitBreaker.lastFailure = null;
        this.circuitBreaker.state = 'closed';

        if (this.options.verbose) {
            console.log('✅ Circuit breaker manually reset');
        }
    }

    /**
     * Sleep utility
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Generate error recovery report
     */
    generateReport() {
        const stats = this.getErrorStats();

        return `
# Error Recovery Report
**Org**: ${this.orgAlias}
**Generated**: ${new Date().toISOString()}

## Summary
- Total Errors: ${stats.totalErrors}
- Circuit Breaker State: ${stats.circuitBreaker.state}
- Failure Count: ${stats.circuitBreaker.failureCount}

## Errors by Category
${Object.entries(stats.byCategory)
    .map(([category, count]) => `- ${category}: ${count}`)
    .join('\n')}

## Recent Errors
${stats.recentErrors.map(e =>
    `- [${e.timestamp}] ${e.operationName} (${e.category}): ${e.error}`
).join('\n')}
`;
    }
}

module.exports = {
    ErrorRecovery,
    ErrorCategory,
    RetryStrategy
};

// CLI usage
if (require.main === module) {
    (async () => {
        const args = process.argv.slice(2);

        if (args.length < 2) {
            console.log('Usage: enhanced-error-recovery.js <org-alias> <command> [args...]');
            console.log('');
            console.log('Commands:');
            console.log('  stats           Show error statistics');
            console.log('  reset           Reset circuit breaker');
            console.log('  report          Generate error report');
            console.log('');
            console.log('Examples:');
            console.log('  enhanced-error-recovery.js beta-production stats');
            console.log('  enhanced-error-recovery.js beta-production reset');
            process.exit(1);
        }

        const orgAlias = args[0];
        const command = args[1];

        const recovery = new ErrorRecovery(orgAlias, { verbose: true });
        await recovery.init();

        switch (command) {
            case 'stats':
                const stats = recovery.getErrorStats();
                console.log('\n📊 Error Statistics:\n');
                console.log(JSON.stringify(stats, null, 2));
                break;

            case 'reset':
                recovery.resetCircuitBreaker();
                console.log('\n✓ Circuit breaker reset');
                break;

            case 'report':
                const report = recovery.generateReport();
                console.log(report);
                break;

            default:
                console.error(`Unknown command: ${command}`);
                process.exit(1);
        }
    })();
}
