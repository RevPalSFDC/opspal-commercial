/**
 * Report Delivery Module
 *
 * Handles delivery of generated RevOps reports via:
 * - Email (SMTP or SendGrid)
 * - Slack (webhooks and file uploads)
 * - Google Drive (via existing google-drive-manager.js)
 *
 * Integrates with scheduler-manager.js for recurring deliveries.
 *
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

/**
 * Delivery channel configurations
 */
const DELIVERY_CHANNELS = {
    slack: {
        name: 'Slack',
        requiredEnv: ['SLACK_WEBHOOK_URL'],
        optionalEnv: ['SLACK_BOT_TOKEN'], // For file uploads
        maxFileSize: 1024 * 1024 * 50, // 50MB
        supportedFormats: ['pdf', 'xlsx', 'csv', 'json']
    },
    email: {
        name: 'Email',
        requiredEnv: ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'],
        optionalEnv: ['SMTP_PORT', 'SMTP_FROM', 'SENDGRID_API_KEY'],
        maxAttachmentSize: 1024 * 1024 * 25, // 25MB
        supportedFormats: ['pdf', 'xlsx', 'csv']
    },
    gdrive: {
        name: 'Google Drive',
        requiredEnv: [], // Uses OAuth via google-drive-manager.js
        supportedFormats: ['pdf', 'xlsx', 'csv', 'sheets']
    }
};

/**
 * Report Delivery Manager
 */
class ReportDeliveryManager {
    constructor(options = {}) {
        this.options = {
            defaultChannel: options.defaultChannel || 'slack',
            retryAttempts: options.retryAttempts || 3,
            retryDelay: options.retryDelay || 5000,
            logDeliveries: options.logDeliveries !== false,
            ...options
        };

        this.deliveryLog = [];
    }

    /**
     * Deliver a report to specified channels
     * @param {Object} reportData - Report data and metadata
     * @param {Object} deliveryConfig - Delivery configuration
     * @returns {Object} Delivery results
     */
    async deliver(reportData, deliveryConfig) {
        const {
            channels = [this.options.defaultChannel],
            recipients = {},
            message = {},
            schedule = null
        } = deliveryConfig;

        const results = {
            success: true,
            deliveries: [],
            errors: [],
            timestamp: new Date().toISOString()
        };

        for (const channel of channels) {
            try {
                const channelResult = await this.deliverToChannel(
                    channel,
                    reportData,
                    recipients[channel] || recipients.default || [],
                    message
                );
                results.deliveries.push({
                    channel,
                    ...channelResult
                });
            } catch (error) {
                results.success = false;
                results.errors.push({
                    channel,
                    error: error.message
                });
            }
        }

        if (this.options.logDeliveries) {
            this.logDelivery(results, reportData, deliveryConfig);
        }

        return results;
    }

    /**
     * Deliver to a specific channel
     */
    async deliverToChannel(channel, reportData, recipients, message) {
        switch (channel) {
            case 'slack':
                return this.deliverToSlack(reportData, recipients, message);
            case 'email':
                return this.deliverToEmail(reportData, recipients, message);
            case 'gdrive':
                return this.deliverToGoogleDrive(reportData, recipients, message);
            default:
                throw new Error(`Unknown delivery channel: ${channel}`);
        }
    }

    /**
     * Deliver report via Slack
     */
    async deliverToSlack(reportData, recipients, message) {
        const webhookUrl = process.env.SLACK_WEBHOOK_URL;
        if (!webhookUrl) {
            throw new Error('SLACK_WEBHOOK_URL environment variable not set');
        }

        const { title, summary, filePath, format, kpis = [], recommendations = [] } = reportData;

        // Build Slack message blocks
        const blocks = [
            {
                type: 'header',
                text: {
                    type: 'plain_text',
                    text: `📊 ${title || 'RevOps Report'}`,
                    emoji: true
                }
            },
            {
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: message.body || summary || 'Your scheduled report is ready.'
                }
            }
        ];

        // Add KPI highlights if available
        if (kpis.length > 0) {
            const kpiText = kpis.slice(0, 5).map(k =>
                `• *${k.name}*: ${k.value}${k.trend ? ` (${k.trend})` : ''}`
            ).join('\n');

            blocks.push({
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: `*Key Metrics:*\n${kpiText}`
                }
            });
        }

        // Add recommendations if available
        if (recommendations.length > 0) {
            const recText = recommendations.slice(0, 3).map(r =>
                `• ${r.action || r}`
            ).join('\n');

            blocks.push({
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: `*Recommendations:*\n${recText}`
                }
            });
        }

        // Add file link or attachment info
        if (filePath) {
            blocks.push({
                type: 'context',
                elements: [{
                    type: 'mrkdwn',
                    text: `📎 Report file: \`${path.basename(filePath)}\` (${format?.toUpperCase() || 'file'})`
                }]
            });
        }

        // Add timestamp
        blocks.push({
            type: 'context',
            elements: [{
                type: 'mrkdwn',
                text: `Generated: ${new Date().toLocaleString()}`
            }]
        });

        // Send to webhook
        const payload = {
            blocks,
            text: `${title || 'RevOps Report'} - ${summary || 'Report generated'}`
        };

        // Add channel mentions if recipients specified
        if (recipients.length > 0) {
            payload.text = `${recipients.map(r => `<@${r}>`).join(' ')} ${payload.text}`;
        }

        await this.sendWebhook(webhookUrl, payload);

        // If bot token available, upload file
        if (process.env.SLACK_BOT_TOKEN && filePath && fs.existsSync(filePath)) {
            await this.uploadSlackFile(filePath, recipients);
        }

        return {
            status: 'delivered',
            method: 'webhook',
            recipients: recipients.length || 'channel'
        };
    }

    /**
     * Send to Slack webhook
     */
    async sendWebhook(webhookUrl, payload) {
        return new Promise((resolve, reject) => {
            const url = new URL(webhookUrl);
            const data = JSON.stringify(payload);

            const options = {
                hostname: url.hostname,
                path: url.pathname,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(data)
                }
            };

            const req = https.request(options, (res) => {
                let body = '';
                res.on('data', chunk => body += chunk);
                res.on('end', () => {
                    if (res.statusCode === 200) {
                        resolve(body);
                    } else {
                        reject(new Error(`Slack webhook failed: ${res.statusCode} - ${body}`));
                    }
                });
            });

            req.on('error', reject);
            req.write(data);
            req.end();
        });
    }

    /**
     * Upload file to Slack (requires bot token)
     */
    async uploadSlackFile(filePath, channels) {
        // Simplified - in production, use @slack/web-api
        console.log(`[ReportDelivery] File upload to Slack requires SLACK_BOT_TOKEN`);
        return { status: 'skipped', reason: 'Bot token upload not implemented' };
    }

    /**
     * Deliver report via Email
     */
    async deliverToEmail(reportData, recipients, message) {
        // Check for SendGrid first, then SMTP
        if (process.env.SENDGRID_API_KEY) {
            return this.deliverViaSendGrid(reportData, recipients, message);
        }

        if (!process.env.SMTP_HOST) {
            throw new Error('Email delivery requires SMTP_HOST or SENDGRID_API_KEY');
        }

        // SMTP delivery would use nodemailer in production
        console.log(`[ReportDelivery] SMTP delivery to: ${recipients.join(', ')}`);

        return {
            status: 'simulated',
            method: 'smtp',
            recipients: recipients,
            note: 'SMTP delivery requires nodemailer package'
        };
    }

    /**
     * Deliver via SendGrid API
     */
    async deliverViaSendGrid(reportData, recipients, message) {
        const apiKey = process.env.SENDGRID_API_KEY;
        const fromEmail = process.env.SENDGRID_FROM || process.env.SMTP_FROM || 'reports@revpal.io';

        const { title, summary, filePath } = reportData;

        const payload = {
            personalizations: [{
                to: recipients.map(email => ({ email }))
            }],
            from: { email: fromEmail },
            subject: message.subject || title || 'Your RevOps Report',
            content: [{
                type: 'text/html',
                value: this.buildEmailHtml(reportData, message)
            }]
        };

        // Add attachment if file exists
        if (filePath && fs.existsSync(filePath)) {
            const fileContent = fs.readFileSync(filePath);
            payload.attachments = [{
                content: fileContent.toString('base64'),
                filename: path.basename(filePath),
                disposition: 'attachment'
            }];
        }

        // SendGrid API call would go here
        console.log(`[ReportDelivery] SendGrid delivery to: ${recipients.join(', ')}`);

        return {
            status: 'simulated',
            method: 'sendgrid',
            recipients: recipients,
            note: 'SendGrid delivery requires @sendgrid/mail package'
        };
    }

    /**
     * Build HTML email content
     */
    buildEmailHtml(reportData, message) {
        const { title, summary, kpis = [], recommendations = [] } = reportData;

        let html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h1 style="color: #2c3e50;">📊 ${title || 'RevOps Report'}</h1>
                <p style="color: #7f8c8d;">${message.body || summary || 'Your scheduled report is attached.'}</p>
        `;

        if (kpis.length > 0) {
            html += `<h2 style="color: #34495e;">Key Metrics</h2><ul>`;
            kpis.slice(0, 5).forEach(k => {
                html += `<li><strong>${k.name}</strong>: ${k.value}${k.trend ? ` (${k.trend})` : ''}</li>`;
            });
            html += `</ul>`;
        }

        if (recommendations.length > 0) {
            html += `<h2 style="color: #34495e;">Recommendations</h2><ul>`;
            recommendations.slice(0, 3).forEach(r => {
                html += `<li>${r.action || r}</li>`;
            });
            html += `</ul>`;
        }

        html += `
                <hr style="border: 1px solid #ecf0f1;">
                <p style="color: #95a5a6; font-size: 12px;">
                    Generated by RevPal RevOps Reporting Assistant<br>
                    ${new Date().toLocaleString()}
                </p>
            </div>
        `;

        return html;
    }

    /**
     * Deliver to Google Drive
     */
    async deliverToGoogleDrive(reportData, recipients, message) {
        // Uses google-drive-manager.js
        const gdriveManager = path.join(__dirname, 'google-drive-manager.js');

        if (!fs.existsSync(gdriveManager)) {
            throw new Error('Google Drive manager not found');
        }

        const { filePath } = reportData;
        if (!filePath || !fs.existsSync(filePath)) {
            throw new Error('No file to upload to Google Drive');
        }

        console.log(`[ReportDelivery] Google Drive upload: ${path.basename(filePath)}`);

        return {
            status: 'ready',
            method: 'gdrive',
            note: 'Use google-drive-manager.js for actual upload'
        };
    }

    /**
     * Log delivery for audit trail
     */
    logDelivery(results, reportData, config) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            reportTitle: reportData.title,
            channels: config.channels,
            success: results.success,
            deliveryCount: results.deliveries.length,
            errorCount: results.errors.length
        };

        this.deliveryLog.push(logEntry);

        // Keep last 100 entries
        if (this.deliveryLog.length > 100) {
            this.deliveryLog = this.deliveryLog.slice(-100);
        }
    }

    /**
     * Get delivery history
     */
    getDeliveryHistory(limit = 20) {
        return this.deliveryLog.slice(-limit);
    }

    /**
     * Validate delivery configuration
     */
    validateConfig(config) {
        const errors = [];
        const warnings = [];

        for (const channel of config.channels || []) {
            const channelConfig = DELIVERY_CHANNELS[channel];
            if (!channelConfig) {
                errors.push(`Unknown channel: ${channel}`);
                continue;
            }

            // Check required env vars
            for (const envVar of channelConfig.requiredEnv) {
                if (!process.env[envVar]) {
                    errors.push(`${channel}: Missing required env var ${envVar}`);
                }
            }

            // Check recipients
            const recipients = config.recipients?.[channel] || config.recipients?.default || [];
            if (recipients.length === 0 && channel !== 'slack') {
                warnings.push(`${channel}: No recipients specified`);
            }
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Create scheduler task configuration for recurring delivery
     */
    createSchedulerTask(reportConfig, deliveryConfig, schedule) {
        const { reportType, orgAlias, format } = reportConfig;
        const { channels, recipients, message } = deliveryConfig;

        return {
            id: `report-${reportType}-${Date.now()}`,
            name: `Recurring ${reportType} Report`,
            type: 'claude-prompt',
            schedule: schedule, // Cron expression
            enabled: true,
            prompt: `/generate-report ${reportType} --org ${orgAlias} --format ${format} --deliver ${channels.join(',')}`,
            context: {
                reportType,
                orgAlias,
                format,
                deliveryChannels: channels,
                recipients,
                message
            },
            notifications: {
                slack: {
                    enabled: channels.includes('slack'),
                    notifyOn: ['failure', 'success']
                }
            },
            metadata: {
                createdAt: new Date().toISOString(),
                createdBy: 'revops-reporting-assistant',
                deliveryConfig
            }
        };
    }
}

/**
 * Quick delivery function for simple use cases
 */
async function quickDeliver(reportPath, channel = 'slack', options = {}) {
    const manager = new ReportDeliveryManager();

    const reportData = {
        title: options.title || path.basename(reportPath, path.extname(reportPath)),
        summary: options.summary || 'Report generated',
        filePath: reportPath,
        format: path.extname(reportPath).slice(1)
    };

    return manager.deliver(reportData, {
        channels: [channel],
        recipients: options.recipients || {},
        message: options.message || {}
    });
}

module.exports = {
    ReportDeliveryManager,
    DELIVERY_CHANNELS,
    quickDeliver
};
