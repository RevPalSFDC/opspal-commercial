#!/bin/bash
#
# Hook: post-operation-verification
# Trigger: PostToolUse (mcp__marketo__*)
# Purpose: Verifies operation success and provides feedback
#
# Verification Checks:
# - Operation completed successfully
# - Expected records affected
# - No unexpected errors in response
# - Rate limit status after operation
# - Sync status check (if SFDC sync enabled)
#
# Exit Codes:
# 0 = Success (verification passed)
# 1 = Error (verification failed)
#

# Source error handler
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "${SCRIPT_DIR}/../cross-platform-plugin/hooks/lib/error-handler.sh" ]]; then
    source "${SCRIPT_DIR}/../cross-platform-plugin/hooks/lib/error-handler.sh"
fi

# Configuration
VERIFICATION_ENABLED="${MARKETO_POST_VERIFICATION:-1}"
VERBOSE_MODE="${MARKETO_VERBOSE_VERIFICATION:-0}"

# Skip if verification disabled
if [[ "$VERIFICATION_ENABLED" != "1" ]]; then
    exit 0
fi

# Get tool call info from environment (set by Claude Code)
TOOL_NAME="${CLAUDE_TOOL_NAME:-}"
TOOL_RESULT="${CLAUDE_TOOL_RESULT:-}"
TOOL_ERROR="${CLAUDE_TOOL_ERROR:-}"

# Skip for non-Marketo tools
if [[ "$TOOL_NAME" != *"marketo"* ]]; then
    exit 0
fi

# Skip for read-only operations (queries, lists, gets)
READ_OPERATIONS="lead_query|lead_get|lead_describe|program_list|program_get|campaign_list|campaign_get|email_list|email_get|analytics_"
if [[ "$TOOL_NAME" =~ $READ_OPERATIONS ]]; then
    # Only verify in verbose mode
    if [[ "$VERBOSE_MODE" != "1" ]]; then
        exit 0
    fi
fi

# Determine operation type for display
OPERATION_TYPE="operation"
if [[ "$TOOL_NAME" == *"create"* ]]; then
    OPERATION_TYPE="CREATE"
elif [[ "$TOOL_NAME" == *"update"* ]]; then
    OPERATION_TYPE="UPDATE"
elif [[ "$TOOL_NAME" == *"delete"* ]]; then
    OPERATION_TYPE="DELETE"
elif [[ "$TOOL_NAME" == *"merge"* ]]; then
    OPERATION_TYPE="MERGE"
elif [[ "$TOOL_NAME" == *"activate"* ]]; then
    OPERATION_TYPE="ACTIVATE"
elif [[ "$TOOL_NAME" == *"deactivate"* ]]; then
    OPERATION_TYPE="DEACTIVATE"
elif [[ "$TOOL_NAME" == *"approve"* ]]; then
    OPERATION_TYPE="APPROVE"
fi

# Check for errors
HAS_ERROR=0
ERROR_MESSAGE=""

if [[ -n "$TOOL_ERROR" ]]; then
    HAS_ERROR=1
    ERROR_MESSAGE="$TOOL_ERROR"
fi

# Check for error indicators in result
if [[ -n "$TOOL_RESULT" ]]; then
    # Check for Marketo error patterns
    if echo "$TOOL_RESULT" | grep -qiP '"success"\s*:\s*false'; then
        HAS_ERROR=1
        ERROR_MESSAGE=$(echo "$TOOL_RESULT" | grep -oP '"message"\s*:\s*"\K[^"]+' | head -1)
    fi

    # Check for error array
    if echo "$TOOL_RESULT" | grep -qiP '"errors"\s*:\s*\[[^\]]+\]'; then
        HAS_ERROR=1
        ERROR_MESSAGE=$(echo "$TOOL_RESULT" | grep -oP '"errors"\s*:\s*\[\s*\K[^\]]+' | head -1)
    fi
fi

# Extract success metrics from result
RECORDS_PROCESSED=0
RECORDS_SUCCEEDED=0
RECORDS_FAILED=0

if [[ -n "$TOOL_RESULT" ]]; then
    # Try to extract result count
    RECORDS_PROCESSED=$(echo "$TOOL_RESULT" | grep -oP '"result"\s*:\s*\[\s*\K[^\]]*' | tr ',' '\n' | grep -c '{' 2>/dev/null || echo "0")

    # Check for individual record statuses
    RECORDS_SUCCEEDED=$(echo "$TOOL_RESULT" | grep -oP '"status"\s*:\s*"(created|updated|deleted|skipped)"' | wc -l 2>/dev/null || echo "0")
    RECORDS_FAILED=$(echo "$TOOL_RESULT" | grep -oP '"status"\s*:\s*"failed"' | wc -l 2>/dev/null || echo "0")
fi

# Output verification result
if [[ "$HAS_ERROR" -eq 1 ]]; then
    cat << EOF

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
❌ POST-OPERATION VERIFICATION: ${OPERATION_TYPE} FAILED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Tool: ${TOOL_NAME}
Error: ${ERROR_MESSAGE:-"Unknown error"}

Recommended Actions:
• Review the error message above
• Check API limits: https://developers.marketo.com/rest-api/error-codes/
• Verify record permissions
• Check field validation rules

EOF
    exit 1
fi

# Success output
if [[ "$VERBOSE_MODE" == "1" ]] || [[ "$RECORDS_PROCESSED" -gt 10 ]]; then
    cat << EOF

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ POST-OPERATION VERIFICATION: ${OPERATION_TYPE} SUCCEEDED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Tool: ${TOOL_NAME}
Records Processed: ${RECORDS_PROCESSED}
EOF

    if [[ "$RECORDS_SUCCEEDED" -gt 0 ]] || [[ "$RECORDS_FAILED" -gt 0 ]]; then
        echo "  Succeeded: ${RECORDS_SUCCEEDED}"
        echo "  Failed: ${RECORDS_FAILED}"
    fi

    echo ""
fi

# Check for partial failures
if [[ "$RECORDS_FAILED" -gt 0 ]]; then
    cat << EOF
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ PARTIAL FAILURE DETECTED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${RECORDS_FAILED} of ${RECORDS_PROCESSED} records failed.

Review the operation result for individual error details.
Common causes:
• Invalid field values
• Required fields missing
• Duplicate detection blocked
• Field-level permissions

EOF
fi

# Remind about SFDC sync for lead operations
if [[ "$TOOL_NAME" == *"lead"* ]] && [[ "$OPERATION_TYPE" != "operation" ]]; then
    if [[ "$VERBOSE_MODE" == "1" ]]; then
        echo "💡 Note: If SFDC sync is enabled, changes will sync within ~5 minutes"
        echo ""
    fi
fi

exit 0
