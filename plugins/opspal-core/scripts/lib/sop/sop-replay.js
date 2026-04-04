#!/usr/bin/env node
'use strict';

/**
 * SOP Replay Tool
 *
 * Replays events from the SOP audit log through the current policy set.
 * Use cases: debugging, backfill, policy change validation.
 *
 * @module sop-replay
 * @version 1.0.0
 */

const { SopRuntime } = require('./sop-runtime');
const { SopAudit } = require('./sop-audit');

class SopReplay {
  constructor(options = {}) {
    this.runtime = options.runtime || new SopRuntime({
      dry_run: options.execute !== true,
      verbose: options.verbose || false
    });
    this.audit = options.audit || new SopAudit();
    this.verbose = options.verbose || false;
  }

  /**
   * Replay events matching filters.
   *
   * @param {Object} filters - { event_id, event_type, org_slug, since, limit }
   * @param {Object} [options={}] - { execute, explain }
   * @returns {Object} ReplaySummary
   */
  async replay(filters = {}, options = {}) {
    const execute = options.execute || false;
    const explain = options.explain || false;

    // Convert --since duration to ISO date
    if (filters.since && !filters.since.includes('T')) {
      filters.since = this._parseDuration(filters.since);
    }

    const entries = this.audit.query({
      ...filters,
      limit: filters.limit || 1000
    });

    if (entries.length === 0) {
      return {
        events_found: 0,
        events_replayed: 0,
        message: 'No matching events found in audit log'
      };
    }

    const results = [];
    let totalMatched = 0;
    let totalExecuted = 0;
    let totalSkipped = 0;
    let totalErrors = 0;

    // Override runtime dry_run based on execute flag
    this.runtime.dryRun = !execute;

    for (const entry of entries) {
      // Reconstruct event from audit entry
      const event = {
        event_id: entry.event_id,
        event_type: entry.event_type,
        confidence: entry.confidence || 'explicit',
        scope: entry.scope,
        payload: {
          org_slug: entry.org_slug,
          work_id: entry.work_id
        },
        source: 'replay'
      };

      const contextOverrides = {
        org_slug: entry.org_slug
      };

      const result = await this.runtime.run(event, contextOverrides);

      totalMatched += result.plan.matched.length;
      for (const r of result.execution_results) {
        switch (r.status) {
          case 'executed': totalExecuted++; break;
          case 'skipped': totalSkipped++; break;
          case 'error': totalErrors++; break;
        }
      }

      if (explain || this.verbose) {
        results.push({
          event_id: entry.event_id,
          event_type: entry.event_type,
          original_timestamp: entry.timestamp,
          policies_matched: result.plan.matched.length,
          actions_planned: result.plan.actions.length,
          execution_results: result.execution_results.map(r => ({
            status: r.status,
            reason: r.reason || null,
            executor_type: r.executor_type
          })),
          warnings: result.plan.warnings
        });
      }
    }

    return {
      events_found: entries.length,
      events_replayed: entries.length,
      policies_matched: totalMatched,
      actions_executed: totalExecuted,
      actions_skipped: totalSkipped,
      actions_errored: totalErrors,
      dry_run: !execute,
      details: results.length > 0 ? results : undefined
    };
  }

  // --- Private ---

  _parseDuration(durationStr) {
    const match = durationStr.match(/^(\d+)([dhm])$/);
    if (!match) return durationStr;

    const value = parseInt(match[1], 10);
    const unit = match[2];
    const now = Date.now();

    switch (unit) {
      case 'd': return new Date(now - value * 86400000).toISOString();
      case 'h': return new Date(now - value * 3600000).toISOString();
      case 'm': return new Date(now - value * 60000).toISOString();
      default: return durationStr;
    }
  }
}

// --- CLI entrypoint ---
async function cli() {
  const args = process.argv.slice(2);

  const filters = {};
  const options = {};

  const eventId = getArg(args, '--event-id');
  const eventType = getArg(args, '--event-type');
  const orgSlug = getArg(args, '--org');
  const since = getArg(args, '--since');
  const limit = getArg(args, '--limit');

  if (eventId) filters.event_id = eventId;
  if (eventType) filters.event_type = eventType;
  if (orgSlug) filters.org_slug = orgSlug;
  if (since) filters.since = since;
  if (limit) filters.limit = parseInt(limit, 10);

  options.execute = args.includes('--execute');
  options.explain = args.includes('--explain');
  options.verbose = args.includes('--verbose');

  if (options.execute) {
    process.stderr.write('[sop-replay] WARNING: --execute mode will perform real mutations.\n');
  }

  const replayer = new SopReplay({ verbose: options.verbose, execute: options.execute });
  const result = await replayer.replay(filters, options);

  process.stdout.write(JSON.stringify(result, null, options.verbose ? 2 : 0) + '\n');
}

function getArg(args, flag) {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) return null;
  return args[idx + 1];
}

module.exports = { SopReplay };

if (require.main === module) {
  cli().catch(err => {
    process.stderr.write(`Error: ${err.message}\n`);
    process.exit(1);
  });
}
