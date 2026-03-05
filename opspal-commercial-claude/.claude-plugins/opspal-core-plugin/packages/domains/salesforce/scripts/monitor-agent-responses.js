#!/usr/bin/env node

/**
 * Agent Response Monitor
 * Real-time monitoring system for detecting fake/simulated responses from sub-agents
 *
 * Usage:
 *   node monitor-agent-responses.js                    # Monitor all agents
 *   node monitor-agent-responses.js --agent sfdc-lucid # Monitor specific agent
 *   node monitor-agent-responses.js --report           # Generate report
 */

const fs = require('fs');
const path = require('path');
const { AgentResponseValidator } = require('./lib/agent-response-validator');

class AgentResponseMonitor {
  constructor(config = {}) {
    this.validator = new AgentResponseValidator({
      strictMode: true,
      logValidation: true,
      blockFakeData: config.blockFakeData || false
    });

    this.logDir = path.join(process.cwd(), 'logs', 'agent-responses');
    this.monitoringActive = false;
    this.stats = {
      totalResponses: 0,
      validResponses: 0,
      invalidResponses: 0,
      warningResponses: 0,
      agentBreakdown: {},
      commonIssues: {},
      startTime: new Date()
    };
  }

  /**
   * Start monitoring agent responses
   */
  async startMonitoring(options = {}) {
    console.log('🔍 Starting Agent Response Monitor...');
    console.log(`Monitoring directory: ${this.logDir}`);

    this.monitoringActive = true;

    // Create log directory if it doesn't exist
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }

    // Watch for new log files
    if (options.realtime) {
      this.watchLogs(options.agent);
    }

    // Process existing logs
    await this.processExistingLogs(options.agent);

    // Display stats periodically
    if (options.showStats) {
      setInterval(() => this.displayStats(), 30000); // Every 30 seconds
    }

    console.log('✅ Monitoring active. Press Ctrl+C to stop.\n');
  }

  /**
   * Watch for new log entries in real-time
   */
  watchLogs(specificAgent) {
    const watchFile = path.join(this.logDir, 'agent-responses.jsonl');

    if (!fs.existsSync(watchFile)) {
      fs.writeFileSync(watchFile, '');
    }

    // Watch for changes
    fs.watchFile(watchFile, { interval: 1000 }, (curr, prev) => {
      if (curr.mtime > prev.mtime) {
        this.processNewEntries(watchFile, prev.size, specificAgent);
      }
    });
  }

  /**
   * Process new log entries
   */
  processNewEntries(file, previousSize, specificAgent) {
    const content = fs.readFileSync(file, 'utf8');
    const newContent = content.substring(previousSize);
    const lines = newContent.split('\n').filter(line => line.trim());

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (!specificAgent || entry.agentName === specificAgent) {
          this.analyzeResponse(entry);
        }
      } catch (error) {
        console.error('Failed to parse log entry:', error.message);
      }
    }
  }

  /**
   * Analyze a single response
   */
  analyzeResponse(entry) {
    const validation = this.validator.validateResponse(
      entry.response || entry,
      entry.agentName || 'unknown'
    );

    // Update stats
    this.stats.totalResponses++;

    if (validation.valid) {
      this.stats.validResponses++;
    } else {
      this.stats.invalidResponses++;
      this.logIssue(validation);
    }

    if (validation.warnings.length > 0) {
      this.stats.warningResponses++;
    }

    // Update agent breakdown
    const agent = entry.agentName || 'unknown';
    if (!this.stats.agentBreakdown[agent]) {
      this.stats.agentBreakdown[agent] = {
        total: 0,
        valid: 0,
        invalid: 0,
        warnings: 0
      };
    }

    this.stats.agentBreakdown[agent].total++;
    if (validation.valid) this.stats.agentBreakdown[agent].valid++;
    else this.stats.agentBreakdown[agent].invalid++;
    if (validation.warnings.length > 0) this.stats.agentBreakdown[agent].warnings++;

    // Track common issues
    for (const issue of validation.issues) {
      const issueType = this.categorizeIssue(issue);
      this.stats.commonIssues[issueType] = (this.stats.commonIssues[issueType] || 0) + 1;
    }

    // Display real-time alert for critical issues
    if (!validation.valid && validation.score < 50) {
      this.displayAlert(entry.agentName, validation);
    }
  }

  /**
   * Categorize issue type
   */
  categorizeIssue(issue) {
    if (issue.includes('Fake ID')) return 'fake_ids';
    if (issue.includes('Fake URL')) return 'fake_urls';
    if (issue.includes('Template phrase')) return 'template_responses';
    if (issue.includes('Generic name')) return 'generic_names';
    if (issue.includes('Salesforce ID')) return 'invalid_sf_ids';
    return 'other';
  }

  /**
   * Display real-time alert
   */
  displayAlert(agentName, validation) {
    console.log('\n🚨 FAKE DATA DETECTED 🚨');
    console.log(`Agent: ${agentName}`);
    console.log(`Score: ${validation.score}/100`);
    console.log('Issues:');
    validation.issues.forEach(issue => console.log(`  - ${issue}`));
    console.log(`Recommendation: ${validation.recommendation}\n`);
  }

  /**
   * Log issue for later analysis
   */
  logIssue(validation) {
    const issueFile = path.join(this.logDir, 'detected-issues.jsonl');
    const issueEntry = {
      timestamp: new Date().toISOString(),
      ...validation
    };

    fs.appendFileSync(issueFile, JSON.stringify(issueEntry) + '\n');
  }

  /**
   * Process existing log files
   */
  async processExistingLogs(specificAgent) {
    const files = fs.readdirSync(this.logDir)
      .filter(f => f.endsWith('.jsonl'))
      .map(f => path.join(this.logDir, f));

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n').filter(line => line.trim());

      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          if (!specificAgent || entry.agentName === specificAgent) {
            this.analyzeResponse(entry);
          }
        } catch (error) {
          // Skip malformed entries
        }
      }
    }
  }

  /**
   * Display current statistics
   */
  displayStats() {
    const runtime = Math.floor((Date.now() - this.stats.startTime) / 1000);
    const validRate = this.stats.totalResponses > 0
      ? ((this.stats.validResponses / this.stats.totalResponses) * 100).toFixed(1)
      : 0;

    console.clear();
    console.log('═══════════════════════════════════════════════');
    console.log('     AGENT RESPONSE MONITOR - LIVE STATS       ');
    console.log('═══════════════════════════════════════════════');
    console.log(`Runtime: ${this.formatTime(runtime)}`);
    console.log(`Total Responses: ${this.stats.totalResponses}`);
    console.log(`Valid: ${this.stats.validResponses} (${validRate}%)`);
    console.log(`Invalid: ${this.stats.invalidResponses}`);
    console.log(`Warnings: ${this.stats.warningResponses}`);
    console.log('\nAgent Breakdown:');
    console.log('─────────────────────────────────────────');

    for (const [agent, stats] of Object.entries(this.stats.agentBreakdown)) {
      const agentValidRate = stats.total > 0
        ? ((stats.valid / stats.total) * 100).toFixed(1)
        : 0;
      console.log(`${agent.padEnd(25)} | Total: ${stats.total.toString().padStart(4)} | Valid: ${agentValidRate}%`);
    }

    console.log('\nTop Issues:');
    console.log('─────────────────────────────────────────');

    const sortedIssues = Object.entries(this.stats.commonIssues)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    for (const [issue, count] of sortedIssues) {
      console.log(`${issue.padEnd(25)} | ${count} occurrences`);
    }

    console.log('═══════════════════════════════════════════════\n');
  }

  /**
   * Generate detailed report
   */
  async generateReport() {
    console.log('📊 Generating Agent Response Report...\n');

    await this.processExistingLogs();

    const report = {
      generatedAt: new Date().toISOString(),
      summary: {
        totalResponses: this.stats.totalResponses,
        validResponses: this.stats.validResponses,
        invalidResponses: this.stats.invalidResponses,
        warningResponses: this.stats.warningResponses,
        validationRate: ((this.stats.validResponses / this.stats.totalResponses) * 100).toFixed(2) + '%'
      },
      agentPerformance: this.stats.agentBreakdown,
      commonIssues: this.stats.commonIssues,
      recommendations: this.generateRecommendations()
    };

    // Save report
    const reportFile = path.join(
      this.logDir,
      `report-${new Date().toISOString().split('T')[0]}.json`
    );
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));

    // Display report
    console.log('AGENT RESPONSE VALIDATION REPORT');
    console.log('═══════════════════════════════════════════════');
    console.log(`Generated: ${report.generatedAt}`);
    console.log('\nSUMMARY:');
    console.log(`  Total Responses: ${report.summary.totalResponses}`);
    console.log(`  Validation Rate: ${report.summary.validationRate}`);
    console.log(`  Invalid Responses: ${report.summary.invalidResponses}`);
    console.log(`  Warning Responses: ${report.summary.warningResponses}`);

    console.log('\nAGENT PERFORMANCE:');
    for (const [agent, stats] of Object.entries(report.agentPerformance)) {
      const rate = ((stats.valid / stats.total) * 100).toFixed(1);
      const status = rate > 90 ? '✅' : rate > 70 ? '⚠️' : '❌';
      console.log(`  ${status} ${agent}: ${rate}% valid (${stats.total} total)`);
    }

    console.log('\nTOP ISSUES:');
    const sortedIssues = Object.entries(report.commonIssues)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    for (const [issue, count] of sortedIssues) {
      console.log(`  - ${issue}: ${count} occurrences`);
    }

    console.log('\nRECOMMENDATIONS:');
    report.recommendations.forEach(rec => console.log(`  • ${rec}`));

    console.log('\n✅ Report saved to:', reportFile);
  }

  /**
   * Generate recommendations based on findings
   */
  generateRecommendations() {
    const recommendations = [];

    // Check overall validation rate
    const validRate = (this.stats.validResponses / this.stats.totalResponses) * 100;
    if (validRate < 80) {
      recommendations.push('Critical: Overall validation rate below 80%. Review agent implementations.');
    }

    // Check for problematic agents
    for (const [agent, stats] of Object.entries(this.stats.agentBreakdown)) {
      const agentRate = (stats.valid / stats.total) * 100;
      if (agentRate < 70) {
        recommendations.push(`Update ${agent}: Validation rate ${agentRate.toFixed(1)}% is below acceptable threshold.`);
      }
    }

    // Check common issues
    if (this.stats.commonIssues.fake_ids > 10) {
      recommendations.push('Implement ID validation in all agents to prevent placeholder IDs.');
    }

    if (this.stats.commonIssues.fake_urls > 10) {
      recommendations.push('Add URL validation to ensure all URLs point to real services.');
    }

    if (this.stats.commonIssues.template_responses > 10) {
      recommendations.push('Review agent prompts to eliminate template response patterns.');
    }

    // Add general recommendations
    if (recommendations.length === 0) {
      recommendations.push('System operating within acceptable parameters.');
    }

    recommendations.push('Consider implementing automated testing for agent responses.');
    recommendations.push('Review and update agent instructions quarterly.');

    return recommendations;
  }

  /**
   * Format time in human-readable format
   */
  formatTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const monitor = new AgentResponseMonitor();

  if (args.includes('--report')) {
    monitor.generateReport();
  } else {
    const options = {
      realtime: !args.includes('--no-realtime'),
      showStats: !args.includes('--no-stats'),
      agent: null
    };

    // Check for specific agent
    const agentIndex = args.indexOf('--agent');
    if (agentIndex !== -1 && args[agentIndex + 1]) {
      options.agent = args[agentIndex + 1];
      console.log(`Monitoring specific agent: ${options.agent}`);
    }

    monitor.startMonitoring(options);

    // Handle graceful shutdown
    process.on('SIGINT', () => {
      console.log('\n\n📊 Final Statistics:');
      monitor.displayStats();
      console.log('Monitor stopped.');
      process.exit(0);
    });
  }
}