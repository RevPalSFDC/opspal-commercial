'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const LOG_DIR = path.join(os.homedir(), '.claude', 'logs');
const LEGACY_COMPAT_LOG = path.join(LOG_DIR, 'routing-legacy-compat.jsonl');

const LEGACY_ACTION_SEMANTICS = {
  ALLOWED: {
    guidanceAction: 'recommend_specialist',
    routeKind: 'advisory',
    executionBlockUntilCleared: false
  },
  AVAILABLE: {
    guidanceAction: 'recommend_specialist',
    routeKind: 'advisory',
    executionBlockUntilCleared: false
  },
  BLOCKED: {
    guidanceAction: 'require_specialist',
    routeKind: 'complexity_specialist',
    executionBlockUntilCleared: true
  },
  DEPLOYMENT_HANDOFF: {
    guidanceAction: 'recommend_specialist',
    routeKind: 'deployment_handoff',
    executionBlockUntilCleared: false
  },
  DIRECT_OK: {
    guidanceAction: 'recommend_specialist',
    routeKind: 'advisory',
    executionBlockUntilCleared: false
  },
  INTAKE_REQUIRED: {
    guidanceAction: 'require_intake',
    routeKind: 'intake_specialist',
    executionBlockUntilCleared: true
  },
  MANDATORY_ALERT: {
    guidanceAction: 'require_specialist',
    routeKind: 'mandatory_specialist',
    executionBlockUntilCleared: true
  },
  MANDATORY_BLOCKED: {
    guidanceAction: 'require_specialist',
    routeKind: 'mandatory_specialist',
    executionBlockUntilCleared: true
  },
  RECOMMENDED: {
    guidanceAction: 'recommend_specialist',
    routeKind: 'advisory',
    executionBlockUntilCleared: false
  }
};

function toBoolean(value) {
  return value === true || value === 'true' || value === 1 || value === '1';
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (value === undefined || value === null) {
      continue;
    }

    const normalized = String(value).trim();
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function firstBoolean(...values) {
  for (const value of values) {
    if (value === undefined || value === null || value === '') {
      continue;
    }

    return toBoolean(value);
  }

  return null;
}

function firstNumber(...values) {
  for (const value of values) {
    if (value === undefined || value === null || value === '') {
      continue;
    }

    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function recordLegacyRoutingCompatibility({
  source = 'unknown',
  fields = [],
  context = {}
} = {}) {
  const uniqueFields = [...new Set((fields || []).filter(Boolean))];
  if (uniqueFields.length === 0) {
    return [];
  }

  try {
    ensureLogDir();
    const entry = {
      timestamp: new Date().toISOString(),
      source,
      fields: uniqueFields,
      context
    };
    fs.appendFileSync(LEGACY_COMPAT_LOG, JSON.stringify(entry) + '\n');
  } catch (_error) {
    // Compatibility telemetry must never disrupt routing behavior.
  }

  return uniqueFields;
}

function getRoutingPayload(entry = {}) {
  if (entry && typeof entry.output === 'object' && entry.output !== null) {
    return entry.output;
  }

  return entry;
}

function getLegacyActionSemantics(value) {
  const normalized = String(value || '').trim().toUpperCase();
  return LEGACY_ACTION_SEMANTICS[normalized] || null;
}

function resolveRoutingSemantics(entry = {}, options = {}) {
  const { allowLegacy = false, source = 'unknown' } = options;
  const payload = getRoutingPayload(entry);
  const legacyFields = new Set();

  const explicitRequiredAgent = firstNonEmpty(
    payload.requiredAgent,
    payload.required_agent,
    entry.requiredAgent,
    entry.required_agent
  );
  const explicitSuggestedAgent = firstNonEmpty(
    payload.suggestedAgent,
    payload.suggested_agent,
    payload.selectedAgent,
    payload.selected_agent,
    payload.agent,
    entry.suggestedAgent,
    entry.suggested_agent,
    entry.selectedAgent,
    entry.selected_agent,
    entry.agent
  );

  let legacyRecommendedAgent = null;
  if (allowLegacy && (!explicitRequiredAgent || !explicitSuggestedAgent)) {
    legacyRecommendedAgent = firstNonEmpty(
      payload.recommendedAgent,
      payload.recommended_agent,
      entry.recommendedAgent,
      entry.recommended_agent
    );
    if (legacyRecommendedAgent) {
      legacyFields.add('recommended_agent');
    }
  }

  const explicitGuidanceAction = firstNonEmpty(
    payload.guidanceAction,
    payload.guidance_action,
    entry.guidanceAction,
    entry.guidance_action
  );
  const explicitRouteKind = firstNonEmpty(
    payload.routeKind,
    payload.route_kind,
    entry.routeKind,
    entry.route_kind
  );
  const explicitExecutionBlock = firstBoolean(
    payload.executionBlockUntilCleared,
    payload.execution_block_until_cleared,
    entry.executionBlockUntilCleared,
    entry.execution_block_until_cleared
  );
  const explicitPromptGuidanceOnly = firstBoolean(
    payload.promptGuidanceOnly,
    payload.prompt_guidance_only,
    entry.promptGuidanceOnly,
    entry.prompt_guidance_only
  );
  const explicitPromptBlocked = firstBoolean(
    payload.promptBlocked,
    payload.prompt_blocked,
    entry.promptBlocked,
    entry.prompt_blocked
  );
  const explicitRequiresSpecialist = firstBoolean(
    payload.requiresSpecialist,
    payload.requires_specialist,
    entry.requiresSpecialist,
    entry.requires_specialist
  );
  const explicitRoutePending = firstBoolean(
    payload.routePendingClearance,
    payload.route_pending_clearance,
    entry.routePendingClearance,
    entry.route_pending_clearance
  );
  const explicitRouteCleared = firstBoolean(
    payload.routeCleared,
    payload.route_cleared,
    entry.routeCleared,
    entry.route_cleared
  );
  const explicitClearanceStatus = firstNonEmpty(
    payload.clearanceStatus,
    payload.clearance_status,
    entry.clearanceStatus,
    entry.clearance_status
  );
  const explicitRoutingConfidence = firstNumber(
    payload.routingConfidence,
    payload.routing_confidence,
    entry.routingConfidence,
    entry.routing_confidence
  );

  let legacyAction = null;
  if (allowLegacy && (!explicitGuidanceAction || !explicitRouteKind || explicitExecutionBlock === null)) {
    legacyAction = firstNonEmpty(
      payload.routingActionType,
      payload.routing_action_type,
      entry.routingActionType,
      entry.routing_action_type
    );
    if (legacyAction) {
      legacyFields.add('routingActionType');
    } else {
      legacyAction = firstNonEmpty(payload.action, entry.action);
      if (legacyAction) {
        legacyFields.add('action');
      }
    }
  }

  const mappedLegacyAction = getLegacyActionSemantics(legacyAction);

  let executionBlockUntilCleared = explicitExecutionBlock;
  if (executionBlockUntilCleared === null) {
    if (explicitRoutePending === true) {
      executionBlockUntilCleared = true;
    } else if (mappedLegacyAction) {
      executionBlockUntilCleared = mappedLegacyAction.executionBlockUntilCleared;
    } else if (allowLegacy) {
      const legacyBlocked = firstBoolean(payload.blocked, entry.blocked);
      if (legacyBlocked !== null) {
        executionBlockUntilCleared = legacyBlocked;
        legacyFields.add('blocked');
      }
    }
  }
  if (executionBlockUntilCleared === null) {
    executionBlockUntilCleared = false;
  }

  let guidanceAction = explicitGuidanceAction || mappedLegacyAction?.guidanceAction || null;
  let routeKind = explicitRouteKind || mappedLegacyAction?.routeKind || null;
  let requiredAgent = explicitRequiredAgent;
  let suggestedAgent = explicitSuggestedAgent;

  if (!requiredAgent && legacyRecommendedAgent && executionBlockUntilCleared) {
    requiredAgent = legacyRecommendedAgent;
  }
  if (!suggestedAgent) {
    suggestedAgent = explicitRequiredAgent || legacyRecommendedAgent || null;
  }

  if (!guidanceAction) {
    guidanceAction = executionBlockUntilCleared ? 'require_specialist' : 'recommend_specialist';
  }
  if (!routeKind) {
    if (guidanceAction === 'require_intake') {
      routeKind = 'intake_specialist';
    } else if (executionBlockUntilCleared) {
      routeKind = 'complexity_specialist';
    } else if (requiredAgent || suggestedAgent) {
      routeKind = 'advisory';
    }
  }

  let requiresSpecialist = explicitRequiresSpecialist;
  if (requiresSpecialist === null) {
    requiresSpecialist = (
      executionBlockUntilCleared ||
      guidanceAction === 'require_specialist' ||
      guidanceAction === 'require_intake'
    );
  }

  let promptGuidanceOnly = explicitPromptGuidanceOnly;
  if (promptGuidanceOnly === null) {
    promptGuidanceOnly = true;
  }

  const promptBlocked = explicitPromptBlocked === null ? false : explicitPromptBlocked;

  let routePendingClearance = explicitRoutePending;
  if (routePendingClearance === null) {
    routePendingClearance = explicitClearanceStatus === 'pending_clearance';
  }

  let routeCleared = explicitRouteCleared;
  if (routeCleared === null) {
    routeCleared = explicitClearanceStatus === 'cleared';
  }

  let clearanceStatus = explicitClearanceStatus;
  if (!clearanceStatus) {
    if (routePendingClearance) {
      clearanceStatus = 'pending_clearance';
    } else if (routeCleared) {
      clearanceStatus = 'cleared';
    } else {
      clearanceStatus = null;
    }
  }

  const routedAgent = requiredAgent || suggestedAgent || null;
  const recordedLegacyFields = recordLegacyRoutingCompatibility({
    source,
    fields: [...legacyFields],
    context: {
      type: firstNonEmpty(entry.type, payload.type),
      routeId: firstNonEmpty(entry.routeId, entry.route_id, payload.routeId, payload.route_id),
      sessionKey: firstNonEmpty(entry.sessionKey, entry.session_key, payload.sessionKey, payload.session_key)
    }
  });

  return {
    payload,
    routedAgent,
    requiredAgent,
    suggestedAgent,
    guidanceAction,
    routeKind,
    requiresSpecialist,
    promptGuidanceOnly,
    promptBlocked,
    executionBlockUntilCleared,
    routePendingClearance: routePendingClearance === true,
    routeCleared: routeCleared === true,
    clearanceStatus,
    routingConfidence: explicitRoutingConfidence ?? 0,
    legacyCompatibilityUsed: recordedLegacyFields.length > 0,
    legacyFields: recordedLegacyFields
  };
}

module.exports = {
  LEGACY_COMPAT_LOG,
  recordLegacyRoutingCompatibility,
  resolveRoutingSemantics,
  toBoolean
};
