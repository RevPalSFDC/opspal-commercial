#!/usr/bin/env node

/**
 * Monitoring Dashboard for New Salesforce Operation Tools
 * 
 * Tracks performance metrics for:
 * - Pre-flight validation success rates
 * - Smart bulk operation performance
 * - Error recovery effectiveness
 * - Rollback operations
 * 
 * Run with: node monitoring-dashboard.js
 * Access at: http://localhost:3001
 */

const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

const app = express();
const PORT = process.env.MONITOR_PORT || 3001;

// Paths to data directories
const AUDIT_DIR = path.join(__dirname, '../data/audit');
const SNAPSHOT_DIR = path.join(__dirname, '../data/snapshots');
const ERROR_PATTERNS_FILE = path.join(__dirname, '../data/error-patterns.json');
const TEST_RESULTS_DIR = path.join(__dirname, '../data/test-results');

// Serve static files
app.use(express.static('public'));

// Dashboard HTML
const dashboardHTML = `
<!DOCTYPE html>
<html>
<head>
    <title>Salesforce Operations Monitor</title>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
        }
        .container {
            max-width: 1400px;
            margin: 0 auto;
        }
        h1 {
            color: white;
            text-align: center;
            margin-bottom: 30px;
            font-size: 2.5em;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.2);
        }
        .metrics-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        .metric-card {
            background: white;
            border-radius: 15px;
            padding: 25px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.1);
            transition: transform 0.3s ease;
        }
        .metric-card:hover {
            transform: translateY(-5px);
            box-shadow: 0 15px 40px rgba(0,0,0,0.15);
        }
        .metric-title {
            font-size: 0.9em;
            color: #666;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 10px;
        }
        .metric-value {
            font-size: 2.5em;
            font-weight: bold;
            color: #333;
            margin-bottom: 10px;
        }
        .metric-subtitle {
            font-size: 0.85em;
            color: #999;
        }
        .success { color: #10b981; }
        .warning { color: #f59e0b; }
        .error { color: #ef4444; }
        .chart-container {
            background: white;
            border-radius: 15px;
            padding: 25px;
            margin-bottom: 20px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.1);
        }
        .chart-title {
            font-size: 1.2em;
            color: #333;
            margin-bottom: 20px;
        }
        .operations-list {
            background: white;
            border-radius: 15px;
            padding: 25px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.1);
        }
        .operation-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 15px;
            border-bottom: 1px solid #f0f0f0;
        }
        .operation-item:last-child {
            border-bottom: none;
        }
        .status-badge {
            padding: 5px 12px;
            border-radius: 20px;
            font-size: 0.85em;
            font-weight: 600;
        }
        .status-success {
            background: #d1fae5;
            color: #065f46;
        }
        .status-failed {
            background: #fee2e2;
            color: #991b1b;
        }
        .status-in-progress {
            background: #fed7aa;
            color: #92400e;
        }
        .refresh-btn {
            position: fixed;
            bottom: 30px;
            right: 30px;
            background: white;
            color: #667eea;
            border: none;
            border-radius: 50%;
            width: 60px;
            height: 60px;
            font-size: 24px;
            cursor: pointer;
            box-shadow: 0 5px 20px rgba(0,0,0,0.2);
            transition: transform 0.3s ease;
        }
        .refresh-btn:hover {
            transform: rotate(180deg);
        }
        .timestamp {
            color: white;
            text-align: center;
            margin-top: 20px;
            opacity: 0.8;
        }
        #performanceChart {
            height: 300px;
        }
        .loading {
            text-align: center;
            padding: 40px;
            color: #999;
        }
    </style>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
</head>
<body>
    <div class="container">
        <h1>🚀 Salesforce Operations Monitor</h1>
        
        <div class="metrics-grid">
            <div class="metric-card">
                <div class="metric-title">Pre-Flight Validations</div>
                <div class="metric-value success" id="validationRate">--</div>
                <div class="metric-subtitle">Success Rate (Last 24h)</div>
            </div>
            
            <div class="metric-card">
                <div class="metric-title">Smart Operations</div>
                <div class="metric-value" id="operationCount">--</div>
                <div class="metric-subtitle">Total Operations Today</div>
            </div>
            
            <div class="metric-card">
                <div class="metric-title">Error Recovery</div>
                <div class="metric-value success" id="recoveryRate">--</div>
                <div class="metric-subtitle">Auto-Recovery Success</div>
            </div>
            
            <div class="metric-card">
                <div class="metric-title">Timeout Prevention</div>
                <div class="metric-value" id="timeoutsPrevented">--</div>
                <div class="metric-subtitle">Timeouts Prevented</div>
            </div>
            
            <div class="metric-card">
                <div class="metric-title">Rollback Ready</div>
                <div class="metric-value" id="rollbackReady">--</div>
                <div class="metric-subtitle">Operations Tracked</div>
            </div>
            
            <div class="metric-card">
                <div class="metric-title">Avg Operation Time</div>
                <div class="metric-value" id="avgTime">--</div>
                <div class="metric-subtitle">Seconds</div>
            </div>
        </div>
        
        <div class="chart-container">
            <div class="chart-title">Operation Performance (Last 7 Days)</div>
            <canvas id="performanceChart"></canvas>
        </div>
        
        <div class="chart-container">
            <div class="chart-title">Error Pattern Distribution</div>
            <canvas id="errorChart"></canvas>
        </div>
        
        <div class="operations-list">
            <div class="chart-title">Recent Operations</div>
            <div id="operationsList" class="loading">Loading operations...</div>
        </div>
        
        <div class="timestamp" id="lastUpdate">Last updated: --</div>
        
        <button class="refresh-btn" onclick="refreshDashboard()">⟲</button>
    </div>
    
    <script>
        let performanceChart, errorChart;
        
        async function fetchMetrics() {
            try {
                const response = await fetch('/api/metrics');
                const data = await response.json();
                updateMetrics(data);
            } catch (error) {
                console.error('Failed to fetch metrics:', error);
            }
        }
        
        function updateMetrics(data) {
            // Update metric cards
            document.getElementById('validationRate').textContent = data.validationRate + '%';
            document.getElementById('operationCount').textContent = data.operationCount;
            document.getElementById('recoveryRate').textContent = data.recoveryRate + '%';
            document.getElementById('timeoutsPrevented').textContent = data.timeoutsPrevented;
            document.getElementById('rollbackReady').textContent = data.rollbackReady;
            document.getElementById('avgTime').textContent = data.avgTime.toFixed(1);
            
            // Update charts
            updatePerformanceChart(data.performanceHistory);
            updateErrorChart(data.errorPatterns);
            
            // Update operations list
            updateOperationsList(data.recentOperations);
            
            // Update timestamp
            document.getElementById('lastUpdate').textContent = 
                'Last updated: ' + new Date().toLocaleTimeString();
        }
        
        function updatePerformanceChart(data) {
            const ctx = document.getElementById('performanceChart').getContext('2d');
            
            if (performanceChart) {
                performanceChart.destroy();
            }
            
            performanceChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: data.labels,
                    datasets: [{
                        label: 'Successful Operations',
                        data: data.successful,
                        borderColor: '#10b981',
                        backgroundColor: 'rgba(16, 185, 129, 0.1)',
                        tension: 0.4
                    }, {
                        label: 'Failed Operations',
                        data: data.failed,
                        borderColor: '#ef4444',
                        backgroundColor: 'rgba(239, 68, 68, 0.1)',
                        tension: 0.4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'bottom'
                        }
                    }
                }
            });
        }
        
        function updateErrorChart(data) {
            const ctx = document.getElementById('errorChart').getContext('2d');
            
            if (errorChart) {
                errorChart.destroy();
            }
            
            errorChart = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: data.labels,
                    datasets: [{
                        data: data.values,
                        backgroundColor: [
                            '#667eea',
                            '#764ba2',
                            '#f59e0b',
                            '#10b981',
                            '#ef4444',
                            '#3b82f6'
                        ]
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'right'
                        }
                    }
                }
            });
        }
        
        function updateOperationsList(operations) {
            const container = document.getElementById('operationsList');
            
            if (!operations || operations.length === 0) {
                container.innerHTML = '<div class="loading">No recent operations</div>';
                return;
            }
            
            container.innerHTML = operations.map(op => \`
                <div class="operation-item">
                    <div>
                        <strong>\${op.id}</strong>
                        <br>
                        <small>\${op.object} - \${op.type} (\${op.recordCount} records)</small>
                    </div>
                    <div>
                        <span class="status-badge status-\${op.status}">
                            \${op.status}
                        </span>
                    </div>
                </div>
            \`).join('');
        }
        
        function refreshDashboard() {
            fetchMetrics();
        }
        
        // Initial load
        fetchMetrics();
        
        // Auto-refresh every 30 seconds
        setInterval(fetchMetrics, 30000);
    </script>
</body>
</html>
`;

// API endpoint for metrics
app.get('/api/metrics', async (req, res) => {
    try {
        const metrics = await collectMetrics();
        res.json(metrics);
    } catch (error) {
        console.error('Error collecting metrics:', error);
        res.status(500).json({ error: 'Failed to collect metrics' });
    }
});

// Serve dashboard
app.get('/', (req, res) => {
    res.send(dashboardHTML);
});

// Collect metrics from various sources
async function collectMetrics() {
    const metrics = {
        validationRate: 0,
        operationCount: 0,
        recoveryRate: 0,
        timeoutsPrevented: 0,
        rollbackReady: 0,
        avgTime: 0,
        performanceHistory: {
            labels: [],
            successful: [],
            failed: []
        },
        errorPatterns: {
            labels: [],
            values: []
        },
        recentOperations: []
    };

    try {
        // Read operation files
        const files = await fs.readdir(AUDIT_DIR).catch(() => []);
        const operations = [];

        for (const file of files.filter(f => f.startsWith('operation_'))) {
            try {
                const data = await fs.readFile(path.join(AUDIT_DIR, file), 'utf8');
                const operation = JSON.parse(data);
                operations.push(operation);
            } catch (e) {
                // Skip invalid files
            }
        }

        // Calculate metrics
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const todayOps = operations.filter(op => 
            new Date(op.startTime) >= today
        );

        metrics.operationCount = todayOps.length;
        metrics.rollbackReady = operations.filter(op => op.canRollback).length;

        // Calculate average time
        const completedOps = operations.filter(op => op.duration);
        if (completedOps.length > 0) {
            const totalTime = completedOps.reduce((sum, op) => sum + op.duration, 0);
            metrics.avgTime = totalTime / completedOps.length / 1000; // Convert to seconds
        }

        // Calculate validation rate
        const validations = operations.filter(op => op.verifications);
        if (validations.length > 0) {
            const successful = validations.filter(op => 
                op.verifications.every(v => v.passed)
            ).length;
            metrics.validationRate = Math.round((successful / validations.length) * 100);
        }

        // Load error patterns
        try {
            const errorData = await fs.readFile(ERROR_PATTERNS_FILE, 'utf8');
            const patterns = JSON.parse(errorData);
            
            // Calculate recovery rate
            const totalHits = patterns.reduce((sum, p) => sum + (p.hitCount || 0), 0);
            const totalSuccess = patterns.reduce((sum, p) => sum + (p.successCount || 0), 0);
            
            if (totalHits > 0) {
                metrics.recoveryRate = Math.round((totalSuccess / totalHits) * 100);
            }

            // Error pattern distribution
            metrics.errorPatterns.labels = patterns.slice(0, 6).map(p => p.id);
            metrics.errorPatterns.values = patterns.slice(0, 6).map(p => p.hitCount || 0);
        } catch (e) {
            // No error patterns yet
        }

        // Estimate timeouts prevented (based on operations > 100 records)
        metrics.timeoutsPrevented = operations.filter(op => 
            op.metadata && op.metadata.recordCount > 100
        ).length;

        // Performance history (last 7 days)
        for (let i = 6; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            date.setHours(0, 0, 0, 0);
            
            const dayOps = operations.filter(op => {
                const opDate = new Date(op.startTime);
                opDate.setHours(0, 0, 0, 0);
                return opDate.getTime() === date.getTime();
            });

            metrics.performanceHistory.labels.push(
                date.toLocaleDateString('en', { weekday: 'short' })
            );
            metrics.performanceHistory.successful.push(
                dayOps.filter(op => op.status === 'completed').length
            );
            metrics.performanceHistory.failed.push(
                dayOps.filter(op => op.status === 'failed').length
            );
        }

        // Recent operations
        metrics.recentOperations = operations
            .sort((a, b) => new Date(b.startTime) - new Date(a.startTime))
            .slice(0, 10)
            .map(op => ({
                id: op.id.substring(0, 8),
                object: op.metadata?.object || 'Unknown',
                type: op.metadata?.operation || 'operation',
                recordCount: op.metadata?.recordCount || 0,
                status: op.status === 'completed' ? 'success' : 
                        op.status === 'in_progress' ? 'in-progress' : 'failed'
            }));

    } catch (error) {
        console.error('Error calculating metrics:', error);
    }

    return metrics;
}

// Start server
app.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════════════════════╗
║     Salesforce Operations Monitoring Dashboard        ║
╠════════════════════════════════════════════════════════╣
║                                                        ║
║  Dashboard running at: http://localhost:${PORT}         ║
║                                                        ║
║  Features:                                             ║
║  • Real-time operation metrics                        ║
║  • Error recovery statistics                          ║
║  • Performance tracking                               ║
║  • Rollback readiness monitoring                      ║
║                                                        ║
║  Auto-refreshes every 30 seconds                      ║
║                                                        ║
╚════════════════════════════════════════════════════════╝
    `);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\nShutting down monitoring dashboard...');
    process.exit(0);
});