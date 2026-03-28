'use strict';

const crypto = require('crypto');
const path = require('path');

const { loadConfig } = require('./config-loader');
const { ReflectionCandidateBuffer } = require('./reflection-candidate-buffer');
const { compileCandidates } = require('./reflection-compiler');
const { submitPayloads } = require('./ambient-reflection-submitter');
const { nowIso, readJson, resolveSessionId, writeJson } = require('./utils');

function lastFlushFile(sessionId, config) {
  return path.join(config.paths?.ambientDir, `${sessionId}-last-flush.json`);
}

function candidateDomain(candidate) {
  const rawDomain = String(candidate.taxonomy || candidate.category || 'unknown');
  return rawDomain.split(/[\/_-]/)[0] || rawDomain;
}

function dominantDomain(candidates) {
  const counts = candidates.reduce((accumulator, candidate) => {
    const domain = candidateDomain(candidate);
    accumulator[domain] = (accumulator[domain] || 0) + 1;
    return accumulator;
  }, {});

  return Object.entries(counts).sort((left, right) => right[1] - left[1])[0]?.[0] || null;
}

function detectTopicTransition(candidates) {
  const recent = candidates.slice(-6);
  if (recent.length < 6) {
    return false;
  }

  const firstDomain = dominantDomain(recent.slice(0, 3));
  const secondDomain = dominantDomain(recent.slice(3));
  return Boolean(firstDomain && secondDomain && firstDomain !== secondDomain);
}

function shouldFlush({ trigger, stats, config, lastFlushAt, force }) {
  if (stats.count === 0) {
    return { flush: false, reason: 'empty' };
  }

  const now = Date.now();
  const lastFlushAgeSeconds = lastFlushAt ? Math.max(0, (now - Date.parse(lastFlushAt)) / 1000) : Number.POSITIVE_INFINITY;
  const flushInterval = config.buffer?.flushIntervalSeconds || 60;

  if (force || trigger === 'manual_reflect') {
    return { flush: true, reason: 'manual_reflect' };
  }

  if (stats.hook_error_immediate_count > 0) {
    return { flush: true, reason: 'hook_error_immediate' };
  }

  if (stats.hook_error_recovery_failures > 0) {
    return { flush: true, reason: 'hook_error_recovery_failure' };
  }

  if (config.mode === 'manual_only') {
    return { flush: false, reason: 'mode_disabled' };
  }

  if (stats.has_critical_source) {
    return { flush: true, reason: 'critical_failure' };
  }

  if (stats.count >= (config.buffer?.maxCandidates || 200)) {
    return { flush: true, reason: 'threshold' };
  }

  if (trigger === 'task_completion' && stats.count >= (config.buffer?.taskCompletionFlushThreshold || 5)) {
    return { flush: true, reason: 'task_completion' };
  }

  if (stats.friction_priority_count >= (config.buffer?.repeatedFrictionThreshold || 3)) {
    return { flush: true, reason: 'repeated_friction' };
  }

  if (stats.high_priority_hook_errors >= 3) {
    return { flush: true, reason: 'high_priority_count' };
  }

  if (trigger === 'session_end') {
    return { flush: true, reason: 'session_end' };
  }

  if (trigger === 'pre_compact') {
    return { flush: true, reason: 'pre_compact' };
  }

  if (stats.topic_shifted && stats.count >= (config.buffer?.topicTransitionMinCandidates || 8)) {
    return { flush: true, reason: 'topic_transition' };
  }

  if (stats.oldest_age_minutes >= (config.buffer?.maxAgeMinutes || 120)) {
    return { flush: true, reason: 'age_threshold' };
  }

  if (lastFlushAgeSeconds < flushInterval) {
    return { flush: false, reason: 'flush_interval' };
  }

  return { flush: false, reason: 'not_triggered' };
}

function evaluateFlushTrigger(options = {}) {
  const config = options.config || loadConfig();
  const sessionId = resolveSessionId(options.sessionId);
  const force = Boolean(options.force || config.forceFlush);
  const trigger = options.trigger || 'post_tool_use';
  const payloadSource = options.source || (trigger === 'manual_reflect' ? 'manual' : 'auto');
  const buffer = new ReflectionCandidateBuffer({ config, sessionId });
  const stats = buffer.getStats();
  const candidates = buffer.list();
  const lastFlushState = readJson(lastFlushFile(sessionId, config), {});
  const correlationId = options.correlationId || crypto.randomUUID();

  stats.high_priority_hook_errors = candidates.filter(candidate => candidate.source === 'hook_error' && candidate.priority === 'high').length;
  stats.hook_error_immediate_count = candidates.filter(candidate => candidate.source === 'hook_error' && candidate.priority === 'immediate').length;
  stats.hook_error_recovery_failures = candidates.filter(candidate => candidate.source === 'hook_error' && candidate.raw?.recovery_succeeded === false).length;
  stats.friction_priority_count = candidates.filter(candidate => ['high', 'immediate'].includes(candidate.priority)).length;
  stats.has_critical_source = candidates.some(candidate => candidate.priority === 'immediate' && ['subagent_stop', 'task_completed', 'hook_error'].includes(candidate.source));
  stats.topic_shifted = detectTopicTransition(candidates);

  const decision = shouldFlush({
    trigger,
    stats,
    config,
    lastFlushAt: lastFlushState.flushed_at,
    force
  });

  if (!decision.flush) {
    return {
      flushed: false,
      trigger,
      reason: decision.reason,
      stats,
      source: payloadSource
    };
  }

  const drained = buffer.drain();
  const payloads = compileCandidates(drained, {
    config,
    sessionId,
    flushReason: decision.reason,
    source: payloadSource,
    correlationId
  });
  const submission = submitPayloads(payloads, {
    config,
    sessionId,
    trigger: decision.reason,
    mode: options.mode,
    source: payloadSource,
    correlationId
  });

  writeJson(lastFlushFile(sessionId, config), {
    flushed_at: nowIso(),
    trigger: decision.reason,
    submitted: submission.submitted,
    source: payloadSource,
    correlation_id: correlationId
  });

  return {
    flushed: true,
    trigger,
    reason: decision.reason,
    stats,
    source: payloadSource,
    correlation_id: correlationId,
    payload_count: payloads.length,
    submission
  };
}

if (require.main === module) {
  const trigger = process.argv[2] || 'post_tool_use';
  const force = process.argv.includes('--force');
  process.stdout.write(`${JSON.stringify(evaluateFlushTrigger({ trigger, force }))}\n`);
}

module.exports = {
  evaluateFlushTrigger,
  shouldFlush
};
