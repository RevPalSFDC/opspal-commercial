#!/usr/bin/env node
/**
 * friction-scorer
 *
 * Aggregates per-session friction signals into a single weighted score plus
 * a category breakdown. Consumed by /reflect to surface high-friction
 * sessions as candidates for proactive tuning.
 *
 * Input signals (all optional — missing signals contribute 0):
 *   - routing-logger.getRoutingStats()  -> hook denies (executionGated)
 *                                          and advisory warnings
 *   - claude-log-parser --include-debug -> slow hooks, stalls, reconnects,
 *                                          overloaded, tool_search_disabled
 *   - ~/.claude/logs/traces.jsonl       -> failed spans (by traceId)
 *   - ~/.claude/logs/hooks/*.jsonl      -> per-hook error/warn counts
 *
 * Weights are tunable via constructor options.defaultWeights or by editing
 * DEFAULT_WEIGHTS below. Severity thresholds tunable via options.thresholds.
 *
 * CLI:
 *   node friction-scorer.js score                          # current session
 *   node friction-scorer.js score --trace-id <id>
 *   node friction-scorer.js score --debug-log <path> --json
 *   node friction-scorer.js score --since 2026-04-16T18:00:00Z --json
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const ClaudeLogParser = require('./claude-log-parser');

// Optional deps — fail soft if missing
let routingLogger = null;
try {
  routingLogger = require('./routing-logger');
} catch (_) { /* ok */ }

let TraceContext = null;
try {
  TraceContext = require('./trace-context');
} catch (_) { /* ok */ }

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_WEIGHTS = {
  hook_deny: 10,          // each blocked tool call
  slow_hook: 5,           // each slow hook (>5s)
  streaming_stall: 3,     // each >30s gap
  mcp_reconnect: 3,       // each MCP transport failure
  overloaded: 4,          // each overloaded_error fallback
  tool_search_disabled: 0.05, // per occurrence; capped below (very frequent, low per-event weight)
  routing_advisory: 1,    // each routing advisory warning
  span_error: 2,          // each failed trace span (session-level)
  hook_error: 2           // each hook-level error line
};

const DEFAULT_THRESHOLDS = {
  slow_hook_min_ms: 5000,       // ignore sub-5s "slow" hooks
  streaming_stall_min_s: 30,    // ignore sub-30s stalls
  tool_search_disabled_cap: 20, // cap total contribution from this signal
  low_max: 19,                  // severity bucket
  medium_max: 49
};

// ---------------------------------------------------------------------------
// Signal collectors
// ---------------------------------------------------------------------------

function collectRoutingStats(since) {
  if (!routingLogger || typeof routingLogger.getRoutingStats !== 'function') {
    return { executionGated: 0, advisory: 0, total: 0, available: false };
  }
  try {
    const stats = routingLogger.getRoutingStats({ since });
    return {
      executionGated: stats.executionGated || 0,
      advisory: stats.advisory || 0,
      total: stats.total || 0,
      available: true
    };
  } catch (err) {
    return { executionGated: 0, advisory: 0, total: 0, available: false, error: err.message };
  }
}

/**
 * Run claude-log-parser --include-debug over either a specific debug-log
 * path or the default `~/.claude/logs/` directory.
 */
async function collectFromDebugLog({ debugLogPath, hours }) {
  const parser = new ClaudeLogParser({
    includeDebug: true,
    hours: hours || 24
  });
  if (debugLogPath) {
    // Single-file mode — bypass the directory scan.
    const source = path.basename(debugLogPath);
    try {
      const raw = fs.readFileSync(debugLogPath, 'utf8');
      for (const line of raw.split('\n')) {
        if (line.trim()) parser.parseLine(line, source);
      }
    } catch (err) {
      return { error: `Could not read debug log: ${err.message}`, signals: [] };
    }
  } else {
    // Default directory scan. Suppress the parser's own stdout banner by
    // redirecting it — we only want the aggregated report.
    const origLog = console.log;
    console.log = () => {};
    try {
      await parser.parse();
    } catch (err) {
      console.log = origLog;
      return { error: err.message, signals: [] };
    }
    console.log = origLog;
  }
  const report = parser.getJSONReport();
  return {
    signals: report.frictionSignals || [],
    byType: report.summary.frictionByType || {},
    totalErrors: report.summary.totalErrors || 0,
    totalWarnings: report.summary.totalWarnings || 0
  };
}

function collectTraceSpans(traceId) {
  if (!traceId) return { failedSpans: 0, totalSpans: 0, available: false };
  const tracesPath = path.join(os.homedir(), '.claude', 'logs', 'traces.jsonl');
  if (!fs.existsSync(tracesPath)) {
    return { failedSpans: 0, totalSpans: 0, available: false };
  }
  let failed = 0;
  let total = 0;
  try {
    const raw = fs.readFileSync(tracesPath, 'utf8');
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue;
      try {
        const span = JSON.parse(line);
        if (span.traceId !== traceId && span.trace_id !== traceId) continue;
        total++;
        const status = span.status || span.status_code || '';
        if (String(status).toUpperCase() === 'ERROR' || span.error) failed++;
      } catch (_) { /* ignore malformed */ }
    }
  } catch (err) {
    return { failedSpans: 0, totalSpans: 0, available: false, error: err.message };
  }
  return { failedSpans: failed, totalSpans: total, available: true };
}

function collectHookLogErrors({ since }) {
  const hookLogDir = path.join(os.homedir(), '.claude', 'logs', 'hooks');
  if (!fs.existsSync(hookLogDir)) {
    return { errors: 0, warnings: 0, available: false };
  }
  let errors = 0;
  let warnings = 0;
  const sinceMs = since ? new Date(since).getTime() : 0;
  try {
    for (const file of fs.readdirSync(hookLogDir)) {
      if (!file.endsWith('.jsonl')) continue;
      const filePath = path.join(hookLogDir, file);
      const raw = fs.readFileSync(filePath, 'utf8');
      for (const line of raw.split('\n')) {
        if (!line.trim()) continue;
        try {
          const obj = JSON.parse(line);
          if (sinceMs && obj.timestamp && new Date(obj.timestamp).getTime() < sinceMs) continue;
          const level = (obj.level || '').toLowerCase();
          if (level === 'error' || obj.exitCode > 0) errors++;
          else if (level === 'warn' || level === 'warning') warnings++;
        } catch (_) { /* ignore */ }
      }
    }
  } catch (err) {
    return { errors, warnings, available: false, error: err.message };
  }
  return { errors, warnings, available: true };
}

// ---------------------------------------------------------------------------
// Scorer
// ---------------------------------------------------------------------------

class FrictionScorer {
  constructor(options = {}) {
    this.weights = { ...DEFAULT_WEIGHTS, ...(options.weights || {}) };
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...(options.thresholds || {}) };
    this.traceId = options.traceId || (TraceContext ? tryGetTraceId() : null);
    this.since = options.since || null;
    this.debugLogPath = options.debugLogPath || null;
    this.hours = options.hours || 24;
  }

  async score() {
    // When scoring a specific historical debug log, do NOT mix in current-
    // session state (routing.jsonl, hooks/*.jsonl) — those reflect the
    // analyst's own machine, not the captured session. In debug-log mode
    // the log itself is the authoritative source; routing-advisory counts
    // come from the parsed log's hook_deny entries via collectFromDebugLog.
    const isDebugLogMode = !!this.debugLogPath;

    const logs = await collectFromDebugLog({
      debugLogPath: this.debugLogPath,
      hours: this.hours
    });

    const routing = isDebugLogMode
      ? { executionGated: 0, advisory: 0, total: 0, available: false, suppressed: 'debug-log-mode' }
      : collectRoutingStats(this.since);

    const hookLogs = isDebugLogMode
      ? { errors: 0, warnings: 0, available: false, suppressed: 'debug-log-mode' }
      : collectHookLogErrors({ since: this.since });

    const spans = collectTraceSpans(this.traceId);

    // Filter signals by threshold
    const slowHooks = logs.signals.filter(s =>
      s.type === 'slow_hook' && (s.detail?.elapsed_ms || 0) >= this.thresholds.slow_hook_min_ms
    );
    const stalls = logs.signals.filter(s =>
      s.type === 'streaming_stall' && (s.detail?.gap_seconds || 0) >= this.thresholds.streaming_stall_min_s
    );
    const reconnects = logs.signals.filter(s => s.type === 'mcp_reconnect');
    const overloaded = logs.signals.filter(s => s.type === 'overloaded');
    const toolSearch = logs.signals.filter(s => s.type === 'tool_search_disabled');
    // Debug-log hook_deny entries are redundant with routing stats
    // executionGated count in the typical case; prefer routing stats when
    // available, else use the parsed log count.
    const hookDenyFromLogs = logs.signals.filter(s => s.type === 'hook_deny').length;
    const hookDenies = routing.available ? routing.executionGated : hookDenyFromLogs;

    const breakdown = {
      hook_deny: hookDenies,
      slow_hook: slowHooks.length,
      streaming_stall: stalls.length,
      mcp_reconnect: reconnects.length,
      overloaded: overloaded.length,
      tool_search_disabled: toolSearch.length,
      routing_advisory: routing.advisory,
      span_error: spans.failedSpans,
      hook_error: hookLogs.errors
    };

    // Weighted score with cap on tool_search_disabled (otherwise a single
    // subagent-heavy session swamps the score).
    const toolSearchRaw = breakdown.tool_search_disabled * this.weights.tool_search_disabled;
    const toolSearchContribution = Math.min(toolSearchRaw, this.thresholds.tool_search_disabled_cap);

    const contributions = {
      hook_deny: breakdown.hook_deny * this.weights.hook_deny,
      slow_hook: breakdown.slow_hook * this.weights.slow_hook,
      streaming_stall: breakdown.streaming_stall * this.weights.streaming_stall,
      mcp_reconnect: breakdown.mcp_reconnect * this.weights.mcp_reconnect,
      overloaded: breakdown.overloaded * this.weights.overloaded,
      tool_search_disabled: toolSearchContribution,
      routing_advisory: breakdown.routing_advisory * this.weights.routing_advisory,
      span_error: breakdown.span_error * this.weights.span_error,
      hook_error: breakdown.hook_error * this.weights.hook_error
    };

    const score = Math.round(
      Object.values(contributions).reduce((a, b) => a + b, 0)
    );

    const severity = this.classify(score);

    // Top 20 events by weight (flatten signals with their weighted cost)
    const events = []
      .concat(slowHooks.map(s => ({ ...s, weight: this.weights.slow_hook })))
      .concat(stalls.map(s => ({ ...s, weight: this.weights.streaming_stall })))
      .concat(reconnects.map(s => ({ ...s, weight: this.weights.mcp_reconnect })))
      .concat(overloaded.map(s => ({ ...s, weight: this.weights.overloaded })))
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 20);

    return {
      score,
      severity,
      breakdown,
      contributions,
      events,
      metadata: {
        traceId: this.traceId,
        since: this.since,
        debugLogPath: this.debugLogPath,
        thresholds: this.thresholds,
        signalsAvailable: {
          routingLogger: routing.available,
          traceSpans: spans.available,
          hookLogs: hookLogs.available,
          debugLogError: logs.error || null
        }
      }
    };
  }

  classify(score) {
    if (score <= this.thresholds.low_max) return 'low';
    if (score <= this.thresholds.medium_max) return 'medium';
    return 'high';
  }
}

function tryGetTraceId() {
  try {
    if (TraceContext && typeof TraceContext.getOrCreate === 'function') {
      return TraceContext.getOrCreate().traceId;
    }
    if (TraceContext && typeof TraceContext === 'function') {
      return new TraceContext().traceId;
    }
  } catch (_) { /* ignore */ }
  return null;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = { cmd: argv[0] || 'score', format: 'json' };
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--trace-id') args.traceId = argv[++i];
    else if (a === '--since') args.since = argv[++i];
    else if (a === '--debug-log') args.debugLogPath = argv[++i];
    else if (a === '--hours') args.hours = parseInt(argv[++i], 10) || 24;
    else if (a === '--format') args.format = argv[++i];
    else if (a === '--json') args.format = 'json';
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

function printHelp() {
  console.log(`friction-scorer — per-session friction score

Usage:
  friction-scorer.js score [options]

Options:
  --trace-id <id>        Bind to a specific trace (default: current session)
  --since <iso>          Only events after this timestamp
  --debug-log <path>     Parse this debug log instead of scanning ~/.claude/logs/
  --hours <n>            Scan window when using default logs (default 24)
  --format json|text     Output format (default json)

Examples:
  node friction-scorer.js score
  node friction-scorer.js score --debug-log ~/Downloads/session.log
  node friction-scorer.js score --trace-id abc123 --json
`);
}

if (require.main === module) {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.cmd === 'help') {
    printHelp();
    process.exit(0);
  }
  const scorer = new FrictionScorer(args);
  scorer.score().then(result => {
    if (args.format === 'text') {
      console.log(`Friction score: ${result.score} (${result.severity})`);
      console.log('Breakdown:');
      for (const [key, val] of Object.entries(result.breakdown)) {
        if (val > 0) console.log(`  ${key}: ${val}`);
      }
    } else {
      console.log(JSON.stringify(result, null, 2));
    }
    process.exit(0);
  }).catch(err => {
    console.error(`friction-scorer: ${err.message}`);
    process.exit(1);
  });
}

module.exports = {
  FrictionScorer,
  DEFAULT_WEIGHTS,
  DEFAULT_THRESHOLDS
};
