#!/usr/bin/env node

/**
 * Report Dashboard Format Audit
 * -----------------------------
 * Inspects retrieved report + dashboard metadata and verifies that
 * each dashboard component references a report whose format and
 * summary fields satisfy the component requirements.
 *
 * Usage:
 *   node scripts/report-dashboard-format-audit.js \
 *       --metadata-dir /path/to/force-app/main/default [--json]
 *
 * By default the script writes a human-readable summary and exits
 * with code 1 when blocking mismatches are detected.
 */

const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const { execSync } = require('child_process');
const xml2js = require('xml2js');

const parseXml = promisify(new xml2js.Parser({
  explicitArray: false,
  mergeAttrs: true,
  trim: true,
}).parseString);

const DEFAULT_METADATA_DIR = path.join(process.cwd(), 'force-app', 'main', 'default');

function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    metadataDir: DEFAULT_METADATA_DIR,
    json: false,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--metadata-dir' || arg === '--dir') {
      config.metadataDir = path.resolve(args[i + 1]);
      i += 1;
    } else if (arg === '--json') {
      config.json = true;
    } else if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }
  }

  return config;
}

function printUsage() {
  console.log(`Usage: node scripts/report-dashboard-format-audit.js [options]\n\n` +
    `Options:\n` +
    `  --metadata-dir <path>  Root metadata directory (default: force-app/main/default)\n` +
    `  --json                 Emit JSON output\n` +
    `  --help                 Show this help message`);
}

async function pathExists(targetPath) {
  try {
    await fs.promises.access(targetPath, fs.constants.R_OK);
    return true;
  } catch (_) {
    return false;
  }
}

async function walkFiles(root, predicate, results = []) {
  const entries = await fs.promises.readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      await walkFiles(fullPath, predicate, results);
    } else if (predicate(fullPath)) {
      results.push(fullPath);
    }
  }
  return results;
}

function normaliseKey(relativePath) {
  return relativePath.replace(/\\/g, '/');
}

function getPlaybookVersion(playbookPath) {
  try {
    const repoRoot = path.resolve(__dirname, '..');
    const output = execSync(`git -C "${repoRoot}" log -1 --pretty=format:%h -- "${playbookPath}"`, {
      stdio: ['ignore', 'pipe', 'ignore'],
    }).toString().trim();
    return output || 'untracked';
  } catch (error) {
    return 'unknown';
  }
}

async function collectReports(reportsDir) {
  const reportFiles = await walkFiles(
    reportsDir,
    (p) => p.endsWith('.report-meta.xml'),
  );

  const reports = new Map();

  for (const filePath of reportFiles) {
    const relative = normaliseKey(path.relative(reportsDir, filePath));
    const key = relative.replace(/\.report-meta\.xml$/, '');
    const xml = await fs.promises.readFile(filePath, 'utf8');
    let parsed;
    try {
      parsed = await parseXml(xml);
    } catch (error) {
      reports.set(key, {
        path: filePath,
        parseError: error.message,
      });
      continue;
    }

    const report = parsed?.Report || {};
    const format = (report.format || '').trim();

    const aggregateNodes = Array.isArray(report.aggregates)
      ? report.aggregates
      : report.aggregates
        ? [report.aggregates]
        : [];

    const summaryKeys = new Set();
    const aggregateDetails = [];

    for (const agg of aggregateNodes) {
      if (!agg) continue;
      const devName = (agg.developerName || '').toUpperCase();
      const formula = (agg.calculatedFormula || '').toUpperCase();
      if (devName) summaryKeys.add(devName);
      if (formula) summaryKeys.add(formula);

      if (formula.includes(':')) {
        const [field, operator] = formula.split(':');
        if (field) summaryKeys.add(field.trim());
        if (field && operator) summaryKeys.add(`${field.trim()}:${operator.trim()}`);
      }

      aggregateDetails.push({
        developerName: agg.developerName || '',
        calculatedFormula: agg.calculatedFormula || '',
      });
    }

    reports.set(key, {
      path: filePath,
      name: report.name || key,
      format,
      summaryKeys,
      aggregateDetails,
    });
  }

  return reports;
}

function componentSummaries(component) {
  const rawSummary = component.chartSummary;
  if (!rawSummary) return [];
  return Array.isArray(rawSummary) ? rawSummary : [rawSummary];
}

function componentHeader(component) {
  return (
    component.header ||
    component.title ||
    component.name ||
    component?.label ||
    '(unnamed component)'
  );
}

function describeRequirement(req) {
  if (req.reason) return req.reason;
  if (req.componentType === 'Metric' || req.componentType === 'Gauge') {
    return 'Metric-style components require summary reports with summary fields.';
  }
  if (req.requiresGroupedData) {
    return 'Chart components require grouped (Summary/Matrix) reports.';
  }
  return 'Dashboard component requirement.';
}

function createRequirement({
  dashboard,
  component,
  reportRef,
}) {
  const requirement = {
    dashboard,
    componentHeader: componentHeader(component),
    componentType: component.componentType || 'Unknown',
    reportRef,
    allowedFormats: null,
    requiresSummaryFields: [],
    requiresGroupedData: false,
    severity: 'error',
    reason: '',
  };

  const type = requirement.componentType;
  const typeUpper = (type || '').toUpperCase();
  const chartLikePatterns = ['CHART', 'COLUMN', 'BAR', 'LINE', 'PIE', 'STACK', 'FUNNEL', 'SCATTER', 'AREA', 'DONUT'];
  const isChart = chartLikePatterns.some((pattern) => typeUpper.includes(pattern));
  const isMetric = typeUpper === 'METRIC' || typeUpper === 'GAUGE';

  if (isMetric) {
    requirement.allowedFormats = ['Summary', 'Matrix'];
    requirement.requiresGroupedData = true;
    requirement.reason = 'Metric/Gauge components require a Summary or Matrix report with summary formulas.';
  } else if (isChart) {
    requirement.allowedFormats = ['Summary', 'Matrix'];
    requirement.requiresGroupedData = true;
    requirement.reason = 'Chart components require grouped data (Summary or Matrix report).';
  } else {
    requirement.allowedFormats = null; // Table-style components can work with tabular
    requirement.reason = '';
  }

  const summaries = componentSummaries(component);
  for (const summary of summaries) {
    if (!summary) continue;
    const column = summary.column || summary.summaryColumn || null;
    if (!column) continue;
    const aggregate = summary.aggregate || summary.summaryType || null;
    requirement.requiresSummaryFields.push({ column, aggregate });
  }

  return requirement;
}

async function collectRequirements(dashboardsDir) {
  const dashboardFiles = await walkFiles(
    dashboardsDir,
    (p) => p.endsWith('.dashboard-meta.xml'),
  );

  const requirements = new Map();

  for (const filePath of dashboardFiles) {
    const xml = await fs.promises.readFile(filePath, 'utf8');
    let parsed;
    try {
      parsed = await parseXml(xml);
    } catch (error) {
      console.warn(`⚠️  Failed to parse dashboard ${filePath}: ${error.message}`);
      continue;
    }

    const dashboard = parsed?.Dashboard;
    if (!dashboard) continue;

    const dashboardName = dashboard.title || dashboard.name || path.basename(filePath, '.dashboard-meta.xml');

    const layout = dashboard.dashboardGridLayout;
    if (!layout?.dashboardGridComponents) continue;

    const components = Array.isArray(layout.dashboardGridComponents)
      ? layout.dashboardGridComponents
      : [layout.dashboardGridComponents];

    for (const gridSlot of components) {
      const component = gridSlot?.dashboardComponent;
      if (!component || !component.report) continue;
      const reportRef = component.report;
      const requirement = createRequirement({
        dashboard: dashboardName,
        component,
        reportRef,
      });

      const key = reportRef.replace(/\.report-meta\.xml$/i, '').replace(/\.report$/i, '');
      if (!requirements.has(key)) requirements.set(key, []);
      requirements.get(key).push(requirement);
    }
  }

  return requirements;
}

function formatKeyToComparable(format) {
  return (format || '').trim().toUpperCase();
}

function hasSummaryField(reportInfo, column, aggregate) {
  if (!column) return true;
  const upperColumn = column.toUpperCase();

  if (upperColumn === 'ROWCOUNT') {
    return formatKeyToComparable(reportInfo.format) !== 'TABULAR';
  }

  if (reportInfo.summaryKeys.has(upperColumn)) return true;
  if (aggregate) {
    const combo = `${upperColumn}:${aggregate.toUpperCase()}`;
    if (reportInfo.summaryKeys.has(combo)) return true;
  }
  return false;
}

function evaluateReport(reportKey, reportInfo, reqs) {
  const issues = [];
  const warnings = [];
  const formatUpper = formatKeyToComparable(reportInfo?.format || '');

  for (const req of reqs) {
    if (reportInfo?.parseError) {
      issues.push({
        type: 'parse',
        message: `Unable to parse report metadata (${reportInfo.parseError}).`,
        requirement: req,
      });
      continue;
    }

    if (!reportInfo) {
      issues.push({
        type: 'missing-report',
        message: 'Report metadata not found in retrieved assets.',
        requirement: req,
      });
      continue;
    }

    if (req.allowedFormats) {
      const allowedUpper = req.allowedFormats.map((f) => f.toUpperCase());
      if (!allowedUpper.includes(formatUpper)) {
        issues.push({
          type: 'format',
          message: `Format '${reportInfo.format || 'Unknown'}' does not satisfy ${req.allowedFormats.join('/')} requirement for component '${req.componentHeader}'.`,
          requirement: req,
        });
      }
    }

    for (const field of req.requiresSummaryFields) {
      if (!hasSummaryField(reportInfo, field.column, field.aggregate)) {
        issues.push({
          type: 'summary-field',
          message: `Missing summary for '${field.column}'${field.aggregate ? ` (${field.aggregate})` : ''} required by component '${req.componentHeader}'.`,
          requirement: req,
        });
      }
    }

    if (!req.allowedFormats && req.requiresSummaryFields.length) {
      // Table components that reference summary fields are questionable but not fatal
      warnings.push({
        type: 'summary-field-warning',
        message: `Component '${req.componentHeader}' references summary fields; ensure report format supports them.`,
        requirement: req,
      });
    }
  }

  return { issues, warnings };
}

function groupEvaluations(reports, requirements) {
  const evaluations = [];

  const reportKeys = new Set([...reports.keys(), ...requirements.keys()]);
  for (const key of reportKeys) {
    const reportInfo = reports.get(key) || null;
    const reqs = requirements.get(key) || [];
    if (reqs.length === 0) continue; // Only care about reports referenced by dashboards

    const { issues, warnings } = evaluateReport(key, reportInfo, reqs);
    evaluations.push({
      reportKey: key,
      reportPath: reportInfo?.path || null,
      reportFormat: reportInfo?.format || 'Unknown',
      issues,
      warnings,
      requirements: reqs,
    });
  }

  return evaluations;
}

function toPlainText(evaluations) {
  if (evaluations.length === 0) {
    return 'No dashboard-linked reports found in the provided metadata.';
  }

  const lines = [];
  let totalIssues = 0;
  let totalWarnings = 0;

  for (const evaluation of evaluations) {
    const header = `Report: ${evaluation.reportKey} (format: ${evaluation.reportFormat})`;
    lines.push(header);
    if (evaluation.reportPath) {
      lines.push(`  Source: ${evaluation.reportPath}`);
    }

    if (evaluation.issues.length === 0 && evaluation.warnings.length === 0) {
      lines.push('  ✅ All dashboard requirements satisfied.');
      lines.push('');
      continue;
    }

    for (const issue of evaluation.issues) {
      totalIssues += 1;
      const req = issue.requirement;
      lines.push(`  ❌ ${issue.message}`);
      lines.push(`     Dashboard: ${req.dashboard} | Component: ${req.componentHeader} (${req.componentType})`);
    }

    for (const warning of evaluation.warnings) {
      totalWarnings += 1;
      const req = warning.requirement;
      lines.push(`  ⚠️  ${warning.message}`);
      lines.push(`     Dashboard: ${req.dashboard} | Component: ${req.componentHeader} (${req.componentType})`);
    }

    lines.push('');
  }

  lines.push(`Summary: ${totalIssues} blocking issue(s), ${totalWarnings} warning(s).`);
  return { text: lines.join('\n'), totalIssues, totalWarnings };
}

async function main() {
  const { metadataDir, json } = parseArgs();
  const playbookPath = 'docs/playbooks/dashboard-report-hygiene.md';
  if (!json) {
    console.log(`Playbook: ${playbookPath}`);
    console.log(`Playbook version: ${getPlaybookVersion(playbookPath)}`);
  }
  const reportsDir = path.join(metadataDir, 'reports');
  const dashboardsDir = path.join(metadataDir, 'dashboards');

  if (!(await pathExists(reportsDir))) {
    console.error(`Reports directory not found: ${reportsDir}`);
    process.exit(2);
  }
  if (!(await pathExists(dashboardsDir))) {
    console.error(`Dashboards directory not found: ${dashboardsDir}`);
    process.exit(2);
  }

  const [reports, requirements] = await Promise.all([
    collectReports(reportsDir),
    collectRequirements(dashboardsDir),
  ]);

  const evaluations = groupEvaluations(reports, requirements);

  if (json) {
    console.log(JSON.stringify({ evaluations }, null, 2));
    const blocking = evaluations.reduce((count, evaln) => count + evaln.issues.length, 0);
    process.exit(blocking > 0 ? 1 : 0);
    return;
  }

  const { text, totalIssues } = toPlainText(evaluations);
  console.log(text);
  process.exit(totalIssues > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error('Unexpected error:', error.message);
  process.exit(1);
});
