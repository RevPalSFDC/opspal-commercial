#!/usr/bin/env node
/**
 * Stage Velocity Analyzer
 *
 * Analyzes time-in-stage patterns for opportunities and other staged records.
 * Identifies bottlenecks, calculates velocity metrics, and provides recommendations.
 *
 * @module stage-velocity-analyzer
 * @version 1.0.0
 * @created 2026-01-25
 */

const fs = require('fs');
const path = require('path');

/**
 * Bottleneck severity levels
 */
const SEVERITY = {
  CRITICAL: 'critical',  // >2x expected time
  HIGH: 'high',          // 1.5-2x expected time
  MEDIUM: 'medium',      // 1.2-1.5x expected time
  LOW: 'low'             // Normal variance
};

/**
 * Stage velocity status
 */
const STATUS = {
  HEALTHY: 'healthy',
  SLOW: 'slow',
  BOTTLENECK: 'bottleneck',
  STALLED: 'stalled'
};

/**
 * StageVelocityAnalyzer class
 */
class StageVelocityAnalyzer {
  /**
   * Initialize analyzer
   *
   * @param {Object} config - Configuration options
   * @param {Object} [config.expectedDays={}] - Expected days per stage
   * @param {number} [config.bottleneckMultiplier=1.5] - Multiplier for bottleneck detection
   * @param {number} [config.stalledDays=30] - Days to consider "stalled"
   */
  constructor(config = {}) {
    this.expectedDays = config.expectedDays ?? {};
    this.bottleneckMultiplier = config.bottleneckMultiplier ?? 1.5;
    this.stalledDays = config.stalledDays ?? 30;
  }

  /**
   * Set expected days for stages
   *
   * @param {Object} expectedDays - Map of stage to expected days
   */
  setExpectedDays(expectedDays) {
    this.expectedDays = { ...this.expectedDays, ...expectedDays };
  }

  /**
   * Calculate velocity for a single record's stage history
   *
   * @param {Array<{stage: string, enteredDate: string, exitedDate?: string}>} stageHistory - Stage transitions
   * @returns {Object} Velocity analysis
   */
  calculateRecordVelocity(stageHistory) {
    if (!Array.isArray(stageHistory) || stageHistory.length === 0) {
      return { success: false, error: 'No stage history provided' };
    }

    const stages = [];
    const now = new Date();

    for (let i = 0; i < stageHistory.length; i++) {
      const entry = stageHistory[i];
      const enteredDate = new Date(entry.enteredDate);
      const exitedDate = entry.exitedDate ? new Date(entry.exitedDate) : (i === stageHistory.length - 1 ? now : null);

      if (!exitedDate) continue;

      const daysInStage = Math.round((exitedDate - enteredDate) / (1000 * 60 * 60 * 24));
      const expectedDays = this.expectedDays[entry.stage] || null;

      let status = STATUS.HEALTHY;
      let severity = SEVERITY.LOW;

      if (expectedDays) {
        const ratio = daysInStage / expectedDays;
        if (ratio > 2) {
          status = STATUS.STALLED;
          severity = SEVERITY.CRITICAL;
        } else if (ratio > this.bottleneckMultiplier) {
          status = STATUS.BOTTLENECK;
          severity = SEVERITY.HIGH;
        } else if (ratio > 1.2) {
          status = STATUS.SLOW;
          severity = SEVERITY.MEDIUM;
        }
      } else if (daysInStage > this.stalledDays) {
        status = STATUS.STALLED;
        severity = SEVERITY.HIGH;
      }

      stages.push({
        stage: entry.stage,
        enteredDate: entry.enteredDate,
        exitedDate: entry.exitedDate || 'current',
        daysInStage,
        expectedDays,
        variancePercent: expectedDays ? Math.round((daysInStage - expectedDays) / expectedDays * 100) : null,
        status,
        severity
      });
    }

    const totalDays = stages.reduce((sum, s) => sum + s.daysInStage, 0);
    const bottleneckStages = stages.filter(s => s.status === STATUS.BOTTLENECK || s.status === STATUS.STALLED);

    return {
      success: true,
      stages,
      totalDays,
      stageCount: stages.length,
      bottleneckCount: bottleneckStages.length,
      bottleneckStages: bottleneckStages.map(s => s.stage),
      averageDaysPerStage: Math.round(totalDays / stages.length)
    };
  }

  /**
   * Analyze velocity across multiple records
   *
   * @param {Array<{id: string, stageHistory: Array}>} records - Records with stage history
   * @returns {Object} Aggregate velocity analysis
   */
  analyzeVelocity(records) {
    if (!Array.isArray(records) || records.length === 0) {
      return { success: false, error: 'No records provided' };
    }

    const recordResults = records.map(record => ({
      id: record.id,
      ...this.calculateRecordVelocity(record.stageHistory)
    })).filter(r => r.success);

    if (recordResults.length === 0) {
      return { success: false, error: 'No valid records to analyze' };
    }

    // Aggregate by stage
    const stageStats = {};

    for (const result of recordResults) {
      for (const stage of result.stages) {
        if (!stageStats[stage.stage]) {
          stageStats[stage.stage] = {
            stage: stage.stage,
            recordCount: 0,
            totalDays: 0,
            daysArray: [],
            expectedDays: stage.expectedDays,
            bottleneckCount: 0,
            stalledCount: 0
          };
        }

        stageStats[stage.stage].recordCount++;
        stageStats[stage.stage].totalDays += stage.daysInStage;
        stageStats[stage.stage].daysArray.push(stage.daysInStage);

        if (stage.status === STATUS.BOTTLENECK) stageStats[stage.stage].bottleneckCount++;
        if (stage.status === STATUS.STALLED) stageStats[stage.stage].stalledCount++;
      }
    }

    // Calculate stage metrics
    const stageMetrics = Object.values(stageStats).map(stat => {
      const avgDays = Math.round(stat.totalDays / stat.recordCount);
      const sortedDays = stat.daysArray.sort((a, b) => a - b);
      const medianDays = sortedDays[Math.floor(sortedDays.length / 2)];
      const p90Days = sortedDays[Math.floor(sortedDays.length * 0.9)];

      // Calculate standard deviation
      const variance = stat.daysArray.reduce((sum, d) => sum + Math.pow(d - avgDays, 2), 0) / stat.daysArray.length;
      const stdDev = Math.sqrt(variance);

      return {
        stage: stat.stage,
        recordCount: stat.recordCount,
        avgDays,
        medianDays,
        p90Days,
        minDays: Math.min(...stat.daysArray),
        maxDays: Math.max(...stat.daysArray),
        stdDev: Math.round(stdDev * 10) / 10,
        expectedDays: stat.expectedDays,
        varianceFromExpected: stat.expectedDays ? Math.round((avgDays - stat.expectedDays) / stat.expectedDays * 100) : null,
        bottleneckRate: Math.round(stat.bottleneckCount / stat.recordCount * 100),
        stalledRate: Math.round(stat.stalledCount / stat.recordCount * 100)
      };
    });

    // Identify bottlenecks
    const bottlenecks = this.identifyBottlenecks(stageMetrics);

    // Calculate overall metrics
    const totalAvgDays = recordResults.reduce((sum, r) => sum + r.totalDays, 0) / recordResults.length;
    const avgStagesPerRecord = recordResults.reduce((sum, r) => sum + r.stageCount, 0) / recordResults.length;

    // Generate recommendations
    const recommendations = this.generateRecommendations(stageMetrics, bottlenecks);

    return {
      success: true,
      recordCount: recordResults.length,
      overallMetrics: {
        avgTotalDays: Math.round(totalAvgDays),
        avgStagesPerRecord: Math.round(avgStagesPerRecord * 10) / 10,
        totalBottlenecks: bottlenecks.length
      },
      stageMetrics,
      bottlenecks,
      recommendations,
      recordDetails: recordResults
    };
  }

  /**
   * Identify bottleneck stages
   *
   * @param {Array} stageMetrics - Stage-level metrics
   * @returns {Array} Identified bottlenecks
   */
  identifyBottlenecks(stageMetrics) {
    const bottlenecks = [];

    for (const stage of stageMetrics) {
      const issues = [];
      let severity = SEVERITY.LOW;

      // Check against expected days
      if (stage.expectedDays && stage.avgDays > stage.expectedDays * this.bottleneckMultiplier) {
        issues.push(`Average ${stage.avgDays} days exceeds expected ${stage.expectedDays} days`);
        severity = stage.avgDays > stage.expectedDays * 2 ? SEVERITY.CRITICAL : SEVERITY.HIGH;
      }

      // Check bottleneck rate
      if (stage.bottleneckRate > 30) {
        issues.push(`${stage.bottleneckRate}% of records bottleneck at this stage`);
        if (severity === SEVERITY.LOW) severity = SEVERITY.MEDIUM;
      }

      // Check stalled rate
      if (stage.stalledRate > 10) {
        issues.push(`${stage.stalledRate}% of records stall at this stage`);
        severity = SEVERITY.HIGH;
      }

      // Check high variance
      if (stage.stdDev > stage.avgDays * 0.5) {
        issues.push('High variance in stage duration suggests inconsistent process');
        if (severity === SEVERITY.LOW) severity = SEVERITY.MEDIUM;
      }

      // Check P90 outliers
      if (stage.p90Days > stage.avgDays * 2) {
        issues.push(`P90 (${stage.p90Days} days) is significantly higher than average`);
        if (severity === SEVERITY.LOW) severity = SEVERITY.MEDIUM;
      }

      if (issues.length > 0) {
        bottlenecks.push({
          stage: stage.stage,
          severity,
          avgDays: stage.avgDays,
          expectedDays: stage.expectedDays,
          issues,
          impact: this.calculateBottleneckImpact(stage)
        });
      }
    }

    // Sort by severity (critical first)
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    return bottlenecks.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
  }

  /**
   * Calculate bottleneck impact
   *
   * @param {Object} stageMetrics - Metrics for the stage
   * @returns {Object} Impact assessment
   */
  calculateBottleneckImpact(stageMetrics) {
    const daysSaved = stageMetrics.expectedDays
      ? (stageMetrics.avgDays - stageMetrics.expectedDays) * stageMetrics.recordCount
      : 0;

    return {
      totalExcessDays: daysSaved,
      affectedRecords: stageMetrics.recordCount,
      potentialCycleSavings: stageMetrics.expectedDays
        ? `${Math.round((stageMetrics.avgDays - stageMetrics.expectedDays))} days per record`
        : 'Unknown (no benchmark)'
    };
  }

  /**
   * Generate actionable recommendations
   *
   * @param {Array} stageMetrics - Stage metrics
   * @param {Array} bottlenecks - Identified bottlenecks
   * @returns {Array} Recommendations
   */
  generateRecommendations(stageMetrics, bottlenecks) {
    const recommendations = [];

    // Address critical bottlenecks
    const criticalBottlenecks = bottlenecks.filter(b => b.severity === SEVERITY.CRITICAL);
    for (const bottleneck of criticalBottlenecks) {
      recommendations.push({
        priority: 'critical',
        stage: bottleneck.stage,
        action: `Immediately investigate "${bottleneck.stage}" stage process`,
        rationale: bottleneck.issues.join('; '),
        expectedImpact: bottleneck.impact.potentialCycleSavings
      });
    }

    // Address high bottlenecks
    const highBottlenecks = bottlenecks.filter(b => b.severity === SEVERITY.HIGH);
    for (const bottleneck of highBottlenecks) {
      recommendations.push({
        priority: 'high',
        stage: bottleneck.stage,
        action: `Review and optimize "${bottleneck.stage}" stage workflow`,
        rationale: bottleneck.issues.join('; '),
        expectedImpact: bottleneck.impact.potentialCycleSavings
      });
    }

    // Check for missing stage definitions
    const stagesWithoutExpected = stageMetrics.filter(s => !s.expectedDays);
    if (stagesWithoutExpected.length > stageMetrics.length * 0.5) {
      recommendations.push({
        priority: 'medium',
        stage: 'all',
        action: 'Define expected durations for all pipeline stages',
        rationale: `${stagesWithoutExpected.length} of ${stageMetrics.length} stages lack benchmarks`,
        expectedImpact: 'Enables proactive bottleneck detection'
      });
    }

    // Check for high-variance stages
    const highVarianceStages = stageMetrics.filter(s => s.stdDev > s.avgDays * 0.5);
    for (const stage of highVarianceStages) {
      recommendations.push({
        priority: 'medium',
        stage: stage.stage,
        action: `Standardize process for "${stage.stage}" stage`,
        rationale: `High variance (stdDev: ${stage.stdDev} days) indicates inconsistent handling`,
        expectedImpact: 'More predictable cycle times'
      });
    }

    return recommendations;
  }

  /**
   * Analyze velocity by segment (rep, region, product, etc.)
   *
   * @param {Object} segmentData - Data grouped by segment
   * @returns {Object} Segment comparison
   */
  compareSegments(segmentData) {
    const results = {};

    for (const [segment, records] of Object.entries(segmentData)) {
      results[segment] = this.analyzeVelocity(records);
    }

    // Rank segments by average cycle time
    const ranked = Object.entries(results)
      .filter(([_, r]) => r.success)
      .map(([segment, result]) => ({
        segment,
        avgCycleTime: result.overallMetrics.avgTotalDays,
        bottleneckCount: result.bottlenecks.length,
        recordCount: result.recordCount
      }))
      .sort((a, b) => a.avgCycleTime - b.avgCycleTime);

    return {
      segments: results,
      ranking: ranked,
      fastest: ranked[0]?.segment || null,
      slowest: ranked[ranked.length - 1]?.segment || null,
      comparison: this.generateSegmentComparison(ranked)
    };
  }

  /**
   * Generate segment comparison insights
   *
   * @param {Array} ranked - Ranked segments
   * @returns {Object} Comparison insights
   */
  generateSegmentComparison(ranked) {
    if (ranked.length < 2) {
      return { insights: ['Not enough segments for comparison'] };
    }

    const fastest = ranked[0];
    const slowest = ranked[ranked.length - 1];
    const avgCycleTime = ranked.reduce((sum, r) => sum + r.avgCycleTime, 0) / ranked.length;

    const insights = [];

    const gap = slowest.avgCycleTime - fastest.avgCycleTime;
    if (gap > 0) {
      insights.push(`Cycle time gap of ${gap} days between fastest (${fastest.segment}) and slowest (${slowest.segment})`);
    }

    const aboveAvg = ranked.filter(r => r.avgCycleTime > avgCycleTime * 1.2);
    if (aboveAvg.length > 0) {
      insights.push(`${aboveAvg.map(r => r.segment).join(', ')} running 20%+ slower than average`);
    }

    return {
      avgCycleTimeAcrossSegments: Math.round(avgCycleTime),
      cycleTimeGap: gap,
      insights
    };
  }
}

// CLI Interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  const printUsage = () => {
    console.log(`
Stage Velocity Analyzer

Usage:
  stage-velocity-analyzer.js analyze <data-file.json> [options]
  stage-velocity-analyzer.js compare <segments-file.json>
  stage-velocity-analyzer.js record <stage-history.json>

Commands:
  analyze     Analyze velocity across multiple records
  compare     Compare velocity across segments
  record      Analyze single record's stage history

Options:
  --expected <path>   JSON file with expected days per stage
  --stalled <days>    Days to consider stalled (default: 30)
  --output <path>     Output file path

Examples:
  stage-velocity-analyzer.js analyze ./opportunities.json --expected ./benchmarks.json
  stage-velocity-analyzer.js compare ./segments.json --output ./comparison.json
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

  const expectedPath = getArg('--expected');
  const stalledDays = getArg('--stalled') ? parseInt(getArg('--stalled')) : 30;
  const outputPath = getArg('--output');

  const expectedDays = expectedPath ? JSON.parse(fs.readFileSync(expectedPath, 'utf-8')) : {};
  const analyzer = new StageVelocityAnalyzer({ expectedDays, stalledDays });

  try {
    if (command === 'analyze') {
      const dataFile = args[1];
      if (!dataFile) {
        console.error('Error: Data file required');
        printUsage();
        process.exit(1);
      }

      const records = JSON.parse(fs.readFileSync(dataFile, 'utf-8'));
      const result = analyzer.analyzeVelocity(records);

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
      const result = analyzer.compareSegments(segmentData);

      if (outputPath) {
        fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
        console.log(`Results saved to: ${outputPath}`);
      } else {
        console.log(JSON.stringify(result, null, 2));
      }
    } else if (command === 'record') {
      const dataFile = args[1];
      if (!dataFile) {
        console.error('Error: Stage history file required');
        printUsage();
        process.exit(1);
      }

      const stageHistory = JSON.parse(fs.readFileSync(dataFile, 'utf-8'));
      const result = analyzer.calculateRecordVelocity(stageHistory);

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
  StageVelocityAnalyzer,
  SEVERITY,
  STATUS
};
