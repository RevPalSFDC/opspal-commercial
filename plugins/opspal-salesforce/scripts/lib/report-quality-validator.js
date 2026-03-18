#!/usr/bin/env node

/**
 * Report Quality Validator - Enterprise report quality scoring
 *
 * Evaluates Salesforce reports against best practices and provides
 * quality scores with actionable recommendations.
 *
 * @module report-quality-validator
 * @version 1.0.0
 */

const QUALITY_DIMENSIONS = {
  FORMAT_SELECTION: 'format_selection',
  NAMING_CONVENTION: 'naming_convention',
  FILTER_USAGE: 'filter_usage',
  FIELD_SELECTION: 'field_selection',
  GROUPING_LOGIC: 'grouping_logic',
  CHART_USAGE: 'chart_usage',
  PERFORMANCE: 'performance',
  DOCUMENTATION: 'documentation',
  DATE_FILTER_QUALITY: 'date_filter_quality'
};

const REPORT_FORMATS = {
  TABULAR: 'TABULAR',
  SUMMARY: 'SUMMARY',
  MATRIX: 'MATRIX',
  JOINED: 'JOINED'
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
 * Evaluate report format selection
 * @param {Object} report - Report metadata
 * @returns {Object} Score and feedback
 */
function evaluateFormatSelection(report) {
  let score = 100;
  const issues = [];
  const recommendations = [];

  const format = report.reportFormat || report.format || '';
  const groupings = (report.groupingsDown || []).length + (report.groupingsAcross || []).length;
  const aggregates = (report.aggregates || []).length;

  // Tabular format validation
  if (format === REPORT_FORMATS.TABULAR) {
    if (groupings > 0 || aggregates > 0) {
      score -= 20;
      issues.push("Tabular format used with groupings/aggregates - should use Summary format");
      recommendations.push("Change to Summary Report format to support groupings and aggregates");
    }
  }

  // Summary format validation
  if (format === REPORT_FORMATS.SUMMARY) {
    if (groupings === 0) {
      score -= 15;
      issues.push("Summary format without groupings - use Tabular format for simple lists");
      recommendations.push("Add grouping (by Stage, Owner, Region, etc.) or change to Tabular");
    }

    if ((report.groupingsAcross || []).length > 0) {
      score -= 20;
      issues.push("Summary format with across groupings - use Matrix format for 2D grouping");
      recommendations.push("Change to Matrix Report format for cross-tabulation");
    }
  }

  // Matrix format validation
  if (format === REPORT_FORMATS.MATRIX) {
    if ((report.groupingsDown || []).length === 0 || (report.groupingsAcross || []).length === 0) {
      score -= 20;
      issues.push("Matrix format without 2D grouping - use Summary format instead");
      recommendations.push("Matrix requires both Down and Across groupings (e.g., Stage × Month)");
    }
  }

  // Check if format is specified
  if (!format) {
    score -= 30;
    issues.push("Report format not specified");
    recommendations.push("Set reportFormat to TABULAR, SUMMARY, or MATRIX");
  }

  return {
    dimension: QUALITY_DIMENSIONS.FORMAT_SELECTION,
    score: Math.max(0, score),
    weight: 20,
    issues,
    recommendations,
    details: {
      format,
      groupingsDown: (report.groupingsDown || []).length,
      groupingsAcross: (report.groupingsAcross || []).length,
      hasAggregates: aggregates > 0
    }
  };
}

/**
 * Evaluate naming convention
 * @param {Object} report - Report metadata
 * @returns {Object} Score and feedback
 */
function evaluateNamingConvention(report) {
  let score = 100;
  const issues = [];
  const recommendations = [];

  const reportName = report.name || report.title || '';

  if (!reportName) {
    score -= 30;
    issues.push("Report has no name");
    recommendations.push("Add descriptive name: [Metric] by [Dimension] (e.g., 'Pipeline by Stage')");
  } else if (reportName.length < 10) {
    score -= 15;
    issues.push("Report name is too short/vague");
    recommendations.push("Use clear, descriptive names that explain what data is shown");
  } else if (/^(report|new report|untitled)\s*\d*$/i.test(reportName)) {
    score -= 20;
    issues.push("Report has default/generic name");
    recommendations.push("Rename to describe content: [Metric] by [Grouping]");
  }

  // Check for period placeholder
  if (reportName && !reportName.includes('{Period}') && !reportName.includes('THIS') && !reportName.includes('FY')) {
    score -= 5;
    recommendations.push("Consider adding time period to name (e.g., 'Pipeline by Stage - Q1 2025')");
  }

  return {
    dimension: QUALITY_DIMENSIONS.NAMING_CONVENTION,
    score: Math.max(0, score),
    weight: 10,
    issues,
    recommendations,
    details: {
      reportName,
      nameLength: reportName.length
    }
  };
}

/**
 * Evaluate filter usage
 * @param {Object} report - Report metadata
 * @returns {Object} Score and feedback
 */
function evaluateFilterUsage(report) {
  let score = 100;
  const issues = [];
  const recommendations = [];

  const filters = report.reportFilters || report.filters || [];

  // Check if filters exist
  if (filters.length === 0) {
    score -= 20;
    issues.push("Report has no filters - will return all records (performance risk)");
    recommendations.push("Add filters: Date Range (THIS_QUARTER), Owner ($User.Id), Status (Open)");
  }

  // Check for date filters (performance and relevance)
  const hasDateFilter = filters.some(f =>
    f.column?.toLowerCase().includes('date') ||
    f.field?.toLowerCase().includes('date') ||
    f.value?.includes('THIS_') ||
    f.value?.includes('LAST_')
  );

  if (!hasDateFilter) {
    score -= 15;
    issues.push("No date filter - report may include very old records");
    recommendations.push("Add date filter (CreatedDate, CloseDate) with range like THIS_FISCAL_QUARTER");
  }

  // Check for dynamic filters
  const hasDynamicFilter = filters.some(f =>
    f.value?.includes('$User') || f.operator === 'equals' && f.value === '$User.Id'
  );

  if (!hasDynamicFilter && filters.length > 0) {
    score -= 5;
    recommendations.push("Consider adding dynamic filter ($User.Id) for personalized views");
  }

  // Check for overly broad filters
  const hasOnlyBroadFilters = filters.every(f => f.operator === 'notEqual' || f.value === 'All');
  if (filters.length > 0 && hasOnlyBroadFilters) {
    score -= 10;
    issues.push("Filters are too broad (only 'notEqual' or 'All')");
    recommendations.push("Add selective filters to improve performance");
  }

  return {
    dimension: QUALITY_DIMENSIONS.FILTER_USAGE,
    score: Math.max(0, score),
    weight: 15,
    issues,
    recommendations,
    details: {
      filterCount: filters.length,
      hasDateFilter,
      hasDynamicFilter,
      filters: filters.map(f => ({
        column: f.column || f.field,
        operator: f.operator,
        value: f.value
      }))
    }
  };
}

/**
 * Evaluate field selection
 * @param {Object} report - Report metadata
 * @returns {Object} Score and feedback
 */
function evaluateFieldSelection(report) {
  let score = 100;
  const issues = [];
  const recommendations = [];

  const detailColumns = report.detailColumns || report.columns || [];

  // Check if fields are selected
  if (detailColumns.length === 0) {
    score -= 30;
    issues.push("Report has no fields/columns selected");
    recommendations.push("Add relevant fields (Name, Amount, Stage, Close Date, Owner, etc.)");
  } else if (detailColumns.length > 20) {
    score -= 15;
    issues.push(`Report has many columns (${detailColumns.length}) - may be overwhelming`);
    recommendations.push("Limit to 5-10 most important fields for readability");
  } else if (detailColumns.length > 15) {
    score -= 5;
    recommendations.push("Consider reducing column count (<15) for better readability");
  }

  // Check for key fields
  const hasNameField = detailColumns.some(col =>
    col.includes('Name') || col.includes('NAME')
  );

  if (!hasNameField && detailColumns.length > 0) {
    score -= 10;
    issues.push("Report missing primary identifier (Name field)");
    recommendations.push("Add Name/Account Name as first column");
  }

  // Check for ID fields (should be hidden)
  const hasIDFields = detailColumns.some(col =>
    col.endsWith('Id') || col.endsWith('ID') || col === 'Id'
  );

  if (hasIDFields) {
    score -= 5;
    recommendations.push("Remove ID fields (e.g., AccountId, OwnerId) - use Name fields instead");
  }

  return {
    dimension: QUALITY_DIMENSIONS.FIELD_SELECTION,
    score: Math.max(0, score),
    weight: 15,
    issues,
    recommendations,
    details: {
      fieldCount: detailColumns.length,
      hasNameField,
      hasIDFields,
      fields: detailColumns
    }
  };
}

/**
 * Evaluate grouping logic
 * @param {Object} report - Report metadata
 * @returns {Object} Score and feedback
 */
function evaluateGroupingLogic(report) {
  let score = 100;
  const issues = [];
  const recommendations = [];

  const format = report.reportFormat || report.format || '';
  const groupingsDown = report.groupingsDown || [];
  const groupingsAcross = report.groupingsAcross || [];
  const aggregates = report.aggregates || [];

  // Summary/Matrix reports should have groupings
  if ((format === REPORT_FORMATS.SUMMARY || format === REPORT_FORMATS.MATRIX) && groupingsDown.length === 0) {
    score -= 20;
    issues.push("Summary/Matrix format without groupings");
    recommendations.push("Add grouping field (Stage, Owner, Region, Date, etc.)");
  }

  // Check for appropriate grouping fields
  const allGroupings = [...groupingsDown, ...groupingsAcross];
  const hasDateGrouping = allGroupings.some(g =>
    g.field?.includes('Date') || g.dateGranularity
  );

  const hasSequentialGrouping = allGroupings.some(g =>
    g.field?.includes('Stage') || g.field?.includes('Status') || g.field?.includes('Priority')
  );

  // Recommend appropriate grouping
  if (allGroupings.length > 0 && !hasDateGrouping && !hasSequentialGrouping) {
    score -= 5;
    recommendations.push("Consider grouping by Stage, Status, or Date for better insights");
  }

  // Check for aggregates when grouped
  if (allGroupings.length > 0 && aggregates.length === 0) {
    score -= 15;
    issues.push("Grouped report without aggregates - no summary metrics");
    recommendations.push("Add aggregates (SUM, COUNT, AVG) to calculate totals/averages");
  }

  // Check for too many grouping levels
  if (groupingsDown.length > 3) {
    score -= 10;
    issues.push(`Too many grouping levels (${groupingsDown.length}) - hard to read`);
    recommendations.push("Limit to 2-3 grouping levels maximum");
  }

  return {
    dimension: QUALITY_DIMENSIONS.GROUPING_LOGIC,
    score: Math.max(0, score),
    weight: 15,
    issues,
    recommendations,
    details: {
      format,
      groupingsDownCount: groupingsDown.length,
      groupingsAcrossCount: groupingsAcross.length,
      aggregatesCount: aggregates.length,
      hasDateGrouping,
      hasSequentialGrouping
    }
  };
}

/**
 * Evaluate chart usage
 * @param {Object} report - Report metadata
 * @returns {Object} Score and feedback
 */
function evaluateChartUsage(report) {
  let score = 100;
  const issues = [];
  const recommendations = [];

  const chart = report.chart || {};
  const format = report.reportFormat || report.format || '';
  const groupingsDown = report.groupingsDown || [];

  // Grouped reports should have charts
  if ((format === REPORT_FORMATS.SUMMARY || format === REPORT_FORMATS.MATRIX) && !chart.chartType) {
    score -= 10;
    recommendations.push("Add chart to visualize grouped data (Bar, Line, Funnel, Donut)");
  }

  // Tabular reports shouldn't have charts
  if (format === REPORT_FORMATS.TABULAR && chart.chartType) {
    score -= 15;
    issues.push("Tabular report with chart - charts require grouping");
    recommendations.push("Remove chart or change to Summary format with grouping");
  }

  // Check chart type appropriateness
  if (chart.chartType) {
    const chartType = chart.chartType.toLowerCase();
    const groupingField = groupingsDown[0]?.field || '';

    // Line charts should have date grouping
    if (chartType === 'line' && !groupingField.includes('Date') && !chart.dateGranularity) {
      score -= 10;
      issues.push("Line chart without date grouping - use Bar chart instead");
      recommendations.push("Line charts are for time-series data - group by CreatedDate, CloseDate, etc.");
    }

    // Funnel charts for sequential processes
    if (chartType === 'funnel' && !groupingField.includes('Stage') && !groupingField.includes('Status')) {
      score -= 5;
      recommendations.push("Funnel charts work best for sequential processes (Stage, Status)");
    }

    // Pie/Donut for limited categories
    if ((chartType === 'pie' || chartType === 'donut') && groupingsDown.length > 1) {
      score -= 10;
      issues.push("Pie/Donut chart with multiple groupings - hard to read");
      recommendations.push("Limit Pie/Donut charts to single grouping with 3-7 categories");
    }
  }

  return {
    dimension: QUALITY_DIMENSIONS.CHART_USAGE,
    score: Math.max(0, score),
    weight: 10,
    issues,
    recommendations,
    details: {
      hasChart: !!chart.chartType,
      chartType: chart.chartType || 'None',
      format
    }
  };
}

/**
 * Evaluate performance considerations
 * @param {Object} report - Report metadata
 * @returns {Object} Score and feedback
 */
function evaluatePerformance(report) {
  let score = 100;
  const issues = [];
  const recommendations = [];

  const detailColumns = report.detailColumns || report.columns || [];
  const filters = report.reportFilters || report.filters || [];
  const rowLimit = report.rowLimit || 0;

  // Check for date filters (crucial for performance)
  const hasDateFilter = filters.some(f =>
    f.column?.toLowerCase().includes('date') || f.field?.toLowerCase().includes('date')
  );

  if (!hasDateFilter) {
    score -= 20;
    issues.push("No date filter - report will scan all historical records (slow)");
    recommendations.push("Add date filter: CreatedDate, CloseDate, LastModifiedDate with range");
  }

  // Check for indexed fields in filters
  const standardIndexedFields = ['Id', 'Name', 'OwnerId', 'CreatedDate', 'LastModifiedDate', 'SystemModstamp'];
  const usesIndexedFilters = filters.some(f =>
    standardIndexedFields.some(indexed => f.column?.includes(indexed) || f.field?.includes(indexed))
  );

  if (filters.length > 0 && !usesIndexedFilters) {
    score -= 10;
    recommendations.push("Use indexed fields in filters (OwnerId, CreatedDate, Name) for better performance");
  }

  // Check for formula fields (can be slow)
  const hasFormulaFields = detailColumns.some(col => col.includes('__c') && col.toLowerCase().includes('formula'));
  if (hasFormulaFields) {
    score -= 5;
    recommendations.push("Formula fields can slow reports - consider using rollup summaries instead");
  }

  // Check for showDetails setting on Summary reports
  if ((report.reportFormat === REPORT_FORMATS.SUMMARY || report.reportFormat === REPORT_FORMATS.MATRIX)) {
    if (report.showDetails === true || report.showDetails === undefined) {
      score -= 10;
      recommendations.push("Set showDetails: false on Summary/Matrix reports to improve performance");
    }
  }

  // Check for row limit on large data sets
  if (!rowLimit && filters.length < 2) {
    score -= 5;
    recommendations.push("Consider adding rowLimit (2000) to prevent loading excessive data");
  }

  return {
    dimension: QUALITY_DIMENSIONS.PERFORMANCE,
    score: Math.max(0, score),
    weight: 15,
    issues,
    recommendations,
    details: {
      hasDateFilter,
      filterCount: filters.length,
      fieldCount: detailColumns.length,
      hasRowLimit: !!rowLimit,
      showDetails: report.showDetails
    }
  };
}

/**
 * Evaluate documentation
 * @param {Object} report - Report metadata
 * @returns {Object} Score and feedback
 */
function evaluateDocumentation(report) {
  let score = 100;
  const issues = [];
  const recommendations = [];

  const description = report.description || '';

  // Check for description
  if (!description) {
    score -= 15;
    recommendations.push("Add description explaining what this report shows and who should use it");
  } else if (description.length < 20) {
    score -= 10;
    recommendations.push("Expand description to explain purpose, audience, and key insights");
  }

  // Check for folder organization (if specified)
  const folder = report.folder || '';
  if (!folder) {
    score -= 5;
    recommendations.push("Store report in organized folder (e.g., 'Sales Reports', 'Executive Dashboards')");
  }

  return {
    dimension: QUALITY_DIMENSIONS.DOCUMENTATION,
    score: Math.max(0, score),
    weight: 5,
    issues,
    recommendations,
    details: {
      hasDescription: !!description,
      descriptionLength: description.length,
      folder: folder || 'Not specified'
    }
  };
}

/**
 * Date filter family classifications for consistency checking
 */
const DATE_FILTER_FAMILIES = {
  fiscal: ['THIS_FISCAL_YEAR', 'LAST_FISCAL_YEAR', 'NEXT_FISCAL_YEAR', 'THIS_FISCAL_QUARTER', 'LAST_FISCAL_QUARTER', 'NEXT_FISCAL_QUARTER'],
  calendar: ['THIS_YEAR', 'LAST_YEAR', 'THIS_QUARTER', 'LAST_QUARTER', 'THIS_MONTH', 'LAST_MONTH', 'THIS_WEEK', 'LAST_WEEK', 'TODAY', 'YESTERDAY'],
  relative: ['LAST_N_DAYS', 'NEXT_N_DAYS', 'LAST_90_DAYS', 'LAST_30_DAYS', 'LAST_7_DAYS', 'LAST_60_DAYS', 'LAST_120_DAYS']
};

/**
 * Classify a date filter into a family
 * @param {string} filterValue - Date filter value
 * @returns {string} Filter family
 */
function classifyDateFilter(filterValue) {
  if (!filterValue) return 'unknown';
  const normalized = filterValue.toUpperCase().trim().replace(/:\d+$/, '');

  for (const [family, filters] of Object.entries(DATE_FILTER_FAMILIES)) {
    if (filters.includes(normalized)) return family;
    // Check for partial match (e.g., LAST_N_DAYS:30)
    for (const filter of filters) {
      if (normalized.startsWith(filter.replace(/_N_/, '_\\d+_')) || normalized === filter) {
        return family;
      }
    }
  }

  // Infer from content
  if (normalized.includes('FISCAL')) return 'fiscal';
  if (normalized.includes('_N_') || normalized.match(/LAST_\d+|NEXT_\d+/)) return 'relative';

  return 'unknown';
}

/**
 * Evaluate date filter quality and consistency
 * @param {Object} report - Report metadata
 * @returns {Object} Score and feedback
 */
function evaluateDateFilterQuality(report) {
  let score = 100;
  const issues = [];
  const recommendations = [];

  const filters = report.reportFilters || report.filters || [];
  const dateFilters = filters.filter(f =>
    f.type === 'date' ||
    f.column?.toLowerCase().includes('date') ||
    f.field?.toLowerCase().includes('date') ||
    f.value?.includes('THIS_') ||
    f.value?.includes('LAST_') ||
    f.value?.includes('FISCAL')
  );

  if (dateFilters.length === 0) {
    // No date filters - already handled in evaluateFilterUsage
    return {
      dimension: QUALITY_DIMENSIONS.DATE_FILTER_QUALITY,
      score: 100,
      weight: 5,
      issues: [],
      recommendations: [],
      details: { dateFilterCount: 0, families: [], consistent: true }
    };
  }

  // Classify filters by family
  const familyCounts = {};
  const classifiedFilters = dateFilters.map(f => {
    const family = classifyDateFilter(f.value);
    familyCounts[family] = (familyCounts[family] || 0) + 1;
    return { ...f, family };
  });

  const families = Object.keys(familyCounts).filter(f => f !== 'unknown');

  // Check for fiscal/calendar mixing (incompatible)
  if (familyCounts.fiscal && familyCounts.calendar) {
    score -= 25;
    issues.push('Report mixes fiscal and calendar date filters - these are incompatible for comparison');
    recommendations.push('Use either all fiscal filters (THIS_FISCAL_YEAR) or all calendar filters (THIS_YEAR), not both');
  }

  // Check for multiple different date filter families (even if compatible)
  if (families.length > 1 && !issues.length) {
    score -= 10;
    recommendations.push(`Report uses ${families.length} date filter families (${families.join(', ')}) - consider standardizing for consistency`);
  }

  // Check for unusual combinations
  const hasRelativeAndPeriod = familyCounts.relative && (familyCounts.fiscal || familyCounts.calendar);
  if (hasRelativeAndPeriod) {
    score -= 5;
    recommendations.push('Mixing relative filters (LAST_90_DAYS) with period filters (THIS_QUARTER) may cause confusion');
  }

  // Recommend fiscal for business reports
  if (familyCounts.calendar && !familyCounts.fiscal) {
    recommendations.push('Consider using fiscal date filters for business reports (aligns with financial periods)');
  }

  return {
    dimension: QUALITY_DIMENSIONS.DATE_FILTER_QUALITY,
    score: Math.max(0, score),
    weight: 5,
    issues,
    recommendations,
    details: {
      dateFilterCount: dateFilters.length,
      families,
      familyCounts,
      consistent: issues.length === 0,
      classifiedFilters: classifiedFilters.map(f => ({
        field: f.column || f.field,
        value: f.value,
        family: f.family
      }))
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
 * Validate report quality
 * @param {Object} report - Report metadata
 * @returns {Object} Validation results
 */
function validateReportQuality(report) {
  // Evaluate all dimensions
  const dimensionScores = [
    evaluateFormatSelection(report),
    evaluateNamingConvention(report),
    evaluateFilterUsage(report),
    evaluateFieldSelection(report),
    evaluateGroupingLogic(report),
    evaluateChartUsage(report),
    evaluatePerformance(report),
    evaluateDocumentation(report),
    evaluateDateFilterQuality(report)
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
      reportName: report.name || report.title || 'Unnamed Report',
      format: report.reportFormat || report.format || 'Not specified',
      filterCount: (report.reportFilters || report.filters || []).length,
      fieldCount: (report.detailColumns || report.columns || []).length,
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

  let output = `\n✅ REPORT QUALITY VALIDATION\n`;
  output += `${'='.repeat(60)}\n\n`;

  // Summary
  output += `📊 Report: ${result.summary.reportName}\n`;
  output += `${gradeEmoji} Overall Grade: ${result.grade} (${result.totalScore}/100)\n`;
  output += `   Format: ${result.summary.format} | Filters: ${result.summary.filterCount} | Fields: ${result.summary.fieldCount}\n`;
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
✅ Report Quality Validator - Enterprise Quality Scoring

USAGE:
  node report-quality-validator.js [options]

OPTIONS:
  --report <path>        Path to report JSON file
  --format <type>        Output format (text|json) [default: text]
  --test                 Run test scenarios

EXAMPLES:
  # Validate report
  node report-quality-validator.js --report my-report.json

  # Run test scenarios
  node report-quality-validator.js --test
    `);
    process.exit(0);
  }

  // Test mode
  if (args.includes('--test')) {
    console.log('\n🧪 Running test scenarios...\n');

    // Test 1: Well-designed summary report
    console.log('TEST 1: Well-Designed Summary Report');
    const test1 = {
      name: 'Pipeline by Stage - This Quarter',
      description: 'Shows current quarter pipeline breakdown by stage with amount totals',
      reportFormat: 'SUMMARY',
      reportFilters: [
        { column: 'CLOSE_DATE', operator: 'equals', value: 'THIS_FISCAL_QUARTER' },
        { column: 'ISCLOSED', operator: 'equals', value: 'FALSE' }
      ],
      groupingsDown: [
        { field: 'STAGE_NAME', sortOrder: 'Asc' }
      ],
      detailColumns: ['ACCOUNT_NAME', 'OPPORTUNITY_NAME', 'AMOUNT', 'CLOSE_DATE', 'OWNER_NAME'],
      aggregates: [
        { name: 'AMOUNT', aggregateType: 'Sum' },
        { name: 'RowCount', aggregateType: 'Sum' }
      ],
      chart: {
        chartType: 'Funnel',
        groupingColumn: 'STAGE_NAME',
        aggregateColumn: 'AMOUNT'
      },
      folder: 'Sales Reports',
      showDetails: false
    };

    const result1 = validateReportQuality(test1);
    console.log(formatValidationOutput(result1));

    // Test 2: Poorly designed report
    console.log('\n\nTEST 2: Poorly Designed Report (Many Issues)');
    const test2 = {
      name: 'Report',
      reportFormat: 'TABULAR',
      detailColumns: ['Id', 'AccountId', 'Amount', 'Stage', 'Owner', 'Contact', 'Product', 'Campaign', 'Lead Source', 'Type', 'Close Date', 'Created Date', 'Last Modified', 'Probability', 'Expected Revenue', 'Next Step', 'Description'],
      chart: {
        chartType: 'Pie'
      }
    };

    const result2 = validateReportQuality(test2);
    console.log(formatValidationOutput(result2));

    process.exit(0);
  }

  const reportPath = getArgValue(args, '--report');
  if (!reportPath) {
    throw new Error('Missing required --report <path> argument.');
  }
  if (!fs.existsSync(reportPath)) {
    throw new Error(`Report file not found: ${reportPath}`);
  }

  const reportContent = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  const reportMetadata = reportContent.reportMetadata || reportContent;
  if (!reportMetadata || typeof reportMetadata !== 'object') {
    throw new Error('Report JSON is invalid.');
  }

  const format = getArgValue(args, '--format') || 'text';
  if (!['text', 'json'].includes(format)) {
    throw new Error('Output format must be text or json.');
  }

  const result = validateReportQuality(reportMetadata);
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
  validateReportQuality,
  formatValidationOutput,
  evaluateFormatSelection,
  evaluateNamingConvention,
  evaluateFilterUsage,
  evaluateFieldSelection,
  evaluateGroupingLogic,
  evaluateChartUsage,
  evaluatePerformance,
  evaluateDocumentation,
  evaluateDateFilterQuality,
  classifyDateFilter,
  QUALITY_DIMENSIONS,
  REPORT_FORMATS,
  GRADE_THRESHOLDS,
  DATE_FILTER_FAMILIES
};
