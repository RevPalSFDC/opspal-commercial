# Slack Webhook Setup for Plugin Release Notifications

## Overview

The plugin marketplace uses **Incoming Webhooks** to send release notifications to Slack. This is separate from Socket Mode and is much simpler to set up.

## Setup Steps

### Option 1: Add Webhook to Existing Slack App

If you already have a Slack app (with Socket Mode), you can add Incoming Webhooks:

1. Go to https://api.slack.com/apps
2. Select your existing app
3. Click "Incoming Webhooks" in the left sidebar
4. Toggle "Activate Incoming Webhooks" to **On**
5. Click "Add New Webhook to Workspace"
6. Select the channel where you want notifications (e.g., `#releases` or `#engineering`)
7. Click "Allow"
8. Copy the Webhook URL (looks like: `https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXX`)

### Option 2: Create a Simple Webhook-Only App

If you want a separate app just for notifications:

1. Go to https://api.slack.com/apps
2. Click "Create New App" → "From scratch"
3. Name it (e.g., "Plugin Release Bot")
4. Select your workspace
5. Click "Incoming Webhooks" in the left sidebar
6. Toggle "Activate Incoming Webhooks" to **On**
7. Click "Add New Webhook to Workspace"
8. Select the channel (e.g., `#releases`)
9. Click "Allow"
10. Copy the Webhook URL

## Configuration

### Local Development

Create a `.env` file in the repository root:

```bash
# Slack Notifications
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
```

**IMPORTANT**: Add `.env` to `.gitignore` (already done)

### GitHub Actions

Add the webhook URL as a GitHub secret:

1. Go to your repository: https://github.com/RevPalSFDC/opspal-plugin-internal-marketplace
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Name: `SLACK_WEBHOOK_URL`
5. Value: Paste your webhook URL
6. Click **Add secret**

## Testing

### Test Locally

```bash
# Set the webhook URL
export SLACK_WEBHOOK_URL="https://hooks.slack.com/services/YOUR/WEBHOOK/URL"

# Test the notification script
node .claude-plugins/developer-tools-plugin/scripts/send-plugin-release-notification.js v1.0.0 salesforce-plugin
```

You should see a formatted release notification in your Slack channel!

### Test from GitHub Actions

Push a test tag:

```bash
git tag test-plugin-v1.0.0
git push origin test-plugin-v1.0.0
```

The release workflow will run and send a notification if the secret is configured.

## What the Notifications Look Like

The notifications include:
- 🎉 Plugin name and version in a header
- 📦 Plugin type (FULL SUITE, Modular, etc.)
- 🚀 Quick install commands
- ✨ Link to release notes
- Buttons to:
  - View GitHub Release
  - View Marketplace Catalog
  - View Plugin README

## Troubleshooting

### "SLACK_WEBHOOK_URL not configured"

**In GitHub Actions:**
- Check that the secret is named exactly `SLACK_WEBHOOK_URL`
- Verify the secret exists in Settings → Secrets and variables → Actions

**Locally:**
- Run `echo $SLACK_WEBHOOK_URL` to verify it's set
- Check that `.env` file exists and has the correct format

### "Slack notification failed: 404"

- The webhook URL may be invalid or revoked
- Go to https://api.slack.com/apps → Your App → Incoming Webhooks
- Verify the webhook is still listed and active
- Generate a new webhook if needed

### "Slack notification failed: 400"

- The message payload may be malformed
- Check the notification script for syntax errors
- Verify the message follows Slack's Block Kit format

## Webhook Security

**DO NOT** commit webhook URLs to the repository:
- ✅ Use `.env` for local development
- ✅ Use GitHub Secrets for CI/CD
- ❌ Never hardcode in scripts
- ❌ Never commit `.env` files

## Webhook Permissions

Incoming Webhooks can ONLY:
- Post messages to the authorized channel
- Cannot read messages
- Cannot access other channels
- Cannot perform admin actions

This makes them safe for automated notifications.

## Channel Recommendations

Suggested channels for release notifications:
- `#releases` - Dedicated release announcements
- `#engineering` - General engineering updates
- `#bot-testing` - For testing before production

You can create multiple webhooks for different channels if needed.

## Socket Mode vs Webhooks

| Feature | Socket Mode | Incoming Webhooks |
|---------|-------------|-------------------|
| Direction | Bidirectional | One-way (outgoing only) |
| Use Case | Interactive bots | Automated notifications |
| Setup Complexity | Complex (tokens, connection) | Simple (just a URL) |
| Required for Release Notifications | ❌ No | ✅ Yes |

Your existing Socket Mode bot can continue to work alongside Incoming Webhooks!

## Example Notification

When you release `salesforce-plugin v3.5.0`, the notification will look like:

```
🎉 salesforce-plugin v3.5.0 Released!

OpsPal Plugin Marketplace Release
📦 Plugin: salesforce-plugin
🏷️ Version: v3.5.0
📍 Type: FULL SUITE - Salesforce
🚀 Status: Released and available

━━━━━━━━━━━━━━━━━━━━━━━━━━

📦 Plugin Details:
Complete Salesforce operations with 49 agents, 97 scripts, 13 commands

💡 Quick Install:
# Install from marketplace
claude plugin install salesforce-plugin

# Or clone and install locally
git pull origin main
git checkout salesforce-plugin-v3.5.0

✨ What's New:
Check the release notes and CHANGELOG.md for full details of this v3.5.0 release.

Great work team! 👏

[View Release] [View Catalog] [Plugin README]

🕐 10/10/2025, 6:07:23 PM | 🤖 OpsPal Plugin Marketplace
```

## Support

If you have issues with webhook setup, check:
- Slack API docs: https://api.slack.com/messaging/webhooks
- Repository issues: https://github.com/RevPalSFDC/opspal-plugin-internal-marketplace/issues
