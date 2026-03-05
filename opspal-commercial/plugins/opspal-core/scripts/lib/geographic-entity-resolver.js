#!/usr/bin/env node

/**
 * Geographic Entity Resolver
 *
 * Core orchestration layer for resolving same-name businesses across different
 * states and locations. Determines if two entities are:
 * 1. Same corporate entity with multiple locations (should match)
 * 2. Different entities that happen to share a name (should NOT match)
 *
 * Uses market-specific rules to handle industries differently:
 * - Government (strict): "City of Portland, OR" ≠ "City of Portland, ME"
 * - Franchise (loose): "McDonald's #1234" = "McDonald's #5678"
 *
 * Features:
 * - Market-specific matching policies
 * - Multi-signal confidence scoring
 * - Tiered decision workflow (AUTO_MERGE, REVIEW, TAG, NO_MATCH)
 * - Integration with existing domain-aware matching system
 * - Cross-platform support (Salesforce, HubSpot, CSV)
 *
 * Usage:
 *   const { GeographicEntityResolver } = require('./geographic-entity-resolver');
 *   const resolver = new GeographicEntityResolver();
 *
 *   const result = resolver.resolve(recordA, recordB, { market: 'franchise' });
 *   // { decision: 'AUTO_MERGE', confidence: 92, sameEntity: true, ... }
 */

'use strict';

const path = require('path');
const fs = require('fs');
const { EntityHierarchyDetector } = require('./entity-hierarchy-detector');
const { LocationNormalizer } = require('./location-normalization');

// Try to load existing matchers
let DomainAwareMatcher, DomainDetector;
try {
  DomainAwareMatcher = require('./domain-aware-matcher').DomainAwareMatcher;
} catch (e) {
  DomainAwareMatcher = null;
}
try {
  DomainDetector = require('./domain-detector').DomainDetector;
} catch (e) {
  DomainDetector = null;
}

class GeographicEntityResolver {
  constructor(options = {}) {
    this.options = options;

    // Initialize sub-components
    this.hierarchyDetector = new EntityHierarchyDetector(options);
    this.locationNormalizer = new LocationNormalizer(options);
    this.domainDetector = DomainDetector ? new DomainDetector(options) : null;
    this.domainMatcher = DomainAwareMatcher ? new DomainAwareMatcher(options) : null;

    // Load market rules
    this.marketRules = this._loadMarketRules();
    this.defaultPolicy = this.marketRules?.defaultPolicy || this._getDefaultPolicy();

    // Signal weights (can be overridden by market rules)
    this.defaultSignalWeights = {
      shared_domain: 40,
      base_name_match: 30,
      exact_name_match: 25,
      parent_pattern: 25,
      known_franchise: 20,
      abbreviation_match: 20,
      store_number_pattern: 15,
      phone_area_match: 15,
      same_industry: 10,
      state_mismatch: -30,
      different_domain: -25,
      generic_name_different_state: -50
    };

    // Common abbreviations for name matching
    this.abbreviations = {
      'pd': 'police department',
      'fd': 'fire department',
      'sd': 'sheriff department',
      'so': 'sheriff office',
      'hoa': 'homeowners association',
      'llc': 'limited liability company',
      'inc': 'incorporated',
      'corp': 'corporation',
      'dept': 'department',
      'ctr': 'center',
      'hosp': 'hospital',
      'med': 'medical',
      'mc': 'medical center',
      'rmc': 'regional medical center'
    };
  }

  /**
   * Resolve if two records represent the same entity
   * @param {Object} recordA - First record with Name, State, Domain, Phone, etc.
   * @param {Object} recordB - Second record
   * @param {Object} options - { market, forcePolicy }
   * @returns {Object} Resolution result
   */
  resolve(recordA, recordB, options = {}) {
    // Normalize records
    const normA = this._normalizeRecord(recordA);
    const normB = this._normalizeRecord(recordB);

    // Detect market if not provided
    const market = options.market || this._detectMarket(normA, normB);
    const marketConfig = this._getMarketConfig(market);

    // Calculate all signals
    const signals = this._calculateSignals(normA, normB, market, marketConfig);

    // Calculate total score
    const signalWeights = marketConfig.signalWeights || this.defaultSignalWeights;
    let score = this._calculateScore(signals, signalWeights);

    // Apply market policy adjustments
    const policyResult = this._applyMarketPolicy(normA, normB, score, signals, market, marketConfig);
    score = policyResult.adjustedScore;
    if (policyResult.additionalSignals) {
      signals.push(...policyResult.additionalSignals);
    }

    // Determine decision based on thresholds
    const thresholds = marketConfig.confidenceThresholds || this.defaultPolicy.confidenceThresholds;
    const decision = this._classifyDecision(score, thresholds, policyResult.blocked);

    // Generate explanation
    const explanation = this._generateExplanation(signals, decision, market);

    return {
      decision,
      confidence: Math.max(0, Math.min(100, Math.round(score))),
      sameEntity: decision === 'AUTO_MERGE' || (decision === 'REVIEW' && score >= 80),
      market,
      signals,
      explanation,
      recommendation: this._getRecommendation(decision, signals),
      recordA: {
        name: normA.name,
        state: normA.state,
        domain: normA.domain,
        baseName: normA.baseName
      },
      recordB: {
        name: normB.name,
        state: normB.state,
        domain: normB.domain,
        baseName: normB.baseName
      }
    };
  }

  /**
   * Batch resolve multiple record pairs
   * @param {Array} pairs - Array of { recordA, recordB } objects
   * @param {Object} options - Resolution options
   * @returns {Array} Array of resolution results
   */
  batchResolve(pairs, options = {}) {
    return pairs.map(pair => this.resolve(pair.recordA, pair.recordB, options));
  }

  /**
   * Find potential matches for a source record in a target list
   * @param {Object} source - Source record
   * @param {Array} targets - Array of target records
   * @param {Object} options - { market, minConfidence }
   * @returns {Array} Sorted matches above threshold
   */
  findMatches(source, targets, options = {}) {
    const minConfidence = options.minConfidence || 50;
    const matches = [];

    for (const target of targets) {
      const result = this.resolve(source, target, options);
      if (result.confidence >= minConfidence) {
        matches.push({
          target,
          ...result
        });
      }
    }

    // Sort by confidence descending
    matches.sort((a, b) => b.confidence - a.confidence);
    return matches;
  }

  /**
   * Normalize a record for processing
   * @private
   */
  _normalizeRecord(record) {
    if (!record) return {};

    const name = record.Name || record.name || record.CompanyName || record.company_name || '';
    const state = record.BillingState || record.State || record.state ||
      record.BillingStateCode || record.StateCode || '';
    const city = record.BillingCity || record.City || record.city || '';
    const domain = record.Website || record.Domain || record.domain ||
      record.website || record.WebsiteUrl || '';
    const phone = record.Phone || record.phone || record.BillingPhone || '';

    // Extract base name using hierarchy detector
    const extracted = this.hierarchyDetector.extractBaseName(name);

    // Normalize location data
    const normalizedState = this.locationNormalizer.normalizeState(state);
    const normalizedDomain = this.locationNormalizer.normalizeDomain(domain);
    const normalizedCity = this.locationNormalizer.normalizeCity(city);
    const areaCode = this.locationNormalizer.extractAreaCode(phone);

    return {
      original: record,
      name,
      baseName: extracted.baseName,
      locationSuffix: extracted.suffix,
      storeNumber: extracted.storeNumber,
      namePattern: extracted.pattern,
      state: normalizedState,
      stateOriginal: state,
      city: normalizedCity,
      domain: normalizedDomain,
      phone,
      areaCode,
      id: record.Id || record.id || record.hs_object_id || null
    };
  }

  /**
   * Detect market from record data
   * @private
   */
  _detectMarket(recordA, recordB) {
    // Use domain detector if available
    if (this.domainDetector) {
      const textA = `${recordA.name} ${recordA.stateOriginal || ''} ${recordA.city || ''}`;
      const detectionA = this.domainDetector.detect(textA);
      if (detectionA.detectedDomain) {
        return detectionA.detectedDomain;
      }
    }

    // Check for known patterns
    const name = (recordA.name || '').toLowerCase();

    // Government patterns
    if (/city of|county of|town of|village of|police|sheriff|fire department|housing authority/i.test(name)) {
      return 'government';
    }

    // Healthcare patterns
    if (/hospital|medical center|health system|clinic|healthcare/i.test(name)) {
      return 'healthcare';
    }

    // Property management patterns
    if (/hoa|homeowners|property management|apartments|condominiums/i.test(name)) {
      return 'property-management';
    }

    // Financial patterns
    if (/bank|credit union|savings|federal credit|trust company/i.test(name)) {
      return 'financial';
    }

    // Check for known franchises/retailers
    if (this.marketRules) {
      const franchiseEntities = this.marketRules.markets?.franchise?.knownEntities || [];
      const retailEntities = this.marketRules.markets?.retail?.knownEntities || [];

      if (franchiseEntities.some(f => name.includes(f.toLowerCase()))) {
        return 'franchise';
      }
      if (retailEntities.some(r => name.includes(r.toLowerCase()))) {
        return 'retail';
      }
    }

    return null; // Unknown market - use default policy
  }

  /**
   * Calculate all matching signals
   * @private
   */
  _calculateSignals(recordA, recordB, market, marketConfig) {
    const signals = [];

    // 0. Exact name match (strongest signal)
    const normalizedNameA = this._normalizeNameForComparison(recordA.name);
    const normalizedNameB = this._normalizeNameForComparison(recordB.name);

    if (normalizedNameA === normalizedNameB) {
      signals.push({
        type: 'EXACT_NAME_MATCH',
        value: recordA.name,
        weight: this._getWeight('exact_name_match', marketConfig)
      });
    }

    // 0.5. Check for abbreviation-expanded match
    const expandedA = this._expandAbbreviations(recordA.name);
    const expandedB = this._expandAbbreviations(recordB.name);
    const normalizedExpandedA = this._normalizeNameForComparison(expandedA);
    const normalizedExpandedB = this._normalizeNameForComparison(expandedB);

    if (normalizedExpandedA === normalizedExpandedB && normalizedNameA !== normalizedNameB) {
      // Strong abbreviation match - treat almost like exact match
      signals.push({
        type: 'ABBREVIATION_MATCH',
        expandedA: expandedA,
        expandedB: expandedB,
        weight: this._getWeight('abbreviation_match', marketConfig)
      });

      // Also add base name match signal for abbreviation matches
      signals.push({
        type: 'BASE_NAME_MATCH',
        value: expandedA,
        similarity: 1.0,
        weight: this._getWeight('base_name_match', marketConfig)
      });
    }

    // 1. Base name comparison
    const hierarchyResult = this.hierarchyDetector.detectParentChildPattern(
      recordA.name,
      recordB.name,
      { market }
    );

    if (hierarchyResult.baseNameMatch) {
      signals.push({
        type: 'BASE_NAME_MATCH',
        value: hierarchyResult.baseName,
        similarity: 1.0,
        weight: this._getWeight('base_name_match', marketConfig)
      });
    } else if (hierarchyResult.confidence > 0) {
      signals.push({
        type: 'BASE_NAME_SIMILAR',
        value: hierarchyResult.baseName,
        similarity: hierarchyResult.confidence / 100,
        weight: Math.round(this._getWeight('base_name_match', marketConfig) * (hierarchyResult.confidence / 100))
      });
    }

    // 2. Parent/child pattern detection
    if (hierarchyResult.sameEntity && hierarchyResult.signals.some(s => s.type === 'BOTH_HAVE_LOCATION_PATTERN')) {
      signals.push({
        type: 'PARENT_PATTERN',
        locationA: recordA.locationSuffix,
        locationB: recordB.locationSuffix,
        weight: this._getWeight('parent_pattern', marketConfig)
      });
    }

    // 3. Known franchise/chain detection
    if (market === 'franchise' || market === 'retail') {
      const isKnownA = this.hierarchyDetector.isKnownEntity(recordA.baseName, market);
      const isKnownB = this.hierarchyDetector.isKnownEntity(recordB.baseName, market);
      if (isKnownA || isKnownB) {
        signals.push({
          type: 'KNOWN_FRANCHISE',
          entity: recordA.baseName,
          weight: this._getWeight('known_franchise', marketConfig)
        });
      }
    }

    // 4. Store number pattern
    if (recordA.storeNumber && recordB.storeNumber) {
      signals.push({
        type: 'STORE_NUMBER_PATTERN',
        numberA: recordA.storeNumber,
        numberB: recordB.storeNumber,
        weight: this._getWeight('store_number_pattern', marketConfig)
      });
    }

    // 5. Domain comparison
    if (recordA.domain && recordB.domain) {
      if (recordA.domain === recordB.domain) {
        signals.push({
          type: 'SHARED_DOMAIN',
          value: recordA.domain,
          weight: this._getWeight('shared_domain', marketConfig)
        });
      } else {
        signals.push({
          type: 'DIFFERENT_DOMAIN',
          domainA: recordA.domain,
          domainB: recordB.domain,
          weight: this._getWeight('different_domain', marketConfig)
        });
      }
    }

    // 6. State comparison
    if (recordA.state && recordB.state) {
      if (recordA.state === recordB.state) {
        signals.push({
          type: 'SAME_STATE',
          value: recordA.state,
          weight: 20
        });
      } else {
        const penalty = marketConfig.signalWeights?.state_mismatch ||
          this._getStateMismatchPenalty(market);
        signals.push({
          type: 'STATE_MISMATCH',
          stateA: recordA.state,
          stateB: recordB.state,
          weight: penalty
        });
      }
    }

    // 7. Phone area code comparison
    if (recordA.areaCode && recordB.areaCode) {
      if (recordA.areaCode === recordB.areaCode) {
        signals.push({
          type: 'PHONE_AREA_MATCH',
          areaCode: recordA.areaCode,
          weight: this._getWeight('phone_area_match', marketConfig)
        });
      }
    }

    // 8. City comparison
    if (recordA.city && recordB.city) {
      if (recordA.city.toLowerCase() === recordB.city.toLowerCase()) {
        signals.push({
          type: 'SAME_CITY',
          value: recordA.city,
          weight: 15
        });
      }
    }

    // 9. Generic entity pattern check (important for government/healthcare)
    const genericCheckA = this.hierarchyDetector.detectGenericEntityPattern(recordA.name, market);
    const genericCheckB = this.hierarchyDetector.detectGenericEntityPattern(recordB.name, market);

    if (genericCheckA.isGeneric && genericCheckB.isGeneric) {
      if (recordA.state && recordB.state && recordA.state !== recordB.state) {
        // For HIGH uniqueness markets (government, healthcare), apply full penalty
        // For MEDIUM/LOW markets, the STATE_MISMATCH penalty is already sufficient
        const uniquenessLevel = marketConfig.uniquenessLevel || 'MEDIUM';
        let genericWeight;

        if (uniquenessLevel === 'HIGH') {
          // Full penalty for high-uniqueness markets
          genericWeight = this._getWeight('generic_name_different_state', marketConfig);
        } else {
          // Reduced penalty for medium/low uniqueness (already penalized by STATE_MISMATCH)
          genericWeight = Math.round(this._getWeight('generic_name_different_state', marketConfig) * 0.3);
        }

        signals.push({
          type: 'GENERIC_NAME_DIFFERENT_STATE',
          pattern: genericCheckA.matchedPattern,
          stateA: recordA.state,
          stateB: recordB.state,
          weight: genericWeight
        });
      }
    }

    return signals;
  }

  /**
   * Calculate total score from signals
   * @private
   */
  _calculateScore(signals, signalWeights) {
    let score = 50; // Base score

    for (const signal of signals) {
      score += signal.weight || 0;
    }

    return score;
  }

  /**
   * Apply market-specific policy adjustments
   * @private
   */
  _applyMarketPolicy(recordA, recordB, score, signals, market, marketConfig) {
    const policy = marketConfig.sameNameDifferentStatePolicy || 'REVIEW';
    const additionalSignals = [];
    let blocked = false;
    let adjustedScore = score;

    // Check for state mismatch with policy
    const hasStateMismatch = signals.some(s => s.type === 'STATE_MISMATCH');
    const hasGenericName = signals.some(s => s.type === 'GENERIC_NAME_DIFFERENT_STATE');

    if (hasStateMismatch || hasGenericName) {
      switch (policy) {
        case 'BLOCK':
          // High uniqueness markets block different-state matches
          blocked = true;
          adjustedScore = Math.min(adjustedScore, 40); // Cap at TAG level
          additionalSignals.push({
            type: 'POLICY_BLOCK',
            policy: 'BLOCK',
            reason: 'Market policy blocks same-name matches in different states',
            weight: 0
          });
          break;

        case 'REVIEW':
          // Medium uniqueness - always require review for different states
          if (adjustedScore >= 85) {
            adjustedScore = 84; // Force into REVIEW tier
          }
          additionalSignals.push({
            type: 'POLICY_REVIEW',
            policy: 'REVIEW',
            reason: 'Market policy requires review for different-state matches',
            weight: 0
          });
          break;

        case 'ALLOW_WITH_PATTERN':
          // Low uniqueness - allow if there's a location pattern
          const hasPattern = signals.some(s =>
            s.type === 'PARENT_PATTERN' ||
            s.type === 'STORE_NUMBER_PATTERN' ||
            s.type === 'KNOWN_FRANCHISE'
          );
          if (hasPattern) {
            // Boost score for pattern-based matches
            adjustedScore += 10;
            additionalSignals.push({
              type: 'POLICY_PATTERN_MATCH',
              policy: 'ALLOW_WITH_PATTERN',
              reason: 'Location pattern detected - likely same corporate entity',
              weight: 10
            });
          }
          break;

        case 'ALLOW':
          // Low uniqueness - different states don't significantly impact
          // No additional adjustment needed
          break;
      }
    }

    return { adjustedScore, blocked, additionalSignals };
  }

  /**
   * Classify decision based on score and thresholds
   * @private
   */
  _classifyDecision(score, thresholds, blocked = false) {
    if (blocked) {
      return score >= thresholds.tag ? 'TAG' : 'NO_MATCH';
    }

    if (score >= thresholds.autoMerge) {
      return 'AUTO_MERGE';
    } else if (score >= thresholds.review) {
      return 'REVIEW';
    } else if (score >= thresholds.tag) {
      return 'TAG';
    } else {
      return 'NO_MATCH';
    }
  }

  /**
   * Generate human-readable explanation
   * @private
   */
  _generateExplanation(signals, decision, market) {
    const positiveSignals = signals.filter(s => s.weight > 0);
    const negativeSignals = signals.filter(s => s.weight < 0);
    const policySignals = signals.filter(s => s.type.startsWith('POLICY_'));

    let explanation = '';

    if (positiveSignals.length > 0) {
      const topPositive = positiveSignals.sort((a, b) => b.weight - a.weight).slice(0, 2);
      explanation += `Matched on: ${topPositive.map(s => s.type).join(', ')}. `;
    }

    if (negativeSignals.length > 0) {
      const topNegative = negativeSignals.sort((a, b) => a.weight - b.weight).slice(0, 2);
      explanation += `Concerns: ${topNegative.map(s => s.type).join(', ')}. `;
    }

    if (policySignals.length > 0) {
      explanation += policySignals.map(s => s.reason).join(' ');
    }

    if (market) {
      explanation += ` [Market: ${market}]`;
    }

    return explanation.trim();
  }

  /**
   * Get recommendation based on decision
   * @private
   */
  _getRecommendation(decision, signals) {
    switch (decision) {
      case 'AUTO_MERGE':
        return 'Safe to merge automatically - high confidence same entity';
      case 'REVIEW':
        return 'Requires human review - moderate confidence, check signals';
      case 'TAG':
        return 'Tag for investigation - low confidence but possible match';
      case 'NO_MATCH':
        return 'Different entities - do not merge';
      default:
        return 'Unknown decision';
    }
  }

  /**
   * Get signal weight from market config or defaults
   * @private
   */
  _getWeight(signalType, marketConfig) {
    return marketConfig?.signalWeights?.[signalType] ||
      this.defaultSignalWeights[signalType] ||
      0;
  }

  /**
   * Get state mismatch penalty based on market
   * @private
   */
  _getStateMismatchPenalty(market) {
    const penalties = {
      government: -50,
      healthcare: -45,
      financial: -45,
      'property-management': -25,
      franchise: -10,
      retail: -10,
      technology: -5
    };
    return penalties[market] || -30;
  }

  /**
   * Normalize name for comparison
   * @private
   */
  _normalizeNameForComparison(name) {
    if (!name) return '';
    return name
      .toLowerCase()
      .replace(/[''`]/g, "'")
      .replace(/[""]/g, '"')
      .replace(/\s+/g, ' ')
      .replace(/[.,;:!?]/g, '')
      .trim();
  }

  /**
   * Expand common abbreviations in a name
   * @private
   */
  _expandAbbreviations(name) {
    if (!name) return '';

    let result = name.toLowerCase();

    // Sort by length descending to match longer abbreviations first
    const sortedAbbrevs = Object.entries(this.abbreviations)
      .sort((a, b) => b[0].length - a[0].length);

    for (const [abbrev, expansion] of sortedAbbrevs) {
      // Match abbreviation as whole word
      const pattern = new RegExp(`\\b${abbrev}\\b`, 'gi');
      result = result.replace(pattern, expansion);
    }

    return result;
  }

  /**
   * Get market config
   * @private
   */
  _getMarketConfig(market) {
    if (market && this.marketRules?.markets?.[market]) {
      return this.marketRules.markets[market];
    }
    return this.defaultPolicy;
  }

  /**
   * Load market rules
   * @private
   */
  _loadMarketRules() {
    try {
      const rulesPath = path.join(__dirname, '..', '..', 'config', 'market-matching-rules.json');
      if (fs.existsSync(rulesPath)) {
        return JSON.parse(fs.readFileSync(rulesPath, 'utf-8'));
      }
    } catch (error) {
      console.warn('Warning: Could not load market matching rules:', error.message);
    }
    return null;
  }

  /**
   * Get default policy
   * @private
   */
  _getDefaultPolicy() {
    return {
      uniquenessLevel: 'MEDIUM',
      sameNameDifferentStatePolicy: 'REVIEW',
      confidenceThresholds: {
        autoMerge: 90,
        review: 80,
        tag: 65
      }
    };
  }
}

// Try to load optional enhancement modules
let LearningModule, EnrichmentModule, ScoringModule, BatchModule, WorkflowModule;

// Learning modules (Phase 1)
try {
  LearningModule = require('./learning');
} catch (e) {
  LearningModule = null;
}

// Enrichment modules (Phase 2)
try {
  EnrichmentModule = require('./enrichment');
} catch (e) {
  EnrichmentModule = null;
}

// Scoring modules (Phase 3)
try {
  ScoringModule = require('./scoring');
} catch (e) {
  ScoringModule = null;
}

// Batch processing modules (Phase 4)
try {
  BatchModule = require('./batch');
} catch (e) {
  BatchModule = null;
}

// Workflow modules (Phase 5)
try {
  WorkflowModule = require('./workflow');
} catch (e) {
  WorkflowModule = null;
}

// Export core class and all available modules
module.exports = {
  // Core
  GeographicEntityResolver,

  // Phase 1: Learning
  ...(LearningModule || {}),

  // Phase 2: Enrichment
  ...(EnrichmentModule || {}),

  // Phase 3: Scoring
  ...(ScoringModule || {}),

  // Phase 4: Batch Processing
  ...(BatchModule || {}),

  // Phase 5: Workflow
  ...(WorkflowModule || {}),

  // Factory for integrated pipeline
  createMatchingPipeline(options = {}) {
    const resolver = new GeographicEntityResolver(options);

    // Add workflow if available
    const workflow = WorkflowModule?.createWorkflowSystem?.(options.workflow || {});

    // Add batch processing if available
    const batch = BatchModule?.createBatchPipeline?.(options.batch || {});

    // Add learning if available
    const learning = LearningModule?.createLearningSystem?.(options.learning || {});

    // Add enrichment if available
    const enrichment = EnrichmentModule?.createEnrichmentPipeline?.(options.enrichment || {});

    // Add scoring if available
    const scoring = ScoringModule?.createIntelligentScorer?.(options.scoring || {});

    return {
      resolver,
      workflow,
      batch,
      learning,
      enrichment,
      scoring,

      /**
       * Resolve two records and optionally route through workflow
       */
      resolve(recordA, recordB, resolveOptions = {}) {
        // Apply enrichment if available
        let enrichedA = recordA;
        let enrichedB = recordB;
        if (enrichment && resolveOptions.enrich) {
          enrichedA = enrichment.enrichSync?.(recordA) || recordA;
          enrichedB = enrichment.enrichSync?.(recordB) || recordB;
        }

        // Resolve with base resolver
        let result = resolver.resolve(enrichedA, enrichedB, resolveOptions);

        // Apply intelligent scoring if available
        if (scoring && resolveOptions.intelligentScoring) {
          result = scoring.adjustScore?.(result) || result;
        }

        // Route through workflow if enabled
        if (workflow && resolveOptions.useWorkflow) {
          return workflow.processMatchResult(result, resolveOptions);
        }

        return result;
      },

      /**
       * Process batch of records through full pipeline
       */
      async processBatch(records, batchOptions = {}) {
        if (!batch) {
          throw new Error('Batch processing module not available');
        }

        const results = await batch.deduplicate(records, {
          ...batchOptions,
          scorer: (recA, recB) => resolver.resolve(recA, recB, batchOptions)
        });

        // Route through workflow if enabled
        if (workflow && batchOptions.useWorkflow) {
          const matchResults = results.matches.map(m => ({
            ...resolver.resolve(m.recordA, m.recordB, batchOptions),
            recordA: m.recordA,
            recordB: m.recordB
          }));

          return workflow.processBatch(matchResults, batchOptions);
        }

        return results;
      }
    };
  }
};

// For backward compatibility, also expose individual classes
let FeedbackTracker, ThresholdOptimizer, PatternDiscoverer;
if (LearningModule) {
  FeedbackTracker = LearningModule.FeedbackTracker;
  ThresholdOptimizer = LearningModule.ThresholdOptimizer;
  PatternDiscoverer = LearningModule.PatternDiscoverer;
}

// CLI Usage
if (require.main === module) {
  const args = process.argv.slice(2);
  const resolver = new GeographicEntityResolver();

  if (args.length === 0) {
    console.log(`
Geographic Entity Resolver CLI

Usage:
  node geographic-entity-resolver.js resolve "<name1>" "<name2>" [options]
  node geographic-entity-resolver.js resolve-json "<json1>" "<json2>" [options]
  node geographic-entity-resolver.js feedback <command> [options]

Resolve Options:
  --market <type>    Specify market (government, healthcare, franchise, retail, etc.)
  --verbose          Show detailed output
  --interactive      Prompt for feedback after resolution

Feedback Commands:
  feedback summary                     Show feedback summary
  feedback metrics [market]            Show accuracy metrics
  feedback optimize [market]           Show threshold optimization suggestions
  feedback discover [market]           Discover new patterns from corrections
  feedback record <matchId> <action>   Record feedback (ACCEPT/REJECT/MODIFY/SPLIT)

Examples:
  # Compare two names
  node geographic-entity-resolver.js resolve "Marriott - Dallas" "Marriott - Houston" --market franchise

  # Compare full records
  node geographic-entity-resolver.js resolve-json \\
    '{"Name":"City of Portland","State":"OR"}' \\
    '{"Name":"City of Portland","State":"ME"}' \\
    --market government

  # Interactive mode (record feedback)
  node geographic-entity-resolver.js resolve "Memorial Hospital" "Memorial Hospital - West" --interactive

  # View feedback metrics
  node geographic-entity-resolver.js feedback metrics healthcare

  # Get optimization suggestions
  node geographic-entity-resolver.js feedback optimize healthcare

  # Discover patterns from corrections
  node geographic-entity-resolver.js feedback discover staffing
`);
    process.exit(0);
  }

  const command = args[0];
  const marketIdx = args.indexOf('--market');
  const market = marketIdx > -1 ? args[marketIdx + 1] : null;
  const verbose = args.includes('--verbose');

  if (command === 'resolve') {
    const nameA = args[1];
    const nameB = args[2];
    const interactive = args.includes('--interactive');

    const recordA = { Name: nameA };
    const recordB = { Name: nameB };

    const result = resolver.resolve(recordA, recordB, { market });

    console.log('\n=== Geographic Entity Resolution ===');
    console.log(`Name A: "${nameA}"`);
    console.log(`Name B: "${nameB}"`);
    console.log(`Market: ${result.market || 'auto-detected'}`);
    console.log(`\nDecision: ${result.decision}`);
    console.log(`Confidence: ${result.confidence}%`);
    console.log(`Same Entity: ${result.sameEntity ? 'YES' : 'NO'}`);
    console.log(`\nExplanation: ${result.explanation}`);
    console.log(`Recommendation: ${result.recommendation}`);

    if (verbose && result.signals.length > 0) {
      console.log('\nSignals:');
      result.signals.forEach(s => {
        const sign = s.weight > 0 ? '+' : '';
        console.log(`  ${sign}${s.weight}: ${s.type}${s.value ? ` (${s.value})` : ''}`);
      });
    }
    console.log('');

    // Interactive feedback mode
    if (interactive && FeedbackTracker) {
      const readline = require('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });

      rl.question('Record feedback? (A)ccept, (R)eject, (M)odify, (S)plit, or (N)o: ', (answer) => {
        const actionMap = {
          'a': 'ACCEPT', 'accept': 'ACCEPT',
          'r': 'REJECT', 'reject': 'REJECT',
          'm': 'MODIFY', 'modify': 'MODIFY',
          's': 'SPLIT', 'split': 'SPLIT'
        };
        const action = actionMap[answer.toLowerCase()];

        if (action) {
          const tracker = new FeedbackTracker();
          const feedback = tracker.recordFeedback(result, action);
          console.log(`\n✓ Feedback recorded: ${action} (ID: ${feedback.id})`);
        } else {
          console.log('\nNo feedback recorded.');
        }

        rl.close();
      });
    }

  } else if (command === 'resolve-json') {
    const recordA = JSON.parse(args[1]);
    const recordB = JSON.parse(args[2]);
    const interactive = args.includes('--interactive');

    const result = resolver.resolve(recordA, recordB, { market });

    console.log('\n=== Geographic Entity Resolution ===');
    console.log('Record A:', JSON.stringify(result.recordA, null, 2));
    console.log('Record B:', JSON.stringify(result.recordB, null, 2));
    console.log(`Market: ${result.market || 'auto-detected'}`);
    console.log(`\nDecision: ${result.decision}`);
    console.log(`Confidence: ${result.confidence}%`);
    console.log(`Same Entity: ${result.sameEntity ? 'YES' : 'NO'}`);
    console.log(`\nExplanation: ${result.explanation}`);
    console.log(`Recommendation: ${result.recommendation}`);

    if (verbose) {
      console.log('\nAll Signals:');
      result.signals.forEach(s => {
        console.log(`  ${JSON.stringify(s)}`);
      });
    }
    console.log('');

    // Interactive feedback mode
    if (interactive && FeedbackTracker) {
      const readline = require('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });

      rl.question('\nRecord feedback? (A)ccept, (R)eject, (M)odify, (S)plit, or (N)o: ', (answer) => {
        const actionMap = {
          'a': 'ACCEPT', 'accept': 'ACCEPT',
          'r': 'REJECT', 'reject': 'REJECT',
          'm': 'MODIFY', 'modify': 'MODIFY',
          's': 'SPLIT', 'split': 'SPLIT'
        };
        const action = actionMap[answer.toLowerCase()];

        if (action) {
          const tracker = new FeedbackTracker();
          const feedback = tracker.recordFeedback(result, action);
          console.log(`\n✓ Feedback recorded: ${action} (ID: ${feedback.id})`);
        } else {
          console.log('\nNo feedback recorded.');
        }

        rl.close();
      });
    }

  } else if (command === 'feedback') {
    // Feedback learning commands
    if (!FeedbackTracker) {
      console.error('Error: Learning modules not available. Check scripts/lib/learning/ directory.');
      process.exit(1);
    }

    const subCommand = args[1];
    const tracker = new FeedbackTracker();

    if (subCommand === 'summary') {
      const summary = tracker.getSummary();
      console.log('\n=== Feedback Summary ===\n');
      console.log(`Total Decisions: ${summary.totalDecisions}`);

      if (summary.totalDecisions > 0) {
        console.log(`Date Range: ${summary.oldestDecision} to ${summary.newestDecision}`);
        console.log('\nBy Market:');
        for (const [mkt, stats] of Object.entries(summary.byMarket)) {
          console.log(`  ${mkt}: ${stats.total} decisions (${stats.accepts} accepts, ${stats.rejects} rejects)`);
        }
        console.log('\nAccuracy by Decision Type:');
        for (const [type, stats] of Object.entries(summary.accuracyByDecision)) {
          console.log(`  ${type}: ${stats.correct}/${stats.total} correct (${(stats.accuracy * 100).toFixed(1)}%)`);
        }
      }
      console.log('');

    } else if (subCommand === 'metrics') {
      const mkt = args[2] || null;
      const metrics = tracker.calculateAccuracyMetrics(mkt);

      console.log(`\n=== Accuracy Metrics${mkt ? ` for ${mkt}` : ''} ===\n`);
      console.log(`Total Decisions: ${metrics.totalDecisions}`);

      if (metrics.metrics) {
        console.log(`\nClassification Metrics:`);
        console.log(`  Precision: ${(metrics.metrics.precision * 100).toFixed(1)}%`);
        console.log(`  Recall: ${(metrics.metrics.recall * 100).toFixed(1)}%`);
        console.log(`  F1 Score: ${(metrics.metrics.f1Score * 100).toFixed(1)}%`);
        console.log(`  Accuracy: ${(metrics.metrics.accuracy * 100).toFixed(1)}%`);
        console.log(`\nError Rates:`);
        console.log(`  FP Rate at AUTO_MERGE: ${(metrics.metrics.fpRateAtAutoMerge * 100).toFixed(1)}%`);
        console.log(`  FN Rate at NO_MATCH: ${(metrics.metrics.fnRateAtNoMatch * 100).toFixed(1)}%`);
      } else {
        console.log(metrics.message || 'No metrics available');
      }
      console.log('');

    } else if (subCommand === 'optimize') {
      if (!ThresholdOptimizer) {
        console.error('Error: ThresholdOptimizer not available');
        process.exit(1);
      }

      const mkt = args[2] || null;
      const optimizer = new ThresholdOptimizer();

      if (mkt) {
        const analysis = optimizer.analyzeMarket(mkt);
        console.log(`\n=== Threshold Analysis: ${mkt} ===\n`);
        console.log(`Status: ${analysis.status}`);
        console.log(`Total Decisions: ${analysis.totalDecisions}`);

        if (analysis.currentThresholds) {
          console.log(`\nCurrent Thresholds:`);
          console.log(`  autoMerge: ${analysis.currentThresholds.autoMerge}`);
          console.log(`  review: ${analysis.currentThresholds.review}`);
          console.log(`  tag: ${analysis.currentThresholds.tag}`);
        }

        if (analysis.suggestions && analysis.suggestions.length > 0) {
          console.log(`\nSuggestions:`);
          for (const s of analysis.suggestions) {
            console.log(`  [${s.severity}] ${s.type}`);
            console.log(`    ${s.rationale || s.message}`);
          }
        }
      } else {
        const report = optimizer.generateReport();
        console.log(`\n=== Threshold Optimization Report ===\n`);
        console.log(`Markets Analyzed: ${report.summary.marketsAnalyzed}`);
        console.log(`Markets with Suggestions: ${report.summary.marketsWithSuggestions}`);
        console.log(`Total Suggestions: ${report.summary.totalSuggestions}`);

        if (report.recommendations.length > 0) {
          console.log(`\nTop Recommendations:`);
          for (const r of report.recommendations.slice(0, 5)) {
            console.log(`  [P${r.priority}] ${r.market}: ${r.action}`);
          }
        }
      }
      console.log('');

    } else if (subCommand === 'discover') {
      if (!PatternDiscoverer) {
        console.error('Error: PatternDiscoverer not available');
        process.exit(1);
      }

      const mkt = args[2];
      if (!mkt) {
        console.error('Error: Market required. Usage: feedback discover <market>');
        process.exit(1);
      }

      const discoverer = new PatternDiscoverer();
      const discoveries = discoverer.discoverPatterns(mkt);

      console.log(`\n=== Pattern Discovery: ${mkt} ===\n`);
      console.log(`Status: ${discoveries.status}`);
      console.log(`Analyzed Corrections: ${discoveries.analyzedCorrections || 0}`);

      if (discoveries.summary) {
        console.log(`\nDiscoveries:`);
        console.log(`  Synonyms: ${discoveries.summary.byType.synonyms}`);
        console.log(`  Generic Patterns: ${discoveries.summary.byType.genericPatterns}`);
        console.log(`  Known Entities: ${discoveries.summary.byType.knownEntities}`);
        console.log(`  Aliases: ${discoveries.summary.byType.aliasPatterns}`);

        if (discoveries.summary.topPriority.length > 0) {
          console.log(`\nTop Priority:`);
          for (const d of discoveries.summary.topPriority) {
            console.log(`  [${d.type}] ${d.value} (${(d.confidence * 100).toFixed(0)}%)`);
          }
        }
      }
      console.log('');

    } else if (subCommand === 'record') {
      const matchId = args[2];
      const action = args[3]?.toUpperCase();

      if (!matchId || !action) {
        console.error('Error: Usage: feedback record <matchId> <ACCEPT|REJECT|MODIFY|SPLIT>');
        process.exit(1);
      }

      console.log(`Recording feedback for match ${matchId}: ${action}`);
      console.log('Note: For full feedback recording, use --interactive flag with resolve commands');

    } else {
      console.error(`Unknown feedback command: ${subCommand}`);
      console.error('Available: summary, metrics, optimize, discover, record');
      process.exit(1);
    }

  } else {
    console.error(`Unknown command: ${command}`);
    process.exit(1);
  }
}
