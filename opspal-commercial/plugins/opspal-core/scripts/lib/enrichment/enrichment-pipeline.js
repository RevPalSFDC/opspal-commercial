/**
 * Enrichment Pipeline
 *
 * Multi-agent orchestration for data enrichment.
 * Coordinates multiple enrichers with confidence scoring,
 * early termination, and result merging.
 *
 * Inspired by the Mira agentic enrichment pattern.
 *
 * @module enrichment/enrichment-pipeline
 */

'use strict';

const fs = require('fs');
const path = require('path');

const { ConfidenceScorer, EnrichedValue } = require('./confidence-scorer');
const { EarlyTerminator, TERMINATION_REASONS } = require('./early-terminator');
const { WebsiteEnricher } = require('./website-enricher');
const { SearchEnricher } = require('./search-enricher');

/**
 * Pipeline execution modes
 */
const EXECUTION_MODES = {
    SEQUENTIAL: 'sequential',    // Run enrichers one after another
    PARALLEL: 'parallel',        // Run enrichers in parallel
    PRIORITY: 'priority'         // Run based on field priority
};

/**
 * Pipeline events
 */
const PIPELINE_EVENTS = {
    START: 'pipeline_start',
    ENRICHER_START: 'enricher_start',
    ENRICHER_COMPLETE: 'enricher_complete',
    FIELD_ENRICHED: 'field_enriched',
    ITERATION_COMPLETE: 'iteration_complete',
    TERMINATION: 'termination',
    COMPLETE: 'pipeline_complete',
    ERROR: 'error'
};

/**
 * Enrichment Pipeline class
 */
class EnrichmentPipeline {
    /**
     * Create an enrichment pipeline
     * @param {Object} options - Configuration options
     */
    constructor(options = {}) {
        // Core configuration
        this.confidenceThreshold = options.confidenceThreshold || 4;
        this.maxIterations = options.maxIterations || 3;
        this.timeout_ms = options.timeout_ms || 30000;
        this.executionMode = options.executionMode || EXECUTION_MODES.SEQUENTIAL;

        // Field configuration
        this.requiredFields = options.requiredFields || [];
        this.optionalFields = options.optionalFields || [];
        this.protectedFields = options.protectedFields || [];

        // Initialize components
        this.scorer = options.scorer || new ConfidenceScorer();
        this.terminator = new EarlyTerminator({
            confidenceThreshold: this.confidenceThreshold,
            maxIterations: this.maxIterations,
            timeout_ms: this.timeout_ms,
            requiredFields: this.requiredFields,
            optionalFields: this.optionalFields,
            ...options.terminatorOptions
        });

        // Initialize enrichers
        this.enrichers = this._initializeEnrichers(options);

        // Event handlers
        this._eventHandlers = {};

        // Load config if provided
        if (options.configPath) {
            this._loadConfig(options.configPath);
        }
    }

    /**
     * Initialize enrichers
     * @private
     */
    _initializeEnrichers(options) {
        const enricherOptions = options.enricherOptions || {};

        const enrichers = {
            website: new WebsiteEnricher({
                ...enricherOptions.website,
                scorer: this.scorer
            }),
            search: new SearchEnricher({
                ...enricherOptions.search,
                scorer: this.scorer
            })
        };

        // Add any custom enrichers
        if (options.customEnrichers) {
            for (const [name, enricher] of Object.entries(options.customEnrichers)) {
                enrichers[name] = enricher;
            }
        }

        return enrichers;
    }

    /**
     * Load configuration from file
     * @private
     */
    _loadConfig(configPath) {
        try {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

            if (config.pipeline) {
                this.confidenceThreshold = config.pipeline.confidenceThreshold || this.confidenceThreshold;
                this.maxIterations = config.pipeline.maxIterations || this.maxIterations;
                this.timeout_ms = config.pipeline.timeout_ms || this.timeout_ms;
            }

            if (config.firmographic_fields) {
                this.requiredFields = config.firmographic_fields.required || this.requiredFields;
                this.optionalFields = config.firmographic_fields.optional || this.optionalFields;
            }

            if (config.protected_fields) {
                this.protectedFields = config.protected_fields;
            }

            if (config.enrichers?.enabled) {
                for (const [name, enabled] of Object.entries(config.enrichers.enabled)) {
                    if (this.enrichers[name]) {
                        this.enrichers[name].enabled = enabled;
                    }
                }
            }

            // Update terminator with loaded config
            this.terminator.requiredFields = this.requiredFields;
            this.terminator.optionalFields = this.optionalFields;
            this.terminator.confidenceThreshold = this.confidenceThreshold;
            this.terminator.maxIterations = this.maxIterations;
            this.terminator.timeout_ms = this.timeout_ms;

        } catch (error) {
            console.warn(`Failed to load pipeline config from ${configPath}: ${error.message}`);
        }
    }

    /**
     * Enrich a record
     * @param {Object} record - The record to enrich
     * @param {Object} options - Enrichment options
     * @returns {Promise<Object>} Enrichment result
     */
    async enrich(record, options = {}) {
        const startTime = Date.now();

        // Merge options with defaults
        const targetFields = options.targetFields ||
            [...this.requiredFields, ...this.optionalFields];
        const enricherOrder = options.enricherOrder ||
            Object.keys(this.enrichers);

        // Initialize results
        const results = {};
        const enrichmentLog = [];
        let totalApiCalls = 0;
        let totalCost = 0;

        // Start terminator
        this.terminator.start();

        this._emit(PIPELINE_EVENTS.START, {
            record_id: record.id || record.Id,
            targetFields,
            enricherOrder
        });

        try {
            // Main enrichment loop
            let iteration = 0;
            let shouldContinue = true;

            while (shouldContinue) {
                iteration++;

                // Get missing fields that need enrichment
                const missingFields = this._getMissingFields(results, targetFields);
                if (missingFields.length === 0) {
                    break;
                }

                // Run enrichers
                for (const enricherName of enricherOrder) {
                    const enricher = this.enrichers[enricherName];
                    if (!enricher || !enricher.enabled) continue;

                    // Filter to fields this enricher supports
                    const enricherFields = missingFields.filter(f => enricher.canEnrich(f));
                    if (enricherFields.length === 0) continue;

                    this._emit(PIPELINE_EVENTS.ENRICHER_START, {
                        enricher: enricherName,
                        iteration,
                        targetFields: enricherFields
                    });

                    // Execute enricher
                    const enricherResult = await enricher.enrich(record, enricherFields);

                    // Record stats
                    totalApiCalls += enricherResult.apiCalls || 0;
                    totalCost += enricherResult.cost || 0;
                    this.terminator.recordApiCalls(enricherResult.apiCalls || 0, enricherResult.cost || 0);

                    // Merge results
                    this._mergeResults(results, enricherResult.fields, enricherName);

                    enrichmentLog.push({
                        iteration,
                        enricher: enricherName,
                        fieldsRequested: enricherFields,
                        fieldsEnriched: Object.keys(enricherResult.fields || {}),
                        duration_ms: enricherResult.duration_ms,
                        success: enricherResult.success
                    });

                    this._emit(PIPELINE_EVENTS.ENRICHER_COMPLETE, {
                        enricher: enricherName,
                        result: enricherResult
                    });

                    // Check early termination after each enricher
                    const termination = this.terminator.shouldStop(results);
                    if (termination.stop) {
                        this._emit(PIPELINE_EVENTS.TERMINATION, termination);
                        shouldContinue = false;
                        break;
                    }
                }

                // Record iteration
                this.terminator.recordIteration(results);

                this._emit(PIPELINE_EVENTS.ITERATION_COMPLETE, {
                    iteration,
                    fieldsEnriched: Object.keys(results).length,
                    avgConfidence: this._calculateAverageConfidence(results)
                });

                // Check termination at end of iteration
                const termination = this.terminator.shouldStop(results);
                if (termination.stop) {
                    this._emit(PIPELINE_EVENTS.TERMINATION, termination);
                    shouldContinue = false;
                }
            }

        } catch (error) {
            this._emit(PIPELINE_EVENTS.ERROR, { error: error.message });
            enrichmentLog.push({
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }

        // Build final result
        const termination = this.terminator.shouldStop(results);
        const summary = this.terminator.getSummary(results, termination);

        const finalResult = {
            success: summary.success,
            record_id: record.id || record.Id,
            enrichedRecord: this._buildEnrichedRecord(record, results),
            fields: this._serializeFields(results),
            confidence: this._calculateAverageConfidence(results),
            summary: {
                ...summary,
                duration_ms: Date.now() - startTime,
                totalApiCalls,
                totalCost
            },
            log: enrichmentLog
        };

        this._emit(PIPELINE_EVENTS.COMPLETE, finalResult);

        return finalResult;
    }

    /**
     * Enrich multiple records in batch
     * @param {Object[]} records - Records to enrich
     * @param {Object} options - Batch options
     * @returns {Promise<Object[]>} Enrichment results
     */
    async enrichBatch(records, options = {}) {
        const results = [];
        const batchSize = options.batchSize || 5;
        const concurrency = options.concurrency || 2;

        // Process in batches
        for (let i = 0; i < records.length; i += batchSize) {
            const batch = records.slice(i, i + batchSize);

            if (options.parallel && concurrency > 1) {
                // Parallel execution within batch
                const batchResults = await Promise.all(
                    batch.map(record => this.enrich(record, options))
                );
                results.push(...batchResults);
            } else {
                // Sequential execution
                for (const record of batch) {
                    const result = await this.enrich(record, options);
                    results.push(result);
                }
            }
        }

        return results;
    }

    /**
     * Get missing fields that still need enrichment
     * @private
     */
    _getMissingFields(results, targetFields) {
        return targetFields.filter(field => {
            // Skip protected fields
            if (this.protectedFields.includes(field)) return false;

            const result = results[field];
            // Field is missing if not present or below threshold
            return !result || result.confidence < this.confidenceThreshold;
        });
    }

    /**
     * Merge enricher results into main results
     * @private
     */
    _mergeResults(results, newFields, enricherName) {
        if (!newFields) return;

        for (const [field, value] of Object.entries(newFields)) {
            if (!value || value.confidence === 0) continue;

            const existing = results[field];

            if (!existing) {
                // No existing value - use new one
                results[field] = value;
                this._emit(PIPELINE_EVENTS.FIELD_ENRICHED, { field, value, enricher: enricherName });
            } else {
                // Compare and keep best
                const best = this.scorer.selectBest(existing, value);
                if (best !== existing) {
                    results[field] = best;
                    this._emit(PIPELINE_EVENTS.FIELD_ENRICHED, { field, value: best, enricher: enricherName });
                }

                // Track corroboration if values match
                if (this._valuesMatch(existing.value, value.value)) {
                    if (!results[field].corroboratedBy) {
                        results[field].corroboratedBy = [];
                    }
                    if (!results[field].corroboratedBy.includes(enricherName)) {
                        results[field].corroboratedBy.push(enricherName);
                    }
                }
            }
        }
    }

    /**
     * Check if two values match (for corroboration)
     * @private
     */
    _valuesMatch(value1, value2) {
        if (value1 === value2) return true;

        const normalize = (v) => {
            if (v === null || v === undefined) return '';
            if (typeof v === 'string') return v.toLowerCase().trim();
            if (typeof v === 'number') return String(v);
            return JSON.stringify(v);
        };

        return normalize(value1) === normalize(value2);
    }

    /**
     * Calculate average confidence across results
     * @private
     */
    _calculateAverageConfidence(results) {
        const values = Object.values(results).filter(r => r && r.confidence > 0);
        if (values.length === 0) return 0;

        const sum = values.reduce((acc, r) => acc + r.confidence, 0);
        return Math.round((sum / values.length) * 10) / 10;
    }

    /**
     * Build enriched record by merging original with enriched fields
     * @private
     */
    _buildEnrichedRecord(original, results) {
        const enriched = { ...original };

        for (const [field, enrichedValue] of Object.entries(results)) {
            if (enrichedValue && enrichedValue.confidence > 0) {
                enriched[field] = enrichedValue.value;
            }
        }

        return enriched;
    }

    /**
     * Serialize fields for JSON output
     * @private
     */
    _serializeFields(results) {
        const serialized = {};

        for (const [field, value] of Object.entries(results)) {
            if (value instanceof EnrichedValue) {
                serialized[field] = value.toJSON();
            } else if (value && typeof value.toJSON === 'function') {
                serialized[field] = value.toJSON();
            } else {
                serialized[field] = value;
            }
        }

        return serialized;
    }

    /**
     * Register event handler
     * @param {string} event - Event name
     * @param {Function} handler - Event handler
     */
    on(event, handler) {
        if (!this._eventHandlers[event]) {
            this._eventHandlers[event] = [];
        }
        this._eventHandlers[event].push(handler);
    }

    /**
     * Remove event handler
     * @param {string} event - Event name
     * @param {Function} handler - Event handler to remove
     */
    off(event, handler) {
        if (this._eventHandlers[event]) {
            this._eventHandlers[event] = this._eventHandlers[event]
                .filter(h => h !== handler);
        }
    }

    /**
     * Emit event
     * @private
     */
    _emit(event, data) {
        const handlers = this._eventHandlers[event] || [];
        for (const handler of handlers) {
            try {
                handler(data);
            } catch (error) {
                console.error(`Error in event handler for ${event}:`, error);
            }
        }
    }

    /**
     * Get enricher by name
     * @param {string} name - Enricher name
     * @returns {BaseEnricher|null}
     */
    getEnricher(name) {
        return this.enrichers[name] || null;
    }

    /**
     * Add custom enricher
     * @param {string} name - Enricher name
     * @param {BaseEnricher} enricher - Enricher instance
     */
    addEnricher(name, enricher) {
        this.enrichers[name] = enricher;
    }

    /**
     * Remove enricher
     * @param {string} name - Enricher name
     */
    removeEnricher(name) {
        delete this.enrichers[name];
    }

    /**
     * Enable/disable enricher
     * @param {string} name - Enricher name
     * @param {boolean} enabled - Enable state
     */
    setEnricherEnabled(name, enabled) {
        if (this.enrichers[name]) {
            this.enrichers[name].enabled = enabled;
        }
    }

    /**
     * Get pipeline statistics
     * @returns {Object}
     */
    getStats() {
        const enricherStats = {};
        for (const [name, enricher] of Object.entries(this.enrichers)) {
            enricherStats[name] = enricher.getStats();
        }
        return { enrichers: enricherStats };
    }

    /**
     * Reset pipeline statistics
     */
    resetStats() {
        for (const enricher of Object.values(this.enrichers)) {
            enricher.resetStats();
        }
    }

    /**
     * Get execution modes
     * @returns {Object}
     */
    static get MODES() {
        return { ...EXECUTION_MODES };
    }

    /**
     * Get pipeline events
     * @returns {Object}
     */
    static get EVENTS() {
        return { ...PIPELINE_EVENTS };
    }
}

module.exports = {
    EnrichmentPipeline,
    EXECUTION_MODES,
    PIPELINE_EVENTS
};
