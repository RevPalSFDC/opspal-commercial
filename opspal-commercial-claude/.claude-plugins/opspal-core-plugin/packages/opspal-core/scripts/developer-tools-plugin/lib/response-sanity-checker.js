#!/usr/bin/env node

/**
 * Response Sanity Checker
 *
 * Validates agent responses for plausibility, statistical accuracy, and internal consistency.
 * Used by response-validator agent to catch obviously incorrect claims.
 *
 * @module response-sanity-checker
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');

/**
 * Default configuration
 */
const DEFAULT_CONFIG = {
  percentageBounds: [5, 95],           // Flag percentages outside this range
  recordCountDeviation: 0.5,           // Flag counts deviating >50% from expected
  crossReferenceTolerance: 0.1,        // Allow 10% discrepancy in totals
  autoRetryConfidence: 0.8,            // Auto-retry if confidence > 80%
  warnConfidence: 0.5,                 // Warn if confidence > 50%
  roundNumberSuspicion: 0.7,           // Flag round numbers with this confidence
  zeroCountSuspicion: 0.9,             // Flag zero counts with high confidence
};

/**
 * Org profiles for record count validation
 * Cached from previous queries or user-provided
 */
const ORG_PROFILES = {};

class ResponseSanityChecker {
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.orgProfilesPath = path.join(process.cwd(), '.cache', 'org-profiles.json');
    this.loadOrgProfiles();
  }

  /**
   * Load org profiles from cache
   */
  loadOrgProfiles() {
    try {
      if (fs.existsSync(this.orgProfilesPath)) {
        const data = fs.readFileSync(this.orgProfilesPath, 'utf8');
        Object.assign(ORG_PROFILES, JSON.parse(data));
      }
    } catch (error) {
      // Ignore errors, use empty profiles
    }
  }

  /**
   * Save org profiles to cache
   */
  saveOrgProfiles() {
    try {
      const cacheDir = path.dirname(this.orgProfilesPath);
      if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
      }
      fs.writeFileSync(this.orgProfilesPath, JSON.stringify(ORG_PROFILES, null, 2));
    } catch (error) {
      // Ignore errors, profiles not cached
    }
  }

  /**
   * Main validation method
   * @param {string} response - Agent response text
   * @param {object} context - Context object (org, operation, etc.)
   * @returns {object} Validation result { valid, confidence, concerns }
   */
  validate(response, context = {}) {
    const concerns = [];
    let maxConfidence = 0;

    // Extract claims from response
    const claims = this.extractClaims(response);

    // Validate each claim type
    for (const claim of claims) {
      let result = null;

      switch (claim.type) {
        case 'percentage':
          result = this.validatePercentage(claim, context);
          break;
        case 'ratio':
          result = this.validateRatio(claim.numerator, claim.denominator, context);
          break;
        case 'record_count':
          result = this.validateRecordCount(claim.count, claim.objectType, context.org);
          break;
        case 'zero_count':
          result = this.validateZeroCount(claim, context);
          break;
        case 'distribution':
          result = this.validateDistribution(claim.parts, claim.total);
          break;
      }

      if (result && !result.valid) {
        concerns.push({
          claim: claim.text,
          reason: result.reason,
          confidence: result.confidence
        });
        maxConfidence = Math.max(maxConfidence, result.confidence);
      }
    }

    // Cross-reference validation
    const crossRefResult = this.checkInternalConsistency(response, claims);
    if (!crossRefResult.valid) {
      concerns.push(...crossRefResult.concerns);
      maxConfidence = Math.max(maxConfidence, crossRefResult.confidence);
    }

    return {
      valid: concerns.length === 0,
      confidence: maxConfidence,
      concerns: concerns,
      recommendation: this.getRecommendation(maxConfidence)
    };
  }

  /**
   * Extract claims from response text
   * @param {string} response - Response text
   * @returns {array} Array of claim objects
   */
  extractClaims(response) {
    const claims = [];

    // Extract percentages
    const percentageRegex = /(\d+(?:\.\d+)?)\s*%/g;
    let match;
    while ((match = percentageRegex.exec(response)) !== null) {
      claims.push({
        type: 'percentage',
        value: parseFloat(match[1]),
        text: match[0],
        index: match.index
      });
    }

    // Extract ratios (X out of Y, X/Y)
    const ratioRegex = /(\d+(?:,\d+)*)\s*(?:out of|\/)\s*(\d+(?:,\d+)*)/gi;
    while ((match = ratioRegex.exec(response)) !== null) {
      const numerator = parseInt(match[1].replace(/,/g, ''));
      const denominator = parseInt(match[2].replace(/,/g, ''));
      claims.push({
        type: 'ratio',
        numerator: numerator,
        denominator: denominator,
        text: match[0],
        index: match.index
      });
    }

    // Extract record counts with object types
    const recordCountRegex = /(\d+(?:,\d+)*)\s+(Account|Contact|Lead|Opportunity|Case|User|Profile|Layout|Field)s?/gi;
    while ((match = recordCountRegex.exec(response)) !== null) {
      claims.push({
        type: 'record_count',
        count: parseInt(match[1].replace(/,/g, '')),
        objectType: match[2],
        text: match[0],
        index: match.index
      });
    }

    // Extract zero counts
    const zeroCountRegex = /(0|zero|no)\s+(?:records?|fields?|items?)\s+(?:use|using|with|have)/gi;
    while ((match = zeroCountRegex.exec(response)) !== null) {
      claims.push({
        type: 'zero_count',
        text: match[0],
        index: match.index
      });
    }

    // Extract distributions (totals with breakdowns)
    const distributionRegex = /total[:\s]+(\d+(?:,\d+)*)/gi;
    while ((match = distributionRegex.exec(response)) !== null) {
      const total = parseInt(match[1].replace(/,/g, ''));
      // Look for breakdown nearby (next 200 characters)
      const context = response.substr(match.index, 200);
      const parts = this.extractDistributionParts(context);
      if (parts.length > 0) {
        claims.push({
          type: 'distribution',
          total: total,
          parts: parts,
          text: match[0],
          index: match.index
        });
      }
    }

    return claims;
  }

  /**
   * Extract distribution parts from context
   */
  extractDistributionParts(context) {
    const parts = [];
    const partRegex = /(\d+(?:,\d+)*)\s+(?:with|without|for|in|of)/g;
    let match;
    while ((match = partRegex.exec(context)) !== null) {
      parts.push(parseInt(match[1].replace(/,/g, '')));
    }
    return parts;
  }

  /**
   * Validate percentage claim
   * @param {object} claim - Percentage claim
   * @param {object} context - Context
   * @returns {object} Validation result
   */
  validatePercentage(claim, context) {
    const { value } = claim;
    const { percentageBounds } = this.config;

    // Check if percentage is outside bounds
    if (value > percentageBounds[1]) {
      return {
        valid: false,
        confidence: 0.8 + (value - percentageBounds[1]) * 0.01, // Higher % = higher confidence
        reason: `Percentage ${value}% exceeds upper threshold (${percentageBounds[1]}%)`
      };
    }

    if (value < percentageBounds[0]) {
      return {
        valid: false,
        confidence: 0.7 + (percentageBounds[0] - value) * 0.01,
        reason: `Percentage ${value}% below lower threshold (${percentageBounds[0]}%)`
      };
    }

    // Check for suspiciously round numbers on large datasets
    if (this.isRoundNumber(value) && context.recordCount && context.recordCount > 1000) {
      return {
        valid: false,
        confidence: this.config.roundNumberSuspicion,
        reason: `Suspiciously round percentage (${value}%) for large dataset`
      };
    }

    return { valid: true, confidence: 0 };
  }

  /**
   * Validate ratio claim
   * @param {number} numerator
   * @param {number} denominator
   * @param {object} context
   * @returns {object} Validation result
   */
  validateRatio(numerator, denominator, context) {
    if (denominator === 0) {
      return {
        valid: false,
        confidence: 1.0,
        reason: 'Division by zero in ratio'
      };
    }

    const percentage = (numerator / denominator) * 100;

    // Delegate to percentage validation
    const percentageResult = this.validatePercentage(
      { value: percentage },
      { ...context, recordCount: denominator }
    );

    if (!percentageResult.valid) {
      return {
        valid: false,
        confidence: percentageResult.confidence,
        reason: `Implausible ratio: ${numerator}/${denominator} = ${percentage.toFixed(1)}% - ${percentageResult.reason}`
      };
    }

    return { valid: true, confidence: 0 };
  }

  /**
   * Validate record count claim
   * @param {number} count - Record count
   * @param {string} objectType - Object type (Account, Contact, etc.)
   * @param {string} orgAlias - Org alias
   * @returns {object} Validation result
   */
  validateRecordCount(count, objectType, orgAlias) {
    if (!orgAlias || !ORG_PROFILES[orgAlias]) {
      // No org profile, can't validate
      return { valid: true, confidence: 0 };
    }

    const profile = ORG_PROFILES[orgAlias];
    const expectedCount = profile[objectType];

    if (!expectedCount) {
      // No data for this object type
      return { valid: true, confidence: 0 };
    }

    // Check deviation
    const deviation = Math.abs(count - expectedCount) / expectedCount;

    if (deviation > this.config.recordCountDeviation) {
      return {
        valid: false,
        confidence: 0.6 + Math.min(deviation, 0.4), // Cap at 1.0
        reason: `Record count ${count} deviates ${(deviation * 100).toFixed(0)}% from expected ${expectedCount} for ${objectType} in ${orgAlias}`
      };
    }

    return { valid: true, confidence: 0 };
  }

  /**
   * Validate zero count claim
   * @param {object} claim - Zero count claim
   * @param {object} context - Context
   * @returns {object} Validation result
   */
  validateZeroCount(claim, context) {
    // Zero counts are suspicious for:
    // - Standard/required fields
    // - Large orgs (>1000 records)

    const suspiciousKeywords = [
      'email', 'name', 'owner', 'created', 'modified',
      'id', 'date', 'status', 'type'
    ];

    const claimLower = claim.text.toLowerCase();
    const isSuspicious = suspiciousKeywords.some(kw => claimLower.includes(kw));

    if (isSuspicious) {
      return {
        valid: false,
        confidence: this.config.zeroCountSuspicion,
        reason: `Zero count suspicious for likely required/standard field: "${claim.text}"`
      };
    }

    return { valid: true, confidence: 0 };
  }

  /**
   * Validate distribution (total vs sum of parts)
   * @param {array} parts - Array of part values
   * @param {number} total - Total value
   * @returns {object} Validation result
   */
  validateDistribution(parts, total) {
    const sum = parts.reduce((acc, val) => acc + val, 0);
    const discrepancy = Math.abs(sum - total);
    const tolerance = total * this.config.crossReferenceTolerance;

    if (discrepancy > tolerance) {
      const percentOff = (discrepancy / total) * 100;
      return {
        valid: false,
        confidence: 0.7 + Math.min(percentOff / 100, 0.3),
        reason: `Distribution mismatch: sum of parts (${sum}) differs from total (${total}) by ${discrepancy} (${percentOff.toFixed(1)}%)`
      };
    }

    return { valid: true, confidence: 0 };
  }

  /**
   * Check internal consistency across multiple claims
   * @param {string} response - Full response text
   * @param {array} claims - Extracted claims
   * @returns {object} Validation result
   */
  checkInternalConsistency(response, claims) {
    const concerns = [];
    let maxConfidence = 0;

    // Check for contradictory percentage claims
    const percentageClaims = claims.filter(c => c.type === 'percentage');
    if (percentageClaims.length >= 2) {
      // Look for "X% with Y" and "Z% without Y" patterns
      const withPattern = /(\d+(?:\.\d+)?)\s*%\s+with/g;
      const withoutPattern = /(\d+(?:\.\d+)?)\s*%\s+without/g;

      const withMatches = [...response.matchAll(withPattern)];
      const withoutMatches = [...response.matchAll(withoutPattern)];

      if (withMatches.length > 0 && withoutMatches.length > 0) {
        const withVal = parseFloat(withMatches[0][1]);
        const withoutVal = parseFloat(withoutMatches[0][1]);
        const sum = withVal + withoutVal;

        if (Math.abs(sum - 100) > 5) { // Allow 5% tolerance for rounding
          concerns.push({
            claim: `${withVal}% with + ${withoutVal}% without = ${sum}%`,
            reason: `Contradictory percentages don't sum to 100% (got ${sum}%)`,
            confidence: 0.85
          });
          maxConfidence = Math.max(maxConfidence, 0.85);
        }
      }
    }

    // Check for distribution mismatches
    const distributionClaims = claims.filter(c => c.type === 'distribution');
    for (const claim of distributionClaims) {
      const result = this.validateDistribution(claim.parts, claim.total);
      if (!result.valid) {
        concerns.push({
          claim: claim.text,
          reason: result.reason,
          confidence: result.confidence
        });
        maxConfidence = Math.max(maxConfidence, result.confidence);
      }
    }

    return {
      valid: concerns.length === 0,
      confidence: maxConfidence,
      concerns: concerns
    };
  }

  /**
   * Check if number is suspiciously round
   */
  isRoundNumber(num) {
    // Round if divisible by 5 or 10
    return num % 10 === 0 || num % 5 === 0;
  }

  /**
   * Get recommendation based on confidence
   */
  getRecommendation(confidence) {
    if (confidence >= this.config.autoRetryConfidence) {
      return 'auto_retry';
    } else if (confidence >= this.config.warnConfidence) {
      return 'warn';
    } else {
      return 'pass';
    }
  }

  /**
   * Update org profile with known counts
   * @param {string} orgAlias
   * @param {object} counts - { Account: 30000, Contact: 45000, ... }
   */
  updateOrgProfile(orgAlias, counts) {
    if (!ORG_PROFILES[orgAlias]) {
      ORG_PROFILES[orgAlias] = {};
    }
    Object.assign(ORG_PROFILES[orgAlias], counts);
    this.saveOrgProfiles();
  }

  /**
   * Get org profile
   */
  getOrgProfile(orgAlias) {
    return ORG_PROFILES[orgAlias] || {};
  }
}

/**
 * CLI interface
 */
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command) {
    console.log('Usage:');
    console.log('  node response-sanity-checker.js validate --response <file> --context <json>');
    console.log('  node response-sanity-checker.js update-profile --org <alias> --counts <json>');
    console.log('  node response-sanity-checker.js get-profile --org <alias>');
    process.exit(1);
  }

  const checker = new ResponseSanityChecker();

  if (command === 'validate') {
    const responseFile = args[args.indexOf('--response') + 1];
    const contextJson = args[args.indexOf('--context') + 1];

    if (!responseFile) {
      console.error('Error: --response required');
      process.exit(1);
    }

    const response = fs.readFileSync(responseFile, 'utf8');
    const context = contextJson ? JSON.parse(contextJson) : {};

    const result = checker.validate(response, context);
    console.log(JSON.stringify(result, null, 2));

  } else if (command === 'update-profile') {
    const org = args[args.indexOf('--org') + 1];
    const countsJson = args[args.indexOf('--counts') + 1];

    if (!org || !countsJson) {
      console.error('Error: --org and --counts required');
      process.exit(1);
    }

    const counts = JSON.parse(countsJson);
    checker.updateOrgProfile(org, counts);
    console.log(`Updated profile for ${org}`);

  } else if (command === 'get-profile') {
    const org = args[args.indexOf('--org') + 1];

    if (!org) {
      console.error('Error: --org required');
      process.exit(1);
    }

    const profile = checker.getOrgProfile(org);
    console.log(JSON.stringify(profile, null, 2));

  } else {
    console.error(`Unknown command: ${command}`);
    process.exit(1);
  }
}

module.exports = ResponseSanityChecker;
