#!/usr/bin/env node

/**
 * Customization Audit Log
 *
 * Append-only JSONL audit trail for all customization mutations.
 * Follows the same pattern as the existing audit-log.js but scoped
 * to the customization layer.
 *
 * @version 1.0.0
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class CustomizationAuditLog {
  constructor(options = {}) {
    this.logDir = options.logDir || path.join(
      process.env.HOME || '/tmp', '.claude', 'opspal', 'customizations'
    );
    this.logFile = path.join(this.logDir, 'audit.jsonl');
    this.actor = options.actor || {
      type: 'agent',
      id: process.env.CLAUDE_AGENT_ID || 'claude-code',
      name: process.env.CLAUDE_AGENT_NAME || 'Claude Code'
    };
  }

  /**
   * Ensure the log directory exists
   */
  _ensureDir() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  /**
   * Record an audit entry
   * @param {string} action - create|update|delete|clone|publish|archive|revert|import|export|migrate
   * @param {string} resourceId - The resource being acted upon
   * @param {Object} details - Action-specific details
   * @param {Object} [details.before] - State before mutation
   * @param {Object} [details.after] - State after mutation
   * @param {string} [details.scope] - site|tenant
   * @param {string} [details.reason] - Human-readable reason
   */
  log(action, resourceId, details = {}) {
    this._ensureDir();

    const entry = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      action,
      resource_id: resourceId,
      scope: details.scope || null,
      actor: this.actor,
      before: details.before || null,
      after: details.after || null,
      reason: details.reason || null,
      metadata: details.metadata || null
    };

    const line = JSON.stringify(entry) + '\n';
    fs.appendFileSync(this.logFile, line, 'utf8');

    return entry;
  }

  /**
   * Read all audit entries, optionally filtered
   * @param {Object} [filter]
   * @param {string} [filter.resourceId] - Filter by resource ID
   * @param {string} [filter.action] - Filter by action type
   * @param {number} [filter.limit] - Max entries to return (most recent first)
   * @returns {Array<Object>}
   */
  query(filter = {}) {
    if (!fs.existsSync(this.logFile)) {
      return [];
    }

    const lines = fs.readFileSync(this.logFile, 'utf8')
      .split('\n')
      .filter(Boolean);

    let entries = lines.map(line => {
      try { return JSON.parse(line); }
      catch { return null; }
    }).filter(Boolean);

    if (filter.resourceId) {
      entries = entries.filter(e => e.resource_id === filter.resourceId);
    }
    if (filter.action) {
      entries = entries.filter(e => e.action === filter.action);
    }

    // Most recent first
    entries.reverse();

    if (filter.limit && filter.limit > 0) {
      entries = entries.slice(0, filter.limit);
    }

    return entries;
  }
}

module.exports = { CustomizationAuditLog };
