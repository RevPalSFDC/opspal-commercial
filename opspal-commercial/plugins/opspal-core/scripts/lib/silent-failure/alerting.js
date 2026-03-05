#!/usr/bin/env node

/**
 * Alerting System for Silent Failure Detection
 *
 * Purpose: Surface silent failure detections through multiple channels
 *
 * Channels:
 * - Terminal: Colorful banners for critical issues
 * - Log: Append to JSONL log file
 * - Reflection: Auto-generate reflection for self-improvement pipeline
 * - Slack: (Optional) Send webhook notifications
 *
 * Usage:
 *   const { SilentFailureAlerter } = require('./alerting');
 *
 *   const alerter = new SilentFailureAlerter();
 *   await alerter.alert({
 *     type: 'ENV_BYPASS',
 *     severity: 'CRITICAL',
 *     message: 'SKIP_VALIDATION is set',
 *     recommendation: 'unset SKIP_VALIDATION'
 *   });
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const http = require('http');

// =============================================================================
// Constants
// =============================================================================

const SEVERITY = {
  CRITICAL: 'CRITICAL',
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW',
  INFO: 'INFO'
};

const SEVERITY_COLORS = {
  CRITICAL: '\x1b[31m',  // Red
  HIGH: '\x1b[33m',      // Yellow
  MEDIUM: '\x1b[34m',    // Blue
  LOW: '\x1b[90m',       // Gray
  INFO: '\x1b[36m'       // Cyan
};

const RESET = '\x1b[0m';

// Load config if available
let CONFIG;
try {
  const configPath = path.join(__dirname, '..', '..', '..', 'config', 'silent-failure-detection.json');
  if (fs.existsSync(configPath)) {
    CONFIG = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }
} catch {
  // Use defaults
}

// =============================================================================
// Silent Failure Alerter
// =============================================================================

/**
 * Multi-channel alerter for silent failure detections
 */
class SilentFailureAlerter {
  constructor(options = {}) {
    this.terminalEnabled = options.terminal !== false &&
      (CONFIG?.alerting?.terminal !== false);
    this.logEnabled = options.log !== false &&
      (CONFIG?.alerting?.log !== false);
    this.reflectionEnabled = options.reflections !== false &&
      (CONFIG?.alerting?.reflections !== false);
    this.slackEnabled = options.slack ||
      (CONFIG?.alerting?.slack && process.env.SLACK_WEBHOOK_URL);

    this.logPath = options.logPath ||
      CONFIG?.alerting?.logPath ||
      path.join(os.homedir(), '.claude', 'logs', 'silent-failures.jsonl');

    this.reflectionPath = options.reflectionPath ||
      path.join(process.cwd(), '.claude', 'data', 'auto-reflections.json');

    this.slackWebhookUrl = process.env.SLACK_WEBHOOK_URL;
  }

  /**
   * Send alert through all enabled channels
   * @param {Object} detection - The detection to alert on
   * @returns {Object} Results from all channels
   */
  async alert(detection) {
    const results = {
      timestamp: new Date().toISOString(),
      detection,
      channels: {}
    };

    const promises = [];

    // Terminal alert (for critical issues)
    if (this.terminalEnabled && ['CRITICAL', 'HIGH'].includes(detection.severity)) {
      promises.push(
        this.terminalAlert(detection)
          .then(() => { results.channels.terminal = { success: true }; })
          .catch(err => { results.channels.terminal = { success: false, error: err.message }; })
      );
    }

    // Log file (all alerts)
    if (this.logEnabled) {
      promises.push(
        this.logAlert(detection)
          .then(() => { results.channels.log = { success: true }; })
          .catch(err => { results.channels.log = { success: false, error: err.message }; })
      );
    }

    // Slack webhook (high and critical)
    if (this.slackEnabled && ['HIGH', 'CRITICAL'].includes(detection.severity)) {
      promises.push(
        this.slackAlert(detection)
          .then(() => { results.channels.slack = { success: true }; })
          .catch(err => { results.channels.slack = { success: false, error: err.message }; })
      );
    }

    // Auto-generate reflection for patterns
    if (this.reflectionEnabled && detection.shouldGenerateReflection) {
      promises.push(
        this.generateReflection(detection)
          .then(() => { results.channels.reflection = { success: true }; })
          .catch(err => { results.channels.reflection = { success: false, error: err.message }; })
      );
    }

    await Promise.all(promises);

    return results;
  }

  /**
   * Display terminal banner for critical issues
   */
  async terminalAlert(detection) {
    const color = SEVERITY_COLORS[detection.severity] || '';
    const icon = detection.severity === 'CRITICAL' ? '\u26a0\ufe0f ' : '\u26a1 ';

    // Build banner
    const width = 68;
    const border = '\u2550'.repeat(width);
    const title = `${icon} SILENT FAILURE DETECTED`;
    const type = `Type: ${detection.type || 'Unknown'}`;
    const severity = `Severity: ${detection.severity}`;
    const message = detection.message || '';
    const recommendation = detection.recommendation || 'Review logs for details';

    const banner = `
${color}\u2554${border}\u2557
\u2551  ${title.padEnd(width - 2)}\u2551
\u2560${border}\u2563
\u2551  ${type.padEnd(width - 2)}\u2551
\u2551  ${severity.padEnd(width - 2)}\u2551
\u2551  ${message.slice(0, width - 4).padEnd(width - 2)}\u2551
\u2560${border}\u2563
\u2551  Recommendation: ${recommendation.slice(0, width - 20).padEnd(width - 18)}\u2551
\u255a${border}\u255d${RESET}
`;

    console.error(banner);
    return Promise.resolve();
  }

  /**
   * Append to JSONL log file
   */
  async logAlert(detection) {
    const entry = {
      timestamp: new Date().toISOString(),
      type: detection.type,
      severity: detection.severity,
      message: detection.message,
      recommendation: detection.recommendation,
      taxonomy: detection.taxonomy,
      details: detection.details || {}
    };

    // Ensure directory exists
    const dir = path.dirname(this.logPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Append to log
    fs.appendFileSync(this.logPath, JSON.stringify(entry) + '\n');

    return Promise.resolve();
  }

  /**
   * Send Slack webhook notification
   */
  async slackAlert(detection) {
    if (!this.slackWebhookUrl) {
      throw new Error('SLACK_WEBHOOK_URL not configured');
    }

    const color = {
      CRITICAL: '#FF0000',
      HIGH: '#FFA500',
      MEDIUM: '#0000FF',
      LOW: '#808080'
    }[detection.severity] || '#808080';

    const payload = {
      attachments: [{
        color,
        title: `\u26a0\ufe0f Silent Failure: ${detection.type}`,
        text: detection.message,
        fields: [
          { title: 'Severity', value: detection.severity, short: true },
          { title: 'Taxonomy', value: detection.taxonomy || 'unknown', short: true },
          { title: 'Recommendation', value: detection.recommendation || 'Review logs', short: false }
        ],
        footer: 'Silent Failure Detection System',
        ts: Math.floor(Date.now() / 1000)
      }]
    };

    return new Promise((resolve, reject) => {
      const url = new URL(this.slackWebhookUrl);
      const options = {
        hostname: url.hostname,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      };

      const protocol = url.protocol === 'https:' ? https : http;
      const req = protocol.request(options, (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve();
        } else {
          reject(new Error(`Slack webhook returned ${res.statusCode}`));
        }
      });

      req.on('error', reject);
      req.write(JSON.stringify(payload));
      req.end();
    });
  }

  /**
   * Generate reflection for self-improvement pipeline
   */
  async generateReflection(detection) {
    const reflection = {
      id: `sf_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      source: 'silent-failure-detector',
      timestamp: new Date().toISOString(),
      taxonomy: detection.taxonomy || 'unknown',
      severity: detection.severity === 'CRITICAL' ? 'high' : 'medium',
      summary: `Silent failure detected: ${detection.type}`,
      details: {
        type: detection.type,
        message: detection.message,
        recommendation: detection.recommendation,
        autoGenerated: true,
        requiresReview: true
      }
    };

    // Ensure directory exists
    const dir = path.dirname(this.reflectionPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Load existing reflections
    let reflections = [];
    if (fs.existsSync(this.reflectionPath)) {
      try {
        reflections = JSON.parse(fs.readFileSync(this.reflectionPath, 'utf8'));
      } catch {
        reflections = [];
      }
    }

    // Add new reflection
    reflections.push(reflection);

    // Save
    fs.writeFileSync(this.reflectionPath, JSON.stringify(reflections, null, 2));

    return Promise.resolve();
  }

  /**
   * Alert multiple detections at once
   * @param {Array} detections - Array of detections to alert
   */
  async alertBatch(detections) {
    const results = [];

    for (const detection of detections) {
      const result = await this.alert(detection);
      results.push(result);
    }

    return {
      timestamp: new Date().toISOString(),
      count: detections.length,
      results
    };
  }

  /**
   * Generate a system message suitable for hook output
   * @param {Object} detection - The detection
   * @returns {string} JSON string for hook output
   */
  generateSystemMessage(detection) {
    const icon = detection.severity === 'CRITICAL' ? '\u26a0\ufe0f' : '\u26a1';
    const message = `${icon} SILENT FAILURE: ${detection.message}`;

    return JSON.stringify({
      systemMessage: message,
      type: detection.type,
      severity: detection.severity,
      recommendation: detection.recommendation
    });
  }
}

// =============================================================================
// Alert Summary Generator
// =============================================================================

/**
 * Generates summary of alerts for reporting
 */
class AlertSummaryGenerator {
  constructor(logPath) {
    this.logPath = logPath ||
      path.join(os.homedir(), '.claude', 'logs', 'silent-failures.jsonl');
  }

  /**
   * Get summary of alerts for a time period
   * @param {number} days - Number of days to analyze
   */
  getSummary(days = 7) {
    if (!fs.existsSync(this.logPath)) {
      return this.emptyReport(days);
    }

    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

    const entries = fs.readFileSync(this.logPath, 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(line => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(e => e && new Date(e.timestamp).getTime() > cutoff);

    return {
      period: { days, from: new Date(cutoff), to: new Date() },
      total: entries.length,
      bySeverity: this.groupBy(entries, 'severity'),
      byType: this.groupBy(entries, 'type'),
      byTaxonomy: this.groupBy(entries, 'taxonomy'),
      recent: entries.slice(-10).reverse()
    };
  }

  groupBy(entries, field) {
    return entries.reduce((acc, e) => {
      const key = e[field] || 'unknown';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
  }

  emptyReport(days) {
    return {
      period: { days, from: new Date(Date.now() - days * 24 * 60 * 60 * 1000), to: new Date() },
      total: 0,
      bySeverity: {},
      byType: {},
      byTaxonomy: {},
      recent: []
    };
  }
}

// =============================================================================
// CLI Interface
// =============================================================================

if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0] || 'help';

  const alerter = new SilentFailureAlerter();
  const summaryGen = new AlertSummaryGenerator();

  switch (command) {
    case 'test':
      // Test alert
      alerter.alert({
        type: 'TEST_ALERT',
        severity: 'HIGH',
        message: 'This is a test alert from the CLI',
        recommendation: 'No action needed - this is a test'
      }).then(result => {
        console.log(JSON.stringify(result, null, 2));
      });
      break;

    case 'summary':
      const days = parseInt(args[1], 10) || 7;
      console.log(JSON.stringify(summaryGen.getSummary(days), null, 2));
      break;

    case 'help':
    default:
      console.log(`
Silent Failure Alerting System

Usage:
  node alerting.js test           Test alert through all channels
  node alerting.js summary [days] Get summary of recent alerts (default: 7 days)
  node alerting.js help           Show this help
`);
  }
}

// =============================================================================
// Exports
// =============================================================================

module.exports = {
  SilentFailureAlerter,
  AlertSummaryGenerator,
  SEVERITY,
  SEVERITY_COLORS
};
