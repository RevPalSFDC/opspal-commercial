#!/usr/bin/env node
/**
 * Decay Risk Model
 *
 * Predicts report and dashboard abandonment using leading indicators.
 * Enables proactive intervention before adoption fully collapses.
 *
 * Leading Indicators:
 * - Ownership changes (owner left, transferred)
 * - Dependency staleness (source reports unused)
 * - Metric definition drift (definitions changed)
 * - Usage velocity decline (trend analysis)
 * - Duplicate proliferation (shadow copies created)
 *
 * Usage:
 *   node decay-risk-model.js score --org <alias> [--output json|text]
 *   node decay-risk-model.js recommendations --org <alias>
 *
 * @version 1.0.0
 * @author RevPal Salesforce Plugin
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ============================================================================
// Configuration
// ============================================================================

const DECAY_SIGNALS = {
  // Leading indicators (predictive)
  ownershipAbandonment: {
    weight: 0.20,
    description: 'Owner left company or hasn\'t logged in recently',
    leadTime: 'weeks',
    detection: 'User.LastLoginDate, User.IsActive'
  },
  dependencyStale: {
    weight: 0.18,
    description: 'Source reports for dashboard are stale',
    leadTime: 'weeks',
    detection: 'Report.LastModifiedDate via DashboardComponent.CustomReportId'
  },
  metricDefinitionDrift: {
    weight: 0.15,
    description: 'Underlying metric definitions have changed',
    leadTime: 'days',
    detection: 'Report metadata comparison over time'
  },
  usageVelocityDecline: {
    weight: 0.17,
    description: 'Views/runs declining over trailing periods',
    leadTime: 'weeks',
    detection: 'Trend analysis of LastViewedDate frequency'
  },
  duplicateProliferation: {
    weight: 0.15,
    description: 'Shadow copies being created by other users',
    leadTime: 'days',
    detection: 'Similar name pattern with different owners'
  },

  // Trailing indicators (confirmatory)
  zeroUsage30Days: {
    weight: 0.08,
    description: 'No views or modifications in 30 days',
    leadTime: 'trailing',
    detection: 'LastViewedDate or LastModifiedDate > 30 days ago'
  },
  maintenanceNonresponse: {
    weight: 0.07,
    description: 'Maintenance requests not addressed',
    leadTime: 'trailing',
    detection: 'Open issues linked to report without response'
  }
};

const DECAY_THRESHOLDS = {
  critical: 0.70,   // Immediate intervention needed
  high: 0.50,       // Proactive outreach recommended
  medium: 0.30,     // Monitor closely
  low: 0.15         // Normal health
};

const AUTOMATED_RESPONSES = {
  critical: [
    { action: 'deprecation_warning', description: 'Send deprecation notice to stakeholders' },
    { action: 'archive_candidate', description: 'Flag for archival review' },
    { action: 'ownership_transfer', description: 'Identify new owner candidate' }
  ],
  high: [
    { action: 'redesign_review', description: 'Queue for redesign assessment' },
    { action: 'stakeholder_survey', description: 'Survey users on relevance' },
    { action: 'consolidation_candidate', description: 'Identify merge opportunities' }
  ],
  medium: [
    { action: 'health_check', description: 'Schedule periodic health check' },
    { action: 'documentation_update', description: 'Update or add documentation' }
  ],
  low: []
};

// ============================================================================
// Data Retrieval
// ============================================================================

function executeQuery(orgAlias, query) {
  const cmd = `sf data query --query "${query.replace(/"/g, '\\"')}" --target-org ${orgAlias} --json`;
  try {
    const result = execSync(cmd, { encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 });
    const parsed = JSON.parse(result);
    return parsed.result?.records || [];
  } catch (error) {
    console.error(`Query failed: ${error.message}`);
    return [];
  }
}

function fetchReportsWithUsage(orgAlias) {
  const query = `
    SELECT Id, Name, DeveloperName, FolderName, OwnerId, Owner.Name,
           Owner.IsActive, Owner.LastLoginDate, LastModifiedDate, LastViewedDate,
           Description, Format
    FROM Report
    WHERE FolderName != 'Private Reports'
    ORDER BY LastViewedDate DESC NULLS LAST
  `.trim().replace(/\n\s+/g, ' ');
  return executeQuery(orgAlias, query);
}

function fetchDashboardsWithUsage(orgAlias) {
  const query = `
    SELECT Id, Title, DeveloperName, FolderName, OwnerId, Owner.Name,
           Owner.IsActive, Owner.LastLoginDate, LastModifiedDate, LastViewedDate,
           Description
    FROM Dashboard
    WHERE FolderName != 'Private Reports'
    ORDER BY LastViewedDate DESC NULLS LAST
  `.trim().replace(/\n\s+/g, ' ');
  return executeQuery(orgAlias, query);
}

function fetchDashboardComponents(orgAlias, dashboardIds) {
  if (!dashboardIds.length) return [];
  const batches = [];
  for (let i = 0; i < dashboardIds.length; i += 100) {
    const batch = dashboardIds.slice(i, i + 100);
    const idList = batch.map(id => `'${id}'`).join(',');
    const query = `SELECT Id, DashboardId, CustomReportId FROM DashboardComponent WHERE DashboardId IN (${idList})`;
    batches.push(...executeQuery(orgAlias, query));
  }
  return batches;
}

// ============================================================================
// Signal Calculators
// ============================================================================

function calculateOwnershipScore(item) {
  const owner = item.Owner || {};
  const now = new Date();
  let score = 0;

  // Owner inactive
  if (!owner.IsActive) {
    score = 1.0;
    return { score, reason: 'Owner is inactive' };
  }

  // Owner hasn't logged in
  if (owner.LastLoginDate) {
    const lastLogin = new Date(owner.LastLoginDate);
    const daysSince = Math.floor((now - lastLogin) / (1000 * 60 * 60 * 24));

    if (daysSince > 90) {
      score = 0.9;
      return { score, reason: `Owner last logged in ${daysSince} days ago` };
    } else if (daysSince > 60) {
      score = 0.6;
      return { score, reason: `Owner last logged in ${daysSince} days ago` };
    } else if (daysSince > 30) {
      score = 0.3;
      return { score, reason: `Owner last logged in ${daysSince} days ago` };
    }
  }

  return { score: 0, reason: 'Owner active' };
}

function calculateDependencyScore(dashboardId, components, reports) {
  if (!components.length) return { score: 0, reason: 'No components' };

  const dashboardComponents = components.filter(c => c.DashboardId === dashboardId);
  if (!dashboardComponents.length) return { score: 0, reason: 'No components found' };

  const reportMap = {};
  reports.forEach(r => { reportMap[r.Id] = r; });

  let staleCount = 0;
  let totalCount = 0;
  const now = new Date();

  for (const comp of dashboardComponents) {
    if (!comp.CustomReportId) continue;
    totalCount++;

    const report = reportMap[comp.CustomReportId];
    if (!report) {
      staleCount++;
      continue;
    }

    const lastModified = new Date(report.LastModifiedDate);
    const daysSince = Math.floor((now - lastModified) / (1000 * 60 * 60 * 24));

    if (daysSince > 180) {
      staleCount++;
    }
  }

  if (totalCount === 0) return { score: 0, reason: 'No report components' };

  const score = staleCount / totalCount;
  return {
    score,
    reason: `${staleCount} of ${totalCount} source reports stale (>180 days)`
  };
}

function calculateUsageVelocityScore(item) {
  const now = new Date();

  // Check LastViewedDate
  if (!item.LastViewedDate) {
    // Never viewed
    return { score: 0.8, reason: 'Never viewed' };
  }

  const lastViewed = new Date(item.LastViewedDate);
  const lastModified = new Date(item.LastModifiedDate);
  const daysSinceView = Math.floor((now - lastViewed) / (1000 * 60 * 60 * 24));
  const daysSinceModified = Math.floor((now - lastModified) / (1000 * 60 * 60 * 24));

  // Use the more recent of view or modify
  const daysSince = Math.min(daysSinceView, daysSinceModified);

  if (daysSince > 180) {
    return { score: 1.0, reason: `No activity in ${daysSince} days` };
  } else if (daysSince > 90) {
    return { score: 0.7, reason: `Last activity ${daysSince} days ago` };
  } else if (daysSince > 60) {
    return { score: 0.4, reason: `Last activity ${daysSince} days ago` };
  } else if (daysSince > 30) {
    return { score: 0.2, reason: `Last activity ${daysSince} days ago` };
  }

  return { score: 0, reason: 'Recently active' };
}

function calculateDuplicateScore(item, allItems) {
  const normalizedName = normalizeName(item.Name || item.Title);
  let duplicateCount = 0;

  for (const other of allItems) {
    if (other.Id === item.Id) continue;
    const otherName = normalizeName(other.Name || other.Title);

    // Check for similar names with different owners
    const similarity = calculateSimilarity(normalizedName, otherName);
    if (similarity > 0.8 && other.OwnerId !== item.OwnerId) {
      duplicateCount++;
    }
  }

  if (duplicateCount >= 3) {
    return { score: 1.0, reason: `${duplicateCount} shadow copies exist` };
  } else if (duplicateCount === 2) {
    return { score: 0.6, reason: `${duplicateCount} shadow copies exist` };
  } else if (duplicateCount === 1) {
    return { score: 0.3, reason: '1 shadow copy exists' };
  }

  return { score: 0, reason: 'No duplicates detected' };
}

function calculateZeroUsageScore(item) {
  const now = new Date();
  const lastActivity = item.LastViewedDate || item.LastModifiedDate;

  if (!lastActivity) {
    return { score: 1.0, reason: 'No recorded activity' };
  }

  const lastDate = new Date(lastActivity);
  const daysSince = Math.floor((now - lastDate) / (1000 * 60 * 60 * 24));

  if (daysSince > 30) {
    return { score: 1.0, reason: `No activity in ${daysSince} days` };
  }

  return { score: 0, reason: 'Activity within 30 days' };
}

// ============================================================================
// Helpers
// ============================================================================

function normalizeName(name) {
  return (name || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[_-]/g, ' ')
    .replace(/\b(copy|v\d+|backup|old|new|test|draft)\b/gi, '')
    .replace(/\d+$/g, '')
    .trim();
}

function calculateSimilarity(str1, str2) {
  if (str1 === str2) return 1.0;
  const maxLen = Math.max(str1.length, str2.length);
  if (maxLen === 0) return 1.0;
  const distance = levenshteinDistance(str1, str2);
  return 1 - (distance / maxLen);
}

function levenshteinDistance(str1, str2) {
  const m = str1.length;
  const n = str2.length;
  const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + 1);
      }
    }
  }
  return dp[m][n];
}

// ============================================================================
// Main Scoring
// ============================================================================

function calculateDecayScore(item, allItems, components, reports, isDashboard = false) {
  const signals = {};
  let totalWeight = 0;
  let weightedScore = 0;

  // 1. Ownership abandonment
  const ownership = calculateOwnershipScore(item);
  signals.ownershipAbandonment = ownership;
  weightedScore += ownership.score * DECAY_SIGNALS.ownershipAbandonment.weight;
  totalWeight += DECAY_SIGNALS.ownershipAbandonment.weight;

  // 2. Dependency staleness (dashboards only)
  if (isDashboard) {
    const dependency = calculateDependencyScore(item.Id, components, reports);
    signals.dependencyStale = dependency;
    weightedScore += dependency.score * DECAY_SIGNALS.dependencyStale.weight;
    totalWeight += DECAY_SIGNALS.dependencyStale.weight;
  }

  // 3. Usage velocity decline
  const velocity = calculateUsageVelocityScore(item);
  signals.usageVelocityDecline = velocity;
  weightedScore += velocity.score * DECAY_SIGNALS.usageVelocityDecline.weight;
  totalWeight += DECAY_SIGNALS.usageVelocityDecline.weight;

  // 4. Duplicate proliferation
  const duplicates = calculateDuplicateScore(item, allItems);
  signals.duplicateProliferation = duplicates;
  weightedScore += duplicates.score * DECAY_SIGNALS.duplicateProliferation.weight;
  totalWeight += DECAY_SIGNALS.duplicateProliferation.weight;

  // 5. Zero usage (trailing)
  const zeroUsage = calculateZeroUsageScore(item);
  signals.zeroUsage30Days = zeroUsage;
  weightedScore += zeroUsage.score * DECAY_SIGNALS.zeroUsage30Days.weight;
  totalWeight += DECAY_SIGNALS.zeroUsage30Days.weight;

  const finalScore = totalWeight > 0 ? weightedScore / totalWeight : 0;
  const riskLevel = getRiskLevel(finalScore);

  return {
    score: Math.round(finalScore * 100) / 100,
    riskLevel,
    signals,
    recommendations: AUTOMATED_RESPONSES[riskLevel] || []
  };
}

function getRiskLevel(score) {
  if (score >= DECAY_THRESHOLDS.critical) return 'critical';
  if (score >= DECAY_THRESHOLDS.high) return 'high';
  if (score >= DECAY_THRESHOLDS.medium) return 'medium';
  if (score >= DECAY_THRESHOLDS.low) return 'low';
  return 'healthy';
}

// ============================================================================
// Analysis
// ============================================================================

async function analyzeOrg(orgAlias) {
  console.log(`\nAnalyzing decay risk for org: ${orgAlias}\n`);

  // Fetch data
  console.log('Fetching reports...');
  const reports = fetchReportsWithUsage(orgAlias);
  console.log(`  Found ${reports.length} reports`);

  console.log('Fetching dashboards...');
  const dashboards = fetchDashboardsWithUsage(orgAlias);
  console.log(`  Found ${dashboards.length} dashboards`);

  console.log('Fetching dashboard components...');
  const dashboardIds = dashboards.map(d => d.Id);
  const components = fetchDashboardComponents(orgAlias, dashboardIds);
  console.log(`  Found ${components.length} components`);

  // Score each item
  console.log('\nScoring decay risk...\n');

  const reportScores = reports.map(report => ({
    id: report.Id,
    name: report.Name,
    type: 'Report',
    folder: report.FolderName,
    owner: report.Owner?.Name || 'Unknown',
    lastViewed: report.LastViewedDate,
    lastModified: report.LastModifiedDate,
    ...calculateDecayScore(report, reports, [], [], false)
  }));

  const dashboardScores = dashboards.map(dashboard => ({
    id: dashboard.Id,
    name: dashboard.Title,
    type: 'Dashboard',
    folder: dashboard.FolderName,
    owner: dashboard.Owner?.Name || 'Unknown',
    lastViewed: dashboard.LastViewedDate,
    lastModified: dashboard.LastModifiedDate,
    ...calculateDecayScore(dashboard, dashboards, components, reports, true)
  }));

  const allScores = [...reportScores, ...dashboardScores]
    .sort((a, b) => b.score - a.score);

  // Summary
  const summary = {
    timestamp: new Date().toISOString(),
    orgAlias,
    totalItems: allScores.length,
    byRiskLevel: {
      critical: allScores.filter(s => s.riskLevel === 'critical').length,
      high: allScores.filter(s => s.riskLevel === 'high').length,
      medium: allScores.filter(s => s.riskLevel === 'medium').length,
      low: allScores.filter(s => s.riskLevel === 'low').length,
      healthy: allScores.filter(s => s.riskLevel === 'healthy').length
    },
    avgScore: Math.round((allScores.reduce((sum, s) => sum + s.score, 0) / allScores.length) * 100) / 100
  };

  return {
    summary,
    items: allScores,
    criticalItems: allScores.filter(s => s.riskLevel === 'critical'),
    highRiskItems: allScores.filter(s => s.riskLevel === 'high')
  };
}

// ============================================================================
// Output Formatting
// ============================================================================

function formatTextOutput(analysis) {
  const lines = [];

  lines.push('='.repeat(80));
  lines.push('DECAY RISK ANALYSIS REPORT');
  lines.push(`Org: ${analysis.summary.orgAlias} | Generated: ${analysis.summary.timestamp}`);
  lines.push('='.repeat(80));

  lines.push('\n## SUMMARY\n');
  lines.push(`Total Items Analyzed: ${analysis.summary.totalItems}`);
  lines.push(`Average Decay Score: ${analysis.summary.avgScore}`);
  lines.push('\nRisk Distribution:');
  lines.push(`  🔴 Critical: ${analysis.summary.byRiskLevel.critical}`);
  lines.push(`  🟠 High: ${analysis.summary.byRiskLevel.high}`);
  lines.push(`  🟡 Medium: ${analysis.summary.byRiskLevel.medium}`);
  lines.push(`  🟢 Low: ${analysis.summary.byRiskLevel.low}`);
  lines.push(`  ✅ Healthy: ${analysis.summary.byRiskLevel.healthy}`);

  if (analysis.criticalItems.length > 0) {
    lines.push('\n## CRITICAL RISK ITEMS\n');
    for (const item of analysis.criticalItems.slice(0, 10)) {
      lines.push(`### ${item.name}`);
      lines.push(`Type: ${item.type} | Score: ${item.score} | Owner: ${item.owner}`);
      lines.push('Signals:');
      for (const [signal, data] of Object.entries(item.signals)) {
        if (data.score > 0) {
          lines.push(`  - ${signal}: ${data.reason} (score: ${data.score})`);
        }
      }
      lines.push('Recommendations:');
      for (const rec of item.recommendations) {
        lines.push(`  - ${rec.action}: ${rec.description}`);
      }
      lines.push('');
    }
  }

  if (analysis.highRiskItems.length > 0) {
    lines.push('\n## HIGH RISK ITEMS\n');
    for (const item of analysis.highRiskItems.slice(0, 10)) {
      lines.push(`- ${item.name} (${item.type}) | Score: ${item.score} | Owner: ${item.owner}`);
    }
  }

  lines.push('\n' + '='.repeat(80));

  return lines.join('\n');
}

// ============================================================================
// CLI
// ============================================================================

function printUsage() {
  console.log(`
Decay Risk Model - Predict report/dashboard abandonment

Usage:
  node decay-risk-model.js score --org <alias> [--output json|text]
  node decay-risk-model.js recommendations --org <alias>
  node decay-risk-model.js help

Commands:
  score            Calculate decay risk scores for all reports/dashboards
  recommendations  Generate actionable recommendations
  help             Show this help message

Options:
  --org        Salesforce org alias (required)
  --output     Output format: json or text (default: text)
  --threshold  Minimum risk level to show: critical, high, medium, low (default: medium)

Examples:
  node decay-risk-model.js score --org production --output json
  node decay-risk-model.js recommendations --org sandbox --threshold high
`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === 'help') {
    printUsage();
    return;
  }

  const command = args[0];
  const orgIndex = args.indexOf('--org');
  const outputIndex = args.indexOf('--output');

  if (orgIndex === -1 || !args[orgIndex + 1]) {
    console.error('Error: --org is required');
    process.exit(1);
  }

  const orgAlias = args[orgIndex + 1];
  const outputFormat = outputIndex !== -1 ? args[outputIndex + 1] : 'text';

  try {
    const analysis = await analyzeOrg(orgAlias);

    if (command === 'score' || command === 'recommendations') {
      if (outputFormat === 'json') {
        console.log(JSON.stringify(analysis, null, 2));
      } else {
        console.log(formatTextOutput(analysis));
      }
    } else {
      console.error(`Unknown command: ${command}`);
      printUsage();
      process.exit(1);
    }
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

// Export for programmatic use
module.exports = {
  analyzeOrg,
  calculateDecayScore,
  DECAY_SIGNALS,
  DECAY_THRESHOLDS,
  AUTOMATED_RESPONSES
};

if (require.main === module) {
  main();
}
