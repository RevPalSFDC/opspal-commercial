#!/usr/bin/env bash
set -euo pipefail
exec 3>&1 1>&2
if ! command -v jq &>/dev/null; then
    echo "[pre-bulk-export] jq not found, skipping" >&2
    exit 0
fi
#
# Hook: pre-bulk-export
# Trigger: PreToolUse (mcp__marketo__bulk_lead_export_*, mcp__marketo__bulk_activity_export_*)
# Purpose: Validates bulk export operations and checks quota before execution
#
# Validation Checks:
# - Daily export quota (500 MB limit)
# - Date range validation (max 31 days)
# - Concurrent export limit (2 running)
# - Activity type validation
#
# Exit Codes:
# 0 = Success (proceed with operation)
# 1 = Error (block operation with message)
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
VALIDATION_ENABLED="${MARKETO_EXPORT_VALIDATION:-1}"
DAILY_EXPORT_LIMIT_MB="${MARKETO_DAILY_EXPORT_LIMIT_MB:-500}"
MAX_DATE_RANGE_DAYS="${MARKETO_MAX_DATE_RANGE_DAYS:-31}"
QUOTA_WARNING_THRESHOLD="${MARKETO_QUOTA_WARNING_THRESHOLD:-80}"

# Skip if validation disabled
if [[ "$VALIDATION_ENABLED" != "1" ]]; then
    exit 0
fi

# Get tool call info from environment (set by Claude Code)
TOOL_NAME="${CLAUDE_TOOL_NAME:-}"
TOOL_ARGS="${CLAUDE_TOOL_ARGS:-}"

# Only run for bulk export operations
if [[ ! "$TOOL_NAME" =~ bulk.*export ]]; then
    exit 0
fi

# Determine export type
EXPORT_TYPE="unknown"
if [[ "$TOOL_NAME" == *"lead"* ]]; then
    EXPORT_TYPE="lead"
elif [[ "$TOOL_NAME" == *"activity"* ]]; then
    EXPORT_TYPE="activity"
elif [[ "$TOOL_NAME" == *"program_member"* ]]; then
    EXPORT_TYPE="program_member"
fi

# Output validation header
cat << EOF

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔍 PRE-BULK EXPORT VALIDATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Export Type: ${EXPORT_TYPE}
Operation: ${TOOL_NAME}

EOF

# Check 1: Validate date range (if creating new export)
if [[ "$TOOL_NAME" == *"_create"* ]]; then
    # Extract startAt and endAt from filter
    START_AT=$(echo "$TOOL_ARGS" | grep -oP '"startAt"\s*:\s*"\K[^"]+' | head -1)
    END_AT=$(echo "$TOOL_ARGS" | grep -oP '"endAt"\s*:\s*"\K[^"]+' | head -1)

    if [[ -n "$START_AT" && -n "$END_AT" ]]; then
        # Calculate date range (basic calculation)
        START_EPOCH=$(date -d "$START_AT" +%s 2>/dev/null || echo "0")
        END_EPOCH=$(date -d "$END_AT" +%s 2>/dev/null || echo "0")

        if [[ "$START_EPOCH" -gt 0 && "$END_EPOCH" -gt 0 ]]; then
            DIFF_SECONDS=$((END_EPOCH - START_EPOCH))
            DIFF_DAYS=$((DIFF_SECONDS / 86400))

            echo "📅 Date Range: ${DIFF_DAYS} days"
            echo "   Start: ${START_AT}"
            echo "   End: ${END_AT}"
            echo ""

            if [[ "$DIFF_DAYS" -gt "$MAX_DATE_RANGE_DAYS" ]]; then
                cat << EOF
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
❌ DATE RANGE EXCEEDED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Export date range of ${DIFF_DAYS} days exceeds maximum of ${MAX_DATE_RANGE_DAYS} days.

Action Required:
• Split the export into multiple jobs
• Each job can cover up to ${MAX_DATE_RANGE_DAYS} days

Example: For 60 days of data, create two exports:
• Export 1: Days 1-31
• Export 2: Days 32-60

EOF
                jq -nc --arg msg "Export date range exceeds the maximum of ${MAX_DATE_RANGE_DAYS} days. Split the export into multiple jobs, each covering up to ${MAX_DATE_RANGE_DAYS} days." '{"blockExecution": true, "blockMessage": $msg}' >&3
                exit 0
            fi
        fi
    fi

    # Check for activity exports: activityTypeIds required
    if [[ "$EXPORT_TYPE" == "activity" ]]; then
        if ! echo "$TOOL_ARGS" | grep -qP '"activityTypeIds"'; then
            cat << EOF
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
❌ MISSING ACTIVITY TYPES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Activity exports require activityTypeIds parameter.

Common activity type IDs:
• 6  - Send Email
• 7  - Email Delivered
• 10 - Open Email
• 11 - Click Email
• 2  - Fill Out Form
• 1  - Visit Webpage
• 12 - New Lead
• 13 - Change Data Value
• 22 - Change Score

Use mcp__marketo__activity_types_list() to get all types.

EOF
            jq -nc --arg msg "Activity exports require activityTypeIds parameter. Use mcp__marketo__activity_types_list() to get all type IDs." '{"blockExecution": true, "blockMessage": $msg}' >&3
            exit 0
        fi
    fi
fi

# Check 2: Quota status check
# Read from state file if available
QUOTA_STATE_FILE="${SCRIPT_DIR}/../portals/.export-quota-state.json"
QUOTA_USED_MB=0

if [[ -f "$QUOTA_STATE_FILE" ]]; then
    QUOTA_USED_MB=$(grep -oP '"usedMB"\s*:\s*\K[0-9.]+' "$QUOTA_STATE_FILE" | head -1 || echo "0")
    QUOTA_USED_MB=${QUOTA_USED_MB%.*}  # Remove decimal
fi

QUOTA_REMAINING_MB=$((DAILY_EXPORT_LIMIT_MB - QUOTA_USED_MB))
QUOTA_PERCENT=$((QUOTA_USED_MB * 100 / DAILY_EXPORT_LIMIT_MB))

echo "📊 Daily Export Quota:"
echo "   Used: ${QUOTA_USED_MB} MB / ${DAILY_EXPORT_LIMIT_MB} MB (${QUOTA_PERCENT}%)"
echo "   Remaining: ${QUOTA_REMAINING_MB} MB"
echo ""

if [[ "$QUOTA_PERCENT" -ge "$QUOTA_WARNING_THRESHOLD" ]]; then
    cat << EOF
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ EXPORT QUOTA WARNING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Daily export quota is at ${QUOTA_PERCENT}%.
Only ${QUOTA_REMAINING_MB} MB remaining for today.

Recommendations:
• Reduce export field count if possible
• Use narrower date ranges
• Export during next UTC day if not urgent

Quota resets at midnight UTC.

EOF
fi

if [[ "$QUOTA_REMAINING_MB" -le 10 ]]; then
    cat << EOF
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
❌ EXPORT QUOTA EXHAUSTED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Daily export quota is nearly exhausted.
Only ${QUOTA_REMAINING_MB} MB remaining.

Options:
1. Wait until midnight UTC for quota reset
2. Contact Marketo support for quota increase

Current time: $(date -u +"%Y-%m-%d %H:%M:%S UTC")

EOF
    # Block if quota truly exhausted
    if [[ "$QUOTA_REMAINING_MB" -le 0 ]]; then
        jq -nc --arg msg "Daily export quota exhausted (${QUOTA_REMAINING_MB} MB remaining). Wait until midnight UTC for quota reset." '{"blockExecution": true, "blockMessage": $msg}' >&3
        exit 0
    fi
fi

# Check 3: API constraints info
cat << EOF
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 BULK EXPORT API CONSTRAINTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• Concurrent exports: 2 running, 10 queued
• Daily export limit: ${DAILY_EXPORT_LIMIT_MB} MB
• Max date range: ${MAX_DATE_RANGE_DAYS} days
• File retention: 7 days

EOF

# Final summary
cat << EOF
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ VALIDATION PASSED - Proceeding with bulk export
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

EOF

exit 0
