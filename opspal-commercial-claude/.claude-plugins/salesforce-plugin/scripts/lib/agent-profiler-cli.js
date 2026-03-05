#!/usr/bin/env node
/**
 * Agent Performance Profiler CLI
 *
 * Command-line interface for profiling agent performance and generating optimization reports
 *
 * Usage:
 *   node agent-profiler-cli.js report <agent-name> [options]
 *   node agent-profiler-cli.js compare <agent-a> <agent-b> [options]
 *   node agent-profiler-cli.js list [options]
 *   node agent-profiler-cli.js export <agent-name> [options]
 *   node agent-profiler-cli.js trends <agent-name> [options]
 *
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');
const AgentProfiler = require('./agent-profiler');

// CLI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

/**
 * Format duration in human-readable format
 */
function formatDuration(ms) {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = ((ms % 60000) / 1000).toFixed(0);
  return `${minutes}m ${seconds}s`;
}

/**
 * Format memory size in human-readable format
 */
function formatMemory(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)}GB`;
}

/**
 * Format percentage
 */
function formatPercent(value) {
  return `${(value * 100).toFixed(1)}%`;
}

/**
 * Color-code severity
 */
function colorSeverity(severity) {
  switch (severity) {
    case 'critical': return `${colors.red}${severity}${colors.reset}`;
    case 'warning': return `${colors.yellow}${severity}${colors.reset}`;
    case 'info': return `${colors.blue}${severity}${colors.reset}`;
    default: return severity;
  }
}

/**
 * Color-code performance score
 */
function colorScore(score) {
  if (score >= 90) return `${colors.green}${score}${colors.reset}`;
  if (score >= 70) return `${colors.yellow}${score}${colors.reset}`;
  return `${colors.red}${score}${colors.reset}`;
}

/**
 * Print section header
 */
function printHeader(text) {
  console.log(`\n${colors.bright}${colors.cyan}${text}${colors.reset}`);
  console.log('='.repeat(text.length));
}

/**
 * Print subheader
 */
function printSubheader(text) {
  console.log(`\n${colors.bright}${text}${colors.reset}`);
}

/**
 * Generate detailed report for an agent
 */
function generateReport(agentName, options = {}) {
  const profiler = AgentProfiler.getInstance();
  const timeRange = options.time || '24h';
  const format = options.format || 'console';

  const report = profiler.generateReport(agentName, { timeRange });

  if (format === 'json') {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  if (format === 'markdown') {
    console.log(generateMarkdownReport(report));
    return;
  }

  // Console format (default)
  printHeader(`Performance Report: ${agentName}`);

  // Overview
  console.log(`\nTime Range: ${colors.cyan}${timeRange}${colors.reset}`);
  console.log(`Total Executions: ${colors.cyan}${report.profileCount}${colors.reset}`);
  console.log(`Performance Score: ${colorScore(report.statistics.performance.avgScore)}/100`);

  // Duration statistics
  printSubheader('Execution Time');
  console.log(`  Average: ${colors.cyan}${formatDuration(report.statistics.duration.avg)}${colors.reset}`);
  console.log(`  Median (P50): ${formatDuration(report.statistics.duration.p50)}`);
  console.log(`  P95: ${formatDuration(report.statistics.duration.p95)}`);
  console.log(`  P99: ${formatDuration(report.statistics.duration.p99)}`);
  console.log(`  Min: ${colors.green}${formatDuration(report.statistics.duration.min)}${colors.reset}`);
  console.log(`  Max: ${colors.red}${formatDuration(report.statistics.duration.max)}${colors.reset}`);

  // Memory statistics
  printSubheader('Memory Usage');
  console.log(`  Average Delta: ${colors.cyan}${formatMemory(report.statistics.memory.avgDelta)}${colors.reset}`);
  console.log(`  Max Delta: ${colors.red}${formatMemory(report.statistics.memory.maxDelta)}${colors.reset}`);
  console.log(`  Min Delta: ${colors.green}${formatMemory(report.statistics.memory.minDelta)}${colors.reset}`);

  // Regressions
  if (report.regressions && report.regressions.length > 0) {
    printSubheader('⚠️  Performance Regressions Detected');
    report.regressions.forEach((reg, idx) => {
      console.log(`\n${idx + 1}. ${colorSeverity(reg.severity)} - ${reg.message}`);
      if (reg.type === 'duration_regression') {
        console.log(`   Baseline: ${formatDuration(reg.baseline)}`);
        console.log(`   Current: ${formatDuration(reg.current)}`);
        console.log(`   Change: ${colors.red}+${formatPercent(reg.change)}${colors.reset}`);
      } else if (reg.type === 'memory_regression') {
        console.log(`   Baseline: ${formatMemory(reg.baseline)}`);
        console.log(`   Current: ${formatMemory(reg.current)}`);
        console.log(`   Change: ${colors.red}+${formatPercent(reg.change)}${colors.reset}`);
      }
    });
  }

  // Top bottlenecks
  if (report.topBottlenecks && report.topBottlenecks.length > 0) {
    printSubheader('🐌 Top Performance Bottlenecks');
    report.topBottlenecks.forEach((bottleneck, idx) => {
      console.log(`\n${idx + 1}. ${colorSeverity(bottleneck.severity)} - ${bottleneck.label}`);
      console.log(`   Duration: ${formatDuration(bottleneck.duration)}`);
      console.log(`   % of Total: ${colors.yellow}${bottleneck.percentOfTotal.toFixed(1)}%${colors.reset}`);
      console.log(`   Occurrences: ${bottleneck.count}x`);
    });
  }

  // Top recommendations
  if (report.topRecommendations && report.topRecommendations.length > 0) {
    printSubheader('💡 Optimization Recommendations');
    report.topRecommendations.forEach((rec, idx) => {
      console.log(`\n${idx + 1}. [${rec.priority.toUpperCase()}] ${rec.title}`);
      console.log(`   ${colors.dim}${rec.description}${colors.reset}`);
      if (rec.suggestions && rec.suggestions.length > 0) {
        console.log(`   ${colors.dim}Suggestions:${colors.reset}`);
        rec.suggestions.slice(0, 3).forEach(sugg => {
          console.log(`     • ${sugg}`);
        });
      }
      console.log(`   Occurrences: ${rec.count}x`);
    });
  }

  console.log(''); // Empty line at end
}

/**
 * Generate markdown report
 */
function generateMarkdownReport(report) {
  const lines = [];

  lines.push(`# Performance Report: ${report.agentName}\n`);
  lines.push(`**Time Range:** ${report.timeRange || 'N/A'}`);
  lines.push(`**Total Executions:** ${report.profileCount}`);
  lines.push(`**Performance Score:** ${report.statistics.performance.avgScore}/100\n`);

  // Duration statistics
  lines.push(`## Execution Time\n`);
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Average | ${formatDuration(report.statistics.duration.avg)} |`);
  lines.push(`| Median (P50) | ${formatDuration(report.statistics.duration.p50)} |`);
  lines.push(`| P95 | ${formatDuration(report.statistics.duration.p95)} |`);
  lines.push(`| P99 | ${formatDuration(report.statistics.duration.p99)} |`);
  lines.push(`| Min | ${formatDuration(report.statistics.duration.min)} |`);
  lines.push(`| Max | ${formatDuration(report.statistics.duration.max)} |\n`);

  // Memory statistics
  lines.push(`## Memory Usage\n`);
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Average Delta | ${formatMemory(report.statistics.memory.avgDelta)} |`);
  lines.push(`| Max Delta | ${formatMemory(report.statistics.memory.maxDelta)} |`);
  lines.push(`| Min Delta | ${formatMemory(report.statistics.memory.minDelta)} |\n`);

  // Regressions
  if (report.regressions && report.regressions.length > 0) {
    lines.push(`## ⚠️ Performance Regressions\n`);
    report.regressions.forEach((reg, idx) => {
      lines.push(`### ${idx + 1}. ${reg.severity.toUpperCase()} - ${reg.message}\n`);
      if (reg.type === 'duration_regression') {
        lines.push(`- **Baseline:** ${formatDuration(reg.baseline)}`);
        lines.push(`- **Current:** ${formatDuration(reg.current)}`);
        lines.push(`- **Change:** +${formatPercent(reg.change)}\n`);
      } else if (reg.type === 'memory_regression') {
        lines.push(`- **Baseline:** ${formatMemory(reg.baseline)}`);
        lines.push(`- **Current:** ${formatMemory(reg.current)}`);
        lines.push(`- **Change:** +${formatPercent(reg.change)}\n`);
      }
    });
  }

  // Top bottlenecks
  if (report.topBottlenecks && report.topBottlenecks.length > 0) {
    lines.push(`## 🐌 Top Performance Bottlenecks\n`);
    report.topBottlenecks.forEach((bottleneck, idx) => {
      lines.push(`### ${idx + 1}. ${bottleneck.severity.toUpperCase()} - ${bottleneck.label}\n`);
      lines.push(`- **Duration:** ${formatDuration(bottleneck.duration)}`);
      lines.push(`- **% of Total:** ${bottleneck.percentOfTotal.toFixed(1)}%`);
      lines.push(`- **Occurrences:** ${bottleneck.count}x\n`);
    });
  }

  // Top recommendations
  if (report.topRecommendations && report.topRecommendations.length > 0) {
    lines.push(`## 💡 Optimization Recommendations\n`);
    report.topRecommendations.forEach((rec, idx) => {
      lines.push(`### ${idx + 1}. [${rec.priority.toUpperCase()}] ${rec.title}\n`);
      lines.push(`${rec.description}\n`);
      if (rec.suggestions && rec.suggestions.length > 0) {
        lines.push(`**Suggestions:**\n`);
        rec.suggestions.forEach(sugg => {
          lines.push(`- ${sugg}`);
        });
        lines.push('');
      }
      lines.push(`**Occurrences:** ${rec.count}x\n`);
    });
  }

  return lines.join('\n');
}

/**
 * Generate HTML report
 */
function generateHtmlReport(report) {
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Performance Report: ${report.agentName}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 40px; background: #f5f5f5; }
    .container { max-width: 1200px; margin: 0 auto; background: white; padding: 40px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    h1 { color: #333; border-bottom: 3px solid #0066cc; padding-bottom: 10px; }
    h2 { color: #0066cc; margin-top: 30px; }
    h3 { color: #555; margin-top: 20px; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
    th { background: #f0f0f0; font-weight: 600; }
    .metric-value { font-weight: 600; color: #0066cc; }
    .severity-critical { color: #d32f2f; font-weight: 600; }
    .severity-warning { color: #f57c00; font-weight: 600; }
    .severity-info { color: #0288d1; font-weight: 600; }
    .score { font-size: 48px; font-weight: 700; margin: 20px 0; }
    .score.good { color: #4caf50; }
    .score.warning { color: #ff9800; }
    .score.poor { color: #f44336; }
    .overview { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin: 20px 0; }
    .overview-card { background: #f9f9f9; padding: 20px; border-radius: 4px; }
    .overview-card .label { color: #666; font-size: 14px; margin-bottom: 8px; }
    .overview-card .value { font-size: 24px; font-weight: 600; color: #333; }
    .recommendation { background: #fff3cd; border-left: 4px solid #ff9800; padding: 15px; margin: 10px 0; }
    .recommendation.high { border-left-color: #d32f2f; background: #ffebee; }
    .bottleneck { background: #fff3e0; border-left: 4px solid #ff9800; padding: 15px; margin: 10px 0; }
    .bottleneck.critical { border-left-color: #d32f2f; background: #ffebee; }
    ul { margin: 10px 0; padding-left: 20px; }
    li { margin: 5px 0; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Performance Report: ${report.agentName}</h1>

    <div class="overview">
      <div class="overview-card">
        <div class="label">Total Executions</div>
        <div class="value">${report.profileCount}</div>
      </div>
      <div class="overview-card">
        <div class="label">Performance Score</div>
        <div class="value score ${report.statistics.performance.avgScore >= 90 ? 'good' : report.statistics.performance.avgScore >= 70 ? 'warning' : 'poor'}">
          ${report.statistics.performance.avgScore}/100
        </div>
      </div>
      <div class="overview-card">
        <div class="label">Average Duration</div>
        <div class="value">${formatDuration(report.statistics.duration.avg)}</div>
      </div>
      <div class="overview-card">
        <div class="label">Memory Delta (Avg)</div>
        <div class="value">${formatMemory(report.statistics.memory.avgDelta)}</div>
      </div>
    </div>

    <h2>Execution Time</h2>
    <table>
      <tr><th>Metric</th><th>Value</th></tr>
      <tr><td>Average</td><td class="metric-value">${formatDuration(report.statistics.duration.avg)}</td></tr>
      <tr><td>Median (P50)</td><td class="metric-value">${formatDuration(report.statistics.duration.p50)}</td></tr>
      <tr><td>P95</td><td class="metric-value">${formatDuration(report.statistics.duration.p95)}</td></tr>
      <tr><td>P99</td><td class="metric-value">${formatDuration(report.statistics.duration.p99)}</td></tr>
      <tr><td>Min</td><td class="metric-value">${formatDuration(report.statistics.duration.min)}</td></tr>
      <tr><td>Max</td><td class="metric-value">${formatDuration(report.statistics.duration.max)}</td></tr>
    </table>

    <h2>Memory Usage</h2>
    <table>
      <tr><th>Metric</th><th>Value</th></tr>
      <tr><td>Average Delta</td><td class="metric-value">${formatMemory(report.statistics.memory.avgDelta)}</td></tr>
      <tr><td>Max Delta</td><td class="metric-value">${formatMemory(report.statistics.memory.maxDelta)}</td></tr>
      <tr><td>Min Delta</td><td class="metric-value">${formatMemory(report.statistics.memory.minDelta)}</td></tr>
    </table>

    ${report.regressions && report.regressions.length > 0 ? `
      <h2>⚠️ Performance Regressions</h2>
      ${report.regressions.map((reg, idx) => `
        <div class="bottleneck ${reg.severity}">
          <h3>${idx + 1}. <span class="severity-${reg.severity}">${reg.severity.toUpperCase()}</span> - ${reg.message}</h3>
          ${reg.type === 'duration_regression' ? `
            <ul>
              <li><strong>Baseline:</strong> ${formatDuration(reg.baseline)}</li>
              <li><strong>Current:</strong> ${formatDuration(reg.current)}</li>
              <li><strong>Change:</strong> <span class="severity-critical">+${formatPercent(reg.change)}</span></li>
            </ul>
          ` : reg.type === 'memory_regression' ? `
            <ul>
              <li><strong>Baseline:</strong> ${formatMemory(reg.baseline)}</li>
              <li><strong>Current:</strong> ${formatMemory(reg.current)}</li>
              <li><strong>Change:</strong> <span class="severity-critical">+${formatPercent(reg.change)}</span></li>
            </ul>
          ` : ''}
        </div>
      `).join('')}
    ` : ''}

    ${report.topBottlenecks && report.topBottlenecks.length > 0 ? `
      <h2>🐌 Top Performance Bottlenecks</h2>
      ${report.topBottlenecks.map((bottleneck, idx) => `
        <div class="bottleneck ${bottleneck.severity}">
          <h3>${idx + 1}. <span class="severity-${bottleneck.severity}">${bottleneck.severity.toUpperCase()}</span> - ${bottleneck.label}</h3>
          <ul>
            <li><strong>Duration:</strong> ${formatDuration(bottleneck.duration)}</li>
            <li><strong>% of Total:</strong> ${bottleneck.percentOfTotal.toFixed(1)}%</li>
            <li><strong>Occurrences:</strong> ${bottleneck.count}x</li>
          </ul>
        </div>
      `).join('')}
    ` : ''}

    ${report.topRecommendations && report.topRecommendations.length > 0 ? `
      <h2>💡 Optimization Recommendations</h2>
      ${report.topRecommendations.map((rec, idx) => `
        <div class="recommendation ${rec.priority}">
          <h3>${idx + 1}. [${rec.priority.toUpperCase()}] ${rec.title}</h3>
          <p>${rec.description}</p>
          ${rec.suggestions && rec.suggestions.length > 0 ? `
            <p><strong>Suggestions:</strong></p>
            <ul>
              ${rec.suggestions.map(sugg => `<li>${sugg}</li>`).join('')}
            </ul>
          ` : ''}
          <p><strong>Occurrences:</strong> ${rec.count}x</p>
        </div>
      `).join('')}
    ` : ''}
  </div>
</body>
</html>
  `;

  return html;
}

/**
 * Compare two agents
 */
function compareAgents(agentA, agentB, options = {}) {
  const profiler = AgentProfiler.getInstance();
  const timeRange = options.time || '24h';
  const format = options.format || 'console';

  const comparison = profiler.compareAgents(agentA, agentB, timeRange);

  if (format === 'json') {
    console.log(JSON.stringify(comparison, null, 2));
    return;
  }

  // Console format
  printHeader(`Agent Comparison: ${agentA} vs ${agentB}`);

  console.log(`\nTime Range: ${colors.cyan}${timeRange}${colors.reset}`);

  // Duration comparison
  printSubheader('Execution Time Comparison');
  console.log(`\n${agentA}:`);
  console.log(`  Average: ${formatDuration(comparison.agentA.duration.avg)}`);
  console.log(`  P95: ${formatDuration(comparison.agentA.duration.p95)}`);

  console.log(`\n${agentB}:`);
  console.log(`  Average: ${formatDuration(comparison.agentB.duration.avg)}`);
  console.log(`  P95: ${formatDuration(comparison.agentB.duration.p95)}`);

  const durationDiff = comparison.agentB.duration.avg - comparison.agentA.duration.avg;
  const durationDiffPercent = (durationDiff / comparison.agentA.duration.avg) * 100;

  console.log(`\nDifference: ${durationDiff > 0 ? colors.red : colors.green}${formatDuration(Math.abs(durationDiff))} (${durationDiffPercent.toFixed(1)}%)${colors.reset}`);
  if (durationDiff > 0) {
    console.log(`${colors.green}${agentA} is faster${colors.reset}`);
  } else {
    console.log(`${colors.green}${agentB} is faster${colors.reset}`);
  }

  // Memory comparison
  printSubheader('Memory Usage Comparison');
  console.log(`\n${agentA}: ${formatMemory(comparison.agentA.memory.avgDelta)}`);
  console.log(`${agentB}: ${formatMemory(comparison.agentB.memory.avgDelta)}`);

  const memoryDiff = comparison.agentB.memory.avgDelta - comparison.agentA.memory.avgDelta;
  const memoryDiffPercent = (memoryDiff / comparison.agentA.memory.avgDelta) * 100;

  console.log(`\nDifference: ${memoryDiff > 0 ? colors.red : colors.green}${formatMemory(Math.abs(memoryDiff))} (${memoryDiffPercent.toFixed(1)}%)${colors.reset}`);
  if (memoryDiff > 0) {
    console.log(`${colors.green}${agentA} uses less memory${colors.reset}`);
  } else {
    console.log(`${colors.green}${agentB} uses less memory${colors.reset}`);
  }

  // Performance score comparison
  printSubheader('Performance Score Comparison');
  console.log(`\n${agentA}: ${colorScore(comparison.agentA.performance.avgScore)}/100`);
  console.log(`${agentB}: ${colorScore(comparison.agentB.performance.avgScore)}/100`);

  const scoreDiff = comparison.agentB.performance.avgScore - comparison.agentA.performance.avgScore;
  console.log(`\nDifference: ${scoreDiff > 0 ? colors.green : colors.red}${scoreDiff > 0 ? '+' : ''}${scoreDiff.toFixed(1)} points${colors.reset}`);

  console.log('');
}

/**
 * List all agents with profile data
 */
function listAgents(options = {}) {
  const profiler = AgentProfiler.getInstance();
  const timeRange = options.time || '24h';

  const agentList = profiler.listAgents(timeRange);

  if (options.format === 'json') {
    console.log(JSON.stringify(agentList, null, 2));
    return;
  }

  printHeader(`Profiled Agents (${timeRange})`);

  console.log(`\nTotal Agents: ${colors.cyan}${agentList.length}${colors.reset}\n`);

  if (agentList.length === 0) {
    console.log(`${colors.dim}No agents have been profiled in the last ${timeRange}${colors.reset}`);
    return;
  }

  // Sort by execution count
  agentList.sort((a, b) => b.executionCount - a.executionCount);

  console.log(`${'Agent Name'.padEnd(40)} ${'Executions'.padEnd(12)} ${'Avg Duration'.padEnd(15)} ${'Score'.padEnd(8)}`);
  console.log('-'.repeat(80));

  agentList.forEach(agent => {
    const name = agent.name.padEnd(40);
    const executions = agent.executionCount.toString().padEnd(12);
    const duration = formatDuration(agent.avgDuration).padEnd(15);
    const score = `${colorScore(agent.avgScore)}/100`;

    console.log(`${name} ${executions} ${duration} ${score}`);
  });

  console.log('');
}

/**
 * Export report to file
 */
function exportReport(agentName, options = {}) {
  const profiler = AgentProfiler.getInstance();
  const timeRange = options.time || '24h';
  const format = options.format || 'markdown';
  const outputPath = options.output || `./${agentName}-profile-report.${format === 'html' ? 'html' : format === 'json' ? 'json' : 'md'}`;

  const report = profiler.generateReport(agentName, { timeRange });

  let content;
  if (format === 'json') {
    content = JSON.stringify(report, null, 2);
  } else if (format === 'markdown') {
    content = generateMarkdownReport(report);
  } else if (format === 'html') {
    content = generateHtmlReport(report);
  } else {
    console.error(`${colors.red}Error: Unknown format "${format}". Use: json, markdown, or html${colors.reset}`);
    process.exit(1);
  }

  fs.writeFileSync(outputPath, content, 'utf-8');
  console.log(`${colors.green}✓${colors.reset} Report exported to: ${colors.cyan}${outputPath}${colors.reset}`);
}

/**
 * Show performance trends
 */
function showTrends(agentName, options = {}) {
  const profiler = AgentProfiler.getInstance();
  const format = options.format || 'console';

  const trends = profiler.analyzeTrends(agentName);

  if (format === 'json') {
    console.log(JSON.stringify(trends, null, 2));
    return;
  }

  printHeader(`Performance Trends: ${agentName}`);

  // Duration trend
  printSubheader('Execution Time Trend');
  console.log(`\nLast Hour:`);
  console.log(`  Average: ${formatDuration(trends.duration.lastHour.avg)}`);
  console.log(`  P95: ${formatDuration(trends.duration.lastHour.p95)}`);

  console.log(`\nLast 24 Hours:`);
  console.log(`  Average: ${formatDuration(trends.duration.last24h.avg)}`);
  console.log(`  P95: ${formatDuration(trends.duration.last24h.p95)}`);

  console.log(`\nLast 7 Days:`);
  console.log(`  Average: ${formatDuration(trends.duration.last7d.avg)}`);
  console.log(`  P95: ${formatDuration(trends.duration.last7d.p95)}`);

  // Trend direction
  const hourTo24h = ((trends.duration.last24h.avg - trends.duration.lastHour.avg) / trends.duration.lastHour.avg) * 100;
  const dayTo7d = ((trends.duration.last7d.avg - trends.duration.last24h.avg) / trends.duration.last24h.avg) * 100;

  console.log(`\nTrend (1h → 24h): ${hourTo24h > 5 ? colors.red : hourTo24h < -5 ? colors.green : colors.yellow}${hourTo24h > 0 ? '+' : ''}${hourTo24h.toFixed(1)}%${colors.reset}`);
  console.log(`Trend (24h → 7d): ${dayTo7d > 5 ? colors.red : dayTo7d < -5 ? colors.green : colors.yellow}${dayTo7d > 0 ? '+' : ''}${dayTo7d.toFixed(1)}%${colors.reset}`);

  // Memory trend
  printSubheader('Memory Usage Trend');
  console.log(`\nLast Hour: ${formatMemory(trends.memory.lastHour.avgDelta)}`);
  console.log(`Last 24 Hours: ${formatMemory(trends.memory.last24h.avgDelta)}`);
  console.log(`Last 7 Days: ${formatMemory(trends.memory.last7d.avgDelta)}`);

  console.log('');
}

/**
 * Print usage information
 */
function printUsage() {
  console.log(`
${colors.bright}Agent Performance Profiler CLI${colors.reset}

${colors.bright}Usage:${colors.reset}
  node agent-profiler-cli.js <command> [options]

${colors.bright}Commands:${colors.reset}
  ${colors.cyan}report <agent-name>${colors.reset}     Generate performance report for an agent
  ${colors.cyan}compare <agent-a> <agent-b>${colors.reset}  Compare two agents
  ${colors.cyan}list${colors.reset}                    List all profiled agents
  ${colors.cyan}export <agent-name>${colors.reset}     Export report to file
  ${colors.cyan}trends <agent-name>${colors.reset}     Show performance trends over time

${colors.bright}Options:${colors.reset}
  ${colors.cyan}--time <range>${colors.reset}          Time range (1h, 24h, 7d, 30d) [default: 24h]
  ${colors.cyan}--format <format>${colors.reset}       Output format (console, json, markdown, html) [default: console]
  ${colors.cyan}--output <path>${colors.reset}         Output file path (for export command)

${colors.bright}Examples:${colors.reset}
  # Generate console report for last 24 hours
  node agent-profiler-cli.js report sfdc-merge-orchestrator

  # Generate JSON report for last 7 days
  node agent-profiler-cli.js report sfdc-merge-orchestrator --time 7d --format json

  # Compare two agents
  node agent-profiler-cli.js compare sfdc-merge-orchestrator sfdc-conflict-resolver

  # List all profiled agents
  node agent-profiler-cli.js list

  # Export HTML report
  node agent-profiler-cli.js export sfdc-merge-orchestrator --format html --output report.html

  # Show performance trends
  node agent-profiler-cli.js trends sfdc-merge-orchestrator
  `);
}

/**
 * Main CLI entry point
 */
function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    printUsage();
    process.exit(0);
  }

  const command = args[0];
  const options = {};

  // Parse options
  for (let i = 1; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].substring(2);
      const value = args[i + 1];
      options[key] = value;
      i++; // Skip next arg
    }
  }

  try {
    switch (command) {
      case 'report':
        if (args.length < 2) {
          console.error(`${colors.red}Error: Missing agent name${colors.reset}`);
          console.log(`Usage: node agent-profiler-cli.js report <agent-name> [options]`);
          process.exit(1);
        }
        generateReport(args[1], options);
        break;

      case 'compare':
        if (args.length < 3) {
          console.error(`${colors.red}Error: Missing agent names${colors.reset}`);
          console.log(`Usage: node agent-profiler-cli.js compare <agent-a> <agent-b> [options]`);
          process.exit(1);
        }
        compareAgents(args[1], args[2], options);
        break;

      case 'list':
        listAgents(options);
        break;

      case 'export':
        if (args.length < 2) {
          console.error(`${colors.red}Error: Missing agent name${colors.reset}`);
          console.log(`Usage: node agent-profiler-cli.js export <agent-name> [options]`);
          process.exit(1);
        }
        exportReport(args[1], options);
        break;

      case 'trends':
        if (args.length < 2) {
          console.error(`${colors.red}Error: Missing agent name${colors.reset}`);
          console.log(`Usage: node agent-profiler-cli.js trends <agent-name> [options]`);
          process.exit(1);
        }
        showTrends(args[1], options);
        break;

      case 'help':
      case '--help':
      case '-h':
        printUsage();
        break;

      default:
        console.error(`${colors.red}Error: Unknown command "${command}"${colors.reset}\n`);
        printUsage();
        process.exit(1);
    }
  } catch (error) {
    console.error(`${colors.red}Error: ${error.message}${colors.reset}`);
    if (options.verbose) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run CLI if executed directly
if (require.main === module) {
  main();
}

module.exports = {
  generateReport,
  compareAgents,
  listAgents,
  exportReport,
  showTrends,
  formatDuration,
  formatMemory,
  formatPercent
};
