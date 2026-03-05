/**
 * IncrementalMatcher - Efficiently match new records against existing dataset
 *
 * Uses inverted indexes and blocking strategies to avoid O(n²) comparisons.
 * Supports multiple indexing strategies for different field types.
 *
 * @module batch/incremental-matcher
 */

'use strict';

/**
 * Index types for different matching strategies
 */
const INDEX_TYPES = {
  EXACT: 'EXACT',           // Exact match on normalized value
  PREFIX: 'PREFIX',         // First N characters
  PHONETIC: 'PHONETIC',     // Soundex/Metaphone
  NGRAM: 'NGRAM',          // N-gram similarity
  TOKEN: 'TOKEN'           // Token/word-based
};

/**
 * Default indexing configuration
 */
const DEFAULT_INDEX_CONFIG = {
  name: {
    type: INDEX_TYPES.TOKEN,
    normalize: true,
    minTokenLength: 2
  },
  state: {
    type: INDEX_TYPES.EXACT,
    normalize: true
  },
  domain: {
    type: INDEX_TYPES.EXACT,
    normalize: true,
    extractDomain: true
  },
  phoneAreaCode: {
    type: INDEX_TYPES.EXACT,
    extractAreaCode: true
  },
  city: {
    type: INDEX_TYPES.PREFIX,
    prefixLength: 4,
    normalize: true
  }
};

/**
 * Blocking key generators for candidate selection
 */
const BLOCKING_STRATEGIES = {
  // State-based blocking
  BY_STATE: (record) => {
    const state = record.State || record.state || record.BillingState;
    return state ? state.toUpperCase().trim() : null;
  },

  // First 3 chars of normalized name
  BY_NAME_PREFIX: (record) => {
    const name = record.Name || record.name || record.CompanyName;
    if (!name) return null;
    return name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 3) || null;
  },

  // Domain-based blocking
  BY_DOMAIN: (record) => {
    const domain = record.Domain || record.domain || record.Website;
    if (!domain) return null;
    const match = domain.match(/(?:https?:\/\/)?(?:www\.)?([^\/\s]+)/i);
    return match ? match[1].toLowerCase() : null;
  },

  // Phone area code blocking
  BY_AREA_CODE: (record) => {
    const phone = record.Phone || record.phone;
    if (!phone) return null;
    const digits = String(phone).replace(/\D/g, '');
    return digits.length >= 10 ? digits.slice(0, 3) : null;
  },

  // Industry blocking
  BY_INDUSTRY: (record) => {
    const industry = record.Industry || record.industry;
    return industry ? industry.toLowerCase().trim() : null;
  }
};

class IncrementalMatcher {
  /**
   * Create an IncrementalMatcher
   * @param {Object} options - Configuration options
   * @param {Object} options.indexConfig - Field indexing configuration
   * @param {Array} options.blockingStrategies - Blocking strategies to use
   * @param {number} options.maxCandidates - Maximum candidates per new record
   * @param {Function} options.scorer - Scoring function for candidate pairs
   */
  constructor(options = {}) {
    this.indexConfig = options.indexConfig || DEFAULT_INDEX_CONFIG;
    this.blockingStrategies = options.blockingStrategies || [
      'BY_STATE',
      'BY_NAME_PREFIX',
      'BY_DOMAIN'
    ];
    this.maxCandidates = options.maxCandidates ?? 100;
    this.scorer = options.scorer;

    // Indexes
    this.indexes = new Map();
    this.blockingIndexes = new Map();
    this.recordsById = new Map();

    // Statistics
    this.stats = {
      recordsIndexed: 0,
      queriesProcessed: 0,
      candidatesGenerated: 0,
      avgCandidatesPerQuery: 0,
      indexBuildTime: 0
    };

    this._candidateSum = 0;
  }

  /**
   * Build indexes from existing records
   *
   * @param {Array} records - Array of records to index
   * @param {Object} options - Build options
   * @returns {Object} Build statistics
   */
  buildIndex(records, options = {}) {
    const startTime = Date.now();
    const { idField = 'Id' } = options;

    // Reset indexes
    this.indexes.clear();
    this.blockingIndexes.clear();
    this.recordsById.clear();

    // Reset stats
    this.stats.recordsIndexed = 0;

    // Initialize blocking indexes
    for (const strategyName of this.blockingStrategies) {
      this.blockingIndexes.set(strategyName, new Map());
    }

    // Initialize field indexes
    for (const [field, config] of Object.entries(this.indexConfig)) {
      this.indexes.set(field, new Map());
    }

    // Index each record
    for (const record of records) {
      const recordId = record[idField] || record.id || this._generateId(record);
      this.recordsById.set(recordId, record);

      // Add to blocking indexes
      this._addToBlockingIndexes(record, recordId);

      // Add to field indexes
      this._addToFieldIndexes(record, recordId);

      this.stats.recordsIndexed++;
    }

    this.stats.indexBuildTime = Date.now() - startTime;

    return {
      recordsIndexed: this.stats.recordsIndexed,
      buildTimeMs: this.stats.indexBuildTime,
      blockingIndexSizes: this._getIndexSizes(this.blockingIndexes),
      fieldIndexSizes: this._getIndexSizes(this.indexes)
    };
  }

  /**
   * Add a single record to the index
   *
   * @param {Object} record - Record to add
   * @param {string} [recordId] - Optional record ID
   */
  addToIndex(record, recordId) {
    const id = recordId || record.Id || record.id || this._generateId(record);

    this.recordsById.set(id, record);
    this._addToBlockingIndexes(record, id);
    this._addToFieldIndexes(record, id);
    this.stats.recordsIndexed++;
  }

  /**
   * Remove a record from the index
   *
   * @param {string} recordId - ID of record to remove
   */
  removeFromIndex(recordId) {
    const record = this.recordsById.get(recordId);
    if (!record) return;

    // Remove from blocking indexes
    for (const [strategyName, index] of this.blockingIndexes) {
      const strategy = BLOCKING_STRATEGIES[strategyName];
      if (!strategy) continue;

      const key = strategy(record);
      if (key && index.has(key)) {
        const ids = index.get(key);
        ids.delete(recordId);
        if (ids.size === 0) index.delete(key);
      }
    }

    // Remove from field indexes
    for (const [field, index] of this.indexes) {
      for (const [key, ids] of index) {
        ids.delete(recordId);
        if (ids.size === 0) index.delete(key);
      }
    }

    this.recordsById.delete(recordId);
    this.stats.recordsIndexed--;
  }

  /**
   * Find candidate matches for a new record
   *
   * @param {Object} newRecord - Record to match
   * @param {Object} options - Match options
   * @returns {Array} Array of candidate records
   */
  findCandidates(newRecord, options = {}) {
    const {
      maxCandidates = this.maxCandidates,
      requireAllBlocks = false
    } = options;

    const candidateIds = new Map(); // recordId -> hit count

    // Query each blocking index
    for (const strategyName of this.blockingStrategies) {
      const strategy = BLOCKING_STRATEGIES[strategyName];
      const index = this.blockingIndexes.get(strategyName);

      if (!strategy || !index) continue;

      const key = strategy(newRecord);
      if (!key) continue;

      const matchingIds = index.get(key);
      if (!matchingIds) continue;

      for (const id of matchingIds) {
        candidateIds.set(id, (candidateIds.get(id) || 0) + 1);
      }
    }

    // Filter by hit count if required
    let candidates;
    if (requireAllBlocks) {
      const requiredHits = this.blockingStrategies.length;
      candidates = Array.from(candidateIds.entries())
        .filter(([, hits]) => hits >= requiredHits)
        .map(([id]) => id);
    } else {
      candidates = Array.from(candidateIds.keys());
    }

    // Limit candidates
    if (candidates.length > maxCandidates) {
      // Prioritize by hit count
      candidates = Array.from(candidateIds.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, maxCandidates)
        .map(([id]) => id);
    }

    // Update stats
    this.stats.queriesProcessed++;
    this.stats.candidatesGenerated += candidates.length;
    this._candidateSum += candidates.length;
    this.stats.avgCandidatesPerQuery = this._candidateSum / this.stats.queriesProcessed;

    // Return records
    return candidates.map(id => ({
      id,
      record: this.recordsById.get(id),
      blockHits: candidateIds.get(id)
    }));
  }

  /**
   * Match a new record against the index and return scored results
   *
   * @param {Object} newRecord - Record to match
   * @param {Object} options - Match options
   * @returns {Array} Scored matches sorted by confidence
   */
  matchNewRecord(newRecord, options = {}) {
    const { topN = 10, minConfidence = 0 } = options;

    // Find candidates
    const candidates = this.findCandidates(newRecord, options);

    if (candidates.length === 0) {
      return [];
    }

    // Score candidates
    const scored = [];
    for (const candidate of candidates) {
      let score;

      if (this.scorer) {
        // Use custom scorer
        score = this.scorer(newRecord, candidate.record);
      } else {
        // Use simple scoring
        score = this._simpleScore(newRecord, candidate.record, candidate.blockHits);
      }

      if (score >= minConfidence) {
        scored.push({
          candidateId: candidate.id,
          candidate: candidate.record,
          confidence: score,
          blockHits: candidate.blockHits
        });
      }
    }

    // Sort by confidence and return top N
    return scored
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, topN);
  }

  /**
   * Batch match multiple new records
   *
   * @param {Array} newRecords - Records to match
   * @param {Object} options - Match options
   * @returns {Array} Array of match results per record
   */
  batchMatch(newRecords, options = {}) {
    return newRecords.map((record, index) => ({
      index,
      record,
      matches: this.matchNewRecord(record, options)
    }));
  }

  /**
   * Get index statistics
   */
  getStats() {
    return {
      ...this.stats,
      blockingIndexes: this._getIndexSizes(this.blockingIndexes),
      fieldIndexes: this._getIndexSizes(this.indexes)
    };
  }

  /**
   * Get indexed record by ID
   */
  getRecord(recordId) {
    return this.recordsById.get(recordId);
  }

  /**
   * Get all indexed records
   */
  getAllRecords() {
    return Array.from(this.recordsById.values());
  }

  // ========== Private Methods ==========

  _generateId(record) {
    return `rec_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  _addToBlockingIndexes(record, recordId) {
    for (const [strategyName, index] of this.blockingIndexes) {
      const strategy = BLOCKING_STRATEGIES[strategyName];
      if (!strategy) continue;

      const key = strategy(record);
      if (!key) continue;

      if (!index.has(key)) {
        index.set(key, new Set());
      }
      index.get(key).add(recordId);
    }
  }

  _addToFieldIndexes(record, recordId) {
    for (const [field, config] of Object.entries(this.indexConfig)) {
      const index = this.indexes.get(field);
      if (!index) continue;

      const keys = this._extractKeys(record, field, config);
      for (const key of keys) {
        if (!index.has(key)) {
          index.set(key, new Set());
        }
        index.get(key).add(recordId);
      }
    }
  }

  _extractKeys(record, field, config) {
    const keys = [];
    let value = this._getFieldValue(record, field);

    if (!value) return keys;

    // Normalize if configured
    if (config.normalize) {
      value = this._normalize(value);
    }

    // Extract domain if configured
    if (config.extractDomain) {
      const match = value.match(/(?:https?:\/\/)?(?:www\.)?([^\/\s]+)/i);
      value = match ? match[1] : value;
    }

    // Extract area code if configured
    if (config.extractAreaCode) {
      const digits = String(value).replace(/\D/g, '');
      value = digits.length >= 10 ? digits.slice(0, 3) : null;
      if (!value) return keys;
    }

    switch (config.type) {
      case INDEX_TYPES.EXACT:
        keys.push(value);
        break;

      case INDEX_TYPES.PREFIX:
        const prefixLen = config.prefixLength || 3;
        keys.push(value.slice(0, prefixLen));
        break;

      case INDEX_TYPES.TOKEN:
        const tokens = this._tokenize(value, config.minTokenLength || 2);
        keys.push(...tokens);
        break;

      case INDEX_TYPES.NGRAM:
        const ngrams = this._generateNgrams(value, config.n || 3);
        keys.push(...ngrams);
        break;

      default:
        keys.push(value);
    }

    return keys;
  }

  _getFieldValue(record, field) {
    // Handle common field name variations
    const variations = [
      field,
      field.charAt(0).toUpperCase() + field.slice(1),
      field.toLowerCase(),
      `Billing${field.charAt(0).toUpperCase() + field.slice(1)}`
    ];

    for (const variation of variations) {
      if (record[variation] !== undefined && record[variation] !== null) {
        return String(record[variation]);
      }
    }

    return null;
  }

  _normalize(value) {
    return String(value)
      .toLowerCase()
      .trim()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ');
  }

  _tokenize(value, minLength = 2) {
    return value
      .split(/\s+/)
      .filter(token => token.length >= minLength)
      .map(token => token.toLowerCase());
  }

  _generateNgrams(value, n = 3) {
    const ngrams = [];
    const normalized = value.replace(/\s/g, '');

    for (let i = 0; i <= normalized.length - n; i++) {
      ngrams.push(normalized.slice(i, i + n));
    }

    return ngrams;
  }

  _simpleScore(recordA, recordB, blockHits) {
    let score = 0;

    // Base score from block hits (max 30 points)
    score += Math.min(blockHits * 10, 30);

    // Name similarity (max 40 points)
    const nameA = this._normalize(this._getFieldValue(recordA, 'name') || '');
    const nameB = this._normalize(this._getFieldValue(recordB, 'name') || '');
    if (nameA && nameB) {
      if (nameA === nameB) {
        score += 40;
      } else if (this._isWordBoundarySubstring(nameA, nameB)) {
        // Substring match only counts at word boundaries or when length ratio >= 0.75.
        // Prevents false positives like "hiya" inside "Dehiya" or "bask" inside "Baskets".
        score += 25;
      } else {
        // Token overlap
        const tokensA = new Set(this._tokenize(nameA));
        const tokensB = new Set(this._tokenize(nameB));
        const intersection = [...tokensA].filter(t => tokensB.has(t)).length;
        const union = new Set([...tokensA, ...tokensB]).size;
        score += Math.round((intersection / union) * 30) || 0;
      }
    }

    // State match (max 15 points)
    const stateA = (this._getFieldValue(recordA, 'state') || '').toUpperCase();
    const stateB = (this._getFieldValue(recordB, 'state') || '').toUpperCase();
    if (stateA && stateB && stateA === stateB) {
      score += 15;
    }

    // Domain match (max 15 points)
    const domainA = this._getFieldValue(recordA, 'domain');
    const domainB = this._getFieldValue(recordB, 'domain');
    if (domainA && domainB) {
      const normA = domainA.replace(/^(https?:\/\/)?(www\.)?/i, '').toLowerCase();
      const normB = domainB.replace(/^(https?:\/\/)?(www\.)?/i, '').toLowerCase();
      if (normA === normB) {
        score += 15;
      }
    }

    return Math.min(100, score);
  }

  /**
   * Check if one string is a meaningful substring of the other.
   * Returns true only if the shorter string appears at a word boundary
   * in the longer string, OR the length ratio is >= 0.75.
   * Prevents "hiya" matching inside "Dehiya" while allowing "acme" in "acme corp".
   */
  _isWordBoundarySubstring(a, b) {
    const shorter = a.length <= b.length ? a : b;
    const longer = a.length <= b.length ? b : a;

    if (!longer.includes(shorter)) return false;

    // High length ratio — likely the same entity
    if (shorter.length / longer.length >= 0.75) return true;

    // Check if shorter appears at a word boundary in longer
    const escaped = shorter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const wordBoundary = new RegExp(`(^|\\s|[-_/])${escaped}(\\s|[-_/]|$)`);
    return wordBoundary.test(longer);
  }

  _getIndexSizes(indexMap) {
    const sizes = {};
    for (const [name, index] of indexMap) {
      sizes[name] = {
        keys: index.size,
        totalEntries: Array.from(index.values()).reduce((sum, set) => sum + set.size, 0)
      };
    }
    return sizes;
  }
}

module.exports = {
  IncrementalMatcher,
  INDEX_TYPES,
  DEFAULT_INDEX_CONFIG,
  BLOCKING_STRATEGIES
};
