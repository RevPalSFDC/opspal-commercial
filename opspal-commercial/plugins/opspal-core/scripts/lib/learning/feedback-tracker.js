#!/usr/bin/env node

/**
 * Feedback Tracker
 *
 * Tracks user decisions on entity match recommendations to enable
 * continuous improvement of the matching system.
 *
 * Features:
 * - Record user decisions (ACCEPT, REJECT, MODIFY, SPLIT)
 * - Calculate false positive/negative rates by market
 * - Persist decisions to monthly JSON files
 * - Generate accuracy metrics and reports
 *
 * Usage:
 *   const { FeedbackTracker } = require('./feedback-tracker');
 *   const tracker = new FeedbackTracker();
 *
 *   // Record a decision
 *   tracker.recordFeedback(matchResult, 'ACCEPT');
 *   tracker.recordFeedback(matchResult, 'REJECT', 'Different legal entities');
 *
 *   // Get metrics
 *   const metrics = tracker.calculateAccuracyMetrics('healthcare');
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class FeedbackTracker {
  constructor(options = {}) {
    // Storage configuration
    this.storageDir = options.storageDir ||
      path.join(__dirname, '..', '..', '..', 'data', 'feedback');

    // Ensure storage directory exists
    this._ensureStorageDir();

    // In-memory cache of current month's decisions (for fast access)
    this.currentMonthDecisions = [];
    this._loadCurrentMonth();
  }

  /**
   * Record user feedback on a match decision
   * @param {Object} matchResult - The match result from GeographicEntityResolver
   * @param {string} userAction - ACCEPT, REJECT, MODIFY, SPLIT
   * @param {string} rationale - Optional user explanation
   * @returns {Object} The recorded feedback entry
   */
  recordFeedback(matchResult, userAction, rationale = null) {
    const validActions = ['ACCEPT', 'REJECT', 'MODIFY', 'SPLIT'];
    if (!validActions.includes(userAction)) {
      throw new Error(`Invalid userAction: ${userAction}. Must be one of: ${validActions.join(', ')}`);
    }

    const feedback = {
      id: this._generateId(),
      timestamp: new Date().toISOString(),
      market: matchResult.market || 'unknown',
      recordA: this._extractRecordSummary(matchResult.recordA),
      recordB: this._extractRecordSummary(matchResult.recordB),
      originalDecision: matchResult.decision,
      originalConfidence: matchResult.confidence,
      signals: matchResult.signals?.map(s => ({
        type: s.type,
        weight: s.weight,
        value: s.value || s.stateA || s.domainA || null
      })) || [],
      sameEntityPrediction: matchResult.sameEntity,
      userAction,
      userRationale: rationale,
      // Derive ground truth from user action
      actualSameEntity: userAction === 'ACCEPT' || userAction === 'MODIFY'
    };

    // Add to current month's decisions
    this.currentMonthDecisions.push(feedback);

    // Persist to file
    this._saveCurrentMonth();

    return feedback;
  }

  /**
   * Calculate accuracy metrics for a specific market or all markets
   * @param {string|null} market - Market to analyze, or null for all
   * @param {Object} options - { startDate, endDate }
   * @returns {Object} Accuracy metrics
   */
  calculateAccuracyMetrics(market = null, options = {}) {
    const decisions = this._loadAllDecisions(options);

    // Filter by market if specified
    const filtered = market
      ? decisions.filter(d => d.market === market)
      : decisions;

    if (filtered.length === 0) {
      return {
        market,
        totalDecisions: 0,
        metrics: null,
        message: 'No decisions recorded for this market'
      };
    }

    // Calculate metrics
    const metrics = this._computeMetrics(filtered);

    return {
      market: market || 'all',
      totalDecisions: filtered.length,
      metrics,
      decisionBreakdown: this._getDecisionBreakdown(filtered),
      confidenceAnalysis: this._analyzeConfidence(filtered),
      signalEffectiveness: this._analyzeSignals(filtered)
    };
  }

  /**
   * Get decisions that resulted in false positives
   * (System said AUTO_MERGE but user rejected)
   * @param {string} market - Market to filter
   * @returns {Array} False positive decisions
   */
  getFalsePositives(market = null) {
    const decisions = this._loadAllDecisions({});

    return decisions.filter(d => {
      const marketMatch = !market || d.market === market;
      const wasAutoMerge = d.originalDecision === 'AUTO_MERGE';
      const userRejected = d.userAction === 'REJECT' || d.userAction === 'SPLIT';
      return marketMatch && wasAutoMerge && userRejected;
    });
  }

  /**
   * Get decisions that resulted in false negatives
   * (System said NO_MATCH but user accepted/merged manually)
   * @param {string} market - Market to filter
   * @returns {Array} False negative decisions
   */
  getFalseNegatives(market = null) {
    const decisions = this._loadAllDecisions({});

    return decisions.filter(d => {
      const marketMatch = !market || d.market === market;
      const wasNoMatch = d.originalDecision === 'NO_MATCH' || d.originalDecision === 'TAG';
      const userAccepted = d.userAction === 'ACCEPT' || d.userAction === 'MODIFY';
      return marketMatch && wasNoMatch && userAccepted;
    });
  }

  /**
   * Get summary statistics
   * @returns {Object} Summary stats
   */
  getSummary() {
    const decisions = this._loadAllDecisions({});

    // Group by market
    const byMarket = {};
    for (const d of decisions) {
      if (!byMarket[d.market]) {
        byMarket[d.market] = { total: 0, accepts: 0, rejects: 0, modifies: 0, splits: 0 };
      }
      byMarket[d.market].total++;
      byMarket[d.market][d.userAction.toLowerCase() + 's']++;
    }

    return {
      totalDecisions: decisions.length,
      byMarket,
      oldestDecision: decisions.length > 0 ? decisions[0].timestamp : null,
      newestDecision: decisions.length > 0 ? decisions[decisions.length - 1].timestamp : null,
      accuracyByDecision: this._getAccuracyByDecisionType(decisions)
    };
  }

  /**
   * Export feedback data to JSON
   * @param {string} outputPath - Path to export file
   * @param {Object} options - { startDate, endDate, market }
   */
  exportToJson(outputPath, options = {}) {
    const decisions = this._loadAllDecisions(options);
    const filtered = options.market
      ? decisions.filter(d => d.market === options.market)
      : decisions;

    const exportData = {
      exportDate: new Date().toISOString(),
      totalDecisions: filtered.length,
      market: options.market || 'all',
      dateRange: {
        start: options.startDate || 'earliest',
        end: options.endDate || 'latest'
      },
      decisions: filtered,
      metrics: this.calculateAccuracyMetrics(options.market, options)
    };

    fs.writeFileSync(outputPath, JSON.stringify(exportData, null, 2));
    return exportData;
  }

  // ========== Private Methods ==========

  _ensureStorageDir() {
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }
  }

  _generateId() {
    return 'fb_' + crypto.randomBytes(8).toString('hex');
  }

  _getCurrentMonthFile() {
    const now = new Date();
    const month = now.toISOString().slice(0, 7); // YYYY-MM
    return path.join(this.storageDir, `decisions-${month}.json`);
  }

  _loadCurrentMonth() {
    const file = this._getCurrentMonthFile();
    if (fs.existsSync(file)) {
      try {
        const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
        this.currentMonthDecisions = data.decisions || [];
      } catch (e) {
        console.warn(`Warning: Could not load feedback file ${file}:`, e.message);
        this.currentMonthDecisions = [];
      }
    }
  }

  _saveCurrentMonth() {
    const file = this._getCurrentMonthFile();
    const data = {
      version: '1.0.0',
      month: new Date().toISOString().slice(0, 7),
      lastUpdated: new Date().toISOString(),
      decisions: this.currentMonthDecisions,
      metrics: this._computeMetrics(this.currentMonthDecisions)
    };
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  }

  _loadAllDecisions(options = {}) {
    const files = fs.readdirSync(this.storageDir)
      .filter(f => f.startsWith('decisions-') && f.endsWith('.json'))
      .sort();

    let allDecisions = [];
    for (const file of files) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(this.storageDir, file), 'utf-8'));
        allDecisions = allDecisions.concat(data.decisions || []);
      } catch (e) {
        console.warn(`Warning: Could not load ${file}:`, e.message);
      }
    }

    // Filter by date range if specified
    if (options.startDate || options.endDate) {
      allDecisions = allDecisions.filter(d => {
        const ts = new Date(d.timestamp);
        if (options.startDate && ts < new Date(options.startDate)) return false;
        if (options.endDate && ts > new Date(options.endDate)) return false;
        return true;
      });
    }

    return allDecisions;
  }

  _extractRecordSummary(record) {
    if (!record) return null;
    return {
      name: record.name || record.Name,
      state: record.state || record.State || record.BillingState,
      domain: record.domain || record.Domain || record.Website,
      baseName: record.baseName
    };
  }

  _computeMetrics(decisions) {
    if (decisions.length === 0) return null;

    // True Positives: System predicted same entity, user confirmed
    const tp = decisions.filter(d =>
      d.sameEntityPrediction && d.actualSameEntity
    ).length;

    // False Positives: System predicted same entity, user rejected
    const fp = decisions.filter(d =>
      d.sameEntityPrediction && !d.actualSameEntity
    ).length;

    // True Negatives: System predicted different entity, user confirmed
    const tn = decisions.filter(d =>
      !d.sameEntityPrediction && !d.actualSameEntity
    ).length;

    // False Negatives: System predicted different entity, user merged
    const fn = decisions.filter(d =>
      !d.sameEntityPrediction && d.actualSameEntity
    ).length;

    const precision = tp + fp > 0 ? tp / (tp + fp) : 1;
    const recall = tp + fn > 0 ? tp / (tp + fn) : 1;
    const f1 = precision + recall > 0 ? 2 * (precision * recall) / (precision + recall) : 0;
    const accuracy = (tp + tn) / decisions.length;

    // Decision-level metrics
    const autoMergeDecisions = decisions.filter(d => d.originalDecision === 'AUTO_MERGE');
    const fpRateAtAutoMerge = autoMergeDecisions.length > 0
      ? autoMergeDecisions.filter(d => !d.actualSameEntity).length / autoMergeDecisions.length
      : 0;

    const noMatchDecisions = decisions.filter(d => d.originalDecision === 'NO_MATCH');
    const fnRateAtNoMatch = noMatchDecisions.length > 0
      ? noMatchDecisions.filter(d => d.actualSameEntity).length / noMatchDecisions.length
      : 0;

    return {
      truePositives: tp,
      falsePositives: fp,
      trueNegatives: tn,
      falseNegatives: fn,
      precision: Math.round(precision * 1000) / 1000,
      recall: Math.round(recall * 1000) / 1000,
      f1Score: Math.round(f1 * 1000) / 1000,
      accuracy: Math.round(accuracy * 1000) / 1000,
      fpRateAtAutoMerge: Math.round(fpRateAtAutoMerge * 1000) / 1000,
      fnRateAtNoMatch: Math.round(fnRateAtNoMatch * 1000) / 1000
    };
  }

  _getDecisionBreakdown(decisions) {
    const breakdown = {
      AUTO_MERGE: { total: 0, accepted: 0, rejected: 0 },
      REVIEW: { total: 0, accepted: 0, rejected: 0 },
      TAG: { total: 0, accepted: 0, rejected: 0 },
      NO_MATCH: { total: 0, accepted: 0, rejected: 0 }
    };

    for (const d of decisions) {
      if (breakdown[d.originalDecision]) {
        breakdown[d.originalDecision].total++;
        if (d.userAction === 'ACCEPT' || d.userAction === 'MODIFY') {
          breakdown[d.originalDecision].accepted++;
        } else {
          breakdown[d.originalDecision].rejected++;
        }
      }
    }

    return breakdown;
  }

  _analyzeConfidence(decisions) {
    // Group by confidence ranges
    const ranges = {
      '90-100': { total: 0, correct: 0 },
      '80-89': { total: 0, correct: 0 },
      '70-79': { total: 0, correct: 0 },
      '60-69': { total: 0, correct: 0 },
      '50-59': { total: 0, correct: 0 },
      'below-50': { total: 0, correct: 0 }
    };

    for (const d of decisions) {
      const conf = d.originalConfidence;
      let range;
      if (conf >= 90) range = '90-100';
      else if (conf >= 80) range = '80-89';
      else if (conf >= 70) range = '70-79';
      else if (conf >= 60) range = '60-69';
      else if (conf >= 50) range = '50-59';
      else range = 'below-50';

      ranges[range].total++;
      if (d.sameEntityPrediction === d.actualSameEntity) {
        ranges[range].correct++;
      }
    }

    // Calculate accuracy per range
    for (const range of Object.keys(ranges)) {
      ranges[range].accuracy = ranges[range].total > 0
        ? Math.round((ranges[range].correct / ranges[range].total) * 1000) / 1000
        : null;
    }

    return ranges;
  }

  _analyzeSignals(decisions) {
    // Count which signals appear in correct vs incorrect predictions
    const signalStats = {};

    for (const d of decisions) {
      const isCorrect = d.sameEntityPrediction === d.actualSameEntity;

      for (const signal of d.signals || []) {
        if (!signalStats[signal.type]) {
          signalStats[signal.type] = {
            total: 0,
            inCorrect: 0,
            inIncorrect: 0,
            avgWeightCorrect: 0,
            avgWeightIncorrect: 0
          };
        }

        signalStats[signal.type].total++;
        if (isCorrect) {
          signalStats[signal.type].inCorrect++;
          signalStats[signal.type].avgWeightCorrect += signal.weight;
        } else {
          signalStats[signal.type].inIncorrect++;
          signalStats[signal.type].avgWeightIncorrect += signal.weight;
        }
      }
    }

    // Calculate averages and effectiveness
    for (const type of Object.keys(signalStats)) {
      const stats = signalStats[type];
      stats.avgWeightCorrect = stats.inCorrect > 0
        ? Math.round((stats.avgWeightCorrect / stats.inCorrect) * 100) / 100
        : 0;
      stats.avgWeightIncorrect = stats.inIncorrect > 0
        ? Math.round((stats.avgWeightIncorrect / stats.inIncorrect) * 100) / 100
        : 0;
      stats.effectivenessRate = stats.total > 0
        ? Math.round((stats.inCorrect / stats.total) * 1000) / 1000
        : 0;
    }

    return signalStats;
  }

  _getAccuracyByDecisionType(decisions) {
    const types = ['AUTO_MERGE', 'REVIEW', 'TAG', 'NO_MATCH'];
    const result = {};

    for (const type of types) {
      const typeDecisions = decisions.filter(d => d.originalDecision === type);
      if (typeDecisions.length > 0) {
        const correct = typeDecisions.filter(d => d.sameEntityPrediction === d.actualSameEntity).length;
        result[type] = {
          total: typeDecisions.length,
          correct,
          accuracy: Math.round((correct / typeDecisions.length) * 1000) / 1000
        };
      }
    }

    return result;
  }
}

// Export
module.exports = { FeedbackTracker };

// CLI Usage
if (require.main === module) {
  const args = process.argv.slice(2);
  const tracker = new FeedbackTracker();

  if (args.length === 0) {
    console.log(`
Feedback Tracker CLI

Usage:
  node feedback-tracker.js summary                 Show overall summary
  node feedback-tracker.js metrics [market]        Calculate accuracy metrics
  node feedback-tracker.js false-positives [market] List false positive decisions
  node feedback-tracker.js false-negatives [market] List false negative decisions
  node feedback-tracker.js export <output.json>    Export all feedback data

Examples:
  node feedback-tracker.js summary
  node feedback-tracker.js metrics healthcare
  node feedback-tracker.js false-positives government
  node feedback-tracker.js export ./feedback-export.json
`);
    process.exit(0);
  }

  const command = args[0];

  if (command === 'summary') {
    const summary = tracker.getSummary();
    console.log('\n=== Feedback Summary ===\n');
    console.log(`Total Decisions: ${summary.totalDecisions}`);

    if (summary.totalDecisions > 0) {
      console.log(`Date Range: ${summary.oldestDecision} to ${summary.newestDecision}`);
      console.log('\nBy Market:');
      for (const [market, stats] of Object.entries(summary.byMarket)) {
        console.log(`  ${market}: ${stats.total} decisions (${stats.accepts} accepts, ${stats.rejects} rejects)`);
      }
      console.log('\nAccuracy by Decision Type:');
      for (const [type, stats] of Object.entries(summary.accuracyByDecision)) {
        console.log(`  ${type}: ${stats.correct}/${stats.total} correct (${(stats.accuracy * 100).toFixed(1)}%)`);
      }
    }
    console.log('');

  } else if (command === 'metrics') {
    const market = args[1] || null;
    const metrics = tracker.calculateAccuracyMetrics(market);

    console.log(`\n=== Accuracy Metrics${market ? ` for ${market}` : ''} ===\n`);
    console.log(`Total Decisions: ${metrics.totalDecisions}`);

    if (metrics.metrics) {
      console.log(`\nClassification Metrics:`);
      console.log(`  Precision: ${(metrics.metrics.precision * 100).toFixed(1)}%`);
      console.log(`  Recall: ${(metrics.metrics.recall * 100).toFixed(1)}%`);
      console.log(`  F1 Score: ${(metrics.metrics.f1Score * 100).toFixed(1)}%`);
      console.log(`  Accuracy: ${(metrics.metrics.accuracy * 100).toFixed(1)}%`);
      console.log(`\nError Rates:`);
      console.log(`  FP Rate at AUTO_MERGE: ${(metrics.metrics.fpRateAtAutoMerge * 100).toFixed(1)}%`);
      console.log(`  FN Rate at NO_MATCH: ${(metrics.metrics.fnRateAtNoMatch * 100).toFixed(1)}%`);

      console.log(`\nConfidence Analysis:`);
      for (const [range, data] of Object.entries(metrics.confidenceAnalysis)) {
        if (data.total > 0) {
          console.log(`  ${range}: ${data.correct}/${data.total} correct (${(data.accuracy * 100).toFixed(1)}%)`);
        }
      }
    } else {
      console.log(metrics.message);
    }
    console.log('');

  } else if (command === 'false-positives') {
    const market = args[1] || null;
    const fps = tracker.getFalsePositives(market);

    console.log(`\n=== False Positives${market ? ` for ${market}` : ''} ===\n`);
    console.log(`Found ${fps.length} false positive(s)\n`);

    for (const fp of fps.slice(0, 10)) {
      console.log(`ID: ${fp.id}`);
      console.log(`  Records: "${fp.recordA?.name}" vs "${fp.recordB?.name}"`);
      console.log(`  States: ${fp.recordA?.state} vs ${fp.recordB?.state}`);
      console.log(`  Confidence: ${fp.originalConfidence}%`);
      if (fp.userRationale) console.log(`  Rationale: ${fp.userRationale}`);
      console.log('');
    }
    if (fps.length > 10) console.log(`... and ${fps.length - 10} more\n`);

  } else if (command === 'false-negatives') {
    const market = args[1] || null;
    const fns = tracker.getFalseNegatives(market);

    console.log(`\n=== False Negatives${market ? ` for ${market}` : ''} ===\n`);
    console.log(`Found ${fns.length} false negative(s)\n`);

    for (const fn of fns.slice(0, 10)) {
      console.log(`ID: ${fn.id}`);
      console.log(`  Records: "${fn.recordA?.name}" vs "${fn.recordB?.name}"`);
      console.log(`  States: ${fn.recordA?.state} vs ${fn.recordB?.state}`);
      console.log(`  Confidence: ${fn.originalConfidence}%`);
      if (fn.userRationale) console.log(`  Rationale: ${fn.userRationale}`);
      console.log('');
    }
    if (fns.length > 10) console.log(`... and ${fns.length - 10} more\n`);

  } else if (command === 'export') {
    const outputPath = args[1];
    if (!outputPath) {
      console.error('Error: Output path required');
      process.exit(1);
    }
    tracker.exportToJson(outputPath);
    console.log(`Feedback data exported to: ${outputPath}`);

  } else {
    console.error(`Unknown command: ${command}`);
    process.exit(1);
  }
}
