#!/usr/bin/env node

/**
 * Domain Dictionary Loader
 *
 * Loads and caches domain-specific abbreviation dictionaries for the
 * Domain-Aware Matching System.
 *
 * Features:
 * - Lazy loading with in-memory cache
 * - Org-specific override support
 * - Dictionary validation against JSON schema
 * - Flattened abbreviation lookup for fast access
 *
 * Usage:
 *   const { DomainDictionaryLoader } = require('./domain-dictionary-loader');
 *   const loader = new DomainDictionaryLoader();
 *   const dict = loader.load('property-management');
 *   const abbrevs = loader.getAbbreviations('property-management');
 */

'use strict';

const fs = require('fs');
const path = require('path');

class DomainDictionaryLoader {
  constructor(options = {}) {
    this.dictionaryDir = options.dictionaryDir ||
      path.join(__dirname, '..', '..', 'config', 'domain-dictionaries');
    this.overridesDir = options.overridesDir ||
      path.join(this.dictionaryDir, 'org-overrides');
    this.schemaPath = options.schemaPath ||
      path.join(__dirname, '..', '..', 'schemas', 'domain-dictionary.schema.json');

    // In-memory cache
    this.cache = new Map();
    this.abbreviationCache = new Map();
    this.overrideCache = new Map();

    // Cache TTL (default: 5 minutes in development, 1 hour in production)
    this.cacheTTL = options.cacheTTL ||
      (process.env.NODE_ENV === 'production' ? 3600000 : 300000);

    // Track cache timestamps
    this.cacheTimestamps = new Map();
  }

  /**
   * List all available domain dictionaries
   * @returns {string[]} Array of domain names
   */
  listDomains() {
    try {
      const files = fs.readdirSync(this.dictionaryDir);
      return files
        .filter(f => f.endsWith('.json') && !f.startsWith('.'))
        .map(f => f.replace('.json', ''))
        .sort();
    } catch (error) {
      console.error(`Error listing domains: ${error.message}`);
      return [];
    }
  }

  /**
   * Check if a domain dictionary exists
   * @param {string} domain - Domain name
   * @returns {boolean}
   */
  exists(domain) {
    const dictPath = path.join(this.dictionaryDir, `${domain}.json`);
    return fs.existsSync(dictPath);
  }

  /**
   * Load a domain dictionary with caching
   * @param {string} domain - Domain name (e.g., 'property-management')
   * @param {Object} options - Load options
   * @param {string} options.orgOverride - Org-specific override file name
   * @param {boolean} options.skipCache - Force reload from disk
   * @returns {Object|null} Domain dictionary or null if not found
   */
  load(domain, options = {}) {
    const cacheKey = options.orgOverride ? `${domain}:${options.orgOverride}` : domain;

    // Check cache validity
    if (!options.skipCache && this.cache.has(cacheKey)) {
      const timestamp = this.cacheTimestamps.get(cacheKey);
      if (timestamp && (Date.now() - timestamp) < this.cacheTTL) {
        return this.cache.get(cacheKey);
      }
    }

    // Load base dictionary
    const dictPath = path.join(this.dictionaryDir, `${domain}.json`);
    if (!fs.existsSync(dictPath)) {
      console.warn(`Domain dictionary not found: ${domain}`);
      return null;
    }

    let dictionary;
    try {
      const content = fs.readFileSync(dictPath, 'utf-8');
      dictionary = JSON.parse(content);
    } catch (error) {
      console.error(`Error loading domain dictionary ${domain}: ${error.message}`);
      return null;
    }

    // Apply org-specific overrides if provided
    if (options.orgOverride) {
      dictionary = this._applyOverride(dictionary, options.orgOverride);
    }

    // Cache the result
    this.cache.set(cacheKey, dictionary);
    this.cacheTimestamps.set(cacheKey, Date.now());

    return dictionary;
  }

  /**
   * Get flattened abbreviations map for a domain
   * Fast lookup structure: { 'HOA': 'Homeowners Association', ... }
   * @param {string} domain - Domain name
   * @param {Object} options - Options
   * @returns {Object} Flattened abbreviation map
   */
  getAbbreviations(domain, options = {}) {
    const cacheKey = options.orgOverride ? `abbrev:${domain}:${options.orgOverride}` : `abbrev:${domain}`;

    if (!options.skipCache && this.abbreviationCache.has(cacheKey)) {
      const timestamp = this.cacheTimestamps.get(cacheKey);
      if (timestamp && (Date.now() - timestamp) < this.cacheTTL) {
        return this.abbreviationCache.get(cacheKey);
      }
    }

    const dictionary = this.load(domain, options);
    if (!dictionary || !dictionary.abbreviations) {
      return {};
    }

    // Flatten all abbreviation categories
    const flattened = {};
    for (const [category, abbrevs] of Object.entries(dictionary.abbreviations)) {
      for (const [abbrev, expansion] of Object.entries(abbrevs)) {
        flattened[abbrev] = expansion;
      }
    }

    this.abbreviationCache.set(cacheKey, flattened);
    this.cacheTimestamps.set(cacheKey, Date.now());

    return flattened;
  }

  /**
   * Get synonyms map for a domain
   * @param {string} domain - Domain name
   * @param {Object} options - Options
   * @returns {Object} Synonyms map
   */
  getSynonyms(domain, options = {}) {
    const dictionary = this.load(domain, options);
    return dictionary?.synonyms || {};
  }

  /**
   * Get detection patterns for a domain
   * @param {string} domain - Domain name
   * @returns {Object} Detection patterns
   */
  getDetectionPatterns(domain) {
    const dictionary = this.load(domain);
    return dictionary?.detectionPatterns || { keywords: [], entityTypes: [], fieldPatterns: [] };
  }

  /**
   * Get matching rules for a domain
   * @param {string} domain - Domain name
   * @returns {Object} Matching rules
   */
  getMatchingRules(domain) {
    const dictionary = this.load(domain);
    return dictionary?.matchingRules || {
      ignoreCase: true,
      expandBeforeMatch: true,
      synonymWeight: 0.85,
      minimumConfidence: 70
    };
  }

  /**
   * Get suffixes configuration for a domain
   * @param {string} domain - Domain name
   * @returns {Object} Suffixes configuration { strip: [], preserve: [] }
   */
  getSuffixes(domain) {
    const dictionary = this.load(domain);
    return dictionary?.suffixes || { strip: [], preserve: [] };
  }

  /**
   * Load all domains and return combined detection patterns
   * Used by DomainDetector for auto-detection
   * @returns {Object} Map of domain -> detection patterns
   */
  getAllDetectionPatterns() {
    const domains = this.listDomains();
    const patterns = {};

    for (const domain of domains) {
      patterns[domain] = this.getDetectionPatterns(domain);
    }

    return patterns;
  }

  /**
   * Apply org-specific override to base dictionary
   * @private
   */
  _applyOverride(baseDictionary, overrideName) {
    const overridePath = path.join(this.overridesDir,
      overrideName.endsWith('.json') ? overrideName : `${overrideName}.json`);

    if (!fs.existsSync(overridePath)) {
      console.warn(`Org override not found: ${overrideName}`);
      return baseDictionary;
    }

    let override;
    try {
      const content = fs.readFileSync(overridePath, 'utf-8');
      override = JSON.parse(content);
    } catch (error) {
      console.error(`Error loading override ${overrideName}: ${error.message}`);
      return baseDictionary;
    }

    // Deep merge the override into base dictionary
    const merged = JSON.parse(JSON.stringify(baseDictionary));

    // Add custom abbreviations
    if (override.customAbbreviations) {
      merged.abbreviations = merged.abbreviations || {};
      merged.abbreviations.custom = merged.abbreviations.custom || {};
      Object.assign(merged.abbreviations.custom, override.customAbbreviations);
    }

    // Remove excluded abbreviations
    if (override.excludeAbbreviations && Array.isArray(override.excludeAbbreviations)) {
      for (const category of Object.values(merged.abbreviations)) {
        for (const excluded of override.excludeAbbreviations) {
          delete category[excluded];
        }
      }
    }

    // Merge synonyms
    if (override.synonyms) {
      merged.synonyms = merged.synonyms || {};
      for (const [term, syns] of Object.entries(override.synonyms)) {
        if (merged.synonyms[term]) {
          merged.synonyms[term] = [...new Set([...merged.synonyms[term], ...syns])];
        } else {
          merged.synonyms[term] = syns;
        }
      }
    }

    // Mark as having override
    merged._override = {
      orgId: override.orgId,
      name: overrideName
    };

    return merged;
  }

  /**
   * Create a new org-specific override
   * @param {string} baseDomain - Base domain to extend
   * @param {string} orgId - Organization identifier
   * @param {Object} overrides - Custom abbreviations and synonyms
   * @returns {string} Path to created override file
   */
  createOverride(baseDomain, orgId, overrides = {}) {
    if (!this.exists(baseDomain)) {
      throw new Error(`Base domain '${baseDomain}' does not exist`);
    }

    const overrideContent = {
      extends: baseDomain,
      orgId: orgId,
      customAbbreviations: overrides.abbreviations || {},
      excludeAbbreviations: overrides.exclude || [],
      synonyms: overrides.synonyms || {}
    };

    const overridePath = path.join(this.overridesDir, `${orgId}.json`);

    // Ensure overrides directory exists
    if (!fs.existsSync(this.overridesDir)) {
      fs.mkdirSync(this.overridesDir, { recursive: true });
    }

    fs.writeFileSync(overridePath, JSON.stringify(overrideContent, null, 2));

    // Clear cache for this org
    this._clearOrgCache(orgId);

    return overridePath;
  }

  /**
   * Add abbreviation to org override
   * @param {string} orgId - Organization identifier
   * @param {string} abbrev - Abbreviation
   * @param {string} expansion - Full expansion
   */
  addAbbreviation(orgId, abbrev, expansion) {
    const overridePath = path.join(this.overridesDir, `${orgId}.json`);

    let override;
    if (fs.existsSync(overridePath)) {
      override = JSON.parse(fs.readFileSync(overridePath, 'utf-8'));
    } else {
      throw new Error(`Org override '${orgId}' does not exist. Create it first.`);
    }

    override.customAbbreviations = override.customAbbreviations || {};
    override.customAbbreviations[abbrev] = expansion;

    fs.writeFileSync(overridePath, JSON.stringify(override, null, 2));
    this._clearOrgCache(orgId);
  }

  /**
   * Clear cache entries for a specific org
   * @private
   */
  _clearOrgCache(orgId) {
    for (const key of this.cache.keys()) {
      if (key.includes(orgId)) {
        this.cache.delete(key);
        this.cacheTimestamps.delete(key);
      }
    }
    for (const key of this.abbreviationCache.keys()) {
      if (key.includes(orgId)) {
        this.abbreviationCache.delete(key);
      }
    }
  }

  /**
   * Clear all caches
   */
  clearCache() {
    this.cache.clear();
    this.abbreviationCache.clear();
    this.overrideCache.clear();
    this.cacheTimestamps.clear();
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache stats
   */
  getCacheStats() {
    return {
      dictionaries: this.cache.size,
      abbreviationMaps: this.abbreviationCache.size,
      overrides: this.overrideCache.size,
      cacheTTL: this.cacheTTL
    };
  }
}

// Export for CommonJS
module.exports = { DomainDictionaryLoader };

// CLI Usage
if (require.main === module) {
  const args = process.argv.slice(2);
  const loader = new DomainDictionaryLoader();

  if (args.length === 0 || args[0] === 'list') {
    console.log('\nAvailable domains:');
    const domains = loader.listDomains();
    domains.forEach(d => console.log(`  - ${d}`));
    console.log(`\nTotal: ${domains.length} domains\n`);
  } else if (args[0] === 'show' && args[1]) {
    const dict = loader.load(args[1]);
    if (dict) {
      console.log(JSON.stringify(dict, null, 2));
    }
  } else if (args[0] === 'abbrevs' && args[1]) {
    const abbrevs = loader.getAbbreviations(args[1]);
    console.log(`\nAbbreviations for ${args[1]}:`);
    Object.entries(abbrevs).forEach(([k, v]) => {
      console.log(`  ${k}: ${v}`);
    });
    console.log(`\nTotal: ${Object.keys(abbrevs).length} abbreviations\n`);
  } else if (args[0] === 'stats') {
    // Load all domains to populate cache
    loader.listDomains().forEach(d => loader.load(d));
    console.log('\nCache statistics:', loader.getCacheStats());
  } else {
    console.log(`
Domain Dictionary Loader CLI

Usage:
  node domain-dictionary-loader.js list              List available domains
  node domain-dictionary-loader.js show <domain>     Show full dictionary
  node domain-dictionary-loader.js abbrevs <domain>  List abbreviations
  node domain-dictionary-loader.js stats             Show cache statistics

Examples:
  node domain-dictionary-loader.js list
  node domain-dictionary-loader.js show property-management
  node domain-dictionary-loader.js abbrevs government
`);
  }
}
