#!/bin/bash

###############################################################################
# Slack Webhook Setup Script
# ===========================
# Sets up Slack webhook integration for release notifications.
# This script helps configure the webhook URL and test the connection.
#
# Usage:
#   ./setup-slack-webhook.sh
#
# The script will:
#   1. Help you create an incoming webhook in Slack
#   2. Store the webhook URL securely
#   3. Test the connection with a sample message
###############################################################################

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${PROJECT_ROOT}/.env"
ENV_EXAMPLE="${PROJECT_ROOT}/.env.example"

# Slack Channel ID provided
SLACK_CHANNEL_ID="C09D86TQVU5"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}================================${NC}"
echo -e "${BLUE}Slack Webhook Setup for ClaudeSFDC${NC}"
echo -e "${BLUE}================================${NC}"
echo ""

# Step 1: Check if .env file exists
if [ ! -f "$ENV_FILE" ]; then
    echo -e "${YELLOW}No .env file found. Creating one...${NC}"
    touch "$ENV_FILE"
fi

# Step 2: Check for existing webhook URL
if grep -q "SLACK_WEBHOOK_URL=" "$ENV_FILE" 2>/dev/null; then
    echo -e "${YELLOW}Existing SLACK_WEBHOOK_URL found in .env${NC}"
    echo "Do you want to update it? (y/n)"
    read -r UPDATE_CHOICE
    if [[ "$UPDATE_CHOICE" != "y" ]]; then
        echo "Keeping existing configuration."
        EXISTING_URL=$(grep "SLACK_WEBHOOK_URL=" "$ENV_FILE" | cut -d '=' -f2-)
    fi
fi

# Step 3: Guide user to create webhook if needed
if [ -z "${EXISTING_URL:-}" ]; then
    echo -e "${BLUE}To set up Slack notifications, you need to create an incoming webhook.${NC}"
    echo ""
    echo "Follow these steps:"
    echo "1. Go to: https://api.slack.com/apps"
    echo "2. Click on your app 'A08FC8K02AJ' or create a new one"
    echo "3. Go to 'Incoming Webhooks' in the left sidebar"
    echo "4. Click 'Add New Webhook to Workspace'"
    echo "5. Select the channel with ID: ${SLACK_CHANNEL_ID}"
    echo "6. Copy the Webhook URL"
    echo ""
    echo -e "${YELLOW}Please enter your Slack Webhook URL:${NC}"
    read -r WEBHOOK_URL
    
    if [ -z "$WEBHOOK_URL" ]; then
        echo -e "${RED}Error: Webhook URL is required${NC}"
        exit 1
    fi
    
    # Validate URL format
    if [[ ! "$WEBHOOK_URL" =~ ^https://hooks\.slack\.com/services/ ]]; then
        echo -e "${RED}Error: Invalid webhook URL format${NC}"
        echo "URL should start with: https://hooks.slack.com/services/"
        exit 1
    fi
else
    WEBHOOK_URL="$EXISTING_URL"
fi

# Step 4: Store configuration
echo -e "${BLUE}Storing configuration...${NC}"

# Remove old entries if they exist
if [ -f "$ENV_FILE" ]; then
    grep -v "^SLACK_WEBHOOK_URL=" "$ENV_FILE" > "${ENV_FILE}.tmp" || true
    grep -v "^SLACK_CHANNEL=" "${ENV_FILE}.tmp" > "$ENV_FILE" || true
    rm -f "${ENV_FILE}.tmp"
fi

# Add new configuration
echo "SLACK_WEBHOOK_URL=${WEBHOOK_URL}" >> "$ENV_FILE"
echo "SLACK_CHANNEL=${SLACK_CHANNEL_ID}" >> "$ENV_FILE"

echo -e "${GREEN}✓ Configuration stored in .env${NC}"

# Step 5: Create .env.example if it doesn't exist
if [ ! -f "$ENV_EXAMPLE" ]; then
    echo -e "${BLUE}Creating .env.example...${NC}"
    cat > "$ENV_EXAMPLE" << EOF
# Slack Integration Configuration
# ================================
# To set up Slack notifications:
# 1. Run: ./scripts/setup-slack-webhook.sh
# 2. Or manually add your webhook URL below

# Slack Webhook URL (required)
# Get this from: https://api.slack.com/apps > Your App > Incoming Webhooks
SLACK_WEBHOOK_URL=

# Slack Channel ID (optional - defaults to webhook's configured channel)
# This is the channel where release notifications will be posted
SLACK_CHANNEL=${SLACK_CHANNEL_ID}

# Slack App Credentials (for OAuth - optional)
# These are from your Slack app's Basic Information page
SLACK_CLIENT_ID=
SLACK_CLIENT_SECRET=
SLACK_SIGNING_SECRET=
SLACK_VERIFICATION_TOKEN=
EOF
    echo -e "${GREEN}✓ Created .env.example${NC}"
fi

# Step 6: Test the webhook
echo ""
echo -e "${BLUE}Testing Slack webhook connection...${NC}"

# Export for the test
export SLACK_WEBHOOK_URL="$WEBHOOK_URL"
export SLACK_CHANNEL="$SLACK_CHANNEL_ID"

# Create a test message using the notifier
TEST_RESULT=$(node << 'EOF'
const SlackReleaseNotifier = require('./slack-release-notifier.js');

const notifier = new SlackReleaseNotifier();

// Send test message
notifier.sendReleaseNotification({
    version: 'v0.0.0-test',
    title: 'Test Release Notification',
    body: 'This is a test notification from the ClaudeSFDC setup script.\n\n✅ Your Slack integration is working correctly!\n\n• Channel ID: C09D86TQVU5\n• Integration is configured\n• Ready to receive release notifications',
    url: 'https://github.com/RevPalSFDC/claude-sfdc',
    author: 'Setup Script',
    isDraft: false,
    isPrerelease: true
})
.then(() => {
    console.log('SUCCESS');
    process.exit(0);
})
.catch(error => {
    console.error('ERROR:', error.message);
    process.exit(1);
});
EOF
)

if [ "$TEST_RESULT" = "SUCCESS" ]; then
    echo -e "${GREEN}✅ Test notification sent successfully!${NC}"
    echo -e "${GREEN}Check your Slack channel (ID: ${SLACK_CHANNEL_ID}) for the test message.${NC}"
else
    echo -e "${RED}❌ Failed to send test notification${NC}"
    echo "Error: $TEST_RESULT"
    echo ""
    echo "Please check:"
    echo "1. The webhook URL is correct"
    echo "2. The Slack app is properly configured"
    echo "3. The channel exists and the app has access"
    exit 1
fi

# Step 7: Set up GitHub secrets reminder
echo ""
echo -e "${BLUE}================================${NC}"
echo -e "${BLUE}GitHub Secrets Setup${NC}"
echo -e "${BLUE}================================${NC}"
echo ""
echo "To enable automatic notifications on GitHub releases, add this secret:"
echo ""
echo "1. Go to: https://github.com/RevPalSFDC/claude-sfdc/settings/secrets/actions"
echo "2. Click 'New repository secret'"
echo "3. Name: SLACK_WEBHOOK_URL"
echo "4. Value: ${WEBHOOK_URL}"
echo "5. Click 'Add secret'"
echo ""

# Step 8: Add .env to .gitignore if not already there
if [ -f "${PROJECT_ROOT}/.gitignore" ]; then
    if ! grep -q "^\.env$" "${PROJECT_ROOT}/.gitignore"; then
        echo -e "${BLUE}Adding .env to .gitignore...${NC}"
        echo ".env" >> "${PROJECT_ROOT}/.gitignore"
        echo -e "${GREEN}✓ Added .env to .gitignore${NC}"
    fi
else
    echo -e "${BLUE}Creating .gitignore with .env...${NC}"
    echo ".env" > "${PROJECT_ROOT}/.gitignore"
    echo -e "${GREEN}✓ Created .gitignore${NC}"
fi

echo ""
echo -e "${GREEN}================================${NC}"
echo -e "${GREEN}✅ Slack webhook setup complete!${NC}"
echo -e "${GREEN}================================${NC}"
echo ""
echo "Your ClaudeSFDC project is now configured to send release notifications to Slack!"
echo "Channel ID: ${SLACK_CHANNEL_ID}"
echo ""
echo "Next steps:"
echo "1. Add the webhook URL as a GitHub secret (instructions above)"
echo "2. Create a new release to test the integration"
echo "3. Or run: node scripts/test-slack-notification.js"