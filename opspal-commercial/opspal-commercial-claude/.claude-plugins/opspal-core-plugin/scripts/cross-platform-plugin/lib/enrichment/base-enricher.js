/**
 * Base Enricher
 *
 * Abstract base class for all enrichment sources.
 * Provides common interface and utilities for enrichers.
 *
 * @module enrichment/base-enricher
 */

'use strict';

const { ConfidenceScorer, EnrichedValue } = require('./confidence-scorer');

/**
 * Enrichment result container
 */
class EnrichmentResult {
    /**
     * Create an enrichment result
     * @param {Object} options - Result options
     */
    constructor(options = {}) {
        this.success = options.success || false;
        this.source = options.source || 'unknown';
        this.fields = options.fields || {};
        this.errors = options.errors || [];
        this.metadata = options.metadata || {};
        this.duration_ms = options.duration_ms || 0;
        this.apiCalls = options.apiCalls || 0;
        this.cost = options.cost || 0;
        this.timestamp = new Date().toISOString();
    }

    /**
     * Add an enriched field
     * @param {string} field - Field name
     * @param {EnrichedValue} value - Enriched value
     */
    addField(field, value) {
        this.fields[field] = value;
    }

    /**
     * Add an error
     * @param {string} field - Field that failed
     * @param {string} message - Error message
     */
    addError(field, message) {
        this.errors.push({ field, message, timestamp: new Date().toISOString() });
    }

    /**
     * Check if a field was enriched
     * @param {string} field - Field name
     * @returns {boolean}
     */
    hasField(field) {
        return !!this.fields[field] && this.fields[field].confidence > 0;
    }

    /**
     * Get enriched field count
     * @returns {number}
     */
    get fieldCount() {
        return Object.keys(this.fields).filter(f => this.hasField(f)).length;
    }

    /**
     * Convert to plain object
     * @returns {Object}
     */
    toJSON() {
        const fieldsJson = {};
        for (const [key, value] of Object.entries(this.fields)) {
            fieldsJson[key] = value instanceof EnrichedValue ? value.toJSON() : value;
        }

        return {
            success: this.success,
            source: this.source,
            fields: fieldsJson,
            errors: this.errors,
            metadata: this.metadata,
            duration_ms: this.duration_ms,
            apiCalls: this.apiCalls,
            cost: this.cost,
            timestamp: this.timestamp
        };
    }
}

/**
 * Base class for enrichers
 * @abstract
 */
class BaseEnricher {
    /**
     * Create a base enricher
     * @param {Object} options - Configuration options
     */
    constructor(options = {}) {
        this.name = options.name || 'base';
        this.sourceType = options.sourceType || 'unknown';
        this.timeout_ms = options.timeout_ms || 10000;
        this.maxRetries = options.maxRetries || 2;
        this.retryDelay_ms = options.retryDelay_ms || 1000;

        this.scorer = options.scorer || new ConfidenceScorer();
        this.enabled = options.enabled !== false;

        // Rate limiting
        this.requestsPerMinute = options.requestsPerMinute || 30;
        this.concurrentRequests = options.concurrentRequests || 3;
        this._requestQueue = [];
        this._activeRequests = 0;
        this._lastRequestTime = 0;

        // Statistics
        this._stats = {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            totalDuration_ms: 0,
            fieldsEnriched: 0
        };
    }

    /**
     * Enrich a record with data from this source
     * @abstract
     * @param {Object} record - The record to enrich
     * @param {string[]} targetFields - Fields to try to enrich
     * @returns {Promise<EnrichmentResult>}
     */
    async enrich(record, targetFields) {
        throw new Error('Subclasses must implement enrich()');
    }

    /**
     * Check if this enricher can provide a specific field
     * @param {string} field - Field name
     * @returns {boolean}
     */
    canEnrich(field) {
        return this.supportedFields.includes(field);
    }

    /**
     * Get list of fields this enricher can provide
     * @abstract
     * @returns {string[]}
     */
    get supportedFields() {
        throw new Error('Subclasses must implement supportedFields getter');
    }

    /**
     * Get the source type for confidence scoring
     * @returns {string}
     */
    getSourceType() {
        return this.sourceType;
    }

    /**
     * Create an enriched value using the scorer
     * @param {*} value - The value
     * @param {Object} signals - Scoring signals
     * @returns {EnrichedValue}
     */
    createEnrichedValue(value, signals = {}) {
        return this.scorer.calculate(value, this.sourceType, signals);
    }

    /**
     * Create an empty/failed enrichment result
     * @param {string} reason - Failure reason
     * @returns {EnrichmentResult}
     */
    createEmptyResult(reason) {
        return new EnrichmentResult({
            success: false,
            source: this.name,
            metadata: { failureReason: reason }
        });
    }

    /**
     * Execute with retry logic
     * @protected
     * @param {Function} operation - Async operation to execute
     * @returns {Promise<*>}
     */
    async _executeWithRetry(operation) {
        let lastError;

        for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
            try {
                return await operation();
            } catch (error) {
                lastError = error;

                if (attempt < this.maxRetries) {
                    await this._delay(this.retryDelay_ms * Math.pow(2, attempt));
                }
            }
        }

        throw lastError;
    }

    /**
     * Rate-limited request execution
     * @protected
     * @param {Function} requestFn - Request function to execute
     * @returns {Promise<*>}
     */
    async _rateLimitedRequest(requestFn) {
        // Simple rate limiting
        const minInterval = 60000 / this.requestsPerMinute;
        const elapsed = Date.now() - this._lastRequestTime;

        if (elapsed < minInterval) {
            await this._delay(minInterval - elapsed);
        }

        // Concurrency check
        while (this._activeRequests >= this.concurrentRequests) {
            await this._delay(100);
        }

        this._activeRequests++;
        this._lastRequestTime = Date.now();
        this._stats.totalRequests++;

        try {
            const result = await requestFn();
            this._stats.successfulRequests++;
            return result;
        } catch (error) {
            this._stats.failedRequests++;
            throw error;
        } finally {
            this._activeRequests--;
        }
    }

    /**
     * Delay helper
     * @protected
     */
    async _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Extract domain from record
     * @protected
     */
    _extractDomain(record) {
        // Try various field names
        const domainFields = ['website', 'domain', 'web_url', 'company_website', 'Website'];

        for (const field of domainFields) {
            if (record[field]) {
                return this._normalizeDomain(record[field]);
            }
        }

        // Try to extract from email
        const emailFields = ['email', 'Email', 'contact_email'];
        for (const field of emailFields) {
            if (record[field]) {
                const match = record[field].match(/@([a-zA-Z0-9.-]+)/);
                if (match) {
                    return this._normalizeDomain(match[1]);
                }
            }
        }

        return null;
    }

    /**
     * Normalize a domain name
     * @protected
     */
    _normalizeDomain(domain) {
        if (!domain) return null;

        let normalized = domain
            .toLowerCase()
            .trim()
            .replace(/^https?:\/\//i, '')
            .replace(/^www\./i, '')
            .replace(/\/.*$/, '');

        return normalized || null;
    }

    /**
     * Get enricher statistics
     * @returns {Object}
     */
    getStats() {
        return {
            ...this._stats,
            averageDuration_ms: this._stats.totalRequests > 0
                ? this._stats.totalDuration_ms / this._stats.totalRequests
                : 0,
            successRate: this._stats.totalRequests > 0
                ? this._stats.successfulRequests / this._stats.totalRequests
                : 0
        };
    }

    /**
     * Reset statistics
     */
    resetStats() {
        this._stats = {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            totalDuration_ms: 0,
            fieldsEnriched: 0
        };
    }
}

module.exports = {
    BaseEnricher,
    EnrichmentResult
};
