#!/usr/bin/env node

/*
 * Generate unified Next-Best-Action outputs from prioritized opportunities.
 * Maintainer-only workflow.
 *
 * Default inputs/outputs:
 * - Input CSV: reports/exec/opspal-gap-priority-matrix.csv
 * - Output JSON: reports/exec/opspal-next-best-actions.json
 * - Output MD: reports/exec/opspal-next-best-actions.md
 * - Approval payloads: reports/exec/approval-payloads/*.json
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const { emitCommandTelemetry } = require('./lib/command-telemetry');

const ROOT = process.cwd();
const DEFAULT_INPUT = path.join(ROOT, 'reports', 'exec', 'opspal-gap-priority-matrix.csv');
const DEFAULT_JSON_OUTPUT = path.join(
  ROOT,
  'reports',
  'exec',
  'opspal-next-best-actions.json'
);
const DEFAULT_MD_OUTPUT = path.join(
  ROOT,
  'reports',
  'exec',
  'opspal-next-best-actions.md'
);
const DEFAULT_PAYLOAD_DIR = path.join(ROOT, 'reports', 'exec', 'approval-payloads');
const DEFAULT_TRIAGE_POLICY_PATH = path.join(
  ROOT,
  'reports',
  'exec',
  'opspal-manual-review-reduction-pack.json'
);
const DEFAULT_TRIAGE_TELEMETRY_FILE = path.join(
  ROOT,
  'state',
  'next-action-triage-telemetry.ndjson'
);

const DEFAULT_TRIAGE_POLICY = Object.freeze({
  auto_route_threshold: 0.85,
  assisted_route_threshold: 0.65,
  manual_review_threshold: 0.64,
  source: 'default',
});

const VALID_TRIAGE_LABELS = ['auto_route', 'assisted_review', 'manual_review'];

function parseArgs(rawArgs) {
  const args = { _: [] };
  for (let i = 0; i < rawArgs.length; i += 1) {
    const token = rawArgs[i];
    if (!token.startsWith('--')) {
      args._.push(token);
      continue;
    }
    const key = token.slice(2);
    const next = rawArgs[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

function resolvePath(filePath) {
  if (!filePath) {
    return null;
  }
  return path.isAbsolute(filePath) ? filePath : path.join(ROOT, filePath);
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeText(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, 'utf8');
}

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function parseCsv(csvText) {
  const rows = csvText
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => line.trim());

  if (rows.length < 2) {
    throw new Error('Input CSV must include header and at least one row.');
  }

  const parseLine = (line) => {
    const out = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      const next = line[i + 1];
      if (char === '"' && inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        out.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    out.push(current);
    return out;
  };

  const header = parseLine(rows[0]);
  const data = rows.slice(1).map(parseLine);
  return { header, data };
}

function csvToObjects(header, rows) {
  return rows.map((cols) => {
    const obj = {};
    for (let i = 0; i < header.length; i += 1) {
      obj[header[i]] = cols[i] == null ? '' : cols[i];
    }
    return obj;
  });
}

function toNumber(value, field) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    throw new Error(`Expected numeric field "${field}", got "${value}"`);
  }
  return num;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function toFixed2(value, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return fallback;
  }
  return Number(num.toFixed(2));
}

function toBoundedFraction(value, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return fallback;
  }
  return Number(clamp(num, 0, 1).toFixed(2));
}

function sourceFingerprint(content) {
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
}

function sanitizeId(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function deriveSourcePlugin(pluginScope) {
  const raw = String(pluginScope || '');
  const candidates = raw
    .split(/[;,]/)
    .map((item) => item.trim())
    .filter(Boolean);
  const plugin = candidates.find((item) => item.startsWith('opspal-'));
  return plugin || 'suite-wide';
}

function deriveRiskClass(row) {
  const impact = row.impact_score;
  const riskReduction = row.risk_reduction_score;
  if (impact >= 5 && riskReduction >= 5) {
    return 'critical';
  }
  if (impact >= 4 && riskReduction >= 4) {
    return 'high';
  }
  if (impact >= 3) {
    return 'medium';
  }
  return 'low';
}

function deriveConfidence(row) {
  const fitBase = {
    yes: 0.85,
    conditional: 0.65,
    no: 0.45,
  };
  const fit = String(row.ninety_day_fit || '').toLowerCase();
  let confidence = fitBase[fit] != null ? fitBase[fit] : 0.6;
  if (row.overall_score >= 4.2) {
    confidence += 0.05;
  } else if (row.overall_score < 3.3) {
    confidence -= 0.05;
  }
  return Number(clamp(confidence, 0.05, 0.99).toFixed(2));
}

function readJsonIfExists(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return null;
  }
  return JSON.parse(readText(filePath));
}

function resolveTriagePolicy(policyPath) {
  const defaults = {
    ...DEFAULT_TRIAGE_POLICY,
    source: policyPath ? path.relative(ROOT, policyPath) : DEFAULT_TRIAGE_POLICY.source,
  };

  const payload = readJsonIfExists(policyPath);
  if (!payload) {
    return defaults;
  }

  const policy =
    payload.triage_policy && typeof payload.triage_policy === 'object'
      ? payload.triage_policy
      : payload;

  let autoRoute = toBoundedFraction(
    policy.auto_route_threshold,
    DEFAULT_TRIAGE_POLICY.auto_route_threshold
  );
  let assisted = toBoundedFraction(
    policy.assisted_route_threshold,
    DEFAULT_TRIAGE_POLICY.assisted_route_threshold
  );
  let manual = toBoundedFraction(
    policy.manual_review_threshold,
    DEFAULT_TRIAGE_POLICY.manual_review_threshold
  );

  if (assisted > autoRoute) {
    autoRoute = assisted;
  }
  if (manual > assisted) {
    manual = assisted;
  }

  return {
    auto_route_threshold: toFixed2(autoRoute, DEFAULT_TRIAGE_POLICY.auto_route_threshold),
    assisted_route_threshold: toFixed2(
      assisted,
      DEFAULT_TRIAGE_POLICY.assisted_route_threshold
    ),
    manual_review_threshold: toFixed2(
      manual,
      DEFAULT_TRIAGE_POLICY.manual_review_threshold
    ),
    source: defaults.source,
  };
}

function deriveTriageLabel(confidence, triagePolicy) {
  if (confidence >= triagePolicy.auto_route_threshold) {
    return 'auto_route';
  }
  if (confidence >= triagePolicy.assisted_route_threshold) {
    return 'assisted_review';
  }
  return 'manual_review';
}

function summarizeTriageDistribution(actions) {
  const counts = Object.fromEntries(VALID_TRIAGE_LABELS.map((label) => [label, 0]));
  for (const action of actions) {
    if (counts[action.triage_label] != null) {
      counts[action.triage_label] += 1;
    }
  }
  const total = actions.length;
  const ratioFor = (value) => (total === 0 ? 0 : toFixed2(value / total, 0));

  return {
    total_actions: total,
    auto_route: counts.auto_route,
    assisted_review: counts.assisted_review,
    manual_review: counts.manual_review,
    auto_route_ratio: ratioFor(counts.auto_route),
    assisted_review_ratio: ratioFor(counts.assisted_review),
    manual_review_ratio: ratioFor(counts.manual_review),
  };
}

function emitShadowTriageTelemetry(input, telemetryFilePath) {
  const payload = {
    timestamp: new Date().toISOString(),
    command: 'next-actions:generate',
    source_fingerprint: input.source_fingerprint,
    source_file: input.source_file,
    triage_shadow_mode: true,
    triage_policy: {
      source: input.triage_policy.source,
      auto_route_threshold: input.triage_policy.auto_route_threshold,
      assisted_route_threshold: input.triage_policy.assisted_route_threshold,
      manual_review_threshold: input.triage_policy.manual_review_threshold,
    },
    triage_distribution: input.triage_distribution,
  };

  ensureDir(path.dirname(telemetryFilePath));
  fs.appendFileSync(telemetryFilePath, `${JSON.stringify(payload)}\n`, 'utf8');
  return path.relative(ROOT, telemetryFilePath);
}

function approvalPolicyForRisk(riskClass) {
  if (riskClass === 'critical') {
    return {
      required_approver_count: 3,
      required_roles: ['domain-owner', 'platform-owner', 'security-owner'],
    };
  }
  if (riskClass === 'high') {
    return {
      required_approver_count: 2,
      required_roles: ['domain-owner', 'platform-owner'],
    };
  }
  return {
    required_approver_count: 1,
    required_roles: ['domain-owner'],
  };
}

function buildAction(row, triagePolicy) {
  const normalized = {
    ...row,
    impact_score: toNumber(row.impact_score, 'impact_score'),
    risk_reduction_score: toNumber(row.risk_reduction_score, 'risk_reduction_score'),
    time_to_value_score: toNumber(row.time_to_value_score, 'time_to_value_score'),
    effort_score: toNumber(row.effort_score, 'effort_score'),
    overall_score: toNumber(row.overall_score, 'overall_score'),
  };

  const riskClass = deriveRiskClass(normalized);
  const confidence = deriveConfidence(normalized);
  const triageLabel = deriveTriageLabel(confidence, triagePolicy);
  const rankScore =
    normalized.impact_score +
    normalized.risk_reduction_score +
    confidence * 5 +
    normalized.time_to_value_score -
    normalized.effort_score;

  const actionId = `nba-${sanitizeId(normalized.id)}`;
  const sourcePlugin = deriveSourcePlugin(normalized.plugin_scope);
  const approvalRequired = riskClass === 'high' || riskClass === 'critical';

  return {
    action_id: actionId,
    source_opportunity_id: normalized.id,
    title: normalized.title,
    category: normalized.category,
    source_plugin: sourcePlugin,
    source_agent: null,
    target_object: `opportunity:${normalized.id}`,
    owner_team: normalized.owner_suggested,
    risk_class: riskClass,
    confidence,
    triage_label: triageLabel,
    triage_shadow_mode: true,
    triage_policy_source: triagePolicy.source,
    rank_score: Number(rankScore.toFixed(2)),
    impact_score: normalized.impact_score,
    risk_reduction_score: normalized.risk_reduction_score,
    time_to_value_score: normalized.time_to_value_score,
    effort_score: normalized.effort_score,
    approval_required: approvalRequired,
    action_summary: normalized.problem_statement,
    expected_impact: {
      impact_index: Number(
        (normalized.impact_score * normalized.risk_reduction_score * confidence).toFixed(2)
      ),
      narrative: normalized.problem_statement,
      evidence: normalized.evidence,
    },
    rollback_plan:
      'Revert to prior recommendation set, close linked approval request, and rerun exec validation gates.',
    artifacts: [
      'reports/exec/opspal-gap-priority-matrix.csv',
      'reports/exec/opspal-capability-vs-ai-maturity.md',
    ],
    approval_payload_path: null,
    submission_status: 'not_submitted',
  };
}

function buildApprovalPayload(action) {
  return {
    title: action.title,
    source_plugin: action.source_plugin,
    source_agent: action.source_agent,
    action_summary: action.action_summary,
    risk_class: action.risk_class,
    confidence_score: action.confidence,
    rollback_plan: action.rollback_plan,
    artifacts: action.artifacts,
    requested_by: 'next-best-action-generator',
    approval_policy: approvalPolicyForRisk(action.risk_class),
  };
}

function submitPayload(payloadPath) {
  const queueScript = path.join(ROOT, 'scripts', 'copilot-approval-queue.js');
  const result = spawnSync('node', [queueScript, 'submit', '--input', payloadPath], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return {
    code: result.status,
    stdout: (result.stdout || '').trim(),
    stderr: (result.stderr || '').trim(),
  };
}

function markdownReport(actions, fingerprint, inputPath, triagePolicy, triageDistribution) {
  const rows = actions
    .map(
      (action, index) =>
        `| ${index + 1} | \`${action.action_id}\` | \`${action.source_opportunity_id}\` | ${action.title.replace(/\|/g, '\\|')} | ${action.risk_class} | ${action.confidence.toFixed(2)} | \`${action.triage_label}\` | ${action.rank_score.toFixed(2)} | ${action.approval_required ? 'yes' : 'no'} | \`${action.owner_team}\` |`
    )
    .join('\n');

  return `# OpsPal Next-Best Actions

Source Fingerprint: \`${fingerprint}\`
Source Input: \`${path.relative(ROOT, inputPath)}\`

## Ranked Actions

| Rank | Action ID | Opportunity | Title | Risk | Confidence | Triage Label | Rank Score | Approval Required | Owner |
|---|---|---|---|---|---:|---|---:|---|---|
${rows}

## Shadow-Mode Triage

- Mode: \`shadow\` (non-blocking; no routing changes).
- Policy source: \`${triagePolicy.source}\`
- Thresholds: auto-route \`>= ${triagePolicy.auto_route_threshold}\`, assisted-review \`>= ${triagePolicy.assisted_route_threshold}\`, manual-review \`< ${triagePolicy.assisted_route_threshold}\`
- Distribution: auto-route \`${triageDistribution.auto_route}\` (${triageDistribution.auto_route_ratio}), assisted-review \`${triageDistribution.assisted_review}\` (${triageDistribution.assisted_review_ratio}), manual-review \`${triageDistribution.manual_review}\` (${triageDistribution.manual_review_ratio})

## Handoff

- Approval payloads are generated in \`reports/exec/approval-payloads/\`.
- Use \`npm run copilot:approval -- submit --input <payload>\` for manual submission.
- Use \`node scripts/generate-next-best-actions.js --submit --top 5\` for bulk submission of top actions requiring approval.
`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const inputPath = resolvePath(args.input || DEFAULT_INPUT);
  const jsonOutputPath = resolvePath(args['output-json'] || DEFAULT_JSON_OUTPUT);
  const mdOutputPath = resolvePath(args['output-md'] || DEFAULT_MD_OUTPUT);
  const payloadDir = resolvePath(args['payload-dir'] || DEFAULT_PAYLOAD_DIR);
  const triagePolicyPath = resolvePath(
    args['triage-policy'] || DEFAULT_TRIAGE_POLICY_PATH
  );
  const triageTelemetryPath = resolvePath(
    args['triage-telemetry'] || DEFAULT_TRIAGE_TELEMETRY_FILE
  );
  const shouldSubmit = Boolean(args.submit);
  const topN = args.top && args.top !== true ? Number(args.top) : null;

  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input CSV not found: ${path.relative(ROOT, inputPath)}`);
  }
  if (topN != null && (!Number.isInteger(topN) || topN <= 0)) {
    throw new Error('--top must be a positive integer.');
  }

  const csvRaw = readText(inputPath);
  const fingerprint = sourceFingerprint(csvRaw);
  const { header, data } = parseCsv(csvRaw);
  const rows = csvToObjects(header, data);
  const triagePolicy = resolveTriagePolicy(triagePolicyPath);
  const actions = rows
    .map((row) => buildAction(row, triagePolicy))
    .sort((a, b) => b.rank_score - a.rank_score || a.action_id.localeCompare(b.action_id));
  const triageDistribution = summarizeTriageDistribution(actions);

  ensureDir(payloadDir);
  for (const action of actions) {
    if (!action.approval_required) {
      continue;
    }
    const payload = buildApprovalPayload(action);
    const payloadPath = path.join(payloadDir, `${action.action_id}.json`);
    writeText(payloadPath, `${JSON.stringify(payload, null, 2)}\n`);
    action.approval_payload_path = path.relative(ROOT, payloadPath);
  }

  if (shouldSubmit) {
    const candidates = actions.filter((action) => action.approval_required);
    const limit = topN == null ? candidates.length : Math.min(topN, candidates.length);
    for (let i = 0; i < limit; i += 1) {
      const action = candidates[i];
      const payloadPath = resolvePath(action.approval_payload_path);
      const result = submitPayload(payloadPath);
      if (result.code === 0) {
        action.submission_status = 'submitted';
      } else {
        action.submission_status = 'submit_failed';
        action.submission_error = result.stderr || result.stdout || 'unknown error';
      }
    }
  }

  const output = {
    generated_at: fingerprint,
    source_fingerprint: fingerprint,
    source_file: path.relative(ROOT, inputPath),
    actions,
  };

  writeText(jsonOutputPath, `${JSON.stringify(output, null, 2)}\n`);
  writeText(
    mdOutputPath,
    markdownReport(actions, fingerprint, inputPath, triagePolicy, triageDistribution)
  );

  let triageTelemetryWritten = true;
  let triageTelemetryFile = path.relative(ROOT, triageTelemetryPath);
  try {
    triageTelemetryFile = emitShadowTriageTelemetry(
      {
        source_fingerprint: fingerprint,
        source_file: path.relative(ROOT, inputPath),
        triage_policy: triagePolicy,
        triage_distribution: triageDistribution,
      },
      triageTelemetryPath
    );
  } catch (error) {
    triageTelemetryWritten = false;
    console.warn(`WARN: triage telemetry emission failed (${error.message})`);
  }

  console.log(`Generated ${path.relative(ROOT, jsonOutputPath)}`);
  console.log(`Generated ${path.relative(ROOT, mdOutputPath)}`);
  console.log(`Generated approval payloads in ${path.relative(ROOT, payloadDir)}`);
  console.log(`Shadow triage telemetry: ${triageTelemetryFile}`);
  console.log(`Actions: ${actions.length}`);
  console.log(`Approval required: ${actions.filter((item) => item.approval_required).length}`);
  let submitted = 0;
  let failed = 0;
  if (shouldSubmit) {
    submitted = actions.filter((item) => item.submission_status === 'submitted').length;
    failed = actions.filter((item) => item.submission_status === 'submit_failed').length;
    console.log(`Submission results: submitted=${submitted}, failed=${failed}`);
  }

  const riskClasses = actions.map((item) => String(item.risk_class || ''));
  const highestRisk = riskClasses.includes('critical')
    ? 'critical'
    : riskClasses.includes('high')
      ? 'high'
      : riskClasses.includes('medium')
        ? 'medium'
        : 'low';

  return {
    actions_total: actions.length,
    approval_required: actions.filter((item) => item.approval_required).length,
    triage_distribution: triageDistribution,
    triage_telemetry_written: triageTelemetryWritten,
    should_submit: shouldSubmit,
    submission_failed: failed,
    highest_risk: highestRisk,
  };
}

const telemetry = {
  command: 'next-actions:generate',
  agent: 'next-best-action-generator',
  source_plugin: 'opspal-core',
  outcome: 'success',
  time_saved_estimate_minutes: 18,
  human_override: false,
  rework_required: false,
};

try {
  const summary = main();
  if (summary && typeof summary === 'object') {
    telemetry.risk_class = summary.highest_risk || 'medium';
    if (summary.triage_distribution) {
      const triage = summary.triage_distribution;
      telemetry.time_saved_estimate_minutes = toFixed2(
        12 + Number(triage.auto_route || 0) * 2 + Number(triage.assisted_review || 0),
        18
      );
    }
    if (summary.should_submit && Number(summary.submission_failed || 0) > 0) {
      telemetry.outcome = 'partial';
      telemetry.rework_required = true;
    }
    if (summary.triage_telemetry_written === false) {
      telemetry.outcome = 'partial';
      telemetry.rework_required = true;
    }
  }
  emitCommandTelemetry(telemetry, { silent: true });
} catch (error) {
  telemetry.outcome = 'failed';
  telemetry.rework_required = true;
  emitCommandTelemetry(telemetry, { silent: true });
  console.error(`ERROR: ${error.message}`);
  process.exit(1);
}
