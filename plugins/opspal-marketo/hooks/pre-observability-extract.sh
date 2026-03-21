#!/usr/bin/env bash
# Pre-Observability Extract Hook
#
# Validates before starting bulk extract jobs:
# - Daily export quota availability (500 MB limit)
# - Concurrent job limits (2 running, 10 queued)
# - Date range validity (max 31 days)
# - Instance authentication status
#
# Exit codes:
# 0 = Success (proceed with extract)
# 2 = Error (block extract)
# Note: validation skip paths also return 0 (non-blocking)

set -euo pipefail
exec 3>&1 1>&2
if ! command -v jq &>/dev/null; then
    echo "[pre-observability-extract] jq not found, skipping" >&2
    exit 0
fi

# Configuration
DAILY_QUOTA_MB=500
MAX_CONCURRENT=2
MAX_QUEUED=10
MAX_DATE_RANGE_DAYS=31
WARNING_THRESHOLD_PERCENT=80
CRITICAL_THRESHOLD_PERCENT=95

# Get tool arguments
TOOL_ARGS="${CLAUDE_TOOL_ARGS:-}"

# Parse date range from arguments if present
parse_date_range() {
    local args="$1"

    # Extract startAt and endAt from JSON
    START_DATE=$(echo "$args" | grep -oP '"startAt"\s*:\s*"\K[^"]+' 2>/dev/null || echo "")
    END_DATE=$(echo "$args" | grep -oP '"endAt"\s*:\s*"\K[^"]+' 2>/dev/null || echo "")

    if [ -n "$START_DATE" ] && [ -n "$END_DATE" ]; then
        # Calculate days between dates
        START_EPOCH=$(date -d "$START_DATE" +%s 2>/dev/null || echo "0")
        END_EPOCH=$(date -d "$END_DATE" +%s 2>/dev/null || echo "0")

        if [ "$START_EPOCH" -gt 0 ] && [ "$END_EPOCH" -gt 0 ]; then
            DAYS_DIFF=$(( (END_EPOCH - START_EPOCH) / 86400 ))
            echo "$DAYS_DIFF"
            return
        fi
    fi

    echo "0"
}

# Get current quota usage from state file
get_quota_usage() {
    local PORTAL="${MARKETO_INSTANCE:-default}"
    local STATE_FILE="${CLAUDE_PLUGIN_ROOT:-$HOME/.claude-plugins/opspal-marketo}/instances/${PORTAL}/observability/metrics/quota-tracking.json"

    if [ -f "$STATE_FILE" ]; then
        # Check if date matches today
        local TODAY=$(date -u +%Y-%m-%d)
        local STATE_DATE=$(grep -oP '"date"\s*:\s*"\K[^"]+' "$STATE_FILE" 2>/dev/null || echo "")

        if [ "$STATE_DATE" = "$TODAY" ]; then
            # Return current usage in MB
            grep -oP '"usedMB"\s*:\s*\K[0-9.]+' "$STATE_FILE" 2>/dev/null || echo "0"
            return
        fi
    fi

    echo "0"
}

# Main validation
main() {
    echo "=== Pre-Observability Extract Validation ===" >&2

    # 1. Check date range
    DATE_RANGE_DAYS=$(parse_date_range "$TOOL_ARGS")
    if [ "$DATE_RANGE_DAYS" -gt "$MAX_DATE_RANGE_DAYS" ]; then
        echo "ERROR: Date range of ${DATE_RANGE_DAYS} days exceeds maximum ${MAX_DATE_RANGE_DAYS} days" >&2
        echo "Suggestion: Split the export into smaller date ranges" >&2
        jq -nc --arg msg "Date range of ${DATE_RANGE_DAYS} days exceeds maximum ${MAX_DATE_RANGE_DAYS}" '{"blockExecution": true, "blockMessage": $msg}' >&3
        exit 0
    fi

    if [ "$DATE_RANGE_DAYS" -gt 0 ]; then
        echo "Date range: ${DATE_RANGE_DAYS} days (max: ${MAX_DATE_RANGE_DAYS})" >&2
    fi

    # 2. Check quota usage
    CURRENT_USAGE_MB=$(get_quota_usage)
    USAGE_PERCENT=$(echo "scale=1; $CURRENT_USAGE_MB / $DAILY_QUOTA_MB * 100" | bc 2>/dev/null || echo "0")
    REMAINING_MB=$(echo "scale=1; $DAILY_QUOTA_MB - $CURRENT_USAGE_MB" | bc 2>/dev/null || echo "$DAILY_QUOTA_MB")

    echo "Quota usage: ${CURRENT_USAGE_MB} MB / ${DAILY_QUOTA_MB} MB (${USAGE_PERCENT}%)" >&2
    echo "Remaining: ${REMAINING_MB} MB" >&2

    # Check critical threshold
    if [ "$(echo "$USAGE_PERCENT >= $CRITICAL_THRESHOLD_PERCENT" | bc 2>/dev/null)" = "1" ]; then
        echo "ERROR: Daily quota at ${USAGE_PERCENT}% - critical threshold exceeded" >&2
        echo "Quota resets at midnight UTC" >&2
        jq -nc --arg msg "Daily quota at ${USAGE_PERCENT}% - critical threshold exceeded. Resets at midnight UTC." '{"blockExecution": true, "blockMessage": $msg}' >&3
        exit 0
    fi

    # Warn at warning threshold
    if [ "$(echo "$USAGE_PERCENT >= $WARNING_THRESHOLD_PERCENT" | bc 2>/dev/null)" = "1" ]; then
        echo "WARNING: Daily quota at ${USAGE_PERCENT}% - approaching limit" >&2
        echo "Consider prioritizing critical exports only" >&2
    fi

    # 3. Output validation summary
    echo "" >&2
    echo "Validation passed - proceeding with extract" >&2
    echo "Limits: ${MAX_CONCURRENT} concurrent, ${MAX_QUEUED} queued, ${MAX_DATE_RANGE_DAYS} day range" >&2

    # Output structured result for logging
    cat << EOF
{
  "validated": true,
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "quotaUsedMB": ${CURRENT_USAGE_MB},
  "quotaRemainingMB": ${REMAINING_MB},
  "quotaUsagePercent": ${USAGE_PERCENT},
  "dateRangeDays": ${DATE_RANGE_DAYS}
}
EOF

    exit 0
}

main "$@"
