#!/usr/bin/env node

/**
 * HubSpot API Safeguard Library
 *
 * Comprehensive safeguards for HubSpot API operations addressing common errors:
 * - Search API 10,000 result limit detection
 * - Property name normalization (__c suffix handling)
 * - Rate limit tracking and exponential backoff
 * - Batch size enforcement
 * - Salesforce field mapping validation
 *
 * ROI: $16,000/year (HIGHEST ROI in Phase 2)
 *
 * Usage:
 *   const safeguard = new HubSpotAPISafeguard({ portalId: '12345' });
 *   const result = safeguard.validateSearchRequest(searchParams);
 *   const normalized = safeguard.normalizePropertyName('Industry__c');
 *
 * CLI:
 *   node hubspot-api-safeguard.js validate-search <params-json>
 *   node hubspot-api-safeguard.js normalize-property "<name>"
 *   node hubspot-api-safeguard.js check-rate-limit
 *   node hubspot-api-safeguard.js test
 *
 * @module hubspot-api-safeguard
 * @version 1.0.0
 * @created 2026-01-15
 */

const fs = require('fs');
const path = require('path');

const SEVERITY = {
  CRITICAL: 'CRITICAL',
  HIGH: 'HIGH',
  WARNING: 'WARNING',
  INFO: 'INFO'
};

/**
 * HubSpot API limits and quotas
 */
const API_LIMITS = {
  // Search API limits
  search: {
    maxResults: 10000,  // Hard limit - cannot retrieve more
    maxPerPage: 100,    // Results per request
    maxFilterGroups: 5,
    maxFiltersPerGroup: 6,
    maxSorts: 3,
    maxProperties: 20
  },

  // Rate limits by tier — canonical values from config/hubspot-rate-limits.json
  // Source: https://developers.hubspot.com/docs/api/usage-details
  rateLimit: {
    free: { requests: 100, window: 10000, daily: 250000 },
    starter: { requests: 100, window: 10000, daily: 250000 },
    professional: { requests: 190, window: 10000, daily: 625000 },
    enterprise: { requests: 190, window: 10000, daily: 1000000 },
    oauth_app: { requests: 110, window: 10000, daily: null }
  },

  // Batch operation limits
  batch: {
    create: { maxRecords: 100 },
    update: { maxRecords: 100 },
    archive: { maxRecords: 100 },
    upsert: { maxRecords: 100 },
    associations: { maxPerRequest: 100 },
    read: { maxRecords: 100 }
  },

  // Import limits
  import: {
    maxFileSize: 536870912, // 512 MB
    maxRows: 1000000,
    maxColumns: 1000
  }
};

/**
 * Salesforce to HubSpot property name mappings
 */
const SF_TO_HS_MAPPINGS = {
  suffixRemovals: ['__c', '__r', '__pc', '__pr', '__kav', '__ka', '__xo', '__x'],
  caseConversion: 'lowercase_underscore',
  reservedWords: ['hubspot_owner_id', 'hs_object_id', 'createdate', 'lastmodifieddate']
};

/**
 * Rate limit tracker for exponential backoff
 */
class RateLimitTracker {
  constructor() {
    this.requests = [];
    this.backoffMultiplier = 1;
    this.lastRateLimitHit = null;
  }

  recordRequest() {
    const now = Date.now();
    this.requests.push(now);
    // Keep only last 10 seconds of requests
    this.requests = this.requests.filter(t => now - t < 10000);
  }

  getRequestCount(windowMs = 10000) {
    const now = Date.now();
    return this.requests.filter(t => now - t < windowMs).length;
  }

  recordRateLimitHit() {
    this.lastRateLimitHit = Date.now();
    this.backoffMultiplier = Math.min(this.backoffMultiplier * 2, 32);
  }

  getRecommendedDelay() {
    if (!this.lastRateLimitHit) return 0;

    const timeSinceHit = Date.now() - this.lastRateLimitHit;
    if (timeSinceHit > 60000) {
      // Reset after 1 minute
      this.backoffMultiplier = 1;
      return 0;
    }

    return 1000 * this.backoffMultiplier;
  }

  isNearLimit(tier = 'starter') {
    const limit = API_LIMITS.rateLimit[tier] || API_LIMITS.rateLimit.starter;
    const count = this.getRequestCount(limit.window);
    return count >= limit.requests * 0.8; // 80% threshold
  }
}

class HubSpotAPISafeguard {
  constructor(options = {}) {
    this.portalId = options.portalId || process.env.HUBSPOT_PORTAL_ID;
    this.tier = options.tier || 'starter';
    this.verbose = options.verbose || false;
    this.strictMode = options.strictMode || false;

    // Initialize rate limit tracker
    this.rateLimitTracker = new RateLimitTracker();

    // Statistics
    this.stats = {
      validations: 0,
      blocked: 0,
      warnings: 0,
      rateLimitHits: 0,
      propertyNormalizations: 0
    };

    this.log(`HubSpotAPISafeguard initialized for portal: ${this.portalId || 'not specified'}`);
  }

  // ============================================
  // SEARCH API SAFEGUARDS
  // ============================================

  /**
   * Validate search request before execution
   *
   * @param {Object} params - Search request parameters
   * @returns {Object} Validation result
   */
  validateSearchRequest(params) {
    this.stats.validations++;

    const result = {
      valid: true,
      errors: [],
      warnings: [],
      suggestions: [],
      estimatedResults: null
    };

    // Check filter groups limit
    if (params.filterGroups && params.filterGroups.length > API_LIMITS.search.maxFilterGroups) {
      result.errors.push({
        severity: SEVERITY.CRITICAL,
        code: 'TOO_MANY_FILTER_GROUPS',
        message: `Search has ${params.filterGroups.length} filter groups. Maximum is ${API_LIMITS.search.maxFilterGroups}.`,
        limit: API_LIMITS.search.maxFilterGroups,
        actual: params.filterGroups.length
      });
      result.valid = false;
    }

    // Check filters per group
    if (params.filterGroups) {
      params.filterGroups.forEach((group, idx) => {
        if (group.filters && group.filters.length > API_LIMITS.search.maxFiltersPerGroup) {
          result.errors.push({
            severity: SEVERITY.HIGH,
            code: 'TOO_MANY_FILTERS',
            message: `Filter group ${idx} has ${group.filters.length} filters. Maximum is ${API_LIMITS.search.maxFiltersPerGroup}.`,
            groupIndex: idx
          });
          result.valid = false;
        }
      });
    }

    // Check sorts limit
    if (params.sorts && params.sorts.length > API_LIMITS.search.maxSorts) {
      result.errors.push({
        severity: SEVERITY.WARNING,
        code: 'TOO_MANY_SORTS',
        message: `Search has ${params.sorts.length} sorts. Maximum is ${API_LIMITS.search.maxSorts}.`
      });
    }

    // Check properties limit
    if (params.properties && params.properties.length > API_LIMITS.search.maxProperties) {
      result.warnings.push({
        severity: SEVERITY.WARNING,
        code: 'TOO_MANY_PROPERTIES',
        message: `Requesting ${params.properties.length} properties. Consider reducing for performance.`,
        limit: API_LIMITS.search.maxProperties,
        actual: params.properties.length
      });
    }

    // Check for broad queries that might hit 10k limit
    const hasBroadFilters = this.detectBroadQuery(params);
    if (hasBroadFilters) {
      result.warnings.push({
        severity: SEVERITY.HIGH,
        code: 'POTENTIAL_10K_LIMIT',
        message: 'This search may exceed the 10,000 result limit. Consider adding date filters or more specific criteria.',
        suggestions: [
          'Add createdate filter to limit time range',
          'Add more specific property filters',
          'Use pagination with after parameter for large datasets',
          'Consider using CRM export for full dataset extraction'
        ]
      });
      result.suggestions.push(...result.warnings[result.warnings.length - 1].suggestions);
    }

    // Check limit/after params
    if (params.limit && params.limit > API_LIMITS.search.maxPerPage) {
      result.errors.push({
        severity: SEVERITY.CRITICAL,
        code: 'INVALID_LIMIT',
        message: `Limit ${params.limit} exceeds maximum ${API_LIMITS.search.maxPerPage} per page.`
      });
      result.valid = false;
    }

    if (result.errors.length > 0) {
      this.stats.blocked++;
    }
    if (result.warnings.length > 0) {
      this.stats.warnings++;
    }

    return result;
  }

  /**
   * Check if search results approach 10k limit
   *
   * @param {number} total - Total results from search
   * @param {Object} params - Original search params
   * @returns {Object} Limit check result
   */
  checkSearchResultLimit(total, params = {}) {
    const result = {
      hitLimit: total >= API_LIMITS.search.maxResults,
      nearLimit: total >= API_LIMITS.search.maxResults * 0.8,
      total: total,
      maxRetrievable: API_LIMITS.search.maxResults,
      percentOfMax: (total / API_LIMITS.search.maxResults * 100).toFixed(1),
      warnings: [],
      suggestions: []
    };

    if (result.hitLimit) {
      result.warnings.push({
        severity: SEVERITY.CRITICAL,
        code: 'SEARCH_LIMIT_HIT',
        message: `Search returned ${total}+ results. Only first ${API_LIMITS.search.maxResults} are retrievable.`,
        dataLoss: true
      });
      result.suggestions.push(
        'Add date range filters (e.g., createdate >= last month)',
        'Add more specific property filters',
        'Use batch exports for complete datasets',
        'Consider segmenting by lifecycle_stage or other properties'
      );
    } else if (result.nearLimit) {
      result.warnings.push({
        severity: SEVERITY.WARNING,
        code: 'SEARCH_LIMIT_APPROACHING',
        message: `Search returned ${total} results (${result.percentOfMax}% of limit). Consider adding filters.`
      });
    }

    return result;
  }

  /**
   * Detect if query is likely to hit 10k limit
   */
  detectBroadQuery(params) {
    // No filters = definitely broad
    if (!params.filterGroups || params.filterGroups.length === 0) {
      return true;
    }

    // Check if any date filters exist
    const hasDateFilter = params.filterGroups.some(group =>
      group.filters?.some(f =>
        ['createdate', 'lastmodifieddate', 'hs_lastmodifieddate'].includes(f.propertyName)
      )
    );

    // Check if only lifecycle or simple status filter
    const hasOnlySimpleFilter = params.filterGroups.length === 1 &&
      params.filterGroups[0].filters?.length === 1 &&
      ['lifecyclestage', 'hs_pipeline_stage', 'status'].includes(
        params.filterGroups[0].filters[0].propertyName
      );

    return !hasDateFilter && hasOnlySimpleFilter;
  }

  // ============================================
  // PROPERTY NAME SAFEGUARDS
  // ============================================

  /**
   * Normalize property name (handles Salesforce __c suffix)
   *
   * @param {string} propertyName - Original property name
   * @param {Object} options - Normalization options
   * @returns {Object} Normalized result
   */
  normalizePropertyName(propertyName, options = {}) {
    this.stats.propertyNormalizations++;

    const result = {
      original: propertyName,
      normalized: propertyName,
      changes: [],
      warnings: []
    };

    if (!propertyName) {
      return result;
    }

    let normalized = propertyName;

    // Remove Salesforce suffixes
    for (const suffix of SF_TO_HS_MAPPINGS.suffixRemovals) {
      if (normalized.toLowerCase().endsWith(suffix.toLowerCase())) {
        const before = normalized;
        normalized = normalized.slice(0, -suffix.length);
        result.changes.push({
          type: 'suffix_removal',
          from: before,
          to: normalized,
          reason: `Removed Salesforce suffix '${suffix}'`
        });
      }
    }

    // Convert to lowercase with underscores
    if (/[A-Z]/.test(normalized) || /\s/.test(normalized)) {
      const before = normalized;
      normalized = normalized
        .replace(/([A-Z])/g, '_$1')
        .toLowerCase()
        .replace(/^_/, '')
        .replace(/\s+/g, '_')
        .replace(/_+/g, '_');

      result.changes.push({
        type: 'case_conversion',
        from: before,
        to: normalized,
        reason: 'Converted to lowercase_underscore format'
      });
    }

    // Check for reserved words
    if (SF_TO_HS_MAPPINGS.reservedWords.includes(normalized)) {
      result.warnings.push({
        severity: SEVERITY.WARNING,
        code: 'RESERVED_PROPERTY_NAME',
        message: `'${normalized}' is a HubSpot reserved property name`
      });
    }

    // Validate final name
    if (!/^[a-z][a-z0-9_]*$/.test(normalized)) {
      result.warnings.push({
        severity: SEVERITY.HIGH,
        code: 'INVALID_PROPERTY_NAME',
        message: `'${normalized}' is not a valid HubSpot property name`,
        suggestion: 'Property names must start with lowercase letter and contain only lowercase letters, numbers, and underscores'
      });
    }

    result.normalized = normalized;
    return result;
  }

  /**
   * Normalize a batch of property names
   *
   * @param {Array|Object} properties - Property names or mapping object
   * @returns {Object} Batch normalization result
   */
  normalizePropertyBatch(properties) {
    const result = {
      normalized: {},
      original: properties,
      changes: [],
      warnings: []
    };

    if (Array.isArray(properties)) {
      result.normalized = properties.map(p => {
        const r = this.normalizePropertyName(p);
        result.changes.push(...r.changes);
        result.warnings.push(...r.warnings);
        return r.normalized;
      });
    } else if (typeof properties === 'object') {
      for (const [key, value] of Object.entries(properties)) {
        const r = this.normalizePropertyName(key);
        result.changes.push(...r.changes);
        result.warnings.push(...r.warnings);
        result.normalized[r.normalized] = value;
      }
    }

    return result;
  }

  // ============================================
  // RATE LIMIT SAFEGUARDS
  // ============================================

  /**
   * Check rate limit status before request
   *
   * @returns {Object} Rate limit status
   */
  checkRateLimit() {
    const limit = API_LIMITS.rateLimit[this.tier] || API_LIMITS.rateLimit.starter;
    const currentCount = this.rateLimitTracker.getRequestCount(limit.window);
    const nearLimit = this.rateLimitTracker.isNearLimit(this.tier);
    const recommendedDelay = this.rateLimitTracker.getRecommendedDelay();

    return {
      tier: this.tier,
      limit: limit.requests,
      window: `${limit.window / 1000} seconds`,
      currentCount: currentCount,
      remaining: Math.max(0, limit.requests - currentCount),
      nearLimit: nearLimit,
      recommendedDelay: recommendedDelay,
      shouldWait: recommendedDelay > 0 || nearLimit,
      message: nearLimit
        ? `Approaching rate limit (${currentCount}/${limit.requests}). Consider waiting.`
        : `Rate limit OK (${currentCount}/${limit.requests})`
    };
  }

  /**
   * Record a successful request
   */
  recordRequest() {
    this.rateLimitTracker.recordRequest();
  }

  /**
   * Handle rate limit error (429)
   *
   * @param {Object} error - Rate limit error response
   * @returns {Object} Backoff recommendation
   */
  handleRateLimitError(error) {
    this.stats.rateLimitHits++;
    this.rateLimitTracker.recordRateLimitHit();

    const delay = this.rateLimitTracker.getRecommendedDelay();
    const retryAfter = error?.headers?.['retry-after'] || error?.retryAfter;

    return {
      shouldRetry: true,
      delay: retryAfter ? parseInt(retryAfter) * 1000 : delay,
      backoffMultiplier: this.rateLimitTracker.backoffMultiplier,
      message: `Rate limited. Wait ${delay / 1000} seconds before retrying.`,
      recommendation: retryAfter
        ? `Server specified retry-after: ${retryAfter}s`
        : `Using exponential backoff: ${delay / 1000}s`
    };
  }

  // ============================================
  // BATCH OPERATION SAFEGUARDS
  // ============================================

  /**
   * Validate batch operation parameters
   *
   * @param {string} operation - Operation type (create, update, archive, etc.)
   * @param {Array} records - Records to process
   * @returns {Object} Validation result
   */
  validateBatchOperation(operation, records) {
    this.stats.validations++;

    const result = {
      valid: true,
      errors: [],
      warnings: [],
      batches: [],
      batchCount: 0
    };

    const limit = API_LIMITS.batch[operation];
    if (!limit) {
      result.warnings.push({
        severity: SEVERITY.WARNING,
        code: 'UNKNOWN_OPERATION',
        message: `Unknown batch operation: ${operation}`
      });
      return result;
    }

    const maxRecords = limit.maxRecords || limit.maxPerRequest || 100;

    if (!records || !Array.isArray(records)) {
      result.errors.push({
        severity: SEVERITY.CRITICAL,
        code: 'INVALID_RECORDS',
        message: 'Records must be an array'
      });
      result.valid = false;
      return result;
    }

    if (records.length > maxRecords) {
      // Split into batches
      result.batchCount = Math.ceil(records.length / maxRecords);
      for (let i = 0; i < records.length; i += maxRecords) {
        result.batches.push(records.slice(i, i + maxRecords));
      }

      result.warnings.push({
        severity: SEVERITY.INFO,
        code: 'BATCHED_OPERATION',
        message: `${records.length} records will be processed in ${result.batchCount} batches of ${maxRecords}`,
        totalRecords: records.length,
        batchSize: maxRecords,
        batchCount: result.batchCount
      });
    } else {
      result.batches = [records];
      result.batchCount = 1;
    }

    return result;
  }

  // ============================================
  // IMPORT VALIDATION
  // ============================================

  /**
   * Validate import file/data
   *
   * @param {Object} importConfig - Import configuration
   * @returns {Object} Validation result
   */
  validateImport(importConfig) {
    this.stats.validations++;

    const result = {
      valid: true,
      errors: [],
      warnings: [],
      suggestions: []
    };

    const { fileSize, rowCount, columnCount, hasHeader, encoding } = importConfig;

    // Check file size
    if (fileSize && fileSize > API_LIMITS.import.maxFileSize) {
      result.errors.push({
        severity: SEVERITY.CRITICAL,
        code: 'FILE_TOO_LARGE',
        message: `File size ${(fileSize / 1024 / 1024).toFixed(2)} MB exceeds limit of ${API_LIMITS.import.maxFileSize / 1024 / 1024} MB`
      });
      result.valid = false;
    }

    // Check row count
    if (rowCount && rowCount > API_LIMITS.import.maxRows) {
      result.errors.push({
        severity: SEVERITY.CRITICAL,
        code: 'TOO_MANY_ROWS',
        message: `Row count ${rowCount} exceeds limit of ${API_LIMITS.import.maxRows}`
      });
      result.valid = false;
    }

    // Check column count
    if (columnCount && columnCount > API_LIMITS.import.maxColumns) {
      result.errors.push({
        severity: SEVERITY.CRITICAL,
        code: 'TOO_MANY_COLUMNS',
        message: `Column count ${columnCount} exceeds limit of ${API_LIMITS.import.maxColumns}`
      });
      result.valid = false;
    }

    // Warn if no header
    if (hasHeader === false) {
      result.warnings.push({
        severity: SEVERITY.WARNING,
        code: 'NO_HEADER_ROW',
        message: 'Import file has no header row. Column mapping will be required.'
      });
    }

    // Check encoding
    if (encoding && encoding.toUpperCase() !== 'UTF-8') {
      result.warnings.push({
        severity: SEVERITY.WARNING,
        code: 'NON_UTF8_ENCODING',
        message: `File encoding is ${encoding}. UTF-8 is recommended for best compatibility.`
      });
    }

    return result;
  }

  // ============================================
  // SALESFORCE SYNC VALIDATION
  // ============================================

  /**
   * Validate Salesforce field mapping
   *
   * @param {Object} mapping - Field mapping configuration
   * @returns {Object} Validation result
   */
  validateSfdcMapping(mapping) {
    const result = {
      valid: true,
      errors: [],
      warnings: [],
      normalizedMapping: {}
    };

    if (!mapping || typeof mapping !== 'object') {
      result.errors.push({
        severity: SEVERITY.CRITICAL,
        code: 'INVALID_MAPPING',
        message: 'Mapping must be an object'
      });
      result.valid = false;
      return result;
    }

    for (const [sfField, hsField] of Object.entries(mapping)) {
      // Normalize HubSpot field name
      const normalized = this.normalizePropertyName(hsField);
      result.normalizedMapping[sfField] = normalized.normalized;

      if (normalized.changes.length > 0) {
        result.warnings.push({
          severity: SEVERITY.INFO,
          code: 'FIELD_NORMALIZED',
          message: `Salesforce field '${sfField}' HubSpot mapping normalized: ${hsField} → ${normalized.normalized}`,
          changes: normalized.changes
        });
      }

      result.warnings.push(...normalized.warnings);
    }

    return result;
  }

  // ============================================
  // UTILITY METHODS
  // ============================================

  /**
   * Get current statistics
   */
  getStats() {
    return {
      ...this.stats,
      rateLimitStatus: this.checkRateLimit()
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      validations: 0,
      blocked: 0,
      warnings: 0,
      rateLimitHits: 0,
      propertyNormalizations: 0
    };
  }

  /**
   * Log message (if verbose)
   */
  log(message) {
    if (this.verbose) {
      console.log(`[HubSpotAPISafeguard] ${message}`);
    }
  }

  /**
   * Run self-tests
   */
  async runTests() {
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('  HUBSPOT API SAFEGUARD LIBRARY - SELF-TESTS');
    console.log('═══════════════════════════════════════════════════════════\n');

    let passed = 0;
    let failed = 0;

    const tests = [
      {
        name: 'Detect broad search query',
        test: () => {
          const result = this.validateSearchRequest({});
          if (result.warnings.length === 0) throw new Error('Should warn about broad query');
          return 'Detected empty filter search as broad';
        }
      },
      {
        name: 'Enforce filter group limit',
        test: () => {
          const result = this.validateSearchRequest({
            filterGroups: [{}, {}, {}, {}, {}, {}] // 6 groups
          });
          if (result.valid) throw new Error('Should reject too many filter groups');
          return 'Blocked search with 6 filter groups';
        }
      },
      {
        name: 'Check 10k result limit',
        test: () => {
          const result = this.checkSearchResultLimit(10000);
          if (!result.hitLimit) throw new Error('Should detect 10k limit hit');
          if (!result.suggestions.length) throw new Error('Should provide suggestions');
          return 'Detected 10k limit and provided suggestions';
        }
      },
      {
        name: 'Normalize __c suffix',
        test: () => {
          const result = this.normalizePropertyName('Industry__c');
          if (result.normalized !== 'industry') throw new Error(`Expected 'industry', got '${result.normalized}'`);
          return 'Normalized Industry__c to industry';
        }
      },
      {
        name: 'Normalize camelCase to snake_case',
        test: () => {
          const result = this.normalizePropertyName('lifecycleStage');
          if (result.normalized !== 'lifecycle_stage') throw new Error(`Expected 'lifecycle_stage', got '${result.normalized}'`);
          return 'Normalized lifecycleStage to lifecycle_stage';
        }
      },
      {
        name: 'Detect reserved property names',
        test: () => {
          const result = this.normalizePropertyName('hubspot_owner_id');
          if (result.warnings.length === 0) throw new Error('Should warn about reserved name');
          return 'Detected reserved property name';
        }
      },
      {
        name: 'Validate batch operation limits',
        test: () => {
          const records = new Array(250).fill({});
          const result = this.validateBatchOperation('create', records);
          if (result.batchCount !== 3) throw new Error(`Expected 3 batches, got ${result.batchCount}`);
          return 'Split 250 records into 3 batches';
        }
      },
      {
        name: 'Track rate limit status',
        test: () => {
          const status = this.checkRateLimit();
          if (status.limit === undefined) throw new Error('Should return limit info');
          return `Rate limit check: ${status.remaining}/${status.limit} remaining`;
        }
      },
      {
        name: 'Handle rate limit error',
        test: () => {
          const backoff = this.handleRateLimitError({ status: 429 });
          if (!backoff.shouldRetry) throw new Error('Should recommend retry');
          if (backoff.delay <= 0) throw new Error('Should have positive delay');
          return `Rate limit handled with ${backoff.delay}ms backoff`;
        }
      },
      {
        name: 'Validate import limits',
        test: () => {
          const result = this.validateImport({ rowCount: 2000000 });
          if (result.valid) throw new Error('Should reject over 1M rows');
          return 'Blocked import exceeding 1M rows';
        }
      },
      {
        name: 'Validate Salesforce mapping',
        test: () => {
          const result = this.validateSfdcMapping({
            'Account.Industry__c': 'Industry__c',
            'Contact.FirstName': 'firstname'
          });
          if (result.normalizedMapping['Account.Industry__c'] !== 'industry') {
            throw new Error('Should normalize Industry__c');
          }
          return 'Normalized Salesforce field mappings';
        }
      }
    ];

    for (const test of tests) {
      try {
        const result = await test.test();
        console.log(`  ✅ ${test.name}: ${result}`);
        passed++;
      } catch (error) {
        console.log(`  ❌ ${test.name}: ${error.message}`);
        failed++;
      }
    }

    console.log('\n───────────────────────────────────────────────────────────');
    console.log(`  Results: ${passed} passed, ${failed} failed`);
    console.log('═══════════════════════════════════════════════════════════\n');

    return failed === 0;
  }
}

// Export
module.exports = { HubSpotAPISafeguard, API_LIMITS, SF_TO_HS_MAPPINGS, SEVERITY };

// CLI Interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === 'test' || command === '--test') {
    const safeguard = new HubSpotAPISafeguard({ verbose: true });
    safeguard.runTests()
      .then(success => process.exit(success ? 0 : 1))
      .catch(err => {
        console.error(err);
        process.exit(1);
      });
  } else if (command === 'validate-search') {
    const paramsJson = args[1];
    if (!paramsJson) {
      console.error('Usage: hubspot-api-safeguard.js validate-search <params-json>');
      process.exit(1);
    }

    const safeguard = new HubSpotAPISafeguard({ verbose: true });
    const params = JSON.parse(paramsJson);
    const result = safeguard.validateSearchRequest(params);
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.valid ? 0 : 1);

  } else if (command === 'normalize-property') {
    const propertyName = args[1];
    if (!propertyName) {
      console.error('Usage: hubspot-api-safeguard.js normalize-property "<name>"');
      process.exit(1);
    }

    const safeguard = new HubSpotAPISafeguard({ verbose: true });
    const result = safeguard.normalizePropertyName(propertyName);
    console.log(JSON.stringify(result, null, 2));

  } else if (command === 'check-rate-limit') {
    const safeguard = new HubSpotAPISafeguard({ verbose: true, tier: args[1] || 'starter' });
    const status = safeguard.checkRateLimit();
    console.log(JSON.stringify(status, null, 2));

  } else {
    console.log(`
HubSpot API Safeguard Library - Prevent common HubSpot API errors

Usage:
  hubspot-api-safeguard.js test                              Run self-tests
  hubspot-api-safeguard.js validate-search <params-json>     Validate search request
  hubspot-api-safeguard.js normalize-property "<name>"       Normalize property name
  hubspot-api-safeguard.js check-rate-limit [tier]           Check rate limit status

Examples:
  hubspot-api-safeguard.js test
  hubspot-api-safeguard.js normalize-property "Industry__c"
  hubspot-api-safeguard.js normalize-property "lifecycleStage"
  hubspot-api-safeguard.js validate-search '{"filterGroups":[]}'
  hubspot-api-safeguard.js check-rate-limit enterprise

Tiers: starter, professional, enterprise, free

ROI: $16,000/year (HIGHEST ROI - addresses HubSpot API errors)
`);
  }
}
