/**
 * EntityClusterDetector - Find clusters of related records
 *
 * Uses Union-Find (Disjoint Set Union) algorithm to efficiently
 * find connected components in a match graph. Supports:
 * - Transitive matching (A~B, B~C → A~C)
 * - Master record selection strategies
 * - Cluster quality scoring
 *
 * @module batch/entity-cluster-detector
 */

'use strict';

/**
 * Master record selection strategies
 */
const MASTER_STRATEGIES = {
  MOST_COMPLETE: 'MOST_COMPLETE',       // Most filled fields
  OLDEST: 'OLDEST',                     // First created
  MOST_RECENT: 'MOST_RECENT',           // Most recently modified
  HIGHEST_QUALITY: 'HIGHEST_QUALITY',   // Best data quality score
  CUSTOM: 'CUSTOM'                      // User-defined function
};

/**
 * Default fields to check for completeness
 */
const DEFAULT_COMPLETENESS_FIELDS = [
  'name', 'Name', 'CompanyName',
  'state', 'State', 'BillingState',
  'city', 'City', 'BillingCity',
  'domain', 'Domain', 'Website',
  'phone', 'Phone',
  'industry', 'Industry',
  'npi', 'NPI',
  'ein', 'EIN'
];

/**
 * Union-Find data structure with path compression and union by rank
 */
class UnionFind {
  constructor() {
    this.parent = new Map();
    this.rank = new Map();
    this.size = new Map();
  }

  /**
   * Find the root of an element with path compression
   */
  find(x) {
    if (!this.parent.has(x)) {
      this.parent.set(x, x);
      this.rank.set(x, 0);
      this.size.set(x, 1);
    }

    if (this.parent.get(x) !== x) {
      // Path compression
      this.parent.set(x, this.find(this.parent.get(x)));
    }

    return this.parent.get(x);
  }

  /**
   * Union two sets by rank
   */
  union(x, y) {
    const rootX = this.find(x);
    const rootY = this.find(y);

    if (rootX === rootY) return false;

    // Union by rank
    const rankX = this.rank.get(rootX);
    const rankY = this.rank.get(rootY);

    if (rankX < rankY) {
      this.parent.set(rootX, rootY);
      this.size.set(rootY, this.size.get(rootX) + this.size.get(rootY));
    } else if (rankX > rankY) {
      this.parent.set(rootY, rootX);
      this.size.set(rootX, this.size.get(rootX) + this.size.get(rootY));
    } else {
      this.parent.set(rootY, rootX);
      this.rank.set(rootX, rankX + 1);
      this.size.set(rootX, this.size.get(rootX) + this.size.get(rootY));
    }

    return true;
  }

  /**
   * Check if two elements are in the same set
   */
  connected(x, y) {
    return this.find(x) === this.find(y);
  }

  /**
   * Get size of set containing element
   */
  getSize(x) {
    return this.size.get(this.find(x));
  }

  /**
   * Get all unique sets
   */
  getSets() {
    const sets = new Map();

    for (const element of this.parent.keys()) {
      const root = this.find(element);
      if (!sets.has(root)) {
        sets.set(root, []);
      }
      sets.get(root).push(element);
    }

    return sets;
  }
}

class EntityClusterDetector {
  /**
   * Create an EntityClusterDetector
   * @param {Object} options - Configuration options
   * @param {number} options.minConfidence - Minimum confidence to consider a match
   * @param {string} options.masterStrategy - Strategy for selecting master record
   * @param {Function} options.customMasterSelector - Custom function for master selection
   * @param {Array} options.completenessFields - Fields to check for completeness
   */
  constructor(options = {}) {
    this.minConfidence = options.minConfidence ?? 65;
    this.masterStrategy = options.masterStrategy || MASTER_STRATEGIES.MOST_COMPLETE;
    this.customMasterSelector = options.customMasterSelector;
    this.completenessFields = options.completenessFields || DEFAULT_COMPLETENESS_FIELDS;

    // Statistics
    this.stats = {
      clustersDetected: 0,
      recordsProcessed: 0,
      matchesProcessed: 0,
      singletons: 0,
      largestCluster: 0,
      averageClusterSize: 0
    };
  }

  /**
   * Detect clusters from a list of pairwise matches
   *
   * @param {Array} matches - Array of { recordA, recordB, confidence, ... }
   * @param {Object} options - Detection options
   * @returns {Array} Array of cluster objects
   */
  detectClusters(matches, options = {}) {
    const {
      minConfidence = this.minConfidence,
      includeScores = true
    } = options;

    const uf = new UnionFind();
    const recordsById = new Map();
    const matchesByPair = new Map();

    // Process matches
    for (const match of matches) {
      if (match.confidence < minConfidence) continue;

      const idA = this._getRecordId(match.recordA);
      const idB = this._getRecordId(match.recordB);

      // Store records
      if (!recordsById.has(idA)) recordsById.set(idA, match.recordA);
      if (!recordsById.has(idB)) recordsById.set(idB, match.recordB);

      // Union the sets
      uf.union(idA, idB);

      // Store match info
      const pairKey = [idA, idB].sort().join('::');
      matchesByPair.set(pairKey, match);

      this.stats.matchesProcessed++;
    }

    // Extract clusters
    const sets = uf.getSets();
    const clusters = [];

    for (const [root, memberIds] of sets) {
      if (memberIds.length === 1) {
        this.stats.singletons++;
        continue; // Skip singletons
      }

      const members = memberIds.map(id => recordsById.get(id));

      // Get internal matches for this cluster
      const internalMatches = [];
      for (let i = 0; i < memberIds.length; i++) {
        for (let j = i + 1; j < memberIds.length; j++) {
          const pairKey = [memberIds[i], memberIds[j]].sort().join('::');
          if (matchesByPair.has(pairKey)) {
            internalMatches.push(matchesByPair.get(pairKey));
          }
        }
      }

      // Select master record
      const master = this.selectMasterRecord(members, this.masterStrategy);
      const masterId = this._getRecordId(master);

      // Calculate cluster quality
      const quality = this._calculateClusterQuality(members, internalMatches);

      clusters.push({
        id: `cluster_${root}`,
        masterId,
        master,
        memberIds,
        members,
        size: members.length,
        matches: includeScores ? internalMatches : undefined,
        quality,
        avgConfidence: internalMatches.length > 0
          ? internalMatches.reduce((sum, m) => sum + m.confidence, 0) / internalMatches.length
          : 0
      });

      this.stats.clustersDetected++;
      this.stats.largestCluster = Math.max(this.stats.largestCluster, members.length);
    }

    // Calculate average cluster size
    if (clusters.length > 0) {
      this.stats.averageClusterSize = clusters.reduce((sum, c) => sum + c.size, 0) / clusters.length;
    }
    this.stats.recordsProcessed = recordsById.size;

    // Sort by size descending
    return clusters.sort((a, b) => b.size - a.size);
  }

  /**
   * Detect transitive matches from pairwise comparisons
   * Given A~B and B~C, determines A~C
   *
   * @param {Array} matches - Array of pairwise matches
   * @param {Object} options - Options
   * @returns {Array} Transitive matches that weren't directly compared
   */
  detectTransitiveMatches(matches, options = {}) {
    const { minConfidence = this.minConfidence } = options;

    const uf = new UnionFind();
    const directPairs = new Set();
    const recordsById = new Map();

    // Build direct match graph
    for (const match of matches) {
      if (match.confidence < minConfidence) continue;

      const idA = this._getRecordId(match.recordA);
      const idB = this._getRecordId(match.recordB);

      recordsById.set(idA, match.recordA);
      recordsById.set(idB, match.recordB);

      uf.union(idA, idB);
      directPairs.add([idA, idB].sort().join('::'));
    }

    // Find transitive matches (in same cluster but no direct match)
    const sets = uf.getSets();
    const transitiveMatches = [];

    for (const [, memberIds] of sets) {
      if (memberIds.length <= 2) continue;

      // Check all pairs in cluster
      for (let i = 0; i < memberIds.length; i++) {
        for (let j = i + 1; j < memberIds.length; j++) {
          const pairKey = [memberIds[i], memberIds[j]].sort().join('::');
          if (!directPairs.has(pairKey)) {
            transitiveMatches.push({
              recordA: recordsById.get(memberIds[i]),
              recordB: recordsById.get(memberIds[j]),
              idA: memberIds[i],
              idB: memberIds[j],
              type: 'TRANSITIVE',
              reason: 'Connected through other matches in cluster'
            });
          }
        }
      }
    }

    return transitiveMatches;
  }

  /**
   * Select the master record from a cluster
   *
   * @param {Array} members - Array of records in cluster
   * @param {string} strategy - Selection strategy
   * @returns {Object} Selected master record
   */
  selectMasterRecord(members, strategy = this.masterStrategy) {
    if (members.length === 0) return null;
    if (members.length === 1) return members[0];

    switch (strategy) {
      case MASTER_STRATEGIES.MOST_COMPLETE:
        return this._selectMostComplete(members);

      case MASTER_STRATEGIES.OLDEST:
        return this._selectOldest(members);

      case MASTER_STRATEGIES.MOST_RECENT:
        return this._selectMostRecent(members);

      case MASTER_STRATEGIES.HIGHEST_QUALITY:
        return this._selectHighestQuality(members);

      case MASTER_STRATEGIES.CUSTOM:
        if (this.customMasterSelector) {
          return this.customMasterSelector(members);
        }
        // Fall through to default

      default:
        return this._selectMostComplete(members);
    }
  }

  /**
   * Merge cluster members into master record
   *
   * @param {Object} cluster - Cluster object with master and members
   * @param {Object} options - Merge options
   * @returns {Object} Merged record
   */
  mergeCluster(cluster, options = {}) {
    const {
      fillBlanks = true,        // Fill master's blank fields from members
      preserveMasterValues = true, // Don't overwrite master's existing values
      conflictResolution = 'MASTER_WINS' // MASTER_WINS, MOST_COMMON, MOST_RECENT
    } = options;

    const merged = { ...cluster.master };
    const fieldSources = {};

    if (!fillBlanks) return merged;

    // Collect all field values from members
    for (const member of cluster.members) {
      for (const [key, value] of Object.entries(member)) {
        if (this._hasValue(value)) {
          if (!fieldSources[key]) {
            fieldSources[key] = [];
          }
          fieldSources[key].push({ value, record: member });
        }
      }
    }

    // Fill missing fields
    for (const [field, sources] of Object.entries(fieldSources)) {
      if (preserveMasterValues && this._hasValue(merged[field])) {
        continue; // Keep master's value
      }

      if (!this._hasValue(merged[field]) && sources.length > 0) {
        // Fill from best source
        if (conflictResolution === 'MOST_COMMON') {
          merged[field] = this._getMostCommonValue(sources);
        } else {
          merged[field] = sources[0].value; // First available
        }
      }
    }

    return merged;
  }

  /**
   * Score cluster quality
   *
   * @param {Object} cluster - Cluster to score
   * @returns {Object} Quality assessment
   */
  scoreClusterQuality(cluster) {
    return this._calculateClusterQuality(cluster.members, cluster.matches || []);
  }

  /**
   * Get statistics
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      clustersDetected: 0,
      recordsProcessed: 0,
      matchesProcessed: 0,
      singletons: 0,
      largestCluster: 0,
      averageClusterSize: 0
    };
  }

  // ========== Private Methods ==========

  _getRecordId(record) {
    return record.Id || record.id || record._id ||
           record.sfid || record.recordId ||
           JSON.stringify(record).slice(0, 100);
  }

  _hasValue(value) {
    if (value === null || value === undefined) return false;
    if (typeof value === 'string' && value.trim() === '') return false;
    return true;
  }

  _selectMostComplete(members) {
    let best = members[0];
    let bestScore = 0;

    for (const member of members) {
      const score = this._calculateCompleteness(member);
      if (score > bestScore) {
        bestScore = score;
        best = member;
      }
    }

    return best;
  }

  _selectOldest(members) {
    const dateFields = ['CreatedDate', 'createdDate', 'created_at', 'createDate'];

    return members.reduce((oldest, member) => {
      for (const field of dateFields) {
        const oldestDate = oldest[field];
        const memberDate = member[field];

        if (oldestDate && memberDate) {
          return new Date(memberDate) < new Date(oldestDate) ? member : oldest;
        }
      }
      return oldest;
    }, members[0]);
  }

  _selectMostRecent(members) {
    const dateFields = ['LastModifiedDate', 'lastModifiedDate', 'updated_at', 'modifyDate'];

    return members.reduce((newest, member) => {
      for (const field of dateFields) {
        const newestDate = newest[field];
        const memberDate = member[field];

        if (newestDate && memberDate) {
          return new Date(memberDate) > new Date(newestDate) ? member : newest;
        }
      }
      return newest;
    }, members[0]);
  }

  _selectHighestQuality(members) {
    let best = members[0];
    let bestScore = 0;

    for (const member of members) {
      const completeness = this._calculateCompleteness(member);
      const hasIdentifier = this._hasIdentifier(member);
      const score = completeness + (hasIdentifier ? 0.3 : 0);

      if (score > bestScore) {
        bestScore = score;
        best = member;
      }
    }

    return best;
  }

  _calculateCompleteness(record) {
    let filled = 0;
    const checked = new Set();

    for (const field of this.completenessFields) {
      if (checked.has(field.toLowerCase())) continue;
      checked.add(field.toLowerCase());

      if (this._hasValue(record[field])) {
        filled++;
      }
    }

    return filled / checked.size;
  }

  _hasIdentifier(record) {
    const idFields = ['NPI', 'npi', 'EIN', 'ein', 'DUNS', 'duns', 'FCC_CallSign'];
    return idFields.some(field => this._hasValue(record[field]));
  }

  _calculateClusterQuality(members, matches) {
    // Density: ratio of actual matches to possible matches
    const possibleMatches = (members.length * (members.length - 1)) / 2;
    const density = possibleMatches > 0 ? matches.length / possibleMatches : 0;

    // Cohesion: average confidence of matches
    const avgConfidence = matches.length > 0
      ? matches.reduce((sum, m) => sum + m.confidence, 0) / matches.length
      : 0;

    // Completeness: average record completeness
    const avgCompleteness = members.length > 0
      ? members.reduce((sum, m) => sum + this._calculateCompleteness(m), 0) / members.length
      : 0;

    // Identifier presence
    const hasIdentifiers = members.filter(m => this._hasIdentifier(m)).length;
    const identifierRatio = members.length > 0 ? hasIdentifiers / members.length : 0;

    // Combined quality score (0-100)
    const quality = Math.round(
      (density * 25) +
      (avgConfidence * 0.4) +
      (avgCompleteness * 20) +
      (identifierRatio * 15)
    );

    return {
      score: Math.min(100, quality),
      density: Math.round(density * 100) / 100,
      avgConfidence: Math.round(avgConfidence),
      avgCompleteness: Math.round(avgCompleteness * 100) / 100,
      identifierRatio: Math.round(identifierRatio * 100) / 100,
      memberCount: members.length,
      matchCount: matches.length
    };
  }

  _getMostCommonValue(sources) {
    const counts = new Map();

    for (const { value } of sources) {
      const normalized = String(value).toLowerCase().trim();
      counts.set(normalized, (counts.get(normalized) || 0) + 1);
    }

    let maxCount = 0;
    let mostCommon = sources[0].value;

    for (const { value } of sources) {
      const normalized = String(value).toLowerCase().trim();
      if (counts.get(normalized) > maxCount) {
        maxCount = counts.get(normalized);
        mostCommon = value;
      }
    }

    return mostCommon;
  }
}

module.exports = {
  EntityClusterDetector,
  UnionFind,
  MASTER_STRATEGIES,
  DEFAULT_COMPLETENESS_FIELDS
};
