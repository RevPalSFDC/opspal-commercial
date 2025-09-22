#!/usr/bin/env node

/**
 * Cross-Platform Monitoring & Alerting System
 * Tracks sync performance, detects anomalies, and sends alerts
 */

const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

class MonitoringSystem extends EventEmitter {
    constructor(configPath) {
        super();
        this.config = this.loadConfig(configPath);
        this.metrics = new Map();
        this.alerts = [];
        this.thresholds = this.config.monitoring.metrics;
        this.channels = this.config.monitoring.alerts;

        // Initialize metric collectors
        this.initializeCollectors();

        // Start monitoring
        this.startMonitoring();
    }

    loadConfig(configPath) {
        const fullPath = path.resolve(configPath);
        const configContent = fs.readFileSync(fullPath, 'utf8');
        return yaml.load(configContent);
    }

    /**
     * Initialize metric collectors
     */
    initializeCollectors() {
        // Success rate collector
        this.metrics.set('sync_success_rate', {
            values: [],
            window: 3600000, // 1 hour in ms
            threshold: 0.95,
            calculate: () => {
                const values = this.metrics.get('sync_success_rate').values;
                if (values.length === 0) return 1;

                const recent = values.filter(v =>
                    Date.now() - v.timestamp < 3600000
                );

                if (recent.length === 0) return 1;

                const success = recent.filter(v => v.success).length;
                return success / recent.length;
            }
        });

        // API response time collector
        this.metrics.set('api_response_time', {
            values: [],
            window: 300000, // 5 minutes in ms
            threshold: 2000,
            calculate: () => {
                const values = this.metrics.get('api_response_time').values;
                const recent = values.filter(v =>
                    Date.now() - v.timestamp < 300000
                );

                if (recent.length === 0) return 0;

                const sum = recent.reduce((acc, v) => acc + v.responseTime, 0);
                return sum / recent.length;
            }
        });

        // Record lag collector
        this.metrics.set('record_lag', {
            values: [],
            window: 900000, // 15 minutes in ms
            threshold: 300,
            calculate: () => {
                const values = this.metrics.get('record_lag').values;
                const recent = values.filter(v =>
                    Date.now() - v.timestamp < 900000
                );

                if (recent.length === 0) return 0;

                const maxLag = Math.max(...recent.map(v => v.lag));
                return maxLag;
            }
        });

        // Error rate collector
        this.metrics.set('error_rate', {
            values: [],
            window: 3600000,
            threshold: 0.05,
            calculate: () => {
                const values = this.metrics.get('error_rate').values;
                const recent = values.filter(v =>
                    Date.now() - v.timestamp < 3600000
                );

                if (recent.length === 0) return 0;

                const errors = recent.filter(v => v.error).length;
                return errors / recent.length;
            }
        });

        // Conflict rate collector
        this.metrics.set('conflict_rate', {
            values: [],
            window: 3600000,
            threshold: 0.10,
            calculate: () => {
                const values = this.metrics.get('conflict_rate').values;
                const recent = values.filter(v =>
                    Date.now() - v.timestamp < 3600000
                );

                if (recent.length === 0) return 0;

                const conflicts = recent.filter(v => v.conflict).length;
                return conflicts / recent.length;
            }
        });
    }

    /**
     * Start monitoring loop
     */
    startMonitoring() {
        // Check metrics every 30 seconds
        this.monitoringInterval = setInterval(() => {
            this.checkMetrics();
        }, 30000);

        // Clean old metrics every 5 minutes
        this.cleanupInterval = setInterval(() => {
            this.cleanupMetrics();
        }, 300000);

        console.log('🔍 Monitoring system started');
    }

    /**
     * Stop monitoring
     */
    stopMonitoring() {
        clearInterval(this.monitoringInterval);
        clearInterval(this.cleanupInterval);
        console.log('🛑 Monitoring system stopped');
    }

    /**
     * Record a sync event
     */
    recordSyncEvent(event) {
        const {
            type,
            success,
            responseTime,
            error,
            conflict,
            recordCount,
            timestamp = Date.now()
        } = event;

        // Record success/failure
        this.metrics.get('sync_success_rate').values.push({
            timestamp,
            success: !error
        });

        // Record response time if available
        if (responseTime !== undefined) {
            this.metrics.get('api_response_time').values.push({
                timestamp,
                responseTime
            });
        }

        // Record errors
        if (error) {
            this.metrics.get('error_rate').values.push({
                timestamp,
                error: true,
                details: error
            });
        }

        // Record conflicts
        if (conflict) {
            this.metrics.get('conflict_rate').values.push({
                timestamp,
                conflict: true,
                details: conflict
            });
        }

        // Emit event for listeners
        this.emit('sync_event', event);
    }

    /**
     * Record record lag
     */
    recordLag(lag) {
        this.metrics.get('record_lag').values.push({
            timestamp: Date.now(),
            lag
        });
    }

    /**
     * Check metrics and trigger alerts
     */
    checkMetrics() {
        for (const [name, metric] of this.metrics) {
            const currentValue = metric.calculate();
            const threshold = metric.threshold;

            // Check if metric violates threshold
            let violated = false;
            let severity = 'info';

            if (name === 'sync_success_rate') {
                violated = currentValue < threshold;
                severity = currentValue < 0.90 ? 'critical' : 'warning';
            } else if (name === 'error_rate' || name === 'conflict_rate') {
                violated = currentValue > threshold;
                severity = currentValue > threshold * 2 ? 'critical' : 'warning';
            } else if (name === 'api_response_time' || name === 'record_lag') {
                violated = currentValue > threshold;
                severity = currentValue > threshold * 1.5 ? 'critical' : 'warning';
            }

            if (violated) {
                this.triggerAlert({
                    metric: name,
                    currentValue,
                    threshold,
                    severity,
                    timestamp: new Date().toISOString()
                });
            }
        }
    }

    /**
     * Trigger an alert
     */
    triggerAlert(alert) {
        // Check if similar alert was recently sent (deduplication)
        const recentAlert = this.alerts.find(a =>
            a.metric === alert.metric &&
            Date.now() - new Date(a.timestamp).getTime() < 300000 // 5 minutes
        );

        if (recentAlert) {
            return; // Skip duplicate alert
        }

        // Add to alert history
        this.alerts.push(alert);

        // Send to configured channels
        this.sendAlert(alert);

        // Emit alert event
        this.emit('alert', alert);
    }

    /**
     * Send alert to configured channels
     */
    async sendAlert(alert) {
        const { severity, metric, currentValue, threshold } = alert;

        // Format alert message
        const message = this.formatAlertMessage(alert);

        // Send to Slack if configured
        if (this.channels.slack.enabled) {
            await this.sendSlackAlert(message, severity);
        }

        // Send email if configured
        if (this.channels.email.enabled) {
            await this.sendEmailAlert(message, severity);
        }

        // Send to PagerDuty for critical alerts
        if (severity === 'critical' && this.channels.pagerduty?.enabled) {
            await this.sendPagerDutyAlert(alert);
        }

        // Log alert
        console.log(`🚨 Alert: ${severity.toUpperCase()} - ${metric}: ${currentValue} (threshold: ${threshold})`);
    }

    /**
     * Format alert message
     */
    formatAlertMessage(alert) {
        const { metric, currentValue, threshold, severity, timestamp } = alert;

        const emoji = {
            critical: '🔴',
            warning: '⚠️',
            info: 'ℹ️'
        }[severity];

        return {
            text: `${emoji} *${severity.toUpperCase()} Alert*`,
            blocks: [
                {
                    type: 'header',
                    text: {
                        type: 'plain_text',
                        text: `${emoji} ${severity.toUpperCase()}: ${metric.replace(/_/g, ' ').toUpperCase()}`
                    }
                },
                {
                    type: 'section',
                    fields: [
                        {
                            type: 'mrkdwn',
                            text: `*Metric:*\n${metric}`
                        },
                        {
                            type: 'mrkdwn',
                            text: `*Current Value:*\n${this.formatValue(metric, currentValue)}`
                        },
                        {
                            type: 'mrkdwn',
                            text: `*Threshold:*\n${this.formatValue(metric, threshold)}`
                        },
                        {
                            type: 'mrkdwn',
                            text: `*Time:*\n${new Date(timestamp).toLocaleString()}`
                        }
                    ]
                },
                {
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: this.getRecommendation(metric, currentValue, threshold)
                    }
                }
            ]
        };
    }

    /**
     * Format metric value for display
     */
    formatValue(metric, value) {
        if (metric.includes('rate')) {
            return `${(value * 100).toFixed(2)}%`;
        }
        if (metric.includes('time')) {
            return `${value.toFixed(0)}ms`;
        }
        if (metric.includes('lag')) {
            return `${value.toFixed(0)}s`;
        }
        return value.toFixed(2);
    }

    /**
     * Get recommendation based on metric violation
     */
    getRecommendation(metric, currentValue, threshold) {
        const recommendations = {
            sync_success_rate: '• Check error logs for failure patterns\n• Review API rate limits\n• Verify network connectivity',
            error_rate: '• Investigate error types in logs\n• Check data validation rules\n• Review recent code changes',
            conflict_rate: '• Review conflict resolution strategy\n• Check for concurrent modifications\n• Consider field-level locking',
            api_response_time: '• Check API server health\n• Review batch sizes\n• Consider implementing caching',
            record_lag: '• Check sync job status\n• Review queue processing\n• Scale up workers if needed'
        };

        return `*Recommended Actions:*\n${recommendations[metric] || '• Review system logs for details'}`;
    }

    /**
     * Send Slack alert
     */
    async sendSlackAlert(message, severity) {
        const webhook = process.env[this.channels.slack.webhook_env];
        if (!webhook) {
            console.warn('Slack webhook not configured');
            return;
        }

        try {
            // In production, use actual webhook
            // For simulation, just log
            console.log('📢 Slack alert sent:', message.text);
        } catch (error) {
            console.error('Failed to send Slack alert:', error);
        }
    }

    /**
     * Send email alert (stub)
     */
    async sendEmailAlert(message, severity) {
        console.log('📧 Email alert would be sent:', message.text);
    }

    /**
     * Send PagerDuty alert (stub)
     */
    async sendPagerDutyAlert(alert) {
        console.log('📟 PagerDuty alert would be sent:', alert);
    }

    /**
     * Clean up old metrics
     */
    cleanupMetrics() {
        for (const [name, metric] of this.metrics) {
            const cutoff = Date.now() - metric.window;
            metric.values = metric.values.filter(v => v.timestamp > cutoff);
        }

        // Clean old alerts (keep last 100)
        if (this.alerts.length > 100) {
            this.alerts = this.alerts.slice(-100);
        }
    }

    /**
     * Get current metrics summary
     */
    getMetricsSummary() {
        const summary = {};
        for (const [name, metric] of this.metrics) {
            summary[name] = {
                current: metric.calculate(),
                threshold: metric.threshold,
                samples: metric.values.length,
                window: `${metric.window / 60000} minutes`
            };
        }
        return summary;
    }

    /**
     * Get alert history
     */
    getAlertHistory(limit = 10) {
        return this.alerts.slice(-limit);
    }
}

// Export for use in other modules
module.exports = MonitoringSystem;

// CLI interface for testing
if (require.main === module) {
    const monitor = new MonitoringSystem('../config/cross-platform-config.yaml');

    // Simulate events for testing
    console.log('Starting monitoring system simulation...\n');

    // Simulate successful syncs
    setInterval(() => {
        monitor.recordSyncEvent({
            type: 'sync',
            success: Math.random() > 0.1, // 90% success rate
            responseTime: Math.random() * 3000, // 0-3000ms
            error: Math.random() > 0.9 ? 'Random error' : null,
            conflict: Math.random() > 0.95 ? 'Field conflict' : null,
            recordCount: Math.floor(Math.random() * 100)
        });
    }, 5000);

    // Simulate lag
    setInterval(() => {
        monitor.recordLag(Math.random() * 600); // 0-600 seconds
    }, 10000);

    // Print metrics summary every minute
    setInterval(() => {
        console.log('\n📊 Metrics Summary:');
        const summary = monitor.getMetricsSummary();
        Object.entries(summary).forEach(([name, data]) => {
            const value = monitor.formatValue(name, data.current);
            const status = data.current > data.threshold ? '❌' : '✅';
            console.log(`  ${status} ${name}: ${value} (threshold: ${monitor.formatValue(name, data.threshold)})`);
        });
    }, 60000);

    // Handle shutdown
    process.on('SIGINT', () => {
        console.log('\nShutting down monitoring system...');
        monitor.stopMonitoring();
        process.exit(0);
    });
}