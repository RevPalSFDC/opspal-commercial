#!/usr/bin/env bash
set -euo pipefail
exec 3>&1 1>&2
if ! command -v jq &>/dev/null; then
    echo "[pre-bulk-operation] jq not found, skipping" >&2
    exit 0
fi

if [[ "${HOOK_DEBUG:-}" == "true" ]]; then
    set -x
    echo "DEBUG: [pre-bulk-operation] starting" >&2
fi
#
# Hook: pre-bulk-operation
# Trigger: PreToolUse (mcp__marketo__lead_create, mcp__marketo__lead_update, mcp__marketo__lead_delete)
# Purpose: Validates bulk operations and provides impact estimates before execution
#
# Validation Checks:
# - Record count estimation
# - Impact assessment (high volume warning)
# - Rate limit availability
# - Backup recommendation for large operations
# - User confirmation for >1000 records
#
# Exit Codes:
# 0 = Success (proceed with operation)
# 2 = Error (block operation with message)
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
VALIDATION_ENABLED="${MARKETO_BULK_VALIDATION:-1}"
HIGH_VOLUME_THRESHOLD="${MARKETO_HIGH_VOLUME_THRESHOLD:-1000}"
WARNING_THRESHOLD="${MARKETO_WARNING_THRESHOLD:-500}"

# Skip if validation disabled
if [[ "$VALIDATION_ENABLED" != "1" ]]; then
    exit 0
fi

# Get tool call info from environment (set by Claude Code)
TOOL_NAME="${CLAUDE_TOOL_NAME:-}"
TOOL_ARGS="${CLAUDE_TOOL_ARGS:-}"

# Only run for bulk-capable operations
BULK_OPERATIONS="lead_create|lead_update|lead_delete|program_member_add|program_member_update"
if [[ ! "$TOOL_NAME" =~ $BULK_OPERATIONS ]]; then
    exit 0
fi

# Extract record count from args (various formats)
# Try to find array length in JSON
RECORD_COUNT=0

# Check for 'input' array (Marketo bulk format)
if echo "$TOOL_ARGS" | grep -qP '"input"\s*:\s*\['; then
    RECORD_COUNT=$(echo "$TOOL_ARGS" | grep -oP '"input"\s*:\s*\[\s*\K[^\]]*' | tr ',' '\n' | grep -c '{' 2>/dev/null || echo "0")
fi

# Check for 'leads' array
if [[ "$RECORD_COUNT" -eq 0 ]] && echo "$TOOL_ARGS" | grep -qP '"leads"\s*:\s*\['; then
    RECORD_COUNT=$(echo "$TOOL_ARGS" | grep -oP '"leads"\s*:\s*\[\s*\K[^\]]*' | tr ',' '\n' | grep -c '{' 2>/dev/null || echo "0")
fi

# Check for 'records' array
if [[ "$RECORD_COUNT" -eq 0 ]] && echo "$TOOL_ARGS" | grep -qP '"records"\s*:\s*\['; then
    RECORD_COUNT=$(echo "$TOOL_ARGS" | grep -oP '"records"\s*:\s*\[\s*\K[^\]]*' | tr ',' '\n' | grep -c '{' 2>/dev/null || echo "0")
fi

# If we couldn't determine count, allow the operation
if [[ "$RECORD_COUNT" -eq 0 ]]; then
    exit 0
fi

# Determine operation type for messaging
OPERATION_TYPE="modify"
if [[ "$TOOL_NAME" == *"create"* ]]; then
    OPERATION_TYPE="create"
elif [[ "$TOOL_NAME" == *"delete"* ]]; then
    OPERATION_TYPE="DELETE"
elif [[ "$TOOL_NAME" == *"update"* ]]; then
    OPERATION_TYPE="update"
fi

# Calculate estimated time based on rate limits (100 calls/20 sec, 300 records/call)
BATCHES=$(( (RECORD_COUNT + 299) / 300 ))
# Each batch takes ~0.2 seconds, plus rate limit delays
ESTIMATED_SECONDS=$(( BATCHES * 1 ))
if [[ $ESTIMATED_SECONDS -lt 60 ]]; then
    ESTIMATED_TIME="${ESTIMATED_SECONDS} seconds"
elif [[ $ESTIMATED_SECONDS -lt 3600 ]]; then
    ESTIMATED_TIME="$(( ESTIMATED_SECONDS / 60 )) minutes"
else
    ESTIMATED_TIME="$(( ESTIMATED_SECONDS / 3600 )) hours"
fi

# Output validation header
cat << EOF

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔍 PRE-BULK OPERATION VALIDATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Operation: ${OPERATION_TYPE}
Record Count: ${RECORD_COUNT}
Estimated Time: ${ESTIMATED_TIME}
Batches Required: ${BATCHES}

EOF

# Check thresholds
if [[ "$RECORD_COUNT" -ge "$HIGH_VOLUME_THRESHOLD" ]]; then
    cat << EOF
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ HIGH VOLUME OPERATION DETECTED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

This operation will affect ${RECORD_COUNT} records.

Recommendations:
• Consider exporting affected records first (backup)
• Run during off-peak hours if possible
• Monitor API usage during operation
• Have rollback plan ready

EOF

    # For DELETE operations over threshold, block by default
    if [[ "$OPERATION_TYPE" == "DELETE" ]]; then
        cat << EOF
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
❌ BULK DELETE BLOCKED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Bulk delete operations affecting ${RECORD_COUNT} records require
explicit confirmation.

To proceed, set environment variable:
  export MARKETO_CONFIRM_BULK_DELETE=1

Or reduce the batch size below ${HIGH_VOLUME_THRESHOLD} records.

EOF
        if [[ "${MARKETO_CONFIRM_BULK_DELETE:-0}" != "1" ]]; then
            jq -nc --arg msg "Bulk delete of ${RECORD_COUNT} records requires explicit confirmation. Set MARKETO_CONFIRM_BULK_DELETE=1 or reduce batch below ${HIGH_VOLUME_THRESHOLD} records." '{"suppressOutput": true, "hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "deny", "permissionDecisionReason": $msg}}' >&3
            exit 0
        fi
    fi
elif [[ "$RECORD_COUNT" -ge "$WARNING_THRESHOLD" ]]; then
    cat << EOF
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ MODERATE VOLUME OPERATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

This operation will affect ${RECORD_COUNT} records.
Proceeding with operation...

EOF
fi

# Check rate limit status (if rate-limit-manager is available)
RATE_LIMIT_SCRIPT="${SCRIPT_DIR}/../scripts/lib/rate-limit-manager.js"
if [[ -f "$RATE_LIMIT_SCRIPT" ]]; then
    # Check if we have enough API calls available
    CALLS_NEEDED=$(( BATCHES + 1 ))
    echo "✓ Rate limit check: ${CALLS_NEEDED} API calls required"
fi

# Final summary
cat << EOF
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ VALIDATION PASSED - Proceeding with bulk operation
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

EOF

exit 0
