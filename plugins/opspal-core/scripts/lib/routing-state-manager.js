#!/usr/bin/env node
/**
 * Routing State Manager
 *
 * Persists session-scoped routing requirements between UserPromptSubmit,
 * PreToolUse(Agent), and PreToolUse(non-Agent) hooks.
 *
 * Routing state is explicitly split into:
 * - prompt-time guidance semantics
 * - execution-time specialist enforcement semantics
 *
 * Ambiguous legacy fields such as blocked/action/recommended_agent are still
 * translated on read, but new state is written with explicit names so future
 * consumers cannot accidentally recreate prompt-time routing blocks.
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
const ACTIVE_CLEARANCE_STATUSES = new Set(['pending_clearance']);
const AUTO_DELEGATION_MIN_CONFIDENCE = Number.parseFloat(
  process.env.ROUTING_AUTO_DELEGATION_MIN_CONFIDENCE || '0.95'
);

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

function normalizeLegacyStatus(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) {
    return '';
  }

  switch (normalized) {
    case 'pending':
    case 'pending_clearance':
      return 'pending_clearance';
    case 'cleared':
      return 'cleared';
    case 'bypassed':
      return 'bypassed';
    default:
      return '';
  }
}

function normalizeRouteKind(routeKind, legacyAction, mandatory, executionBlockUntilCleared) {
  const explicit = String(routeKind || '').trim();
  if (explicit) {
    return explicit;
  }

  if (mandatory) {
    return 'mandatory_specialist';
  }

  const action = String(legacyAction || '').trim().toUpperCase();
  if (action === 'INTAKE_REQUIRED') {
    return 'intake_specialist';
  }

  if (executionBlockUntilCleared) {
    return 'complexity_specialist';
  }

  return 'advisory';
}

function normalizeGuidanceAction(guidanceAction, routeKind, executionBlockUntilCleared) {
  const explicit = String(guidanceAction || '').trim();
  if (explicit) {
    return explicit;
  }

  switch (routeKind) {
    case 'mandatory_specialist':
      return 'require_specialist';
    case 'intake_specialist':
      return 'require_intake';
    default:
      if (executionBlockUntilCleared) {
        return 'require_specialist';
      }
      return 'recommend_specialist';
  }
}

function normalizeRoutingConfidence(value, existing = 0) {
  const parsed = Number.parseFloat(value ?? existing ?? 0);
  if (!Number.isFinite(parsed)) {
    return 0;
  }

  if (parsed < 0) return 0;
  if (parsed > 1) return 1;
  return parsed;
}

function normalizeAutoDelegation(state = {}, fallback = {}) {
  const current = state.auto_delegation || state.autoDelegation || fallback.auto_delegation || fallback.autoDelegation || {};
  const agent = current.agent || current.required_agent || fallback.required_agent || fallback.requiredAgent || null;
  const confidence = normalizeRoutingConfidence(
    current.confidence,
    fallback.routing_confidence || fallback.routingConfidence || 0
  );
  const eligible = toBoolean(
    current.eligible ??
    current.enabled ??
    (fallback.route_kind === 'mandatory_specialist' && agent && confidence >= AUTO_DELEGATION_MIN_CONFIDENCE)
  );
  const active = toBoolean(current.active ?? (eligible && fallback.route_pending_clearance && !fallback.override_applied));
  let status = String(current.status || '').trim();
  if (!status) {
    if (fallback.clearance_status === 'cleared') {
      status = 'cleared';
    } else if (fallback.clearance_status === 'bypassed') {
      status = 'bypassed';
    } else if (active) {
      status = 'pending';
    } else if (eligible) {
      status = 'ready';
    } else {
      status = 'disabled';
    }
  }

  return {
    eligible,
    active,
    mode: String(current.mode || (eligible ? 'agent_rewrite_bridge' : 'disabled')).trim(),
    agent,
    confidence,
    handoff_prompt: current.handoff_prompt || current.handoffPrompt || fallback.handoff_prompt || null,
    status
  };
}

function normalizeState(sessionKey, state = {}, existing = null) {
  const timestamp = nowSeconds();
  const createdAt = Number.parseInt(state.created_at || state.createdAt || existing?.created_at || timestamp, 10);
  const legacyStatus = normalizeLegacyStatus(state.clearance_status || state.clearanceStatus || state.status || existing?.clearance_status || existing?.status);
  const requiredAgent = state.required_agent || state.requiredAgent ||
    state.recommended_agent || state.recommendedAgent ||
    state.agent || existing?.required_agent || existing?.recommended_agent || existing?.agent || null;
  const clearanceAgents = normalizeClearanceAgents(
    state.clearance_agents || state.clearanceAgents || existing?.clearance_agents,
    requiredAgent
  );
  const ttlSeconds = Number.parseInt(state.ttl_seconds || state.ttlSeconds || existing?.ttl_seconds || STATE_TTL_SECONDS, 10);
  const expiresAt = Number.parseInt(
    state.expires_at || state.expiresAt || existing?.expires_at || (timestamp + ttlSeconds),
    10
  );
  const overrideApplied = toBoolean(state.override_applied ?? existing?.override_applied);
  const routingConfidence = normalizeRoutingConfidence(
    state.routing_confidence ?? state.routingConfidence,
    existing?.routing_confidence ?? existing?.routingConfidence
  );
  const explicitExecutionBlock = state.execution_block_until_cleared ?? state.executionBlockUntilCleared;
  const legacyAction = state.action || existing?.action || null;
  const legacyMandatory = toBoolean(state.mandatory ?? existing?.mandatory);
  const explicitExecutionBlockValue = explicitExecutionBlock === undefined
    ? null
    : toBoolean(explicitExecutionBlock);
  const executionBlockUntilCleared = explicitExecutionBlockValue !== null
    ? explicitExecutionBlockValue
    : (
      toBoolean(state.execution_block_until_cleared ?? existing?.execution_block_until_cleared) ||
      toBoolean(state.enforced_block ?? state.hard_blocked ?? existing?.enforced_block) ||
      toBoolean(state.blocked ?? existing?.blocked) ||
      legacyMandatory ||
      ['BLOCKED', 'INTAKE_REQUIRED', 'MANDATORY_BLOCKED', 'MANDATORY_ALERT'].includes(String(legacyAction || '').trim().toUpperCase())
    );
  const routeKind = normalizeRouteKind(
    state.route_kind || state.routeKind || existing?.route_kind,
    legacyAction,
    legacyMandatory,
    executionBlockUntilCleared
  );
  const clearanceStatus = legacyStatus || (executionBlockUntilCleared && !overrideApplied ? 'pending_clearance' : 'cleared');
  const explicitRouteCleared = state.route_cleared ?? state.routeCleared ?? existing?.route_cleared;
  const routeCleared = explicitRouteCleared === undefined || explicitRouteCleared === null
    ? clearanceStatus === 'cleared'
    : toBoolean(explicitRouteCleared);
  const explicitRoutePending = state.route_pending_clearance ?? state.routePendingClearance ?? existing?.route_pending_clearance;
  const routePendingClearance = explicitRoutePending === undefined || explicitRoutePending === null
    ? clearanceStatus === 'pending_clearance'
    : toBoolean(explicitRoutePending);
  const requiresSpecialist = toBoolean(
    state.requires_specialist ??
    state.requiresSpecialist ??
    existing?.requires_specialist ??
    existing?.requiresSpecialist ??
    executionBlockUntilCleared
  );
  const guidanceAction = normalizeGuidanceAction(
    state.guidance_action || state.guidanceAction || existing?.guidance_action,
    routeKind,
    executionBlockUntilCleared
  );
  const normalizedState = {
    session_key: normalizeSessionKey(sessionKey),
    route_id: state.route_id || state.routeId || existing?.route_id || null,
    route_kind: routeKind,
    guidance_action: guidanceAction,
    routing_reason: state.routing_reason || state.routingReason || state.reason || existing?.routing_reason || existing?.reason || null,
    required_agent: requiredAgent,
    clearance_agents: clearanceAgents,
    requires_specialist: requiresSpecialist,
    prompt_guidance_only: toBoolean(state.prompt_guidance_only ?? state.promptGuidanceOnly ?? existing?.prompt_guidance_only ?? true),
    prompt_blocked: toBoolean(state.prompt_blocked ?? state.promptBlocked ?? existing?.prompt_blocked),
    execution_block_until_cleared: executionBlockUntilCleared,
    route_pending_clearance: routePendingClearance,
    route_cleared: routeCleared,
    routing_confidence: routingConfidence,
    override_applied: overrideApplied,
    clearance_status: clearanceStatus,
    status: clearanceStatus === 'pending_clearance' ? 'pending' : clearanceStatus,
    user_message_preview: state.user_message_preview || state.userMessagePreview || existing?.user_message_preview || null,
    handoff_prompt: state.handoff_prompt || state.handoffPrompt || existing?.handoff_prompt || null,
    created_at: createdAt,
    updated_at: timestamp,
    expires_at: expiresAt,
    ttl_seconds: ttlSeconds,
    last_resolved_agent: state.last_resolved_agent || state.lastResolvedAgent || existing?.last_resolved_agent || null,
    action: legacyAction,
    recommended_agent: requiredAgent,
    mandatory: legacyMandatory,
    enforced_block: toBoolean(state.enforced_block ?? state.hard_blocked ?? existing?.enforced_block),
    blocked: false
  };
  normalizedState.auto_delegation = normalizeAutoDelegation(state, normalizedState);

  return normalizedState;
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

  const nextClearanceStatus = normalizeLegacyStatus(status);
  let derivedStatusUpdates = {};
  if (nextClearanceStatus === 'pending_clearance') {
    derivedStatusUpdates = {
      clearance_status: nextClearanceStatus,
      route_pending_clearance: true,
      route_cleared: false,
      override_applied: false
    };
  } else if (nextClearanceStatus === 'cleared') {
    derivedStatusUpdates = {
      clearance_status: nextClearanceStatus,
      route_pending_clearance: false,
      route_cleared: true
    };
  } else if (nextClearanceStatus === 'bypassed') {
    derivedStatusUpdates = {
      clearance_status: nextClearanceStatus,
      route_pending_clearance: false,
      route_cleared: false,
      override_applied: true
    };
  }

  const nextState = normalizeState(sessionKey, {
    ...current,
    ...derivedStatusUpdates,
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
      promptGuidanceOnly: false,
      promptBlocked: false,
      requiresSpecialist: false,
      executionBlockUntilCleared: false,
      executionBlockActive: false,
      routePendingClearance: false,
      routeCleared: false,
      clearanceStatus: null,
      status: null,
      requiredAgent: null,
      clearanceAgents: [],
      routeId: null,
      routeKind: null,
      guidanceAction: null,
      routingReason: null,
      routingConfidence: 0,
      autoDelegation: {
        eligible: false,
        active: false,
        mode: 'disabled',
        agent: null,
        confidence: 0,
        handoff_prompt: null,
        status: 'disabled'
      }
    };
  }

  const clearanceStatus = normalizeLegacyStatus(state.clearance_status || state.status) || 'cleared';
  const routePendingClearance = toBoolean(state.route_pending_clearance) || ACTIVE_CLEARANCE_STATUSES.has(clearanceStatus);
  const routeCleared = toBoolean(state.route_cleared) || clearanceStatus === 'cleared';
  const overrideApplied = toBoolean(state.override_applied);
  const executionBlockUntilCleared = toBoolean(state.execution_block_until_cleared);
  const executionBlockActive = routePendingClearance && executionBlockUntilCleared && !overrideApplied;
  const autoDelegation = normalizeAutoDelegation(state, {
    ...state,
    route_pending_clearance: routePendingClearance,
    override_applied: overrideApplied,
    clearance_status: clearanceStatus
  });

  return {
    hasState: true,
    promptGuidanceOnly: toBoolean(state.prompt_guidance_only ?? true),
    promptBlocked: toBoolean(state.prompt_blocked),
    requiresSpecialist: toBoolean(state.requires_specialist),
    executionBlockUntilCleared,
    executionBlockActive,
    routePendingClearance,
    routeCleared,
    bypassed: clearanceStatus === 'bypassed' || overrideApplied,
    cleared: routeCleared,
    clearanceStatus,
    status: state.status,
    routeId: state.route_id || null,
    routeKind: state.route_kind || null,
    guidanceAction: state.guidance_action || null,
    routingReason: state.routing_reason || null,
    requiredAgent: state.required_agent || state.recommended_agent || null,
    clearanceAgents: normalizeClearanceAgents(state.clearance_agents, state.recommended_agent),
    routingConfidence: normalizeRoutingConfidence(state.routing_confidence),
    overrideApplied,
    autoDelegation,
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
    required_agent: agent || null,
    execution_block_until_cleared: blocked,
    route_pending_clearance: blocked,
    route_cleared: !blocked,
    guidance_action: blocked ? 'require_specialist' : 'recommend_specialist',
    route_kind: blocked ? 'complexity_specialist' : 'advisory',
    clearance_status: blocked ? 'pending_clearance' : 'cleared',
    action: action || 'BLOCKED'
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
