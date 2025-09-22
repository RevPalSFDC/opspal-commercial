#!/usr/bin/env node

/**
 * Agent Monitoring System
 * Real-time monitoring of agent invocations, performance, and errors
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');
const EventEmitter = require('events');

class AgentMonitor extends EventEmitter {
  constructor(options = {}) {
    super();
    this.logDir = options.logDir || '.claude/logs';
    this.metricsFile = path.join(this.logDir, 'agent-metrics.json');
    this.alertsFile = path.join(this.logDir, 'agent-alerts.json');
    this.running = false;
    this.metrics = this.loadMetrics();
    this.alerts = [];
    this.watchers = new Map();

    // Alert thresholds
    this.thresholds = {
      errorRate: 0.1,        // 10% error rate
      responseTime: 30000,   // 30 seconds
      failureCount: 3,       // 3 consecutive failures
      memoryUsage: 0.8,      // 80% memory usage
      ...options.thresholds
    };

    // Ensure log directory exists
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  /**
   * Start monitoring
   */
  start() {
    if (this.running) {
      console.log('Monitor already running');
      return;
    }

    console.log('🚀 Starting Agent Monitor...');
    this.running = true;

    // Watch for agent invocations
    this.watchAgentLogs();

    // Start metrics collection
    this.startMetricsCollection();

    // Start alert monitoring
    this.startAlertMonitoring();

    // Setup graceful shutdown
    process.on('SIGINT', () => this.stop());
    process.on('SIGTERM', () => this.stop());

    console.log('✅ Agent Monitor started successfully');
    console.log(`📊 Metrics: ${this.metricsFile}`);
    console.log(`🚨 Alerts: ${this.alertsFile}`);
  }

  /**
   * Stop monitoring
   */
  stop() {
    console.log('\n🛑 Stopping Agent Monitor...');
    this.running = false;

    // Stop all watchers
    for (const [file, watcher] of this.watchers) {
      watcher.close();
    }
    this.watchers.clear();

    // Save final metrics
    this.saveMetrics();
    this.saveAlerts();

    console.log('✅ Agent Monitor stopped');
    process.exit(0);
  }

  /**
   * Watch agent log files
   */
  watchAgentLogs() {
    const logPatterns = [
      path.join(this.logDir, 'agent-*.log'),
      path.join(this.logDir, 'task-*.log')
    ];

    // Watch existing log files
    for (const pattern of logPatterns) {
      const files = this.findFiles(pattern);
      for (const file of files) {
        this.watchLogFile(file);
      }
    }

    // Watch for new log files
    fs.watch(this.logDir, (eventType, filename) => {
      if (filename && filename.match(/^(agent|task)-.*\.log$/)) {
        const filePath = path.join(this.logDir, filename);
        if (!this.watchers.has(filePath)) {
          this.watchLogFile(filePath);
        }
      }
    });
  }

  /**
   * Watch individual log file
   */
  watchLogFile(filePath) {
    if (this.watchers.has(filePath)) return;

    console.log(`👁️  Watching: ${path.basename(filePath)}`);

    const watcher = fs.watch(filePath, (eventType) => {
      if (eventType === 'change') {
        this.processLogUpdate(filePath);
      }
    });

    this.watchers.set(filePath, watcher);
  }

  /**
   * Process log file update
   */
  processLogUpdate(filePath) {
    try {
      // Read last lines of log
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n').filter(l => l.trim());
      const lastLine = lines[lines.length - 1];

      if (lastLine) {
        const logEntry = this.parseLogEntry(lastLine);
        if (logEntry) {
          this.updateMetrics(logEntry);
          this.checkAlerts(logEntry);
        }
      }
    } catch (error) {
      console.error(`Error processing log ${filePath}:`, error.message);
    }
  }

  /**
   * Parse log entry
   */
  parseLogEntry(line) {
    try {
      // Try to parse as JSON
      if (line.startsWith('{')) {
        return JSON.parse(line);
      }

      // Parse structured log format
      const match = line.match(/\[([\d-T:.Z]+)\] \[(\w+)\] \[([^\]]+)\] (.+)/);
      if (match) {
        return {
          timestamp: match[1],
          level: match[2],
          agent: match[3],
          message: match[4]
        };
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Update metrics based on log entry
   */
  updateMetrics(entry) {
    const agent = entry.agent || 'unknown';

    if (!this.metrics[agent]) {
      this.metrics[agent] = {
        invocations: 0,
        successes: 0,
        failures: 0,
        errors: [],
        totalTime: 0,
        lastInvocation: null
      };
    }

    const agentMetrics = this.metrics[agent];
    agentMetrics.lastInvocation = entry.timestamp || new Date().toISOString();

    // Update counters based on log level/type
    if (entry.type === 'start' || entry.message?.includes('Starting')) {
      agentMetrics.invocations++;
    } else if (entry.type === 'success' || entry.level === 'SUCCESS') {
      agentMetrics.successes++;
    } else if (entry.type === 'error' || entry.level === 'ERROR') {
      agentMetrics.failures++;
      agentMetrics.errors.push({
        timestamp: entry.timestamp,
        message: entry.message || entry.error
      });
      // Keep only last 10 errors
      if (agentMetrics.errors.length > 10) {
        agentMetrics.errors.shift();
      }
    }

    // Update response time if available
    if (entry.duration) {
      agentMetrics.totalTime += entry.duration;
    }

    // Calculate error rate
    if (agentMetrics.invocations > 0) {
      agentMetrics.errorRate = agentMetrics.failures / agentMetrics.invocations;
    }

    this.emit('metrics', agent, agentMetrics);
  }

  /**
   * Check for alert conditions
   */
  checkAlerts(entry) {
    const agent = entry.agent || 'unknown';
    const metrics = this.metrics[agent];

    if (!metrics) return;

    // Check error rate
    if (metrics.errorRate > this.thresholds.errorRate) {
      this.raiseAlert({
        type: 'ERROR_RATE',
        severity: 'HIGH',
        agent,
        message: `Error rate ${(metrics.errorRate * 100).toFixed(1)}% exceeds threshold`,
        value: metrics.errorRate,
        threshold: this.thresholds.errorRate
      });
    }

    // Check consecutive failures
    const recentErrors = metrics.errors.slice(-this.thresholds.failureCount);
    if (recentErrors.length >= this.thresholds.failureCount) {
      const timeDiff = new Date() - new Date(recentErrors[0].timestamp);
      if (timeDiff < 60000) { // Within 1 minute
        this.raiseAlert({
          type: 'CONSECUTIVE_FAILURES',
          severity: 'CRITICAL',
          agent,
          message: `${this.thresholds.failureCount} consecutive failures detected`,
          errors: recentErrors
        });
      }
    }

    // Check response time (if duration available)
    if (entry.duration && entry.duration > this.thresholds.responseTime) {
      this.raiseAlert({
        type: 'SLOW_RESPONSE',
        severity: 'MEDIUM',
        agent,
        message: `Response time ${entry.duration}ms exceeds threshold`,
        value: entry.duration,
        threshold: this.thresholds.responseTime
      });
    }
  }

  /**
   * Raise an alert
   */
  raiseAlert(alert) {
    alert.timestamp = new Date().toISOString();
    alert.id = `${alert.type}_${alert.agent}_${Date.now()}`;

    // Check for duplicate alerts
    const existing = this.alerts.find(a =>
      a.type === alert.type &&
      a.agent === alert.agent &&
      new Date() - new Date(a.timestamp) < 300000 // Within 5 minutes
    );

    if (!existing) {
      this.alerts.push(alert);
      this.emit('alert', alert);

      // Log alert
      console.log(`\n🚨 ALERT: ${alert.severity} - ${alert.type}`);
      console.log(`   Agent: ${alert.agent}`);
      console.log(`   Message: ${alert.message}`);

      // Save alerts
      this.saveAlerts();

      // Trigger notifications if configured
      this.sendNotification(alert);
    }
  }

  /**
   * Send notification for alert
   */
  sendNotification(alert) {
    // Check for Slack webhook
    if (process.env.SLACK_WEBHOOK_URL && alert.severity === 'CRITICAL') {
      try {
        const message = {
          text: `🚨 Agent Monitor Alert`,
          attachments: [{
            color: 'danger',
            title: `${alert.type}: ${alert.agent}`,
            text: alert.message,
            fields: [
              { title: 'Severity', value: alert.severity, short: true },
              { title: 'Time', value: alert.timestamp, short: true }
            ]
          }]
        };

        // In production, would send to Slack
        console.log('   📢 Notification would be sent to Slack');
      } catch (error) {
        console.error('Failed to send notification:', error.message);
      }
    }
  }

  /**
   * Start metrics collection
   */
  startMetricsCollection() {
    // Collect system metrics every 30 seconds
    setInterval(() => {
      if (!this.running) return;

      const systemMetrics = this.collectSystemMetrics();
      this.metrics._system = systemMetrics;

      // Check system alerts
      if (systemMetrics.memoryUsage > this.thresholds.memoryUsage) {
        this.raiseAlert({
          type: 'HIGH_MEMORY',
          severity: 'HIGH',
          agent: '_system',
          message: `Memory usage ${(systemMetrics.memoryUsage * 100).toFixed(1)}% exceeds threshold`,
          value: systemMetrics.memoryUsage,
          threshold: this.thresholds.memoryUsage
        });
      }

      this.saveMetrics();
    }, 30000);
  }

  /**
   * Collect system metrics
   */
  collectSystemMetrics() {
    const memUsage = process.memoryUsage();
    const totalMem = require('os').totalmem();

    return {
      timestamp: new Date().toISOString(),
      memoryUsage: memUsage.rss / totalMem,
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      uptime: process.uptime(),
      activeAgents: Object.keys(this.metrics).filter(k => k !== '_system').length
    };
  }

  /**
   * Start alert monitoring
   */
  startAlertMonitoring() {
    // Clean old alerts every hour
    setInterval(() => {
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours
      this.alerts = this.alerts.filter(a => new Date(a.timestamp) > cutoff);
      this.saveAlerts();
    }, 3600000);
  }

  /**
   * Load metrics from file
   */
  loadMetrics() {
    try {
      if (fs.existsSync(this.metricsFile)) {
        return JSON.parse(fs.readFileSync(this.metricsFile, 'utf8'));
      }
    } catch (error) {
      console.error('Error loading metrics:', error.message);
    }
    return {};
  }

  /**
   * Save metrics to file
   */
  saveMetrics() {
    try {
      fs.writeFileSync(this.metricsFile, JSON.stringify(this.metrics, null, 2));
    } catch (error) {
      console.error('Error saving metrics:', error.message);
    }
  }

  /**
   * Save alerts to file
   */
  saveAlerts() {
    try {
      fs.writeFileSync(this.alertsFile, JSON.stringify(this.alerts, null, 2));
    } catch (error) {
      console.error('Error saving alerts:', error.message);
    }
  }

  /**
   * Find files matching pattern
   */
  findFiles(pattern) {
    const dir = path.dirname(pattern);
    const filePattern = path.basename(pattern).replace('*', '.*');
    const regex = new RegExp(filePattern);

    try {
      return fs.readdirSync(dir)
        .filter(f => regex.test(f))
        .map(f => path.join(dir, f));
    } catch (error) {
      return [];
    }
  }

  /**
   * Generate monitoring report
   */
  generateReport() {
    const report = [];

    report.push('Agent Monitoring Report');
    report.push('=' .repeat(60));
    report.push(`Generated: ${new Date().toISOString()}`);
    report.push('');

    // Agent metrics
    report.push('📊 Agent Metrics:');
    for (const [agent, metrics] of Object.entries(this.metrics)) {
      if (agent === '_system') continue;

      report.push(`  ${agent}:`);
      report.push(`    Invocations: ${metrics.invocations}`);
      report.push(`    Success Rate: ${((metrics.successes / (metrics.invocations || 1)) * 100).toFixed(1)}%`);
      report.push(`    Error Rate: ${((metrics.errorRate || 0) * 100).toFixed(1)}%`);
      if (metrics.invocations > 0) {
        report.push(`    Avg Response: ${(metrics.totalTime / metrics.invocations).toFixed(0)}ms`);
      }
      report.push(`    Last Run: ${metrics.lastInvocation || 'Never'}`);
      report.push('');
    }

    // System metrics
    if (this.metrics._system) {
      report.push('💻 System Metrics:');
      report.push(`  Memory Usage: ${(this.metrics._system.memoryUsage * 100).toFixed(1)}%`);
      report.push(`  Uptime: ${(this.metrics._system.uptime / 3600).toFixed(1)} hours`);
      report.push(`  Active Agents: ${this.metrics._system.activeAgents}`);
      report.push('');
    }

    // Recent alerts
    const recentAlerts = this.alerts.slice(-5);
    if (recentAlerts.length > 0) {
      report.push('🚨 Recent Alerts:');
      for (const alert of recentAlerts) {
        report.push(`  [${alert.severity}] ${alert.type}: ${alert.agent}`);
        report.push(`    ${alert.message}`);
        report.push(`    Time: ${alert.timestamp}`);
      }
    }

    return report.join('\n');
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  const monitor = new AgentMonitor({
    logDir: args.includes('--log-dir') ?
      args[args.indexOf('--log-dir') + 1] : '.claude/logs'
  });

  switch (command) {
    case 'start':
      monitor.start();
      // Keep process alive
      setInterval(() => {
        if (args.includes('--verbose')) {
          console.log('\n' + monitor.generateReport());
        }
      }, 60000);
      break;

    case 'report':
      console.log(monitor.generateReport());
      break;

    case 'metrics':
      console.log(JSON.stringify(monitor.metrics, null, 2));
      break;

    case 'alerts':
      console.log(JSON.stringify(monitor.alerts, null, 2));
      break;

    default:
      console.log('Usage: agent-monitoring.js <command> [options]');
      console.log('Commands:');
      console.log('  start    - Start monitoring agents');
      console.log('  report   - Generate monitoring report');
      console.log('  metrics  - Show current metrics');
      console.log('  alerts   - Show current alerts');
      console.log('Options:');
      console.log('  --log-dir <dir>  - Log directory (default: .claude/logs)');
      console.log('  --verbose        - Show detailed output');
      process.exit(1);
  }
}

module.exports = AgentMonitor;