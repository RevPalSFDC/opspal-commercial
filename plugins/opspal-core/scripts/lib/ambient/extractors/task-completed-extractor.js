'use strict';

const {
  createDedupKey,
  nowIso,
  readStdin,
  sanitizeString
} = require('../utils');

function extractCandidates(payload) {
  const agentName = payload?.agent_type || payload?.subagent_type || payload?.agent_name || 'unknown';
  const durationMs = Number(payload?.duration_ms || payload?.task_duration_ms || 0) || 0;
  const tokenCount = Number(payload?.token_count || payload?.task_token_count || 0) || 0;
  const toolUses = Number(payload?.tool_uses || payload?.task_tool_uses || 0) || 0;
  const success = payload?.success;
  const candidates = [];

  if (success === false || success === 'false') {
    candidates.push({
      source: 'task_completed',
      category: 'issue',
      priority: 'high',
      captured_at: nowIso(),
      raw: {
        agent: sanitizeString(agentName, 100),
        duration_ms: durationMs,
        token_count: tokenCount,
        tool_uses: toolUses,
        note: 'TaskCompleted reported an unsuccessful subagent run.'
      },
      dedup_key: createDedupKey(['task_completed', 'failure', agentName])
    });
  }

  if (durationMs >= 900000 || (durationMs >= 300000 && toolUses === 0)) {
    candidates.push({
      source: 'task_completed',
      category: 'workflow_gap',
      priority: durationMs >= 1800000 ? 'high' : 'normal',
      captured_at: nowIso(),
      raw: {
        agent: sanitizeString(agentName, 100),
        duration_ms: durationMs,
        tool_uses: toolUses,
        token_count: tokenCount,
        note: 'Abnormally long task execution detected.'
      },
      dedup_key: createDedupKey(['task_completed', 'duration', agentName, durationMs >= 1800000 ? 'very-long' : 'long'])
    });
  }

  return candidates;
}

if (require.main === module) {
  const payload = JSON.parse(readStdin() || '{}');
  process.stdout.write(`${JSON.stringify(extractCandidates(payload))}\n`);
}

module.exports = {
  extractCandidates
};
