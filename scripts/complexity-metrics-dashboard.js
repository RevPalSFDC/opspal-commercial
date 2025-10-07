#!/usr/bin/env node

/**
 * Complexity Metrics Dashboard
 * Real-time monitoring of complexity assessment and Sequential Thinking usage
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

// Configuration
const PORT = 3005;
const METRICS_FILE = path.join(__dirname, '..', 'opspal-internal', 'infrastructure', 'shared-infrastructure', 'complexity-assessment', 'metrics.json');
const PROFILES_FILE = path.join(__dirname, '..', 'opspal-internal', 'infrastructure', 'shared-infrastructure', 'complexity-assessment', 'complexity-profiles.json');

// Load agent profiles
const agentProfiles = require(PROFILES_FILE);

// Initialize or load metrics
let metrics = {
    global: {
        totalAssessments: 0,
        sequentialUsed: 0,
        directUsed: 0,
        overridesApplied: 0,
        complexityDistribution: {
            SIMPLE: 0,
            MEDIUM: 0,
            HIGH: 0
        },
        lastUpdated: new Date().toISOString()
    },
    byAgent: {},
    recentAssessments: []
};

// Load existing metrics if available
if (fs.existsSync(METRICS_FILE)) {
    try {
        metrics = JSON.parse(fs.readFileSync(METRICS_FILE, 'utf8'));
    } catch (error) {
        console.error('Error loading metrics:', error);
    }
}

/**
 * Save metrics to file
 */
function saveMetrics() {
    try {
        fs.writeFileSync(METRICS_FILE, JSON.stringify(metrics, null, 2));
    } catch (error) {
        console.error('Error saving metrics:', error);
    }
}

/**
 * Update metrics with new assessment
 */
function updateMetrics(assessment) {
    // Update global metrics
    metrics.global.totalAssessments++;
    
    if (assessment.useSequentialThinking) {
        metrics.global.sequentialUsed++;
    } else {
        metrics.global.directUsed++;
    }
    
    if (assessment.userOverride) {
        metrics.global.overridesApplied++;
    }
    
    metrics.global.complexityDistribution[assessment.level]++;
    metrics.global.lastUpdated = new Date().toISOString();
    
    // Update agent-specific metrics
    const agentName = assessment.agent || 'unknown';
    if (!metrics.byAgent[agentName]) {
        metrics.byAgent[agentName] = {
            totalAssessments: 0,
            sequentialUsed: 0,
            directUsed: 0,
            complexityScores: []
        };
    }
    
    metrics.byAgent[agentName].totalAssessments++;
    if (assessment.useSequentialThinking) {
        metrics.byAgent[agentName].sequentialUsed++;
    } else {
        metrics.byAgent[agentName].directUsed++;
    }
    metrics.byAgent[agentName].complexityScores.push(assessment.score);
    
    // Add to recent assessments (keep last 100)
    metrics.recentAssessments.unshift({
        timestamp: new Date().toISOString(),
        agent: agentName,
        score: assessment.score,
        level: assessment.level,
        useSequential: assessment.useSequentialThinking,
        task: assessment.taskDescription || 'Unknown task'
    });
    
    if (metrics.recentAssessments.length > 100) {
        metrics.recentAssessments = metrics.recentAssessments.slice(0, 100);
    }
    
    saveMetrics();
}

/**
 * Generate HTML dashboard
 */
function generateDashboard() {
    const sequentialRatio = metrics.global.totalAssessments > 0
        ? ((metrics.global.sequentialUsed / metrics.global.totalAssessments) * 100).toFixed(1)
        : 0;
    
    const overrideRatio = metrics.global.totalAssessments > 0
        ? ((metrics.global.overridesApplied / metrics.global.totalAssessments) * 100).toFixed(1)
        : 0;
    
    return `<!DOCTYPE html>
<html>
<head>
    <title>Complexity Metrics Dashboard</title>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
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
        .grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        .card {
            background: white;
            border-radius: 12px;
            padding: 20px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.2);
        }
        .card h2 {
            color: #333;
            margin-bottom: 15px;
            font-size: 1.3em;
        }
        .metric {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 10px 0;
            border-bottom: 1px solid #eee;
        }
        .metric:last-child {
            border-bottom: none;
        }
        .metric-label {
            color: #666;
            font-size: 0.9em;
        }
        .metric-value {
            font-size: 1.5em;
            font-weight: bold;
            color: #667eea;
        }
        .progress-bar {
            width: 100%;
            height: 30px;
            background: #f0f0f0;
            border-radius: 15px;
            overflow: hidden;
            margin: 10px 0;
        }
        .progress-fill {
            height: 100%;
            background: linear-gradient(90deg, #667eea, #764ba2);
            transition: width 0.3s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-weight: bold;
        }
        .complexity-bar {
            display: flex;
            height: 40px;
            border-radius: 8px;
            overflow: hidden;
            margin: 15px 0;
        }
        .complexity-segment {
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-weight: bold;
            transition: all 0.3s ease;
        }
        .simple { background: #4ade80; }
        .medium { background: #fbbf24; }
        .high { background: #f87171; }
        table {
            width: 100%;
            border-collapse: collapse;
        }
        th, td {
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid #eee;
        }
        th {
            background: #f8f9fa;
            font-weight: 600;
            color: #333;
        }
        tr:hover {
            background: #f8f9fa;
        }
        .timestamp {
            color: #999;
            font-size: 0.85em;
        }
        .badge {
            display: inline-block;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 0.85em;
            font-weight: bold;
        }
        .badge-sequential {
            background: #667eea;
            color: white;
        }
        .badge-direct {
            background: #4ade80;
            color: white;
        }
        .refresh-info {
            text-align: center;
            color: white;
            margin-top: 20px;
            opacity: 0.8;
        }
    </style>
    <script>
        setTimeout(() => location.reload(), 5000);
    </script>
</head>
<body>
    <div class="container">
        <h1>🧠 Complexity Metrics Dashboard</h1>
        
        <div class="grid">
            <!-- Global Metrics -->
            <div class="card">
                <h2>📊 Global Metrics</h2>
                <div class="metric">
                    <span class="metric-label">Total Assessments</span>
                    <span class="metric-value">${metrics.global.totalAssessments}</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Sequential Thinking Used</span>
                    <span class="metric-value">${metrics.global.sequentialUsed}</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Direct Execution</span>
                    <span class="metric-value">${metrics.global.directUsed}</span>
                </div>
                <div class="metric">
                    <span class="metric-label">User Overrides</span>
                    <span class="metric-value">${metrics.global.overridesApplied}</span>
                </div>
            </div>
            
            <!-- Usage Ratios -->
            <div class="card">
                <h2>📈 Usage Patterns</h2>
                <div class="metric-label">Sequential Thinking Ratio</div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${sequentialRatio}%">
                        ${sequentialRatio}%
                    </div>
                </div>
                <div class="metric-label">Override Ratio</div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${overrideRatio}%">
                        ${overrideRatio}%
                    </div>
                </div>
            </div>
            
            <!-- Complexity Distribution -->
            <div class="card">
                <h2>🎯 Complexity Distribution</h2>
                <div class="complexity-bar">
                    ${generateComplexityBar()}
                </div>
                <div class="metric">
                    <span class="metric-label">Simple</span>
                    <span class="metric-value">${metrics.global.complexityDistribution.SIMPLE}</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Medium</span>
                    <span class="metric-value">${metrics.global.complexityDistribution.MEDIUM}</span>
                </div>
                <div class="metric">
                    <span class="metric-label">High</span>
                    <span class="metric-value">${metrics.global.complexityDistribution.HIGH}</span>
                </div>
            </div>
        </div>
        
        <!-- Agent Performance -->
        <div class="card">
            <h2>🤖 Agent Performance</h2>
            <table>
                <thead>
                    <tr>
                        <th>Agent</th>
                        <th>Assessments</th>
                        <th>Sequential</th>
                        <th>Direct</th>
                        <th>Avg Score</th>
                        <th>Sequential %</th>
                    </tr>
                </thead>
                <tbody>
                    ${generateAgentRows()}
                </tbody>
            </table>
        </div>
        
        <!-- Recent Assessments -->
        <div class="card">
            <h2>🕒 Recent Assessments</h2>
            <table>
                <thead>
                    <tr>
                        <th>Time</th>
                        <th>Agent</th>
                        <th>Score</th>
                        <th>Level</th>
                        <th>Method</th>
                        <th>Task</th>
                    </tr>
                </thead>
                <tbody>
                    ${generateRecentRows()}
                </tbody>
            </table>
        </div>
        
        <div class="refresh-info">
            Auto-refreshing every 5 seconds | Last updated: ${new Date().toLocaleString()}
        </div>
    </div>
</body>
</html>`;
}

/**
 * Generate complexity distribution bar
 */
function generateComplexityBar() {
    const total = metrics.global.complexityDistribution.SIMPLE +
                  metrics.global.complexityDistribution.MEDIUM +
                  metrics.global.complexityDistribution.HIGH;
    
    if (total === 0) return '<div style="width:100%;text-align:center;color:#999;">No data</div>';
    
    const simplePercent = (metrics.global.complexityDistribution.SIMPLE / total * 100).toFixed(1);
    const mediumPercent = (metrics.global.complexityDistribution.MEDIUM / total * 100).toFixed(1);
    const highPercent = (metrics.global.complexityDistribution.HIGH / total * 100).toFixed(1);
    
    return `
        <div class="complexity-segment simple" style="width: ${simplePercent}%">${simplePercent}%</div>
        <div class="complexity-segment medium" style="width: ${mediumPercent}%">${mediumPercent}%</div>
        <div class="complexity-segment high" style="width: ${highPercent}%">${highPercent}%</div>
    `;
}

/**
 * Generate agent performance rows
 */
function generateAgentRows() {
    const agents = Object.entries(metrics.byAgent)
        .sort((a, b) => b[1].totalAssessments - a[1].totalAssessments)
        .slice(0, 10);
    
    if (agents.length === 0) {
        return '<tr><td colspan="6" style="text-align:center;color:#999;">No agent data yet</td></tr>';
    }
    
    return agents.map(([name, data]) => {
        const avgScore = data.complexityScores.length > 0
            ? (data.complexityScores.reduce((a, b) => a + b, 0) / data.complexityScores.length).toFixed(3)
            : '0.000';
        
        const sequentialPercent = data.totalAssessments > 0
            ? ((data.sequentialUsed / data.totalAssessments) * 100).toFixed(1)
            : '0.0';
        
        return `
            <tr>
                <td><strong>${name}</strong></td>
                <td>${data.totalAssessments}</td>
                <td>${data.sequentialUsed}</td>
                <td>${data.directUsed}</td>
                <td>${avgScore}</td>
                <td>${sequentialPercent}%</td>
            </tr>
        `;
    }).join('');
}

/**
 * Generate recent assessment rows
 */
function generateRecentRows() {
    if (metrics.recentAssessments.length === 0) {
        return '<tr><td colspan="6" style="text-align:center;color:#999;">No recent assessments</td></tr>';
    }
    
    return metrics.recentAssessments.slice(0, 20).map(assessment => {
        const time = new Date(assessment.timestamp).toLocaleTimeString();
        const badge = assessment.useSequential 
            ? '<span class="badge badge-sequential">Sequential</span>'
            : '<span class="badge badge-direct">Direct</span>';
        
        const levelClass = assessment.level.toLowerCase();
        const taskPreview = assessment.task.length > 50 
            ? assessment.task.substring(0, 50) + '...'
            : assessment.task;
        
        return `
            <tr>
                <td class="timestamp">${time}</td>
                <td>${assessment.agent}</td>
                <td>${assessment.score.toFixed(3)}</td>
                <td><span class="badge ${levelClass}">${assessment.level}</span></td>
                <td>${badge}</td>
                <td>${taskPreview}</td>
            </tr>
        `;
    }).join('');
}

/**
 * Create HTTP server
 */
const server = http.createServer((req, res) => {
    if (req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(generateDashboard());
    } else if (req.url === '/api/metrics') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(metrics, null, 2));
    } else if (req.url === '/api/update' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const assessment = JSON.parse(body);
                updateMetrics(assessment);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true }));
            } catch (error) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: error.message }));
            }
        });
    } else {
        res.writeHead(404);
        res.end('Not found');
    }
});

// Start server
server.listen(PORT, () => {
    console.log(`
🧠 Complexity Metrics Dashboard
================================
Dashboard: http://localhost:${PORT}
API Endpoint: http://localhost:${PORT}/api/metrics
Update Endpoint: POST http://localhost:${PORT}/api/update

The dashboard auto-refreshes every 5 seconds.
Press Ctrl+C to stop.
    `);
});

// Save metrics on exit
process.on('SIGINT', () => {
    console.log('\nSaving metrics...');
    saveMetrics();
    process.exit(0);
});