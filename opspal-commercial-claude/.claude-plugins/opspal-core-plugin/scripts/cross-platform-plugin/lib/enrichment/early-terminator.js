/**
 * Early Terminator
 *
 * Smart termination logic for the enrichment pipeline.
 * Determines when to stop processing based on confidence thresholds,
 * cost awareness, and field coverage requirements.
 *
 * @module enrichment/early-terminator
 */

'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Termination reasons
 */
const TERMINATION_REASONS = {
    ALL_FIELDS_CONFIDENT: 'all_required_fields_confident',
    THRESHOLD_MET: 'confidence_threshold_met',
    MAX_ITERATIONS: 'max_iterations_reached',
    MAX_API_CALLS: 'max_api_calls_reached',
    TIMEOUT: 'timeout_reached',
    NO_PROGRESS: 'no_progress_detected',
    COST_LIMIT: 'cost_limit_reached',
    USER_CANCEL: 'user_cancelled',
    ERROR: 'error_occurred',
    MANUAL: 'manual_stop'
};

/**
 * Early Terminator for enrichment pipeline
 */
class EarlyTerminator {
    /**
     * Create an early terminator
     * @param {Object} options - Configuration options
     */
    constructor(options = {}) {
        // Confidence thresholds
        this.confidenceThreshold = options.confidenceThreshold || 4;
        this.allRequiredThreshold = options.allRequiredThreshold || this.confidenceThreshold;
        this.anyRequiredThreshold = options.anyRequiredThreshold || 3;

        // Required fields
        this.requiredFields = options.requiredFields || [];
        this.optionalFields = options.optionalFields || [];

        // Limits
        this.maxIterations = options.maxIterations || 3;
        this.maxApiCalls = options.maxApiCalls || 10;
        this.timeout_ms = options.timeout_ms || 30000;
        this.minFieldsEnriched = options.minFieldsEnriched || 1;

        // Cost awareness
        this.costAware = options.costAware !== false;
        this.costLimit = options.costLimit || Infinity;

        // State tracking
        this.startTime = null;
        this.iterationCount = 0;
        this.apiCallCount = 0;
        this.totalCost = 0;
        this.previousResults = null;
        this.progressHistory = [];

        // Load from config if provided
        if (options.configPath) {
            this._loadConfig(options.configPath);
        }
    }

    /**
     * Load configuration from file
     * @private
     */
    _loadConfig(configPath) {
        try {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
            if (config.early_termination) {
                const et = config.early_termination;
                if (et.all_required_threshold) this.allRequiredThreshold = et.all_required_threshold;
                if (et.any_required_threshold) this.anyRequiredThreshold = et.any_required_threshold;
                if (et.min_fields_enriched) this.minFieldsEnriched = et.min_fields_enriched;
                if (et.cost_aware !== undefined) this.costAware = et.cost_aware;
                if (et.max_api_calls) this.maxApiCalls = et.max_api_calls;
            }
            if (config.pipeline) {
                if (config.pipeline.confidenceThreshold) {
                    this.confidenceThreshold = config.pipeline.confidenceThreshold;
                }
                if (config.pipeline.maxIterations) this.maxIterations = config.pipeline.maxIterations;
                if (config.pipeline.timeout_ms) this.timeout_ms = config.pipeline.timeout_ms;
            }
        } catch (error) {
            console.warn(`Failed to load termination config from ${configPath}: ${error.message}`);
        }
    }

    /**
     * Start tracking for a new enrichment run
     */
    start() {
        this.startTime = Date.now();
        this.iterationCount = 0;
        this.apiCallCount = 0;
        this.totalCost = 0;
        this.previousResults = null;
        this.progressHistory = [];
    }

    /**
     * Record an iteration
     * @param {Object} results - Current enrichment results
     */
    recordIteration(results) {
        this.iterationCount++;
        this.progressHistory.push({
            iteration: this.iterationCount,
            timestamp: Date.now(),
            fieldsEnriched: this._countEnrichedFields(results),
            avgConfidence: this._calculateAverageConfidence(results)
        });
        this.previousResults = results;
    }

    /**
     * Record API call(s)
     * @param {number} count - Number of API calls made
     * @param {number} cost - Cost of the calls (optional)
     */
    recordApiCalls(count = 1, cost = 0) {
        this.apiCallCount += count;
        this.totalCost += cost;
    }

    /**
     * Check if the pipeline should stop
     * @param {Object} results - Current enrichment results
     * @returns {Object} Decision with stop flag and reason
     */
    shouldStop(results) {
        // Check all conditions in priority order

        // 1. Check if all required fields meet threshold (SUCCESS)
        const allFieldsConfident = this._checkAllFieldsConfident(results);
        if (allFieldsConfident.stop) {
            return allFieldsConfident;
        }

        // 2. Check timeout
        if (this._isTimedOut()) {
            return {
                stop: true,
                reason: TERMINATION_REASONS.TIMEOUT,
                message: `Timeout reached after ${Date.now() - this.startTime}ms`,
                elapsed_ms: Date.now() - this.startTime
            };
        }

        // 3. Check max iterations
        if (this.iterationCount >= this.maxIterations) {
            return {
                stop: true,
                reason: TERMINATION_REASONS.MAX_ITERATIONS,
                message: `Maximum iterations (${this.maxIterations}) reached`,
                iterations: this.iterationCount
            };
        }

        // 4. Check max API calls
        if (this.apiCallCount >= this.maxApiCalls) {
            return {
                stop: true,
                reason: TERMINATION_REASONS.MAX_API_CALLS,
                message: `Maximum API calls (${this.maxApiCalls}) reached`,
                apiCalls: this.apiCallCount
            };
        }

        // 5. Check cost limit (if cost aware)
        if (this.costAware && this.totalCost >= this.costLimit) {
            return {
                stop: true,
                reason: TERMINATION_REASONS.COST_LIMIT,
                message: `Cost limit ($${this.costLimit}) reached`,
                totalCost: this.totalCost
            };
        }

        // 6. Check for no progress
        if (this._detectNoProgress(results)) {
            return {
                stop: true,
                reason: TERMINATION_REASONS.NO_PROGRESS,
                message: 'No progress detected in last iteration',
                iterations: this.iterationCount
            };
        }

        // Continue processing
        return {
            stop: false,
            reason: null,
            message: 'Continue enrichment',
            progress: this._getProgressSummary(results)
        };
    }

    /**
     * Check if all required fields meet confidence threshold
     * @private
     */
    _checkAllFieldsConfident(results) {
        if (!results || Object.keys(results).length === 0) {
            return { stop: false, reason: null };
        }

        const requiredStatus = this._checkFieldConfidence(results, this.requiredFields, this.allRequiredThreshold);

        if (requiredStatus.allMet) {
            return {
                stop: true,
                reason: TERMINATION_REASONS.ALL_FIELDS_CONFIDENT,
                message: 'All required fields meet confidence threshold',
                fieldStatus: requiredStatus.details,
                threshold: this.allRequiredThreshold
            };
        }

        return { stop: false, reason: null, fieldStatus: requiredStatus.details };
    }

    /**
     * Check confidence levels for a set of fields
     * @private
     */
    _checkFieldConfidence(results, fields, threshold) {
        if (!fields || fields.length === 0) {
            // If no required fields specified, check if minimum enrichment achieved
            const enrichedCount = this._countEnrichedFields(results);
            return {
                allMet: enrichedCount >= this.minFieldsEnriched,
                details: { enrichedCount, required: this.minFieldsEnriched }
            };
        }

        const details = {};
        let allMet = true;

        for (const field of fields) {
            const result = results[field];
            const confidence = result?.confidence || 0;
            const meetsThreshold = confidence >= threshold;

            details[field] = {
                confidence,
                threshold,
                met: meetsThreshold
            };

            if (!meetsThreshold) {
                allMet = false;
            }
        }

        return { allMet, details };
    }

    /**
     * Check if timeout has been reached
     * @private
     */
    _isTimedOut() {
        if (!this.startTime) return false;
        return (Date.now() - this.startTime) >= this.timeout_ms;
    }

    /**
     * Detect if no progress was made in the last iteration
     * @private
     */
    _detectNoProgress(results) {
        if (this.iterationCount < 2 || !this.previousResults) {
            return false;
        }

        const currentEnriched = this._countEnrichedFields(results);
        const previousEnriched = this._countEnrichedFields(this.previousResults);
        const currentAvgConfidence = this._calculateAverageConfidence(results);
        const previousAvgConfidence = this._calculateAverageConfidence(this.previousResults);

        // No progress if field count and confidence haven't improved
        return currentEnriched <= previousEnriched &&
               currentAvgConfidence <= previousAvgConfidence + 0.1;
    }

    /**
     * Count enriched fields (with confidence > 0)
     * @private
     */
    _countEnrichedFields(results) {
        if (!results) return 0;
        return Object.values(results).filter(r => r && r.confidence > 0).length;
    }

    /**
     * Calculate average confidence across all fields
     * @private
     */
    _calculateAverageConfidence(results) {
        if (!results) return 0;

        const values = Object.values(results).filter(r => r && r.confidence > 0);
        if (values.length === 0) return 0;

        const sum = values.reduce((acc, r) => acc + r.confidence, 0);
        return sum / values.length;
    }

    /**
     * Get progress summary
     * @private
     */
    _getProgressSummary(results) {
        const requiredStatus = this._checkFieldConfidence(
            results,
            this.requiredFields,
            this.allRequiredThreshold
        );

        return {
            iteration: this.iterationCount,
            maxIterations: this.maxIterations,
            elapsed_ms: this.startTime ? Date.now() - this.startTime : 0,
            timeout_ms: this.timeout_ms,
            apiCalls: this.apiCallCount,
            maxApiCalls: this.maxApiCalls,
            fieldsEnriched: this._countEnrichedFields(results),
            avgConfidence: this._calculateAverageConfidence(results),
            requiredFieldsStatus: requiredStatus.details,
            totalCost: this.totalCost
        };
    }

    /**
     * Get missing fields that still need enrichment
     * @param {Object} results - Current enrichment results
     * @returns {Object} Missing required and optional fields
     */
    getMissingFields(results) {
        const missing = {
            required: [],
            optional: [],
            belowThreshold: []
        };

        // Check required fields
        for (const field of this.requiredFields) {
            const result = results?.[field];
            if (!result || result.confidence === 0) {
                missing.required.push(field);
            } else if (result.confidence < this.allRequiredThreshold) {
                missing.belowThreshold.push({
                    field,
                    confidence: result.confidence,
                    needed: this.allRequiredThreshold
                });
            }
        }

        // Check optional fields
        for (const field of this.optionalFields) {
            const result = results?.[field];
            if (!result || result.confidence === 0) {
                missing.optional.push(field);
            }
        }

        return missing;
    }

    /**
     * Get fields that should be prioritized for next enrichment
     * @param {Object} results - Current enrichment results
     * @returns {string[]} Priority ordered field list
     */
    getPriorityFields(results) {
        const missing = this.getMissingFields(results);
        const priority = [];

        // First: missing required fields
        priority.push(...missing.required);

        // Second: below threshold fields (sorted by how far below)
        const belowThreshold = missing.belowThreshold
            .sort((a, b) => a.confidence - b.confidence)
            .map(f => f.field);
        priority.push(...belowThreshold);

        // Third: missing optional fields
        priority.push(...missing.optional);

        return priority;
    }

    /**
     * Estimate remaining work
     * @param {Object} results - Current enrichment results
     * @returns {Object} Estimated remaining iterations and calls
     */
    estimateRemaining(results) {
        const missing = this.getMissingFields(results);
        const totalMissing = missing.required.length + missing.belowThreshold.length;

        // Rough estimate: assume 1-2 fields enriched per iteration
        const fieldsPerIteration = this.iterationCount > 0
            ? this._countEnrichedFields(results) / this.iterationCount
            : 2;

        const estimatedIterations = Math.ceil(totalMissing / Math.max(1, fieldsPerIteration));
        const remainingIterations = Math.min(
            estimatedIterations,
            this.maxIterations - this.iterationCount
        );

        return {
            missingRequired: missing.required.length,
            belowThreshold: missing.belowThreshold.length,
            missingOptional: missing.optional.length,
            estimatedIterations: remainingIterations,
            remainingApiCalls: this.maxApiCalls - this.apiCallCount,
            remainingTime_ms: this.timeout_ms - (Date.now() - (this.startTime || Date.now())),
            canComplete: remainingIterations <= (this.maxIterations - this.iterationCount)
        };
    }

    /**
     * Get final summary after termination
     * @param {Object} results - Final enrichment results
     * @param {Object} termination - Termination decision
     * @returns {Object} Summary
     */
    getSummary(results, termination) {
        return {
            success: termination.reason === TERMINATION_REASONS.ALL_FIELDS_CONFIDENT,
            terminationReason: termination.reason,
            terminationMessage: termination.message,
            iterations: this.iterationCount,
            apiCalls: this.apiCallCount,
            elapsed_ms: this.startTime ? Date.now() - this.startTime : 0,
            totalCost: this.totalCost,
            fieldsEnriched: this._countEnrichedFields(results),
            averageConfidence: this._calculateAverageConfidence(results),
            missingFields: this.getMissingFields(results),
            progressHistory: this.progressHistory
        };
    }

    /**
     * Reset the terminator for a new run
     */
    reset() {
        this.start();
    }

    /**
     * Get all termination reasons
     * @returns {Object}
     */
    static get REASONS() {
        return { ...TERMINATION_REASONS };
    }
}

module.exports = {
    EarlyTerminator,
    TERMINATION_REASONS
};
