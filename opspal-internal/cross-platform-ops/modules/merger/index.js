/**
 * Merger Module for Cross-Platform Operations
 * Advanced record merging with conflict resolution strategies
 */

const UnifiedRecord = require('../../core/data-models/unified-record');
const EventEmitter = require('events');
const crypto = require('crypto');

class MergerEngine extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = {
      conflictResolution: config.conflictResolution || 'intelligent',
      preserveHistory: config.preserveHistory !== false,
      validateBeforeMerge: config.validateBeforeMerge !== false,
      batchSize: config.batchSize || 50,
      rollbackEnabled: config.rollbackEnabled !== false,
      auditTrail: config.auditTrail !== false,
      fieldPriorities: config.fieldPriorities || {},
      mergeStrategies: config.mergeStrategies || [
        'master',
        'newer',
        'older',
        'completeness',
        'quality',
        'intelligent',
        'custom'
      ],
      ...config
    };

    this.mergeHistory = [];
    this.rollbackStack = [];
    this.conflictLog = [];
    this.mergeStats = {
      total: 0,
      successful: 0,
      failed: 0,
      conflicts: 0,
      rollbacks: 0
    };
  }

  /**
   * Merge multiple records into one master record
   */
  async mergeRecords(records, strategy = 'intelligent', options = {}) {
    if (!records || records.length < 2) {
      throw new Error('At least two records are required for merging');
    }

    const mergeId = this.generateMergeId();
    const startTime = Date.now();

    try {
      // Convert to unified format if needed
      const unifiedRecords = records.map(r =>
        r instanceof UnifiedRecord ? r : new UnifiedRecord(r)
      );

      // Validate records before merge
      if (this.config.validateBeforeMerge) {
        const validation = this.validateRecordsForMerge(unifiedRecords);
        if (!validation.valid) {
          throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
        }
      }

      // Determine master record
      const masterIndex = await this.selectMasterRecord(unifiedRecords, strategy, options);
      const master = unifiedRecords[masterIndex];
      const duplicates = unifiedRecords.filter((_, i) => i !== masterIndex);

      // Create merge plan
      const mergePlan = this.createMergePlan(master, duplicates, strategy, options);

      // Execute merge
      const mergedRecord = await this.executeMerge(mergePlan);

      // Create rollback point
      if (this.config.rollbackEnabled) {
        this.createRollbackPoint(mergeId, records, mergedRecord);
      }

      // Update statistics
      this.mergeStats.total++;
      this.mergeStats.successful++;

      // Record in history
      this.recordMergeHistory(mergeId, {
        strategy,
        recordCount: records.length,
        masterId: master.id,
        mergedIds: duplicates.map(d => d.id),
        conflicts: mergePlan.conflicts,
        resolution: mergePlan.resolution,
        executionTime: Date.now() - startTime
      });

      this.emit('mergeComplete', {
        mergeId,
        mergedRecord,
        stats: mergePlan.stats
      });

      return {
        success: true,
        mergeId,
        mergedRecord,
        plan: mergePlan,
        rollbackId: mergeId
      };

    } catch (error) {
      this.mergeStats.failed++;
      this.emit('mergeError', { mergeId, error });
      throw error;
    }
  }

  /**
   * Create a merge plan
   */
  createMergePlan(master, duplicates, strategy, options = {}) {
    const plan = {
      master: master.id,
      duplicates: duplicates.map(d => d.id),
      strategy,
      fields: {},
      conflicts: [],
      resolution: {},
      actions: [],
      stats: {
        fieldsAnalyzed: 0,
        conflictsFound: 0,
        fieldsUpdated: 0,
        dataRetained: 0,
        dataLost: 0
      }
    };

    // Get all fields from all records
    const allFields = this.getAllFields([master, ...duplicates]);
    plan.stats.fieldsAnalyzed = allFields.size;

    // Analyze each field
    allFields.forEach(field => {
      const fieldAnalysis = this.analyzeField(field, master, duplicates, strategy, options);

      plan.fields[field] = fieldAnalysis;

      if (fieldAnalysis.hasConflict) {
        plan.conflicts.push({
          field,
          values: fieldAnalysis.values,
          resolution: fieldAnalysis.resolution
        });
        plan.stats.conflictsFound++;
      }

      if (fieldAnalysis.action !== 'keep') {
        plan.stats.fieldsUpdated++;
      }

      plan.actions.push(fieldAnalysis.action);
    });

    // Apply strategy-specific logic
    switch (strategy) {
      case 'master':
        plan.resolution = this.applyMasterStrategy(plan, master, duplicates);
        break;
      case 'newer':
        plan.resolution = this.applyNewerStrategy(plan, master, duplicates);
        break;
      case 'older':
        plan.resolution = this.applyOlderStrategy(plan, master, duplicates);
        break;
      case 'completeness':
        plan.resolution = this.applyCompletenessStrategy(plan, master, duplicates);
        break;
      case 'quality':
        plan.resolution = this.applyQualityStrategy(plan, master, duplicates);
        break;
      case 'intelligent':
        plan.resolution = this.applyIntelligentStrategy(plan, master, duplicates);
        break;
      case 'custom':
        plan.resolution = this.applyCustomStrategy(plan, master, duplicates, options);
        break;
      default:
        plan.resolution = this.applyDefaultStrategy(plan, master, duplicates);
    }

    // Calculate data retention
    plan.stats.dataRetained = this.calculateDataRetention(plan, master, duplicates);
    plan.stats.dataLost = 100 - plan.stats.dataRetained;

    return plan;
  }

  /**
   * Execute the merge plan
   */
  async executeMerge(plan) {
    const mergedRecord = new UnifiedRecord();

    // Apply field decisions from plan
    Object.entries(plan.fields).forEach(([field, decision]) => {
      if (decision.value !== undefined && decision.value !== null) {
        this.setNestedValue(mergedRecord, field, decision.value);
      }
    });

    // Apply conflict resolutions
    plan.conflicts.forEach(conflict => {
      const resolution = conflict.resolution;
      if (resolution && resolution.value !== undefined) {
        this.setNestedValue(mergedRecord, conflict.field, resolution.value);
      }
    });

    // Preserve merge history
    if (this.config.preserveHistory) {
      mergedRecord.history = mergedRecord.history || [];
      mergedRecord.history.push({
        action: 'merge',
        timestamp: new Date().toISOString(),
        plan: {
          master: plan.master,
          merged: plan.duplicates,
          strategy: plan.strategy,
          conflicts: plan.conflicts.length
        }
      });

      mergedRecord.mergedFromIds = [plan.master, ...plan.duplicates];
    }

    // Validate merged record
    mergedRecord.validate();
    mergedRecord.calculateCompleteness();

    return mergedRecord;
  }

  /**
   * Select master record based on strategy
   */
  async selectMasterRecord(records, strategy, options = {}) {
    let scores = records.map((record, index) => ({
      index,
      score: 0,
      reasons: []
    }));

    switch (strategy) {
      case 'master':
        // First record is master
        return 0;

      case 'newer':
      case 'older':
        // Select based on modification date
        const dates = records.map(r => new Date(r.modifiedDate || r.createdDate));
        const targetDate = strategy === 'newer'
          ? Math.max(...dates)
          : Math.min(...dates);
        return dates.findIndex(d => d.getTime() === targetDate);

      case 'completeness':
        // Select most complete record
        records.forEach((record, index) => {
          record.calculateCompleteness();
          scores[index].score = record.dataQuality.completeness;
          scores[index].reasons.push(`Completeness: ${record.dataQuality.completeness}%`);
        });
        break;

      case 'quality':
        // Select highest quality record
        records.forEach((record, index) => {
          const qualityScore = this.calculateRecordQuality(record);
          scores[index].score = qualityScore;
          scores[index].reasons.push(`Quality: ${qualityScore}`);
        });
        break;

      case 'intelligent':
      default:
        // Combined scoring
        records.forEach((record, index) => {
          // Completeness (30%)
          record.calculateCompleteness();
          const completeness = record.dataQuality.completeness * 0.3;

          // Recency (25%)
          const age = this.calculateRecordAge(record);
          const recency = (100 - Math.min(age, 100)) * 0.25;

          // Validity (25%)
          const validity = this.calculateRecordValidity(record) * 0.25;

          // Source priority (20%)
          const sourcePriority = this.getSourcePriority(record.source) * 0.2;

          scores[index].score = completeness + recency + validity + sourcePriority;
          scores[index].reasons = [
            `Completeness: ${completeness.toFixed(1)}`,
            `Recency: ${recency.toFixed(1)}`,
            `Validity: ${validity.toFixed(1)}`,
            `Source: ${sourcePriority.toFixed(1)}`
          ];
        });
        break;
    }

    // Find highest scoring record
    const maxScore = Math.max(...scores.map(s => s.score));
    const winner = scores.find(s => s.score === maxScore);

    this.emit('masterSelected', {
      index: winner.index,
      score: winner.score,
      reasons: winner.reasons
    });

    return winner.index;
  }

  /**
   * Analyze field for merging
   */
  analyzeField(field, master, duplicates, strategy, options) {
    const analysis = {
      field,
      masterValue: this.getNestedValue(master, field),
      values: [],
      hasConflict: false,
      resolution: null,
      action: 'keep',
      value: null,
      confidence: 1.0
    };

    // Collect all values for this field
    const allValues = [
      { source: 'master', value: analysis.masterValue, record: master }
    ];

    duplicates.forEach(dup => {
      const value = this.getNestedValue(dup, field);
      allValues.push({
        source: dup.id || 'duplicate',
        value,
        record: dup
      });
      analysis.values.push(value);
    });

    // Check for conflicts
    const uniqueValues = new Set(allValues.map(v => JSON.stringify(v.value)));
    if (uniqueValues.size > 1) {
      analysis.hasConflict = true;
      analysis.resolution = this.resolveFieldConflict(field, allValues, strategy, options);
      analysis.value = analysis.resolution.value;
      analysis.action = 'update';
      analysis.confidence = analysis.resolution.confidence;
    } else {
      // No conflict - use the common value
      analysis.value = analysis.masterValue || analysis.values.find(v => v !== null);
      analysis.action = analysis.value !== analysis.masterValue ? 'update' : 'keep';
    }

    return analysis;
  }

  /**
   * Resolve field conflict
   */
  resolveFieldConflict(field, values, strategy, options) {
    const resolution = {
      field,
      strategy,
      originalValues: values,
      value: null,
      source: null,
      reason: '',
      confidence: 0
    };

    // Filter out null/undefined values
    const validValues = values.filter(v => v.value !== null && v.value !== undefined);

    if (validValues.length === 0) {
      resolution.value = null;
      resolution.reason = 'All values are null';
      return resolution;
    }

    // Apply field-specific priority if configured
    if (this.config.fieldPriorities[field]) {
      const priority = this.config.fieldPriorities[field];
      if (priority.source) {
        const priorityValue = validValues.find(v => v.source === priority.source);
        if (priorityValue) {
          resolution.value = priorityValue.value;
          resolution.source = priorityValue.source;
          resolution.reason = `Field priority: ${priority.source}`;
          resolution.confidence = 0.9;
          return resolution;
        }
      }
    }

    // Apply strategy-specific resolution
    switch (strategy) {
      case 'master':
        resolution.value = values[0].value; // Master is always first
        resolution.source = 'master';
        resolution.reason = 'Master strategy - keeping master value';
        resolution.confidence = 1.0;
        break;

      case 'newer':
      case 'older':
        const sorted = validValues.sort((a, b) => {
          const dateA = new Date(a.record.modifiedDate || a.record.createdDate);
          const dateB = new Date(b.record.modifiedDate || b.record.createdDate);
          return strategy === 'newer' ? dateB - dateA : dateA - dateB;
        });
        resolution.value = sorted[0].value;
        resolution.source = sorted[0].source;
        resolution.reason = `${strategy === 'newer' ? 'Newest' : 'Oldest'} value selected`;
        resolution.confidence = 0.8;
        break;

      case 'completeness':
        // Choose value from most complete record
        const mostComplete = validValues.sort((a, b) => {
          a.record.calculateCompleteness();
          b.record.calculateCompleteness();
          return b.record.dataQuality.completeness - a.record.dataQuality.completeness;
        })[0];
        resolution.value = mostComplete.value;
        resolution.source = mostComplete.source;
        resolution.reason = 'Value from most complete record';
        resolution.confidence = 0.85;
        break;

      case 'quality':
        // Choose based on value quality
        const bestQuality = this.selectBestQualityValue(field, validValues);
        resolution.value = bestQuality.value;
        resolution.source = bestQuality.source;
        resolution.reason = bestQuality.reason;
        resolution.confidence = bestQuality.confidence;
        break;

      case 'intelligent':
      default:
        // Intelligent resolution based on field type and content
        const intelligent = this.intelligentFieldResolution(field, validValues);
        resolution.value = intelligent.value;
        resolution.source = intelligent.source;
        resolution.reason = intelligent.reason;
        resolution.confidence = intelligent.confidence;
        break;
    }

    // Record conflict for audit
    if (this.config.auditTrail) {
      this.conflictLog.push({
        timestamp: new Date().toISOString(),
        field,
        values: values.map(v => v.value),
        resolution: resolution.value,
        strategy,
        reason: resolution.reason
      });
    }

    return resolution;
  }

  /**
   * Intelligent field resolution
   */
  intelligentFieldResolution(field, values) {
    const fieldType = this.detectFieldType(field, values);

    switch (fieldType) {
      case 'email':
        return this.resolveEmailConflict(values);
      case 'phone':
        return this.resolvePhoneConflict(values);
      case 'url':
        return this.resolveUrlConflict(values);
      case 'date':
        return this.resolveDateConflict(values);
      case 'number':
        return this.resolveNumberConflict(values);
      case 'text':
        return this.resolveTextConflict(field, values);
      default:
        return this.defaultResolution(values);
    }
  }

  /**
   * Resolve email conflicts
   */
  resolveEmailConflict(values) {
    // Prefer verified/primary emails
    const emailScores = values.map(v => ({
      ...v,
      score: this.scoreEmail(v.value)
    }));

    const best = emailScores.sort((a, b) => b.score - a.score)[0];

    return {
      value: best.value,
      source: best.source,
      reason: 'Selected most reliable email',
      confidence: best.score / 100
    };
  }

  /**
   * Score email quality
   */
  scoreEmail(email) {
    let score = 0;

    // Valid format
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) score += 50;

    // Business domain (not free email)
    const freeEmailDomains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com'];
    const domain = email.split('@')[1];
    if (domain && !freeEmailDomains.includes(domain.toLowerCase())) score += 30;

    // No numbers in local part (often indicates auto-generated)
    const localPart = email.split('@')[0];
    if (!/\d/.test(localPart)) score += 20;

    return score;
  }

  /**
   * Resolve phone conflicts
   */
  resolvePhoneConflict(values) {
    // Prefer mobile phones over landlines, longer numbers (international)
    const phoneScores = values.map(v => ({
      ...v,
      score: this.scorePhone(v.value)
    }));

    const best = phoneScores.sort((a, b) => b.score - a.score)[0];

    return {
      value: best.value,
      source: best.source,
      reason: 'Selected most complete phone number',
      confidence: best.score / 100
    };
  }

  /**
   * Score phone quality
   */
  scorePhone(phone) {
    let score = 0;
    const digits = phone.replace(/\D/g, '');

    // Valid length
    if (digits.length >= 10) score += 40;
    if (digits.length >= 11) score += 10; // International

    // Formatted (not just digits)
    if (phone !== digits) score += 20;

    // Mobile patterns (simplified)
    if (digits.length >= 10) {
      const areaCode = digits.substring(0, 3);
      const mobileAreaCodes = ['415', '650', '408', '510']; // Example mobile area codes
      if (mobileAreaCodes.includes(areaCode)) score += 30;
    }

    return score;
  }

  /**
   * Resolve URL conflicts
   */
  resolveUrlConflict(values) {
    // Prefer HTTPS, www, shorter URLs
    const urlScores = values.map(v => ({
      ...v,
      score: this.scoreUrl(v.value)
    }));

    const best = urlScores.sort((a, b) => b.score - a.score)[0];

    return {
      value: best.value,
      source: best.source,
      reason: 'Selected most reliable URL',
      confidence: best.score / 100
    };
  }

  /**
   * Score URL quality
   */
  scoreUrl(url) {
    let score = 0;

    // HTTPS
    if (url.startsWith('https://')) score += 40;

    // Valid URL
    try {
      new URL(url);
      score += 30;
    } catch {
      return 0;
    }

    // Has www
    if (url.includes('www.')) score += 10;

    // Not a redirect/tracking URL
    if (!url.includes('bit.ly') && !url.includes('tinyurl')) score += 20;

    return score;
  }

  /**
   * Resolve date conflicts
   */
  resolveDateConflict(values) {
    // For dates, usually prefer the most recent unless field indicates otherwise
    const dates = values.map(v => ({
      ...v,
      date: new Date(v.value),
      valid: !isNaN(new Date(v.value))
    })).filter(v => v.valid);

    if (dates.length === 0) {
      return this.defaultResolution(values);
    }

    const mostRecent = dates.sort((a, b) => b.date - a.date)[0];

    return {
      value: mostRecent.value,
      source: mostRecent.source,
      reason: 'Selected most recent date',
      confidence: 0.8
    };
  }

  /**
   * Resolve number conflicts
   */
  resolveNumberConflict(values) {
    const numbers = values.map(v => ({
      ...v,
      num: parseFloat(v.value),
      valid: !isNaN(parseFloat(v.value))
    })).filter(v => v.valid);

    if (numbers.length === 0) {
      return this.defaultResolution(values);
    }

    // For numbers, take the average or median
    const avg = numbers.reduce((sum, v) => sum + v.num, 0) / numbers.length;
    const median = this.calculateMedian(numbers.map(v => v.num));

    // Use median to avoid outlier influence
    return {
      value: median,
      source: 'calculated',
      reason: `Median of ${numbers.length} values`,
      confidence: 0.7
    };
  }

  /**
   * Resolve text conflicts
   */
  resolveTextConflict(field, values) {
    // For text, prefer longer, more detailed values
    const textScores = values.map(v => ({
      ...v,
      score: this.scoreText(v.value)
    }));

    const best = textScores.sort((a, b) => b.score - a.score)[0];

    return {
      value: best.value,
      source: best.source,
      reason: 'Selected most complete text',
      confidence: best.score / 100
    };
  }

  /**
   * Score text quality
   */
  scoreText(text) {
    if (!text) return 0;

    let score = 0;
    const str = text.toString();

    // Length (up to 40 points)
    score += Math.min(str.length / 5, 40);

    // Has punctuation (suggests complete sentences)
    if (/[.!?]/.test(str)) score += 20;

    // Capitalization (suggests proper formatting)
    if (/^[A-Z]/.test(str)) score += 10;

    // No excessive caps (suggests quality)
    const upperRatio = (str.match(/[A-Z]/g) || []).length / str.length;
    if (upperRatio < 0.3) score += 20;

    // Word count (suggests detail)
    const wordCount = str.split(/\s+/).length;
    score += Math.min(wordCount, 10);

    return score;
  }

  /**
   * Default resolution when type-specific logic doesn't apply
   */
  defaultResolution(values) {
    // Default: use first non-null value
    const nonNull = values.find(v => v.value !== null && v.value !== undefined);

    return {
      value: nonNull ? nonNull.value : null,
      source: nonNull ? nonNull.source : null,
      reason: 'First non-null value',
      confidence: 0.5
    };
  }

  /**
   * Apply master strategy
   */
  applyMasterStrategy(plan, master, duplicates) {
    return {
      strategy: 'master',
      description: 'Master record takes precedence for all fields',
      fieldDecisions: Object.keys(plan.fields).map(field => ({
        field,
        source: 'master',
        action: 'keep'
      }))
    };
  }

  /**
   * Apply newer strategy
   */
  applyNewerStrategy(plan, master, duplicates) {
    const allRecords = [master, ...duplicates];
    const newest = allRecords.sort((a, b) => {
      const dateA = new Date(a.modifiedDate || a.createdDate);
      const dateB = new Date(b.modifiedDate || b.createdDate);
      return dateB - dateA;
    })[0];

    return {
      strategy: 'newer',
      description: 'Newest record values take precedence',
      sourceRecord: newest.id,
      fieldDecisions: Object.keys(plan.fields).map(field => ({
        field,
        source: newest.id,
        action: 'update'
      }))
    };
  }

  /**
   * Apply older strategy
   */
  applyOlderStrategy(plan, master, duplicates) {
    const allRecords = [master, ...duplicates];
    const oldest = allRecords.sort((a, b) => {
      const dateA = new Date(a.modifiedDate || a.createdDate);
      const dateB = new Date(b.modifiedDate || b.createdDate);
      return dateA - dateB;
    })[0];

    return {
      strategy: 'older',
      description: 'Oldest record values take precedence',
      sourceRecord: oldest.id,
      fieldDecisions: Object.keys(plan.fields).map(field => ({
        field,
        source: oldest.id,
        action: 'update'
      }))
    };
  }

  /**
   * Apply completeness strategy
   */
  applyCompletenessStrategy(plan, master, duplicates) {
    const fieldDecisions = [];

    Object.keys(plan.fields).forEach(field => {
      const allRecords = [master, ...duplicates];
      let bestValue = null;
      let bestSource = null;
      let bestCompleteness = 0;

      allRecords.forEach(record => {
        const value = this.getNestedValue(record, field);
        if (value !== null && value !== undefined) {
          record.calculateCompleteness();
          if (record.dataQuality.completeness > bestCompleteness) {
            bestCompleteness = record.dataQuality.completeness;
            bestValue = value;
            bestSource = record.id;
          }
        }
      });

      fieldDecisions.push({
        field,
        source: bestSource,
        value: bestValue,
        action: bestValue !== this.getNestedValue(master, field) ? 'update' : 'keep'
      });
    });

    return {
      strategy: 'completeness',
      description: 'Values from most complete records take precedence',
      fieldDecisions
    };
  }

  /**
   * Apply quality strategy
   */
  applyQualityStrategy(plan, master, duplicates) {
    const fieldDecisions = [];

    Object.entries(plan.fields).forEach(([field, analysis]) => {
      if (analysis.hasConflict && analysis.resolution) {
        fieldDecisions.push({
          field,
          source: analysis.resolution.source,
          value: analysis.resolution.value,
          action: 'update',
          confidence: analysis.resolution.confidence
        });
      } else {
        fieldDecisions.push({
          field,
          source: 'master',
          value: analysis.masterValue,
          action: 'keep'
        });
      }
    });

    return {
      strategy: 'quality',
      description: 'Highest quality values selected per field',
      fieldDecisions
    };
  }

  /**
   * Apply intelligent strategy
   */
  applyIntelligentStrategy(plan, master, duplicates) {
    // Already handled in field analysis
    return {
      strategy: 'intelligent',
      description: 'Intelligent selection based on field type and content analysis',
      fieldDecisions: Object.entries(plan.fields).map(([field, analysis]) => ({
        field,
        source: analysis.resolution ? analysis.resolution.source : 'master',
        value: analysis.value,
        action: analysis.action,
        reason: analysis.resolution ? analysis.resolution.reason : 'No conflict'
      }))
    };
  }

  /**
   * Apply custom strategy
   */
  applyCustomStrategy(plan, master, duplicates, options) {
    if (!options.customLogic) {
      return this.applyDefaultStrategy(plan, master, duplicates);
    }

    const fieldDecisions = options.customLogic(plan, master, duplicates);

    return {
      strategy: 'custom',
      description: 'Custom merge logic applied',
      fieldDecisions
    };
  }

  /**
   * Apply default strategy
   */
  applyDefaultStrategy(plan, master, duplicates) {
    return this.applyIntelligentStrategy(plan, master, duplicates);
  }

  /**
   * Select best quality value
   */
  selectBestQualityValue(field, values) {
    const fieldType = this.detectFieldType(field, values);

    switch (fieldType) {
      case 'email':
        return this.resolveEmailConflict(values);
      case 'phone':
        return this.resolvePhoneConflict(values);
      case 'url':
        return this.resolveUrlConflict(values);
      default:
        // For other types, use completeness
        const scores = values.map(v => ({
          ...v,
          score: this.scoreValue(v.value)
        }));

        const best = scores.sort((a, b) => b.score - a.score)[0];

        return {
          value: best.value,
          source: best.source,
          reason: 'Highest quality value',
          confidence: best.score / 100
        };
    }
  }

  /**
   * Score generic value quality
   */
  scoreValue(value) {
    if (value === null || value === undefined) return 0;

    let score = 50; // Base score for non-null

    const str = value.toString();

    // Length indicates completeness
    if (str.length > 0) score += Math.min(str.length, 30);

    // Not a placeholder
    const placeholders = ['n/a', 'na', 'none', 'null', 'undefined', 'unknown', 'tbd'];
    if (!placeholders.includes(str.toLowerCase())) score += 20;

    return score;
  }

  /**
   * Calculate data retention
   */
  calculateDataRetention(plan, master, duplicates) {
    const allRecords = [master, ...duplicates];
    let totalFields = 0;
    let retainedFields = 0;

    allRecords.forEach(record => {
      const fields = this.getAllFieldsFromRecord(record);
      totalFields += fields.size;
    });

    Object.entries(plan.fields).forEach(([field, decision]) => {
      if (decision.value !== null && decision.value !== undefined) {
        retainedFields++;
      }
    });

    return totalFields > 0 ? (retainedFields / totalFields) * 100 : 100;
  }

  /**
   * Rollback a merge operation
   */
  async rollbackMerge(mergeId) {
    const rollbackPoint = this.rollbackStack.find(r => r.mergeId === mergeId);

    if (!rollbackPoint) {
      throw new Error(`No rollback point found for merge ${mergeId}`);
    }

    try {
      // Restore original records
      const restored = rollbackPoint.originalRecords;

      // Remove from rollback stack
      this.rollbackStack = this.rollbackStack.filter(r => r.mergeId !== mergeId);

      // Update stats
      this.mergeStats.rollbacks++;

      // Record in history
      this.recordMergeHistory(`rollback-${mergeId}`, {
        action: 'rollback',
        originalMergeId: mergeId,
        restoredCount: restored.length,
        timestamp: new Date().toISOString()
      });

      this.emit('rollbackComplete', { mergeId, restored });

      return {
        success: true,
        mergeId,
        restoredRecords: restored
      };

    } catch (error) {
      this.emit('rollbackError', { mergeId, error });
      throw error;
    }
  }

  /**
   * Batch merge operations
   */
  async batchMerge(recordGroups, strategy = 'intelligent', options = {}) {
    const results = {
      successful: [],
      failed: [],
      totalGroups: recordGroups.length,
      totalRecords: 0,
      executionTime: 0
    };

    const startTime = Date.now();

    for (const group of recordGroups) {
      results.totalRecords += group.length;

      try {
        const mergeResult = await this.mergeRecords(group, strategy, options);
        results.successful.push(mergeResult);
      } catch (error) {
        results.failed.push({
          group: group.map(r => r.id || 'unknown'),
          error: error.message
        });
      }
    }

    results.executionTime = Date.now() - startTime;

    this.emit('batchMergeComplete', results);

    return results;
  }

  // Helper methods

  validateRecordsForMerge(records) {
    const errors = [];

    // Check if records are of same type
    const types = new Set(records.map(r => r.type));
    if (types.size > 1) {
      errors.push('Records must be of the same type');
    }

    // Check if records have IDs
    const missingIds = records.filter(r => !r.id && !r.sourceId);
    if (missingIds.length > 0) {
      errors.push(`${missingIds.length} records missing identifiers`);
    }

    // Check for system records that shouldn't be merged
    const systemRecords = records.filter(r =>
      r.customFields && r.customFields.system_record === true
    );
    if (systemRecords.length > 0) {
      errors.push('System records cannot be merged');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  generateMergeId() {
    return crypto.randomBytes(16).toString('hex');
  }

  getAllFields(records) {
    const fields = new Set();

    records.forEach(record => {
      const recordFields = this.getAllFieldsFromRecord(record);
      recordFields.forEach(field => fields.add(field));
    });

    return fields;
  }

  getAllFieldsFromRecord(record, prefix = '') {
    const fields = new Set();

    Object.entries(record).forEach(([key, value]) => {
      if (key === 'history' || key === 'mergedFromIds') return;

      const fieldName = prefix ? `${prefix}.${key}` : key;

      if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
        // Nested object - recurse
        const nestedFields = this.getAllFieldsFromRecord(value, fieldName);
        nestedFields.forEach(field => fields.add(field));
      } else {
        fields.add(fieldName);
      }
    });

    return fields;
  }

  getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  setNestedValue(obj, path, value) {
    const keys = path.split('.');
    const lastKey = keys.pop();
    const target = keys.reduce((current, key) => {
      if (!current[key]) current[key] = {};
      return current[key];
    }, obj);
    target[lastKey] = value;
  }

  detectFieldType(field, values) {
    const fieldName = field.toLowerCase();

    // Check field name patterns
    if (fieldName.includes('email')) return 'email';
    if (fieldName.includes('phone') || fieldName.includes('mobile')) return 'phone';
    if (fieldName.includes('url') || fieldName.includes('website') || fieldName.includes('link')) return 'url';
    if (fieldName.includes('date') || fieldName.includes('time')) return 'date';

    // Check value patterns
    const sample = values.find(v => v.value)?.value;
    if (!sample) return 'unknown';

    if (typeof sample === 'number') return 'number';
    if (sample instanceof Date) return 'date';

    const str = sample.toString();
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str)) return 'email';
    if (/^[\d\s\-\+\(\)\.]+$/.test(str) && str.replace(/\D/g, '').length >= 7) return 'phone';
    if (/^https?:\/\//.test(str)) return 'url';

    return 'text';
  }

  calculateRecordQuality(record) {
    let score = 0;

    // Completeness (40%)
    record.calculateCompleteness();
    score += record.dataQuality.completeness * 0.4;

    // Validity (30%)
    const validityScore = record.validate() ? 100 : 50;
    score += validityScore * 0.3;

    // Age (20%)
    const age = this.calculateRecordAge(record);
    const ageScore = Math.max(0, 100 - age);
    score += ageScore * 0.2;

    // Source reliability (10%)
    const sourceScore = this.getSourceReliability(record.source);
    score += sourceScore * 0.1;

    return score;
  }

  calculateRecordAge(record) {
    const date = new Date(record.modifiedDate || record.createdDate);
    const now = new Date();
    const days = Math.floor((now - date) / (1000 * 60 * 60 * 24));
    return Math.min(days, 365); // Cap at 365 days
  }

  calculateRecordValidity(record) {
    const errors = record.dataQuality?.validationErrors || [];
    return Math.max(0, 100 - (errors.length * 10));
  }

  getSourcePriority(source) {
    const priorities = {
      'salesforce': 90,
      'hubspot': 85,
      'manual': 70,
      'import': 60,
      'api': 75,
      'unknown': 50
    };

    return priorities[source?.toLowerCase()] || 50;
  }

  getSourceReliability(source) {
    // Same as priority for now
    return this.getSourcePriority(source);
  }

  calculateMedian(values) {
    const sorted = values.slice().sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  createRollbackPoint(mergeId, originalRecords, mergedRecord) {
    this.rollbackStack.push({
      mergeId,
      timestamp: new Date().toISOString(),
      originalRecords: originalRecords.map(r => JSON.parse(JSON.stringify(r))),
      mergedRecord: JSON.parse(JSON.stringify(mergedRecord))
    });

    // Limit rollback stack size
    if (this.rollbackStack.length > 100) {
      this.rollbackStack.shift();
    }
  }

  recordMergeHistory(mergeId, details) {
    this.mergeHistory.push({
      mergeId,
      timestamp: new Date().toISOString(),
      ...details
    });

    // Limit history size
    if (this.mergeHistory.length > 1000) {
      this.mergeHistory.shift();
    }
  }

  /**
   * Get merge statistics
   */
  getStatistics() {
    return {
      ...this.mergeStats,
      recentMerges: this.mergeHistory.slice(-10),
      conflictSummary: this.summarizeConflicts(),
      rollbackAvailable: this.rollbackStack.length
    };
  }

  /**
   * Summarize conflicts
   */
  summarizeConflicts() {
    const summary = {
      total: this.conflictLog.length,
      byField: {},
      byStrategy: {},
      resolutionConfidence: []
    };

    this.conflictLog.forEach(conflict => {
      // By field
      summary.byField[conflict.field] = (summary.byField[conflict.field] || 0) + 1;

      // By strategy
      summary.byStrategy[conflict.strategy] = (summary.byStrategy[conflict.strategy] || 0) + 1;
    });

    return summary;
  }
}

module.exports = MergerEngine;