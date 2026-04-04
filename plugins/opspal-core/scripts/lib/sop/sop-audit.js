#!/usr/bin/env node
'use strict';

/**
 * SOP Audit Logger
 *
 * JSONL writer to ~/.claude/logs/sop-audit.jsonl.
 * Records event (including confidence), context, matched/skipped policies,
 * actions planned/executed, idempotency keys, trace_id, state transition details.
 * Uses fs.appendFileSync pattern consistent with audit-log.js.
 *
 * @module sop-audit
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class SopAudit {
  constructor(options = {}) {
    this.logDir = options.logDir || path.join(process.env.HOME || '/tmp', '.claude', 'logs');
    this.logFile = options.logFile || path.join(this.logDir, 'sop-audit.jsonl');
    this.traceId = options.traceId || process.env.TRACE_ID || process.env.CLAUDE_TRACE_ID || null;

    this._ensureDir();
  }

  /**
   * Record a full SOP runtime execution trace.
   *
   * @param {Object} runtimeResult - Output of SopRuntime.run()
   * @returns {Object} The written audit entry
   */
  record(runtimeResult) {
    const entry = {
      id: `sop-audit-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
      timestamp: new Date().toISOString(),
      trace_id: this.traceId || runtimeResult.trace_id || null,

      // Event info
      event_id: runtimeResult.event_id || null,
      event_type: runtimeResult.event_type || null,
      confidence: runtimeResult.confidence || null,

      // Context
      org_slug: runtimeResult.resolved_context && runtimeResult.resolved_context.org_slug || null,
      work_id: runtimeResult.resolved_context &&
        runtimeResult.resolved_context.work_item &&
        runtimeResult.resolved_context.work_item.work_id || null,
      scope: runtimeResult.resolved_context && runtimeResult.resolved_context.scope || null,

      // Policy results
      matched_policies: (runtimeResult.plan && runtimeResult.plan.matched || []).map(m => ({
        policy_id: m.policy_id,
        mode: m.mode,
        original_mode: m.original_mode
      })),
      skipped_policies: runtimeResult.plan && runtimeResult.plan.skipped || [],
      warnings: runtimeResult.plan && runtimeResult.plan.warnings || [],

      // Action results
      actions_planned: runtimeResult.plan && runtimeResult.plan.actions ? runtimeResult.plan.actions.length : 0,
      actions_executed: 0,
      actions_skipped: 0,
      actions_errored: 0,
      idempotency_keys: [],

      // Execution details
      execution_results: [],
      dry_run: runtimeResult.dry_run || false,
      duration_ms: runtimeResult.duration_ms || 0
    };

    // Tally execution results
    if (runtimeResult.execution_results) {
      for (const r of runtimeResult.execution_results) {
        entry.execution_results.push({
          action_id: r.action_id,
          executor_type: r.executor_type,
          status: r.status,
          idempotency_key: r.idempotency_key,
          reason: r.reason || null
        });

        if (r.idempotency_key) entry.idempotency_keys.push(r.idempotency_key);

        switch (r.status) {
          case 'executed': entry.actions_executed++; break;
          case 'skipped': entry.actions_skipped++; break;
          case 'error': entry.actions_errored++; break;
        }
      }
    }

    this._write(entry);
    return entry;
  }

  /**
   * Query audit log entries.
   *
   * @param {Object} filters - { trace_id, event_id, org_slug, policy_id, since, until, limit }
   * @returns {Object[]}
   */
  query(filters = {}) {
    if (!fs.existsSync(this.logFile)) return [];

    const limit = filters.limit || 100;
    const lines = fs.readFileSync(this.logFile, 'utf8').trim().split('\n').filter(Boolean);
    const results = [];

    // Read backwards for recency
    for (let i = lines.length - 1; i >= 0 && results.length < limit; i--) {
      try {
        const entry = JSON.parse(lines[i]);

        if (filters.trace_id && entry.trace_id !== filters.trace_id) continue;
        if (filters.event_id && entry.event_id !== filters.event_id) continue;
        if (filters.org_slug && entry.org_slug !== filters.org_slug) continue;
        if (filters.event_type && entry.event_type !== filters.event_type) continue;
        if (filters.policy_id) {
          const hasPolicy = entry.matched_policies.some(p => p.policy_id === filters.policy_id);
          if (!hasPolicy) continue;
        }
        if (filters.since && entry.timestamp < filters.since) continue;
        if (filters.until && entry.timestamp > filters.until) continue;

        results.push(entry);
      } catch {
        // Skip malformed lines
      }
    }

    return results;
  }

  // --- Private ---

  _ensureDir() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  _write(entry) {
    try {
      fs.appendFileSync(this.logFile, JSON.stringify(entry) + '\n');
    } catch (e) {
      process.stderr.write(`[sop-audit] Failed to write audit entry: ${e.message}\n`);
    }
  }
}

module.exports = { SopAudit };
