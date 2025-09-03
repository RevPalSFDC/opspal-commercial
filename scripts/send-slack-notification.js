#!/usr/bin/env node

const https = require('https');

const webhookUrl = 'https://hooks.slack.com/services/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';

const releaseMessage = {
  text: "🚀 *RELEASE ANNOUNCEMENT* 🚀",
  blocks: [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: "🚀 HubSpot Enterprise Platform v1.0.0 Released!",
        emoji: true
      }
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "*Repository Published: `claude-hs`*\n" +
              "📍 GitHub URL: https://github.com/RevPalSFDC/claude-hs\n" +
              "📄 Release Page: https://github.com/RevPalSFDC/claude-hs/releases/tag/v1.0.0\n" +
              "🏷️ Version: `v1.0.0` (Initial Release)\n" +
              "📊 Size: 181 files, 84,461+ lines of production code"
      }
    },
    {
      type: "divider"
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "*Key Features:*\n" +
              "• 9 core production modules with rate limiting\n" +
              "• 9 enterprise modules (schema registry, policy guard, dedupe)\n" +
              "• 25+ MCP tools via enhanced server v3\n" +
              "• Real-time ops console with WebSocket monitoring\n" +
              "• GDPR/CCPA compliance built-in\n" +
              "• Multi-tenant with per-tenant policies"
      }
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "*Quick Start:*\n```git clone https://github.com/RevPalSFDC/claude-hs.git\ncd claude-hs\nnpm install\ncp .env.example .env\nnpm run validate```"
      }
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "*Highlights:*\n" +
              "✅ Production-ready with dual-bucket rate limiting\n" +
              "✅ Intelligent deduplication engine\n" +
              "✅ Schema validation & policy enforcement\n" +
              "✅ Multi-step workflow orchestration\n" +
              "✅ Complete test suite & documentation"
      }
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "🎉 *The platform is ready for production deployment!*\n\n" +
              "This is our first public release of a production-ready, enterprise-grade HubSpot integration platform.\n\n" +
              "Great work team! 👏"
      }
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "View Repository",
            emoji: true
          },
          url: "https://github.com/RevPalSFDC/claude-hs",
          style: "primary"
        },
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "View Release",
            emoji: true
          },
          url: "https://github.com/RevPalSFDC/claude-hs/releases/tag/v1.0.0"
        },
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "Read Docs",
            emoji: true
          },
          url: "https://github.com/RevPalSFDC/claude-hs/blob/main/README.md"
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
  path: url.pathname,
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
      console.log('📢 Release announcement posted to Slack channel');
    } else {
      console.error('❌ Slack notification failed:', res.statusCode, data);
    }
  });
});

req.on('error', (error) => {
  console.error('❌ Error sending to Slack:', error.message);
});

req.write(payload);
req.end();