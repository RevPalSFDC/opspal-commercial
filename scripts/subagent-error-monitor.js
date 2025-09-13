#!/usr/bin/env node

/**
 * Subagent Error Monitoring Framework
 * 
 * Purpose: Real-time monitoring and detection of sub-agent execution issues,
 * particularly focusing on silent failures and fake data generation.
 * 
 * Features:
 * - Real-time monitoring of sub-agent executions
 * - Automatic detection of silent failures
 * - Error classification and severity scoring
 * - Immediate notification for data access issues
 * - Pattern detection for simulated data
 */

const fs = require('fs').promises;
const path = require('path');
const EventEmitter = require('events');
const { spawn } = require('child_process');

class SubagentErrorMonitor extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      logDir: config.logDir || path.join(process.cwd(), '.claude', 'logs', 'error-monitoring'),
      alertThreshold: config.alertThreshold || 'WARNING',
      realTimeMonitoring: config.realTimeMonitoring !== false,
      notificationWebhook: config.notificationWebhook || process.env.SLACK_WEBHOOK_URL,
      ...config
    };

    this.activeMonitors = new Map();
    this.errorPatterns = this.loadErrorPatterns();
    this.severityLevels = {
      CRITICAL: 1,
      HIGH: 2,
      MEDIUM: 3,
      LOW: 4,
      INFO: 5
    };
  }

  /**
   * Load error detection patterns
   */
  loadErrorPatterns() {
    return {
      silentFailures: [
        {
          pattern: /generating example data/i,
          severity: 'CRITICAL',
          message: 'Agent generating fake data instead of querying'
        },
        {
          pattern: /MCP tool unavailable|mcp.*not found/i,
          severity: 'HIGH',
          message: 'MCP tools not accessible to sub-agent'
        },
        {
          pattern: /simulating.*data|synthetic.*records/i,
          severity: 'CRITICAL',
          message: 'Simulated data generation detected'
        },
        {
          pattern: /defaulting to.*example/i,
          severity: 'HIGH',
          message: 'Agent defaulting to example data'
        }
      ],
      queryFailures: [
        {
          pattern: /INVALID_FIELD|Field.*does not exist/i,
          severity: 'MEDIUM',
          message: 'Invalid field reference in query'
        },
        {
          pattern: /INSUFFICIENT_ACCESS|Permission denied/i,
          severity: 'HIGH',
          message: 'Permission denied for query execution'
        },
        {
          pattern: /MALFORMED_QUERY|Invalid SOQL/i,
          severity: 'MEDIUM',
          message: 'Malformed query syntax'
        },
        {
          pattern: /CONNECTION_ERROR|Unable to connect/i,
          severity: 'HIGH',
          message: 'Connection to Salesforce failed'
        }
      ],
      dataIntegrityIssues: [
        {
          pattern: /Lead \d+|Opportunity \d+|Account \d+/g,
          severity: 'CRITICAL',
          message: 'Generic entity naming detected (fake data indicator)'
        },
        {
          pattern: /\b(15|20|25|30|35|40|45|50)\.0+%/g,
          severity: 'HIGH',
          message: 'Suspiciously round percentages detected'
        },
        {
          pattern: /00[QAC]0{12,}/g,
          severity: 'CRITICAL',
          message: 'Fake Salesforce IDs detected'
        },
        {
          pattern: /Example \d+:|Sample:|Demo data/i,
          severity: 'CRITICAL',
          message: 'Example/demo data indicators found'
        }
      ],
      warningSignals: [
        {
          pattern: /fallback.*method|using.*cli.*instead/i,
          severity: 'MEDIUM',
          message: 'Using fallback method instead of MCP'
        },
        {
          pattern: /unable to verify|cannot confirm/i,
          severity: 'MEDIUM',
          message: 'Unable to verify data source'
        },
        {
          pattern: /timeout|took too long/i,
          severity: 'LOW',
          message: 'Performance issue detected'
        }
      ]
    };
  }

  /**
   * Start monitoring a sub-agent execution
   */
  async startMonitoring(agentName, executionId = null) {
    const monitorId = executionId || `${agentName}_${Date.now()}`;
    
    const monitor = {
      id: monitorId,
      agentName,
      startTime: new Date(),
      errors: [],
      warnings: [],
      dataIntegrityIssues: [],
      status: 'MONITORING',
      outputBuffer: '',
      metadata: {}
    };

    this.activeMonitors.set(monitorId, monitor);
    
    // Initialize log file
    await this.initializeLog(monitor);
    
    this.emit('monitor:started', { monitorId, agentName });
    
    return monitorId;
  }

  /**
   * Process output from sub-agent in real-time
   */
  async processOutput(monitorId, output) {
    const monitor = this.activeMonitors.get(monitorId);
    if (!monitor) {
      console.error(`Monitor ${monitorId} not found`);
      return;
    }

    // Append to buffer
    monitor.outputBuffer += output;

    // Check for error patterns
    const issues = await this.detectIssues(output);
    
    // Classify and store issues
    for (const issue of issues) {
      this.classifyAndStoreIssue(monitor, issue);
      
      // Emit events based on severity
      if (this.shouldAlert(issue.severity)) {
        this.emit('issue:detected', {
          monitorId,
          agentName: monitor.agentName,
          issue
        });
        
        // Send immediate notification for critical issues
        if (issue.severity === 'CRITICAL') {
          await this.sendNotification(monitor, issue);
        }
      }
    }

    // Update log
    await this.updateLog(monitor);
  }

  /**
   * Detect issues in output
   */
  async detectIssues(output) {
    const issues = [];
    
    // Check all pattern categories
    for (const [category, patterns] of Object.entries(this.errorPatterns)) {
      for (const patternDef of patterns) {
        let matches;
        if (patternDef.pattern.global) {
          matches = [...output.matchAll(patternDef.pattern)];
          if (matches.length > 0) {
            issues.push({
              category,
              severity: patternDef.severity,
              message: patternDef.message,
              matches: matches.map(m => m[0]),
              pattern: patternDef.pattern.toString(),
              timestamp: new Date().toISOString()
            });
          }
        } else {
          const match = output.match(patternDef.pattern);
          if (match) {
            issues.push({
              category,
              severity: patternDef.severity,
              message: patternDef.message,
              match: match[0],
              pattern: patternDef.pattern.toString(),
              timestamp: new Date().toISOString()
            });
          }
        }
      }
    }

    // Special check for complete absence of real queries
    if (!output.includes('SELECT') && !output.includes('mcp_salesforce') && 
        output.length > 1000 && (output.includes('Lead') || output.includes('Opportunity'))) {
      issues.push({
        category: 'dataIntegrityIssues',
        severity: 'HIGH',
        message: 'No query execution detected but data presented',
        timestamp: new Date().toISOString()
      });
    }

    return issues;
  }

  /**
   * Classify and store issue
   */
  classifyAndStoreIssue(monitor, issue) {
    switch (issue.category) {
      case 'silentFailures':
      case 'queryFailures':
        monitor.errors.push(issue);
        break;
      case 'dataIntegrityIssues':
        monitor.dataIntegrityIssues.push(issue);
        monitor.status = 'INTEGRITY_VIOLATION';
        break;
      case 'warningSignals':
        monitor.warnings.push(issue);
        break;
    }
  }

  /**
   * Check if we should alert based on severity
   */
  shouldAlert(severity) {
    const threshold = this.severityLevels[this.config.alertThreshold];
    const level = this.severityLevels[severity];
    return level <= threshold;
  }

  /**
   * Send notification for critical issues
   */
  async sendNotification(monitor, issue) {
    const notification = {
      text: `🚨 Critical Issue Detected in ${monitor.agentName}`,
      attachments: [{
        color: 'danger',
        fields: [
          {
            title: 'Issue',
            value: issue.message,
            short: false
          },
          {
            title: 'Category',
            value: issue.category,
            short: true
          },
          {
            title: 'Severity',
            value: issue.severity,
            short: true
          },
          {
            title: 'Monitor ID',
            value: monitor.id,
            short: false
          },
          {
            title: 'Detection Time',
            value: issue.timestamp,
            short: false
          }
        ]
      }]
    };

    // Log to console
    console.error('\n🚨 CRITICAL ISSUE DETECTED:');
    console.error(`Agent: ${monitor.agentName}`);
    console.error(`Issue: ${issue.message}`);
    console.error(`Time: ${issue.timestamp}`);
    
    // Send webhook notification if configured
    if (this.config.notificationWebhook) {
      try {
        const fetch = require('node-fetch');
        await fetch(this.config.notificationWebhook, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(notification)
        });
      } catch (error) {
        console.error('Failed to send webhook notification:', error.message);
      }
    }
  }

  /**
   * Stop monitoring and generate report
   */
  async stopMonitoring(monitorId) {
    const monitor = this.activeMonitors.get(monitorId);
    if (!monitor) {
      console.error(`Monitor ${monitorId} not found`);
      return null;
    }

    monitor.endTime = new Date();
    monitor.duration = monitor.endTime - monitor.startTime;
    
    // Final analysis
    const report = await this.generateReport(monitor);
    
    // Save final report
    await this.saveFinalReport(monitor, report);
    
    // Clean up
    this.activeMonitors.delete(monitorId);
    
    this.emit('monitor:stopped', { monitorId, report });
    
    return report;
  }

  /**
   * Generate monitoring report
   */
  async generateReport(monitor) {
    const report = {
      monitorId: monitor.id,
      agentName: monitor.agentName,
      duration: monitor.duration,
      status: monitor.status,
      summary: {
        errors: monitor.errors.length,
        warnings: monitor.warnings.length,
        dataIntegrityIssues: monitor.dataIntegrityIssues.length,
        criticalIssues: monitor.errors.filter(e => e.severity === 'CRITICAL').length
      },
      details: {
        errors: monitor.errors,
        warnings: monitor.warnings,
        dataIntegrityIssues: monitor.dataIntegrityIssues
      },
      recommendations: this.generateRecommendations(monitor),
      timestamp: new Date().toISOString()
    };

    // Determine overall health
    if (report.summary.criticalIssues > 0 || report.summary.dataIntegrityIssues > 0) {
      report.health = 'CRITICAL';
    } else if (report.summary.errors > 0) {
      report.health = 'UNHEALTHY';
    } else if (report.summary.warnings > 0) {
      report.health = 'WARNING';
    } else {
      report.health = 'HEALTHY';
    }

    return report;
  }

  /**
   * Generate recommendations based on issues
   */
  generateRecommendations(monitor) {
    const recommendations = [];

    if (monitor.dataIntegrityIssues.length > 0) {
      recommendations.push({
        priority: 'CRITICAL',
        action: 'Review sub-agent configuration and ensure MCP tools are accessible',
        reason: 'Data integrity violations detected - agent may be generating fake data'
      });
    }

    const mcpIssues = monitor.errors.filter(e => e.message.includes('MCP'));
    if (mcpIssues.length > 0) {
      recommendations.push({
        priority: 'HIGH',
        action: 'Verify MCP server configuration and ensure tools are available to sub-agents',
        reason: 'MCP tool access issues detected'
      });
    }

    const queryFailures = monitor.errors.filter(e => e.category === 'queryFailures');
    if (queryFailures.length > 0) {
      recommendations.push({
        priority: 'MEDIUM',
        action: 'Review query syntax and field permissions',
        reason: `${queryFailures.length} query failures detected`
      });
    }

    return recommendations;
  }

  /**
   * Initialize log file
   */
  async initializeLog(monitor) {
    await fs.mkdir(this.config.logDir, { recursive: true });
    
    const logPath = path.join(this.config.logDir, `${monitor.id}.json`);
    const initialLog = {
      monitorId: monitor.id,
      agentName: monitor.agentName,
      startTime: monitor.startTime.toISOString(),
      events: []
    };
    
    await fs.writeFile(logPath, JSON.stringify(initialLog, null, 2));
  }

  /**
   * Update log file
   */
  async updateLog(monitor) {
    const logPath = path.join(this.config.logDir, `${monitor.id}.json`);
    
    try {
      const logData = JSON.parse(await fs.readFile(logPath, 'utf-8'));
      
      logData.events.push({
        timestamp: new Date().toISOString(),
        errors: monitor.errors.length,
        warnings: monitor.warnings.length,
        dataIntegrityIssues: monitor.dataIntegrityIssues.length
      });
      
      await fs.writeFile(logPath, JSON.stringify(logData, null, 2));
    } catch (error) {
      console.error('Error updating log:', error.message);
    }
  }

  /**
   * Save final report
   */
  async saveFinalReport(monitor, report) {
    const reportPath = path.join(this.config.logDir, `report_${monitor.id}.json`);
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    
    console.log(`\n📊 Monitoring Report saved: ${reportPath}`);
    
    // Display summary
    console.log('\n=== Monitoring Summary ===');
    console.log(`Agent: ${monitor.agentName}`);
    console.log(`Duration: ${(monitor.duration / 1000).toFixed(2)}s`);
    console.log(`Health: ${report.health}`);
    console.log(`Errors: ${report.summary.errors}`);
    console.log(`Warnings: ${report.summary.warnings}`);
    console.log(`Data Integrity Issues: ${report.summary.dataIntegrityIssues}`);
    
    if (report.recommendations.length > 0) {
      console.log('\n📋 Recommendations:');
      for (const rec of report.recommendations) {
        console.log(`  [${rec.priority}] ${rec.action}`);
      }
    }
  }

  /**
   * Monitor a command execution
   */
  async monitorCommand(command, args = []) {
    const agentName = args[0] || 'unknown';
    const monitorId = await this.startMonitoring(agentName);
    
    return new Promise((resolve, reject) => {
      const proc = spawn(command, args);
      
      proc.stdout.on('data', async (data) => {
        await this.processOutput(monitorId, data.toString());
      });
      
      proc.stderr.on('data', async (data) => {
        await this.processOutput(monitorId, data.toString());
      });
      
      proc.on('close', async (code) => {
        const report = await this.stopMonitoring(monitorId);
        if (code !== 0 || report.health === 'CRITICAL') {
          reject(new Error(`Monitoring detected critical issues: ${JSON.stringify(report.summary)}`));
        } else {
          resolve(report);
        }
      });
    });
  }
}

// CLI interface
async function main() {
  const monitor = new SubagentErrorMonitor();
  
  const command = process.argv[2];
  const args = process.argv.slice(3);
  
  switch (command) {
    case 'start':
      const monitorId = await monitor.startMonitoring(args[0] || 'manual');
      console.log(`Monitoring started: ${monitorId}`);
      
      // Listen for stdin if in interactive mode
      if (process.stdin.isTTY) {
        process.stdin.on('data', async (data) => {
          await monitor.processOutput(monitorId, data.toString());
        });
      }
      break;
      
    case 'analyze':
      // Analyze a file for issues
      if (args[0]) {
        const content = await fs.readFile(args[0], 'utf-8');
        const issues = await monitor.detectIssues(content);
        console.log(JSON.stringify(issues, null, 2));
      }
      break;
      
    case 'monitor-file':
      // Monitor a file for issues
      if (args[0]) {
        const content = await fs.readFile(args[0], 'utf-8');
        const monitorId = await monitor.startMonitoring('file-analysis');
        await monitor.processOutput(monitorId, content);
        const report = await monitor.stopMonitoring(monitorId);
        console.log(JSON.stringify(report, null, 2));
      }
      break;
      
    default:
      console.log('Subagent Error Monitor');
      console.log('\nCommands:');
      console.log('  start <agent>       - Start monitoring for an agent');
      console.log('  analyze <file>      - Analyze a file for issues');
      console.log('  monitor-file <file> - Full monitoring of a file');
      console.log('\nEnvironment Variables:');
      console.log('  SLACK_WEBHOOK_URL   - Webhook for critical alerts');
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = SubagentErrorMonitor;