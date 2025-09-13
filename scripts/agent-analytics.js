#!/usr/bin/env node

/**
 * Agent Analytics System
 * Tracks and analyzes agent performance, usage patterns, and ROI
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Configuration
const CONFIG = {
  dataDir: path.join(process.cwd(), '.claude', 'analytics'),
  reportsDir: path.join(process.cwd(), '.claude', 'reports'),
  metricsFile: path.join(process.cwd(), '.claude', 'logs', 'agent-metrics.json'),
  sessionLog: path.join(process.cwd(), '.claude', 'logs', 'sessions.jsonl')
};

// Ensure directories exist
[CONFIG.dataDir, CONFIG.reportsDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

class AgentAnalytics {
  constructor() {
    this.data = this.loadAnalyticsData();
    this.metrics = this.loadMetrics();
  }

  // Load analytics data
  loadAnalyticsData() {
    const dataFile = path.join(CONFIG.dataDir, 'analytics.json');
    if (fs.existsSync(dataFile)) {
      return JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    }
    return {
      agents: {},
      workflows: {},
      patterns: {},
      roi: {},
      timestamps: {
        created: new Date().toISOString(),
        lastUpdated: new Date().toISOString()
      }
    };
  }

  // Load metrics from monitor
  loadMetrics() {
    if (fs.existsSync(CONFIG.metricsFile)) {
      return JSON.parse(fs.readFileSync(CONFIG.metricsFile, 'utf8'));
    }
    return { agentUsage: {}, missedOpportunities: [] };
  }

  // Save analytics data
  saveAnalyticsData() {
    this.data.timestamps.lastUpdated = new Date().toISOString();
    fs.writeFileSync(
      path.join(CONFIG.dataDir, 'analytics.json'),
      JSON.stringify(this.data, null, 2)
    );
  }

  // Track agent invocation
  trackInvocation(agent, context = {}) {
    if (!this.data.agents[agent]) {
      this.data.agents[agent] = {
        invocations: 0,
        successes: 0,
        failures: 0,
        totalTime: 0,
        contexts: [],
        patterns: {},
        performance: {
          avgTime: 0,
          p95Time: 0,
          p99Time: 0
        }
      };
    }

    const agentData = this.data.agents[agent];
    agentData.invocations++;
    
    if (context.success) {
      agentData.successes++;
    } else if (context.success === false) {
      agentData.failures++;
    }

    if (context.duration) {
      agentData.totalTime += context.duration;
      agentData.avgTime = agentData.totalTime / agentData.invocations;
    }

    // Track context patterns
    if (context.trigger) {
      agentData.patterns[context.trigger] = (agentData.patterns[context.trigger] || 0) + 1;
    }

    agentData.contexts.push({
      timestamp: new Date().toISOString(),
      ...context
    });

    // Keep only last 1000 contexts
    if (agentData.contexts.length > 1000) {
      agentData.contexts = agentData.contexts.slice(-1000);
    }

    this.saveAnalyticsData();
  }

  // Calculate agent effectiveness
  calculateEffectiveness(agent) {
    const agentData = this.data.agents[agent];
    if (!agentData || agentData.invocations === 0) {
      return { score: 0, metrics: {} };
    }

    const successRate = agentData.successes / agentData.invocations;
    const avgTime = agentData.avgTime || 0;
    const utilizationRate = this.calculateUtilization(agent);

    // Weighted effectiveness score
    const score = (
      successRate * 0.4 +           // 40% weight on success
      (1 - avgTime / 60000) * 0.3 + // 30% weight on speed (normalized to 60s)
      utilizationRate * 0.3          // 30% weight on utilization
    );

    return {
      score: Math.max(0, Math.min(1, score)),
      metrics: {
        successRate,
        avgTime,
        utilizationRate,
        invocations: agentData.invocations
      }
    };
  }

  // Calculate utilization rate
  calculateUtilization(agent) {
    // Compare actual usage to expected usage based on patterns
    const expectedPatterns = {
      'release-coordinator': ['merge.*main', 'deploy', 'release'],
      'quality-control-analyzer': ['recurring', 'pattern', 'friction'],
      'sequential-planner': ['complex', 'unknown', 'planning']
    };

    const patterns = expectedPatterns[agent];
    if (!patterns) return 0.5; // Default utilization

    // Check missed opportunities
    const missed = this.metrics.missedOpportunities.filter(m => 
      m.missed.some(a => a.expected === agent)
    ).length;

    const agentData = this.data.agents[agent] || { invocations: 0 };
    const total = agentData.invocations + missed;

    return total > 0 ? agentData.invocations / total : 0;
  }

  // Calculate ROI metrics
  calculateROI(agent) {
    const agentData = this.data.agents[agent];
    if (!agentData || agentData.invocations === 0) {
      return { timeSaved: 0, errorsPrevented: 0, value: 0 };
    }

    // Estimated time saved per invocation (in minutes)
    const timeSavings = {
      'release-coordinator': 30,        // 30 min manual coordination
      'project-orchestrator': 45,        // 45 min cross-repo work
      'sequential-planner': 60,          // 60 min planning
      'sfdc-conflict-resolver': 20,      // 20 min debugging
      'sfdc-merge-orchestrator': 40,     // 40 min manual merge
      'quality-control-analyzer': 15,    // 15 min pattern analysis
      'default': 10                      // 10 min default
    };

    const timePerInvocation = timeSavings[agent] || timeSavings.default;
    const totalTimeSaved = agentData.invocations * timePerInvocation;

    // Estimate errors prevented (based on success rate improvement)
    const baseErrorRate = 0.15; // Assume 15% error rate without agents
    const agentErrorRate = agentData.failures / agentData.invocations;
    const errorsPrevented = Math.max(0, (baseErrorRate - agentErrorRate) * agentData.invocations);

    // Calculate monetary value (assuming $100/hour developer time)
    const hourlyRate = 100;
    const value = (totalTimeSaved / 60) * hourlyRate + (errorsPrevented * 200); // $200 per error prevented

    return {
      timeSaved: totalTimeSaved,
      errorsPrevented: Math.round(errorsPrevented),
      value: Math.round(value)
    };
  }

  // Analyze usage patterns
  analyzePatterns() {
    const patterns = {
      hourly: {},
      daily: {},
      weekly: {},
      triggers: {},
      sequences: []
    };

    // Analyze all agent invocations
    for (const [agent, data] of Object.entries(this.data.agents)) {
      for (const context of data.contexts) {
        const date = new Date(context.timestamp);
        const hour = date.getHours();
        const day = date.getDay();
        const week = Math.floor(date.getTime() / (7 * 24 * 60 * 60 * 1000));

        // Hourly patterns
        patterns.hourly[hour] = (patterns.hourly[hour] || 0) + 1;

        // Daily patterns
        patterns.daily[day] = (patterns.daily[day] || 0) + 1;

        // Weekly patterns
        patterns.weekly[week] = (patterns.weekly[week] || 0) + 1;

        // Trigger patterns
        if (context.trigger) {
          patterns.triggers[context.trigger] = (patterns.triggers[context.trigger] || 0) + 1;
        }
      }
    }

    // Detect common sequences
    patterns.sequences = this.detectSequences();

    return patterns;
  }

  // Detect common agent sequences
  detectSequences() {
    const sequences = {};
    const allContexts = [];

    // Collect all contexts with timestamps
    for (const [agent, data] of Object.entries(this.data.agents)) {
      for (const context of data.contexts) {
        allContexts.push({ agent, timestamp: context.timestamp, ...context });
      }
    }

    // Sort by timestamp
    allContexts.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    // Find sequences (agents used within 5 minutes of each other)
    for (let i = 0; i < allContexts.length - 1; i++) {
      const current = allContexts[i];
      const next = allContexts[i + 1];
      
      const timeDiff = new Date(next.timestamp) - new Date(current.timestamp);
      if (timeDiff < 5 * 60 * 1000) { // Within 5 minutes
        const sequence = `${current.agent} → ${next.agent}`;
        sequences[sequence] = (sequences[sequence] || 0) + 1;
      }
    }

    // Return top sequences
    return Object.entries(sequences)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([seq, count]) => ({ sequence: seq, count }));
  }

  // Generate comprehensive report
  generateReport() {
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        totalAgents: Object.keys(this.data.agents).length,
        totalInvocations: 0,
        totalSuccesses: 0,
        totalFailures: 0,
        totalTimeSaved: 0,
        totalValue: 0
      },
      agents: {},
      patterns: this.analyzePatterns(),
      recommendations: [],
      trends: []
    };

    // Analyze each agent
    for (const [agent, data] of Object.entries(this.data.agents)) {
      const effectiveness = this.calculateEffectiveness(agent);
      const roi = this.calculateROI(agent);

      report.agents[agent] = {
        invocations: data.invocations,
        successes: data.successes,
        failures: data.failures,
        effectiveness: effectiveness.score,
        metrics: effectiveness.metrics,
        roi,
        topTriggers: Object.entries(data.patterns)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
      };

      // Update summary
      report.summary.totalInvocations += data.invocations;
      report.summary.totalSuccesses += data.successes;
      report.summary.totalFailures += data.failures;
      report.summary.totalTimeSaved += roi.timeSaved;
      report.summary.totalValue += roi.value;
    }

    // Generate recommendations
    report.recommendations = this.generateRecommendations(report);

    // Identify trends
    report.trends = this.identifyTrends();

    return report;
  }

  // Generate recommendations based on analytics
  generateRecommendations(report) {
    const recommendations = [];

    // Check for underutilized agents
    const underutilized = Object.entries(report.agents)
      .filter(([_, data]) => data.effectiveness < 0.3)
      .map(([agent, _]) => agent);

    if (underutilized.length > 0) {
      recommendations.push({
        type: 'UTILIZATION',
        priority: 'MEDIUM',
        message: `Underutilized agents: ${underutilized.join(', ')}`,
        action: 'Review agent triggers and promote usage'
      });
    }

    // Check for high-failure agents
    const highFailure = Object.entries(report.agents)
      .filter(([_, data]) => data.failures / data.invocations > 0.2)
      .map(([agent, _]) => agent);

    if (highFailure.length > 0) {
      recommendations.push({
        type: 'RELIABILITY',
        priority: 'HIGH',
        message: `High failure rate agents: ${highFailure.join(', ')}`,
        action: 'Investigate and fix agent configurations'
      });
    }

    // Check for missed opportunities
    if (this.metrics.missedOpportunities.length > 10) {
      recommendations.push({
        type: 'MISSED_OPPORTUNITIES',
        priority: 'HIGH',
        message: `${this.metrics.missedOpportunities.length} missed agent opportunities detected`,
        action: 'Update CLAUDE.md with better triggers'
      });
    }

    // Suggest workflow automation
    const topSequences = report.patterns.sequences.slice(0, 3);
    if (topSequences.length > 0) {
      recommendations.push({
        type: 'AUTOMATION',
        priority: 'LOW',
        message: `Common sequences detected: ${topSequences.map(s => s.sequence).join(', ')}`,
        action: 'Consider creating automated workflows'
      });
    }

    return recommendations;
  }

  // Identify trends over time
  identifyTrends() {
    const trends = [];
    const now = new Date();
    const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);

    for (const [agent, data] of Object.entries(this.data.agents)) {
      const recentContexts = data.contexts.filter(c => 
        new Date(c.timestamp) > weekAgo
      );

      const oldContexts = data.contexts.filter(c => 
        new Date(c.timestamp) <= weekAgo
      );

      if (recentContexts.length > 0 && oldContexts.length > 0) {
        const recentAvg = recentContexts.length / 7; // Per day
        const oldAvg = oldContexts.length / Math.max(1, data.contexts.length - recentContexts.length) * 7;

        const change = ((recentAvg - oldAvg) / oldAvg) * 100;

        if (Math.abs(change) > 20) {
          trends.push({
            agent,
            change: change.toFixed(1),
            direction: change > 0 ? 'increasing' : 'decreasing',
            significance: Math.abs(change) > 50 ? 'HIGH' : 'MEDIUM'
          });
        }
      }
    }

    return trends;
  }

  // Export report to file
  exportReport(format = 'json') {
    const report = this.generateReport();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `agent-analytics-${timestamp}.${format}`;
    const filepath = path.join(CONFIG.reportsDir, filename);

    if (format === 'json') {
      fs.writeFileSync(filepath, JSON.stringify(report, null, 2));
    } else if (format === 'md') {
      const markdown = this.reportToMarkdown(report);
      fs.writeFileSync(filepath, markdown);
    }

    return filepath;
  }

  // Convert report to markdown
  reportToMarkdown(report) {
    let md = `# Agent Analytics Report\n\n`;
    md += `Generated: ${report.timestamp}\n\n`;

    md += `## Summary\n\n`;
    md += `- Total Agents: ${report.summary.totalAgents}\n`;
    md += `- Total Invocations: ${report.summary.totalInvocations}\n`;
    md += `- Success Rate: ${((report.summary.totalSuccesses / report.summary.totalInvocations) * 100).toFixed(1)}%\n`;
    md += `- Time Saved: ${report.summary.totalTimeSaved} minutes\n`;
    md += `- Estimated Value: $${report.summary.totalValue}\n\n`;

    md += `## Agent Performance\n\n`;
    md += `| Agent | Invocations | Success Rate | Effectiveness | ROI |\n`;
    md += `|-------|-------------|--------------|---------------|-----|\n`;

    for (const [agent, data] of Object.entries(report.agents)) {
      const successRate = ((data.successes / data.invocations) * 100).toFixed(1);
      const effectiveness = (data.effectiveness * 100).toFixed(1);
      md += `| ${agent} | ${data.invocations} | ${successRate}% | ${effectiveness}% | $${data.roi.value} |\n`;
    }

    md += `\n## Recommendations\n\n`;
    for (const rec of report.recommendations) {
      md += `- **${rec.priority}**: ${rec.message}\n`;
      md += `  - Action: ${rec.action}\n`;
    }

    md += `\n## Trends\n\n`;
    for (const trend of report.trends) {
      md += `- ${trend.agent}: ${trend.direction} by ${trend.change}%\n`;
    }

    return md;
  }

  // Display dashboard
  displayDashboard() {
    const report = this.generateReport();

    console.log('📊 Agent Analytics Dashboard');
    console.log('============================\n');

    console.log('📈 Summary');
    console.log('----------');
    console.log(`Total Invocations: ${report.summary.totalInvocations}`);
    console.log(`Success Rate: ${((report.summary.totalSuccesses / report.summary.totalInvocations) * 100).toFixed(1)}%`);
    console.log(`Time Saved: ${report.summary.totalTimeSaved} minutes`);
    console.log(`Estimated Value: $${report.summary.totalValue}\n`);

    console.log('🏆 Top Performing Agents');
    console.log('------------------------');
    const topAgents = Object.entries(report.agents)
      .sort((a, b) => b[1].effectiveness - a[1].effectiveness)
      .slice(0, 5);

    for (const [agent, data] of topAgents) {
      console.log(`${agent}:`);
      console.log(`  Effectiveness: ${(data.effectiveness * 100).toFixed(1)}%`);
      console.log(`  Invocations: ${data.invocations}`);
      console.log(`  ROI: $${data.roi.value}`);
    }

    console.log('\n💡 Recommendations');
    console.log('------------------');
    for (const rec of report.recommendations) {
      console.log(`[${rec.priority}] ${rec.message}`);
      console.log(`  → ${rec.action}`);
    }

    console.log('\n📈 Trends');
    console.log('---------');
    for (const trend of report.trends) {
      const arrow = trend.direction === 'increasing' ? '↑' : '↓';
      console.log(`${arrow} ${trend.agent}: ${trend.change}%`);
    }

    console.log('\n🔗 Common Sequences');
    console.log('-------------------');
    for (const seq of report.patterns.sequences.slice(0, 5)) {
      console.log(`${seq.sequence} (${seq.count} times)`);
    }
  }
}

// CLI Interface
if (require.main === module) {
  const analytics = new AgentAnalytics();
  const args = process.argv.slice(2);

  if (args.includes('--dashboard')) {
    analytics.displayDashboard();
  } else if (args.includes('--export')) {
    const format = args.includes('--markdown') ? 'md' : 'json';
    const filepath = analytics.exportReport(format);
    console.log(`Report exported to: ${filepath}`);
  } else if (args.includes('--track')) {
    // Track a sample invocation
    const agent = args[args.indexOf('--track') + 1];
    const success = !args.includes('--failed');
    
    analytics.trackInvocation(agent, {
      success,
      duration: Math.random() * 30000,
      trigger: 'manual'
    });
    
    console.log(`Tracked invocation for ${agent}`);
  } else {
    console.log('Agent Analytics System');
    console.log('Usage:');
    console.log('  node agent-analytics.js --dashboard      Show analytics dashboard');
    console.log('  node agent-analytics.js --export         Export JSON report');
    console.log('  node agent-analytics.js --export --markdown  Export Markdown report');
    console.log('  node agent-analytics.js --track <agent>  Track agent invocation');
  }
}

module.exports = { AgentAnalytics };