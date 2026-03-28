'use strict';

const fs = require('fs');
const path = require('path');

const { loadConfig } = require('./config-loader');
const { evaluateFlushTrigger } = require('./flush-trigger-engine');
const { observeHookErrors } = require('./hook-error-observer');
const { ReflectionCandidateBuffer } = require('./reflection-candidate-buffer');
const {
  appendJsonl,
  comparePriority,
  ensureDir,
  nowIso,
  readJsonl,
  resolveSessionId,
  sanitizeObject,
  sanitizeString
} = require('./utils');

function crashSafeFilePath(config) {
  return path.join(config.paths?.ambientDir, config.hookReflection?.crashSafeFile || 'hook-reflection-crash-safe.jsonl');
}

function parseTimestamp(value) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function dedupeWindowMs(config) {
  return (config.hookReflection?.dedupeWindowSeconds || 300) * 1000;
}

function crossSessionWindowMs(config) {
  return (config.hookReflection?.crossSessionWindowSeconds || 86400) * 1000;
}

function mergeNumeric(left, right) {
  const leftValue = Number(left);
  const rightValue = Number(right);

  if (Number.isFinite(leftValue) && Number.isFinite(rightValue)) {
    return Math.max(leftValue, rightValue);
  }
  if (Number.isFinite(leftValue)) {
    return leftValue;
  }
  if (Number.isFinite(rightValue)) {
    return rightValue;
  }
  return null;
}

function mergeCandidate(existing, incoming) {
  const merged = {
    ...existing,
    ...incoming,
    raw: {
      ...(existing.raw || {}),
      ...(incoming.raw || {})
    },
    repeat_count: Math.max(1, Number(existing.repeat_count) || 1) + Math.max(1, Number(incoming.repeat_count) || 1)
  };

  if (comparePriority(existing.priority, incoming.priority) >= 0) {
    merged.priority = existing.priority;
  } else {
    merged.priority = incoming.priority;
  }

  merged.confidence = mergeNumeric(existing.confidence, incoming.confidence);
  merged.severity_score = mergeNumeric(existing.severity_score, incoming.severity_score);
  merged.novelty_score = mergeNumeric(existing.novelty_score, incoming.novelty_score);
  merged.score = Math.max(Number(existing.score) || 0, Number(incoming.score) || 0);
  merged.taxonomy = incoming.taxonomy || existing.taxonomy || null;
  merged.impact_path = incoming.impact_path || existing.impact_path || null;
  merged.captured_at = incoming.captured_at || existing.captured_at || nowIso();

  return merged;
}

function dedupeWithinSession(existingCandidates, incomingCandidates, config) {
  const mergedCandidates = existingCandidates.map(candidate => ({ ...candidate, raw: { ...(candidate.raw || {}) } }));
  const indexByKey = new Map();
  const now = Date.now();
  const mergeWindow = dedupeWindowMs(config);

  mergedCandidates.forEach((candidate, index) => {
    if (now - parseTimestamp(candidate.captured_at) <= mergeWindow) {
      indexByKey.set(candidate.dedup_key, index);
    }
  });

  let mergedCount = 0;
  let addedCount = 0;

  incomingCandidates.forEach(candidate => {
    const existingIndex = indexByKey.get(candidate.dedup_key);
    if (existingIndex === undefined) {
      mergedCandidates.push(candidate);
      indexByKey.set(candidate.dedup_key, mergedCandidates.length - 1);
      addedCount += 1;
      return;
    }

    mergedCandidates[existingIndex] = mergeCandidate(mergedCandidates[existingIndex], candidate);
    mergedCount += 1;
  });

  return {
    mergedCandidates,
    mergedCount,
    addedCount
  };
}

function escalateSeverity(candidates) {
  const counts = new Map();

  candidates.forEach(candidate => {
    counts.set(candidate.dedup_key, (counts.get(candidate.dedup_key) || 0) + Math.max(1, Number(candidate.repeat_count) || 1));
  });

  return candidates.map(candidate => {
    const totalCount = counts.get(candidate.dedup_key) || Math.max(1, Number(candidate.repeat_count) || 1);
    if (totalCount < 3) {
      return candidate;
    }

    return {
      ...candidate,
      priority: comparePriority(candidate.priority, 'immediate') >= 0 ? candidate.priority : 'immediate',
      severity_score: mergeNumeric(candidate.severity_score, 0.95) || 0.95
    };
  });
}

function persistCandidates(buffer, candidates) {
  buffer.initialize();
  buffer._data.candidates = candidates.slice(-buffer.maxCandidates);
  buffer._data.updated_at = nowIso();
  buffer.flush();
  return buffer;
}

function trimCrashSafeFile(filePath, maxEntries) {
  try {
    const entries = readJsonl(filePath);
    if (entries.length <= maxEntries) {
      return;
    }

    const tail = entries.slice(entries.length - maxEntries).map(entry => JSON.stringify(entry)).join('\n');
    fs.writeFileSync(filePath, tail ? `${tail}\n` : '', 'utf8');
  } catch (error) {
    // Crash-safe trimming is best-effort only.
  }
}

function writeCrashSafe(candidates, config, errorContext = {}) {
  const filePath = crashSafeFilePath(config);
  const entries = Array.isArray(candidates) ? candidates : [candidates];
  let written = 0;

  try {
    ensureDir(path.dirname(filePath));
    entries.filter(Boolean).forEach(candidate => {
      appendJsonl(filePath, {
        recorded_at: nowIso(),
        session_id: errorContext.sessionId || resolveSessionId(),
        step: errorContext.step || 'unknown',
        error: sanitizeString(errorContext.error || '', 240),
        candidate: sanitizeObject(candidate, config.sanitization?.maxFieldLength || 200)
      });
      written += 1;
    });
    trimCrashSafeFile(filePath, config.hookReflection?.maxCrashSafeEntries || 100);
  } catch (error) {
    return {
      file: filePath,
      written,
      failed: true
    };
  }

  return {
    file: filePath,
    written
  };
}

function replayFromCrashSafe(config, sessionId) {
  const filePath = crashSafeFilePath(config);

  try {
    if (!fs.existsSync(filePath)) {
      return {
        file: filePath,
        replayed: 0
      };
    }

    const entries = readJsonl(filePath);
    const candidates = entries
      .map(entry => entry?.candidate)
      .filter(candidate => candidate && candidate.dedup_key);

    if (candidates.length === 0) {
      fs.writeFileSync(filePath, '', 'utf8');
      return {
        file: filePath,
        replayed: 0
      };
    }

    const buffer = new ReflectionCandidateBuffer({ config, sessionId });
    const merged = dedupeWithinSession(buffer.list(), candidates, config);
    persistCandidates(buffer, escalateSeverity(merged.mergedCandidates));
    fs.writeFileSync(filePath, '', 'utf8');

    return {
      file: filePath,
      replayed: candidates.length,
      merged: merged.mergedCount,
      added: merged.addedCount
    };
  } catch (error) {
    return {
      file: filePath,
      replayed: 0,
      failed: true,
      error: sanitizeString(error.message || '', 200)
    };
  }
}

function readRecentHookSignals(signalFile, config) {
  const cutoff = Date.now() - crossSessionWindowMs(config);
  return readJsonl(signalFile)
    .filter(entry => entry?.entry_type === 'hook_error')
    .filter(entry => parseTimestamp(entry.captured_at) >= cutoff);
}

function isSuppressibleCandidate(candidate, priorSignals, sessionId) {
  const classification = candidate.raw?.classification;
  if (classification === 'circuit_breaker_open' || classification === 'recovery_failure') {
    return false;
  }

  const recentSignal = priorSignals
    .filter(entry => entry.dedup_key === candidate.dedup_key && entry.session_id !== sessionId)
    .sort((left, right) => parseTimestamp(right.captured_at) - parseTimestamp(left.captured_at))[0];

  if (!recentSignal) {
    return false;
  }

  const sameExitCode = Number(recentSignal.exit_code) === Number(candidate.raw?.exit_code);
  const hasStackTrace = Boolean(candidate.raw?.stack_trace);

  return sameExitCode && !hasStackTrace;
}

function recordHookSignals(candidates, signalFile, sessionId, suppressed = false) {
  candidates.forEach(candidate => {
    appendJsonl(signalFile, {
      entry_type: 'hook_error',
      captured_at: nowIso(),
      session_id: sessionId,
      dedup_key: candidate.dedup_key,
      classification: candidate.raw?.classification || 'non_zero_exit',
      exit_code: candidate.raw?.exit_code ?? 0,
      has_stack_trace: Boolean(candidate.raw?.stack_trace),
      suppressed
    });
  });
}

function suppressCrossSessionDuplicates(candidates, config, sessionId) {
  const signalFile = config.paths?.skillSignalsFile;
  const priorSignals = readRecentHookSignals(signalFile, config);
  const accepted = [];
  const suppressed = [];

  candidates.forEach(candidate => {
    if (isSuppressibleCandidate(candidate, priorSignals, sessionId)) {
      suppressed.push(candidate);
    } else {
      accepted.push(candidate);
    }
  });

  try {
    recordHookSignals(accepted, signalFile, sessionId, false);
    recordHookSignals(suppressed, signalFile, sessionId, true);
  } catch (error) {
    // Signal persistence is best-effort only.
  }

  return {
    accepted,
    suppressed
  };
}

function hasImmediateHookCandidate(candidates) {
  return candidates.some(candidate => candidate.source === 'hook_error' && candidate.priority === 'immediate');
}

function hasSubmissionFailure(flushResult) {
  return Boolean(flushResult?.submission?.results?.some(result => result && result.ok === false));
}

function interceptHookErrors(options = {}) {
  const config = options.config || loadConfig();
  const sessionId = resolveSessionId(options.sessionId);
  const hookReflectionEnabled = config.hookReflection?.enabled !== false;
  const crashSafe = {
    replay: { replayed: 0 },
    write: { written: 0 }
  };

  if (!hookReflectionEnabled) {
    return {
      candidates: [],
      flushed: false,
      reason: 'disabled',
      crashSafe
    };
  }

  try {
    crashSafe.replay = replayFromCrashSafe(config, sessionId);
  } catch (error) {
    crashSafe.replay = {
      replayed: 0,
      failed: true
    };
  }

  let observed = [];
  try {
    observed = observeHookErrors({
      ...options,
      config,
      sessionId
    });
  } catch (error) {
    return {
      candidates: [],
      flushed: false,
      reason: 'observer_failed',
      crashSafe
    };
  }

  if (observed.length === 0) {
    return {
      candidates: [],
      flushed: false,
      reason: crashSafe.replay?.replayed ? 'replayed_only' : 'no_entries',
      crashSafe
    };
  }

  const crossSession = suppressCrossSessionDuplicates(observed, config, sessionId);
  if (crossSession.accepted.length === 0) {
    return {
      candidates: [],
      flushed: false,
      reason: 'suppressed_duplicate',
      suppressed: crossSession.suppressed.length,
      crashSafe
    };
  }

  const buffer = new ReflectionCandidateBuffer({ config, sessionId });
  let merged;

  try {
    merged = dedupeWithinSession(buffer.list(), crossSession.accepted, config);
    persistCandidates(buffer, escalateSeverity(merged.mergedCandidates));
  } catch (error) {
    crashSafe.write = writeCrashSafe(crossSession.accepted, config, {
      sessionId,
      step: 'buffer_write',
      error: error.message
    });

    return {
      candidates: crossSession.accepted,
      flushed: false,
      reason: 'buffer_write_failed',
      suppressed: crossSession.suppressed.length,
      crashSafe
    };
  }

  if (config.mode === 'manual_only' || config.hookReflection?.immediateFlushOnError === false || !hasImmediateHookCandidate(crossSession.accepted)) {
    return {
      candidates: crossSession.accepted,
      flushed: false,
      reason: 'buffered',
      suppressed: crossSession.suppressed.length,
      crashSafe
    };
  }

  let flushResult;
  try {
    flushResult = evaluateFlushTrigger({
      config,
      sessionId,
      trigger: 'hook_error_immediate'
    });
  } catch (error) {
    crashSafe.write = writeCrashSafe(crossSession.accepted, config, {
      sessionId,
      step: 'flush',
      error: error.message
    });

    return {
      candidates: crossSession.accepted,
      flushed: false,
      reason: 'flush_failed',
      suppressed: crossSession.suppressed.length,
      crashSafe
    };
  }

  if (hasSubmissionFailure(flushResult)) {
    crashSafe.write = writeCrashSafe(crossSession.accepted, config, {
      sessionId,
      step: 'submit',
      error: 'submit_failed'
    });
  }

  return {
    candidates: crossSession.accepted,
    flushed: Boolean(flushResult?.flushed),
    reason: flushResult?.reason || 'buffered',
    suppressed: crossSession.suppressed.length,
    crashSafe
  };
}

if (require.main === module) {
  process.stdout.write(`${JSON.stringify(interceptHookErrors())}\n`);
}

module.exports = {
  dedupeWithinSession,
  interceptHookErrors,
  replayFromCrashSafe,
  writeCrashSafe
};
