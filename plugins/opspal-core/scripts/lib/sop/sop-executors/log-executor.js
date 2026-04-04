#!/usr/bin/env node
'use strict';

/**
 * SOP Log Executor
 *
 * Writes structured events via AutomationEventEmitter with category 'sop'.
 * Also emits human-readable stdout for CLI visibility.
 * Always succeeds — cannot fail meaningfully.
 *
 * @module log-executor
 * @version 1.0.0
 */

const path = require('path');

/**
 * Execute a log action.
 *
 * @param {Object} actionSpec - Action specification from evaluator
 * @param {Object} resolvedContext - Resolved context
 * @param {Object} [options={}]
 * @returns {Object} ExecutorResult
 */
async function execute(actionSpec, resolvedContext, options = {}) {
  const params = actionSpec.params || {};
  const level = params.level || 'info';
  const message = params.message || `SOP event: ${actionSpec.policy_id}`;

  // Write to AutomationEventEmitter if available
  try {
    const emitterPath = path.join(__dirname, '../../automation-event-emitter.js');
    const { AutomationEventEmitter } = require(emitterPath);
    const emitter = new AutomationEventEmitter({ source: 'sop-executor' });

    emitter.emit({
      category: 'sop',
      event_type: 'sop.action.log',
      severity: level === 'warn' ? 'warning' : 'info',
      status: 'success',
      details: {
        policy_id: actionSpec.policy_id,
        message,
        org_slug: resolvedContext.org_slug,
        work_id: resolvedContext.work_item && resolvedContext.work_item.work_id,
        structured_data: params.structured_data || null
      }
    });
  } catch {
    // AutomationEventEmitter not available — non-fatal
  }

  // Human-readable stdout
  if (options.verbose || level === 'warn') {
    const prefix = level === 'warn' ? '[SOP WARN]' : '[SOP]';
    process.stdout.write(`${prefix} ${message}\n`);
  }

  return {
    status: 'executed',
    details: {
      level,
      message,
      policy_id: actionSpec.policy_id
    }
  };
}

module.exports = { execute };
