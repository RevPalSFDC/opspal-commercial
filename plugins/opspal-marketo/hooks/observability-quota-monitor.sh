#!/bin/bash
# Observability Quota Monitor Hook
#
# Monitors and alerts on quota usage for bulk operations:
# - Track cumulative daily export size
# - Alert at 80% and 95% thresholds
# - Suggest export prioritization when near limits
# - Reset tracking at midnight UTC
#
# Exit codes:
# 0 = Success (always - monitoring doesn't block)

# Configuration
DAILY_QUOTA_MB=500
WARNING_THRESHOLD=80
CRITICAL_THRESHOLD=95

# Get portal from environment
PORTAL="${MARKETO_INSTANCE:-default}"
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$HOME/.claude-plugins/opspal-marketo}"
STATE_FILE="${PLUGIN_ROOT}/instances/${PORTAL}/observability/metrics/quota-tracking.json"

# Read current quota state
read_quota_state() {
    if [ ! -f "$STATE_FILE" ]; then
        echo "0"
        return
    fi

    local TODAY=$(date -u +%Y-%m-%d)
    local STATE_DATE=$(grep -oP '"date"\s*:\s*"\K[^"]+' "$STATE_FILE" 2>/dev/null || echo "")

    if [ "$STATE_DATE" = "$TODAY" ]; then
        grep -oP '"usedMB"\s*:\s*\K[0-9.]+' "$STATE_FILE" 2>/dev/null || echo "0"
    else
        echo "0"  # New day, reset
    fi
}

# Calculate time until quota reset
time_until_reset() {
    local NOW=$(date -u +%s)
    local MIDNIGHT=$(date -u -d "tomorrow 00:00:00" +%s)
    local SECONDS_LEFT=$((MIDNIGHT - NOW))

    local HOURS=$((SECONDS_LEFT / 3600))
    local MINUTES=$(( (SECONDS_LEFT % 3600) / 60 ))

    echo "${HOURS}h ${MINUTES}m"
}

# Main monitoring
main() {
    local CURRENT_USAGE=$(read_quota_state)
    local USAGE_PERCENT=$(echo "scale=1; $CURRENT_USAGE / $DAILY_QUOTA_MB * 100" | bc 2>/dev/null || echo "0")
    local REMAINING=$(echo "scale=1; $DAILY_QUOTA_MB - $CURRENT_USAGE" | bc 2>/dev/null || echo "$DAILY_QUOTA_MB")
    local RESET_TIME=$(time_until_reset)

    # Output status to stderr (visible in logs)
    echo "=== Marketo Bulk Export Quota Status ===" >&2
    echo "Used: ${CURRENT_USAGE} MB / ${DAILY_QUOTA_MB} MB (${USAGE_PERCENT}%)" >&2
    echo "Remaining: ${REMAINING} MB" >&2
    echo "Resets in: ${RESET_TIME}" >&2

    # Check thresholds and alert
    if [ "$(echo "$USAGE_PERCENT >= $CRITICAL_THRESHOLD" | bc 2>/dev/null)" = "1" ]; then
        echo "" >&2
        echo "⚠️  CRITICAL: Quota at ${USAGE_PERCENT}% - approaching daily limit!" >&2
        echo "Actions:" >&2
        echo "  - Defer non-critical exports until reset (${RESET_TIME})" >&2
        echo "  - Prioritize only essential data" >&2
        echo "  - Consider smaller date ranges" >&2
    elif [ "$(echo "$USAGE_PERCENT >= $WARNING_THRESHOLD" | bc 2>/dev/null)" = "1" ]; then
        echo "" >&2
        echo "⚡ WARNING: Quota at ${USAGE_PERCENT}% - monitor usage" >&2
        echo "Suggestion: Prioritize critical exports" >&2
    else
        echo "" >&2
        echo "✓ Quota within normal limits" >&2
    fi

    # Output structured status
    cat << EOF >&2
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "portal": "${PORTAL}",
  "quota": {
    "dailyLimitMB": ${DAILY_QUOTA_MB},
    "usedMB": ${CURRENT_USAGE},
    "remainingMB": ${REMAINING},
    "usagePercent": ${USAGE_PERCENT}
  },
  "thresholds": {
    "warning": ${WARNING_THRESHOLD},
    "critical": ${CRITICAL_THRESHOLD}
  },
  "status": "$([ "$(echo "$USAGE_PERCENT >= $CRITICAL_THRESHOLD" | bc 2>/dev/null)" = "1" ] && echo "critical" || ([ "$(echo "$USAGE_PERCENT >= $WARNING_THRESHOLD" | bc 2>/dev/null)" = "1" ] && echo "warning" || echo "normal"))",
  "resetIn": "${RESET_TIME}"
}
EOF

    # Always exit 0 - monitoring doesn't block operations
    exit 0
}

main "$@"
