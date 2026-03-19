#!/usr/bin/env node
/**
 * Routing State Manager
 *
 * Persists session-scoped routing requirements between UserPromptSubmit,
 * PreToolUse(Agent), and PreToolUse(non-Agent) hooks.
 *
 * Usage:
 *   node routing-state-manager.js save <session-key>          # reads JSON from stdin
 *   node routing-state-manager.js get <session-key>
 *   node routing-state-manager.js check <session-key>
 *   node routing-state-manager.js clear <session-key>
 *   node routing-state-manager.js mark-cleared <session-key> [agent]
 *   node routing-state-manager.js mark-bypassed <session-key> [agent]
 *   node routing-state-manager.js clear-expired
 *
 * Legacy compatibility:
 *   node routing-state-manager.js save <agent> <blocked> <action>
 *
 * @version 2.0.0
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const LEGACY_STATE_FILE = path.join(os.homedir(), '.claude', 'routing-state.json');
const STATE_DIR = path.join(os.homedir(), '.claude', 'routing-state');
const STATE_TTL_SECONDS = Number.parseInt(process.env.ROUTING_STATE_TTL_SECONDS || '900', 10);
const ACTIVE_STATUSES = new Set(['pending']);

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function toBoolean(value) {
  return value === true || value === 'true' || value === 1 || value === '1';
}

function normalizeSessionKey(sessionKey) {
  const raw = String(sessionKey || process.env.CLAUDE_SESSION_ID || 'default-session').trim();
  return raw || 'default-session';
}

function sanitizeSessionKey(sessionKey) {
  return normalizeSessionKey(sessionKey).replace(/[^A-Za-z0-9._-]+/g, '_');
}

function ensureStateDir() {
  if (!fs.existsSync(STATE_DIR)) {
    fs.mkdirSync(STATE_DIR, { recursive: true });
  }
}

function getStateFile(sessionKey) {
  return path.join(STATE_DIR, `${sanitizeSessionKey(sessionKey)}.json`);
}

function normalizeClearanceAgents(value, fallbackAgent = null) {
  const raw = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : [];

  const agents = raw
    .map(agent => String(agent || '').trim())
    .filter(Boolean);

  if (agents.length === 0 && fallbackAgent) {
    agents.push(String(fallbackAgent).trim());
  }

  return [...new Set(agents)];
}

function normalizeState(sessionKey, state = {}, existing = null) {
  const timestamp = nowSeconds();
  const createdAt = Number.parseInt(state.created_at || state.createdAt || existing?.created_at || timestamp, 10);
  const status = String(state.status || existing?.status || 'pending').trim() || 'pending';
  const recommendedAgent = state.recommended_agent || state.agent || existing?.recommended_agent || existing?.agent || null;
  const clearanceAgents = normalizeClearanceAgents(
    state.clearance_agents || state.clearanceAgents || existing?.clearance_agents,
    recommendedAgent
  );
  const ttlSeconds = Number.parseInt(state.ttl_seconds || state.ttlSeconds || existing?.ttl_seconds || STATE_TTL_SECONDS, 10);
  const expiresAt = Number.parseInt(
    state.expires_at || state.expiresAt || existing?.expires_at || (timestamp + ttlSeconds),
    10
  );

  return {
    session_key: normalizeSessionKey(sessionKey),
    route_id: state.route_id || state.routeId || existing?.route_id || null,
    action: state.action || existing?.action || null,
    reason: state.reason || existing?.reason || null,
    recommended_agent: recommendedAgent,
    clearance_agents: clearanceAgents,
    mandatory: toBoolean(state.mandatory ?? existing?.mandatory),
    blocked: toBoolean(state.blocked ?? existing?.blocked),
    enforced_block: toBoolean(state.enforced_block ?? state.hard_blocked ?? existing?.enforced_block),
    override_applied: toBoolean(state.override_applied ?? existing?.override_applied),
    status,
    user_message_preview: state.user_message_preview || state.userMessagePreview || existing?.user_message_preview || null,
    created_at: createdAt,
    updated_at: timestamp,
    expires_at: expiresAt,
    ttl_seconds: ttlSeconds,
    last_resolved_agent: state.last_resolved_agent || state.lastResolvedAgent || existing?.last_resolved_agent || null
  };
}

function isExpired(state, timestamp = nowSeconds()) {
  if (!state) {
    return true;
  }

  const expiresAt = Number.parseInt(state.expires_at || state.expiresAt || 0, 10);
  if (Number.isFinite(expiresAt) && expiresAt > 0) {
    return timestamp >= expiresAt;
  }

  const createdAt = Number.parseInt(state.updated_at || state.created_at || state.timestamp || 0, 10);
  return createdAt <= 0 || (timestamp - createdAt) > STATE_TTL_SECONDS;
}

function readStateFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_error) {
    return null;
  }
}

function writeStateFile(filePath, state) {
  ensureStateDir();
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2));
  return state;
}

function saveState(sessionKey, state) {
  const normalized = normalizeState(sessionKey, state);
  return writeStateFile(getStateFile(sessionKey), normalized);
}

function getState(sessionKey) {
  const filePath = getStateFile(sessionKey);
  if (!fs.existsSync(filePath)) {
    return null;
  }

  const state = readStateFile(filePath);
  if (!state || isExpired(state)) {
    clearState(sessionKey);
    return null;
  }

  return state;
}

function updateStateStatus(sessionKey, status, updates = {}) {
  const current = getState(sessionKey);
  if (!current) {
    return null;
  }

  const nextState = normalizeState(sessionKey, {
    ...current,
    ...updates,
    status
  }, current);

  return writeStateFile(getStateFile(sessionKey), nextState);
}

function clearState(sessionKey) {
  const filePath = getStateFile(sessionKey);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

function clearExpiredStates() {
  if (!fs.existsSync(STATE_DIR)) {
    return { cleared: 0 };
  }

  let cleared = 0;
  for (const entry of fs.readdirSync(STATE_DIR)) {
    if (!entry.endsWith('.json')) {
      continue;
    }

    const filePath = path.join(STATE_DIR, entry);
    const state = readStateFile(filePath);
    if (!state || isExpired(state)) {
      fs.unlinkSync(filePath);
      cleared += 1;
    }
  }

  return { cleared };
}

function checkState(sessionKey) {
  const state = getState(sessionKey);
  if (!state) {
    return {
      hasState: false,
      pending: false,
      enforce: false,
      blocked: false,
      status: null,
      recommendedAgent: null,
      clearanceAgents: []
    };
  }

  const pending = ACTIVE_STATUSES.has(state.status);

  return {
    hasState: true,
    pending,
    enforce: pending && !toBoolean(state.override_applied),
    bypassed: state.status === 'bypassed' || toBoolean(state.override_applied),
    cleared: state.status === 'cleared',
    blocked: toBoolean(state.blocked),
    hardBlocked: toBoolean(state.enforced_block),
    mandatory: toBoolean(state.mandatory),
    status: state.status,
    routeId: state.route_id || null,
    action: state.action || null,
    recommendedAgent: state.recommended_agent || null,
    clearanceAgents: normalizeClearanceAgents(state.clearance_agents, state.recommended_agent),
    age: nowSeconds() - Number.parseInt(state.created_at || 0, 10),
    state
  };
}

function readJsonFromStdin() {
  try {
    if (process.stdin.isTTY) {
      return null;
    }

    const input = fs.readFileSync(0, 'utf8').trim();
    if (!input) {
      return null;
    }

    return JSON.parse(input);
  } catch (_error) {
    return null;
  }
}

function saveLegacyState(agent, blocked, action) {
  const payload = {
    recommended_agent: agent || null,
    blocked,
    action: action || 'BLOCKED',
    status: blocked ? 'pending' : 'cleared'
  };
  return saveState(process.env.CLAUDE_SESSION_ID || 'legacy-session', payload);
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'save': {
      const stdinJson = readJsonFromStdin();

      if (stdinJson) {
        const sessionKey = args[1] || stdinJson.session_key || stdinJson.sessionKey;
        console.log(JSON.stringify(saveState(sessionKey, stdinJson)));
        break;
      }

      const [agent, blockedRaw, action] = args.slice(1);
      const blocked = blockedRaw === 'true';
      console.log(JSON.stringify(saveLegacyState(agent, blocked, action)));
      break;
    }

    case 'get': {
      const sessionKey = args[1];
      console.log(JSON.stringify(getState(sessionKey) || { state: null }));
      break;
    }

    case 'clear': {
      const sessionKey = args[1];
      clearState(sessionKey);
      console.log(JSON.stringify({ cleared: true, session_key: normalizeSessionKey(sessionKey) }));
      break;
    }

    case 'check': {
      const sessionKey = args[1];
      console.log(JSON.stringify(checkState(sessionKey)));
      break;
    }

    case 'mark-cleared': {
      const sessionKey = args[1];
      const resolvedAgent = args[2] || null;
      const updated = updateStateStatus(sessionKey, 'cleared', { last_resolved_agent: resolvedAgent });
      console.log(JSON.stringify(updated || { updated: false }));
      break;
    }

    case 'mark-bypassed': {
      const sessionKey = args[1];
      const resolvedAgent = args[2] || null;
      const updated = updateStateStatus(sessionKey, 'bypassed', {
        override_applied: true,
        last_resolved_agent: resolvedAgent
      });
      console.log(JSON.stringify(updated || { updated: false }));
      break;
    }

    case 'clear-expired':
      console.log(JSON.stringify(clearExpiredStates()));
      break;

    default:
      console.error(`Unknown command: ${command}`);
      console.error('Usage: routing-state-manager.js <save|get|clear|check|mark-cleared|mark-bypassed|clear-expired> [args]');
      process.exit(1);
  }
}

module.exports = {
  LEGACY_STATE_FILE,
  STATE_DIR,
  STATE_TTL_SECONDS,
  sanitizeSessionKey,
  getStateFile,
  normalizeState,
  saveState,
  getState,
  updateStateStatus,
  clearState,
  clearExpiredStates,
  checkState
};
