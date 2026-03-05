#!/usr/bin/env node
/**
 * Dual-System Analyzer
 *
 * Analyzes dual-system patterns to distinguish:
 * - Active parallel usage (both systems in use)
 * - Historical migration (one system abandoned)
 * - Intentional separation (different use cases)
 * - Accidental duplication (training gap)
 *
 * CRITICAL: Prevents misinterpreting completed migrations as active dual-system issues.
 * Addresses error E006: "Dual Adoption Pattern Assumption"
 *
 * @module dual-system-analyzer
 * @version 1.0.0
 * @created 2025-10-03
 */

const { detectPattern, analyzeRecency, PATTERNS } = require('./time-series-pattern-detector');

/**
 * Dual system relationships
 */
const RELATIONSHIPS = {
  DUAL_ACTIVE: 'dual_active',               // Both actively used
  MIGRATED_TO_A: 'migrated_to_a',          // Migrated from B to A
  MIGRATED_TO_B: 'migrated_to_b',          // Migrated from A to B
  BOTH_ABANDONED: 'both_abandoned',         // Both systems dead
  USE_CASE_SEPARATION: 'use_case_separation', // Intentional parallel for different purposes
  UNKNOWN: 'unknown'                        // Cannot determine
};

/**
 * Compare two systems and determine relationship
 *
 * @param {Object} systemA - First system data
 * @param {Object} systemB - Second system data
 * @param {Object} options - Analysis options
 * @returns {Object} Comparison result
 */
function compare(systemA, systemB, options = {}) {
  const {
    recentThresholdMonths = 6,
    abandonmentThresholdMonths = 3,
    minActivityThreshold = 1
  } = options;

  // Analyze each system
  const analysisA = analyzeSystem(systemA, {
    recentThresholdMonths,
    abandonmentThresholdMonths,
    minActivityThreshold
  });

  const analysisB = analyzeSystem(systemB, {
    recentThresholdMonths,
    abandonmentThresholdMonths,
    minActivityThreshold
  });

  // Determine relationship
  const relationship = determineRelationship(analysisA, analysisB);

  // Generate recommendations
  const recommendations = generateRecommendations(relationship, analysisA, analysisB);

  return {
    systemA: {
      name: systemA.name || 'System A',
      ...analysisA
    },
    systemB: {
      name: systemB.name || 'System B',
      ...analysisB
    },
    relationship,
    recommendations,
    summary: generateSummary(relationship, analysisA, analysisB)
  };
}

/**
 * Analyze a single system
 */
function analyzeSystem(system, options) {
  const {
    recentThresholdMonths,
    abandonmentThresholdMonths,
    minActivityThreshold
  } = options;

  const analysis = {
    totalRecords: system.total || 0,
    recentRecords: system.recent_6mo || system.recent || 0,
    latestDate: system.latest_date || null,
    active: false,
    pattern: null,
    confidence: 0
  };

  // Time-series analysis if available
  if (system.timeSeries && Array.isArray(system.timeSeries)) {
    const patternResult = detectPattern(system.timeSeries, {
      abandonmentThresholdMonths,
      minActivityThreshold,
      recentPeriods: recentThresholdMonths
    });

    analysis.pattern = patternResult.pattern;
    analysis.confidence = patternResult.confidence;
    analysis.active = patternResult.pattern !== PATTERNS.ABANDONED;
    analysis.patternDetails = patternResult;
  } else {
    // Simple analysis from summary metrics
    analysis.active = analysis.recentRecords >= minActivityThreshold;

    if (analysis.totalRecords > 0 && analysis.recentRecords === 0) {
      analysis.pattern = PATTERNS.ABANDONED;
      analysis.confidence = 0.8;
    } else if (analysis.recentRecords > 0) {
      analysis.pattern = PATTERNS.ACTIVE;
      analysis.confidence = 0.7;
    } else {
      analysis.pattern = null;
      analysis.confidence = 0;
    }
  }

  // Recency analysis
  if (analysis.latestDate) {
    const now = new Date();
    const latest = new Date(analysis.latestDate);
    const daysSince = Math.floor((now - latest) / (1000 * 60 * 60 * 24));

    analysis.daysSinceLatest = daysSince;
    analysis.recencyStatus = daysSince <= 30 ? 'current' :
                             daysSince <= 90 ? 'recent' :
                             daysSince <= 180 ? 'aging' :
                             'old';
  }

  return analysis;
}

/**
 * Determine relationship between two systems
 */
function determineRelationship(analysisA, analysisB) {
  const aActive = analysisA.active;
  const bActive = analysisB.active;

  // Both active
  if (aActive && bActive) {
    // Check if one is significantly more used than the other
    const ratioA = analysisA.recentRecords / (analysisA.recentRecords + analysisB.recentRecords);

    if (ratioA > 0.8) {
      // A dominates - B might be legacy with minimal use
      return {
        type: RELATIONSHIPS.MIGRATED_TO_A,
        confidence: 0.6,
        note: 'System A dominant, but System B shows minimal activity'
      };
    } else if (ratioA < 0.2) {
      // B dominates - A might be legacy with minimal use
      return {
        type: RELATIONSHIPS.MIGRATED_TO_B,
        confidence: 0.6,
        note: 'System B dominant, but System A shows minimal activity'
      };
    }

    // Both actively used with significant volume
    return {
      type: RELATIONSHIPS.DUAL_ACTIVE,
      confidence: 0.85,
      note: 'Both systems actively used with significant volume'
    };
  }

  // A active, B abandoned
  if (aActive && !bActive) {
    return {
      type: RELATIONSHIPS.MIGRATED_TO_A,
      confidence: 0.9,
      note: `System B abandoned ${analysisB.latestDate || 'recently'}, System A active`
    };
  }

  // B active, A abandoned
  if (!aActive && bActive) {
    return {
      type: RELATIONSHIPS.MIGRATED_TO_B,
      confidence: 0.9,
      note: `System A abandoned ${analysisA.latestDate || 'recently'}, System B active`
    };
  }

  // Both abandoned
  if (!aActive && !bActive) {
    return {
      type: RELATIONSHIPS.BOTH_ABANDONED,
      confidence: 0.85,
      note: 'Both systems appear abandoned'
    };
  }

  return {
    type: RELATIONSHIPS.UNKNOWN,
    confidence: 0,
    note: 'Cannot determine relationship with available data'
  };
}

/**
 * Generate recommendations based on relationship
 */
function generateRecommendations(relationship, analysisA, analysisB) {
  const recommendations = [];

  switch (relationship.type) {
    case RELATIONSHIPS.MIGRATED_TO_A:
      recommendations.push({
        priority: 'HIGH',
        action: 'Verify System B migration is complete',
        rationale: 'System B shows signs of abandonment. Confirm migration was intentional.',
        tasks: [
          'Check if System B can be decommissioned',
          'Verify all critical data migrated to System A',
          'Document migration completion date and approach',
          'Archive System B records if needed'
        ]
      });
      recommendations.push({
        priority: 'LOW',
        action: 'Consider removing System B from assessment',
        rationale: 'Including abandoned system in recommendations creates confusion',
        tasks: [
          'Update executive summary to note completed migration',
          'Remove "dual-system" language from findings',
          'Focus recommendations on System A optimization'
        ]
      });
      break;

    case RELATIONSHIPS.MIGRATED_TO_B:
      recommendations.push({
        priority: 'HIGH',
        action: 'Verify System A migration is complete',
        rationale: 'System A shows signs of abandonment. Confirm migration was intentional.',
        tasks: [
          'Check if System A can be decommissioned',
          'Verify all critical data migrated to System B',
          'Document migration completion date and approach',
          'Archive System A records if needed'
        ]
      });
      recommendations.push({
        priority: 'LOW',
        action: 'Consider removing System A from assessment',
        rationale: 'Including abandoned system in recommendations creates confusion',
        tasks: [
          'Update executive summary to note completed migration',
          'Remove "dual-system" language from findings',
          'Focus recommendations on System B optimization'
        ]
      });
      break;

    case RELATIONSHIPS.DUAL_ACTIVE:
      recommendations.push({
        priority: 'CRITICAL',
        action: 'Investigate dual-system usage pattern',
        rationale: 'Both systems actively used - may indicate process confusion or intentional separation',
        tasks: [
          'Interview users to understand when each system is used',
          'Analyze use case differences (deal size, product type, customer type)',
          'Review training materials for consistency',
          'Calculate cost of maintaining two systems'
        ]
      });
      recommendations.push({
        priority: 'HIGH',
        action: 'Assess consolidation feasibility',
        rationale: 'Dual systems create admin burden, user confusion, and data fragmentation',
        tasks: [
          'Map features used in each system',
          'Identify gaps preventing consolidation',
          'Calculate ROI of consolidation project',
          'Create migration roadmap if consolidation viable'
        ]
      });
      break;

    case RELATIONSHIPS.BOTH_ABANDONED:
      recommendations.push({
        priority: 'CRITICAL',
        action: 'Identify replacement system',
        rationale: 'Both systems appear abandoned - functionality must have moved elsewhere',
        tasks: [
          'Query for newer quoting/CPQ systems',
          'Check if process moved outside Salesforce',
          'Interview users to understand current workflow',
          'Document system replacement timeline'
        ]
      });
      break;

    default:
      recommendations.push({
        priority: 'MEDIUM',
        action: 'Collect more data for pattern clarity',
        rationale: 'Insufficient data to determine system relationship',
        tasks: [
          'Gather time-series data for both systems',
          'Query latest records to check recency',
          'Interview stakeholders about system usage',
          'Review change management history'
        ]
      });
  }

  return recommendations;
}

/**
 * Generate summary text
 */
function generateSummary(relationship, analysisA, analysisB) {
  let summary = '';

  switch (relationship.type) {
    case RELATIONSHIPS.MIGRATED_TO_A:
      summary = `Migration from System B to System A detected. System B was last active ${analysisB.latestDate || 'unknown date'} and shows ${analysisB.recentRecords} recent records compared to System A's ${analysisA.recentRecords}. This appears to be a completed migration, not an active dual-system pattern.`;
      break;

    case RELATIONSHIPS.MIGRATED_TO_B:
      summary = `Migration from System A to System B detected. System A was last active ${analysisA.latestDate || 'unknown date'} and shows ${analysisA.recentRecords} recent records compared to System B's ${analysisB.recentRecords}. This appears to be a completed migration, not an active dual-system pattern.`;
      break;

    case RELATIONSHIPS.DUAL_ACTIVE:
      summary = `Active dual-system pattern detected. System A: ${analysisA.recentRecords} recent records. System B: ${analysisB.recentRecords} recent records. Both systems are actively used, requiring investigation into why parallel systems exist and if consolidation is feasible.`;
      break;

    case RELATIONSHIPS.BOTH_ABANDONED:
      summary = `Both systems appear abandoned. System A last active: ${analysisA.latestDate || 'unknown'}. System B last active: ${analysisB.latestDate || 'unknown'}. Functionality likely moved to different system or outside Salesforce.`;
      break;

    default:
      summary = `Unable to determine system relationship with available data. System A: ${analysisA.totalRecords} total records. System B: ${analysisB.totalRecords} total records. More data needed for pattern analysis.`;
  }

  return summary;
}

/**
 * Detect migration event
 *
 * Analyzes both systems to identify approximate migration date
 */
function detectMigration(systemA, systemB) {
  if (!systemA.timeSeries || !systemB.timeSeries) {
    return null;
  }

  // Find crossover point where one system stops and other starts
  const mergedTimeline = mergeTim

elines(systemA.timeSeries, systemB.timeSeries);

  for (let i = 0; i < mergedTimeline.length - 1; i++) {
    const current = mergedTimeline[i];
    const next = mergedTimeline[i + 1];

    // Check for system A stopping and B starting
    if (current.systemA > 0 && next.systemA === 0 && current.systemB === 0 && next.systemB > 0) {
      return {
        migrationDate: next.period,
        fromSystem: 'A',
        toSystem: 'B',
        confidence: 0.8
      };
    }

    // Check for system B stopping and A starting
    if (current.systemB > 0 && next.systemB === 0 && current.systemA === 0 && next.systemA > 0) {
      return {
        migrationDate: next.period,
        fromSystem: 'B',
        toSystem: 'A',
        confidence: 0.8
      };
    }
  }

  return null;
}

/**
 * Merge two timelines for comparison
 */
function mergeTimelines(timelineA, timelineB) {
  const merged = {};

  timelineA.forEach(item => {
    const period = item.period || item.month;
    merged[period] = {
      period,
      systemA: item.count || item.cnt || 0,
      systemB: 0
    };
  });

  timelineB.forEach(item => {
    const period = item.period || item.month;
    if (merged[period]) {
      merged[period].systemB = item.count || item.cnt || 0;
    } else {
      merged[period] = {
        period,
        systemA: 0,
        systemB: item.count || item.cnt || 0
      };
    }
  });

  return Object.values(merged).sort((a, b) => {
    return new Date(a.period) - new Date(b.period);
  });
}

// CLI Interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === 'compare') {
    const systemAFile = args[1];
    const systemBFile = args[2];

    if (!systemAFile || !systemBFile) {
      console.error('Usage: dual-system-analyzer.js compare <system-a.json> <system-b.json>');
      process.exit(1);
    }

    const fs = require('fs');
    const systemA = JSON.parse(fs.readFileSync(systemAFile, 'utf-8'));
    const systemB = JSON.parse(fs.readFileSync(systemBFile, 'utf-8'));

    const result = compare(systemA, systemB);
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  }

  if (command === 'detect-migration') {
    const systemAFile = args[1];
    const systemBFile = args[2];

    if (!systemAFile || !systemBFile) {
      console.error('Usage: dual-system-analyzer.js detect-migration <system-a.json> <system-b.json>');
      process.exit(1);
    }

    const fs = require('fs');
    const systemA = JSON.parse(fs.readFileSync(systemAFile, 'utf-8'));
    const systemB = JSON.parse(fs.readFileSync(systemBFile, 'utf-8'));

    const result = detectMigration(systemA, systemB);
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  }

  console.error('Usage:');
  console.error('  dual-system-analyzer.js compare <system-a.json> <system-b.json>');
  console.error('  dual-system-analyzer.js detect-migration <system-a.json> <system-b.json>');
  process.exit(1);
}

module.exports = {
  compare,
  detectMigration,
  RELATIONSHIPS
};
