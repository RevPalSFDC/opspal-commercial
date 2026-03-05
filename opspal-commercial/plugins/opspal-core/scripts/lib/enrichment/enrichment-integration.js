#!/usr/bin/env node

/**
 * Enrichment Integration
 *
 * Integrates external data enrichment with the GeographicEntityResolver
 * to boost matching confidence through:
 * - Identifier validation (NPI, EIN, DUNS, FCC Call Signs)
 * - Domain ownership verification
 * - Cross-validation of multiple data sources
 *
 * This module wraps the resolver to add enrichment signals without
 * modifying the core synchronous resolution logic.
 *
 * Usage:
 *   const { EnrichmentIntegration } = require('./enrichment/enrichment-integration');
 *   const enricher = new EnrichmentIntegration();
 *
 *   // Async resolution with enrichment
 *   const result = await enricher.resolveWithEnrichment(recordA, recordB, { market });
 */

'use strict';

const { EnrichmentCache } = require('./enrichment-cache');
const { IdentifierValidators } = require('./identifier-validators');
const { DomainEnricher } = require('./domain-enricher');

// Enrichment signal weights (boost positive, penalty negative)
const ENRICHMENT_SIGNAL_WEIGHTS = {
  // Identifier match signals (very strong positive)
  NPI_MATCH: 45,           // Same NPI = definitely same healthcare entity
  EIN_MATCH: 45,           // Same EIN = same legal entity
  DUNS_MATCH: 40,          // Same DUNS = same company
  FCC_CALLSIGN_MATCH: 40,  // Same call sign = same broadcaster

  // Identifier validation signals (moderate positive)
  BOTH_NPI_VALID: 15,      // Both have valid NPIs (confirms healthcare)
  BOTH_EIN_VALID: 15,      // Both have valid EINs (confirms registered orgs)

  // Domain ownership signals
  DOMAIN_SAME_OWNER: 35,   // Domains share ownership (very strong)
  DOMAIN_REDIRECT_CHAIN: 30, // One domain redirects to other
  DOMAIN_SHARED_IP: 20,    // Same server IP (moderate signal)

  // Negative signals
  NPI_MISMATCH: -40,       // Different valid NPIs = different entities
  EIN_MISMATCH: -40,       // Different valid EINs = different entities
  DOMAIN_DIFFERENT_OWNER: -20, // Verified different domain ownership

  // Validation failure (reduces confidence)
  ENRICHMENT_UNAVAILABLE: 0  // No penalty, just no boost
};

// Market to identifier type mapping
const MARKET_IDENTIFIERS = {
  healthcare: ['NPI', 'EIN'],
  'dental-medical': ['NPI', 'EIN'],
  nonprofit: ['EIN'],
  religious: ['EIN'],
  'media-broadcasting': ['FCC_CALLSIGN', 'EIN'],
  financial: ['EIN', 'DUNS'],
  government: ['EIN'],
  franchise: ['DUNS', 'EIN'],
  retail: ['DUNS', 'EIN'],
  technology: ['DUNS', 'EIN'],
  // All markets get domain checking
  DEFAULT: ['EIN']
};

class EnrichmentIntegration {
  constructor(options = {}) {
    // Initialize enrichment components
    this.cache = new EnrichmentCache(options.cacheOptions);
    this.validators = new IdentifierValidators({
      ...options.validatorOptions,
      cache: this.cache
    });
    this.domainEnricher = new DomainEnricher({
      ...options.domainOptions,
      cache: this.cache
    });

    // Configuration
    this.enableApiCalls = options.enableApiCalls !== false;
    this.signalWeights = { ...ENRICHMENT_SIGNAL_WEIGHTS, ...options.signalWeightOverrides };

    // Track enrichment statistics
    this.stats = {
      enrichmentsAttempted: 0,
      enrichmentsSucceeded: 0,
      signalsGenerated: 0,
      cacheHits: 0,
      apiCalls: 0
    };
  }

  /**
   * Enhance a resolution result with enrichment signals
   * @param {Object} recordA - First record
   * @param {Object} recordB - Second record
   * @param {Object} baseResult - Result from GeographicEntityResolver
   * @param {Object} options - { market, skipDomain, skipIdentifiers }
   * @returns {Promise<Object>} Enhanced result with enrichment signals
   */
  async enrichResolution(recordA, recordB, baseResult, options = {}) {
    this.stats.enrichmentsAttempted++;

    const market = options.market || baseResult.market || 'DEFAULT';
    const enrichmentSignals = [];

    try {
      // 1. Get relevant identifier types for this market
      const identifierTypes = MARKET_IDENTIFIERS[market] || MARKET_IDENTIFIERS.DEFAULT;

      // 2. Validate and compare identifiers
      if (!options.skipIdentifiers) {
        const identifierSignals = await this._enrichFromIdentifiers(
          recordA,
          recordB,
          identifierTypes
        );
        enrichmentSignals.push(...identifierSignals);
      }

      // 3. Domain ownership verification
      if (!options.skipDomain) {
        const domainSignals = await this._enrichFromDomains(recordA, recordB);
        enrichmentSignals.push(...domainSignals);
      }

      this.stats.enrichmentsSucceeded++;
      this.stats.signalsGenerated += enrichmentSignals.length;

    } catch (error) {
      // Log but don't fail - enrichment is optional
      console.warn('Enrichment error:', error.message);
      enrichmentSignals.push({
        type: 'ENRICHMENT_ERROR',
        error: error.message,
        weight: 0
      });
    }

    // Calculate enrichment score adjustment
    const enrichmentScore = enrichmentSignals.reduce((sum, s) => sum + (s.weight || 0), 0);

    // Combine with base result
    const enhancedResult = {
      ...baseResult,
      signals: [...baseResult.signals, ...enrichmentSignals],
      enrichment: {
        signalsAdded: enrichmentSignals.length,
        scoreAdjustment: enrichmentScore,
        identifiersChecked: enrichmentSignals.filter(s =>
          ['NPI_MATCH', 'EIN_MATCH', 'DUNS_MATCH', 'FCC_CALLSIGN_MATCH',
            'NPI_MISMATCH', 'EIN_MISMATCH'].includes(s.type)
        ).length > 0,
        domainChecked: enrichmentSignals.filter(s =>
          s.type.startsWith('DOMAIN_')
        ).length > 0
      }
    };

    // Recalculate confidence with enrichment
    const newConfidence = Math.max(0, Math.min(100,
      baseResult.confidence + enrichmentScore
    ));

    enhancedResult.confidence = Math.round(newConfidence);

    // Recalculate decision if confidence changed significantly
    if (enhancedResult.confidence !== baseResult.confidence) {
      enhancedResult.decision = this._recalculateDecision(
        enhancedResult.confidence,
        baseResult.market
      );
      enhancedResult.sameEntity = enhancedResult.decision === 'AUTO_MERGE' ||
        (enhancedResult.decision === 'REVIEW' && enhancedResult.confidence >= 80);
    }

    // Update explanation
    if (enrichmentSignals.length > 0) {
      const enrichmentExplanation = this._generateEnrichmentExplanation(enrichmentSignals);
      enhancedResult.explanation = `${baseResult.explanation} ${enrichmentExplanation}`;
    }

    return enhancedResult;
  }

  /**
   * Enrich from identifier validation
   * @private
   */
  async _enrichFromIdentifiers(recordA, recordB, identifierTypes) {
    const signals = [];

    for (const type of identifierTypes) {
      const idA = this._extractIdentifier(recordA, type);
      const idB = this._extractIdentifier(recordB, type);

      // Skip if neither record has this identifier
      if (!idA && !idB) continue;

      // If one has it and one doesn't, no signal (inconclusive)
      if (!idA || !idB) continue;

      // Both have the identifier - compare
      if (idA === idB) {
        // Same identifier - validate it
        const validation = await this._validateIdentifier(type, idA);

        if (validation.valid) {
          signals.push({
            type: `${type}_MATCH`,
            value: idA,
            validated: true,
            weight: this.signalWeights[`${type}_MATCH`] || 40
          });
        } else {
          // Same but invalid - still a match signal but weaker
          signals.push({
            type: `${type}_MATCH`,
            value: idA,
            validated: false,
            weight: Math.round((this.signalWeights[`${type}_MATCH`] || 40) * 0.6)
          });
        }
      } else {
        // Different identifiers
        const validationA = await this._validateIdentifier(type, idA);
        const validationB = await this._validateIdentifier(type, idB);

        // If both are valid and different, strong negative signal
        if (validationA.valid && validationB.valid) {
          signals.push({
            type: `${type}_MISMATCH`,
            valueA: idA,
            valueB: idB,
            weight: this.signalWeights[`${type}_MISMATCH`] || -40
          });
        }
      }
    }

    return signals;
  }

  /**
   * Enrich from domain verification
   * @private
   */
  async _enrichFromDomains(recordA, recordB) {
    const signals = [];

    const domainA = this._extractDomain(recordA);
    const domainB = this._extractDomain(recordB);

    // Skip if neither has domain
    if (!domainA && !domainB) return signals;

    // If one has domain and one doesn't, no signal
    if (!domainA || !domainB) return signals;

    // Same domain already handled by base resolver
    if (domainA.toLowerCase() === domainB.toLowerCase()) return signals;

    // Different domains - check ownership
    try {
      const ownership = await this.domainEnricher.domainsShareOwnership(domainA, domainB);

      if (ownership.likelySameOwner) {
        signals.push({
          type: 'DOMAIN_SAME_OWNER',
          domainA,
          domainB,
          confidence: ownership.confidence,
          evidence: ownership.signals.filter(s => s.present).map(s => s.type),
          weight: this.signalWeights.DOMAIN_SAME_OWNER
        });
      } else if (ownership.confidence < 30) {
        // Low confidence = likely different owners
        signals.push({
          type: 'DOMAIN_DIFFERENT_OWNER',
          domainA,
          domainB,
          weight: this.signalWeights.DOMAIN_DIFFERENT_OWNER
        });
      }

      // Check for redirect relationship
      if (ownership.signals.some(s => s.type === 'REDIRECT_RELATIONSHIP' && s.present)) {
        signals.push({
          type: 'DOMAIN_REDIRECT_CHAIN',
          domainA,
          domainB,
          weight: this.signalWeights.DOMAIN_REDIRECT_CHAIN
        });
      }

      // Check for shared IP
      if (ownership.signals.some(s => s.type === 'SHARED_IP' && s.present)) {
        signals.push({
          type: 'DOMAIN_SHARED_IP',
          domainA,
          domainB,
          weight: this.signalWeights.DOMAIN_SHARED_IP
        });
      }

    } catch (error) {
      // Domain enrichment failed - not critical
      console.warn(`Domain enrichment failed for ${domainA} / ${domainB}:`, error.message);
    }

    return signals;
  }

  /**
   * Extract identifier from record
   * @private
   */
  _extractIdentifier(record, type) {
    const fieldMappings = {
      NPI: ['NPI', 'npi', 'NPI__c', 'NpiNumber', 'npi_number', 'provider_npi'],
      EIN: ['EIN', 'ein', 'EIN__c', 'TaxId', 'tax_id', 'FederalTaxId', 'federal_tax_id'],
      DUNS: ['DUNS', 'duns', 'DUNS__c', 'DunsNumber', 'duns_number', 'DNBDunsNumber'],
      FCC_CALLSIGN: ['CallSign', 'call_sign', 'FCC_CallSign', 'CallSign__c', 'StationCallSign']
    };

    const fields = fieldMappings[type] || [];

    for (const field of fields) {
      if (record[field]) {
        return String(record[field]).trim();
      }
    }

    return null;
  }

  /**
   * Extract domain from record
   * @private
   */
  _extractDomain(record) {
    const fields = ['Website', 'Domain', 'domain', 'website', 'WebsiteUrl', 'website_url'];

    for (const field of fields) {
      if (record[field]) {
        const value = String(record[field]).trim();
        // Extract domain from URL if needed
        try {
          const url = value.startsWith('http') ? value : `https://${value}`;
          return new URL(url).hostname.replace(/^www\./, '');
        } catch {
          return value.replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0];
        }
      }
    }

    return null;
  }

  /**
   * Validate identifier with caching
   * @private
   */
  async _validateIdentifier(type, value) {
    // Check cache first
    const cached = this.cache.get(type, value);
    if (cached) {
      this.stats.cacheHits++;
      return cached;
    }

    // Validate based on type
    let result;

    if (!this.enableApiCalls) {
      // Local validation only
      switch (type) {
        case 'NPI':
          result = await this.validators.validateNPI(value, { skipApi: true });
          break;
        case 'EIN':
          result = await this.validators.validateEIN(value, { skipApi: true });
          break;
        case 'DUNS':
          result = await this.validators.validateDUNS(value, { skipApi: true });
          break;
        case 'FCC_CALLSIGN':
          result = await this.validators.validateCallSign(value, { skipApi: true });
          break;
        default:
          result = { valid: false, error: 'Unknown identifier type' };
      }
    } else {
      // Full validation with API
      this.stats.apiCalls++;
      switch (type) {
        case 'NPI':
          result = await this.validators.validateNPI(value);
          break;
        case 'EIN':
          result = await this.validators.validateEIN(value);
          break;
        case 'DUNS':
          result = await this.validators.validateDUNS(value);
          break;
        case 'FCC_CALLSIGN':
          result = await this.validators.validateCallSign(value);
          break;
        default:
          result = { valid: false, error: 'Unknown identifier type' };
      }
    }

    // Cache result
    this.cache.set(type, value, result);

    return result;
  }

  /**
   * Recalculate decision based on new confidence
   * @private
   */
  _recalculateDecision(confidence, market) {
    // Default thresholds (could be made market-specific)
    const thresholds = {
      autoMerge: 90,
      review: 80,
      tag: 65
    };

    if (confidence >= thresholds.autoMerge) return 'AUTO_MERGE';
    if (confidence >= thresholds.review) return 'REVIEW';
    if (confidence >= thresholds.tag) return 'TAG';
    return 'NO_MATCH';
  }

  /**
   * Generate explanation for enrichment signals
   * @private
   */
  _generateEnrichmentExplanation(signals) {
    const parts = [];

    const positives = signals.filter(s => s.weight > 0);
    const negatives = signals.filter(s => s.weight < 0);

    if (positives.length > 0) {
      const types = positives.map(s => {
        if (s.type.includes('_MATCH')) return s.type.replace('_MATCH', ' verified match');
        if (s.type === 'DOMAIN_SAME_OWNER') return 'shared domain ownership';
        if (s.type === 'DOMAIN_REDIRECT_CHAIN') return 'domain redirect relationship';
        return s.type;
      });
      parts.push(`Enrichment confirmed: ${types.join(', ')}.`);
    }

    if (negatives.length > 0) {
      const types = negatives.map(s => {
        if (s.type.includes('_MISMATCH')) return s.type.replace('_MISMATCH', ' mismatch');
        if (s.type === 'DOMAIN_DIFFERENT_OWNER') return 'different domain owners';
        return s.type;
      });
      parts.push(`Enrichment concerns: ${types.join(', ')}.`);
    }

    return parts.join(' ');
  }

  /**
   * Get enrichment statistics
   * @returns {Object} Statistics
   */
  getStats() {
    const cacheStats = this.cache.getStats();

    return {
      ...this.stats,
      cache: {
        hitRate: cacheStats.hitRate,
        entries: cacheStats.memoryEntries
      }
    };
  }

  /**
   * Cleanup resources
   */
  close() {
    this.cache.close();
  }
}

// Export
module.exports = {
  EnrichmentIntegration,
  ENRICHMENT_SIGNAL_WEIGHTS,
  MARKET_IDENTIFIERS
};

// CLI Usage
if (require.main === module) {
  const args = process.argv.slice(2);

  console.log(`
Enrichment Integration CLI

This module provides external data enrichment for the GeographicEntityResolver.

Usage with GeographicEntityResolver:
  const { GeographicEntityResolver } = require('./geographic-entity-resolver');
  const { EnrichmentIntegration } = require('./enrichment/enrichment-integration');

  const resolver = new GeographicEntityResolver();
  const enricher = new EnrichmentIntegration();

  // Get base resolution
  const baseResult = resolver.resolve(recordA, recordB, { market: 'healthcare' });

  // Enhance with enrichment (async)
  const enrichedResult = await enricher.enrichResolution(
    recordA, recordB, baseResult,
    { market: 'healthcare' }
  );

Signal Weights:
${JSON.stringify(ENRICHMENT_SIGNAL_WEIGHTS, null, 2)}

Market Identifiers:
${JSON.stringify(MARKET_IDENTIFIERS, null, 2)}
`);
}
