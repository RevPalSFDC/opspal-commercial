'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const { enforceDataQuality } = require('../reflection-data-quality-enforcer');
const { loadConfig } = require('./config-loader');
const { detectSkillCandidates } = require('./skill-candidate-detector');
const {
  comparePriority,
  createDedupKey,
  loadSessionContext,
  nowIso,
  resolveSessionId,
  sanitizeString
} = require('./utils');

let telemetry;
try {
  telemetry = require('./ambient-telemetry');
} catch (error) {
  telemetry = null;
}

const TAXONOMY_RULES_PATH = path.resolve(__dirname, '../../../config/reflection-taxonomy-rules.json');

function loadTaxonomyRules() {
  if (!fs.existsSync(TAXONOMY_RULES_PATH)) {
    return {};
  }

  try {
    return JSON.parse(fs.readFileSync(TAXONOMY_RULES_PATH, 'utf8')).categories || {};
  } catch (error) {
    return {};
  }
}

function dedupeCandidates(candidates) {
  const deduped = new Map();

  candidates.forEach(candidate => {
    const existing = deduped.get(candidate.dedup_key);
    if (!existing) {
      deduped.set(candidate.dedup_key, { ...candidate, repeat_count: candidate.repeat_count || 1 });
      return;
    }

    const keepCurrent = comparePriority(candidate.priority, existing.priority) > 0;
    const merged = keepCurrent ? { ...existing, ...candidate } : existing;
    merged.priority = keepCurrent ? candidate.priority : existing.priority;
    merged.repeat_count = (existing.repeat_count || 1) + (candidate.repeat_count || 1);
    deduped.set(candidate.dedup_key, merged);
  });

  return Array.from(deduped.values());
}

function getMergeKey(candidate) {
  return [
    candidate.category,
    candidate.taxonomy,
    candidate.raw?.tool,
    candidate.raw?.agent,
    candidate.raw?.hook,
    candidate.raw?.signal,
    candidate.raw?.path,
    candidate.source
  ].filter(Boolean).join('|');
}

function mergeCandidates(candidates, dedupeWindowMinutes) {
  const sorted = [...candidates].sort((left, right) => Date.parse(left.captured_at) - Date.parse(right.captured_at));
  const merged = [];

  sorted.forEach(candidate => {
    const previous = merged[merged.length - 1];
    if (!previous) {
      merged.push({ ...candidate });
      return;
    }

    const sameKey = getMergeKey(previous) === getMergeKey(candidate);
    const withinWindow = Math.abs(Date.parse(candidate.captured_at) - Date.parse(previous.captured_at)) <= (dedupeWindowMinutes * 60 * 1000);

    if (!sameKey || !withinWindow) {
      merged.push({ ...candidate });
      return;
    }

    previous.priority = comparePriority(candidate.priority, previous.priority) > 0 ? candidate.priority : previous.priority;
    previous.repeat_count = (previous.repeat_count || 1) + (candidate.repeat_count || 1);
    previous.raw = {
      ...previous.raw,
      repeat_count: previous.repeat_count,
      last_seen_at: candidate.captured_at
    };
  });

  return merged;
}

function classifyTaxonomy(candidate, taxonomyRules) {
  if (candidate.taxonomy) {
    return candidate.taxonomy;
  }

  const text = JSON.stringify(candidate.raw || {}).toLowerCase();
  let bestMatch = null;

  Object.entries(taxonomyRules).forEach(([taxonomy, rule]) => {
    const keywordHits = (rule.keywords || []).filter(keyword => text.includes(String(keyword).toLowerCase())).length;
    const patternHits = (rule.patterns || []).filter(pattern => {
      try {
        return new RegExp(pattern, 'i').test(text);
      } catch (error) {
        return false;
      }
    }).length;

    const score = keywordHits + (patternHits * 2);
    if (score > 0 && (!bestMatch || score > bestMatch.score)) {
      bestMatch = { taxonomy, score };
    }
  });

  if (bestMatch) {
    return bestMatch.taxonomy;
  }

  switch (candidate.category) {
    case 'workflow_gap':
      return 'workflow-gap';
    case 'lesson':
      return 'lesson-learned';
    case 'user_preference':
      return 'user-preference';
    case 'skill_candidate':
      return 'skill-candidate';
    default:
      return 'unknown';
  }
}

function scoreCandidate(candidate, config, flushTime) {
  const priorityWeight = {
    normal: 0.45,
    high: 0.85,
    immediate: 1.2
  }[candidate.priority] || 0.45;

  const repeatBonus = Math.min(0.6, ((candidate.repeat_count || 1) - 1) * 0.15);
  const ageMinutes = Math.max(0, (flushTime - Date.parse(candidate.captured_at)) / 60000);
  const maxAge = config.buffer?.maxAgeMinutes || 120;
  const recencyBonus = Math.max(0, 0.4 - (ageMinutes / (maxAge * 2)));
  const metricBonus = ((candidate.severity_score || 0) * 0.2) + ((candidate.novelty_score || 0) * 0.1);
  return Number((priorityWeight + repeatBonus + recencyBonus + metricBonus).toFixed(2));
}

function clampUnitInterval(value, fallback = null) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(0, Math.min(1, Number(parsed.toFixed(2))));
}

function issuePriorityFor(candidate) {
  if (candidate.priority === 'immediate') {
    return 'P0';
  }
  if (candidate.priority === 'high') {
    return 'P1';
  }
  if (candidate.category === 'issue' || candidate.category === 'workflow_gap') {
    return 'P2';
  }
  return 'P3';
}

function inferDescription(candidate) {
  return candidate.raw?.note || candidate.raw?.message || candidate.raw?.error || candidate.raw?.result_excerpt || 'High-signal ambient event captured.';
}

function inferRootCause(candidate) {
  const subject = candidate.raw?.tool || candidate.raw?.agent || candidate.raw?.hook || candidate.raw?.signal || candidate.source;

  if (candidate.source === 'hook_error') {
    if (candidate.raw?.classification === 'circuit_breaker_open') {
      return `The ${subject} hook kept failing until its circuit breaker opened, which points to missing failure isolation or output validation.`;
    }
    if (candidate.raw?.classification === 'timeout') {
      return `The ${subject} hook exceeded its execution envelope because timeout handling or work partitioning is incomplete.`;
    }
    return `The ${subject} hook emitted a failure pattern that the surrounding workflow does not yet absorb cleanly.`;
  }

  if (candidate.source === 'subagent_stop') {
    if (candidate.raw?.wrong_agent_suspected) {
      return 'The task appears to have been routed to the wrong specialist, so the failure reflects a routing-state gap more than raw execution.';
    }
    return `The ${subject} agent hit an execution path that was not validated before launch.`;
  }

  if (candidate.source === 'task_completed') {
    return `Task completion telemetry shows the ${subject} flow is taking an abnormal path without an explicit optimization or timeout guard.`;
  }

  if (candidate.source === 'post_tool_use' && candidate.category === 'issue') {
    return `The ${subject} tool surfaced an error condition that was not pre-validated or automatically recovered by the current workflow.`;
  }

  if (candidate.category === 'workflow_gap') {
    return 'The current workflow depends on repeated manual recovery instead of a reusable stateful path.';
  }

  if (candidate.category === 'lesson') {
    return 'A recovery or edge-case discovery revealed a repeatable pattern that is not yet encoded in tooling.';
  }

  if (candidate.category === 'user_preference') {
    return 'User preferences or constraints were not carried forward statefully, so the session required an explicit correction.';
  }

  if (candidate.category === 'skill_candidate') {
    return 'Repeated capability requests or friction signals point to missing specialization in the current skill surface.';
  }

  return 'The session exposed a gap between observed behavior and the guardrails encoded in the current workflow.';
}

function computeMissingMetrics(candidate, allCandidates) {
  const taxonomyCount = allCandidates.filter(other => other.taxonomy === candidate.taxonomy).length;
  const rawText = JSON.stringify(candidate.raw || {}).toLowerCase();

  const confidence = candidate.confidence !== null && candidate.confidence !== undefined
    ? clampUnitInterval(candidate.confidence)
    : clampUnitInterval({
        hook_error: 0.9,
        subagent_stop: 0.85,
        task_completed: 0.8,
        post_tool_use: 0.75,
        user_prompt: 0.65,
        skill_candidate_detector: 0.8
      }[candidate.source] || 0.6);

  const noveltyScore = candidate.novelty_score !== null && candidate.novelty_score !== undefined
    ? clampUnitInterval(candidate.novelty_score)
    : clampUnitInterval(
      /edge case|corner case|anomaly|unexpected|recovered after/i.test(rawText)
        ? 0.7
        : taxonomyCount === 1
          ? 0.65
          : (candidate.repeat_count || 1) >= 3
            ? 0.35
            : 0.5
    );

  const baseSeverity = {
    immediate: 0.95,
    high: 0.75,
    normal: 0.45
  }[candidate.priority] || 0.45;
  const severityScore = candidate.severity_score !== null && candidate.severity_score !== undefined
    ? clampUnitInterval(candidate.severity_score)
    : clampUnitInterval(baseSeverity + ((candidate.category === 'issue' || candidate.category === 'workflow_gap') ? 0.1 : 0));

  return {
    ...candidate,
    confidence,
    novelty_score: noveltyScore,
    severity_score: severityScore,
    impact_path: candidate.impact_path || candidate.raw?.impact_path || candidate.raw?.path || candidate.raw?.tool || candidate.raw?.agent || null
  };
}

function buildIssue(candidate) {
  const label = candidate.raw?.tool || candidate.raw?.agent || candidate.raw?.hook || candidate.raw?.path || candidate.raw?.signal || candidate.source;
  const description = inferDescription(candidate);
  const rootCause = inferRootCause(candidate);

  return {
    title: sanitizeString(`${candidate.category.replace(/_/g, ' ')}: ${label}`, 120),
    description: sanitizeString(description, 180),
    root_cause: sanitizeString(rootCause, 180),
    agnostic_fix: sanitizeString(defaultFix(candidate), 180),
    reproducible_trigger: sanitizeString(defaultTrigger(candidate), 160),
    blast_radius: candidate.priority === 'immediate' ? 'HIGH' : candidate.priority === 'high' ? 'MEDIUM' : 'LOW',
    priority: issuePriorityFor(candidate),
    taxonomy: candidate.taxonomy,
    repeat_count: candidate.repeat_count || 1,
    ambient_source: candidate.source,
    confidence: candidate.confidence,
    novelty_score: candidate.novelty_score,
    severity_score: candidate.severity_score,
    impact_path: candidate.impact_path
  };
}

function defaultFix(candidate) {
  switch (candidate.category) {
    case 'workflow_gap':
      return 'Automate the repeated recovery pattern or add a dedicated helper/skill.';
    case 'lesson':
      return 'Front-load the validation that would have avoided the repeat action.';
    case 'user_preference':
      return 'Honor the corrected preference earlier in future interactions.';
    case 'skill_candidate':
      return 'Add a specialized skill or agent path for this repeated request.';
    default:
      return 'Harden the workflow with better validation, retries, or routing guardrails.';
  }
}

function defaultTrigger(candidate) {
  if (candidate.source === 'hook_error') {
    return `Hook error observed in ${candidate.raw?.hook || 'unknown hook'}.`;
  }
  if (candidate.source === 'post_tool_use') {
    return `Tool result from ${candidate.raw?.tool || 'unknown tool'} matched an error or retry pattern.`;
  }
  if (candidate.source === 'subagent_stop') {
    return `Subagent ${candidate.raw?.agent || 'unknown'} stopped unsuccessfully.`;
  }
  if (candidate.source === 'task_completed') {
    return `TaskCompleted telemetry for ${candidate.raw?.agent || 'unknown'} exceeded ambient thresholds.`;
  }
  return 'User or workflow signal crossed the ambient reflection threshold.';
}

function summarizeCategories(candidates) {
  const counts = candidates.reduce((accumulator, candidate) => {
    accumulator[candidate.category] = (accumulator[candidate.category] || 0) + 1;
    return accumulator;
  }, {});

  return Object.entries(counts)
    .map(([category, count]) => `${count} ${category.replace(/_/g, ' ')}`)
    .join(', ');
}

function dominantTaxonomy(candidates) {
  const counts = candidates.reduce((accumulator, candidate) => {
    accumulator[candidate.taxonomy] = (accumulator[candidate.taxonomy] || 0) + 1;
    return accumulator;
  }, {});

  return Object.entries(counts).sort((left, right) => right[1] - left[1])[0]?.[0] || null;
}

function compileCandidates(candidates, options = {}) {
  const config = options.config || loadConfig();
  const sessionId = resolveSessionId(options.sessionId);
  const flushReason = options.flushReason || 'ambient_flush';
  const payloadSource = options.source || 'auto';
  const correlationId = options.correlationId || crypto.randomUUID();

  if (!Array.isArray(candidates) || candidates.length === 0) {
    return [];
  }

  const taxonomyRules = loadTaxonomyRules();
  const sessionContext = loadSessionContext(sessionId);
  const flushTime = Date.now();
  const deduped = dedupeCandidates(candidates);
  const merged = mergeCandidates(deduped, config.compiler?.dedupeWindowMinutes || 10);
  const syntheticSkillCandidates = detectSkillCandidates(merged, { config, sessionId });
  try {
    if (telemetry && syntheticSkillCandidates.length > 0) {
      telemetry.recordSkillCandidates(syntheticSkillCandidates.length, config, sessionId);
    }
  } catch (error) { /* telemetry must not block compilation */ }
  const classified = [...merged, ...syntheticSkillCandidates]
    .map(candidate => ({
      ...candidate,
      taxonomy: classifyTaxonomy(candidate, taxonomyRules)
    }));
  const prepared = classified
    .map(candidate => computeMissingMetrics(candidate, classified))
    .map(candidate => ({
      ...candidate,
      score: scoreCandidate(candidate, config, flushTime)
    }))
    .filter(candidate => candidate.score >= (config.compiler?.minScoreToKeep || 0.3))
    .sort((left, right) => right.score - left.score)
    .slice(0, config.compiler?.maxIssuesPerReflection || 25);

  if (prepared.length === 0) {
    return [];
  }

  const issues = prepared.map(buildIssue);
  const summary = `Ambient reflection captured ${prepared.length} high-signal event${prepared.length === 1 ? '' : 's'} for session ${sessionId}: ${summarizeCategories(prepared)}.`;
  const reflection = {
    source: payloadSource,
    collector_source: 'ambient_collector',
    correlation_id: correlationId,
    summary,
    focus_area: dominantTaxonomy(prepared),
    org_name: sessionContext?.org_context?.org_alias || null,
    lessons_learned: prepared
      .filter(candidate => candidate.category === 'lesson')
      .map(candidate => candidate.raw?.note)
      .filter(Boolean),
    user_preferences: prepared
      .filter(candidate => candidate.category === 'user_preference')
      .map(candidate => candidate.raw)
      .filter(Boolean),
    workflow_gaps: prepared
      .filter(candidate => candidate.category === 'workflow_gap')
      .map(candidate => candidate.raw)
      .filter(Boolean),
    skill_candidates: prepared
      .filter(candidate => candidate.category === 'skill_candidate')
      .map(candidate => candidate.raw)
      .filter(Boolean),
    issues_identified: issues,
    session_metadata: {
      session_id: sessionId,
      session_start: sessionContext?.started_at || null,
      session_end: nowIso(),
      duration_minutes: sessionContext?.duration_minutes || null,
      org: sessionContext?.org_context?.org_alias || null,
      platform: sessionContext?.org_context?.platform || null,
      source: payloadSource,
      correlation_id: correlationId,
      flush_reason: flushReason,
      candidate_count: candidates.length,
      compiled_candidate_count: prepared.length
    },
    ambient_context: {
      collector_source: 'ambient_collector',
      source: payloadSource,
      correlation_id: correlationId,
      flush_reason: flushReason,
      payload_count: 1,
      compiled_candidate_count: prepared.length
    },
    ambient_candidates: prepared.map(candidate => ({
      id: candidate.id,
      source: candidate.source,
      category: candidate.category,
      priority: candidate.priority,
      taxonomy: candidate.taxonomy,
      score: candidate.score,
      repeat_count: candidate.repeat_count,
      dedup_key: candidate.dedup_key,
      confidence: candidate.confidence,
      novelty_score: candidate.novelty_score,
      severity_score: candidate.severity_score,
      impact_path: candidate.impact_path
    }))
  };

  try {
    if (telemetry) {
      telemetry.recordCompilation(config, sessionId);
    }
  } catch (error) { /* telemetry must not block compilation */ }

  return [enforceDataQuality(reflection)];
}

module.exports = {
  buildIssue,
  computeMissingMetrics,
  compileCandidates,
  classifyTaxonomy,
  dedupeCandidates,
  inferRootCause,
  mergeCandidates,
  scoreCandidate
};
