#!/usr/bin/env node

const https = require('https');
const path = require('path');

// Load .env
try {
  require('dotenv').config({ path: path.join(__dirname, '../../..', '.env') });
} catch (e) {
  // Continue without dotenv
}

const webhookUrl = process.env.SLACK_WEBHOOK_URL;

if (!webhookUrl) {
  console.error('❌ Error: SLACK_WEBHOOK_URL not configured');
  process.exit(1);
}

const message = {
  text: "🚀 OpsPal Plugin Marketplace - Now Live!",
  blocks: [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: "🚀 OpsPal Plugin Marketplace - Now Live!",
        emoji: true
      }
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "*The official plugin marketplace for RevPal Agent System is ready!*\n\n100 agents, 512+ scripts, 21+ commands, and 12+ hooks migrated to a modular plugin architecture with 2-5x performance improvement. 🎉"
      }
    },
    {
      type: "divider"
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "*🎯 NEW: Complete HubSpot Coverage!*\n35 HubSpot agents across 4 modular plugins - covering everything from core operations to marketing automation, analytics, and integrations. Full parity with our Salesforce suite! 🟠"
      }
    },
    {
      type: "divider"
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "*📦 Available Plugins (8 Total):*"
      }
    },
    {
      type: "section",
      fields: [
        {
          type: "mrkdwn",
          text: "*🔵 Salesforce Plugin*\n49 agents • 313 scripts\nComplete SFDC operations"
        },
        {
          type: "mrkdwn",
          text: "*🟠 HubSpot Core*\n12 agents • 31 scripts\nEssential HubSpot ops"
        },
        {
          type: "mrkdwn",
          text: "*🟠 HubSpot Marketing & Sales*\n10 agents\nMarketing automation"
        },
        {
          type: "mrkdwn",
          text: "*🟠 HubSpot Analytics*\n8 agents\nReporting & governance"
        },
        {
          type: "mrkdwn",
          text: "*🟠 HubSpot Integrations*\n5 agents\nSFDC, Stripe, CMS sync"
        },
        {
          type: "mrkdwn",
          text: "*📊 GTM Planning*\n7 agents\nTerritory & quota design"
        },
        {
          type: "mrkdwn",
          text: "*🔄 Cross-Platform*\n6 agents\nInstance management"
        },
        {
          type: "mrkdwn",
          text: "*🛠️ Developer Tools*\n3 agents\nPlugin lifecycle mgmt"
        }
      ]
    },
    {
      type: "divider"
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "*✨ Key Features:*\n• *2-5x Performance* - Faster agent discovery\n• *Modular Deployment* - Install only what you need\n• *Semantic Versioning* - Track changes easily\n• *GitHub Distribution* - npm-style installation\n• *Zero Breaking Changes* - All functionality preserved\n• *Automated CI/CD* - GitHub Actions workflows"
      }
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "*🚀 Quick Start:*\n```\n# Add marketplace\n/plugin marketplace add RevPalSFDC/opspal-plugin-internal-marketplace\n\n# Install Salesforce plugin\n/plugin install salesforce-plugin@revpal-internal-plugins\n\n# Install HubSpot plugins\n/plugin install hubspot-core-plugin@revpal-internal-plugins\n/plugin install hubspot-marketing-sales-plugin@revpal-internal-plugins\n\n# Verify installation\n/plugin list\n/agents\n```"
      }
    },
    {
      type: "divider"
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "*📊 Stats:*\n• *Total Agents:* 100\n• *Total Scripts:* 512+\n• *Total Commands:* 21+\n• *Total Hooks:* 12+\n• *Performance Gain:* 10-20x faster agent discovery\n• *Catalog Size:* 8 domain-specific plugins"
      }
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "*🤖 Automated Releases:*\n• *GitHub Actions* - Automatic validation & release\n• *Slack Notifications* - Get notified of new releases\n• *Quality Gates* - Enforce 80+ quality score\n• *Integration Tests* - Comprehensive validation"
      }
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "📖 View README",
            emoji: true
          },
          url: "https://github.com/RevPalSFDC/opspal-plugin-internal-marketplace/blob/main/README.md",
          style: "primary"
        },
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "📦 Marketplace Catalog",
            emoji: true
          },
          url: "https://github.com/RevPalSFDC/opspal-plugin-internal-marketplace/blob/main/marketplace-catalog.json"
        },
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "🔧 GitHub Actions",
            emoji: true
          },
          url: "https://github.com/RevPalSFDC/opspal-plugin-internal-marketplace/actions"
        }
      ]
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: "🎉 *Migration Complete!* All 100 agents successfully migrated to plugin architecture | 🕐 " + new Date().toLocaleString()
        }
      ]
    }
  ]
};

const payload = JSON.stringify(message);
const url = new URL(webhookUrl);

const options = {
  hostname: url.hostname,
  port: 443,
  path: url.pathname + url.search,
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
      console.log('✅ Marketplace announcement sent to Slack!');
      console.log('📢 Team has been notified about the OpsPal Plugin Marketplace');
    } else {
      console.error('❌ Slack notification failed:', res.statusCode, data);
    }
  });
});

req.on('error', (error) => {
  console.error('❌ Error sending to Slack:', error.message);
  process.exit(1);
});

req.write(payload);
req.end();
