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
 * Routing state is explicit-only on disk. Legacy aliases are no longer
 * normalized on read, so enforcement cannot silently depend on ambiguous
 * compatibility fields.
 *
 * Usage:
 *   node routing-state-manager.js save <session-key>          # reads JSON from stdin
 *   node routing-state-manager.js get <session-key>
 *   node routing-state-manager.js check <session-key>
 *   node routing-state-manager.js clear <session-key>
 *   node routing-state-manager.js mark-cleared <session-key> [agent]
 *   node routing-state-manager.js mark-bypassed <session-key> [agent]
 *   node routing-state-manager.js clear-expired
 *   node routing-state-manager.js record-projection-loss <session-key> <agent> [pattern]
 *   node routing-state-manager.js record-integrity-stop <session-key> <agent> <platform> <reason> [detail]
 *   node routing-state-manager.js projection-loss-count <session-key>
 *   node routing-state-manager.js clear-stale <session-key> <requested-family> [--threshold-seconds=N]
 *
 * @version 2.2.0
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const LEGACY_STATE_FILE = path.join(os.homedir(), '.claude', 'routing-state.json');
const STATE_DIR = path.join(os.homedir(), '.claude', 'routing-state');
const STATE_TTL_SECONDS = Number.parseInt(process.env.ROUTING_STATE_TTL_SECONDS || '300', 10);
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

// Agent family extraction — maps fully-qualified agent names (plugin:agent)
// to platform family strings for cross-family stale route detection.
const AGENT_FAMILY_MAP = {
  'opspal-salesforce': 'salesforce',
  'opspal-hubspot': 'hubspot',
  'opspal-marketo': 'marketo',
  'opspal-core': 'core',
  'opspal-gtm-planning': 'gtm',
  'opspal-okrs': 'okrs',
  'opspal-monday': 'monday',
  'opspal-data-hygiene': 'data-hygiene',
  'opspal-mcp-client': 'mcp-client',
  'opspal-ai-consult': 'ai-consult',
};

function extractAgentFamily(agentName) {
  if (!agentName || typeof agentName !== 'string') {
    return null;
  }
  const colonIdx = agentName.indexOf(':');
  if (colonIdx === -1) {
    return null;
  }
  const prefix = agentName.slice(0, colonIdx);
  return AGENT_FAMILY_MAP[prefix] ?? prefix;
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

function normalizeClearanceStatus(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) {
    return '';
  }

  switch (normalized) {
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

function normalizeRouteKind(routeKind, guidanceAction, executionBlockUntilCleared, hasAgent) {
  const explicit = String(routeKind || '').trim();
  if (explicit) {
    return explicit;
  }

  if (String(guidanceAction || '').trim() === 'require_intake') {
    return 'intake_specialist';
  }

  if (executionBlockUntilCleared) {
    return 'complexity_specialist';
  }

  if (hasAgent) {
    return 'advisory';
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
  const explicitClearanceStatus = normalizeClearanceStatus(
    state.clearance_status ||
    state.clearanceStatus ||
    existing?.clearance_status ||
    existing?.clearanceStatus
  );
  const requiredAgent = state.required_agent ||
    state.requiredAgent ||
    existing?.required_agent ||
    existing?.requiredAgent ||
    null;
  const clearanceAgents = normalizeClearanceAgents(
    state.clearance_agents ||
    state.clearanceAgents ||
    existing?.clearance_agents ||
    existing?.clearanceAgents,
    requiredAgent
  );
  const ttlSeconds = Number.parseInt(state.ttl_seconds || state.ttlSeconds || existing?.ttl_seconds || STATE_TTL_SECONDS, 10);
  const expiresAt = Number.parseInt(
    state.expires_at || state.expiresAt || existing?.expires_at || (timestamp + ttlSeconds),
    10
  );
  const overrideApplied = toBoolean(
    state.override_applied ??
    state.overrideApplied ??
    existing?.override_applied ??
    existing?.overrideApplied
  );
  const routingConfidence = normalizeRoutingConfidence(
    state.routing_confidence ?? state.routingConfidence,
    existing?.routing_confidence ?? existing?.routingConfidence
  );
  const explicitExecutionBlock = state.execution_block_until_cleared ??
    state.executionBlockUntilCleared ??
    existing?.execution_block_until_cleared ??
    existing?.executionBlockUntilCleared;
  const executionBlockUntilCleared = explicitExecutionBlock === undefined || explicitExecutionBlock === null
    ? false
    : toBoolean(explicitExecutionBlock);
  const explicitGuidanceAction = state.guidance_action ||
    state.guidanceAction ||
    existing?.guidance_action ||
    existing?.guidanceAction ||
    null;
  const routeKind = normalizeRouteKind(
    state.route_kind || state.routeKind || existing?.route_kind || existing?.routeKind,
    explicitGuidanceAction,
    executionBlockUntilCleared,
    Boolean(requiredAgent || clearanceAgents.length > 0)
  );
  const guidanceAction = normalizeGuidanceAction(
    explicitGuidanceAction,
    routeKind,
    executionBlockUntilCleared
  );
  const clearanceStatus = explicitClearanceStatus || (executionBlockUntilCleared && !overrideApplied ? 'pending_clearance' : 'cleared');
  const explicitRouteCleared = state.route_cleared ??
    state.routeCleared ??
    existing?.route_cleared ??
    existing?.routeCleared;
  const routeCleared = explicitRouteCleared === undefined || explicitRouteCleared === null
    ? clearanceStatus === 'cleared'
    : toBoolean(explicitRouteCleared);
  const explicitRoutePending = state.route_pending_clearance ??
    state.routePendingClearance ??
    existing?.route_pending_clearance ??
    existing?.routePendingClearance;
  const routePendingClearance = explicitRoutePending === undefined || explicitRoutePending === null
    ? clearanceStatus === 'pending_clearance'
    : toBoolean(explicitRoutePending);
  const explicitRequiresSpecialist = state.requires_specialist ??
    state.requiresSpecialist ??
    existing?.requires_specialist ??
    existing?.requiresSpecialist;
  const requiresSpecialist = explicitRequiresSpecialist === undefined || explicitRequiresSpecialist === null
    ? (executionBlockUntilCleared || guidanceAction === 'require_specialist' || guidanceAction === 'require_intake')
    : toBoolean(explicitRequiresSpecialist);
  const integrityStopActive = toBoolean(
    state.integrity_stop_active ??
    state.integrityStopActive ??
    existing?.integrity_stop_active ??
    existing?.integrityStopActive
  );
  const normalizedState = {
    session_key: normalizeSessionKey(sessionKey),
    route_id: state.route_id || state.routeId || existing?.route_id || existing?.routeId || null,
    route_kind: routeKind,
    guidance_action: guidanceAction,
    routing_reason: state.routing_reason || state.routingReason || existing?.routing_reason || existing?.routingReason || null,
    required_agent: requiredAgent,
    clearance_agents: clearanceAgents,
    requires_specialist: requiresSpecialist,
    prompt_guidance_only: toBoolean(
      state.prompt_guidance_only ??
      state.promptGuidanceOnly ??
      existing?.prompt_guidance_only ??
      existing?.promptGuidanceOnly ??
      true
    ),
    prompt_blocked: toBoolean(
      state.prompt_blocked ??
      state.promptBlocked ??
      existing?.prompt_blocked ??
      existing?.promptBlocked
    ),
    execution_block_until_cleared: executionBlockUntilCleared,
    route_pending_clearance: routePendingClearance,
    route_cleared: routeCleared,
    routing_confidence: routingConfidence,
    override_applied: overrideApplied,
    clearance_status: clearanceStatus,
    user_message_preview: state.user_message_preview || state.userMessagePreview || existing?.user_message_preview || existing?.userMessagePreview || null,
    handoff_prompt: state.handoff_prompt || state.handoffPrompt || existing?.handoff_prompt || existing?.handoffPrompt || null,
    created_at: createdAt,
    updated_at: timestamp,
    expires_at: expiresAt,
    ttl_seconds: ttlSeconds,
    last_resolved_agent: state.last_resolved_agent || state.lastResolvedAgent || existing?.last_resolved_agent || existing?.lastResolvedAgent || null,
    integrity_stop_active: integrityStopActive,
    integrity_stop_agent: state.integrity_stop_agent || state.integrityStopAgent || existing?.integrity_stop_agent || existing?.integrityStopAgent || null,
    integrity_stop_platform: state.integrity_stop_platform || state.integrityStopPlatform || existing?.integrity_stop_platform || existing?.integrityStopPlatform || null,
    integrity_stop_reason: state.integrity_stop_reason || state.integrityStopReason || existing?.integrity_stop_reason || existing?.integrityStopReason || null,
    integrity_stop_detail: state.integrity_stop_detail || state.integrityStopDetail || existing?.integrity_stop_detail || existing?.integrityStopDetail || null,
    integrity_stop_recorded_at: Number.parseInt(
      state.integrity_stop_recorded_at ||
      state.integrityStopRecordedAt ||
      existing?.integrity_stop_recorded_at ||
      existing?.integrityStopRecordedAt ||
      (integrityStopActive ? timestamp : 0),
      10
    ) || null,
    projection_loss_events: Array.isArray(state.projection_loss_events)
      ? state.projection_loss_events
      : Array.isArray(existing?.projection_loss_events)
        ? existing.projection_loss_events
        : [],
    projection_loss_circuit_broken: toBoolean(
      state.projection_loss_circuit_broken ??
      existing?.projection_loss_circuit_broken
    )
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
    process.stderr.write(`[routing-state-manager] State file parse failed at ${filePath}: ${_error.message}\n`);
    return null;
  }
}

function writeStateFile(filePath, state) {
  ensureStateDir();
  // Atomic write: write to temp file, fsync, then rename to avoid partial reads
  // from concurrent hook processes racing on the same session key.
  const tmpPath = `${filePath}.tmp.${process.pid}`;
  const data = JSON.stringify(state, null, 2);
  const fd = fs.openSync(tmpPath, 'w');
  try {
    fs.writeSync(fd, data);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmpPath, filePath);
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

  return normalizeState(sessionKey, state, state);
}

function updateStateStatus(sessionKey, status, updates = {}) {
  const current = getState(sessionKey);
  if (!current) {
    return null;
  }

  const nextClearanceStatus = normalizeClearanceStatus(status);
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
      route_cleared: true,
      integrity_stop_active: false,
      integrity_stop_agent: null,
      integrity_stop_platform: null,
      integrity_stop_reason: null,
      integrity_stop_detail: null,
      integrity_stop_recorded_at: null
    };
  } else if (nextClearanceStatus === 'bypassed') {
    derivedStatusUpdates = {
      clearance_status: nextClearanceStatus,
      route_pending_clearance: false,
      route_cleared: false,
      override_applied: true,
      integrity_stop_active: false,
      integrity_stop_agent: null,
      integrity_stop_platform: null,
      integrity_stop_reason: null,
      integrity_stop_detail: null,
      integrity_stop_recorded_at: null
    };
  }

  const nextState = normalizeState(sessionKey, {
    ...current,
    ...derivedStatusUpdates,
    ...updates
  }, current);

  return writeStateFile(getStateFile(sessionKey), nextState);
}

function clearState(sessionKey) {
  const filePath = getStateFile(sessionKey);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

function clearIfExplicitAgentOverridesRoute(sessionKey, explicitAgentId) {
  const state = getState(sessionKey);
  const normalizedAgent = String(explicitAgentId || '').trim();

  if (!state) {
    return { cleared: false, reason: 'no_state' };
  }

  if (!toBoolean(state.route_pending_clearance)) {
    return { cleared: false, reason: 'route_not_pending', requiredAgent: state.required_agent || null };
  }

  if (!normalizedAgent) {
    return { cleared: false, reason: 'missing_explicit_agent', requiredAgent: state.required_agent || null };
  }

  if ((state.required_agent || null) === normalizedAgent) {
    return { cleared: false, reason: 'matches_required_agent', requiredAgent: state.required_agent || null };
  }

  const clearanceAgents = normalizeClearanceAgents(state.clearance_agents, state.required_agent);
  if (!clearanceAgents.includes(normalizedAgent)) {
    return {
      cleared: false,
      reason: 'agent_not_in_clearance_list',
      requiredAgent: state.required_agent || null,
      clearanceAgents
    };
  }

  const updated = updateStateStatus(sessionKey, 'cleared', {
    last_resolved_agent: normalizedAgent
  });

  return {
    cleared: true,
    reason: 'explicit_agent_override',
    requiredAgent: state.required_agent || null,
    clearedAgent: normalizedAgent,
    clearanceAgents,
    state: updated
  };
}

// Cross-family stale route detection and clearing.
// Clears pending routing state when:
//   1. The pending state's agent family differs from the requested family
//   2. The state is older than the same-workflow threshold (default 300s / 5 min)
// This prevents stale routes from one platform (e.g., Marketo) from blocking
// unrelated tasks in another platform (e.g., Salesforce).
const CROSS_FAMILY_STALE_THRESHOLD_SECONDS = Number.parseInt(
  process.env.ROUTING_CROSS_FAMILY_STALE_THRESHOLD_SECONDS || '300', 10
);

function clearStaleIfCrossFamily(sessionKey, requestedFamily, options = {}) {
  const thresholdSeconds = options.thresholdSeconds ?? CROSS_FAMILY_STALE_THRESHOLD_SECONDS;
  const state = getState(sessionKey);

  if (!state) {
    return { cleared: false, reason: 'no_state' };
  }

  const pendingAgent = state.required_agent || (state.clearance_agents || [])[0] || null;
  const pendingFamily = extractAgentFamily(pendingAgent);

  if (!pendingFamily || !requestedFamily) {
    return { cleared: false, reason: 'family_unknown', pendingFamily, requestedFamily };
  }

  if (pendingFamily === requestedFamily) {
    return { cleared: false, reason: 'same_family', pendingFamily, requestedFamily };
  }

  const stateAgeSeconds = nowSeconds() - Number.parseInt(state.created_at || 0, 10);
  if (stateAgeSeconds < thresholdSeconds) {
    return {
      cleared: false,
      reason: 'too_recent_for_auto_clear',
      pendingFamily,
      requestedFamily,
      stateAgeSeconds,
      thresholdSeconds
    };
  }

  clearState(sessionKey);
  return {
    cleared: true,
    reason: 'cross_family_stale_carryover',
    pendingFamily,
    requestedFamily,
    stateAgeSeconds
  };
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
      integrityStopActive: false,
      integrityStopAgent: null,
      integrityStopPlatform: null,
      integrityStopReason: null,
      integrityStopDetail: null,
      integrityStopRecordedAt: null,
      routePendingClearance: false,
      routeCleared: false,
      clearanceStatus: null,
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

  const clearanceStatus = normalizeClearanceStatus(state.clearance_status) || 'cleared';
  const lastResolvedAgent = state.last_resolved_agent || state.lastResolvedAgent || null;
  const routePendingClearance = toBoolean(state.route_pending_clearance) || ACTIVE_CLEARANCE_STATUSES.has(clearanceStatus);
  const routeCleared = toBoolean(state.route_cleared) || clearanceStatus === 'cleared';
  const overrideApplied = toBoolean(state.override_applied);
  const executionBlockUntilCleared = toBoolean(state.execution_block_until_cleared);
  const executionBlockActive = routePendingClearance && executionBlockUntilCleared && !overrideApplied;
  const integrityStopActive = toBoolean(state.integrity_stop_active);
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
    integrityStopActive,
    integrityStopAgent: state.integrity_stop_agent || null,
    integrityStopPlatform: state.integrity_stop_platform || null,
    integrityStopReason: state.integrity_stop_reason || null,
    integrityStopDetail: state.integrity_stop_detail || null,
    integrityStopRecordedAt: state.integrity_stop_recorded_at || null,
    routePendingClearance,
    routeCleared,
    bypassed: clearanceStatus === 'bypassed' || overrideApplied,
    cleared: routeCleared,
    clearanceStatus,
    routeId: state.route_id || null,
    routeKind: state.route_kind || null,
    guidanceAction: state.guidance_action || null,
    routingReason: state.routing_reason || null,
    requiredAgent: state.required_agent || null,
    clearanceAgents: normalizeClearanceAgents(state.clearance_agents, state.required_agent),
    routingConfidence: normalizeRoutingConfidence(state.routing_confidence),
    overrideApplied,
    lastResolvedAgent,
    autoDelegation,
    age: nowSeconds() - Number.parseInt(state.created_at || 0, 10),
    state
  };
}

function recordProjectionLossEvent(sessionKey, agentName, pattern) {
  const current = getState(sessionKey);
  const events = current?.projection_loss_events ?? [];
  events.push({
    agent: agentName || 'unknown',
    pattern: pattern || 'unknown',
    timestamp: nowSeconds()
  });
  const updates = {
    projection_loss_events: events
  };
  // Circuit-break: two or more events with different agent names
  if (events.length >= 2) {
    const uniqueAgents = new Set(events.map(e => e.agent).filter(a => a !== 'unknown'));
    if (uniqueAgents.size >= 2) {
      updates.projection_loss_circuit_broken = true;
    }
  }
  if (current) {
    const nextState = normalizeState(sessionKey, { ...current, ...updates }, current);
    writeStateFile(getStateFile(sessionKey), nextState);
    return nextState;
  }
  // No existing state — create minimal state with projection-loss data
  const newState = normalizeState(sessionKey, updates);
  writeStateFile(getStateFile(sessionKey), newState);
  return newState;
}

function recordIntegrityStop(sessionKey, agentName, platform, reason, detail) {
  const current = getState(sessionKey);
  const timestamp = nowSeconds();
  const requiredAgent = agentName || current?.required_agent || null;
  const clearanceAgents = normalizeClearanceAgents(current?.clearance_agents, requiredAgent);
  const updates = {
    session_key: normalizeSessionKey(sessionKey),
    required_agent: requiredAgent,
    clearance_agents: clearanceAgents,
    route_kind: current?.route_kind || 'investigation_integrity_stop',
    guidance_action: current?.guidance_action || 'require_specialist',
    routing_reason: reason || current?.routing_reason || 'investigation_integrity_stop',
    requires_specialist: current?.requires_specialist ?? true,
    prompt_guidance_only: current?.prompt_guidance_only ?? true,
    prompt_blocked: current?.prompt_blocked ?? false,
    execution_block_until_cleared: current?.execution_block_until_cleared ?? false,
    route_pending_clearance: current?.route_pending_clearance ?? false,
    route_cleared: current?.route_cleared ?? true,
    clearance_status: current?.clearance_status || 'cleared',
    last_resolved_agent: current?.last_resolved_agent || requiredAgent,
    integrity_stop_active: true,
    integrity_stop_agent: agentName || current?.integrity_stop_agent || requiredAgent,
    integrity_stop_platform: platform || current?.integrity_stop_platform || null,
    integrity_stop_reason: reason || current?.integrity_stop_reason || 'investigation_integrity_stop',
    integrity_stop_detail: detail || current?.integrity_stop_detail || null,
    integrity_stop_recorded_at: timestamp
  };

  if (current) {
    const nextState = normalizeState(sessionKey, { ...current, ...updates }, current);
    writeStateFile(getStateFile(sessionKey), nextState);
    return nextState;
  }

  const newState = normalizeState(sessionKey, updates);
  writeStateFile(getStateFile(sessionKey), newState);
  return newState;
}

function getProjectionLossCount(sessionKey) {
  const current = getState(sessionKey);
  return current?.projection_loss_events?.length ?? 0;
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

      console.error('routing-state-manager.js save requires JSON on stdin');
      process.exit(1);
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

    case 'record-projection-loss': {
      const sessionKey = args[1];
      const agentName = args[2] || 'unknown';
      const pattern = args[3] || 'unknown';
      const updated = recordProjectionLossEvent(sessionKey, agentName, pattern);
      console.log(JSON.stringify({
        recorded: true,
        count: updated?.projection_loss_events?.length ?? 1,
        circuit_broken: updated?.projection_loss_circuit_broken ?? false
      }));
      break;
    }

    case 'projection-loss-count': {
      const sessionKey = args[1];
      const count = getProjectionLossCount(sessionKey);
      console.log(JSON.stringify({ count }));
      break;
    }

    case 'record-integrity-stop': {
      const sessionKey = args[1];
      const agentName = args[2] || 'unknown';
      const platform = args[3] || 'unknown';
      const reason = args[4] || 'investigation_integrity_stop';
      const detail = args[5] || '';
      const updated = recordIntegrityStop(sessionKey, agentName, platform, reason, detail);
      console.log(JSON.stringify({
        recorded: true,
        integrity_stop_active: updated?.integrity_stop_active ?? false,
        integrity_stop_agent: updated?.integrity_stop_agent ?? null,
        integrity_stop_platform: updated?.integrity_stop_platform ?? null,
        integrity_stop_reason: updated?.integrity_stop_reason ?? null
      }));
      break;
    }

    case 'clear-stale': {
      const sessionKey = args[1];
      const requestedFamily = args[2] || null;
      const thresholdArg = args.find(a => a.startsWith('--threshold-seconds='));
      const thresholdSeconds = thresholdArg
        ? Number.parseInt(thresholdArg.split('=')[1], 10)
        : undefined;
      console.log(JSON.stringify(clearStaleIfCrossFamily(sessionKey, requestedFamily, { thresholdSeconds })));
      break;
    }

    case 'clear-explicit-override': {
      const sessionKey = args[1];
      const explicitAgentId = args[2] || null;
      console.log(JSON.stringify(clearIfExplicitAgentOverridesRoute(sessionKey, explicitAgentId)));
      break;
    }

    default:
      console.error(`Unknown command: ${command}`);
      console.error('Usage: routing-state-manager.js <save|get|clear|check|mark-cleared|mark-bypassed|clear-expired|clear-stale|clear-explicit-override|record-projection-loss|record-integrity-stop|projection-loss-count> [args]');
      process.exit(1);
  }
}

module.exports = {
  LEGACY_STATE_FILE,
  STATE_DIR,
  STATE_TTL_SECONDS,
  AGENT_FAMILY_MAP,
  CROSS_FAMILY_STALE_THRESHOLD_SECONDS,
  sanitizeSessionKey,
  getStateFile,
  extractAgentFamily,
  normalizeState,
  saveState,
  getState,
  updateStateStatus,
  clearState,
  clearIfExplicitAgentOverridesRoute,
  clearStaleIfCrossFamily,
  clearExpiredStates,
  checkState,
  recordIntegrityStop,
  recordProjectionLossEvent,
  getProjectionLossCount
};
