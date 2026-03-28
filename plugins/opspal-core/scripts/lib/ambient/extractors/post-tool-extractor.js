'use strict';

const fs = require('fs');
const path = require('path');

const { loadConfig } = require('../config-loader');
const {
  AMBIENT_DIR,
  createDedupKey,
  nowIso,
  readJson,
  readStdin,
  sanitizeString,
  sanitizeValue
} = require('../utils');

const RECENT_EDIT_STATE_FILE = path.join(AMBIENT_DIR, '.recent-file-edits.json');
const CONSULTATION_ERROR_STATE_FILE = path.join(process.env.HOME || require('os').homedir(), '.claude', 'consultation-error-state.json');
const TOOL_RECOVERY_STATE_FILE = path.join(AMBIENT_DIR, '.tool-recovery-state.json');

function normalizeResultText(payload) {
  const candidates = [
    payload?.error,
    payload?.stderr,
    payload?.tool_error,
    payload?.tool_result,
    payload?.result
  ];

  return candidates
    .map(value => {
      if (typeof value === 'string') {
        return value;
      }
      if (value && typeof value === 'object') {
        return JSON.stringify(value);
      }
      return '';
    })
    .filter(Boolean)
    .join(' ');
}

function createCandidate(category, priority, raw, taxonomy = null, extras = {}) {
  return {
    source: 'post_tool_use',
    category,
    priority,
    taxonomy,
    captured_at: nowIso(),
    raw,
    ...extras,
    dedup_key: createDedupKey(['post_tool_use', category, raw])
  };
}

function buildImpactPath(payload) {
  return sanitizeString(
    payload?.tool_input?.file_path ||
    payload?.tool_input?.path ||
    payload?.tool_input?.command ||
    payload?.tool_input?.query ||
    '',
    160
  ) || null;
}

function classifyResultStatus(resultText) {
  if (!resultText || !resultText.trim()) {
    return 'unknown';
  }

  if (/\b(error|failed|exception|timeout|not found|permission denied|invalid|enoent)\b/i.test(resultText)) {
    return 'error';
  }

  return 'success';
}

function buildToolStateKey(payload, toolName) {
  return [
    toolName,
    payload?.tool_input?.file_path,
    payload?.tool_input?.path,
    payload?.tool_input?.command
  ].filter(Boolean).join('|');
}

function loadRecentEditState() {
  return readJson(RECENT_EDIT_STATE_FILE, {});
}

function saveRecentEditState(state) {
  fs.mkdirSync(path.dirname(RECENT_EDIT_STATE_FILE), { recursive: true });
  fs.writeFileSync(RECENT_EDIT_STATE_FILE, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

function loadToolRecoveryState() {
  return readJson(TOOL_RECOVERY_STATE_FILE, {});
}

function saveToolRecoveryState(state) {
  fs.mkdirSync(path.dirname(TOOL_RECOVERY_STATE_FILE), { recursive: true });
  fs.writeFileSync(TOOL_RECOVERY_STATE_FILE, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

function detectReEdit(payload) {
  const toolName = payload?.tool_name || payload?.toolName;
  if (!['Edit', 'Write'].includes(toolName)) {
    return null;
  }

  const filePath = payload?.tool_input?.file_path || payload?.tool_input?.path || '';
  if (!filePath) {
    return null;
  }

  const state = loadRecentEditState();
  const now = Date.now();
  const previous = state[filePath];
  state[filePath] = {
    last_tool: toolName,
    last_seen_at: new Date(now).toISOString()
  };
  saveRecentEditState(state);

  if (!previous) {
    return null;
  }

  const previousTime = Date.parse(previous.last_seen_at);
  if (!Number.isFinite(previousTime) || now - previousTime > 60000) {
    return null;
  }

  return createCandidate('lesson', 'normal', {
    tool: toolName,
    path: sanitizeString(filePath, 160),
    note: 'Same file was re-edited within 60 seconds.',
    previous_tool: previous.last_tool || 'unknown'
  }, 'workflow-gap');
}

function detectRetrySignal(config) {
  const state = readJson(CONSULTATION_ERROR_STATE_FILE, null);
  if (!state || !Number.isFinite(Number(state.retryCount)) || Number(state.retryCount) < 1) {
    return null;
  }

  const retryCount = Number(state.retryCount);
  const priority = retryCount >= (config.buffer?.priorityImmediateThresholds?.retries || 4) ? 'immediate' : 'high';

  return createCandidate('workflow_gap', priority, {
    tool: 'Bash',
    retry_count: retryCount,
    error_count: Number(state.errorCount) || 0,
    last_tool: sanitizeString(state.lastTool || 'Bash', 120),
    note: 'Bash retry loop detected from consultation error state.'
  }, 'workflow-gap');
}

function detectRecoveredError(payload, toolName, resultText) {
  const currentStatus = classifyResultStatus(resultText);
  if (currentStatus === 'unknown') {
    return null;
  }

  const state = loadToolRecoveryState();
  const toolKey = buildToolStateKey(payload, toolName) || toolName;
  const previous = state[toolKey];
  const now = Date.now();

  state[toolKey] = {
    last_status: currentStatus,
    last_seen_at: new Date(now).toISOString(),
    last_error_excerpt: currentStatus === 'error'
      ? sanitizeString(resultText, 160)
      : previous?.last_error_excerpt || null
  };
  saveToolRecoveryState(state);

  if (!previous || currentStatus !== 'success' || previous.last_status !== 'error') {
    return null;
  }

  const previousTime = Date.parse(previous.last_seen_at);
  if (!Number.isFinite(previousTime) || now - previousTime > (5 * 60 * 1000)) {
    return null;
  }

  return createCandidate('lesson', 'normal', {
    tool: sanitizeString(toolName, 80),
    note: 'Tool recovered after a prior error within 5 minutes.',
    prior_error: previous.last_error_excerpt || 'Previous tool error recorded.'
  }, 'lesson-learned', {
    confidence: 0.8,
    impact_path: buildImpactPath(payload),
    severity_score: 0.45
  });
}

function detectEdgeCaseDiscovery(payload, resultText) {
  if (!/\b(unexpected|edge case|corner case|anomaly|anomalous|rare case)\b/i.test(resultText)) {
    return null;
  }

  return createCandidate('lesson', 'normal', {
    tool: sanitizeString(payload?.tool_name || payload?.toolName || 'unknown', 80),
    note: 'Tool output suggests an unexpected edge case or anomaly.',
    result_excerpt: sanitizeString(resultText, 160)
  }, 'lesson-learned', {
    confidence: 0.7,
    novelty_score: 0.7,
    impact_path: buildImpactPath(payload)
  });
}

function extractCandidates(payload, options = {}) {
  const config = options.config || loadConfig();
  const candidates = [];
  const toolName = payload?.tool_name || payload?.toolName || 'unknown';
  const resultText = normalizeResultText(payload);

  if (/\b(error|failed|exception|timeout|not found|permission denied|invalid|enoent)\b/i.test(resultText)) {
    const priority = /\btimeout\b/i.test(resultText) ? 'high' : 'normal';
    candidates.push(createCandidate('issue', priority, {
      tool: sanitizeString(toolName, 80),
      result_excerpt: sanitizeString(resultText, 160),
      status: 'error'
    }, null, {
      confidence: priority === 'high' ? 0.85 : 0.75,
      severity_score: priority === 'high' ? 0.75 : 0.55,
      impact_path: buildImpactPath(payload)
    }));
  }

  const reEditCandidate = detectReEdit(payload);
  if (reEditCandidate) {
    candidates.push(reEditCandidate);
  }

  const recoveredErrorCandidate = detectRecoveredError(payload, toolName, resultText);
  if (recoveredErrorCandidate) {
    candidates.push(recoveredErrorCandidate);
  }

  const edgeCaseCandidate = detectEdgeCaseDiscovery(payload, resultText);
  if (edgeCaseCandidate) {
    candidates.push(edgeCaseCandidate);
  }

  if (toolName === 'Bash') {
    const retryCandidate = detectRetrySignal(config);
    if (retryCandidate) {
      candidates.push(retryCandidate);
    }
  }

  return candidates.map(candidate => ({
    ...candidate,
    raw: sanitizeValue(candidate.raw, config.sanitization?.maxFieldLength || 200)
  }));
}

if (require.main === module) {
  const payload = JSON.parse(readStdin() || '{}');
  process.stdout.write(`${JSON.stringify(extractCandidates(payload))}\n`);
}

module.exports = {
  extractCandidates
};
