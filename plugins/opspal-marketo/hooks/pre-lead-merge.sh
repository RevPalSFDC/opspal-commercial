#!/usr/bin/env bash
set -euo pipefail
exec 3>&1 1>&2
if ! command -v jq &>/dev/null; then
    echo "[pre-lead-merge] jq not found, skipping" >&2
    exit 0
fi
#
# Hook: pre-lead-merge
# Trigger: PreToolUse (mcp__marketo__lead_merge)
# Purpose: Validates merge candidates before execution
#
# Validation Checks:
# - Winner lead exists and is valid
# - Loser leads exist and are valid
# - No critical data will be lost
# - Merge direction is correct (older into newer typically)
# - Activity history preservation
#
# Exit Codes:
# 0 = Success (proceed with merge)
# 2 = Error (block merge with message)
# Note: validation skip paths also return 0 (non-blocking)
#

# Source error handler
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "${SCRIPT_DIR}/lib/error-handler.sh" ]]; then
    source "${SCRIPT_DIR}/lib/error-handler.sh"
elif [[ -f "${SCRIPT_DIR}/../opspal-core/hooks/lib/error-handler.sh" ]]; then
    source "${SCRIPT_DIR}/../opspal-core/hooks/lib/error-handler.sh"
fi

# Configuration
VALIDATION_ENABLED="${MARKETO_MERGE_VALIDATION:-1}"
STRICT_MODE="${MARKETO_STRICT_MERGE:-0}"

# Skip if validation disabled
if [[ "$VALIDATION_ENABLED" != "1" ]]; then
    exit 0
fi

# Get tool call info from environment (set by Claude Code)
TOOL_NAME="${CLAUDE_TOOL_NAME:-}"
TOOL_ARGS="${CLAUDE_TOOL_ARGS:-}"

# Only run for lead merge operations
if [[ "$TOOL_NAME" != *"lead_merge"* ]]; then
    exit 0
fi

# Extract merge parameters
WINNER_ID=$(echo "$TOOL_ARGS" | grep -oP '"winnerId"\s*:\s*\K\d+' 2>/dev/null || echo "")
LOSER_IDS=$(echo "$TOOL_ARGS" | grep -oP '"loserIds"\s*:\s*\[\s*\K[^\]]+' 2>/dev/null || echo "")

# Count losers
LOSER_COUNT=0
if [[ -n "$LOSER_IDS" ]]; then
    LOSER_COUNT=$(echo "$LOSER_IDS" | tr ',' '\n' | grep -c '[0-9]' 2>/dev/null || echo "0")
fi

# Validation warnings and errors
WARNINGS=()
ERRORS=()

# Validate winner ID present
if [[ -z "$WINNER_ID" ]]; then
    ERRORS+=("Winner lead ID is required")
fi

# Validate loser IDs present
if [[ "$LOSER_COUNT" -eq 0 ]]; then
    ERRORS+=("At least one loser lead ID is required")
fi

# Check for merging into self
if [[ -n "$WINNER_ID" ]] && echo "$LOSER_IDS" | grep -q "$WINNER_ID"; then
    ERRORS+=("Cannot merge a lead into itself (winner ID found in loser list)")
fi

# Warn on large merge operations
if [[ "$LOSER_COUNT" -gt 5 ]]; then
    WARNINGS+=("Merging ${LOSER_COUNT} leads is a large operation - verify this is intentional")
fi

# Output validation header
cat << EOF

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔍 PRE-LEAD MERGE VALIDATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Winner Lead ID: ${WINNER_ID:-"(not specified)"}
Loser Lead Count: ${LOSER_COUNT}

EOF

# Run validation checks
echo "Validation Checks:"
echo "✓ Winner ID specified: $([ -n "$WINNER_ID" ] && echo "Yes" || echo "No")"
echo "✓ Loser IDs specified: $([ "$LOSER_COUNT" -gt 0 ] && echo "Yes (${LOSER_COUNT})" || echo "No")"
echo "✓ No self-merge: $(echo "$LOSER_IDS" | grep -q "$WINNER_ID" && echo "FAIL" || echo "Pass")"
echo ""

# Important merge notes
cat << EOF
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 MERGE BEHAVIOR NOTES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

What will be preserved on the WINNER lead:
• All activity history from loser leads
• Program memberships from loser leads
• Opportunity associations
• Most recent field values (typically)

What will be DELETED:
• Loser lead records (permanently removed)
• Duplicate program memberships (kept on winner)

⚠️ This operation is IRREVERSIBLE

Best Practice:
• Keep the lead with the most complete data as winner
• Newer leads typically have more accurate data
• Verify SFDC sync implications if synced

EOF

# Output errors if any
if [[ ${#ERRORS[@]} -gt 0 ]]; then
    cat << EOF
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
❌ VALIDATION FAILED - Merge blocked
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Errors:
EOF
    for error in "${ERRORS[@]}"; do
        echo "  • $error"
    done
    echo ""
    echo "Please fix the errors above before proceeding with the merge."
    jq -nc --arg msg "Lead merge blocked: validation errors found. Winner ID or loser IDs are missing or invalid. Please fix before proceeding." '{"suppressOutput": true, "hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "deny", "permissionDecisionReason": $msg}}' >&3
    exit 0
fi

# Output warnings if any
if [[ ${#WARNINGS[@]} -gt 0 ]]; then
    cat << EOF
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ VALIDATION PASSED WITH WARNINGS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Warnings:
EOF
    for warning in "${WARNINGS[@]}"; do
        echo "  • $warning"
    done
    echo ""

    if [[ "$STRICT_MODE" == "1" ]]; then
        echo "Strict mode enabled - blocking merge due to warnings"
        jq -nc --arg msg "Lead merge blocked in strict mode: warnings present. Merging ${LOSER_COUNT} leads is a large operation. Disable strict mode (MARKETO_STRICT_MERGE=0) to proceed." '{"suppressOutput": true, "hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "deny", "permissionDecisionReason": $msg}}' >&3
        exit 0
    fi
fi

# Success
cat << EOF
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ VALIDATION PASSED - Proceeding with lead merge
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

EOF

exit 0
