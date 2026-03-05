#!/usr/bin/env node
/**
 * Competitive Win Rate Calculator
 *
 * Calculates win rates against competitors, identifies competitive positioning,
 * and provides trend analysis for sales intelligence.
 *
 * @module competitive-win-rate
 * @version 1.0.0
 * @created 2026-01-25
 */

const fs = require('fs');
const path = require('path');

/**
 * Win status classifications
 */
const WIN_STATUS = {
  WON: 'won',
  LOST: 'lost',
  NO_DECISION: 'no_decision'
};

/**
 * Competitive strength classifications
 */
const COMPETITIVE_STRENGTH = {
  DOMINANT: 'dominant',      // >70% win rate
  STRONG: 'strong',          // 55-70% win rate
  COMPETITIVE: 'competitive', // 45-55% win rate
  WEAK: 'weak',              // 30-45% win rate
  VULNERABLE: 'vulnerable'   // <30% win rate
};

/**
 * Trend classifications
 */
const TREND = {
  IMPROVING: 'improving',
  DECLINING: 'declining',
  STABLE: 'stable'
};

/**
 * CompetitiveWinRateCalculator class
 */
class CompetitiveWinRateCalculator {
  /**
   * Initialize calculator
   *
   * @param {Object} config - Configuration options
   * @param {number} [config.minDeals=5] - Minimum deals for statistical significance
   * @param {number} [config.trendPeriods=4] - Periods for trend analysis
   */
  constructor(config = {}) {
    this.minDeals = config.minDeals ?? 5;
    this.trendPeriods = config.trendPeriods ?? 4;
  }

  /**
   * Calculate overall win rate
   *
   * @param {Array<{status: string, amount?: number}>} deals - Deal outcomes
   * @returns {Object} Win rate calculation
   */
  calculateWinRate(deals) {
    if (!Array.isArray(deals) || deals.length === 0) {
      return { success: false, error: 'No deals provided' };
    }

    const won = deals.filter(d => d.status === WIN_STATUS.WON);
    const lost = deals.filter(d => d.status === WIN_STATUS.LOST);
    const decidedDeals = won.length + lost.length;

    if (decidedDeals === 0) {
      return {
        success: true,
        totalDeals: deals.length,
        decidedDeals: 0,
        winRate: null,
        message: 'No decided deals'
      };
    }

    const winRate = (won.length / decidedDeals) * 100;
    const wonAmount = won.reduce((sum, d) => sum + (d.amount || 0), 0);
    const lostAmount = lost.reduce((sum, d) => sum + (d.amount || 0), 0);
    const valueWinRate = wonAmount + lostAmount > 0
      ? (wonAmount / (wonAmount + lostAmount)) * 100
      : null;

    return {
      success: true,
      totalDeals: deals.length,
      decidedDeals,
      won: won.length,
      lost: lost.length,
      winRate: Math.round(winRate * 10) / 10,
      valueWinRate: valueWinRate ? Math.round(valueWinRate * 10) / 10 : null,
      wonAmount,
      lostAmount,
      avgWonDealSize: won.length > 0 ? Math.round(wonAmount / won.length) : 0,
      avgLostDealSize: lost.length > 0 ? Math.round(lostAmount / lost.length) : 0,
      strength: this.classifyStrength(winRate),
      statistically_significant: decidedDeals >= this.minDeals
    };
  }

  /**
   * Classify competitive strength based on win rate
   *
   * @param {number} winRate - Win rate percentage
   * @returns {string} Strength classification
   */
  classifyStrength(winRate) {
    if (winRate >= 70) return COMPETITIVE_STRENGTH.DOMINANT;
    if (winRate >= 55) return COMPETITIVE_STRENGTH.STRONG;
    if (winRate >= 45) return COMPETITIVE_STRENGTH.COMPETITIVE;
    if (winRate >= 30) return COMPETITIVE_STRENGTH.WEAK;
    return COMPETITIVE_STRENGTH.VULNERABLE;
  }

  /**
   * Calculate win rates by competitor
   *
   * @param {Array<{competitor: string, status: string, amount?: number, closeDate?: string}>} deals - Deal data
   * @returns {Object} Win rates by competitor
   */
  calculateByCompetitor(deals) {
    if (!Array.isArray(deals) || deals.length === 0) {
      return { success: false, error: 'No deals provided' };
    }

    // Group by competitor
    const byCompetitor = {};
    for (const deal of deals) {
      const competitor = deal.competitor || 'Unknown';
      if (!byCompetitor[competitor]) {
        byCompetitor[competitor] = [];
      }
      byCompetitor[competitor].push(deal);
    }

    // Calculate win rate for each competitor
    const competitorStats = {};
    for (const [competitor, competitorDeals] of Object.entries(byCompetitor)) {
      competitorStats[competitor] = this.calculateWinRate(competitorDeals);
    }

    // Rank competitors by win rate
    const ranked = Object.entries(competitorStats)
      .filter(([_, stats]) => stats.success && stats.winRate !== null)
      .map(([competitor, stats]) => ({
        competitor,
        winRate: stats.winRate,
        valueWinRate: stats.valueWinRate,
        dealCount: stats.decidedDeals,
        strength: stats.strength,
        significant: stats.statistically_significant
      }))
      .sort((a, b) => b.winRate - a.winRate);

    // Identify strongest and weakest
    const significant = ranked.filter(r => r.significant);
    const strongest = significant[0] || null;
    const weakest = significant[significant.length - 1] || null;

    // Calculate overall
    const overall = this.calculateWinRate(deals);

    return {
      success: true,
      overall,
      byCompetitor: competitorStats,
      ranking: ranked,
      strongest: strongest ? {
        competitor: strongest.competitor,
        winRate: strongest.winRate,
        strength: strongest.strength
      } : null,
      weakest: weakest ? {
        competitor: weakest.competitor,
        winRate: weakest.winRate,
        strength: weakest.strength
      } : null,
      insights: this.generateCompetitorInsights(ranked, overall)
    };
  }

  /**
   * Analyze win rate trends over time
   *
   * @param {Array<{competitor?: string, status: string, closeDate: string, amount?: number}>} deals - Deal data
   * @param {string} [period='quarter'] - Period granularity: 'month', 'quarter', 'year'
   * @returns {Object} Trend analysis
   */
  analyzeTrends(deals, period = 'quarter') {
    if (!Array.isArray(deals) || deals.length === 0) {
      return { success: false, error: 'No deals provided' };
    }

    // Filter deals with dates
    const datedDeals = deals.filter(d => d.closeDate);
    if (datedDeals.length === 0) {
      return { success: false, error: 'No deals with close dates' };
    }

    // Group by period
    const byPeriod = {};
    for (const deal of datedDeals) {
      const periodKey = this.getPeriodKey(deal.closeDate, period);
      if (!byPeriod[periodKey]) {
        byPeriod[periodKey] = [];
      }
      byPeriod[periodKey].push(deal);
    }

    // Calculate win rate for each period
    const periodStats = {};
    for (const [periodKey, periodDeals] of Object.entries(byPeriod)) {
      periodStats[periodKey] = this.calculateWinRate(periodDeals);
    }

    // Sort periods chronologically
    const sortedPeriods = Object.keys(periodStats).sort();

    // Calculate overall trend
    const trendData = sortedPeriods
      .filter(p => periodStats[p].winRate !== null)
      .map(p => ({
        period: p,
        winRate: periodStats[p].winRate,
        dealCount: periodStats[p].decidedDeals
      }));

    const trend = this.calculateTrend(trendData);

    // Calculate by competitor over time if competitor data exists
    const competitorTrends = {};
    const competitors = [...new Set(deals.map(d => d.competitor).filter(Boolean))];

    for (const competitor of competitors) {
      const competitorDeals = deals.filter(d => d.competitor === competitor);
      const competitorByPeriod = {};

      for (const deal of competitorDeals.filter(d => d.closeDate)) {
        const periodKey = this.getPeriodKey(deal.closeDate, period);
        if (!competitorByPeriod[periodKey]) {
          competitorByPeriod[periodKey] = [];
        }
        competitorByPeriod[periodKey].push(deal);
      }

      const competitorPeriodStats = {};
      for (const [periodKey, periodDeals] of Object.entries(competitorByPeriod)) {
        competitorPeriodStats[periodKey] = this.calculateWinRate(periodDeals);
      }

      const competitorTrendData = Object.keys(competitorPeriodStats)
        .sort()
        .filter(p => competitorPeriodStats[p].winRate !== null)
        .map(p => ({
          period: p,
          winRate: competitorPeriodStats[p].winRate,
          dealCount: competitorPeriodStats[p].decidedDeals
        }));

      competitorTrends[competitor] = {
        periods: competitorPeriodStats,
        trend: this.calculateTrend(competitorTrendData)
      };
    }

    return {
      success: true,
      periodGranularity: period,
      periodCount: sortedPeriods.length,
      periods: periodStats,
      trendData,
      overallTrend: trend,
      byCompetitor: competitorTrends,
      recommendations: this.generateTrendRecommendations(trend, competitorTrends)
    };
  }

  /**
   * Get period key from date
   *
   * @param {string} dateStr - Date string
   * @param {string} period - Period type
   * @returns {string} Period key
   */
  getPeriodKey(dateStr, period) {
    const date = new Date(dateStr);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;

    switch (period) {
      case 'month':
        return `${year}-${String(month).padStart(2, '0')}`;
      case 'quarter':
        const quarter = Math.ceil(month / 3);
        return `${year}-Q${quarter}`;
      case 'year':
        return `${year}`;
      default:
        return `${year}-Q${Math.ceil(month / 3)}`;
    }
  }

  /**
   * Calculate trend from period data
   *
   * @param {Array<{period: string, winRate: number}>} trendData - Period data
   * @returns {Object} Trend analysis
   */
  calculateTrend(trendData) {
    if (trendData.length < 2) {
      return {
        type: TREND.STABLE,
        confidence: 0,
        change: 0,
        message: 'Insufficient data for trend analysis'
      };
    }

    // Use last N periods for recent trend
    const recentData = trendData.slice(-this.trendPeriods);

    if (recentData.length < 2) {
      return {
        type: TREND.STABLE,
        confidence: 0.5,
        change: 0,
        message: 'Limited trend data'
      };
    }

    // Calculate linear regression
    const n = recentData.length;
    const x = Array.from({ length: n }, (_, i) => i);
    const y = recentData.map(d => d.winRate);

    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const avgWinRate = sumY / n;

    // Calculate R-squared
    const yMean = avgWinRate;
    const ssTotal = y.reduce((sum, yi) => sum + Math.pow(yi - yMean, 2), 0);
    const yPred = x.map(xi => avgWinRate + slope * (xi - (n - 1) / 2));
    const ssRes = y.reduce((sum, yi, i) => sum + Math.pow(yi - yPred[i], 2), 0);
    const rSquared = ssTotal > 0 ? 1 - (ssRes / ssTotal) : 0;

    // Determine trend type
    const changePerPeriod = slope;
    const totalChange = slope * (n - 1);
    let type;

    if (Math.abs(totalChange) < 5) {
      type = TREND.STABLE;
    } else if (totalChange > 0) {
      type = TREND.IMPROVING;
    } else {
      type = TREND.DECLINING;
    }

    return {
      type,
      confidence: Math.max(0, Math.min(1, rSquared)),
      changePerPeriod: Math.round(changePerPeriod * 10) / 10,
      totalChange: Math.round(totalChange * 10) / 10,
      startWinRate: recentData[0].winRate,
      endWinRate: recentData[recentData.length - 1].winRate,
      avgWinRate: Math.round(avgWinRate * 10) / 10,
      periodsAnalyzed: n,
      message: this.getTrendMessage(type, totalChange)
    };
  }

  /**
   * Get trend message
   *
   * @param {string} type - Trend type
   * @param {number} change - Total change
   * @returns {string} Trend message
   */
  getTrendMessage(type, change) {
    switch (type) {
      case TREND.IMPROVING:
        return `Win rate improving by ${Math.abs(change).toFixed(1)} percentage points`;
      case TREND.DECLINING:
        return `Win rate declining by ${Math.abs(change).toFixed(1)} percentage points`;
      default:
        return 'Win rate is stable';
    }
  }

  /**
   * Generate insights from competitor analysis
   *
   * @param {Array} ranked - Ranked competitors
   * @param {Object} overall - Overall stats
   * @returns {Array} Insights
   */
  generateCompetitorInsights(ranked, overall) {
    const insights = [];
    const significant = ranked.filter(r => r.significant);

    if (significant.length === 0) {
      insights.push({
        type: 'data_quality',
        message: 'Need more competitive deals for statistically significant insights',
        recommendation: 'Track competitor field on opportunities'
      });
      return insights;
    }

    // Identify dominant competitors
    const dominant = significant.filter(r => r.strength === COMPETITIVE_STRENGTH.DOMINANT);
    if (dominant.length > 0) {
      insights.push({
        type: 'strength',
        message: `Dominant against: ${dominant.map(r => r.competitor).join(', ')}`,
        recommendation: 'Leverage these wins in marketing and case studies'
      });
    }

    // Identify vulnerable competitors
    const vulnerable = significant.filter(r =>
      r.strength === COMPETITIVE_STRENGTH.WEAK ||
      r.strength === COMPETITIVE_STRENGTH.VULNERABLE
    );
    if (vulnerable.length > 0) {
      insights.push({
        type: 'weakness',
        message: `Struggling against: ${vulnerable.map(r => r.competitor).join(', ')}`,
        recommendation: 'Analyze lost deals for competitive positioning gaps'
      });
    }

    // Compare volume vs value win rates
    const valueDifferences = significant.filter(r =>
      r.valueWinRate && Math.abs(r.winRate - r.valueWinRate) > 10
    );
    for (const diff of valueDifferences) {
      if (diff.winRate > diff.valueWinRate) {
        insights.push({
          type: 'deal_size',
          message: `Winning more deals but losing larger deals against ${diff.competitor}`,
          recommendation: 'Focus on enterprise positioning for larger opportunities'
        });
      } else {
        insights.push({
          type: 'deal_size',
          message: `Winning larger deals against ${diff.competitor} despite lower deal count`,
          recommendation: 'Consider account-based strategy for this competitor'
        });
      }
    }

    return insights;
  }

  /**
   * Generate trend recommendations
   *
   * @param {Object} overallTrend - Overall trend
   * @param {Object} competitorTrends - By-competitor trends
   * @returns {Array} Recommendations
   */
  generateTrendRecommendations(overallTrend, competitorTrends) {
    const recommendations = [];

    // Overall trend recommendations
    if (overallTrend.type === TREND.DECLINING) {
      recommendations.push({
        priority: 'high',
        action: 'Investigate root cause of declining win rate',
        rationale: overallTrend.message,
        metrics: {
          startWinRate: overallTrend.startWinRate,
          endWinRate: overallTrend.endWinRate
        }
      });
    }

    // Competitor-specific recommendations
    const decliningAgainst = Object.entries(competitorTrends)
      .filter(([_, data]) => data.trend.type === TREND.DECLINING && data.trend.confidence > 0.5)
      .map(([competitor, data]) => ({ competitor, ...data.trend }));

    for (const declining of decliningAgainst) {
      recommendations.push({
        priority: 'medium',
        action: `Address declining performance against ${declining.competitor}`,
        rationale: `Win rate dropped ${Math.abs(declining.totalChange).toFixed(1)} points`,
        metrics: {
          startWinRate: declining.startWinRate,
          endWinRate: declining.endWinRate
        }
      });
    }

    // Identify improving positions to leverage
    const improvingAgainst = Object.entries(competitorTrends)
      .filter(([_, data]) => data.trend.type === TREND.IMPROVING && data.trend.confidence > 0.5)
      .map(([competitor, data]) => ({ competitor, ...data.trend }));

    if (improvingAgainst.length > 0) {
      recommendations.push({
        priority: 'low',
        action: 'Capitalize on improving competitive positions',
        rationale: `Gaining ground against: ${improvingAgainst.map(i => i.competitor).join(', ')}`,
        metrics: {
          competitors: improvingAgainst.map(i => ({
            name: i.competitor,
            improvement: i.totalChange
          }))
        }
      });
    }

    return recommendations;
  }

  /**
   * Analyze loss reasons by competitor
   *
   * @param {Array<{competitor: string, status: string, lossReason?: string}>} deals - Deals with loss reasons
   * @returns {Object} Loss reason analysis
   */
  analyzeLossReasons(deals) {
    const lostDeals = deals.filter(d =>
      d.status === WIN_STATUS.LOST && d.lossReason
    );

    if (lostDeals.length === 0) {
      return {
        success: false,
        error: 'No lost deals with loss reasons'
      };
    }

    // Group by competitor and loss reason
    const byCompetitor = {};
    const overallReasons = {};

    for (const deal of lostDeals) {
      const competitor = deal.competitor || 'Unknown';
      const reason = deal.lossReason;

      // By competitor
      if (!byCompetitor[competitor]) {
        byCompetitor[competitor] = {};
      }
      byCompetitor[competitor][reason] = (byCompetitor[competitor][reason] || 0) + 1;

      // Overall
      overallReasons[reason] = (overallReasons[reason] || 0) + 1;
    }

    // Calculate percentages
    const totalLost = lostDeals.length;
    const overallReasonsRanked = Object.entries(overallReasons)
      .map(([reason, count]) => ({
        reason,
        count,
        percentage: Math.round(count / totalLost * 100)
      }))
      .sort((a, b) => b.count - a.count);

    const byCompetitorRanked = {};
    for (const [competitor, reasons] of Object.entries(byCompetitor)) {
      const competitorTotal = Object.values(reasons).reduce((a, b) => a + b, 0);
      byCompetitorRanked[competitor] = Object.entries(reasons)
        .map(([reason, count]) => ({
          reason,
          count,
          percentage: Math.round(count / competitorTotal * 100)
        }))
        .sort((a, b) => b.count - a.count);
    }

    return {
      success: true,
      totalLostDeals: totalLost,
      overallReasons: overallReasonsRanked,
      byCompetitor: byCompetitorRanked,
      topReason: overallReasonsRanked[0] || null,
      insights: this.generateLossReasonInsights(overallReasonsRanked, byCompetitorRanked)
    };
  }

  /**
   * Generate loss reason insights
   *
   * @param {Array} overallReasons - Ranked reasons
   * @param {Object} byCompetitor - Reasons by competitor
   * @returns {Array} Insights
   */
  generateLossReasonInsights(overallReasons, byCompetitor) {
    const insights = [];

    // Top overall reason
    if (overallReasons.length > 0 && overallReasons[0].percentage > 25) {
      insights.push({
        type: 'dominant_loss_reason',
        message: `"${overallReasons[0].reason}" accounts for ${overallReasons[0].percentage}% of losses`,
        recommendation: 'Prioritize addressing this issue across all competitive situations'
      });
    }

    // Competitor-specific patterns
    for (const [competitor, reasons] of Object.entries(byCompetitor)) {
      if (reasons.length > 0 && reasons[0].percentage > 40) {
        insights.push({
          type: 'competitor_pattern',
          message: `Against ${competitor}, "${reasons[0].reason}" is the primary loss factor (${reasons[0].percentage}%)`,
          recommendation: `Develop specific counter-positioning for ${competitor}`
        });
      }
    }

    return insights;
  }
}

// CLI Interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  const printUsage = () => {
    console.log(`
Competitive Win Rate Calculator

Usage:
  competitive-win-rate.js overall <data-file.json>
  competitive-win-rate.js by-competitor <data-file.json>
  competitive-win-rate.js trends <data-file.json> [--period month|quarter|year]
  competitive-win-rate.js loss-reasons <data-file.json>

Commands:
  overall         Calculate overall win rate
  by-competitor   Calculate win rates by competitor
  trends          Analyze win rate trends over time
  loss-reasons    Analyze loss reasons by competitor

Options:
  --period <type>   Period granularity for trends (default: quarter)
  --min-deals <n>   Minimum deals for significance (default: 5)
  --output <path>   Output file path

Examples:
  competitive-win-rate.js by-competitor ./deals.json
  competitive-win-rate.js trends ./deals.json --period month --output ./trends.json
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

  const period = getArg('--period') || 'quarter';
  const minDeals = getArg('--min-deals') ? parseInt(getArg('--min-deals')) : 5;
  const outputPath = getArg('--output');

  const calculator = new CompetitiveWinRateCalculator({ minDeals });

  try {
    const dataFile = args[1];
    if (!dataFile) {
      console.error('Error: Data file required');
      printUsage();
      process.exit(1);
    }

    const deals = JSON.parse(fs.readFileSync(dataFile, 'utf-8'));
    let result;

    switch (command) {
      case 'overall':
        result = calculator.calculateWinRate(deals);
        break;
      case 'by-competitor':
        result = calculator.calculateByCompetitor(deals);
        break;
      case 'trends':
        result = calculator.analyzeTrends(deals, period);
        break;
      case 'loss-reasons':
        result = calculator.analyzeLossReasons(deals);
        break;
      default:
        console.error(`Unknown command: ${command}`);
        printUsage();
        process.exit(1);
    }

    if (outputPath) {
      fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
      console.log(`Results saved to: ${outputPath}`);
    } else {
      console.log(JSON.stringify(result, null, 2));
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

module.exports = {
  CompetitiveWinRateCalculator,
  WIN_STATUS,
  COMPETITIVE_STRENGTH,
  TREND
};
