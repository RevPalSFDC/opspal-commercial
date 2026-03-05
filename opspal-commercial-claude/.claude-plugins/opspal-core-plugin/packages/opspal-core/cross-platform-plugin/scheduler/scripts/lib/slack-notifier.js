#!/usr/bin/env node
/**
 * Slack Notifier for Scheduled Task Results
 *
 * Sends formatted Slack notifications for task execution results.
 * Uses Slack Block Kit for rich formatting.
 *
 * Usage:
 *   node slack-notifier.js --task-id <id> --task-name <name> --status <status> \
 *     --duration <seconds> --log-file <path> --exit-code <code>
 *
 * Environment:
 *   SLACK_WEBHOOK_URL - Slack webhook URL (required)
 *
 * @version 1.0.0
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

/**
 * Parse command line arguments
 */
function parseArgs() {
    const args = {};

    for (let i = 2; i < process.argv.length; i++) {
        const arg = process.argv[i];
        if (arg.startsWith('--')) {
            const eqIndex = arg.indexOf('=');
            if (eqIndex !== -1) {
                const key = arg.slice(2, eqIndex).replace(/-/g, '_');
                args[key] = arg.slice(eqIndex + 1);
            } else {
                const key = arg.slice(2).replace(/-/g, '_');
                args[key] = process.argv[++i] || true;
            }
        }
    }

    return args;
}

/**
 * Load webhook URL from environment or .env files
 */
function loadWebhookUrl() {
    // Check environment first
    if (process.env.SLACK_WEBHOOK_URL) {
        return process.env.SLACK_WEBHOOK_URL;
    }

    // Try loading from .env files
    const envPaths = [
        path.join(__dirname, '../../../../.env'),
        path.join(__dirname, '../../../../../.env'),
        path.join(process.env.HOME || '', '.claude/.env'),
        path.join(process.env.HOME || '', '.env')
    ];

    for (const envPath of envPaths) {
        try {
            if (fs.existsSync(envPath)) {
                const content = fs.readFileSync(envPath, 'utf8');
                const match = content.match(/SLACK_WEBHOOK_URL=["']?([^\s"']+)["']?/);
                if (match) return match[1].trim();
            }
        } catch (e) {
            // Continue to next file
        }
    }

    return null;
}

/**
 * Format duration in human-readable format
 */
function formatDuration(seconds) {
    const secs = parseInt(seconds, 10);
    if (secs < 60) return `${secs}s`;
    if (secs < 3600) return `${Math.floor(secs / 60)}m ${secs % 60}s`;
    return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
}

/**
 * Build Slack Block Kit message
 */
function buildMessage(args) {
    const {
        task_id,
        task_name,
        status,
        duration,
        exit_code,
        log_file
    } = args;

    const isSuccess = status === 'success';
    const isTimeout = status === 'timeout';
    const emoji = isSuccess ? ':white_check_mark:' : isTimeout ? ':hourglass:' : ':x:';
    const color = isSuccess ? '#36a64f' : isTimeout ? '#f2c744' : '#dc3545';
    const title = isSuccess ? 'Scheduled Task Completed' :
        isTimeout ? 'Scheduled Task Timed Out' : 'Scheduled Task Failed';

    const timestamp = new Date().toISOString();
    const logFileName = log_file ? path.basename(log_file) : 'N/A';

    return {
        attachments: [
            {
                color,
                blocks: [
                    {
                        type: 'header',
                        text: {
                            type: 'plain_text',
                            text: `${emoji} ${title}`,
                            emoji: true
                        }
                    },
                    {
                        type: 'section',
                        fields: [
                            {
                                type: 'mrkdwn',
                                text: `*Task:*\n${task_name}`
                            },
                            {
                                type: 'mrkdwn',
                                text: `*ID:*\n\`${task_id}\``
                            },
                            {
                                type: 'mrkdwn',
                                text: `*Duration:*\n${formatDuration(duration)}`
                            },
                            {
                                type: 'mrkdwn',
                                text: `*Exit Code:*\n${exit_code}`
                            }
                        ]
                    },
                    {
                        type: 'context',
                        elements: [
                            {
                                type: 'mrkdwn',
                                text: `:clock1: ${timestamp} | Log: \`${logFileName}\``
                            }
                        ]
                    }
                ]
            }
        ]
    };
}

/**
 * Send notification to Slack
 */
async function sendNotification(webhookUrl, message) {
    return new Promise((resolve, reject) => {
        const url = new URL(webhookUrl);

        const options = {
            hostname: url.hostname,
            port: 443,
            path: url.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 200) {
                    resolve({ success: true });
                } else {
                    reject(new Error(`Slack API error: ${res.statusCode} - ${data}`));
                }
            });
        });

        req.on('error', reject);
        req.write(JSON.stringify(message));
        req.end();
    });
}

/**
 * Main function
 */
async function main() {
    const args = parseArgs();

    // Validate required arguments
    if (!args.task_id || !args.task_name || !args.status) {
        console.error('Missing required arguments: --task-id, --task-name, --status');
        process.exit(1);
    }

    const webhookUrl = loadWebhookUrl();

    if (!webhookUrl) {
        console.error('SLACK_WEBHOOK_URL not configured');
        // Don't fail the task for missing webhook
        process.exit(0);
    }

    try {
        const message = buildMessage(args);
        await sendNotification(webhookUrl, message);
        console.log('Slack notification sent successfully');
    } catch (error) {
        console.error(`Notification failed: ${error.message}`);
        // Don't fail the task for notification errors
    }
}

// Export for testing
module.exports = { buildMessage, sendNotification, loadWebhookUrl };

// Run CLI if executed directly
if (require.main === module) {
    main();
}
