#!/usr/bin/env node

/**
 * Contextual Weighter
 *
 * Adjusts confidence scores based on the context of the comparison,
 * particularly data completeness and quality. When records have sparse
 * data, we should be less confident in our conclusions.
 *
 * Key Concepts:
 * - Data Completeness: How many fields are populated in each record
 * - Data Quality: Are the values plausible and well-formed
 * - Asymmetric Completeness: One record much fuller than another
 * - Critical Field Presence: Are key identifying fields present
 *
 * Usage:
 *   const { ContextualWeighter } = require('./contextual-weighter');
 *   const weighter = new ContextualWeighter();
 *
 *   const adjusted = weighter.adjustForContext(confidence, recordA, recordB, market);
 */

'use strict';

// Fields by importance tier
const FIELD_TIERS = {
  CRITICAL: ['name', 'Name', 'CompanyName', 'company_name'],
  HIGH: [
    'state', 'State', 'BillingState', 'BillingStateCode',
    'domain', 'Domain', 'Website', 'website',
    'npi', 'NPI', 'NPI__c',
    'ein', 'EIN', 'EIN__c'
  ],
  MEDIUM: [
    'city', 'City', 'BillingCity',
    'phone', 'Phone', 'BillingPhone',
    'industry', 'Industry',
    'duns', 'DUNS', 'DUNS__c'
  ],
  LOW: [
    'street', 'Street', 'BillingStreet',
    'postalCode', 'PostalCode', 'BillingPostalCode',
    'country', 'Country', 'BillingCountry',
    'description', 'Description'
  ]
};

// Weight by tier for completeness calculation
const TIER_WEIGHTS = {
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1
};

// Market-specific critical fields
const MARKET_CRITICAL_FIELDS = {
  healthcare: ['NPI', 'npi', 'NPI__c'],
  'dental-medical': ['NPI', 'npi', 'NPI__c'],
  nonprofit: ['EIN', 'ein', 'EIN__c'],
  financial: ['EIN', 'ein', 'EIN__c', 'DUNS', 'duns'],
  'media-broadcasting': ['CallSign', 'call_sign', 'FCC_CallSign'],
  government: ['state', 'State', 'BillingState'],
  franchise: ['domain', 'Domain', 'Website']
};

// Confidence adjustment thresholds
const COMPLETENESS_THRESHOLDS = {
  VERY_HIGH: 0.8,   // 80%+ complete - no adjustment
  HIGH: 0.6,        // 60-79% complete - minor adjustment
  MEDIUM: 0.4,      // 40-59% complete - moderate adjustment
  LOW: 0.2,         // 20-39% complete - significant adjustment
  VERY_LOW: 0.0     // <20% complete - major adjustment
};

// Adjustment factors
const COMPLETENESS_FACTORS = {
  VERY_HIGH: 1.0,   // No change
  HIGH: 0.95,       // 5% reduction
  MEDIUM: 0.85,     // 15% reduction
  LOW: 0.70,        // 30% reduction
  VERY_LOW: 0.50    // 50% reduction
};

class ContextualWeighter {
  constructor(options = {}) {
    this.fieldTiers = options.fieldTiers || FIELD_TIERS;
    this.tierWeights = options.tierWeights || TIER_WEIGHTS;
    this.marketCriticalFields = options.marketCriticalFields || MARKET_CRITICAL_FIELDS;

    // Statistics
    this.stats = {
      adjustmentsApplied: 0,
      totalReduction: 0,
      averageCompleteness: 0,
      asymmetricCases: 0
    };

    this._completenessSum = 0;
  }

  /**
   * Adjust confidence based on data context
   * Can be called with individual arguments or an options object:
   *   adjustForContext(confidence, recordA, recordB, market)
   *   adjustForContext({ confidence, recordA, recordB, market })
   *
   * @param {number|Object} confidenceOrOptions - Base confidence score (0-100) or options object
   * @param {Object} [recordA] - First record (if using individual arguments)
   * @param {Object} [recordB] - Second record (if using individual arguments)
   * @param {string} [market] - Market type for context (if using individual arguments)
   * @returns {Object} Adjusted confidence with details
   */
  adjustForContext(confidenceOrOptions, recordA, recordB, market = null) {
    // Support both calling conventions
    let confidence;
    if (typeof confidenceOrOptions === 'object' && confidenceOrOptions !== null) {
      confidence = confidenceOrOptions.confidence;
      recordA = confidenceOrOptions.recordA;
      recordB = confidenceOrOptions.recordB;
      market = confidenceOrOptions.market || null;
    } else {
      confidence = confidenceOrOptions;
    }
    // Assess completeness of both records
    const completenessA = this.assessCompleteness(recordA, market);
    const completenessB = this.assessCompleteness(recordB, market);

    // Calculate combined completeness
    const avgCompleteness = (completenessA.score + completenessB.score) / 2;
    const minCompleteness = Math.min(completenessA.score, completenessB.score);

    // Detect asymmetric completeness
    const asymmetry = Math.abs(completenessA.score - completenessB.score);
    const isAsymmetric = asymmetry > 0.4;

    // Assess data quality
    const qualityA = this.assessQuality(recordA);
    const qualityB = this.assessQuality(recordB);
    const avgQuality = (qualityA.score + qualityB.score) / 2;

    // Calculate adjustment factor
    let factor = this._getCompletenessFactor(minCompleteness);

    // Additional penalty for asymmetric completeness
    if (isAsymmetric) {
      factor *= 0.9; // 10% additional reduction
      this.stats.asymmetricCases++;
    }

    // Quality adjustment
    if (avgQuality < 0.7) {
      factor *= 0.9 + (avgQuality * 0.1); // Up to 10% reduction for poor quality
    }

    // Apply adjustment
    const adjustedConfidence = Math.round(confidence * factor);

    // Update statistics
    this.stats.adjustmentsApplied++;
    this.stats.totalReduction += (confidence - adjustedConfidence);
    this._completenessSum += avgCompleteness;
    this.stats.averageCompleteness = this._completenessSum / this.stats.adjustmentsApplied;

    return {
      originalConfidence: confidence,
      adjustedConfidence,
      adjustment: adjustedConfidence - confidence,
      factor,
      context: {
        completenessA: completenessA.score,
        completenessB: completenessB.score,
        avgCompleteness,
        minCompleteness,
        isAsymmetric,
        asymmetry,
        qualityA: qualityA.score,
        qualityB: qualityB.score,
        avgQuality
      },
      explanation: this._generateExplanation(
        completenessA, completenessB, qualityA, qualityB, factor, isAsymmetric
      )
    };
  }

  /**
   * Assess data completeness of a record
   * @param {Object} record - Record to assess
   * @param {string} market - Market for critical field checking
   * @returns {Object} Completeness assessment
   */
  assessCompleteness(record, market = null) {
    if (!record || typeof record !== 'object') {
      return {
        score: 0,
        tier: 'VERY_LOW',
        filledFields: 0,
        totalFields: 0,
        missingCritical: [],
        details: {}
      };
    }

    const assessment = {
      critical: { filled: 0, total: 0, missing: [] },
      high: { filled: 0, total: 0, missing: [] },
      medium: { filled: 0, total: 0, missing: [] },
      low: { filled: 0, total: 0, missing: [] }
    };

    // Check each tier
    for (const [tier, fields] of Object.entries(this.fieldTiers)) {
      const tierKey = tier.toLowerCase();
      for (const field of fields) {
        assessment[tierKey].total++;
        if (this._hasValue(record[field])) {
          assessment[tierKey].filled++;
        } else if (tier === 'CRITICAL' || tier === 'HIGH') {
          assessment[tierKey].missing.push(field);
        }
      }
    }

    // Check market-specific critical fields
    const marketCritical = market ? this.marketCriticalFields[market] || [] : [];
    const missingMarketCritical = [];
    for (const field of marketCritical) {
      if (!this._hasValue(record[field])) {
        missingMarketCritical.push(field);
      }
    }

    // Calculate weighted score
    let weightedFilled = 0;
    let weightedTotal = 0;

    for (const [tier, weight] of Object.entries(this.tierWeights)) {
      const tierKey = tier.toLowerCase();
      weightedFilled += assessment[tierKey].filled * weight;
      weightedTotal += assessment[tierKey].total * weight;
    }

    const score = weightedTotal > 0 ? weightedFilled / weightedTotal : 0;
    const tier = this._getCompletenessTier(score);

    // Calculate filled fields list for the fields property
    const filledFieldsList = [];
    for (const [tier, fields] of Object.entries(this.fieldTiers)) {
      for (const field of fields) {
        if (this._hasValue(record[field])) {
          filledFieldsList.push(field);
        }
      }
    }

    return {
      score,
      tier,
      fields: filledFieldsList, // List of filled field names
      filledFields: Object.values(assessment).reduce((sum, t) => sum + t.filled, 0),
      totalFields: Object.values(assessment).reduce((sum, t) => sum + t.total, 0),
      missingCritical: [...assessment.critical.missing, ...missingMarketCritical],
      details: assessment
    };
  }

  /**
   * Assess data quality of a record
   * @param {Object} record - Record to assess
   * @returns {Object} Quality assessment
   */
  assessQuality(record) {
    if (!record || typeof record !== 'object') {
      return { score: 0, issues: ['No record data'] };
    }

    const issues = [];
    let qualityPoints = 0;
    let totalChecks = 0;

    // Check name quality
    const name = record.Name || record.name || record.CompanyName;
    if (name) {
      totalChecks++;
      if (name.length > 2 && !/^[0-9]+$/.test(name) && !/test|dummy|fake|sample|example/i.test(name)) {
        qualityPoints++;
      } else {
        issues.push('Name appears invalid or test data');
      }
    }

    // Check for suspicious phone patterns (placeholder detection)
    const phoneCheck = record.Phone || record.phone;
    if (phoneCheck) {
      const digitsCheck = String(phoneCheck).replace(/\D/g, '');
      // Check for all zeros or repeating patterns
      if (/^0+$/.test(digitsCheck) || /^(.)\1+$/.test(digitsCheck)) {
        issues.push('Phone number appears to be placeholder data');
      }
    }

    // Check state quality
    const state = record.State || record.state || record.BillingState;
    if (state) {
      totalChecks++;
      if (/^[A-Z]{2}$/i.test(state) || state.length > 2) {
        qualityPoints++;
      } else {
        issues.push('State format appears invalid');
      }
    }

    // Check domain quality
    const domain = record.Domain || record.domain || record.Website;
    if (domain) {
      totalChecks++;
      if (/\.[a-z]{2,}$/i.test(domain)) {
        qualityPoints++;
      } else {
        issues.push('Domain format appears invalid');
      }
    }

    // Check phone quality
    const phone = record.Phone || record.phone;
    if (phone) {
      totalChecks++;
      const digits = String(phone).replace(/\D/g, '');
      if (digits.length >= 10) {
        qualityPoints++;
      } else {
        issues.push('Phone number too short');
      }
    }

    // Check NPI quality
    const npi = record.NPI || record.npi || record.NPI__c;
    if (npi) {
      totalChecks++;
      if (/^\d{10}$/.test(String(npi))) {
        qualityPoints++;
      } else {
        issues.push('NPI format invalid');
      }
    }

    const score = totalChecks > 0 ? qualityPoints / totalChecks : 0.5; // Default to 0.5 if no checkable fields

    return {
      score,
      qualityPoints,
      totalChecks,
      issues
    };
  }

  /**
   * Get recommended minimum confidence for a completeness level
   * @param {number} completeness - Completeness score (0-1)
   * @returns {number} Recommended minimum confidence
   */
  getMinimumConfidence(completeness) {
    if (completeness >= COMPLETENESS_THRESHOLDS.VERY_HIGH) {
      return 90; // Can auto-merge
    } else if (completeness >= COMPLETENESS_THRESHOLDS.HIGH) {
      return 85;
    } else if (completeness >= COMPLETENESS_THRESHOLDS.MEDIUM) {
      return 80;
    } else if (completeness >= COMPLETENESS_THRESHOLDS.LOW) {
      return 75;
    } else {
      return 70; // Require more certainty with sparse data
    }
  }

  /**
   * Check if a comparison has sufficient data for a given decision
   * @param {Object} recordA - First record
   * @param {Object} recordB - Second record
   * @param {string} decision - Proposed decision (AUTO_MERGE, REVIEW, etc.)
   * @param {string} market - Market type
   * @returns {Object} { sufficient, reason }
   */
  hasSufficientData(recordA, recordB, decision, market = null) {
    const completenessA = this.assessCompleteness(recordA, market);
    const completenessB = this.assessCompleteness(recordB, market);
    const minCompleteness = Math.min(completenessA.score, completenessB.score);

    // AUTO_MERGE requires higher data completeness
    if (decision === 'AUTO_MERGE' && minCompleteness < 0.5) {
      return {
        sufficient: false,
        reason: 'Insufficient data for automatic merge - requires human review',
        recommendation: 'REVIEW'
      };
    }

    // Check for critical field presence
    if (completenessA.missingCritical.length > 0 && completenessB.missingCritical.length > 0) {
      return {
        sufficient: false,
        reason: `Both records missing critical fields: ${[...new Set([...completenessA.missingCritical, ...completenessB.missingCritical])].join(', ')}`,
        recommendation: decision === 'AUTO_MERGE' ? 'REVIEW' : decision
      };
    }

    return {
      sufficient: true,
      completeness: minCompleteness
    };
  }

  /**
   * Get statistics
   * @returns {Object} Weighting statistics
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      adjustmentsApplied: 0,
      totalReduction: 0,
      averageCompleteness: 0,
      asymmetricCases: 0
    };
    this._completenessSum = 0;
  }

  // ========== Private Methods ==========

  _hasValue(value) {
    if (value === null || value === undefined) return false;
    if (typeof value === 'string' && value.trim() === '') return false;
    return true;
  }

  _getCompletenessTier(score) {
    if (score >= COMPLETENESS_THRESHOLDS.VERY_HIGH) return 'VERY_HIGH';
    if (score >= COMPLETENESS_THRESHOLDS.HIGH) return 'HIGH';
    if (score >= COMPLETENESS_THRESHOLDS.MEDIUM) return 'MEDIUM';
    if (score >= COMPLETENESS_THRESHOLDS.LOW) return 'LOW';
    return 'VERY_LOW';
  }

  _getCompletenessFactor(score) {
    const tier = this._getCompletenessTier(score);
    return COMPLETENESS_FACTORS[tier];
  }

  _generateExplanation(completenessA, completenessB, qualityA, qualityB, factor, isAsymmetric) {
    const parts = [];

    const avgCompleteness = (completenessA.score + completenessB.score) / 2;
    parts.push(`Data completeness: ${(avgCompleteness * 100).toFixed(0)}%`);

    if (isAsymmetric) {
      parts.push('Records have asymmetric data');
    }

    if (qualityA.issues.length > 0 || qualityB.issues.length > 0) {
      parts.push('Quality concerns detected');
    }

    if (factor < 1.0) {
      parts.push(`Confidence adjusted by ${((1 - factor) * 100).toFixed(0)}%`);
    }

    return parts.join('. ');
  }
}

// Export
module.exports = {
  ContextualWeighter,
  FIELD_TIERS,
  TIER_WEIGHTS,
  MARKET_CRITICAL_FIELDS,
  COMPLETENESS_THRESHOLDS,
  COMPLETENESS_FACTORS
};

// CLI Usage
if (require.main === module) {
  const args = process.argv.slice(2);
  const weighter = new ContextualWeighter();

  if (args.length === 0) {
    console.log(`
Contextual Weighter CLI

Usage:
  node contextual-weighter.js assess <json-record>
  node contextual-weighter.js adjust <confidence> <json-recordA> <json-recordB> [market]
  node contextual-weighter.js quality <json-record>

Examples:
  node contextual-weighter.js assess '{"Name":"Acme Corp","State":"TX","Phone":"555-1234"}'
  node contextual-weighter.js adjust 85 '{"Name":"Acme"}' '{"Name":"Acme Corp","State":"TX"}'
  node contextual-weighter.js quality '{"Name":"Test","Phone":"123"}'
`);
    process.exit(0);
  }

  const command = args[0];

  if (command === 'assess') {
    const record = JSON.parse(args[1] || '{}');
    const market = args[2] || null;

    const result = weighter.assessCompleteness(record, market);

    console.log('\n=== Completeness Assessment ===\n');
    console.log(`Score: ${(result.score * 100).toFixed(1)}%`);
    console.log(`Tier: ${result.tier}`);
    console.log(`Fields: ${result.filledFields}/${result.totalFields}`);
    if (result.missingCritical.length > 0) {
      console.log(`Missing Critical: ${result.missingCritical.join(', ')}`);
    }
    console.log('');

  } else if (command === 'adjust') {
    const confidence = parseFloat(args[1]);
    const recordA = JSON.parse(args[2] || '{}');
    const recordB = JSON.parse(args[3] || '{}');
    const market = args[4] || null;

    const result = weighter.adjustForContext(confidence, recordA, recordB, market);

    console.log('\n=== Contextual Adjustment ===\n');
    console.log(`Original: ${result.originalConfidence}`);
    console.log(`Adjusted: ${result.adjustedConfidence}`);
    console.log(`Adjustment: ${result.adjustment}`);
    console.log(`Factor: ${result.factor.toFixed(2)}`);
    console.log(`\nContext:`);
    console.log(`  Completeness A: ${(result.context.completenessA * 100).toFixed(1)}%`);
    console.log(`  Completeness B: ${(result.context.completenessB * 100).toFixed(1)}%`);
    console.log(`  Asymmetric: ${result.context.isAsymmetric}`);
    console.log(`\nExplanation: ${result.explanation}`);
    console.log('');

  } else if (command === 'quality') {
    const record = JSON.parse(args[1] || '{}');
    const result = weighter.assessQuality(record);

    console.log('\n=== Quality Assessment ===\n');
    console.log(`Score: ${(result.score * 100).toFixed(1)}%`);
    console.log(`Checks: ${result.qualityPoints}/${result.totalChecks} passed`);
    if (result.issues.length > 0) {
      console.log(`Issues:`);
      result.issues.forEach(i => console.log(`  - ${i}`));
    }
    console.log('');

  } else {
    console.error(`Unknown command: ${command}`);
    process.exit(1);
  }
}
