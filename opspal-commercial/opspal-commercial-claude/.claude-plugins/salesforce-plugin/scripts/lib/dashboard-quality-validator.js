#!/usr/bin/env node

/**
 * Dashboard Quality Validator - Enterprise dashboard quality scoring
 *
 * Evaluates Salesforce dashboards against best practices and provides
 * quality scores with actionable recommendations.
 *
 * @module dashboard-quality-validator
 * @version 1.0.0
 */

const QUALITY_DIMENSIONS = {
  COMPONENT_COUNT: 'component_count',
  NAMING_CONVENTION: 'naming_convention',
  CHART_APPROPRIATENESS: 'chart_appropriateness',
  VISUAL_HIERARCHY: 'visual_hierarchy',
  FILTER_USAGE: 'filter_usage',
  PERFORMANCE: 'performance',
  AUDIENCE_ALIGNMENT: 'audience_alignment',
  ACTIONABILITY: 'actionability'
};

const GRADE_THRESHOLDS = {
  A_PLUS: 95,
  A: 90,
  A_MINUS: 85,
  B_PLUS: 80,
  B: 75,
  B_MINUS: 70,
  C_PLUS: 65,
  C: 60,
  C_MINUS: 55,
  D: 50,
  F: 0
};

const fs = require('fs');

/**
 * Evaluate component count quality
 * @param {Object} dashboard - Dashboard metadata
 * @returns {Object} Score and feedback
 */
function evaluateComponentCount(dashboard) {
  const componentCount = dashboard.components?.length || 0;

  let score = 100;
  const issues = [];
  const recommendations = [];

  // Optimal range: 5-7 components
  if (componentCount === 0) {
    score = 0;
    issues.push("Dashboard has no components");
    recommendations.push("Add at least 3 components to provide value");
  } else if (componentCount < 3) {
    score = 40;
    issues.push(`Dashboard has only ${componentCount} component(s) - feels empty`);
    recommendations.push("Add 2-4 more components to provide comprehensive view");
  } else if (componentCount >= 5 && componentCount <= 7) {
    score = 100;
    // Perfect range
  } else if (componentCount >= 3 && componentCount < 5) {
    score = 80;
    recommendations.push("Dashboard is on the sparse side - consider adding 1-2 more metrics");
  } else if (componentCount >= 8 && componentCount <= 9) {
    score = 70;
    issues.push("Dashboard is slightly crowded - may cause cognitive overload");
    recommendations.push("Consider consolidating or removing lower-priority components");
  } else if (componentCount > 9) {
    score = 50;
    issues.push(`Dashboard has ${componentCount} components - significant cognitive overload risk`);
    recommendations.push("Split into 2 focused dashboards or remove components with importance <60");
  }

  return {
    dimension: QUALITY_DIMENSIONS.COMPONENT_COUNT,
    score,
    weight: 15,
    issues,
    recommendations,
    details: {
      componentCount,
      optimalRange: '5-7',
      currentStatus: componentCount >= 5 && componentCount <= 7 ? 'Optimal' : componentCount < 5 ? 'Too few' : 'Too many'
    }
  };
}

/**
 * Evaluate naming conventions
 * @param {Object} dashboard - Dashboard metadata
 * @returns {Object} Score and feedback
 */
function evaluateNamingConvention(dashboard) {
  let score = 100;
  const issues = [];
  const recommendations = [];

  // Check dashboard name
  const dashboardName = dashboard.name || dashboard.title || '';
  if (!dashboardName) {
    score -= 20;
    issues.push("Dashboard has no name");
    recommendations.push("Add descriptive name: [Audience] [Topic] Dashboard (e.g., 'Executive Revenue Dashboard')");
  } else if (dashboardName.length < 10) {
    score -= 10;
    issues.push("Dashboard name is too short/vague");
    recommendations.push("Use format: [Audience] [Topic] Dashboard");
  } else if (!dashboardName.toLowerCase().includes('dashboard')) {
    score -= 5;
    recommendations.push("Include 'Dashboard' in name for clarity");
  }

  // Check component names
  const components = dashboard.components || [];
  let vagueNames = 0;
  let missingNames = 0;

  components.forEach(component => {
    const componentName = component.title || component.name || '';

    if (!componentName) {
      missingNames++;
      score -= 5;
    } else if (componentName.length < 5) {
      vagueNames++;
      score -= 3;
    } else if (/^(chart|report|component)\s*\d*$/i.test(componentName)) {
      vagueNames++;
      score -= 3;
    }
  });

  if (missingNames > 0) {
    issues.push(`${missingNames} component(s) have no title`);
    recommendations.push("Add descriptive titles to all components");
  }

  if (vagueNames > 0) {
    issues.push(`${vagueNames} component(s) have vague titles (too short or generic)`);
    recommendations.push("Use clear, descriptive titles that explain what the metric shows");
  }

  return {
    dimension: QUALITY_DIMENSIONS.NAMING_CONVENTION,
    score: Math.max(0, score),
    weight: 10,
    issues,
    recommendations,
    details: {
      dashboardName,
      componentNames: components.map(c => c.title || c.name || 'Unnamed'),
      missingNames,
      vagueNames
    }
  };
}

/**
 * Evaluate chart type appropriateness
 * @param {Object} dashboard - Dashboard metadata
 * @returns {Object} Score and feedback
 */
function evaluateChartAppropriateness(dashboard) {
  let score = 100;
  const issues = [];
  const recommendations = [];

  const components = dashboard.components || [];
  let inappropriateCharts = 0;

  components.forEach(component => {
    const chartType = component.type || component.chartType || '';
    const metric = component.metric || '';
    const groupBy = component.groupBy || '';

    // Check for common mismatches
    if (chartType === 'pie' && (groupBy.toLowerCase().includes('date') || metric.toLowerCase().includes('trend'))) {
      inappropriateCharts++;
      issues.push(`"${component.title}": Pie chart for time-series data - use Line chart instead`);
    }

    if (chartType === 'line' && !groupBy.toLowerCase().includes('date') && !groupBy.toLowerCase().includes('time')) {
      inappropriateCharts++;
      issues.push(`"${component.title}": Line chart without time dimension - consider Bar or Horizontal Bar`);
    }

    if (chartType === 'table' && components.length < 4) {
      recommendations.push(`"${component.title}": Consider adding visual components - dashboard has many tables`);
    }
  });

  score -= inappropriateCharts * 15;

  // Check for all-table dashboard
  const tableCount = components.filter(c => c.type === 'table' || c.chartType === 'table').length;
  if (tableCount === components.length && components.length > 1) {
    score -= 20;
    issues.push("All components are tables - dashboard lacks visual hierarchy");
    recommendations.push("Convert at least 50% of components to charts (Bar, Line, Gauge, Donut)");
  }

  return {
    dimension: QUALITY_DIMENSIONS.CHART_APPROPRIATENESS,
    score: Math.max(0, score),
    weight: 20,
    issues,
    recommendations,
    details: {
      inappropriateCharts,
      tableCount,
      chartCount: components.length - tableCount
    }
  };
}

/**
 * Evaluate visual hierarchy
 * @param {Object} dashboard - Dashboard metadata
 * @returns {Object} Score and feedback
 */
function evaluateVisualHierarchy(dashboard) {
  let score = 100;
  const issues = [];
  const recommendations = [];

  const components = dashboard.components || [];

  // Check if high-importance components are at top
  const topComponent = components.find(c => c.position === 1 || c.row === 1);
  if (topComponent) {
    const topType = topComponent.type || topComponent.chartType || '';
    if (topType === 'table') {
      score -= 15;
      issues.push("Top component is a table - should be high-impact visual (Gauge, Metric)");
      recommendations.push("Place key metrics or gauges in top-left position (F-pattern hot zone)");
    }
  } else {
    score -= 10;
    issues.push("No clear top component identified");
  }

  // Check for size variety
  const sizes = components.map(c => c.size).filter(Boolean);
  const uniqueSizes = new Set(sizes).size;

  if (uniqueSizes === 1 && components.length > 3) {
    score -= 10;
    issues.push("All components are same size - lacks visual hierarchy");
    recommendations.push("Vary component sizes: full-width for critical KPIs, smaller for supporting metrics");
  }

  // Check for metrics/gauges presence
  const hasKeyMetrics = components.some(c =>
    c.type === 'metric' || c.type === 'gauge' || c.chartType === 'metric' || c.chartType === 'gauge'
  );

  if (!hasKeyMetrics && components.length > 2) {
    score -= 15;
    issues.push("No single-value metrics (Metric/Gauge) - dashboard lacks immediate insight");
    recommendations.push("Add 1-3 key metrics at top for at-a-glance visibility");
  }

  return {
    dimension: QUALITY_DIMENSIONS.VISUAL_HIERARCHY,
    score: Math.max(0, score),
    weight: 15,
    issues,
    recommendations,
    details: {
      topComponentType: topComponent?.type || topComponent?.chartType || 'Unknown',
      uniqueSizes,
      hasKeyMetrics
    }
  };
}

/**
 * Evaluate filter usage
 * @param {Object} dashboard - Dashboard metadata
 * @returns {Object} Score and feedback
 */
function evaluateFilterUsage(dashboard) {
  let score = 100;
  const issues = [];
  const recommendations = [];

  const filters = dashboard.filters || dashboard.dashboardFilters || [];

  // Check if filters exist
  if (filters.length === 0) {
    score = 60;
    recommendations.push("Add filters (Date Range, Owner, Region) to make dashboard interactive");
  } else if (filters.length > 5) {
    score -= 10;
    issues.push(`Dashboard has ${filters.length} filters - may overwhelm users`);
    recommendations.push("Limit to 3-5 most important filters");
  }

  // Check for essential filters
  const hasDateFilter = filters.some(f =>
    f.field?.toLowerCase().includes('date') || f.type === 'Date Range'
  );

  if (!hasDateFilter && components.some(c => c.metric?.toLowerCase().includes('revenue') || c.metric?.toLowerCase().includes('pipeline'))) {
    score -= 10;
    recommendations.push("Add Date Range filter for time-based metrics (revenue, pipeline, etc.)");
  }

  // Check for default values
  const filtersWithDefaults = filters.filter(f => f.default || f.defaultValue);
  if (filtersWithDefaults.length < filters.length) {
    score -= 5;
    recommendations.push("Set default values for all filters to ensure consistent initial view");
  }

  const components = dashboard.components || [];

  return {
    dimension: QUALITY_DIMENSIONS.FILTER_USAGE,
    score: Math.max(0, score),
    weight: 10,
    issues,
    recommendations,
    details: {
      filterCount: filters.length,
      hasDateFilter,
      filtersWithDefaults: filtersWithDefaults.length,
      filters: filters.map(f => ({ field: f.field, type: f.type, hasDefault: !!(f.default || f.defaultValue) }))
    }
  };
}

/**
 * Evaluate performance considerations
 * @param {Object} dashboard - Dashboard metadata
 * @returns {Object} Score and feedback
 */
function evaluatePerformance(dashboard) {
  let score = 100;
  const issues = [];
  const recommendations = [];

  const components = dashboard.components || [];

  // Check for excessive components (performance impact)
  if (components.length > 10) {
    score -= 15;
    issues.push("High component count (>10) may cause slow load times");
    recommendations.push("Consider lazy loading or pagination for detail components");
  }

  // Check for large tables without row limits
  const largeTables = components.filter(c =>
    (c.type === 'table' || c.chartType === 'table') && (!c.rowLimit || c.rowLimit > 50)
  );

  if (largeTables.length > 0) {
    score -= 10 * largeTables.length;
    issues.push(`${largeTables.length} table(s) without row limits - may load thousands of rows`);
    recommendations.push("Add rowLimit: 20-50 to all table components");
  }

  // Check for refresh schedule
  const refreshFrequency = dashboard.refreshFrequency || dashboard.refresh;
  if (!refreshFrequency) {
    score -= 5;
    recommendations.push("Set refresh schedule (Hourly for operational, Daily for executive)");
  } else if (refreshFrequency === 'real-time' && components.length > 7) {
    score -= 10;
    issues.push("Real-time refresh with many components may cause performance issues");
    recommendations.push("Consider hourly refresh for dashboards with >7 components");
  }

  return {
    dimension: QUALITY_DIMENSIONS.PERFORMANCE,
    score: Math.max(0, score),
    weight: 10,
    issues,
    recommendations,
    details: {
      componentCount: components.length,
      largeTablesCount: largeTables.length,
      refreshFrequency
    }
  };
}

/**
 * Evaluate audience alignment
 * @param {Object} dashboard - Dashboard metadata
 * @returns {Object} Score and feedback
 */
function evaluateAudienceAlignment(dashboard) {
  let score = 100;
  const issues = [];
  const recommendations = [];

  const audience = dashboard.audience || '';
  const components = dashboard.components || [];

  if (!audience) {
    score -= 10;
    recommendations.push("Define target audience (executive, manager, individual) for better design");
  }

  // Executive dashboards should be high-level
  if (audience.toLowerCase().includes('executive')) {
    const detailComponents = components.filter(c => c.type === 'table' || c.rowLimit > 20);
    if (detailComponents.length > 2) {
      score -= 15;
      issues.push("Executive dashboard has too many detail components");
      recommendations.push("Executives prefer high-level visuals (Gauge, Metric, Donut) over tables");
    }

    const hasKeyMetrics = components.some(c => c.type === 'gauge' || c.type === 'metric');
    if (!hasKeyMetrics) {
      score -= 10;
      issues.push("Executive dashboard lacks key metrics");
      recommendations.push("Add quota attainment, revenue, or pipeline metrics at top");
    }
  }

  // Individual dashboards should be actionable
  if (audience.toLowerCase().includes('individual') || audience.toLowerCase().includes('rep')) {
    const hasTables = components.some(c => c.type === 'table');
    if (!hasTables) {
      score -= 10;
      recommendations.push("Individual dashboards should include actionable tables (My Deals, My Tasks)");
    }
  }

  return {
    dimension: QUALITY_DIMENSIONS.AUDIENCE_ALIGNMENT,
    score: Math.max(0, score),
    weight: 15,
    issues,
    recommendations,
    details: {
      audience: audience || 'Not specified',
      componentTypes: components.map(c => c.type).reduce((acc, type) => {
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      }, {})
    }
  };
}

/**
 * Evaluate actionability (alerts, thresholds, drill-downs)
 * @param {Object} dashboard - Dashboard metadata
 * @returns {Object} Score and feedback
 */
function evaluateActionability(dashboard) {
  let score = 100;
  const issues = [];
  const recommendations = [];

  const components = dashboard.components || [];

  // Check for targets/thresholds
  const componentsWithTargets = components.filter(c =>
    c.target || c.greenZone || c.redZone || c.hasTarget
  );

  if (componentsWithTargets.length === 0) {
    score -= 15;
    issues.push("No components have targets or thresholds - users don't know what's good/bad");
    recommendations.push("Add targets to key metrics (quota = 100%, coverage = 3x, etc.)");
  } else if (componentsWithTargets.length < components.length * 0.3) {
    score -= 10;
    recommendations.push("Add targets/thresholds to more components for better context");
  }

  // Check for conditional formatting
  const componentsWithFormatting = components.filter(c => c.conditionalFormatting);
  if (componentsWithFormatting.length === 0 && components.some(c => c.type === 'table')) {
    score -= 10;
    recommendations.push("Add conditional formatting to tables (highlight at-risk items in red)");
  }

  // Check for drill-down capability
  const componentsWithDrillDown = components.filter(c => c.clickthrough || c.drillDown);
  if (componentsWithDrillDown.length === 0) {
    score -= 5;
    recommendations.push("Enable drill-down on components to explore underlying data");
  }

  return {
    dimension: QUALITY_DIMENSIONS.ACTIONABILITY,
    score: Math.max(0, score),
    weight: 15,
    issues,
    recommendations,
    details: {
      componentsWithTargets: componentsWithTargets.length,
      componentsWithFormatting: componentsWithFormatting.length,
      componentsWithDrillDown: componentsWithDrillDown.length
    }
  };
}

/**
 * Calculate weighted total score
 * @param {Array<Object>} dimensionScores - Scores by dimension
 * @returns {number} Weighted total score
 */
function calculateTotalScore(dimensionScores) {
  const totalWeight = dimensionScores.reduce((sum, d) => sum + d.weight, 0);
  const weightedSum = dimensionScores.reduce((sum, d) => sum + (d.score * d.weight), 0);
  return Math.round(weightedSum / totalWeight);
}

/**
 * Convert score to letter grade
 * @param {number} score - Numeric score
 * @returns {string} Letter grade
 */
function scoreToGrade(score) {
  if (score >= GRADE_THRESHOLDS.A_PLUS) return 'A+';
  if (score >= GRADE_THRESHOLDS.A) return 'A';
  if (score >= GRADE_THRESHOLDS.A_MINUS) return 'A-';
  if (score >= GRADE_THRESHOLDS.B_PLUS) return 'B+';
  if (score >= GRADE_THRESHOLDS.B) return 'B';
  if (score >= GRADE_THRESHOLDS.B_MINUS) return 'B-';
  if (score >= GRADE_THRESHOLDS.C_PLUS) return 'C+';
  if (score >= GRADE_THRESHOLDS.C) return 'C';
  if (score >= GRADE_THRESHOLDS.C_MINUS) return 'C-';
  if (score >= GRADE_THRESHOLDS.D) return 'D';
  return 'F';
}

/**
 * Validate dashboard quality
 * @param {Object} dashboard - Dashboard metadata
 * @returns {Object} Validation results
 */
function validateDashboardQuality(dashboard) {
  // Evaluate all dimensions
  const dimensionScores = [
    evaluateComponentCount(dashboard),
    evaluateNamingConvention(dashboard),
    evaluateChartAppropriateness(dashboard),
    evaluateVisualHierarchy(dashboard),
    evaluateFilterUsage(dashboard),
    evaluatePerformance(dashboard),
    evaluateAudienceAlignment(dashboard),
    evaluateActionability(dashboard)
  ];

  // Calculate total score
  const totalScore = calculateTotalScore(dimensionScores);
  const grade = scoreToGrade(totalScore);

  // Aggregate issues and recommendations
  const allIssues = dimensionScores.flatMap(d => d.issues);
  const allRecommendations = dimensionScores.flatMap(d => d.recommendations);

  // Prioritize recommendations by score impact
  const sortedDimensions = [...dimensionScores].sort((a, b) => a.score - b.score);
  const topPriorities = sortedDimensions.slice(0, 3).map(d => d.dimension);

  return {
    totalScore,
    grade,
    dimensionScores,
    allIssues,
    allRecommendations,
    topPriorities,
    summary: {
      dashboardName: dashboard.name || dashboard.title || 'Unnamed Dashboard',
      componentCount: dashboard.components?.length || 0,
      audience: dashboard.audience || 'Not specified',
      passesMinimumQuality: totalScore >= 70
    }
  };
}

/**
 * Format validation output
 * @param {Object} result - Validation result
 * @param {Object} options - Formatting options
 * @returns {string} Formatted output
 */
function formatValidationOutput(result, options = {}) {
  const { format = 'text' } = options;

  if (format === 'json') {
    return JSON.stringify(result, null, 2);
  }

  // Text format
  const gradeEmoji = {
    'A+': '🏆', 'A': '🎯', 'A-': '✅',
    'B+': '👍', 'B': '👌', 'B-': '🆗',
    'C+': '⚠️', 'C': '⚠️', 'C-': '⚠️',
    'D': '❌', 'F': '🚫'
  }[result.grade] || '❓';

  let output = `\n✅ DASHBOARD QUALITY VALIDATION\n`;
  output += `${'='.repeat(60)}\n\n`;

  // Summary
  output += `📊 Dashboard: ${result.summary.dashboardName}\n`;
  output += `${gradeEmoji} Overall Grade: ${result.grade} (${result.totalScore}/100)\n`;
  output += `   Components: ${result.summary.componentCount} | Audience: ${result.summary.audience}\n`;
  output += `   Status: ${result.summary.passesMinimumQuality ? '✅ Passes minimum quality (70+)' : '❌ Below minimum quality (<70)'}\n`;
  output += `\n`;

  // Dimension scores
  output += `📈 Quality Dimensions:\n`;
  output += `${'-'.repeat(60)}\n`;

  result.dimensionScores.forEach(dim => {
    const emoji = dim.score >= 90 ? '🟢' : dim.score >= 70 ? '🟡' : '🔴';
    output += `${emoji} ${dim.dimension.replace(/_/g, ' ').toUpperCase()}: ${dim.score}/100 (Weight: ${dim.weight}%)\n`;
  });

  output += `\n`;

  // Issues
  if (result.allIssues.length > 0) {
    output += `⚠️  Issues Found (${result.allIssues.length}):\n`;
    result.allIssues.forEach((issue, i) => {
      output += `   ${i + 1}. ${issue}\n`;
    });
    output += `\n`;
  } else {
    output += `✅ No issues found!\n\n`;
  }

  // Recommendations
  if (result.allRecommendations.length > 0) {
    output += `💡 Recommendations (${result.allRecommendations.length}):\n`;
    result.allRecommendations.forEach((rec, i) => {
      output += `   ${i + 1}. ${rec}\n`;
    });
    output += `\n`;
  }

  // Top priorities
  output += `🎯 Top Priorities for Improvement:\n`;
  result.topPriorities.forEach((priority, i) => {
    output += `   ${i + 1}. ${priority.replace(/_/g, ' ').toUpperCase()}\n`;
  });

  return output;
}

function getArgValue(args, flag) {
  const index = args.indexOf(flag);
  if (index === -1) {
    return null;
  }
  const value = args[index + 1];
  if (!value || value.startsWith('--')) {
    return null;
  }
  return value;
}

/**
 * CLI handler
 */
function run() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help')) {
    console.log(`
✅ Dashboard Quality Validator - Enterprise Quality Scoring

USAGE:
  node dashboard-quality-validator.js [options]

OPTIONS:
  --dashboard <path>     Path to dashboard JSON file
  --format <type>        Output format (text|json) [default: text]
  --test                 Run test scenarios

EXAMPLES:
  # Validate dashboard
  node dashboard-quality-validator.js --dashboard my-dashboard.json

  # Run test scenarios
  node dashboard-quality-validator.js --test
    `);
    process.exit(0);
  }

  // Test mode
  if (args.includes('--test')) {
    console.log('\n🧪 Running test scenarios...\n');

    // Test 1: Well-designed executive dashboard
    console.log('TEST 1: Well-Designed Executive Dashboard');
    const test1 = {
      name: 'Executive Revenue Performance Dashboard',
      audience: 'Executive',
      refreshFrequency: 'Daily',
      filters: [
        { field: 'Close Date', type: 'Date Range', default: 'THIS_QUARTER' },
        { field: 'Region', type: 'Picklist', default: 'All' }
      ],
      components: [
        {
          position: 1,
          title: 'Quarterly Revenue vs Target',
          type: 'gauge',
          metric: 'Revenue',
          target: '$5M',
          greenZone: '>95%'
        },
        {
          position: 2,
          title: 'Monthly Revenue Trend',
          type: 'line',
          groupBy: 'Close Date',
          metric: 'Revenue'
        },
        {
          position: 3,
          title: 'Pipeline by Stage',
          type: 'funnel',
          groupBy: 'Stage',
          metric: 'Amount'
        },
        {
          position: 4,
          title: 'Revenue by Region',
          type: 'donut',
          groupBy: 'Region',
          metric: 'Revenue'
        },
        {
          position: 5,
          title: 'Top 10 Deals',
          type: 'table',
          metric: 'Opportunities',
          rowLimit: 10,
          conditionalFormatting: true
        }
      ]
    };

    const result1 = validateDashboardQuality(test1);
    console.log(formatValidationOutput(result1));

    // Test 2: Poorly designed dashboard
    console.log('\n\nTEST 2: Poorly Designed Dashboard (Many Issues)');
    const test2 = {
      name: 'Dashboard',
      components: [
        { position: 1, title: 'Chart 1', type: 'table' },
        { position: 2, title: 'Report', type: 'table' },
        { position: 3, type: 'table' }
      ]
    };

    const result2 = validateDashboardQuality(test2);
    console.log(formatValidationOutput(result2));

    process.exit(0);
  }

  const dashboardPath = getArgValue(args, '--dashboard');
  if (!dashboardPath) {
    throw new Error('Missing required --dashboard <path> argument.');
  }
  if (!fs.existsSync(dashboardPath)) {
    throw new Error(`Dashboard file not found: ${dashboardPath}`);
  }

  const dashboardContent = JSON.parse(fs.readFileSync(dashboardPath, 'utf8'));
  if (!dashboardContent || typeof dashboardContent !== 'object') {
    throw new Error('Dashboard JSON is invalid.');
  }
  if (!dashboardContent.components || !Array.isArray(dashboardContent.components)) {
    throw new Error('Dashboard JSON must include a components array.');
  }

  const format = getArgValue(args, '--format') || 'text';
  if (!['text', 'json'].includes(format)) {
    throw new Error('Output format must be text or json.');
  }

  const result = validateDashboardQuality(dashboardContent);
  if (format === 'json') {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(formatValidationOutput(result));
}

function main() {
  try {
    run();
  } catch (error) {
    console.error(`❌ ${error.message}`);
    process.exit(1);
  }
}

// Run CLI if executed directly
if (require.main === module) {
  main();
}

// Export functions for use as library
module.exports = {
  validateDashboardQuality,
  formatValidationOutput,
  evaluateComponentCount,
  evaluateNamingConvention,
  evaluateChartAppropriateness,
  evaluateVisualHierarchy,
  evaluateFilterUsage,
  evaluatePerformance,
  evaluateAudienceAlignment,
  evaluateActionability,
  QUALITY_DIMENSIONS,
  GRADE_THRESHOLDS
};
