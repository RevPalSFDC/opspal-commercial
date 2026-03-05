#!/usr/bin/env node

/**
 * Domain-Aware Matcher
 *
 * Extends the FuzzyMatcher with domain-specific abbreviation expansion,
 * synonym matching, and context-aware confidence scoring.
 *
 * Features:
 * - Auto-detects domain from input data
 * - Expands domain-specific abbreviations before matching
 * - Applies synonym matching with configurable weights
 * - Supports org-specific overrides
 * - Integrates with existing FuzzyMatcher Levenshtein algorithm
 *
 * Usage:
 *   const { DomainAwareMatcher } = require('./domain-aware-matcher');
 *
 *   // With explicit domain
 *   const matcher = new DomainAwareMatcher({ domain: 'property-management' });
 *   const matches = matcher.match('ABC HOA', targets);
 *
 *   // With auto-detection
 *   const matcher = new DomainAwareMatcher({ autoDetect: true });
 *   const matches = matcher.match('San Diego PD', targets);
 *
 *   // With org-specific overrides
 *   const matcher = new DomainAwareMatcher({
 *     domain: 'property-management',
 *     orgOverride: 'westside-properties'
 *   });
 */

'use strict';

const path = require('path');
const { DomainDictionaryLoader } = require('./domain-dictionary-loader');
const { DomainDetector } = require('./domain-detector');

// Try to load Geographic Entity Resolver if available
let GeographicEntityResolver;
try {
  GeographicEntityResolver = require('./geographic-entity-resolver').GeographicEntityResolver;
} catch (error) {
  GeographicEntityResolver = null;
}

// Try to load existing FuzzyMatcher if available
let FuzzyMatcherBase;
try {
  const salesforcePluginPath = path.join(__dirname, '..', '..', '..', 'salesforce-plugin', 'scripts', 'lib', 'fuzzy-matcher');
  FuzzyMatcherBase = require(salesforcePluginPath).FuzzyMatcher;
} catch (error) {
  // Create a minimal base class if FuzzyMatcher not available
  FuzzyMatcherBase = null;
}

class DomainAwareMatcher {
  constructor(options = {}) {
    this.domain = options.domain || null;
    this.autoDetect = options.autoDetect !== false; // Default: true
    this.orgOverride = options.orgOverride || null;

    // Initialize dependencies
    this.loader = options.loader || new DomainDictionaryLoader();
    this.detector = options.detector || new DomainDetector({ loader: this.loader });

    // Load domain dictionary if specified
    this.dictionary = null;
    this.abbreviations = {};
    this.synonyms = {};
    this.matchingRules = {
      ignoreCase: true,
      expandBeforeMatch: true,
      synonymWeight: 0.85,
      minimumConfidence: 70
    };

    if (this.domain) {
      this._loadDomain(this.domain);
    }

    // Initialize base matcher components
    this._initializeBaseMatcher();

    // Initialize geographic entity resolver if available
    this.geoResolver = null;
    if (GeographicEntityResolver && options.useGeographicResolver !== false) {
      try {
        this.geoResolver = new GeographicEntityResolver(options);
      } catch (error) {
        // Silently fail - resolver is optional
      }
    }
  }

  /**
   * Initialize base matching components (from FuzzyMatcher)
   * @private
   */
  _initializeBaseMatcher() {
    // US State Code Mapping
    this.STATE_CODES = {
      'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR',
      'California': 'CA', 'Colorado': 'CO', 'Connecticut': 'CT', 'Delaware': 'DE',
      'Florida': 'FL', 'Georgia': 'GA', 'Idaho': 'ID', 'Illinois': 'IL',
      'Indiana': 'IN', 'Iowa': 'IA', 'Kansas': 'KS', 'Kentucky': 'KY',
      'Louisiana': 'LA', 'Maine': 'ME', 'Maryland': 'MD', 'Massachusetts': 'MA',
      'Michigan': 'MI', 'Minnesota': 'MN', 'Mississippi': 'MS', 'Missouri': 'MO',
      'Montana': 'MT', 'Nebraska': 'NE', 'Nevada': 'NV', 'New Hampshire': 'NH',
      'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY',
      'North Carolina': 'NC', 'North Dakota': 'ND', 'Ohio': 'OH', 'Oklahoma': 'OK',
      'Oregon': 'OR', 'Pennsylvania': 'PA', 'Rhode Island': 'RI',
      'South Carolina': 'SC', 'South Dakota': 'SD', 'Tennessee': 'TN', 'Texas': 'TX',
      'Utah': 'UT', 'Vermont': 'VT', 'Virginia': 'VA', 'Washington': 'WA',
      'West Virginia': 'WV', 'Wisconsin': 'WI', 'Wyoming': 'WY',
      'District of Columbia': 'DC'
    };

    // Canadian Province Mapping
    this.CANADA_PROVINCES = {
      'Ontario': 'ON', 'Quebec': 'QC', 'British Columbia': 'BC',
      'Alberta': 'AB', 'Saskatchewan': 'SK', 'Manitoba': 'MB',
      'Nova Scotia': 'NS', 'New Brunswick': 'NB',
      'Prince Edward Island': 'PE', 'Newfoundland and Labrador': 'NL'
    };

    // Region to State Mapping
    this.REGION_STATES = {
      'Northwest': ['WA', 'OR', 'CA', 'ID', 'MT', 'WY', 'AK'],
      'Southwest': ['CA', 'AZ', 'NV', 'UT', 'CO', 'NM'],
      'South Central': ['TX', 'NM', 'OK', 'LA', 'AR', 'KS', 'MS', 'AL'],
      'Southeast': ['FL', 'GA', 'AL', 'MS', 'TN', 'SC', 'NC', 'KY', 'WV', 'VA'],
      'NE; MW; NCR': [
        'NY', 'NJ', 'PA', 'CT', 'MA', 'RI', 'VT', 'NH', 'ME',
        'IL', 'IN', 'OH', 'MI', 'WI', 'MN', 'IA', 'MO', 'ND', 'SD', 'NE',
        'DC', 'VA', 'MD', 'DE'
      ]
    };
  }

  /**
   * Load domain dictionary and extract components
   * @private
   */
  _loadDomain(domain) {
    this.dictionary = this.loader.load(domain, { orgOverride: this.orgOverride });
    if (this.dictionary) {
      this.domain = domain; // Set domain after successful load
      this.abbreviations = this.loader.getAbbreviations(domain, { orgOverride: this.orgOverride });
      this.synonyms = this.loader.getSynonyms(domain, { orgOverride: this.orgOverride });
      this.matchingRules = { ...this.matchingRules, ...this.loader.getMatchingRules(domain) };
    }
  }

  /**
   * Set or change the active domain
   * @param {string} domain - Domain name
   * @param {string} orgOverride - Optional org-specific override
   */
  setDomain(domain, orgOverride = null) {
    this.domain = domain;
    this.orgOverride = orgOverride;
    this._loadDomain(domain);
  }

  /**
   * Expand abbreviations in text using domain dictionary
   * @param {string} text - Input text
   * @returns {Object} { expanded: string, expansions: Array }
   */
  expandAbbreviations(text) {
    if (!text || !this.matchingRules.expandBeforeMatch) {
      return { expanded: text, expansions: [] };
    }

    let expanded = text;
    const expansions = [];

    // Sort abbreviations by length (longest first) to avoid partial matches
    const sortedAbbrevs = Object.entries(this.abbreviations)
      .sort(([a], [b]) => b.length - a.length);

    for (const [abbrev, expansion] of sortedAbbrevs) {
      const flags = this.matchingRules.ignoreCase ? 'gi' : 'g';
      const pattern = new RegExp(`\\b${this._escapeRegex(abbrev)}\\b`, flags);

      if (pattern.test(expanded)) {
        expanded = expanded.replace(pattern, expansion);
        expansions.push({ from: abbrev, to: expansion });
      }
    }

    return { expanded, expansions };
  }

  /**
   * Normalize name for matching (with domain-aware expansion)
   * @param {string} name - Input name
   * @returns {Object} { normalized: string, expansions: Array, original: string }
   */
  normalize(name) {
    if (!name) {
      return { normalized: '', expansions: [], original: name };
    }

    // Remove state prefix if exists
    let normalized = name.replace(/^[A-Z]{2}:\s*/, '');

    // Expand domain-specific abbreviations
    const { expanded, expansions } = this.expandAbbreviations(normalized);
    normalized = expanded;

    // Normalize whitespace and punctuation
    normalized = normalized.replace(/\s+/g, ' ');
    normalized = normalized.replace(/'/g, '');

    // Apply case normalization
    if (this.matchingRules.ignoreCase) {
      normalized = normalized.toLowerCase();
    }

    return {
      normalized: normalized.trim(),
      expansions,
      original: name
    };
  }

  /**
   * Check if two terms are synonyms
   * @param {string} term1 - First term
   * @param {string} term2 - Second term
   * @returns {boolean}
   */
  areSynonyms(term1, term2) {
    if (!term1 || !term2) return false;

    const t1 = term1.toLowerCase();
    const t2 = term2.toLowerCase();

    for (const [canonical, syns] of Object.entries(this.synonyms)) {
      const allForms = [canonical.toLowerCase(), ...syns.map(s => s.toLowerCase())];
      if (allForms.includes(t1) && allForms.includes(t2)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Calculate Levenshtein distance similarity (0-100%)
   * @param {string} str1 - First string
   * @param {string} str2 - Second string
   * @returns {number} Similarity percentage
   */
  calculateSimilarity(str1, str2) {
    const len1 = str1.length;
    const len2 = str2.length;
    const matrix = Array(len1 + 1).fill(null).map(() => Array(len2 + 1).fill(0));

    for (let i = 0; i <= len1; i++) matrix[i][0] = i;
    for (let j = 0; j <= len2; j++) matrix[0][j] = j;

    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost
        );
      }
    }

    const distance = matrix[len1][len2];
    const maxLen = Math.max(len1, len2);
    return maxLen === 0 ? 100 : ((1 - distance / maxLen) * 100);
  }

  /**
   * Extract state code from name
   * @param {string} name - Name that may contain state prefix
   * @returns {string|null} State code or null
   */
  extractStateFromName(name) {
    if (!name) return null;
    const match = name.match(/^([A-Z]{2}):/);
    return match ? match[1] : null;
  }

  /**
   * Get state code from name or code
   * @param {string} stateName - State name or code
   * @returns {string|null}
   */
  getStateCode(stateName) {
    if (!stateName) return null;

    if (stateName.length === 2 && stateName === stateName.toUpperCase()) {
      return stateName;
    }

    if (this.STATE_CODES[stateName]) {
      return this.STATE_CODES[stateName];
    }

    if (this.CANADA_PROVINCES[stateName]) {
      return this.CANADA_PROVINCES[stateName];
    }

    return null;
  }

  /**
   * Calculate confidence score with domain context
   * @param {number} similarity - Base similarity score
   * @param {string} stateMatch - State match type (EXACT, REGION_MATCH, UNKNOWN, MISMATCH)
   * @param {Object} context - Additional context (synonymMatch, etc.)
   * @returns {Object} { confidence, matchType, reason }
   */
  calculateConfidence(similarity, stateMatch, context = {}) {
    let confidence = 0;
    let matchType = '';
    let reason = '';

    // Apply synonym weight if applicable
    if (context.synonymMatch) {
      similarity = Math.min(100, similarity + (100 - similarity) * this.matchingRules.synonymWeight);
      reason = 'Synonym match boosted confidence';
    }

    // Determine if state match is positive (EXACT or REGION_MATCH)
    // or neutral (UNKNOWN - no state info available)
    const isPositiveStateMatch = stateMatch === 'EXACT' || stateMatch === 'REGION_MATCH';
    const isNeutralStateMatch = stateMatch === 'UNKNOWN';
    const isNegativeStateMatch = stateMatch === 'MISMATCH';

    // Calculate base confidence - handle both positive state matches and neutral (no state info)
    if (similarity === 100 && stateMatch === 'EXACT') {
      confidence = 100;
      matchType = 'EXACT';
      reason = reason || 'Perfect name match with exact state match';
    } else if (similarity === 100 && stateMatch === 'REGION_MATCH') {
      confidence = 98;
      matchType = 'EXACT';
      reason = reason || 'Perfect name match with region validation';
    } else if (similarity === 100 && isNeutralStateMatch) {
      confidence = 95;
      matchType = 'EXACT';
      reason = reason || 'Perfect name match (no state info to validate)';
    } else if (similarity >= 95 && stateMatch === 'EXACT') {
      confidence = 95;
      matchType = 'HIGH';
      reason = reason || 'Near-perfect match with exact state';
    } else if (similarity >= 95 && stateMatch === 'REGION_MATCH') {
      confidence = 93;
      matchType = 'HIGH';
      reason = reason || 'Near-perfect match with region validation';
    } else if (similarity >= 95 && isNeutralStateMatch) {
      confidence = 90;
      matchType = 'HIGH';
      reason = reason || 'Near-perfect match (no state info to validate)';
    } else if (similarity >= 85 && stateMatch === 'EXACT') {
      confidence = 90;
      matchType = 'HIGH';
      reason = reason || 'Strong match with exact state';
    } else if (similarity >= 85 && stateMatch === 'REGION_MATCH') {
      confidence = 88;
      matchType = 'HIGH';
      reason = reason || 'Strong match with region validation';
    } else if (similarity >= 85 && isNeutralStateMatch) {
      confidence = 85;
      matchType = 'HIGH';
      reason = reason || 'Strong match (no state info to validate)';
    } else if (similarity >= 75 && stateMatch === 'EXACT') {
      confidence = 80;
      matchType = 'MEDIUM';
      reason = reason || 'Good match with exact state';
    } else if (similarity >= 75 && stateMatch === 'REGION_MATCH') {
      confidence = 78;
      matchType = 'MEDIUM';
      reason = reason || 'Good match with region validation';
    } else if (similarity >= 75 && isNeutralStateMatch) {
      confidence = 75;
      matchType = 'MEDIUM';
      reason = reason || 'Good match (no state info to validate)';
    } else if (similarity >= 70 && stateMatch === 'EXACT') {
      confidence = 70;
      matchType = 'LOW';
      reason = reason || 'Acceptable match with exact state';
    } else if (similarity >= 70 && stateMatch === 'REGION_MATCH') {
      confidence = 68;
      matchType = 'LOW';
      reason = reason || 'Acceptable match with region validation';
    } else if (similarity >= 70 && isNeutralStateMatch) {
      confidence = 70;
      matchType = 'LOW';
      reason = reason || 'Acceptable match (no state info to validate)';
    } else if (similarity >= 60 && !isNegativeStateMatch) {
      confidence = Math.floor(similarity * 0.9);
      matchType = 'LOW';
      reason = reason || 'Weak match - manual review required';
    } else if (similarity >= 50 && !isNegativeStateMatch) {
      confidence = Math.floor(similarity * 0.7);
      matchType = 'LOW';
      reason = reason || 'Very weak match - manual review required';
    } else {
      confidence = 0;
      matchType = 'NONE';
      reason = reason || 'No acceptable match found';
    }

    // Apply domain-specific minimum confidence
    if (confidence > 0 && confidence < this.matchingRules.minimumConfidence) {
      confidence = 0;
      matchType = 'BELOW_THRESHOLD';
      reason = `Below domain minimum confidence (${this.matchingRules.minimumConfidence}%)`;
    }

    return { confidence, matchType, reason };
  }

  /**
   * Match source against multiple targets with domain awareness
   * @param {string} source - Source string to match
   * @param {Array} targets - Array of target objects with name/state properties
   * @param {Object} options - Matching options
   * @returns {Array} Sorted array of matches
   */
  match(source, targets, options = {}) {
    // Auto-detect domain if enabled and not set
    if (this.autoDetect && !this.domain) {
      const detection = this.detector.detect(source);
      if (detection.detectedDomain) {
        this._loadDomain(detection.detectedDomain);
        options._detectedDomain = detection.detectedDomain;
        options._detectionConfidence = detection.confidence;
      }
    }

    // Normalize source with abbreviation expansion
    const sourceNormalized = this.normalize(source);
    const sourceState = this.extractStateFromName(source);
    const expectedStates = this.REGION_STATES[options.region] || options.expectedStates || [];

    const matches = [];

    for (const target of targets) {
      // Skip targets with null/undefined names
      if (!target || !target.name) continue;

      const targetState = this.extractStateFromName(target.name) ||
        this.getStateCode(target.state || target.billingState || target.shippingState);

      // Normalize target
      const targetNormalized = this.normalize(target.name);

      // Calculate similarity
      const similarity = this.calculateSimilarity(
        sourceNormalized.normalized,
        targetNormalized.normalized
      );

      // Check for synonym match
      const synonymMatch = this.areSynonyms(source, target.name);

      // Determine state match type
      let stateMatch = 'UNKNOWN';
      if (sourceState && targetState) {
        if (sourceState === targetState) {
          stateMatch = 'EXACT';
        } else if (expectedStates.includes(targetState)) {
          stateMatch = 'REGION_MATCH';
        } else {
          stateMatch = 'MISMATCH';
        }
      } else if (!sourceState && targetState && expectedStates.includes(targetState)) {
        stateMatch = 'REGION_MATCH';
      }

      // Calculate confidence with domain context
      const { confidence, matchType, reason } = this.calculateConfidence(
        similarity,
        stateMatch,
        { synonymMatch }
      );

      if (confidence >= (options.minConfidence || this.matchingRules.minimumConfidence)) {
        matches.push({
          target: target.name,
          targetId: target.id || target.Id,
          targetState,
          similarity: Math.round(similarity),
          stateMatch,
          confidence,
          matchType,
          reason,
          domain: this.domain,
          expansions: {
            source: sourceNormalized.expansions,
            target: targetNormalized.expansions
          },
          synonymMatch
        });
      }
    }

    // Sort by confidence descending
    matches.sort((a, b) => b.confidence - a.confidence);

    return matches;
  }

  /**
   * Find best match from targets
   * @param {string} source - Source string
   * @param {Array} targets - Target objects
   * @param {Object} options - Options
   * @returns {Object|null} Best match or null
   */
  findBestMatch(source, targets, options = {}) {
    const matches = this.match(source, targets, options);
    return matches.length > 0 ? matches[0] : null;
  }

  /**
   * Batch match multiple sources against targets
   * @param {Array} sources - Array of source strings
   * @param {Array} targets - Array of target objects
   * @param {Object} options - Options
   * @returns {Array} Array of { source, matches } objects
   */
  batchMatch(sources, targets, options = {}) {
    return sources.map(source => ({
      source,
      matches: this.match(source, targets, options)
    }));
  }

  /**
   * Get current domain info
   * @returns {Object} Domain information
   */
  getDomainInfo() {
    return {
      domain: this.domain,
      orgOverride: this.orgOverride,
      abbreviationCount: Object.keys(this.abbreviations).length,
      synonymCount: Object.keys(this.synonyms).length,
      matchingRules: this.matchingRules
    };
  }

  /**
   * List available domains
   * @returns {string[]} Domain names
   */
  listDomains() {
    return this.loader.listDomains();
  }

  /**
   * Resolve if two records represent the same geographic entity
   * Uses the GeographicEntityResolver for multi-location detection
   * @param {Object} recordA - First record with Name, State, Domain, Phone, etc.
   * @param {Object} recordB - Second record
   * @param {Object} options - { market, forcePolicy }
   * @returns {Object} Resolution result with decision, confidence, signals
   */
  resolveEntities(recordA, recordB, options = {}) {
    if (!this.geoResolver) {
      throw new Error('Geographic Entity Resolver not available. Initialize with useGeographicResolver: true');
    }

    // Use domain from options or current instance
    const resolveOptions = {
      ...options,
      market: options.market || this.domain
    };

    return this.geoResolver.resolve(recordA, recordB, resolveOptions);
  }

  /**
   * Find matching entities for a source record in a list of targets
   * Uses geographic entity resolution for same-name disambiguation
   * @param {Object} source - Source record
   * @param {Array} targets - Array of target records
   * @param {Object} options - { market, minConfidence }
   * @returns {Array} Sorted matches with resolution details
   */
  findEntityMatches(source, targets, options = {}) {
    if (!this.geoResolver) {
      throw new Error('Geographic Entity Resolver not available. Initialize with useGeographicResolver: true');
    }

    const resolveOptions = {
      ...options,
      market: options.market || this.domain,
      minConfidence: options.minConfidence || 50
    };

    return this.geoResolver.findMatches(source, targets, resolveOptions);
  }

  /**
   * Check if geographic resolver is available
   * @returns {boolean}
   */
  hasGeographicResolver() {
    return this.geoResolver !== null;
  }

  /**
   * Escape regex special characters
   * @private
   */
  _escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

// Export for CommonJS
module.exports = { DomainAwareMatcher };

// CLI Usage
if (require.main === module) {
  const args = process.argv.slice(2);
  const fs = require('fs');

  if (args.length === 0) {
    console.log(`
Domain-Aware Matcher CLI

Usage:
  node domain-aware-matcher.js domains                           List available domains
  node domain-aware-matcher.js match "<source>" --targets <file> Match against targets
  node domain-aware-matcher.js expand "<text>" --domain <name>   Expand abbreviations
  node domain-aware-matcher.js detect "<text>"                   Detect domain from text

Options:
  --domain <name>      Specify domain (property-management, government, etc.)
  --org <override>     Use org-specific override
  --targets <file>     JSON file with target records
  --min-confidence <n> Minimum confidence threshold (default: 70)

Examples:
  node domain-aware-matcher.js domains

  node domain-aware-matcher.js match "ABC HOA Management" \\
    --domain property-management \\
    --targets ./accounts.json

  node domain-aware-matcher.js expand "San Diego PD" --domain government

  node domain-aware-matcher.js detect "FDIC insured bank accounts"
`);
    process.exit(0);
  }

  const command = args[0];

  if (command === 'domains') {
    const matcher = new DomainAwareMatcher({ autoDetect: false });
    const domains = matcher.listDomains();
    console.log('\nAvailable domains:');
    domains.forEach(d => console.log(`  - ${d}`));
    console.log(`\nTotal: ${domains.length} domains\n`);

  } else if (command === 'match') {
    const source = args[1];
    const domainIdx = args.indexOf('--domain');
    const targetsIdx = args.indexOf('--targets');
    const orgIdx = args.indexOf('--org');
    const minConfIdx = args.indexOf('--min-confidence');

    const domain = domainIdx > -1 ? args[domainIdx + 1] : null;
    const targetsFile = targetsIdx > -1 ? args[targetsIdx + 1] : null;
    const orgOverride = orgIdx > -1 ? args[orgIdx + 1] : null;
    const minConfidence = minConfIdx > -1 ? parseInt(args[minConfIdx + 1]) : 70;

    if (!source) {
      console.error('Error: Source string required');
      process.exit(1);
    }

    const matcher = new DomainAwareMatcher({
      domain,
      orgOverride,
      autoDetect: !domain
    });

    let targets = [];
    if (targetsFile && fs.existsSync(targetsFile)) {
      targets = JSON.parse(fs.readFileSync(targetsFile, 'utf-8'));
    } else {
      // Demo targets
      targets = [
        { id: '1', name: 'ABC Property Management LLC' },
        { id: '2', name: 'San Diego Sheriff Department' },
        { id: '3', name: 'First National Bank' },
        { id: '4', name: 'ABC Homeowners Association' }
      ];
      console.log('\nUsing demo targets (provide --targets for real data)\n');
    }

    const matches = matcher.match(source, targets, { minConfidence });

    console.log(`\nMatching: "${source}"`);
    console.log(`Domain: ${matcher.domain || 'auto-detected'}`);
    console.log(`\nResults:`);

    if (matches.length === 0) {
      console.log('  No matches found above threshold');
    } else {
      matches.forEach((m, i) => {
        console.log(`  ${i + 1}. ${m.target}`);
        console.log(`     Confidence: ${m.confidence}% (${m.matchType})`);
        console.log(`     Similarity: ${m.similarity}%`);
        if (m.expansions.source.length > 0) {
          console.log(`     Expansions: ${m.expansions.source.map(e => `${e.from}→${e.to}`).join(', ')}`);
        }
        if (m.synonymMatch) {
          console.log(`     Synonym match: Yes`);
        }
        console.log(`     Reason: ${m.reason}\n`);
      });
    }

  } else if (command === 'expand') {
    const text = args[1];
    const domainIdx = args.indexOf('--domain');
    const domain = domainIdx > -1 ? args[domainIdx + 1] : null;

    if (!text || !domain) {
      console.error('Error: Both text and --domain required');
      process.exit(1);
    }

    const matcher = new DomainAwareMatcher({ domain, autoDetect: false });
    const result = matcher.expandAbbreviations(text);

    console.log(`\nOriginal: "${text}"`);
    console.log(`Expanded: "${result.expanded}"`);
    if (result.expansions.length > 0) {
      console.log(`\nExpansions applied:`);
      result.expansions.forEach(e => {
        console.log(`  ${e.from} → ${e.to}`);
      });
    }
    console.log('');

  } else if (command === 'detect') {
    const text = args.slice(1).join(' ');
    const { DomainDetector } = require('./domain-detector');
    const detector = new DomainDetector();
    const result = detector.detect(text);

    console.log(`\n--- Domain Detection ---`);
    console.log(`Input: "${text}"`);
    console.log(`Detected: ${result.detectedDomain || 'none'}`);
    console.log(`Confidence: ${(result.confidence * 100).toFixed(1)}%`);

    if (result.evidence.length > 0) {
      console.log(`\nEvidence:`);
      result.evidence.forEach(e => {
        console.log(`  - ${e.type}: "${e.value || e.pattern}"`);
      });
    }
    console.log('');

  } else {
    console.error(`Unknown command: ${command}`);
    process.exit(1);
  }
}
