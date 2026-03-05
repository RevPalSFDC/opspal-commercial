#!/usr/bin/env node

/**
 * Hook Analytics Dashboard
 *
 * Purpose: Comprehensive analytics and visualization for hook system performance,
 *          error tracking, and usage patterns.
 *
 * Pattern: Adopted from claude-code-hooks-mastery repository
 *          https://github.com/disler/claude-code-hooks-mastery
 *
 * Usage:
 *   node hook-analytics-dashboard.js summary           # Overall summary
 *   node hook-analytics-dashboard.js performance       # Performance metrics
 *   node hook-analytics-dashboard.js errors            # Error analysis
 *   node hook-analytics-dashboard.js trends [days]     # Trend analysis
 *   node hook-analytics-dashboard.js report [format]   # Generate report
 *
 * Features:
 *   - Performance metrics (execution time, throughput)
 *   - Error rate tracking and analysis
 *   - Usage pattern visualization
 *   - Trend analysis over time
 *   - Automated report generation
 *   - Real-time monitoring
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

class HookAnalyticsDashboard {
  constructor(options = {}) {
    this.logDir = options.logDir || path.join(os.homedir(), '.claude', 'logs', 'hooks');
    this.outputDir = options.outputDir || path.join(os.homedir(), '.claude', 'reports', 'hooks');
  }

  /**
   * Load all hook logs
   */
  loadLogs(options = {}) {
    const {
      hook = '*',
      since = null,
      until = null,
      level = null
    } = options;

    try {
      const pattern = hook === '*' ? /.*\.jsonl$/ : new RegExp(`^${hook}-.*\\.jsonl$`);
      const files = fs.readdirSync(this.logDir).filter(f => f.match(pattern));

      let logs = [];

      files.forEach(file => {
        const filePath = path.join(this.logDir, file);
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.trim().split('\n').filter(line => line);

        lines.forEach(line => {
          try {
            const log = JSON.parse(line);

            // Filter by level
            if (level && log.level !== level) return;

            // Filter by time range
            const logTime = new Date(log.timestamp).getTime();
            if (since && logTime < new Date(since).getTime()) return;
            if (until && logTime > new Date(until).getTime()) return;

            logs.push(log);
          } catch (error) {
            // Skip invalid JSON lines
          }
        });
      });

      return logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    } catch (error) {
      console.error(`Failed to load logs: ${error.message}`);
      return [];
    }
  }

  /**
   * Generate overall summary
   */
  summary() {
    const logs = this.loadLogs();

    const summary = {
      total: logs.length,
      byHook: {},
      byLevel: {
        debug: 0,
        info: 0,
        warn: 0,
        error: 0
      },
      performance: {
        avgDuration: 0,
        minDuration: Infinity,
        maxDuration: 0,
        totalDuration: 0
      },
      errors: [],
      timeRange: {
        oldest: null,
        newest: null
      }
    };

    let durationCount = 0;

    logs.forEach(log => {
      // Count by hook
      summary.byHook[log.hook] = (summary.byHook[log.hook] || 0) + 1;

      // Count by level
      summary.byLevel[log.level]++;

      // Track durations
      if (log.durationMs !== undefined) {
        const duration = log.durationMs;
        summary.performance.totalDuration += duration;
        summary.performance.minDuration = Math.min(summary.performance.minDuration, duration);
        summary.performance.maxDuration = Math.max(summary.performance.maxDuration, duration);
        durationCount++;
      }

      // Collect errors
      if (log.level === 'error') {
        summary.errors.push({
          timestamp: log.timestamp,
          hook: log.hook,
          message: log.message
        });
      }

      // Track time range
      const logTime = new Date(log.timestamp);
      if (!summary.timeRange.oldest || logTime < summary.timeRange.oldest) {
        summary.timeRange.oldest = logTime;
      }
      if (!summary.timeRange.newest || logTime > summary.timeRange.newest) {
        summary.timeRange.newest = logTime;
      }
    });

    summary.performance.avgDuration = durationCount > 0
      ? summary.performance.totalDuration / durationCount
      : 0;

    return summary;
  }

  /**
   * Generate performance metrics
   */
  performance() {
    const logs = this.loadLogs();

    const metrics = {};

    logs.forEach(log => {
      if (!metrics[log.hook]) {
        metrics[log.hook] = {
          executions: 0,
          totalDuration: 0,
          minDuration: Infinity,
          maxDuration: 0,
          avgDuration: 0,
          errors: 0,
          warnings: 0
        };
      }

      const m = metrics[log.hook];
      m.executions++;

      if (log.durationMs !== undefined) {
        m.totalDuration += log.durationMs;
        m.minDuration = Math.min(m.minDuration, log.durationMs);
        m.maxDuration = Math.max(m.maxDuration, log.durationMs);
      }

      if (log.level === 'error') m.errors++;
      if (log.level === 'warn') m.warnings++;
    });

    // Calculate averages
    Object.keys(metrics).forEach(hook => {
      const m = metrics[hook];
      m.avgDuration = m.totalDuration / m.executions;
      m.errorRate = (m.errors / m.executions) * 100;
      m.warningRate = (m.warnings / m.executions) * 100;
    });

    return metrics;
  }

  /**
   * Generate error analysis
   */
  errorAnalysis() {
    const logs = this.loadLogs({ level: 'error' });

    const analysis = {
      total: logs.length,
      byHook: {},
      recentErrors: [],
      errorPatterns: {}
    };

    logs.forEach(log => {
      // Count by hook
      analysis.byHook[log.hook] = (analysis.byHook[log.hook] || 0) + 1;

      // Recent errors (last 10)
      if (analysis.recentErrors.length < 10) {
        analysis.recentErrors.push({
          timestamp: log.timestamp,
          hook: log.hook,
          message: log.message
        });
      }

      // Pattern detection (simplified)
      const pattern = this._extractErrorPattern(log.message);
      if (pattern) {
        analysis.errorPatterns[pattern] = (analysis.errorPatterns[pattern] || 0) + 1;
      }
    });

    return analysis;
  }

  /**
   * Generate trend analysis
   */
  trends(days = 7) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const logs = this.loadLogs({ since });

    // Group by day
    const byDay = {};
    logs.forEach(log => {
      const day = new Date(log.timestamp).toISOString().split('T')[0];
      if (!byDay[day]) {
        byDay[day] = {
          total: 0,
          errors: 0,
          warnings: 0,
          byHook: {}
        };
      }

      byDay[day].total++;
      if (log.level === 'error') byDay[day].errors++;
      if (log.level === 'warn') byDay[day].warnings++;

      byDay[day].byHook[log.hook] = (byDay[day].byHook[log.hook] || 0) + 1;
    });

    return byDay;
  }

  /**
   * Generate comprehensive report
   */
  report(format = 'markdown') {
    const summary = this.summary();
    const performance = this.performance();
    const errors = this.errorAnalysis();
    const trends = this.trends();

    if (format === 'json') {
      return JSON.stringify({
        summary,
        performance,
        errors,
        trends
      }, null, 2);
    }

    // Markdown format
    let report = '# Hook System Analytics Report\n\n';
    report += `**Generated**: ${new Date().toISOString()}\n\n`;

    // Summary Section
    report += '## Summary\n\n';
    report += `- **Total Log Entries**: ${summary.total}\n`;
    report += `- **Unique Hooks**: ${Object.keys(summary.byHook).length}\n`;
    report += `- **Error Count**: ${summary.byLevel.error}\n`;
    report += `- **Warning Count**: ${summary.byLevel.warn}\n`;
    report += `- **Time Range**: ${summary.timeRange.oldest?.toISOString()} to ${summary.timeRange.newest?.toISOString()}\n\n`;

    // Performance Section
    report += '## Performance Metrics\n\n';
    report += '| Hook | Executions | Avg Time | Min Time | Max Time | Error Rate |\n';
    report += '|------|------------|----------|----------|----------|------------|\n';

    Object.entries(performance).forEach(([hook, metrics]) => {
      report += `| ${hook} | ${metrics.executions} | ${metrics.avgDuration.toFixed(0)}ms | ${metrics.minDuration}ms | ${metrics.maxDuration}ms | ${metrics.errorRate.toFixed(1)}% |\n`;
    });
    report += '\n';

    // Error Analysis Section
    report += '## Error Analysis\n\n';
    report += `**Total Errors**: ${errors.total}\n\n`;

    if (errors.total > 0) {
      report += '### Errors by Hook\n\n';
      Object.entries(errors.byHook)
        .sort((a, b) => b[1] - a[1])
        .forEach(([hook, count]) => {
          report += `- ${hook}: ${count}\n`;
        });
      report += '\n';

      report += '### Recent Errors\n\n';
      errors.recentErrors.slice(0, 5).forEach(err => {
        report += `- **${err.hook}** (${new Date(err.timestamp).toLocaleString()}): ${err.message}\n`;
      });
      report += '\n';
    }

    // Trends Section
    report += '## Trends (Last 7 Days)\n\n';
    report += '| Date | Total | Errors | Warnings |\n';
    report += '|------|-------|--------|----------|\n';

    Object.entries(trends)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .forEach(([date, data]) => {
        report += `| ${date} | ${data.total} | ${data.errors} | ${data.warnings} |\n`;
      });
    report += '\n';

    // Recommendations Section
    report += '## Recommendations\n\n';

    const highErrorRate = Object.entries(performance).filter(([_, m]) => m.errorRate > 5);
    if (highErrorRate.length > 0) {
      report += '### High Error Rate Hooks\n\n';
      highErrorRate.forEach(([hook, metrics]) => {
        report += `- **${hook}**: ${metrics.errorRate.toFixed(1)}% error rate (${metrics.errors} of ${metrics.executions} executions)\n`;
      });
      report += '\n';
    }

    const slowHooks = Object.entries(performance).filter(([_, m]) => m.avgDuration > 1000);
    if (slowHooks.length > 0) {
      report += '### Performance Optimization Needed\n\n';
      slowHooks.forEach(([hook, metrics]) => {
        report += `- **${hook}**: ${metrics.avgDuration.toFixed(0)}ms average (consider optimization)\n`;
      });
      report += '\n';
    }

    return report;
  }

  /**
   * Save report to file
   */
  saveReport(content, filename) {
    try {
      if (!fs.existsSync(this.outputDir)) {
        fs.mkdirSync(this.outputDir, { recursive: true });
      }

      const filepath = path.join(this.outputDir, filename);
      fs.writeFileSync(filepath, content);

      console.log(`✅ Report saved to: ${filepath}`);
      return filepath;
    } catch (error) {
      console.error(`Failed to save report: ${error.message}`);
      return null;
    }
  }

  /**
   * Extract error pattern from message
   * @private
   */
  _extractErrorPattern(message) {
    // Simple pattern extraction - could be enhanced
    if (message.match(/SOQL/i)) return 'SOQL_ERROR';
    if (message.match(/deployment/i)) return 'DEPLOYMENT_ERROR';
    if (message.match(/validation/i)) return 'VALIDATION_ERROR';
    if (message.match(/timeout/i)) return 'TIMEOUT_ERROR';
    if (message.match(/permission/i)) return 'PERMISSION_ERROR';
    return 'OTHER_ERROR';
  }

  /**
   * Real-time monitoring (watch mode)
   */
  watch(interval = 5000) {
    console.log('📊 Hook Analytics Dashboard - Live Monitoring');
    console.log('Press Ctrl+C to stop\n');

    const update = () => {
      process.stdout.write('\x1Bc'); // Clear screen

      const summary = this.summary();
      const performance = this.performance();

      console.log('═'.repeat(80));
      console.log('HOOK ANALYTICS DASHBOARD - LIVE');
      console.log('═'.repeat(80));
      console.log();

      console.log('📈 SUMMARY');
      console.log(`  Total Entries: ${summary.total}`);
      console.log(`  Errors: ${summary.byLevel.error}`);
      console.log(`  Warnings: ${summary.byLevel.warn}`);
      console.log(`  Avg Duration: ${summary.performance.avgDuration.toFixed(0)}ms`);
      console.log();

      console.log('⚡ TOP 5 HOOKS (by executions)');
      Object.entries(summary.byHook)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .forEach(([hook, count]) => {
          console.log(`  ${hook.padEnd(30)} ${count.toString().padStart(6)} executions`);
        });
      console.log();

      console.log('❌ ERROR RATE');
      Object.entries(performance)
        .filter(([_, m]) => m.errors > 0)
        .sort((a, b) => b[1].errorRate - a[1].errorRate)
        .slice(0, 5)
        .forEach(([hook, metrics]) => {
          console.log(`  ${hook.padEnd(30)} ${metrics.errorRate.toFixed(1)}%`);
        });
      console.log();

      console.log(`Last updated: ${new Date().toLocaleTimeString()}`);
    };

    update();
    setInterval(update, interval);
  }
}

/**
 * CLI usage
 */
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0] || 'help';

  const dashboard = new HookAnalyticsDashboard();

  if (command === 'summary') {
    const summary = dashboard.summary();
    console.log(JSON.stringify(summary, null, 2));

  } else if (command === 'performance') {
    const performance = dashboard.performance();
    console.log(JSON.stringify(performance, null, 2));

  } else if (command === 'errors') {
    const errors = dashboard.errorAnalysis();
    console.log(JSON.stringify(errors, null, 2));

  } else if (command === 'trends') {
    const days = parseInt(args[1]) || 7;
    const trends = dashboard.trends(days);
    console.log(JSON.stringify(trends, null, 2));

  } else if (command === 'report') {
    const format = args[1] || 'markdown';
    const report = dashboard.report(format);

    if (args[2] === '--save') {
      const filename = `hook-analytics-${new Date().toISOString().split('T')[0]}.${format === 'json' ? 'json' : 'md'}`;
      dashboard.saveReport(report, filename);
    } else {
      console.log(report);
    }

  } else if (command === 'watch') {
    const interval = parseInt(args[1]) || 5000;
    dashboard.watch(interval);

  } else {
    console.log('Hook Analytics Dashboard - Usage:');
    console.log('  node hook-analytics-dashboard.js summary             # Overall summary');
    console.log('  node hook-analytics-dashboard.js performance         # Performance metrics');
    console.log('  node hook-analytics-dashboard.js errors              # Error analysis');
    console.log('  node hook-analytics-dashboard.js trends [days]       # Trend analysis (default: 7 days)');
    console.log('  node hook-analytics-dashboard.js report [format]     # Generate report (markdown|json)');
    console.log('  node hook-analytics-dashboard.js report --save       # Save report to file');
    console.log('  node hook-analytics-dashboard.js watch [interval]    # Real-time monitoring (default: 5s)');
    console.log('');
    console.log('Examples:');
    console.log('  node hook-analytics-dashboard.js summary');
    console.log('  node hook-analytics-dashboard.js trends 30');
    console.log('  node hook-analytics-dashboard.js report markdown --save');
    console.log('  node hook-analytics-dashboard.js watch 3000');
  }
}

module.exports = HookAnalyticsDashboard;
