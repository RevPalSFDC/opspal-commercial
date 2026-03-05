#!/usr/bin/env node

/**
 * KPI Alert Monitor
 *
 * Purpose: Monitor KPIs against thresholds and alert when breached.
 * Supports static, dynamic, and trend-based alerting with multiple channels.
 *
 * Usage:
 *   const { KPIAlertMonitor } = require('./kpi-alert-monitor');
 *
 *   const monitor = new KPIAlertMonitor({ configPath: './alert-config.json' });
 *   await monitor.initialize();
 *   const alerts = await monitor.evaluateKPI('NRR', 0.98, historicalData);
 *
 * @module kpi-alert-monitor
 * @version 1.0.0
 * @created 2025-12-14
 */

const fs = require('fs');
const path = require('path');

/**
 * KPI Alert Monitor
 */
class KPIAlertMonitor {
    /**
     * Initialize KPI alert monitor
     *
     * @param {Object} config - Configuration options
     * @param {string} [config.configPath] - Path to alert configuration file
     * @param {Object} [config.thresholds] - Inline threshold definitions
     * @param {string} [config.slackWebhook] - Slack webhook URL
     * @param {Object} [config.emailConfig] - Email configuration
     */
    constructor(config = {}) {
        this.configPath = config.configPath;
        this.thresholds = config.thresholds ?? {};
        this.slackWebhook = config.slackWebhook ?? process.env.SLACK_WEBHOOK_URL;
        this.emailConfig = config.emailConfig;
        this.alertHistory = [];
        this.cooldowns = new Map();
    }

    /**
     * Initialize monitor with configuration
     *
     * @returns {Promise<void>}
     */
    async initialize() {
        if (this.configPath && fs.existsSync(this.configPath)) {
            const config = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
            this.thresholds = { ...this.thresholds, ...config.thresholds };
            this.defaultCooldown = config.defaultCooldown ?? '24h';
            this.defaultChannels = config.defaultChannels ?? ['console'];
        }
    }

    /**
     * Set a static threshold for a KPI
     *
     * @param {string} kpiId - KPI identifier
     * @param {string} type - Threshold type: 'min', 'max', 'range'
     * @param {number|Object} value - Threshold value or {min, max}
     * @param {string} [severity='warning'] - Alert severity: 'info', 'warning', 'critical'
     */
    setThreshold(kpiId, type, value, severity = 'warning') {
        if (!this.thresholds[kpiId]) {
            this.thresholds[kpiId] = {};
        }

        this.thresholds[kpiId] = {
            ...this.thresholds[kpiId],
            type: 'static',
            thresholdType: type,
            value,
            severity,
            enabled: true
        };
    }

    /**
     * Set a dynamic threshold based on historical baseline
     *
     * @param {string} kpiId - KPI identifier
     * @param {number} deviationPercent - Percentage deviation from baseline to trigger
     * @param {string} [severity='warning'] - Alert severity
     */
    setDynamicThreshold(kpiId, deviationPercent, severity = 'warning') {
        if (!this.thresholds[kpiId]) {
            this.thresholds[kpiId] = {};
        }

        this.thresholds[kpiId] = {
            ...this.thresholds[kpiId],
            type: 'dynamic',
            deviationPercent,
            severity,
            enabled: true
        };
    }

    /**
     * Set a trend-based threshold
     *
     * @param {string} kpiId - KPI identifier
     * @param {string} trendDirection - Trigger direction: 'increasing', 'decreasing', 'either'
     * @param {number} periods - Number of consecutive periods for trend confirmation
     * @param {string} [severity='warning'] - Alert severity
     */
    setTrendThreshold(kpiId, trendDirection, periods, severity = 'warning') {
        if (!this.thresholds[kpiId]) {
            this.thresholds[kpiId] = {};
        }

        this.thresholds[kpiId] = {
            ...this.thresholds[kpiId],
            type: 'trend',
            trendDirection,
            periods,
            severity,
            enabled: true
        };
    }

    /**
     * Evaluate a KPI against configured thresholds
     *
     * @param {string} kpiId - KPI identifier
     * @param {number} currentValue - Current KPI value
     * @param {Array<number>} [historicalData] - Historical values for dynamic/trend thresholds
     * @returns {Object} Evaluation result
     */
    evaluateKPI(kpiId, currentValue, historicalData = []) {
        const threshold = this.thresholds[kpiId];

        if (!threshold || !threshold.enabled) {
            return {
                kpiId,
                currentValue,
                alert: false,
                reason: 'No threshold configured or threshold disabled'
            };
        }

        let result;
        switch (threshold.type) {
            case 'static':
                result = this._evaluateStaticThreshold(kpiId, currentValue, threshold);
                break;
            case 'dynamic':
                result = this._evaluateDynamicThreshold(kpiId, currentValue, historicalData, threshold);
                break;
            case 'trend':
                result = this._evaluateTrendThreshold(kpiId, currentValue, historicalData, threshold);
                break;
            default:
                result = { alert: false, reason: `Unknown threshold type: ${threshold.type}` };
        }

        result.kpiId = kpiId;
        result.currentValue = currentValue;
        result.timestamp = new Date().toISOString();

        if (result.alert) {
            this.alertHistory.push(result);
        }

        return result;
    }

    /**
     * Evaluate all configured KPIs
     *
     * @param {Object} kpiValues - Object mapping kpiId to current value
     * @param {Object} [historicalDataMap] - Object mapping kpiId to historical data array
     * @returns {Object} Evaluation results
     */
    evaluateAllKPIs(kpiValues, historicalDataMap = {}) {
        const results = {
            timestamp: new Date().toISOString(),
            kpisEvaluated: 0,
            alertsTriggered: 0,
            alerts: [],
            summary: {}
        };

        for (const [kpiId, currentValue] of Object.entries(kpiValues)) {
            const historical = historicalDataMap[kpiId] ?? [];
            const evaluation = this.evaluateKPI(kpiId, currentValue, historical);

            results.kpisEvaluated++;

            if (evaluation.alert) {
                results.alertsTriggered++;
                results.alerts.push(evaluation);
            }

            results.summary[kpiId] = {
                value: currentValue,
                alert: evaluation.alert,
                severity: evaluation.severity
            };
        }

        // Sort alerts by severity
        const severityOrder = { critical: 0, warning: 1, info: 2 };
        results.alerts.sort((a, b) =>
            (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3)
        );

        return results;
    }

    /**
     * Generate an alert object
     *
     * @param {string} kpiId - KPI identifier
     * @param {Object} breach - Breach details
     * @param {Object} context - Additional context
     * @returns {Object} Alert object
     */
    generateAlert(kpiId, breach, context = {}) {
        const alert = {
            id: `alert_${kpiId}_${Date.now()}`,
            kpiId,
            timestamp: new Date().toISOString(),
            breach,
            context,
            severity: breach.severity ?? 'warning',
            status: 'new',
            channels: this.thresholds[kpiId]?.channels ?? this.defaultChannels ?? ['console']
        };

        return alert;
    }

    /**
     * Send alert to configured channels
     *
     * @param {Object} alert - Alert object
     * @returns {Promise<Object>} Notification results
     */
    async notify(alert) {
        const results = {
            alertId: alert.id,
            channels: {}
        };

        // Check cooldown
        const cooldownKey = `${alert.kpiId}_${alert.severity}`;
        const cooldownEnd = this.cooldowns.get(cooldownKey);

        if (cooldownEnd && new Date() < cooldownEnd) {
            return {
                ...results,
                skipped: true,
                reason: `Cooldown active until ${cooldownEnd.toISOString()}`
            };
        }

        // Send to each configured channel
        for (const channel of alert.channels) {
            try {
                switch (channel) {
                    case 'slack':
                        results.channels.slack = await this._notifySlack(alert);
                        break;
                    case 'email':
                        results.channels.email = await this._notifyEmail(alert);
                        break;
                    case 'console':
                    default:
                        results.channels.console = this._notifyConsole(alert);
                }
            } catch (error) {
                results.channels[channel] = { success: false, error: error.message };
            }
        }

        // Set cooldown
        const cooldownMs = this._parseCooldown(
            this.thresholds[alert.kpiId]?.cooldown ?? this.defaultCooldown ?? '24h'
        );
        this.cooldowns.set(cooldownKey, new Date(Date.now() + cooldownMs));

        return results;
    }

    /**
     * Create a digest of alerts over a period
     *
     * @param {string} period - Digest period: 'daily', 'weekly'
     * @returns {Object} Alert digest
     */
    createDigest(period = 'daily') {
        const now = new Date();
        let cutoff;

        switch (period) {
            case 'weekly':
                cutoff = new Date(now - 7 * 24 * 60 * 60 * 1000);
                break;
            case 'daily':
            default:
                cutoff = new Date(now - 24 * 60 * 60 * 1000);
        }

        const recentAlerts = this.alertHistory.filter(a =>
            new Date(a.timestamp) > cutoff
        );

        const bySeverity = {
            critical: recentAlerts.filter(a => a.severity === 'critical'),
            warning: recentAlerts.filter(a => a.severity === 'warning'),
            info: recentAlerts.filter(a => a.severity === 'info')
        };

        const byKpi = {};
        recentAlerts.forEach(a => {
            if (!byKpi[a.kpiId]) byKpi[a.kpiId] = [];
            byKpi[a.kpiId].push(a);
        });

        return {
            period,
            startDate: cutoff.toISOString(),
            endDate: now.toISOString(),
            totalAlerts: recentAlerts.length,
            bySeverity: {
                critical: bySeverity.critical.length,
                warning: bySeverity.warning.length,
                info: bySeverity.info.length
            },
            byKpi: Object.fromEntries(
                Object.entries(byKpi).map(([k, v]) => [k, v.length])
            ),
            topAlerts: recentAlerts.slice(0, 10),
            summary: this._generateDigestSummary(recentAlerts, bySeverity)
        };
    }

    /**
     * Load alert configuration from file
     *
     * @param {string} configPath - Path to config file
     */
    loadConfig(configPath) {
        if (!fs.existsSync(configPath)) {
            throw new Error(`Config file not found: ${configPath}`);
        }

        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        this.thresholds = { ...this.thresholds, ...config.thresholds };

        if (config.defaultCooldown) this.defaultCooldown = config.defaultCooldown;
        if (config.defaultChannels) this.defaultChannels = config.defaultChannels;
        if (config.slackWebhook) this.slackWebhook = config.slackWebhook;
    }

    /**
     * Save current configuration to file
     *
     * @param {string} configPath - Path to save config
     */
    saveConfig(configPath) {
        const config = {
            thresholds: this.thresholds,
            defaultCooldown: this.defaultCooldown,
            defaultChannels: this.defaultChannels
        };

        fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
    }

    /**
     * Get alert history
     *
     * @param {Object} [options] - Filter options
     * @param {string} [options.kpiId] - Filter by KPI
     * @param {string} [options.severity] - Filter by severity
     * @param {number} [options.limit] - Maximum results
     * @returns {Array} Alert history
     */
    getAlertHistory(options = {}) {
        let history = [...this.alertHistory];

        if (options.kpiId) {
            history = history.filter(a => a.kpiId === options.kpiId);
        }

        if (options.severity) {
            history = history.filter(a => a.severity === options.severity);
        }

        if (options.limit) {
            history = history.slice(-options.limit);
        }

        return history;
    }

    // ==================== Private Methods ====================

    /**
     * Evaluate static threshold
     * @private
     */
    _evaluateStaticThreshold(kpiId, currentValue, threshold) {
        const { thresholdType, value, severity } = threshold;

        let alert = false;
        let breach = null;

        switch (thresholdType) {
            case 'min':
                if (currentValue < value) {
                    alert = true;
                    breach = {
                        type: 'below_minimum',
                        threshold: value,
                        actual: currentValue,
                        variance: currentValue - value
                    };
                }
                break;

            case 'max':
                if (currentValue > value) {
                    alert = true;
                    breach = {
                        type: 'above_maximum',
                        threshold: value,
                        actual: currentValue,
                        variance: currentValue - value
                    };
                }
                break;

            case 'range':
                if (currentValue < value.min) {
                    alert = true;
                    breach = {
                        type: 'below_range',
                        threshold: value.min,
                        actual: currentValue,
                        variance: currentValue - value.min
                    };
                } else if (currentValue > value.max) {
                    alert = true;
                    breach = {
                        type: 'above_range',
                        threshold: value.max,
                        actual: currentValue,
                        variance: currentValue - value.max
                    };
                }
                break;
        }

        return {
            alert,
            severity: alert ? severity : null,
            breach,
            thresholdType: 'static',
            message: alert
                ? `${kpiId} ${breach.type.replace('_', ' ')}: ${currentValue} (threshold: ${breach.threshold})`
                : `${kpiId} within acceptable range`
        };
    }

    /**
     * Evaluate dynamic threshold based on baseline
     * @private
     */
    _evaluateDynamicThreshold(kpiId, currentValue, historicalData, threshold) {
        if (historicalData.length < 3) {
            return {
                alert: false,
                reason: 'Insufficient historical data for dynamic threshold'
            };
        }

        const { deviationPercent, severity } = threshold;

        // Calculate baseline from historical data
        const baseline = historicalData.reduce((a, b) => a + b, 0) / historicalData.length;

        // Calculate actual deviation
        const actualDeviation = ((currentValue - baseline) / baseline) * 100;
        const alert = Math.abs(actualDeviation) > deviationPercent;

        return {
            alert,
            severity: alert ? severity : null,
            breach: alert ? {
                type: actualDeviation > 0 ? 'above_baseline' : 'below_baseline',
                baseline,
                actual: currentValue,
                deviationPercent: actualDeviation,
                thresholdPercent: deviationPercent
            } : null,
            thresholdType: 'dynamic',
            baseline,
            message: alert
                ? `${kpiId} deviates ${actualDeviation.toFixed(1)}% from baseline (threshold: ${deviationPercent}%)`
                : `${kpiId} within dynamic threshold`
        };
    }

    /**
     * Evaluate trend-based threshold
     * @private
     */
    _evaluateTrendThreshold(kpiId, currentValue, historicalData, threshold) {
        const { trendDirection, periods, severity } = threshold;

        if (historicalData.length < periods) {
            return {
                alert: false,
                reason: `Insufficient data for trend analysis (need ${periods} periods)`
            };
        }

        // Get recent values including current
        const recentValues = [...historicalData.slice(-(periods - 1)), currentValue];

        // Check for consistent trend
        let isIncreasing = true;
        let isDecreasing = true;

        for (let i = 1; i < recentValues.length; i++) {
            if (recentValues[i] <= recentValues[i - 1]) isIncreasing = false;
            if (recentValues[i] >= recentValues[i - 1]) isDecreasing = false;
        }

        let alert = false;
        let detectedTrend = null;

        if (isIncreasing) detectedTrend = 'increasing';
        else if (isDecreasing) detectedTrend = 'decreasing';

        if (detectedTrend) {
            if (trendDirection === 'either' ||
                trendDirection === detectedTrend) {
                alert = true;
            }
        }

        return {
            alert,
            severity: alert ? severity : null,
            breach: alert ? {
                type: `trend_${detectedTrend}`,
                direction: detectedTrend,
                periods,
                values: recentValues
            } : null,
            thresholdType: 'trend',
            detectedTrend,
            message: alert
                ? `${kpiId} has been ${detectedTrend} for ${periods} consecutive periods`
                : `${kpiId} no consistent trend detected`
        };
    }

    /**
     * Send Slack notification
     * @private
     */
    async _notifySlack(alert) {
        if (!this.slackWebhook) {
            return { success: false, error: 'Slack webhook not configured' };
        }

        const emoji = alert.severity === 'critical' ? ':rotating_light:' :
                      alert.severity === 'warning' ? ':warning:' : ':information_source:';

        const payload = {
            blocks: [
                {
                    type: 'header',
                    text: {
                        type: 'plain_text',
                        text: `${emoji} KPI Alert: ${alert.kpiId}`
                    }
                },
                {
                    type: 'section',
                    fields: [
                        {
                            type: 'mrkdwn',
                            text: `*Severity:*\n${alert.severity.toUpperCase()}`
                        },
                        {
                            type: 'mrkdwn',
                            text: `*Current Value:*\n${alert.breach?.actual ?? 'N/A'}`
                        }
                    ]
                },
                {
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: `*Details:*\n${alert.breach?.type?.replace(/_/g, ' ') ?? 'Alert triggered'}`
                    }
                },
                {
                    type: 'context',
                    elements: [
                        {
                            type: 'mrkdwn',
                            text: `Triggered at ${alert.timestamp}`
                        }
                    ]
                }
            ]
        };

        try {
            const response = await fetch(this.slackWebhook, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            return {
                success: response.ok,
                status: response.status
            };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Send email notification
     * @private
     */
    async _notifyEmail(alert) {
        // Email implementation would go here (SendGrid, SMTP, etc.)
        // For now, return placeholder
        return {
            success: false,
            error: 'Email notifications not yet implemented'
        };
    }

    /**
     * Log to console
     * @private
     */
    _notifyConsole(alert) {
        const icon = alert.severity === 'critical' ? '[CRITICAL]' :
                     alert.severity === 'warning' ? '[WARNING]' : '[INFO]';

        console.log(`\n${icon} KPI ALERT: ${alert.kpiId}`);
        console.log(`  Severity: ${alert.severity}`);
        console.log(`  Value: ${alert.breach?.actual ?? 'N/A'}`);
        console.log(`  Threshold: ${alert.breach?.threshold ?? 'N/A'}`);
        console.log(`  Type: ${alert.breach?.type ?? 'N/A'}`);
        console.log(`  Time: ${alert.timestamp}\n`);

        return { success: true };
    }

    /**
     * Parse cooldown string to milliseconds
     * @private
     */
    _parseCooldown(cooldown) {
        const match = cooldown.match(/^(\d+)(h|m|d)$/);
        if (!match) return 24 * 60 * 60 * 1000; // Default 24h

        const value = parseInt(match[1]);
        const unit = match[2];

        switch (unit) {
            case 'm': return value * 60 * 1000;
            case 'h': return value * 60 * 60 * 1000;
            case 'd': return value * 24 * 60 * 60 * 1000;
            default: return 24 * 60 * 60 * 1000;
        }
    }

    /**
     * Generate digest summary text
     * @private
     */
    _generateDigestSummary(alerts, bySeverity) {
        if (alerts.length === 0) {
            return 'No alerts during this period.';
        }

        const parts = [];

        if (bySeverity.critical.length > 0) {
            parts.push(`${bySeverity.critical.length} CRITICAL`);
        }
        if (bySeverity.warning.length > 0) {
            parts.push(`${bySeverity.warning.length} warning`);
        }
        if (bySeverity.info.length > 0) {
            parts.push(`${bySeverity.info.length} info`);
        }

        return `${alerts.length} total alerts: ${parts.join(', ')}`;
    }
}

/**
 * Command-line interface
 */
async function main() {
    const args = process.argv.slice(2);

    if (args.length === 0 || args.includes('--help')) {
        console.log(`
KPI Alert Monitor

Usage:
  node kpi-alert-monitor.js <command> [options]

Commands:
  evaluate <kpi> <value>    Evaluate a KPI against thresholds
  set-threshold             Set a threshold for a KPI
  digest                    Generate alert digest
  history                   Show alert history
  config                    Manage configuration

Options:
  --config <path>           Path to alert configuration file
  --kpi <id>               KPI identifier
  --value <n>              Current KPI value
  --type <type>            Threshold type: static, dynamic, trend
  --threshold <n>          Threshold value
  --severity <s>           Alert severity: info, warning, critical
  --period <p>             Digest period: daily, weekly
  --output <path>          Output file path
  --help                   Show this help message

Examples:
  node kpi-alert-monitor.js evaluate NRR 0.95 --config ./alerts.json
  node kpi-alert-monitor.js set-threshold --kpi NRR --type static --threshold 1.0 --severity critical
  node kpi-alert-monitor.js digest --period daily --config ./alerts.json
  node kpi-alert-monitor.js history --kpi NRR --limit 10
        `);
        process.exit(0);
    }

    try {
        const command = args[0];
        const configPath = args.includes('--config') ? args[args.indexOf('--config') + 1] : null;

        const monitor = new KPIAlertMonitor({ configPath });
        await monitor.initialize();

        switch (command) {
            case 'evaluate': {
                const kpi = args[1];
                const value = parseFloat(args[2]);

                if (!kpi || isNaN(value)) {
                    console.error('Usage: evaluate <kpi> <value>');
                    process.exit(1);
                }

                const result = monitor.evaluateKPI(kpi, value);
                console.log(JSON.stringify(result, null, 2));

                if (result.alert) {
                    const alert = monitor.generateAlert(kpi, result.breach);
                    await monitor.notify(alert);
                }
                break;
            }

            case 'set-threshold': {
                const kpi = args.includes('--kpi') ? args[args.indexOf('--kpi') + 1] : null;
                const type = args.includes('--type') ? args[args.indexOf('--type') + 1] : 'static';
                const threshold = args.includes('--threshold') ? parseFloat(args[args.indexOf('--threshold') + 1]) : null;
                const severity = args.includes('--severity') ? args[args.indexOf('--severity') + 1] : 'warning';

                if (!kpi || threshold === null) {
                    console.error('Usage: set-threshold --kpi <id> --threshold <value>');
                    process.exit(1);
                }

                if (type === 'static') {
                    monitor.setThreshold(kpi, 'min', threshold, severity);
                } else if (type === 'dynamic') {
                    monitor.setDynamicThreshold(kpi, threshold, severity);
                }

                console.log(`Threshold set for ${kpi}`);
                console.log(JSON.stringify(monitor.thresholds[kpi], null, 2));

                if (configPath) {
                    monitor.saveConfig(configPath);
                    console.log(`Configuration saved to ${configPath}`);
                }
                break;
            }

            case 'digest': {
                const period = args.includes('--period') ? args[args.indexOf('--period') + 1] : 'daily';
                const digest = monitor.createDigest(period);

                console.log('\n=== ALERT DIGEST ===');
                console.log(`Period: ${digest.period} (${digest.startDate} to ${digest.endDate})`);
                console.log(`Total Alerts: ${digest.totalAlerts}`);
                console.log(`  Critical: ${digest.bySeverity.critical}`);
                console.log(`  Warning: ${digest.bySeverity.warning}`);
                console.log(`  Info: ${digest.bySeverity.info}`);
                console.log(`\nSummary: ${digest.summary}`);

                const outputPath = args.includes('--output') ? args[args.indexOf('--output') + 1] : null;
                if (outputPath) {
                    fs.writeFileSync(outputPath, JSON.stringify(digest, null, 2), 'utf8');
                    console.log(`\nDigest saved to ${outputPath}`);
                }
                break;
            }

            case 'history': {
                const kpi = args.includes('--kpi') ? args[args.indexOf('--kpi') + 1] : null;
                const limit = args.includes('--limit') ? parseInt(args[args.indexOf('--limit') + 1]) : 20;

                const history = monitor.getAlertHistory({ kpiId: kpi, limit });

                console.log(`\n=== ALERT HISTORY (${history.length} alerts) ===\n`);
                history.forEach(alert => {
                    console.log(`[${alert.timestamp}] ${alert.kpiId}: ${alert.message}`);
                });
                break;
            }

            case 'config': {
                console.log('\nCurrent Configuration:');
                console.log(JSON.stringify(monitor.thresholds, null, 2));
                break;
            }

            default:
                console.error(`Unknown command: ${command}`);
                process.exit(1);
        }

    } catch (error) {
        console.error('\nError:');
        console.error(error.message);
        process.exit(1);
    }
}

// Run CLI if executed directly
if (require.main === module) {
    main().catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}

module.exports = { KPIAlertMonitor };
