#!/usr/bin/env node

/**
 * Dashboard Layout Optimizer - Visual hierarchy and layout automation
 *
 * Applies F-pattern reading flow and visual hierarchy principles to optimize
 * dashboard component placement and sizing for maximum impact.
 *
 * @module dashboard-layout-optimizer
 * @version 1.0.0
 */

const COMPONENT_SIZES = {
  FULL_WIDTH: 'full-width',      // 12 columns
  HALF_WIDTH: 'half-width',       // 6 columns
  THIRD_WIDTH: 'third-width',     // 4 columns
  QUARTER_WIDTH: 'quarter-width', // 3 columns
  TWO_THIRDS: 'two-thirds-width'  // 8 columns
};

const COMPONENT_TYPES = {
  METRIC: 'metric',
  GAUGE: 'gauge',
  CHART: 'chart',
  TABLE: 'table',
  LIST: 'list'
};

const fs = require('fs');

const IMPORTANCE_LEVELS = {
  CRITICAL: 4,  // Must see immediately
  HIGH: 3,      // Very important
  MEDIUM: 2,    // Important
  LOW: 1        // Nice to have
};

/**
 * Calculate component importance score
 * @param {Object} component - Dashboard component
 * @param {Object} context - Business context
 * @returns {number} Importance score (1-100)
 */
function calculateImportanceScore(component, context = {}) {
  const { audience = 'manager', dashboardPurpose = 'general' } = context;
  const componentType = (component.componentType || component.type || '').toLowerCase();

  let score = 50; // Base score

  // Type-based scoring
  const typeScores = {
    [COMPONENT_TYPES.METRIC]: 30,
    [COMPONENT_TYPES.GAUGE]: 25,
    [COMPONENT_TYPES.CHART]: 15,
    [COMPONENT_TYPES.TABLE]: 10,
    [COMPONENT_TYPES.LIST]: 5
  };
  score += typeScores[componentType] || 0;

  // Metric-based scoring (what's being measured)
  const metricPatterns = {
    quota: 20,
    revenue: 20,
    attainment: 18,
    target: 15,
    pipeline: 15,
    coverage: 12,
    'win rate': 12,
    forecast: 10,
    activity: 8,
    trend: 5
  };

  const metricLower = (component.title + ' ' + component.metric).toLowerCase();
  Object.entries(metricPatterns).forEach(([keyword, points]) => {
    if (metricLower.includes(keyword)) {
      score += points;
    }
  });

  // Audience-based adjustments
  if (audience === 'executive') {
    // Executives prioritize high-level KPIs
    if (componentType === COMPONENT_TYPES.METRIC || componentType === COMPONENT_TYPES.GAUGE) {
      score += 10;
    }
    if (componentType === COMPONENT_TYPES.TABLE) {
      score -= 10; // Executives don't want detail tables at top
    }
  } else if (audience === 'individual') {
    // Reps prioritize actionable lists and tables
    if (componentType === COMPONENT_TYPES.TABLE || componentType === COMPONENT_TYPES.LIST) {
      score += 10;
    }
  }

  // Target/threshold presence (indicates actionability)
  if (component.hasTarget || component.greenZone || component.redZone) {
    score += 8;
  }

  // Alert/notification capability
  if (component.alertEnabled || component.conditionalFormatting) {
    score += 5;
  }

  return Math.min(100, Math.max(0, score));
}

/**
 * Determine optimal size for component based on type and importance
 * @param {Object} component - Dashboard component
 * @param {number} importanceScore - Component importance score
 * @param {Object} context - Layout context
 * @returns {string} Recommended size
 */
function determineOptimalSize(component, importanceScore, context = {}) {
  const { totalComponents = 6, currentRow = 1 } = context;

  // Critical components (top of dashboard) should be prominent
  if (importanceScore >= 80 && currentRow === 1) {
    // Full width for critical KPIs at top
    if (component.type === COMPONENT_TYPES.GAUGE || component.type === COMPONENT_TYPES.METRIC) {
      return COMPONENT_SIZES.FULL_WIDTH;
    }
  }

  // Type-based default sizes
  const sizeByType = {
    [COMPONENT_TYPES.METRIC]: COMPONENT_SIZES.QUARTER_WIDTH,
    [COMPONENT_TYPES.GAUGE]: COMPONENT_SIZES.HALF_WIDTH,
    [COMPONENT_TYPES.CHART]: COMPONENT_SIZES.HALF_WIDTH,
    [COMPONENT_TYPES.TABLE]: COMPONENT_SIZES.FULL_WIDTH,
    [COMPONENT_TYPES.LIST]: COMPONENT_SIZES.FULL_WIDTH
  };

  let recommendedSize = sizeByType[component.type] || COMPONENT_SIZES.HALF_WIDTH;

  // Adjust based on importance
  if (importanceScore >= 70) {
    // High importance - give more space
    if (recommendedSize === COMPONENT_SIZES.QUARTER_WIDTH) {
      recommendedSize = COMPONENT_SIZES.THIRD_WIDTH;
    } else if (recommendedSize === COMPONENT_SIZES.THIRD_WIDTH) {
      recommendedSize = COMPONENT_SIZES.HALF_WIDTH;
    }
  } else if (importanceScore < 40) {
    // Low importance - use less space
    if (recommendedSize === COMPONENT_SIZES.HALF_WIDTH) {
      recommendedSize = COMPONENT_SIZES.THIRD_WIDTH;
    } else if (recommendedSize === COMPONENT_SIZES.THIRD_WIDTH) {
      recommendedSize = COMPONENT_SIZES.QUARTER_WIDTH;
    }
  }

  // Dashboard density adjustments
  if (totalComponents > 8) {
    // Crowded dashboard - reduce sizes
    if (recommendedSize === COMPONENT_SIZES.FULL_WIDTH && component.type !== COMPONENT_TYPES.TABLE) {
      recommendedSize = COMPONENT_SIZES.HALF_WIDTH;
    }
  }

  return recommendedSize;
}

/**
 * Apply F-pattern layout algorithm
 * @param {Array<Object>} components - Dashboard components with scores
 * @returns {Array<Object>} Components with optimal positions and sizes
 */
function applyFPatternLayout(components) {
  // Sort by importance score (descending)
  const sortedComponents = [...components].sort((a, b) => b.importanceScore - a.importanceScore);

  const layout = [];
  let currentRow = 1;
  let currentColumn = 1;
  const COLUMNS_PER_ROW = 12; // Bootstrap-style 12-column grid

  sortedComponents.forEach((component, index) => {
    const position = index + 1;

    // Determine size
    const size = determineOptimalSize(component, component.importanceScore, {
      totalComponents: components.length,
      currentRow
    });

    // Calculate column span
    const columnSpan = {
      [COMPONENT_SIZES.FULL_WIDTH]: 12,
      [COMPONENT_SIZES.TWO_THIRDS]: 8,
      [COMPONENT_SIZES.HALF_WIDTH]: 6,
      [COMPONENT_SIZES.THIRD_WIDTH]: 4,
      [COMPONENT_SIZES.QUARTER_WIDTH]: 3
    }[size];

    // Check if component fits in current row
    if (currentColumn + columnSpan > COLUMNS_PER_ROW) {
      // Move to next row
      currentRow++;
      currentColumn = 1;
    }

    layout.push({
      ...component,
      position,
      size,
      row: currentRow,
      column: currentColumn,
      columnSpan,
      layoutRationale: getLayoutRationale(component, size, currentRow, currentColumn)
    });

    // Update column position
    currentColumn += columnSpan;
    if (currentColumn > COLUMNS_PER_ROW) {
      currentRow++;
      currentColumn = 1;
    }
  });

  return layout;
}

/**
 * Get rationale for layout decision
 * @param {Object} component - Component
 * @param {string} size - Assigned size
 * @param {number} row - Row position
 * @param {number} column - Column position
 * @returns {string} Human-readable rationale
 */
function getLayoutRationale(component, size, row, column) {
  const rationale = [];

  // Position rationale
  if (row === 1 && column === 1) {
    rationale.push("Top-left position (F-pattern hot zone) - highest visibility");
  } else if (row === 1) {
    rationale.push("Top row placement for high importance");
  } else if (row > 3) {
    rationale.push("Lower position - users may need to scroll");
  }

  // Size rationale
  if (size === COMPONENT_SIZES.FULL_WIDTH) {
    rationale.push("Full width for maximum impact or detailed data");
  } else if (size === COMPONENT_SIZES.HALF_WIDTH) {
    rationale.push("Half width balances visibility with space efficiency");
  } else if (size === COMPONENT_SIZES.QUARTER_WIDTH) {
    rationale.push("Compact size for simple metrics");
  }

  // Type rationale
  if (component.type === COMPONENT_TYPES.METRIC || component.type === COMPONENT_TYPES.GAUGE) {
    rationale.push("Single-value display doesn't need much space");
  } else if (component.type === COMPONENT_TYPES.TABLE) {
    rationale.push("Table needs full width for readability");
  }

  return rationale.join('; ');
}

/**
 * Validate layout quality and provide recommendations
 * @param {Array<Object>} layout - Optimized layout
 * @returns {Object} Validation results with score and recommendations
 */
function validateLayout(layout) {
  const issues = [];
  const recommendations = [];
  let score = 100;

  // Check component count (5-7 is optimal)
  if (layout.length < 4) {
    issues.push("Dashboard has very few components (<4) - may feel empty");
    recommendations.push("Consider adding trend charts or detail tables");
    score -= 5;
  } else if (layout.length > 9) {
    issues.push("Dashboard is crowded (>9 components) - cognitive overload risk");
    recommendations.push("Consider splitting into multiple dashboards or removing low-priority components");
    score -= 10;
  }

  // Check if top row has high-importance components
  const topRowComponents = layout.filter(c => c.row === 1);
  const topRowAvgScore = topRowComponents.reduce((sum, c) => sum + c.importanceScore, 0) / topRowComponents.length;

  if (topRowAvgScore < 60) {
    issues.push("Top row doesn't contain high-priority components");
    recommendations.push("Move critical KPIs (quota, revenue, pipeline) to top row");
    score -= 15;
  }

  // Check for full-width tables below fold
  const tablesAboveFold = layout.filter(c => c.type === COMPONENT_TYPES.TABLE && c.row <= 2);
  if (tablesAboveFold.length > 1) {
    issues.push("Multiple full-width tables in top rows - may push important visuals down");
    recommendations.push("Limit tables above fold to 1, or use half-width tables");
    score -= 10;
  }

  // Check balance of component types
  const typeCount = layout.reduce((acc, c) => {
    acc[c.type] = (acc[c.type] || 0) + 1;
    return acc;
  }, {});

  if (typeCount[COMPONENT_TYPES.TABLE] > layout.length * 0.5) {
    issues.push("Too many tables (>50%) - dashboard feels like a report");
    recommendations.push("Replace some tables with charts for better visual hierarchy");
    score -= 10;
  }

  if (!typeCount[COMPONENT_TYPES.METRIC] && !typeCount[COMPONENT_TYPES.GAUGE]) {
    issues.push("No single-value metrics - dashboard lacks immediate insight");
    recommendations.push("Add key metric(s) at top for at-a-glance visibility");
    score -= 15;
  }

  // Check for orphaned small components (alone in a row)
  const rowCounts = layout.reduce((acc, c) => {
    acc[c.row] = (acc[c.row] || 0) + 1;
    return acc;
  }, {});

  Object.entries(rowCounts).forEach(([row, count]) => {
    if (count === 1 && layout.find(c => c.row === parseInt(row) && c.size === COMPONENT_SIZES.QUARTER_WIDTH)) {
      issues.push(`Row ${row} has a single small component - looks unbalanced`);
      recommendations.push(`Consider pairing small components or increasing size`);
      score -= 5;
    }
  });

  return {
    score: Math.max(0, score),
    grade: scoreToGrade(score),
    issues,
    recommendations,
    summary: generateLayoutSummary(layout)
  };
}

/**
 * Convert score to letter grade
 * @param {number} score - Numeric score
 * @returns {string} Letter grade
 */
function scoreToGrade(score) {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

/**
 * Generate layout summary
 * @param {Array<Object>} layout - Optimized layout
 * @returns {Object} Summary statistics
 */
function generateLayoutSummary(layout) {
  const typeCount = layout.reduce((acc, c) => {
    acc[c.type] = (acc[c.type] || 0) + 1;
    return acc;
  }, {});

  const sizeCount = layout.reduce((acc, c) => {
    acc[c.size] = (acc[c.size] || 0) + 1;
    return acc;
  }, {});

  const avgImportance = layout.reduce((sum, c) => sum + c.importanceScore, 0) / layout.length;

  const rows = Math.max(...layout.map(c => c.row));

  return {
    totalComponents: layout.length,
    rowCount: rows,
    componentsByType: typeCount,
    componentsBySize: sizeCount,
    avgImportanceScore: Math.round(avgImportance),
    topComponentTitle: layout.find(c => c.row === 1 && c.column === 1)?.title
  };
}

/**
 * Optimize dashboard layout
 * @param {Array<Object>} components - Raw dashboard components
 * @param {Object} context - Business context
 * @returns {Object} Optimized layout with validation
 */
function optimizeDashboardLayout(components, context = {}) {
  // Step 1: Calculate importance scores
  const scoredComponents = components.map(component => ({
    ...component,
    importanceScore: calculateImportanceScore(component, context)
  }));

  // Step 2: Apply F-pattern layout
  const optimizedLayout = applyFPatternLayout(scoredComponents);

  // Step 3: Validate layout quality
  const validation = validateLayout(optimizedLayout);

  return {
    layout: optimizedLayout,
    validation,
    context
  };
}

/**
 * Format layout output
 * @param {Object} result - Optimization result
 * @param {Object} options - Formatting options
 * @returns {string} Formatted output
 */
function formatLayoutOutput(result, options = {}) {
  const { format = 'text' } = options;

  if (format === 'json') {
    return JSON.stringify(result, null, 2);
  }

  // Text format
  let output = `\n📐 DASHBOARD LAYOUT OPTIMIZATION\n`;
  output += `${'='.repeat(60)}\n\n`;

  // Summary
  output += `📊 Layout Summary:\n`;
  output += `   Total Components: ${result.validation.summary.totalComponents}\n`;
  output += `   Rows: ${result.validation.summary.rowCount}\n`;
  output += `   Avg Importance: ${result.validation.summary.avgImportanceScore}/100\n`;
  output += `   Top Component: ${result.validation.summary.topComponentTitle}\n`;
  output += `\n`;

  // Quality score
  const gradeEmoji = {A: '🎯', B: '👍', C: '⚠️', D: '❌', F: '🚫'}[result.validation.grade];
  output += `${gradeEmoji} Layout Quality: ${result.validation.grade} (${result.validation.score}/100)\n\n`;

  // Component layout
  output += `📋 Component Layout (F-Pattern Order):\n`;
  output += `${'-'.repeat(60)}\n`;

  result.layout.forEach((component, index) => {
    const positionEmoji = component.row === 1 && component.column === 1 ? '⭐' : component.row === 1 ? '🔥' : '  ';
    output += `${positionEmoji} ${index + 1}. [Row ${component.row}, Col ${component.column}] ${component.title}\n`;
    output += `      Type: ${component.type} | Size: ${component.size} | Importance: ${component.importanceScore}/100\n`;
    output += `      📝 ${component.layoutRationale}\n`;
    output += `\n`;
  });

  // Issues and recommendations
  if (result.validation.issues.length > 0) {
    output += `\n⚠️  Layout Issues:\n`;
    result.validation.issues.forEach((issue, i) => {
      output += `   ${i + 1}. ${issue}\n`;
    });
  }

  if (result.validation.recommendations.length > 0) {
    output += `\n💡 Recommendations:\n`;
    result.validation.recommendations.forEach((rec, i) => {
      output += `   ${i + 1}. ${rec}\n`;
    });
  }

  // Type breakdown
  output += `\n📊 Component Type Distribution:\n`;
  Object.entries(result.validation.summary.componentsByType).forEach(([type, count]) => {
    const percentage = Math.round((count / result.validation.summary.totalComponents) * 100);
    output += `   ${type}: ${count} (${percentage}%)\n`;
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
function main() {
  try {
    const args = process.argv.slice(2);

    if (args.length === 0 || args.includes('--help')) {
      console.log(`
📐 Dashboard Layout Optimizer - Visual Hierarchy Automation

USAGE:
  node dashboard-layout-optimizer.js [options]

OPTIONS:
  --dashboard <path>     Path to dashboard JSON file
  --audience <type>      Target audience (executive|manager|individual)
  --purpose <type>       Dashboard purpose (sales|marketing|cs|executive)
  --format <type>        Output format (text|json) [default: text]
  --test                 Run test scenarios

EXAMPLES:
  # Optimize dashboard layout
  node dashboard-layout-optimizer.js --dashboard my-dashboard.json --audience executive

  # Run test scenarios
  node dashboard-layout-optimizer.js --test
    `);
      process.exit(0);
    }

    // Test mode
    if (args.includes('--test')) {
      console.log('\n🧪 Running test scenarios...\n');

      // Test 1: Executive dashboard
      console.log('TEST 1: Executive Revenue Dashboard');
      const test1Components = [
        { title: 'Quarterly Revenue vs Target', type: 'gauge', metric: 'SUM(Amount)', hasTarget: true },
        { title: 'Monthly Revenue Trend', type: 'chart', metric: 'SUM(Amount)' },
        { title: 'Pipeline Health', type: 'chart', metric: 'Pipeline' },
        { title: 'Revenue by Region', type: 'chart', metric: 'SUM(Amount)' },
        { title: 'Top 10 Deals', type: 'table', metric: 'Opportunities' },
        { title: 'Win Rate', type: 'metric', metric: 'Win Rate %', hasTarget: true }
      ];

      const result1 = optimizeDashboardLayout(test1Components, { audience: 'executive', dashboardPurpose: 'revenue' });
      console.log(formatLayoutOutput(result1));

      // Test 2: Manager team dashboard
      console.log('\n\nTEST 2: Manager Team Pipeline Dashboard');
      const test2Components = [
        { title: 'Team Pipeline Value', type: 'metric', metric: 'SUM(Amount)' },
        { title: 'Team Coverage Ratio', type: 'metric', metric: 'Coverage', hasTarget: true },
        { title: 'Pipeline by Rep', type: 'chart', metric: 'Pipeline' },
        { title: 'Pipeline by Stage', type: 'chart', metric: 'Pipeline' },
        { title: 'Stalled Opportunities', type: 'table', metric: 'Opportunities' },
        { title: 'Deals Closing This Month', type: 'list', metric: 'Count' },
        { title: 'Team Activity Trend', type: 'chart', metric: 'Activities' }
      ];

      const result2 = optimizeDashboardLayout(test2Components, { audience: 'manager', dashboardPurpose: 'sales' });
      console.log(formatLayoutOutput(result2));

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
    const components = dashboardContent.dashboardLayout?.components || dashboardContent.components;
    if (!components || !Array.isArray(components)) {
      throw new Error('Dashboard JSON must include a components array.');
    }

    const audience = getArgValue(args, '--audience') || dashboardContent.audience || 'manager';
    const dashboardPurpose = getArgValue(args, '--purpose') || 'general';
    const format = getArgValue(args, '--format') || 'text';

    if (!['text', 'json'].includes(format)) {
      throw new Error('Output format must be text or json.');
    }

    const result = optimizeDashboardLayout(components, { audience, dashboardPurpose });
    if (format === 'json') {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    console.log(formatLayoutOutput(result));
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
  optimizeDashboardLayout,
  calculateImportanceScore,
  determineOptimalSize,
  applyFPatternLayout,
  validateLayout,
  formatLayoutOutput,
  COMPONENT_SIZES,
  COMPONENT_TYPES,
  IMPORTANCE_LEVELS
};
