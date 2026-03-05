#!/usr/bin/env node

/**
 * Report/Dashboard Semantic Diff
 *
 * Detects semantic drift between pre- and post-migration report/dashboard metadata.
 * Produces a semantic diff model with parity status, drift score, and findings.
 */

const fs = require('fs');
const path = require('path');
const { parseString } = require('xml2js');
const { loadReportMetadata } = require('./report-semantic-validator');
const { validateReportQuality } = require('./report-quality-validator');
const { validateDashboardQuality } = require('./dashboard-quality-validator');

// Load metric definitions for semantic validation
let metricDefinitions = null;
try {
  metricDefinitions = require('../../config/metric-definitions.json');
} catch (e) {
  console.warn('Warning: metric-definitions.json not found, metric drift detection disabled');
}

const DEFAULT_SEVERITY_WEIGHTS = {
  low: 10,
  medium: 25,
  high: 45,
  critical: 70
};

// Date filter semantic equivalence mapping
const DATE_FILTER_SEMANTICS = {
  'THIS_FISCAL_QUARTER': { type: 'relative', scope: 'quarter', fiscal: true },
  'THIS_QUARTER': { type: 'relative', scope: 'quarter', fiscal: false },
  'THIS_FISCAL_YEAR': { type: 'relative', scope: 'year', fiscal: true },
  'THIS_YEAR': { type: 'relative', scope: 'year', fiscal: false },
  'LAST_90_DAYS': { type: 'relative', scope: 'days', count: 90 },
  'LAST_30_DAYS': { type: 'relative', scope: 'days', count: 30 },
  'LAST_QUARTER': { type: 'relative', scope: 'quarter', offset: -1 },
  'LAST_FISCAL_QUARTER': { type: 'relative', scope: 'quarter', fiscal: true, offset: -1 },
  'NEXT_QUARTER': { type: 'relative', scope: 'quarter', offset: 1 },
  'NEXT_FISCAL_QUARTER': { type: 'relative', scope: 'quarter', fiscal: true, offset: 1 }
};

// Business expectation categories for validation
const BUSINESS_EXPECTATION_CATEGORIES = {
  totalSum: {
    name: 'Total Sum Match',
    description: 'Primary aggregate values should match within tolerance',
    tolerance: 0.01 // 1% variance acceptable
  },
  rowCount: {
    name: 'Row Count Reasonable',
    description: 'Row counts should not vary dramatically without explanation',
    tolerance: 0.10 // 10% variance triggers warning
  },
  keyRecords: {
    name: 'Key Records Present',
    description: 'Important accounts, deals, or entities should appear in results',
    validate: 'manual'
  },
  trendDirection: {
    name: 'Trend Direction Correct',
    description: 'Charts should show trends in the expected direction',
    validate: 'manual'
  }
};

// ============================================================================
// Metric Definition Drift Detection
// ============================================================================

/**
 * Infers the likely metric type from report metadata
 */
function inferMetricType(reportMeta) {
  if (!metricDefinitions) return null;

  const name = (reportMeta.name || '').toLowerCase();
  const filters = reportMeta.reportFilters || [];
  const columns = reportMeta.detailColumns || [];
  const formulas = reportMeta.customSummaryFormulas || [];

  const scores = {};

  for (const [metricId, metric] of Object.entries(metricDefinitions.metrics || {})) {
    let score = 0;

    // Check name patterns
    const category = metric.category || '';
    if (name.includes(category.replace('_', ' '))) score += 30;
    if (name.includes(metric.metricName.toLowerCase())) score += 20;

    // Check filter patterns
    const fieldRoles = metric.fieldRoles || {};
    const recommendedFilters = metric.recommendedFilters || [];

    for (const recFilter of recommendedFilters) {
      const hasFilter = filters.some(f =>
        normalizeText(f.column).includes(normalizeText(recFilter.role))
      );
      if (hasFilter) score += 15;
    }

    // Check column presence for required fields
    for (const [role, roleSpec] of Object.entries(fieldRoles)) {
      if (!roleSpec.required) continue;
      const preferredFields = roleSpec.preferredFields || [];
      const hasField = columns.some(col =>
        preferredFields.some(pf => normalizeText(col).includes(normalizeText(pf)))
      );
      if (hasField) score += 10;
    }

    if (score > 0) scores[metricId] = score;
  }

  // Return highest scoring metric
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  if (sorted.length === 0) return null;

  const [bestId, bestScore] = sorted[0];
  return {
    metricId: bestId,
    confidence: Math.min(100, bestScore),
    alternatives: sorted.slice(1, 3).map(([id, score]) => ({ metricId: id, confidence: score }))
  };
}

/**
 * Detects metric definition drift between pre and post reports
 */
function detectMetricDrift(preMeta, postMeta) {
  const findings = [];

  const preMetric = inferMetricType(preMeta);
  const postMetric = inferMetricType(postMeta);

  if (!preMetric || !postMetric) return findings;

  // Check if inferred metric type changed
  if (preMetric.metricId !== postMetric.metricId) {
    findings.push(buildFinding({
      category: 'metric_definition',
      subtype: 'metric_type_drift',
      beforePath: 'inferredMetricType',
      beforeValue: { metricId: preMetric.metricId, confidence: preMetric.confidence },
      afterPath: 'inferredMetricType',
      afterValue: { metricId: postMetric.metricId, confidence: postMetric.confidence },
      impactHypothesis: `Report appears to have changed from "${preMetric.metricId}" to "${postMetric.metricId}" definition. This may alter business meaning even if structure is preserved.`,
      severity: preMetric.confidence > 60 && postMetric.confidence > 60 ? 'critical' : 'high',
      detectability: 'semantic_inference',
      recommendedGuardrail: 'block',
      suggestedFix: 'Verify the report still measures the same business metric. If intentional, document the semantic change.'
    }));
  }

  // Check if confidence dropped significantly
  if (preMetric.metricId === postMetric.metricId &&
      preMetric.confidence - postMetric.confidence > 20) {
    findings.push(buildFinding({
      category: 'metric_definition',
      subtype: 'metric_clarity_degradation',
      beforePath: 'metricConfidence',
      beforeValue: preMetric.confidence,
      afterPath: 'metricConfidence',
      afterValue: postMetric.confidence,
      impactHypothesis: `Metric definition clarity dropped from ${preMetric.confidence}% to ${postMetric.confidence}%. The post-migration report may be ambiguous.`,
      severity: 'medium',
      detectability: 'semantic_inference',
      recommendedGuardrail: 'require_review',
      suggestedFix: 'Review report metadata to ensure metric definition is clear and complete.'
    }));
  }

  return findings;
}

/**
 * Detects date logic semantic changes
 */
function detectDateLogicDrift(preMeta, postMeta) {
  const findings = [];

  const preDate = preMeta.standardDateFilter || {};
  const postDate = postMeta.standardDateFilter || {};

  const preSemantic = DATE_FILTER_SEMANTICS[preDate.durationValue] || null;
  const postSemantic = DATE_FILTER_SEMANTICS[postDate.durationValue] || null;

  if (!preSemantic || !postSemantic) return findings;

  // Check fiscal vs calendar mismatch
  if (preSemantic.fiscal !== postSemantic.fiscal) {
    findings.push(buildFinding({
      category: 'date_logic',
      subtype: 'fiscal_calendar_mismatch',
      beforePath: 'standardDateFilter.fiscal',
      beforeValue: preSemantic.fiscal ? 'fiscal' : 'calendar',
      afterPath: 'standardDateFilter.fiscal',
      afterValue: postSemantic.fiscal ? 'fiscal' : 'calendar',
      impactHypothesis: 'Fiscal vs calendar date filter change can shift reporting periods by weeks or months depending on org fiscal year settings.',
      severity: 'critical',
      detectability: 'semantic_inference',
      recommendedGuardrail: 'block',
      suggestedFix: 'Ensure date filter uses the same fiscal/calendar basis as the original report.'
    }));
  }

  // Check scope change (quarter vs year vs days)
  if (preSemantic.scope !== postSemantic.scope) {
    findings.push(buildFinding({
      category: 'date_logic',
      subtype: 'date_scope_change',
      beforePath: 'standardDateFilter.scope',
      beforeValue: preSemantic.scope,
      afterPath: 'standardDateFilter.scope',
      afterValue: postSemantic.scope,
      impactHypothesis: `Date scope changed from "${preSemantic.scope}" to "${postSemantic.scope}". This dramatically alters the reporting window.`,
      severity: 'critical',
      detectability: 'semantic_inference',
      recommendedGuardrail: 'block',
      suggestedFix: 'Match the original date scope or document the intentional change.'
    }));
  }

  // Check for count differences in relative day filters
  if (preSemantic.count && postSemantic.count && preSemantic.count !== postSemantic.count) {
    findings.push(buildFinding({
      category: 'date_logic',
      subtype: 'date_range_change',
      beforePath: 'standardDateFilter.dayCount',
      beforeValue: preSemantic.count,
      afterPath: 'standardDateFilter.dayCount',
      afterValue: postSemantic.count,
      impactHypothesis: `Rolling date range changed from ${preSemantic.count} to ${postSemantic.count} days. This will include/exclude different records.`,
      severity: 'high',
      detectability: 'semantic_inference',
      recommendedGuardrail: 'require_review',
      suggestedFix: 'Use the same rolling window or validate row counts match expectations.'
    }));
  }

  return findings;
}

/**
 * Generates business expectation validation checklist
 */
function generateBusinessExpectationChecklist(preMeta, postMeta, diff) {
  const checklist = [];

  for (const [key, expectation] of Object.entries(BUSINESS_EXPECTATION_CATEGORIES)) {
    const item = {
      category: key,
      name: expectation.name,
      description: expectation.description,
      status: 'pending',
      autoValidated: false,
      notes: ''
    };

    // Auto-validate where possible
    if (diff.evidence?.runtimeComparison) {
      const runtime = diff.evidence.runtimeComparison;

      if (key === 'totalSum' && runtime.keyTotalsDeltaPct !== undefined) {
        const delta = Math.abs(runtime.keyTotalsDeltaPct);
        item.autoValidated = true;
        item.status = delta <= expectation.tolerance * 100 ? 'pass' : 'fail';
        item.notes = `${delta.toFixed(2)}% variance detected (threshold: ${expectation.tolerance * 100}%)`;
      }

      if (key === 'rowCount' && runtime.rowCountDeltaPct !== undefined) {
        const delta = Math.abs(runtime.rowCountDeltaPct);
        item.autoValidated = true;
        item.status = delta <= expectation.tolerance * 100 ? 'pass' : 'warn';
        item.notes = `${delta.toFixed(2)}% row count variance (threshold: ${expectation.tolerance * 100}%)`;
      }
    }

    checklist.push(item);
  }

  return checklist;
}

function normalizeText(value) {
  return (value || '')
    .toString()
    .toLowerCase()
    .replace(/[_/]+/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function parseDashboardXml(xmlContent, filePath = null) {
  let parsed = null;
  parseString(xmlContent, { explicitArray: false, trim: true }, (err, result) => {
    if (err) throw err;
    parsed = result;
  });
  const dashboard = parsed?.Dashboard || {};

  const name = dashboard.title || dashboard.name || (filePath ? path.basename(filePath, '.dashboard-meta.xml') : '');
  const description = dashboard.description || '';

  let folderName = '';
  if (filePath) {
    const match = filePath.replace(/\\/g, '/').match(/dashboards\/([^/]+)\/[^/]+\.dashboard-meta\.xml$/);
    folderName = match ? match[1] : '';
  }

  const sections = ['leftSection', 'middleSection', 'rightSection'];
  const components = [];

  sections.forEach(section => {
    const sectionNode = dashboard[section];
    const rawComponents = toArray(sectionNode?.components);
    rawComponents.forEach(comp => {
      if (!comp) return;
      components.push({
        title: comp.title || comp.header || '',
        type: comp.componentType || '',
        report: comp.report || '',
        rowLimit: comp.maxValuesDisplayed ? Number(comp.maxValuesDisplayed) : null,
        metricLabel: comp.metricLabel || '',
        drillEnabled: comp.drillEnabled === 'true' || comp.drillEnabled === true
      });
    });
  });

  const gridComponents = toArray(dashboard?.dashboardGridLayout?.dashboardGridComponents);
  gridComponents.forEach(gridSlot => {
    const comp = gridSlot?.dashboardComponent || gridSlot;
    if (!comp) return;
    components.push({
      title: comp.title || comp.header || '',
      type: comp.componentType || '',
      report: comp.report || '',
      rowLimit: comp.maxValuesDisplayed ? Number(comp.maxValuesDisplayed) : null,
      metricLabel: comp.metricLabel || '',
      drillEnabled: comp.drillEnabled === 'true' || comp.drillEnabled === true
    });
  });

  const rawFilters = toArray(dashboard.dashboardFilters);
  const filters = rawFilters.map(filter => ({
    column: filter?.column || filter?.field || '',
    operator: filter?.operator || filter?.filterOperator || '',
    value: filter?.value || filter?.filterValue || ''
  })).filter(f => f.column || f.value);

  return {
    name,
    title: name,
    description,
    folderName,
    components,
    filters
  };
}

function loadDashboardFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const trimmed = raw.trim();
  if (trimmed.startsWith('<')) {
    return parseDashboardXml(trimmed, filePath);
  }
  const parsed = JSON.parse(trimmed);
  return parsed.dashboard || parsed;
}

function normalizeDashboard(raw) {
  let components = [];
  if (Array.isArray(raw.components)) {
    components = raw.components;
  } else if (raw.components && typeof raw.components === 'object') {
    components = [
      ...(raw.components.left || []),
      ...(raw.components.middle || []),
      ...(raw.components.right || [])
    ];
  } else if (Array.isArray(raw.dashboardLayout?.components)) {
    components = raw.dashboardLayout.components;
  }

  const filters = raw.dashboardFilters || raw.filters || [];

  return {
    name: raw.name || raw.title || 'Unnamed Dashboard',
    description: raw.description || '',
    folderName: raw.folderName || raw.folder || '',
    components: components.map(comp => ({
      title: comp.title || comp.header || '',
      type: comp.type || comp.componentType || comp.chartType || '',
      report: comp.report || comp.sourceReport || '',
      rowLimit: comp.rowLimit || comp.maxValuesDisplayed || null,
      metricLabel: comp.metricLabel || comp.metric || '',
      drillEnabled: comp.drillEnabled || comp.drillToDetailEnabled || false
    })),
    filters: filters.map(filter => ({
      column: filter.column || filter.field || '',
      operator: filter.operator || filter.type || '',
      value: filter.value || filter.default || ''
    }))
  };
}

function loadFieldMapping(mappingPath) {
  if (!mappingPath) return null;
  if (!fs.existsSync(mappingPath)) {
    throw new Error(`Mapping file not found: ${mappingPath}`);
  }
  const mapping = loadJson(mappingPath);
  return mapping.fieldMappings || mapping.mappings || mapping.fields || null;
}

function diffLists(beforeList, afterList, keyFn) {
  const beforeMap = new Map();
  const afterMap = new Map();

  beforeList.forEach(item => {
    const key = keyFn(item);
    beforeMap.set(key, item);
  });
  afterList.forEach(item => {
    const key = keyFn(item);
    afterMap.set(key, item);
  });

  const added = [];
  const removed = [];
  const changed = [];

  beforeMap.forEach((item, key) => {
    if (!afterMap.has(key)) {
      removed.push(item);
      return;
    }
    const afterItem = afterMap.get(key);
    if (JSON.stringify(item) !== JSON.stringify(afterItem)) {
      changed.push({ before: item, after: afterItem });
    }
  });

  afterMap.forEach((item, key) => {
    if (!beforeMap.has(key)) {
      added.push(item);
    }
  });

  return { added, removed, changed };
}

function buildFinding({
  category,
  subtype,
  beforePath,
  beforeValue,
  afterPath,
  afterValue,
  impactHypothesis,
  severity,
  detectability,
  recommendedGuardrail,
  suggestedFix
}) {
  return {
    category,
    subtype,
    before: { path: beforePath, value: beforeValue },
    after: { path: afterPath, value: afterValue },
    impactHypothesis,
    severity,
    detectability,
    recommendedGuardrail,
    suggestedFix
  };
}

function determineGuardrail(severity) {
  if (severity === 'critical') return 'block';
  if (severity === 'high' || severity === 'medium') return 'require_review';
  return 'log_only';
}

function severityToScore(severity) {
  return DEFAULT_SEVERITY_WEIGHTS[severity] || 0;
}

function compareReportMetadata(pre, post, options = {}) {
  const findings = [];
  const structuralFindings = [];
  const fieldMapping = options.fieldMapping || null;

  if (pre.reportFormat !== post.reportFormat) {
    findings.push(buildFinding({
      category: 'metric_definition',
      subtype: 'aggregation_change',
      beforePath: 'reportFormat',
      beforeValue: pre.reportFormat,
      afterPath: 'reportFormat',
      afterValue: post.reportFormat,
      impactHypothesis: 'Changing report format can alter aggregation behavior and row limits.',
      severity: 'high',
      detectability: 'metadata_only',
      recommendedGuardrail: determineGuardrail('high'),
      suggestedFix: 'Match the original report format or validate aggregates for parity.'
    }));
  }

  if (pre.reportType !== post.reportType) {
    findings.push(buildFinding({
      category: 'filters_groupings',
      subtype: 'field_substitution',
      beforePath: 'reportType',
      beforeValue: pre.reportType,
      afterPath: 'reportType',
      afterValue: post.reportType,
      impactHypothesis: 'Report type changes can alter population scope and joins.',
      severity: 'high',
      detectability: 'metadata_only',
      recommendedGuardrail: determineGuardrail('high'),
      suggestedFix: 'Use the same report type or validate population counts with runtime samples.'
    }));
  }

  const preColumns = pre.detailColumns || [];
  const postColumns = post.detailColumns || [];
  const columnDiff = diffLists(preColumns, postColumns, col => normalizeText(col));
  if (columnDiff.added.length || columnDiff.removed.length) {
    const mapped = [];
    if (fieldMapping) {
      columnDiff.removed.forEach(oldCol => {
        const mappedTo = fieldMapping[oldCol];
        if (mappedTo && postColumns.some(col => normalizeText(col) === normalizeText(mappedTo))) {
          mapped.push({ from: oldCol, to: mappedTo });
        }
      });
    }
    findings.push(buildFinding({
      category: 'metric_definition',
      subtype: 'field_substitution',
      beforePath: 'detailColumns',
      beforeValue: columnDiff.removed,
      afterPath: 'detailColumns',
      afterValue: columnDiff.added,
      impactHypothesis: mapped.length > 0
        ? 'Field substitutions can alter metric meaning even if labels remain similar.'
        : 'Column changes may shift the fields underlying calculations or context.',
      severity: mapped.length > 0 ? 'high' : 'medium',
      detectability: mapped.length > 0 ? 'metadata_only' : 'requires_user_intent',
      recommendedGuardrail: determineGuardrail(mapped.length > 0 ? 'high' : 'medium'),
      suggestedFix: mapped.length > 0
        ? 'Verify mapped fields match original metric definition before approving migration.'
        : 'Restore removed columns or document intentional changes.'
    }));
  }

  const preGroups = (pre.groupingsDown || []).map(g => g.field);
  const postGroups = (post.groupingsDown || []).map(g => g.field);
  const groupDiff = diffLists(preGroups, postGroups, g => normalizeText(g));
  if (groupDiff.added.length || groupDiff.removed.length) {
    findings.push(buildFinding({
      category: 'filters_groupings',
      subtype: 'grouping_order_change',
      beforePath: 'groupingsDown',
      beforeValue: preGroups,
      afterPath: 'groupingsDown',
      afterValue: postGroups,
      impactHypothesis: 'Grouping changes alter how metrics are aggregated and compared.',
      severity: 'medium',
      detectability: 'metadata_only',
      recommendedGuardrail: determineGuardrail('medium'),
      suggestedFix: 'Align grouping levels and order with the pre-migration report.'
    }));
  } else if (JSON.stringify(preGroups) !== JSON.stringify(postGroups) && preGroups.length > 0) {
    findings.push(buildFinding({
      category: 'filters_groupings',
      subtype: 'grouping_order_change',
      beforePath: 'groupingsDown',
      beforeValue: preGroups,
      afterPath: 'groupingsDown',
      afterValue: postGroups,
      impactHypothesis: 'Grouping order changes can shift the primary analysis dimension.',
      severity: 'low',
      detectability: 'metadata_only',
      recommendedGuardrail: determineGuardrail('low'),
      suggestedFix: 'Restore original grouping order if primary dimension should be preserved.'
    }));
  }

  const preAcross = (pre.groupingsAcross || []).map(g => g.field);
  const postAcross = (post.groupingsAcross || []).map(g => g.field);
  if (JSON.stringify(preAcross) !== JSON.stringify(postAcross)) {
    findings.push(buildFinding({
      category: 'filters_groupings',
      subtype: 'grouping_order_change',
      beforePath: 'groupingsAcross',
      beforeValue: preAcross,
      afterPath: 'groupingsAcross',
      afterValue: postAcross,
      impactHypothesis: 'Across grouping changes can alter cross-tab comparisons.',
      severity: 'medium',
      detectability: 'metadata_only',
      recommendedGuardrail: determineGuardrail('medium'),
      suggestedFix: 'Review matrix groupings to ensure parity with original report.'
    }));
  }

  const preFilters = pre.reportFilters || [];
  const postFilters = post.reportFilters || [];
  const filterDiff = diffLists(preFilters, postFilters, filter => normalizeText(filter.column));
  filterDiff.changed.forEach(change => {
    if (normalizeText(change.before.operator) !== normalizeText(change.after.operator)) {
      findings.push(buildFinding({
        category: 'filters_groupings',
        subtype: 'operator_change',
        beforePath: `reportFilters.${change.before.column}.operator`,
        beforeValue: change.before.operator,
        afterPath: `reportFilters.${change.after.column}.operator`,
        afterValue: change.after.operator,
        impactHypothesis: 'Filter operator changes can materially alter included records.',
        severity: 'high',
        detectability: 'metadata_only',
        recommendedGuardrail: determineGuardrail('high'),
        suggestedFix: 'Revert operator changes or validate impact with runtime samples.'
      }));
    }

    if (normalizeText(change.before.value) !== normalizeText(change.after.value)) {
      const isRelative = normalizeText(change.before.value).includes('this') ||
        normalizeText(change.after.value).includes('this') ||
        normalizeText(change.before.value).includes('last') ||
        normalizeText(change.after.value).includes('last') ||
        normalizeText(change.before.value).includes('next') ||
        normalizeText(change.after.value).includes('next');

      findings.push(buildFinding({
        category: isRelative ? 'date_logic' : 'filters_groupings',
        subtype: isRelative ? 'relative_date_change' : 'field_substitution',
        beforePath: `reportFilters.${change.before.column}.value`,
        beforeValue: change.before.value,
        afterPath: `reportFilters.${change.after.column}.value`,
        afterValue: change.after.value,
        impactHypothesis: isRelative
          ? 'Relative date filter changes shift the reporting window.'
          : 'Filter value changes alter the population scope.',
        severity: isRelative ? 'medium' : 'medium',
        detectability: 'metadata_only',
        recommendedGuardrail: determineGuardrail('medium'),
        suggestedFix: 'Align filter values to original report intent or document new scope.'
      }));
    }
  });

  if (filterDiff.added.length || filterDiff.removed.length) {
    findings.push(buildFinding({
      category: 'filters_groupings',
      subtype: 'field_substitution',
      beforePath: 'reportFilters',
      beforeValue: filterDiff.removed.map(f => f.column),
      afterPath: 'reportFilters',
      afterValue: filterDiff.added.map(f => f.column),
      impactHypothesis: 'Added or removed filters can broaden or narrow the report population.',
      severity: 'medium',
      detectability: 'metadata_only',
      recommendedGuardrail: determineGuardrail('medium'),
      suggestedFix: 'Reconcile filter list with pre-migration definition.'
    }));
  }

  if (JSON.stringify(pre.standardDateFilter || {}) !== JSON.stringify(post.standardDateFilter || {})) {
    findings.push(buildFinding({
      category: 'date_logic',
      subtype: 'relative_date_change',
      beforePath: 'standardDateFilter',
      beforeValue: pre.standardDateFilter || null,
      afterPath: 'standardDateFilter',
      afterValue: post.standardDateFilter || null,
      impactHypothesis: 'Date filter translation can shift fiscal periods or reporting windows.',
      severity: 'high',
      detectability: 'metadata_only',
      recommendedGuardrail: determineGuardrail('high'),
      suggestedFix: 'Verify fiscal/calendar alignment and adjust date filters to match original.'
    }));
  }

  const preBuckets = pre.bucketFields || [];
  const postBuckets = post.bucketFields || [];
  const bucketDiff = diffLists(preBuckets, postBuckets, bucket => normalizeText(bucket.field || bucket.name));
  if (bucketDiff.added.length || bucketDiff.removed.length || bucketDiff.changed.length) {
    findings.push(buildFinding({
      category: 'filters_groupings',
      subtype: 'bucket_change',
      beforePath: 'bucketFields',
      beforeValue: preBuckets,
      afterPath: 'bucketFields',
      afterValue: postBuckets,
      impactHypothesis: 'Bucket boundary or field changes can shift segment definitions.',
      severity: 'medium',
      detectability: 'metadata_only',
      recommendedGuardrail: determineGuardrail('medium'),
      suggestedFix: 'Restore bucket definitions or update documentation for new segments.'
    }));
  }

  const preFormulas = pre.customSummaryFormulas || [];
  const postFormulas = post.customSummaryFormulas || [];
  const formulaDiff = diffLists(
    preFormulas,
    postFormulas,
    formula => normalizeText(formula.name || formula.label || formula.formula)
  );
  if (formulaDiff.added.length || formulaDiff.removed.length || formulaDiff.changed.length) {
    findings.push(buildFinding({
      category: 'metric_definition',
      subtype: 'formula_change',
      beforePath: 'customSummaryFormulas',
      beforeValue: preFormulas,
      afterPath: 'customSummaryFormulas',
      afterValue: postFormulas,
      impactHypothesis: 'Formula changes can alter KPI definitions and ratios.',
      severity: 'high',
      detectability: 'metadata_only',
      recommendedGuardrail: determineGuardrail('high'),
      suggestedFix: 'Align formulas to original definitions or revalidate KPI calculations.'
    }));
  }

  const preAggregates = pre.aggregates || [];
  const postAggregates = post.aggregates || [];
  const aggregateDiff = diffLists(preAggregates, postAggregates, agg => normalizeText(agg.name || agg.field || agg.calculatedFormula));
  if (aggregateDiff.added.length || aggregateDiff.removed.length || aggregateDiff.changed.length) {
    findings.push(buildFinding({
      category: 'metric_definition',
      subtype: 'aggregation_change',
      beforePath: 'aggregates',
      beforeValue: preAggregates,
      afterPath: 'aggregates',
      afterValue: postAggregates,
      impactHypothesis: 'Aggregate changes can switch totals from sums to counts or alter currency handling.',
      severity: 'high',
      detectability: 'metadata_only',
      recommendedGuardrail: determineGuardrail('high'),
      suggestedFix: 'Verify aggregate types (SUM vs COUNT vs AVG) match the original report.'
    }));
  }

  if (pre.rowLimit !== post.rowLimit) {
    findings.push(buildFinding({
      category: 'filters_groupings',
      subtype: 'row_limit_change',
      beforePath: 'rowLimit',
      beforeValue: pre.rowLimit,
      afterPath: 'rowLimit',
      afterValue: post.rowLimit,
      impactHypothesis: 'Row limit changes can truncate or expand visible records, affecting totals.',
      severity: 'medium',
      detectability: 'metadata_only',
      recommendedGuardrail: determineGuardrail('medium'),
      suggestedFix: 'Match row limits or validate totals with runtime exports.'
    }));
  }

  if (Math.abs(preColumns.length - postColumns.length) >= 5) {
    structuralFindings.push(buildFinding({
      category: 'filters_groupings',
      subtype: 'field_substitution',
      beforePath: 'detailColumns.length',
      beforeValue: preColumns.length,
      afterPath: 'detailColumns.length',
      afterValue: postColumns.length,
      impactHypothesis: 'Large column count changes can indicate structural redesign.',
      severity: 'medium',
      detectability: 'metadata_only',
      recommendedGuardrail: determineGuardrail('medium'),
      suggestedFix: 'Confirm whether column scope changes are intentional.'
    }));
  }

  // Add metric definition drift detection
  const metricDriftFindings = detectMetricDrift(pre, post);
  findings.push(...metricDriftFindings);

  // Add date logic drift detection
  const dateLogicFindings = detectDateLogicDrift(pre, post);
  findings.push(...dateLogicFindings);

  return { findings, structuralFindings };
}

function compareDashboardMetadata(pre, post) {
  const findings = [];
  const structuralFindings = [];

  const preComponents = pre.components || [];
  const postComponents = post.components || [];

  if (preComponents.length !== postComponents.length) {
    structuralFindings.push(buildFinding({
      category: 'filters_groupings',
      subtype: 'grouping_order_change',
      beforePath: 'components.length',
      beforeValue: preComponents.length,
      afterPath: 'components.length',
      afterValue: postComponents.length,
      impactHypothesis: 'Component count changes alter dashboard structure.',
      severity: 'medium',
      detectability: 'metadata_only',
      recommendedGuardrail: determineGuardrail('medium'),
      suggestedFix: 'Align component count or document intentional layout changes.'
    }));
  }

  const byTitle = (comp) => normalizeText(comp.title || comp.report || comp.type);
  const componentDiff = diffLists(preComponents, postComponents, byTitle);

  componentDiff.changed.forEach(change => {
    if (normalizeText(change.before.report) !== normalizeText(change.after.report)) {
      findings.push(buildFinding({
        category: 'metric_definition',
        subtype: 'field_substitution',
        beforePath: `components.${change.before.title}.report`,
        beforeValue: change.before.report,
        afterPath: `components.${change.after.title}.report`,
        afterValue: change.after.report,
        impactHypothesis: 'Dashboard component report changes may swap KPI definitions.',
        severity: 'high',
        detectability: 'metadata_only',
        recommendedGuardrail: determineGuardrail('high'),
        suggestedFix: 'Point the component to the migrated report equivalent or validate KPI parity.'
      }));
    }
    if (normalizeText(change.before.type) !== normalizeText(change.after.type)) {
      findings.push(buildFinding({
        category: 'filters_groupings',
        subtype: 'grouping_order_change',
        beforePath: `components.${change.before.title}.type`,
        beforeValue: change.before.type,
        afterPath: `components.${change.after.title}.type`,
        afterValue: change.after.type,
        impactHypothesis: 'Chart type changes can alter how metrics are interpreted.',
        severity: 'medium',
        detectability: 'metadata_only',
        recommendedGuardrail: determineGuardrail('medium'),
        suggestedFix: 'Use the same chart type or confirm the new visualization is acceptable.'
      }));
    }
  });

  if (componentDiff.added.length || componentDiff.removed.length) {
    findings.push(buildFinding({
      category: 'filters_groupings',
      subtype: 'grouping_order_change',
      beforePath: 'components',
      beforeValue: componentDiff.removed.map(comp => comp.title || comp.report || comp.type),
      afterPath: 'components',
      afterValue: componentDiff.added.map(comp => comp.title || comp.report || comp.type),
      impactHypothesis: 'Adding or removing components can shift the dashboard narrative.',
      severity: 'medium',
      detectability: 'metadata_only',
      recommendedGuardrail: determineGuardrail('medium'),
      suggestedFix: 'Confirm component additions/removals align with executive decision needs.'
    }));
  }

  const preFilters = pre.filters || [];
  const postFilters = post.filters || [];
  const filterDiff = diffLists(preFilters, postFilters, filter => normalizeText(filter.column));
  filterDiff.changed.forEach(change => {
    if (normalizeText(change.before.operator) !== normalizeText(change.after.operator)) {
      findings.push(buildFinding({
        category: 'filters_groupings',
        subtype: 'operator_change',
        beforePath: `dashboardFilters.${change.before.column}.operator`,
        beforeValue: change.before.operator,
        afterPath: `dashboardFilters.${change.after.column}.operator`,
        afterValue: change.after.operator,
        impactHypothesis: 'Dashboard filter operator changes alter inclusion logic.',
        severity: 'medium',
        detectability: 'metadata_only',
        recommendedGuardrail: determineGuardrail('medium'),
        suggestedFix: 'Restore original filter operators or validate filter results.'
      }));
    }

    if (normalizeText(change.before.value) !== normalizeText(change.after.value)) {
      findings.push(buildFinding({
        category: 'date_logic',
        subtype: 'relative_date_change',
        beforePath: `dashboardFilters.${change.before.column}.value`,
        beforeValue: change.before.value,
        afterPath: `dashboardFilters.${change.after.column}.value`,
        afterValue: change.after.value,
        impactHypothesis: 'Dashboard filter value changes can shift reporting windows or segments.',
        severity: 'medium',
        detectability: 'metadata_only',
        recommendedGuardrail: determineGuardrail('medium'),
        suggestedFix: 'Use the same filter defaults or document the new scope.'
      }));
    }
  });

  return { findings, structuralFindings };
}

function computeRuntimeComparison(evidence) {
  if (!evidence) return null;
  if (evidence.runtimeComparison) return evidence.runtimeComparison;

  if (evidence.pre && evidence.post) {
    const preRows = Number(evidence.pre.rowCount || 0);
    const postRows = Number(evidence.post.rowCount || 0);
    const rowCountDeltaPct = preRows ? ((postRows - preRows) / preRows) * 100 : 0;

    const preTotals = Number(evidence.pre.keyTotals || 0);
    const postTotals = Number(evidence.post.keyTotals || 0);
    const keyTotalsDeltaPct = preTotals ? ((postTotals - preTotals) / preTotals) * 100 : 0;

    return {
      testWindow: evidence.testWindow || '',
      rowCountDeltaPct: Number(rowCountDeltaPct.toFixed(2)),
      keyTotalsDeltaPct: Number(keyTotalsDeltaPct.toFixed(2)),
      notes: evidence.notes || ''
    };
  }

  return null;
}

function scoreFindings(findings, runtimeComparison) {
  let score = findings.reduce((sum, finding) => sum + severityToScore(finding.severity), 0);

  if (runtimeComparison) {
    const rowDelta = Math.abs(runtimeComparison.rowCountDeltaPct || 0);
    const totalDelta = Math.abs(runtimeComparison.keyTotalsDeltaPct || 0);

    if (rowDelta >= 30) score += 30;
    else if (rowDelta >= 10) score += 15;

    if (totalDelta >= 15) score += 40;
    else if (totalDelta >= 5) score += 20;
  }

  return Math.min(100, Math.round(score));
}

function deriveParity(findings, structuralFindings) {
  const semanticSeverity = findings.map(f => f.severity);
  const structuralSeverity = structuralFindings.map(f => f.severity);

  const semantic = semanticSeverity.includes('critical') || semanticSeverity.includes('high')
    ? 'fail'
    : semanticSeverity.includes('medium')
      ? 'warn'
      : 'pass';

  const structural = structuralSeverity.includes('high') || structuralSeverity.includes('critical')
    ? 'fail'
    : structuralSeverity.includes('medium') || structuralSeverity.includes('low')
      ? 'warn'
      : 'pass';

  return { semantic, structural };
}

function createDiffModel({
  type,
  pre,
  post,
  preId,
  postId,
  evidence,
  qualityComparison,
  findings,
  structuralFindings
}) {
  const runtimeComparison = computeRuntimeComparison(evidence);
  const parity = deriveParity(findings, structuralFindings);
  const driftScore = scoreFindings([...findings, ...structuralFindings], runtimeComparison);

  return {
    artifact: {
      type,
      preId,
      postId
    },
    parity,
    driftScore,
    findings: [...findings, ...structuralFindings],
    evidence: {
      runtimeComparison: runtimeComparison || {
        testWindow: '',
        rowCountDeltaPct: 0,
        keyTotalsDeltaPct: 0,
        notes: ''
      },
      qualityComparison: qualityComparison || null
    }
  };
}

function runQualityComparison(type, preMeta, postMeta) {
  try {
    if (type === 'report') {
      const preQuality = validateReportQuality(preMeta);
      const postQuality = validateReportQuality(postMeta);
      return {
        pre: {
          grade: preQuality.grade,
          totalScore: preQuality.totalScore
        },
        post: {
          grade: postQuality.grade,
          totalScore: postQuality.totalScore
        }
      };
    }
    if (type === 'dashboard') {
      const preQuality = validateDashboardQuality(preMeta);
      const postQuality = validateDashboardQuality(postMeta);
      return {
        pre: {
          grade: preQuality.grade,
          totalScore: preQuality.totalScore
        },
        post: {
          grade: postQuality.grade,
          totalScore: postQuality.totalScore
        }
      };
    }
  } catch (error) {
    return { error: error.message };
  }
  return null;
}

function formatSummary(diff) {
  const parity = diff.parity || {};
  let output = '\nSEMANTIC DIFF SUMMARY\n';
  output += `${'-'.repeat(60)}\n`;
  output += `Artifact: ${diff.artifact.type.toUpperCase()} | Pre: ${diff.artifact.preId} | Post: ${diff.artifact.postId}\n`;
  output += `Structural Parity: ${parity.structural} | Semantic Parity: ${parity.semantic}\n`;
  output += `Drift Score: ${diff.driftScore}/100\n`;

  if (diff.findings.length > 0) {
    output += '\nFindings:\n';
    diff.findings.forEach((finding, idx) => {
      output += `  ${idx + 1}. [${finding.severity.toUpperCase()}] ${finding.category}/${finding.subtype}: ${finding.impactHypothesis}\n`;
    });
  } else {
    output += '\nNo drift findings detected.\n';
  }

  return output;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    type: null,
    prePath: null,
    postPath: null,
    preId: null,
    postId: null,
    evidencePath: null,
    mappingPath: null,
    format: 'text'
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];
    if (arg === '--type') {
      options.type = next;
      i++;
    } else if (arg === '--pre') {
      options.prePath = next;
      i++;
    } else if (arg === '--post') {
      options.postPath = next;
      i++;
    } else if (arg === '--pre-id') {
      options.preId = next;
      i++;
    } else if (arg === '--post-id') {
      options.postId = next;
      i++;
    } else if (arg === '--evidence') {
      options.evidencePath = next;
      i++;
    } else if (arg === '--mapping') {
      options.mappingPath = next;
      i++;
    } else if (arg === '--format') {
      options.format = next;
      i++;
    } else if (arg === '--help') {
      console.log('Usage: node report-dashboard-semantic-diff.js --type report|dashboard --pre <path> --post <path> [--evidence <json>] [--mapping <json>] [--format json|text]');
      process.exit(0);
    }
  }

  if (!options.type || !options.prePath || !options.postPath) {
    throw new Error('Missing required arguments: --type, --pre, --post');
  }

  return options;
}

function run() {
  const options = parseArgs();

  const evidence = options.evidencePath ? loadJson(options.evidencePath) : null;
  const fieldMapping = loadFieldMapping(options.mappingPath);

  let preMeta = null;
  let postMeta = null;

  if (options.type === 'report') {
    preMeta = loadReportMetadata(options.prePath);
    postMeta = loadReportMetadata(options.postPath);
  } else if (options.type === 'dashboard') {
    preMeta = normalizeDashboard(loadDashboardFile(options.prePath));
    postMeta = normalizeDashboard(loadDashboardFile(options.postPath));
  } else {
    throw new Error(`Unknown type: ${options.type}`);
  }

  const comparison = options.type === 'report'
    ? compareReportMetadata(preMeta, postMeta, { fieldMapping })
    : compareDashboardMetadata(preMeta, postMeta);

  const qualityComparison = runQualityComparison(options.type, preMeta, postMeta);

  const diff = createDiffModel({
    type: options.type,
    pre: preMeta,
    post: postMeta,
    preId: options.preId || path.basename(options.prePath),
    postId: options.postId || path.basename(options.postPath),
    evidence,
    qualityComparison,
    findings: comparison.findings,
    structuralFindings: comparison.structuralFindings
  });

  if (options.format === 'json') {
    console.log(JSON.stringify(diff, null, 2));
    return;
  }

  console.log(formatSummary(diff));
}

if (require.main === module) {
  try {
    run();
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

module.exports = {
  compareReportMetadata,
  compareDashboardMetadata,
  createDiffModel,
  // New drift detection exports
  detectMetricDrift,
  detectDateLogicDrift,
  inferMetricType,
  generateBusinessExpectationChecklist,
  DATE_FILTER_SEMANTICS,
  BUSINESS_EXPECTATION_CATEGORIES
};
