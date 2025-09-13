#!/usr/bin/env node

/**
 * Agent Monitoring & Alerts System
 * Tracks agent usage, detects missed opportunities, and provides alerts
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Configuration
const CONFIG = {
  logDir: path.join(process.cwd(), '.claude', 'logs'),
  alertsFile: path.join(process.cwd(), '.claude', 'logs', 'agent-alerts.log'),
  metricsFile: path.join(process.cwd(), '.claude', 'logs', 'agent-metrics.json'),
  complexityThreshold: 0.7,
  alertThresholds: {
    missedOpportunity: 3,      // Alert after 3 missed opportunities
    lowUtilization: 0.2,        // Alert if agent used < 20% when expected
    errorRate: 0.1,             // Alert if error rate > 10%
    responseTime: 30000         // Alert if response > 30s
  }
};

// Ensure log directory exists
if (!fs.existsSync(CONFIG.logDir)) {
  fs.mkdirSync(CONFIG.logDir, { recursive: true });
}

// Alert types
const AlertType = {
  MISSED_OPPORTUNITY: 'MISSED_OPPORTUNITY',
  LOW_UTILIZATION: 'LOW_UTILIZATION',
  HIGH_ERROR_RATE: 'HIGH_ERROR_RATE',
  SLOW_RESPONSE: 'SLOW_RESPONSE',
  COMPLEXITY_BYPASS: 'COMPLEXITY_BYPASS',
  MERGE_WITHOUT_RELEASE: 'MERGE_WITHOUT_RELEASE'
};

// Agent usage patterns to monitor
const MONITORED_PATTERNS = {
  'merge to main': {
    expectedAgent: 'release-coordinator',
    severity: 'HIGH',
    message: 'Merged to main without using release-coordinator'
  },
  'deployment failed': {
    expectedAgent: 'sfdc-conflict-resolver',
    severity: 'HIGH',
    message: 'Deployment failure not handled by conflict resolver'
  },
  'recurring issue': {
    expectedAgent: 'quality-control-analyzer',
    severity: 'MEDIUM',
    message: 'Recurring issue not analyzed by quality agent'
  },
  'complex task': {
    expectedAgent: 'sequential-planner',
    severity: 'MEDIUM',
    message: 'Complex task attempted without planning'
  },
  'multi-repo': {
    expectedAgent: 'project-orchestrator',
    severity: 'MEDIUM',
    message: 'Multi-repo work without orchestration'
  }
};

class AgentMonitor {
  constructor() {
    this.metrics = this.loadMetrics();
    this.alerts = [];
  }

  // Load existing metrics
  loadMetrics() {
    if (fs.existsSync(CONFIG.metricsFile)) {
      return JSON.parse(fs.readFileSync(CONFIG.metricsFile, 'utf8'));
    }
    return {
      agentUsage: {},
      missedOpportunities: [],
      errors: [],
      performance: {},
      lastUpdated: new Date().toISOString()
    };
  }

  // Save metrics
  saveMetrics() {
    this.metrics.lastUpdated = new Date().toISOString();
    fs.writeFileSync(CONFIG.metricsFile, JSON.stringify(this.metrics, null, 2));
  }

  // Log agent usage
  logAgentUsage(agent, context = {}) {
    if (!this.metrics.agentUsage[agent]) {
      this.metrics.agentUsage[agent] = {
        count: 0,
        contexts: [],
        lastUsed: null,
        errors: 0,
        totalTime: 0
      };
    }
    
    const usage = this.metrics.agentUsage[agent];
    usage.count++;
    usage.lastUsed = new Date().toISOString();
    usage.contexts.push({
      timestamp: new Date().toISOString(),
      ...context
    });
    
    if (context.duration) {
      usage.totalTime += context.duration;
    }
    
    this.saveMetrics();
  }

  // Detect missed opportunities
  detectMissedOpportunity(userInput, actualResponse) {
    const lowerInput = userInput.toLowerCase();
    const missedAgents = [];
    
    for (const [pattern, config] of Object.entries(MONITORED_PATTERNS)) {
      if (lowerInput.includes(pattern)) {
        const expectedAgent = config.expectedAgent;
        const agentUsed = this.extractAgentFromResponse(actualResponse);
        
        if (agentUsed !== expectedAgent) {
          missedAgents.push({
            pattern,
            expected: expectedAgent,
            actual: agentUsed || 'none',
            severity: config.severity,
            message: config.message
          });
        }
      }
    }
    
    if (missedAgents.length > 0) {
      this.recordMissedOpportunities(userInput, missedAgents);
    }
    
    return missedAgents;
  }

  // Extract agent from response (simplified)
  extractAgentFromResponse(response) {
    const agentPattern = /using\s+(\w+-\w+)\s+agent/i;
    const match = response.match(agentPattern);
    return match ? match[1] : null;
  }

  // Record missed opportunities
  recordMissedOpportunities(input, missedAgents) {
    const opportunity = {
      timestamp: new Date().toISOString(),
      input: input.substring(0, 100),
      missed: missedAgents
    };
    
    this.metrics.missedOpportunities.push(opportunity);
    
    // Check if alert threshold reached
    const recentMisses = this.metrics.missedOpportunities.filter(m => {
      const hourAgo = new Date(Date.now() - 3600000);
      return new Date(m.timestamp) > hourAgo;
    });
    
    if (recentMisses.length >= CONFIG.alertThresholds.missedOpportunity) {
      this.createAlert(AlertType.MISSED_OPPORTUNITY, {
        count: recentMisses.length,
        agents: missedAgents
      });
    }
    
    this.saveMetrics();
  }

  // Analyze complexity and check if agent was used
  analyzeComplexity(task, agentUsed) {
    const complexityScore = this.calculateComplexity(task);
    
    if (complexityScore > CONFIG.complexityThreshold && !agentUsed) {
      this.createAlert(AlertType.COMPLEXITY_BYPASS, {
        task: task.substring(0, 100),
        complexity: complexityScore,
        recommendation: 'Use sequential-planner for complex tasks'
      });
    }
    
    return complexityScore;
  }

  // Calculate task complexity (simplified heuristic)
  calculateComplexity(task) {
    const complexityIndicators = [
      { pattern: /multi[- ]?repo/i, weight: 0.3 },
      { pattern: /cross[- ]?platform/i, weight: 0.3 },
      { pattern: /complex/i, weight: 0.2 },
      { pattern: /unknown/i, weight: 0.2 },
      { pattern: /merge.*field/i, weight: 0.2 },
      { pattern: /production/i, weight: 0.2 },
      { pattern: /\d{4,}/i, weight: 0.2 }, // Large numbers
      { pattern: /deploy/i, weight: 0.15 },
      { pattern: /migrate/i, weight: 0.15 }
    ];
    
    let score = 0;
    for (const indicator of complexityIndicators) {
      if (indicator.pattern.test(task)) {
        score += indicator.weight;
      }
    }
    
    return Math.min(score, 1.0);
  }

  // Create alert
  createAlert(type, details) {
    const alert = {
      type,
      timestamp: new Date().toISOString(),
      severity: this.getAlertSeverity(type),
      details,
      resolved: false
    };
    
    this.alerts.push(alert);
    this.logAlert(alert);
    
    // Send to Slack if configured
    if (process.env.SLACK_WEBHOOK_URL) {
      this.sendSlackAlert(alert);
    }
    
    return alert;
  }

  // Get alert severity
  getAlertSeverity(type) {
    const severityMap = {
      [AlertType.MISSED_OPPORTUNITY]: 'MEDIUM',
      [AlertType.LOW_UTILIZATION]: 'LOW',
      [AlertType.HIGH_ERROR_RATE]: 'HIGH',
      [AlertType.SLOW_RESPONSE]: 'MEDIUM',
      [AlertType.COMPLEXITY_BYPASS]: 'MEDIUM',
      [AlertType.MERGE_WITHOUT_RELEASE]: 'HIGH'
    };
    return severityMap[type] || 'LOW';
  }

  // Log alert to file
  logAlert(alert) {
    const logEntry = `[${alert.timestamp}] ${alert.severity} - ${alert.type}: ${JSON.stringify(alert.details)}\n`;
    fs.appendFileSync(CONFIG.alertsFile, logEntry);
  }

  // Send Slack alert
  sendSlackAlert(alert) {
    const message = {
      text: `🚨 Agent Monitor Alert`,
      attachments: [{
        color: alert.severity === 'HIGH' ? 'danger' : alert.severity === 'MEDIUM' ? 'warning' : 'good',
        title: `${alert.type}`,
        text: JSON.stringify(alert.details, null, 2),
        footer: 'RevPal Agent Monitor',
        ts: Math.floor(Date.now() / 1000)
      }]
    };
    
    try {
      execSync(`curl -X POST -H 'Content-type: application/json' --data '${JSON.stringify(message)}' ${process.env.SLACK_WEBHOOK_URL}`, {
        stdio: 'ignore'
      });
    } catch (error) {
      console.error('Failed to send Slack alert:', error.message);
    }
  }

  // Generate utilization report
  generateUtilizationReport() {
    const report = {
      timestamp: new Date().toISOString(),
      period: 'last_24_hours',
      agents: {},
      alerts: [],
      recommendations: []
    };
    
    // Calculate utilization for each agent
    for (const [agent, usage] of Object.entries(this.metrics.agentUsage)) {
      const dayAgo = new Date(Date.now() - 86400000);
      const recentUses = usage.contexts.filter(c => new Date(c.timestamp) > dayAgo).length;
      
      report.agents[agent] = {
        totalUses: usage.count,
        recentUses,
        lastUsed: usage.lastUsed,
        avgResponseTime: usage.totalTime / usage.count,
        errorRate: usage.errors / usage.count
      };
      
      // Check for low utilization
      if (recentUses === 0 && usage.count > 0) {
        report.alerts.push({
          type: 'LOW_UTILIZATION',
          agent,
          message: `${agent} has not been used in 24 hours`
        });
      }
      
      // Check error rate
      if (usage.errors / usage.count > CONFIG.alertThresholds.errorRate) {
        report.alerts.push({
          type: 'HIGH_ERROR_RATE',
          agent,
          errorRate: usage.errors / usage.count
        });
      }
    }
    
    // Add recommendations
    if (this.metrics.missedOpportunities.length > 10) {
      report.recommendations.push('Review missed opportunities and update agent triggers');
    }
    
    const underutilized = Object.entries(report.agents)
      .filter(([_, stats]) => stats.recentUses < 5)
      .map(([agent, _]) => agent);
    
    if (underutilized.length > 0) {
      report.recommendations.push(`Consider promoting these underutilized agents: ${underutilized.join(', ')}`);
    }
    
    return report;
  }

  // Monitor git operations for release coordination
  monitorGitOperations() {
    try {
      // Check recent git log
      const recentCommits = execSync('git log --oneline -n 10 --grep="Merge" 2>/dev/null', {
        encoding: 'utf8'
      });
      
      const mergeToMain = recentCommits.includes('into main') || recentCommits.includes('into master');
      
      if (mergeToMain) {
        // Check if release-coordinator was used recently
        const releaseAgent = this.metrics.agentUsage['release-coordinator'];
        if (!releaseAgent || !releaseAgent.lastUsed) {
          this.createAlert(AlertType.MERGE_WITHOUT_RELEASE, {
            message: 'Recent merge to main detected without release-coordinator usage',
            recommendation: 'Always use release-coordinator after merging to main'
          });
        }
      }
    } catch (error) {
      // Git not available or not a git repo
    }
  }

  // Real-time monitoring hook
  startRealTimeMonitoring() {
    console.log('🔍 Agent Monitor Started');
    console.log('=======================\n');
    
    // Monitor git operations
    this.monitorGitOperations();
    
    // Generate initial report
    const report = this.generateUtilizationReport();
    
    console.log('📊 Agent Utilization Report');
    console.log('---------------------------');
    
    for (const [agent, stats] of Object.entries(report.agents)) {
      console.log(`\n${agent}:`);
      console.log(`  Total uses: ${stats.totalUses}`);
      console.log(`  Recent uses (24h): ${stats.recentUses}`);
      console.log(`  Last used: ${stats.lastUsed || 'Never'}`);
      if (stats.errorRate > 0) {
        console.log(`  ⚠️  Error rate: ${(stats.errorRate * 100).toFixed(1)}%`);
      }
    }
    
    if (report.alerts.length > 0) {
      console.log('\n🚨 Alerts:');
      for (const alert of report.alerts) {
        console.log(`  - ${alert.type}: ${alert.message || JSON.stringify(alert)}`);
      }
    }
    
    if (report.recommendations.length > 0) {
      console.log('\n💡 Recommendations:');
      for (const rec of report.recommendations) {
        console.log(`  - ${rec}`);
      }
    }
    
    // Check for recent missed opportunities
    const recentMisses = this.metrics.missedOpportunities.slice(-5);
    if (recentMisses.length > 0) {
      console.log('\n⚠️  Recent Missed Opportunities:');
      for (const miss of recentMisses) {
        console.log(`  ${miss.timestamp}: ${miss.input}`);
        for (const agent of miss.missed) {
          console.log(`    Expected ${agent.expected} but got ${agent.actual}`);
        }
      }
    }
    
    console.log('\n✅ Monitoring active. Alerts will be logged to:', CONFIG.alertsFile);
  }
}

// CLI Interface
if (require.main === module) {
  const monitor = new AgentMonitor();
  const args = process.argv.slice(2);
  
  if (args.includes('--watch')) {
    // Start continuous monitoring
    monitor.startRealTimeMonitoring();
    
    // Set up interval for periodic checks
    setInterval(() => {
      monitor.monitorGitOperations();
      const report = monitor.generateUtilizationReport();
      
      if (report.alerts.length > 0) {
        console.log(`\n[${new Date().toISOString()}] New alerts detected`);
        for (const alert of report.alerts) {
          console.log(`  - ${alert.type}`);
        }
      }
    }, 300000); // Check every 5 minutes
    
    console.log('\nPress Ctrl+C to stop monitoring');
  } else if (args.includes('--report')) {
    // Generate one-time report
    monitor.startRealTimeMonitoring();
  } else if (args.includes('--test')) {
    // Test monitoring with sample data
    console.log('Testing monitoring system...\n');
    
    // Test missed opportunity detection
    const missed = monitor.detectMissedOpportunity(
      'I just merged the new features to main',
      'Great! The merge is complete.'
    );
    
    if (missed.length > 0) {
      console.log('✅ Missed opportunity detection working');
    }
    
    // Test complexity analysis
    const complexity = monitor.analyzeComplexity(
      'Migrate 50000 records from legacy system to Salesforce and HubSpot',
      false
    );
    
    console.log(`✅ Complexity analysis: ${(complexity * 100).toFixed(0)}%`);
    
    // Log sample usage
    monitor.logAgentUsage('release-coordinator', {
      duration: 15000,
      success: true
    });
    
    console.log('✅ Agent usage logging working');
    console.log('\nTest complete. Check', CONFIG.metricsFile);
  } else {
    console.log('Agent Monitoring System');
    console.log('Usage:');
    console.log('  node agent-monitor.js --watch    Start continuous monitoring');
    console.log('  node agent-monitor.js --report   Generate one-time report');
    console.log('  node agent-monitor.js --test     Test monitoring system');
  }
}

module.exports = { AgentMonitor, AlertType };