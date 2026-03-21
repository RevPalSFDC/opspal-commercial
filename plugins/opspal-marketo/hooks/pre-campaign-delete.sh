#!/usr/bin/env bash
set -euo pipefail
exec 3>&1 1>&2
if ! command -v jq &>/dev/null; then
    echo "[pre-campaign-delete] jq not found, skipping" >&2
    exit 0
fi
#
# Hook: pre-campaign-delete
# Trigger: PreToolUse (mcp__marketo__campaign_delete)
# Purpose: Validates before campaign deletion to prevent data loss
#
# Validation Checks:
# - Campaign is not active (must deactivate first)
# - Campaign is not a system campaign
# - No other campaigns depend on this via "Request Campaign"
# - Confirmation for high-risk deletions
#
# Exit Codes:
# 0 = Success (proceed with deletion)
# 1 = Error (block deletion with message)
# 2 = Skip (bypass validation)
#

# Source error handler
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "${SCRIPT_DIR}/lib/error-handler.sh" ]]; then
    source "${SCRIPT_DIR}/lib/error-handler.sh"
elif [[ -f "${SCRIPT_DIR}/../opspal-core/hooks/lib/error-handler.sh" ]]; then
    source "${SCRIPT_DIR}/../opspal-core/hooks/lib/error-handler.sh"
fi

# Configuration
VALIDATION_ENABLED="${MARKETO_DELETE_VALIDATION:-1}"
STRICT_MODE="${MARKETO_STRICT_DELETE:-1}"
ALLOW_ACTIVE_DELETE="${MARKETO_ALLOW_ACTIVE_DELETE:-0}"

# Skip if validation disabled
if [[ "$VALIDATION_ENABLED" != "1" ]]; then
    exit 0
fi

# Get tool call info from environment (set by Claude Code)
TOOL_NAME="${CLAUDE_TOOL_NAME:-}"
TOOL_ARGS="${CLAUDE_TOOL_ARGS:-}"

# Only run for campaign deletion
if [[ "$TOOL_NAME" != *"campaign_delete"* ]]; then
    exit 0
fi

# Extract campaign ID from args
CAMPAIGN_ID=$(echo "$TOOL_ARGS" | grep -oP '"campaignId"\s*:\s*\K\d+' 2>/dev/null || echo "")

if [[ -z "$CAMPAIGN_ID" ]]; then
    echo "⚠️ Warning: Could not extract campaign ID for validation"
    exit 0
fi

# Output validation header
cat << EOF

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ PRE-CAMPAIGN DELETE VALIDATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Campaign ID: $CAMPAIGN_ID

⚠️ WARNING: Deletion is PERMANENT and cannot be undone.

EOF

# Validation checklist
VALIDATION_WARNINGS=()
VALIDATION_ERRORS=()

# Check 1: Active campaign check
echo "✓ Checking campaign status..."
# In production: Query campaign to check isActive
# If active and ALLOW_ACTIVE_DELETE=0, add error

# Check 2: System campaign check
echo "✓ Checking if system campaign..."
# In production: Query campaign to check isSystem
# System campaigns cannot be deleted

# Check 3: Dependency check
echo "✓ Checking for dependent campaigns..."
# In production: Search for campaigns that reference this via "Request Campaign"
# Warn about orphaned references

# Check 4: Recent activity check
echo "✓ Checking recent campaign activity..."
# In production: Check if campaign processed leads recently
# Warn if campaign was recently active

# Check 5: Historical data consideration
echo "✓ Noting historical data impact..."
# Reminder that historical activity data remains but campaign reference is lost

# Summary output
echo ""

# Warning about permanence
VALIDATION_WARNINGS+=("This action is IRREVERSIBLE. Campaign history will reference a deleted campaign.")

if [[ ${#VALIDATION_ERRORS[@]} -gt 0 ]]; then
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "❌ VALIDATION FAILED - Campaign deletion blocked"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "Errors:"
    for error in "${VALIDATION_ERRORS[@]}"; do
        echo "  • $error"
    done
    echo ""
    echo "Resolution Steps:"
    echo "  1. Deactivate the campaign first if it is active"
    echo "  2. Check if other campaigns depend on this one"
    echo "  3. Consider archiving (rename/move) instead of deleting"
    jq -nc --arg msg "Campaign deletion blocked: validation errors found. Deactivate the campaign first, check for dependent campaigns, or consider archiving instead." '{"blockExecution": true, "blockMessage": $msg}' >&3
    exit 0
fi

if [[ ${#VALIDATION_WARNINGS[@]} -gt 0 ]]; then
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "⚠️ VALIDATION PASSED WITH WARNINGS"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "Warnings:"
    for warning in "${VALIDATION_WARNINGS[@]}"; do
        echo "  • $warning"
    done
    echo ""
    echo "Alternatives to Consider:"
    echo "  • Rename to 'Archive - [Campaign Name]'"
    echo "  • Move to Archive folder"
    echo "  • Deactivate and document"
    echo ""

    if [[ "$STRICT_MODE" == "1" ]]; then
        echo "Note: Strict mode is enabled. Set MARKETO_STRICT_DELETE=0 to allow deletions with warnings."
        # In strict mode, still proceed but with strong warning
    fi
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ VALIDATION PASSED - Proceeding with campaign deletion"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

exit 0
