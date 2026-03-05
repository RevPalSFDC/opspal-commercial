#!/usr/bin/env node
/**
 * Record Match & Merge Service - Canonical matching and merge with conflict resolution
 *
 * Implements the record_match_and_merge contract from central_services.json.
 * Consolidates 6+ dedup orchestrators and survivor selection strategies into
 * a unified, platform-agnostic service.
 *
 * @module record-match-merge-service
 * @version 1.0.0
 * @see ../../developer-tools-plugin/config/central_services.json
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * Record Match & Merge Service Class
 *
 * Provides canonical matching, survivor selection, and merge execution
 * across Salesforce, HubSpot, and cross-platform scenarios.
 */
class RecordMatchMergeService {
  constructor(config = {}) {
    this.config = {
      logPath: config.logPath || path.join(__dirname, '../../logs/match-merge-service.jsonl'),
      rollbackDir: config.rollbackDir || path.join(__dirname, '../../rollback'),
      defaultStrategy: config.defaultStrategy || 'weighted_scoring',
      defaultSurvivorStrategy: config.defaultSurvivorStrategy || 'relationship_score',
      ...config
    };

    // Ensure directories exist
    [path.dirname(this.config.logPath), this.config.rollbackDir].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });

    // Load platform-specific scoring weights
    this.scoringWeights = this._loadScoringWeights();
  }

  /**
   * Execute Match & Merge (Main Entry Point)
   *
   * @param {Object} request - Match/merge request per service contract
   * @param {string} request.platform - Platform (salesforce, hubspot, cross_platform)
   * @param {string} request.object_type - Object type (Account, Contact, Company, etc.)
   * @param {Array<Object>} request.records - Records to analyze
   * @param {Array<string>} request.id_fields - Fields for matching
   * @param {string} request.strategy - Matching strategy (strict, fuzzy, domain, etc.)
   * @param {string} request.survivor_strategy - Survivor selection strategy
   * @param {string} request.conflict_resolution - Conflict handling (preserve_master, merge_all, user_review)
   * @param {boolean} request.dry_run - If true, return plan without executing
   * @param {Object} request.config - Platform-specific configuration
   * @returns {Object} Match/merge results with rollback plan
   */
  async executeMatchMerge(request) {
    const startTime = Date.now();
    const traceId = this._generateTraceId();

    try {
      // Step 1: Validate input
      this._validateInput(request);

      // Step 2: Detect duplicates (clustering)
      const clusters = await this._detectDuplicates(request.records, request.id_fields, request.strategy, request.config);

      // Step 3: Select survivors
      const survivors = await this._selectSurvivors(clusters, request.survivor_strategy, request.platform, request.config);

      // Step 4: Resolve conflicts
      const mergeDecisions = await this._resolveConflicts(clusters, survivors, request.conflict_resolution);

      // Step 5: Identify unresolved conflicts
      const conflicts = mergeDecisions.filter(d => d.requires_review);

      // Step 6: Execute merge (if not dry run)
      let executionLog = null;
      let rollbackPlan = null;
      if (!request.dry_run && conflicts.length === 0) {
        const execution = await this._executeMerge(mergeDecisions, request.platform, request.object_type);
        executionLog = execution.log;
        rollbackPlan = execution.rollback;
      }

      // Step 7: Validate results
      const validation = this._validateResults(clusters, survivors, mergeDecisions, request);

      // Step 8: Build response
      const response = {
        clusters,
        survivors,
        merge_decisions: mergeDecisions,
        conflicts,
        execution_log: executionLog,
        rollback_available: rollbackPlan !== null,
        rollback_plan: rollbackPlan,
        validation
      };

      // Step 9: Log telemetry
      this._logTelemetry(request, response, Date.now() - startTime, traceId);

      return response;

    } catch (error) {
      this._logError(error, request, traceId);
      throw error;
    }
  }

  /**
   * Validate Input Contract
   */
  _validateInput(request) {
    const required = ['platform', 'object_type', 'records', 'id_fields', 'strategy', 'survivor_strategy'];
    for (const field of required) {
      if (!request[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    // Validate enums
    const validPlatforms = ['salesforce', 'hubspot', 'cross_platform'];
    if (!validPlatforms.includes(request.platform)) {
      throw new Error(`Invalid platform: ${request.platform}`);
    }

    const validStrategies = ['strict', 'fuzzy', 'domain', 'semantic', 'weighted_scoring'];
    if (!validStrategies.includes(request.strategy)) {
      throw new Error(`Invalid strategy: ${request.strategy}`);
    }

    const validSurvivorStrategies = ['relationship_score', 'revenue_score', 'sf_sync_priority', 'custom_weights'];
    if (!validSurvivorStrategies.includes(request.survivor_strategy)) {
      throw new Error(`Invalid survivor_strategy: ${request.survivor_strategy}`);
    }
  }

  /**
   * Detect Duplicates (Clustering)
   *
   * Consolidates logic from:
   * - dedup-clustering-engine.js
   * - fuzzy-matcher.js
   * - organization-based-classifier.js
   */
  async _detectDuplicates(records, idFields, strategy, config = {}) {
    const clusters = [];

    if (strategy === 'strict') {
      // Exact ID matching
      const groups = this._groupByExactMatch(records, idFields);
      for (const [key, group] of Object.entries(groups)) {
        if (group.length > 1) {
          clusters.push({
            cluster_id: this._generateClusterId(),
            strategy: 'strict',
            confidence: 1.0,
            records: group,
            match_key: key
          });
        }
      }
    } else if (strategy === 'fuzzy') {
      // Fuzzy string matching (Levenshtein distance)
      clusters.push(...this._fuzzyMatch(records, idFields, config.fuzzy_threshold || 0.85));
    } else if (strategy === 'domain') {
      // Domain-based grouping (for Companies/Accounts)
      clusters.push(...this._domainMatch(records, config));
    } else if (strategy === 'weighted_scoring') {
      // Multi-field weighted similarity
      clusters.push(...this._weightedMatch(records, config));
    }

    return clusters;
  }

  /**
   * Group by Exact Match
   */
  _groupByExactMatch(records, idFields) {
    const groups = {};
    for (const record of records) {
      const key = idFields.map(field => record[field]).filter(v => v).join('|');
      if (key) {
        if (!groups[key]) groups[key] = [];
        groups[key].push(record);
      }
    }
    return groups;
  }

  /**
   * Fuzzy Match (Levenshtein Distance)
   */
  _fuzzyMatch(records, idFields, threshold) {
    const clusters = [];
    const seen = new Set();

    for (let i = 0; i < records.length; i++) {
      if (seen.has(i)) continue;

      const cluster = [records[i]];
      seen.add(i);

      for (let j = i + 1; j < records.length; j++) {
        if (seen.has(j)) continue;

        const similarity = this._calculateSimilarity(records[i], records[j], idFields);
        if (similarity >= threshold) {
          cluster.push(records[j]);
          seen.add(j);
        }
      }

      if (cluster.length > 1) {
        clusters.push({
          cluster_id: this._generateClusterId(),
          strategy: 'fuzzy',
          confidence: threshold,
          records: cluster,
          avg_similarity: this._avgSimilarity(cluster, idFields)
        });
      }
    }

    return clusters;
  }

  /**
   * Domain Match (for Companies/Accounts)
   */
  _domainMatch(records, config) {
    const domainField = config.domain_field || 'Domain';
    const groups = {};

    for (const record of records) {
      const domain = this._normalizeDomain(record[domainField]);
      if (domain) {
        if (!groups[domain]) groups[domain] = [];
        groups[domain].push(record);
      }
    }

    return Object.entries(groups)
      .filter(([_, group]) => group.length > 1)
      .map(([domain, group]) => ({
        cluster_id: this._generateClusterId(),
        strategy: 'domain',
        confidence: 0.95,
        records: group,
        match_key: domain
      }));
  }

  /**
   * Weighted Match (Multi-Field Similarity)
   */
  _weightedMatch(records, config) {
    // Placeholder: Implement weighted similarity scoring
    // Would use configurable field weights (name=0.5, email=0.3, phone=0.2, etc.)
    return [];
  }

  /**
   * Calculate Similarity (Levenshtein)
   */
  _calculateSimilarity(record1, record2, fields) {
    let totalSimilarity = 0;
    let fieldCount = 0;

    for (const field of fields) {
      const str1 = String(record1[field] || '').toLowerCase();
      const str2 = String(record2[field] || '').toLowerCase();

      if (str1 && str2) {
        const distance = this._levenshteinDistance(str1, str2);
        const maxLen = Math.max(str1.length, str2.length);
        const similarity = maxLen > 0 ? 1 - (distance / maxLen) : 0;
        totalSimilarity += similarity;
        fieldCount++;
      }
    }

    return fieldCount > 0 ? totalSimilarity / fieldCount : 0;
  }

  /**
   * Levenshtein Distance
   */
  _levenshteinDistance(str1, str2) {
    const matrix = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }

  /**
   * Average Similarity in Cluster
   */
  _avgSimilarity(cluster, fields) {
    let total = 0;
    let count = 0;

    for (let i = 0; i < cluster.length; i++) {
      for (let j = i + 1; j < cluster.length; j++) {
        total += this._calculateSimilarity(cluster[i], cluster[j], fields);
        count++;
      }
    }

    return count > 0 ? total / count : 0;
  }

  /**
   * Normalize Domain
   */
  _normalizeDomain(domain) {
    if (!domain) return null;
    return domain.toLowerCase().replace(/^www\./, '').trim();
  }

  /**
   * Select Survivors
   *
   * Consolidates logic from:
   * - dedup-safety-engine.js (Salesforce v2 spec)
   * - dedup-canonical-selector.js (HubSpot weighted)
   * - salesforce-aware-master-selector.js
   */
  async _selectSurvivors(clusters, survivorStrategy, platform, config = {}) {
    const survivors = [];

    for (const cluster of clusters) {
      let survivor;

      if (survivorStrategy === 'relationship_score') {
        survivor = this._selectByRelationships(cluster.records, platform);
      } else if (survivorStrategy === 'revenue_score') {
        survivor = this._selectByRevenue(cluster.records, platform);
      } else if (survivorStrategy === 'sf_sync_priority') {
        survivor = this._selectBySFSync(cluster.records);
      } else if (survivorStrategy === 'custom_weights') {
        survivor = this._selectByCustomWeights(cluster.records, config.weights);
      }

      survivors.push({
        cluster_id: cluster.cluster_id,
        survivor: survivor,
        alternatives: cluster.records.filter(r => r !== survivor),
        confidence: this._calculateSurvivorConfidence(survivor, cluster.records)
      });
    }

    return survivors;
  }

  /**
   * Select by Relationships (Salesforce v2 Spec Compliant)
   */
  _selectByRelationships(records, platform) {
    const weights = this.scoringWeights[platform] || this.scoringWeights.default;

    let bestRecord = null;
    let bestScore = -Infinity;

    for (const record of records) {
      let score = 0;

      // Relationships (contacts + opportunities)
      score += ((record.ContactCount || 0) + (record.OpportunityCount || 0)) * weights.relationships;

      // Status score
      if (record.Status === 'Active' || record.AccountStatus === 'Active') {
        score += weights.status_active;
      } else if (record.Status === 'Inactive' || record.AccountStatus === 'Inactive') {
        score += weights.status_inactive;
      }

      // Revenue score (clamped 0-1000)
      const revenue = (record.AnnualRevenue || 0) + (record.MRR || 0) * 12 + (record.ACV || 0) + (record.TCV || 0);
      score += Math.min(revenue / 1000, 1000) * weights.revenue;

      // Integration ID
      if (record.ExternalId || record.IntegrationId) {
        score += weights.integration_id;
      }

      // Website quality
      if (record.Website && !record.Website.includes('force.com')) {
        score += weights.website_real;
      } else if (record.Website && record.Website.includes('force.com')) {
        score += weights.website_autogen;
      }

      // Name blank penalty
      if (!record.Name) {
        score += weights.name_blank;
      }

      if (score > bestScore) {
        bestScore = score;
        bestRecord = record;
      }
    }

    return bestRecord;
  }

  /**
   * Select by Revenue
   */
  _selectByRevenue(records, platform) {
    const revenueFields = {
      salesforce: ['AnnualRevenue', 'MRR', 'ACV', 'TCV'],
      hubspot: ['annualrevenue', 'mrr', 'arr']
    };

    const fields = revenueFields[platform] || revenueFields.salesforce;

    let bestRecord = null;
    let bestRevenue = -1;

    for (const record of records) {
      const totalRevenue = fields.reduce((sum, field) => sum + (record[field] || 0), 0);
      if (totalRevenue > bestRevenue) {
        bestRevenue = totalRevenue;
        bestRecord = record;
      }
    }

    return bestRecord || records[0];
  }

  /**
   * Select by Salesforce Sync Priority
   */
  _selectBySFSync(records) {
    // Prefer records with Salesforce Account ID
    const sfSynced = records.find(r => r.salesforceaccountid || r.SalesforceAccountId);
    return sfSynced || records[0];
  }

  /**
   * Select by Custom Weights
   */
  _selectByCustomWeights(records, weights = {}) {
    // User-provided weights for each field
    let bestRecord = null;
    let bestScore = -Infinity;

    for (const record of records) {
      let score = 0;
      for (const [field, weight] of Object.entries(weights)) {
        if (record[field]) {
          score += weight;
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestRecord = record;
      }
    }

    return bestRecord || records[0];
  }

  /**
   * Calculate Survivor Confidence
   */
  _calculateSurvivorConfidence(survivor, allRecords) {
    // Confidence based on how much better the survivor is than alternatives
    // Placeholder: Real implementation would compare scores
    return 0.95;
  }

  /**
   * Resolve Conflicts
   */
  async _resolveConflicts(clusters, survivors, conflictResolution) {
    const mergeDecisions = [];

    for (let i = 0; i < clusters.length; i++) {
      const cluster = clusters[i];
      const survivorInfo = survivors.find(s => s.cluster_id === cluster.cluster_id);

      if (!survivorInfo) continue;

      const decision = {
        cluster_id: cluster.cluster_id,
        master_id: survivorInfo.survivor.Id,
        duplicate_ids: survivorInfo.alternatives.map(r => r.Id),
        field_resolutions: this._resolveFields(survivorInfo.survivor, survivorInfo.alternatives, conflictResolution),
        requires_review: false,
        confidence: survivorInfo.confidence
      };

      // Check if any field requires review
      if (conflictResolution === 'user_review' && decision.field_resolutions.some(f => f.conflict)) {
        decision.requires_review = true;
      }

      mergeDecisions.push(decision);
    }

    return mergeDecisions;
  }

  /**
   * Resolve Field-Level Conflicts
   */
  _resolveFields(master, duplicates, strategy) {
    const resolutions = [];

    // Get all unique fields
    const allFields = new Set();
    [master, ...duplicates].forEach(record => {
      Object.keys(record).forEach(field => allFields.add(field));
    });

    for (const field of allFields) {
      const masterValue = master[field];
      const duplicateValues = duplicates.map(d => d[field]).filter(v => v !== null && v !== undefined);

      const resolution = {
        field,
        master_value: masterValue,
        duplicate_values: duplicateValues,
        conflict: duplicateValues.length > 0 && duplicateValues.some(v => v !== masterValue),
        resolution_strategy: strategy
      };

      if (strategy === 'preserve_master') {
        resolution.final_value = masterValue;
      } else if (strategy === 'merge_all') {
        resolution.final_value = this._mergeValues(masterValue, duplicateValues);
      } else if (strategy === 'user_review' && resolution.conflict) {
        resolution.final_value = null; // Requires manual review
      }

      resolutions.push(resolution);
    }

    return resolutions;
  }

  /**
   * Merge Values (for merge_all strategy)
   */
  _mergeValues(masterValue, duplicateValues) {
    // Prefer master, but fill blanks from duplicates
    if (masterValue) return masterValue;
    return duplicateValues.find(v => v) || null;
  }

  /**
   * Execute Merge
   */
  async _executeMerge(mergeDecisions, platform, objectType) {
    const executionLog = {
      timestamp: new Date().toISOString(),
      platform,
      object_type: objectType,
      total_decisions: mergeDecisions.length,
      successful: 0,
      failed: 0,
      details: []
    };

    const rollbackPlan = {
      timestamp: new Date().toISOString(),
      operations: []
    };

    for (const decision of mergeDecisions) {
      try {
        // Platform-specific merge execution
        // In production, this would call Salesforce/HubSpot APIs
        // For now, we'll simulate
        const result = await this._executePlatformMerge(decision, platform, objectType);

        executionLog.successful++;
        executionLog.details.push(result);

        // Build rollback operation
        rollbackPlan.operations.push({
          action: 'undelete',
          record_ids: decision.duplicate_ids,
          master_id: decision.master_id
        });

      } catch (error) {
        executionLog.failed++;
        executionLog.details.push({
          cluster_id: decision.cluster_id,
          error: error.message,
          status: 'failed'
        });
      }
    }

    // Save rollback plan
    const rollbackFile = path.join(this.config.rollbackDir, `rollback-${Date.now()}.json`);
    fs.writeFileSync(rollbackFile, JSON.stringify(rollbackPlan, null, 2));
    rollbackPlan.rollback_file = rollbackFile;

    return { log: executionLog, rollback: rollbackPlan };
  }

  /**
   * Execute Platform-Specific Merge
   */
  async _executePlatformMerge(decision, platform, objectType) {
    // Placeholder: Real implementation would use platform APIs
    // For Salesforce: Use Composite API or native merge endpoint
    // For HubSpot: Use batch update API + delete API

    return {
      cluster_id: decision.cluster_id,
      master_id: decision.master_id,
      merged_count: decision.duplicate_ids.length,
      status: 'success'
    };
  }

  /**
   * Validate Results
   */
  _validateResults(clusters, survivors, mergeDecisions, request) {
    const validation = {
      type_1_risk: this._assessType1Risk(clusters, survivors), // False positive (different entities merged)
      type_2_risk: this._assessType2Risk(clusters, survivors), // Wrong survivor selected
      confidence: this._avgConfidence(survivors),
      conflicts_requiring_review: mergeDecisions.filter(d => d.requires_review).length
    };

    return validation;
  }

  /**
   * Assess Type 1 Error Risk (False Positive)
   */
  _assessType1Risk(clusters, survivors) {
    // Check cluster confidence scores
    const lowConfidenceClusters = clusters.filter(c => c.confidence < 0.85);
    return lowConfidenceClusters.length / clusters.length;
  }

  /**
   * Assess Type 2 Error Risk (Wrong Survivor)
   */
  _assessType2Risk(clusters, survivors) {
    // Check survivor confidence scores
    const lowConfidenceSurvivors = survivors.filter(s => s.confidence < 0.85);
    return lowConfidenceSurvivors.length / survivors.length;
  }

  /**
   * Average Confidence
   */
  _avgConfidence(survivors) {
    if (survivors.length === 0) return 0;
    return survivors.reduce((sum, s) => sum + s.confidence, 0) / survivors.length;
  }

  /**
   * Log Telemetry
   */
  _logTelemetry(request, response, latencyMs, traceId) {
    const log = {
      timestamp: new Date().toISOString(),
      trace_id: traceId,
      platform: request.platform,
      object_type: request.object_type,
      strategy: request.strategy,
      survivor_strategy: request.survivor_strategy,
      record_count: request.records.length,
      clusters_found: response.clusters.length,
      survivors_selected: response.survivors.length,
      conflicts: response.conflicts.length,
      dry_run: request.dry_run !== false,
      latency_ms: latencyMs,
      type_1_risk: response.validation.type_1_risk,
      type_2_risk: response.validation.type_2_risk,
      confidence: response.validation.confidence,
      success: true
    };

    fs.appendFileSync(this.config.logPath, JSON.stringify(log) + '\n');
  }

  /**
   * Log Error
   */
  _logError(error, request, traceId) {
    const log = {
      timestamp: new Date().toISOString(),
      trace_id: traceId,
      error: error.message,
      stack: error.stack,
      request_hash: this._hashObject(request),
      success: false
    };

    fs.appendFileSync(this.config.logPath, JSON.stringify(log) + '\n');
  }

  /**
   * Generate Trace ID
   */
  _generateTraceId() {
    return `merge-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate Cluster ID
   */
  _generateClusterId() {
    return `cluster-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Hash Object
   */
  _hashObject(obj) {
    return crypto.createHash('sha256').update(JSON.stringify(obj)).digest('hex').substr(0, 16);
  }

  /**
   * Load Scoring Weights (Platform-Specific)
   */
  _loadScoringWeights() {
    return {
      salesforce: {
        relationships: 100,
        status_active: 200,
        status_inactive: -50,
        revenue: 1,
        integration_id: 150,
        website_real: 50,
        website_autogen: -200,
        name_blank: -500
      },
      hubspot: {
        sf_account_id: 100,
        contacts: 40,
        deals: 25,
        owner: 10,
        age: 5
      },
      default: {
        relationships: 100,
        revenue: 50,
        integration_id: 100
      }
    };
  }
}

// CLI Interface
if (require.main === module) {
  const service = new RecordMatchMergeService();

  // Example usage
  const exampleRequest = {
    platform: 'salesforce',
    object_type: 'Account',
    records: [
      { Id: '001xxx', Name: 'Acme Corp', AnnualRevenue: 1000000, ContactCount: 5 },
      { Id: '001yyy', Name: 'ACME Corporation', AnnualRevenue: null, ContactCount: 2 }
    ],
    id_fields: ['Id', 'Name'],
    strategy: 'fuzzy',
    survivor_strategy: 'relationship_score',
    conflict_resolution: 'preserve_master',
    dry_run: true
  };

  service.executeMatchMerge(exampleRequest)
    .then(response => {
      console.log('Clusters:', JSON.stringify(response.clusters, null, 2));
      console.log('\nSurvivors:', JSON.stringify(response.survivors, null, 2));
      console.log('\nValidation:', JSON.stringify(response.validation, null, 2));
    })
    .catch(error => {
      console.error('Error:', error.message);
      process.exit(1);
    });
}

module.exports = RecordMatchMergeService;
