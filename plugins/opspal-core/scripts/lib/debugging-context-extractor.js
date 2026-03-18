#!/usr/bin/env node

/**
 * Debugging Context Extractor
 *
 * Extracts debugging context from trace logs, unified logs, and error recovery
 * events to enrich reflection data with debugging metrics.
 *
 * Purpose: Connect production debugging infrastructure with the /reflect system
 * to automatically capture debugging metrics and identify instrumentation gaps.
 *
 * Usage:
 *   const { extractDebuggingContext } = require('./debugging-context-extractor');
 *   const context = await extractDebuggingContext({ timeWindowMinutes: 60 });
 *
 * Environment Variables:
 *   DEBUG_CONTEXT_VERBOSE - Enable verbose output
 *   TRACE_LOG_PATH - Override default trace log path
 *   RECOVERY_LOG_PATH - Override default recovery log path
 *
 * @module debugging-context-extractor
 * @version 1.0.0
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_LOG_DIR = path.join(os.homedir(), '.claude', 'logs');
const DEFAULT_TRACE_FILE = path.join(DEFAULT_LOG_DIR, 'traces.jsonl');
const DEFAULT_UNIFIED_LOG = path.join(DEFAULT_LOG_DIR, 'unified.jsonl');
const DEFAULT_RECOVERY_DIR = './.recovery-logs';

// Expected operations that should have spans (for gap detection)
const EXPECTED_INSTRUMENTED_OPERATIONS = [
  'agent-invocation',
  'sf-query',
  'sf-deploy',
  'hs-api-call',
  'data-transform',
  'file-write',
  'mcp-tool-call',
  'validation',
  'api-request'
];

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Read JSONL file and parse lines
 * @param {string} filePath - Path to JSONL file
 * @param {number} maxLines - Maximum lines to read (0 = all)
 * @returns {Array} Parsed JSON objects
 */
function readJsonlFile(filePath, maxLines = 0) {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.trim().split('\n').filter(line => line.trim());

    const linesToParse = maxLines > 0 ? lines.slice(-maxLines) : lines;

    return linesToParse.map(line => {
      try {
        return JSON.parse(line);
      } catch (e) {
        return null;
      }
    }).filter(Boolean);
  } catch (error) {
    return [];
  }
}

/**
 * Filter entries by time window
 * @param {Array} entries - Array of log entries
 * @param {number} windowMinutes - Time window in minutes
 * @returns {Array} Filtered entries
 */
function filterByTimeWindow(entries, windowMinutes) {
  const cutoffTime = Date.now() - (windowMinutes * 60 * 1000);

  return entries.filter(entry => {
    const timestamp = entry.timestamp || entry.startTime;
    if (!timestamp) return false;

    const entryTime = new Date(timestamp).getTime();
    return entryTime >= cutoffTime;
  });
}

// ============================================================================
// TRACE EXTRACTION
// ============================================================================

/**
 * Extract trace summary from traces.jsonl
 * @param {Object} options - Options
 * @returns {Object} Trace summary
 */
function extractTraceSummary(options = {}) {
  const traceFile = options.traceFile || process.env.TRACE_LOG_PATH || DEFAULT_TRACE_FILE;
  const windowMinutes = options.timeWindowMinutes || 60;

  const entries = readJsonlFile(traceFile, 5000);
  const recent = filterByTimeWindow(entries, windowMinutes);

  // Separate trace types
  const spans = recent.filter(e => e.type === 'span');
  const traceStarts = recent.filter(e => e.type === 'trace_start');
  const traceEnds = recent.filter(e => e.type === 'trace_end');

  // Calculate metrics
  const totalSpans = spans.length;
  const failedSpans = spans.filter(s => s.status === 'ERROR').length;
  const okSpans = spans.filter(s => s.status === 'OK').length;

  // Calculate average duration
  const durationsMs = spans
    .filter(s => typeof s.duration === 'number')
    .map(s => s.duration);
  const avgDurationMs = durationsMs.length > 0
    ? Math.round(durationsMs.reduce((a, b) => a + b, 0) / durationsMs.length)
    : 0;

  // Find critical path (most time-consuming operations)
  const spansByName = {};
  spans.forEach(span => {
    const name = span.name || 'unknown';
    if (!spansByName[name]) {
      spansByName[name] = { count: 0, totalDuration: 0 };
    }
    spansByName[name].count++;
    spansByName[name].totalDuration += span.duration || 0;
  });

  const criticalPath = Object.entries(spansByName)
    .sort((a, b) => b[1].totalDuration - a[1].totalDuration)
    .slice(0, 5)
    .map(([name]) => name);

  // Extract unique trace IDs
  const traceIds = [...new Set([
    ...spans.map(s => s.traceId),
    ...traceStarts.map(s => s.traceId),
    ...traceEnds.map(s => s.traceId)
  ].filter(Boolean))];

  return {
    trace_ids: traceIds.slice(-10), // Last 10 trace IDs
    span_summary: {
      total_spans: totalSpans,
      failed_spans: failedSpans,
      ok_spans: okSpans,
      avg_duration_ms: avgDurationMs,
      critical_path: criticalPath
    },
    traces_analyzed: traceStarts.length,
    time_window_minutes: windowMinutes
  };
}

// ============================================================================
// LOG ANALYSIS
// ============================================================================

/**
 * Extract log metrics from unified.jsonl
 * @param {Object} options - Options
 * @returns {Object} Log metrics
 */
function extractLogMetrics(options = {}) {
  const logFile = options.logFile || DEFAULT_UNIFIED_LOG;
  const windowMinutes = options.timeWindowMinutes || 60;

  const entries = readJsonlFile(logFile, 5000);
  const recent = filterByTimeWindow(entries, windowMinutes);

  // Count by level
  const levelCounts = {
    error: 0,
    warn: 0,
    info: 0,
    debug: 0
  };

  recent.forEach(entry => {
    const level = (entry.level || 'info').toLowerCase();
    if (levelCounts[level] !== undefined) {
      levelCounts[level]++;
    }
  });

  // Extract correlation IDs
  const correlationIds = [...new Set(
    recent
      .filter(e => e.correlationId)
      .map(e => e.correlationId)
  )];

  // Detect operations without correlation IDs
  const operationsWithoutCorrelation = recent
    .filter(e => !e.correlationId && e.operation)
    .map(e => e.operation);
  const uniqueOpsWithoutCorrelation = [...new Set(operationsWithoutCorrelation)];

  // Detect debug mode usage
  const debugEnabled = recent.some(e => e.level === 'debug');

  // Identify gaps
  const gaps = [];
  if (uniqueOpsWithoutCorrelation.length > 0) {
    gaps.push(`no correlation ID on ${uniqueOpsWithoutCorrelation.length} operations: ${uniqueOpsWithoutCorrelation.slice(0, 3).join(', ')}${uniqueOpsWithoutCorrelation.length > 3 ? '...' : ''}`);
  }

  return {
    correlation_ids: correlationIds.slice(-10),
    log_metrics: {
      error_count: levelCounts.error,
      warning_count: levelCounts.warn,
      info_count: levelCounts.info,
      debug_enabled: debugEnabled,
      gaps_detected: gaps
    }
  };
}

// ============================================================================
// RECOVERY EVENT EXTRACTION
// ============================================================================

/**
 * Extract recovery events from recovery logs
 * @param {Object} options - Options
 * @returns {Array} Recovery events
 */
function extractRecoveryEvents(options = {}) {
  const recoveryDir = options.recoveryLogDir || DEFAULT_RECOVERY_DIR;
  const windowMinutes = options.timeWindowMinutes || 60;

  if (!fs.existsSync(recoveryDir)) {
    return [];
  }

  const files = fs.readdirSync(recoveryDir)
    .filter(f => f.endsWith('.json'));

  const events = [];
  const cutoffTime = Date.now() - (windowMinutes * 60 * 1000);

  for (const file of files.slice(-20)) { // Last 20 files
    try {
      const content = fs.readFileSync(path.join(recoveryDir, file), 'utf8');
      const log = JSON.parse(content);

      const logTime = new Date(log.timestamp).getTime();
      if (logTime >= cutoffTime) {
        events.push({
          operation: log.operation || 'unknown',
          strategy: log.input?.strategy?.strategy || 'unknown',
          attempts: log.result?.steps?.length || 1,
          outcome: log.result?.success ? 'success' : 'failure'
        });
      }
    } catch (e) {
      // Skip invalid files
    }
  }

  return events;
}

// ============================================================================
// INSTRUMENTATION GAP ANALYSIS
// ============================================================================

/**
 * Analyze instrumentation gaps
 * @param {Object} traceSummary - Trace summary from extractTraceSummary
 * @param {Object} logMetrics - Log metrics from extractLogMetrics
 * @returns {Object} Instrumentation gaps analysis
 */
function analyzeInstrumentationGaps(traceSummary, logMetrics) {
  const gaps = [];
  const recommendations = [];

  // Check for operations without spans
  const observedOperations = new Set(traceSummary.span_summary.critical_path || []);
  const missingSpanOps = EXPECTED_INSTRUMENTED_OPERATIONS.filter(
    op => !observedOperations.has(op) && !Array.from(observedOperations).some(o => o.includes(op))
  );

  if (missingSpanOps.length > 0) {
    gaps.push({
      type: 'no_span_for_operation',
      operations: missingSpanOps,
      impact: 'Performance blind spot',
      fix: 'Wrap operations with traceContext.createSpan()'
    });
  }

  // Check for correlation ID gaps
  if (logMetrics.log_metrics.gaps_detected.length > 0) {
    gaps.push({
      type: 'missing_correlation_id',
      count: logMetrics.log_metrics.gaps_detected.length,
      impact: 'Cannot trace request flow',
      fix: 'Add correlation ID to logger calls'
    });
  }

  // Check debug mode
  if (!logMetrics.log_metrics.debug_enabled) {
    recommendations.push('Enable DEBUG=1 for verbose logging during troubleshooting');
  }

  // Check error rate
  const totalLogs = logMetrics.log_metrics.error_count +
                   logMetrics.log_metrics.warning_count +
                   logMetrics.log_metrics.info_count;
  if (totalLogs > 0) {
    const errorRate = logMetrics.log_metrics.error_count / totalLogs;
    if (errorRate > 0.1) {
      recommendations.push('High error rate detected (>10%) - review error handling');
    }
  }

  // Check span failure rate
  if (traceSummary.span_summary.total_spans > 0) {
    const failureRate = traceSummary.span_summary.failed_spans / traceSummary.span_summary.total_spans;
    if (failureRate > 0.05) {
      recommendations.push('Span failure rate >5% - investigate critical path operations');
    }
  }

  // Determine severity
  let severity = 'LOW';
  if (gaps.length >= 3 || (gaps.some(g => g.type === 'missing_correlation_id') && gaps.some(g => g.type === 'no_span_for_operation'))) {
    severity = 'HIGH';
  } else if (gaps.length >= 1) {
    severity = 'MEDIUM';
  }

  return {
    severity,
    gaps,
    recommendations
  };
}

// ============================================================================
// MAIN EXPORT
// ============================================================================

/**
 * Extract complete debugging context
 * @param {Object} options - Options
 * @param {number} options.timeWindowMinutes - Time window in minutes (default: 60)
 * @param {string} options.traceFile - Override trace file path
 * @param {string} options.logFile - Override log file path
 * @param {string} options.recoveryLogDir - Override recovery log directory
 * @returns {Object} Debugging context
 */
async function extractDebuggingContext(options = {}) {
  const timeWindowMinutes = options.timeWindowMinutes || 60;
  const verbose = options.verbose || process.env.DEBUG_CONTEXT_VERBOSE === '1';

  if (verbose) {
    console.log(`[debugging-context] Extracting context from last ${timeWindowMinutes} minutes...`);
  }

  // Extract all components
  const traceSummary = extractTraceSummary({ ...options, timeWindowMinutes });
  const logMetrics = extractLogMetrics({ ...options, timeWindowMinutes });
  const recoveryEvents = extractRecoveryEvents({ ...options, timeWindowMinutes });
  const instrumentationGaps = analyzeInstrumentationGaps(traceSummary, logMetrics);

  if (verbose) {
    console.log(`[debugging-context] Found ${traceSummary.span_summary.total_spans} spans, ${logMetrics.log_metrics.error_count} errors, ${recoveryEvents.length} recovery events`);
  }

  return {
    debugging_context: {
      trace_ids: traceSummary.trace_ids,
      span_summary: traceSummary.span_summary,
      correlation_ids: logMetrics.correlation_ids,
      log_metrics: logMetrics.log_metrics,
      recovery_events: recoveryEvents
    },
    instrumentation_gaps: instrumentationGaps,
    extraction_metadata: {
      time_window_minutes: timeWindowMinutes,
      extracted_at: new Date().toISOString(),
      traces_analyzed: traceSummary.traces_analyzed
    }
  };
}

/**
 * Check if debugging context is available
 * @returns {boolean} Whether trace/log files exist
 */
function isDebuggingContextAvailable() {
  return fs.existsSync(DEFAULT_TRACE_FILE) || fs.existsSync(DEFAULT_UNIFIED_LOG);
}

// ============================================================================
// CLI INTERFACE
// ============================================================================

if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  async function main() {
    switch (command) {
      case 'extract':
        const windowArg = args.find(a => a.startsWith('--window='));
        const window = windowArg ? parseInt(windowArg.split('=')[1]) : 60;

        const context = await extractDebuggingContext({
          timeWindowMinutes: window,
          verbose: args.includes('--verbose') || args.includes('-v')
        });
        console.log(JSON.stringify(context, null, 2));
        break;

      case 'check':
        const available = isDebuggingContextAvailable();
        console.log(`Debugging context available: ${available}`);
        console.log(`  Trace file: ${fs.existsSync(DEFAULT_TRACE_FILE) ? 'exists' : 'missing'}`);
        console.log(`  Unified log: ${fs.existsSync(DEFAULT_UNIFIED_LOG) ? 'exists' : 'missing'}`);
        process.exit(available ? 0 : 1);
        break;

      case 'gaps':
        const gapContext = await extractDebuggingContext({ timeWindowMinutes: 60 });
        const gaps = gapContext.instrumentation_gaps;

        console.log(`\nInstrumentation Gap Analysis`);
        console.log(`============================`);
        console.log(`Severity: ${gaps.severity}\n`);

        if (gaps.gaps.length === 0) {
          console.log('No instrumentation gaps detected.\n');
        } else {
          console.log('Gaps Found:');
          gaps.gaps.forEach((gap, i) => {
            console.log(`  ${i + 1}. ${gap.type}`);
            console.log(`     Impact: ${gap.impact}`);
            console.log(`     Fix: ${gap.fix}`);
          });
          console.log('');
        }

        if (gaps.recommendations.length > 0) {
          console.log('Recommendations:');
          gaps.recommendations.forEach((rec, i) => {
            console.log(`  ${i + 1}. ${rec}`);
          });
        }
        break;

      default:
        console.log(`
Debugging Context Extractor

Usage:
  node debugging-context-extractor.js <command> [options]

Commands:
  extract [--window=<minutes>] [--verbose]   Extract debugging context
  check                                       Check if debugging context is available
  gaps                                        Analyze instrumentation gaps

Examples:
  node debugging-context-extractor.js extract --window=30
  node debugging-context-extractor.js check
  node debugging-context-extractor.js gaps

Environment Variables:
  DEBUG_CONTEXT_VERBOSE   Enable verbose output
  TRACE_LOG_PATH          Override default trace log path
  RECOVERY_LOG_PATH       Override default recovery log path
        `);
    }
  }

  main().catch(error => {
    console.error('Error:', error.message);
    process.exit(1);
  });
}

// ============================================================================
// MODULE EXPORTS
// ============================================================================

module.exports = {
  extractDebuggingContext,
  extractTraceSummary,
  extractLogMetrics,
  extractRecoveryEvents,
  analyzeInstrumentationGaps,
  isDebuggingContextAvailable,
  EXPECTED_INSTRUMENTED_OPERATIONS
};
