#!/usr/bin/env node

const https = require('https');
const fs = require('fs');
const path = require('path');

// Try to load dotenv if available
try {
  require('dotenv').config({ path: path.join(__dirname, '../../..', '.env') });
} catch (e) {
  // dotenv not available, continue without it
}

// Get webhook URL from environment
const webhookUrl = process.env.SLACK_WEBHOOK_URL;

if (!webhookUrl) {
  console.error('❌ Error: SLACK_WEBHOOK_URL environment variable not configured');
  console.error('Please set SLACK_WEBHOOK_URL in your .env file');
  console.error('Slack notification skipped');
  process.exit(0); // Exit success to not block release
}

// Get release info from command line args
const args = process.argv.slice(2);
const version = args[0] || 'v1.0.0';
const pluginArg = args[1] || 'unknown-plugin';

// Extract plugin details
const pluginName = pluginArg;
const repoUrl = 'https://github.com/RevPalSFDC/opspal-plugin-internal-marketplace';

// Determine plugin type for messaging
let pluginType = 'Plugin';
let pluginDescription = '';

if (pluginName.includes('salesforce')) {
  pluginType = 'FULL SUITE - Salesforce';
  pluginDescription = 'Complete Salesforce operations with 49 agents, 97 scripts, 13 commands';
} else if (pluginName.includes('hubspot') && !pluginName.includes('-')) {
  pluginType = 'FULL SUITE - HubSpot';
  pluginDescription = 'Complete HubSpot operations with 35 agents, 31 scripts, 8 commands';
} else if (pluginName.includes('hubspot-core')) {
  pluginType = 'Modular - HubSpot Core';
  pluginDescription = 'Core HubSpot operations - 12 agents, 100+ scripts';
} else if (pluginName.includes('hubspot-marketing')) {
  pluginType = 'Modular - HubSpot Marketing & Sales';
  pluginDescription = 'Marketing automation & sales operations - 10 agents';
} else if (pluginName.includes('hubspot-analytics')) {
  pluginType = 'Modular - HubSpot Analytics & Governance';
  pluginDescription = 'Analytics, reporting & governance - 8 agents';
} else if (pluginName.includes('hubspot-integrations')) {
  pluginType = 'Modular - HubSpot Integrations';
  pluginDescription = 'SFDC, Stripe, CMS, Commerce integrations - 5 agents';
} else if (pluginName.includes('developer-tools')) {
  pluginType = 'Developer Tools';
  pluginDescription = 'Plugin lifecycle management - 10 agents, 7 scripts, 6 commands';
} else if (pluginName.includes('gtm-planning')) {
  pluginType = 'GTM Planning';
  pluginDescription = 'Territory design, quota modeling, compensation planning - 7 agents';
} else if (pluginName.includes('cross-platform')) {
  pluginType = 'Cross-Platform Operations';
  pluginDescription = 'Instance management, Asana integration, orchestration - 6 agents';
}

// Build Slack message
const releaseMessage = {
  text: `🚀 *PLUGIN RELEASE: ${pluginName} ${version}* 🚀`,
  blocks: [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `🎉 ${pluginName} ${version} Released!`,
        emoji: true
      }
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*OpsPal Plugin Marketplace Release*\n` +
              `📦 Plugin: \`${pluginName}\`\n` +
              `🏷️ Version: \`${version}\`\n` +
              `📍 Type: ${pluginType}\n` +
              `🚀 Status: Released and available`
      }
    },
    {
      type: "divider"
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*📦 Plugin Details:*\n${pluginDescription}`
      }
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "*💡 Quick Install:*\n" +
              "```\n" +
              "# Install from marketplace\n" +
              `claude plugin install ${pluginName}\n\n` +
              "# Or clone and install locally\n" +
              "git pull origin main\n" +
              `git checkout ${pluginName}-${version}\n` +
              "```"
      }
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*✨ What's New:*\n` +
              `Check the release notes and CHANGELOG.md for full details of this ${version} release.\n\n` +
              `Great work team! 👏`
      }
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "View Release",
            emoji: true
          },
          url: `${repoUrl}/releases/tag/${pluginName}-${version}`,
          style: "primary"
        },
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "View Catalog",
            emoji: true
          },
          url: `${repoUrl}/blob/main/marketplace-catalog.json`
        },
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "Plugin README",
            emoji: true
          },
          url: `${repoUrl}/tree/main/.claude-plugins/${pluginName}`
        }
      ]
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `🕐 ${new Date().toLocaleString()} | 🤖 OpsPal Plugin Marketplace`
        }
      ]
    }
  ]
};

// Send to Slack
const payload = JSON.stringify(releaseMessage);
const url = new URL(webhookUrl);

const options = {
  hostname: url.hostname,
  port: 443,
  path: url.pathname + url.search, // Include query params if any
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload)
  }
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    if (res.statusCode === 200) {
      console.log('✅ Slack notification sent successfully!');
      console.log(`📢 ${pluginName} ${version} announcement posted to Slack channel`);
    } else {
      console.error('❌ Slack notification failed:', res.statusCode, data);
    }
  });
});

req.on('error', (error) => {
  console.error('❌ Error sending to Slack:', error.message);
  // Exit success to not block release
  process.exit(0);
});

req.write(payload);
req.end();
