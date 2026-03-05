#!/usr/bin/env node

/**
 * Threshold Optimizer
 *
 * Analyzes user feedback to suggest confidence threshold adjustments
 * for the entity matching system. Never auto-applies changes - always
 * requires human confirmation.
 *
 * Features:
 * - Analyzes false positive/negative rates
 * - Suggests threshold adjustments with safety bounds
 * - Generates threshold adjustment reports
 * - Respects safety bounds (autoMerge never < 80, tag never > review)
 *
 * Usage:
 *   const { ThresholdOptimizer } = require('./threshold-optimizer');
 *   const optimizer = new ThresholdOptimizer();
 *
 *   // Analyze and suggest adjustments
 *   const suggestions = optimizer.analyzeMarket('healthcare');
 *
 *   // Generate full report
 *   const report = optimizer.generateReport();
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { FeedbackTracker } = require('./feedback-tracker');

class ThresholdOptimizer {
  constructor(options = {}) {
    // Load market matching rules
    this.configPath = options.configPath ||
      path.join(__dirname, '..', '..', '..', 'config', 'market-matching-rules.json');

    this._loadConfig();

    // Initialize feedback tracker
    this.feedbackTracker = options.feedbackTracker || new FeedbackTracker();

    // Safety bounds for thresholds
    this.safetyBounds = {
      autoMerge: { min: 80, max: 99 },  // Never auto-merge below 80% confidence
      review: { min: 60, max: 95 },      // Review range
      tag: { min: 40, max: 85 }          // Tag range
    };

    // Thresholds for suggesting adjustments
    this.adjustmentTriggers = {
      fpRateHigh: 0.05,      // 5% false positive rate triggers review
      fnRateHigh: 0.10,      // 10% false negative rate triggers review
      minDecisions: 10,      // Minimum decisions needed for reliable analysis
      confidenceRequired: 0.8 // 80% confidence in suggestion
    };
  }

  /**
   * Analyze a specific market and suggest threshold adjustments
   * @param {string} market - Market to analyze
   * @returns {Object} Analysis results with suggestions
   */
  analyzeMarket(market) {
    const metrics = this.feedbackTracker.calculateAccuracyMetrics(market);
    const currentThresholds = this._getMarketThresholds(market);

    if (!metrics.metrics || metrics.totalDecisions < this.adjustmentTriggers.minDecisions) {
      return {
        market,
        status: 'INSUFFICIENT_DATA',
        message: `Need at least ${this.adjustmentTriggers.minDecisions} decisions (have ${metrics.totalDecisions})`,
        currentThresholds,
        suggestions: []
      };
    }

    const suggestions = [];
    const analysis = {
      market,
      status: 'ANALYZED',
      totalDecisions: metrics.totalDecisions,
      currentThresholds,
      metrics: metrics.metrics,
      confidenceAnalysis: metrics.confidenceAnalysis,
      suggestions: []
    };

    // Analyze false positive rate at autoMerge level
    if (metrics.metrics.fpRateAtAutoMerge > this.adjustmentTriggers.fpRateHigh) {
      const suggestion = this._suggestAutoMergeIncrease(
        market,
        currentThresholds,
        metrics
      );
      if (suggestion) suggestions.push(suggestion);
    }

    // Analyze false negative rate at NO_MATCH level
    if (metrics.metrics.fnRateAtNoMatch > this.adjustmentTriggers.fnRateHigh) {
      const suggestion = this._suggestTagDecrease(
        market,
        currentThresholds,
        metrics
      );
      if (suggestion) suggestions.push(suggestion);
    }

    // Check if confidence calibration is off
    const calibrationIssues = this._checkConfidenceCalibration(metrics.confidenceAnalysis);
    if (calibrationIssues.length > 0) {
      suggestions.push(...calibrationIssues.map(issue => ({
        type: 'CALIBRATION_ISSUE',
        severity: 'INFO',
        ...issue
      })));
    }

    // Analyze decision breakdown for fine-tuning
    const breakdownSuggestions = this._analyzeDecisionBreakdown(
      market,
      currentThresholds,
      metrics.decisionBreakdown
    );
    suggestions.push(...breakdownSuggestions);

    analysis.suggestions = suggestions;
    analysis.status = suggestions.length > 0 ? 'ADJUSTMENTS_SUGGESTED' : 'THRESHOLDS_OPTIMAL';

    return analysis;
  }

  /**
   * Analyze all markets and generate comprehensive report
   * @returns {Object} Full analysis report
   */
  generateReport() {
    const report = {
      generatedAt: new Date().toISOString(),
      version: '1.0.0',
      summary: {
        marketsAnalyzed: 0,
        marketsWithSuggestions: 0,
        totalSuggestions: 0,
        criticalSuggestions: 0
      },
      markets: {},
      globalPatterns: [],
      recommendations: []
    };

    // Get all markets from feedback
    const feedbackSummary = this.feedbackTracker.getSummary();
    const marketList = Object.keys(feedbackSummary.byMarket);

    // Analyze each market
    for (const market of marketList) {
      const analysis = this.analyzeMarket(market);
      report.markets[market] = analysis;
      report.summary.marketsAnalyzed++;

      if (analysis.suggestions && analysis.suggestions.length > 0) {
        report.summary.marketsWithSuggestions++;
        report.summary.totalSuggestions += analysis.suggestions.length;
        report.summary.criticalSuggestions += analysis.suggestions.filter(
          s => s.severity === 'HIGH'
        ).length;
      }
    }

    // Detect cross-market patterns
    report.globalPatterns = this._detectGlobalPatterns(report.markets);

    // Generate prioritized recommendations
    report.recommendations = this._generateRecommendations(report);

    return report;
  }

  /**
   * Preview what threshold changes would look like
   * @param {string} market - Market to preview
   * @param {Object} adjustments - { autoMerge, review, tag }
   * @returns {Object} Preview of changes with validation
   */
  previewAdjustment(market, adjustments) {
    const currentThresholds = this._getMarketThresholds(market);
    const newThresholds = { ...currentThresholds };
    const validationErrors = [];
    const warnings = [];

    // Apply and validate each adjustment
    for (const [key, value] of Object.entries(adjustments)) {
      if (!this.safetyBounds[key]) {
        validationErrors.push(`Unknown threshold: ${key}`);
        continue;
      }

      // Check safety bounds
      if (value < this.safetyBounds[key].min) {
        warnings.push(`${key} value ${value} is below minimum ${this.safetyBounds[key].min}`);
        newThresholds[key] = this.safetyBounds[key].min;
      } else if (value > this.safetyBounds[key].max) {
        warnings.push(`${key} value ${value} is above maximum ${this.safetyBounds[key].max}`);
        newThresholds[key] = this.safetyBounds[key].max;
      } else {
        newThresholds[key] = value;
      }
    }

    // Validate threshold ordering
    if (newThresholds.tag >= newThresholds.review) {
      validationErrors.push(`tag (${newThresholds.tag}) must be less than review (${newThresholds.review})`);
    }
    if (newThresholds.review >= newThresholds.autoMerge) {
      validationErrors.push(`review (${newThresholds.review}) must be less than autoMerge (${newThresholds.autoMerge})`);
    }

    return {
      market,
      valid: validationErrors.length === 0,
      currentThresholds,
      proposedThresholds: newThresholds,
      changes: {
        autoMerge: newThresholds.autoMerge - currentThresholds.autoMerge,
        review: newThresholds.review - currentThresholds.review,
        tag: newThresholds.tag - currentThresholds.tag
      },
      validationErrors,
      warnings,
      impactEstimate: this._estimateImpact(market, currentThresholds, newThresholds)
    };
  }

  /**
   * Apply threshold adjustments to config (requires confirmation)
   * @param {string} market - Market to adjust
   * @param {Object} adjustments - { autoMerge, review, tag }
   * @param {boolean} confirmed - Must be true to apply
   * @returns {Object} Result of operation
   */
  applyAdjustments(market, adjustments, confirmed = false) {
    if (!confirmed) {
      return {
        success: false,
        error: 'Adjustment requires explicit confirmation. Pass confirmed=true after reviewing preview.'
      };
    }

    const preview = this.previewAdjustment(market, adjustments);
    if (!preview.valid) {
      return {
        success: false,
        error: 'Invalid adjustments',
        validationErrors: preview.validationErrors
      };
    }

    // Update config
    try {
      const config = JSON.parse(fs.readFileSync(this.configPath, 'utf-8'));

      if (!config.markets[market]) {
        return {
          success: false,
          error: `Market ${market} not found in configuration`
        };
      }

      // Apply changes
      config.markets[market].confidenceThresholds = preview.proposedThresholds;

      // Add audit trail
      if (!config.markets[market].thresholdHistory) {
        config.markets[market].thresholdHistory = [];
      }
      config.markets[market].thresholdHistory.push({
        timestamp: new Date().toISOString(),
        previous: preview.currentThresholds,
        new: preview.proposedThresholds,
        source: 'threshold-optimizer',
        basedOnDecisions: this.feedbackTracker.calculateAccuracyMetrics(market).totalDecisions
      });

      // Save config
      fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));

      // Reload config
      this._loadConfig();

      return {
        success: true,
        market,
        previousThresholds: preview.currentThresholds,
        newThresholds: preview.proposedThresholds,
        changes: preview.changes
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to update config: ${error.message}`
      };
    }
  }

  // ========== Private Methods ==========

  _loadConfig() {
    try {
      this.config = JSON.parse(fs.readFileSync(this.configPath, 'utf-8'));
    } catch (error) {
      console.warn(`Warning: Could not load config from ${this.configPath}:`, error.message);
      this.config = { markets: {} };
    }
  }

  _getMarketThresholds(market) {
    const marketConfig = this.config.markets?.[market];
    if (marketConfig?.confidenceThresholds) {
      return { ...marketConfig.confidenceThresholds };
    }

    // Default thresholds
    return {
      autoMerge: 90,
      review: 80,
      tag: 60
    };
  }

  _suggestAutoMergeIncrease(market, currentThresholds, metrics) {
    const fpRate = metrics.metrics.fpRateAtAutoMerge;

    // Calculate suggested increase based on FP rate
    // Higher FP rate = larger increase needed
    let suggestedIncrease;
    if (fpRate > 0.15) {
      suggestedIncrease = 5;  // Very high FP rate
    } else if (fpRate > 0.10) {
      suggestedIncrease = 4;
    } else if (fpRate > 0.07) {
      suggestedIncrease = 3;
    } else {
      suggestedIncrease = 2;
    }

    const newValue = Math.min(
      currentThresholds.autoMerge + suggestedIncrease,
      this.safetyBounds.autoMerge.max
    );

    if (newValue === currentThresholds.autoMerge) {
      return null; // Already at max
    }

    // Estimate impact
    const fpDecisions = this.feedbackTracker.getFalsePositives(market);
    const affectedCount = fpDecisions.filter(
      d => d.originalConfidence >= currentThresholds.autoMerge &&
           d.originalConfidence < newValue
    ).length;

    return {
      type: 'INCREASE_AUTO_MERGE',
      severity: fpRate > 0.10 ? 'HIGH' : 'MEDIUM',
      threshold: 'autoMerge',
      currentValue: currentThresholds.autoMerge,
      suggestedValue: newValue,
      change: newValue - currentThresholds.autoMerge,
      rationale: `False positive rate at AUTO_MERGE is ${(fpRate * 100).toFixed(1)}% (target: <5%). ` +
                 `Increasing threshold would move ${affectedCount} potential FPs to REVIEW.`,
      confidence: this._calculateSuggestionConfidence(metrics, 'autoMerge'),
      potentialImpact: {
        expectedFPReduction: Math.round(affectedCount * 0.7),  // 70% of moved items are likely FPs
        expectedReviewIncrease: affectedCount
      }
    };
  }

  _suggestTagDecrease(market, currentThresholds, metrics) {
    const fnRate = metrics.metrics.fnRateAtNoMatch;

    // Calculate suggested decrease based on FN rate
    let suggestedDecrease;
    if (fnRate > 0.20) {
      suggestedDecrease = 8;  // Very high FN rate
    } else if (fnRate > 0.15) {
      suggestedDecrease = 6;
    } else if (fnRate > 0.12) {
      suggestedDecrease = 4;
    } else {
      suggestedDecrease = 3;
    }

    const newValue = Math.max(
      currentThresholds.tag - suggestedDecrease,
      this.safetyBounds.tag.min
    );

    if (newValue === currentThresholds.tag) {
      return null; // Already at min
    }

    // Estimate impact
    const fnDecisions = this.feedbackTracker.getFalseNegatives(market);
    const affectedCount = fnDecisions.filter(
      d => d.originalConfidence < currentThresholds.tag &&
           d.originalConfidence >= newValue
    ).length;

    return {
      type: 'DECREASE_TAG',
      severity: fnRate > 0.15 ? 'HIGH' : 'MEDIUM',
      threshold: 'tag',
      currentValue: currentThresholds.tag,
      suggestedValue: newValue,
      change: newValue - currentThresholds.tag,
      rationale: `False negative rate at NO_MATCH is ${(fnRate * 100).toFixed(1)}% (target: <10%). ` +
                 `Lowering tag threshold would capture ${affectedCount} currently-missed matches.`,
      confidence: this._calculateSuggestionConfidence(metrics, 'tag'),
      potentialImpact: {
        expectedFNReduction: Math.round(affectedCount * 0.6),  // 60% of captured items are likely matches
        expectedTagIncrease: affectedCount
      }
    };
  }

  _checkConfidenceCalibration(confidenceAnalysis) {
    const issues = [];

    // Check if high-confidence predictions are less accurate than expected
    const highConf = confidenceAnalysis['90-100'];
    if (highConf && highConf.total >= 5 && highConf.accuracy < 0.95) {
      issues.push({
        range: '90-100',
        issue: 'HIGH_CONFIDENCE_MISCALIBRATED',
        message: `90-100% confidence only ${(highConf.accuracy * 100).toFixed(1)}% accurate (expected >95%)`,
        suggestion: 'Review signal weights - high confidence predictions may be overweighted'
      });
    }

    // Check if low-confidence predictions are more accurate than expected
    const lowConf = confidenceAnalysis['50-59'];
    if (lowConf && lowConf.total >= 5 && lowConf.accuracy > 0.8) {
      issues.push({
        range: '50-59',
        issue: 'LOW_CONFIDENCE_UNDERVALUED',
        message: `50-59% confidence is ${(lowConf.accuracy * 100).toFixed(1)}% accurate (expected ~50%)`,
        suggestion: 'Consider lowering thresholds - system may be too conservative'
      });
    }

    return issues;
  }

  _analyzeDecisionBreakdown(market, currentThresholds, breakdown) {
    const suggestions = [];

    // Check REVIEW accuracy
    if (breakdown.REVIEW.total >= 5) {
      const reviewAcceptRate = breakdown.REVIEW.accepted / breakdown.REVIEW.total;

      if (reviewAcceptRate > 0.90) {
        // Almost all REVIEW items accepted - maybe autoMerge threshold is too high
        suggestions.push({
          type: 'REVIEW_HIGH_ACCEPT_RATE',
          severity: 'LOW',
          threshold: 'autoMerge',
          message: `${(reviewAcceptRate * 100).toFixed(0)}% of REVIEW items are accepted - consider lowering autoMerge`,
          currentValue: currentThresholds.autoMerge,
          suggestedValue: Math.max(currentThresholds.autoMerge - 2, currentThresholds.review + 3),
          rationale: 'High REVIEW acceptance rate suggests autoMerge threshold may be overly conservative'
        });
      } else if (reviewAcceptRate < 0.40) {
        // Most REVIEW items rejected - maybe review threshold should be higher
        suggestions.push({
          type: 'REVIEW_LOW_ACCEPT_RATE',
          severity: 'LOW',
          threshold: 'review',
          message: `Only ${(reviewAcceptRate * 100).toFixed(0)}% of REVIEW items are accepted - consider raising review threshold`,
          currentValue: currentThresholds.review,
          suggestedValue: Math.min(currentThresholds.review + 3, currentThresholds.autoMerge - 3),
          rationale: 'Low REVIEW acceptance rate suggests items below this threshold are mostly non-matches'
        });
      }
    }

    // Check TAG to NO_MATCH boundary
    if (breakdown.TAG.total >= 3 && breakdown.NO_MATCH.total >= 3) {
      const tagAcceptRate = breakdown.TAG.accepted / breakdown.TAG.total;
      const noMatchAcceptRate = breakdown.NO_MATCH.accepted / breakdown.NO_MATCH.total;

      if (tagAcceptRate > 0.5 && noMatchAcceptRate > 0.2) {
        // Users are accepting matches below tag threshold
        suggestions.push({
          type: 'TAG_BOUNDARY_TOO_HIGH',
          severity: 'MEDIUM',
          threshold: 'tag',
          message: `${(noMatchAcceptRate * 100).toFixed(0)}% of NO_MATCH items are being manually merged`,
          suggestedValue: currentThresholds.tag - 5,
          rationale: 'Significant matches falling below tag threshold indicate it may be too high'
        });
      }
    }

    return suggestions;
  }

  _calculateSuggestionConfidence(metrics, thresholdType) {
    // Base confidence on amount of data
    let confidence = Math.min(metrics.totalDecisions / 50, 1) * 0.4;  // Max 40% from data volume

    // Add confidence from consistency of errors
    if (thresholdType === 'autoMerge') {
      // If most FPs are in the same confidence range, higher confidence
      confidence += 0.3;
    } else if (thresholdType === 'tag') {
      confidence += 0.3;
    }

    // Add confidence from overall pattern
    confidence += 0.2;

    return Math.round(confidence * 100) / 100;
  }

  _estimateImpact(market, currentThresholds, newThresholds) {
    const metrics = this.feedbackTracker.calculateAccuracyMetrics(market);

    if (!metrics.metrics) {
      return { message: 'Insufficient data for impact estimation' };
    }

    return {
      expectedAutoMergeChange: this._estimateDecisionShift(
        'AUTO_MERGE',
        currentThresholds.autoMerge,
        newThresholds.autoMerge,
        metrics
      ),
      expectedReviewChange: this._estimateDecisionShift(
        'REVIEW',
        currentThresholds.review,
        newThresholds.review,
        metrics
      ),
      expectedTagChange: this._estimateDecisionShift(
        'TAG',
        currentThresholds.tag,
        newThresholds.tag,
        metrics
      ),
      message: 'Impact estimates are based on historical feedback patterns'
    };
  }

  _estimateDecisionShift(decisionType, oldThreshold, newThreshold, metrics) {
    if (oldThreshold === newThreshold) return 'No change';

    const direction = newThreshold > oldThreshold ? 'up' : 'down';
    const magnitude = Math.abs(newThreshold - oldThreshold);

    // Estimate based on confidence analysis
    const confAnalysis = metrics.confidenceAnalysis;
    let estimatedShift = 0;

    // Count decisions in affected range
    for (const [range, data] of Object.entries(confAnalysis)) {
      const [low, high] = range === 'below-50' ? [0, 50] : range.split('-').map(Number);
      if (data.total > 0) {
        if (direction === 'up' && high >= oldThreshold && low < newThreshold) {
          estimatedShift += data.total;
        } else if (direction === 'down' && low < oldThreshold && high >= newThreshold) {
          estimatedShift += data.total;
        }
      }
    }

    return {
      direction: direction === 'up' ? 'fewer' : 'more',
      estimatedCount: estimatedShift,
      percentChange: magnitude
    };
  }

  _detectGlobalPatterns(marketAnalyses) {
    const patterns = [];

    // Check if multiple markets have same issue
    const fpIssueMarkets = [];
    const fnIssueMarkets = [];

    for (const [market, analysis] of Object.entries(marketAnalyses)) {
      if (!analysis.suggestions) continue;

      for (const suggestion of analysis.suggestions) {
        if (suggestion.type === 'INCREASE_AUTO_MERGE') {
          fpIssueMarkets.push(market);
        }
        if (suggestion.type === 'DECREASE_TAG') {
          fnIssueMarkets.push(market);
        }
      }
    }

    if (fpIssueMarkets.length >= 2) {
      patterns.push({
        type: 'WIDESPREAD_FP_ISSUES',
        markets: fpIssueMarkets,
        recommendation: 'Consider reviewing global signal weights - false positives are high across multiple markets',
        severity: 'HIGH'
      });
    }

    if (fnIssueMarkets.length >= 2) {
      patterns.push({
        type: 'WIDESPREAD_FN_ISSUES',
        markets: fnIssueMarkets,
        recommendation: 'System may be too conservative globally - consider lowering base thresholds',
        severity: 'MEDIUM'
      });
    }

    return patterns;
  }

  _generateRecommendations(report) {
    const recommendations = [];

    // Priority 1: High severity suggestions
    for (const [market, analysis] of Object.entries(report.markets)) {
      if (!analysis.suggestions) continue;

      for (const suggestion of analysis.suggestions) {
        if (suggestion.severity === 'HIGH') {
          recommendations.push({
            priority: 1,
            market,
            action: suggestion.type,
            description: suggestion.rationale,
            threshold: suggestion.threshold,
            change: suggestion.change,
            confidence: suggestion.confidence
          });
        }
      }
    }

    // Priority 2: Global patterns
    for (const pattern of report.globalPatterns) {
      recommendations.push({
        priority: 2,
        market: 'GLOBAL',
        action: pattern.type,
        description: pattern.recommendation,
        affectedMarkets: pattern.markets
      });
    }

    // Priority 3: Medium severity suggestions
    for (const [market, analysis] of Object.entries(report.markets)) {
      if (!analysis.suggestions) continue;

      for (const suggestion of analysis.suggestions) {
        if (suggestion.severity === 'MEDIUM') {
          recommendations.push({
            priority: 3,
            market,
            action: suggestion.type,
            description: suggestion.rationale,
            threshold: suggestion.threshold,
            change: suggestion.change
          });
        }
      }
    }

    // Sort by priority
    recommendations.sort((a, b) => a.priority - b.priority);

    return recommendations;
  }
}

// Export
module.exports = { ThresholdOptimizer };

// CLI Usage
if (require.main === module) {
  const args = process.argv.slice(2);
  const optimizer = new ThresholdOptimizer();

  if (args.length === 0) {
    console.log(`
Threshold Optimizer CLI

Usage:
  node threshold-optimizer.js analyze <market>        Analyze market and suggest adjustments
  node threshold-optimizer.js report                  Generate full optimization report
  node threshold-optimizer.js preview <market> <adjustments>  Preview adjustment impact
  node threshold-optimizer.js apply <market> <adjustments>    Apply adjustments (with confirmation)

Examples:
  node threshold-optimizer.js analyze healthcare
  node threshold-optimizer.js report
  node threshold-optimizer.js preview healthcare '{"autoMerge":97}'
  node threshold-optimizer.js apply healthcare '{"autoMerge":97}' --confirm

Arguments:
  <market>       Market name (e.g., healthcare, franchise, government)
  <adjustments>  JSON object with threshold changes (e.g., '{"autoMerge":95,"tag":65}')

Options:
  --confirm      Required for apply command to actually make changes
  --json         Output in JSON format
`);
    process.exit(0);
  }

  const command = args[0];
  const jsonOutput = args.includes('--json');

  const output = (data) => {
    if (jsonOutput) {
      console.log(JSON.stringify(data, null, 2));
    } else {
      return data;
    }
  };

  if (command === 'analyze') {
    const market = args[1];
    if (!market) {
      console.error('Error: Market required');
      process.exit(1);
    }

    const analysis = optimizer.analyzeMarket(market);

    if (jsonOutput) {
      output(analysis);
    } else {
      console.log(`\n=== Threshold Analysis: ${market} ===\n`);
      console.log(`Status: ${analysis.status}`);
      console.log(`Total Decisions: ${analysis.totalDecisions}`);

      if (analysis.currentThresholds) {
        console.log(`\nCurrent Thresholds:`);
        console.log(`  autoMerge: ${analysis.currentThresholds.autoMerge}`);
        console.log(`  review: ${analysis.currentThresholds.review}`);
        console.log(`  tag: ${analysis.currentThresholds.tag}`);
      }

      if (analysis.metrics) {
        console.log(`\nKey Metrics:`);
        console.log(`  FP Rate at AUTO_MERGE: ${(analysis.metrics.fpRateAtAutoMerge * 100).toFixed(1)}%`);
        console.log(`  FN Rate at NO_MATCH: ${(analysis.metrics.fnRateAtNoMatch * 100).toFixed(1)}%`);
        console.log(`  Overall Accuracy: ${(analysis.metrics.accuracy * 100).toFixed(1)}%`);
      }

      if (analysis.suggestions && analysis.suggestions.length > 0) {
        console.log(`\n--- Suggestions (${analysis.suggestions.length}) ---\n`);
        for (const s of analysis.suggestions) {
          console.log(`[${s.severity}] ${s.type}`);
          if (s.threshold) {
            console.log(`  Threshold: ${s.threshold}`);
            console.log(`  Current: ${s.currentValue} → Suggested: ${s.suggestedValue}`);
          }
          console.log(`  Rationale: ${s.rationale || s.message}`);
          if (s.confidence) {
            console.log(`  Confidence: ${(s.confidence * 100).toFixed(0)}%`);
          }
          console.log('');
        }
      } else if (analysis.status === 'THRESHOLDS_OPTIMAL') {
        console.log('\nNo adjustments needed - thresholds appear optimal.\n');
      }
    }

  } else if (command === 'report') {
    const report = optimizer.generateReport();

    if (jsonOutput) {
      output(report);
    } else {
      console.log(`\n=== Threshold Optimization Report ===`);
      console.log(`Generated: ${report.generatedAt}\n`);

      console.log(`Summary:`);
      console.log(`  Markets Analyzed: ${report.summary.marketsAnalyzed}`);
      console.log(`  Markets with Suggestions: ${report.summary.marketsWithSuggestions}`);
      console.log(`  Total Suggestions: ${report.summary.totalSuggestions}`);
      console.log(`  Critical Suggestions: ${report.summary.criticalSuggestions}`);

      if (report.globalPatterns.length > 0) {
        console.log(`\n--- Global Patterns ---\n`);
        for (const p of report.globalPatterns) {
          console.log(`[${p.severity}] ${p.type}`);
          console.log(`  Markets: ${p.markets.join(', ')}`);
          console.log(`  ${p.recommendation}`);
          console.log('');
        }
      }

      if (report.recommendations.length > 0) {
        console.log(`\n--- Prioritized Recommendations ---\n`);
        for (const r of report.recommendations.slice(0, 10)) {
          console.log(`[P${r.priority}] ${r.market}: ${r.action}`);
          console.log(`  ${r.description}`);
          console.log('');
        }
        if (report.recommendations.length > 10) {
          console.log(`... and ${report.recommendations.length - 10} more recommendations\n`);
        }
      } else {
        console.log('\nNo recommendations at this time.\n');
      }
    }

  } else if (command === 'preview') {
    const market = args[1];
    const adjustmentsJson = args[2];

    if (!market || !adjustmentsJson) {
      console.error('Error: Market and adjustments JSON required');
      process.exit(1);
    }

    let adjustments;
    try {
      adjustments = JSON.parse(adjustmentsJson);
    } catch (e) {
      console.error(`Error parsing adjustments JSON: ${e.message}`);
      process.exit(1);
    }

    const preview = optimizer.previewAdjustment(market, adjustments);

    if (jsonOutput) {
      output(preview);
    } else {
      console.log(`\n=== Adjustment Preview: ${market} ===\n`);
      console.log(`Valid: ${preview.valid ? 'Yes' : 'No'}`);

      console.log(`\nThreshold Changes:`);
      console.log(`  autoMerge: ${preview.currentThresholds.autoMerge} → ${preview.proposedThresholds.autoMerge} (${preview.changes.autoMerge >= 0 ? '+' : ''}${preview.changes.autoMerge})`);
      console.log(`  review: ${preview.currentThresholds.review} → ${preview.proposedThresholds.review} (${preview.changes.review >= 0 ? '+' : ''}${preview.changes.review})`);
      console.log(`  tag: ${preview.currentThresholds.tag} → ${preview.proposedThresholds.tag} (${preview.changes.tag >= 0 ? '+' : ''}${preview.changes.tag})`);

      if (preview.validationErrors.length > 0) {
        console.log(`\nValidation Errors:`);
        for (const e of preview.validationErrors) {
          console.log(`  - ${e}`);
        }
      }

      if (preview.warnings.length > 0) {
        console.log(`\nWarnings:`);
        for (const w of preview.warnings) {
          console.log(`  - ${w}`);
        }
      }

      console.log(`\nEstimated Impact:`);
      console.log(`  ${JSON.stringify(preview.impactEstimate, null, 2)}`);
      console.log('');
    }

  } else if (command === 'apply') {
    const market = args[1];
    const adjustmentsJson = args[2];
    const confirmed = args.includes('--confirm');

    if (!market || !adjustmentsJson) {
      console.error('Error: Market and adjustments JSON required');
      process.exit(1);
    }

    let adjustments;
    try {
      adjustments = JSON.parse(adjustmentsJson);
    } catch (e) {
      console.error(`Error parsing adjustments JSON: ${e.message}`);
      process.exit(1);
    }

    const result = optimizer.applyAdjustments(market, adjustments, confirmed);

    if (jsonOutput) {
      output(result);
    } else {
      if (result.success) {
        console.log(`\n=== Adjustments Applied: ${market} ===\n`);
        console.log(`Previous: ${JSON.stringify(result.previousThresholds)}`);
        console.log(`New: ${JSON.stringify(result.newThresholds)}`);
        console.log('\nChanges have been saved to configuration file.\n');
      } else {
        console.log(`\nError: ${result.error}`);
        if (result.validationErrors) {
          for (const e of result.validationErrors) {
            console.log(`  - ${e}`);
          }
        }
        if (!confirmed) {
          console.log('\nTo apply changes, add --confirm flag after reviewing the preview.\n');
        }
      }
    }

  } else {
    console.error(`Unknown command: ${command}`);
    process.exit(1);
  }
}
