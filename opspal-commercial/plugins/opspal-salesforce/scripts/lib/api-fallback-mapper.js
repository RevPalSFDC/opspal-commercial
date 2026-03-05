#!/usr/bin/env node
/**
 * Salesforce API Fallback Mapper
 *
 * Maps Salesforce error codes and messages to alternative API recommendations.
 * Works with api-type-router.js to provide intelligent fallback suggestions.
 *
 * @version 1.0.0
 * @author OpsPal by RevPal
 */

// ============================================================================
// ERROR PATTERN DEFINITIONS
// ============================================================================

/**
 * Error patterns mapped to API alternatives
 * Each entry contains:
 * - pattern: String or RegExp to match error message
 * - alt: Alternative API to try
 * - reason: Human-readable explanation
 * - severity: Impact level (critical, high, medium, low)
 * - retryable: Whether the operation might succeed on retry
 * - actions: Specific remediation steps
 */
const ERROR_FALLBACKS = {
    // ========================================================================
    // REST API Errors -> Alternatives
    // ========================================================================

    'REQUEST_LIMIT_EXCEEDED': {
        pattern: /REQUEST_LIMIT_EXCEEDED|api request limit/i,
        alt: 'BULK',
        reason: 'Rate limit exceeded - use async Bulk API which queues requests',
        severity: 'high',
        retryable: true,
        actions: [
            'Switch to Bulk API 2.0 for async processing',
            'Implement exponential backoff if staying with REST',
            'Check daily API usage limits'
        ]
    },

    'QUERY_TOO_COMPLICATED': {
        pattern: /QUERY_TOO_COMPLICATED|query is too complicated/i,
        alt: 'GRAPHQL',
        reason: 'Query complexity exceeds REST limits - GraphQL handles complex queries better',
        severity: 'medium',
        retryable: false,
        actions: [
            'Use GraphQL for complex multi-object queries',
            'Split query into multiple simpler queries',
            'Remove unnecessary relationship traversals'
        ]
    },

    'EXCEEDED_MAX_SEMIJOIN_SUBSELECTS': {
        pattern: /EXCEEDED_MAX_SEMIJOIN_SUBSELECTS|semi-join|subselect/i,
        alt: 'COMPOSITE',
        reason: 'Too many subqueries - split into separate queries via Composite API',
        severity: 'medium',
        retryable: false,
        actions: [
            'Break query into separate queries',
            'Use Composite API to batch the separate queries',
            'Consider restructuring data model'
        ]
    },

    'MALFORMED_QUERY': {
        pattern: /MALFORMED_QUERY|unexpected token|syntax error/i,
        alt: null,
        reason: 'SOQL syntax error - check field API names and query structure',
        severity: 'low',
        retryable: false,
        actions: [
            'Verify field API names (not labels)',
            'Check relationship names and syntax',
            'Validate date format (YYYY-MM-DD)'
        ]
    },

    'INVALID_FIELD': {
        pattern: /INVALID_FIELD|No such column|field.*does not exist/i,
        alt: 'TOOLING',
        reason: 'Field may be metadata-only or require Tooling API',
        severity: 'medium',
        retryable: false,
        actions: [
            'Verify field exists on object (sf sobject describe)',
            'Check if field requires Tooling API access',
            'Ensure field is accessible to current user'
        ]
    },

    'INVALID_SESSION_ID': {
        pattern: /INVALID_SESSION_ID|Session expired|session has expired/i,
        alt: null,
        reason: 'Session expired - reauthenticate',
        severity: 'critical',
        retryable: true,
        actions: [
            'Run sf org login to reauthenticate',
            'Check token expiration settings',
            'Verify connected app session timeout'
        ]
    },

    // ========================================================================
    // Data API Errors -> Tooling API
    // ========================================================================

    'INVALID_FIELD_FOR_INSERT_UPDATE': {
        pattern: /INVALID_FIELD_FOR_INSERT_UPDATE|cannot be edited/i,
        alt: 'TOOLING',
        reason: 'Field is read-only via REST - may be metadata-only',
        severity: 'medium',
        retryable: false,
        actions: [
            'Use Tooling API for metadata field modifications',
            'Check if field is formula or auto-number',
            'Verify field-level security settings'
        ]
    },

    'FIELD_FILTER_VALIDATION_EXCEPTION': {
        pattern: /FIELD_FILTER_VALIDATION_EXCEPTION/i,
        alt: 'TOOLING',
        reason: 'Filter not supported via REST - use Tooling API',
        severity: 'medium',
        retryable: false,
        actions: [
            'Add --use-tooling-api flag to query',
            'Use Tooling API endpoint directly',
            'Simplify filter conditions'
        ]
    },

    'ENTITY_NOT_SUPPORTED': {
        pattern: /entity.*not supported|sObject type.*is not supported/i,
        alt: 'TOOLING',
        reason: 'Object requires Tooling API - not accessible via standard REST',
        severity: 'high',
        retryable: false,
        actions: [
            'Add --use-tooling-api flag',
            'Use Tooling API REST endpoint: /services/data/vXX.0/tooling/',
            'Check if object is in Tooling API object list'
        ]
    },

    'INSUFFICIENT_ACCESS_ON_CROSS_REFERENCE_ENTITY': {
        pattern: /INSUFFICIENT_ACCESS_ON_CROSS_REFERENCE_ENTITY/i,
        alt: null,
        reason: 'Missing access to related object - check sharing rules',
        severity: 'high',
        retryable: false,
        actions: [
            'Verify access to all referenced objects',
            'Check sharing rules and OWD settings',
            'Consider running as admin user for diagnostics'
        ]
    },

    // ========================================================================
    // Bulk API Errors -> REST
    // ========================================================================

    'EXCEEDED_QUOTA': {
        pattern: /EXCEEDED_QUOTA|bulk api.*limit/i,
        alt: 'REST',
        reason: 'Bulk API daily quota exceeded - fall back to REST with smaller batches',
        severity: 'high',
        retryable: true,
        actions: [
            'Wait for quota reset (midnight UTC)',
            'Use REST API with smaller batches',
            'Optimize data to reduce record count'
        ]
    },

    'JOB_FAILED': {
        pattern: /JOB_FAILED|bulk job.*failed/i,
        alt: 'REST',
        reason: 'Bulk job failed - use REST for detailed error information',
        severity: 'medium',
        retryable: true,
        actions: [
            'Check job failure reason in Bulk API results',
            'Retry with REST for detailed field-level errors',
            'Validate data before bulk insert'
        ]
    },

    'TOO_MANY_RECORDS': {
        pattern: /TOO_MANY_RECORDS|record limit exceeded/i,
        alt: 'BULK',
        reason: 'Too many records for REST - switch to Bulk API',
        severity: 'medium',
        retryable: false,
        actions: [
            'Use Bulk API 2.0 for large datasets',
            'Split into smaller batches if using REST',
            'Consider async processing'
        ]
    },

    // ========================================================================
    // Tooling API Errors
    // ========================================================================

    'TOOLING_INVALID_SESSION': {
        pattern: /tooling.*invalid session|tooling api.*session/i,
        alt: 'REST',
        reason: 'Tooling API session issue - reauthenticate or try REST',
        severity: 'high',
        retryable: true,
        actions: [
            'Reauthenticate to Salesforce',
            'Check if object is accessible via REST',
            'Verify API version compatibility'
        ]
    },

    // ========================================================================
    // Metadata API Errors
    // ========================================================================

    'DEPLOYMENT_FAILED': {
        pattern: /DEPLOYMENT_FAILED|deployment.*failed|deploy error/i,
        alt: 'TOOLING',
        reason: 'Full metadata deployment failed - try Tooling API for individual components',
        severity: 'medium',
        retryable: true,
        actions: [
            'Check deployment status for specific errors',
            'Use Tooling API for single-component updates',
            'Verify all dependencies are included'
        ]
    },

    'UNKNOWN_EXCEPTION_DEPLOYMENT': {
        pattern: /UNKNOWN_EXCEPTION|deployment.*unknown/i,
        alt: 'TOOLING',
        reason: 'Unknown deployment error - try smaller deployment or Tooling API',
        severity: 'high',
        retryable: true,
        actions: [
            'Deploy components individually',
            'Use Tooling API for direct updates',
            'Check Salesforce status for known issues'
        ]
    },

    // ========================================================================
    // Composite API Errors
    // ========================================================================

    'TOO_MANY_SUBREQUESTS': {
        pattern: /TOO_MANY_SUBREQUESTS|subrequest.*limit|exceed.*25/i,
        alt: 'BULK',
        reason: 'Exceeded 25 subrequest limit - use Bulk API for larger batches',
        severity: 'medium',
        retryable: false,
        actions: [
            'Split into multiple Composite requests (25 each)',
            'Use Bulk API for high-volume operations',
            'Consider if all subrequests are necessary'
        ]
    },

    // ========================================================================
    // GraphQL API Errors
    // ========================================================================

    'COMPLEXITY_LIMIT': {
        pattern: /COMPLEXITY_LIMIT|graphql.*complexity|query cost/i,
        alt: 'REST',
        reason: 'GraphQL query too complex - split into multiple REST queries',
        severity: 'medium',
        retryable: false,
        actions: [
            'Reduce number of related objects in query',
            'Split into multiple smaller queries',
            'Use REST for simpler queries'
        ]
    },

    // ========================================================================
    // Specific Error Messages (Exact Match)
    // ========================================================================

    'USE_TOOLING_API': {
        pattern: /use.*--use-tooling-api|requires tooling api/i,
        alt: 'TOOLING',
        reason: 'Object explicitly requires Tooling API flag',
        severity: 'high',
        retryable: false,
        actions: [
            'Add --use-tooling-api flag to sf data query',
            'Use /services/data/vXX.0/tooling/ endpoint',
            'Check Tooling API object reference'
        ]
    },

    'UNABLE_TO_LOCK_ROW': {
        pattern: /UNABLE_TO_LOCK_ROW|record currently locked/i,
        alt: 'BULK',
        reason: 'Record lock contention - Bulk API handles locks better with FOR UPDATE',
        severity: 'medium',
        retryable: true,
        actions: [
            'Retry with exponential backoff',
            'Use Bulk API for batch updates',
            'Check for conflicting automation'
        ]
    },

    'DUPLICATE_VALUE': {
        pattern: /DUPLICATE_VALUE|duplicate.*exists/i,
        alt: null,
        reason: 'Duplicate record detected - dedupe data or use upsert',
        severity: 'medium',
        retryable: false,
        actions: [
            'Use upsert operation with external ID',
            'Deduplicate source data',
            'Check duplicate rules in org'
        ]
    }
};

// ============================================================================
// API FALLBACK MAPPER CLASS
// ============================================================================

class ApiFallbackMapper {
    constructor(options = {}) {
        this.verbose = options.verbose || process.env.SF_API_ROUTING_VERBOSE === '1';
        this.customFallbacks = options.customFallbacks || {};

        // Merge custom fallbacks
        this.fallbacks = { ...ERROR_FALLBACKS, ...this.customFallbacks };
    }

    /**
     * Suggest a fallback API based on error
     * @param {string} failedApi - The API that failed (REST, BULK, TOOLING, etc.)
     * @param {string} errorMessage - Error message or code
     * @param {Object} context - Optional context about the operation
     * @returns {Object|null} Fallback suggestion or null
     */
    suggestFallback(failedApi, errorMessage, context = {}) {
        if (!errorMessage) return null;

        // Try to match error against patterns
        for (const [key, fallback] of Object.entries(this.fallbacks)) {
            const pattern = fallback.pattern;
            const matches = typeof pattern === 'string'
                ? errorMessage.includes(pattern)
                : pattern.test(errorMessage);

            if (matches) {
                return {
                    originalApi: failedApi,
                    alternativeApi: fallback.alt,
                    reason: fallback.reason,
                    severity: fallback.severity,
                    retryable: fallback.retryable,
                    actions: fallback.actions,
                    matchedPattern: key,
                    errorMessage
                };
            }
        }

        // Generic fallback based on failed API
        return this._genericFallback(failedApi, errorMessage);
    }

    /**
     * Get all fallback suggestions for an error (multiple may apply)
     * @param {string} errorMessage - Error message
     * @returns {Array} Array of matching fallback suggestions
     */
    getAllSuggestions(errorMessage) {
        const suggestions = [];

        for (const [key, fallback] of Object.entries(this.fallbacks)) {
            const pattern = fallback.pattern;
            const matches = typeof pattern === 'string'
                ? errorMessage.includes(pattern)
                : pattern.test(errorMessage);

            if (matches) {
                suggestions.push({
                    pattern: key,
                    ...fallback
                });
            }
        }

        return suggestions;
    }

    /**
     * Check if an error is retryable
     * @param {string} errorMessage - Error message
     * @returns {boolean} Whether the operation might succeed on retry
     */
    isRetryable(errorMessage) {
        for (const fallback of Object.values(this.fallbacks)) {
            const pattern = fallback.pattern;
            const matches = typeof pattern === 'string'
                ? errorMessage.includes(pattern)
                : pattern.test(errorMessage);

            if (matches) {
                return fallback.retryable || false;
            }
        }

        // Default: rate limits and locks are retryable
        return /rate limit|lock|timeout|temporary/i.test(errorMessage);
    }

    /**
     * Get severity level for an error
     * @param {string} errorMessage - Error message
     * @returns {string} Severity level (critical, high, medium, low)
     */
    getSeverity(errorMessage) {
        for (const fallback of Object.values(this.fallbacks)) {
            const pattern = fallback.pattern;
            const matches = typeof pattern === 'string'
                ? errorMessage.includes(pattern)
                : pattern.test(errorMessage);

            if (matches) {
                return fallback.severity || 'medium';
            }
        }

        return 'medium';
    }

    /**
     * Format a user-friendly error message with suggestions
     * @param {string} failedApi - API that failed
     * @param {string} errorMessage - Original error
     * @returns {string} Formatted message with suggestions
     */
    formatErrorWithSuggestion(failedApi, errorMessage) {
        const suggestion = this.suggestFallback(failedApi, errorMessage);

        if (!suggestion) {
            return `Error with ${failedApi} API: ${errorMessage}`;
        }

        let output = `\n${'='.repeat(60)}\n`;
        output += `API ERROR - ${suggestion.severity.toUpperCase()}\n`;
        output += `${'='.repeat(60)}\n\n`;

        output += `Original Error: ${errorMessage}\n`;
        output += `Failed API: ${failedApi}\n\n`;

        if (suggestion.alternativeApi) {
            output += `SUGGESTION: Try ${suggestion.alternativeApi} API\n`;
            output += `Reason: ${suggestion.reason}\n\n`;
        } else {
            output += `Analysis: ${suggestion.reason}\n\n`;
        }

        if (suggestion.actions && suggestion.actions.length > 0) {
            output += `Recommended Actions:\n`;
            suggestion.actions.forEach((action, i) => {
                output += `  ${i + 1}. ${action}\n`;
            });
        }

        if (suggestion.retryable) {
            output += `\nThis error may be retryable after addressing the above.\n`;
        }

        output += `\n${'='.repeat(60)}\n`;

        return output;
    }

    /**
     * Generic fallback based on failed API type
     * @private
     */
    _genericFallback(failedApi, errorMessage) {
        const genericFallbacks = {
            'REST': { alt: 'BULK', reason: 'REST failed - try Bulk API for async processing' },
            'BULK': { alt: 'REST', reason: 'Bulk failed - try REST for detailed errors' },
            'TOOLING': { alt: 'REST', reason: 'Tooling failed - verify if REST API can access this object' },
            'METADATA': { alt: 'TOOLING', reason: 'Metadata deployment failed - try Tooling for individual items' },
            'GRAPHQL': { alt: 'REST', reason: 'GraphQL failed - try splitting into REST queries' },
            'COMPOSITE': { alt: 'REST', reason: 'Composite failed - try individual REST calls' }
        };

        const generic = genericFallbacks[failedApi];
        if (generic) {
            return {
                originalApi: failedApi,
                alternativeApi: generic.alt,
                reason: generic.reason,
                severity: 'medium',
                retryable: true,
                generic: true,
                errorMessage
            };
        }

        return null;
    }
}

// ============================================================================
// CLI INTERFACE
// ============================================================================

if (require.main === module) {
    const args = process.argv.slice(2);
    const action = args[0];

    const mapper = new ApiFallbackMapper();

    switch (action) {
        case 'suggest':
            // Format: api-fallback-mapper.js suggest <failed-api> <error-message>
            const failedApi = args[1] || 'REST';
            const errorMessage = args.slice(2).join(' ') || 'Unknown error';
            const suggestion = mapper.suggestFallback(failedApi, errorMessage);

            if (suggestion) {
                console.log(JSON.stringify(suggestion, null, 2));
            } else {
                console.log('No specific fallback suggestion available');
            }
            break;

        case 'format':
            // Format: api-fallback-mapper.js format <failed-api> <error-message>
            const api = args[1] || 'REST';
            const error = args.slice(2).join(' ') || 'Unknown error';
            console.log(mapper.formatErrorWithSuggestion(api, error));
            break;

        case 'list':
            // List all known error patterns
            console.log('Known Error Patterns:\n');
            for (const [key, fallback] of Object.entries(ERROR_FALLBACKS)) {
                console.log(`${key}:`);
                console.log(`  Alternative: ${fallback.alt || 'N/A'}`);
                console.log(`  Reason: ${fallback.reason}`);
                console.log(`  Severity: ${fallback.severity}`);
                console.log('');
            }
            break;

        case 'help':
        default:
            console.log(`
Salesforce API Fallback Mapper

Usage:
  api-fallback-mapper.js suggest <api> <error>   Get fallback suggestion
  api-fallback-mapper.js format <api> <error>    Get formatted error with suggestion
  api-fallback-mapper.js list                    List all known error patterns
  api-fallback-mapper.js help                    Show this help

Arguments:
  <api>     The API that failed: REST, BULK, TOOLING, METADATA, GRAPHQL, COMPOSITE
  <error>   The error message or code received

Examples:
  api-fallback-mapper.js suggest REST "REQUEST_LIMIT_EXCEEDED"
  api-fallback-mapper.js suggest REST "sObject type FlowDefinitionView is not supported"
  api-fallback-mapper.js format BULK "EXCEEDED_QUOTA daily limit"
`);
            break;
    }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    ApiFallbackMapper,
    ERROR_FALLBACKS,

    // Convenience function
    suggestFallback: (failedApi, errorMessage, context) => {
        const mapper = new ApiFallbackMapper();
        return mapper.suggestFallback(failedApi, errorMessage, context);
    }
};
