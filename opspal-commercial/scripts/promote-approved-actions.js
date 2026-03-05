#!/usr/bin/env node

/*
 * Promote approved copilot queue requests into execution-ready work-item exports.
 *
 * Safe-by-default behavior:
 * - Read-only against queue state
 * - No queue mutation
 * - No external system writes
 *
 * Usage:
 *   node scripts/promote-approved-actions.js
 *   node scripts/promote-approved-actions.js --dry-run
 *   node scripts/promote-approved-actions.js --status approved --top 10
 *   node scripts/promote-approved-actions.js --output-dir reports/exec/runtime
 */

const fs = require('fs');
const path = require('path');
const { emitCommandTelemetry } = require('./lib/command-telemetry');

const ROOT = process.cwd();
const QUEUE_PATH = path.join(ROOT, 'state', 'copilot-approval-queue.json');
const CATALOG_PATH = path.join(ROOT, 'docs', 'PLUGIN_SUITE_CATALOG.json');
const DEFAULT_OUTPUT_DIR = path.join(ROOT, 'reports', 'exec', 'runtime');

const VALID_STATUSES = ['pending', 'approved', 'rejected', 'all'];

function parseArgs(raw) {
  const args = { _: [] };
  for (let i = 0; i < raw.length; i += 1) {
    const token = raw[i];
    if (!token.startsWith('--')) {
      args._.push(token);
      continue;
    }
    const key = token.slice(2);
    const next = raw[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

function usage(code = 0) {
  console.log(
    [
      'Promote Approved Actions',
      '',
      'Options:',
      '  --status approved|pending|rejected|all   Filter source queue status (default: approved)',
      '  --top <n>                                Limit number of exported work items',
      '  --output-dir <path>                      Export directory (default: reports/exec/runtime)',
      '  --dry-run                                Print summary only, do not write files',
      '  --help                                   Show this help',
    ].join('\n')
  );
  process.exit(code);
}

function resolvePath(p) {
  if (!p) {
    return null;
  }
  return path.isAbsolute(p) ? p : path.join(ROOT, p);
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeText(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, 'utf8');
}

function mapPriority(riskClass) {
  if (riskClass === 'critical') {
    return 'P0';
  }
  if (riskClass === 'high') {
    return 'P1';
  }
  if (riskClass === 'medium') {
    return 'P2';
  }
  return 'P3';
}

function sanitizeTitle(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function ownerLookup(catalog) {
  const map = {};
  for (const plugin of catalog.plugins || []) {
    map[plugin.name] = plugin.owner || 'unassigned';
  }
  return map;
}

function normalizePluginScope(value) {
  return String(value || '')
    .replace(/\s+\(.*\)\s*$/, '')
    .trim();
}

function resolveOwnerTeam(sourcePlugin, ownerByPlugin) {
  const normalized = normalizePluginScope(sourcePlugin);
  if (ownerByPlugin[normalized]) {
    return ownerByPlugin[normalized];
  }

  // Suite-level initiatives default to platform ownership.
  if (normalized === 'suite-wide') {
    return 'revpal-platform';
  }

  const scopedPlugins = normalized
    .split(';')
    .map((part) => normalizePluginScope(part))
    .filter(Boolean);
  if (scopedPlugins.length > 1) {
    const owners = new Set(
      scopedPlugins.map((pluginName) => ownerByPlugin[pluginName]).filter(Boolean)
    );
    if (owners.size === 1) {
      return Array.from(owners)[0];
    }
    if (owners.size > 1) {
      return 'revpal-platform';
    }
  }

  return 'unassigned';
}

function buildAcceptanceCriteria(request) {
  const criteria = [
    'Execution plan reviewed by owning team.',
    'Preflight checks pass for impacted systems.',
    'Rollback plan documented and verified.',
    'Post-change validation evidence captured.',
  ];
  if (request.risk_class === 'high' || request.risk_class === 'critical') {
    criteria.push('Required high-risk approvals archived with execution notes.');
  }
  return criteria;
}

function buildWorkItem(request, ownerByPlugin) {
  const approvals = Array.isArray(request.approvals) ? request.approvals : [];
  const approverNames = approvals.map((entry) => entry.by).filter(Boolean);
  const ownerTeam = resolveOwnerTeam(request.source_plugin, ownerByPlugin);

  return {
    work_item_id: `wi-${request.request_id}`,
    source_request_id: request.request_id,
    title: sanitizeTitle(request.title),
    source_plugin: request.source_plugin || 'unknown',
    source_agent: request.source_agent || null,
    owner_team: ownerTeam,
    priority: mapPriority(request.risk_class),
    risk_class: request.risk_class || 'medium',
    confidence_score: request.confidence_score == null ? null : Number(request.confidence_score),
    approval_count: approvals.length,
    approvers: approverNames,
    ready_state: request.status === 'approved' ? 'ready' : 'blocked',
    action_summary: request.action_summary || '',
    rollback_plan: request.rollback_plan || 'Not provided',
    artifacts: Array.isArray(request.artifacts) ? request.artifacts : [],
    acceptance_criteria: buildAcceptanceCriteria(request),
    created_at: request.created_at || null,
    updated_at: request.updated_at || null,
  };
}

function markdownReport(items, statusFilter) {
  const rows = items
    .map(
      (item, idx) =>
        `| ${idx + 1} | \`${item.work_item_id}\` | ${item.title.replace(/\|/g, '\\|')} | ${item.priority} | ${item.risk_class} | \`${item.owner_team}\` | ${item.ready_state} |`
    )
    .join('\n');

  const detailBlocks = items
    .map((item) => {
      return [
        `### ${item.work_item_id} - ${item.title}`,
        `- Source request: \`${item.source_request_id}\``,
        `- Plugin: \`${item.source_plugin}\``,
        `- Owner team: \`${item.owner_team}\``,
        `- Priority: \`${item.priority}\``,
        `- Risk class: \`${item.risk_class}\``,
        `- Ready state: \`${item.ready_state}\``,
        `- Approvers: ${item.approvers.length > 0 ? item.approvers.join(', ') : 'none'}`,
        `- Action summary: ${item.action_summary}`,
        `- Rollback plan: ${item.rollback_plan}`,
        `- Artifacts: ${item.artifacts.length > 0 ? item.artifacts.join(', ') : 'none'}`,
        '- Acceptance criteria:',
        ...item.acceptance_criteria.map((criterion) => `  - ${criterion}`),
      ].join('\n');
    })
    .join('\n\n');

  return `# Promoted Work Items

Status Filter: \`${statusFilter}\`
Generated Count: ${items.length}

## Summary

| Rank | Work Item | Title | Priority | Risk | Owner | Ready |
|---|---|---|---|---|---|---|
${rows || '| - | - | No items found | - | - | - | - |'}

## Work Item Details

${detailBlocks || 'No work items found for the selected filter.'}
`;
}

function csvEscape(value) {
  const text = String(value == null ? '' : value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function csvReport(items) {
  const header = [
    'work_item_id',
    'source_request_id',
    'title',
    'priority',
    'risk_class',
    'owner_team',
    'source_plugin',
    'source_agent',
    'approval_count',
    'ready_state',
    'action_summary',
    'rollback_plan',
    'artifacts',
    'approvers',
  ];
  const lines = [header.join(',')];
  for (const item of items) {
    const row = [
      item.work_item_id,
      item.source_request_id,
      item.title,
      item.priority,
      item.risk_class,
      item.owner_team,
      item.source_plugin,
      item.source_agent || '',
      item.approval_count,
      item.ready_state,
      item.action_summary,
      item.rollback_plan,
      item.artifacts.join(';'),
      item.approvers.join(';'),
    ];
    lines.push(row.map(csvEscape).join(','));
  }
  return `${lines.join('\n')}\n`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage(0);
  }

  const status = args.status && args.status !== true ? args.status : 'approved';
  if (!VALID_STATUSES.includes(status)) {
    throw new Error(
      `Invalid --status value "${status}". Use one of: ${VALID_STATUSES.join(', ')}`
    );
  }

  const topN = args.top && args.top !== true ? Number(args.top) : null;
  if (topN != null && (!Number.isInteger(topN) || topN <= 0)) {
    throw new Error('--top must be a positive integer.');
  }

  const dryRun = Boolean(args['dry-run']);
  const outputDir = resolvePath(args['output-dir'] || DEFAULT_OUTPUT_DIR);

  if (!fs.existsSync(QUEUE_PATH)) {
    throw new Error(`Queue state not found at ${path.relative(ROOT, QUEUE_PATH)}`);
  }
  if (!fs.existsSync(CATALOG_PATH)) {
    throw new Error(`Catalog not found at ${path.relative(ROOT, CATALOG_PATH)}`);
  }

  const queue = readJson(QUEUE_PATH);
  const catalog = readJson(CATALOG_PATH);
  const ownerByPlugin = ownerLookup(catalog);

  const requests = Array.isArray(queue.requests) ? queue.requests : [];
  const filtered = requests.filter((request) =>
    status === 'all' ? true : request.status === status
  );

  const sorted = filtered.sort((a, b) => {
    const aTime = Date.parse(a.updated_at || a.created_at || 0);
    const bTime = Date.parse(b.updated_at || b.created_at || 0);
    return bTime - aTime;
  });

  const limited = topN == null ? sorted : sorted.slice(0, topN);
  const items = limited.map((request) => buildWorkItem(request, ownerByPlugin));

  console.log(`Queue requests scanned: ${requests.length}`);
  console.log(`Selected requests (${status}): ${items.length}`);

  if (dryRun) {
    for (const item of items) {
      console.log(
        `- ${item.work_item_id} | ${item.priority} | ${item.ready_state} | ${item.title}`
      );
    }
    console.log('Dry run complete (no files written).');
    const highestRiskDryRun = items.some((item) => item.risk_class === 'critical')
      ? 'critical'
      : items.some((item) => item.risk_class === 'high')
        ? 'high'
        : items.some((item) => item.risk_class === 'medium')
          ? 'medium'
          : 'low';
    return {
      selected_items: items.length,
      dry_run: true,
      highest_risk: highestRiskDryRun,
    };
  }

  ensureDir(outputDir);
  const jsonPath = path.join(outputDir, 'opspal-approved-work-items.json');
  const mdPath = path.join(outputDir, 'opspal-approved-work-items.md');
  const csvPath = path.join(outputDir, 'opspal-approved-work-items.csv');

  const jsonOut = {
    generated_at: new Date().toISOString(),
    status_filter: status,
    total_items: items.length,
    items,
  };

  writeText(jsonPath, `${JSON.stringify(jsonOut, null, 2)}\n`);
  writeText(mdPath, markdownReport(items, status));
  writeText(csvPath, csvReport(items));

  console.log(`Wrote ${path.relative(ROOT, jsonPath)}`);
  console.log(`Wrote ${path.relative(ROOT, mdPath)}`);
  console.log(`Wrote ${path.relative(ROOT, csvPath)}`);

  const highestRisk = items.some((item) => item.risk_class === 'critical')
    ? 'critical'
    : items.some((item) => item.risk_class === 'high')
      ? 'high'
      : items.some((item) => item.risk_class === 'medium')
        ? 'medium'
        : 'low';

  return {
    selected_items: items.length,
    dry_run: false,
    highest_risk: highestRisk,
  };
}

const telemetry = {
  command: 'next-actions:promote',
  agent: 'approved-action-promoter',
  source_plugin: 'opspal-core',
  outcome: 'success',
  time_saved_estimate_minutes: 10,
  human_override: false,
  rework_required: false,
};

try {
  const summary = main();
  if (summary && typeof summary === 'object') {
    telemetry.risk_class = summary.highest_risk || 'medium';
    telemetry.time_saved_estimate_minutes = summary.dry_run ? 4 : 10;
  }
  emitCommandTelemetry(telemetry, { silent: true });
} catch (error) {
  telemetry.outcome = 'failed';
  telemetry.rework_required = true;
  emitCommandTelemetry(telemetry, { silent: true });
  console.error(`ERROR: ${error.message}`);
  process.exit(1);
}
