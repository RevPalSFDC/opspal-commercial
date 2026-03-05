#!/usr/bin/env node

/**
 * Report Semantic Validator (warn-only)
 *
 * Validates report metadata against canonical metric semantics.
 * Logs warnings for runbook synthesis.
 */

const fs = require('fs');
const path = require('path');
const { parseString } = require('xml2js');
const { appendLogEntry } = require('./metric-semantic-log');

const DEFAULT_DEFINITIONS_PATH = path.join(__dirname, '../../config/metric-definitions.json');

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function loadDefinitions(definitionsPath) {
  const pathToUse = definitionsPath || DEFAULT_DEFINITIONS_PATH;
  if (!fs.existsSync(pathToUse)) {
    throw new Error(`Metric definitions not found: ${pathToUse}`);
  }
  return loadJson(pathToUse);
}

function parseXmlReport(xmlContent) {
  let parsed = null;
  parseString(xmlContent, { explicitArray: true }, (err, result) => {
    if (err) throw err;
    parsed = result;
  });
  const report = parsed?.Report || {};
  const first = value => Array.isArray(value) ? value[0] : value;
  const normalizeColumn = (col) => {
    if (!col) return null;
    if (typeof col === 'string') return col;
    if (col.field) return first(col.field);
    if (col._) return col._;
    return null;
  };

  const columns = (report.columns || []).map(normalizeColumn).filter(Boolean);
  const groupingsDown = (report.groupingsDown || []).map(group => ({
    field: first(group.field) || first(group.column) || null,
    dateGranularity: first(group.dateGranularity) || null
  })).filter(g => g.field);
  const groupingsAcross = (report.groupingsAcross || []).map(group => ({
    field: first(group.field) || first(group.column) || null,
    dateGranularity: first(group.dateGranularity) || null
  })).filter(g => g.field);

  const filters = [];
  const filterBlock = report.filter?.[0];
  const criteriaItems = filterBlock?.criteriaItems || [];
  criteriaItems.forEach(item => {
    if (!item.column || !item.operator) return;
    filters.push({
      column: first(item.column),
      operator: first(item.operator),
      value: item.value ? first(item.value) : null
    });
  });

  const aggregates = (report.aggregates || []).map(agg => ({
    name: first(agg.name) || first(agg.field) || first(agg.column) || null,
    aggregateType: first(agg.aggregateType) || null
  })).filter(agg => agg.name);

  const customSummaryFormulas = (report.customSummaryFormulas || report.customSummaryFormula || []).map(formula => ({
    name: first(formula.name) || first(formula.label) || null,
    label: first(formula.label) || first(formula.name) || null,
    formula: first(formula.formula) || null,
    dataType: first(formula.dataType) || null,
    decimalPlaces: first(formula.decimalPlaces) || null
  })).filter(formula => formula.name || formula.formula);

  const bucketFields = (report.bucketFields || report.bucketField || report.buckets || []).map(bucket => ({
    name: first(bucket.name) || first(bucket.label) || null,
    field: first(bucket.field) || first(bucket.sourceColumn) || first(bucket.column) || null,
    type: first(bucket.type) || first(bucket.bucketType) || null,
    values: bucket.values || []
  })).filter(bucket => bucket.field || bucket.name);

  const chart = report.chart?.[0] ? {
    chartType: first(report.chart[0].chartType) || null,
    groupingColumn: first(report.chart[0].groupingColumn) || null,
    aggregateColumn: first(report.chart[0].aggregateColumn) || null,
    dateGranularity: first(report.chart[0].dateGranularity) || null
  } : null;

  const standardDateFilter = report.standardDateFilter?.[0] ? {
    column: first(report.standardDateFilter[0].column) || null,
    operator: first(report.standardDateFilter[0].operator) || null,
    value: first(report.standardDateFilter[0].duration) ||
      first(report.standardDateFilter[0].value) ||
      first(report.standardDateFilter[0].startDate) ||
      null
  } : null;

  const showDetailsValue = first(report.showDetails);
  const showDetails = typeof showDetailsValue === 'boolean'
    ? showDetailsValue
    : String(showDetailsValue || '').toLowerCase() === 'true';

  const rowLimit = report.rowLimit ? Number(first(report.rowLimit)) : null;

  return {
    name: report.name?.[0] || null,
    description: report.description?.[0] || null,
    reportType: report.reportType?.[0] || null,
    reportFormat: report.format?.[0] ? report.format[0].toUpperCase() : null,
    detailColumns: columns,
    groupingsDown,
    groupingsAcross,
    reportFilters: filters,
    aggregates,
    customSummaryFormulas,
    bucketFields,
    chart,
    standardDateFilter,
    showDetails,
    rowLimit
  };
}

function loadReportMetadata(reportPath) {
  const content = fs.readFileSync(reportPath, 'utf8');
  const trimmed = content.trim();
  if (trimmed.startsWith('<')) {
    return parseXmlReport(trimmed);
  }
  const json = JSON.parse(content);
  return json.reportMetadata || json;
}

function normalizeField(field) {
  return (field || '').toLowerCase();
}

function filterContainsField(filters, fieldName) {
  const target = normalizeField(fieldName);
  return filters.some(filter => normalizeField(filter.column).includes(target));
}

function reportContainsField(reportMetadata, fieldName) {
  const target = normalizeField(fieldName);
  const detailColumns = reportMetadata.detailColumns || reportMetadata.columns || [];
  const aggregates = reportMetadata.aggregates || [];
  const groupings = [
    ...(reportMetadata.groupingsDown || []),
    ...(reportMetadata.groupingsAcross || [])
  ];

  if (detailColumns.some(col => normalizeField(col).includes(target))) return true;
  if (aggregates.some(agg => normalizeField(agg.name || agg.field || '').includes(target))) return true;
  if (groupings.some(group => normalizeField(group.field).includes(target))) return true;

  return false;
}

function inferMetricId(reportMetadata, definitions) {
  if (reportMetadata.metricDefinitionId) return reportMetadata.metricDefinitionId;
  if (reportMetadata.semanticMetricId) return reportMetadata.semanticMetricId;

  const name = `${reportMetadata.name || ''} ${reportMetadata.description || ''}`.toLowerCase();
  const defaultVariants = definitions.defaultVariants || {};

  if (name.includes('pipeline')) return defaultVariants.pipeline || 'pipeline.arr';
  if (name.includes('booking')) return defaultVariants.bookings || 'bookings.tcv';
  if (name.includes('revenue')) return defaultVariants.revenue || 'revenue.recognized';
  if (name.includes('acv')) return defaultVariants.acv || 'acv.contract';
  if (name.includes('arr')) return defaultVariants.arr || 'arr.subscription';
  if (name.includes('tcv')) return defaultVariants.tcv || 'tcv.contract';
  if (name.includes('win rate') || name.includes('win-rate')) return defaultVariants.win_rate || 'win_rate.count';
  if (name.includes('sales cycle')) return defaultVariants.sales_cycle_length || 'sales_cycle_length.won';

  return null;
}

function loadMapping(org, mappingPath) {
  if (!org) return null;
  if (mappingPath && fs.existsSync(mappingPath)) {
    return loadJson(mappingPath);
  }
  const defaultPath = path.join(process.cwd(), 'instances', 'salesforce', org, 'metric-field-mapping.json');
  if (fs.existsSync(defaultPath)) {
    return loadJson(defaultPath);
  }
  return null;
}

function validateSemantic(reportMetadata, metric, mappingEntry) {
  const warnings = [];
  const filters = reportMetadata.reportFilters || reportMetadata.filters || [];

  const closeDateRole = metric.timeFieldRole || 'closeDate';
  const expectedDateField = mappingEntry?.fields?.[closeDateRole] || metric.fieldRoles?.[closeDateRole]?.preferredFields?.[0];

  if (expectedDateField && !filterContainsField(filters, expectedDateField)) {
    if (filterContainsField(filters, 'CreatedDate')) {
      warnings.push({
        code: 'DATE_FIELD_MISMATCH',
        message: `Report filters on CreatedDate but metric expects ${expectedDateField}.`,
        severity: 'warning'
      });
    } else {
      warnings.push({
        code: 'MISSING_DATE_FILTER',
        message: `Missing expected date filter for ${expectedDateField}.`,
        severity: 'warning'
      });
    }
  }

  if (metric.category === 'pipeline') {
    const hasClosedFilter = filterContainsField(filters, 'IsClosed') || filterContainsField(filters, 'StageName');
    if (!hasClosedFilter) {
      warnings.push({
        code: 'PIPELINE_OPEN_FILTER_MISSING',
        message: 'Pipeline report missing open-only filter (IsClosed = false or StageName not closed).',
        severity: 'warning'
      });
    }
  }

  if (metric.category === 'bookings') {
    const hasWonFilter = filterContainsField(filters, 'IsWon') || (filters || []).some(f =>
      normalizeField(f.column).includes('stage') && String(f.value || '').toLowerCase().includes('closed won')
    );
    if (!hasWonFilter) {
      warnings.push({
        code: 'BOOKINGS_WON_FILTER_MISSING',
        message: 'Bookings report missing Closed Won filter (IsWon = true or StageName = Closed Won).',
        severity: 'warning'
      });
    }
  }

  if (metric.category === 'revenue') {
    const reportType = (reportMetadata.reportType?.type || reportMetadata.reportType || '').toLowerCase();
    if (reportType.includes('opportunity')) {
      warnings.push({
        code: 'REVENUE_PROXY',
        message: 'Revenue report is based on Opportunity data. Confirm this is a proxy and not recognized revenue.',
        severity: 'warning'
      });
    }
  }

  if (metric.category === 'win_rate') {
    const hasClosedFilter = filterContainsField(filters, 'IsClosed');
    if (!hasClosedFilter) {
      warnings.push({
        code: 'WIN_RATE_OPEN_IN_DENOMINATOR',
        message: 'Win rate should be calculated on closed opportunities only (IsClosed = true).',
        severity: 'warning'
      });
    }
  }

  if (metric.category === 'sales_cycle_length') {
    const hasCreated = reportContainsField(reportMetadata, 'CreatedDate');
    const hasClose = reportContainsField(reportMetadata, 'CloseDate');
    if (!hasCreated || !hasClose) {
      warnings.push({
        code: 'SALES_CYCLE_FIELDS_MISSING',
        message: 'Sales cycle reports should reference CreatedDate and CloseDate for duration calculation.',
        severity: 'warning'
      });
    }
  }

  if (mappingEntry?.fields?.amount) {
    const amountField = mappingEntry.fields.amount;
    if (!reportContainsField(reportMetadata, amountField)) {
      warnings.push({
        code: 'AMOUNT_FIELD_MISMATCH',
        message: `Report does not reference mapped amount field (${amountField}).`,
        severity: 'warning'
      });
    }
  }

  return warnings;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    reportPath: null,
    metricId: null,
    org: null,
    mappingPath: null,
    definitionsPath: null,
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
      case '--metric':
        options.metricId = next;
        i += 1;
        break;
      case '--org':
        options.org = next;
        i += 1;
        break;
      case '--mapping':
        options.mappingPath = next;
        i += 1;
        break;
      case '--definitions':
        options.definitionsPath = next;
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
Report Semantic Validator (warn-only)

Usage:
  node scripts/lib/report-semantic-validator.js --report <path> [options]

Options:
  --metric <metricId>     Metric ID override
  --org <alias>           Org alias for mapping and log
  --mapping <path>        Mapping file override
  --definitions <path>    Metric definitions override
  --no-log                Skip log entry
`);
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

  const definitions = loadDefinitions(options.definitionsPath);
  const reportMetadata = loadReportMetadata(options.reportPath);
  const metricId = options.metricId || inferMetricId(reportMetadata, definitions);

  if (!metricId) {
    console.log('⚠️  Unable to infer metric ID. Provide --metric to validate semantics.');
    return;
  }

  const metric = definitions.metrics[metricId];
  if (!metric) {
    throw new Error(`Unknown metricId: ${metricId}`);
  }

  const mapping = loadMapping(options.org, options.mappingPath);
  const mappingEntry = mapping?.metrics?.[metricId] || null;
  const warnings = validateSemantic(reportMetadata, metric, mappingEntry);

  if (warnings.length === 0) {
    console.log('✓ Semantic validation passed (no warnings).');
  } else {
    console.log('⚠️  Semantic warnings:');
    warnings.forEach(warning => {
      console.log(`- [${warning.code}] ${warning.message}`);
    });
  }

  if (options.log && options.org) {
    appendLogEntry(options.org, {
      type: 'semantic-warning',
      metricId,
      reportName: reportMetadata.name || null,
      baseObject: metric.baseObject || null,
      warnings,
      source: 'report-semantic-validator'
    });
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
  loadReportMetadata,
  inferMetricId,
  validateSemantic
};
