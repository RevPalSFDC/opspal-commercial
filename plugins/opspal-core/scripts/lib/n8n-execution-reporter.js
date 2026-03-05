#!/usr/bin/env node

/**
 * n8n Execution Reporter
 *
 * Generates execution reports for n8n workflows.
 * Analyzes execution history, calculates metrics, and produces formatted reports.
 *
 * Features:
 * - Generate execution summary reports
 * - Calculate success/failure rates
 * - Identify slow nodes and bottlenecks
 * - Track execution trends over time
 * - Export reports in multiple formats
 *
 * Usage:
 *   const N8nExecutionReporter = require('./n8n-execution-reporter');
 *   const reporter = new N8nExecutionReporter();
 *   const report = await reporter.generateReport(executions, options);
 *
 * CLI Commands:
 *   node n8n-execution-reporter.js summary <file.json>    - Generate summary report
 *   node n8n-execution-reporter.js trends <file.json>     - Show execution trends
 *   node n8n-execution-reporter.js errors <file.json>     - Error analysis report
 */

const fs = require('fs');
const path = require('path');

class N8nExecutionReporter {
  constructor(options = {}) {
    this.options = {
      dateFormat: options.dateFormat || 'YYYY-MM-DD HH:mm:ss',
      timezone: options.timezone || 'America/New_York',
      ...options
    };
  }

  /**
   * Generate comprehensive execution report
   * @param {Array} executions - Array of execution objects
   * @param {Object} options - Report options
   * @returns {Object} Report data
   */
  generateReport(executions, options = {}) {
    const {
      workflowName = 'Unknown Workflow',
      period = 'all',
      includeDetails = true
    } = options;

    // Filter executions by period if specified
    const filteredExecutions = this.filterByPeriod(executions, period);

    // Calculate metrics
    const metrics = this.calculateMetrics(filteredExecutions);

    // Analyze errors
    const errorAnalysis = this.analyzeErrors(filteredExecutions);

    // Identify slow nodes
    const performanceAnalysis = this.analyzePerformance(filteredExecutions);

    // Generate trends
    const trends = this.calculateTrends(filteredExecutions);

    const report = {
      metadata: {
        workflowName,
        generatedAt: new Date().toISOString(),
        period,
        totalExecutions: filteredExecutions.length
      },
      summary: metrics,
      errorAnalysis,
      performanceAnalysis,
      trends,
      recentExecutions: includeDetails ? filteredExecutions.slice(0, 10) : []
    };

    return report;
  }

  /**
   * Filter executions by time period
   */
  filterByPeriod(executions, period) {
    if (period === 'all') return executions;

    const now = new Date();
    let cutoff;

    switch (period) {
      case 'today':
        cutoff = new Date(now.setHours(0, 0, 0, 0));
        break;
      case 'week':
        cutoff = new Date(now.setDate(now.getDate() - 7));
        break;
      case 'month':
        cutoff = new Date(now.setMonth(now.getMonth() - 1));
        break;
      case '24h':
        cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      default:
        return executions;
    }

    return executions.filter(exec => {
      const execDate = new Date(exec.startedAt || exec.createdAt);
      return execDate >= cutoff;
    });
  }

  /**
   * Calculate execution metrics
   */
  calculateMetrics(executions) {
    if (executions.length === 0) {
      return {
        total: 0,
        success: 0,
        error: 0,
        running: 0,
        successRate: 0,
        errorRate: 0,
        avgDuration: 0,
        minDuration: 0,
        maxDuration: 0
      };
    }

    const statusCounts = {
      success: 0,
      error: 0,
      running: 0,
      waiting: 0,
      canceled: 0,
      unknown: 0
    };

    const durations = [];

    executions.forEach(exec => {
      const status = exec.status || exec.finished ? 'success' : 'unknown';
      if (statusCounts.hasOwnProperty(status)) {
        statusCounts[status]++;
      } else {
        statusCounts.unknown++;
      }

      // Calculate duration if available
      if (exec.startedAt && exec.stoppedAt) {
        const duration = new Date(exec.stoppedAt) - new Date(exec.startedAt);
        durations.push(duration);
      }
    });

    const total = executions.length;
    const avgDuration = durations.length > 0
      ? durations.reduce((a, b) => a + b, 0) / durations.length
      : 0;

    return {
      total,
      success: statusCounts.success,
      error: statusCounts.error,
      running: statusCounts.running,
      waiting: statusCounts.waiting,
      canceled: statusCounts.canceled,
      successRate: total > 0 ? ((statusCounts.success / total) * 100).toFixed(1) : 0,
      errorRate: total > 0 ? ((statusCounts.error / total) * 100).toFixed(1) : 0,
      avgDuration: this.formatDuration(avgDuration),
      avgDurationMs: avgDuration,
      minDuration: durations.length > 0 ? this.formatDuration(Math.min(...durations)) : 'N/A',
      maxDuration: durations.length > 0 ? this.formatDuration(Math.max(...durations)) : 'N/A'
    };
  }

  /**
   * Analyze execution errors
   */
  analyzeErrors(executions) {
    const errorExecutions = executions.filter(exec => exec.status === 'error');

    if (errorExecutions.length === 0) {
      return {
        totalErrors: 0,
        errorTypes: [],
        affectedNodes: [],
        mostCommonError: null,
        recentErrors: []
      };
    }

    const errorTypes = {};
    const affectedNodes = {};

    errorExecutions.forEach(exec => {
      const error = exec.data?.resultData?.error || {};
      const errorType = this.categorizeError(error.message || 'Unknown');
      const nodeName = error.node || 'Unknown Node';

      errorTypes[errorType] = (errorTypes[errorType] || 0) + 1;
      affectedNodes[nodeName] = (affectedNodes[nodeName] || 0) + 1;
    });

    // Sort by count
    const sortedErrorTypes = Object.entries(errorTypes)
      .sort((a, b) => b[1] - a[1])
      .map(([type, count]) => ({ type, count }));

    const sortedAffectedNodes = Object.entries(affectedNodes)
      .sort((a, b) => b[1] - a[1])
      .map(([node, count]) => ({ node, count }));

    return {
      totalErrors: errorExecutions.length,
      errorTypes: sortedErrorTypes,
      affectedNodes: sortedAffectedNodes,
      mostCommonError: sortedErrorTypes[0] || null,
      mostAffectedNode: sortedAffectedNodes[0] || null,
      recentErrors: errorExecutions.slice(0, 5).map(exec => ({
        id: exec.id,
        timestamp: exec.startedAt,
        error: exec.data?.resultData?.error?.message || 'Unknown error',
        node: exec.data?.resultData?.error?.node || 'Unknown'
      }))
    };
  }

  /**
   * Categorize error by type
   */
  categorizeError(errorMessage) {
    const message = (errorMessage || '').toLowerCase();

    if (message.includes('401') || message.includes('unauthorized') || message.includes('authentication')) {
      return 'Authentication';
    }
    if (message.includes('403') || message.includes('forbidden') || message.includes('permission')) {
      return 'Permission';
    }
    if (message.includes('429') || message.includes('rate limit') || message.includes('too many')) {
      return 'Rate Limit';
    }
    if (message.includes('timeout') || message.includes('timed out')) {
      return 'Timeout';
    }
    if (message.includes('econnrefused') || message.includes('connection')) {
      return 'Connection';
    }
    if (message.includes('undefined') || message.includes('null') || message.includes('cannot read')) {
      return 'Data Format';
    }
    if (message.includes('invalid') || message.includes('validation')) {
      return 'Validation';
    }
    if (message.includes('not found') || message.includes('404')) {
      return 'Not Found';
    }

    return 'Other';
  }

  /**
   * Analyze execution performance
   */
  analyzePerformance(executions) {
    const successfulExecutions = executions.filter(
      exec => exec.status === 'success' && exec.data?.resultData?.runData
    );

    if (successfulExecutions.length === 0) {
      return {
        avgExecutionTime: 'N/A',
        slowestNodes: [],
        bottlenecks: []
      };
    }

    const nodeTimes = {};

    successfulExecutions.forEach(exec => {
      const runData = exec.data?.resultData?.runData || {};

      Object.entries(runData).forEach(([nodeName, nodeRuns]) => {
        if (Array.isArray(nodeRuns) && nodeRuns.length > 0) {
          const run = nodeRuns[0];
          if (run.startTime && run.executionTime) {
            if (!nodeTimes[nodeName]) {
              nodeTimes[nodeName] = [];
            }
            nodeTimes[nodeName].push(run.executionTime);
          }
        }
      });
    });

    // Calculate average times per node
    const nodeAvgTimes = Object.entries(nodeTimes)
      .map(([node, times]) => ({
        node,
        avgTime: times.reduce((a, b) => a + b, 0) / times.length,
        executions: times.length
      }))
      .sort((a, b) => b.avgTime - a.avgTime);

    return {
      analyzedExecutions: successfulExecutions.length,
      slowestNodes: nodeAvgTimes.slice(0, 5).map(n => ({
        ...n,
        avgTimeFormatted: this.formatDuration(n.avgTime)
      })),
      bottlenecks: nodeAvgTimes
        .filter(n => n.avgTime > 1000) // Nodes taking > 1 second
        .map(n => ({
          node: n.node,
          avgTime: this.formatDuration(n.avgTime),
          suggestion: this.getSuggestionForSlowNode(n.node, n.avgTime)
        }))
    };
  }

  /**
   * Get optimization suggestion for slow node
   */
  getSuggestionForSlowNode(nodeName, avgTime) {
    const name = nodeName.toLowerCase();

    if (name.includes('salesforce') || name.includes('hubspot')) {
      return 'Consider batching API calls or adding pagination';
    }
    if (name.includes('http') || name.includes('request')) {
      return 'Check API response time; consider caching or async processing';
    }
    if (name.includes('code') || name.includes('function')) {
      return 'Review custom code for optimization opportunities';
    }
    if (name.includes('wait')) {
      return 'Wait node is expected to be slow; verify timing is appropriate';
    }

    return 'Review node configuration and data volume';
  }

  /**
   * Calculate execution trends
   */
  calculateTrends(executions) {
    if (executions.length < 2) {
      return {
        dailyTrend: [],
        hourlyDistribution: [],
        weekdayDistribution: []
      };
    }

    // Group by day
    const dailyCounts = {};
    const hourCounts = Array(24).fill(0);
    const weekdayCounts = Array(7).fill(0);

    executions.forEach(exec => {
      const date = new Date(exec.startedAt || exec.createdAt);
      const dayKey = date.toISOString().split('T')[0];
      const hour = date.getHours();
      const weekday = date.getDay();

      dailyCounts[dayKey] = (dailyCounts[dayKey] || { total: 0, success: 0, error: 0 });
      dailyCounts[dayKey].total++;
      if (exec.status === 'success') dailyCounts[dayKey].success++;
      if (exec.status === 'error') dailyCounts[dayKey].error++;

      hourCounts[hour]++;
      weekdayCounts[weekday]++;
    });

    const dailyTrend = Object.entries(dailyCounts)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, counts]) => ({
        date,
        ...counts,
        successRate: counts.total > 0
          ? ((counts.success / counts.total) * 100).toFixed(1)
          : 0
      }));

    const weekdayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    return {
      dailyTrend,
      hourlyDistribution: hourCounts.map((count, hour) => ({
        hour: `${hour.toString().padStart(2, '0')}:00`,
        count
      })),
      weekdayDistribution: weekdayCounts.map((count, day) => ({
        day: weekdayNames[day],
        count
      })),
      peakHour: hourCounts.indexOf(Math.max(...hourCounts)),
      peakDay: weekdayNames[weekdayCounts.indexOf(Math.max(...weekdayCounts))]
    };
  }

  /**
   * Format duration in human-readable format
   */
  formatDuration(ms) {
    if (ms < 1000) return `${Math.round(ms)}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    if (ms < 3600000) return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
    return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`;
  }

  /**
   * Format report as markdown
   */
  formatMarkdown(report) {
    const { metadata, summary, errorAnalysis, performanceAnalysis, trends } = report;

    let md = `# Execution Report: ${metadata.workflowName}\n\n`;
    md += `**Generated**: ${metadata.generatedAt}\n`;
    md += `**Period**: ${metadata.period}\n`;
    md += `**Total Executions**: ${metadata.totalExecutions}\n\n`;

    // Summary
    md += `## Summary\n\n`;
    md += `| Metric | Value |\n`;
    md += `|--------|-------|\n`;
    md += `| Total | ${summary.total} |\n`;
    md += `| Success | ${summary.success} (${summary.successRate}%) |\n`;
    md += `| Error | ${summary.error} (${summary.errorRate}%) |\n`;
    md += `| Running | ${summary.running} |\n`;
    md += `| Avg Duration | ${summary.avgDuration} |\n\n`;

    // Error Analysis
    if (errorAnalysis.totalErrors > 0) {
      md += `## Error Analysis\n\n`;
      md += `**Total Errors**: ${errorAnalysis.totalErrors}\n\n`;

      if (errorAnalysis.errorTypes.length > 0) {
        md += `### Error Types\n`;
        md += `| Type | Count |\n`;
        md += `|------|-------|\n`;
        errorAnalysis.errorTypes.forEach(e => {
          md += `| ${e.type} | ${e.count} |\n`;
        });
        md += `\n`;
      }

      if (errorAnalysis.affectedNodes.length > 0) {
        md += `### Affected Nodes\n`;
        md += `| Node | Failures |\n`;
        md += `|------|----------|\n`;
        errorAnalysis.affectedNodes.slice(0, 5).forEach(n => {
          md += `| ${n.node} | ${n.count} |\n`;
        });
        md += `\n`;
      }

      if (errorAnalysis.recentErrors.length > 0) {
        md += `### Recent Errors\n`;
        errorAnalysis.recentErrors.forEach(e => {
          md += `- **${e.timestamp}** (${e.node}): ${e.error}\n`;
        });
        md += `\n`;
      }
    }

    // Performance Analysis
    if (performanceAnalysis.slowestNodes?.length > 0) {
      md += `## Performance Analysis\n\n`;
      md += `### Slowest Nodes\n`;
      md += `| Node | Avg Time |\n`;
      md += `|------|----------|\n`;
      performanceAnalysis.slowestNodes.forEach(n => {
        md += `| ${n.node} | ${n.avgTimeFormatted} |\n`;
      });
      md += `\n`;

      if (performanceAnalysis.bottlenecks?.length > 0) {
        md += `### Bottleneck Recommendations\n`;
        performanceAnalysis.bottlenecks.forEach(b => {
          md += `- **${b.node}** (${b.avgTime}): ${b.suggestion}\n`;
        });
        md += `\n`;
      }
    }

    // Trends
    if (trends.peakHour !== undefined) {
      md += `## Trends\n\n`;
      md += `- **Peak Hour**: ${trends.peakHour}:00\n`;
      md += `- **Peak Day**: ${trends.peakDay}\n\n`;
    }

    return md;
  }

  /**
   * Format report as JSON
   */
  formatJson(report) {
    return JSON.stringify(report, null, 2);
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const reporter = new N8nExecutionReporter();

  switch (command) {
    case 'summary': {
      const filePath = args[1];
      if (!filePath) {
        console.error('Usage: n8n-execution-reporter.js summary <file.json>');
        process.exit(1);
      }

      const content = fs.readFileSync(filePath, 'utf8');
      const executions = JSON.parse(content);

      const report = reporter.generateReport(executions, {
        workflowName: path.basename(filePath, '.json'),
        period: args[2] || 'all'
      });

      console.log(reporter.formatMarkdown(report));
      break;
    }

    case 'trends': {
      const filePath = args[1];
      if (!filePath) {
        console.error('Usage: n8n-execution-reporter.js trends <file.json>');
        process.exit(1);
      }

      const content = fs.readFileSync(filePath, 'utf8');
      const executions = JSON.parse(content);

      const report = reporter.generateReport(executions);
      const { trends } = report;

      console.log('\nExecution Trends\n');
      console.log(`Peak Hour: ${trends.peakHour}:00`);
      console.log(`Peak Day: ${trends.peakDay}\n`);

      if (trends.dailyTrend.length > 0) {
        console.log('Daily Trend:');
        trends.dailyTrend.slice(-7).forEach(d => {
          console.log(`  ${d.date}: ${d.total} (${d.successRate}% success)`);
        });
      }
      break;
    }

    case 'errors': {
      const filePath = args[1];
      if (!filePath) {
        console.error('Usage: n8n-execution-reporter.js errors <file.json>');
        process.exit(1);
      }

      const content = fs.readFileSync(filePath, 'utf8');
      const executions = JSON.parse(content);

      const report = reporter.generateReport(executions);
      const { errorAnalysis } = report;

      console.log('\nError Analysis\n');
      console.log(`Total Errors: ${errorAnalysis.totalErrors}\n`);

      if (errorAnalysis.errorTypes.length > 0) {
        console.log('Error Types:');
        errorAnalysis.errorTypes.forEach(e => {
          console.log(`  ${e.type}: ${e.count}`);
        });
        console.log('');
      }

      if (errorAnalysis.recentErrors.length > 0) {
        console.log('Recent Errors:');
        errorAnalysis.recentErrors.forEach(e => {
          console.log(`  - [${e.node}] ${e.error}`);
        });
      }
      break;
    }

    default:
      console.log(`
n8n Execution Reporter

Generates reports from n8n execution data.

Commands:
  summary <file.json> [period]   Generate summary report
  trends <file.json>             Show execution trends
  errors <file.json>             Error analysis report

Periods:
  all      All executions (default)
  today    Today only
  24h      Last 24 hours
  week     Last 7 days
  month    Last 30 days

Examples:
  node n8n-execution-reporter.js summary executions.json
  node n8n-execution-reporter.js summary executions.json week
  node n8n-execution-reporter.js errors executions.json
`);
  }
}

// Export for programmatic use
module.exports = N8nExecutionReporter;

// Run CLI if executed directly
if (require.main === module) {
  main().catch(console.error);
}
