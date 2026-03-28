'use strict';

const path = require('path');

const {
  createDedupKey,
  nowIso,
  readJsonl,
  readStdin,
  sanitizeString
} = require('../utils');

const SUBAGENT_STOP_LOG = path.join(process.env.HOME || require('os').homedir(), '.claude', 'logs', 'subagent-stops.jsonl');

function countRecentFailures(agentName) {
  const oneHourAgo = Date.now() - (60 * 60 * 1000);
  return readJsonl(SUBAGENT_STOP_LOG).filter(entry => {
    return entry.agent === agentName && Date.parse(entry.timestamp) >= oneHourAgo;
  }).length;
}

function extractCandidates(payload) {
  const success = payload?.success;
  if (success === true || success === 'true') {
    return [];
  }

  const agentName = payload?.agent_type || payload?.subagent_type || payload?.agent_name || 'unknown';
  const errorMessage = payload?.error || payload?.error_message || payload?.reason || 'Subagent failed.';
  const recentFailures = countRecentFailures(agentName);
  const wrongAgentSuspected = /\bwrong agent|wrong specialist|unsupported agent|reroute|misrouted\b/i.test(errorMessage);

  return [{
    source: 'subagent_stop',
    category: 'issue',
    priority: recentFailures >= 3 ? 'immediate' : 'high',
    captured_at: nowIso(),
    raw: {
      agent: sanitizeString(agentName, 100),
      error: sanitizeString(errorMessage, 160),
      duration_ms: Number(payload?.duration_ms || payload?.task_duration_ms || 0) || 0,
      recent_failures_hour: recentFailures,
      wrong_agent_suspected: wrongAgentSuspected
    },
    dedup_key: createDedupKey(['subagent_stop', agentName, errorMessage])
  }];
}

if (require.main === module) {
  const payload = JSON.parse(readStdin() || '{}');
  process.stdout.write(`${JSON.stringify(extractCandidates(payload))}\n`);
}

module.exports = {
  extractCandidates
};
