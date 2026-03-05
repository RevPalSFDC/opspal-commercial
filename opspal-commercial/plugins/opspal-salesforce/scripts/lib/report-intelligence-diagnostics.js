#!/usr/bin/env node

/**
 * Report Intelligence Diagnostics
 *
 * Infers report intent from metadata cues and scores report health.
 * Outputs intent classification, confidence, and a health rubric.
 */

const { loadReportMetadata } = require('./report-semantic-validator');
const { appendLogEntry } = require('./report-diagnostics-log');

const CONFIDENCE = {
  high: 0.9,
  medium: 0.7,
  low: 0.5
};

function normalizeArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function normalizeReportMetadata(reportMetadata) {
  const reportFormat = (reportMetadata.reportFormat || reportMetadata.format || '').toUpperCase();
  const reportType = reportMetadata.reportType?.type || reportMetadata.reportType || null;
  const name = reportMetadata.name || reportMetadata.title || null;
  const description = reportMetadata.description || null;

  const detailColumns = reportMetadata.detailColumns || reportMetadata.columns || [];
  const groupingsDown = normalizeGroupings(reportMetadata.groupingsDown || []);
  const groupingsAcross = normalizeGroupings(reportMetadata.groupingsAcross || []);
  const aggregates = normalizeAggregates(reportMetadata.aggregates || []);
  const customSummaryFormulas = normalizeFormulas(
    reportMetadata.customSummaryFormulas ||
    reportMetadata.summaryFormulas ||
    reportMetadata.reportSummaryFormulas ||
    []
  );
  const bucketFields = normalizeBuckets(
    reportMetadata.bucketFields ||
    reportMetadata.bucketColumns ||
    reportMetadata.buckets ||
    []
  );
  const chart = normalizeChart(
    reportMetadata.chart ||
    reportMetadata.reportChart ||
    reportMetadata.chartSettings ||
    null
  );

  const showDetailsValue = reportMetadata.showDetails;
  const showDetails = typeof showDetailsValue === 'boolean'
    ? showDetailsValue
    : String(showDetailsValue || '').toLowerCase() === 'true';

  const rowLimit = reportMetadata.rowLimit ? Number(reportMetadata.rowLimit) : null;

  const reportFilters = normalizeFilters(
    reportMetadata.reportFilters || reportMetadata.filters || [],
    reportMetadata.standardDateFilter || null
  );

  return {
    ...reportMetadata,
    name,
    description,
    reportType,
    reportFormat,
    detailColumns,
    groupingsDown,
    groupingsAcross,
    aggregates,
    customSummaryFormulas,
    bucketFields,
    chart,
    showDetails,
    rowLimit,
    reportFilters
  };
}

function normalizeGroupings(groupings) {
  return normalizeArray(groupings).map(group => {
    if (typeof group === 'string') {
      return { field: group, dateGranularity: null };
    }
    return {
      field: group.field || group.column || group.name || null,
      dateGranularity: group.dateGranularity || group.granularity || null
    };
  }).filter(group => group.field);
}

function normalizeAggregates(aggregates) {
  return normalizeArray(aggregates).map(agg => {
    if (typeof agg === 'string') {
      return { name: agg, aggregateType: null };
    }
    return {
      name: agg.name || agg.field || agg.column || null,
      aggregateType: agg.aggregateType || agg.type || null
    };
  }).filter(agg => agg.name);
}

function normalizeFilters(filters, standardDateFilter) {
  const normalized = normalizeArray(filters).map(filter => ({
    column: filter.column || filter.field || filter.name || filter.columnName || null,
    operator: filter.operator || filter.op || null,
    value: Array.isArray(filter.value)
      ? filter.value.join(',')
      : (filter.value ?? filter.values ?? filter.value1 ?? filter.value2 ?? null)
  })).filter(filter => filter.column);

  if (standardDateFilter && standardDateFilter.column) {
    normalized.push({
      column: standardDateFilter.column,
      operator: standardDateFilter.operator || standardDateFilter.duration || 'equals',
      value: standardDateFilter.duration || standardDateFilter.value || standardDateFilter.startDate || null
    });
  }

  return normalized;
}

function normalizeChart(chart) {
  if (!chart) return null;
  return {
    chartType: chart.chartType || chart.type || chart.chartTypeEnum || null,
    groupingColumn: chart.groupingColumn || chart.grouping || chart.groupingColumnName || null,
    aggregateColumn: chart.aggregateColumn || chart.aggregate || null,
    dateGranularity: chart.dateGranularity || chart.granularity || null
  };
}

function normalizeFormulas(formulas) {
  return normalizeArray(formulas).map(formula => ({
    name: formula.name || formula.label || null,
    label: formula.label || formula.name || null,
    formula: formula.formula || formula.expression || null,
    dataType: formula.dataType || formula.type || null
  })).filter(formula => formula.name || formula.formula);
}

function normalizeBuckets(buckets) {
  return normalizeArray(buckets).map(bucket => ({
    name: bucket.name || bucket.label || null,
    field: bucket.field || bucket.sourceColumn || bucket.column || null,
    type: bucket.type || bucket.bucketType || null,
    values: bucket.values || []
  })).filter(bucket => bucket.field || bucket.name);
}

function detectIntent(reportMetadata) {
  const signals = buildSignals(reportMetadata);
  const candidates = [];

  const addIntent = (label, confidence, reason, priority = 50) => {
    const existing = candidates.find(candidate => candidate.label === label);
    if (existing) {
      if (confidence > existing.confidence) {
        existing.confidence = confidence;
        existing.reason = reason;
        existing.priority = priority;
      }
      return;
    }
    candidates.push({
      label,
      confidence,
      reason,
      priority
    });
  };

  if (signals.chart.type) {
    if (signals.chart.isFunnel) {
      addIntent('Pipeline/Process Funnel', CONFIDENCE.high, 'Funnel chart configuration', 100);
    }
    if (signals.chart.isLineOrArea) {
      addIntent('Time Trend Analysis', CONFIDENCE.high, 'Line/area chart configuration', 100);
    }
    if (signals.chart.isPie) {
      addIntent('Category Proportion Analysis', CONFIDENCE.high, 'Pie/donut chart configuration', 100);
    }
    if (signals.chart.isBar) {
      const label = signals.groupings.hasTime
        ? 'Performance Trend by Category'
        : 'Category Comparison';
      addIntent(label, CONFIDENCE.high, 'Bar/column chart configuration', 100);
    }
    if (signals.chart.isScatter) {
      addIntent('Correlation Analysis', CONFIDENCE.medium, 'Scatter chart configuration', 90);
    }
  }

  if (signals.filters.rowLimit) {
    addIntent('Top N Ranking', CONFIDENCE.high, 'Row limit with sort', 95);
  }

  if (signals.filters.crossFilter) {
    addIntent('Exception Report', CONFIDENCE.high, 'Cross filter for missing related records', 95);
  }

  if (signals.groupings.hasTime) {
    addIntent('Trend Over Time', CONFIDENCE.high, 'Time-based grouping', 80);
  }

  if (signals.groupings.hasStage && signals.filters.openOnly) {
    addIntent('Pipeline/Funnel Snapshot', CONFIDENCE.high, 'Stage grouping with open-only filters', 85);
  } else if (signals.groupings.hasStage) {
    addIntent('Stage Distribution', CONFIDENCE.medium, 'Stage/status grouping', 70);
  }

  if (signals.groupings.hasOwnerOrTeam) {
    addIntent('Performance Comparison', CONFIDENCE.high, 'Owner/team grouping', 80);
  }

  if (signals.groupings.matrix && signals.groupings.hasTime && signals.groupings.hasCategory) {
    addIntent('Performance Trend by Category', CONFIDENCE.high, 'Matrix grouping with time and category', 90);
  }

  if (signals.buckets.numeric > 0) {
    addIntent('Size Categorization Analysis', CONFIDENCE.medium, 'Numeric bucket field', 60);
  }
  if (signals.buckets.stage > 0) {
    addIntent('Funnel Stage Grouping', CONFIDENCE.medium, 'Stage/status bucket field', 60);
  }
  if (signals.buckets.date > 0) {
    addIntent('Aging Report', CONFIDENCE.medium, 'Date/age bucket field', 60);
  }
  if (signals.buckets.custom > 0) {
    addIntent('Custom Segmentation', CONFIDENCE.low, 'Custom bucket field', 40);
  }

  if (signals.formulas.percentOfTotal) {
    addIntent('Contribution Analysis (%)', CONFIDENCE.high, 'Summary formula uses PARENTGROUPVAL', 75);
  }
  if (signals.formulas.winRate) {
    addIntent('Conversion/Win Rate Analysis', CONFIDENCE.high, 'Summary formula indicates win/conversion rate', 75);
  }
  if (signals.formulas.trendChange) {
    addIntent('Trend Change Analysis', CONFIDENCE.medium, 'Summary formula uses PREVGROUPVAL', 70);
  }
  if (signals.formulas.customKpi) {
    addIntent('Custom KPI Metrics', CONFIDENCE.low, 'Custom summary formulas present', 50);
  }

  if (signals.groupings.total === 0 && candidates.length === 0) {
    addIntent('Operational List/Detail Export', CONFIDENCE.medium, 'No groupings detected', 30);
  }

  if (candidates.length === 0) {
    addIntent('Intent Unclear', CONFIDENCE.low, 'Insufficient metadata cues', 10);
  }

  const sorted = candidates.sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return b.priority - a.priority;
  });

  const primary = sorted[0];
  const secondary = sorted.slice(1, 4);

  const warnings = [];
  if (signals.chart.isLineOrArea && !signals.groupings.hasTime) {
    warnings.push({
      code: 'CHART_TIME_MISMATCH',
      message: 'Line/area chart configured without time-based grouping.'
    });
  }
  if (signals.chart.isFunnel && !signals.groupings.hasStage) {
    warnings.push({
      code: 'CHART_STAGE_MISMATCH',
      message: 'Funnel chart configured without stage/status grouping.'
    });
  }

  return {
    primary,
    secondary,
    signals,
    warnings
  };
}

function buildSignals(reportMetadata) {
  const groupings = [...(reportMetadata.groupingsDown || []), ...(reportMetadata.groupingsAcross || [])];
  const groupingFields = groupings.map(group => group.field).filter(Boolean);
  const timeFields = groupingFields.filter(field => isDateField(field));
  const stageFields = groupingFields.filter(field => isStageField(field));
  const ownerFields = groupingFields.filter(field => isOwnerField(field));
  const categoryFields = groupingFields.filter(field => !isDateField(field));

  const filters = reportMetadata.reportFilters || [];
  const filterSignals = analyzeFilters(filters);

  const chart = analyzeChart(reportMetadata.chart);
  const bucketSignals = analyzeBuckets(reportMetadata.bucketFields || []);
  const formulaSignals = analyzeFormulas(reportMetadata.customSummaryFormulas || []);

  return {
    groupings: {
      total: groupingFields.length,
      down: (reportMetadata.groupingsDown || []).length,
      across: (reportMetadata.groupingsAcross || []).length,
      matrix: (reportMetadata.groupingsDown || []).length > 0 && (reportMetadata.groupingsAcross || []).length > 0,
      hasTime: timeFields.length > 0,
      hasStage: stageFields.length > 0,
      hasOwnerOrTeam: ownerFields.length > 0,
      hasCategory: categoryFields.length > 0,
      timeFields,
      stageFields,
      ownerFields
    },
    filters: filterSignals,
    chart,
    buckets: bucketSignals,
    formulas: formulaSignals
  };
}

function analyzeFilters(filters) {
  const values = filters.map(filter => normalizeToken(filter.value));
  const columns = filters.map(filter => normalizeToken(filter.column));

  const hasDateFilter = columns.some(col => col.includes('date')) ||
    values.some(val => isRelativeDate(val) || isExplicitDate(val));
  const hasRelativeDate = values.some(val => isRelativeDate(val));
  const hasStaticDate = values.some(val => isExplicitDate(val));
  const hasDynamicUser = values.some(val => val.includes('$user')) ||
    values.some(val => val.includes('my') && val.includes('opportunity'));

  const hasOpenOnlyFilter = columns.some(col => col.includes('isclosed')) &&
    values.some(val => val === 'false' || val === '0');
  const hasClosedWonFilter = columns.some(col => col.includes('iswon')) &&
    values.some(val => val === 'true' || val === '1');

  const stageFilters = filters.filter(filter => normalizeToken(filter.column).includes('stage'));
  const stageValues = stageFilters.map(filter => normalizeToken(filter.value)).join(',');
  const hasStageOpenFilter = stageFilters.some(filter => {
    const operator = normalizeToken(filter.operator);
    return (operator === 'notequal' || operator === 'excludes') && stageValues.includes('closed');
  });

  const hasClosedFilter = columns.some(col => col.includes('isclosed')) &&
    values.some(val => val === 'true' || val === '1');

  const hasCrossFilter = filters.some(filter => normalizeToken(filter.filterType || '').includes('without'));
  const hasContainsFilter = filters.some(filter => {
    const operator = normalizeToken(filter.operator);
    return operator === 'contains' || operator === 'notcontain' || operator === 'startswith';
  });

  const rowLimit = filters.some(filter => normalizeToken(filter.operator).includes('limit')) ? true : false;

  return {
    count: filters.length,
    hasDateFilter,
    hasRelativeDate,
    hasStaticDate,
    dynamicUser: hasDynamicUser,
    openOnly: hasOpenOnlyFilter || hasStageOpenFilter,
    closedOnly: hasClosedFilter,
    closedWonOnly: hasClosedWonFilter,
    crossFilter: hasCrossFilter,
    containsFilter: hasContainsFilter,
    rowLimit
  };
}

function analyzeChart(chart) {
  if (!chart || !chart.chartType) {
    return {
      type: null,
      isLineOrArea: false,
      isFunnel: false,
      isPie: false,
      isBar: false,
      isScatter: false
    };
  }

  const type = normalizeToken(chart.chartType);

  return {
    type: chart.chartType,
    isLineOrArea: type.includes('line') || type.includes('area'),
    isFunnel: type.includes('funnel'),
    isPie: type.includes('pie') || type.includes('donut'),
    isBar: type.includes('bar') || type.includes('column'),
    isScatter: type.includes('scatter')
  };
}

function analyzeBuckets(buckets) {
  const counts = {
    numeric: 0,
    stage: 0,
    date: 0,
    custom: 0
  };

  buckets.forEach(bucket => {
    const field = normalizeToken(bucket.field || bucket.name);
    if (!field) return;

    if (field.includes('amount') || field.includes('revenue') || field.includes('value') || field.includes('arr') ||
      field.includes('acv') || field.includes('tcv') || field.includes('mrr') || field.includes('employees') ||
      field.includes('count') || field.includes('size') || field.includes('quantity')) {
      counts.numeric += 1;
      return;
    }

    if (field.includes('stage') || field.includes('status') || field.includes('phase')) {
      counts.stage += 1;
      return;
    }

    if (field.includes('date') || field.includes('age') || field.includes('days')) {
      counts.date += 1;
      return;
    }

    counts.custom += 1;
  });

  return counts;
}

function analyzeFormulas(formulas) {
  const summary = {
    count: formulas.length,
    percentOfTotal: false,
    winRate: false,
    trendChange: false,
    customKpi: false
  };

  formulas.forEach(formula => {
    const text = normalizeToken(formula.formula);
    const label = normalizeToken(formula.name || formula.label);

    if (text.includes('parentgroupval')) {
      summary.percentOfTotal = true;
    }
    if (text.includes('prevgroupval')) {
      summary.trendChange = true;
    }
    if (label.includes('win rate') || label.includes('conversion') || label.includes('rate')) {
      summary.winRate = true;
    }
    if (text.includes('/') && (text.includes('won') || text.includes('converted'))) {
      summary.winRate = true;
    }
  });

  if (formulas.length > 0) {
    summary.customKpi = !(summary.percentOfTotal || summary.winRate || summary.trendChange);
  }

  return summary;
}

function scoreReportHealth(reportMetadata, intentSummary) {
  const signals = intentSummary.signals;

  const clarity = evaluateSemanticClarity(reportMetadata, signals);
  const correctness = evaluateDataCorrectness(reportMetadata, signals);
  const performance = evaluatePerformance(reportMetadata, signals);
  const reusability = evaluateReusability(reportMetadata, signals);

  const dimensionResults = {
    semanticClarity: clarity,
    dataCorrectnessRisk: correctness,
    performanceRisk: performance,
    reusability
  };

  const scores = Object.values(dimensionResults).map(result => result.score);
  const overallScore = Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length);

  let overallStatus = 'pass';
  if (Object.values(dimensionResults).some(result => result.status === 'fail')) {
    overallStatus = 'fail';
  } else if (Object.values(dimensionResults).some(result => result.status === 'warn')) {
    overallStatus = 'warn';
  }

  const issues = Object.values(dimensionResults).flatMap(result => result.issues || []);

  return {
    overallScore,
    overallStatus,
    dimensions: dimensionResults,
    issues
  };
}

function evaluateSemanticClarity(reportMetadata, signals) {
  let score = 100;
  const issues = [];

  const name = reportMetadata.name || '';
  if (!name) {
    score -= 40;
    issues.push(issue('CLARITY_NAME_MISSING', 'Report name is missing.', 'fail'));
  } else if (/^(report|new report|untitled)\s*\d*$/i.test(name)) {
    score -= 25;
    issues.push(issue('CLARITY_NAME_GENERIC', 'Report name is generic.', 'warn'));
  } else if (name.length < 8) {
    score -= 10;
    issues.push(issue('CLARITY_NAME_SHORT', 'Report name is short or vague.', 'warn'));
  }

  if (!reportMetadata.description) {
    score -= 15;
    issues.push(issue('CLARITY_DESCRIPTION_MISSING', 'Report description is missing.', 'warn'));
  }

  const columnCount = (reportMetadata.detailColumns || []).length;
  if (columnCount === 0) {
    score -= 25;
    issues.push(issue('CLARITY_COLUMNS_MISSING', 'No detail columns listed.', 'fail'));
  } else if (columnCount > 25) {
    score -= 25;
    issues.push(issue('CLARITY_TOO_MANY_COLUMNS', 'Too many columns reduce readability.', 'warn'));
  } else if (columnCount > 15) {
    score -= 10;
    issues.push(issue('CLARITY_COLUMN_HEAVY', 'Large column count may reduce clarity.', 'warn'));
  }

  if (!hasIdentifierColumn(reportMetadata.detailColumns || [])) {
    score -= 10;
    issues.push(issue('CLARITY_IDENTIFIER_MISSING', 'Missing a clear record identifier column.', 'warn'));
  }

  const groupingsCount = (reportMetadata.groupingsDown || []).length + (reportMetadata.groupingsAcross || []).length;
  if ((reportMetadata.reportFormat === 'SUMMARY' || reportMetadata.reportFormat === 'MATRIX') && groupingsCount === 0) {
    score -= 20;
    issues.push(issue('CLARITY_GROUPINGS_MISSING', 'Summary/Matrix report without groupings.', 'warn'));
  }

  if (signals.chart.isLineOrArea && !signals.groupings.hasTime) {
    score -= 15;
    issues.push(issue('CLARITY_CHART_TIME_MISMATCH', 'Line/area chart without time grouping.', 'warn'));
  }
  if (signals.chart.isFunnel && !signals.groupings.hasStage) {
    score -= 10;
    issues.push(issue('CLARITY_CHART_STAGE_MISMATCH', 'Funnel chart without stage grouping.', 'warn'));
  }

  return finalizeDimension('semantic_clarity', score, issues);
}

function evaluateDataCorrectness(reportMetadata, signals) {
  let score = 100;
  const issues = [];
  const filters = reportMetadata.reportFilters || [];

  if (filters.length === 0) {
    score -= 35;
    issues.push(issue('CORRECTNESS_NO_FILTERS', 'No filters applied; report may include unintended data.', 'fail'));
  }

  if (!signals.filters.hasDateFilter) {
    score -= 20;
    issues.push(issue('CORRECTNESS_NO_DATE_FILTER', 'Missing date filter for time-bounded analysis.', 'warn'));
  }

  if (signals.groupings.hasStage && !signals.filters.openOnly && !signals.filters.closedOnly) {
    score -= 20;
    issues.push(issue('CORRECTNESS_STAGE_SCOPE_AMBIGUOUS', 'Stage grouping without open/closed filter.', 'warn'));
  }

  if (signals.formulas.winRate && !signals.filters.closedOnly) {
    score -= 15;
    issues.push(issue('CORRECTNESS_WIN_RATE_SCOPE', 'Win rate formulas should use closed records only.', 'warn'));
  }

  if (detectMultiObjectReport(reportMetadata.reportType) && hasAmountAggregate(reportMetadata.aggregates || [])) {
    score -= 20;
    issues.push(issue('CORRECTNESS_DOUBLE_COUNT_RISK', 'Multi-object report may double-count parent amounts.', 'warn'));
  }

  return finalizeDimension('data_correctness_risk', score, issues);
}

function evaluatePerformance(reportMetadata, signals) {
  let score = 100;
  const issues = [];

  if (!signals.filters.hasDateFilter) {
    score -= 30;
    issues.push(issue('PERFORMANCE_NO_DATE_FILTER', 'No date filter; report may scan large data volumes.', 'warn'));
  }

  const groupingCount = (reportMetadata.groupingsDown || []).length + (reportMetadata.groupingsAcross || []).length;
  if (groupingCount > 3) {
    score -= 25;
    issues.push(issue('PERFORMANCE_TOO_MANY_GROUPINGS', 'Excessive groupings can slow report execution.', 'warn'));
  } else if (groupingCount > 2) {
    score -= 15;
    issues.push(issue('PERFORMANCE_GROUPING_HEAVY', 'Multiple groupings may impact performance.', 'warn'));
  }

  const formulaCount = (reportMetadata.customSummaryFormulas || []).length;
  if (formulaCount > 4) {
    score -= 20;
    issues.push(issue('PERFORMANCE_FORMULA_HEAVY', 'Many summary formulas can slow report execution.', 'warn'));
  } else if (formulaCount > 2) {
    score -= 10;
    issues.push(issue('PERFORMANCE_FORMULA_LOAD', 'Multiple summary formulas may impact performance.', 'warn'));
  }

  const columnCount = (reportMetadata.detailColumns || []).length;
  if (columnCount > 30) {
    score -= 25;
    issues.push(issue('PERFORMANCE_COLUMN_HEAVY', 'High column count slows report rendering.', 'warn'));
  } else if (columnCount > 20) {
    score -= 10;
    issues.push(issue('PERFORMANCE_COLUMN_COUNT', 'Large column count may impact performance.', 'warn'));
  }

  if (signals.filters.containsFilter) {
    score -= 10;
    issues.push(issue('PERFORMANCE_TEXT_FILTER', 'Contains/startsWith filters may be non-selective.', 'warn'));
  }

  if ((reportMetadata.reportFormat === 'SUMMARY' || reportMetadata.reportFormat === 'MATRIX') &&
    reportMetadata.showDetails && !signals.filters.hasDateFilter) {
    score -= 10;
    issues.push(issue('PERFORMANCE_DETAILS_WITHOUT_DATE', 'Detail rows without date filters increase row volume.', 'warn'));
  }

  return finalizeDimension('performance_risk', score, issues);
}

function evaluateReusability(reportMetadata, signals) {
  let score = 100;
  const issues = [];
  const filters = reportMetadata.reportFilters || [];
  const values = filters.map(filter => normalizeToken(filter.value));

  if (values.some(val => isSalesforceId(val))) {
    score -= 40;
    issues.push(issue('REUSE_HARDCODED_ID', 'Filter includes a specific record ID.', 'fail'));
  }

  if (values.some(val => isExplicitDate(val))) {
    score -= 20;
    issues.push(issue('REUSE_STATIC_DATE', 'Filter uses static date values.', 'warn'));
  }

  if (filters.some(filter => normalizeToken(filter.column).includes('owner')) && !signals.filters.dynamicUser) {
    score -= 15;
    issues.push(issue('REUSE_STATIC_OWNER', 'Owner filter is hard-coded, reducing reuse.', 'warn'));
  }

  const staticFilterCount = values.filter(val => val && !isRelativeDate(val) && !val.includes('$user')).length;
  if (staticFilterCount > 0 && !signals.filters.dynamicUser) {
    score -= 10;
    issues.push(issue('REUSE_STATIC_FILTERS', 'Static filters limit reuse across dashboards.', 'warn'));
  }

  if (signals.filters.dynamicUser || signals.filters.hasRelativeDate) {
    score = Math.min(100, score + 5);
  }

  return finalizeDimension('reusability', score, issues);
}

function finalizeDimension(dimension, score, issues) {
  let status = 'pass';
  if (score < 60) {
    status = 'fail';
  } else if (score < 80) {
    status = 'warn';
  }

  return {
    dimension,
    score: clampScore(score),
    status,
    issues
  };
}

function issue(code, message, severity) {
  return {
    code,
    message,
    severity
  };
}

function clampScore(score) {
  if (score < 0) return 0;
  if (score > 100) return 100;
  return Math.round(score);
}

function normalizeToken(value) {
  return String(value || '').toLowerCase();
}

function isDateField(field) {
  const token = normalizeToken(field);
  return token.includes('date') || token.includes('created') || token.includes('close') || token.includes('lastmodified');
}

function isStageField(field) {
  const token = normalizeToken(field);
  return token.includes('stage') || token.includes('status') || token.includes('phase') || token.includes('forecast');
}

function isOwnerField(field) {
  const token = normalizeToken(field);
  return token.includes('owner') || token.includes('rep') || token.includes('team') || token.includes('territory') ||
    token.includes('region') || token.includes('segment') || token.includes('industry') || token.includes('manager');
}

function hasIdentifierColumn(columns) {
  return (columns || []).some(column => {
    const token = normalizeToken(column);
    return token.includes('name') || token.includes('account') || token.includes('opportunity') ||
      token.includes('lead') || token.includes('case');
  });
}

function isRelativeDate(value) {
  return value.includes('this_') || value.includes('last_') || value.includes('next_') ||
    value.includes('today') || value.includes('yesterday') || value.includes('tomorrow');
}

function isExplicitDate(value) {
  return /\d{4}-\d{2}-\d{2}/.test(value || '');
}

function isSalesforceId(value) {
  return /\b[a-z0-9]{15,18}\b/i.test(value || '');
}

function detectMultiObjectReport(reportType) {
  const type = normalizeToken(reportType);
  return type.includes('with') || type.includes('and') || type.includes('parent') || type.includes('child');
}

function hasAmountAggregate(aggregates) {
  return aggregates.some(agg => normalizeToken(agg.name).includes('amount') ||
    normalizeToken(agg.name).includes('value') || normalizeToken(agg.name).includes('revenue'));
}

function runDiagnostics(reportMetadata, options = {}) {
  const normalized = normalizeReportMetadata(reportMetadata);
  const intent = detectIntent(normalized);
  const health = scoreReportHealth(normalized, intent);

  const diagnostics = {
    reportName: normalized.name || null,
    reportType: normalized.reportType || null,
    reportFormat: normalized.reportFormat || null,
    intent,
    health
  };

  if (options.log !== false && options.org) {
    appendLogEntry(options.org, {
      reportName: diagnostics.reportName,
      reportType: diagnostics.reportType,
      reportFormat: diagnostics.reportFormat,
      intent: diagnostics.intent,
      health: diagnostics.health,
      issues: diagnostics.health.issues || [],
      source: options.source || 'report-intelligence-diagnostics'
    });
  }

  return diagnostics;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    reportPath: null,
    org: null,
    output: 'text',
    log: true
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const next = args[i + 1];

    switch (arg) {
      case '--report':
        options.reportPath = next;
        i += 1;
        break;
      case '--org':
        options.org = next;
        i += 1;
        break;
      case '--output':
        options.output = next;
        i += 1;
        break;
      case '--no-log':
        options.log = false;
        break;
      case '--help':
        options.help = true;
        break;
      default:
        if (arg.startsWith('--')) {
          throw new Error(`Unknown argument: ${arg}`);
        }
    }
  }

  return options;
}

function printUsage() {
  console.log(`
Report Intelligence Diagnostics

Usage:
  node scripts/lib/report-intelligence-diagnostics.js --report <path> [options]

Options:
  --org <alias>        Org alias for log storage
  --output <format>    text|json (default: text)
  --no-log             Skip log entry
`);
}

function printText(diagnostics) {
  const intent = diagnostics.intent?.primary || {};
  const health = diagnostics.health || {};

  console.log(`Report: ${diagnostics.reportName || 'Unknown'}`);
  console.log(`Primary intent: ${intent.label || 'Unclear'} (confidence ${(intent.confidence || 0).toFixed(2)})`);
  console.log(`Report health: ${health.overallStatus || 'unknown'} (${health.overallScore || 0})`);

  if (health.dimensions) {
    Object.values(health.dimensions).forEach(dim => {
      console.log(`- ${dim.dimension}: ${dim.status} (${dim.score})`);
    });
  }

  if (health.issues && health.issues.length > 0) {
    console.log('Issues:');
    health.issues.forEach(item => {
      console.log(`- [${item.code}] ${item.message}`);
    });
  }
}

function main() {
  const options = parseArgs();
  if (options.help) {
    printUsage();
    return;
  }
  if (!options.reportPath) {
    throw new Error('Missing required argument: --report <path>');
  }

  const reportMetadata = loadReportMetadata(options.reportPath);
  const diagnostics = runDiagnostics(reportMetadata, {
    org: options.org,
    log: options.log
  });

  if (options.output === 'json') {
    console.log(JSON.stringify(diagnostics, null, 2));
  } else {
    printText(diagnostics);
  }
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(`❌ ${err.message}`);
    process.exit(1);
  }
}

module.exports = {
  normalizeReportMetadata,
  detectIntent,
  scoreReportHealth,
  runDiagnostics
};
