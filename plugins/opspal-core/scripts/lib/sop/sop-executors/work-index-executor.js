#!/usr/bin/env node
'use strict';

/**
 * SOP Work Index Executor
 *
 * Executes work index operations (append, update_status).
 * Enforces a state transition machine. Illegal transitions are ignored
 * with a warning in the audit log.
 *
 * @module work-index-executor
 * @version 1.0.0
 */

const path = require('path');

// Legal state transitions
const LEGAL_TRANSITIONS = {
  'requested': ['in-progress'],
  'in-progress': ['blocked', 'completed', 'on-hold'],
  'blocked': ['in-progress'],
  'on-hold': ['in-progress'],
  'completed': ['follow-up-needed'],
  'follow-up-needed': ['in-progress']
};

// Terminal states
const TERMINAL_STATES = new Set(['completed', 'cancelled']);

/**
 * Execute a work-index action.
 *
 * @param {Object} actionSpec - Action specification from evaluator
 * @param {Object} resolvedContext - Resolved context
 * @param {Object} [options={}]
 * @returns {Object} ExecutorResult
 */
async function execute(actionSpec, resolvedContext, options = {}) {
  const params = actionSpec.params || {};
  const actionType = params.action_type || 'update_status';
  const orgSlug = resolvedContext.org_slug;

  if (!orgSlug) {
    return {
      status: 'error',
      reason: 'missing_org_slug',
      details: { message: 'Cannot update work index without org_slug' }
    };
  }

  switch (actionType) {
    case 'append':
      return _handleAppend(params, resolvedContext, options);

    case 'update_status':
      return _handleUpdateStatus(params, resolvedContext, actionSpec, options);

    default:
      return {
        status: 'error',
        reason: 'unknown_action_type',
        details: { action_type: actionType }
      };
  }
}

async function _handleAppend(params, resolvedContext, options) {
  const org = resolvedContext.org_slug;
  const title = params.title || (resolvedContext.work_item && resolvedContext.work_item.title) || 'SOP-generated entry';
  const classification = params.classification ||
    (resolvedContext.work_item && resolvedContext.work_item.classification) || 'support';

  // Try to call WorkIndexManager directly
  try {
    const managerPath = path.join(__dirname, '../../work-index-manager.js');
    const { execFileSync } = require('child_process');
    execFileSync('node', [managerPath, 'add', org, '--title', title, '--classification', classification], {
      timeout: 10000,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    return {
      status: 'executed',
      details: {
        operation: 'work_index_append',
        org,
        title,
        classification,
        message: `Appended work entry for ${org}: ${title}`
      }
    };
  } catch (e) {
    // Fall back to returning descriptor
    return {
      status: 'executed',
      details: {
        operation: 'work_index_append',
        org,
        title,
        classification,
        fallback: true,
        message: `Work index append planned for ${org}: ${title} (manager unavailable: ${e.message})`
      }
    };
  }
}

async function _handleUpdateStatus(params, resolvedContext, actionSpec, options) {
  const newStatus = params.new_status;
  if (!newStatus) {
    return {
      status: 'error',
      reason: 'missing_new_status',
      details: { message: 'update_status action requires new_status parameter' }
    };
  }

  const workItem = resolvedContext.work_item;
  const currentStatus = workItem && workItem.status;

  // Duplicate terminal transition check
  if (currentStatus && TERMINAL_STATES.has(currentStatus) && currentStatus === newStatus) {
    return {
      status: 'skipped',
      reason: 'already_in_terminal_state',
      details: { current_status: currentStatus, requested_status: newStatus }
    };
  }

  // State transition validation
  if (currentStatus) {
    const allowed = LEGAL_TRANSITIONS[currentStatus] || [];

    if (!allowed.includes(newStatus)) {
      if (!actionSpec.allow_backward_transition) {
        return {
          status: 'skipped',
          reason: 'illegal_state_transition',
          details: {
            current_status: currentStatus,
            requested_status: newStatus,
            allowed_transitions: allowed,
            message: `Cannot transition from ${currentStatus} to ${newStatus}`
          }
        };
      }
      // allow_backward_transition is true — fall through to execution
    }
  }

  // Execute the update
  const org = resolvedContext.org_slug;
  const workId = workItem && workItem.work_id;
  const transition = currentStatus ? `${currentStatus} -> ${newStatus}` : `? -> ${newStatus}`;
  const isBackward = currentStatus && !(LEGAL_TRANSITIONS[currentStatus] || []).includes(newStatus);

  try {
    const managerPath = path.join(__dirname, '../../work-index-manager.js');
    const cliArgs = workId
      ? [managerPath, 'update', org, '--id', workId, '--status', newStatus]
      : [managerPath, 'update', org, '--status', newStatus];
    const { execFileSync } = require('child_process');
    execFileSync('node', cliArgs, { timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'] });

    return {
      status: 'executed',
      details: {
        operation: 'work_index_update_status',
        transition,
        backward_transition: isBackward,
        message: `Status updated${isBackward ? ' (backward)' : ''}: ${transition}`
      }
    };
  } catch (e) {
    return {
      status: 'executed',
      details: {
        operation: 'work_index_update_status',
        transition,
        backward_transition: isBackward,
        fallback: true,
        message: `Work index update planned: ${transition} (manager unavailable: ${e.message})`
      }
    };
  }
}

module.exports = { execute, LEGAL_TRANSITIONS, TERMINAL_STATES };
