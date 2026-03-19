#!/usr/bin/env node

/**
 * Person-First Government Contact Classifier
 *
 * WATERFALL STRATEGY (Priority Order):
 * 1. Web Search Person (PRIMARY) - 85-95% confidence
 *    - Search for actual person: "{firstName} {lastName}" {domain} government
 *    - Extract person-specific role/department from results
 *
 * 2. Company Record Association (FALLBACK 1) - 70-85% confidence
 *    - Query HubSpot for associated Company records
 *    - Use Company.name, Company.about, Company.industry
 *
 * 3. Pattern Matching (FALLBACK 2) - 60-75% confidence
 *    - EnhancedGovClassifier with domain/title/keyword patterns
 *
 * 4. Domain-Only Classification (LAST RESORT) - 70% confidence
 *    - DomainAwareClassifier for unambiguous domains (fbi.gov, fema.gov)
 *
 * RATIONALE:
 * - Contacts are ATOMIC UNITS (not companies)
 * - Company associations are unreliable (manual or domain-matched)
 * - Government has inconsistencies with domain utilization
 * - Must verify the PERSON first (Jane Doe @lacounty.gov) before trusting entity data
 */

const path = require('path');
const { requireProtectedModule } = require('../../../opspal-core/scripts/lib/protected-asset-runtime');
const EnhancedGovClassifier = requireProtectedModule({
  pluginRoot: path.resolve(__dirname, '../..'),
  pluginName: 'opspal-hubspot',
  relativePath: 'scripts/lib/enhanced-gov-classifier.js'
});
const DomainAwareClassifier = require('./domain-aware-classifier');
const HubSpotCompanyFetcher = require('./hubspot-company-fetcher');
const WebSearchHelper = require('./web-search-helper');

// Web search functionality
const ENABLE_WEB_SEARCH = process.env.ENABLE_WEB_SEARCH !== 'false';
const WEB_SEARCH_CONFIDENCE_BOOST = 15; // Boost confidence by 15% for web-verified data

class PersonFirstClassifier {
  constructor(options = {}) {
    this.baseClassifier = new EnhancedGovClassifier();
    this.domainClassifier = new DomainAwareClassifier({
      standardThreshold: 60,
      enrichedThreshold: 50,
      useDomainMapping: true
    });
    this.companyFetcher = new HubSpotCompanyFetcher({
      enableCache: options.enableCache !== false
    });
    this.webSearchHelper = new WebSearchHelper({
      enableCache: options.enableCache !== false,
      rateLimit: options.webSearchRateLimit || 1000
    });

    // Confidence thresholds for each method
    this.thresholds = {
      webSearchPerson: options.webSearchPersonThreshold || 70,
      companyRecord: options.companyRecordThreshold || 60,
      patternMatching: options.patternMatchingThreshold || 60,
      domainOnly: options.domainOnlyThreshold || 70
    };

    // Statistics tracking
    this.stats = {
      total: 0,
      byMethod: {
        'web-search-person': 0,
        'company-record-association': 0,
        'pattern-matching': 0,
        'domain-only': 0
      },
      failures: 0
    };
  }

  /**
   * Main classification method - implements person-first waterfall
   */
  async classify(contact) {
    this.stats.total++;

    const email = (contact.email || '').toLowerCase();
    if (!email.includes('@') || !email.includes('.gov')) {
      this.stats.failures++;
      return this.unclassifiedResult('Non-government email');
    }

    const domain = email.split('@')[1];
    const firstName = contact.firstName || '';
    const lastName = contact.lastName || '';

    // PRIORITY 1: Web Search for Specific Person (PRIMARY)
    if (ENABLE_WEB_SEARCH && firstName && lastName) {
      const webSearchResult = await this.classifyViaWebSearchPerson(contact, domain);
      if (webSearchResult.classified) {
        this.stats.byMethod['web-search-person']++;
        return webSearchResult;
      }
    }

    // PRIORITY 2: Company Record Association (FALLBACK 1)
    if (contact.id) {
      const companyResult = await this.classifyViaCompanyRecord(contact);
      if (companyResult.classified) {
        this.stats.byMethod['company-record-association']++;
        return companyResult;
      }
    }

    // PRIORITY 3: Pattern Matching (FALLBACK 2)
    const patternResult = this.classifyViaPatternMatching(contact);
    if (patternResult.classified) {
      this.stats.byMethod['pattern-matching']++;
      return patternResult;
    }

    // PRIORITY 4: Domain-Only Classification (LAST RESORT)
    const domainResult = this.classifyViaDomainOnly(contact, domain);
    if (domainResult.classified) {
      this.stats.byMethod['domain-only']++;
      return domainResult;
    }

    // All methods failed
    this.stats.failures++;
    return this.unclassifiedResult('All classification methods failed');
  }

  /**
   * PRIORITY 1: Web Search for Specific Person
   *
   * Searches for: "{firstName} {lastName}" {domain} government
   * Extracts: Person-specific role, department, organization
   * Confidence: 85-95% (verified individual data)
   */
  async classifyViaWebSearchPerson(contact, domain) {
    const firstName = contact.firstName || '';
    const lastName = contact.lastName || '';

    try {
      // Perform web search for the specific person
      const searchResults = await this.webSearchHelper.searchPerson({
        firstName: firstName,
        lastName: lastName,
        email: contact.email,
        emailDomain: domain
      });

      if (searchResults.hasRelevantInfo) {
        // Enrich contact with person-specific data from web search
        const enrichedContact = {
          ...contact,
          jobTitle: searchResults.title || contact.jobTitle,
          company: searchResults.organization || contact.company,
          department: searchResults.department
        };

        // Classify with enriched data
        const classification = this.baseClassifier.classify(enrichedContact);

        // Boost confidence for web-verified data
        const boostedConfidence = Math.min(
          searchResults.confidence + WEB_SEARCH_CONFIDENCE_BOOST,
          95
        );

        if (boostedConfidence >= this.thresholds.webSearchPerson) {
          return {
            classified: true,
            bucket: classification.bucket,
            confidence: boostedConfidence,
            rationale: `Web-verified person: ${searchResults.title || 'Unknown title'} at ${searchResults.organization || 'government organization'}. ${classification.rationale}`,
            method: 'web-search-person',
            source: 'individual-verification',
            enrichedData: searchResults,
            originalConfidence: classification.confidence,
            verifiedBy: searchResults.verifiedBy
          };
        }
      }
    } catch (error) {
      console.error(`Web search failed for ${firstName} ${lastName}:`, error.message);
    }

    return { classified: false };
  }

  /**
   * PRIORITY 2: Company Record Association (FALLBACK 1)
   *
   * Queries: HubSpot /crm/v4/objects/contacts/{id}/associations/companies
   * Uses: Company.name, Company.about, Company.industry, Company.domain
   * Confidence: 70-85% (organizational context, but not person-specific)
   */
  async classifyViaCompanyRecord(contact) {
    try {
      const companyContext = await this.companyFetcher.getCompanyContext(contact.id);

      if (!companyContext.hasCompany) {
        return { classified: false };
      }

      // Enrich contact with company data
      const enrichedContact = {
        ...contact,
        company: companyContext.companyName || contact.company,
        industry: companyContext.companyIndustry,
        domain: companyContext.companyDomain
      };

      // Add company "about" text as additional context
      if (companyContext.companyAbout) {
        // Attempt to extract department/division from company about
        enrichedContact.companyAbout = companyContext.companyAbout;
      }

      // Classify with company-enriched data
      const classification = this.baseClassifier.classify(enrichedContact);

      if (classification.bucket &&
          classification.bucket !== 'Unclassified' &&
          classification.confidence >= this.thresholds.companyRecord) {
        return {
          classified: true,
          bucket: classification.bucket,
          confidence: classification.confidence,
          rationale: `Company association: ${companyContext.companyName}. ${classification.rationale}`,
          method: 'company-record-association',
          source: 'hubspot-company',
          companyName: companyContext.companyName,
          companyDomain: companyContext.companyDomain,
          originalRationale: classification.rationale
        };
      }
    } catch (error) {
      console.error(`Company fetch failed for contact ${contact.id}:`, error.message);
    }

    return { classified: false };
  }

  /**
   * PRIORITY 3: Pattern Matching (FALLBACK 2)
   *
   * Uses: EnhancedGovClassifier with domain/title/keyword patterns
   * Confidence: 60-75% (pattern-based inference)
   */
  classifyViaPatternMatching(contact) {
    const classification = this.baseClassifier.classify(contact);

    if (classification.bucket &&
        classification.bucket !== 'Unclassified' &&
        classification.confidence >= this.thresholds.patternMatching) {
      return {
        classified: true,
        bucket: classification.bucket,
        confidence: classification.confidence,
        rationale: `Pattern matching: ${classification.rationale}`,
        method: 'pattern-matching',
        source: 'enhanced-classifier',
        originalRationale: classification.rationale
      };
    }

    return { classified: false };
  }

  /**
   * PRIORITY 4: Domain-Only Classification (LAST RESORT)
   *
   * Uses: DomainAwareClassifier for unambiguous domains (fbi.gov, fema.gov)
   * Confidence: 70% (high confidence for federal domains only)
   */
  classifyViaDomainOnly(contact, domain) {
    // Only use domain-only for unambiguous federal/state domains
    const classification = this.domainClassifier.classify(contact);

    if (classification.method === 'domain-mapping' &&
        classification.confidence >= this.thresholds.domainOnly) {
      return {
        classified: true,
        bucket: classification.bucket,
        confidence: classification.confidence,
        rationale: `Domain-only: ${domain}. ${classification.rationale}`,
        method: 'domain-only',
        source: 'domain-mapping',
        domain: domain,
        originalRationale: classification.rationale
      };
    }

    return { classified: false };
  }

  /**
   * Return unclassified result
   */
  unclassifiedResult(reason) {
    return {
      classified: false,
      bucket: 'Unclassified',
      confidence: 0,
      rationale: reason,
      method: 'none',
      source: 'none'
    };
  }

  /**
   * Batch classify contacts
   */
  async classifyBatch(contacts) {
    const results = [];

    for (const contact of contacts) {
      const result = await this.classify(contact);
      results.push({
        contact,
        classification: result
      });
    }

    return results;
  }

  /**
   * Get classification statistics
   */
  getStats() {
    return {
      ...this.stats,
      successRate: this.stats.total > 0
        ? ((this.stats.total - this.stats.failures) / this.stats.total * 100).toFixed(1) + '%'
        : '0%',
      companyFetcherStats: this.companyFetcher.getCacheStats(),
      webSearchStats: this.webSearchHelper.getStats()
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      total: 0,
      byMethod: {
        'web-search-person': 0,
        'company-record-association': 0,
        'pattern-matching': 0,
        'domain-only': 0
      },
      failures: 0
    };
  }

  /**
   * Clear all caches
   */
  clearCache() {
    this.companyFetcher.clearCache();
    this.webSearchHelper.clearCache();
  }
}

module.exports = PersonFirstClassifier;
