/**
 * Assessment History Tracker for Marketo
 *
 * Tracks and analyzes assessment history across instances:
 * - Store assessment results
 * - Track score trends over time
 * - Compare assessments across instances
 * - Generate progress reports
 *
 * @module assessment-history-tracker
 * @version 1.0.0
 */

'use strict';

const fs = require('fs');
const path = require('path');

// Assessment types supported
const ASSESSMENT_TYPES = {
  LEAD_QUALITY: 'lead_quality',
  PROGRAM_ROI: 'program_roi',
  AUTOMATION: 'automation',
  EMAIL_DELIVERABILITY: 'email_deliverability',
  SYNC_HEALTH: 'sync_health',
  DATA_HYGIENE: 'data_hygiene',
  FULL_AUDIT: 'full_audit',
};

// Default history directory
const DEFAULT_HISTORY_DIR = 'portals';

/**
 * Assessment record structure
 */
const createAssessmentRecord = (type, instanceId, data) => ({
  id: `${type}-${instanceId}-${Date.now()}`,
  type,
  instanceId,
  timestamp: new Date().toISOString(),
  score: data.score || null,
  metrics: data.metrics || {},
  issues: data.issues || [],
  recommendations: data.recommendations || [],
  summary: data.summary || '',
  duration: data.duration || null,
  reportPath: data.reportPath || null,
});

/**
 * Store an assessment result
 * @param {string} instanceId - Instance identifier
 * @param {string} type - Assessment type
 * @param {Object} data - Assessment data
 * @param {string} historyDir - History directory
 * @returns {Object} Stored record
 */
function storeAssessment(instanceId, type, data, historyDir = DEFAULT_HISTORY_DIR) {
  const record = createAssessmentRecord(type, instanceId, data);

  // Create directory structure
  const assessmentDir = path.join(historyDir, instanceId, 'assessments');
  if (!fs.existsSync(assessmentDir)) {
    fs.mkdirSync(assessmentDir, { recursive: true });
  }

  // Store individual assessment
  const filename = `${record.id}.json`;
  const filepath = path.join(assessmentDir, filename);
  fs.writeFileSync(filepath, JSON.stringify(record, null, 2));

  // Update index
  updateAssessmentIndex(instanceId, record, historyDir);

  return record;
}

/**
 * Update assessment index for quick lookups
 * @param {string} instanceId - Instance identifier
 * @param {Object} record - Assessment record
 * @param {string} historyDir - History directory
 */
function updateAssessmentIndex(instanceId, record, historyDir = DEFAULT_HISTORY_DIR) {
  const indexPath = path.join(historyDir, instanceId, 'assessments', 'index.json');

  let index = { assessments: [], lastUpdated: null };
  if (fs.existsSync(indexPath)) {
    try {
      index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    } catch {
      // Reset if corrupted
    }
  }

  // Add to index (summary only, not full record)
  index.assessments.unshift({
    id: record.id,
    type: record.type,
    timestamp: record.timestamp,
    score: record.score,
    issueCount: record.issues.length,
  });

  // Keep only last 200 entries
  if (index.assessments.length > 200) {
    index.assessments = index.assessments.slice(0, 200);
  }

  index.lastUpdated = new Date().toISOString();

  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
}

/**
 * Get assessment history for an instance
 * @param {string} instanceId - Instance identifier
 * @param {Object} options - Query options
 * @param {string} historyDir - History directory
 * @returns {Array} Assessment records
 */
function getHistory(instanceId, options = {}, historyDir = DEFAULT_HISTORY_DIR) {
  const indexPath = path.join(historyDir, instanceId, 'assessments', 'index.json');

  if (!fs.existsSync(indexPath)) {
    return [];
  }

  let index;
  try {
    index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  } catch {
    return [];
  }

  let results = index.assessments || [];

  // Filter by type
  if (options.type) {
    results = results.filter(a => a.type === options.type);
  }

  // Filter by date range
  if (options.since) {
    const sinceDate = new Date(options.since);
    results = results.filter(a => new Date(a.timestamp) >= sinceDate);
  }

  if (options.until) {
    const untilDate = new Date(options.until);
    results = results.filter(a => new Date(a.timestamp) <= untilDate);
  }

  // Limit results
  if (options.limit) {
    results = results.slice(0, options.limit);
  }

  // Load full records if requested
  if (options.full) {
    results = results.map(a => {
      const filepath = path.join(historyDir, instanceId, 'assessments', `${a.id}.json`);
      if (fs.existsSync(filepath)) {
        try {
          return JSON.parse(fs.readFileSync(filepath, 'utf8'));
        } catch {
          return a;
        }
      }
      return a;
    });
  }

  return results;
}

/**
 * Get a specific assessment record
 * @param {string} instanceId - Instance identifier
 * @param {string} assessmentId - Assessment ID
 * @param {string} historyDir - History directory
 * @returns {Object|null} Assessment record
 */
function getAssessment(instanceId, assessmentId, historyDir = DEFAULT_HISTORY_DIR) {
  const filepath = path.join(historyDir, instanceId, 'assessments', `${assessmentId}.json`);

  if (!fs.existsSync(filepath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(filepath, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Calculate score trends for an assessment type
 * @param {string} instanceId - Instance identifier
 * @param {string} type - Assessment type
 * @param {Object} options - Analysis options
 * @param {string} historyDir - History directory
 * @returns {Object} Trend analysis
 */
function calculateTrends(instanceId, type, options = {}, historyDir = DEFAULT_HISTORY_DIR) {
  const history = getHistory(instanceId, {
    type,
    limit: options.limit || 20,
  }, historyDir);

  if (history.length < 2) {
    return {
      instanceId,
      type,
      hasEnoughData: false,
      message: 'Not enough assessments for trend analysis',
    };
  }

  const scores = history.filter(a => a.score !== null).map(a => ({
    timestamp: a.timestamp,
    score: a.score,
  }));

  if (scores.length < 2) {
    return {
      instanceId,
      type,
      hasEnoughData: false,
      message: 'Not enough scored assessments for trend analysis',
    };
  }

  // Calculate statistics
  const allScores = scores.map(s => s.score);
  const avgScore = allScores.reduce((a, b) => a + b, 0) / allScores.length;
  const minScore = Math.min(...allScores);
  const maxScore = Math.max(...allScores);

  // Calculate trend direction
  const midpoint = Math.floor(scores.length / 2);
  const recentScores = scores.slice(0, midpoint).map(s => s.score);
  const olderScores = scores.slice(midpoint).map(s => s.score);

  const recentAvg = recentScores.reduce((a, b) => a + b, 0) / recentScores.length;
  const olderAvg = olderScores.reduce((a, b) => a + b, 0) / olderScores.length;

  let trend = 'stable';
  const change = recentAvg - olderAvg;
  if (change > 5) trend = 'improving';
  else if (change < -5) trend = 'declining';

  return {
    instanceId,
    type,
    hasEnoughData: true,
    assessmentCount: history.length,
    scoredCount: scores.length,
    statistics: {
      average: Math.round(avgScore * 10) / 10,
      min: minScore,
      max: maxScore,
      range: maxScore - minScore,
    },
    trend: {
      direction: trend,
      recentAverage: Math.round(recentAvg * 10) / 10,
      olderAverage: Math.round(olderAvg * 10) / 10,
      change: Math.round(change * 10) / 10,
    },
    timeline: scores.slice(0, 10).reverse(), // Oldest first for charts
  };
}

/**
 * Compare assessments across instances
 * @param {Array} instanceIds - Instance identifiers to compare
 * @param {string} type - Assessment type
 * @param {string} historyDir - History directory
 * @returns {Object} Comparison results
 */
function compareInstances(instanceIds, type, historyDir = DEFAULT_HISTORY_DIR) {
  const comparison = {
    type,
    comparedAt: new Date().toISOString(),
    instances: [],
    ranking: [],
  };

  for (const instanceId of instanceIds) {
    const history = getHistory(instanceId, { type, limit: 5 }, historyDir);

    if (history.length === 0) {
      comparison.instances.push({
        instanceId,
        hasData: false,
      });
      continue;
    }

    const latestScored = history.find(a => a.score !== null);
    const scores = history.filter(a => a.score !== null).map(a => a.score);
    const avgScore = scores.length > 0
      ? scores.reduce((a, b) => a + b, 0) / scores.length
      : null;

    comparison.instances.push({
      instanceId,
      hasData: true,
      latestScore: latestScored?.score,
      latestTimestamp: latestScored?.timestamp,
      averageScore: avgScore ? Math.round(avgScore * 10) / 10 : null,
      assessmentCount: history.length,
    });
  }

  // Create ranking by latest score
  comparison.ranking = comparison.instances
    .filter(i => i.hasData && i.latestScore !== null)
    .sort((a, b) => b.latestScore - a.latestScore)
    .map((instance, index) => ({
      rank: index + 1,
      instanceId: instance.instanceId,
      score: instance.latestScore,
    }));

  return comparison;
}

/**
 * Generate progress report for an instance
 * @param {string} instanceId - Instance identifier
 * @param {Object} options - Report options
 * @param {string} historyDir - History directory
 * @returns {Object} Progress report
 */
function generateProgressReport(instanceId, options = {}, historyDir = DEFAULT_HISTORY_DIR) {
  const report = {
    instanceId,
    generatedAt: new Date().toISOString(),
    period: options.period || '90d',
    assessmentSummary: {},
    overallHealth: null,
    improvements: [],
    concerns: [],
    recommendations: [],
  };

  // Calculate period start date
  const periodDays = parseInt(options.period) || 90;
  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - periodDays);

  // Get history for each assessment type
  for (const type of Object.values(ASSESSMENT_TYPES)) {
    const history = getHistory(instanceId, {
      type,
      since: sinceDate.toISOString(),
    }, historyDir);

    if (history.length === 0) continue;

    const trends = calculateTrends(instanceId, type, { limit: 10 }, historyDir);

    report.assessmentSummary[type] = {
      assessmentCount: history.length,
      latestScore: history[0]?.score,
      trend: trends.hasEnoughData ? trends.trend : null,
    };

    // Track improvements and concerns
    if (trends.hasEnoughData) {
      if (trends.trend.direction === 'improving') {
        report.improvements.push({
          type,
          change: trends.trend.change,
          message: `${type.replace(/_/g, ' ')} improved by ${trends.trend.change} points`,
        });
      } else if (trends.trend.direction === 'declining') {
        report.concerns.push({
          type,
          change: trends.trend.change,
          message: `${type.replace(/_/g, ' ')} declined by ${Math.abs(trends.trend.change)} points`,
        });
      }
    }
  }

  // Calculate overall health
  const scoredTypes = Object.values(report.assessmentSummary)
    .filter(s => s.latestScore !== null);

  if (scoredTypes.length > 0) {
    const avgScore = scoredTypes.reduce((sum, s) => sum + s.latestScore, 0) / scoredTypes.length;
    report.overallHealth = {
      score: Math.round(avgScore),
      rating: avgScore >= 80 ? 'Excellent' : avgScore >= 60 ? 'Good' : avgScore >= 40 ? 'Fair' : 'Poor',
      assessedAreas: scoredTypes.length,
    };
  }

  // Generate recommendations based on concerns
  for (const concern of report.concerns) {
    report.recommendations.push({
      priority: Math.abs(concern.change) > 10 ? 'high' : 'medium',
      area: concern.type,
      recommendation: `Review and address issues in ${concern.type.replace(/_/g, ' ')} - score has declined`,
    });
  }

  return report;
}

/**
 * Delete old assessments (cleanup)
 * @param {string} instanceId - Instance identifier
 * @param {number} keepDays - Days of history to keep
 * @param {string} historyDir - History directory
 * @returns {number} Number of deleted records
 */
function cleanup(instanceId, keepDays = 365, historyDir = DEFAULT_HISTORY_DIR) {
  const assessmentDir = path.join(historyDir, instanceId, 'assessments');

  if (!fs.existsSync(assessmentDir)) {
    return 0;
  }

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - keepDays);

  const files = fs.readdirSync(assessmentDir);
  let deleted = 0;

  for (const file of files) {
    if (file === 'index.json') continue;
    if (!file.endsWith('.json')) continue;

    const filepath = path.join(assessmentDir, file);
    try {
      const record = JSON.parse(fs.readFileSync(filepath, 'utf8'));
      if (new Date(record.timestamp) < cutoffDate) {
        fs.unlinkSync(filepath);
        deleted++;
      }
    } catch {
      // Skip invalid files
    }
  }

  // Rebuild index
  if (deleted > 0) {
    rebuildIndex(instanceId, historyDir);
  }

  return deleted;
}

/**
 * Rebuild assessment index from files
 * @param {string} instanceId - Instance identifier
 * @param {string} historyDir - History directory
 */
function rebuildIndex(instanceId, historyDir = DEFAULT_HISTORY_DIR) {
  const assessmentDir = path.join(historyDir, instanceId, 'assessments');

  if (!fs.existsSync(assessmentDir)) {
    return;
  }

  const files = fs.readdirSync(assessmentDir);
  const assessments = [];

  for (const file of files) {
    if (file === 'index.json') continue;
    if (!file.endsWith('.json')) continue;

    const filepath = path.join(assessmentDir, file);
    try {
      const record = JSON.parse(fs.readFileSync(filepath, 'utf8'));
      assessments.push({
        id: record.id,
        type: record.type,
        timestamp: record.timestamp,
        score: record.score,
        issueCount: record.issues?.length || 0,
      });
    } catch {
      // Skip invalid files
    }
  }

  // Sort by timestamp descending
  assessments.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  const index = {
    assessments,
    lastUpdated: new Date().toISOString(),
    rebuilt: true,
  };

  fs.writeFileSync(
    path.join(assessmentDir, 'index.json'),
    JSON.stringify(index, null, 2)
  );
}

module.exports = {
  ASSESSMENT_TYPES,
  storeAssessment,
  getHistory,
  getAssessment,
  calculateTrends,
  compareInstances,
  generateProgressReport,
  cleanup,
  rebuildIndex,
};
