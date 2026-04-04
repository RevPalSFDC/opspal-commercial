#!/usr/bin/env node
'use strict';

/**
 * SOP Executor Registry
 *
 * Maps executor_type strings to executor modules.
 * Wraps execution with error handling.
 *
 * @module sop-executors
 * @version 1.0.0
 */

const asanaExecutor = require('./asana-executor');
const workIndexExecutor = require('./work-index-executor');
const logExecutor = require('./log-executor');

const EXECUTOR_MAP = {
  'asana': asanaExecutor,
  'work-index': workIndexExecutor,
  'log': logExecutor
};

/**
 * Get an executor module by type.
 * @param {string} type
 * @returns {Object|null}
 */
function getExecutor(type) {
  return EXECUTOR_MAP[type] || null;
}

/**
 * Execute a single action spec via the appropriate executor.
 *
 * @param {Object} actionSpec - From SopEvaluator
 * @param {Object} resolvedContext - From SopContextResolver
 * @param {Object} [options={}] - { idempotencyManager, verbose }
 * @returns {Object} ExecutorResult { status, idempotency_key, action_id, executor_type, details, reason, error }
 */
async function executeAction(actionSpec, resolvedContext, options = {}) {
  const executor = getExecutor(actionSpec.executor_type);

  if (!executor) {
    return {
      status: 'error',
      action_id: actionSpec.action_id,
      executor_type: actionSpec.executor_type,
      idempotency_key: actionSpec.idempotency_key,
      error: `Unknown executor type: ${actionSpec.executor_type}`,
      reason: 'unknown_executor'
    };
  }

  // Idempotency check
  const idempotencyManager = options.idempotencyManager;
  if (idempotencyManager && actionSpec.idempotency_key) {
    try {
      const alreadyDone = await idempotencyManager.checkCompletion(actionSpec.idempotency_key);
      if (alreadyDone) {
        return {
          status: 'skipped',
          action_id: actionSpec.action_id,
          executor_type: actionSpec.executor_type,
          idempotency_key: actionSpec.idempotency_key,
          reason: 'idempotency_hit'
        };
      }

      const lockAcquired = await idempotencyManager.acquireLock(actionSpec.idempotency_key);
      if (!lockAcquired) {
        return {
          status: 'skipped',
          action_id: actionSpec.action_id,
          executor_type: actionSpec.executor_type,
          idempotency_key: actionSpec.idempotency_key,
          reason: 'lock_held'
        };
      }
    } catch (e) {
      // Idempotency check failure is non-fatal — proceed with execution
      if (options.verbose) {
        process.stderr.write(`[sop-executor] Idempotency check failed: ${e.message}\n`);
      }
    }
  }

  try {
    const result = await executor.execute(actionSpec, resolvedContext, options);

    // Record completion
    if (idempotencyManager && actionSpec.idempotency_key) {
      try {
        await idempotencyManager.recordCompletion(actionSpec.idempotency_key, {
          action_id: actionSpec.action_id,
          executor_type: actionSpec.executor_type,
          status: result.status
        });
      } catch {
        // Non-fatal
      }
    }

    return {
      ...result,
      action_id: actionSpec.action_id,
      executor_type: actionSpec.executor_type,
      idempotency_key: actionSpec.idempotency_key
    };
  } catch (e) {
    return {
      status: 'error',
      action_id: actionSpec.action_id,
      executor_type: actionSpec.executor_type,
      idempotency_key: actionSpec.idempotency_key,
      error: e.message,
      reason: 'executor_exception'
    };
  } finally {
    // Always release lock
    if (idempotencyManager && actionSpec.idempotency_key) {
      try {
        await idempotencyManager.releaseLock(actionSpec.idempotency_key);
      } catch {
        // Non-fatal
      }
    }
  }
}

module.exports = { getExecutor, executeAction, EXECUTOR_MAP };
