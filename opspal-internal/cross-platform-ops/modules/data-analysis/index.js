/**
 * Data Analysis Module for Cross-Platform Operations
 * Provides comprehensive data quality metrics, insights, and anomaly detection
 */

const UnifiedRecord = require('../../core/data-models/unified-record');
const EventEmitter = require('events');

class DataAnalysisEngine extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = {
      sampleSize: config.sampleSize || 1000,
      anomalyThreshold: config.anomalyThreshold || 2.5, // Standard deviations
      qualityWeights: config.qualityWeights || {
        completeness: 0.3,
        validity: 0.25,
        consistency: 0.2,
        uniqueness: 0.15,
        timeliness: 0.1
      },
      benchmarks: config.benchmarks || {
        completeness: 85,
        validity: 95,
        consistency: 90,
        uniqueness: 98,
        timeliness: 80
      },
      ...config
    };

    this.analysisCache = new Map();
    this.patterns = new Map();
    this.anomalies = [];
  }

  /**
   * Comprehensive data analysis
   */
  async analyzeDataset(records, options = {}) {
    const startTime = Date.now();

    const analysis = {
      timestamp: new Date().toISOString(),
      recordCount: records.length,
      metrics: {},
      insights: [],
      anomalies: [],
      recommendations: [],
      executionTime: 0
    };

    // Convert to unified format if needed
    const unifiedRecords = records.map(r =>
      r instanceof UnifiedRecord ? r : new UnifiedRecord(r)
    );

    // Core metrics
    analysis.metrics.completeness = this.analyzeCompleteness(unifiedRecords);
    analysis.metrics.validity = this.analyzeValidity(unifiedRecords);
    analysis.metrics.consistency = this.analyzeConsistency(unifiedRecords);
    analysis.metrics.uniqueness = this.analyzeUniqueness(unifiedRecords);
    analysis.metrics.timeliness = this.analyzeTimeliness(unifiedRecords);

    // Advanced analytics
    analysis.metrics.patterns = this.detectPatterns(unifiedRecords);
    analysis.metrics.anomalies = this.detectAnomalies(unifiedRecords);
    analysis.metrics.correlations = this.analyzeCorrelations(unifiedRecords);
    analysis.metrics.distribution = this.analyzeDistribution(unifiedRecords);

    // Generate insights
    analysis.insights = this.generateInsights(analysis.metrics);

    // Generate recommendations
    analysis.recommendations = this.generateRecommendations(analysis.metrics);

    // Calculate overall quality score
    analysis.qualityScore = this.calculateQualityScore(analysis.metrics);

    // Benchmark comparison
    analysis.benchmarkComparison = this.compareToBenchmarks(analysis.metrics);

    analysis.executionTime = Date.now() - startTime;

    this.emit('analysisComplete', analysis);
    return analysis;
  }

  /**
   * Analyze data completeness
   */
  analyzeCompleteness(records) {
    const fieldCompleteness = new Map();
    const requiredFields = ['name', 'email', 'phone', 'address'];
    const importantFields = ['description', 'website', 'ownerId', 'status'];

    // Track completeness per field
    const allFields = new Set();
    records.forEach(record => {
      Object.keys(record).forEach(field => allFields.add(field));
    });

    allFields.forEach(field => {
      let filledCount = 0;
      let totalCount = records.length;

      records.forEach(record => {
        const value = record[field];
        if (value !== null && value !== undefined && value !== '') {
          filledCount++;
        }
      });

      fieldCompleteness.set(field, {
        filled: filledCount,
        total: totalCount,
        percentage: (filledCount / totalCount) * 100
      });
    });

    // Calculate record-level completeness
    const recordCompleteness = records.map(record => {
      record.calculateCompleteness();
      return record.dataQuality.completeness;
    });

    // Statistical analysis
    const stats = this.calculateStatistics(recordCompleteness);

    return {
      overall: stats.mean,
      median: stats.median,
      distribution: stats.distribution,
      fieldLevel: Object.fromEntries(fieldCompleteness),
      requiredFieldsCompleteness: this.calculateRequiredFieldsCompleteness(records, requiredFields),
      importantFieldsCompleteness: this.calculateRequiredFieldsCompleteness(records, importantFields),
      recordsBelow50Percent: recordCompleteness.filter(c => c < 50).length,
      recordsAbove80Percent: recordCompleteness.filter(c => c > 80).length
    };
  }

  /**
   * Analyze data validity
   */
  analyzeValidity(records) {
    const validityIssues = {
      invalidEmails: [],
      invalidPhones: [],
      invalidUrls: [],
      invalidDates: [],
      outOfRangeValues: [],
      formatViolations: []
    };

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const phoneRegex = /^[\d\s\-\+\(\)\.]+$/;
    const urlRegex = /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/;

    records.forEach((record, index) => {
      // Validate email
      if (record.email && !emailRegex.test(record.email)) {
        validityIssues.invalidEmails.push({
          recordId: record.id || index,
          value: record.email
        });
      }

      // Validate phone
      if (record.phone && !phoneRegex.test(record.phone)) {
        validityIssues.invalidPhones.push({
          recordId: record.id || index,
          value: record.phone
        });
      }

      // Validate website
      if (record.website && !urlRegex.test(record.website)) {
        validityIssues.invalidUrls.push({
          recordId: record.id || index,
          value: record.website
        });
      }

      // Validate dates
      if (record.createdDate && !this.isValidDate(record.createdDate)) {
        validityIssues.invalidDates.push({
          recordId: record.id || index,
          field: 'createdDate',
          value: record.createdDate
        });
      }

      // Check for suspicious values
      if (record.name && (record.name.length < 2 || record.name.length > 100)) {
        validityIssues.outOfRangeValues.push({
          recordId: record.id || index,
          field: 'name',
          value: record.name,
          issue: 'Length out of expected range'
        });
      }
    });

    const totalIssues = Object.values(validityIssues).reduce((sum, arr) => sum + arr.length, 0);
    const validityScore = Math.max(0, 100 - (totalIssues / records.length * 100));

    return {
      score: validityScore,
      totalIssues,
      issues: validityIssues,
      affectedRecords: this.getUniqueRecordIds(validityIssues),
      issueDistribution: Object.entries(validityIssues).map(([type, issues]) => ({
        type,
        count: issues.length,
        percentage: (issues.length / records.length * 100).toFixed(2)
      }))
    };
  }

  /**
   * Analyze data consistency
   */
  analyzeConsistency(records) {
    const inconsistencies = {
      namingPatterns: [],
      dateFormats: [],
      phoneFormats: [],
      caseInconsistencies: [],
      abbreviationInconsistencies: []
    };

    // Group records by similar fields
    const nameFormats = new Map();
    const phoneFormats = new Map();
    const dateFormats = new Map();

    records.forEach((record, index) => {
      // Check name format consistency
      if (record.name) {
        const format = this.detectNameFormat(record.name);
        const count = nameFormats.get(format) || 0;
        nameFormats.set(format, count + 1);
      }

      // Check phone format consistency
      if (record.phone) {
        const format = this.detectPhoneFormat(record.phone);
        const count = phoneFormats.get(format) || 0;
        phoneFormats.set(format, count + 1);
      }

      // Check date format consistency
      if (record.createdDate) {
        const format = this.detectDateFormat(record.createdDate);
        const count = dateFormats.get(format) || 0;
        dateFormats.set(format, count + 1);
      }
    });

    // Find dominant patterns
    const dominantNameFormat = this.findDominantPattern(nameFormats);
    const dominantPhoneFormat = this.findDominantPattern(phoneFormats);
    const dominantDateFormat = this.findDominantPattern(dateFormats);

    // Identify inconsistencies
    records.forEach((record, index) => {
      if (record.name) {
        const format = this.detectNameFormat(record.name);
        if (format !== dominantNameFormat && dominantNameFormat) {
          inconsistencies.namingPatterns.push({
            recordId: record.id || index,
            value: record.name,
            currentFormat: format,
            expectedFormat: dominantNameFormat
          });
        }
      }

      if (record.phone) {
        const format = this.detectPhoneFormat(record.phone);
        if (format !== dominantPhoneFormat && dominantPhoneFormat) {
          inconsistencies.phoneFormats.push({
            recordId: record.id || index,
            value: record.phone,
            currentFormat: format,
            expectedFormat: dominantPhoneFormat
          });
        }
      }
    });

    // Check for case inconsistencies
    const fieldCasePatterns = this.analyzeFieldCasePatterns(records);
    inconsistencies.caseInconsistencies = fieldCasePatterns.inconsistencies;

    // Check for abbreviation inconsistencies
    inconsistencies.abbreviationInconsistencies = this.detectAbbreviationInconsistencies(records);

    const totalInconsistencies = Object.values(inconsistencies).reduce((sum, arr) => sum + arr.length, 0);
    const consistencyScore = Math.max(0, 100 - (totalInconsistencies / records.length * 100));

    return {
      score: consistencyScore,
      totalInconsistencies,
      patterns: {
        name: Object.fromEntries(nameFormats),
        phone: Object.fromEntries(phoneFormats),
        date: Object.fromEntries(dateFormats)
      },
      dominantPatterns: {
        name: dominantNameFormat,
        phone: dominantPhoneFormat,
        date: dominantDateFormat
      },
      inconsistencies,
      recommendations: this.generateConsistencyRecommendations(inconsistencies)
    };
  }

  /**
   * Analyze data uniqueness
   */
  analyzeUniqueness(records) {
    const duplicates = {
      exactDuplicates: [],
      emailDuplicates: new Map(),
      phoneDuplicates: new Map(),
      nameDuplicates: new Map(),
      fuzzyDuplicates: []
    };

    // Track seen values
    const seenEmails = new Map();
    const seenPhones = new Map();
    const seenNames = new Map();
    const seenRecords = new Map();

    records.forEach((record, index) => {
      const recordKey = this.generateRecordKey(record);

      // Check for exact duplicates
      if (seenRecords.has(recordKey)) {
        duplicates.exactDuplicates.push({
          record1: seenRecords.get(recordKey),
          record2: index,
          key: recordKey
        });
      } else {
        seenRecords.set(recordKey, index);
      }

      // Track email duplicates
      if (record.email) {
        const normalizedEmail = record.email.toLowerCase().trim();
        if (seenEmails.has(normalizedEmail)) {
          const existing = duplicates.emailDuplicates.get(normalizedEmail) || [];
          existing.push(index);
          duplicates.emailDuplicates.set(normalizedEmail, existing);
        } else {
          seenEmails.set(normalizedEmail, index);
        }
      }

      // Track phone duplicates
      if (record.phone) {
        const normalizedPhone = record.phone.replace(/\D/g, '');
        if (seenPhones.has(normalizedPhone)) {
          const existing = duplicates.phoneDuplicates.get(normalizedPhone) || [];
          existing.push(index);
          duplicates.phoneDuplicates.set(normalizedPhone, existing);
        } else {
          seenPhones.set(normalizedPhone, index);
        }
      }

      // Track name duplicates
      if (record.name) {
        const normalizedName = record.name.toLowerCase().trim();
        if (seenNames.has(normalizedName)) {
          const existing = duplicates.nameDuplicates.get(normalizedName) || [];
          existing.push(index);
          duplicates.nameDuplicates.set(normalizedName, existing);
        } else {
          seenNames.set(normalizedName, index);
        }
      }
    });

    // Calculate fuzzy duplicates for a sample
    const sampleSize = Math.min(100, records.length);
    const sample = records.slice(0, sampleSize);
    duplicates.fuzzyDuplicates = this.findFuzzyDuplicates(sample);

    const totalDuplicates =
      duplicates.exactDuplicates.length +
      duplicates.emailDuplicates.size +
      duplicates.phoneDuplicates.size +
      duplicates.nameDuplicates.size;

    const uniquenessScore = Math.max(0, 100 - (totalDuplicates / records.length * 100));

    return {
      score: uniquenessScore,
      exactDuplicates: duplicates.exactDuplicates.length,
      emailDuplicates: duplicates.emailDuplicates.size,
      phoneDuplicates: duplicates.phoneDuplicates.size,
      nameDuplicates: duplicates.nameDuplicates.size,
      fuzzyDuplicates: duplicates.fuzzyDuplicates.length,
      duplicateGroups: {
        byEmail: Array.from(duplicates.emailDuplicates.entries()).map(([email, indices]) => ({
          value: email,
          count: indices.length + 1,
          records: indices
        })),
        byPhone: Array.from(duplicates.phoneDuplicates.entries()).map(([phone, indices]) => ({
          value: phone,
          count: indices.length + 1,
          records: indices
        })),
        byName: Array.from(duplicates.nameDuplicates.entries()).map(([name, indices]) => ({
          value: name,
          count: indices.length + 1,
          records: indices
        }))
      },
      estimatedTotalDuplicates: Math.round(duplicates.fuzzyDuplicates.length * (records.length / sampleSize))
    };
  }

  /**
   * Analyze data timeliness
   */
  analyzeTimeliness(records) {
    const now = new Date();
    const timePeriods = {
      current: 0,      // < 30 days
      recent: 0,       // 30-90 days
      moderate: 0,     // 90-365 days
      old: 0,          // 1-2 years
      veryOld: 0,      // > 2 years
      noDate: 0
    };

    const lastModifiedDates = [];
    const createdDates = [];
    const stalePeriod = this.config.stalePeriod || 180; // days

    records.forEach(record => {
      let dateToCheck = record.modifiedDate || record.createdDate;

      if (!dateToCheck) {
        timePeriods.noDate++;
        return;
      }

      const date = new Date(dateToCheck);
      const daysDiff = Math.floor((now - date) / (1000 * 60 * 60 * 24));

      if (daysDiff < 30) timePeriods.current++;
      else if (daysDiff < 90) timePeriods.recent++;
      else if (daysDiff < 365) timePeriods.moderate++;
      else if (daysDiff < 730) timePeriods.old++;
      else timePeriods.veryOld++;

      if (record.modifiedDate) {
        lastModifiedDates.push(new Date(record.modifiedDate));
      }
      if (record.createdDate) {
        createdDates.push(new Date(record.createdDate));
      }
    });

    // Calculate statistics
    const modifiedStats = lastModifiedDates.length > 0
      ? this.calculateDateStatistics(lastModifiedDates)
      : null;

    const createdStats = createdDates.length > 0
      ? this.calculateDateStatistics(createdDates)
      : null;

    const staleRecords = records.filter(record => {
      const date = new Date(record.modifiedDate || record.createdDate);
      const daysDiff = Math.floor((now - date) / (1000 * 60 * 60 * 24));
      return daysDiff > stalePeriod;
    });

    const timelinessScore = 100 - ((staleRecords.length / records.length) * 100);

    return {
      score: timelinessScore,
      distribution: timePeriods,
      percentages: Object.entries(timePeriods).map(([period, count]) => ({
        period,
        count,
        percentage: ((count / records.length) * 100).toFixed(2)
      })),
      staleRecords: staleRecords.length,
      stalePercentage: ((staleRecords.length / records.length) * 100).toFixed(2),
      averageAge: modifiedStats ? modifiedStats.averageAge : null,
      lastModifiedStats: modifiedStats,
      createdStats: createdStats,
      recommendations: this.generateTimelinessRecommendations(timePeriods, staleRecords.length)
    };
  }

  /**
   * Detect patterns in data
   */
  detectPatterns(records) {
    const patterns = {
      naming: [],
      temporal: [],
      categorical: [],
      numerical: []
    };

    // Naming patterns
    const namePatterns = this.detectNamingPatterns(records);
    patterns.naming = namePatterns;

    // Temporal patterns
    const temporalPatterns = this.detectTemporalPatterns(records);
    patterns.temporal = temporalPatterns;

    // Categorical patterns
    const categoricalPatterns = this.detectCategoricalPatterns(records);
    patterns.categorical = categoricalPatterns;

    // Numerical patterns
    const numericalPatterns = this.detectNumericalPatterns(records);
    patterns.numerical = numericalPatterns;

    return patterns;
  }

  /**
   * Detect anomalies in data
   */
  detectAnomalies(records) {
    const anomalies = [];

    // Statistical anomalies
    const numericalFields = this.identifyNumericalFields(records);

    numericalFields.forEach(field => {
      const values = records.map(r => r[field]).filter(v => v !== null && v !== undefined);
      if (values.length === 0) return;

      const stats = this.calculateStatistics(values);
      const threshold = this.config.anomalyThreshold;

      records.forEach((record, index) => {
        const value = record[field];
        if (value === null || value === undefined) return;

        const zScore = Math.abs((value - stats.mean) / stats.stdDev);
        if (zScore > threshold) {
          anomalies.push({
            type: 'statistical',
            recordId: record.id || index,
            field,
            value,
            zScore: zScore.toFixed(2),
            expectedRange: `${(stats.mean - threshold * stats.stdDev).toFixed(2)} - ${(stats.mean + threshold * stats.stdDev).toFixed(2)}`
          });
        }
      });
    });

    // Pattern anomalies
    const patternAnomalies = this.detectPatternAnomalies(records);
    anomalies.push(...patternAnomalies);

    // Temporal anomalies
    const temporalAnomalies = this.detectTemporalAnomalies(records);
    anomalies.push(...temporalAnomalies);

    // Format anomalies
    const formatAnomalies = this.detectFormatAnomalies(records);
    anomalies.push(...formatAnomalies);

    return {
      count: anomalies.length,
      anomalies: anomalies.slice(0, 100), // Limit to top 100
      byType: this.groupAnomaliesByType(anomalies),
      byField: this.groupAnomaliesByField(anomalies),
      severity: this.calculateAnomalySeverity(anomalies, records.length)
    };
  }

  /**
   * Analyze correlations between fields
   */
  analyzeCorrelations(records) {
    const correlations = [];
    const fields = this.getAnalyzableFields(records);

    // Check field presence correlations
    for (let i = 0; i < fields.length; i++) {
      for (let j = i + 1; j < fields.length; j++) {
        const field1 = fields[i];
        const field2 = fields[j];

        const correlation = this.calculateFieldCorrelation(records, field1, field2);
        if (Math.abs(correlation) > 0.5) {
          correlations.push({
            field1,
            field2,
            correlation: correlation.toFixed(3),
            type: correlation > 0 ? 'positive' : 'negative',
            strength: Math.abs(correlation) > 0.8 ? 'strong' : 'moderate'
          });
        }
      }
    }

    return {
      strongCorrelations: correlations.filter(c => c.strength === 'strong'),
      moderateCorrelations: correlations.filter(c => c.strength === 'moderate'),
      fieldDependencies: this.identifyFieldDependencies(records, correlations),
      recommendations: this.generateCorrelationRecommendations(correlations)
    };
  }

  /**
   * Analyze data distribution
   */
  analyzeDistribution(records) {
    const distributions = {};

    // Analyze distribution for key fields
    const fieldsToAnalyze = ['status', 'stage', 'type', 'source', 'lifecycleStage'];

    fieldsToAnalyze.forEach(field => {
      const values = records.map(r => r[field]).filter(v => v !== null && v !== undefined);
      if (values.length === 0) return;

      const distribution = new Map();
      values.forEach(value => {
        const count = distribution.get(value) || 0;
        distribution.set(value, count + 1);
      });

      distributions[field] = {
        unique: distribution.size,
        distribution: Array.from(distribution.entries())
          .map(([value, count]) => ({
            value,
            count,
            percentage: ((count / values.length) * 100).toFixed(2)
          }))
          .sort((a, b) => b.count - a.count),
        entropy: this.calculateEntropy(Array.from(distribution.values())),
        skewness: this.calculateSkewness(distribution)
      };
    });

    // Geographic distribution if address data exists
    const geoDistribution = this.analyzeGeographicDistribution(records);
    if (geoDistribution) {
      distributions.geographic = geoDistribution;
    }

    // Temporal distribution
    distributions.temporal = this.analyzeTemporalDistribution(records);

    return distributions;
  }

  /**
   * Generate insights from metrics
   */
  generateInsights(metrics) {
    const insights = [];

    // Completeness insights
    if (metrics.completeness.overall < 70) {
      insights.push({
        type: 'warning',
        category: 'completeness',
        message: `Data completeness is low at ${metrics.completeness.overall.toFixed(1)}%. Consider data enrichment.`,
        priority: 'high'
      });
    }

    // Validity insights
    if (metrics.validity.score < 90) {
      insights.push({
        type: 'warning',
        category: 'validity',
        message: `${metrics.validity.totalIssues} validity issues found affecting data quality.`,
        priority: 'medium'
      });
    }

    // Uniqueness insights
    if (metrics.uniqueness.emailDuplicates > 0) {
      insights.push({
        type: 'info',
        category: 'uniqueness',
        message: `${metrics.uniqueness.emailDuplicates} email duplicates detected. Consider deduplication.`,
        priority: 'medium'
      });
    }

    // Anomaly insights
    if (metrics.anomalies.count > 10) {
      insights.push({
        type: 'warning',
        category: 'anomalies',
        message: `${metrics.anomalies.count} anomalies detected that may require investigation.`,
        priority: 'high'
      });
    }

    // Pattern insights
    if (metrics.patterns.temporal.length > 0) {
      insights.push({
        type: 'info',
        category: 'patterns',
        message: `Temporal patterns detected that could inform business decisions.`,
        priority: 'low'
      });
    }

    // Correlation insights
    if (metrics.correlations.strongCorrelations.length > 0) {
      insights.push({
        type: 'info',
        category: 'correlations',
        message: `${metrics.correlations.strongCorrelations.length} strong field correlations found.`,
        priority: 'low'
      });
    }

    return insights.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }

  /**
   * Generate recommendations
   */
  generateRecommendations(metrics) {
    const recommendations = [];

    // Completeness recommendations
    if (metrics.completeness.overall < this.config.benchmarks.completeness) {
      const missingFields = Object.entries(metrics.completeness.fieldLevel)
        .filter(([field, stats]) => stats.percentage < 50)
        .map(([field]) => field);

      recommendations.push({
        category: 'completeness',
        action: 'Enrich data for incomplete fields',
        details: `Focus on fields: ${missingFields.slice(0, 5).join(', ')}`,
        impact: 'high',
        effort: 'medium'
      });
    }

    // Deduplication recommendations
    if (metrics.uniqueness.score < this.config.benchmarks.uniqueness) {
      recommendations.push({
        category: 'uniqueness',
        action: 'Run deduplication process',
        details: `Estimated ${metrics.uniqueness.estimatedTotalDuplicates} duplicates to resolve`,
        impact: 'high',
        effort: 'low'
      });
    }

    // Consistency recommendations
    if (metrics.consistency.score < this.config.benchmarks.consistency) {
      recommendations.push({
        category: 'consistency',
        action: 'Standardize data formats',
        details: 'Implement data normalization rules for consistent formatting',
        impact: 'medium',
        effort: 'medium'
      });
    }

    // Timeliness recommendations
    if (metrics.timeliness.stalePercentage > 30) {
      recommendations.push({
        category: 'timeliness',
        action: 'Update stale records',
        details: `${metrics.timeliness.staleRecords} records need updating`,
        impact: 'medium',
        effort: 'high'
      });
    }

    // Anomaly recommendations
    if (metrics.anomalies.count > 5) {
      recommendations.push({
        category: 'anomalies',
        action: 'Investigate and resolve anomalies',
        details: `Review ${metrics.anomalies.count} detected anomalies`,
        impact: 'medium',
        effort: 'low'
      });
    }

    return recommendations.sort((a, b) => {
      const impactOrder = { high: 0, medium: 1, low: 2 };
      const effortOrder = { low: 0, medium: 1, high: 2 };
      return (impactOrder[a.impact] - impactOrder[b.impact]) ||
             (effortOrder[a.effort] - effortOrder[b.effort]);
    });
  }

  /**
   * Calculate overall quality score
   */
  calculateQualityScore(metrics) {
    const weights = this.config.qualityWeights;

    const score =
      (metrics.completeness.overall * weights.completeness) +
      (metrics.validity.score * weights.validity) +
      (metrics.consistency.score * weights.consistency) +
      (metrics.uniqueness.score * weights.uniqueness) +
      (metrics.timeliness.score * weights.timeliness);

    return {
      overall: score.toFixed(2),
      breakdown: {
        completeness: (metrics.completeness.overall * weights.completeness).toFixed(2),
        validity: (metrics.validity.score * weights.validity).toFixed(2),
        consistency: (metrics.consistency.score * weights.consistency).toFixed(2),
        uniqueness: (metrics.uniqueness.score * weights.uniqueness).toFixed(2),
        timeliness: (metrics.timeliness.score * weights.timeliness).toFixed(2)
      },
      grade: this.getQualityGrade(score)
    };
  }

  /**
   * Compare metrics to benchmarks
   */
  compareToBenchmarks(metrics) {
    const comparison = {};
    const benchmarks = this.config.benchmarks;

    Object.keys(benchmarks).forEach(metric => {
      const actual = metrics[metric]?.score || metrics[metric]?.overall || 0;
      const benchmark = benchmarks[metric];
      const difference = actual - benchmark;

      comparison[metric] = {
        actual: actual.toFixed(2),
        benchmark,
        difference: difference.toFixed(2),
        status: difference >= 0 ? 'passing' : 'failing',
        percentageOfBenchmark: ((actual / benchmark) * 100).toFixed(1)
      };
    });

    return comparison;
  }

  // Helper methods

  calculateStatistics(values) {
    const n = values.length;
    if (n === 0) return { mean: 0, median: 0, stdDev: 0, distribution: {} };

    const mean = values.reduce((a, b) => a + b, 0) / n;
    const median = this.calculateMedian(values);
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / n;
    const stdDev = Math.sqrt(variance);

    const distribution = {
      '0-25': values.filter(v => v <= 25).length,
      '26-50': values.filter(v => v > 25 && v <= 50).length,
      '51-75': values.filter(v => v > 50 && v <= 75).length,
      '76-100': values.filter(v => v > 75).length
    };

    return { mean, median, stdDev, distribution };
  }

  calculateMedian(values) {
    const sorted = values.slice().sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  calculateRequiredFieldsCompleteness(records, fields) {
    let totalComplete = 0;

    records.forEach(record => {
      const complete = fields.every(field => {
        const value = record[field];
        return value !== null && value !== undefined && value !== '';
      });
      if (complete) totalComplete++;
    });

    return (totalComplete / records.length) * 100;
  }

  isValidDate(dateString) {
    const date = new Date(dateString);
    return date instanceof Date && !isNaN(date);
  }

  detectNameFormat(name) {
    if (!name) return 'empty';
    if (name === name.toUpperCase()) return 'uppercase';
    if (name === name.toLowerCase()) return 'lowercase';
    if (name[0] === name[0].toUpperCase()) return 'titlecase';
    return 'mixed';
  }

  detectPhoneFormat(phone) {
    if (!phone) return 'empty';
    if (/^\d{10}$/.test(phone.replace(/\D/g, ''))) return 'digits10';
    if (/^\d{11}$/.test(phone.replace(/\D/g, ''))) return 'digits11';
    if (/^\(\d{3}\) \d{3}-\d{4}$/.test(phone)) return 'formatted-us';
    if (/^\+\d+/.test(phone)) return 'international';
    return 'other';
  }

  detectDateFormat(dateString) {
    if (!dateString) return 'empty';
    if (/^\d{4}-\d{2}-\d{2}/.test(dateString)) return 'iso';
    if (/^\d{2}\/\d{2}\/\d{4}/.test(dateString)) return 'us';
    if (/^\d{2}-\d{2}-\d{4}/.test(dateString)) return 'dashed';
    return 'other';
  }

  findDominantPattern(patternMap) {
    let maxCount = 0;
    let dominant = null;

    patternMap.forEach((count, pattern) => {
      if (count > maxCount) {
        maxCount = count;
        dominant = pattern;
      }
    });

    return dominant;
  }

  getUniqueRecordIds(issues) {
    const recordIds = new Set();
    Object.values(issues).forEach(issueList => {
      issueList.forEach(issue => {
        recordIds.add(issue.recordId);
      });
    });
    return Array.from(recordIds);
  }

  analyzeFieldCasePatterns(records) {
    const patterns = {};
    const inconsistencies = [];

    // Analyze case patterns for text fields
    ['name', 'email', 'description'].forEach(field => {
      const cases = { upper: 0, lower: 0, title: 0, mixed: 0 };

      records.forEach((record, index) => {
        if (!record[field]) return;

        const value = record[field].toString();
        if (value === value.toUpperCase()) cases.upper++;
        else if (value === value.toLowerCase()) cases.lower++;
        else if (this.isTitleCase(value)) cases.title++;
        else cases.mixed++;
      });

      patterns[field] = cases;
    });

    return { patterns, inconsistencies };
  }

  isTitleCase(str) {
    const words = str.split(/\s+/);
    return words.every(word => word[0] === word[0].toUpperCase());
  }

  detectAbbreviationInconsistencies(records) {
    const abbreviations = new Map([
      ['Street', 'St'],
      ['Avenue', 'Ave'],
      ['Company', 'Co'],
      ['Corporation', 'Corp'],
      ['Limited', 'Ltd'],
      ['Incorporated', 'Inc']
    ]);

    const inconsistencies = [];

    records.forEach((record, index) => {
      const fieldsToCheck = ['name', 'address.street', 'description'];

      fieldsToCheck.forEach(field => {
        const value = this.getNestedValue(record, field);
        if (!value) return;

        abbreviations.forEach((abbr, full) => {
          if (value.includes(full) && value.includes(abbr)) {
            inconsistencies.push({
              recordId: record.id || index,
              field,
              issue: `Mixed use of "${full}" and "${abbr}"`
            });
          }
        });
      });
    });

    return inconsistencies;
  }

  getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  generateRecordKey(record) {
    const keyFields = ['name', 'email', 'phone'];
    return keyFields.map(field => record[field] || '').join('|');
  }

  generateConsistencyRecommendations(inconsistencies) {
    const recommendations = [];

    if (inconsistencies.namingPatterns.length > 10) {
      recommendations.push('Standardize naming format across all records');
    }

    if (inconsistencies.phoneFormats.length > 10) {
      recommendations.push('Normalize phone number format');
    }

    if (inconsistencies.caseInconsistencies.length > 0) {
      recommendations.push('Apply consistent text casing rules');
    }

    return recommendations;
  }

  findFuzzyDuplicates(records) {
    const duplicates = [];
    const threshold = 0.85;

    for (let i = 0; i < records.length; i++) {
      for (let j = i + 1; j < records.length; j++) {
        const similarity = this.calculateRecordSimilarity(records[i], records[j]);
        if (similarity > threshold) {
          duplicates.push({
            record1: i,
            record2: j,
            similarity: similarity.toFixed(3)
          });
        }
      }
    }

    return duplicates;
  }

  calculateRecordSimilarity(record1, record2) {
    const fields = ['name', 'email', 'phone'];
    let totalSimilarity = 0;
    let fieldCount = 0;

    fields.forEach(field => {
      if (record1[field] && record2[field]) {
        const similarity = this.calculateStringSimilarity(
          record1[field].toString(),
          record2[field].toString()
        );
        totalSimilarity += similarity;
        fieldCount++;
      }
    });

    return fieldCount > 0 ? totalSimilarity / fieldCount : 0;
  }

  calculateStringSimilarity(str1, str2) {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;

    if (longer.length === 0) return 1.0;

    const editDistance = this.calculateEditDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  calculateEditDistance(str1, str2) {
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

  calculateDateStatistics(dates) {
    const now = new Date();
    const ages = dates.map(date => Math.floor((now - date) / (1000 * 60 * 60 * 24)));

    return {
      averageAge: ages.reduce((a, b) => a + b, 0) / ages.length,
      oldest: Math.max(...ages),
      newest: Math.min(...ages),
      median: this.calculateMedian(ages)
    };
  }

  generateTimelinessRecommendations(distribution, staleCount) {
    const recommendations = [];

    if (distribution.veryOld > distribution.current) {
      recommendations.push('Prioritize updating very old records');
    }

    if (distribution.noDate > 0) {
      recommendations.push(`Add timestamps to ${distribution.noDate} records missing dates`);
    }

    if (staleCount > 100) {
      recommendations.push('Implement automated data refresh process');
    }

    return recommendations;
  }

  detectNamingPatterns(records) {
    const patterns = [];
    const nameFormats = new Map();

    records.forEach(record => {
      if (record.name) {
        const format = this.classifyNameFormat(record.name);
        const count = nameFormats.get(format) || 0;
        nameFormats.set(format, count + 1);
      }
    });

    nameFormats.forEach((count, format) => {
      if (count > records.length * 0.1) {
        patterns.push({
          type: 'naming',
          pattern: format,
          frequency: count,
          percentage: ((count / records.length) * 100).toFixed(2)
        });
      }
    });

    return patterns;
  }

  classifyNameFormat(name) {
    if (/^[A-Z]{2,}$/.test(name)) return 'acronym';
    if (/^\w+, \w+/.test(name)) return 'lastname-firstname';
    if (/^\w+ \w+$/.test(name)) return 'firstname-lastname';
    if (/^[a-z]+_[a-z]+/.test(name)) return 'snake_case';
    if (/^[a-z]+[A-Z]/.test(name)) return 'camelCase';
    return 'other';
  }

  detectTemporalPatterns(records) {
    const patterns = [];
    const creationDates = records
      .filter(r => r.createdDate)
      .map(r => new Date(r.createdDate));

    if (creationDates.length > 10) {
      // Check for weekly patterns
      const dayOfWeek = new Array(7).fill(0);
      creationDates.forEach(date => {
        dayOfWeek[date.getDay()]++;
      });

      const peakDay = dayOfWeek.indexOf(Math.max(...dayOfWeek));
      patterns.push({
        type: 'weekly',
        pattern: `Peak on ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][peakDay]}`,
        distribution: dayOfWeek
      });

      // Check for monthly patterns
      const dayOfMonth = new Array(31).fill(0);
      creationDates.forEach(date => {
        dayOfMonth[date.getDate() - 1]++;
      });

      const peakDayOfMonth = dayOfMonth.indexOf(Math.max(...dayOfMonth)) + 1;
      if (dayOfMonth[peakDayOfMonth - 1] > creationDates.length * 0.1) {
        patterns.push({
          type: 'monthly',
          pattern: `Peak on day ${peakDayOfMonth}`,
          frequency: dayOfMonth[peakDayOfMonth - 1]
        });
      }
    }

    return patterns;
  }

  detectCategoricalPatterns(records) {
    const patterns = [];
    const categoricalFields = ['status', 'type', 'source', 'stage'];

    categoricalFields.forEach(field => {
      const values = records.map(r => r[field]).filter(v => v);
      if (values.length === 0) return;

      const distribution = new Map();
      values.forEach(value => {
        const count = distribution.get(value) || 0;
        distribution.set(value, count + 1);
      });

      // Find dominant category
      let maxCount = 0;
      let dominant = null;
      distribution.forEach((count, value) => {
        if (count > maxCount) {
          maxCount = count;
          dominant = value;
        }
      });

      if (maxCount > values.length * 0.5) {
        patterns.push({
          type: 'categorical',
          field,
          dominant,
          dominance: ((maxCount / values.length) * 100).toFixed(2),
          distribution: Object.fromEntries(distribution)
        });
      }
    });

    return patterns;
  }

  detectNumericalPatterns(records) {
    const patterns = [];
    const numericalFields = this.identifyNumericalFields(records);

    numericalFields.forEach(field => {
      const values = records.map(r => r[field]).filter(v => v !== null && v !== undefined);
      if (values.length < 10) return;

      const stats = this.calculateStatistics(values);

      // Check for clustering
      const clusters = this.detectClusters(values);
      if (clusters.length > 0) {
        patterns.push({
          type: 'clustering',
          field,
          clusters,
          stats
        });
      }

      // Check for outliers
      const outliers = values.filter(v => Math.abs((v - stats.mean) / stats.stdDev) > 2);
      if (outliers.length > 0) {
        patterns.push({
          type: 'outliers',
          field,
          count: outliers.length,
          percentage: ((outliers.length / values.length) * 100).toFixed(2)
        });
      }
    });

    return patterns;
  }

  identifyNumericalFields(records) {
    const fields = new Set();
    if (records.length === 0) return [];

    const sample = records[0];
    Object.keys(sample).forEach(field => {
      const values = records.slice(0, 10).map(r => r[field]);
      const isNumerical = values.every(v => v === null || v === undefined || typeof v === 'number' || !isNaN(Number(v)));
      if (isNumerical) fields.add(field);
    });

    return Array.from(fields);
  }

  detectClusters(values) {
    // Simple clustering detection
    const sorted = values.slice().sort((a, b) => a - b);
    const clusters = [];
    let currentCluster = [sorted[0]];

    for (let i = 1; i < sorted.length; i++) {
      const gap = sorted[i] - sorted[i - 1];
      const avgGap = (sorted[sorted.length - 1] - sorted[0]) / sorted.length;

      if (gap > avgGap * 3) {
        if (currentCluster.length > values.length * 0.1) {
          clusters.push({
            range: [currentCluster[0], currentCluster[currentCluster.length - 1]],
            count: currentCluster.length
          });
        }
        currentCluster = [sorted[i]];
      } else {
        currentCluster.push(sorted[i]);
      }
    }

    if (currentCluster.length > values.length * 0.1) {
      clusters.push({
        range: [currentCluster[0], currentCluster[currentCluster.length - 1]],
        count: currentCluster.length
      });
    }

    return clusters;
  }

  detectPatternAnomalies(records) {
    const anomalies = [];
    // Implementation for pattern-based anomaly detection
    return anomalies;
  }

  detectTemporalAnomalies(records) {
    const anomalies = [];
    const dates = records
      .map((r, i) => ({ index: i, date: new Date(r.modifiedDate || r.createdDate) }))
      .filter(item => !isNaN(item.date));

    if (dates.length > 10) {
      // Check for future dates
      const now = new Date();
      dates.forEach(item => {
        if (item.date > now) {
          anomalies.push({
            type: 'temporal',
            recordId: item.index,
            issue: 'Future date detected',
            value: item.date.toISOString()
          });
        }
      });

      // Check for very old dates
      const oldThreshold = new Date();
      oldThreshold.setFullYear(oldThreshold.getFullYear() - 10);

      dates.forEach(item => {
        if (item.date < oldThreshold) {
          anomalies.push({
            type: 'temporal',
            recordId: item.index,
            issue: 'Very old date detected',
            value: item.date.toISOString()
          });
        }
      });
    }

    return anomalies;
  }

  detectFormatAnomalies(records) {
    const anomalies = [];

    records.forEach((record, index) => {
      // Check email format
      if (record.email && !record.email.includes('@')) {
        anomalies.push({
          type: 'format',
          recordId: index,
          field: 'email',
          issue: 'Invalid email format',
          value: record.email
        });
      }

      // Check phone length
      if (record.phone) {
        const digits = record.phone.replace(/\D/g, '');
        if (digits.length < 7 || digits.length > 15) {
          anomalies.push({
            type: 'format',
            recordId: index,
            field: 'phone',
            issue: 'Unusual phone number length',
            value: record.phone
          });
        }
      }
    });

    return anomalies;
  }

  groupAnomaliesByType(anomalies) {
    const grouped = {};
    anomalies.forEach(anomaly => {
      if (!grouped[anomaly.type]) {
        grouped[anomaly.type] = [];
      }
      grouped[anomaly.type].push(anomaly);
    });
    return grouped;
  }

  groupAnomaliesByField(anomalies) {
    const grouped = {};
    anomalies.forEach(anomaly => {
      const field = anomaly.field || 'general';
      if (!grouped[field]) {
        grouped[field] = [];
      }
      grouped[field].push(anomaly);
    });
    return grouped;
  }

  calculateAnomalySeverity(anomalies, totalRecords) {
    const percentage = (anomalies.length / totalRecords) * 100;
    if (percentage > 10) return 'critical';
    if (percentage > 5) return 'high';
    if (percentage > 2) return 'medium';
    return 'low';
  }

  getAnalyzableFields(records) {
    if (records.length === 0) return [];

    const fields = new Set();
    records.slice(0, 10).forEach(record => {
      Object.keys(record).forEach(field => {
        if (field !== 'id' && field !== 'history' && field !== 'customFields') {
          fields.add(field);
        }
      });
    });

    return Array.from(fields);
  }

  calculateFieldCorrelation(records, field1, field2) {
    const pairs = records.map(r => ({
      f1: r[field1] !== null && r[field1] !== undefined ? 1 : 0,
      f2: r[field2] !== null && r[field2] !== undefined ? 1 : 0
    }));

    const n = pairs.length;
    const sumF1 = pairs.reduce((sum, p) => sum + p.f1, 0);
    const sumF2 = pairs.reduce((sum, p) => sum + p.f2, 0);
    const sumF1F2 = pairs.reduce((sum, p) => sum + p.f1 * p.f2, 0);
    const sumF1Sq = pairs.reduce((sum, p) => sum + p.f1 * p.f1, 0);
    const sumF2Sq = pairs.reduce((sum, p) => sum + p.f2 * p.f2, 0);

    const num = n * sumF1F2 - sumF1 * sumF2;
    const den = Math.sqrt((n * sumF1Sq - sumF1 * sumF1) * (n * sumF2Sq - sumF2 * sumF2));

    return den === 0 ? 0 : num / den;
  }

  identifyFieldDependencies(records, correlations) {
    const dependencies = [];

    correlations.forEach(corr => {
      if (corr.correlation > 0.8) {
        // Check if one field implies the other
        let field1ImpliesField2 = true;
        let field2ImpliesField1 = true;

        records.forEach(record => {
          if (record[corr.field1] && !record[corr.field2]) {
            field1ImpliesField2 = false;
          }
          if (record[corr.field2] && !record[corr.field1]) {
            field2ImpliesField1 = false;
          }
        });

        if (field1ImpliesField2) {
          dependencies.push({
            dependent: corr.field2,
            independent: corr.field1,
            type: 'implies'
          });
        }
        if (field2ImpliesField1) {
          dependencies.push({
            dependent: corr.field1,
            independent: corr.field2,
            type: 'implies'
          });
        }
      }
    });

    return dependencies;
  }

  generateCorrelationRecommendations(correlations) {
    const recommendations = [];

    correlations.forEach(corr => {
      if (corr.strength === 'strong' && corr.type === 'positive') {
        recommendations.push(`Consider combining ${corr.field1} and ${corr.field2} fields`);
      }
      if (corr.strength === 'strong' && corr.type === 'negative') {
        recommendations.push(`Review inverse relationship between ${corr.field1} and ${corr.field2}`);
      }
    });

    return recommendations;
  }

  calculateEntropy(values) {
    const total = values.reduce((a, b) => a + b, 0);
    if (total === 0) return 0;

    let entropy = 0;
    values.forEach(count => {
      if (count > 0) {
        const p = count / total;
        entropy -= p * Math.log2(p);
      }
    });

    return entropy;
  }

  calculateSkewness(distribution) {
    const values = [];
    distribution.forEach((count, value) => {
      for (let i = 0; i < count; i++) {
        values.push(1); // Simplified for categorical data
      }
    });

    if (values.length < 3) return 0;

    const n = values.length;
    const mean = values.reduce((a, b) => a + b, 0) / n;
    const m2 = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / n;
    const m3 = values.reduce((sum, v) => sum + Math.pow(v - mean, 3), 0) / n;

    const skewness = m3 / Math.pow(m2, 1.5);
    return isNaN(skewness) ? 0 : skewness;
  }

  analyzeGeographicDistribution(records) {
    const distribution = new Map();

    records.forEach(record => {
      if (record.address && record.address.country) {
        const country = record.address.country;
        const count = distribution.get(country) || 0;
        distribution.set(country, count + 1);
      }
    });

    if (distribution.size === 0) return null;

    return {
      countries: distribution.size,
      distribution: Array.from(distribution.entries())
        .map(([country, count]) => ({
          country,
          count,
          percentage: ((count / records.length) * 100).toFixed(2)
        }))
        .sort((a, b) => b.count - a.count)
    };
  }

  analyzeTemporalDistribution(records) {
    const monthlyDistribution = new Array(12).fill(0);
    const yearlyDistribution = new Map();

    records.forEach(record => {
      const date = new Date(record.createdDate || record.modifiedDate);
      if (!isNaN(date)) {
        monthlyDistribution[date.getMonth()]++;
        const year = date.getFullYear();
        const count = yearlyDistribution.get(year) || 0;
        yearlyDistribution.set(year, count + 1);
      }
    });

    return {
      monthly: monthlyDistribution.map((count, month) => ({
        month: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][month],
        count,
        percentage: ((count / records.length) * 100).toFixed(2)
      })),
      yearly: Array.from(yearlyDistribution.entries())
        .map(([year, count]) => ({
          year,
          count,
          percentage: ((count / records.length) * 100).toFixed(2)
        }))
        .sort((a, b) => b.year - a.year)
    };
  }

  getQualityGrade(score) {
    if (score >= 95) return 'A+';
    if (score >= 90) return 'A';
    if (score >= 85) return 'B+';
    if (score >= 80) return 'B';
    if (score >= 75) return 'C+';
    if (score >= 70) return 'C';
    if (score >= 65) return 'D';
    return 'F';
  }
}

module.exports = DataAnalysisEngine;