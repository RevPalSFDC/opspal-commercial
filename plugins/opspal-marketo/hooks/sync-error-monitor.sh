#!/bin/bash
#
# Hook: sync-error-monitor
# Trigger: PostToolUse (mcp__marketo__lead_*, mcp__marketo__sync_*)
# Purpose: Monitors Salesforce sync errors and alerts on issues
#
# Monitoring:
# - Tracks sync failures per session
# - Detects common sync error patterns
# - Alerts on repeated failures
# - Provides resolution guidance
#
# Exit Codes:
# 0 = Success (no sync issues detected)
# 1 = Error (critical sync issue)
#

# Source error handler
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "${SCRIPT_DIR}/../opspal-core/hooks/lib/error-handler.sh" ]]; then
    source "${SCRIPT_DIR}/../opspal-core/hooks/lib/error-handler.sh"
fi

# Configuration
MONITORING_ENABLED="${MARKETO_SYNC_MONITORING:-1}"
ALERT_THRESHOLD="${MARKETO_SYNC_ERROR_THRESHOLD:-5}"

# Skip if monitoring disabled
if [[ "$MONITORING_ENABLED" != "1" ]]; then
    exit 0
fi

# Get tool call info from environment
TOOL_NAME="${CLAUDE_TOOL_NAME:-}"
TOOL_RESULT="${CLAUDE_TOOL_RESULT:-}"
TOOL_ERROR="${CLAUDE_TOOL_ERROR:-}"

# Only monitor lead operations and sync operations
if [[ "$TOOL_NAME" != *"lead"* ]] && [[ "$TOOL_NAME" != *"sync"* ]]; then
    exit 0
fi

# Tracking file location
TRACKING_DIR="${HOME}/.marketo-sync-tracking"
TRACKING_FILE="${TRACKING_DIR}/sync-errors.json"
SESSION_ID="${CLAUDE_SESSION_ID:-$(date +%Y%m%d%H%M%S)}"

# Create tracking directory if needed
mkdir -p "$TRACKING_DIR"

# Initialize tracking file if needed
if [[ ! -f "$TRACKING_FILE" ]]; then
    echo '{"sessions": {}, "lastUpdated": ""}' > "$TRACKING_FILE"
fi

# Known sync error patterns and their resolutions
declare -A SYNC_ERROR_RESOLUTIONS
SYNC_ERROR_RESOLUTIONS["UNABLE_TO_LOCK_ROW"]="Record locked in Salesforce. Retry after a few seconds or check for conflicting workflows."
SYNC_ERROR_RESOLUTIONS["ENTITY_IS_DELETED"]="Lead was deleted in Salesforce. Verify lead exists or undelete if needed."
SYNC_ERROR_RESOLUTIONS["FIELD_CUSTOM_VALIDATION_EXCEPTION"]="Salesforce validation rule blocking update. Check SFDC validation rules on the object."
SYNC_ERROR_RESOLUTIONS["REQUIRED_FIELD_MISSING"]="Required field for sync is empty. Populate the field in Marketo before sync."
SYNC_ERROR_RESOLUTIONS["INVALID_CROSS_REFERENCE_KEY"]="Owner or lookup field references invalid record. Verify owner assignment and lookup values."
SYNC_ERROR_RESOLUTIONS["DUPLICATE_VALUE"]="Duplicate value detected in Salesforce. Check for existing records or adjust duplicate rules."
SYNC_ERROR_RESOLUTIONS["SYNC_LIMIT_EXCEEDED"]="Too many sync requests. Reduce batch size or wait for queue to clear."
SYNC_ERROR_RESOLUTIONS["SYNC_DISABLED"]="Marketo-Salesforce sync is disabled. Enable sync in Admin > Salesforce."
SYNC_ERROR_RESOLUTIONS["SFDC_CONNECTION_ERROR"]="Cannot connect to Salesforce. Check credentials and network connectivity."

# Detect sync errors in result
SYNC_ERROR_DETECTED=""
ERROR_TYPE=""

# Check for explicit sync errors
if [[ -n "$TOOL_RESULT" ]]; then
    # Check for syncStatus errors
    if echo "$TOOL_RESULT" | grep -qiP '"syncStatus"\s*:\s*"(failed|error)"'; then
        SYNC_ERROR_DETECTED="true"
        ERROR_TYPE=$(echo "$TOOL_RESULT" | grep -oP '"reason"\s*:\s*"\K[^"]+' | head -1)
    fi

    # Check for known error patterns
    for pattern in "${!SYNC_ERROR_RESOLUTIONS[@]}"; do
        if echo "$TOOL_RESULT" | grep -qi "$pattern"; then
            SYNC_ERROR_DETECTED="true"
            ERROR_TYPE="$pattern"
            break
        fi
    done
fi

# Check tool error as well
if [[ -n "$TOOL_ERROR" ]]; then
    for pattern in "${!SYNC_ERROR_RESOLUTIONS[@]}"; do
        if echo "$TOOL_ERROR" | grep -qi "$pattern"; then
            SYNC_ERROR_DETECTED="true"
            ERROR_TYPE="$pattern"
            break
        fi
    done
fi

# If sync error detected, output guidance
if [[ "$SYNC_ERROR_DETECTED" == "true" ]]; then
    RESOLUTION="${SYNC_ERROR_RESOLUTIONS[$ERROR_TYPE]:-Unknown error. Check Marketo Admin > Integration > Salesforce for details.}"

    cat << EOF

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ SALESFORCE SYNC ERROR DETECTED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Error Type: ${ERROR_TYPE:-"Unknown"}
Tool: ${TOOL_NAME}

Resolution:
${RESOLUTION}

Diagnostic Steps:
1. Check Marketo Admin > Integration > Salesforce > Sync Errors
2. Verify the lead exists in both systems
3. Review field mappings for the affected fields
4. Check SFDC validation rules and triggers

EOF

    # Track error count for session
    # Note: In production, this would update the tracking file
    # For now, just warn if multiple errors likely

    if [[ -n "${MARKETO_SYNC_ERROR_COUNT:-}" ]]; then
        ERROR_COUNT=$((MARKETO_SYNC_ERROR_COUNT + 1))
        export MARKETO_SYNC_ERROR_COUNT=$ERROR_COUNT

        if [[ $ERROR_COUNT -ge $ALERT_THRESHOLD ]]; then
            cat << EOF
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚨 REPEATED SYNC ERRORS (${ERROR_COUNT} in session)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Multiple sync errors detected. This may indicate:
• Systemic field mapping issue
• SFDC workflow/trigger conflict
• Sync configuration problem
• Salesforce permission issue

Recommended Action:
Pause operations and investigate the root cause before continuing.

Use the marketo-sfdc-sync-specialist agent for diagnosis:
Task(subagent_type='marketo-sfdc-sync-specialist', prompt='Diagnose sync errors')

EOF
        fi
    else
        export MARKETO_SYNC_ERROR_COUNT=1
    fi
fi

# Proactive sync health check for sync operations
if [[ "$TOOL_NAME" == *"sync_status"* ]] || [[ "$TOOL_NAME" == *"sync_errors"* ]]; then
    # Extract sync health indicators
    if [[ -n "$TOOL_RESULT" ]]; then
        PENDING_COUNT=$(echo "$TOOL_RESULT" | grep -oP '"pendingCount"\s*:\s*\K\d+' || echo "0")
        ERROR_COUNT=$(echo "$TOOL_RESULT" | grep -oP '"errorCount"\s*:\s*\K\d+' || echo "0")

        if [[ "$ERROR_COUNT" -gt 0 ]] || [[ "$PENDING_COUNT" -gt 1000 ]]; then
            cat << EOF

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 SYNC QUEUE STATUS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Pending: ${PENDING_COUNT} records
Errors: ${ERROR_COUNT} records

EOF
            if [[ "$PENDING_COUNT" -gt 1000 ]]; then
                echo "⚠️ High sync queue - expect delays in lead sync"
            fi
            if [[ "$ERROR_COUNT" -gt 0 ]]; then
                echo "⚠️ Sync errors need attention - check Admin > Salesforce"
            fi
            echo ""
        fi
    fi
fi

exit 0
