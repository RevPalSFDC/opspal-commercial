#!/usr/bin/env node

/**
 * Chart Type Selector - Intelligent chart type recommendation engine
 *
 * Analyzes data structure and business context to recommend optimal chart types
 * for Salesforce reports and dashboards.
 *
 * @module chart-type-selector
 * @version 1.0.0
 */

const CHART_TYPES = {
  BAR: 'bar',
  COLUMN: 'column',
  HORIZONTAL_BAR: 'horizontal_bar',
  STACKED_BAR: 'stacked_bar',
  LINE: 'line',
  FUNNEL: 'funnel',
  DONUT: 'donut',
  PIE: 'pie',
  GAUGE: 'gauge',
  METRIC: 'metric',
  TABLE: 'table',
  SCATTER: 'scatter',
  COMBO: 'combo'
};

const DATA_PATTERNS = {
  SINGLE_METRIC: 'single_metric',
  COMPARISON: 'comparison',
  TREND_OVER_TIME: 'trend_over_time',
  PART_TO_WHOLE: 'part_to_whole',
  SEQUENTIAL_PROCESS: 'sequential_process',
  CORRELATION: 'correlation',
  DISTRIBUTION: 'distribution',
  RANKING: 'ranking',
  TARGET_VS_ACTUAL: 'target_vs_actual'
};

const fs = require('fs');

/**
 * Analyze data characteristics to determine pattern
 * @param {Object} dataCharacteristics - Data structure information
 * @returns {string} Detected data pattern
 */
function detectDataPattern(dataCharacteristics) {
  const {
    groupingDimensions,
    hasDateField,
    hasSequentialField,
    hasTargetValue,
    categoryCount,
    isCorrelation,
    isSingleValue
  } = dataCharacteristics;

  // Single value with target
  if (isSingleValue && hasTargetValue) {
    return DATA_PATTERNS.TARGET_VS_ACTUAL;
  }

  // Single metric
  if (isSingleValue) {
    return DATA_PATTERNS.SINGLE_METRIC;
  }

  // Time-based trend
  if (hasDateField && groupingDimensions === 1) {
    return DATA_PATTERNS.TREND_OVER_TIME;
  }

  // Sequential process (stages, steps)
  if (hasSequentialField && groupingDimensions === 1) {
    return DATA_PATTERNS.SEQUENTIAL_PROCESS;
  }

  // Part-to-whole (small number of categories)
  if (groupingDimensions === 1 && categoryCount <= 7) {
    return DATA_PATTERNS.PART_TO_WHOLE;
  }

  // Correlation (two numeric dimensions)
  if (isCorrelation) {
    return DATA_PATTERNS.CORRELATION;
  }

  // Ranking/comparison
  if (groupingDimensions === 1 && categoryCount > 7) {
    return DATA_PATTERNS.RANKING;
  }

  // Distribution
  if (groupingDimensions === 1 && categoryCount > 15) {
    return DATA_PATTERNS.DISTRIBUTION;
  }

  // Multiple dimensions - comparison
  if (groupingDimensions >= 2) {
    return DATA_PATTERNS.COMPARISON;
  }

  // Default to comparison
  return DATA_PATTERNS.COMPARISON;
}

/**
 * Score a chart type based on data pattern and context
 * @param {string} chartType - Chart type to score
 * @param {string} dataPattern - Detected data pattern
 * @param {Object} context - Business context
 * @returns {number} Score from 0-100
 */
function scoreChartType(chartType, dataPattern, context) {
  const { audience, dashboardPosition, componentCount } = context;
  const normalizedChartType = chartType === CHART_TYPES.COLUMN ? CHART_TYPES.BAR : chartType;

  // Base scores by pattern-chart combination
  const patternScores = {
    [DATA_PATTERNS.SINGLE_METRIC]: {
      [CHART_TYPES.METRIC]: 95,
      [CHART_TYPES.GAUGE]: 80,
      [CHART_TYPES.TABLE]: 40
    },
    [DATA_PATTERNS.TARGET_VS_ACTUAL]: {
      [CHART_TYPES.GAUGE]: 95,
      [CHART_TYPES.METRIC]: 85,
      [CHART_TYPES.BAR]: 60
    },
    [DATA_PATTERNS.TREND_OVER_TIME]: {
      [CHART_TYPES.LINE]: 95,
      [CHART_TYPES.BAR]: 70,
      [CHART_TYPES.COMBO]: 75,
      [CHART_TYPES.TABLE]: 50
    },
    [DATA_PATTERNS.SEQUENTIAL_PROCESS]: {
      [CHART_TYPES.FUNNEL]: 95,
      [CHART_TYPES.BAR]: 70,
      [CHART_TYPES.TABLE]: 60
    },
    [DATA_PATTERNS.PART_TO_WHOLE]: {
      [CHART_TYPES.DONUT]: 90,
      [CHART_TYPES.PIE]: 85,
      [CHART_TYPES.BAR]: 75,
      [CHART_TYPES.TABLE]: 60
    },
    [DATA_PATTERNS.CORRELATION]: {
      [CHART_TYPES.SCATTER]: 95,
      [CHART_TYPES.TABLE]: 60
    },
    [DATA_PATTERNS.RANKING]: {
      [CHART_TYPES.HORIZONTAL_BAR]: 90,
      [CHART_TYPES.BAR]: 85,
      [CHART_TYPES.TABLE]: 80
    },
    [DATA_PATTERNS.DISTRIBUTION]: {
      [CHART_TYPES.BAR]: 85,
      [CHART_TYPES.TABLE]: 80,
      [CHART_TYPES.HORIZONTAL_BAR]: 75
    },
    [DATA_PATTERNS.COMPARISON]: {
      [CHART_TYPES.STACKED_BAR]: 85,
      [CHART_TYPES.BAR]: 80,
      [CHART_TYPES.TABLE]: 75
    }
  };

  let score = patternScores[dataPattern]?.[normalizedChartType] || 0;

  // Audience adjustments
  if (audience === 'executive') {
    // Executives prefer high-level visuals
    if ([CHART_TYPES.GAUGE, CHART_TYPES.METRIC, CHART_TYPES.DONUT].includes(chartType)) {
      score += 5;
    }
    if (chartType === CHART_TYPES.TABLE) {
      score -= 10; // Executives don't want detail
    }
  } else if (audience === 'manager') {
    // Managers want actionable visuals
    if ([CHART_TYPES.BAR, CHART_TYPES.HORIZONTAL_BAR, CHART_TYPES.FUNNEL].includes(chartType)) {
      score += 5;
    }
  } else if (audience === 'individual') {
    // Reps want detail
    if (chartType === CHART_TYPES.TABLE) {
      score += 5;
    }
  }

  // Position adjustments
  if (dashboardPosition === 'top' || dashboardPosition === 1) {
    // Top position should be high-impact
    if ([CHART_TYPES.GAUGE, CHART_TYPES.METRIC].includes(chartType)) {
      score += 5;
    }
  }

  // Component count adjustments
  if (componentCount > 7) {
    // Simplify when dashboard is crowded
    if ([CHART_TYPES.METRIC, CHART_TYPES.GAUGE].includes(chartType)) {
      score += 5;
    }
    if (chartType === CHART_TYPES.TABLE) {
      score -= 5;
    }
  }

  return Math.min(100, Math.max(0, score));
}

/**
 * Get rationale for chart type recommendation
 * @param {string} chartType - Chart type
 * @param {string} dataPattern - Data pattern
 * @returns {string} Human-readable rationale
 */
function getRationale(chartType, dataPattern) {
  const normalizedChartType = chartType === CHART_TYPES.COLUMN ? CHART_TYPES.BAR : chartType;
  const rationales = {
    [CHART_TYPES.METRIC]: {
      [DATA_PATTERNS.SINGLE_METRIC]: "Simple numeric display is best for single KPIs - draws immediate attention to the value",
      [DATA_PATTERNS.TARGET_VS_ACTUAL]: "Shows the actual value prominently with optional comparison to target"
    },
    [CHART_TYPES.GAUGE]: {
      [DATA_PATTERNS.TARGET_VS_ACTUAL]: "Instantly communicates progress toward target with color zones (green/yellow/red)",
      [DATA_PATTERNS.SINGLE_METRIC]: "Good for showing status at a glance with visual zones"
    },
    [CHART_TYPES.LINE]: {
      [DATA_PATTERNS.TREND_OVER_TIME]: "Ideal for showing trends over time - humans are great at spotting line patterns",
      [DATA_PATTERNS.COMPARISON]: "Works well for comparing multiple trends on same timeline"
    },
    [CHART_TYPES.FUNNEL]: {
      [DATA_PATTERNS.SEQUENTIAL_PROCESS]: "Perfect for conversion processes - shows drop-off at each stage",
      [DATA_PATTERNS.PART_TO_WHOLE]: "Emphasizes progression through sequential steps"
    },
    [CHART_TYPES.DONUT]: {
      [DATA_PATTERNS.PART_TO_WHOLE]: "Shows part-to-whole relationships clearly with percentages",
      [DATA_PATTERNS.COMPARISON]: "Good for comparing 3-7 categories as % of total"
    },
    [CHART_TYPES.PIE]: {
      [DATA_PATTERNS.PART_TO_WHOLE]: "Classic part-to-whole visualization - best for 2-5 slices",
      [DATA_PATTERNS.COMPARISON]: "Shows relative proportions at a glance"
    },
    [CHART_TYPES.BAR]: {
      [DATA_PATTERNS.COMPARISON]: "Best for comparing values across categories - easy to read exact values",
      [DATA_PATTERNS.RANKING]: "Shows rankings clearly - taller bars = better performance",
      [DATA_PATTERNS.DISTRIBUTION]: "Displays distribution patterns effectively"
    },
    [CHART_TYPES.HORIZONTAL_BAR]: {
      [DATA_PATTERNS.RANKING]: "Ideal for rankings - names on left, values on right (natural reading pattern)",
      [DATA_PATTERNS.COMPARISON]: "Better than vertical bars when category names are long"
    },
    [CHART_TYPES.STACKED_BAR]: {
      [DATA_PATTERNS.COMPARISON]: "Shows totals AND breakdown by sub-category in single view",
      [DATA_PATTERNS.PART_TO_WHOLE]: "Combines comparison with composition"
    },
    [CHART_TYPES.SCATTER]: {
      [DATA_PATTERNS.CORRELATION]: "Perfect for showing correlation between two numeric variables",
      [DATA_PATTERNS.DISTRIBUTION]: "Reveals clusters and outliers in data"
    },
    [CHART_TYPES.TABLE]: {
      [DATA_PATTERNS.DISTRIBUTION]: "Provides exact values for detailed analysis",
      [DATA_PATTERNS.RANKING]: "Sortable, searchable, shows all details",
      [DATA_PATTERNS.COMPARISON]: "Good when exact numbers matter more than visual pattern"
    },
    [CHART_TYPES.COMBO]: {
      [DATA_PATTERNS.TREND_OVER_TIME]: "Combines bars and lines - great for actual vs target over time",
      [DATA_PATTERNS.COMPARISON]: "Shows both trend and composition"
    }
  };

  return rationales[normalizedChartType]?.[dataPattern] || "Suitable visualization for this data pattern";
}

/**
 * Get use cases for chart type
 * @param {string} chartType - Chart type
 * @returns {Array<string>} List of common use cases
 */
function getUseCases(chartType) {
  const normalizedChartType = chartType === CHART_TYPES.COLUMN ? CHART_TYPES.BAR : chartType;
  const useCases = {
    [CHART_TYPES.METRIC]: [
      "Quarterly Revenue",
      "Total Pipeline",
      "Deals Closed This Month",
      "Current Quarter Attainment"
    ],
    [CHART_TYPES.GAUGE]: [
      "Quota Attainment (vs 100%)",
      "Pipeline Coverage (vs 3x target)",
      "Win Rate (vs benchmark)",
      "Customer Health Score"
    ],
    [CHART_TYPES.LINE]: [
      "Monthly Revenue Trend",
      "Daily Activity Trend",
      "Weekly Pipeline Growth",
      "Quarterly Win Rate Trend"
    ],
    [CHART_TYPES.FUNNEL]: [
      "Sales Pipeline by Stage",
      "Marketing Lifecycle Funnel",
      "Lead → Opp → Won Conversion",
      "Support Case Escalation"
    ],
    [CHART_TYPES.DONUT]: [
      "Revenue by Region",
      "Pipeline by Product Line",
      "Cases by Priority",
      "Opportunities by Stage"
    ],
    [CHART_TYPES.PIE]: [
      "Market Share Distribution",
      "Budget Allocation",
      "Customer Segmentation"
    ],
    [CHART_TYPES.BAR]: [
      "Revenue by Sales Rep",
      "Opportunities by Region",
      "Cases by Status",
      "Campaigns by ROI"
    ],
    [CHART_TYPES.HORIZONTAL_BAR]: [
      "Quota Attainment by Rep (rankings)",
      "Top 10 Accounts by Revenue",
      "Loss Reasons (sorted by frequency)"
    ],
    [CHART_TYPES.STACKED_BAR]: [
      "Revenue by Region and Product",
      "Pipeline by Rep and Stage",
      "Activities by Rep and Type"
    ],
    [CHART_TYPES.SCATTER]: [
      "Deal Size vs Sales Cycle Length",
      "Quota Attainment vs Pipeline Coverage",
      "Customer Health vs ARR"
    ],
    [CHART_TYPES.TABLE]: [
      "Top 20 Opportunities by Value",
      "At-Risk Accounts Detail",
      "Rep Performance Scorecard",
      "Deal Inspection List"
    ],
    [CHART_TYPES.COMBO]: [
      "Actual vs Target Revenue by Month",
      "Pipeline (bars) and Win Rate (line)",
      "Cumulative Progress Chart"
    ]
  };

  return useCases[normalizedChartType] || [];
}

/**
 * Recommend chart types based on data characteristics and context
 * @param {Object} dataCharacteristics - Data structure information
 * @param {Object} context - Business context (audience, position, etc.)
 * @returns {Array<Object>} Ranked recommendations with scores and rationales
 */
function recommendChartTypes(dataCharacteristics, context = {}) {
  // Detect data pattern
  const dataPattern = detectDataPattern(dataCharacteristics);

  // Get all chart types
  const allChartTypes = Object.values(CHART_TYPES);

  // Score each chart type
  const recommendations = allChartTypes
    .map(chartType => ({
      chartType,
      score: scoreChartType(chartType, dataPattern, context),
      rationale: getRationale(chartType, dataPattern),
      useCases: getUseCases(chartType),
      dataPattern
    }))
    .filter(rec => rec.score > 0) // Only include viable options
    .sort((a, b) => b.score - a.score); // Sort by score descending

  return recommendations;
}

/**
 * Analyze Salesforce report metadata to extract data characteristics
 * @param {Object} reportMetadata - Salesforce report metadata
 * @returns {Object} Data characteristics
 */
function analyzeReportMetadata(reportMetadata) {
  const {
    reportFormat,
    groupingsDown = [],
    groupingsAcross = [],
    detailColumns = [],
    aggregates = [],
    chart = {}
  } = reportMetadata;

  // Count grouping dimensions
  const groupingDimensions = groupingsDown.length + groupingsAcross.length;

  // Check for date fields
  const allFields = [
    ...groupingsDown.map(g => g.field),
    ...groupingsAcross.map(g => g.field),
    ...detailColumns
  ];
  const dateFields = allFields.filter(field =>
    field.includes('Date') || field.includes('DATE') || field.includes('CreatedDate') || field.includes('CloseDate')
  );
  const hasDateField = dateFields.length > 0;

  // Check for sequential fields (Stage, Status, Priority)
  const sequentialFields = allFields.filter(field =>
    field.includes('Stage') || field.includes('Status') || field.includes('Priority') || field.includes('Lifecycle')
  );
  const hasSequentialField = sequentialFields.length > 0;

  // Check for target value in context
  const hasTargetValue = aggregates.some(agg =>
    agg.name && (agg.name.includes('Quota') || agg.name.includes('Target') || agg.name.includes('Goal'))
  );

  // Estimate category count (heuristic)
  let categoryCount = 10; // Default estimate
  if (hasSequentialField) {
    categoryCount = 6; // Typical stage count
  } else if (groupingsDown[0]?.field.includes('Owner') || groupingsDown[0]?.field.includes('Rep')) {
    categoryCount = 15; // Typical team size
  }

  // Check if single value
  const isSingleValue = groupingDimensions === 0 && aggregates.length === 1;

  // Check for correlation pattern
  const isCorrelation = groupingDimensions === 0 && aggregates.length >= 2;

  return {
    reportFormat,
    groupingDimensions,
    hasDateField,
    hasSequentialField,
    hasTargetValue,
    categoryCount,
    isCorrelation,
    isSingleValue,
    aggregateCount: aggregates.length
  };
}

/**
 * Format recommendations as human-readable output
 * @param {Array<Object>} recommendations - Chart recommendations
 * @param {Object} options - Formatting options
 * @returns {string} Formatted output
 */
function formatRecommendations(recommendations, options = {}) {
  const { format = 'text', topN = 3 } = options;

  if (format === 'json') {
    return JSON.stringify(recommendations.slice(0, topN), null, 2);
  }

  // Text format
  let output = `\n📊 CHART TYPE RECOMMENDATIONS\n`;
  output += `${'='.repeat(50)}\n\n`;

  recommendations.slice(0, topN).forEach((rec, index) => {
    const rank = index + 1;
    const stars = '⭐'.repeat(Math.ceil(rec.score / 20));

    output += `${rank}. ${rec.chartType.toUpperCase()} (Score: ${rec.score}/100) ${stars}\n`;
    output += `   📝 ${rec.rationale}\n`;

    if (rec.useCases.length > 0) {
      output += `   💡 Common Use Cases:\n`;
      rec.useCases.slice(0, 3).forEach(useCase => {
        output += `      • ${useCase}\n`;
      });
    }
    output += `\n`;
  });

  output += `\n🔍 Data Pattern Detected: ${recommendations[0]?.dataPattern}\n`;

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
📊 Chart Type Selector - Intelligent Chart Recommendation Engine

USAGE:
  node chart-type-selector.js [options]

OPTIONS:
  --report <path>        Path to report metadata JSON file
  --interactive          Interactive mode (prompts for characteristics)
  --audience <type>      Target audience (executive|manager|individual)
  --position <n>         Dashboard position (1-10)
  --components <n>       Total dashboard components (1-20)
  --format <type>        Output format (text|json) [default: text]
  --top <n>              Show top N recommendations [default: 3]

EXAMPLES:
  # Analyze report metadata
  node chart-type-selector.js --report my-report.json

  # Interactive mode
  node chart-type-selector.js --interactive

  # With context
  node chart-type-selector.js --report my-report.json --audience executive --position 1

  # Quick test with sample data
  node chart-type-selector.js --test
    `);
      process.exit(0);
    }

    // Test mode
    if (args.includes('--test')) {
      console.log('\n🧪 Running test scenarios...\n');

      // Test 1: Single metric with target
      console.log('TEST 1: Quota Attainment (single metric with target)');
      const test1 = recommendChartTypes(
        {
          groupingDimensions: 0,
          hasDateField: false,
          hasSequentialField: false,
          hasTargetValue: true,
          categoryCount: 1,
          isCorrelation: false,
          isSingleValue: true
        },
        { audience: 'executive', dashboardPosition: 1, componentCount: 6 }
      );
      console.log(formatRecommendations(test1));

      // Test 2: Trend over time
      console.log('\nTEST 2: Monthly Revenue Trend');
      const test2 = recommendChartTypes(
        {
          groupingDimensions: 1,
          hasDateField: true,
          hasSequentialField: false,
          hasTargetValue: false,
          categoryCount: 12,
          isCorrelation: false,
          isSingleValue: false
        },
        { audience: 'manager', dashboardPosition: 2, componentCount: 6 }
      );
      console.log(formatRecommendations(test2));

      // Test 3: Sequential process
      console.log('\nTEST 3: Sales Pipeline by Stage');
      const test3 = recommendChartTypes(
        {
          groupingDimensions: 1,
          hasDateField: false,
          hasSequentialField: true,
          hasTargetValue: false,
          categoryCount: 6,
          isCorrelation: false,
          isSingleValue: false
        },
        { audience: 'individual', dashboardPosition: 4, componentCount: 7 }
      );
      console.log(formatRecommendations(test3));

      process.exit(0);
    }

    if (args.includes('--interactive')) {
      throw new Error('Interactive mode is not implemented yet. Use --report <path> for analysis.');
    }

    const reportPath = getArgValue(args, '--report');
    if (reportPath) {
      if (!fs.existsSync(reportPath)) {
        throw new Error(`Report file not found: ${reportPath}`);
      }

      const reportContent = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
      const reportMetadata = reportContent.reportMetadata || reportContent;
      if (!reportMetadata || typeof reportMetadata !== 'object') {
        throw new Error('Invalid report metadata format.');
      }

      const dataCharacteristics = analyzeReportMetadata(reportMetadata);
      const audience = getArgValue(args, '--audience') || 'manager';
      const dashboardPosition = Number(getArgValue(args, '--position') || 1);
      const componentCount = Number(getArgValue(args, '--components') || 6);
      const format = getArgValue(args, '--format') || 'text';
      const topN = Number(getArgValue(args, '--top') || 3);

      if (!Number.isFinite(dashboardPosition) || dashboardPosition <= 0) {
        throw new Error('Dashboard position must be a positive number.');
      }
      if (!Number.isFinite(componentCount) || componentCount <= 0) {
        throw new Error('Component count must be a positive number.');
      }
      if (!Number.isFinite(topN) || topN <= 0) {
        throw new Error('Top N must be a positive number.');
      }

      const recommendations = recommendChartTypes(dataCharacteristics, {
        audience,
        dashboardPosition,
        componentCount
      });
      console.log(formatRecommendations(recommendations, { format, topN }));
      return;
    }

    throw new Error('Invalid usage. Use --help for usage information or --test for examples.');
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
  recommendChartTypes,
  analyzeReportMetadata,
  detectDataPattern,
  formatRecommendations,
  CHART_TYPES,
  DATA_PATTERNS
};
