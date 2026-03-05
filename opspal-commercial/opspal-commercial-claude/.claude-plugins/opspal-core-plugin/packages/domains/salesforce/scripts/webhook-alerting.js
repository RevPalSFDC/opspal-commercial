#!/usr/bin/env node
/**
 * Webhook Alerting Layer
 * Connects audit results to Slack/Teams with intelligent escalation
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

class WebhookAlerting {
    constructor(config = {}) {
        // Load config from environment or parameters
        this.config = {
            slack: {
                webhook: process.env.SLACK_WEBHOOK_URL || config.slackWebhook,
                channel: process.env.SLACK_CHANNEL || config.slackChannel || '#revops-alerts',
                enabled: !!process.env.SLACK_WEBHOOK_URL || !!config.slackWebhook
            },
            teams: {
                webhook: process.env.TEAMS_WEBHOOK_URL || config.teamsWebhook,
                enabled: !!process.env.TEAMS_WEBHOOK_URL || !!config.teamsWebhook
            },
            thresholds: {
                critical: 50,  // Data quality score
                warning: 70,
                info: 85
            },
            escalation: {
                critical: ['slack', 'teams', 'email'],
                warning: ['slack'],
                info: ['slack']
            }
        };

        // Merge custom thresholds
        if (config.thresholds) {
            this.config.thresholds = { ...this.config.thresholds, ...config.thresholds };
        }
    }

    /**
     * Send alert based on audit results
     */
    async sendAlert(auditResults) {
        const severity = this.determineSeverity(auditResults);
        const message = this.formatMessage(auditResults, severity);
        const channels = this.config.escalation[severity] || ['slack'];

        const results = [];

        for (const channel of channels) {
            try {
                if (channel === 'slack' && this.config.slack.enabled) {
                    const result = await this.sendSlackAlert(message, severity);
                    results.push({ channel: 'slack', success: true, result });
                } else if (channel === 'teams' && this.config.teams.enabled) {
                    const result = await this.sendTeamsAlert(message, severity);
                    results.push({ channel: 'teams', success: true, result });
                } else if (channel === 'email') {
                    const result = await this.sendEmailAlert(message, severity);
                    results.push({ channel: 'email', success: true, result });
                }
            } catch (error) {
                console.error(`Failed to send ${channel} alert:`, error);
                results.push({ channel, success: false, error: error.message });
            }
        }

        return results;
    }

    /**
     * Determine severity based on audit results
     */
    determineSeverity(results) {
        // Check various metrics
        const dataQualityScore = results.dataQualityScore || 100;
        const staticDatePercent = results.staticDatePercent || 0;
        const unusedReportPercent = results.unusedReportPercent || 0;
        const apiLimitUsage = results.apiLimitUsage || 0;

        // Critical conditions
        if (dataQualityScore < this.config.thresholds.critical ||
            apiLimitUsage > 90 ||
            results.criticalErrors > 0) {
            return 'critical';
        }

        // Warning conditions
        if (dataQualityScore < this.config.thresholds.warning ||
            staticDatePercent > 20 ||
            unusedReportPercent > 40 ||
            apiLimitUsage > 75) {
            return 'warning';
        }

        // Info level
        return 'info';
    }

    /**
     * Format message for alerts
     */
    formatMessage(results, severity) {
        const emoji = {
            critical: '🚨',
            warning: '⚠️',
            info: 'ℹ️'
        };

        const color = {
            critical: '#FF0000',
            warning: '#FFA500',
            info: '#0000FF'
        };

        return {
            title: `${emoji[severity]} RevOps Alert - ${severity.toUpperCase()}`,
            color: color[severity],
            timestamp: new Date().toISOString(),
            fields: [
                {
                    name: 'Data Quality Score',
                    value: `${results.dataQualityScore || 'N/A'}%`,
                    inline: true
                },
                {
                    name: 'Static Date Reports',
                    value: `${results.staticDatePercent || 0}%`,
                    inline: true
                },
                {
                    name: 'Unused Reports',
                    value: `${results.unusedReportPercent || 0}%`,
                    inline: true
                },
                {
                    name: 'API Limit Usage',
                    value: `${results.apiLimitUsage || 0}%`,
                    inline: true
                }
            ],
            summary: this.generateSummary(results, severity),
            actions: this.suggestActions(results, severity)
        };
    }

    /**
     * Generate alert summary
     */
    generateSummary(results, severity) {
        const issues = [];

        if (results.dataQualityScore < 70) {
            issues.push(`Data quality below threshold (${results.dataQualityScore}%)`);
        }

        if (results.staticDatePercent > 20) {
            issues.push(`High percentage of static dates (${results.staticDatePercent}%)`);
        }

        if (results.unusedReportPercent > 30) {
            issues.push(`Many unused reports (${results.unusedReportPercent}%)`);
        }

        if (results.apiLimitUsage > 75) {
            issues.push(`API limits near threshold (${results.apiLimitUsage}%)`);
        }

        return issues.length > 0
            ? `Issues detected: ${issues.join(', ')}`
            : 'Regular monitoring check - all metrics within normal ranges';
    }

    /**
     * Suggest actions based on results
     */
    suggestActions(results, severity) {
        const actions = [];

        if (severity === 'critical') {
            actions.push('🔴 Immediate action required');

            if (results.apiLimitUsage > 90) {
                actions.push('• Pause non-critical operations');
                actions.push('• Review API consumption patterns');
            }

            if (results.dataQualityScore < 50) {
                actions.push('• Run data quality remediation');
                actions.push('• Review recent data changes');
            }
        } else if (severity === 'warning') {
            if (results.unusedReportPercent > 30) {
                actions.push('• Schedule report archival');
                actions.push('• Review report usage patterns');
            }

            if (results.staticDatePercent > 20) {
                actions.push('• Convert static dates to relative');
                actions.push('• Update report templates');
            }
        } else {
            actions.push('✅ No immediate action required');
            actions.push('• Continue monitoring');
        }

        return actions;
    }

    /**
     * Send Slack alert
     */
    async sendSlackAlert(message, severity) {
        const slackPayload = {
            channel: this.config.slack.channel,
            username: 'RevOps Monitor',
            icon_emoji: ':chart_with_upwards_trend:',
            attachments: [{
                color: message.color,
                title: message.title,
                text: message.summary,
                fields: message.fields.map(f => ({
                    title: f.name,
                    value: f.value,
                    short: f.inline
                })),
                footer: 'RevOps Monitoring System',
                footer_icon: 'https://platform.slack-edge.com/img/default_application_icon.png',
                ts: Math.floor(Date.now() / 1000)
            }]
        };

        // Add actions as a separate attachment
        if (message.actions && message.actions.length > 0) {
            slackPayload.attachments.push({
                color: message.color,
                title: 'Recommended Actions',
                text: message.actions.join('\n'),
                mrkdwn_in: ['text']
            });
        }

        return this.sendWebhook(this.config.slack.webhook, slackPayload);
    }

    /**
     * Send Teams alert
     */
    async sendTeamsAlert(message, severity) {
        const teamsPayload = {
            '@type': 'MessageCard',
            '@context': 'https://schema.org/extensions',
            themeColor: message.color.replace('#', ''),
            summary: message.title,
            sections: [{
                activityTitle: message.title,
                activitySubtitle: message.summary,
                facts: message.fields.map(f => ({
                    name: f.name,
                    value: f.value
                }))
            }]
        };

        // Add actions section
        if (message.actions && message.actions.length > 0) {
            teamsPayload.sections.push({
                activityTitle: 'Recommended Actions',
                text: message.actions.join('<br/>')
            });
        }

        return this.sendWebhook(this.config.teams.webhook, teamsPayload);
    }

    /**
     * Send email alert (stub - implement based on your email service)
     */
    async sendEmailAlert(message, severity) {
        // This would integrate with your email service
        // For now, just log to file
        const emailLog = {
            timestamp: new Date().toISOString(),
            severity,
            subject: message.title,
            body: {
                summary: message.summary,
                metrics: message.fields,
                actions: message.actions
            }
        };

        const logFile = path.join('logs', `email_alerts_${new Date().toISOString().split('T')[0]}.json`);

        // Ensure logs directory exists
        if (!fs.existsSync('logs')) {
            fs.mkdirSync('logs');
        }

        // Append to log file
        fs.appendFileSync(logFile, JSON.stringify(emailLog) + '\n');

        return { logged: true, file: logFile };
    }

    /**
     * Generic webhook sender
     */
    async sendWebhook(webhookUrl, payload) {
        return new Promise((resolve, reject) => {
            const data = JSON.stringify(payload);
            const url = new URL(webhookUrl);

            const options = {
                hostname: url.hostname,
                port: 443,
                path: url.pathname + url.search,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': data.length
                }
            };

            const req = https.request(options, (res) => {
                let body = '';

                res.on('data', (chunk) => {
                    body += chunk;
                });

                res.on('end', () => {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve({ success: true, statusCode: res.statusCode, body });
                    } else {
                        reject(new Error(`Webhook failed: ${res.statusCode} - ${body}`));
                    }
                });
            });

            req.on('error', reject);
            req.write(data);
            req.end();
        });
    }

    /**
     * Process audit file and send alerts
     */
    async processAuditFile(auditFilePath) {
        try {
            // Read audit results
            const auditData = JSON.parse(fs.readFileSync(auditFilePath, 'utf8'));

            // Transform to alert format
            const alertData = {
                dataQualityScore: auditData.summary?.dataQualityScore ||
                                 (100 - (auditData.issues?.length || 0)),
                staticDatePercent: this.calculatePercent(
                    auditData.metrics?.reports?.static_dates,
                    auditData.metrics?.reports?.total
                ),
                unusedReportPercent: this.calculatePercent(
                    auditData.metrics?.reports?.unused_90_days,
                    auditData.metrics?.reports?.total
                ),
                apiLimitUsage: auditData.apiLimits?.percentUsed || 0,
                criticalErrors: auditData.criticalErrors || 0,
                timestamp: auditData.timestamp,
                org: auditData.org
            };

            // Send alerts
            const results = await this.sendAlert(alertData);

            console.log('Alerts sent:', results);
            return results;

        } catch (error) {
            console.error('Failed to process audit file:', error);
            throw error;
        }
    }

    /**
     * Calculate percentage safely
     */
    calculatePercent(numerator, denominator) {
        if (!denominator || denominator === 0) return 0;
        return Math.round((numerator / denominator) * 100);
    }
}

// CLI usage
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length < 1) {
        console.log('Usage: node webhook-alerting.js <audit-file.json> [--test]');
        process.exit(1);
    }

    const auditFile = args[0];
    const isTest = args.includes('--test');

    const alerter = new WebhookAlerting({
        // Can override config here
        thresholds: {
            critical: 50,
            warning: 70,
            info: 85
        }
    });

    if (isTest) {
        // Test mode - send test alert
        const testData = {
            dataQualityScore: 65,
            staticDatePercent: 25,
            unusedReportPercent: 35,
            apiLimitUsage: 45,
            criticalErrors: 0
        };

        alerter.sendAlert(testData)
            .then(results => {
                console.log('Test alert sent:', results);
            })
            .catch(error => {
                console.error('Test alert failed:', error);
            });
    } else {
        // Process actual audit file
        alerter.processAuditFile(auditFile)
            .then(results => {
                console.log('Alerts processed successfully');
                process.exit(0);
            })
            .catch(error => {
                console.error('Alert processing failed:', error);
                process.exit(1);
            });
    }
}

module.exports = WebhookAlerting;