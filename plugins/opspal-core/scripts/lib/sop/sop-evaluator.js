#!/usr/bin/env node
'use strict';

/**
 * SOP Evaluator
 *
 * Pure synchronous function. Matches events+context against policies,
 * evaluates when-conditions, expands mapping targets, returns an execution plan.
 * Enforces confidence-based mode downgrade and conflict resolution.
 * No I/O — operates entirely on pre-loaded registry data.
 *
 * @module sop-evaluator
 * @version 1.0.0
 */

const crypto = require('crypto');

class SopEvaluator {
  constructor(options = {}) {
    this.registry = options.registry;       // SopRegistry instance (required)
    this.mappingResolver = options.mappingResolver; // SopMappingResolver instance (required)
  }

  /**
   * Evaluate an event against loaded policies.
   *
   * @param {Object} event - Canonical SOP event
   * @param {Object} resolvedContext - From SopContextResolver
   * @returns {Object} ExecutionPlan { matched, skipped, actions, warnings }
   */
  evaluate(event, resolvedContext) {
    const matched = [];
    const skipped = [];
    const actions = [];
    const warnings = [];

    if (!this.registry) {
      warnings.push('No registry provided to evaluator');
      return { matched, skipped, actions, warnings };
    }

    const scope = resolvedContext.scope || event.scope || null;
    const orgSlug = resolvedContext.org_slug || null;
    const candidates = this.registry.getPoliciesForEvent(event.event_type, scope, orgSlug);

    // Track targets claimed by enforce policies for conflict detection
    const claimedTargets = new Map(); // 'target_id:action_type' -> policy_id

    for (const policy of candidates) {
      // Evaluate when-conditions
      const conditionResult = this._evaluateConditions(policy.when || [], event, resolvedContext);

      if (!conditionResult.pass) {
        skipped.push({
          policy_id: policy.id,
          reason: `condition_not_met: ${conditionResult.reason}`
        });
        continue;
      }

      // Confidence-based mode enforcement
      let effectiveMode = policy.mode;
      if (event.confidence === 'inferred_low' && policy.mode === 'enforce') {
        const allowLow = this._policyAllowsInferredLow(policy);
        if (!allowLow) {
          effectiveMode = 'recommend';
          warnings.push(`Policy ${policy.id} downgraded from enforce to recommend: event confidence is inferred_low`);
        }
      }

      matched.push({
        policy_id: policy.id,
        scope: policy.scope,
        mode: effectiveMode,
        original_mode: policy.mode,
        priority: policy.priority || 50
      });

      // Only enforce mode produces executable actions
      if (effectiveMode !== 'enforce') {
        continue;
      }

      // Resolve mapping targets (one-to-many)
      let targets = [null]; // Default: no specific target
      if (policy.mapping_ref && this.mappingResolver) {
        const resolved = this.mappingResolver.resolve(policy.mapping_ref, resolvedContext);
        if (resolved.length > 0) {
          targets = resolved;
        } else {
          warnings.push(`Policy ${policy.id}: mapping_ref '${policy.mapping_ref}' resolved to 0 targets`);
        }
      }

      // Build action specs for each target
      for (const target of targets) {
        for (const actionDef of (policy.actions || [])) {
          const targetId = (target && target.asana_project_gid) ||
            (resolvedContext.work_item && resolvedContext.work_item.work_id) ||
            'default';

          // Conflict detection
          const claimKey = `${targetId}:${actionDef.type}:${actionDef.params && actionDef.params.action_type || 'default'}`;
          const existingClaim = claimedTargets.get(claimKey);

          if (existingClaim && this._isConflicting(existingClaim, policy, actionDef)) {
            warnings.push(
              `Conflict: policy ${policy.id} and ${existingClaim.policy_id} both target ${claimKey}. ` +
              `Lower-priority policy ${policy.id} action skipped.`
            );
            continue;
          }

          claimedTargets.set(claimKey, { policy_id: policy.id, actionDef });

          const idempotencyScope = (policy.idempotency && policy.idempotency.scope) || 'event+policy';
          const idempotencyKey = this._deriveIdempotencyKey(event, policy, actionDef, targetId, idempotencyScope);

          const actionSpec = {
            action_id: `act-${crypto.randomBytes(4).toString('hex')}`,
            executor_type: actionDef.type,
            policy_id: policy.id,
            mode: effectiveMode,
            params: this._resolveParams(actionDef, target, event, resolvedContext),
            target: target || null,
            template: actionDef.template || null,
            idempotency_key: idempotencyKey,
            allow_backward_transition: policy.allow_backward_transition || false
          };

          actions.push(actionSpec);
        }
      }
    }

    return { matched, skipped, actions, warnings };
  }

  // --- Private methods ---

  /**
   * Evaluate all when-conditions (AND logic).
   */
  _evaluateConditions(conditions, event, context) {
    for (const cond of conditions) {
      // Skip allow_inferred_low — it's a meta-condition, not a data filter
      if (cond.allow_inferred_low !== undefined && Object.keys(cond).length === 1) continue;

      const fieldValue = this._getFieldValue(cond.field, event, context);

      switch (cond.op) {
        case 'eq':
          if (fieldValue !== cond.value) {
            return { pass: false, reason: `${cond.field} != ${cond.value}` };
          }
          break;

        case 'neq':
          if (fieldValue === cond.value) {
            return { pass: false, reason: `${cond.field} == ${cond.value}` };
          }
          break;

        case 'in':
          if (!Array.isArray(cond.values) || !cond.values.includes(fieldValue)) {
            return { pass: false, reason: `${cond.field} not in [${(cond.values || []).join(',')}]` };
          }
          break;

        case 'nin':
          if (Array.isArray(cond.values) && cond.values.includes(fieldValue)) {
            return { pass: false, reason: `${cond.field} in excluded set` };
          }
          break;

        case 'exists':
          if (fieldValue === undefined || fieldValue === null) {
            return { pass: false, reason: `${cond.field} does not exist` };
          }
          break;

        case 'regex': {
          if (typeof fieldValue !== 'string') {
            return { pass: false, reason: `${cond.field} is not a string for regex` };
          }
          try {
            const re = new RegExp(cond.value);
            if (!re.test(fieldValue)) {
              return { pass: false, reason: `${cond.field} does not match regex ${cond.value}` };
            }
          } catch (e) {
            return { pass: false, reason: `Invalid regex: ${cond.value}` };
          }
          break;
        }

        default:
          return { pass: false, reason: `Unknown operator: ${cond.op}` };
      }
    }

    return { pass: true, reason: null };
  }

  /**
   * Resolve a dot-path field value from the merged event/context object.
   */
  _getFieldValue(fieldPath, event, context) {
    if (!fieldPath) return undefined;

    const merged = { event, context };
    const parts = fieldPath.split('.');
    let current = merged;

    for (const part of parts) {
      if (current === null || current === undefined || typeof current !== 'object') {
        return undefined;
      }
      current = current[part];
    }

    return current;
  }

  /**
   * Check if a policy allows inferred_low confidence for enforce mode.
   */
  _policyAllowsInferredLow(policy) {
    if (!policy.when) return false;
    return policy.when.some(cond => cond.allow_inferred_low === true);
  }

  /**
   * Check if two claims on the same target are conflicting.
   */
  _isConflicting(existingClaim, newPolicy, newActionDef) {
    // Same action type on same target from different policies = potential conflict
    // But additive actions (add_comment) are composable
    const actionType = newActionDef.params && newActionDef.params.action_type;
    if (actionType === 'add_comment') return false; // Comments compose

    return existingClaim.policy_id !== newPolicy.id;
  }

  /**
   * Derive an idempotency key from event, policy, action, and target.
   */
  _deriveIdempotencyKey(event, policy, actionDef, targetId, scope) {
    const keyParts = {
      event_id: event.event_id,
      policy_id: policy.id,
      action_type: actionDef.type
    };

    if (scope === 'event+policy+target') {
      keyParts.target_id = targetId;
    }

    const data = JSON.stringify(keyParts, Object.keys(keyParts).sort());
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Merge action params with target info and template variable expansion.
   */
  _resolveParams(actionDef, target, event, context) {
    const baseParams = { ...(actionDef.params || {}) };

    // Inject target info
    if (target) {
      if (target.asana_project_gid) baseParams.asana_project_gid = target.asana_project_gid;
      if (target.asana_section_gid) baseParams.asana_section_gid = target.asana_section_gid;
      if (target.board_name) baseParams.board_name = target.board_name;
    }

    // Simple template variable expansion ({{path.to.value}})
    for (const [key, value] of Object.entries(baseParams)) {
      if (typeof value === 'string' && value.includes('{{')) {
        baseParams[key] = value.replace(/\{\{([^}]+)\}\}/g, (match, fieldPath) => {
          const resolved = this._getFieldValue(fieldPath.trim(), event, context);
          return resolved !== undefined && resolved !== null ? String(resolved) : '';
        });
      }
    }

    return baseParams;
  }
}

module.exports = { SopEvaluator };
