#!/usr/bin/env node

/**
 * Report Failure-Mode Linter (warn-only)
 *
 * Detects report construction risks:
 * - Row limit truncation
 * - Summary vs Matrix misuse
 * - Incorrect date field usage
 * - Cross-object double counting
 */

const fs = require('fs');
const path = require('path');
const { appendLogEntry } = require('./metric-semantic-log');
const { loadReportMetadata } = require('./report-semantic-validator');
const { inferMetricId } = require('./report-semantic-validator');
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

function normalizeField(field) {
  return (field || '').toLowerCase();
}

function detectMultiObjectReport(reportType) {
  const type = (reportType || '').toLowerCase();
  if (!type) return false;
  return type.includes('with') || type.includes('and') || type.includes('parent') || type.includes('child');
}

function lintReport(reportMetadata, metricId, definitions) {
  const warnings = [];
  const format = reportMetadata.reportFormat || reportMetadata.format || '';
  const reportType = reportMetadata.reportType?.type || reportMetadata.reportType || '';
  const filters = reportMetadata.reportFilters || reportMetadata.filters || [];
  const groupingsDown = reportMetadata.groupingsDown || [];
  const groupingsAcross = reportMetadata.groupingsAcross || [];
  const aggregates = reportMetadata.aggregates || [];

  if (format === 'SUMMARY' || format === 'MATRIX') {
    warnings.push({
      code: 'ROW_TRUNCATION_RISK',
      message: `${format} reports can silently truncate at 2,000 rows. Validate row counts before relying on totals.`,
      severity: 'warning'
    });
  }

  if (format === 'MATRIX' && (groupingsDown.length === 0 || groupingsAcross.length === 0)) {
    warnings.push({
      code: 'MATRIX_MISUSE',
      message: 'Matrix report without both row and column groupings. Consider Summary format.',
      severity: 'warning'
    });
  }

  if (format === 'SUMMARY' && groupingsAcross.length > 0) {
    warnings.push({
      code: 'SUMMARY_COLUMN_GROUPINGS',
      message: 'Summary report includes column groupings. Use Matrix format to avoid hidden totals.',
      severity: 'warning'
    });
  }

  if (reportMetadata.showDetails === false && (format === 'SUMMARY' || format === 'MATRIX')) {
    warnings.push({
      code: 'DETAILS_HIDDEN',
      message: 'Hidden details in grouped reports can obscure record counts. Verify totals and counts.',
      severity: 'warning'
    });
  }

  const isMultiObject = detectMultiObjectReport(reportType);
  const hasAmountAggregate = aggregates.some(agg => normalizeField(agg.name || '').includes('amount'));
  if (isMultiObject && hasAmountAggregate) {
    warnings.push({
      code: 'DOUBLE_COUNT_RISK',
      message: 'Multi-object report with parent Amount aggregation may double-count due to child rows.',
      severity: 'warning'
    });
  }

  if (metricId) {
    const metric = definitions.metrics[metricId];
    if (metric && metric.timeFieldRole) {
      const expectedRole = metric.timeFieldRole;
      const expectedField = metric.fieldRoles?.[expectedRole]?.preferredFields?.[0];
      const hasExpectedFilter = filters.some(filter =>
        normalizeField(filter.column).includes(normalizeField(expectedField))
      );
      const usesCreatedDate = filters.some(filter =>
        normalizeField(filter.column).includes('createddate')
      );
      if (!hasExpectedFilter && usesCreatedDate) {
        warnings.push({
          code: 'DATE_FIELD_MISMATCH',
          message: `Report filters on CreatedDate but metric typically uses ${expectedField} for time grouping.`,
          severity: 'warning'
        });
      }
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
Report Failure-Mode Linter (warn-only)

Usage:
  node scripts/lib/report-failure-mode-linter.js --report <path> [options]

Options:
  --metric <metricId>     Metric ID override
  --org <alias>           Org alias for log
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

  const warnings = lintReport(reportMetadata, metricId, definitions);
  if (warnings.length === 0) {
    console.log('✓ Failure-mode lint passed (no warnings).');
  } else {
    console.log('⚠️  Failure-mode warnings:');
    warnings.forEach(warning => {
      console.log(`- [${warning.code}] ${warning.message}`);
    });
  }

  if (options.log && options.org) {
    appendLogEntry(options.org, {
      type: 'failure-mode-warning',
      metricId: metricId || null,
      reportName: reportMetadata.name || null,
      warnings,
      source: 'report-failure-mode-linter'
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
  lintReport
};
