#!/usr/bin/env bash

##
# Post-CMS Publish Notification Hook
#
# Sends notifications after successful CMS page publish:
# - Slack notification (if configured)
# - Console summary
# - Publish history logging
#
# Triggered by: /cms-publish-page command or hubspot-cms-page-publisher agent
##

set -euo pipefail

# Redirect stdout→stderr so status messages don't pollute Claude's context.
exec 3>&1 1>&2

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"
if ! command -v jq &>/dev/null; then
    echo "[post-cms-publish-notification] jq not found, skipping" >&2
    exit 0
fi

LIB_DIR="$PROJECT_ROOT/scripts/lib"

# Configuration
SLACK_WEBHOOK_URL="${SLACK_WEBHOOK_URL:-}"
ENABLE_SLACK_NOTIFICATIONS="${ENABLE_SLACK_NOTIFICATIONS:-true}"
LOG_PUBLISH_HISTORY="${LOG_PUBLISH_HISTORY:-true}"

# Hooks provide JSON on stdin. Parse it first, then fall back to env/args.
HOOK_INPUT="$(cat 2>/dev/null || true)"

HOOK_PAGE_ID=""
HOOK_PAGE_TYPE=""
HOOK_PUBLISH_TYPE=""
HOOK_PUBLISH_DATE=""
HOOK_PAGE_NAME=""
HOOK_PAGE_URL=""

if [[ -n "$HOOK_INPUT" ]] && echo "$HOOK_INPUT" | jq -e . >/dev/null 2>&1; then
    HOOK_PAGE_ID="$(echo "$HOOK_INPUT" | jq -r '.tool_response.id // .tool_response.pageId // .tool_input.page_id // .tool_input.pageId // .tool_input.id // empty')"
    HOOK_PAGE_TYPE="$(echo "$HOOK_INPUT" | jq -r '.tool_input.page_type // .tool_input.type // empty')"
    HOOK_PUBLISH_TYPE="$(echo "$HOOK_INPUT" | jq -r '.tool_input.publish_type // .tool_input.publishType // empty')"
    HOOK_PUBLISH_DATE="$(echo "$HOOK_INPUT" | jq -r '.tool_input.publish_date // .tool_input.publishDate // .tool_input.scheduled_time // empty')"
    HOOK_PAGE_NAME="$(echo "$HOOK_INPUT" | jq -r '.tool_response.name // .tool_input.page_name // .tool_input.pageName // .tool_input.name // empty')"
    HOOK_PAGE_URL="$(echo "$HOOK_INPUT" | jq -r '.tool_response.url // .tool_input.page_url // .tool_input.pageUrl // .tool_input.url // empty')"
fi

# Extract publish data from hook input, environment, or arguments
PAGE_ID="${PAGE_ID:-${HOOK_PAGE_ID:-${1:-}}}"
PAGE_TYPE="${PAGE_TYPE:-${HOOK_PAGE_TYPE:-landing-pages}}"
PUBLISH_TYPE="${PUBLISH_TYPE:-${HOOK_PUBLISH_TYPE:-immediate}}"  # immediate | scheduled
PUBLISH_DATE="${PUBLISH_DATE:-${HOOK_PUBLISH_DATE:-$(date -u +"%Y-%m-%dT%H:%M:%SZ")}}"
PAGE_NAME="${PAGE_NAME:-${HOOK_PAGE_NAME:-Unknown Page}}"
PAGE_URL="${PAGE_URL:-${HOOK_PAGE_URL:-}}"
PORTAL_ID="${HUBSPOT_PORTAL_ID:-}"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Exit if no page ID provided
if [[ -z "$PAGE_ID" ]]; then
    exit 0
fi

echo ""
echo "🎉 Post-Publish Notification"
echo "=========================================="

# Log to publish history if enabled
if [[ "$LOG_PUBLISH_HISTORY" == "true" ]]; then
    HISTORY_FILE="$PROJECT_ROOT/logs/cms-publish-history.log"
    mkdir -p "$(dirname "$HISTORY_FILE")"

    LOG_ENTRY="$(date -u +"%Y-%m-%d %H:%M:%S UTC") | $PUBLISH_TYPE | $PAGE_ID | $PAGE_NAME | $PAGE_URL"
    echo "$LOG_ENTRY" >> "$HISTORY_FILE"

    echo -e "${GREEN}✓${NC} Logged to publish history"
fi

# Build notification message
if [[ "$PUBLISH_TYPE" == "scheduled" ]]; then
    PUBLISH_STATUS="Scheduled for $PUBLISH_DATE"
    EMOJI="🕒"
else
    PUBLISH_STATUS="Published immediately"
    EMOJI="🚀"
fi

# Console summary
echo ""
echo -e "${GREEN}${EMOJI} CMS Page Published Successfully!${NC}"
echo ""
echo "📄 Page Details:"
echo "   ID: $PAGE_ID"
echo "   Name: $PAGE_NAME"
echo "   Type: $PAGE_TYPE"
echo "   Status: $PUBLISH_STATUS"

if [[ -n "$PAGE_URL" ]]; then
    echo "   URL: $PAGE_URL"
fi

if [[ -n "$PORTAL_ID" ]]; then
    echo "   Portal: $PORTAL_ID"
fi

echo ""

# Send Slack notification if configured
if [[ "$ENABLE_SLACK_NOTIFICATIONS" == "true" ]] && [[ -n "$SLACK_WEBHOOK_URL" ]]; then
    echo -n "📢 Sending Slack notification... "

    # Build Slack message
    SLACK_MESSAGE=$(cat <<EOF
{
    "text": "${EMOJI} HubSpot CMS Page Published",
    "blocks": [
        {
            "type": "header",
            "text": {
                "type": "plain_text",
                "text": "${EMOJI} CMS Page Published",
                "emoji": true
            }
        },
        {
            "type": "section",
            "fields": [
                {
                    "type": "mrkdwn",
                    "text": "*Page:*\n${PAGE_NAME}"
                },
                {
                    "type": "mrkdwn",
                    "text": "*Type:*\n${PAGE_TYPE}"
                },
                {
                    "type": "mrkdwn",
                    "text": "*Status:*\n${PUBLISH_STATUS}"
                },
                {
                    "type": "mrkdwn",
                    "text": "*Page ID:*\n${PAGE_ID}"
                }
            ]
        }
EOF
)

    # Add URL section if available
    if [[ -n "$PAGE_URL" ]]; then
        SLACK_MESSAGE+=$(cat <<EOF
,
        {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": "<${PAGE_URL}|View Live Page>"
            }
        }
EOF
)
    fi

    # Close JSON
    SLACK_MESSAGE+=$(cat <<EOF

    ]
}
EOF
)

    # Send to Slack
    SLACK_RESPONSE=$(curl -s -X POST "$SLACK_WEBHOOK_URL" \
        -H "Content-Type: application/json" \
        -d "$SLACK_MESSAGE" 2>&1)

    if [[ $? -eq 0 ]]; then
        echo -e "${GREEN}✓${NC}"
    else
        echo -e "${YELLOW}⚠️  Failed${NC}"
        echo "   Error: $SLACK_RESPONSE"
    fi
else
    if [[ -z "$SLACK_WEBHOOK_URL" ]]; then
        echo "💡 Tip: Set SLACK_WEBHOOK_URL to receive Slack notifications"
    fi
fi

# Display next steps
echo ""
echo "📋 Next Steps:"
if [[ "$PUBLISH_TYPE" == "immediate" ]]; then
    echo "   1. Verify page is live: $PAGE_URL"
    echo "   2. Test page functionality"
    echo "   3. Monitor analytics for traffic"
    echo "   4. Consider A/B testing variants"
else
    echo "   1. Page will go live automatically on: $PUBLISH_DATE"
    echo "   2. To cancel: /cms-cancel-publish $PAGE_ID"
    echo "   3. To reschedule: /cms-publish-page $PAGE_ID --schedule <new-date>"
fi

echo ""
echo -e "${GREEN}✅ Notification complete${NC}"
echo ""

# Update page publish count metric (optional)
if [[ -f "$LIB_DIR/metrics-tracker.js" ]]; then
    node -e "
    const metricsTracker = require('$LIB_DIR/metrics-tracker.js');
    metricsTracker.incrementCounter('cms_pages_published', 1, {
        page_type: '$PAGE_TYPE',
        publish_type: '$PUBLISH_TYPE'
    });
    " 2>/dev/null || true
fi

exit 0
