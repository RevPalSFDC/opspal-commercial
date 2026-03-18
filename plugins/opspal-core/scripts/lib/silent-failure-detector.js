#!/usr/bin/env node

/**
 * Silent Failure Detector - Main Orchestrator
 *
 * Purpose: Coordinate all silent failure detection components
 *
 * Components:
 * - Pre-Session Validators: Check for dangerous conditions before work begins
 * - Runtime Monitors: Track silent failure indicators during session
 * - Post-Session Analyzers: Detect patterns after session completion
 * - Alerting System: Surface detections through multiple channels
 * - Metrics Aggregator: Analyze trends and generate dashboards
 *
 * Usage:
 *   const { SilentFailureDetector } = require('./silent-failure-detector');
 *
 *   const detector = new SilentFailureDetector();
 *
 *   // Run pre-session checks (returns hook-compatible output)
 *   const preSession = await detector.runPreSessionChecks();
 *
 *   // Start runtime monitoring
 *   detector.startRuntimeMonitoring();
 *
 *   // Run post-session analysis
 *   const analysis = await detector.runPostSessionAnalysis();
 *
 * CLI:
 *   node silent-failure-detector.js pre-session   # Pre-session check (for hooks)
 *   node silent-failure-detector.js check         # Full check
 *   node silent-failure-detector.js dashboard     # View dashboard
 *   node silent-failure-detector.js health        # Quick health score
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { EventEmitter } = require('events');

// =============================================================================
// Import Components
// =============================================================================

const { runAllPreSessionValidators, SEVERITY } = require('./silent-failure/pre-session-validators');
const { RuntimeMonitorManager, getGlobalMonitor } = require('./silent-failure/runtime-monitors');
const { runPostSessionAnalysis } = require('./silent-failure/post-session-analyzers');
const { SilentFailureAlerter } = require('./silent-failure/alerting');
const { MetricsAggregator } = require('./silent-failure/metrics-aggregator');

// =============================================================================
// Load Config
// =============================================================================

let CONFIG;
try {
  const configPath = path.join(__dirname, '..', '..', 'config', 'silent-failure-detection.json');
  if (fs.existsSync(configPath)) {
    CONFIG = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }
} catch {
  CONFIG = {};
}

// =============================================================================
// Silent Failure Detector
// =============================================================================

/**
 * Main orchestrator for silent failure detection
 */
class SilentFailureDetector extends EventEmitter {
  constructor(options = {}) {
    super();

    this.config = { ...CONFIG, ...options };
    this.alerter = new SilentFailureAlerter(options);
    this.metricsAggregator = new MetricsAggregator(options);
    this.runtimeMonitor = options.runtimeMonitor || getGlobalMonitor();

    this.sessionId = null;
    this.startTime = null;
  }

  // ===========================================================================
  // Pre-Session Checks
  // ===========================================================================

  /**
   * Run all pre-session validators
   * @returns {Object} Validation results (hook-compatible format)
   */
  async runPreSessionChecks() {
    if (this.config.preSession?.enabled === false) {
      return { passed: true, skipped: true, reason: 'Pre-session checks disabled' };
    }

    const results = await runAllPreSessionValidators();

    // Alert on critical issues
    if (results.criticalCount > 0) {
      const criticalViolations = results.results
        .flatMap(r => r.violations)
        .filter(v => v.severity === 'CRITICAL');

      for (const violation of criticalViolations) {
        await this.alerter.alert({
          type: violation.type,
          severity: violation.severity,
          message: violation.message,
          recommendation: violation.recommendation,
          taxonomy: this.mapToTaxonomy(violation.type)
        });
      }
    }

    // Generate hook-compatible output
    if (results.criticalCount > 0) {
      return {
        ...results,
        systemMessage: `\u26a0\ufe0f SILENT FAILURE WARNING: ${results.criticalSummary}`,
        hookOutput: this.alerter.generateSystemMessage({
          type: 'PRE_SESSION_CRITICAL',
          severity: 'CRITICAL',
          message: results.criticalSummary,
          recommendation: 'Review and address critical issues before proceeding'
        })
      };
    } else if (results.totalViolations > 0) {
      return {
        ...results,
        systemMessage: `\u2139\ufe0f ${results.totalViolations} silent failure risk(s) detected. Run /silent-failure-check for details.`
      };
    }

    return results;
  }

  // ===========================================================================
  // Runtime Monitoring
  // ===========================================================================

  /**
   * Start runtime monitoring for the session
   */
  startRuntimeMonitoring() {
    if (this.config.runtime?.enabled === false) {
      return { started: false, reason: 'Runtime monitoring disabled' };
    }

    this.sessionId = `session_${Date.now()}`;
    this.startTime = Date.now();

    this.runtimeMonitor.start();

    // Forward alerts from runtime monitor
    this.runtimeMonitor.on('alert', async (alert) => {
      this.emit('alert', alert);
      await this.alerter.alert({
        ...alert,
        taxonomy: this.mapToTaxonomy(alert.type)
      });
    });

    return { started: true, sessionId: this.sessionId };
  }

  /**
   * Get current runtime monitor
   */
  getRuntimeMonitor() {
    return this.runtimeMonitor;
  }

  // ===========================================================================
  // Post-Session Analysis
  // ===========================================================================

  /**
   * Run post-session analysis
   * @returns {Object} Analysis results
   */
  async runPostSessionAnalysis() {
    if (this.config.postSession?.enabled === false) {
      return { analyzed: false, reason: 'Post-session analysis disabled' };
    }

    // Get session data from runtime monitor
    const sessionData = this.runtimeMonitor.getSummary();

    // Run analysis
    const analysis = await runPostSessionAnalysis(sessionData, {
      saveReflection: this.config.postSession?.autoReflection !== false
    });

    // Alert on detected patterns
    if (analysis.patternAnalysis.patterns.length > 0) {
      for (const pattern of analysis.patternAnalysis.patterns) {
        await this.alerter.alert({
          type: pattern.pattern,
          severity: pattern.severity,
          message: `Pattern detected: ${pattern.pattern}`,
          recommendation: pattern.suggestion,
          taxonomy: pattern.taxonomy,
          shouldGenerateReflection: pattern.severity === 'CRITICAL'
        });
      }
    }

    return analysis;
  }

  // ===========================================================================
  // Full Check (combines pre-session + current state)
  // ===========================================================================

  /**
   * Run comprehensive silent failure check
   * @param {Object} options - Check options
   * @returns {Object} Full check results
   */
  async runFullCheck(options = {}) {
    const results = {
      timestamp: new Date().toISOString(),
      preSession: null,
      runtimeState: null,
      metrics: null,
      healthScore: 100,
      recommendations: []
    };

    // Pre-session checks
    results.preSession = await this.runPreSessionChecks();

    // Runtime state
    results.runtimeState = this.runtimeMonitor.getSummary();

    // Metrics (default: 7 days)
    const days = options.days || 7;
    results.metrics = await this.metricsAggregator.aggregate({ days });

    // Combined health score
    const preSessionPenalty = results.preSession.criticalCount * 30 + results.preSession.highCount * 15;
    const runtimePenalty = 100 - (results.runtimeState.healthScore || 100);
    const metricsScore = results.metrics.healthScore || 100;

    results.healthScore = Math.max(0, Math.round(
      (metricsScore - preSessionPenalty - runtimePenalty)
    ));

    // Combine recommendations
    results.recommendations = [
      ...results.metrics.recommendations,
      ...results.preSession.results
        .flatMap(r => r.violations)
        .filter(v => v.recommendation)
        .map(v => v.recommendation)
    ].slice(0, 10);

    return results;
  }

  // ===========================================================================
  // Dashboard & Reporting
  // ===========================================================================

  /**
   * Generate dashboard markdown
   */
  async generateDashboard(options = {}) {
    const report = await this.metricsAggregator.aggregate(options);
    return this.metricsAggregator.generateDashboard(report);
  }

  /**
   * Get quick health status
   */
  async getHealthStatus(options = {}) {
    const report = await this.metricsAggregator.aggregate(options);
    const preSession = await this.runPreSessionChecks();

    return {
      healthScore: report.healthScore,
      preSessionIssues: preSession.totalViolations,
      criticalCount: preSession.criticalCount + report.summary.criticalCount,
      trend: report.trends.direction,
      period: report.period
    };
  }

  // ===========================================================================
  // Utilities
  // ===========================================================================

  /**
   * Map violation type to taxonomy category
   */
  mapToTaxonomy(type) {
    const mapping = {
      'ENV_BYPASS': 'config-env',
      'CIRCUIT_OPEN': 'external-api',
      'CIRCUIT_HALF_OPEN': 'external-api',
      'STALE_CACHE': 'data-quality',
      'MISSING_SYSTEM_PACKAGE': 'config-env',
      'MISSING_NPM_PACKAGES': 'config-env',
      'ENV_LEAKAGE': 'config-env',
      'ENV_SESSION_MISMATCH': 'config-env',
      'validation_skip_threshold': 'config-env',
      'cache_fallback_threshold': 'external-api',
      'hook_failure_pattern': 'tool-contract'
    };

    return mapping[type] || 'unknown';
  }

  /**
   * Reset all state (for testing)
   */
  reset() {
    this.runtimeMonitor.reset();
    this.sessionId = null;
    this.startTime = null;
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let globalDetector = null;

function getGlobalDetector() {
  if (!globalDetector) {
    globalDetector = new SilentFailureDetector();
  }
  return globalDetector;
}

// =============================================================================
// CLI Interface
// =============================================================================

if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0] || 'help';
  const days = parseInt(args.find(a => /^\d+$/.test(a)), 10) || 7;
  const jsonOutput = args.includes('--json');
  const verbose = args.includes('--verbose');

  const detector = getGlobalDetector();

  async function run() {
    switch (command) {
      case 'pre-session':
        // Hook-compatible output
        const preSession = await detector.runPreSessionChecks();
        if (jsonOutput) {
          console.log(JSON.stringify(preSession, null, 2));
        } else if (preSession.hookOutput) {
          console.log(preSession.hookOutput);
        } else if (preSession.systemMessage) {
          console.log(JSON.stringify({ systemMessage: preSession.systemMessage }));
        } else {
          console.log('{}');
        }
        process.exit(preSession.criticalCount > 0 ? 2 : (preSession.totalViolations > 0 ? 1 : 0));
        break;

      case 'check':
        const check = await detector.runFullCheck({ days });
        if (jsonOutput) {
          console.log(JSON.stringify(check, null, 2));
        } else {
          const emoji = check.healthScore >= 80 ? '\u2705' :
            check.healthScore >= 50 ? '\u26a0\ufe0f' : '\u274c';
          console.log(`\n${emoji} Silent Failure Check Results\n`);
          console.log(`Health Score: ${check.healthScore}/100`);
          console.log(`Pre-Session Issues: ${check.preSession.totalViolations} (${check.preSession.criticalCount} critical)`);
          console.log(`Metrics Period: ${days} days`);
          console.log(`Total Detections: ${check.metrics.summary.total}`);
          console.log(`Trend: ${check.metrics.trends.direction}`);

          if (check.recommendations.length > 0) {
            console.log('\nRecommendations:');
            check.recommendations.forEach((r, i) => console.log(`  ${i + 1}. ${r}`));
          }
        }
        break;

      case 'dashboard':
        const dashboard = await detector.generateDashboard({ days });
        console.log(dashboard);
        break;

      case 'health':
        const health = await detector.getHealthStatus({ days });
        if (jsonOutput) {
          console.log(JSON.stringify(health, null, 2));
        } else {
          const emoji = health.healthScore >= 80 ? '\u2705' :
            health.healthScore >= 50 ? '\u26a0\ufe0f' : '\u274c';
          console.log(`${emoji} Health: ${health.healthScore}/100 | Trend: ${health.trend} | Critical: ${health.criticalCount}`);
        }
        break;

      case 'help':
      default:
        console.log(`
Silent Failure Detector

Usage:
  node silent-failure-detector.js pre-session [--json]  Pre-session validation (for hooks)
  node silent-failure-detector.js check [days] [--json] Full check with metrics
  node silent-failure-detector.js dashboard [days]      Markdown dashboard
  node silent-failure-detector.js health [days] [--json] Quick health score
  node silent-failure-detector.js help                  Show this help

Options:
  --json      Output as JSON
  --verbose   Include additional details
  [days]      Number of days for metrics analysis (default: 7)

Examples:
  node silent-failure-detector.js check 14 --json
  node silent-failure-detector.js health
  node silent-failure-detector.js dashboard 30 > dashboard.md
`);
    }
  }

  run().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
}

// =============================================================================
// Exports
// =============================================================================

module.exports = {
  SilentFailureDetector,
  getGlobalDetector,
  SEVERITY
};
