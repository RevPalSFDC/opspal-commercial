/**
 * Enrichment Pipeline Module
 *
 * Mira-inspired agentic enrichment system for company and contact data.
 * Includes external data validation and identifier verification.
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

// Phase 2: External Data Enrichment components
const { EnrichmentCache, DEFAULT_TTL_BY_TYPE, DEFAULT_RATE_LIMITS } = require('./enrichment-cache');
const { IdentifierValidators, IDENTIFIER_FORMATS, VALIDATION_ENDPOINTS } = require('./identifier-validators');
const { DomainEnricher: DomainOwnershipEnricher, DOMAIN_SIGNAL_WEIGHTS } = require('./domain-enricher');
const { EnrichmentIntegration, ENRICHMENT_SIGNAL_WEIGHTS, MARKET_IDENTIFIERS } = require('./enrichment-integration');

/**
 * Create a configured enrichment pipeline
 *
 * @param {Object} options - Configuration options
 * @returns {EnrichmentPipeline} Configured enrichment pipeline
 */
function createEnrichmentPipeline(options = {}) {
  const {
    mode = EXECUTION_MODES.ADAPTIVE,
    cacheConfig = {},
    enableIdentifierValidation = true,
    enableDomainVerification = true
  } = options;

  // Create cache
  const cache = new EnrichmentCache(cacheConfig);

  // Create enrichers
  const enrichers = [
    new WebsiteEnricher({ cache })
  ];

  // Add identifier validation if enabled
  if (enableIdentifierValidation) {
    const validators = new IdentifierValidators({ cache });
    enrichers.push({
      name: 'identifier-validator',
      enrich: async (record) => {
        const results = {};
        if (record.npi) results.npi = await validators.validateNPI(record.npi);
        if (record.ein) results.ein = await validators.validateEIN(record.ein);
        if (record.duns) results.duns = await validators.validateDUNS(record.duns);
        return results;
      }
    });
  }

  // Create pipeline
  const pipeline = new EnrichmentPipeline({
    enrichers,
    mode,
    ...options
  });

  // Add integration helper
  pipeline.integration = new EnrichmentIntegration({ cache });

  return pipeline;
}

module.exports = {
    // Factory
    createEnrichmentPipeline,

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
    TRUSTED_DOMAINS,

    // Phase 2: External Data Enrichment
    // Caching layer for API responses
    EnrichmentCache,
    DEFAULT_TTL_BY_TYPE,
    DEFAULT_RATE_LIMITS,

    // Identifier validation (NPI, EIN, DUNS, FCC)
    IdentifierValidators,
    IDENTIFIER_FORMATS,
    VALIDATION_ENDPOINTS,

    // Domain ownership verification
    DomainOwnershipEnricher,
    DOMAIN_SIGNAL_WEIGHTS,

    // Integration with GeographicEntityResolver
    EnrichmentIntegration,
    ENRICHMENT_SIGNAL_WEIGHTS,
    MARKET_IDENTIFIERS
};
