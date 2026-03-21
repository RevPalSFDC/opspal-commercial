#!/usr/bin/env bash
set -euo pipefail
#
# Hook: post-campaign-create
# Trigger: PostToolUse (mcp__marketo__campaign_create, mcp__marketo__campaign_clone)
# Purpose: Post-creation verification and context logging
#
# Actions:
# - Verify campaign was created successfully
# - Log to instance context
# - Provide next steps guidance
# - Track for template management
#
# Exit Codes:
# 0 = Success (always passes - post hooks don't block)
#

# Source error handler
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "${SCRIPT_DIR}/lib/error-handler.sh" ]]; then
    source "${SCRIPT_DIR}/lib/error-handler.sh"
elif [[ -f "${SCRIPT_DIR}/../opspal-core/hooks/lib/error-handler.sh" ]]; then
    source "${SCRIPT_DIR}/../opspal-core/hooks/lib/error-handler.sh"
fi

# Redirect stdout to stderr so diagnostic output doesn't leak into Claude context.
# fd 3 preserves original stdout for structured JSON hook responses if needed.
exec 3>&1 1>&2

# Configuration
LOGGING_ENABLED="${MARKETO_POST_CREATE_LOGGING:-1}"
SHOW_NEXT_STEPS="${MARKETO_SHOW_CREATE_NEXT_STEPS:-1}"

# Get tool call info from environment
TOOL_NAME="${CLAUDE_TOOL_NAME:-}"
TOOL_RESULT="${CLAUDE_TOOL_RESULT:-}"

# Only run for campaign create/clone operations
if [[ "$TOOL_NAME" != *"campaign_create"* ]] && [[ "$TOOL_NAME" != *"campaign_clone"* ]]; then
    exit 0
fi

# Extract result info
SUCCESS=$(echo "$TOOL_RESULT" | grep -oP '"success"\s*:\s*\K(true|false)' 2>/dev/null || echo "unknown")
NEW_CAMPAIGN_ID=$(echo "$TOOL_RESULT" | grep -oP '"id"\s*:\s*\K\d+' 2>/dev/null | head -1 || echo "")
CAMPAIGN_NAME=$(echo "$TOOL_RESULT" | grep -oP '"name"\s*:\s*"\K[^"]+' 2>/dev/null || echo "")

# Determine operation type
if [[ "$TOOL_NAME" == *"clone"* ]]; then
    OPERATION="Clone"
else
    OPERATION="Create"
fi

# Output header
cat << EOF

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 POST-CAMPAIGN ${OPERATION^^} VERIFICATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

EOF

# Check success
if [[ "$SUCCESS" == "true" ]]; then
    echo "✅ Campaign ${OPERATION}d Successfully"
    echo ""
    echo "Campaign Details:"
    echo "  ID: ${NEW_CAMPAIGN_ID:-[unknown]}"
    echo "  Name: ${CAMPAIGN_NAME:-[unknown]}"
    echo "  Status: Inactive (requires activation)"
    echo ""

    # Log to instance context if enabled
    if [[ "$LOGGING_ENABLED" == "1" ]]; then
        echo "📝 Logged to instance context"
        # In production: Append to INSTANCE_CONTEXT.json
        # {
        #   "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
        #   "operation": "$OPERATION",
        #   "campaignId": $NEW_CAMPAIGN_ID,
        #   "campaignName": "$CAMPAIGN_NAME"
        # }
    fi

    # Show next steps if enabled
    if [[ "$SHOW_NEXT_STEPS" == "1" ]]; then
        echo ""
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo "📌 NEXT STEPS"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo ""

        if [[ "$OPERATION" == "Create" ]]; then
            # For created campaigns (empty - no triggers/flows)
            echo "Created campaigns are EMPTY (no triggers or flow steps)."
            echo ""
            echo "To make this campaign functional:"
            echo "  1. Open in Marketo UI to add triggers and flow steps"
            echo "  2. Or clone from a template instead"
            echo ""
            echo "For programmatic campaign creation with triggers:"
            echo "  Use /clone-campaign-wizard with a template"
            echo ""
        else
            # For cloned campaigns
            echo "Cloned campaign includes all triggers and flow steps."
            echo ""
            echo "Recommended actions:"
            echo "  1. Review program tokens (may need updates for new context)"
            echo "  2. Verify email/LP references point to correct assets"
            echo "  3. Test with a sample lead before activating"
            echo ""
            echo "To activate:"
            echo "  mcp__marketo__campaign_activate({ campaignId: $NEW_CAMPAIGN_ID })"
            echo ""
        fi

        echo "Related commands:"
        echo "  • /smart-campaign-api --operation=activate"
        echo "  • /marketo-preflight campaign-activate"
        echo ""
    fi

    # API limitation reminder for create operations
    if [[ "$OPERATION" == "Create" ]]; then
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo "⚠️ API LIMITATION REMINDER"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo ""
        echo "Smart List triggers and Flow steps CANNOT be created via API."
        echo "The campaign you just created is empty."
        echo ""
        echo "Recommended approach: Clone from a template campaign"
        echo "that already has the triggers and flows you need."
        echo ""
        echo "See: docs/runbooks/smart-campaigns/10-smart-list-flow-limitations.md"
        echo ""
    fi

else
    echo "❌ Campaign ${OPERATION} Failed"
    echo ""
    echo "Check the error message in the tool result for details."
    echo ""
    echo "Common issues:"
    echo "  • Name already exists in target folder (code 711)"
    echo "  • Target folder not found (code 710)"
    echo "  • Source campaign not found (code 610) - for clones"
    echo "  • Rate limit exceeded (code 606) - wait 20 seconds"
    echo ""
    echo "For troubleshooting, see:"
    echo "  docs/runbooks/smart-campaigns/02-api-best-practices-error-handling.md"
    echo ""
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

exit 0
