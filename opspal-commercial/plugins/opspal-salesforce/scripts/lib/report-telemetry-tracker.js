#!/usr/bin/env node

/**
 * Report Telemetry Tracker
 *
 * Tracks metrics proving the report CRUD system works.
 * Silent-drop count must be zero. All events logged to JSONL.
 *
 * Metrics:
 *   - first_pass_success_rate (target: > 80%)
 *   - repair_rate (target: < 20%)
 *   - repair_success_rate (target: > 90%)
 *   - silent_drop_count (MUST BE 0)
 *   - preflight_cycles_avg (target: < 1.5)
 *
 * Usage:
 *   const { ReportTelemetryTracker } = require('./report-telemetry-tracker');
 *   const tracker = new ReportTelemetryTracker({ orgSlug: 'acme' });
 *
 *   tracker.logEvent({ operation: 'create', outcome: 'success', ... });
 *   const dashboard = tracker.dashboard(30);
 *
 * CLI:
 *   node report-telemetry-tracker.js dashboard --org <slug> --days 30
 *   node report-telemetry-tracker.js events --org <slug> --last 20
 *
 * @module report-telemetry-tracker
 */

const fs = require('fs');
const path = require('path');

const MAX_ENTRIES = 10000;
const RETENTION_DAYS = 90;

class ReportTelemetryTracker {
  constructor(options = {}) {
    this.orgSlug = options.orgSlug || process.env.ORG_SLUG || 'default';
    this.instance = options.instance || process.env.SF_INSTANCE || 'production';
    this.verbose = options.verbose || false;

    this.basePath = options.basePath || path.join(
      process.cwd(),
      'orgs', this.orgSlug,
      'platforms', 'salesforce', this.instance,
      'reports'
    );

    this.telemetryFile = path.join(this.basePath, 'telemetry.jsonl');
  }

  /**
   * Log a telemetry event
   */
  logEvent(event) {
    const entry = {
      timestamp: new Date().toISOString(),
      operation: event.operation || 'unknown',
      outcome: event.outcome || 'unknown',
      duration_ms: event.duration_ms || 0,
      org_alias: event.org_alias || process.env.SF_TARGET_ORG || null,
      report_id: event.reportId || event.report_id || null,
      report_type: event.report_type || null,
      report_format: event.report_format || null,
      preflight_attempts: event.preflight_attempts || 0,
      repairs_applied: event.repairs_applied || 0,
      repair_strategies: event.repair_strategies || [],
      silent_drop_count: event.silent_drop_count || 0,
      disambiguation_count: event.disambiguation_count || 0,
      type_fallback_used: event.type_fallback_used || false,
      constraint_transformations: event.constraint_transformations || 0,
      dependency_warnings: event.dependency_warnings || 0,
      extra: event.extra || {}
    };

    this._ensureDir(this.basePath);

    try {
      fs.appendFileSync(this.telemetryFile, JSON.stringify(entry) + '\n');

      // Check if pruning needed
      this._pruneIfNeeded();
    } catch (e) {
      if (this.verbose) console.warn(`Telemetry write error: ${e.message}`);
    }
  }

  /**
   * Generate dashboard metrics
   *
   * @param {number} days - Number of days to analyze
   */
  dashboard(days = 30) {
    const events = this._loadEvents(days);

    if (events.length === 0) {
      return {
        period_days: days,
        total_events: 0,
        message: 'No telemetry data available for the specified period'
      };
    }

    const creates = events.filter(e => e.operation === 'create');
    const updates = events.filter(e => e.operation === 'update');
    const deletes = events.filter(e => e.operation === 'delete');

    const successEvents = events.filter(e => e.outcome === 'success');
    const failedEvents = events.filter(e => e.outcome === 'failed' || e.outcome === 'api_error' || e.outcome === 'exception');
    const repairedEvents = events.filter(e => e.repairs_applied > 0 && e.outcome === 'success');
    const firstPassSuccess = events.filter(e => e.outcome === 'success' && e.preflight_attempts <= 1 && e.repairs_applied === 0);

    const totalOps = creates.length + updates.length + deletes.length;
    const silentDropTotal = events.reduce((sum, e) => sum + (e.silent_drop_count || 0), 0);
    const avgPreflightCycles = events.length > 0
      ? events.reduce((sum, e) => sum + (e.preflight_attempts || 0), 0) / events.length
      : 0;

    const repairStrategyCounts = {};
    events.forEach(e => {
      (e.repair_strategies || []).forEach(s => {
        repairStrategyCounts[s] = (repairStrategyCounts[s] || 0) + 1;
      });
    });

    const depWarnings = events.filter(e => e.dependency_warnings > 0).length;
    const typeFallbacks = events.filter(e => e.type_fallback_used).length;

    return {
      period_days: days,
      total_events: events.length,
      operations: {
        create: creates.length,
        update: updates.length,
        delete: deletes.length,
        total: totalOps
      },
      metrics: {
        first_pass_success_rate: totalOps > 0 ? +(firstPassSuccess.length / totalOps).toFixed(3) : null,
        repair_rate: totalOps > 0 ? +(repairedEvents.length / totalOps).toFixed(3) : null,
        repair_success_rate: repairedEvents.length > 0
          ? +(repairedEvents.filter(e => e.outcome === 'success').length / repairedEvents.length).toFixed(3)
          : null,
        unresolved_ambiguity_rate: events.filter(e => e.disambiguation_count > 0).length,
        silent_drop_count: silentDropTotal,
        rollback_incidents: depWarnings,
        preflight_cycles_avg: +avgPreflightCycles.toFixed(2),
        report_type_fallback_rate: totalOps > 0 ? +(typeFallbacks / totalOps).toFixed(3) : null
      },
      targets: {
        first_pass_success_rate: { target: 0.8, status: null },
        repair_rate: { target: 0.2, status: null },
        repair_success_rate: { target: 0.9, status: null },
        silent_drop_count: { target: 0, status: silentDropTotal === 0 ? 'PASS' : 'CRITICAL_FAIL' },
        preflight_cycles_avg: { target: 1.5, status: null }
      },
      repair_strategies: repairStrategyCounts,
      avg_duration_ms: events.length > 0
        ? Math.round(events.reduce((sum, e) => sum + (e.duration_ms || 0), 0) / events.length)
        : 0
    };
  }

  /**
   * Get recent events
   */
  recentEvents(count = 20) {
    const events = this._loadEvents();
    return events.slice(-count);
  }

  /**
   * Load events from JSONL file
   */
  _loadEvents(days = null) {
    if (!fs.existsSync(this.telemetryFile)) return [];

    const cutoff = days ? new Date(Date.now() - days * 24 * 60 * 60 * 1000) : null;

    try {
      const lines = fs.readFileSync(this.telemetryFile, 'utf8').trim().split('\n').filter(Boolean);
      return lines.map(line => {
        try { return JSON.parse(line); } catch (e) { return null; }
      }).filter(e => {
        if (!e) return false;
        if (cutoff && new Date(e.timestamp) < cutoff) return false;
        return true;
      });
    } catch (e) {
      return [];
    }
  }

  /**
   * Prune old events beyond retention period or max entries
   */
  _pruneIfNeeded() {
    if (!fs.existsSync(this.telemetryFile)) return;

    try {
      const lines = fs.readFileSync(this.telemetryFile, 'utf8').trim().split('\n').filter(Boolean);

      if (lines.length <= MAX_ENTRIES) return;

      const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
      const kept = lines.filter(line => {
        try {
          const e = JSON.parse(line);
          return new Date(e.timestamp) >= cutoff;
        } catch (e) { return false; }
      });

      // Keep only the most recent MAX_ENTRIES
      const trimmed = kept.slice(-MAX_ENTRIES);
      fs.writeFileSync(this.telemetryFile, trimmed.join('\n') + '\n');
    } catch (e) {
      // Don't fail on prune errors
    }
  }

  _ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }
}

// ============================================================================
// CLI
// ============================================================================

if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  const orgFlag = args.indexOf('--org');
  const orgSlug = orgFlag >= 0 ? args[orgFlag + 1] : process.env.ORG_SLUG;
  const daysFlag = args.indexOf('--days');
  const days = daysFlag >= 0 ? parseInt(args[daysFlag + 1]) : 30;
  const lastFlag = args.indexOf('--last');
  const lastN = lastFlag >= 0 ? parseInt(args[lastFlag + 1]) : 20;

  const tracker = new ReportTelemetryTracker({ orgSlug, verbose: true });

  if (command === 'dashboard') {
    const dashboard = tracker.dashboard(days);

    console.log(`\n=== Report CRUD Telemetry Dashboard (${days} days) ===`);
    console.log(`Total events: ${dashboard.total_events}`);

    if (dashboard.total_events === 0) {
      console.log(dashboard.message);
      process.exit(0);
    }

    console.log(`\nOperations:`);
    console.log(`  Create: ${dashboard.operations.create}`);
    console.log(`  Update: ${dashboard.operations.update}`);
    console.log(`  Delete: ${dashboard.operations.delete}`);

    console.log(`\nKey Metrics:`);
    const m = dashboard.metrics;
    console.log(`  First-pass success rate: ${m.first_pass_success_rate !== null ? (m.first_pass_success_rate * 100).toFixed(1) + '%' : 'N/A'} (target: >80%)`);
    console.log(`  Repair rate: ${m.repair_rate !== null ? (m.repair_rate * 100).toFixed(1) + '%' : 'N/A'} (target: <20%)`);
    console.log(`  Repair success rate: ${m.repair_success_rate !== null ? (m.repair_success_rate * 100).toFixed(1) + '%' : 'N/A'} (target: >90%)`);
    console.log(`  Silent drop count: ${m.silent_drop_count} ${m.silent_drop_count === 0 ? '(PASS)' : '(CRITICAL FAIL)'}`);
    console.log(`  Preflight cycles avg: ${m.preflight_cycles_avg} (target: <1.5)`);
    console.log(`  Type fallback rate: ${m.report_type_fallback_rate !== null ? (m.report_type_fallback_rate * 100).toFixed(1) + '%' : 'N/A'}`);

    if (Object.keys(dashboard.repair_strategies).length > 0) {
      console.log(`\nRepair strategies used:`);
      for (const [strategy, count] of Object.entries(dashboard.repair_strategies)) {
        console.log(`  ${strategy}: ${count}`);
      }
    }

    console.log(`\nAvg duration: ${dashboard.avg_duration_ms}ms`);
  } else if (command === 'events') {
    const events = tracker.recentEvents(lastN);
    console.log(`\n=== Recent Events (last ${lastN}) ===`);
    events.forEach(e => {
      console.log(`  ${e.timestamp} | ${e.operation.padEnd(8)} | ${e.outcome.padEnd(12)} | ${e.duration_ms}ms | repairs:${e.repairs_applied}`);
    });
  } else {
    console.log('Report Telemetry Tracker');
    console.log('Usage:');
    console.log('  node report-telemetry-tracker.js dashboard --org <slug> --days 30');
    console.log('  node report-telemetry-tracker.js events --org <slug> --last 20');
  }
}

module.exports = { ReportTelemetryTracker };
