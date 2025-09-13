#!/usr/bin/env node

const https = require('https');

// Load webhook from environment
const webhookUrl = process.env.SLACK_WEBHOOK_URL;

if (!webhookUrl) {
    console.error('SLACK_WEBHOOK_URL not configured');
    process.exit(1);
}

const message = {
    text: "🚀 *ClaudeSFDC v2.6.1 Released*",
    blocks: [
        {
            type: "header",
            text: {
                type: "plain_text",
                text: "🚀 ClaudeSFDC v2.6.1 - Critical API Fixes",
                emoji: true
            }
        },
        {
            type: "section",
            text: {
                type: "mrkdwn",
                text: "*Type:* Patch Release (Bug Fixes)\n*GitHub:* <https://github.com/RevPalSFDC/claude-sfdc/releases/tag/v2.6.1|View Release>"
            }
        },
        {
            type: "divider"
        },
        {
            type: "section",
            text: {
                type: "mrkdwn",
                text: "*🔧 Key Fixes Applied:*\n• Fixed Flow/FlowDefinitionView Tooling API queries\n• Added `--use-tooling-api` flag to all metadata queries\n• Implemented sf → sfdx fallback for describe operations\n• Corrected Status/IsActive field usage in FlowDefinitionView\n• Updated 30+ scripts and modules for API compliance"
            }
        },
        {
            type: "section",
            text: {
                type: "mrkdwn",
                text: "*📊 Impact:*\nThis patch prevents common deployment failures related to incorrect Tooling API usage and improves overall metadata operation reliability."
            }
        },
        {
            type: "section",
            text: {
                type: "mrkdwn",
                text: "*📋 Detailed Changes:*\n• 88 files updated\n• Robust error handling added\n• Query performance optimized\n• Deployment stability improved"
            }
        },
        {
            type: "divider"
        },
        {
            type: "context",
            elements: [
                {
                    type: "mrkdwn",
                    text: "🤖 Released via Claude Code | 📅 2025-09-08"
                }
            ]
        }
    ]
};

// Parse webhook URL
const url = new URL(webhookUrl);

const options = {
    hostname: url.hostname,
    path: url.pathname,
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
    }
};

const req = https.request(options, (res) => {
    if (res.statusCode === 200) {
        console.log('✅ Slack notification sent successfully');
    } else {
        console.error(`Failed to send notification: ${res.statusCode}`);
    }
});

req.on('error', (error) => {
    console.error('Error sending notification:', error);
});

req.write(JSON.stringify(message));
req.end();