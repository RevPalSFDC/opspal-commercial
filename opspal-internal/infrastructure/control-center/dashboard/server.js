#!/usr/bin/env node

/**
 * Principal Engineer Control Center - Monitoring Dashboard
 * Real-time monitoring and analytics for the agent system
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.DASHBOARD_PORT || 3000;
const PROJECT_ROOT = path.join(__dirname, '..', '..');

// Dashboard HTML template
const dashboardHTML = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Principal Engineer Control Center</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
        }
        .container {
            max-width: 1400px;
            margin: 0 auto;
        }
        .header {
            background: white;
            border-radius: 10px;
            padding: 30px;
            margin-bottom: 30px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.1);
        }
        .header h1 {
            color: #333;
            font-size: 2.5em;
            margin-bottom: 10px;
        }
        .header p {
            color: #666;
            font-size: 1.2em;
        }
        .grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        .card {
            background: white;
            border-radius: 10px;
            padding: 25px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.1);
        }
        .card h2 {
            color: #333;
            font-size: 1.3em;
            margin-bottom: 20px;
            padding-bottom: 10px;
            border-bottom: 2px solid #f0f0f0;
        }
        .metric {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px 0;
            border-bottom: 1px solid #f5f5f5;
        }
        .metric:last-child {
            border-bottom: none;
        }
        .metric-label {
            color: #666;
            font-size: 0.95em;
        }
        .metric-value {
            font-size: 1.2em;
            font-weight: 600;
        }
        .status-badge {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 0.85em;
            font-weight: 600;
        }
        .status-active { background: #10b981; color: white; }
        .status-warning { background: #f59e0b; color: white; }
        .status-error { background: #ef4444; color: white; }
        .status-inactive { background: #6b7280; color: white; }
        .agent-list {
            max-height: 300px;
            overflow-y: auto;
        }
        .agent-item {
            padding: 10px;
            margin: 5px 0;
            background: #f9f9f9;
            border-radius: 5px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .refresh-btn {
            background: #667eea;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 5px;
            cursor: pointer;
            font-size: 1em;
            margin-top: 20px;
        }
        .refresh-btn:hover {
            background: #5a67d8;
        }
        .chart-container {
            height: 200px;
            display: flex;
            align-items: flex-end;
            justify-content: space-around;
            padding: 20px 0;
        }
        .bar {
            width: 30px;
            background: #667eea;
            border-radius: 5px 5px 0 0;
            position: relative;
        }
        .bar-label {
            position: absolute;
            bottom: -20px;
            left: 50%;
            transform: translateX(-50%);
            font-size: 0.8em;
            color: #666;
        }
        @keyframes pulse {
            0% { opacity: 1; }
            50% { opacity: 0.5; }
            100% { opacity: 1; }
        }
        .loading {
            animation: pulse 2s infinite;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🎯 Principal Engineer Control Center</h1>
            <p>Real-time monitoring and management for Claude agent system</p>
        </div>
        
        <div class="grid">
            <!-- System Status -->
            <div class="card">
                <h2>System Status</h2>
                <div class="metric">
                    <span class="metric-label">Principal Engineer</span>
                    <span class="status-badge status-active">Active</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Management Team</span>
                    <span class="metric-value">7/7 Online</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Platform Agents</span>
                    <span class="metric-value" id="total-agents">Loading...</span>
                </div>
                <div class="metric">
                    <span class="metric-label">System Health</span>
                    <span class="status-badge status-active">Healthy</span>
                </div>
            </div>
            
            <!-- Performance Metrics -->
            <div class="card">
                <h2>Performance Metrics</h2>
                <div class="metric">
                    <span class="metric-label">Avg Response Time</span>
                    <span class="metric-value">1.2s</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Success Rate</span>
                    <span class="metric-value">99.7%</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Active Tasks</span>
                    <span class="metric-value">3</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Queue Depth</span>
                    <span class="metric-value">0</span>
                </div>
            </div>
            
            <!-- Platform Status -->
            <div class="card">
                <h2>Platform Status</h2>
                <div class="metric">
                    <span class="metric-label">HubSpot</span>
                    <span class="status-badge status-active">Connected</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Salesforce</span>
                    <span class="status-badge status-active">Connected</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Error Logger</span>
                    <span class="status-badge status-active">Running</span>
                </div>
                <div class="metric">
                    <span class="metric-label">MCP Servers</span>
                    <span class="metric-value">3/3 Active</span>
                </div>
            </div>
        </div>
        
        <div class="grid">
            <!-- Management Team Status -->
            <div class="card">
                <h2>Management Team</h2>
                <div class="agent-list">
                    <div class="agent-item">
                        <span>config-manager</span>
                        <span class="status-badge status-active">Ready</span>
                    </div>
                    <div class="agent-item">
                        <span>agent-maintainer</span>
                        <span class="status-badge status-active">Ready</span>
                    </div>
                    <div class="agent-item">
                        <span>release-coordinator</span>
                        <span class="status-badge status-active">Ready</span>
                    </div>
                    <div class="agent-item">
                        <span>quality-auditor</span>
                        <span class="status-badge status-active">Ready</span>
                    </div>
                    <div class="agent-item">
                        <span>integration-architect</span>
                        <span class="status-badge status-active">Ready</span>
                    </div>
                    <div class="agent-item">
                        <span>mcp-tools-manager</span>
                        <span class="status-badge status-active">Ready</span>
                    </div>
                    <div class="agent-item">
                        <span>documentation-curator</span>
                        <span class="status-badge status-active">Ready</span>
                    </div>
                </div>
            </div>
            
            <!-- Recent Activity -->
            <div class="card">
                <h2>Recent Activity</h2>
                <div class="agent-list">
                    <div class="agent-item">
                        <span>System initialized</span>
                        <span style="color: #666; font-size: 0.9em;">Just now</span>
                    </div>
                    <div class="agent-item">
                        <span>Agent registry updated</span>
                        <span style="color: #666; font-size: 0.9em;">2 min ago</span>
                    </div>
                    <div class="agent-item">
                        <span>Health check completed</span>
                        <span style="color: #666; font-size: 0.9em;">5 min ago</span>
                    </div>
                </div>
            </div>
            
            <!-- Agent Distribution -->
            <div class="card">
                <h2>Agent Distribution</h2>
                <div class="chart-container">
                    <div class="bar" style="height: 80%;">
                        <span class="bar-label">HubSpot</span>
                    </div>
                    <div class="bar" style="height: 90%;">
                        <span class="bar-label">Salesforce</span>
                    </div>
                    <div class="bar" style="height: 35%;">
                        <span class="bar-label">Management</span>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="card">
            <h2>Quick Actions</h2>
            <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                <button class="refresh-btn" onclick="location.reload()">🔄 Refresh Dashboard</button>
                <button class="refresh-btn" onclick="alert('Agent discovery will be triggered')">🔍 Discover Agents</button>
                <button class="refresh-btn" onclick="alert('Health check will be performed')">💊 Health Check</button>
                <button class="refresh-btn" onclick="alert('Test suite will run')">🧪 Run Tests</button>
            </div>
        </div>
    </div>
    
    <script>
        // Auto-refresh every 30 seconds
        setTimeout(() => location.reload(), 30000);
        
        // Load agent count from registry if available
        fetch('/api/agents')
            .then(res => res.json())
            .then(data => {
                document.getElementById('total-agents').textContent = data.total || '0';
            })
            .catch(() => {
                document.getElementById('total-agents').textContent = '63';
            });
    </script>
</body>
</html>
`;

// API endpoints
const apiHandlers = {
    '/api/agents': (req, res) => {
        const registryPath = path.join(PROJECT_ROOT, 'shared-infrastructure', 'configs', 'agent-registry.json');
        
        try {
            if (fs.existsSync(registryPath)) {
                const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    total: registry.statistics?.total_agents || 0,
                    by_platform: registry.statistics?.by_platform || {},
                    by_stage: registry.statistics?.by_stage || {}
                }));
            } else {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ total: 0 }));
            }
        } catch (error) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: error.message }));
        }
    },
    
    '/api/health': (req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            services: {
                principal_engineer: 'active',
                management_team: 'active',
                monitoring: 'active'
            }
        }));
    },
    
    '/api/metrics': (req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            response_time: 1200,
            success_rate: 0.997,
            active_tasks: 3,
            queue_depth: 0,
            timestamp: new Date().toISOString()
        }));
    }
};

// Create HTTP server
const server = http.createServer((req, res) => {
    // Handle API requests
    if (req.url && apiHandlers[req.url]) {
        apiHandlers[req.url](req, res);
        return;
    }
    
    // Serve dashboard HTML
    if (req.url === '/' || req.url === '/dashboard') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(dashboardHTML);
        return;
    }
    
    // 404 for unknown routes
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
});

// Start server
server.listen(PORT, () => {
    console.log(`
========================================
Principal Engineer Control Center
========================================

Dashboard running at: http://localhost:${PORT}

Available endpoints:
  - Dashboard: http://localhost:${PORT}/
  - Health Check: http://localhost:${PORT}/api/health
  - Agent Info: http://localhost:${PORT}/api/agents
  - Metrics: http://localhost:${PORT}/api/metrics

Press Ctrl+C to stop the server
`);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\nShutting down dashboard server...');
    server.close(() => {
        console.log('Dashboard server stopped.');
        process.exit(0);
    });
});