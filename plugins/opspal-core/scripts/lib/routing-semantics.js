'use strict';

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

function finalizeRoutingSemantics({
  payload,
  requiredAgent = null,
  suggestedAgent = null,
  guidanceAction = null,
  routeKind = null,
  executionBlockUntilCleared = null,
  promptGuidanceOnly = null,
  promptBlocked = null,
  requiresSpecialist = null,
  routePendingClearance = null,
  routeCleared = null,
  clearanceStatus = null,
  routingConfidence = null,
  legacyFields = []
} = {}) {
  let resolvedExecutionBlockUntilCleared = executionBlockUntilCleared;
  if (resolvedExecutionBlockUntilCleared === null) {
    resolvedExecutionBlockUntilCleared = routePendingClearance === true;
  }
  if (resolvedExecutionBlockUntilCleared === null) {
    resolvedExecutionBlockUntilCleared = false;
  }

  let resolvedGuidanceAction = guidanceAction;
  if (!resolvedGuidanceAction) {
    resolvedGuidanceAction = resolvedExecutionBlockUntilCleared ? 'require_specialist' : 'recommend_specialist';
  }

  let resolvedRouteKind = routeKind;
  if (!resolvedRouteKind) {
    if (resolvedGuidanceAction === 'require_intake') {
      resolvedRouteKind = 'intake_specialist';
    } else if (resolvedExecutionBlockUntilCleared) {
      resolvedRouteKind = 'complexity_specialist';
    } else if (requiredAgent || suggestedAgent) {
      resolvedRouteKind = 'advisory';
    }
  }

  let resolvedRequiresSpecialist = requiresSpecialist;
  if (resolvedRequiresSpecialist === null) {
    resolvedRequiresSpecialist = (
      resolvedExecutionBlockUntilCleared ||
      resolvedGuidanceAction === 'require_specialist' ||
      resolvedGuidanceAction === 'require_intake'
    );
  }

  let resolvedPromptGuidanceOnly = promptGuidanceOnly;
  if (resolvedPromptGuidanceOnly === null) {
    resolvedPromptGuidanceOnly = true;
  }

  const resolvedPromptBlocked = promptBlocked === null ? false : promptBlocked;

  let resolvedRoutePendingClearance = routePendingClearance;
  if (resolvedRoutePendingClearance === null) {
    resolvedRoutePendingClearance = clearanceStatus === 'pending_clearance';
  }

  let resolvedRouteCleared = routeCleared;
  if (resolvedRouteCleared === null) {
    resolvedRouteCleared = clearanceStatus === 'cleared';
  }

  let resolvedClearanceStatus = clearanceStatus;
  if (!resolvedClearanceStatus) {
    if (resolvedRoutePendingClearance) {
      resolvedClearanceStatus = 'pending_clearance';
    } else if (resolvedRouteCleared) {
      resolvedClearanceStatus = 'cleared';
    } else {
      resolvedClearanceStatus = null;
    }
  }

  const uniqueLegacyFields = [...new Set((legacyFields || []).filter(Boolean))];

  return {
    payload,
    routedAgent: requiredAgent || suggestedAgent || null,
    requiredAgent,
    suggestedAgent,
    guidanceAction: resolvedGuidanceAction,
    routeKind: resolvedRouteKind,
    requiresSpecialist: resolvedRequiresSpecialist,
    promptGuidanceOnly: resolvedPromptGuidanceOnly,
    promptBlocked: resolvedPromptBlocked,
    executionBlockUntilCleared: resolvedExecutionBlockUntilCleared,
    routePendingClearance: resolvedRoutePendingClearance === true,
    routeCleared: resolvedRouteCleared === true,
    clearanceStatus: resolvedClearanceStatus,
    routingConfidence: routingConfidence ?? 0,
    legacyCompatibilityUsed: uniqueLegacyFields.length > 0,
    legacyFields: uniqueLegacyFields
  };
}

function resolveRoutingSemantics(entry = {}, _options = {}) {
  const payload = getRoutingPayload(entry);

  return finalizeRoutingSemantics({
    payload,
    requiredAgent: firstNonEmpty(
      payload.requiredAgent,
      payload.required_agent,
      entry.requiredAgent,
      entry.required_agent
    ),
    suggestedAgent: firstNonEmpty(
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
    ),
    guidanceAction: firstNonEmpty(
      payload.guidanceAction,
      payload.guidance_action,
      entry.guidanceAction,
      entry.guidance_action
    ),
    routeKind: firstNonEmpty(
      payload.routeKind,
      payload.route_kind,
      entry.routeKind,
      entry.route_kind
    ),
    executionBlockUntilCleared: firstBoolean(
      payload.executionBlockUntilCleared,
      payload.execution_block_until_cleared,
      entry.executionBlockUntilCleared,
      entry.execution_block_until_cleared
    ),
    promptGuidanceOnly: firstBoolean(
      payload.promptGuidanceOnly,
      payload.prompt_guidance_only,
      entry.promptGuidanceOnly,
      entry.prompt_guidance_only
    ),
    promptBlocked: firstBoolean(
      payload.promptBlocked,
      payload.prompt_blocked,
      entry.promptBlocked,
      entry.prompt_blocked
    ),
    requiresSpecialist: firstBoolean(
      payload.requiresSpecialist,
      payload.requires_specialist,
      entry.requiresSpecialist,
      entry.requires_specialist
    ),
    routePendingClearance: firstBoolean(
      payload.routePendingClearance,
      payload.route_pending_clearance,
      entry.routePendingClearance,
      entry.route_pending_clearance
    ),
    routeCleared: firstBoolean(
      payload.routeCleared,
      payload.route_cleared,
      entry.routeCleared,
      entry.route_cleared
    ),
    clearanceStatus: firstNonEmpty(
      payload.clearanceStatus,
      payload.clearance_status,
      entry.clearanceStatus,
      entry.clearance_status
    ),
    routingConfidence: firstNumber(
      payload.routingConfidence,
      payload.routing_confidence,
      entry.routingConfidence,
      entry.routing_confidence
    )
  });
}

function resolveHistoricalRoutingLogSemantics(entry = {}, _options = {}) {
  const payload = getRoutingPayload(entry);

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

  const legacyFields = [];
  let legacyAction = null;
  if (!explicitGuidanceAction || !explicitRouteKind || explicitExecutionBlock === null) {
    legacyAction = firstNonEmpty(
      payload.routingActionType,
      payload.routing_action_type,
      entry.routingActionType,
      entry.routing_action_type
    );
    if (legacyAction) {
      legacyFields.push('routingActionType');
    } else {
      legacyAction = firstNonEmpty(payload.action, entry.action);
      if (legacyAction) {
        legacyFields.push('action');
      }
    }
  }

  const mappedLegacyAction = getLegacyActionSemantics(legacyAction);

  let executionBlockUntilCleared = explicitExecutionBlock;
  if (executionBlockUntilCleared === null && mappedLegacyAction) {
    executionBlockUntilCleared = mappedLegacyAction.executionBlockUntilCleared;
  }
  if (executionBlockUntilCleared === null) {
    const legacyBlocked = firstBoolean(payload.blocked, entry.blocked);
    if (legacyBlocked !== null) {
      executionBlockUntilCleared = legacyBlocked;
      legacyFields.push('blocked');
    }
  }

  return finalizeRoutingSemantics({
    payload,
    requiredAgent: explicitRequiredAgent,
    suggestedAgent: explicitSuggestedAgent || explicitRequiredAgent || null,
    guidanceAction: explicitGuidanceAction || mappedLegacyAction?.guidanceAction || null,
    routeKind: explicitRouteKind || mappedLegacyAction?.routeKind || null,
    executionBlockUntilCleared,
    promptGuidanceOnly: explicitPromptGuidanceOnly,
    promptBlocked: explicitPromptBlocked,
    requiresSpecialist: explicitRequiresSpecialist,
    routePendingClearance: explicitRoutePending,
    routeCleared: explicitRouteCleared,
    clearanceStatus: explicitClearanceStatus,
    routingConfidence: explicitRoutingConfidence,
    legacyFields
  });
}

module.exports = {
  resolveHistoricalRoutingLogSemantics,
  resolveRoutingSemantics,
  toBoolean
};
