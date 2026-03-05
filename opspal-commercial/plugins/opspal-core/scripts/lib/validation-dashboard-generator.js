#!/usr/bin/env node
/**
 * Validation Dashboard Generator
 *
 * Generates interactive web dashboards showing validation statistics,
 * error trends, and remediation progress using the web-viz infrastructure.
 *
 * Uses RevPal dashboard theme for consistent styling.
 *
 * @module validation-dashboard-generator
 * @version 1.0.0
 * @created 2026-01-06
 */

const fs = require('fs');
const path = require('path');

const SEVERITY = {
  CRITICAL: 'CRITICAL',
  HIGH: 'HIGH',
  WARNING: 'WARNING',
  INFO: 'INFO'
};

/**
 * Validation Dashboard Generator
 *
 * Reads validation logs and generates interactive dashboards with:
 * - KPI cards (pass rate, avg time, total validations)
 * - Stage performance bar charts
 * - Error trend line charts
 * - Top issues table
 * - Remediation progress pie chart
 */
class ValidationDashboardGenerator {
  constructor(options = {}) {
    this.verbose = options.verbose || false;
    this.logsDir = options.logsDir || path.join(process.env.HOME, '.claude', 'validation-logs');
    this.outputDir = options.outputDir || './reports';
    this.theme = options.theme || 'revpal';

    // Ensure logs directory exists
    if (!fs.existsSync(this.logsDir)) {
      fs.mkdirSync(this.logsDir, { recursive: true });
    }

    // Ensure output directory exists
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }

    this.log('Validation Dashboard Generator initialized');
  }

  log(message) {
    if (this.verbose) {
      console.log(`[ValidationDashboard] ${message}`);
    }
  }

  /**
   * Generate dashboard from validation logs
   *
   * @param {Object} options - Generation options
   * @param {number} options.days - Number of days to include (default: 30)
   * @param {string} options.output - Output file path
   * @returns {Promise<Object>} Generation result
   */
  async generate(options = {}) {
    const days = options.days || 30;
    const outputPath = options.output || path.join(this.outputDir, 'validation-dashboard.html');

    this.log(`Generating dashboard for last ${days} days`);

    // Load validation logs
    const logs = await this.loadLogs(days);

    if (logs.length === 0) {
      this.log('No validation logs found');
      return {
        success: false,
        message: 'No validation logs found',
        logsDir: this.logsDir
      };
    }

    // Aggregate statistics
    const stats = this.aggregateStats(logs);

    // Create dashboard components
    const components = this.createComponents(stats, days);

    // Generate HTML
    const html = this.generateHTML(components, stats, days);

    // Write to file
    fs.writeFileSync(outputPath, html, 'utf8');

    this.log(`Dashboard generated: ${outputPath}`);

    return {
      success: true,
      outputPath,
      stats,
      logsAnalyzed: logs.length
    };
  }

  /**
   * Load validation logs from the last N days
   */
  async loadLogs(days) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const logs = [];
    const logFiles = fs.readdirSync(this.logsDir).filter(f => f.endsWith('.jsonl'));

    for (const file of logFiles) {
      const filePath = path.join(this.logsDir, file);
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.trim().split('\n').filter(l => l.trim());

      for (const line of lines) {
        try {
          const log = JSON.parse(line);
          const logDate = new Date(log.timestamp || log.date);

          if (logDate >= cutoffDate) {
            logs.push(log);
          }
        } catch (e) {
          // Skip invalid JSON lines
        }
      }
    }

    // Sort by timestamp
    logs.sort((a, b) => {
      const dateA = new Date(a.timestamp || a.date);
      const dateB = new Date(b.timestamp || b.date);
      return dateA - dateB;
    });

    return logs;
  }

  /**
   * Aggregate statistics from logs
   */
  aggregateStats(logs) {
    const stats = {
      total: logs.length,
      passed: 0,
      failed: 0,
      blocked: 0,
      avgTime: 0,
      byStage: {},
      bySeverity: { CRITICAL: 0, HIGH: 0, WARNING: 0, INFO: 0 },
      errorsByType: {},
      topIssues: [],
      trendData: []
    };

    let totalTime = 0;

    // Process each log
    logs.forEach(log => {
      // Count pass/fail/blocked
      if (log.valid) stats.passed++;
      if (!log.valid) stats.failed++;
      if (log.blocked) stats.blocked++;

      // Accumulate time
      totalTime += log.validationTime || 0;

      // Count by stage
      if (log.stages) {
        Object.entries(log.stages).forEach(([stage, result]) => {
          if (!stats.byStage[stage]) {
            stats.byStage[stage] = { validations: 0, passed: 0, failed: 0, avgTime: 0, totalTime: 0 };
          }
          stats.byStage[stage].validations++;
          if (result.valid) stats.byStage[stage].passed++;
          else stats.byStage[stage].failed++;

          const stageTime = result.validationTime || 0;
          stats.byStage[stage].totalTime += stageTime;
          stats.byStage[stage].avgTime = stats.byStage[stage].totalTime / stats.byStage[stage].validations;
        });
      }

      // Count by severity
      if (log.errors) {
        log.errors.forEach(error => {
          const severity = error.severity || 'INFO';
          stats.bySeverity[severity]++;

          // Count by error type
          const type = error.type || 'unknown';
          if (!stats.errorsByType[type]) {
            stats.errorsByType[type] = {
              count: 0,
              severity,
              message: error.message || type,
              stage: error.stage
            };
          }
          stats.errorsByType[type].count++;
        });
      }
    });

    // Calculate average time
    stats.avgTime = logs.length > 0 ? totalTime / logs.length : 0;

    // Calculate pass rate
    stats.passRate = logs.length > 0 ? (stats.passed / logs.length * 100).toFixed(1) : 0;
    stats.blockRate = logs.length > 0 ? (stats.blocked / logs.length * 100).toFixed(1) : 0;

    // Generate trend data (group by day)
    stats.trendData = this.generateTrendData(logs);

    // Get top issues (sorted by count)
    stats.topIssues = Object.entries(stats.errorsByType)
      .map(([type, data]) => ({ type, ...data }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return stats;
  }

  /**
   * Generate trend data grouped by day
   */
  generateTrendData(logs) {
    const trendMap = {};

    logs.forEach(log => {
      const date = new Date(log.timestamp || log.date);
      const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD

      if (!trendMap[dateStr]) {
        trendMap[dateStr] = {
          date: dateStr,
          total: 0,
          passed: 0,
          failed: 0,
          blocked: 0,
          errors: 0
        };
      }

      trendMap[dateStr].total++;
      if (log.valid) trendMap[dateStr].passed++;
      if (!log.valid) trendMap[dateStr].failed++;
      if (log.blocked) trendMap[dateStr].blocked++;
      trendMap[dateStr].errors += (log.errors || []).length;
    });

    // Convert to array and sort by date
    return Object.values(trendMap).sort((a, b) => a.date.localeCompare(b.date));
  }

  /**
   * Create dashboard components
   */
  createComponents(stats, days) {
    const components = [];

    // KPI Cards
    components.push({
      type: 'kpi-card',
      data: {
        value: stats.total,
        label: 'Total Validations',
        trend: null,
        unit: 'validations'
      }
    });

    components.push({
      type: 'kpi-card',
      data: {
        value: stats.passRate,
        label: 'Pass Rate',
        trend: stats.passRate >= 95 ? 'up' : 'down',
        unit: '%',
        status: stats.passRate >= 95 ? 'success' : stats.passRate >= 80 ? 'warning' : 'error'
      }
    });

    components.push({
      type: 'kpi-card',
      data: {
        value: stats.avgTime.toFixed(0),
        label: 'Avg Validation Time',
        trend: stats.avgTime < 100 ? 'down' : 'up',
        unit: 'ms',
        status: stats.avgTime < 100 ? 'success' : stats.avgTime < 300 ? 'warning' : 'error'
      }
    });

    components.push({
      type: 'kpi-card',
      data: {
        value: stats.blockRate,
        label: 'Block Rate',
        trend: stats.blockRate > 5 ? 'up' : 'down',
        unit: '%',
        status: stats.blockRate < 5 ? 'success' : stats.blockRate < 15 ? 'warning' : 'error'
      }
    });

    // Stage Performance Bar Chart
    const stageData = Object.entries(stats.byStage).map(([stage, data]) => ({
      label: stage,
      passed: data.passed,
      failed: data.failed,
      total: data.validations
    }));

    components.push({
      type: 'chart',
      chartType: 'bar',
      title: 'Validation Performance by Stage',
      data: {
        labels: stageData.map(d => d.label),
        datasets: [
          {
            label: 'Passed',
            data: stageData.map(d => d.passed),
            backgroundColor: '#6FBF73'
          },
          {
            label: 'Failed',
            data: stageData.map(d => d.failed),
            backgroundColor: '#E99560'
          }
        ]
      }
    });

    // Error Trend Line Chart
    components.push({
      type: 'chart',
      chartType: 'line',
      title: `Error Trends (Last ${days} Days)`,
      data: {
        labels: stats.trendData.map(d => d.date),
        datasets: [
          {
            label: 'Total Errors',
            data: stats.trendData.map(d => d.errors),
            borderColor: '#5F3B8C',
            backgroundColor: 'rgba(95, 59, 140, 0.1)',
            fill: true
          },
          {
            label: 'Blocked',
            data: stats.trendData.map(d => d.blocked),
            borderColor: '#E99560',
            backgroundColor: 'rgba(233, 149, 96, 0.1)',
            fill: true
          }
        ]
      }
    });

    // Severity Distribution Pie Chart
    const severityData = [
      { label: 'Critical', value: stats.bySeverity.CRITICAL, color: '#E99560' },
      { label: 'High', value: stats.bySeverity.HIGH, color: '#F4C542' },
      { label: 'Warning', value: stats.bySeverity.WARNING, color: '#6FBF73' },
      { label: 'Info', value: stats.bySeverity.INFO, color: '#3E4A61' }
    ].filter(d => d.value > 0);

    components.push({
      type: 'chart',
      chartType: 'doughnut',
      title: 'Errors by Severity',
      data: {
        labels: severityData.map(d => d.label),
        datasets: [{
          data: severityData.map(d => d.value),
          backgroundColor: severityData.map(d => d.color)
        }]
      }
    });

    // Top Issues Table
    components.push({
      type: 'table',
      title: 'Top Issues (Last 30 Days)',
      data: {
        headers: ['Issue Type', 'Count', 'Severity', 'Stage', 'Message'],
        rows: stats.topIssues.map(issue => [
          issue.type,
          issue.count,
          issue.severity,
          issue.stage || 'N/A',
          issue.message.substring(0, 60) + (issue.message.length > 60 ? '...' : '')
        ])
      }
    });

    return components;
  }

  /**
   * Generate HTML dashboard
   */
  generateHTML(components, stats, days) {
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Validation Dashboard - Last ${days} Days</title>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Montserrat:wght@500;600;700;800&family=Figtree:wght@400;500;600&display=swap">
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
  <style>
    /* RevPal Dashboard Theme */
    :root {
      --brand-grape: #5F3B8C;
      --brand-indigo: #3E4A61;
      --brand-apricot: #E99560;
      --brand-sand: #EAE4DC;
      --brand-green: #6FBF73;
      --brand-yellow: #F4C542;
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Figtree', sans-serif;
      background: var(--brand-sand);
      color: var(--brand-indigo);
      line-height: 1.6;
    }

    .dashboard-container {
      max-width: 1440px;
      margin: 0 auto;
      padding: 2rem;
    }

    .dashboard-header {
      background: white;
      padding: 2rem;
      border-radius: 8px;
      margin-bottom: 2rem;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      border-left: 4px solid var(--brand-apricot);
    }

    .dashboard-title {
      font-family: 'Montserrat', sans-serif;
      font-size: 2rem;
      font-weight: 700;
      color: var(--brand-grape);
      margin-bottom: 0.5rem;
    }

    .dashboard-description {
      color: var(--brand-indigo);
      font-size: 1rem;
      margin-bottom: 1rem;
    }

    .dashboard-meta {
      display: flex;
      gap: 2rem;
      font-size: 0.875rem;
      color: #666;
    }

    .meta-item {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .dashboard-grid {
      display: grid;
      grid-template-columns: repeat(12, 1fr);
      gap: 1.5rem;
    }

    .viz-component {
      background: white;
      border-radius: 8px;
      padding: 1.5rem;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      transition: transform 0.2s, box-shadow 0.2s;
    }

    .viz-component:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    }

    .viz-kpi {
      grid-column: span 3;
      text-align: center;
    }

    .kpi-value {
      font-family: 'Montserrat', sans-serif;
      font-size: 36px;
      font-weight: 700;
      color: var(--brand-grape);
      margin-bottom: 0.5rem;
    }

    .kpi-label {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #666;
    }

    .kpi-success { color: var(--brand-green); }
    .kpi-warning { color: var(--brand-yellow); }
    .kpi-error { color: var(--brand-apricot); }

    .viz-chart {
      grid-column: span 6;
      min-height: 280px;
    }

    .viz-chart-full {
      grid-column: span 12;
      min-height: 280px;
    }

    .viz-table {
      grid-column: span 12;
    }

    .component-title {
      font-family: 'Montserrat', sans-serif;
      font-size: 1.25rem;
      font-weight: 600;
      color: var(--brand-grape);
      margin-bottom: 1rem;
      padding-bottom: 0.5rem;
      border-bottom: 2px solid var(--brand-apricot);
    }

    table {
      width: 100%;
      border-collapse: collapse;
    }

    thead {
      background: var(--brand-grape);
      color: white;
    }

    th {
      padding: 0.75rem;
      text-align: left;
      font-weight: 600;
    }

    td {
      padding: 0.75rem;
      border-bottom: 1px solid #e0e0e0;
    }

    tbody tr:hover {
      background: var(--brand-sand);
    }

    .severity-critical { color: var(--brand-apricot); font-weight: 600; }
    .severity-high { color: var(--brand-yellow); font-weight: 600; }
    .severity-warning { color: var(--brand-green); }
  </style>
</head>
<body>
  <div class="dashboard-container">
    <header class="dashboard-header">
      <h1 class="dashboard-title">Validation Dashboard</h1>
      <p class="dashboard-description">
        Comprehensive validation statistics and error trends for the last ${days} days
      </p>
      <div class="dashboard-meta">
        <span class="meta-item">
          <strong>Total Validations:</strong> ${stats.total}
        </span>
        <span class="meta-item">
          <strong>Pass Rate:</strong> ${stats.passRate}%
        </span>
        <span class="meta-item">
          <strong>Generated:</strong> ${new Date().toLocaleString()}
        </span>
      </div>
    </header>

    <main class="dashboard-content">
      <div class="dashboard-grid">
        ${this.renderComponents(components)}
      </div>
    </main>
  </div>

  <script>
    // Initialize charts
    ${this.generateChartScripts(components)}
  </script>
</body>
</html>`;

    return html;
  }

  /**
   * Render components HTML
   */
  renderComponents(components) {
    return components.map((comp, index) => {
      if (comp.type === 'kpi-card') {
        const statusClass = comp.data.status ? `kpi-${comp.data.status}` : '';
        return `
          <div class="viz-component viz-kpi">
            <div class="kpi-value ${statusClass}">
              ${comp.data.value}${comp.data.unit || ''}
            </div>
            <div class="kpi-label">${comp.data.label}</div>
          </div>
        `;
      }

      if (comp.type === 'chart') {
        const fullWidth = comp.chartType === 'line';
        return `
          <div class="viz-component ${fullWidth ? 'viz-chart-full' : 'viz-chart'}">
            <h3 class="component-title">${comp.title}</h3>
            <canvas id="chart-${index}"></canvas>
          </div>
        `;
      }

      if (comp.type === 'table') {
        const tableHtml = `
          <div class="viz-component viz-table">
            <h3 class="component-title">${comp.title}</h3>
            <table>
              <thead>
                <tr>
                  ${comp.data.headers.map(h => `<th>${h}</th>`).join('')}
                </tr>
              </thead>
              <tbody>
                ${comp.data.rows.map(row => `
                  <tr>
                    ${row.map((cell, i) => {
                      const isSevertiy = comp.data.headers[i] === 'Severity';
                      const severityClass = isSevertiy ? `severity-${cell.toLowerCase()}` : '';
                      return `<td class="${severityClass}">${cell}</td>`;
                    }).join('')}
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `;
        return tableHtml;
      }

      return '';
    }).join('');
  }

  /**
   * Generate Chart.js initialization scripts
   */
  generateChartScripts(components) {
    return components
      .filter(comp => comp.type === 'chart')
      .map((comp, index) => {
        return `
          new Chart(document.getElementById('chart-${index}'), {
            type: '${comp.chartType}',
            data: ${JSON.stringify(comp.data)},
            options: {
              responsive: true,
              maintainAspectRatio: true,
              plugins: {
                legend: {
                  display: true,
                  position: 'bottom'
                }
              },
              ${comp.chartType === 'bar' ? `
              scales: {
                y: {
                  beginAtZero: true
                }
              }
              ` : ''}
            }
          });
        `;
      })
      .join('\n');
  }
}

module.exports = ValidationDashboardGenerator;

// CLI Interface
if (require.main === module) {
  const generator = new ValidationDashboardGenerator({ verbose: true });
  const command = process.argv[2];

  if (command === 'generate') {
    const daysIndex = process.argv.indexOf('--days');
    const outputIndex = process.argv.indexOf('--output');

    const days = daysIndex > -1 && process.argv[daysIndex + 1]
      ? parseInt(process.argv[daysIndex + 1])
      : 30;

    const output = outputIndex > -1 && process.argv[outputIndex + 1]
      ? process.argv[outputIndex + 1]
      : undefined;

    generator.generate({ days, output })
      .then(result => {
        if (result.success) {
          console.log('\n✅ Dashboard generated successfully');
          console.log(`📊 Logs analyzed: ${result.logsAnalyzed}`);
          console.log(`📁 Output: ${result.outputPath}`);
          console.log(`\n📈 Statistics:`);
          console.log(`   Total validations: ${result.stats.total}`);
          console.log(`   Pass rate: ${result.stats.passRate}%`);
          console.log(`   Avg time: ${result.stats.avgTime.toFixed(0)}ms`);
          process.exit(0);
        } else {
          console.error('\n❌ Dashboard generation failed');
          console.error(`   ${result.message}`);
          console.error(`   Logs directory: ${result.logsDir}`);
          process.exit(1);
        }
      })
      .catch(error => {
        console.error('ERROR:', error.message);
        process.exit(1);
      });

  } else {
    console.log('Commands: generate');
    console.log('');
    console.log('Examples:');
    console.log('  node validation-dashboard-generator.js generate --days 30 --output ./reports/dashboard.html');
    console.log('  node validation-dashboard-generator.js generate --days 7');
  }
}
