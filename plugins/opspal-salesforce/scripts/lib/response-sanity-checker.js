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
  fabricationDetection: true,          // Enable fabrication detection (P0 hallucination prevention)
  fabricationConfidence: 0.95,         // High confidence for fabricated data
  enableMonitoring: false,             // Enable metrics tracking (set to true in production)
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

    // Initialize monitoring if enabled
    this.monitor = null;
    if (this.config.enableMonitoring) {
      try {
        const { getMonitor } = require('./hallucination-monitor');
        this.monitor = getMonitor();
      } catch (e) {
        // Monitor not available, continue without it
      }
    }
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

      // Look for complementary patterns: won/lost, success/fail, open/closed
      const complementaryPatterns = [
        [/(\d+(?:\.\d+)?)\s*%\s+(?:of\s+)?(?:deals?\s+)?won/gi, /(\d+(?:\.\d+)?)\s*%\s+(?:of\s+)?(?:deals?\s+)?lost/gi],
        [/(\d+(?:\.\d+)?)\s*%\s+success/gi, /(\d+(?:\.\d+)?)\s*%\s+fail/gi],
        [/(\d+(?:\.\d+)?)\s*%\s+open/gi, /(\d+(?:\.\d+)?)\s*%\s+closed/gi],
        [/(\d+(?:\.\d+)?)\s*%\s+active/gi, /(\d+(?:\.\d+)?)\s*%\s+inactive/gi],
      ];

      for (const [pattern1, pattern2] of complementaryPatterns) {
        const matches1 = [...response.matchAll(pattern1)];
        const matches2 = [...response.matchAll(pattern2)];

        if (matches1.length > 0 && matches2.length > 0) {
          const val1 = parseFloat(matches1[0][1]);
          const val2 = parseFloat(matches2[0][1]);
          const sum = val1 + val2;

          if (Math.abs(sum - 100) > 5) { // Allow 5% tolerance for rounding
            concerns.push({
              claim: `${val1}% + ${val2}% = ${sum}%`,
              reason: `Contradictory complementary percentages don't sum to 100% (got ${sum}%)`,
              confidence: 0.85
            });
            maxConfidence = Math.max(maxConfidence, 0.85);
          }
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

  // =============================================================================
  // FABRICATION DETECTION (P0 Hallucination Prevention - Added 2025-12-26)
  // =============================================================================

  /**
   * Extract Salesforce IDs from text
   * Matches standard 15 and 18 character Salesforce IDs
   * @param {string} text - Text to scan
   * @returns {Set<string>} Set of Salesforce IDs found
   */
  extractSalesforceIds(text) {
    const ids = new Set();
    // Standard Salesforce ID patterns (15 or 18 chars, alphanumeric)
    // Common prefixes: 001 (Account), 003 (Contact), 006 (Opportunity), 00Q (Lead),
    // 500 (Case), 005 (User), a0* (Custom objects)
    const idRegex = /\b(00[1-9a-zA-Z]|01[0-9a-zA-Z]|0Q[0-9a-zA-Z]|5[0-9]{2}|a0[0-9a-zA-Z])[0-9a-zA-Z]{12,15}\b/g;
    let match;
    while ((match = idRegex.exec(text)) !== null) {
      // Normalize to 15-char ID for comparison
      const id = match[0].substring(0, 15);
      ids.add(id);
    }
    return ids;
  }

  /**
   * Validate response against query results for fabrication
   * @param {string} response - Agent response text
   * @param {object} queryResults - Query results with records array
   * @param {object} context - Additional context
   * @returns {object} Validation result with fabrication warnings
   */
  validateFabrication(response, queryResults, context = {}) {
    if (!this.config.fabricationDetection) {
      return { valid: true, concerns: [], confidence: 0 };
    }

    const concerns = [];
    let maxConfidence = 0;

    // 1. Check for fabricated Salesforce IDs
    const idResult = this.detectFabricatedIds(response, queryResults);
    if (!idResult.valid) {
      concerns.push(...idResult.concerns);
      maxConfidence = Math.max(maxConfidence, idResult.confidence);
    }

    // 2. Check for fabricated numeric values
    const numericResult = this.detectFabricatedNumericValues(response, queryResults, context);
    if (!numericResult.valid) {
      concerns.push(...numericResult.concerns);
      maxConfidence = Math.max(maxConfidence, numericResult.confidence);
    }

    // 3. Check for fabricated names (company names, record names)
    const nameResult = this.detectFabricatedNames(response, queryResults, context);
    if (!nameResult.valid) {
      concerns.push(...nameResult.concerns);
      maxConfidence = Math.max(maxConfidence, nameResult.confidence);
    }

    const result = {
      valid: concerns.length === 0,
      confidence: maxConfidence,
      concerns: concerns,
      recommendation: this.getRecommendation(maxConfidence),
      fabricationDetected: concerns.length > 0,
      fabrications_detected: concerns.length > 0
    };

    // Record metrics if monitoring enabled
    if (this.monitor) {
      this.monitor.recordFabricationDetection(result);
    }

    return result;
  }

  /**
   * Detect Salesforce IDs in response that don't exist in query results
   * @param {string} response - Agent response text
   * @param {object} queryResults - Query results with records
   * @returns {object} Validation result
   */
  detectFabricatedIds(response, queryResults) {
    const concerns = [];

    // Extract IDs from response
    const responseIds = this.extractSalesforceIds(response);
    if (responseIds.size === 0) {
      return { valid: true, concerns: [], confidence: 0 };
    }

    // Extract IDs from query results
    const validIds = new Set();
    const records = queryResults?.records || queryResults?.data?.records || queryResults || [];

    if (Array.isArray(records)) {
      for (const record of records) {
        this.extractIdsFromRecord(record, validIds);
      }
    }

    // Find IDs in response that aren't in query results
    const fabricatedIds = [];
    for (const id of responseIds) {
      if (!validIds.has(id) && !validIds.has(id.substring(0, 15))) {
        fabricatedIds.push(id);
      }
    }

    if (fabricatedIds.length > 0) {
      concerns.push({
        type: 'FABRICATED_ID',
        severity: 'critical',
        claim: `Salesforce IDs mentioned but not in query results: ${fabricatedIds.slice(0, 5).join(', ')}${fabricatedIds.length > 5 ? '...' : ''}`,
        reason: `Found ${fabricatedIds.length} Salesforce ID(s) in response that do not exist in the provided query results. These may be fabricated.`,
        confidence: this.config.fabricationConfidence,
        fabricatedIds: fabricatedIds
      });
    }

    return {
      valid: concerns.length === 0,
      confidence: concerns.length > 0 ? this.config.fabricationConfidence : 0,
      concerns: concerns
    };
  }

  /**
   * Extract all IDs from a record (including nested lookups)
   */
  extractIdsFromRecord(record, idSet) {
    if (!record || typeof record !== 'object') return;

    for (const [key, value] of Object.entries(record)) {
      if (key === 'Id' && typeof value === 'string') {
        idSet.add(value.substring(0, 15));
        idSet.add(value);
      } else if (key.endsWith('Id') && typeof value === 'string' && value.length >= 15) {
        idSet.add(value.substring(0, 15));
        idSet.add(value);
      } else if (value && typeof value === 'object') {
        this.extractIdsFromRecord(value, idSet);
      }
    }
  }

  /**
   * Detect numeric values in response that don't match query results
   * Focuses on specific metrics like pipeline values, counts, percentages
   */
  detectFabricatedNumericValues(response, queryResults, context = {}) {
    const concerns = [];

    // Extract numeric claims from response (e.g., "$1.2M pipeline", "147 opportunities")
    const numericClaims = this.extractNumericClaims(response);
    if (numericClaims.length === 0) {
      return { valid: true, concerns: [], confidence: 0 };
    }

    // Extract actual values from query results
    const actualValues = this.extractValuesFromResults(queryResults);

    // Check for values that don't match any actual data
    for (const claim of numericClaims) {
      if (claim.type === 'currency' || claim.type === 'count') {
        const found = this.findMatchingValue(claim.value, actualValues, claim.tolerance || 0.05);
        if (!found && claim.value > 0) {
          // Only flag if we have actual values to compare against
          if (actualValues.length > 0) {
            concerns.push({
              type: 'UNSUPPORTED_NUMERIC',
              severity: 'high',
              claim: claim.text,
              reason: `Numeric value "${claim.text}" not found in query results. Closest actual values: ${actualValues.slice(0, 3).join(', ')}`,
              confidence: 0.8,
              claimedValue: claim.value,
              actualValues: actualValues.slice(0, 5)
            });
          }
        }
      }
    }

    return {
      valid: concerns.length === 0,
      confidence: concerns.length > 0 ? 0.8 : 0,
      concerns: concerns
    };
  }

  /**
   * Extract numeric claims from response text
   */
  extractNumericClaims(response) {
    const claims = [];

    // Currency patterns ($X, $XK, $XM, $XB)
    const currencyRegex = /\$[\d,]+(?:\.\d+)?(?:\s*[KMB])?/gi;
    let match;
    while ((match = currencyRegex.exec(response)) !== null) {
      const value = this.parseCurrencyValue(match[0]);
      if (value !== null) {
        claims.push({ type: 'currency', value, text: match[0], tolerance: 0.10 });
      }
    }

    // Count patterns (X records, X opportunities, X leads)
    const countRegex = /(\d+(?:,\d+)*)\s+(?:record|opportunit|lead|contact|account|case)s?/gi;
    while ((match = countRegex.exec(response)) !== null) {
      const value = parseInt(match[1].replace(/,/g, ''));
      claims.push({ type: 'count', value, text: match[0], tolerance: 0 });
    }

    return claims;
  }

  /**
   * Parse currency value from string (e.g., "$1.2M" -> 1200000)
   */
  parseCurrencyValue(str) {
    const cleaned = str.replace(/[$,]/g, '').trim();
    const multipliers = { 'K': 1000, 'M': 1000000, 'B': 1000000000 };

    for (const [suffix, mult] of Object.entries(multipliers)) {
      if (cleaned.toUpperCase().endsWith(suffix)) {
        return parseFloat(cleaned.slice(0, -1)) * mult;
      }
    }

    return parseFloat(cleaned);
  }

  /**
   * Extract numeric values from query results
   * Supports: { records: [...] }, { data: { records: [...] } }, { query_001: [...], query_002: [...] }
   */
  extractValuesFromResults(queryResults) {
    const values = [];

    // Handle standard formats
    const records = queryResults?.records || queryResults?.data?.records || [];
    if (Array.isArray(records)) {
      for (const record of records) {
        this.extractNumericValuesFromRecord(record, values);
      }
    }

    // Handle query-keyed format: { query_001: [...], query_002: [...] }
    if (queryResults && typeof queryResults === 'object') {
      for (const [key, value] of Object.entries(queryResults)) {
        if (key.startsWith('query_') && Array.isArray(value)) {
          for (const record of value) {
            this.extractNumericValuesFromRecord(record, values);
          }
        }
      }
    }

    // Handle if queryResults itself is an array
    if (Array.isArray(queryResults)) {
      for (const record of queryResults) {
        this.extractNumericValuesFromRecord(record, values);
      }
    }

    // Also check for aggregate results
    if (queryResults?.totalSize !== undefined) {
      values.push(queryResults.totalSize);
    }

    return [...new Set(values)].sort((a, b) => b - a);
  }

  /**
   * Extract numeric values from a record
   */
  extractNumericValuesFromRecord(record, values) {
    if (!record || typeof record !== 'object') return;

    for (const [key, value] of Object.entries(record)) {
      if (typeof value === 'number') {
        values.push(value);
      } else if (value && typeof value === 'object') {
        this.extractNumericValuesFromRecord(value, values);
      }
    }
  }

  /**
   * Find if a claimed value matches any actual value within tolerance
   * Also checks if the claimed value is a sum of actual values
   */
  findMatchingValue(claimed, actuals, tolerance) {
    for (const actual of actuals) {
      const diff = Math.abs(claimed - actual) / Math.max(claimed, actual, 1);
      if (diff <= tolerance) {
        return true;
      }
      // Also check for exact match
      if (claimed === actual) {
        return true;
      }
    }

    // Check if claimed value is a sum of actual values
    if (actuals.length >= 2) {
      const sum = actuals.reduce((a, b) => a + b, 0);
      const sumDiff = Math.abs(claimed - sum) / Math.max(claimed, sum, 1);
      if (sumDiff <= tolerance) {
        return true;
      }
    }

    return false;
  }

  /**
   * Detect fabricated names (company names, record names) not in query results
   */
  detectFabricatedNames(response, queryResults, context = {}) {
    const concerns = [];

    // Extract name fields from query results
    const validNames = new Set();
    const records = queryResults?.records || queryResults?.data?.records || queryResults || [];

    if (Array.isArray(records)) {
      for (const record of records) {
        this.extractNamesFromRecord(record, validNames);
      }
    }

    // Known placeholder patterns that indicate fabrication
    const fabricationPatterns = [
      /\b(Example|Sample|Test|Demo|Dummy)\s+(Corp|Inc|Company|LLC|Ltd)/gi,
      /\bAcme\s+(?:Corp|Inc|Company)/gi,
      /\bJohn\s+Doe\b/gi,
      /\bJane\s+Doe\b/gi,
      /\b(Lead|Opportunity|Contact|Account)\s+\d+\b/gi,  // "Lead 1", "Opportunity 23"
    ];

    for (const pattern of fabricationPatterns) {
      let match;
      while ((match = pattern.exec(response)) !== null) {
        // Skip if this name actually exists in the query results
        const matchedName = match[0].toLowerCase();
        if (validNames.has(matchedName)) {
          continue;
        }
        concerns.push({
          type: 'FABRICATED_NAME',
          severity: 'high',
          claim: match[0],
          reason: `Detected placeholder/fabricated name pattern: "${match[0]}". This appears to be synthetic data, not from actual query results.`,
          confidence: 0.9
        });
      }
    }

    return {
      valid: concerns.length === 0,
      confidence: concerns.length > 0 ? 0.9 : 0,
      concerns: concerns
    };
  }

  /**
   * Extract name values from a record
   */
  extractNamesFromRecord(record, nameSet) {
    if (!record || typeof record !== 'object') return;

    const nameFields = ['Name', 'FirstName', 'LastName', 'CompanyName', 'Company', 'AccountName'];

    for (const [key, value] of Object.entries(record)) {
      if (nameFields.includes(key) && typeof value === 'string') {
        nameSet.add(value.toLowerCase());
      } else if (value && typeof value === 'object') {
        this.extractNamesFromRecord(value, nameSet);
      }
    }
  }

  /**
   * Calculate citation coverage for a response
   * @param {object} response - Response with supported_claims structure
   * @param {Set<string>} sources - Set of valid source IDs
   * @returns {object} Citation coverage metrics
   */
  calculateCitationCoverage(response, sources) {
    // If response has supported_claims structure
    if (response.supported_claims && Array.isArray(response.supported_claims)) {
      const claims = response.supported_claims;
      const citedClaims = claims.filter(c => c.source_id && sources.has(c.source_id));

      return {
        total_claims: claims.length,
        cited_claims: citedClaims.length,
        coverage_percent: claims.length > 0 ? (citedClaims.length / claims.length) * 100 : 100,
        uncited_claims: claims.filter(c => !c.source_id).map(c => c.statement)
      };
    }

    // If no structured claims, return unknown
    return {
      total_claims: 0,
      cited_claims: 0,
      coverage_percent: null,
      uncited_claims: [],
      note: 'Response does not use supported_claims structure'
    };
  }

  // =============================================================================
  // CITATION VERIFICATION (Phase 2 Hallucination Prevention)
  // =============================================================================

  /**
   * Verify claims against source data (post-generation verification)
   * Per Anthropic guidelines: After generating response, verify each claim
   * by finding supporting quote. If no quote found, retract the claim.
   *
   * @param {string} response - Response text to verify
   * @param {object} sources - Source data (query results, documents)
   * @returns {object} Verification result with verified/retracted claims
   */
  verifyClaimsAgainstSources(response, sources) {
    const claims = this.extractClaimsFromText(response);
    const verified = [];
    const retracted = [];

    for (const claim of claims) {
      const supportingQuote = this.findSupportingQuote(claim, sources);
      if (supportingQuote) {
        verified.push({
          claim: claim.text,
          type: claim.type,
          value: claim.value,
          quote: supportingQuote.quote,
          source_id: supportingQuote.source_id,
          confidence: supportingQuote.confidence
        });
      } else {
        retracted.push({
          claim: claim.text,
          type: claim.type,
          value: claim.value,
          reason: 'No supporting quote found in source data'
        });
      }
    }

    const coverage = claims.length > 0 ? verified.length / claims.length : 1;

    const result = {
      valid: retracted.length === 0,
      verified,
      retracted,
      total_claims: claims.length,
      coverage_percent: coverage * 100,
      recommendation: coverage >= 0.95 ? 'pass' : coverage >= 0.8 ? 'warn' : 'block'
    };

    // Record metrics if monitoring enabled
    if (this.monitor) {
      this.monitor.recordCitationVerification(result);
    }

    return result;
  }

  /**
   * Find a supporting quote for a claim in source data
   * @param {object} claim - Claim object with text, type, value
   * @param {object} sources - Source data object (supports { records: [...] } or { query_001: [...], query_002: [...] })
   * @returns {object|null} Supporting quote or null
   */
  findSupportingQuote(claim, sources) {
    if (!sources) return null;

    const tolerance = 0.05; // 5% tolerance for numeric matching

    // Collect all records from various source formats
    const recordSets = this.extractRecordSets(sources);

    // For numeric claims, look for matching values in source data
    if (claim.type === 'currency' || claim.type === 'count' || claim.type === 'percentage') {
      for (const { source_id, records } of recordSets) {
        for (let i = 0; i < records.length; i++) {
          const record = records[i];
          const matchResult = this.findMatchingValueInRecord(claim.value, record, tolerance);
          if (matchResult) {
            return {
              quote: `${matchResult.field}: ${matchResult.value}`,
              source_id: source_id,
              confidence: matchResult.exactMatch ? 1.0 : 0.9
            };
          }
        }
      }

      // Check aggregates (totalSize, sum calculations)
      if (sources.totalSize !== undefined && claim.type === 'count') {
        const diff = Math.abs(claim.value - sources.totalSize) / Math.max(claim.value, sources.totalSize, 1);
        if (diff <= tolerance) {
          return {
            quote: `totalSize: ${sources.totalSize}`,
            source_id: 'query_aggregate',
            confidence: 1.0
          };
        }
      }

      // Check if value is a sum of source values
      const allValues = this.extractValuesFromResults(sources);
      if (allValues.length > 0) {
        const sum = allValues.reduce((a, b) => a + b, 0);
        const sumDiff = Math.abs(claim.value - sum) / Math.max(claim.value, sum, 1);
        if (sumDiff <= tolerance) {
          return {
            quote: `Sum of ${allValues.length} values: ${sum}`,
            source_id: 'calculated_sum',
            confidence: 0.95
          };
        }
      }
    }

    // For attribution claims, look for matching names
    if (claim.type === 'attribution') {
      for (const { source_id, records } of recordSets) {
        for (let i = 0; i < records.length; i++) {
          const record = records[i];
          if (this.recordContainsName(claim.name, record)) {
            return {
              quote: `Record contains: ${claim.name}`,
              source_id: source_id,
              confidence: 0.95
            };
          }
        }
      }
    }

    return null;
  }

  /**
   * Extract record sets from various source formats
   * Supports: { records: [...] }, { data: { records: [...] } }, { query_001: [...], query_002: [...] }
   * @param {object} sources - Source data object
   * @returns {Array<{source_id: string, records: Array}>} Array of record sets with source IDs
   */
  extractRecordSets(sources) {
    const recordSets = [];

    // Standard format: { records: [...] }
    if (sources.records && Array.isArray(sources.records)) {
      recordSets.push({ source_id: 'records', records: sources.records });
    }

    // Nested format: { data: { records: [...] } }
    if (sources.data?.records && Array.isArray(sources.data.records)) {
      recordSets.push({ source_id: 'data_records', records: sources.data.records });
    }

    // Query-keyed format: { query_001: [...], query_002: [...] }
    for (const [key, value] of Object.entries(sources)) {
      if (key.startsWith('query_') && Array.isArray(value)) {
        recordSets.push({ source_id: key, records: value });
      }
    }

    return recordSets;
  }

  /**
   * Find a matching numeric value in a record
   */
  findMatchingValueInRecord(value, record, tolerance) {
    if (!record || typeof record !== 'object') return null;

    for (const [field, fieldValue] of Object.entries(record)) {
      if (typeof fieldValue === 'number') {
        const diff = Math.abs(value - fieldValue) / Math.max(value, fieldValue, 1);
        if (diff <= tolerance) {
          return { field, value: fieldValue, exactMatch: diff === 0 };
        }
      } else if (fieldValue && typeof fieldValue === 'object') {
        const nested = this.findMatchingValueInRecord(value, fieldValue, tolerance);
        if (nested) return nested;
      }
    }
    return null;
  }

  /**
   * Check if a record contains a specific name
   */
  recordContainsName(name, record) {
    if (!record || typeof record !== 'object') return false;
    const nameFields = ['Name', 'FirstName', 'LastName', 'CompanyName', 'Company', 'AccountName'];
    const nameLower = name.toLowerCase();

    for (const [key, value] of Object.entries(record)) {
      if (nameFields.includes(key) && typeof value === 'string') {
        if (value.toLowerCase().includes(nameLower)) return true;
      } else if (value && typeof value === 'object') {
        if (this.recordContainsName(name, value)) return true;
      }
    }
    return false;
  }

  /**
   * Enhanced claim extraction from text
   * Detects: numeric, currency, percentage, comparative, temporal, attribution claims
   * @param {string} text - Response text
   * @returns {array} Array of claim objects
   */
  extractClaimsFromText(text) {
    const claims = [];

    // Currency claims ($X, $XK, $XM)
    const currencyRegex = /\$[\d,]+(?:\.\d+)?(?:\s*[KMB])?/gi;
    let match;
    while ((match = currencyRegex.exec(text)) !== null) {
      const value = this.parseCurrencyValue(match[0]);
      if (value !== null) {
        claims.push({ type: 'currency', value, text: match[0] });
      }
    }

    // Percentage claims
    const percentRegex = /(\d+(?:\.\d+)?)\s*%/g;
    while ((match = percentRegex.exec(text)) !== null) {
      claims.push({ type: 'percentage', value: parseFloat(match[1]), text: match[0] });
    }

    // Count claims (X records, X opportunities, etc.)
    const countRegex = /(\d+(?:,\d+)*)\s+(?:record|opportunit|lead|contact|account|case|product|quote|user)s?/gi;
    while ((match = countRegex.exec(text)) !== null) {
      claims.push({ type: 'count', value: parseInt(match[1].replace(/,/g, '')), text: match[0] });
    }

    // Comparative claims (X% higher/lower, increased by X)
    const comparativeRegex = /(\d+(?:\.\d+)?)\s*%?\s*(?:higher|lower|more|less|increase[d]?|decrease[d]?|improvement|decline)/gi;
    while ((match = comparativeRegex.exec(text)) !== null) {
      claims.push({ type: 'comparative', value: parseFloat(match[1]), text: match[0] });
    }

    // Temporal claims (last X days/weeks/months, YoY, QoQ)
    const temporalRegex = /(?:last|past|previous)\s+(\d+)\s+(?:day|week|month|quarter|year)s?|(?:YoY|QoQ|MoM)\s+(?:growth|change|increase|decrease)\s+(?:of\s+)?(\d+(?:\.\d+)?)\s*%?/gi;
    while ((match = temporalRegex.exec(text)) !== null) {
      const value = parseFloat(match[1] || match[2]);
      claims.push({ type: 'temporal', value, text: match[0] });
    }

    // Attribution claims (top X is Y, #1 is, leading)
    const attributionRegex = /(?:top|#1|leading|largest|highest|best)\s+(?:\w+\s+){0,2}(?:is|are|:)\s+([A-Z][a-zA-Z\s]+?)(?:\s+(?:with|at|by|-)|\.|,|$)/gi;
    while ((match = attributionRegex.exec(text)) !== null) {
      claims.push({ type: 'attribution', name: match[1].trim(), text: match[0] });
    }

    return claims;
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
    console.log('  node response-sanity-checker.js validate-fabrication --response <file> --query-results <file>');
    console.log('  node response-sanity-checker.js update-profile --org <alias> --counts <json>');
    console.log('  node response-sanity-checker.js get-profile --org <alias>');
    console.log('');
    console.log('Commands:');
    console.log('  validate            Validate response for statistical plausibility');
    console.log('  validate-fabrication  Check response against query results for fabricated data (P0 hallucination prevention)');
    console.log('  update-profile      Update org profile with known record counts');
    console.log('  get-profile         Get stored org profile');
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

  } else if (command === 'validate-fabrication') {
    const responseFile = args[args.indexOf('--response') + 1];
    const queryResultsFile = args[args.indexOf('--query-results') + 1];

    if (!responseFile || !queryResultsFile) {
      console.error('Error: --response and --query-results required');
      process.exit(1);
    }

    const response = fs.readFileSync(responseFile, 'utf8');
    const queryResults = JSON.parse(fs.readFileSync(queryResultsFile, 'utf8'));

    const result = checker.validateFabrication(response, queryResults);
    console.log(JSON.stringify(result, null, 2));

    if (!result.valid) {
      console.error('\n⚠️  FABRICATION DETECTED - Response may contain hallucinated data');
      process.exit(1);
    }

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
