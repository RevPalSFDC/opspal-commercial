'use strict';

const { loadConfig } = require('./config-loader');
const {
  appendJsonl,
  createDedupKey,
  normalizedPatternKey,
  nowIso,
  readJsonl,
  resolveSessionId,
  sanitizeString
} = require('./utils');

function buildSignalKey(candidate) {
  return normalizedPatternKey([
    candidate.category,
    candidate.raw?.agent,
    candidate.raw?.tool,
    candidate.raw?.note,
    candidate.raw?.message,
    candidate.raw?.error,
    candidate.raw?.matched_phrase
  ].filter(Boolean).join(' '));
}

// --- Skill opportunity pattern detection ---

const OPPORTUNITY_PATTERNS = [
  {
    id: 'repeated_workflow',
    label: 'Repeated workflow across interactions',
    test: (group, repeatCount, distinctSessions) => repeatCount >= 3 && distinctSessions >= 2,
    impact: 'high'
  },
  {
    id: 'brittle_manual_sequence',
    label: 'Brittle manual multi-step sequence',
    test: (group) => group.some(c => c.category === 'workflow_gap' && (c.raw?.note || '').toLowerCase().includes('retry')),
    impact: 'high'
  },
  {
    id: 'stable_task',
    label: 'Stable task with consistent inputs/outputs',
    test: (group) => group.filter(c => c.category === 'lesson' || c.raw?.signal === 'successful_reusable_pattern').length >= 2,
    impact: 'medium'
  },
  {
    id: 'corrective_guidance',
    label: 'Recurring user corrective guidance',
    test: (group) => group.filter(c => c.category === 'user_preference' || c.raw?.signal === 'user_correction').length >= 2,
    impact: 'medium'
  },
  {
    id: 'automation_opportunity',
    label: 'Obvious automation opportunity',
    test: (group) => group.some(c => c.raw?.wrong_agent_suspected) || group.some(c => (c.raw?.note || '').toLowerCase().includes('automat')),
    impact: 'high'
  },
  {
    id: 'domain_encapsulation',
    label: 'Domain-specific pattern that should be encapsulated',
    test: (group, repeatCount) => repeatCount >= 4 && group.some(c => c.raw?.agent || c.raw?.tool),
    impact: 'medium'
  }
];

function inferSkillName(signalKey, group) {
  const agent = group.find(c => c.raw?.agent)?.raw.agent;
  const tool = group.find(c => c.raw?.tool)?.raw.tool;
  const slug = (agent || tool || signalKey).replace(/[^a-z0-9]+/gi, '-').slice(0, 40).replace(/-+$/, '');
  return `auto-${slug}`;
}

function inferTriggerPattern(group) {
  const phrases = group
    .map(c => c.raw?.matched_phrase || c.raw?.note || c.raw?.message || '')
    .filter(Boolean)
    .slice(0, 3);
  return phrases.length > 0 ? phrases.join('; ') : 'Repeated pattern detected across multiple sessions.';
}

function inferInputsOutputs(group) {
  const tools = [...new Set(group.map(c => c.raw?.tool).filter(Boolean))];
  const agents = [...new Set(group.map(c => c.raw?.agent).filter(Boolean))];
  return {
    inputs: tools.length > 0 ? tools.map(t => `${t} invocation context`) : ['User prompt or task context'],
    outputs: agents.length > 0 ? agents.map(a => `${a} result`) : ['Structured task result or status']
  };
}

function buildSkillOpportunity(signalKey, group, repeatCount, distinctSessions) {
  const matchedPatterns = OPPORTUNITY_PATTERNS.filter(pattern => pattern.test(group, repeatCount, distinctSessions));
  if (matchedPatterns.length === 0) {
    return null;
  }

  const topPattern = matchedPatterns[0];
  const io = inferInputsOutputs(group);
  const confidenceBase = Math.min(0.95, 0.5 + (distinctSessions * 0.1) + (repeatCount * 0.05));
  const impactRank = { high: 3, medium: 2, low: 1 };
  const bestImpact = matchedPatterns.reduce((best, p) => (impactRank[p.impact] || 0) > (impactRank[best] || 0) ? p.impact : best, 'low');

  return {
    suggested_name: inferSkillName(signalKey, group),
    problem: sanitizeString(topPattern.label, 120),
    trigger_pattern: sanitizeString(inferTriggerPattern(group), 200),
    expected_inputs: io.inputs.map(i => sanitizeString(i, 80)),
    expected_outputs: io.outputs.map(o => sanitizeString(o, 80)),
    execution_outline: [
      'Detect matching trigger from user prompt or tool result',
      `Apply ${topPattern.id.replace(/_/g, ' ')} resolution`,
      'Validate output and return structured result'
    ],
    example_requests: group
      .slice(0, 3)
      .map(c => sanitizeString(c.raw?.note || c.raw?.message || c.raw?.matched_phrase || '', 120))
      .filter(Boolean),
    confidence: Number(confidenceBase.toFixed(2)),
    estimated_impact: bestImpact,
    matched_patterns: matchedPatterns.map(p => p.id),
    signal_key: sanitizeString(signalKey, 120),
    repeat_count: repeatCount,
    distinct_sessions: distinctSessions
  };
}

// --- Core detection ---

function detectSkillCandidates(candidates, options = {}) {
  const config = options.config || loadConfig();
  const sessionId = resolveSessionId(options.sessionId);
  const signalFile = options.signalFile || config.paths?.skillSignalsFile;
  const signalGroups = new Map();
  const recentSignals = readJsonl(signalFile);
  const cutoffMs = Date.now() - ((config.skillCandidate?.crossSessionWindowDays || 7) * 24 * 60 * 60 * 1000);

  candidates.forEach(candidate => {
    const key = buildSignalKey(candidate);
    if (!key) {
      return;
    }

    if (candidate.category === 'workflow_gap' || candidate.category === 'skill_candidate' || candidate.category === 'user_preference' || candidate.category === 'lesson' || candidate.raw?.wrong_agent_suspected) {
      const bucket = signalGroups.get(key) || [];
      bucket.push(candidate);
      signalGroups.set(key, bucket);
    }
  });

  const syntheticCandidates = [];

  signalGroups.forEach((group, signalKey) => {
    const repeatCount = group.reduce((total, candidate) => total + Math.max(1, Number(candidate.repeat_count) || 1), 0);
    const repeatedPattern = repeatCount >= (config.skillCandidate?.patternRepeatThreshold || 3);
    const wrongAgentSignal = group.some(candidate => candidate.raw?.wrong_agent_suspected);

    if (!repeatedPattern && !wrongAgentSignal && !group.some(candidate => candidate.category === 'skill_candidate')) {
      return;
    }

    const priorSessions = new Set(
      recentSignals
        .filter(entry => entry.signal_key === signalKey && Date.parse(entry.captured_at) >= cutoffMs)
        .map(entry => entry.session_id)
        .filter(Boolean)
    );
    const distinctSessions = priorSessions.size + 1;

    let priority = repeatedPattern || wrongAgentSignal ? 'high' : 'normal';
    if (distinctSessions >= (config.skillCandidate?.crossSessionSessionThreshold || 2)) {
      priority = 'immediate';
    }

    const opportunity = buildSkillOpportunity(signalKey, group, repeatCount, distinctSessions);

    const summary = wrongAgentSignal
      ? 'Repeated signs that a specialized agent or skill is missing.'
      : 'Repeated workflow gap suggests a reusable skill should exist.';

    syntheticCandidates.push({
      source: 'skill_candidate_detector',
      category: 'skill_candidate',
      priority,
      captured_at: nowIso(),
      raw: {
        signal_key: sanitizeString(signalKey, 120),
        repeat_count: repeatCount,
        distinct_sessions: distinctSessions,
        note: summary,
        skill_opportunity: opportunity || undefined
      },
      dedup_key: createDedupKey(['skill_candidate_detector', signalKey, priority])
    });

    appendJsonl(signalFile, {
      captured_at: nowIso(),
      session_id: sessionId,
      signal_key: signalKey,
      repeat_count: repeatCount,
      wrong_agent_signal: wrongAgentSignal
    });
  });

  return syntheticCandidates;
}

module.exports = {
  buildSkillOpportunity,
  buildSignalKey,
  detectSkillCandidates,
  OPPORTUNITY_PATTERNS
};
