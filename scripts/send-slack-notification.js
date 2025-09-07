#!/usr/bin/env node

const https = require('https');
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Use environment variable (required)
const webhookUrl = process.env.SLACK_WEBHOOK_URL;

if (!webhookUrl) {
  console.error('❌ Error: SLACK_WEBHOOK_URL environment variable not configured');
  console.error('Please set SLACK_WEBHOOK_URL in your .env file or environment');
  process.exit(1);
}

// Get release info from command line args or use v2.0.0 as default
const args = process.argv.slice(2);
const version = args[0] || 'v2.0.0';
const projectArg = args[1] || 'ClaudeHubSpot & ClaudeSFDC';

// Smart project detection - determine the GitHub repo based on project name
let project, repoName, repoUrl;
if (projectArg.toLowerCase().includes('hubspot') || projectArg === 'ClaudeHubSpot') {
  project = 'ClaudeHubSpot';
  repoName = 'claude-hs';
  repoUrl = 'https://github.com/RevPalSFDC/claude-hs';
} else if (projectArg.toLowerCase().includes('sfdc') || projectArg === 'ClaudeSFDC') {
  project = 'ClaudeSFDC';
  repoName = 'claude-sfdc';
  repoUrl = 'https://github.com/RevPalSFDC/claude-sfdc';
} else {
  // Default to both if not specific
  project = projectArg;
  repoName = 'RevPalSFDC';
  repoUrl = 'https://github.com/RevPalSFDC';
}

const releaseMessage = {
  text: `🚀 *RELEASE ANNOUNCEMENT: ${version}* 🚀`,
  blocks: [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `🎉 ${project} ${version} Released!`,
        emoji: true
      }
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${project} Release ${version}*\n` +
              `📍 Repository: ${repoUrl}\n` +
              `🏷️ Version: \`${version}\`\n` +
              `📦 Package: ${repoName}\n` +
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
        text: project === 'ClaudeHubSpot' && version === 'v2.2.0' ?
              "*🚀 Key Features - Production Ready:*\n" +
              "• Fixed CRM Search API 400 errors (sorts as objects)\n" +
              "• Added comprehensive capability detection\n" +
              "• Implemented proper API patterns and validation\n" +
              "• Created pre-flight checks and QA automation\n" +
              "• 100x faster total count retrieval\n" +
              "• Enhanced error handling with actionable messages"
              :
              project === 'ClaudeSFDC' && version === 'v2.6.0' ?
              "*🚀 Key Features:*\n" +
              "• Instance-agnostic metadata retrieval framework\n" +
              "• Three new specialized SFDC agents\n" +
              "• Complete Salesforce API error fixes\n" +
              "• Automatic API fallback strategies\n" +
              "• Zero hardcoded values - works with ANY org\n" +
              "• Enhanced security (removed hardcoded webhooks)"
              :
              "*Key Updates:*\n" +
              "• Check release notes for details\n" +
              "• View changelog for full list\n" +
              "• Test new features in development"
      }
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "*💡 Quick Start:*\n" +
              "```\n" +
              "# Pull latest changes\n" +
              "git pull origin main\n\n" +
              "# Checkout this release\n" +
              `git checkout ${version}\n` +
              "```"
      }
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: project === 'ClaudeHubSpot' && version === 'v2.2.0' ?
              "*✨ Highlights - Now Production Ready:*\n" +
              "✅ Fixed all critical API errors\n" +
              "✅ Comprehensive capability detection\n" +
              "✅ Enterprise-grade patterns\n" +
              "✅ Pre-flight checks and QA automation\n" +
              "✅ 100x performance improvements"
              :
              project === 'ClaudeSFDC' && version === 'v2.6.0' ?
              "*✨ Highlights:*\n" +
              "✅ Works with ANY Salesforce instance\n" +
              "✅ No hardcoded values required\n" +
              "✅ Automatic API fallback strategies\n" +
              "✅ Complete metadata extraction\n" +
              "✅ Three new specialized agents"
              :
              "*✨ Highlights:*\n" +
              "✅ Latest improvements\n" +
              "✅ Bug fixes\n" +
              "✅ Performance enhancements\n" +
              "✅ View release notes for details"
      }
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: project === 'ClaudeHubSpot' && version === 'v2.2.0' ?
              "🎉 *ClaudeHubSpot is Now Production Ready!*\n\n" +
              "After extensive API improvements, the platform is now fully functional for enterprise use. " +
              "All critical issues have been fixed and the system implements enterprise-grade patterns.\n\n" +
              "Ready for production deployments! 🚀"
              :
              project === 'ClaudeSFDC' && version === 'v2.6.0' ?
              "🎉 *Instance-Agnostic Metadata Framework Now Available!*\n\n" +
              "All SFDC agents can now work with ANY Salesforce instance without hardcoded values. " +
              "Complete metadata retrieval with automatic API fallbacks!\n\n" +
              "Zero configuration required - it just works! 🚀"
              :
              `🎉 *${project} ${version} Successfully Released!*\n\n` +
              `Check the release notes for full details.\n\n` +
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
            text: "View Repository",
            emoji: true
          },
          url: repoUrl,
          style: "primary"
        },
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "View Release",
            emoji: true
          },
          url: `${repoUrl}/releases/tag/${version}`
        },
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "View Changelog",
            emoji: true
          },
          url: `${repoUrl}/blob/main/CHANGELOG.md`
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