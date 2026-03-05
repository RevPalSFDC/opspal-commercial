#!/usr/bin/env node

/**
 * Observability Dashboard - Real-time system monitoring and visualization
 *
 * Purpose: Provide comprehensive visibility into system health and performance
 * Coverage:
 * - Real-time metrics display
 * - Agent performance tracking
 * - Hook health monitoring
 * - System resource utilization
 * - Error tracking and trends
 * - Alerting and notifications
 *
 * Usage:
 *   node scripts/lib/observability-dashboard.js                 # Default view
 *   node scripts/lib/observability-dashboard.js --view agents   # Agent performance
 *   node scripts/lib/observability-dashboard.js --view hooks    # Hook health
 *   node scripts/lib/observability-dashboard.js --watch         # Auto-refresh mode
 *   node scripts/lib/observability-dashboard.js --alert         # Check alerts only
 *
 * @version 1.0.0
 */

const MetricsCollector = require('./metrics-collector');
const AgentProfiler = require('./agent-profiler');
const fs = require('fs');
const path = require('path');

// Color codes
const c = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  white: '\x1b[37m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m'
};

class ObservabilityDashboard {
  constructor(options = {}) {
    this.collector = MetricsCollector.getInstance();
    this.alertThresholds = options.alertThresholds || this._getDefaultThresholds();
    this.watchMode = options.watch || false;
    this.refreshInterval = options.refreshInterval || 5000; // 5 seconds
    this.watchIntervalId = null;
  }

  // ═══════════════════════════════════════════════════════════════
  // DASHBOARD VIEWS
  // ═══════════════════════════════════════════════════════════════

  /**
   * Display overview dashboard (default view)
   *
   * @param {Object} options - Display options
   */
  async displayOverview(options = {}) {
    const timeRange = options.timeRange || '1h';
    const stats = this.collector.getStats({ timeRange });

    this._clearScreen();
    this._printHeader('OBSERVABILITY DASHBOARD - OVERVIEW', timeRange);

    // System Health
    this._printSection('System Health');
    this._displaySystemHealth(stats.system);

    // Agent Performance Summary
    this._printSection('Agent Performance (Top 5)');
    this._displayAgentSummary(stats.agents, 5);

    // Hook Health Summary
    this._printSection('Hook Health');
    this._displayHookSummary(stats.hooks);

    // Operation Summary
    this._printSection('Data Operations');
    this._displayOperationSummary(stats.operations);

    // Recent Errors
    if (stats.errors.total > 0) {
      this._printSection('Recent Errors (Last 5)');
      this._displayRecentErrors(stats.errors, 5);
    }

    // Alerts
    const alerts = this._checkAlerts(stats);
    if (alerts.length > 0) {
      this._printSection('ACTIVE ALERTS');
      this._displayAlerts(alerts);
    }

    this._printFooter();
  }

  /**
   * Display agent performance view
   *
   * @param {Object} options - Display options
   */
  async displayAgents(options = {}) {
    const timeRange = options.timeRange || '24h';
    const stats = this.collector.getStats({ timeRange });

    this._clearScreen();
    this._printHeader('AGENT PERFORMANCE METRICS', timeRange);

    if (stats.agents.total === 0) {
      console.log(`${c.dim}No agent executions in the last ${timeRange}${c.reset}\n`);
      return;
    }

    // Sort agents by total executions
    const agents = Object.entries(stats.agents.byAgent)
      .sort((a, b) => b[1].total - a[1].total);

    console.log(`${c.bright}Total Executions: ${stats.agents.total}${c.reset}\n`);

    // Table header
    console.log(
      `${c.cyan}${this._pad('Agent', 35)} ` +
      `${this._pad('Count', 8)} ` +
      `${this._pad('Success', 10)} ` +
      `${this._pad('Avg Time', 12)} ` +
      `${this._pad('Min/Max', 15)}${c.reset}`
    );
    console.log('─'.repeat(80));

    // Table rows
    for (const [agentName, agentStats] of agents) {
      const successRate = (agentStats.successRate * 100).toFixed(1);
      const successColor = agentStats.successRate >= 0.95 ? c.green :
                          agentStats.successRate >= 0.80 ? c.yellow : c.red;

      console.log(
        `${this._pad(agentName, 35)} ` +
        `${this._pad(agentStats.total, 8)} ` +
        `${successColor}${this._pad(`${successRate}%`, 10)}${c.reset} ` +
        `${this._pad(this._formatDuration(agentStats.avgDuration), 12)} ` +
        `${c.dim}${this._formatDuration(agentStats.minDuration)}/${this._formatDuration(agentStats.maxDuration)}${c.reset}`
      );
    }

    console.log();
    this._printFooter();
  }

  /**
   * Display hook health view
   *
   * @param {Object} options - Display options
   */
  async displayHooks(options = {}) {
    const timeRange = options.timeRange || '24h';
    const stats = this.collector.getStats({ timeRange });

    this._clearScreen();
    this._printHeader('HOOK HEALTH METRICS', timeRange);

    if (stats.hooks.total === 0) {
      console.log(`${c.dim}No hook executions in the last ${timeRange}${c.reset}\n`);
      return;
    }

    console.log(`${c.bright}Total Executions: ${stats.hooks.total}${c.reset}\n`);

    // Table header
    console.log(
      `${c.cyan}${this._pad('Hook', 30)} ` +
      `${this._pad('Count', 8)} ` +
      `${this._pad('Success', 10)} ` +
      `${this._pad('Bypassed', 10)} ` +
      `${this._pad('CB State', 12)} ` +
      `${this._pad('Avg Time', 12)}${c.reset}`
    );
    console.log('─'.repeat(82));

    // Table rows
    const hooks = Object.entries(stats.hooks.byHook);

    for (const [hookName, hookStats] of hooks) {
      const successRate = (hookStats.successRate * 100).toFixed(1);
      const successColor = hookStats.successRate >= 0.95 ? c.green :
                          hookStats.successRate >= 0.80 ? c.yellow : c.red;

      const bypassedRate = (hookStats.bypassed / hookStats.total * 100).toFixed(1);
      const bypassedColor = bypassedRate > 10 ? c.yellow : c.dim;

      // Circuit breaker state
      const cbState = hookStats.circuitBreakerStates.OPEN > 0 ? 'OPEN' :
                     hookStats.circuitBreakerStates.HALF_OPEN > 0 ? 'HALF-OPEN' : 'CLOSED';
      const cbColor = cbState === 'OPEN' ? c.red :
                     cbState === 'HALF-OPEN' ? c.yellow : c.green;

      console.log(
        `${this._pad(hookName, 30)} ` +
        `${this._pad(hookStats.total, 8)} ` +
        `${successColor}${this._pad(`${successRate}%`, 10)}${c.reset} ` +
        `${bypassedColor}${this._pad(`${bypassedRate}%`, 10)}${c.reset} ` +
        `${cbColor}${this._pad(cbState, 12)}${c.reset} ` +
        `${this._pad(this._formatDuration(hookStats.avgDuration), 12)}`
      );
    }

    console.log();
    this._printFooter();
  }

  /**
   * Display system health view
   *
   * @param {Object} options - Display options
   */
  async displaySystem(options = {}) {
    const timeRange = options.timeRange || '1h';
    const stats = this.collector.getStats({ timeRange });

    this._clearScreen();
    this._printHeader('SYSTEM HEALTH METRICS', timeRange);

    if (!stats.system) {
      console.log(`${c.dim}No system metrics available${c.reset}\n`);
      return;
    }

    const current = stats.system.current;
    const averages = stats.system.averages;

    // Memory
    this._printSection('Memory Usage');
    console.log(`${c.bright}Current:${c.reset}`);
    console.log(`  Total:     ${this._formatBytes(current.memory.total)}`);
    console.log(`  Used:      ${this._formatBytes(current.memory.used)} (${(current.memory.used / current.memory.total * 100).toFixed(1)}%)`);
    console.log(`  Free:      ${this._formatBytes(current.memory.free)}`);
    console.log(`  Heap Used: ${this._formatBytes(current.memory.heapUsed)} / ${this._formatBytes(current.memory.heapTotal)}`);

    console.log(`\n${c.bright}Average (${timeRange}):${c.reset}`);
    console.log(`  Used:      ${this._formatBytes(averages.memoryUsed)}`);
    console.log(`  Heap:      ${this._formatBytes(averages.heapUsed)}`);

    // CPU
    this._printSection('CPU');
    console.log(`${c.bright}Current:${c.reset}`);
    console.log(`  Cores:        ${current.cpu.cores}`);
    console.log(`  Load Average: ${current.cpu.loadAverage[0].toFixed(2)} (1m), ${current.cpu.loadAverage[1].toFixed(2)} (5m), ${current.cpu.loadAverage[2].toFixed(2)} (15m)`);

    console.log(`\n${c.bright}Average (${timeRange}):${c.reset}`);
    console.log(`  Load:         ${averages.loadAverage.toFixed(2)}`);

    // Uptime
    this._printSection('Process');
    console.log(`  Uptime:       ${this._formatDuration(current.uptime * 1000)}`);

    console.log();
    this._printFooter();
  }

  /**
   * Display error tracking view
   *
   * @param {Object} options - Display options
   */
  async displayErrors(options = {}) {
    const timeRange = options.timeRange || '24h';
    const stats = this.collector.getStats({ timeRange });

    this._clearScreen();
    this._printHeader('ERROR TRACKING', timeRange);

    if (stats.errors.total === 0) {
      console.log(`${c.green}✓ No errors in the last ${timeRange}${c.reset}\n`);
      this._printFooter();
      return;
    }

    console.log(`${c.bright}Total Errors: ${c.red}${stats.errors.total}${c.reset}\n`);

    // Errors by source
    this._printSection('Errors by Source');
    const sources = Object.entries(stats.errors.bySource)
      .sort((a, b) => b[1].total - a[1].total);

    for (const [source, sourceStats] of sources) {
      console.log(`${c.bright}${source}${c.reset}: ${c.red}${sourceStats.total}${c.reset}`);

      const errorTypes = Object.entries(sourceStats.errorTypes)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);

      for (const [errorType, count] of errorTypes) {
        console.log(`  ${c.dim}${errorType}: ${count}${c.reset}`);
      }
    }

    // Recent errors
    this._printSection('Recent Errors (Last 10)');
    for (const error of stats.errors.recent.slice(0, 10)) {
      const timestamp = new Date(error.timestamp).toLocaleString();
      console.log(`${c.dim}[${timestamp}]${c.reset} ${c.red}${error.source}${c.reset}: ${error.message}`);
    }

    console.log();
    this._printFooter();
  }

  /**
   * Display trend analysis
   *
   * @param {Object} options - Display options
   */
  async displayTrends(options = {}) {
    this._clearScreen();
    this._printHeader('TREND ANALYSIS', '7 days');

    // Get metrics for different time ranges
    const last1h = this.collector.getStats({ timeRange: '1h' });
    const last24h = this.collector.getStats({ timeRange: '24h' });
    const last7d = this.collector.getStats({ timeRange: '7d' });

    // Agent execution trends
    this._printSection('Agent Execution Trends');
    console.log(`  Last 1 hour:  ${last1h.agents.total} executions`);
    console.log(`  Last 24 hours: ${last24h.agents.total} executions`);
    console.log(`  Last 7 days:   ${last7d.agents.total} executions`);

    const hourlyRate = last24h.agents.total / 24;
    const dailyRate = last7d.agents.total / 7;
    console.log(`\n  Average: ${hourlyRate.toFixed(1)}/hour, ${dailyRate.toFixed(1)}/day`);

    // Error rate trends
    this._printSection('Error Rate Trends');
    const errorRate1h = last1h.errors.total;
    const errorRate24h = last24h.errors.total;
    const errorRate7d = last7d.errors.total;

    console.log(`  Last 1 hour:   ${errorRate1h} errors`);
    console.log(`  Last 24 hours: ${errorRate24h} errors`);
    console.log(`  Last 7 days:   ${errorRate7d} errors`);

    const errorTrend = errorRate24h > errorRate7d / 7 ? 'INCREASING' : 'STABLE';
    const trendColor = errorTrend === 'INCREASING' ? c.red : c.green;
    console.log(`\n  Trend: ${trendColor}${errorTrend}${c.reset}`);

    // Hook health trends
    if (last24h.hooks.total > 0) {
      this._printSection('Hook Health Trends');
      const hooks24h = Object.values(last24h.hooks.byHook);
      const avgSuccessRate = hooks24h.reduce((sum, h) => sum + h.successRate, 0) / hooks24h.length;
      const avgBypassRate = hooks24h.reduce((sum, h) => sum + (h.bypassed / h.total), 0) / hooks24h.length;

      console.log(`  Average Success Rate: ${(avgSuccessRate * 100).toFixed(1)}%`);
      console.log(`  Average Bypass Rate:  ${(avgBypassRate * 100).toFixed(1)}%`);
    }

    console.log();
    this._printFooter();
  }

  /**
   * Display agent profiler view
   *
   * @param {Object} options - Display options
   */
  async displayProfiler(options = {}) {
    const timeRange = options.timeRange || '24h';
    const profiler = AgentProfiler.getInstance();

    this._clearScreen();
    this._printHeader('AGENT PROFILER', timeRange);

    // List all profiled agents
    const agentList = profiler.listAgents(timeRange);

    if (agentList.length === 0) {
      console.log(`${c.dim}No agents have been profiled in the last ${timeRange}${c.reset}\n`);
      this._printFooter();
      return;
    }

    // Overview
    this._printSection('Profiled Agents Summary');
    console.log(`Total Agents: ${c.cyan}${agentList.length}${c.reset}`);
    console.log(`Time Range: ${c.cyan}${timeRange}${c.reset}\n`);

    // Sort by performance score (worst first)
    agentList.sort((a, b) => a.avgScore - b.avgScore);

    // Header
    console.log(
      `${this._pad('Agent Name', 30)} ` +
      `${this._pad('Executions', 12)} ` +
      `${this._pad('Avg Duration', 15)} ` +
      `${this._pad('Avg Memory', 15)} ` +
      `${this._pad('Score', 8)}`
    );
    console.log('─'.repeat(85));

    // Display agents
    for (const agent of agentList) {
      const scoreColor = agent.avgScore >= 90 ? c.green :
                        agent.avgScore >= 70 ? c.yellow : c.red;

      console.log(
        `${this._pad(agent.name, 30)} ` +
        `${this._pad(agent.executionCount, 12)} ` +
        `${this._pad(this._formatDuration(agent.avgDuration), 15)} ` +
        `${this._pad(this._formatBytes(agent.avgMemoryDelta), 15)} ` +
        `${scoreColor}${this._pad(`${agent.avgScore}/100`, 8)}${c.reset}`
      );
    }

    // Top bottlenecks across all agents
    const allProfiles = agentList.flatMap(agent =>
      profiler._loadProfiles(agent.name, timeRange)
    );

    const allBottlenecks = [];
    for (const profile of allProfiles) {
      if (profile.analysis && profile.analysis.bottlenecks) {
        for (const bottleneck of profile.analysis.bottlenecks) {
          allBottlenecks.push({
            agent: profile.agentName,
            ...bottleneck
          });
        }
      }
    }

    if (allBottlenecks.length > 0) {
      this._printSection('Top Performance Bottlenecks');

      // Group by bottleneck type and count occurrences
      const bottleneckCounts = {};
      for (const b of allBottlenecks) {
        const key = `${b.agent}:${b.label}`;
        if (!bottleneckCounts[key]) {
          bottleneckCounts[key] = { ...b, count: 0 };
        }
        bottleneckCounts[key].count++;
      }

      const topBottlenecks = Object.values(bottleneckCounts)
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      for (const bottleneck of topBottlenecks) {
        const severityColor = bottleneck.severity === 'critical' ? c.red : c.yellow;
        console.log(
          `${severityColor}${bottleneck.severity.toUpperCase()}${c.reset} - ` +
          `${c.bright}${bottleneck.agent}${c.reset}: ${bottleneck.label} ` +
          `(${bottleneck.percentOfTotal.toFixed(1)}% of time, ${bottleneck.count}x occurrences)`
        );
      }
    }

    // Performance recommendations
    const allRecommendations = [];
    for (const profile of allProfiles) {
      if (profile.analysis && profile.analysis.recommendations) {
        for (const rec of profile.analysis.recommendations) {
          allRecommendations.push({
            agent: profile.agentName,
            ...rec
          });
        }
      }
    }

    if (allRecommendations.length > 0) {
      this._printSection('Top Optimization Recommendations');

      // Group by recommendation title and count occurrences
      const recCounts = {};
      for (const r of allRecommendations) {
        const key = `${r.agent}:${r.title}`;
        if (!recCounts[key]) {
          recCounts[key] = { ...r, count: 0, agents: new Set() };
        }
        recCounts[key].count++;
        recCounts[key].agents.add(r.agent);
      }

      const topRecs = Object.values(recCounts)
        .sort((a, b) => {
          // Sort by priority (high > medium > low), then by count
          const priorityOrder = { high: 3, medium: 2, low: 1 };
          const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
          if (priorityDiff !== 0) return priorityDiff;
          return b.count - a.count;
        })
        .slice(0, 5);

      for (const rec of topRecs) {
        const priorityColor = rec.priority === 'high' ? c.red :
                             rec.priority === 'medium' ? c.yellow : c.dim;
        console.log(
          `${priorityColor}[${rec.priority.toUpperCase()}]${c.reset} ` +
          `${rec.title} (${rec.count}x occurrences across ${rec.agents.size} agent${rec.agents.size > 1 ? 's' : ''})`
        );
        if (rec.description) {
          console.log(`  ${c.dim}${rec.description}${c.reset}`);
        }
      }
    }

    // Performance regressions
    const agentsWithRegressions = [];
    for (const agent of agentList) {
      const report = profiler.generateReport(agent.name, { timeRange });
      if (report.regressions && report.regressions.length > 0) {
        agentsWithRegressions.push({
          agent: agent.name,
          regressions: report.regressions
        });
      }
    }

    if (agentsWithRegressions.length > 0) {
      this._printSection('⚠️  Performance Regressions Detected');

      for (const item of agentsWithRegressions) {
        console.log(`${c.bright}${item.agent}${c.reset}:`);
        for (const reg of item.regressions) {
          const severityColor = reg.severity === 'critical' ? c.red : c.yellow;
          console.log(`  ${severityColor}${reg.severity.toUpperCase()}${c.reset} - ${reg.message}`);
        }
      }
    }

    console.log();
    this._printFooter();
  }

  // ═══════════════════════════════════════════════════════════════
  // ALERTING
  // ═══════════════════════════════════════════════════════════════

  /**
   * Check for alert conditions
   *
   * @param {Object} stats - System statistics
   * @returns {Array} Array of active alerts
   */
  _checkAlerts(stats) {
    const alerts = [];

    // Agent failure rate alerts
    if (stats.agents.total > 0) {
      for (const [agentName, agentStats] of Object.entries(stats.agents.byAgent)) {
        if (agentStats.successRate < this.alertThresholds.agent.minSuccessRate) {
          alerts.push({
            severity: 'critical',
            category: 'agent',
            message: `Agent ${agentName} success rate (${(agentStats.successRate * 100).toFixed(1)}%) below threshold (${this.alertThresholds.agent.minSuccessRate * 100}%)`,
            value: agentStats.successRate,
            threshold: this.alertThresholds.agent.minSuccessRate
          });
        }

        if (agentStats.avgDuration > this.alertThresholds.agent.maxAvgDuration) {
          alerts.push({
            severity: 'warning',
            category: 'agent',
            message: `Agent ${agentName} average duration (${this._formatDuration(agentStats.avgDuration)}) exceeds threshold (${this._formatDuration(this.alertThresholds.agent.maxAvgDuration)})`,
            value: agentStats.avgDuration,
            threshold: this.alertThresholds.agent.maxAvgDuration
          });
        }
      }
    }

    // Hook health alerts
    if (stats.hooks.total > 0) {
      for (const [hookName, hookStats] of Object.entries(stats.hooks.byHook)) {
        if (hookStats.circuitBreakerStates.OPEN > 0) {
          alerts.push({
            severity: 'critical',
            category: 'hook',
            message: `Hook ${hookName} circuit breaker is OPEN (${hookStats.circuitBreakerStates.OPEN} occurrences)`,
            value: 'OPEN',
            threshold: 'CLOSED'
          });
        }

        const bypassRate = hookStats.bypassed / hookStats.total;
        if (bypassRate > this.alertThresholds.hook.maxBypassRate) {
          alerts.push({
            severity: 'warning',
            category: 'hook',
            message: `Hook ${hookName} bypass rate (${(bypassRate * 100).toFixed(1)}%) above threshold (${this.alertThresholds.hook.maxBypassRate * 100}%)`,
            value: bypassRate,
            threshold: this.alertThresholds.hook.maxBypassRate
          });
        }
      }
    }

    // Error rate alerts
    if (stats.errors.total > this.alertThresholds.error.maxErrorsPerHour) {
      alerts.push({
        severity: 'critical',
        category: 'error',
        message: `Error rate (${stats.errors.total}) exceeds threshold (${this.alertThresholds.error.maxErrorsPerHour})`,
        value: stats.errors.total,
        threshold: this.alertThresholds.error.maxErrorsPerHour
      });
    }

    // System health alerts
    if (stats.system) {
      const memoryUsage = stats.system.current.memory.used / stats.system.current.memory.total;
      if (memoryUsage > this.alertThresholds.system.maxMemoryUsage) {
        alerts.push({
          severity: 'warning',
          category: 'system',
          message: `Memory usage (${(memoryUsage * 100).toFixed(1)}%) exceeds threshold (${this.alertThresholds.system.maxMemoryUsage * 100}%)`,
          value: memoryUsage,
          threshold: this.alertThresholds.system.maxMemoryUsage
        });
      }

      const loadAverage = stats.system.current.cpu.loadAverage[0] / stats.system.current.cpu.cores;
      if (loadAverage > this.alertThresholds.system.maxLoadAverage) {
        alerts.push({
          severity: 'warning',
          category: 'system',
          message: `Load average per core (${loadAverage.toFixed(2)}) exceeds threshold (${this.alertThresholds.system.maxLoadAverage})`,
          value: loadAverage,
          threshold: this.alertThresholds.system.maxLoadAverage
        });
      }
    }

    return alerts;
  }

  /**
   * Display alerts
   *
   * @param {Array} alerts - Array of alerts
   */
  _displayAlerts(alerts) {
    for (const alert of alerts) {
      const icon = alert.severity === 'critical' ? '🔴' : '⚠️';
      const color = alert.severity === 'critical' ? c.red : c.yellow;

      console.log(`${icon} ${color}${alert.message}${c.reset}`);
    }
    console.log();
  }

  /**
   * Check alerts and exit with appropriate code (CI/CD integration)
   *
   * @returns {number} Exit code (0 = no alerts, 1 = warnings, 2 = critical)
   */
  async checkAlertsOnly() {
    const stats = this.collector.getStats({ timeRange: '1h' });
    const alerts = this._checkAlerts(stats);

    if (alerts.length === 0) {
      console.log(`${c.green}✓ No active alerts${c.reset}`);
      return 0;
    }

    const criticalAlerts = alerts.filter(a => a.severity === 'critical');
    const warningAlerts = alerts.filter(a => a.severity === 'warning');

    if (criticalAlerts.length > 0) {
      console.log(`${c.red}✗ ${criticalAlerts.length} critical alert(s)${c.reset}`);
      this._displayAlerts(criticalAlerts);
      return 2;
    }

    if (warningAlerts.length > 0) {
      console.log(`${c.yellow}⚠ ${warningAlerts.length} warning(s)${c.reset}`);
      this._displayAlerts(warningAlerts);
      return 1;
    }

    return 0;
  }

  // ═══════════════════════════════════════════════════════════════
  // WATCH MODE
  // ═══════════════════════════════════════════════════════════════

  /**
   * Start watch mode (auto-refresh)
   *
   * @param {string} view - View to display
   * @param {Object} options - Display options
   */
  startWatch(view = 'overview', options = {}) {
    console.log(`${c.cyan}Starting watch mode (refreshing every ${this.refreshInterval / 1000}s)...${c.reset}`);
    console.log(`${c.dim}Press Ctrl+C to exit${c.reset}\n`);

    const displayFn = this._getDisplayFunction(view);

    // Initial display
    displayFn.call(this, options);

    // Auto-refresh
    this.watchIntervalId = setInterval(() => {
      displayFn.call(this, options);
    }, this.refreshInterval);
  }

  stopWatch() {
    if (this.watchIntervalId) {
      clearInterval(this.watchIntervalId);
      this.watchIntervalId = null;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // DISPLAY HELPERS
  // ═══════════════════════════════════════════════════════════════

  _displaySystemHealth(systemStats) {
    if (!systemStats) {
      console.log(`${c.dim}No system metrics available${c.reset}\n`);
      return;
    }

    const current = systemStats.current;
    const memoryUsage = (current.memory.used / current.memory.total * 100).toFixed(1);
    const heapUsage = (current.memory.heapUsed / current.memory.heapTotal * 100).toFixed(1);
    const loadAverage = current.cpu.loadAverage[0].toFixed(2);

    console.log(`  Memory: ${this._formatBytes(current.memory.used)} / ${this._formatBytes(current.memory.total)} (${memoryUsage}%)`);
    console.log(`  Heap:   ${this._formatBytes(current.memory.heapUsed)} / ${this._formatBytes(current.memory.heapTotal)} (${heapUsage}%)`);
    console.log(`  Load:   ${loadAverage} (1m average, ${current.cpu.cores} cores)`);
    console.log(`  Uptime: ${this._formatDuration(current.uptime * 1000)}`);
    console.log();
  }

  _displayAgentSummary(agentStats, limit = 5) {
    if (agentStats.total === 0) {
      console.log(`${c.dim}No agent executions${c.reset}\n`);
      return;
    }

    const agents = Object.entries(agentStats.byAgent)
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, limit);

    for (const [agentName, stats] of agents) {
      const successRate = (stats.successRate * 100).toFixed(1);
      const successColor = stats.successRate >= 0.95 ? c.green :
                          stats.successRate >= 0.80 ? c.yellow : c.red;

      console.log(
        `  ${this._pad(agentName, 30)} ` +
        `${this._pad(stats.total, 6)} executions, ` +
        `${successColor}${successRate}% success${c.reset}, ` +
        `${this._formatDuration(stats.avgDuration)} avg`
      );
    }
    console.log();
  }

  _displayHookSummary(hookStats) {
    if (hookStats.total === 0) {
      console.log(`${c.dim}No hook executions${c.reset}\n`);
      return;
    }

    const hooks = Object.entries(hookStats.byHook);

    for (const [hookName, stats] of hooks) {
      const successRate = (stats.successRate * 100).toFixed(1);
      const cbState = stats.circuitBreakerStates.OPEN > 0 ? 'OPEN' :
                     stats.circuitBreakerStates.HALF_OPEN > 0 ? 'HALF-OPEN' : 'CLOSED';
      const cbColor = cbState === 'OPEN' ? c.red :
                     cbState === 'HALF-OPEN' ? c.yellow : c.green;

      console.log(
        `  ${this._pad(hookName, 30)} ` +
        `${this._pad(stats.total, 6)} calls, ` +
        `${successRate}% success, ` +
        `CB: ${cbColor}${cbState}${c.reset}`
      );
    }
    console.log();
  }

  _displayOperationSummary(operationStats) {
    if (operationStats.total === 0) {
      console.log(`${c.dim}No operations${c.reset}\n`);
      return;
    }

    const operations = Object.entries(operationStats.byOperation);

    for (const [operation, stats] of operations) {
      const successRate = (stats.successRate * 100).toFixed(1);

      console.log(
        `  ${this._pad(operation, 20)} ` +
        `${this._pad(stats.total, 6)} ops, ` +
        `${stats.totalRecords} records, ` +
        `${successRate}% success`
      );
    }
    console.log();
  }

  _displayRecentErrors(errorStats, limit = 5) {
    for (const error of errorStats.recent.slice(0, limit)) {
      const timestamp = new Date(error.timestamp).toLocaleTimeString();
      console.log(`  ${c.dim}[${timestamp}]${c.reset} ${c.red}${error.source}${c.reset}: ${error.message}`);
    }
    console.log();
  }

  _getDisplayFunction(view) {
    const views = {
      overview: this.displayOverview,
      agents: this.displayAgents,
      hooks: this.displayHooks,
      system: this.displaySystem,
      errors: this.displayErrors,
      trends: this.displayTrends,
      profiler: this.displayProfiler
    };

    return views[view] || views.overview;
  }

  _getDefaultThresholds() {
    return {
      agent: {
        minSuccessRate: 0.90,      // 90% minimum success rate
        maxAvgDuration: 30000      // 30 seconds max average duration
      },
      hook: {
        maxBypassRate: 0.20,       // 20% max bypass rate
        minSuccessRate: 0.95       // 95% minimum success rate
      },
      error: {
        maxErrorsPerHour: 10       // 10 errors per hour threshold
      },
      system: {
        maxMemoryUsage: 0.85,      // 85% max memory usage
        maxLoadAverage: 2.0        // 2.0 max load average per core
      }
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // FORMATTING UTILITIES
  // ═══════════════════════════════════════════════════════════════

  _clearScreen() {
    if (!process.env.NO_CLEAR) {
      console.clear();
    }
  }

  _printHeader(title, timeRange = '') {
    const width = 80;
    console.log('═'.repeat(width));
    console.log(`${c.bright}${c.cyan}${title}${c.reset}${timeRange ? ` ${c.dim}(${timeRange})${c.reset}` : ''}`);
    console.log('═'.repeat(width));
    console.log();
  }

  _printSection(title) {
    console.log(`${c.bright}${title}${c.reset}`);
    console.log('─'.repeat(40));
  }

  _printFooter() {
    const timestamp = new Date().toLocaleString();
    console.log(`${c.dim}Last updated: ${timestamp}${c.reset}`);
    console.log();
  }

  _pad(str, length) {
    str = String(str);
    return str.length > length ? str.substring(0, length - 3) + '...' : str.padEnd(length);
  }

  _formatDuration(ms) {
    if (ms < 1000) {
      return `${ms.toFixed(0)}ms`;
    } else if (ms < 60000) {
      return `${(ms / 1000).toFixed(1)}s`;
    } else {
      const minutes = Math.floor(ms / 60000);
      const seconds = Math.floor((ms % 60000) / 1000);
      return `${minutes}m ${seconds}s`;
    }
  }

  _formatBytes(bytes) {
    const units = ['B', 'KB', 'MB', 'GB'];
    let unitIndex = 0;
    let value = bytes;

    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex++;
    }

    return `${value.toFixed(1)}${units[unitIndex]}`;
  }
}

// ═══════════════════════════════════════════════════════════════
// CLI
// ═══════════════════════════════════════════════════════════════

async function main() {
  const args = process.argv.slice(2);

  // Parse arguments
  const options = {
    view: 'overview',
    timeRange: '1h',
    watch: false,
    alert: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--view' && args[i + 1]) {
      options.view = args[i + 1];
      i++;
    } else if (arg === '--time' && args[i + 1]) {
      options.timeRange = args[i + 1];
      i++;
    } else if (arg === '--watch') {
      options.watch = true;
    } else if (arg === '--alert') {
      options.alert = true;
    } else if (arg === '--help') {
      console.log('Observability Dashboard - Real-time system monitoring\n');
      console.log('Usage:');
      console.log('  node observability-dashboard.js [options]\n');
      console.log('Options:');
      console.log('  --view <view>     View to display (overview, agents, hooks, system, errors, trends, profiler)');
      console.log('  --time <range>    Time range (1h, 24h, 7d, 30d) [default: 1h]');
      console.log('  --watch           Auto-refresh mode (updates every 5 seconds)');
      console.log('  --alert           Check alerts only (exit code based on severity)');
      console.log('  --help            Show this help message');
      console.log('\nExamples:');
      console.log('  node observability-dashboard.js                          # Overview (default)');
      console.log('  node observability-dashboard.js --view agents --time 24h # Agent performance (24h)');
      console.log('  node observability-dashboard.js --view profiler          # Performance profiling view');
      console.log('  node observability-dashboard.js --watch                  # Auto-refresh overview');
      console.log('  node observability-dashboard.js --alert                  # Check alerts (CI/CD)');
      process.exit(0);
    }
  }

  const dashboard = new ObservabilityDashboard();

  // Alert-only mode (for CI/CD)
  if (options.alert) {
    const exitCode = await dashboard.checkAlertsOnly();
    process.exit(exitCode);
  }

  // Watch mode
  if (options.watch) {
    dashboard.startWatch(options.view, options);

    // Handle Ctrl+C
    process.on('SIGINT', () => {
      dashboard.stopWatch();
      console.log(`\n${c.cyan}Watch mode stopped${c.reset}`);
      process.exit(0);
    });
  } else {
    // Single display
    const displayFn = dashboard._getDisplayFunction(options.view);
    await displayFn.call(dashboard, options);
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error(`${c.red}Dashboard error: ${error.message}${c.reset}`);
    console.error(error.stack);
    process.exit(1);
  });
}

module.exports = ObservabilityDashboard;
