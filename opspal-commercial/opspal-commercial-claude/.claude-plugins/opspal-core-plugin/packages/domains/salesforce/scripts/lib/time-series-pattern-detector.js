#!/usr/bin/env node
/**
 * Time-Series Pattern Detector
 *
 * Analyzes time-series data to detect patterns:
 * - Active vs abandoned systems
 * - Adoption trends (growing, stable, declining)
 * - Migration events
 * - System consolidation
 *
 * CRITICAL: Prevents misinterpreting historical data as current usage.
 * Addresses error E003: "Historical vs Active Pattern Misinterpretation"
 *
 * @module time-series-pattern-detector
 * @version 1.0.0
 * @created 2025-10-03
 */

/**
 * Pattern classifications
 */
const PATTERNS = {
  ACTIVE: 'active',                 // Regular recent activity
  DECLINING: 'declining',           // Decreasing activity over time
  ABANDONED: 'abandoned',           // No activity for extended period
  GROWING: 'growing',               // Increasing activity over time
  STABLE: 'stable',                 // Consistent activity level
  MIGRATED: 'migrated',             // Abrupt stop suggesting migration
  SEASONAL: 'seasonal'              // Periodic fluctuations
};

/**
 * Detect pattern from time-series data
 *
 * @param {Array} timeSeries - Array of {period, count} objects
 * @param {Object} options - Detection options
 * @returns {Object} Pattern detection result
 */
function detectPattern(timeSeries, options = {}) {
  const {
    abandonmentThresholdMonths = 3,
    minActivityThreshold = 1,
    recentPeriods = 6
  } = options;

  if (!Array.isArray(timeSeries) || timeSeries.length === 0) {
    return {
      pattern: null,
      confidence: 0,
      message: 'Insufficient data for pattern detection'
    };
  }

  // Sort by period (newest first)
  const sorted = [...timeSeries].sort((a, b) => {
    const periodA = parsePeriod(a.period || a.month || a.year);
    const periodB = parsePeriod(b.period || b.month || b.year);
    return periodB - periodA;
  });

  // Get recent periods
  const recent = sorted.slice(0, recentPeriods);
  const older = sorted.slice(recentPeriods);

  // Check for abandonment
  const consecutiveZeros = countConsecutiveZeros(recent);
  if (consecutiveZeros >= abandonmentThresholdMonths) {
    const lastActivity = findLastActivity(sorted);
    return {
      pattern: PATTERNS.ABANDONED,
      confidence: 0.95,
      lastActivityDate: lastActivity ? lastActivity.period : null,
      consecutiveZeroMonths: consecutiveZeros,
      message: `System appears abandoned. ${consecutiveZeros} consecutive periods with zero activity.`,
      recommendation: 'Verify if system was intentionally deprecated. Check for migration to alternative.'
    };
  }

  // Check for migration (abrupt stop)
  const migrationPoint = detectMigration(sorted, abandonmentThresholdMonths);
  if (migrationPoint) {
    return {
      pattern: PATTERNS.MIGRATED,
      confidence: 0.85,
      migrationDate: migrationPoint.period,
      lastActivity: migrationPoint.count,
      message: `Abrupt activity stop detected at ${migrationPoint.period}. Suggests system migration.`,
      recommendation: 'Investigate what replaced this system. Document migration timeline.'
    };
  }

  // Calculate trend
  const trend = calculateTrend(recent);

  if (trend.slope > 0.2) {
    return {
      pattern: PATTERNS.GROWING,
      confidence: trend.confidence,
      growthRate: Math.round(trend.slope * 100) + '%',
      recentAverage: trend.average,
      message: 'System usage is growing',
      recommendation: 'Monitor capacity and plan for increased load'
    };
  }

  if (trend.slope < -0.2) {
    return {
      pattern: PATTERNS.DECLINING,
      confidence: trend.confidence,
      declineRate: Math.round(Math.abs(trend.slope) * 100) + '%',
      recentAverage: trend.average,
      message: 'System usage is declining',
      recommendation: 'Investigate cause. Check if users migrating to alternative system.'
    };
  }

  // Check for stable activity
  const recentAvg = calculateAverage(recent);
  if (recentAvg >= minActivityThreshold) {
    return {
      pattern: PATTERNS.STABLE,
      confidence: 0.8,
      averageActivity: Math.round(recentAvg),
      message: 'System usage is stable and active',
      recommendation: 'Continue monitoring. System is healthy.'
    };
  }

  return {
    pattern: PATTERNS.ACTIVE,
    confidence: 0.7,
    recentActivity: recentAvg,
    message: 'System shows activity but pattern unclear',
    recommendation: 'Collect more data points for clearer pattern'
  };
}

/**
 * Detect if system has been abandoned
 *
 * @param {Array} timeSeries - Time series data
 * @param {number} thresholdMonths - Months of zero activity to consider abandoned
 * @returns {Object} Abandonment analysis
 */
function detectAbandonment(timeSeries, thresholdMonths = 3) {
  const sorted = [...timeSeries].sort((a, b) => {
    return parsePeriod(b.period) - parsePeriod(a.period);
  });

  const consecutiveZeros = countConsecutiveZeros(sorted);
  const lastActivity = findLastActivity(sorted);

  return {
    isAbandoned: consecutiveZeros >= thresholdMonths,
    consecutiveZeroMonths: consecutiveZeros,
    lastActivityDate: lastActivity ? lastActivity.period : null,
    lastActivityCount: lastActivity ? lastActivity.count : 0,
    thresholdMonths
  };
}

/**
 * Analyze recency of data
 *
 * @param {Object} data - Data with CreatedDate or similar timestamp field
 * @param {string} dateField - Name of the date field
 * @returns {Object} Recency analysis
 */
function analyzeRecency(data, dateField = 'CreatedDate') {
  if (!Array.isArray(data) || data.length === 0) {
    return {
      mostRecent: null,
      leastRecent: null,
      daysSinceLatest: null,
      isRecent: false,
      message: 'No data to analyze'
    };
  }

  const dates = data
    .map(record => record[dateField])
    .filter(date => date !== null && date !== undefined)
    .map(date => new Date(date))
    .sort((a, b) => b - a);

  if (dates.length === 0) {
    return {
      mostRecent: null,
      leastRecent: null,
      daysSinceLatest: null,
      isRecent: false,
      message: `No valid ${dateField} values found`
    };
  }

  const mostRecent = dates[0];
  const leastRecent = dates[dates.length - 1];
  const now = new Date();
  const daysSinceLatest = Math.floor((now - mostRecent) / (1000 * 60 * 60 * 24));

  return {
    mostRecent: mostRecent.toISOString().split('T')[0],
    leastRecent: leastRecent.toISOString().split('T')[0],
    daysSinceLatest,
    isRecent: daysSinceLatest <= 30,
    age: daysSinceLatest <= 7 ? 'very recent' :
         daysSinceLatest <= 30 ? 'recent' :
         daysSinceLatest <= 90 ? 'somewhat recent' :
         daysSinceLatest <= 180 ? 'aging' :
         'old',
    message: `Latest record: ${mostRecent.toISOString().split('T')[0]} (${daysSinceLatest} days ago)`
  };
}

/**
 * Compare two systems to determine adoption patterns
 *
 * @param {Object} systemA - System A metrics
 * @param {Object} systemB - System B metrics
 * @returns {Object} Comparison result
 */
function compareSystemAdoption(systemA, systemB) {
  const patternA = detectPattern(systemA.timeSeries || []);
  const patternB = detectPattern(systemB.timeSeries || []);

  const result = {
    systemA: {
      name: systemA.name,
      pattern: patternA.pattern,
      active: patternA.pattern !== PATTERNS.ABANDONED
    },
    systemB: {
      name: systemB.name,
      pattern: patternB.pattern,
      active: patternB.pattern !== PATTERNS.ABANDONED
    }
  };

  // Determine relationship
  if (result.systemA.active && !result.systemB.active) {
    result.relationship = 'migration_to_a';
    result.message = `${systemB.name} abandoned, ${systemA.name} active. Migration from B→A detected.`;
  } else if (!result.systemA.active && result.systemB.active) {
    result.relationship = 'migration_to_b';
    result.message = `${systemA.name} abandoned, ${systemB.name} active. Migration from A→B detected.`;
  } else if (result.systemA.active && result.systemB.active) {
    result.relationship = 'dual_active';
    result.message = `Both systems actively used. Dual-system pattern detected.`;
  } else {
    result.relationship = 'both_abandoned';
    result.message = `Both systems appear abandoned. Investigate replacement.`;
  }

  return result;
}

// Helper functions

function parsePeriod(period) {
  if (typeof period === 'number') return period;
  if (typeof period === 'string') {
    // Handle formats like "2025-01", "2025-01-15", etc.
    return new Date(period).getTime();
  }
  return 0;
}

function countConsecutiveZeros(sorted) {
  let count = 0;
  for (const item of sorted) {
    const value = item.count || item.cnt || item.value || 0;
    if (value === 0) {
      count++;
    } else {
      break;
    }
  }
  return count;
}

function findLastActivity(sorted) {
  return sorted.find(item => {
    const value = item.count || item.cnt || item.value || 0;
    return value > 0;
  });
}

function detectMigration(sorted, thresholdMonths) {
  // Look for abrupt stop: active for several months, then sudden zeros
  for (let i = 0; i < sorted.length - thresholdMonths; i++) {
    const current = sorted[i].count || sorted[i].cnt || 0;
    const next = sorted[i + 1].count || sorted[i + 1].cnt || 0;

    // If current period has zero but next had activity
    if (current === 0 && next > 0) {
      // Check if zeros continue for threshold months
      const zerosAhead = countConsecutiveZeros(sorted.slice(i));
      if (zerosAhead >= thresholdMonths) {
        return sorted[i + 1];
      }
    }
  }
  return null;
}

function calculateTrend(data) {
  if (data.length < 2) {
    return { slope: 0, average: 0, confidence: 0 };
  }

  const values = data.map(d => d.count || d.cnt || d.value || 0);
  const n = values.length;
  const x = Array.from({ length: n }, (_, i) => i);

  // Linear regression
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = values.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((sum, xi, i) => sum + xi * values[i], 0);
  const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const average = sumY / n;

  // Calculate R-squared for confidence
  const yMean = average;
  const ssTotal = values.reduce((sum, yi) => sum + Math.pow(yi - yMean, 2), 0);
  const yPred = x.map(xi => average + slope * xi);
  const ssRes = values.reduce((sum, yi, i) => sum + Math.pow(yi - yPred[i], 2), 0);
  const rSquared = 1 - (ssRes / ssTotal);

  return {
    slope,
    average,
    confidence: Math.max(0, Math.min(1, rSquared))
  };
}

function calculateAverage(data) {
  if (data.length === 0) return 0;
  const sum = data.reduce((total, item) => {
    return total + (item.count || item.cnt || item.value || 0);
  }, 0);
  return sum / data.length;
}

// CLI Interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === 'detect') {
    const dataFile = args[1];
    if (!dataFile) {
      console.error('Usage: time-series-pattern-detector.js detect <data-file.json>');
      process.exit(1);
    }

    const fs = require('fs');
    const timeSeries = JSON.parse(fs.readFileSync(dataFile, 'utf-8'));

    const result = detectPattern(timeSeries);
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  }

  if (command === 'compare') {
    const systemAFile = args[1];
    const systemBFile = args[2];

    if (!systemAFile || !systemBFile) {
      console.error('Usage: time-series-pattern-detector.js compare <system-a.json> <system-b.json>');
      process.exit(1);
    }

    const fs = require('fs');
    const systemA = JSON.parse(fs.readFileSync(systemAFile, 'utf-8'));
    const systemB = JSON.parse(fs.readFileSync(systemBFile, 'utf-8'));

    const result = compareSystemAdoption(systemA, systemB);
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  }

  console.error('Usage:');
  console.error('  time-series-pattern-detector.js detect <data-file.json>');
  console.error('  time-series-pattern-detector.js compare <system-a.json> <system-b.json>');
  process.exit(1);
}

module.exports = {
  detectPattern,
  detectAbandonment,
  analyzeRecency,
  compareSystemAdoption,
  PATTERNS
};
