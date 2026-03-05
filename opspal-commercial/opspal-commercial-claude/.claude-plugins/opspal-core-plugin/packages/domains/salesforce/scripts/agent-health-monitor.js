#!/usr/bin/env node

/**
 * Agent Health Monitoring System
 * Monitors the health, performance, and availability of all agents
 * Provides real-time health checks and performance metrics
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { execSync } = require('child_process');

// Configuration
const PROJECT_ROOT = path.join(__dirname, '..');
const AGENTS_DIR = path.join(PROJECT_ROOT, 'agents');
const HEALTH_REPORT_FILE = path.join(PROJECT_ROOT, 'agent-health-report.json');
const AGENT_REGISTRY = path.join(PROJECT_ROOT, '..', 'shared-infrastructure', 'configs', 'agent-registry.json');

// Health thresholds
const THRESHOLDS = {
    responseTime: 5000,      // Max acceptable response time in ms
    errorRate: 0.1,         // Max 10% error rate
    availability: 0.95,     // Min 95% availability
    configValid: true,      // Configuration must be valid
    dependenciesAvailable: true // All dependencies must be available
};

// Color codes for console output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    blue: '\x1b[36m',
    gray: '\x1b[90m'
};

// Helper functions
function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSuccess(message) {
    console.log(`${colors.green}[✓]${colors.reset} ${message}`);
}

function logWarning(message) {
    console.log(`${colors.yellow}[⚠]${colors.reset} ${message}`);
}

function logError(message) {
    console.log(`${colors.red}[✗]${colors.reset} ${message}`);
}

function logInfo(message) {
    console.log(`${colors.blue}[i]${colors.reset} ${message}`);
}

// Load agent configuration
function loadAgentConfig(agentPath) {
    try {
        const content = fs.readFileSync(agentPath, 'utf8');
        return yaml.load(content);
    } catch (error) {
        return null;
    }
}

// Check agent configuration validity
function checkConfigValidity(config) {
    const issues = [];
    
    if (!config) {
        issues.push('Configuration file not found or invalid');
        return { valid: false, issues };
    }

    // Required fields
    if (!config.name) issues.push('Missing agent name');
    if (!config.stage) issues.push('Missing stage field (required: production/staging/development)');
    if (!config.version) issues.push('Missing version');
    if (!config.description) issues.push('Missing description');
    if (!config.capabilities) issues.push('Missing capabilities section');
    if (!config.tools || config.tools.length === 0) issues.push('No tools configured');

    // Validate stage value
    if (config.stage && !['production', 'staging', 'development', 'experimental', 'archived'].includes(config.stage)) {
        issues.push(`Invalid stage value: ${config.stage}`);
    }

    return {
        valid: issues.length === 0,
        issues
    };
}

// Check tool availability
function checkToolAvailability(tools) {
    const availability = {};
    
    for (const tool of tools) {
        if (tool.startsWith('../scripts/')) {
            const toolPath = path.join(PROJECT_ROOT, tool.replace('../', ''));
            availability[tool] = fs.existsSync(toolPath);
        } else if (tool.startsWith('mcp_')) {
            // MCP tools are assumed available if MCP is configured
            availability[tool] = fs.existsSync(path.join(PROJECT_ROOT, '.mcp.json'));
        } else {
            // Standard Claude Code tools
            availability[tool] = true;
        }
    }

    return availability;
}

// Check agent dependencies
function checkDependencies(config) {
    const dependencies = [];
    const issues = [];

    // Check for script dependencies
    if (config.scripts) {
        for (const script of config.scripts) {
            const scriptPath = path.join(PROJECT_ROOT, script.replace('../', ''));
            if (!fs.existsSync(scriptPath)) {
                issues.push(`Script not found: ${script}`);
            } else {
                dependencies.push({
                    type: 'script',
                    name: script,
                    available: true
                });
            }
        }
    }

    // Check for integration dependencies
    if (config.integration_points) {
        for (const integration of Object.keys(config.integration_points)) {
            const agentPath = path.join(AGENTS_DIR, `${integration}.yaml`);
            const available = fs.existsSync(agentPath);
            dependencies.push({
                type: 'agent',
                name: integration,
                available
            });
            if (!available) {
                issues.push(`Integration agent not found: ${integration}`);
            }
        }
    }

    return {
        dependencies,
        issues,
        allAvailable: issues.length === 0
    };
}

// Calculate agent health score
function calculateHealthScore(checks) {
    const weights = {
        configValid: 0.3,
        toolsAvailable: 0.25,
        dependenciesAvailable: 0.25,
        stageAppropriate: 0.1,
        documented: 0.1
    };

    let score = 0;
    let totalWeight = 0;

    for (const [check, weight] of Object.entries(weights)) {
        if (checks[check] !== undefined) {
            score += (checks[check] ? 1 : 0) * weight;
            totalWeight += weight;
        }
    }

    return totalWeight > 0 ? (score / totalWeight) * 100 : 0;
}

// Get health status emoji and color
function getHealthStatus(score) {
    if (score >= 90) return { emoji: '🟢', status: 'Healthy', color: 'green' };
    if (score >= 70) return { emoji: '🟡', status: 'Warning', color: 'yellow' };
    if (score >= 50) return { emoji: '🟠', status: 'Degraded', color: 'yellow' };
    return { emoji: '🔴', status: 'Critical', color: 'red' };
}

// Check individual agent health
async function checkAgentHealth(agentPath) {
    const agentName = path.basename(agentPath, '.yaml');
    const config = loadAgentConfig(agentPath);
    
    const health = {
        name: agentName,
        timestamp: new Date().toISOString(),
        checks: {},
        issues: [],
        score: 0,
        status: 'Unknown'
    };

    // Configuration validity
    const configCheck = checkConfigValidity(config);
    health.checks.configValid = configCheck.valid;
    if (!configCheck.valid) {
        health.issues.push(...configCheck.issues);
    }

    if (config) {
        // Basic info
        health.version = config.version;
        health.stage = config.stage;
        health.description = config.description;

        // Tool availability
        if (config.tools) {
            const toolAvailability = checkToolAvailability(config.tools);
            const allToolsAvailable = Object.values(toolAvailability).every(v => v);
            health.checks.toolsAvailable = allToolsAvailable;
            health.toolAvailability = toolAvailability;
            
            if (!allToolsAvailable) {
                const unavailable = Object.entries(toolAvailability)
                    .filter(([_, available]) => !available)
                    .map(([tool, _]) => tool);
                health.issues.push(`Unavailable tools: ${unavailable.join(', ')}`);
            }
        }

        // Dependencies
        const depCheck = checkDependencies(config);
        health.checks.dependenciesAvailable = depCheck.allAvailable;
        health.dependencies = depCheck.dependencies;
        if (depCheck.issues.length > 0) {
            health.issues.push(...depCheck.issues);
        }

        // Stage appropriateness
        health.checks.stageAppropriate = config.stage && 
            ['production', 'staging', 'development'].includes(config.stage);
        
        // Documentation
        health.checks.documented = config.description && 
            config.description.length > 20 &&
            config.capabilities && 
            Object.keys(config.capabilities).length > 0;
    }

    // Calculate health score
    health.score = Math.round(calculateHealthScore(health.checks));
    const statusInfo = getHealthStatus(health.score);
    health.status = statusInfo.status;
    health.statusEmoji = statusInfo.emoji;

    return health;
}

// Find all agent files
function findAgents() {
    const agents = [];
    
    // Check main agents directory
    if (fs.existsSync(AGENTS_DIR)) {
        const files = fs.readdirSync(AGENTS_DIR);
        for (const file of files) {
            if (file.endsWith('.yaml')) {
                agents.push(path.join(AGENTS_DIR, file));
            }
        }
    }

    // Check management subdirectory
    const mgmtDir = path.join(PROJECT_ROOT, '..', 'agents', 'management');
    if (fs.existsSync(mgmtDir)) {
        const files = fs.readdirSync(mgmtDir);
        for (const file of files) {
            if (file.endsWith('.yaml')) {
                agents.push(path.join(mgmtDir, file));
            }
        }
    }

    return agents;
}

// Generate health recommendations
function generateRecommendations(healthData) {
    const recommendations = [];

    // Critical agents needing attention
    const critical = healthData.agents.filter(a => a.status === 'Critical');
    if (critical.length > 0) {
        recommendations.push({
            priority: 'HIGH',
            message: `${critical.length} agents in critical condition require immediate attention`,
            agents: critical.map(a => a.name)
        });
    }

    // Agents with missing stage field
    const noStage = healthData.agents.filter(a => !a.stage);
    if (noStage.length > 0) {
        recommendations.push({
            priority: 'MEDIUM',
            message: `${noStage.length} agents missing stage field (required for compliance)`,
            agents: noStage.map(a => a.name)
        });
    }

    // Development agents that should be promoted
    const devAgents = healthData.agents.filter(a => 
        a.stage === 'development' && a.score >= 90
    );
    if (devAgents.length > 0) {
        recommendations.push({
            priority: 'LOW',
            message: `${devAgents.length} development agents ready for staging`,
            agents: devAgents.map(a => a.name)
        });
    }

    // Agents with dependency issues
    const depIssues = healthData.agents.filter(a => 
        a.checks.dependenciesAvailable === false
    );
    if (depIssues.length > 0) {
        recommendations.push({
            priority: 'MEDIUM',
            message: `${depIssues.length} agents have missing dependencies`,
            agents: depIssues.map(a => a.name)
        });
    }

    return recommendations;
}

// Main monitoring function
async function monitorAgentHealth() {
    log('\n========================================', 'bright');
    log('Agent Health Monitoring System', 'bright');
    log('========================================\n', 'bright');

    const healthData = {
        timestamp: new Date().toISOString(),
        summary: {
            total: 0,
            healthy: 0,
            warning: 0,
            critical: 0,
            avgScore: 0
        },
        agents: [],
        recommendations: []
    };

    // Find all agents
    log('Discovering agents...', 'blue');
    const agentPaths = findAgents();
    
    if (agentPaths.length === 0) {
        logError('No agents found to monitor');
        return;
    }

    logInfo(`Found ${agentPaths.length} agents to monitor\n`);

    // Check each agent
    for (const agentPath of agentPaths) {
        const health = await checkAgentHealth(agentPath);
        healthData.agents.push(health);
        
        // Update summary
        healthData.summary.total++;
        if (health.status === 'Healthy') healthData.summary.healthy++;
        else if (health.status === 'Warning' || health.status === 'Degraded') healthData.summary.warning++;
        else if (health.status === 'Critical') healthData.summary.critical++;
        
        // Display agent status
        const statusInfo = getHealthStatus(health.score);
        console.log(
            `${statusInfo.emoji} ${health.name.padEnd(30)} ` +
            `${colors[statusInfo.color]}${health.status.padEnd(10)}${colors.reset} ` +
            `Score: ${health.score}% ` +
            `${health.stage ? `[${health.stage}]` : '[no stage]'}`
        );
        
        // Show issues for problematic agents
        if (health.issues.length > 0 && health.score < 70) {
            for (const issue of health.issues.slice(0, 2)) {
                console.log(`  ${colors.gray}└─ ${issue}${colors.reset}`);
            }
        }
    }

    // Calculate average score
    if (healthData.agents.length > 0) {
        healthData.summary.avgScore = Math.round(
            healthData.agents.reduce((sum, a) => sum + a.score, 0) / healthData.agents.length
        );
    }

    // Generate recommendations
    healthData.recommendations = generateRecommendations(healthData);

    // Save health report
    fs.writeFileSync(HEALTH_REPORT_FILE, JSON.stringify(healthData, null, 2));
    
    // Display summary
    log('\n========================================', 'bright');
    log('Health Summary', 'bright');
    log('========================================\n', 'bright');

    const overallStatus = getHealthStatus(healthData.summary.avgScore);
    console.log(`Overall Health: ${overallStatus.emoji} ${colors[overallStatus.color]}${overallStatus.status}${colors.reset}`);
    console.log(`Average Score: ${healthData.summary.avgScore}%\n`);

    console.log(`Status Distribution:`);
    console.log(`  🟢 Healthy:  ${healthData.summary.healthy} agents`);
    console.log(`  🟡 Warning:  ${healthData.summary.warning} agents`);
    console.log(`  🔴 Critical: ${healthData.summary.critical} agents`);

    // Display recommendations
    if (healthData.recommendations.length > 0) {
        log('\nRecommendations:', 'blue');
        for (const rec of healthData.recommendations) {
            const priorityColor = rec.priority === 'HIGH' ? 'red' : 
                                 rec.priority === 'MEDIUM' ? 'yellow' : 'gray';
            console.log(`  ${colors[priorityColor]}[${rec.priority}]${colors.reset} ${rec.message}`);
            if (rec.agents && rec.agents.length <= 3) {
                console.log(`    Agents: ${rec.agents.join(', ')}`);
            }
        }
    }

    logSuccess(`\nHealth report saved to ${path.relative(PROJECT_ROOT, HEALTH_REPORT_FILE)}`);
    
    return healthData;
}

// Continuous monitoring mode
function startContinuousMonitoring(intervalMinutes = 5) {
    log('Starting continuous monitoring mode...', 'blue');
    log(`Monitoring interval: ${intervalMinutes} minutes\n`, 'blue');
    
    // Initial check
    monitorAgentHealth();
    
    // Set up interval
    setInterval(() => {
        console.log('\n' + '='.repeat(40));
        console.log(`Health check at ${new Date().toISOString()}`);
        console.log('='.repeat(40) + '\n');
        monitorAgentHealth();
    }, intervalMinutes * 60 * 1000);
    
    // Handle graceful shutdown
    process.on('SIGINT', () => {
        log('\n\nStopping health monitoring...', 'yellow');
        process.exit(0);
    });
}

// Export functions for use in other scripts
module.exports = {
    checkAgentHealth,
    monitorAgentHealth,
    calculateHealthScore,
    checkConfigValidity,
    checkDependencies
};

// Check if js-yaml is installed
function checkDependencies() {
    try {
        require.resolve('js-yaml');
        return true;
    } catch (e) {
        log('Installing required dependencies...', 'yellow');
        try {
            execSync('npm install js-yaml', { 
                stdio: 'inherit',
                cwd: PROJECT_ROOT
            });
            return true;
        } catch (installError) {
            logError('Failed to install dependencies. Please run: npm install js-yaml');
            return false;
        }
    }
}

// Run if executed directly
if (require.main === module) {
    if (!checkDependencies()) {
        process.exit(1);
    }

    const args = process.argv.slice(2);
    
    if (args.includes('--continuous') || args.includes('-c')) {
        const intervalIndex = args.findIndex(a => a === '--interval' || a === '-i');
        const interval = intervalIndex >= 0 && args[intervalIndex + 1] ? 
                        parseInt(args[intervalIndex + 1]) : 5;
        startContinuousMonitoring(interval);
    } else {
        monitorAgentHealth().catch(error => {
            logError(`Monitoring failed: ${error.message}`);
            process.exit(1);
        });
    }
}