#!/bin/bash
#
# Hook: api-limit-monitor
# Trigger: PostToolUse (mcp__marketo__*)
# Purpose: Monitors API usage and warns on threshold breaches
#
# Monitoring:
# - Track calls per 20-second window (limit: 100)
# - Track daily API calls (limit: 50,000)
# - Warn at configurable thresholds
# - Log usage for analysis
#
# Exit Codes:
# 0 = Success (monitoring recorded)
# 1 = Error (critical threshold reached)
#

# Source error handler
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "${SCRIPT_DIR}/../opspal-core/hooks/lib/error-handler.sh" ]]; then
    source "${SCRIPT_DIR}/../opspal-core/hooks/lib/error-handler.sh"
fi

# Configuration
MONITORING_ENABLED="${MARKETO_API_MONITORING:-1}"
WARNING_THRESHOLD_PERCENT="${MARKETO_API_WARNING_THRESHOLD:-80}"
CRITICAL_THRESHOLD_PERCENT="${MARKETO_API_CRITICAL_THRESHOLD:-95}"
DAILY_LIMIT="${MARKETO_API_DAILY_LIMIT:-50000}"
WINDOW_LIMIT="${MARKETO_API_WINDOW_LIMIT:-100}"

# Skip if monitoring disabled
if [[ "$MONITORING_ENABLED" != "1" ]]; then
    exit 0
fi

# Structured event emission helper
EMIT_EVENT_SCRIPT="${SCRIPT_DIR}/../scripts/lib/emit-automation-event.js"
emit_event() {
    local severity="$1"
    local status="$2"
    local event_type="$3"
    local details_json="$4"

    if [[ -f "$EMIT_EVENT_SCRIPT" ]]; then
        node "$EMIT_EVENT_SCRIPT" "$(cat <<EOF
{
  "platform": "marketo",
  "category": "rate_limit",
  "event_type": "${event_type}",
  "severity": "${severity}",
  "status": "${status}",
  "operation": "${TOOL_NAME}",
  "details": ${details_json},
  "metrics": {
    "daily_calls": ${DAILY_CALLS:-0},
    "daily_limit": ${DAILY_LIMIT:-0},
    "daily_percent": ${DAILY_PERCENT:-0}
  },
  "tags": ["marketo", "api-limit-monitor", "hook"]
}
EOF
)" >/dev/null 2>&1 || true
    fi
}

# Get tool call info from environment
TOOL_NAME="${CLAUDE_TOOL_NAME:-}"
TOOL_RESULT="${CLAUDE_TOOL_RESULT:-}"

# Skip for non-Marketo tools
if [[ "$TOOL_NAME" != *"marketo"* ]]; then
    exit 0
fi

# Tracking file location
TRACKING_DIR="${HOME}/.marketo-api-tracking"
TRACKING_FILE="${TRACKING_DIR}/usage.json"

# Create tracking directory if needed
mkdir -p "$TRACKING_DIR"

# Initialize tracking file if needed
if [[ ! -f "$TRACKING_FILE" ]]; then
    cat > "$TRACKING_FILE" << 'INITJSON'
{
  "dailyCalls": 0,
  "dailyReset": "",
  "windowCalls": [],
  "lastUpdated": ""
}
INITJSON
fi

# Get current timestamp
CURRENT_TIME=$(date +%s)
CURRENT_DATE=$(date +%Y-%m-%d)
CURRENT_DATETIME=$(date -Iseconds)

# Read current tracking data
TRACKING_DATA=$(cat "$TRACKING_FILE")

# Parse tracking data (simple bash parsing)
DAILY_CALLS=$(echo "$TRACKING_DATA" | grep -oP '"dailyCalls"\s*:\s*\K\d+' || echo "0")
DAILY_RESET=$(echo "$TRACKING_DATA" | grep -oP '"dailyReset"\s*:\s*"\K[^"]*' || echo "")

# Reset daily counter if new day
if [[ "$DAILY_RESET" != "$CURRENT_DATE" ]]; then
    DAILY_CALLS=0
    DAILY_RESET="$CURRENT_DATE"
fi

# Increment daily call count
DAILY_CALLS=$((DAILY_CALLS + 1))

# Calculate usage percentages
DAILY_PERCENT=$(( (DAILY_CALLS * 100) / DAILY_LIMIT ))

# Update tracking file
cat > "$TRACKING_FILE" << ENDJSON
{
  "dailyCalls": ${DAILY_CALLS},
  "dailyReset": "${DAILY_RESET}",
  "windowCalls": [],
  "lastUpdated": "${CURRENT_DATETIME}"
}
ENDJSON

# Extract rate limit headers from result if available
RATE_LIMIT_REMAINING=""
if [[ -n "$TOOL_RESULT" ]]; then
    RATE_LIMIT_REMAINING=$(echo "$TOOL_RESULT" | grep -oP '"x-rate-limit-remaining"\s*:\s*\K\d+' 2>/dev/null || echo "")
fi

# Check thresholds and output warnings
if [[ "$DAILY_PERCENT" -ge "$CRITICAL_THRESHOLD_PERCENT" ]]; then
    emit_event "critical" "blocked" "daily_limit_critical" "$(cat <<EOF
{
  "threshold_percent": ${CRITICAL_THRESHOLD_PERCENT},
  "message": "Daily API limit nearing exhaustion"
}
EOF
)"
    cat << EOF

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚨 CRITICAL: API LIMIT NEARLY EXHAUSTED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Daily Usage: ${DAILY_CALLS} / ${DAILY_LIMIT} (${DAILY_PERCENT}%)
Status: CRITICAL - Operations may fail

⚠️ IMMEDIATE ACTION REQUIRED:
• Pause non-essential API operations
• Review and cancel pending bulk operations
• Daily limit resets at midnight (Marketo instance timezone)

EOF

elif [[ "$DAILY_PERCENT" -ge "$WARNING_THRESHOLD_PERCENT" ]]; then
    emit_event "warning" "observed" "daily_limit_warning" "$(cat <<EOF
{
  "threshold_percent": ${WARNING_THRESHOLD_PERCENT},
  "message": "Daily API usage is high"
}
EOF
)"
    cat << EOF

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ WARNING: API USAGE HIGH
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Daily Usage: ${DAILY_CALLS} / ${DAILY_LIMIT} (${DAILY_PERCENT}%)
Status: WARNING - Monitor closely

Recommendations:
• Batch operations where possible
• Defer non-urgent bulk operations
• Consider caching for repeated queries

EOF

fi

# Log rate limit info from response headers
if [[ -n "$RATE_LIMIT_REMAINING" ]]; then
    WINDOW_PERCENT=$(( ((WINDOW_LIMIT - RATE_LIMIT_REMAINING) * 100) / WINDOW_LIMIT ))

    if [[ "$WINDOW_PERCENT" -ge 80 ]]; then
        emit_event "warning" "retrying" "window_limit_warning" "$(cat <<EOF
{
  "window_limit": ${WINDOW_LIMIT},
  "window_remaining": ${RATE_LIMIT_REMAINING},
  "window_percent": ${WINDOW_PERCENT}
}
EOF
)"
        cat << EOF
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⏱️ RATE WINDOW WARNING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Window Usage: $(( WINDOW_LIMIT - RATE_LIMIT_REMAINING )) / ${WINDOW_LIMIT} (${WINDOW_PERCENT}%)
Remaining: ${RATE_LIMIT_REMAINING} calls in current 20-second window

Tip: Wait a few seconds before next batch operation.

EOF
    fi
fi

# Emit lightweight informational heartbeat every monitored call.
emit_event "info" "observed" "api_monitor_sample" "$(cat <<EOF
{
  "tool_name": "${TOOL_NAME}",
  "warning_threshold_percent": ${WARNING_THRESHOLD_PERCENT},
  "critical_threshold_percent": ${CRITICAL_THRESHOLD_PERCENT}
}
EOF
)"

# Periodic status update (every 100 calls)
if [[ $((DAILY_CALLS % 100)) -eq 0 ]] && [[ "$DAILY_PERCENT" -lt "$WARNING_THRESHOLD_PERCENT" ]]; then
    echo "📊 API Usage: ${DAILY_CALLS} / ${DAILY_LIMIT} (${DAILY_PERCENT}%) - Healthy"
fi

exit 0
