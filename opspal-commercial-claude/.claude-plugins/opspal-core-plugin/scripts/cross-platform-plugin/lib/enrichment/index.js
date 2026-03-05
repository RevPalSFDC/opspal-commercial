/**
 * Enrichment Pipeline Module
 *
 * Mira-inspired agentic enrichment system for company and contact data.
 *
 * @module enrichment
 */

'use strict';

const { ConfidenceScorer, EnrichedValue, CONFIDENCE_LEVELS, DEFAULT_BASE_SCORES, DEFAULT_MODIFIERS } = require('./confidence-scorer');
const { EarlyTerminator, TERMINATION_REASONS } = require('./early-terminator');
const { BaseEnricher, EnrichmentResult } = require('./base-enricher');
const { WebsiteEnricher, EXTRACTION_PATTERNS: WEBSITE_PATTERNS, PAGE_PATHS } = require('./website-enricher');
const { SearchEnricher, QUERY_TEMPLATES, EXTRACTION_PATTERNS: SEARCH_PATTERNS, TRUSTED_DOMAINS } = require('./search-enricher');
const { EnrichmentPipeline, EXECUTION_MODES, PIPELINE_EVENTS } = require('./enrichment-pipeline');

module.exports = {
    // Main pipeline
    EnrichmentPipeline,
    EXECUTION_MODES,
    PIPELINE_EVENTS,

    // Confidence scoring
    ConfidenceScorer,
    EnrichedValue,
    CONFIDENCE_LEVELS,
    DEFAULT_BASE_SCORES,
    DEFAULT_MODIFIERS,

    // Early termination
    EarlyTerminator,
    TERMINATION_REASONS,

    // Base classes
    BaseEnricher,
    EnrichmentResult,

    // Enrichers
    WebsiteEnricher,
    SearchEnricher,

    // Patterns and templates
    WEBSITE_PATTERNS,
    PAGE_PATHS,
    QUERY_TEMPLATES,
    SEARCH_PATTERNS,
    TRUSTED_DOMAINS
};
