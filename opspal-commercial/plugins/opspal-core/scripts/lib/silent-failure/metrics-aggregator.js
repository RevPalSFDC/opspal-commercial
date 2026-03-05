#!/usr/bin/env node

/**
 * Metrics Aggregator for Silent Failure Detection
 *
 * Purpose: Aggregate and analyze silent failure metrics over time
 *
 * Features:
 * - Trend analysis (7-day rolling window)
 * - Health score calculation
 * - Dashboard generation (Markdown, JSON)
 * - Export capabilities
 *
 * Usage:
 *   const { MetricsAggregator } = require('./metrics-aggregator');
 *
 *   const aggregator = new MetricsAggregator();
 *   const report = await aggregator.aggregate({ days: 7 });
 *   const dashboard = aggregator.generateDashboard(report);
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// =============================================================================
// Constants
// =============================================================================

const SEVERITY_WEIGHTS = {
  CRITICAL: 30,
  HIGH: 15,
  MEDIUM: 5,
  LOW: 1,
  INFO: 0
};

// =============================================================================
// Metrics Aggregator
// =============================================================================

/**
 * Aggregates and analyzes silent failure metrics
 */
class MetricsAggregator {
  constructor(options = {}) {
    this.logPath = options.logPath ||
      path.join(os.homedir(), '.claude', 'logs', 'silent-failures.jsonl');
    this.metricsDir = options.metricsDir ||
      path.join(os.homedir(), '.claude', 'metrics', 'silent-failures');
  }

  /**
   * Aggregate metrics for a time period
   * @param {Object} options - Aggregation options
   * @param {number} options.days - Number of days to analyze (default: 7)
   * @returns {Object} Aggregated report
   */
  async aggregate(options = { days: 7 }) {
    if (!fs.existsSync(this.logPath)) {
      return this.emptyReport(options.days);
    }

    const cutoff = Date.now() - options.days * 24 * 60 * 60 * 1000;

    // Parse log entries
    const entries = fs.readFileSync(this.logPath, 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(line => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(e => e && new Date(e.timestamp).getTime() > cutoff);

    // Calculate metrics
    const summary = this.calculateSummary(entries);
    const trends = this.calculateTrends(entries, options.days);
    const healthScore = this.calculateHealthScore(entries);
    const topIssues = this.getTopIssues(entries, 5);
    const recommendations = this.generateRecommendations(entries, summary);

    return {
      period: {
        days: options.days,
        from: new Date(cutoff).toISOString(),
        to: new Date().toISOString()
      },
      summary,
      trends,
      healthScore,
      topIssues,
      recommendations,
      rawCount: entries.length
    };
  }

  /**
   * Calculate summary statistics
   */
  calculateSummary(entries) {
    return {
      total: entries.length,
      bySeverity: this.groupBy(entries, 'severity'),
      byType: this.groupBy(entries, 'type'),
      byTaxonomy: this.groupBy(entries, 'taxonomy'),
      criticalCount: entries.filter(e => e.severity === 'CRITICAL').length,
      highCount: entries.filter(e => e.severity === 'HIGH').length
    };
  }

  /**
   * Calculate trend data
   */
  calculateTrends(entries, days) {
    // Group by day
    const byDay = new Map();
    const dayMs = 24 * 60 * 60 * 1000;

    for (const entry of entries) {
      const dayKey = Math.floor(new Date(entry.timestamp).getTime() / dayMs);
      const dayEntries = byDay.get(dayKey) || [];
      dayEntries.push(entry);
      byDay.set(dayKey, dayEntries);
    }

    // Calculate daily counts
    const dailyCounts = [];
    const now = Date.now();

    for (let i = days - 1; i >= 0; i--) {
      const dayKey = Math.floor((now - i * dayMs) / dayMs);
      const dayEntries = byDay.get(dayKey) || [];

      dailyCounts.push({
        date: new Date(dayKey * dayMs).toISOString().split('T')[0],
        total: dayEntries.length,
        critical: dayEntries.filter(e => e.severity === 'CRITICAL').length,
        high: dayEntries.filter(e => e.severity === 'HIGH').length
      });
    }

    // Determine trend direction
    const firstHalf = dailyCounts.slice(0, Math.floor(days / 2));
    const secondHalf = dailyCounts.slice(Math.floor(days / 2));

    const firstAvg = firstHalf.reduce((s, d) => s + d.total, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((s, d) => s + d.total, 0) / secondHalf.length;

    let direction = 'stable';
    if (secondAvg < firstAvg * 0.7) direction = 'improving';
    else if (secondAvg > firstAvg * 1.3) direction = 'worsening';

    return {
      dailyCounts,
      direction,
      firstHalfAvg: Math.round(firstAvg * 100) / 100,
      secondHalfAvg: Math.round(secondAvg * 100) / 100,
      improving: direction === 'improving',
      worsening: direction === 'worsening'
    };
  }

  /**
   * Calculate overall health score
   */
  calculateHealthScore(entries) {
    if (entries.length === 0) return 100;

    const penalty = entries.reduce((sum, e) => {
      return sum + (SEVERITY_WEIGHTS[e.severity] || 0);
    }, 0);

    // Normalize: max penalty of 100 points
    const normalizedPenalty = Math.min(penalty, 100);

    return Math.max(0, 100 - normalizedPenalty);
  }

  /**
   * Get top issues by frequency
   */
  getTopIssues(entries, limit = 5) {
    const typeCount = new Map();

    for (const entry of entries) {
      const key = `${entry.type}|${entry.severity}`;
      const existing = typeCount.get(key) || { count: 0, type: entry.type, severity: entry.severity };
      existing.count++;
      typeCount.set(key, existing);
    }

    return Array.from(typeCount.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  /**
   * Generate actionable recommendations
   */
  generateRecommendations(entries, summary) {
    const recommendations = [];

    // Check for CRITICAL issues
    if (summary.criticalCount > 0) {
      recommendations.push(
        `\u26a0\ufe0f  ${summary.criticalCount} CRITICAL issue(s) detected - review and address immediately`
      );
    }

    // Check for env bypass
    const envBypass = entries.filter(e => e.type === 'ENV_BYPASS').length;
    if (envBypass > 0) {
      recommendations.push(
        `Remove SKIP_VALIDATION environment variable (${envBypass} bypass events logged)`
      );
    }

    // Check for circuit breaker issues
    const circuitOpen = entries.filter(e => e.type === 'CIRCUIT_OPEN').length;
    if (circuitOpen > 0) {
      recommendations.push(
        `Reset open circuit breakers after fixing underlying issues (${circuitOpen} events)`
      );
    }

    // Check for cache issues
    const cacheFallbacks = entries.filter(e => e.type === 'cache_fallback').length;
    if (cacheFallbacks > 3) {
      recommendations.push(
        `Investigate API connectivity - ${cacheFallbacks} cache fallbacks indicate external service issues`
      );
    }

    // Check for stale cache
    const staleCaches = entries.filter(e => e.type === 'STALE_CACHE').length;
    if (staleCaches > 0) {
      recommendations.push(
        `Refresh stale caches: ${staleCaches} stale cache warnings`
      );
    }

    // Check for hook failures
    const hookFailures = entries.filter(e => e.type?.includes('hook')).length;
    if (hookFailures > 2) {
      recommendations.push(
        `Review failing hooks - ${hookFailures} hook failures detected`
      );
    }

    // General recommendation if no specific issues
    if (recommendations.length === 0 && entries.length > 0) {
      recommendations.push(
        'Review logged issues and address by severity (CRITICAL > HIGH > MEDIUM)'
      );
    }

    return recommendations;
  }

  /**
   * Generate Markdown dashboard
   */
  generateDashboard(report) {
    const healthEmoji = report.healthScore >= 80 ? '\u2705' :
      report.healthScore >= 50 ? '\u26a0\ufe0f' : '\u274c';

    const trendEmoji = report.trends.improving ? '\ud83d\udcc8' :
      report.trends.worsening ? '\ud83d\udcc9' : '\u27a1\ufe0f';

    return `
# Silent Failure Detection Dashboard

**Period**: ${report.period.from.split('T')[0]} to ${report.period.to.split('T')[0]} (${report.period.days} days)
**Health Score**: ${healthEmoji} ${report.healthScore}/100

## Summary

| Metric | Value |
|--------|-------|
| Total Detections | ${report.summary.total} |
| Critical | ${report.summary.criticalCount} |
| High | ${report.summary.highCount} |
| Trend | ${trendEmoji} ${report.trends.direction} |

## By Severity

| Severity | Count |
|----------|-------|
${Object.entries(report.summary.bySeverity || {}).map(([k, v]) => `| ${k} | ${v} |`).join('\n')}

## By Type

| Type | Count |
|------|-------|
${Object.entries(report.summary.byType || {}).map(([k, v]) => `| ${k} | ${v} |`).join('\n')}

## Top Issues

${report.topIssues.map((issue, i) => `${i + 1}. **${issue.type}** (${issue.count}x) - ${issue.severity}`).join('\n')}

## Trend Analysis

${report.trends.direction === 'improving' ? '\ud83d\udcc8 **Improving**' : report.trends.direction === 'worsening' ? '\ud83d\udcc9 **Worsening**' : '\u27a1\ufe0f **Stable**'}

- First half average: ${report.trends.firstHalfAvg} detections/day
- Second half average: ${report.trends.secondHalfAvg} detections/day

### Daily Breakdown

| Date | Total | Critical | High |
|------|-------|----------|------|
${report.trends.dailyCounts.map(d => `| ${d.date} | ${d.total} | ${d.critical} | ${d.high} |`).join('\n')}

## Recommendations

${report.recommendations.map((r, i) => `${i + 1}. ${r}`).join('\n')}

---
*Generated by Silent Failure Detection System at ${new Date().toISOString()}*
`;
  }

  /**
   * Save report to file
   */
  async saveReport(report, format = 'json') {
    // Ensure directory exists
    if (!fs.existsSync(this.metricsDir)) {
      fs.mkdirSync(this.metricsDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().split('T')[0];
    let filePath;
    let content;

    if (format === 'markdown') {
      filePath = path.join(this.metricsDir, `dashboard-${timestamp}.md`);
      content = this.generateDashboard(report);
    } else {
      filePath = path.join(this.metricsDir, `report-${timestamp}.json`);
      content = JSON.stringify(report, null, 2);
    }

    fs.writeFileSync(filePath, content);

    return filePath;
  }

  /**
   * Utility: Group entries by field
   */
  groupBy(entries, field) {
    return entries.reduce((acc, e) => {
      const key = e[field] || 'unknown';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
  }

  /**
   * Return empty report structure
   */
  emptyReport(days) {
    return {
      period: {
        days,
        from: new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString(),
        to: new Date().toISOString()
      },
      summary: {
        total: 0,
        bySeverity: {},
        byType: {},
        byTaxonomy: {},
        criticalCount: 0,
        highCount: 0
      },
      trends: {
        dailyCounts: [],
        direction: 'stable',
        improving: false,
        worsening: false
      },
      healthScore: 100,
      topIssues: [],
      recommendations: ['No silent failures detected - system is healthy!'],
      rawCount: 0
    };
  }
}

// =============================================================================
// CLI Interface
// =============================================================================

if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0] || 'report';
  const days = parseInt(args.find(a => /^\d+$/.test(a)), 10) || 7;

  const aggregator = new MetricsAggregator();

  switch (command) {
    case 'report':
    case 'json':
      aggregator.aggregate({ days }).then(report => {
        console.log(JSON.stringify(report, null, 2));
      });
      break;

    case 'dashboard':
    case 'md':
    case 'markdown':
      aggregator.aggregate({ days }).then(report => {
        console.log(aggregator.generateDashboard(report));
      });
      break;

    case 'save':
      aggregator.aggregate({ days }).then(async report => {
        const jsonPath = await aggregator.saveReport(report, 'json');
        const mdPath = await aggregator.saveReport(report, 'markdown');
        console.log(`Reports saved:\n  ${jsonPath}\n  ${mdPath}`);
      });
      break;

    case 'health':
      aggregator.aggregate({ days }).then(report => {
        const emoji = report.healthScore >= 80 ? '\u2705' :
          report.healthScore >= 50 ? '\u26a0\ufe0f' : '\u274c';
        console.log(`${emoji} Health Score: ${report.healthScore}/100`);
        console.log(`   Total Issues: ${report.summary.total} (${days} days)`);
        console.log(`   Trend: ${report.trends.direction}`);
      });
      break;

    case 'help':
    default:
      console.log(`
Silent Failure Metrics Aggregator

Usage:
  node metrics-aggregator.js report [days]     JSON report (default: 7 days)
  node metrics-aggregator.js dashboard [days]  Markdown dashboard
  node metrics-aggregator.js save [days]       Save reports to files
  node metrics-aggregator.js health [days]     Quick health check
  node metrics-aggregator.js help              Show this help
`);
  }
}

// =============================================================================
// Exports
// =============================================================================

module.exports = {
  MetricsAggregator,
  SEVERITY_WEIGHTS
};
