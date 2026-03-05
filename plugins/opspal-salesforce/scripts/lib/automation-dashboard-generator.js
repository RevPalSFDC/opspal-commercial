#!/usr/bin/env node
/**
 * Automation Dashboard Generator
 *
 * Generates interactive HTML dashboard for automation audit results.
 * Includes charts, tables, and drill-down views using Chart.js and vanilla JavaScript.
 *
 * Features:
 * - Executive summary cards
 * - Conflict distribution charts
 * - Object hotspot visualization
 * - Sortable/filterable conflict table
 * - Phase breakdown timeline
 * - Risk heat map
 *
 * Usage:
 *   node automation-dashboard-generator.js <audit-directory>
 *
 * Output:
 *   Creates dashboard/index.html in audit directory
 *
 * @version 1.0.0
 * @date 2025-10-08
 */

const fs = require('fs');
const path = require('path');
const { generateFooter } = require('./report-footer-generator');

class AutomationDashboardGenerator {
  constructor(auditDir) {
    this.auditDir = auditDir;
    this.conflictsPath = path.join(auditDir, 'findings/Conflicts.json');
    this.rawDataPath = path.join(auditDir, 'raw/raw_data.json');
    this.metricsPath = path.join(auditDir, 'reports/Metrics_Summary.json');
    this.dashboardDir = path.join(auditDir, 'dashboard');

    // Ensure dashboard directory exists
    if (!fs.existsSync(this.dashboardDir)) {
      fs.mkdirSync(this.dashboardDir, { recursive: true });
    }
  }

  /**
   * Load audit data
   */
  loadData() {
    console.log('Loading audit data for dashboard...');

    this.conflicts = JSON.parse(fs.readFileSync(this.conflictsPath, 'utf8'));
    this.rawData = JSON.parse(fs.readFileSync(this.rawDataPath, 'utf8'));

    // Load metrics if available
    if (fs.existsSync(this.metricsPath)) {
      this.metrics = JSON.parse(fs.readFileSync(this.metricsPath, 'utf8'));
    }

    console.log(`Loaded ${this.conflicts.length} conflicts for visualization`);
  }

  /**
   * Generate complete HTML dashboard
   */
  generateHTML() {
    console.log('Generating HTML dashboard...');

    const severityCounts = {
      CRITICAL: this.conflicts.filter(c => c.severity === 'CRITICAL').length,
      HIGH: this.conflicts.filter(c => c.severity === 'HIGH').length,
      MEDIUM: this.conflicts.filter(c => c.severity === 'MEDIUM').length,
      LOW: this.conflicts.filter(c => c.severity === 'LOW').length
    };

    // Get top objects by trigger count
    const objectCounts = {};
    this.conflicts.forEach(c => {
      objectCounts[c.object] = c.triggerCount;
    });
    const topObjects = Object.entries(objectCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Salesforce Automation Audit Dashboard</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            background: #f5f7fa;
            color: #2c3e50;
            padding: 20px;
        }

        .container {
            max-width: 1400px;
            margin: 0 auto;
        }

        header {
            background: white;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            margin-bottom: 30px;
        }

        h1 {
            font-size: 32px;
            margin-bottom: 10px;
            color: #2c3e50;
        }

        .subtitle {
            color: #7f8c8d;
            font-size: 16px;
        }

        .summary-cards {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }

        .card {
            background: white;
            padding: 25px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }

        .card h3 {
            font-size: 14px;
            color: #7f8c8d;
            margin-bottom: 10px;
            text-transform: uppercase;
            letter-spacing: 1px;
        }

        .card .value {
            font-size: 36px;
            font-weight: bold;
            margin-bottom: 5px;
        }

        .card .label {
            color: #95a5a6;
            font-size: 14px;
        }

        .card.critical .value { color: #e74c3c; }
        .card.high .value { color: #e67e22; }
        .card.medium .value { color: #f39c12; }
        .card.low .value { color: #27ae60; }

        .charts-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(450px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }

        .chart-card {
            background: white;
            padding: 25px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }

        .chart-card h2 {
            font-size: 18px;
            margin-bottom: 20px;
            color: #2c3e50;
        }

        .conflicts-table {
            background: white;
            padding: 25px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            overflow-x: auto;
        }

        table {
            width: 100%;
            border-collapse: collapse;
        }

        thead {
            background: #ecf0f1;
        }

        th {
            padding: 12px;
            text-align: left;
            font-weight: 600;
            font-size: 14px;
            color: #2c3e50;
        }

        td {
            padding: 12px;
            border-bottom: 1px solid #ecf0f1;
            font-size: 14px;
        }

        tbody tr:hover {
            background: #f8f9fa;
        }

        .badge {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: 600;
            text-transform: uppercase;
        }

        .badge-critical {
            background: #fee;
            color: #e74c3c;
        }

        .badge-high {
            background: #fef3e6;
            color: #e67e22;
        }

        .badge-medium {
            background: #fef9e6;
            color: #f39c12;
        }

        .badge-low {
            background: #eafaf1;
            color: #27ae60;
        }

        .filters {
            margin-bottom: 20px;
            display: flex;
            gap: 15px;
        }

        select, input[type="text"] {
            padding: 10px;
            border: 1px solid #dfe6e9;
            border-radius: 4px;
            font-size: 14px;
        }

        .phase-timeline {
            background: white;
            padding: 25px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            margin-top: 30px;
        }

        .phase {
            margin-bottom: 30px;
        }

        .phase h3 {
            font-size: 18px;
            margin-bottom: 15px;
        }

        .phase-bar {
            height: 40px;
            background: #ecf0f1;
            border-radius: 20px;
            overflow: hidden;
            position: relative;
        }

        .phase-progress {
            height: 100%;
            background: linear-gradient(90deg, #3498db, #2ecc71);
            display: flex;
            align-items: center;
            padding: 0 20px;
            color: white;
            font-weight: 600;
        }

        footer {
            text-align: center;
            padding: 30px;
            color: #95a5a6;
            font-size: 14px;
        }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>🔍 Salesforce Automation Audit Dashboard</h1>
            <div class="subtitle">
                Organization: ${this.rawData.orgInfo?.orgAlias || 'Unknown'} |
                Audit Date: ${new Date().toISOString().split('T')[0]} |
                Total Components: ${(this.rawData.triggers?.length || 0) + (this.rawData.flows?.length || 0) + (this.rawData.workflowRules?.length || 0)}
            </div>
        </header>

        <div class="summary-cards">
            <div class="card critical">
                <h3>Critical Conflicts</h3>
                <div class="value">${severityCounts.CRITICAL}</div>
                <div class="label">Immediate Action Required</div>
            </div>
            <div class="card high">
                <h3>High Priority</h3>
                <div class="value">${severityCounts.HIGH}</div>
                <div class="label">Plan Within Week</div>
            </div>
            <div class="card medium">
                <h3>Medium Priority</h3>
                <div class="value">${severityCounts.MEDIUM}</div>
                <div class="label">Schedule Resolution</div>
            </div>
            <div class="card low">
                <h3>Low Priority</h3>
                <div class="value">${severityCounts.LOW}</div>
                <div class="label">Optimize Later</div>
            </div>
        </div>

        <div class="charts-grid">
            <div class="chart-card">
                <h2>Conflicts by Severity</h2>
                <canvas id="severityChart"></canvas>
            </div>
            <div class="chart-card">
                <h2>Top 10 Objects by Trigger Count</h2>
                <canvas id="objectsChart"></canvas>
            </div>
        </div>

        <div class="conflicts-table">
            <h2>All Conflicts</h2>
            <div class="filters">
                <select id="severityFilter">
                    <option value="">All Severities</option>
                    <option value="CRITICAL">Critical</option>
                    <option value="HIGH">High</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="LOW">Low</option>
                </select>
                <input type="text" id="searchFilter" placeholder="Search objects...">
            </div>
            <table id="conflictsTable">
                <thead>
                    <tr>
                        <th>Object</th>
                        <th>Severity</th>
                        <th>Triggers</th>
                        <th>Impact</th>
                        <th>Estimated Time</th>
                    </tr>
                </thead>
                <tbody>
                    ${this.conflicts.map(c => `
                        <tr data-severity="${c.severity}">
                            <td><strong>${c.object}</strong></td>
                            <td><span class="badge badge-${c.severity.toLowerCase()}">${c.severity}</span></td>
                            <td>${c.triggerCount}</td>
                            <td>${c.impact}</td>
                            <td>${c.recommendation.estimatedTime}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>

        <div class="phase-timeline">
            <h2>Remediation Timeline (6 Weeks)</h2>
            <div class="phase">
                <h3>Phase 1: Critical Conflicts (Weeks 1-2)</h3>
                <div class="phase-bar">
                    <div class="phase-progress" style="width: 33%">
                        ${severityCounts.CRITICAL} conflicts
                    </div>
                </div>
            </div>
            <div class="phase">
                <h3>Phase 2: High Priority (Weeks 3-4)</h3>
                <div class="phase-bar">
                    <div class="phase-progress" style="width: 33%">
                        ${severityCounts.HIGH} conflicts
                    </div>
                </div>
            </div>
            <div class="phase">
                <h3>Phase 3: Medium/Low Priority (Weeks 5-6)</h3>
                <div class="phase-bar">
                    <div class="phase-progress" style="width: 33%">
                        ${severityCounts.MEDIUM + severityCounts.LOW} conflicts
                    </div>
                </div>
            </div>
        </div>

        ${generateFooter({
            tool: 'Salesforce Automation Auditor',
            version: 'v2.0',
            reportType: 'Interactive Dashboard',
            format: 'html'
        })}
    </div>

    <script>
        // Severity Distribution Chart
        const severityCtx = document.getElementById('severityChart').getContext('2d');
        new Chart(severityCtx, {
            type: 'doughnut',
            data: {
                labels: ['Critical', 'High', 'Medium', 'Low'],
                datasets: [{
                    data: [${severityCounts.CRITICAL}, ${severityCounts.HIGH}, ${severityCounts.MEDIUM}, ${severityCounts.LOW}],
                    backgroundColor: ['#e74c3c', '#e67e22', '#f39c12', '#27ae60']
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        position: 'bottom'
                    }
                }
            }
        });

        // Top Objects Chart
        const objectsCtx = document.getElementById('objectsChart').getContext('2d');
        new Chart(objectsCtx, {
            type: 'bar',
            data: {
                labels: ${JSON.stringify(topObjects.map(o => o[0]))},
                datasets: [{
                    label: 'Trigger Count',
                    data: ${JSON.stringify(topObjects.map(o => o[1]))},
                    backgroundColor: '#3498db'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                indexAxis: 'y',
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    x: {
                        beginAtZero: true
                    }
                }
            }
        });

        // Table filtering
        const severityFilter = document.getElementById('severityFilter');
        const searchFilter = document.getElementById('searchFilter');
        const tableRows = document.querySelectorAll('#conflictsTable tbody tr');

        function filterTable() {
            const severity = severityFilter.value;
            const search = searchFilter.value.toLowerCase();

            tableRows.forEach(row => {
                const rowSeverity = row.dataset.severity;
                const rowText = row.textContent.toLowerCase();

                const matchesSeverity = !severity || rowSeverity === severity;
                const matchesSearch = !search || rowText.includes(search);

                row.style.display = matchesSeverity && matchesSearch ? '' : 'none';
            });
        }

        severityFilter.addEventListener('change', filterTable);
        searchFilter.addEventListener('input', filterTable);
    </script>
</body>
</html>`;

    const outputPath = path.join(this.dashboardDir, 'index.html');
    fs.writeFileSync(outputPath, html, 'utf8');

    console.log(`✓ Dashboard saved to: ${outputPath}`);
    return outputPath;
  }

  /**
   * Generate dashboard
   */
  generate() {
    console.log('\n=== Automation Dashboard Generator ===\n');
    console.log(`Audit Directory: ${this.auditDir}\n`);

    this.loadData();
    const dashboardPath = this.generateHTML();

    console.log('\n=== Dashboard Generation Complete ===\n');
    console.log(`Open in browser: file://${dashboardPath}`);
    console.log('');

    return dashboardPath;
  }
}

// CLI Execution
if (require.main === module) {
  const auditDir = process.argv[2];

  if (!auditDir) {
    console.error('Usage: node automation-dashboard-generator.js <audit-directory>');
    console.error('');
    console.error('Example:');
    console.error('  node automation-dashboard-generator.js instances/gamma-corp/automation-audit-1234567890/');
    process.exit(1);
  }

  if (!fs.existsSync(auditDir)) {
    console.error(`Error: Audit directory not found: ${auditDir}`);
    process.exit(1);
  }

  const generator = new AutomationDashboardGenerator(auditDir);

  try {
    generator.generate();
    console.log('✓ Dashboard generated successfully');
    process.exit(0);
  } catch (error) {
    console.error('Error generating dashboard:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

module.exports = AutomationDashboardGenerator;
