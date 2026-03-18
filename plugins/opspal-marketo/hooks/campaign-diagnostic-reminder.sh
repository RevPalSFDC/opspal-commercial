#!/bin/bash

#
# Hook: campaign-diagnostic-reminder
# Trigger: PostToolUse (mcp__marketo__campaign_* and mcp__marketo__lead_activities)
# Purpose: Detect campaign issues and suggest diagnostics when problems are found
#
# Features:
# - Detects empty results from campaign queries
# - Catches API errors that indicate campaign issues
# - Suggests /diagnose-campaign command when problems found
# - References campaign diagnostics runbook series
#
# Exit Codes:
# 0 = Success (no issues found or reminder shown)
#
# Version: 1.0.0
# See: docs/runbooks/campaign-diagnostics/README.md
#

SCRIPT_DIR="$(dirname "$(realpath "$0")")"

# Redirect stdout→stderr so status messages don't pollute Claude's context.
exec 3>&1 1>&2

# Get tool call info from environment
TOOL_NAME="${CLAUDE_TOOL_NAME:-}"
TOOL_OUTPUT="${CLAUDE_TOOL_OUTPUT:-}"

# Only run for relevant campaign tools
case "$TOOL_NAME" in
    *campaign_get*|*campaign_list*|*campaign_get_smart_list*|*lead_activities*)
        # Continue with check
        ;;
    *)
        exit 0
        ;;
esac

# Check for empty or error results
RESULT_COUNT=0
HAS_ERROR=0
ERROR_CODE=""
ERROR_MESSAGE=""

# Try to parse JSON output for result count
if echo "$TOOL_OUTPUT" | grep -q '"success"\s*:\s*false'; then
    HAS_ERROR=1
    ERROR_CODE=$(echo "$TOOL_OUTPUT" | grep -oP '"code"\s*:\s*"\K[^"]+' 2>/dev/null || echo "")
    ERROR_MESSAGE=$(echo "$TOOL_OUTPUT" | grep -oP '"message"\s*:\s*"\K[^"]+' 2>/dev/null || echo "Unknown error")
fi

if echo "$TOOL_OUTPUT" | grep -q '"result"\s*:\s*\[\s*\]'; then
    RESULT_COUNT=0
elif echo "$TOOL_OUTPUT" | grep -qP '"result"\s*:\s*\['; then
    RESULT_COUNT=$(echo "$TOOL_OUTPUT" | grep -oP '"id"\s*:' | wc -l)
fi

# Suggest diagnostics if issues detected
if [[ "$HAS_ERROR" -eq 1 ]]; then
    cat << EOF

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ CAMPAIGN ISSUE DETECTED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Error: $ERROR_MESSAGE
Code: $ERROR_CODE

💡 Need help troubleshooting? Try:
   /diagnose-campaign [campaign-id]

Or use the diagnostic agent directly:
   "Diagnose why this campaign isn't working"

📖 See: docs/runbooks/campaign-diagnostics/README.md
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

EOF
fi

# For lead_activities, check if looking for campaign runs
if [[ "$TOOL_NAME" == *"lead_activities"* ]] && [[ "$RESULT_COUNT" -eq 0 ]]; then
    # Check if we were looking for campaign-related activities
    if echo "$TOOL_OUTPUT" | grep -qE '(Campaign|campaign|102|101)'; then
        cat << EOF

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ℹ️ NO CAMPAIGN ACTIVITIES FOUND
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The queried lead(s) have no campaign run activities.

This could indicate:
• Campaign is not triggering for these leads
• Smart List filters are excluding leads
• Trigger event hasn't occurred yet

💡 Run diagnostics with:
   /diagnose-campaign --issue=trigger

📖 See: 01-smart-campaigns-not-triggering.md
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

EOF
    fi
fi

exit 0
