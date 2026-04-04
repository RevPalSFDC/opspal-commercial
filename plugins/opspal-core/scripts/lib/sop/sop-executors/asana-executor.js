#!/usr/bin/env node
'use strict';

/**
 * SOP Asana Executor
 *
 * Executes Asana actions (create_task, update_task, add_comment).
 * Includes preflight validation: token check, target reachability (cached),
 * workspace match, and error-based backoff.
 *
 * Returns structured MCP action descriptors. Node.js subprocesses cannot
 * invoke MCP tools directly — the hook captures the descriptor and passes
 * it back to Claude via additionalContext/systemMessage, where Claude
 * invokes the mcp__asana__* tool. For enforce-mode policies triggered
 * from slash commands (not hooks), Claude executes the MCP call inline.
 *
 * @module asana-executor
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');

// Backoff state (module-level, shared across calls within a process)
let _errorCount = 0;
let _errorWindowStart = 0;
const ERROR_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const ERROR_THRESHOLD = 3;

// Target validation cache
const _targetCache = new Map();
const TARGET_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Execute an Asana action.
 *
 * @param {Object} actionSpec - Action specification from evaluator
 * @param {Object} resolvedContext - Resolved context
 * @param {Object} [options={}]
 * @returns {Object} ExecutorResult
 */
async function execute(actionSpec, resolvedContext, options = {}) {
  const params = actionSpec.params || {};

  // Preflight 1: Token validation
  const token = process.env.ASANA_ACCESS_TOKEN;
  if (!token) {
    return {
      status: 'error',
      reason: 'asana_token_missing',
      details: { message: 'ASANA_ACCESS_TOKEN environment variable is not set' }
    };
  }

  // Preflight 2: Backoff check
  if (_isInBackoff()) {
    return {
      status: 'skipped',
      reason: 'asana_backoff',
      details: { message: `Asana executor in backoff: ${_errorCount} errors in last 5 minutes` }
    };
  }

  // Preflight 3: Target validation (if project GID available)
  if (params.asana_project_gid) {
    const targetCheck = _checkTargetCache(params.asana_project_gid);
    if (targetCheck === false) {
      return {
        status: 'error',
        reason: 'asana_target_unreachable',
        details: { target: params.asana_project_gid, message: 'Target project previously unreachable (cached)' }
      };
    }
  }

  // Preflight 4: Workspace match
  const workspaceId = process.env.ASANA_WORKSPACE_ID || process.env.ASANA_WORKSPACE_GID;
  if (workspaceId && params.workspace_gid && params.workspace_gid !== workspaceId) {
    return {
      status: 'error',
      reason: 'asana_workspace_mismatch',
      details: { expected: workspaceId, got: params.workspace_gid }
    };
  }

  // Build the action descriptor for the runtime to execute via MCP
  const actionType = params.action_type || 'add_comment';

  try {
    const result = _buildMcpAction(actionType, params, resolvedContext, actionSpec);

    return {
      status: 'executed',
      details: result
    };
  } catch (e) {
    _recordError();
    return {
      status: 'error',
      reason: 'asana_execution_failed',
      error: e.message,
      details: { action_type: actionType }
    };
  }
}

/**
 * Build an MCP action descriptor.
 * Returns a structured object that the SOP runtime can use to invoke
 * the appropriate mcp__asana__* tool.
 */
function _buildMcpAction(actionType, params, resolvedContext, actionSpec) {
  const workItem = resolvedContext.work_item || {};
  const template = actionSpec.template;

  switch (actionType) {
    case 'create_task':
      return {
        mcp_tool: 'mcp__asana__asana_create_task',
        mcp_params: {
          name: params.task_name || workItem.title || 'SOP-generated task',
          projects: params.asana_project_gid ? [params.asana_project_gid] : [],
          notes: params.notes || `Created by SOP policy ${actionSpec.policy_id}`,
          ...(params.asana_section_gid ? { memberships: [{ project: params.asana_project_gid, section: params.asana_section_gid }] } : {})
        }
      };

    case 'update_task':
      return {
        mcp_tool: 'mcp__asana__asana_update_task',
        mcp_params: {
          task_id: params.task_gid || (workItem.external_refs && workItem.external_refs.asana_task_gid),
          ...(params.completed !== undefined ? { completed: params.completed } : {}),
          ...(params.name ? { name: params.name } : {}),
          ...(params.notes ? { notes: params.notes } : {})
        }
      };

    case 'add_comment': {
      const commentText = params.comment_text ||
        _resolveTemplate(template, resolvedContext) ||
        `SOP update from policy ${actionSpec.policy_id}`;

      return {
        mcp_tool: 'mcp__asana__asana_create_task_story',
        mcp_params: {
          task_id: params.task_gid || (workItem.external_refs && workItem.external_refs.asana_task_gid),
          text: commentText
        }
      };
    }

    default:
      throw new Error(`Unknown Asana action_type: ${actionType}`);
  }
}

/**
 * Resolve a template reference to text.
 * Looks for template files in templates/asana-updates/.
 * Uses __dirname-relative path (not CLAUDE_PLUGIN_ROOT which may point to another plugin).
 */
function _resolveTemplate(templateRef, resolvedContext) {
  if (!templateRef) return null;

  try {
    const coreRoot = path.join(__dirname, '../../../..');
    const templatePath = path.join(coreRoot, 'templates', 'asana-updates', `${templateRef}.md`);

    if (fs.existsSync(templatePath)) {
      let content = fs.readFileSync(templatePath, 'utf8');
      // Simple variable substitution
      const workItem = resolvedContext.work_item || {};
      content = content.replace(/\{\{title\}\}/g, workItem.title || '');
      content = content.replace(/\{\{classification\}\}/g, workItem.classification || '');
      content = content.replace(/\{\{org_slug\}\}/g, resolvedContext.org_slug || '');
      content = content.replace(/\{\{status\}\}/g, workItem.status || '');
      return content.trim();
    }
  } catch {
    // Template not found — non-fatal
  }

  return null;
}

// --- Backoff and cache helpers ---

function _isInBackoff() {
  if (_errorCount < ERROR_THRESHOLD) return false;
  if (Date.now() - _errorWindowStart > ERROR_WINDOW_MS) {
    // Window expired, reset
    _errorCount = 0;
    _errorWindowStart = 0;
    return false;
  }
  return true;
}

function _recordError() {
  if (_errorCount === 0) _errorWindowStart = Date.now();
  _errorCount++;
}

function _checkTargetCache(projectGid) {
  const cached = _targetCache.get(projectGid);
  if (!cached) return null; // Unknown — don't block
  if (Date.now() - cached.checkedAt > TARGET_CACHE_TTL) {
    _targetCache.delete(projectGid);
    return null; // Expired
  }
  return cached.reachable;
}

// Exported for testing
function _resetBackoff() {
  _errorCount = 0;
  _errorWindowStart = 0;
  _targetCache.clear();
}

module.exports = { execute, _resetBackoff };
