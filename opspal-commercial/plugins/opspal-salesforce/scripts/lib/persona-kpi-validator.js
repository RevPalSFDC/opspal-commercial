#!/usr/bin/env node

/**
 * Persona KPI Validator
 *
 * Validates dashboards against persona-to-KPI contracts.
 * Intended for RevOps audits and dashboard QA.
 *
 * QA-003: Now supports enforcement mode via --enforce flag.
 * In enforce mode, critical violations (MISSING_REQUIRED_METRICS, PERSONA_UNKNOWN)
 * will cause the validator to exit with non-zero status.
 *
 * @version 2.0.0
 * @date 2026-02-02
 * @changelog 2.0.0 - QA-003: Added enforcement mode with critical violations
 */

// Critical violations that MUST fail in enforce mode
const CRITICAL_VIOLATIONS = [
    'MISSING_REQUIRED_METRICS',
    'PERSONA_UNKNOWN'
];

const fs = require('fs');
const path = require('path');
const { parseString } = require('xml2js');
const { inferMetricId } = require('./report-semantic-validator');
const { loadLog: loadMetricLog } = require('./metric-semantic-log');
const { loadLog: loadDiagnosticsLog } = require('./report-diagnostics-log');
const { appendLogEntry } = require('./persona-kpi-log');

const DEFAULT_CONTRACTS_PATH = path.join(__dirname, '../../config/persona-kpi-contracts.json');
const DEFAULT_METRICS_PATH = path.join(__dirname, '../../config/metric-definitions.json');

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function normalizeText(text) {
  return (text || '')
    .toString()
    .toLowerCase()
    .replace(/[_/]+/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeReportName(name) {
  return normalizeText(name).replace(/\s+/g, ' ').trim();
}

function toArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
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
        indicatorBreakpoint1: comp.indicatorBreakpoint1 || null,
        indicatorBreakpoint2: comp.indicatorBreakpoint2 || null,
        gaugeMax: comp.gaugeMax || null,
        gaugeMin: comp.gaugeMin || null,
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
      indicatorBreakpoint1: comp.indicatorBreakpoint1 || null,
      indicatorBreakpoint2: comp.indicatorBreakpoint2 || null,
      gaugeMax: comp.gaugeMax || null,
      gaugeMin: comp.gaugeMin || null,
      drillEnabled: comp.drillEnabled === 'true' || comp.drillEnabled === true
    });
  });

  return {
    name,
    title: name,
    description,
    folderName,
    components
  };
}

function loadDashboardFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const trimmed = raw.trim();
  if (trimmed.startsWith('<')) {
    return parseDashboardXml(trimmed, filePath);
  }
  const parsed = JSON.parse(trimmed);
  if (parsed.dashboard) return parsed.dashboard;
  return parsed;
}

function loadContracts(contractsPath) {
  const resolved = contractsPath || DEFAULT_CONTRACTS_PATH;
  if (!fs.existsSync(resolved)) {
    throw new Error(`Persona KPI contracts not found: ${resolved}`);
  }
  return loadJson(resolved);
}

function loadMetricDefinitions(definitionsPath) {
  const resolved = definitionsPath || DEFAULT_METRICS_PATH;
  if (!fs.existsSync(resolved)) {
    throw new Error(`Metric definitions not found: ${resolved}`);
  }
  return loadJson(resolved);
}

function buildMetricLogIndex(metricLog) {
  const index = new Map();
  if (!metricLog || !Array.isArray(metricLog.entries)) return index;

  metricLog.entries.forEach(entry => {
    if (!entry.metricId) return;
    if (entry.reportName) {
      index.set(normalizeReportName(entry.reportName), entry.metricId);
    }
    if (entry.reportId) {
      index.set(entry.reportId.toLowerCase(), entry.metricId);
    }
  });

  return index;
}

function extractReportKey(reportRef) {
  if (!reportRef) return null;
  const raw = reportRef.split('/').slice(-1)[0];
  if (!raw) return null;
  return normalizeReportName(raw);
}

function detectPersona(dashboard, contracts, options = {}) {
  const explicit = options.persona ? normalizeText(options.persona) : '';
  if (explicit) {
    const personaKey = Object.keys(contracts.personas || {}).find(key =>
      normalizeText(key) === explicit ||
      normalizeText(contracts.personas[key].label) === explicit
    );
    if (personaKey) {
      return {
        personaKey,
        confidence: 1,
        source: 'explicit',
        matchedAliases: [options.persona]
      };
    }
  }

  const fields = [
    dashboard.audience,
    dashboard.title,
    dashboard.name,
    dashboard.description,
    dashboard.folderName,
    dashboard.templateMetadata?.audience,
    dashboard.templateMetadata?.templateName
  ].filter(Boolean).join(' ');

  const haystack = normalizeText(fields);
  let best = { personaKey: null, score: 0, matchedAliases: [] };

  Object.entries(contracts.personas || {}).forEach(([key, persona]) => {
    const aliases = persona.aliases || [];
    let score = 0;
    const matched = [];
    aliases.forEach(alias => {
      const needle = normalizeText(alias);
      if (needle && haystack.includes(needle)) {
        score += 1;
        matched.push(alias);
      }
    });
    if (score > best.score) {
      best = { personaKey: key, score, matchedAliases: matched };
    }
  });

  if (!best.personaKey) {
    return {
      personaKey: null,
      confidence: 0,
      source: 'none',
      matchedAliases: []
    };
  }

  const confidence = best.score >= 2 ? 0.9 : 0.6;
  return {
    personaKey: best.personaKey,
    confidence,
    source: 'inferred',
    matchedAliases: best.matchedAliases
  };
}

function buildComponentSummary(components) {
  const summary = {
    total: components.length,
    tables: 0,
    charts: 0,
    metrics: 0,
    targets: 0,
    detailTables: 0,
    drillEnabled: 0
  };

  components.forEach(component => {
    const type = normalizeText(component.type || '');
    const isTable = type.includes('table');
    const isMetric = type.includes('metric') || type.includes('gauge');
    const isChart = !isTable && !isMetric;
    const rowLimit = Number(component.rowLimit || 0);
    const hasTarget = Boolean(
      component.target ||
      component.gaugeMax ||
      component.gaugeMin ||
      component.indicatorBreakpoint1 ||
      component.indicatorBreakpoint2 ||
      component.greenZone ||
      component.redZone ||
      component.yellowZone
    );

    if (isTable) summary.tables += 1;
    if (isMetric) summary.metrics += 1;
    if (isChart) summary.charts += 1;
    if (hasTarget) summary.targets += 1;
    if (isTable && (!rowLimit || rowLimit > 20)) summary.detailTables += 1;
    if (component.drillEnabled) summary.drillEnabled += 1;
  });

  return summary;
}

function extractMetricSignals(components, contracts, definitions, metricIndex, diagnosticsLog) {
  const presentMetricIds = new Set();
  const presentCategories = new Set();
  const signals = [];

  const categoryAliases = contracts.metricAliases || {};

  components.forEach(component => {
    const text = normalizeText([
      component.title,
      component.metricLabel,
      component.metric,
      component.report,
      component.sourceReport
    ].filter(Boolean).join(' '));

    // Map report reference to metricId from semantic log
    let metricId = null;
    if (component.report) {
      const reportKey = extractReportKey(component.report);
      if (reportKey && metricIndex.has(reportKey)) {
        metricId = metricIndex.get(reportKey);
      }
    }

    // Fallback: infer metric by text
    if (!metricId && text) {
      metricId = inferMetricId({ name: text }, definitions);
    }

    if (metricId && definitions.metrics?.[metricId]) {
      presentMetricIds.add(metricId);
      presentCategories.add(definitions.metrics[metricId].category);
      signals.push({ source: 'metricId', metricId, text: component.title || component.report });
    }

    // Keyword category detection
    Object.entries(categoryAliases).forEach(([category, aliases]) => {
      if (!aliases || !Array.isArray(aliases)) return;
      const matched = aliases.some(alias => {
        const needle = normalizeText(alias);
        return needle && text.includes(needle);
      });
      if (matched) {
        presentCategories.add(category);
        signals.push({ source: 'keyword', category, text: component.title || component.report });
      }
    });

    // Diagnostics-based intent hints (optional)
    if (diagnosticsLog && component.report) {
      const reportKey = extractReportKey(component.report);
      const intentEntry = diagnosticsLog.entries?.find(entry =>
        normalizeReportName(entry.reportName || '') === reportKey
      );
      const intentLabel = intentEntry?.intent?.primary?.label || '';
      if (intentLabel) {
        const inferred = inferMetricId({ name: intentLabel }, definitions);
        if (inferred && definitions.metrics?.[inferred]) {
          presentMetricIds.add(inferred);
          presentCategories.add(definitions.metrics[inferred].category);
          signals.push({ source: 'intent', metricId: inferred, text: intentLabel });
        }
      }
    }
  });

  return {
    presentMetricIds: Array.from(presentMetricIds),
    presentCategories: Array.from(presentCategories),
    signals
  };
}

function evaluateContract(personaConfig, metrics, components, definitions) {
  const issues = [];
  const componentSummary = buildComponentSummary(components);

  const isCategory = value => (definitions.metrics && Object.values(definitions.metrics).some(m => m.category === value));

  const hasMetric = (entry) => {
    if (!entry) return false;
    if (entry.includes('.')) {
      return metrics.presentMetricIds.includes(entry);
    }
    if (isCategory(entry)) {
      return metrics.presentCategories.includes(entry);
    }
    return metrics.presentCategories.includes(entry);
  };

  const missingRequired = (personaConfig.required || []).filter(req => !hasMetric(req));
  if (missingRequired.length > 0) {
    issues.push({
      code: 'MISSING_REQUIRED_METRICS',
      severity: CRITICAL_VIOLATIONS.includes('MISSING_REQUIRED_METRICS') ? 'error' : 'warn',
      isCritical: true,
      message: `Missing required metrics for ${personaConfig.label}: ${missingRequired.join(', ')}`
    });
  }

  const neverKeywords = personaConfig.neverKeywords || [];
  const componentText = components.map(comp => normalizeText(`${comp.title || ''} ${comp.report || ''}`)).join(' ');
  const violatingKeywords = neverKeywords.filter(keyword => {
    const needle = normalizeText(keyword);
    return needle && componentText.includes(needle);
  });
  if (violatingKeywords.length > 0) {
    issues.push({
      code: 'DISALLOWED_METRICS',
      severity: 'warn',
      message: `Disallowed metrics detected for ${personaConfig.label}: ${violatingKeywords.join(', ')}`
    });
  }

  if (personaConfig.maxDetailTables !== undefined && componentSummary.detailTables > personaConfig.maxDetailTables) {
    issues.push({
      code: 'EXCESSIVE_DETAIL',
      severity: 'warn',
      message: `Too many detail tables for ${personaConfig.label} (${componentSummary.detailTables} > ${personaConfig.maxDetailTables})`
    });
  }

  if (personaConfig.requiresTargets && componentSummary.targets === 0) {
    issues.push({
      code: 'MISSING_TARGETS',
      severity: 'warn',
      message: `No targets or benchmarks detected for ${personaConfig.label} dashboard`
    });
  }

  if (personaConfig.requiresActionList && componentSummary.tables === 0) {
    issues.push({
      code: 'NON_ACTIONABLE',
      severity: 'warn',
      message: `No actionable tables found for ${personaConfig.label} dashboard`
    });
  }

  return {
    issues,
    componentSummary,
    missingRequired,
    violatingKeywords
  };
}

function validateDashboardPersonaContract(dashboard, options = {}) {
  const contracts = loadContracts(options.contractsPath);
  const definitions = loadMetricDefinitions(options.definitionsPath);
  const metricLog = options.metricLog || (options.org ? loadMetricLog(options.org) : null);
  const diagnosticsLog = options.diagnosticsLog || (options.org ? loadDiagnosticsLog(options.org) : null);
  const metricIndex = buildMetricLogIndex(metricLog);

  let rawComponents = [];
  if (Array.isArray(dashboard.components)) {
    rawComponents = dashboard.components;
  } else if (dashboard.components && typeof dashboard.components === 'object') {
    rawComponents = [
      ...(dashboard.components.left || []),
      ...(dashboard.components.middle || []),
      ...(dashboard.components.right || [])
    ];
  } else if (Array.isArray(dashboard.dashboardLayout?.components)) {
    rawComponents = dashboard.dashboardLayout.components;
  }

  const normalizedComponents = rawComponents.map(comp => ({
    title: comp.title || comp.header || '',
    type: comp.type || comp.componentType || comp.chartType || '',
    report: comp.report || comp.sourceReport || '',
    rowLimit: comp.rowLimit || comp.maxValuesDisplayed || null,
    metricLabel: comp.metricLabel || '',
    metric: comp.metric || '',
    target: comp.target || null,
    gaugeMax: comp.gaugeMax || null,
    gaugeMin: comp.gaugeMin || null,
    indicatorBreakpoint1: comp.indicatorBreakpoint1 || null,
    indicatorBreakpoint2: comp.indicatorBreakpoint2 || null,
    greenZone: comp.greenZone || null,
    yellowZone: comp.yellowZone || null,
    redZone: comp.redZone || null,
    drillEnabled: comp.drillEnabled || comp.drillToDetailEnabled || false
  }));

  const personaResult = detectPersona(dashboard, contracts, options);
  const personaConfig = personaResult.personaKey ? contracts.personas[personaResult.personaKey] : null;

  const metrics = extractMetricSignals(
    normalizedComponents,
    contracts,
    definitions,
    metricIndex,
    diagnosticsLog
  );

  const issues = [];
  const needsConfirmation = [];

  if (!personaConfig) {
    issues.push({
      code: 'PERSONA_UNKNOWN',
      severity: CRITICAL_VIOLATIONS.includes('PERSONA_UNKNOWN') ? 'error' : 'warn',
      isCritical: true,
      message: 'Unable to infer persona for dashboard. Provide persona explicitly.'
    });
    needsConfirmation.push('persona');
  }

  if (metrics.presentMetricIds.length === 0 && metrics.presentCategories.length === 0) {
    needsConfirmation.push('metric-mapping');
  }

  let contractResult = {
    issues: [],
    componentSummary: buildComponentSummary(normalizedComponents),
    missingRequired: [],
    violatingKeywords: []
  };

  if (personaConfig) {
    contractResult = evaluateContract(personaConfig, metrics, normalizedComponents, definitions);
    issues.push(...contractResult.issues);
  }

  const status = issues.length > 0 ? 'warn' : 'pass';

  const result = {
    status,
    dashboardName: dashboard.name || dashboard.title || 'Unnamed Dashboard',
    persona: personaConfig ? personaConfig.label : null,
    personaKey: personaResult.personaKey,
    personaConfidence: personaResult.confidence,
    personaSource: personaResult.source,
    metrics: {
      presentMetricIds: metrics.presentMetricIds,
      presentCategories: metrics.presentCategories,
      missingRequired: contractResult.missingRequired,
      violatingKeywords: contractResult.violatingKeywords
    },
    componentSummary: contractResult.componentSummary,
    issues,
    needsConfirmation
  };

  if (options.org) {
    appendLogEntry(options.org, {
      dashboardName: result.dashboardName,
      dashboardId: dashboard.id || dashboard.dashboardId || null,
      persona: result.persona,
      status: result.status,
      metrics: result.metrics,
      issues: result.issues,
      needsConfirmation: result.needsConfirmation,
      source: options.source || 'persona-kpi-validator'
    }, {
      workspaceRoot: options.workspaceRoot
    });
  }

  return result;
}

function formatResult(result, format = 'text') {
  if (format === 'json') {
    return JSON.stringify(result, null, 2);
  }

  let output = `\n🧭 PERSONA KPI VALIDATION\n`;
  output += `${'-'.repeat(60)}\n`;
  output += `Dashboard: ${result.dashboardName}\n`;
  output += `Persona: ${result.persona || 'Unspecified'} (${result.personaSource || 'unknown'})\n`;
  output += `Status: ${result.status.toUpperCase()}\n\n`;

  if (result.metrics) {
    output += `Metrics Present: ${result.metrics.presentCategories.join(', ') || 'None'}\n`;
    if (result.metrics.missingRequired.length > 0) {
      output += `Missing Required: ${result.metrics.missingRequired.join(', ')}\n`;
    }
  }

  if (result.issues.length > 0) {
    output += `\nWarnings:\n`;
    result.issues.forEach((issue, idx) => {
      output += `  ${idx + 1}. ${issue.message}\n`;
    });
  }

  if (result.needsConfirmation.length > 0) {
    output += `\nNeeds Confirmation: ${result.needsConfirmation.join(', ')}\n`;
  }

  return output;
}

function collectDashboardFiles(dirPath) {
  const files = [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  entries.forEach(entry => {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectDashboardFiles(fullPath));
      return;
    }
    if (entry.name.endsWith('.dashboard-meta.xml') || entry.name.endsWith('.json')) {
      files.push(fullPath);
    }
  });
  return files;
}

function run() {
  const args = process.argv.slice(2);
  const options = {
    dashboardPath: null,
    dashboardsDir: null,
    persona: null,
    org: null,
    format: 'text',
    enforce: false  // QA-003: Enforcement mode
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];
    if (arg === '--dashboard') {
      options.dashboardPath = next;
      i++;
    } else if (arg === '--dashboards-dir') {
      options.dashboardsDir = next;
      i++;
    } else if (arg === '--persona') {
      options.persona = next;
      i++;
    } else if (arg === '--org') {
      options.org = next;
      i++;
    } else if (arg === '--format') {
      options.format = next;
      i++;
    } else if (arg === '--enforce') {
      // QA-003: Enable enforcement mode
      options.enforce = true;
    } else if (arg === '--warn-only') {
      // QA-003: Explicitly disable enforcement (default behavior)
      options.enforce = false;
    } else if (arg === '--help') {
      console.log('Usage: node persona-kpi-validator.js --dashboard <path> [--persona <name>] [--org <alias>] [--format text|json] [--enforce]');
      console.log('   or: node persona-kpi-validator.js --dashboards-dir <dir> [--org <alias>] [--format text|json] [--enforce]');
      console.log('\nOptions:');
      console.log('  --enforce      Exit with error code on critical violations');
      console.log('  --warn-only    Only warn on issues (default behavior)');
      console.log('\nCritical violations (fail in enforce mode):');
      CRITICAL_VIOLATIONS.forEach(v => console.log(`  - ${v}`));
      process.exit(0);
    }
  }

  if (!options.dashboardPath && !options.dashboardsDir) {
    console.error('❌ Missing required --dashboard or --dashboards-dir argument.');
    process.exit(1);
  }

  const results = [];
  if (options.dashboardPath) {
    const dashboard = loadDashboardFile(options.dashboardPath);
    results.push(validateDashboardPersonaContract(dashboard, options));
  } else {
    const files = collectDashboardFiles(options.dashboardsDir);
    files.forEach(file => {
      try {
        const dashboard = loadDashboardFile(file);
        results.push(validateDashboardPersonaContract(dashboard, options));
      } catch (error) {
        results.push({
          status: 'warn',
          dashboardName: path.basename(file),
          persona: null,
          issues: [{ message: `Failed to parse dashboard: ${error.message}`, isCritical: false }],
          needsConfirmation: ['dashboard-parse']
        });
      }
    });
  }

  if (options.format === 'json') {
    console.log(JSON.stringify(results, null, 2));
  } else {
    results.forEach(result => {
      console.log(formatResult(result, 'text'));
    });
  }

  // QA-003: Exit with error code if enforce mode and critical violations found
  if (options.enforce) {
    const criticalViolations = results.flatMap(r =>
      (r.issues || []).filter(issue =>
        issue.isCritical || CRITICAL_VIOLATIONS.includes(issue.code)
      )
    );

    if (criticalViolations.length > 0) {
      console.error(`\n❌ CRITICAL: ${criticalViolations.length} critical violation(s) found in enforce mode`);
      criticalViolations.forEach((v, i) => {
        console.error(`   ${i + 1}. [${v.code}] ${v.message}`);
      });
      console.error('\nRun with --warn-only to continue with warnings');
      process.exit(1);
    }

    console.log('\n✅ No critical violations found');
  }
}

if (require.main === module) {
  try {
    run();
  } catch (err) {
    console.error(`❌ ${err.message}`);
    process.exit(1);
  }
}

module.exports = {
  loadDashboardFile,
  validateDashboardPersonaContract
};
