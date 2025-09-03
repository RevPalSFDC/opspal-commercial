#!/usr/bin/env node

/**
 * Release Announcement Script
 * ============================
 * Sends release notifications to Slack
 */

require('dotenv').config({ path: '/home/chris/Desktop/RevPal/Agents/ClaudeHubSpot/.env' });
const https = require('https');

async function sendSlackNotification(message) {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  
  if (!webhookUrl || webhookUrl === 'your-slack-webhook-url') {
    console.log('⚠️  Slack webhook not configured');
    console.log('\n📋 Copy this message to post manually:\n');
    console.log('=' .repeat(60));
    console.log(message.text || JSON.stringify(message, null, 2));
    console.log('=' .repeat(60));
    return;
  }
  
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(message);
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
          resolve(data);
        } else {
          console.error('❌ Slack notification failed:', res.statusCode, data);
          reject(new Error(`Slack API error: ${res.statusCode}`));
        }
      });
    });
    
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// Release announcement message
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
              "• Enterprise HubSpot integration platform\n" +
              "• 18 production modules (9 core + 9 enterprise)\n" +
              "• 25+ MCP tools via enhanced server\n" +
              "• Real-time ops console with monitoring\n" +
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
              "✅ Production-ready with rate limiting\n" +
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
        text: "🎉 *The platform is ready for production deployment!*\n" +
              "Full documentation available in the repo.\n\n" +
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
            text: "Read Docs",
            emoji: true
          },
          url: "https://github.com/RevPalSFDC/claude-hs/blob/main/README.md"
        }
      ]
    }
  ]
};

// Send the notification
sendSlackNotification(releaseMessage)
  .then(() => {
    console.log('\n🎊 Release announcement complete!');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  });