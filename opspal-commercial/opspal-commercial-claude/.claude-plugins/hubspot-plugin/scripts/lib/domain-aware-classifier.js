#!/usr/bin/env node

/**
 * Domain-Aware Government Contact Classifier
 *
 * Two-pass classification strategy:
 * 1. Pass 1: Standard classification with 60% confidence threshold
 * 2. Pass 2: For enriched federal/state domains, use domain as primary signal
 *            with lowered 50% threshold or direct domain-to-bucket mapping
 *
 * Rationale: Email domains like @fbi.gov, @cdcr.ca.gov are unambiguous
 * organizational identifiers. Even without job title, the domain alone
 * provides high inherent confidence.
 */

const EnhancedGovClassifier = require('./enhanced-gov-classifier');
const GovDomainEnricher = require('./gov-domain-enricher');

// Direct domain-to-bucket mappings for unambiguous federal/state domains
// These can be classified with very high confidence based on domain alone
const DOMAIN_BUCKET_MAP = {
  // Federal Law Enforcement
  'fbi.gov': { bucket: 'Bureau of Investigation / State Investigative Divisions', confidence: 95 },
  'atf.gov': { bucket: 'Federal Protective Service', confidence: 90 },
  'dea.gov': { bucket: 'Federal Protective Service', confidence: 90 },
  'usmarshals.gov': { bucket: 'US Marshals', confidence: 95 },

  // Federal Emergency/Homeland Security
  'fema.gov': { bucket: 'FEMA', confidence: 95 },
  'fema.dhs.gov': { bucket: 'FEMA', confidence: 95 },
  'dhs.gov': { bucket: 'DHS Sub-Agency', confidence: 85 },
  'tsa.gov': { bucket: 'DHS Sub-Agency', confidence: 90 },
  'ice.gov': { bucket: 'DHS Sub-Agency', confidence: 90 },
  'cbp.gov': { bucket: 'DHS Sub-Agency', confidence: 90 },
  'usss.gov': { bucket: 'DHS Sub-Agency', confidence: 90 },

  // Federal Transportation
  'dot.gov': { bucket: 'DOT', confidence: 85 },
  'faa.gov': { bucket: 'DOT', confidence: 85 },
  'nhtsa.gov': { bucket: 'DOT', confidence: 85 },

  // State-level patterns (partial domain matching)
  'cdcr.ca.gov': { bucket: 'DOC', confidence: 90 },
  'doj.ca.gov': { bucket: 'State AGOs', confidence: 90 },
  'dmv.ca.gov': { bucket: 'DOT', confidence: 85 },
  'chp.ca.gov': { bucket: 'Highway Patrol', confidence: 95 },
  'caloes.ca.gov': { bucket: 'State OEM', confidence: 90 }
};

class DomainAwareClassifier {
  constructor(options = {}) {
    this.baseClassifier = new EnhancedGovClassifier();
    this.enricher = new GovDomainEnricher();
    this.standardThreshold = options.standardThreshold || 60;
    this.enrichedThreshold = options.enrichedThreshold || 50;
    this.useDomainMapping = options.useDomainMapping !== false; // Default true
  }

  /**
   * Two-pass classification with domain awareness
   */
  classify(contact) {
    // Pass 1: Standard classification
    const standardResult = this.baseClassifier.classify(contact);

    // If successful with standard threshold, return immediately
    if (standardResult.bucket &&
        standardResult.bucket !== 'Unclassified' &&
        standardResult.confidence >= this.standardThreshold) {
      return {
        ...standardResult,
        method: 'standard',
        passUsed: 1
      };
    }

    // Pass 2: Try domain-aware enrichment
    const email = (contact.email || '').toLowerCase();
    if (!email.includes('@')) {
      return { ...standardResult, method: 'standard', passUsed: 1 };
    }

    const domain = email.split('@')[1];

    // Strategy 2a: Direct domain-to-bucket mapping (highest confidence)
    if (this.useDomainMapping && DOMAIN_BUCKET_MAP[domain]) {
      const mapping = DOMAIN_BUCKET_MAP[domain];
      return {
        bucket: mapping.bucket,
        confidence: mapping.confidence,
        rationale: `Direct domain mapping: ${domain} → ${mapping.bucket}`,
        method: 'domain-mapping',
        passUsed: 2,
        domainBased: true
      };
    }

    // Strategy 2b: Enrich contact and re-classify with lowered threshold
    const enriched = this.enricher.enrichContact(contact);

    if (enriched.enriched) {
      // For federal/state enrichments, trust the enrichment more
      const isFederalOrState = enriched.enrichedType === 'federal' ||
                               enriched.enrichedType === 'state';

      // Create enriched contact with derived organization
      const enrichedContact = {
        ...contact,
        company: enriched.enrichedOrganization
      };

      // Re-classify with enriched data
      const enrichedResult = this.baseClassifier.classify(enrichedContact);

      // Apply lowered threshold for federal/state domains
      const threshold = isFederalOrState ? this.enrichedThreshold : this.standardThreshold;

      if (enrichedResult.bucket &&
          enrichedResult.bucket !== 'Unclassified' &&
          enrichedResult.confidence >= threshold) {
        return {
          ...enrichedResult,
          originalConfidence: enrichedResult.confidence,
          enrichedOrganization: enriched.enrichedOrganization,
          enrichedType: enriched.enrichedType,
          thresholdUsed: threshold,
          method: isFederalOrState ? 'domain-enriched-federal-state' : 'domain-enriched',
          passUsed: 2,
          domainBased: true
        };
      }

      // Strategy 2c: For very high confidence enrichments, map to bucket directly
      if (isFederalOrState && enriched.enrichedConfidence >= 90) {
        const directBucket = this.inferBucketFromEnrichment(enriched);
        if (directBucket) {
          return {
            bucket: directBucket.bucket,
            confidence: directBucket.confidence,
            rationale: `High-confidence domain enrichment: ${enriched.enrichedOrganization}`,
            enrichedOrganization: enriched.enrichedOrganization,
            enrichedType: enriched.enrichedType,
            method: 'domain-inference',
            passUsed: 2,
            domainBased: true
          };
        }
      }
    }

    // No improvement from domain enrichment, return original
    return {
      ...standardResult,
      method: 'standard',
      passUsed: 1
    };
  }

  /**
   * Infer bucket from high-confidence domain enrichment
   */
  inferBucketFromEnrichment(enriched) {
    const org = enriched.enrichedOrganization.toLowerCase();

    // Federal patterns
    if (org.includes('federal bureau of investigation')) {
      return { bucket: 'Bureau of Investigation / State Investigative Divisions', confidence: 90 };
    }
    if (org.includes('alcohol') || org.includes('tobacco') || org.includes('firearms')) {
      return { bucket: 'Federal Protective Service', confidence: 85 };
    }
    if (org.includes('marshals')) {
      return { bucket: 'US Marshals', confidence: 90 };
    }
    if (org.includes('fema') || org.includes('federal emergency management')) {
      return { bucket: 'FEMA', confidence: 95 };
    }
    if (org.includes('homeland security') || org.includes('tsa') || org.includes('customs')) {
      return { bucket: 'DHS Sub-Agency', confidence: 85 };
    }

    // State patterns
    if (org.includes('corrections') || org.includes('cdcr')) {
      return { bucket: 'DOC', confidence: 85 };
    }
    if (org.includes('attorney general')) {
      return { bucket: 'State AGOs', confidence: 85 };
    }
    if (org.includes('highway patrol') || org.includes(' chp')) {
      return { bucket: 'Highway Patrol', confidence: 90 };
    }
    if (org.includes('motor vehicle') || org.includes(' dmv')) {
      return { bucket: 'DOT', confidence: 80 };
    }
    if (org.includes('emergency services') || org.includes('office of emergency')) {
      return { bucket: 'State OEM', confidence: 80 };
    }

    return null;
  }

  /**
   * Batch classify with domain awareness
   */
  classifyBatch(contacts) {
    return contacts.map(contact => this.classify(contact));
  }

  /**
   * Get classification with statistics
   */
  classifyWithStats(contact) {
    const result = this.classify(contact);

    return {
      ...result,
      stats: {
        domainBased: result.domainBased || false,
        passUsed: result.passUsed,
        method: result.method,
        enriched: !!result.enrichedOrganization
      }
    };
  }
}

module.exports = DomainAwareClassifier;
