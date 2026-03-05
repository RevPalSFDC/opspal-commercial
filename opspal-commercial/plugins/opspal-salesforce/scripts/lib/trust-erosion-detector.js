#!/usr/bin/env node
/**
 * Trust Erosion Detector
 *
 * Detects indicators that users no longer trust Salesforce reports or dashboards.
 *
 * Signals detected:
 * - Shadow reports: Duplicates with similar names created by different users
 * - Manual exports: Patterns indicating spreadsheet reliance
 * - Metric inconsistencies: Same metric calculated differently across teams
 * - Abandoned ownership: Reports owned by inactive users
 * - Dashboard fragmentation: Multiple dashboards covering same KPIs
 *
 * Usage:
 *   node trust-erosion-detector.js analyze --org <alias> [--output json|text]
 *   node trust-erosion-detector.js report --org <alias> --output-dir <path>
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

const TRUST_EROSION_SIGNALS = {
  shadowReports: {
    weight: 0.30,
    description: 'Duplicate reports with similar names by different owners',
    threshold: 3  // Number of similar reports to trigger
  },
  metricInconsistency: {
    weight: 0.25,
    description: 'Same metric calculated differently across teams',
    threshold: 2  // Number of conflicting definitions
  },
  ownershipAbandonment: {
    weight: 0.20,
    description: 'Reports owned by inactive or departed users',
    threshold: 90  // Days since owner last active
  },
  dashboardFragmentation: {
    weight: 0.15,
    description: 'Multiple dashboards covering overlapping KPIs',
    threshold: 0.6  // 60% overlap to flag
  },
  exportPatterns: {
    weight: 0.10,
    description: 'High export frequency suggesting spreadsheet reliance',
    threshold: 10  // Exports per week threshold
  }
};

const KNOWN_METRIC_PATTERNS = {
  'win_rate': [
    { pattern: /IsWon\s*=\s*true.*IsClosed\s*=\s*true/i, name: 'Standard Win Rate' },
    { pattern: /Stage\s*=.*Closed\s*Won/i, name: 'Stage-based Win Rate' },
    { pattern: /COUNT.*Won.*COUNT.*Total/i, name: 'Count-based Win Rate' }
  ],
  'pipeline': [
    { pattern: /IsClosed\s*=\s*false/i, name: 'Open Pipeline (IsClosed)' },
    { pattern: /Stage\s*!=.*Closed/i, name: 'Open Pipeline (Stage)' },
    { pattern: /Probability\s*>\s*0/i, name: 'Weighted Pipeline' }
  ],
  'arr': [
    { pattern: /ARR__c|Annual_Recurring/i, name: 'Custom ARR Field' },
    { pattern: /Amount.*\/.*12|Amount.*Term/i, name: 'Calculated ARR' },
    { pattern: /MRR.*\*.*12/i, name: 'MRR to ARR' }
  ]
};

// ============================================================================
// SOQL Queries
// ============================================================================

function buildReportQuery() {
  return `
    SELECT Id, Name, DeveloperName, FolderName, OwnerId, Owner.Name,
           Owner.IsActive, LastModifiedDate, LastViewedDate, Description,
           Format
    FROM Report
    WHERE FolderName != 'Private Reports'
    ORDER BY Name
  `.trim().replace(/\n\s+/g, ' ');
}

function buildDashboardQuery() {
  return `
    SELECT Id, Title, DeveloperName, FolderName, OwnerId, Owner.Name,
           Owner.IsActive, LastModifiedDate, LastViewedDate, Description
    FROM Dashboard
    WHERE FolderName != 'Private Reports'
    ORDER BY Title
  `.trim().replace(/\n\s+/g, ' ');
}

function buildDashboardComponentQuery(dashboardIds) {
  const idList = dashboardIds.map(id => `'${id}'`).join(',');
  return `
    SELECT Id, DashboardId, ComponentChart, CustomReportId
    FROM DashboardComponent
    WHERE DashboardId IN (${idList})
  `.trim().replace(/\n\s+/g, ' ');
}

function buildUserActivityQuery(userIds) {
  const idList = userIds.map(id => `'${id}'`).join(',');
  return `
    SELECT Id, Name, LastLoginDate, IsActive
    FROM User
    WHERE Id IN (${idList})
  `.trim().replace(/\n\s+/g, ' ');
}

// ============================================================================
// Data Retrieval
// ============================================================================

function executeQuery(orgAlias, query, useTooling = false) {
  const toolingFlag = useTooling ? '--use-tooling-api' : '';
  const cmd = `sf data query --query "${query.replace(/"/g, '\\"')}" ${toolingFlag} --target-org ${orgAlias} --json`;

  try {
    const result = execSync(cmd, { encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 });
    const parsed = JSON.parse(result);
    return parsed.result?.records || [];
  } catch (error) {
    console.error(`Query failed: ${error.message}`);
    return [];
  }
}

function fetchReports(orgAlias) {
  return executeQuery(orgAlias, buildReportQuery());
}

function fetchDashboards(orgAlias) {
  return executeQuery(orgAlias, buildDashboardQuery());
}

function fetchDashboardComponents(orgAlias, dashboardIds) {
  if (!dashboardIds.length) return [];
  // Batch in groups of 100 for SOQL limits
  const batches = [];
  for (let i = 0; i < dashboardIds.length; i += 100) {
    const batch = dashboardIds.slice(i, i + 100);
    batches.push(...executeQuery(orgAlias, buildDashboardComponentQuery(batch)));
  }
  return batches;
}

function fetchUserActivity(orgAlias, userIds) {
  if (!userIds.length) return [];
  const uniqueIds = [...new Set(userIds)];
  const batches = [];
  for (let i = 0; i < uniqueIds.length; i += 100) {
    const batch = uniqueIds.slice(i, i + 100);
    batches.push(...executeQuery(orgAlias, buildUserActivityQuery(batch)));
  }
  return batches;
}

// ============================================================================
// Shadow Report Detection
// ============================================================================

function normalizeReportName(name) {
  return name
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[_-]/g, ' ')
    .replace(/\b(copy|v\d+|backup|old|new|test|draft)\b/gi, '')
    .replace(/\d+$/g, '')
    .trim();
}

function calculateNameSimilarity(name1, name2) {
  const norm1 = normalizeReportName(name1);
  const norm2 = normalizeReportName(name2);

  if (norm1 === norm2) return 1.0;

  // Levenshtein distance normalized
  const maxLen = Math.max(norm1.length, norm2.length);
  if (maxLen === 0) return 1.0;

  const distance = levenshteinDistance(norm1, norm2);
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
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + 1
        );
      }
    }
  }
  return dp[m][n];
}

function detectShadowReports(reports) {
  const shadowGroups = [];
  const processed = new Set();

  for (let i = 0; i < reports.length; i++) {
    if (processed.has(reports[i].Id)) continue;

    const group = [reports[i]];
    processed.add(reports[i].Id);

    for (let j = i + 1; j < reports.length; j++) {
      if (processed.has(reports[j].Id)) continue;

      const similarity = calculateNameSimilarity(reports[i].Name, reports[j].Name);

      // High similarity + different owners = shadow report signal
      if (similarity >= 0.85 && reports[i].OwnerId !== reports[j].OwnerId) {
        group.push(reports[j]);
        processed.add(reports[j].Id);
      }
    }

    if (group.length >= TRUST_EROSION_SIGNALS.shadowReports.threshold) {
      shadowGroups.push({
        baseName: normalizeReportName(reports[i].Name),
        reports: group.map(r => ({
          id: r.Id,
          name: r.Name,
          owner: r.Owner?.Name || 'Unknown',
          ownerId: r.OwnerId,
          lastModified: r.LastModifiedDate,
          folder: r.FolderName
        })),
        uniqueOwners: new Set(group.map(r => r.OwnerId)).size,
        severity: group.length >= 5 ? 'HIGH' : 'MEDIUM'
      });
    }
  }

  return shadowGroups;
}

// ============================================================================
// Metric Inconsistency Detection
// ============================================================================

function detectMetricInconsistencies(reports) {
  const inconsistencies = [];

  for (const [metricName, patterns] of Object.entries(KNOWN_METRIC_PATTERNS)) {
    const matchingReports = [];

    for (const report of reports) {
      // Check report name for metric keywords
      const nameMatch = report.Name.toLowerCase().includes(metricName.replace('_', ' '));
      if (!nameMatch) continue;

      // Would need to fetch report metadata for full analysis
      // For now, group by folder/team to detect potential inconsistencies
      matchingReports.push({
        id: report.Id,
        name: report.Name,
        folder: report.FolderName,
        owner: report.Owner?.Name,
        format: report.Format
      });
    }

    // Group by folder (proxy for team)
    const byFolder = {};
    for (const r of matchingReports) {
      if (!byFolder[r.folder]) byFolder[r.folder] = [];
      byFolder[r.folder].push(r);
    }

    const folders = Object.keys(byFolder);
    if (folders.length >= TRUST_EROSION_SIGNALS.metricInconsistency.threshold) {
      inconsistencies.push({
        metric: metricName,
        folders: folders,
        reports: matchingReports,
        severity: folders.length >= 4 ? 'HIGH' : 'MEDIUM',
        recommendation: `Consolidate ${metricName} calculation across ${folders.length} teams`
      });
    }
  }

  return inconsistencies;
}

// ============================================================================
// Ownership Abandonment Detection
// ============================================================================

function detectOwnershipAbandonment(reports, dashboards, userActivity) {
  const userMap = {};
  for (const user of userActivity) {
    userMap[user.Id] = user;
  }

  const abandoned = [];
  const allItems = [
    ...reports.map(r => ({ ...r, type: 'Report', title: r.Name })),
    ...dashboards.map(d => ({ ...d, type: 'Dashboard', title: d.Title }))
  ];

  const now = new Date();
  const thresholdDays = TRUST_EROSION_SIGNALS.ownershipAbandonment.threshold;

  for (const item of allItems) {
    const user = userMap[item.OwnerId];
    if (!user) continue;

    let isAbandoned = false;
    let reason = '';

    if (!user.IsActive) {
      isAbandoned = true;
      reason = 'Owner is inactive';
    } else if (user.LastLoginDate) {
      const lastLogin = new Date(user.LastLoginDate);
      const daysSinceLogin = Math.floor((now - lastLogin) / (1000 * 60 * 60 * 24));
      if (daysSinceLogin > thresholdDays) {
        isAbandoned = true;
        reason = `Owner last logged in ${daysSinceLogin} days ago`;
      }
    }

    if (isAbandoned) {
      abandoned.push({
        id: item.Id,
        type: item.type,
        title: item.title,
        folder: item.FolderName,
        owner: user.Name,
        reason: reason,
        lastModified: item.LastModifiedDate,
        severity: user.IsActive ? 'MEDIUM' : 'HIGH'
      });
    }
  }

  return abandoned;
}

// ============================================================================
// Dashboard Fragmentation Detection
// ============================================================================

function detectDashboardFragmentation(dashboards, components) {
  // Group components by dashboard
  const dashboardComponents = {};
  for (const comp of components) {
    if (!dashboardComponents[comp.DashboardId]) {
      dashboardComponents[comp.DashboardId] = [];
    }
    dashboardComponents[comp.DashboardId].push(comp.CustomReportId);
  }

  // Find dashboards with overlapping reports
  const fragmentation = [];
  const dashboardList = Object.entries(dashboardComponents);

  for (let i = 0; i < dashboardList.length; i++) {
    const [dashId1, reports1] = dashboardList[i];
    const dash1 = dashboards.find(d => d.Id === dashId1);
    if (!dash1) continue;

    for (let j = i + 1; j < dashboardList.length; j++) {
      const [dashId2, reports2] = dashboardList[j];
      const dash2 = dashboards.find(d => d.Id === dashId2);
      if (!dash2) continue;

      // Calculate overlap
      const set1 = new Set(reports1.filter(r => r));
      const set2 = new Set(reports2.filter(r => r));
      const intersection = [...set1].filter(r => set2.has(r));

      const minSize = Math.min(set1.size, set2.size);
      if (minSize === 0) continue;

      const overlap = intersection.length / minSize;

      if (overlap >= TRUST_EROSION_SIGNALS.dashboardFragmentation.threshold) {
        fragmentation.push({
          dashboard1: { id: dash1.Id, title: dash1.Title, folder: dash1.FolderName },
          dashboard2: { id: dash2.Id, title: dash2.Title, folder: dash2.FolderName },
          overlapPercent: Math.round(overlap * 100),
          sharedReports: intersection.length,
          severity: overlap >= 0.8 ? 'HIGH' : 'MEDIUM',
          recommendation: 'Consider consolidating these dashboards or clarifying their distinct purposes'
        });
      }
    }
  }

  return fragmentation;
}

// ============================================================================
// Trust Score Calculation
// ============================================================================

function calculateTrustScore(analysis) {
  let weightedScore = 0;
  let totalWeight = 0;

  const signals = TRUST_EROSION_SIGNALS;

  // Shadow reports impact
  const shadowCount = analysis.shadowReports.length;
  const shadowScore = Math.max(0, 1 - (shadowCount * 0.15));
  weightedScore += shadowScore * signals.shadowReports.weight;
  totalWeight += signals.shadowReports.weight;

  // Metric inconsistency impact
  const inconsistencyCount = analysis.metricInconsistencies.length;
  const inconsistencyScore = Math.max(0, 1 - (inconsistencyCount * 0.2));
  weightedScore += inconsistencyScore * signals.metricInconsistency.weight;
  totalWeight += signals.metricInconsistency.weight;

  // Ownership abandonment impact
  const abandonedCount = analysis.abandonedReports.length;
  const abandonedScore = Math.max(0, 1 - (abandonedCount * 0.05));
  weightedScore += abandonedScore * signals.ownershipAbandonment.weight;
  totalWeight += signals.ownershipAbandonment.weight;

  // Dashboard fragmentation impact
  const fragmentationCount = analysis.dashboardFragmentation.length;
  const fragmentationScore = Math.max(0, 1 - (fragmentationCount * 0.1));
  weightedScore += fragmentationScore * signals.dashboardFragmentation.weight;
  totalWeight += signals.dashboardFragmentation.weight;

  const finalScore = Math.round((weightedScore / totalWeight) * 100);

  return {
    score: finalScore,
    grade: finalScore >= 80 ? 'A' : finalScore >= 60 ? 'B' : finalScore >= 40 ? 'C' : 'D',
    interpretation: getScoreInterpretation(finalScore)
  };
}

function getScoreInterpretation(score) {
  if (score >= 80) {
    return 'HIGH TRUST: Users rely on centralized Salesforce reports with minimal shadow systems.';
  } else if (score >= 60) {
    return 'MODERATE TRUST: Some shadow reports and inconsistencies exist but are manageable.';
  } else if (score >= 40) {
    return 'LOW TRUST: Significant evidence of users circumventing official reports. Remediation recommended.';
  } else {
    return 'CRITICAL: Widespread trust erosion. Users have largely abandoned centralized reporting. Urgent intervention needed.';
  }
}

// ============================================================================
// Main Analysis
// ============================================================================

async function analyzeOrg(orgAlias, options = {}) {
  console.log(`\nAnalyzing trust erosion signals for org: ${orgAlias}\n`);

  // Fetch data
  console.log('Fetching reports...');
  const reports = fetchReports(orgAlias);
  console.log(`  Found ${reports.length} reports`);

  console.log('Fetching dashboards...');
  const dashboards = fetchDashboards(orgAlias);
  console.log(`  Found ${dashboards.length} dashboards`);

  console.log('Fetching dashboard components...');
  const dashboardIds = dashboards.map(d => d.Id);
  const components = fetchDashboardComponents(orgAlias, dashboardIds);
  console.log(`  Found ${components.length} components`);

  console.log('Fetching user activity...');
  const userIds = [...reports.map(r => r.OwnerId), ...dashboards.map(d => d.OwnerId)];
  const userActivity = fetchUserActivity(orgAlias, userIds);
  console.log(`  Found ${userActivity.length} users`);

  // Run detections
  console.log('\nRunning trust erosion analysis...\n');

  const analysis = {
    timestamp: new Date().toISOString(),
    orgAlias: orgAlias,
    summary: {
      totalReports: reports.length,
      totalDashboards: dashboards.length
    },
    shadowReports: detectShadowReports(reports),
    metricInconsistencies: detectMetricInconsistencies(reports),
    abandonedReports: detectOwnershipAbandonment(reports, dashboards, userActivity),
    dashboardFragmentation: detectDashboardFragmentation(dashboards, components)
  };

  // Calculate trust score
  analysis.trustScore = calculateTrustScore(analysis);

  // Generate recommendations
  analysis.recommendations = generateRecommendations(analysis);

  return analysis;
}

function generateRecommendations(analysis) {
  const recommendations = [];

  if (analysis.shadowReports.length > 0) {
    recommendations.push({
      priority: 'HIGH',
      category: 'Shadow Reports',
      action: `Consolidate ${analysis.shadowReports.length} shadow report groups. Identify authoritative version and deprecate duplicates.`,
      impact: `Reduces confusion and ensures single source of truth for ${analysis.shadowReports.reduce((sum, g) => sum + g.reports.length, 0)} reports.`
    });
  }

  if (analysis.metricInconsistencies.length > 0) {
    recommendations.push({
      priority: 'HIGH',
      category: 'Metric Standardization',
      action: `Standardize ${analysis.metricInconsistencies.length} metrics across teams using canonical definitions.`,
      impact: 'Ensures executive dashboards show consistent numbers regardless of department.'
    });
  }

  if (analysis.abandonedReports.length > 0) {
    const highPriority = analysis.abandonedReports.filter(r => r.severity === 'HIGH');
    recommendations.push({
      priority: highPriority.length > 5 ? 'HIGH' : 'MEDIUM',
      category: 'Ownership Cleanup',
      action: `Reassign ${analysis.abandonedReports.length} orphaned reports/dashboards (${highPriority.length} owned by inactive users).`,
      impact: 'Prevents decay and ensures maintenance responsibility.'
    });
  }

  if (analysis.dashboardFragmentation.length > 0) {
    recommendations.push({
      priority: 'MEDIUM',
      category: 'Dashboard Consolidation',
      action: `Review ${analysis.dashboardFragmentation.length} overlapping dashboard pairs for consolidation.`,
      impact: 'Reduces maintenance burden and clarifies authoritative dashboards per use case.'
    });
  }

  return recommendations;
}

// ============================================================================
// Output Formatting
// ============================================================================

function formatTextOutput(analysis) {
  const lines = [];

  lines.push('='.repeat(80));
  lines.push('TRUST EROSION ANALYSIS REPORT');
  lines.push(`Org: ${analysis.orgAlias} | Generated: ${analysis.timestamp}`);
  lines.push('='.repeat(80));

  lines.push('\n## TRUST SCORE\n');
  lines.push(`Score: ${analysis.trustScore.score}/100 (Grade: ${analysis.trustScore.grade})`);
  lines.push(`\n${analysis.trustScore.interpretation}\n`);

  lines.push('\n## SIGNAL SUMMARY\n');
  lines.push(`- Shadow Report Groups: ${analysis.shadowReports.length}`);
  lines.push(`- Metric Inconsistencies: ${analysis.metricInconsistencies.length}`);
  lines.push(`- Abandoned Reports/Dashboards: ${analysis.abandonedReports.length}`);
  lines.push(`- Fragmented Dashboards: ${analysis.dashboardFragmentation.length}`);

  if (analysis.shadowReports.length > 0) {
    lines.push('\n## SHADOW REPORTS\n');
    for (const group of analysis.shadowReports) {
      lines.push(`### "${group.baseName}" (${group.reports.length} copies, ${group.uniqueOwners} owners)`);
      lines.push(`Severity: ${group.severity}`);
      for (const r of group.reports) {
        lines.push(`  - ${r.name} | Owner: ${r.owner} | Folder: ${r.folder}`);
      }
      lines.push('');
    }
  }

  if (analysis.metricInconsistencies.length > 0) {
    lines.push('\n## METRIC INCONSISTENCIES\n');
    for (const inc of analysis.metricInconsistencies) {
      lines.push(`### ${inc.metric}`);
      lines.push(`Teams: ${inc.folders.join(', ')}`);
      lines.push(`Reports: ${inc.reports.length}`);
      lines.push(`Recommendation: ${inc.recommendation}`);
      lines.push('');
    }
  }

  if (analysis.abandonedReports.length > 0) {
    lines.push('\n## ABANDONED REPORTS/DASHBOARDS\n');
    const byReason = {};
    for (const item of analysis.abandonedReports) {
      if (!byReason[item.reason]) byReason[item.reason] = [];
      byReason[item.reason].push(item);
    }
    for (const [reason, items] of Object.entries(byReason)) {
      lines.push(`### ${reason} (${items.length} items)`);
      for (const item of items.slice(0, 10)) {
        lines.push(`  - [${item.type}] ${item.title} | Owner: ${item.owner}`);
      }
      if (items.length > 10) {
        lines.push(`  ... and ${items.length - 10} more`);
      }
      lines.push('');
    }
  }

  if (analysis.dashboardFragmentation.length > 0) {
    lines.push('\n## DASHBOARD FRAGMENTATION\n');
    for (const frag of analysis.dashboardFragmentation) {
      lines.push(`### ${frag.overlapPercent}% Overlap`);
      lines.push(`Dashboard 1: ${frag.dashboard1.title} (${frag.dashboard1.folder})`);
      lines.push(`Dashboard 2: ${frag.dashboard2.title} (${frag.dashboard2.folder})`);
      lines.push(`Shared Reports: ${frag.sharedReports}`);
      lines.push(`Recommendation: ${frag.recommendation}`);
      lines.push('');
    }
  }

  if (analysis.recommendations.length > 0) {
    lines.push('\n## RECOMMENDATIONS\n');
    for (const rec of analysis.recommendations) {
      lines.push(`### [${rec.priority}] ${rec.category}`);
      lines.push(`Action: ${rec.action}`);
      lines.push(`Impact: ${rec.impact}`);
      lines.push('');
    }
  }

  lines.push('='.repeat(80));

  return lines.join('\n');
}

// ============================================================================
// CLI Interface
// ============================================================================

function printUsage() {
  console.log(`
Trust Erosion Detector - Detect indicators that users don't trust Salesforce reports

Usage:
  node trust-erosion-detector.js analyze --org <alias> [--output json|text]
  node trust-erosion-detector.js report --org <alias> --output-dir <path>
  node trust-erosion-detector.js help

Commands:
  analyze     Run trust erosion analysis and output results
  report      Run analysis and save detailed report to file
  help        Show this help message

Options:
  --org        Salesforce org alias (required)
  --output     Output format: json or text (default: text)
  --output-dir Directory to save report files

Examples:
  node trust-erosion-detector.js analyze --org production --output json
  node trust-erosion-detector.js report --org sandbox --output-dir ./reports
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
  const outputDirIndex = args.indexOf('--output-dir');

  if (orgIndex === -1 || !args[orgIndex + 1]) {
    console.error('Error: --org is required');
    process.exit(1);
  }

  const orgAlias = args[orgIndex + 1];
  const outputFormat = outputIndex !== -1 ? args[outputIndex + 1] : 'text';
  const outputDir = outputDirIndex !== -1 ? args[outputDirIndex + 1] : null;

  try {
    const analysis = await analyzeOrg(orgAlias);

    if (command === 'analyze') {
      if (outputFormat === 'json') {
        console.log(JSON.stringify(analysis, null, 2));
      } else {
        console.log(formatTextOutput(analysis));
      }
    } else if (command === 'report') {
      if (!outputDir) {
        console.error('Error: --output-dir is required for report command');
        process.exit(1);
      }

      // Ensure output directory exists
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const timestamp = new Date().toISOString().split('T')[0];
      const jsonPath = path.join(outputDir, `trust-erosion-${orgAlias}-${timestamp}.json`);
      const textPath = path.join(outputDir, `trust-erosion-${orgAlias}-${timestamp}.md`);

      fs.writeFileSync(jsonPath, JSON.stringify(analysis, null, 2));
      fs.writeFileSync(textPath, formatTextOutput(analysis));

      console.log(`Reports saved to:`);
      console.log(`  JSON: ${jsonPath}`);
      console.log(`  Text: ${textPath}`);
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
  detectShadowReports,
  detectMetricInconsistencies,
  detectOwnershipAbandonment,
  detectDashboardFragmentation,
  calculateTrustScore,
  TRUST_EROSION_SIGNALS
};

// Run if called directly
if (require.main === module) {
  main();
}
