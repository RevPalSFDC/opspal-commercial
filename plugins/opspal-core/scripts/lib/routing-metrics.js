#!/usr/bin/env node

/**
 * Routing Metrics & Observability (P2-3)
 *
 * Provides logging, metrics, and alerting for routing decisions.
 * Logs to ~/.claude/logs/routing-decisions.jsonl for analysis.
 *
 * Usage:
 *   node routing-metrics.js log <event-data>   # Log a routing decision
 *   node routing-metrics.js stats              # Show routing statistics
 *   node routing-metrics.js errors [--days N]  # Show recent errors
 *   node routing-metrics.js agents             # Agent usage breakdown
 *   node routing-metrics.js anomalies          # Detect anomalies
 *   node routing-metrics.js export [--format]  # Export metrics
 *
 * @copyright 2024-2026 RevPal Partners, LLC
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');
const { resolveHistoricalRoutingLogSemantics } = require('./routing-semantics');

// =============================================================================
// Configuration
// =============================================================================

const LOG_DIR = path.join(os.homedir(), '.claude', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'routing-decisions.jsonl');
const METRICS_CACHE_FILE = path.join(LOG_DIR, 'routing-metrics-cache.json');

// Thresholds for anomaly detection
const ANOMALY_THRESHOLDS = {
  errorRateWarning: 0.05,   // 5% error rate triggers warning
  errorRateCritical: 0.15,  // 15% error rate is critical
  resolutionTimeWarning: 500, // 500ms is slow resolution
  unusedAgentDays: 7,       // Agent unused for 7 days triggers alert
  duplicateResolutionThreshold: 0.3 // 30% duplicate resolutions is a concern
};

// =============================================================================
// Logging Functions
// =============================================================================

/**
 * Ensures log directory exists
 */
function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

/**
 * Logs a routing decision event
 * @param {Object} event - The routing event to log
 */
function logRoutingEvent(event) {
  ensureLogDir();

  const logEntry = {
    timestamp: new Date().toISOString(),
    ...event,
    metadata: {
      hostname: os.hostname(),
      pid: process.pid,
      nodeVersion: process.version,
      ...(event.metadata || {})
    }
  };

  const line = JSON.stringify(logEntry) + '\n';
  fs.appendFileSync(LOG_FILE, line);

  return logEntry;
}

/**
 * Creates a routing decision event
 * @param {Object} params - Event parameters
 * @returns {Object} Structured event
 */
function createRoutingEvent(params) {
  const {
    type = 'routing_decision',
    inputAgent,
    resolvedAgent,
    requiredAgent,
    routeKind,
    guidanceAction,
    wasResolved,
    requiresSpecialist = false,
    promptGuidanceOnly = true,
    promptBlocked = false,
    executionBlockUntilCleared = false,
    blockReason,
    keywords = [],
    complexity,
    durationMs,
    source = 'unknown',
    error
  } = params;

  return {
    type,
    input: {
      agent: inputAgent,
      keywords
    },
    output: {
      agent: resolvedAgent,
      suggestedAgent: resolvedAgent,
      requiredAgent,
      routeKind,
      guidanceAction,
      wasResolved,
      requiresSpecialist,
      promptGuidanceOnly,
      promptBlocked,
      executionBlockUntilCleared,
      blockReason
    },
    metrics: {
      complexity,
      durationMs
    },
    source,
    error: error ? {
      message: error.message || error,
      code: error.code
    } : undefined
  };
}

function getRoutingOutput(entry = {}) {
  return entry.output || entry;
}

function resolveEntrySemantics(entry = {}) {
  return resolveHistoricalRoutingLogSemantics(entry);
}

function getResolvedAgent(entry = {}) {
  return resolveEntrySemantics(entry).routedAgent;
}

function isExecutionGatedRoute(entry = {}) {
  return resolveEntrySemantics(entry).executionBlockUntilCleared;
}

// =============================================================================
// Log Reading Functions
// =============================================================================

/**
 * Reads log entries from a file, optionally filtered
 * @param {Object} options - Filter options
 * @returns {Promise<Array>} Log entries
 */
async function readLogEntries(options = {}) {
  const { since, until, type, limit = 10000 } = options;

  if (!fs.existsSync(LOG_FILE)) {
    return [];
  }

  const entries = [];
  const fileStream = fs.createReadStream(LOG_FILE);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    if (!line.trim()) continue;

    try {
      const entry = JSON.parse(line);

      // Apply filters
      if (since && new Date(entry.timestamp) < new Date(since)) continue;
      if (until && new Date(entry.timestamp) > new Date(until)) continue;
      if (type && entry.type !== type) continue;

      entries.push(entry);

      if (entries.length >= limit) break;
    } catch (e) {
      // Skip malformed entries
    }
  }

  return entries;
}

/**
 * Gets entries from the last N days
 * @param {number} days - Number of days
 * @returns {Promise<Array>} Log entries
 */
async function getRecentEntries(days = 7) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  return readLogEntries({ since: since.toISOString() });
}

// =============================================================================
// Statistics Functions
// =============================================================================

/**
 * Calculates routing statistics
 * @param {Array} entries - Log entries to analyze
 * @returns {Object} Statistics
 */
function calculateStats(entries) {
  const routingDecisions = entries.filter(e => e.type === 'routing_decision');
  const overrideAuditEvents = entries.filter(e => e.type === 'override_audit');
  const overrideWarningEvents = entries.filter(e => e.type === 'override_warning');
  const sessionsWithOverrides = new Set(
    [...overrideAuditEvents, ...overrideWarningEvents]
      .map((entry) => entry.sessionId)
      .filter(Boolean)
  ).size;

  if (routingDecisions.length === 0) {
    return {
      totalDecisions: 0,
      successRate: 0,
      errorRate: 0,
      avgDurationMs: 0,
      blockingRate: 0,
      resolutionRate: 0,
      minDurationMs: 0,
      maxDurationMs: 0,
      overrideAuditCount: overrideAuditEvents.length,
      overrideWarningCount: overrideWarningEvents.length,
      sessionsWithOverrides
    };
  }

  const successful = routingDecisions.filter(e => !e.error);
  const errors = routingDecisions.filter(e => e.error);
  const executionGated = routingDecisions.filter(isExecutionGatedRoute);
  const resolved = routingDecisions.filter(e => e.output?.wasResolved);

  const durations = routingDecisions
    .map(e => e.metrics?.durationMs)
    .filter(d => typeof d === 'number');

  const avgDuration = durations.length > 0
    ? durations.reduce((a, b) => a + b, 0) / durations.length
    : 0;

  return {
    totalDecisions: routingDecisions.length,
    successCount: successful.length,
    errorCount: errors.length,
    successRate: successful.length / routingDecisions.length,
    errorRate: errors.length / routingDecisions.length,
    executionGateCount: executionGated.length,
    executionGateRate: executionGated.length / routingDecisions.length,
    blockingCount: executionGated.length,
    blockingRate: executionGated.length / routingDecisions.length,
    resolutionCount: resolved.length,
    resolutionRate: resolved.length / routingDecisions.length,
    avgDurationMs: Math.round(avgDuration * 100) / 100,
    minDurationMs: durations.length > 0 ? Math.min(...durations) : 0,
    maxDurationMs: durations.length > 0 ? Math.max(...durations) : 0,
    overrideAuditCount: overrideAuditEvents.length,
    overrideWarningCount: overrideWarningEvents.length,
    sessionsWithOverrides
  };
}

/**
 * Gets agent usage breakdown
 * @param {Array} entries - Log entries
 * @returns {Object} Agent usage stats
 */
function getAgentUsage(entries) {
  const routingDecisions = entries.filter(e => e.type === 'routing_decision');
  const agentCounts = {};
  const inputAgentCounts = {};

  for (const entry of routingDecisions) {
    const resolvedAgent = getResolvedAgent(entry);
    const inputAgent = entry.input?.agent;

    if (resolvedAgent) {
      agentCounts[resolvedAgent] = (agentCounts[resolvedAgent] || 0) + 1;
    }

    if (inputAgent && inputAgent !== resolvedAgent) {
      inputAgentCounts[inputAgent] = (inputAgentCounts[inputAgent] || 0) + 1;
    }
  }

  // Sort by usage
  const sortedAgents = Object.entries(agentCounts)
    .sort(([, a], [, b]) => b - a)
    .map(([agent, count]) => ({
      agent,
      count,
      percentage: Math.round((count / routingDecisions.length) * 1000) / 10
    }));

  return {
    totalRoutings: routingDecisions.length,
    uniqueAgents: Object.keys(agentCounts).length,
    topAgents: sortedAgents.slice(0, 10),
    resolvedFrom: Object.keys(inputAgentCounts).length,
    resolutionBreakdown: Object.entries(inputAgentCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([agent, count]) => ({ agent, count }))
  };
}

/**
 * Gets error breakdown
 * @param {Array} entries - Log entries
 * @returns {Object} Error stats
 */
function getErrorBreakdown(entries) {
  const errors = entries.filter(e => e.error);
  const errorTypes = {};

  for (const entry of errors) {
    const errorType = entry.error?.code || entry.error?.message || 'unknown';
    if (!errorTypes[errorType]) {
      errorTypes[errorType] = {
        count: 0,
        examples: []
      };
    }
    errorTypes[errorType].count++;
    if (errorTypes[errorType].examples.length < 3) {
      errorTypes[errorType].examples.push({
        timestamp: entry.timestamp,
        input: entry.input?.agent,
        message: entry.error?.message
      });
    }
  }

  return {
    totalErrors: errors.length,
    uniqueErrorTypes: Object.keys(errorTypes).length,
    breakdown: Object.entries(errorTypes)
      .sort(([, a], [, b]) => b.count - a.count)
      .map(([type, data]) => ({
        type,
        count: data.count,
        examples: data.examples
      }))
  };
}

// =============================================================================
// Anomaly Detection
// =============================================================================

/**
 * Detects anomalies in routing patterns
 * @param {Array} entries - Log entries
 * @returns {Array} Detected anomalies
 */
function detectAnomalies(entries) {
  const anomalies = [];
  const stats = calculateStats(entries);
  const agentUsage = getAgentUsage(entries);

  // Error rate anomalies
  if (stats.errorRate >= ANOMALY_THRESHOLDS.errorRateCritical) {
    anomalies.push({
      type: 'error_rate_critical',
      severity: 'critical',
      message: `Error rate ${(stats.errorRate * 100).toFixed(1)}% exceeds critical threshold`,
      value: stats.errorRate,
      threshold: ANOMALY_THRESHOLDS.errorRateCritical
    });
  } else if (stats.errorRate >= ANOMALY_THRESHOLDS.errorRateWarning) {
    anomalies.push({
      type: 'error_rate_warning',
      severity: 'warning',
      message: `Error rate ${(stats.errorRate * 100).toFixed(1)}% exceeds warning threshold`,
      value: stats.errorRate,
      threshold: ANOMALY_THRESHOLDS.errorRateWarning
    });
  }

  // Slow resolution detection
  const slowResolutions = entries.filter(
    e => e.metrics?.durationMs > ANOMALY_THRESHOLDS.resolutionTimeWarning
  );
  if (slowResolutions.length > entries.length * 0.1) {
    anomalies.push({
      type: 'slow_resolution',
      severity: 'warning',
      message: `${slowResolutions.length} routing decisions (${((slowResolutions.length / entries.length) * 100).toFixed(1)}%) exceeded ${ANOMALY_THRESHOLDS.resolutionTimeWarning}ms`,
      value: slowResolutions.length,
      threshold: ANOMALY_THRESHOLDS.resolutionTimeWarning
    });
  }

  // High resolution rate (many short names being resolved)
  if (stats.resolutionRate > ANOMALY_THRESHOLDS.duplicateResolutionThreshold) {
    anomalies.push({
      type: 'high_resolution_rate',
      severity: 'info',
      message: `${(stats.resolutionRate * 100).toFixed(1)}% of agent names required resolution - consider using fully-qualified names`,
      value: stats.resolutionRate,
      threshold: ANOMALY_THRESHOLDS.duplicateResolutionThreshold
    });
  }

  // High blocking rate
  if (stats.executionGateRate > 0.3) {
    anomalies.push({
      type: 'high_execution_gate_rate',
      severity: 'info',
      message: `${(stats.executionGateRate * 100).toFixed(1)}% of routing attempts activated execution-time specialist gates`,
      value: stats.executionGateRate
    });
  }

  return anomalies;
}

// =============================================================================
// CLI Interface
// =============================================================================

function printHelp() {
  console.log(`
Routing Metrics & Observability

Usage:
  node routing-metrics.js <command> [options]

Commands:
  log <json>          Log a routing decision event
  stats [--days N]    Show routing statistics (default: 7 days)
  errors [--days N]   Show error breakdown
  agents [--days N]   Show agent usage breakdown
  anomalies [--days] Detect anomalies
  export [--format]   Export metrics (json, csv)
  clear [--before]    Clear old log entries

Options:
  --days N            Number of days to analyze (default: 7)
  --format FORMAT     Export format: json, csv (default: json)
  --json              Output as JSON

Examples:
  node routing-metrics.js stats --days 30
  node routing-metrics.js errors --days 7
  node routing-metrics.js anomalies
  node routing-metrics.js export --format csv
`);
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const isJson = args.includes('--json');

  // Parse --days option
  const daysIdx = args.indexOf('--days');
  const days = daysIdx !== -1 && args[daysIdx + 1]
    ? parseInt(args[daysIdx + 1], 10)
    : 7;

  switch (command) {
    case 'log': {
      // Log event from JSON argument or stdin
      let eventData;
      if (args[1]) {
        try {
          eventData = JSON.parse(args[1]);
        } catch (e) {
          console.error('Invalid JSON:', e.message);
          process.exit(1);
        }
      } else {
        // Read from stdin
        const stdin = fs.readFileSync(0, 'utf8');
        try {
          eventData = JSON.parse(stdin);
        } catch (e) {
          console.error('Invalid JSON from stdin:', e.message);
          process.exit(1);
        }
      }

      const logged = logRoutingEvent(eventData);
      if (isJson) {
        console.log(JSON.stringify(logged, null, 2));
      } else {
        console.log(`✅ Logged routing event at ${logged.timestamp}`);
      }
      break;
    }

    case 'stats': {
      const entries = await getRecentEntries(days);
      const stats = calculateStats(entries);

      if (isJson) {
        console.log(JSON.stringify({ days, ...stats }, null, 2));
      } else {
        console.log(`\n📊 Routing Statistics (Last ${days} days)\n`);
        console.log(`Total Decisions:   ${stats.totalDecisions}`);
        console.log(`Success Rate:      ${(stats.successRate * 100).toFixed(1)}%`);
        console.log(`Error Rate:        ${(stats.errorRate * 100).toFixed(1)}%`);
        console.log(`Execution Gates:   ${(stats.executionGateRate * 100).toFixed(1)}%`);
        console.log(`Resolution Rate:   ${(stats.resolutionRate * 100).toFixed(1)}%`);
        console.log(`Avg Duration:      ${stats.avgDurationMs}ms`);
        console.log(`Min/Max Duration:  ${stats.minDurationMs}ms / ${stats.maxDurationMs}ms`);
        console.log(`Override Audits:   ${stats.overrideAuditCount}`);
        console.log(`Override Warnings: ${stats.overrideWarningCount}`);
        console.log(`Override Sessions: ${stats.sessionsWithOverrides}`);
      }
      break;
    }

    case 'errors': {
      const entries = await getRecentEntries(days);
      const errorBreakdown = getErrorBreakdown(entries);

      if (isJson) {
        console.log(JSON.stringify({ days, ...errorBreakdown }, null, 2));
      } else {
        console.log(`\n❌ Error Breakdown (Last ${days} days)\n`);
        console.log(`Total Errors: ${errorBreakdown.totalErrors}`);
        console.log(`Error Types:  ${errorBreakdown.uniqueErrorTypes}\n`);

        for (const error of errorBreakdown.breakdown.slice(0, 10)) {
          console.log(`  ${error.type}: ${error.count} occurrences`);
          for (const ex of error.examples) {
            console.log(`    - ${ex.timestamp}: ${ex.input || 'N/A'}`);
          }
        }
      }
      break;
    }

    case 'agents': {
      const entries = await getRecentEntries(days);
      const agentUsage = getAgentUsage(entries);

      if (isJson) {
        console.log(JSON.stringify({ days, ...agentUsage }, null, 2));
      } else {
        console.log(`\n🤖 Agent Usage (Last ${days} days)\n`);
        console.log(`Total Routings:  ${agentUsage.totalRoutings}`);
        console.log(`Unique Agents:   ${agentUsage.uniqueAgents}\n`);

        console.log('Top Agents:');
        for (const agent of agentUsage.topAgents) {
          console.log(`  ${agent.agent}: ${agent.count} (${agent.percentage}%)`);
        }

        if (agentUsage.resolutionBreakdown.length > 0) {
          console.log('\nShort Names Resolved:');
          for (const item of agentUsage.resolutionBreakdown) {
            console.log(`  ${item.agent}: ${item.count} times`);
          }
        }
      }
      break;
    }

    case 'anomalies': {
      const entries = await getRecentEntries(days);
      const anomalies = detectAnomalies(entries);

      if (isJson) {
        console.log(JSON.stringify({ days, anomalies }, null, 2));
      } else {
        console.log(`\n⚠️ Anomaly Detection (Last ${days} days)\n`);

        if (anomalies.length === 0) {
          console.log('✅ No anomalies detected');
        } else {
          for (const anomaly of anomalies) {
            const icon = anomaly.severity === 'critical' ? '🔴'
              : anomaly.severity === 'warning' ? '🟡'
              : '🔵';
            console.log(`${icon} [${anomaly.severity.toUpperCase()}] ${anomaly.message}`);
          }
        }
      }
      break;
    }

    case 'export': {
      const formatIdx = args.indexOf('--format');
      const format = formatIdx !== -1 && args[formatIdx + 1]
        ? args[formatIdx + 1]
        : 'json';

      const entries = await getRecentEntries(days);
      const stats = calculateStats(entries);
      const agentUsage = getAgentUsage(entries);
      const errorBreakdown = getErrorBreakdown(entries);
      const anomalies = detectAnomalies(entries);

      const report = {
        generatedAt: new Date().toISOString(),
        period: { days, entries: entries.length },
        stats,
        agentUsage,
        errorBreakdown,
        anomalies
      };

      if (format === 'csv') {
        // Simple CSV export of stats
        console.log('metric,value');
        console.log(`total_decisions,${stats.totalDecisions}`);
        console.log(`success_rate,${stats.successRate}`);
        console.log(`error_rate,${stats.errorRate}`);
        console.log(`execution_gate_rate,${stats.executionGateRate}`);
        console.log(`resolution_rate,${stats.resolutionRate}`);
        console.log(`avg_duration_ms,${stats.avgDurationMs}`);
        console.log(`unique_agents,${agentUsage.uniqueAgents}`);
        console.log(`total_errors,${errorBreakdown.totalErrors}`);
        console.log(`anomalies_count,${anomalies.length}`);
      } else {
        console.log(JSON.stringify(report, null, 2));
      }
      break;
    }

    case 'clear': {
      const beforeIdx = args.indexOf('--before');
      const beforeDays = beforeIdx !== -1 && args[beforeIdx + 1]
        ? parseInt(args[beforeIdx + 1], 10)
        : 30;

      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - beforeDays);

      const entries = await readLogEntries({ since: cutoff.toISOString() });

      // Rewrite file with only recent entries
      ensureLogDir();
      const content = entries.map(e => JSON.stringify(e)).join('\n') + '\n';
      fs.writeFileSync(LOG_FILE, content);

      console.log(`✅ Cleared entries older than ${beforeDays} days. Kept ${entries.length} entries.`);
      break;
    }

    case 'help':
    case '--help':
      printHelp();
      break;

    default:
      printHelp();
      process.exit(1);
  }
}

// =============================================================================
// Exports
// =============================================================================

module.exports = {
  logRoutingEvent,
  createRoutingEvent,
  readLogEntries,
  getRecentEntries,
  calculateStats,
  getAgentUsage,
  getErrorBreakdown,
  detectAnomalies,
  LOG_FILE,
  ANOMALY_THRESHOLDS
};

// Run if executed directly
if (require.main === module) {
  main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
}
