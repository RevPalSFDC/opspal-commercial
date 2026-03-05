#!/usr/bin/env node

/*
 * Copilot Approval Queue (maintainer-only).
 *
 * Usage:
 *   node scripts/copilot-approval-queue.js submit --input path/to/request.json
 *   node scripts/copilot-approval-queue.js list [--status pending|approved|rejected|all] [--format table|json]
 *   node scripts/copilot-approval-queue.js show --id <request_id>
 *   node scripts/copilot-approval-queue.js decide --id <request_id> --decision approve|reject --by <name> [--role <role>] [--reason <text>]
 *   node scripts/copilot-approval-queue.js stats
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { emitCommandTelemetry } = require('./lib/command-telemetry');

const ROOT = process.cwd();
const STATE_DIR = path.join(ROOT, 'state');
const QUEUE_FILE = path.join(STATE_DIR, 'copilot-approval-queue.json');
const DECISION_LOG_FILE = path.join(STATE_DIR, 'copilot-approval-decisions.ndjson');

const VALID_RISK_CLASSES = ['low', 'medium', 'high', 'critical'];
const VALID_STATUSES = ['pending', 'approved', 'rejected'];
const VALID_DECISIONS = ['approve', 'reject'];

function printUsageAndExit(code = 0) {
  const lines = [
    'Copilot Approval Queue',
    '',
    'Commands:',
    '  submit --input <file.json>',
    '  list [--status pending|approved|rejected|all] [--format table|json]',
    '  show --id <request_id>',
    '  decide --id <request_id> --decision approve|reject --by <name> [--role <role>] [--reason <text>]',
    '  stats',
  ];
  console.log(lines.join('\n'));
  process.exit(code);
}

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

function ensureStateFiles() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  if (!fs.existsSync(QUEUE_FILE)) {
    fs.writeFileSync(QUEUE_FILE, `${JSON.stringify({ requests: [] }, null, 2)}\n`, 'utf8');
  }
  if (!fs.existsSync(DECISION_LOG_FILE)) {
    fs.writeFileSync(DECISION_LOG_FILE, '', 'utf8');
  }
}

function readQueue() {
  ensureStateFiles();
  const raw = fs.readFileSync(QUEUE_FILE, 'utf8');
  const parsed = JSON.parse(raw);
  if (!parsed.requests || !Array.isArray(parsed.requests)) {
    throw new Error('Invalid queue file format: expected { "requests": [] }.');
  }
  return parsed;
}

function writeQueue(queue) {
  fs.writeFileSync(QUEUE_FILE, `${JSON.stringify(queue, null, 2)}\n`, 'utf8');
}

function appendDecisionLog(entry) {
  fs.appendFileSync(DECISION_LOG_FILE, `${JSON.stringify(entry)}\n`, 'utf8');
}

function toIsoNow() {
  return new Date().toISOString();
}

function defaultApprovalPolicy(riskClass) {
  switch (riskClass) {
    case 'low':
      return { required_approver_count: 1, required_roles: ['domain-owner'] };
    case 'medium':
      return { required_approver_count: 1, required_roles: ['domain-owner'] };
    case 'high':
      return {
        required_approver_count: 2,
        required_roles: ['domain-owner', 'platform-owner'],
      };
    case 'critical':
      return {
        required_approver_count: 3,
        required_roles: ['domain-owner', 'platform-owner', 'security-owner'],
      };
    default:
      return { required_approver_count: 1, required_roles: ['domain-owner'] };
  }
}

function createRequestId() {
  return `apr-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
}

function parseNumber(value, field) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    throw new Error(`Field "${field}" must be numeric.`);
  }
  return num;
}

function validateSubmitPayload(payload) {
  const required = [
    'title',
    'source_plugin',
    'action_summary',
    'risk_class',
    'confidence_score',
    'requested_by',
  ];
  for (const field of required) {
    if (!payload[field]) {
      throw new Error(`Missing required field: ${field}`);
    }
  }
  if (!VALID_RISK_CLASSES.includes(String(payload.risk_class))) {
    throw new Error(
      `Invalid risk_class "${payload.risk_class}". Expected one of: ${VALID_RISK_CLASSES.join(', ')}`
    );
  }
  const confidence = parseNumber(payload.confidence_score, 'confidence_score');
  if (confidence < 0 || confidence > 1) {
    throw new Error('Field "confidence_score" must be between 0 and 1.');
  }
}

function renderTable(items) {
  if (items.length === 0) {
    console.log('No requests found.');
    return;
  }
  const header = ['request_id', 'status', 'risk', 'approvals', 'required', 'title'];
  const widths = header.map((h) => h.length);
  const rows = items.map((item) => {
    const approvals = item.approvals ? item.approvals.length : 0;
    const required =
      item.approval_policy && item.approval_policy.required_approver_count
        ? item.approval_policy.required_approver_count
        : 1;
    return [
      String(item.request_id),
      String(item.status),
      String(item.risk_class),
      String(approvals),
      String(required),
      String(item.title),
    ];
  });

  for (const row of rows) {
    row.forEach((value, idx) => {
      widths[idx] = Math.max(widths[idx], value.length);
    });
  }

  const joinRow = (cols) =>
    cols
      .map((col, idx) => col.padEnd(widths[idx], ' '))
      .join(' | ');

  console.log(joinRow(header));
  console.log(widths.map((w) => '-'.repeat(w)).join('-+-'));
  for (const row of rows) {
    console.log(joinRow(row));
  }
}

function commandSubmit(args) {
  const input = args.input;
  if (!input || input === true) {
    throw new Error('submit requires --input <file.json>');
  }
  const inputPath = path.isAbsolute(input) ? input : path.join(ROOT, input);
  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input file not found: ${input}`);
  }
  const payload = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  validateSubmitPayload(payload);

  const queue = readQueue();
  const policy = payload.approval_policy || defaultApprovalPolicy(payload.risk_class);

  const request = {
    request_id: payload.request_id || createRequestId(),
    created_at: toIsoNow(),
    updated_at: toIsoNow(),
    status: 'pending',
    title: payload.title,
    source_plugin: payload.source_plugin,
    source_agent: payload.source_agent || null,
    action_summary: payload.action_summary,
    risk_class: payload.risk_class,
    confidence_score: Number(payload.confidence_score),
    rollback_plan: payload.rollback_plan || null,
    artifacts: Array.isArray(payload.artifacts) ? payload.artifacts : [],
    requested_by: payload.requested_by,
    approver_notes: payload.approver_notes || null,
    approval_policy: {
      required_approver_count: Number(policy.required_approver_count || 1),
      required_roles: Array.isArray(policy.required_roles)
        ? policy.required_roles
        : ['domain-owner'],
    },
    approvals: [],
    rejection: null,
  };

  if (
    queue.requests.find((item) => item.request_id === request.request_id)
  ) {
    throw new Error(`Request ID already exists: ${request.request_id}`);
  }

  queue.requests.push(request);
  writeQueue(queue);

  appendDecisionLog({
    event: 'submit',
    request_id: request.request_id,
    at: request.created_at,
    by: request.requested_by,
    status: request.status,
    risk_class: request.risk_class,
  });

  console.log(`Submitted request ${request.request_id}`);
  console.log(
    `Policy: ${request.approval_policy.required_approver_count} approver(s), roles=${request.approval_policy.required_roles.join(', ')}`
  );
  return {
    risk_class: request.risk_class,
    time_saved_estimate_minutes: 10,
    human_override: false,
    rework_required: false,
  };
}

function commandList(args) {
  const status = args.status && args.status !== true ? args.status : 'pending';
  const format = args.format && args.format !== true ? args.format : 'table';
  if (status !== 'all' && !VALID_STATUSES.includes(status)) {
    throw new Error(
      `Invalid status "${status}". Expected pending|approved|rejected|all.`
    );
  }
  if (!['table', 'json'].includes(format)) {
    throw new Error(`Invalid format "${format}". Expected table|json.`);
  }

  const queue = readQueue();
  const filtered =
    status === 'all'
      ? queue.requests
      : queue.requests.filter((item) => item.status === status);

  if (format === 'json') {
    console.log(JSON.stringify(filtered, null, 2));
    return {
      time_saved_estimate_minutes: 2,
      human_override: false,
      rework_required: false,
    };
  }
  renderTable(filtered);
  return {
    time_saved_estimate_minutes: 2,
    human_override: false,
    rework_required: false,
  };
}

function commandShow(args) {
  const id = args.id;
  if (!id || id === true) {
    throw new Error('show requires --id <request_id>');
  }
  const queue = readQueue();
  const found = queue.requests.find((item) => item.request_id === id);
  if (!found) {
    throw new Error(`Request not found: ${id}`);
  }
  console.log(JSON.stringify(found, null, 2));
  return {
    risk_class: found.risk_class || null,
    time_saved_estimate_minutes: 2,
    human_override: false,
    rework_required: false,
  };
}

function commandDecide(args) {
  const id = args.id;
  const decision = args.decision;
  const by = args.by;
  const role = args.role && args.role !== true ? args.role : 'domain-owner';
  const reason = args.reason && args.reason !== true ? args.reason : '';

  if (!id || id === true) {
    throw new Error('decide requires --id <request_id>');
  }
  if (!decision || decision === true || !VALID_DECISIONS.includes(decision)) {
    throw new Error('decide requires --decision approve|reject');
  }
  if (!by || by === true) {
    throw new Error('decide requires --by <name>');
  }

  const queue = readQueue();
  const found = queue.requests.find((item) => item.request_id === id);
  if (!found) {
    throw new Error(`Request not found: ${id}`);
  }
  if (found.status !== 'pending') {
    throw new Error(`Request ${id} is already ${found.status}.`);
  }

  const now = toIsoNow();
  if (decision === 'reject') {
    found.status = 'rejected';
    found.updated_at = now;
    found.rejection = {
      by,
      role,
      reason: reason || 'No reason provided',
      at: now,
    };
    appendDecisionLog({
      event: 'reject',
      request_id: id,
      at: now,
      by,
      role,
      reason: reason || 'No reason provided',
      resulting_status: found.status,
    });
    writeQueue(queue);
    console.log(`Rejected request ${id}`);
    return {
      risk_class: found.risk_class || null,
      time_saved_estimate_minutes: 6,
      human_override: true,
      rework_required: false,
      outcome: 'success',
    };
  }

  if (found.approvals.find((entry) => entry.by === by)) {
    throw new Error(`Approver "${by}" already approved request ${id}.`);
  }

  found.approvals.push({
    by,
    role,
    reason: reason || '',
    at: now,
  });

  const required = Number(
    (found.approval_policy && found.approval_policy.required_approver_count) || 1
  );
  if (found.approvals.length >= required) {
    found.status = 'approved';
  }
  found.updated_at = now;

  appendDecisionLog({
    event: 'approve',
    request_id: id,
    at: now,
    by,
    role,
    reason: reason || '',
    approvals_count: found.approvals.length,
    required_approvals: required,
    resulting_status: found.status,
  });
  writeQueue(queue);

  if (found.status === 'approved') {
    console.log(`Approved request ${id} (${found.approvals.length}/${required})`);
  } else {
    console.log(
      `Recorded approval for ${id} (${found.approvals.length}/${required}); request remains pending.`
    );
  }
  return {
    risk_class: found.risk_class || null,
    time_saved_estimate_minutes: 6,
    human_override: true,
    rework_required: found.status !== 'approved',
    outcome: found.status === 'approved' ? 'success' : 'partial',
  };
}

function commandStats() {
  const queue = readQueue();
  const totals = {
    pending: 0,
    approved: 0,
    rejected: 0,
  };
  for (const item of queue.requests) {
    if (totals[item.status] != null) {
      totals[item.status] += 1;
    }
  }
  const out = {
    generated_at: toIsoNow(),
    total_requests: queue.requests.length,
    pending: totals.pending,
    approved: totals.approved,
    rejected: totals.rejected,
  };
  console.log(JSON.stringify(out, null, 2));
  return {
    time_saved_estimate_minutes: 2,
    human_override: false,
    rework_required: false,
  };
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv[0] === '--help' || argv[0] === '-h') {
    printUsageAndExit(0);
  }

  const command = argv[0];
  const args = parseArgs(argv.slice(1));
  const telemetry = {
    command: `copilot:approval:${command}`,
    agent: 'copilot-approval-queue',
    source_plugin: 'opspal-core',
    outcome: 'success',
    time_saved_estimate_minutes: 2,
    human_override: command === 'decide',
    rework_required: false,
  };

  try {
    let commandTelemetry = null;
    switch (command) {
      case 'submit':
        commandTelemetry = commandSubmit(args);
        break;
      case 'list':
        commandTelemetry = commandList(args);
        break;
      case 'show':
        commandTelemetry = commandShow(args);
        break;
      case 'decide':
        commandTelemetry = commandDecide(args);
        break;
      case 'stats':
        commandTelemetry = commandStats();
        break;
      default:
        printUsageAndExit(1);
    }
    if (commandTelemetry && typeof commandTelemetry === 'object') {
      Object.assign(telemetry, commandTelemetry);
    }
    emitCommandTelemetry(telemetry, { silent: true });
  } catch (error) {
    telemetry.outcome = 'failed';
    telemetry.rework_required = true;
    emitCommandTelemetry(telemetry, { silent: true });
    console.error(`ERROR: ${error.message}`);
    process.exit(1);
  }
}

main();
