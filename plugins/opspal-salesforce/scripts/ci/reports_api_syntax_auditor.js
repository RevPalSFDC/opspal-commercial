#!/usr/bin/env node

/**
 * Salesforce Reporting API Syntax Auditor (CI Gate)
 * - Static/lite checks for required capabilities across agents
 * - Emits strict JSON per agent and exits non-zero on blocking failures
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

function read(file) {
  try { return fs.readFileSync(file, 'utf8'); } catch { return ''; }
}

function has(str, patterns) {
  return patterns.every(p => str.includes(p));
}

function auditAgent(agentName) {
  const result = {
    agent: agentName,
    dashboards: { clone: 'fail', patch: 'fail' },
    reports: { create: 'fail', clone: 'fail', patch: 'fail', adhoc_run_fullmeta: 'fail' },
    logic_dates: { boolean_filter: 'fail', relative_dates_persisted: 'fail' },
    syntax: { operators_normalized: 'fail', token_mapping: 'fail' },
    reliability: { retry_429_503: 'fail', adhoc_filter_count_guard: 'fail' },
    notes: [],
    blocking_fixes: []
  };

  // Map agents to files to scan
  const filesByAgent = {
    'sfdc-reports-dashboards': [
      'scripts/lib/reports-rest-api.js',
      'agents/sfdc-reports-dashboards.yaml'
    ],
    'mcp-analytics-tools': [
      'mcp-extensions/tools/analytics-tools.js',
      'scripts/lib/composite-api.js'
    ],
    'validation-first-creator': [
      'scripts/validation-first-creator.js',
      'scripts/lib/reports-rest-api.js'
    ],
    'report-api-diagnostic': [
      'scripts/report-api-diagnostic.js'
    ],
    'dashboard-refresh-system': [
      'scripts/dashboard-refresh-system.js'
    ],
    'sf-reports-cli': [
      'cli/sf-reports-cli.js'
    ],
    'generate_gong_reports': [
      'sfdc-reports-dashboards/scripts/generate_gong_reports.sh'
    ]
  };

  const files = (filesByAgent[agentName] || []).map(f => path.join(ROOT, f));
  const contents = files.map(read).join('\n');

  // Reports create/clone/patch/ad-hoc
  if (contents.match(/\/analytics\/reports[\"'\`]?[ \)]?[,)]?\s*['\"]?POST/)) result.reports.create = 'pass';
  if (contents.includes('/analytics/reports?cloneId=')) result.reports.clone = 'pass';
  if (contents.includes('/analytics/reports/') && contents.includes("'PATCH'")) result.reports.patch = 'pass';
  if (contents.includes('/analytics/reports/') && contents.includes("'POST'")) {
    // Heuristic for full meta: presence of reportFilters + standardDateFilter
    if (contents.includes('reportFilters') && contents.includes('standardDateFilter')) result.reports.adhoc_run_fullmeta = 'pass';
  }

  // Dashboards clone+patch
  if (contents.includes('/analytics/dashboards/') && contents.includes('/clone')) result.dashboards.clone = 'pass';
  if (contents.includes('/analytics/dashboards/') && contents.includes("'PATCH'")) result.dashboards.patch = 'pass';

  // Boolean logic
  if (contents.includes('reportBooleanFilter') && contents.includes('buildBooleanFilter')) result.logic_dates.boolean_filter = 'pass';

  // Relative dates persisted (no convert to absolute)
  if (!contents.toLowerCase().includes('convertrelativetoabsolute')) result.logic_dates.relative_dates_persisted = 'pass';

  // Operators normalized
  if (contents.includes('normalizeOperators') || contents.match(/operator:\s*['\"](equals|notEqual|lessThan)/)) result.syntax.operators_normalized = 'pass';

  // Token mapping
  if (contents.includes('tokenMap(') || contents.match(/standardDateFilter:\s*\{\s*column:\s*['\"][A-Z_]+['\"]/)) result.syntax.token_mapping = 'pass';

  // Retries
  if (contents.includes('withRetries(') || contents.includes('Retry-After')) result.reliability.retry_429_503 = 'pass';

  // ≤ 20 filters guard
  if (contents.includes('Too many ad-hoc filters') || contents.includes('> 20')) result.reliability.adhoc_filter_count_guard = 'pass';

  // Notes
  if (result.dashboards.clone === 'fail' || result.dashboards.patch === 'fail') {
    result.notes.push('Dashboards clone+patch missing');
    result.blocking_fixes.push({ issue: 'dashboards.clone_patch', required_change: 'Implement /analytics/dashboards/{id}/clone and PATCH', example: 'POST clone then PATCH components grid' });
  }
  if (result.logic_dates.boolean_filter === 'fail') {
    result.notes.push('reportBooleanFilter not emitted for multi-filter');
    result.blocking_fixes.push({ issue: 'boolean_filter', required_change: 'Use buildBooleanFilter when filters > 1', example: '"reportBooleanFilter": "1 AND 2"' });
  }
  if (result.logic_dates.relative_dates_persisted === 'fail') {
    result.notes.push('Relative date literals replaced by absolutes');
    result.blocking_fixes.push({ issue: 'relative_dates', required_change: 'Persist durationValue literals for saved reports', example: '"durationValue": "LAST_N_DAYS:30"' });
  }
  if (result.syntax.operators_normalized === 'fail') {
    result.notes.push('Operators not normalized');
    result.blocking_fixes.push({ issue: 'operators', required_change: 'Map to equals/notEqual/...', example: 'normalizeOperators(op)' });
  }
  if (result.reliability.retry_429_503 === 'fail') {
    result.notes.push('No retry/backoff on 429/503');
    result.blocking_fixes.push({ issue: 'retries', required_change: 'Add exponential backoff + jitter honoring Retry-After', example: 'withRetries(fetchFn)' });
  }

  return result;
}

async function main() {
  const agents = [
    'sfdc-reports-dashboards',
    'mcp-analytics-tools',
    'validation-first-creator',
    'report-api-diagnostic',
    'dashboard-refresh-system',
    'sf-reports-cli',
    'generate_gong_reports'
  ];

  const results = agents.map(auditAgent);
  console.log(JSON.stringify(results, null, 2));

  // Fail on blocking failures
  const blockingFail = results.some(r =>
    r.dashboards.clone === 'fail' ||
    r.dashboards.patch === 'fail' ||
    r.logic_dates.boolean_filter === 'fail' ||
    r.logic_dates.relative_dates_persisted === 'fail' ||
    r.syntax.operators_normalized === 'fail' ||
    r.reliability.retry_429_503 === 'fail'
  );

  process.exit(blockingFail ? 1 : 0);
}

if (require.main === module) {
  main().catch(err => { console.error(err); process.exit(1); });
}

