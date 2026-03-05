#!/usr/bin/env node

/**
 * Hook Monitor - Real-time hook performance and circuit breaker monitoring
 *
 * Capabilities:
 * 1. DASHBOARD - Real-time hook metrics and circuit breaker state
 * 2. ANALYZE - Historical performance analysis
 * 3. RESET - Manual circuit breaker reset
 * 4. ALERT - Check for issues requiring attention
 *
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');

// Color codes
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  purple: '\x1b[35m',
  cyan: '\x1b[36m'
};

class HookMonitor {
  constructor(options = {}) {
    this.pluginRoot = options.pluginRoot || path.join(__dirname, '../..');
    this.stateFile = path.join(this.pluginRoot, '.claude/hook-circuit-state.json');
    this.metricsFile = path.join(this.pluginRoot, '.claude/hook-metrics.json');
  }

  loadState() {
    try {
      if (fs.existsSync(this.stateFile)) {
        return JSON.parse(fs.readFileSync(this.stateFile, 'utf8'));
      }
    } catch (error) {
      // State file may not exist yet
    }
    return {
      state: 'CLOSED',
      failures: [],
      lastStateChange: Date.now() / 1000,
      successCount: 0,
      failureCount: 0,
      openCount: 0,
      recoveryAttempts: 0
    };
  }

  loadMetrics() {
    try {
      if (fs.existsSync(this.metricsFile)) {
        return JSON.parse(fs.readFileSync(this.metricsFile, 'utf8'));
      }
    } catch (error) {
      // Metrics file may not exist yet
    }
    return [];
  }

  // ═══════════════════════════════════════════════════════════════
  // DASHBOARD - Real-time monitoring
  // ═══════════════════════════════════════════════════════════════

  dashboard() {
    console.log(`\n${c.bold}${c.cyan}═══════════════════════════════════════════════════════${c.reset}`);
    console.log(`${c.bold}${c.blue}📊 HOOK MONITORING DASHBOARD${c.reset}`);
    console.log(`${c.cyan}═══════════════════════════════════════════════════════${c.reset}\n`);

    const state = this.loadState();
    const metrics = this.loadMetrics();

    // 1. Circuit Breaker State
    this.displayCircuitBreakerState(state);

    // 2. Performance Metrics
    if (metrics.length > 0) {
      this.displayPerformanceMetrics(metrics);
    }

    // 3. Recent Events
    if (metrics.length > 0) {
      this.displayRecentEvents(metrics);
    }

    // 4. Health Check
    this.displayHealthCheck(state, metrics);

    console.log(`${c.cyan}═══════════════════════════════════════════════════════${c.reset}\n`);
  }

  displayCircuitBreakerState(state) {
    console.log(`${c.bold}Circuit Breaker Status:${c.reset}`);

    const stateColor = {
      'CLOSED': c.green,
      'OPEN': c.red,
      'HALF-OPEN': c.yellow
    }[state.state] || c.yellow;

    console.log(`  State: ${stateColor}${c.bold}${state.state}${c.reset}`);

    const now = Date.now() / 1000;
    const timeSinceChange = Math.floor(now - state.lastStateChange);
    console.log(`  Last state change: ${this.formatDuration(timeSinceChange)} ago`);

    if (state.state === 'OPEN') {
      const cooldownRemaining = Math.max(0, 120 - timeSinceChange);
      console.log(`  ${c.yellow}⏱  Cooldown: ${cooldownRemaining}s remaining${c.reset}`);
    }

    console.log(`  Recent failures: ${state.failures.length}/3`);
    console.log(`  Total successes: ${state.successCount}`);
    console.log(`  Total failures: ${state.failureCount}`);
    console.log(`  Times opened: ${state.openCount}`);
    console.log(`  Recovery attempts: ${state.recoveryAttempts}\n`);
  }

  displayPerformanceMetrics(metrics) {
    console.log(`${c.bold}Performance Metrics:${c.reset}`);

    const successEvents = metrics.filter(m => m.event === 'success');
    const failureEvents = metrics.filter(m => m.event === 'failure');
    const total = successEvents.length + failureEvents.length;

    if (total === 0) {
      console.log(`  No execution data available yet\n`);
      return;
    }

    const successRate = (successEvents.length / total * 100).toFixed(1);
    const avgExecutionTime = successEvents.length > 0
      ? (successEvents.reduce((sum, m) => sum + m.executionTimeMs, 0) / successEvents.length).toFixed(0)
      : 0;

    const p95ExecutionTime = this.calculatePercentile(successEvents.map(m => m.executionTimeMs), 0.95);

    console.log(`  Success rate: ${this.colorizeSuccessRate(parseFloat(successRate))}${successRate}%${c.reset} (${successEvents.length}/${total})`);
    console.log(`  Avg execution time: ${avgExecutionTime}ms`);
    console.log(`  P95 execution time: ${p95ExecutionTime}ms`);

    // Performance bar
    const bar = this.makePerformanceBar(parseFloat(successRate));
    console.log(`  ${bar}\n`);
  }

  displayRecentEvents(metrics) {
    console.log(`${c.bold}Recent Events (last 10):${c.reset}`);

    const recentEvents = metrics.slice(-10).reverse();

    recentEvents.forEach(event => {
      const time = new Date(event.timestamp * 1000).toLocaleTimeString();
      const eventIcon = {
        'success': `${c.green}✓${c.reset}`,
        'failure': `${c.red}✗${c.reset}`,
        'bypassed': `${c.yellow}⊘${c.reset}`,
        'transition': `${c.purple}⇄${c.reset}`,
        'recovery_success': `${c.green}↑${c.reset}`
      }[event.event] || '•';

      let details = `${event.state}`;
      if (event.executionTimeMs > 0) {
        details += ` (${event.executionTimeMs}ms)`;
      }

      console.log(`  ${eventIcon} [${time}] ${event.event.padEnd(20)} ${details}`);
    });
    console.log('');
  }

  displayHealthCheck(state, metrics) {
    console.log(`${c.bold}Health Check:${c.reset}`);

    const issues = [];
    const warnings = [];

    // Check circuit state
    if (state.state === 'OPEN') {
      issues.push('Circuit breaker is OPEN - hooks are bypassed');
    } else if (state.state === 'HALF-OPEN') {
      warnings.push('Circuit breaker is testing recovery');
    }

    // Check failure rate
    const recentMetrics = metrics.slice(-50);
    const successEvents = recentMetrics.filter(m => m.event === 'success');
    const failureEvents = recentMetrics.filter(m => m.event === 'failure');
    const total = successEvents.length + failureEvents.length;

    if (total > 10) {
      const successRate = successEvents.length / total;
      if (successRate < 0.8) {
        warnings.push(`Low success rate: ${(successRate * 100).toFixed(1)}%`);
      }
    }

    // Check performance
    if (successEvents.length > 5) {
      const avgTime = successEvents.reduce((sum, m) => sum + m.executionTimeMs, 0) / successEvents.length;
      if (avgTime > 1000) {
        warnings.push(`Slow hook execution: ${avgTime.toFixed(0)}ms avg`);
      }
    }

    // Check recovery attempts
    if (state.recoveryAttempts > 5) {
      warnings.push(`Multiple recovery attempts: ${state.recoveryAttempts}`);
    }

    if (issues.length === 0 && warnings.length === 0) {
      console.log(`  ${c.green}✓ All checks passed - hooks are healthy${c.reset}\n`);
    } else {
      if (issues.length > 0) {
        console.log(`  ${c.red}Issues (${issues.length}):${c.reset}`);
        issues.forEach(issue => console.log(`    ${c.red}✗${c.reset} ${issue}`));
      }
      if (warnings.length > 0) {
        console.log(`  ${c.yellow}Warnings (${warnings.length}):${c.reset}`);
        warnings.forEach(warning => console.log(`    ${c.yellow}⚠${c.reset} ${warning}`));
      }
      console.log('');
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // ANALYZE - Historical analysis
  // ═══════════════════════════════════════════════════════════════

  analyze(options = {}) {
    console.log(`\n${c.bold}${c.cyan}═══════════════════════════════════════════════════════${c.reset}`);
    console.log(`${c.bold}${c.blue}📈 HOOK PERFORMANCE ANALYSIS${c.reset}`);
    console.log(`${c.cyan}═══════════════════════════════════════════════════════${c.reset}\n`);

    const metrics = this.loadMetrics();

    if (metrics.length === 0) {
      console.log(`${c.yellow}No metrics data available yet.${c.reset}\n`);
      return;
    }

    // 1. Overall statistics
    this.displayOverallStats(metrics);

    // 2. Performance trends
    this.displayPerformanceTrends(metrics);

    // 3. Error analysis
    this.displayErrorAnalysis(metrics);

    console.log(`${c.cyan}═══════════════════════════════════════════════════════${c.reset}\n`);
  }

  displayOverallStats(metrics) {
    console.log(`${c.bold}Overall Statistics:${c.reset}`);

    const total = metrics.length;
    const byEvent = this.groupBy(metrics, 'event');

    console.log(`  Total events: ${total}`);
    Object.entries(byEvent).forEach(([event, events]) => {
      console.log(`    ${event}: ${events.length}`);
    });
    console.log('');
  }

  displayPerformanceTrends(metrics) {
    console.log(`${c.bold}Performance Trends:${c.reset}`);

    const successMetrics = metrics.filter(m => m.event === 'success' && m.executionTimeMs > 0);

    if (successMetrics.length === 0) {
      console.log(`  No performance data available\n`);
      return;
    }

    // Group by hour
    const byHour = {};
    successMetrics.forEach(m => {
      const hour = new Date(m.timestamp * 1000).toISOString().slice(0, 13);
      if (!byHour[hour]) byHour[hour] = [];
      byHour[hour].push(m.executionTimeMs);
    });

    const hours = Object.keys(byHour).sort().slice(-24); // Last 24 hours
    const avgByHour = hours.map(h => {
      const times = byHour[h];
      return times.reduce((sum, t) => sum + t, 0) / times.length;
    });

    if (avgByHour.length > 0) {
      const minAvg = Math.min(...avgByHour);
      const maxAvg = Math.max(...avgByHour);

      console.log(`  Performance over last ${hours.length} hours:`);
      console.log(`    Min avg: ${minAvg.toFixed(0)}ms`);
      console.log(`    Max avg: ${maxAvg.toFixed(0)}ms`);

      // Show trend (last 3 hours)
      if (avgByHour.length >= 3) {
        const recent = avgByHour.slice(-3);
        const trend = recent[2] > recent[0] ? '↑ Slowing' : '↓ Improving';
        const trendColor = recent[2] > recent[0] ? c.yellow : c.green;
        console.log(`    Trend: ${trendColor}${trend}${c.reset}`);
      }
    }
    console.log('');
  }

  displayErrorAnalysis(metrics) {
    console.log(`${c.bold}Error Analysis:${c.reset}`);

    const failures = metrics.filter(m => m.event === 'failure');
    const bypassed = metrics.filter(m => m.event === 'bypassed');

    if (failures.length === 0 && bypassed.length === 0) {
      console.log(`  ${c.green}No errors detected${c.reset}\n`);
      return;
    }

    console.log(`  Total failures: ${failures.length}`);
    console.log(`  Total bypassed: ${bypassed.length}`);

    if (failures.length > 0) {
      // Group failures by time of day
      const byHour = {};
      failures.forEach(f => {
        const hour = new Date(f.timestamp * 1000).getHours();
        byHour[hour] = (byHour[hour] || 0) + 1;
      });

      const peakHour = Object.entries(byHour).sort((a, b) => b[1] - a[1])[0];
      console.log(`  Peak failure hour: ${peakHour[0]}:00 (${peakHour[1]} failures)`);
    }
    console.log('');
  }

  // ═══════════════════════════════════════════════════════════════
  // RESET - Manual circuit breaker reset
  // ═══════════════════════════════════════════════════════════════

  reset() {
    console.log(`\n${c.yellow}Resetting circuit breaker...${c.reset}\n`);

    const state = this.loadState();

    const newState = {
      ...state,
      state: 'CLOSED',
      failures: [],
      lastStateChange: Date.now() / 1000
    };

    fs.writeFileSync(this.stateFile, JSON.stringify(newState, null, 2));

    console.log(`${c.green}✓ Circuit breaker reset to CLOSED state${c.reset}`);
    console.log(`Hooks will resume normal operation.\n`);
  }

  // ═══════════════════════════════════════════════════════════════
  // ALERT - Check for issues
  // ═══════════════════════════════════════════════════════════════

  alert() {
    const state = this.loadState();
    const metrics = this.loadMetrics();

    const alerts = [];

    // Check circuit state
    if (state.state === 'OPEN') {
      alerts.push({
        level: 'CRITICAL',
        message: 'Circuit breaker is OPEN - hooks are bypassed'
      });
    }

    // Check failure rate
    const recent = metrics.slice(-50);
    const failures = recent.filter(m => m.event === 'failure');
    if (failures.length > 10) {
      alerts.push({
        level: 'WARNING',
        message: `High failure rate: ${failures.length} failures in last 50 events`
      });
    }

    if (alerts.length === 0) {
      console.log(`${c.green}✓ No alerts${c.reset}\n`);
      return 0;
    }

    console.log(`\n${c.red}${c.bold}ALERTS (${alerts.length}):${c.reset}\n`);
    alerts.forEach(alert => {
      const color = alert.level === 'CRITICAL' ? c.red : c.yellow;
      console.log(`${color}[${alert.level}]${c.reset} ${alert.message}`);
    });
    console.log('');

    return alerts.length;
  }

  // ═══════════════════════════════════════════════════════════════
  // UTILITIES
  // ═══════════════════════════════════════════════════════════════

  formatDuration(seconds) {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  }

  colorizeSuccessRate(rate) {
    if (rate >= 95) return c.green;
    if (rate >= 80) return c.yellow;
    return c.red;
  }

  makePerformanceBar(successRate) {
    const filled = Math.round(successRate / 10);
    const empty = 10 - filled;
    const color = this.colorizeSuccessRate(successRate);
    return `${color}${'█'.repeat(filled)}${c.reset}${'░'.repeat(empty)}`;
  }

  calculatePercentile(values, percentile) {
    if (values.length === 0) return 0;
    const sorted = values.sort((a, b) => a - b);
    const index = Math.ceil(sorted.length * percentile) - 1;
    return sorted[index].toFixed(0);
  }

  groupBy(array, key) {
    return array.reduce((groups, item) => {
      const value = item[key];
      groups[value] = groups[value] || [];
      groups[value].push(item);
      return groups;
    }, {});
  }
}

// ═══════════════════════════════════════════════════════════════
// CLI Interface
// ═══════════════════════════════════════════════════════════════

if (require.main === module) {
  const command = process.argv[2];

  const monitor = new HookMonitor();

  switch (command) {
    case 'dashboard':
    case 'status':
      monitor.dashboard();
      break;

    case 'analyze':
      monitor.analyze();
      break;

    case 'reset':
      monitor.reset();
      break;

    case 'alert':
      const alertCount = monitor.alert();
      process.exit(alertCount > 0 ? 1 : 0);
      break;

    default:
      console.log(`${c.bold}Hook Monitor${c.reset} - Real-time hook performance monitoring\n`);
      console.log('Commands:');
      console.log(`  ${c.green}dashboard${c.reset}   Show real-time hook metrics and circuit breaker state`);
      console.log(`  ${c.green}analyze${c.reset}     Historical performance analysis and trends`);
      console.log(`  ${c.green}reset${c.reset}       Manually reset circuit breaker to CLOSED state`);
      console.log(`  ${c.green}alert${c.reset}       Check for issues requiring attention (exit 1 if alerts)\n`);
      console.log('Examples:');
      console.log(`  ${c.cyan}hook-monitor.js dashboard${c.reset}    # Real-time status`);
      console.log(`  ${c.cyan}hook-monitor.js analyze${c.reset}       # Performance trends`);
      console.log(`  ${c.cyan}hook-monitor.js alert${c.reset}         # CI/CD alerting`);
      console.log(`  ${c.cyan}hook-monitor.js reset${c.reset}         # Force recovery\n`);
  }
}

module.exports = HookMonitor;
