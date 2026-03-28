'use strict';

const fs = require('fs');
const path = require('path');

const { loadConfig } = require('./config-loader');
const {
  ensureDir,
  nowIso,
  readJson,
  readJsonl,
  resolveSessionId,
  writeJson
} = require('./utils');

function telemetryFilePath(config) {
  return path.join(config.paths?.ambientDir, 'ambient-telemetry.json');
}

function createEmptyTelemetry(sessionId) {
  return {
    session_id: sessionId,
    started_at: nowIso(),
    updated_at: nowIso(),
    candidates_captured: 0,
    candidates_by_source: {},
    candidates_by_priority: { normal: 0, high: 0, immediate: 0 },
    compilations_produced: 0,
    submissions_attempted: 0,
    submissions_accepted: 0,
    submissions_rejected: 0,
    submissions_queued_for_retry: 0,
    dedupe_merges: 0,
    dedupe_suppressions: 0,
    skill_candidates_surfaced: 0,
    shadow_payloads_written: 0,
    retry_queue_depth: 0,
    flush_count: 0,
    flush_reasons: {},
    hook_errors_captured: 0,
    hook_errors_immediate: 0,
    crash_safe_writes: 0,
    crash_safe_replays: 0
  };
}

function loadTelemetry(config, sessionId) {
  const filePath = telemetryFilePath(config);
  const existing = readJson(filePath, null);

  if (existing && existing.session_id === sessionId) {
    return existing;
  }

  return createEmptyTelemetry(sessionId);
}

function saveTelemetry(telemetry, config) {
  try {
    const filePath = telemetryFilePath(config);
    ensureDir(path.dirname(filePath));
    telemetry.updated_at = nowIso();
    writeJson(filePath, telemetry);
  } catch (error) {
    // Telemetry persistence is best-effort.
  }
}

function recordCandidatesCaptured(count, source, config, sessionId) {
  const telemetry = loadTelemetry(config, sessionId);
  telemetry.candidates_captured += count;
  telemetry.candidates_by_source[source] = (telemetry.candidates_by_source[source] || 0) + count;
  saveTelemetry(telemetry, config);
  return telemetry;
}

function recordCandidatePriority(priority, count, config, sessionId) {
  const telemetry = loadTelemetry(config, sessionId);
  const key = priority === 'immediate' || priority === 'high' ? priority : 'normal';
  telemetry.candidates_by_priority[key] = (telemetry.candidates_by_priority[key] || 0) + count;
  saveTelemetry(telemetry, config);
  return telemetry;
}

function recordCompilation(config, sessionId) {
  const telemetry = loadTelemetry(config, sessionId);
  telemetry.compilations_produced += 1;
  saveTelemetry(telemetry, config);
  return telemetry;
}

function recordSubmission(result, config, sessionId) {
  const telemetry = loadTelemetry(config, sessionId);
  telemetry.submissions_attempted += 1;

  if (result?.ok) {
    telemetry.submissions_accepted += 1;
  } else if (result?.queued) {
    telemetry.submissions_queued_for_retry += 1;
  } else {
    telemetry.submissions_rejected += 1;
  }

  saveTelemetry(telemetry, config);
  return telemetry;
}

function recordDedupe(merges, suppressions, config, sessionId) {
  const telemetry = loadTelemetry(config, sessionId);
  telemetry.dedupe_merges += merges;
  telemetry.dedupe_suppressions += suppressions;
  saveTelemetry(telemetry, config);
  return telemetry;
}

function recordSkillCandidates(count, config, sessionId) {
  const telemetry = loadTelemetry(config, sessionId);
  telemetry.skill_candidates_surfaced += count;
  saveTelemetry(telemetry, config);
  return telemetry;
}

function recordShadowPayload(count, config, sessionId) {
  const telemetry = loadTelemetry(config, sessionId);
  telemetry.shadow_payloads_written += count;
  saveTelemetry(telemetry, config);
  return telemetry;
}

function recordFlush(reason, config, sessionId) {
  const telemetry = loadTelemetry(config, sessionId);
  telemetry.flush_count += 1;
  telemetry.flush_reasons[reason] = (telemetry.flush_reasons[reason] || 0) + 1;
  saveTelemetry(telemetry, config);
  return telemetry;
}

function recordHookError(isImmediate, config, sessionId) {
  const telemetry = loadTelemetry(config, sessionId);
  telemetry.hook_errors_captured += 1;
  if (isImmediate) {
    telemetry.hook_errors_immediate += 1;
  }
  saveTelemetry(telemetry, config);
  return telemetry;
}

function recordCrashSafe(type, config, sessionId) {
  const telemetry = loadTelemetry(config, sessionId);
  if (type === 'write') {
    telemetry.crash_safe_writes += 1;
  } else if (type === 'replay') {
    telemetry.crash_safe_replays += 1;
  }
  saveTelemetry(telemetry, config);
  return telemetry;
}

function snapshotRetryQueue(config, sessionId) {
  const telemetry = loadTelemetry(config, sessionId);
  const retryFile = config.paths?.retryQueueFile;

  try {
    telemetry.retry_queue_depth = retryFile && fs.existsSync(retryFile)
      ? readJsonl(retryFile).length
      : 0;
  } catch (error) {
    telemetry.retry_queue_depth = -1;
  }

  saveTelemetry(telemetry, config);
  return telemetry;
}

function getSummary(config, sessionId) {
  const telemetry = loadTelemetry(config, sessionId);
  snapshotRetryQueue(config, sessionId);

  const total = telemetry.candidates_captured || 1;
  const dedupeRate = total > 0
    ? Number(((telemetry.dedupe_merges + telemetry.dedupe_suppressions) / total * 100).toFixed(1))
    : 0;

  return {
    ...telemetry,
    dedupe_rate_percent: dedupeRate
  };
}

if (require.main === module) {
  const config = loadConfig();
  const sessionId = resolveSessionId();
  process.stdout.write(`${JSON.stringify(getSummary(config, sessionId), null, 2)}\n`);
}

module.exports = {
  createEmptyTelemetry,
  getSummary,
  loadTelemetry,
  recordCandidatesCaptured,
  recordCandidatePriority,
  recordCompilation,
  recordCrashSafe,
  recordDedupe,
  recordFlush,
  recordHookError,
  recordSkillCandidates,
  recordShadowPayload,
  recordSubmission,
  saveTelemetry,
  snapshotRetryQueue
};
