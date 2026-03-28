'use strict';

const fs = require('fs');
const path = require('path');

const { loadConfig } = require('./config-loader');
const { ReflectionCandidateBuffer } = require('./reflection-candidate-buffer');
const {
  createDedupKey,
  nowIso,
  readJson,
  resolveSessionId,
  sanitizeString,
  writeJson
} = require('./utils');

const DEFAULT_LOG_FILE = path.join(process.env.HOME || require('os').homedir(), '.claude', 'logs', 'hook-errors.jsonl');

function parseInteger(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseBoolean(value) {
  if (typeof value === 'boolean') {
    return value;
  }

  const normalized = String(value || '').trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  if (['false', '0', 'no', 'off'].includes(normalized)) {
    return false;
  }
  return null;
}

function extractExitCode(entry) {
  if (entry?.exit_code !== undefined && entry?.exit_code !== null && entry.exit_code !== '') {
    return parseInteger(entry.exit_code, 0);
  }

  const detailsText = String(entry?.details || '');
  const match = detailsText.match(/exit_code\s*=\s*(-?\d+)/i);
  return match ? parseInteger(match[1], 0) : 0;
}

function severityForClassification(classification) {
  switch (classification) {
    case 'circuit_breaker_open':
    case 'recovery_failure':
      return 0.95;
    case 'timeout':
    case 'contract_violation':
      return 0.75;
    default:
      return 0.55;
  }
}

function readNewEntries(logFile, watermarkFile) {
  if (!fs.existsSync(logFile)) {
    return [];
  }

  const watermark = readJson(watermarkFile, { offset: 0 });
  const fileBuffer = fs.readFileSync(logFile);
  let offset = Number(watermark.offset) || 0;

  if (offset > fileBuffer.length) {
    offset = 0;
  }

  const newChunk = fileBuffer.slice(offset).toString('utf8');
  writeJson(watermarkFile, {
    file: logFile,
    offset: fileBuffer.length,
    updated_at: nowIso()
  });

  return newChunk
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      try {
        return JSON.parse(line);
      } catch (error) {
        return null;
      }
    })
    .filter(Boolean);
}

function classifyEntry(entry, existingCount, config) {
  const text = [
    entry.message,
    entry.context,
    entry.details,
    entry.triggering_action,
    entry.stack_trace
  ].filter(Boolean).join(' ').toLowerCase();
  const hookPhase = sanitizeString(entry.hook_phase || 'unknown', 60);
  const exitCode = extractExitCode(entry);
  const retryCount = parseInteger(entry.retry_count, 0);
  const recoverySucceeded = parseBoolean(entry.recovery_succeeded);
  const stackTrace = sanitizeString(entry.stack_trace || '', 200);
  let category = 'issue';
  let priority = 'normal';
  let classification = 'non_zero_exit';

  if (text.includes('circuit breaker') && text.includes('open')) {
    priority = 'immediate';
    classification = 'circuit_breaker_open';
  } else if (recoverySucceeded === false && exitCode !== 0) {
    priority = 'immediate';
    classification = 'recovery_failure';
  } else if (text.includes('contract') && exitCode !== 0) {
    priority = 'high';
    classification = 'contract_violation';
  } else if (text.includes('timeout')) {
    if (!config.hookObserver?.captureTimeouts) {
      return null;
    }
    priority = 'high';
    classification = 'timeout';
  } else if (text.includes('validation')) {
    category = 'lesson';
    classification = 'validation_failure';
    if (retryCount >= 2) {
      priority = 'high';
    }
  } else if (text.includes('malformed')) {
    classification = 'malformed_output';
  } else if (!config.hookObserver?.captureNonZeroExits) {
    return null;
  } else if (existingCount >= 2) {
    priority = 'high';
  }

  return {
    source: 'hook_error',
    category,
    priority,
    captured_at: nowIso(),
    raw: {
      hook: sanitizeString(entry.hook || 'unknown', 80),
      hook_phase: hookPhase,
      triggering_action: sanitizeString(entry.triggering_action || '', 120),
      level: sanitizeString(entry.level || 'error', 40),
      message: sanitizeString(entry.message || '', 160),
      context: sanitizeString(entry.context || '', 120),
      details: sanitizeString(entry.details || '', 160),
      exit_code: exitCode,
      retry_count: retryCount,
      recovery_succeeded: recoverySucceeded,
      stack_trace: stackTrace,
      classification
    },
    confidence: 0.9,
    severity_score: severityForClassification(classification),
    dedup_key: createDedupKey(['hook_error', entry.hook, hookPhase, classification, entry.message])
  };
}

function observeHookErrors(options = {}) {
  const config = options.config || loadConfig();
  const sessionId = resolveSessionId(options.sessionId);
  const watermarkFile = options.watermarkFile || config.paths?.hookErrorWatermark;
  const logFile = options.logFile || DEFAULT_LOG_FILE;
  const entries = readNewEntries(logFile, watermarkFile);

  if (entries.length === 0) {
    return [];
  }

  const buffer = new ReflectionCandidateBuffer({ config, sessionId });
  const existing = buffer.list();
  const hookCounts = {};

  existing
    .filter(candidate => candidate.source === 'hook_error')
    .forEach(candidate => {
      const hookName = candidate.raw?.hook || 'unknown';
      const hookPhase = candidate.raw?.hook_phase || 'unknown';
      const key = `${hookName}:${hookPhase}`;
      hookCounts[key] = (hookCounts[key] || 0) + 1;
    });

  return entries
    .map(entry => {
      const hookName = entry.hook || 'unknown';
      const hookPhase = entry.hook_phase || 'unknown';
      const key = `${hookName}:${hookPhase}`;
      const count = hookCounts[key] || 0;
      const candidate = classifyEntry(entry, count, config);
      hookCounts[key] = count + 1;
      return candidate;
    })
    .filter(Boolean);
}

if (require.main === module) {
  process.stdout.write(`${JSON.stringify(observeHookErrors())}\n`);
}

module.exports = {
  classifyEntry,
  observeHookErrors
};
