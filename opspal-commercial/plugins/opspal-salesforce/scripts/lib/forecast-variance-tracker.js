#!/usr/bin/env node
/**
 * Forecast Variance Tracker
 *
 * Tracks forecast vs. actual variance over time for revenue forecasting.
 * Provides trend analysis, factor identification, and forecasting accuracy metrics.
 *
 * @module forecast-variance-tracker
 * @version 1.0.0
 * @created 2026-01-25
 */

const fs = require('fs');
const path = require('path');

/**
 * Variance classifications
 */
const VARIANCE_TYPES = {
  OVER_FORECAST: 'over_forecast',    // Forecast > Actual
  UNDER_FORECAST: 'under_forecast',  // Forecast < Actual
  ACCURATE: 'accurate',               // Within threshold
  SEVERELY_OVER: 'severely_over',     // >20% over
  SEVERELY_UNDER: 'severely_under'    // >20% under
};

/**
 * Trend classifications
 */
const TRENDS = {
  IMPROVING: 'improving',
  DEGRADING: 'degrading',
  STABLE: 'stable',
  VOLATILE: 'volatile'
};

/**
 * ForecastVarianceTracker class
 */
class ForecastVarianceTracker {
  /**
   * Initialize tracker
   *
   * @param {Object} config - Configuration options
   * @param {number} [config.accuracyThreshold=0.05] - Threshold for "accurate" variance (5%)
   * @param {number} [config.severeThreshold=0.20] - Threshold for "severe" variance (20%)
   * @param {number} [config.minPeriods=3] - Minimum periods for trend analysis
   */
  constructor(config = {}) {
    this.accuracyThreshold = config.accuracyThreshold ?? 0.05;
    this.severeThreshold = config.severeThreshold ?? 0.20;
    this.minPeriods = config.minPeriods ?? 3;
  }

  /**
   * Calculate variance between forecast and actual
   *
   * @param {number} forecast - Forecasted value
   * @param {number} actual - Actual value
   * @returns {Object} Variance analysis
   */
  calculateVariance(forecast, actual) {
    if (actual === 0 && forecast === 0) {
      return {
        absolute: 0,
        percentage: 0,
        type: VARIANCE_TYPES.ACCURATE,
        direction: 'none'
      };
    }

    const absolute = forecast - actual;
    const percentage = actual !== 0 ? (forecast - actual) / actual : (forecast > 0 ? 1 : 0);
    const absPercentage = Math.abs(percentage);

    let type;
    if (absPercentage <= this.accuracyThreshold) {
      type = VARIANCE_TYPES.ACCURATE;
    } else if (percentage > 0) {
      type = absPercentage >= this.severeThreshold ? VARIANCE_TYPES.SEVERELY_OVER : VARIANCE_TYPES.OVER_FORECAST;
    } else {
      type = absPercentage >= this.severeThreshold ? VARIANCE_TYPES.SEVERELY_UNDER : VARIANCE_TYPES.UNDER_FORECAST;
    }

    return {
      absolute,
      percentage: percentage * 100,
      absPercentage: absPercentage * 100,
      type,
      direction: percentage > 0 ? 'over' : percentage < 0 ? 'under' : 'none'
    };
  }

  /**
   * Track variance over multiple periods
   *
   * @param {Array<{period: string, forecast: number, actual: number}>} data - Period data
   * @returns {Object} Variance tracking results
   */
  trackVariance(data) {
    if (!Array.isArray(data) || data.length === 0) {
      return {
        success: false,
        error: 'No data provided for variance tracking'
      };
    }

    // Calculate variance for each period
    const periods = data.map(item => ({
      period: item.period,
      forecast: item.forecast,
      actual: item.actual,
      variance: this.calculateVariance(item.forecast, item.actual)
    }));

    // Calculate aggregate metrics
    const totalForecast = data.reduce((sum, d) => sum + d.forecast, 0);
    const totalActual = data.reduce((sum, d) => sum + d.actual, 0);
    const overallVariance = this.calculateVariance(totalForecast, totalActual);

    // Calculate accuracy metrics
    const accurateCount = periods.filter(p => p.variance.type === VARIANCE_TYPES.ACCURATE).length;
    const accuracyRate = (accurateCount / periods.length) * 100;

    // Calculate MAPE (Mean Absolute Percentage Error)
    const mape = periods.reduce((sum, p) => sum + p.variance.absPercentage, 0) / periods.length;

    // Determine trend
    const trend = this.analyzeTrend(periods);

    // Identify factors
    const factors = this.identifyFactors(periods);

    return {
      success: true,
      periodCount: periods.length,
      periods,
      aggregate: {
        totalForecast,
        totalActual,
        overallVariance
      },
      metrics: {
        accuracyRate,
        accurateCount,
        mape,
        bias: overallVariance.percentage // Systematic over/under forecasting
      },
      trend,
      factors,
      recommendations: this.generateRecommendations(overallVariance, trend, mape)
    };
  }

  /**
   * Analyze variance trend over time
   *
   * @param {Array} periods - Period data with variance
   * @returns {Object} Trend analysis
   */
  analyzeTrend(periods) {
    if (periods.length < this.minPeriods) {
      return {
        type: TRENDS.STABLE,
        confidence: 0,
        message: `Insufficient data for trend analysis (need ${this.minPeriods} periods)`
      };
    }

    // Get variance percentages over time (newest first for analysis)
    const variances = periods.map(p => p.variance.absPercentage);

    // Split into halves for comparison
    const midpoint = Math.floor(variances.length / 2);
    const recentAvg = variances.slice(0, midpoint).reduce((a, b) => a + b, 0) / midpoint;
    const olderAvg = variances.slice(midpoint).reduce((a, b) => a + b, 0) / (variances.length - midpoint);

    // Calculate volatility (standard deviation)
    const mean = variances.reduce((a, b) => a + b, 0) / variances.length;
    const variance = variances.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / variances.length;
    const stdDev = Math.sqrt(variance);
    const cv = mean > 0 ? stdDev / mean : 0; // Coefficient of variation

    // Determine trend type
    let type;
    let confidence;
    const improvement = olderAvg - recentAvg;
    const improvementPct = olderAvg > 0 ? (improvement / olderAvg) * 100 : 0;

    if (cv > 0.5) {
      type = TRENDS.VOLATILE;
      confidence = 0.7;
    } else if (improvementPct > 10) {
      type = TRENDS.IMPROVING;
      confidence = Math.min(0.9, 0.5 + improvementPct / 100);
    } else if (improvementPct < -10) {
      type = TRENDS.DEGRADING;
      confidence = Math.min(0.9, 0.5 + Math.abs(improvementPct) / 100);
    } else {
      type = TRENDS.STABLE;
      confidence = 0.8;
    }

    return {
      type,
      confidence,
      recentAvgVariance: recentAvg,
      olderAvgVariance: olderAvg,
      improvementPct,
      volatility: cv * 100,
      message: this.getTrendMessage(type, improvementPct)
    };
  }

  /**
   * Identify factors contributing to variance
   *
   * @param {Array} periods - Period data with variance
   * @returns {Array} Identified factors
   */
  identifyFactors(periods) {
    const factors = [];

    // Check for systematic bias
    const overCount = periods.filter(p => p.variance.direction === 'over').length;
    const underCount = periods.filter(p => p.variance.direction === 'under').length;
    const biasRatio = overCount / periods.length;

    if (biasRatio > 0.7) {
      factors.push({
        type: 'systematic_over_forecast',
        severity: 'high',
        description: `${Math.round(biasRatio * 100)}% of periods show over-forecasting`,
        recommendation: 'Reduce forecast assumptions or apply conservative adjustment factor'
      });
    } else if (biasRatio < 0.3) {
      factors.push({
        type: 'systematic_under_forecast',
        severity: 'high',
        description: `${Math.round((1 - biasRatio) * 100)}% of periods show under-forecasting`,
        recommendation: 'Increase forecast assumptions or apply optimistic adjustment factor'
      });
    }

    // Check for severe variances
    const severeCount = periods.filter(p =>
      p.variance.type === VARIANCE_TYPES.SEVERELY_OVER ||
      p.variance.type === VARIANCE_TYPES.SEVERELY_UNDER
    ).length;

    if (severeCount > periods.length * 0.3) {
      factors.push({
        type: 'high_variance_frequency',
        severity: 'high',
        description: `${Math.round(severeCount / periods.length * 100)}% of periods have >20% variance`,
        recommendation: 'Review forecasting methodology and data inputs'
      });
    }

    // Check for increasing variance
    const recentVariances = periods.slice(0, Math.ceil(periods.length / 3)).map(p => p.variance.absPercentage);
    const avgRecent = recentVariances.reduce((a, b) => a + b, 0) / recentVariances.length;

    if (avgRecent > 15) {
      factors.push({
        type: 'recent_high_variance',
        severity: 'medium',
        description: `Recent periods average ${avgRecent.toFixed(1)}% variance`,
        recommendation: 'Investigate recent market changes or data quality issues'
      });
    }

    // Check for quarter-end patterns
    const quarterEndPeriods = periods.filter(p => {
      const month = parseInt(p.period.split('-')[1]);
      return month % 3 === 0;
    });

    if (quarterEndPeriods.length >= 2) {
      const qeAvgVariance = quarterEndPeriods.reduce((sum, p) => sum + p.variance.absPercentage, 0) / quarterEndPeriods.length;
      const nonQeAvgVariance = periods.filter(p => !quarterEndPeriods.includes(p))
        .reduce((sum, p) => sum + p.variance.absPercentage, 0) / (periods.length - quarterEndPeriods.length) || 0;

      if (qeAvgVariance > nonQeAvgVariance * 1.5) {
        factors.push({
          type: 'quarter_end_pattern',
          severity: 'medium',
          description: 'Quarter-end periods show higher variance than mid-quarter',
          recommendation: 'Apply separate forecasting model for quarter-end deals'
        });
      }
    }

    return factors;
  }

  /**
   * Generate recommendations based on analysis
   *
   * @param {Object} overallVariance - Overall variance
   * @param {Object} trend - Trend analysis
   * @param {number} mape - Mean Absolute Percentage Error
   * @returns {Array} Recommendations
   */
  generateRecommendations(overallVariance, trend, mape) {
    const recommendations = [];

    // MAPE-based recommendations
    if (mape > 20) {
      recommendations.push({
        priority: 'high',
        action: 'Overhaul forecasting methodology',
        rationale: `MAPE of ${mape.toFixed(1)}% indicates significant accuracy issues`
      });
    } else if (mape > 10) {
      recommendations.push({
        priority: 'medium',
        action: 'Review and refine forecast inputs',
        rationale: `MAPE of ${mape.toFixed(1)}% suggests room for improvement`
      });
    }

    // Bias-based recommendations
    if (overallVariance.percentage > 10) {
      recommendations.push({
        priority: 'high',
        action: `Apply ${Math.round(overallVariance.percentage / 2)}% downward adjustment to forecasts`,
        rationale: 'Systematic over-forecasting detected'
      });
    } else if (overallVariance.percentage < -10) {
      recommendations.push({
        priority: 'high',
        action: `Apply ${Math.round(Math.abs(overallVariance.percentage) / 2)}% upward adjustment to forecasts`,
        rationale: 'Systematic under-forecasting detected'
      });
    }

    // Trend-based recommendations
    if (trend.type === TRENDS.DEGRADING) {
      recommendations.push({
        priority: 'high',
        action: 'Investigate root cause of degrading forecast accuracy',
        rationale: `Forecast accuracy worsening by ${Math.abs(trend.improvementPct).toFixed(1)}%`
      });
    } else if (trend.type === TRENDS.VOLATILE) {
      recommendations.push({
        priority: 'medium',
        action: 'Implement ensemble forecasting or scenario planning',
        rationale: 'High volatility in forecast accuracy'
      });
    }

    return recommendations;
  }

  /**
   * Get trend message
   *
   * @param {string} type - Trend type
   * @param {number} improvementPct - Improvement percentage
   * @returns {string} Trend message
   */
  getTrendMessage(type, improvementPct) {
    switch (type) {
      case TRENDS.IMPROVING:
        return `Forecast accuracy improving by ${improvementPct.toFixed(1)}%`;
      case TRENDS.DEGRADING:
        return `Forecast accuracy degrading by ${Math.abs(improvementPct).toFixed(1)}%`;
      case TRENDS.VOLATILE:
        return 'Forecast accuracy is highly variable';
      default:
        return 'Forecast accuracy is stable';
    }
  }

  /**
   * Compare forecast performance across segments
   *
   * @param {Object} segmentData - Data by segment
   * @returns {Object} Segment comparison
   */
  compareSegments(segmentData) {
    const results = {};

    for (const [segment, data] of Object.entries(segmentData)) {
      results[segment] = this.trackVariance(data);
    }

    // Rank segments by accuracy
    const ranked = Object.entries(results)
      .filter(([_, r]) => r.success)
      .sort((a, b) => a[1].metrics.mape - b[1].metrics.mape)
      .map(([segment, result], index) => ({
        segment,
        rank: index + 1,
        mape: result.metrics.mape,
        accuracyRate: result.metrics.accuracyRate,
        trend: result.trend.type
      }));

    return {
      segments: results,
      ranking: ranked,
      bestPerforming: ranked[0]?.segment || null,
      worstPerforming: ranked[ranked.length - 1]?.segment || null
    };
  }
}

// CLI Interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  const printUsage = () => {
    console.log(`
Forecast Variance Tracker

Usage:
  forecast-variance-tracker.js track <data-file.json> [options]
  forecast-variance-tracker.js compare <segments-file.json>

Commands:
  track       Track variance from period data
  compare     Compare variance across segments

Options:
  --accuracy <n>    Accuracy threshold (default: 0.05)
  --severe <n>      Severe variance threshold (default: 0.20)
  --output <path>   Output file path

Examples:
  forecast-variance-tracker.js track ./forecast-actuals.json
  forecast-variance-tracker.js compare ./segment-data.json --output ./comparison.json
    `);
  };

  if (!command || command === '--help') {
    printUsage();
    process.exit(0);
  }

  // Parse options
  const getArg = (flag) => {
    const idx = args.indexOf(flag);
    return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
  };

  const accuracyThreshold = getArg('--accuracy') ? parseFloat(getArg('--accuracy')) : 0.05;
  const severeThreshold = getArg('--severe') ? parseFloat(getArg('--severe')) : 0.20;
  const outputPath = getArg('--output');

  const tracker = new ForecastVarianceTracker({ accuracyThreshold, severeThreshold });

  try {
    if (command === 'track') {
      const dataFile = args[1];
      if (!dataFile) {
        console.error('Error: Data file required');
        printUsage();
        process.exit(1);
      }

      const data = JSON.parse(fs.readFileSync(dataFile, 'utf-8'));
      const result = tracker.trackVariance(data);

      if (outputPath) {
        fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
        console.log(`Results saved to: ${outputPath}`);
      } else {
        console.log(JSON.stringify(result, null, 2));
      }
    } else if (command === 'compare') {
      const dataFile = args[1];
      if (!dataFile) {
        console.error('Error: Segments data file required');
        printUsage();
        process.exit(1);
      }

      const segmentData = JSON.parse(fs.readFileSync(dataFile, 'utf-8'));
      const result = tracker.compareSegments(segmentData);

      if (outputPath) {
        fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
        console.log(`Results saved to: ${outputPath}`);
      } else {
        console.log(JSON.stringify(result, null, 2));
      }
    } else {
      console.error(`Unknown command: ${command}`);
      printUsage();
      process.exit(1);
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

module.exports = {
  ForecastVarianceTracker,
  VARIANCE_TYPES,
  TRENDS
};
