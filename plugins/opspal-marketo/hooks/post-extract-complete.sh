#!/usr/bin/env bash
# Post-Extract Complete Hook
#
# Triggered after a bulk export job completes successfully.
# Actions:
# - Log export metrics (size, duration, record count)
# - Update quota tracking
# - Trigger data normalization pipeline
# - Queue Claude analysis if thresholds met
#
# Exit codes:
# 0 = Success
# 1 = Error (logged but doesn't block)

set -euo pipefail
exec 3>&1 1>&2

# Configuration
ANALYSIS_THRESHOLD_RECORDS=1000  # Minimum records for auto-analysis
ANALYSIS_THRESHOLD_MB=5          # Minimum size for auto-analysis

# Get tool output
TOOL_OUTPUT="${CLAUDE_TOOL_OUTPUT:-}"
TOOL_NAME="${CLAUDE_TOOL_NAME:-}"

# Extract export details from tool output
parse_export_result() {
    local output="$1"

    EXPORT_ID=$(echo "$output" | grep -oP '"exportId"\s*:\s*"\K[^"]+' 2>/dev/null || echo "")
    STATUS=$(echo "$output" | grep -oP '"status"\s*:\s*"\K[^"]+' 2>/dev/null || echo "")
    FILE_SIZE=$(echo "$output" | grep -oP '"fileSize"\s*:\s*\K[0-9]+' 2>/dev/null || echo "0")
    RECORD_COUNT=$(echo "$output" | grep -oP '"numberOfRecords"\s*:\s*\K[0-9]+' 2>/dev/null || echo "0")
    FINISHED_AT=$(echo "$output" | grep -oP '"finishedAt"\s*:\s*"\K[^"]+' 2>/dev/null || echo "")
}

# Update quota tracking file
update_quota_tracking() {
    local size_bytes="$1"
    local PORTAL="${MARKETO_INSTANCE:-default}"
    local STATE_DIR="${CLAUDE_PLUGIN_ROOT:-$HOME/.claude-plugins/opspal-marketo}/instances/${PORTAL}/observability/metrics"
    local STATE_FILE="${STATE_DIR}/quota-tracking.json"

    mkdir -p "$STATE_DIR"

    local TODAY=$(date -u +%Y-%m-%d)
    local SIZE_MB=$(echo "scale=2; $size_bytes / 1024 / 1024" | bc 2>/dev/null || echo "0")

    # Read existing state or initialize
    local CURRENT_USAGE=0
    local CURRENT_DATE=""

    if [ -f "$STATE_FILE" ]; then
        CURRENT_DATE=$(grep -oP '"date"\s*:\s*"\K[^"]+' "$STATE_FILE" 2>/dev/null || echo "")
        CURRENT_USAGE=$(grep -oP '"usedMB"\s*:\s*\K[0-9.]+' "$STATE_FILE" 2>/dev/null || echo "0")
    fi

    # Reset if new day
    if [ "$CURRENT_DATE" != "$TODAY" ]; then
        CURRENT_USAGE=0
    fi

    # Add new usage
    NEW_USAGE=$(echo "scale=2; $CURRENT_USAGE + $SIZE_MB" | bc 2>/dev/null || echo "$SIZE_MB")

    # Write updated state
    cat > "$STATE_FILE" << EOF
{
  "date": "${TODAY}",
  "usedMB": ${NEW_USAGE},
  "lastExportId": "${EXPORT_ID}",
  "lastExportSize": ${SIZE_MB},
  "lastUpdated": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

    echo "$NEW_USAGE"
}

# Log export to history
log_export() {
    local PORTAL="${MARKETO_INSTANCE:-default}"
    local LOG_DIR="${CLAUDE_PLUGIN_ROOT:-$HOME/.claude-plugins/opspal-marketo}/instances/${PORTAL}/observability/history"
    local LOG_FILE="${LOG_DIR}/export-log.jsonl"

    mkdir -p "$LOG_DIR"

    local SIZE_MB=$(echo "scale=2; $FILE_SIZE / 1024 / 1024" | bc 2>/dev/null || echo "0")

    # Append to log (JSON Lines format)
    cat >> "$LOG_FILE" << EOF
{"timestamp":"$(date -u +%Y-%m-%dT%H:%M:%SZ)","exportId":"${EXPORT_ID}","status":"${STATUS}","fileSize":${FILE_SIZE},"fileSizeMB":${SIZE_MB},"recordCount":${RECORD_COUNT},"toolName":"${TOOL_NAME}"}
EOF
}

# Check if analysis should be triggered
should_trigger_analysis() {
    local records="$1"
    local size_bytes="$2"

    local SIZE_MB=$(echo "scale=2; $size_bytes / 1024 / 1024" | bc 2>/dev/null || echo "0")

    if [ "$records" -ge "$ANALYSIS_THRESHOLD_RECORDS" ]; then
        return 0
    fi

    if [ "$(echo "$SIZE_MB >= $ANALYSIS_THRESHOLD_MB" | bc 2>/dev/null)" = "1" ]; then
        return 0
    fi

    return 1
}

# Main processing
main() {
    echo "=== Post-Extract Complete Hook ===" >&2

    # Parse the export result
    parse_export_result "$TOOL_OUTPUT"

    # Only process completed exports
    if [ "$STATUS" != "Completed" ]; then
        echo "Export status is '${STATUS}', not 'Completed' - skipping post-processing" >&2
        exit 0
    fi

    echo "Export completed: ${EXPORT_ID}" >&2
    echo "Records: ${RECORD_COUNT}" >&2
    echo "Size: ${FILE_SIZE} bytes ($(echo "scale=2; $FILE_SIZE / 1024 / 1024" | bc 2>/dev/null || echo "0") MB)" >&2

    # Update quota tracking
    NEW_USAGE=$(update_quota_tracking "$FILE_SIZE")
    echo "Daily quota usage: ${NEW_USAGE} MB / 500 MB" >&2

    # Log the export
    log_export
    echo "Logged to export history" >&2

    # Check if analysis should be triggered
    if should_trigger_analysis "$RECORD_COUNT" "$FILE_SIZE"; then
        echo "" >&2
        echo "Export meets analysis threshold - consider running /analyze-performance" >&2
    fi

    # Output summary
    cat << EOF
{
  "processed": true,
  "exportId": "${EXPORT_ID}",
  "status": "${STATUS}",
  "recordCount": ${RECORD_COUNT},
  "fileSize": ${FILE_SIZE},
  "quotaUsedMB": ${NEW_USAGE},
  "analysisRecommended": $(should_trigger_analysis "$RECORD_COUNT" "$FILE_SIZE" && echo "true" || echo "false")
}
EOF

    exit 0
}

main "$@"
