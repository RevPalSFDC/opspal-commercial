#!/usr/bin/env bash

# =============================================================================
# Post-Reflect Alerter Hook
# =============================================================================
#
# Purpose: Check reflection JSON for P0 issues and send Slack alert
#
# Trigger: After /reflect command completes
#
# Environment Variables:
#   SLACK_WEBHOOK_URL - Slack webhook URL (required for alerts)
#   POST_REFLECT_ALERT_DISABLED - Set to "1" to disable alerting
#   POST_REFLECT_VERBOSE - Set to "1" for verbose output
#
# Exit codes:
#   0 - Success (or alert disabled/not needed)
#   0 - Always returns 0 to avoid blocking /reflect
# =============================================================================

set -euo pipefail

# =============================================================================
# Configuration
# =============================================================================

VERBOSE="${POST_REFLECT_VERBOSE:-0}"
DISABLED="${POST_REFLECT_ALERT_DISABLED:-0}"

# Skip if disabled
if [[ "$DISABLED" == "1" ]]; then
    exit 0
fi

# =============================================================================
# Functions
# =============================================================================

log_verbose() {
    if [[ "$VERBOSE" == "1" ]]; then
        echo "[post-reflect-alerter] $1" >&2
    fi
}

# Find most recent reflection file
find_latest_reflection() {
    local claude_dir="${HOME}/.claude"
    local project_claude_dir="./.claude"

    # Check project .claude first, then user .claude
    for dir in "$project_claude_dir" "$claude_dir"; do
        if [[ -d "$dir" ]]; then
            local latest
            latest=$(find "$dir" -maxdepth 1 -name "SESSION_REFLECTION_*.json" -type f 2>/dev/null | sort -r | head -n 1)
            if [[ -n "$latest" && -f "$latest" ]]; then
                echo "$latest"
                return 0
            fi
        fi
    done

    return 1
}

# Check if jq is available
check_dependencies() {
    if ! command -v jq &> /dev/null; then
        log_verbose "jq not found - skipping alert check"
        exit 0
    fi

    if ! command -v curl &> /dev/null; then
        log_verbose "curl not found - skipping alert"
        exit 0
    fi
}

# Load Slack webhook URL
load_webhook_url() {
    # Check environment first
    if [[ -n "${SLACK_WEBHOOK_URL:-}" ]]; then
        echo "$SLACK_WEBHOOK_URL"
        return 0
    fi

    # Try loading from .env files
    local env_paths=(
        "./.env"
        "./.env.local"
        "${HOME}/.claude/.env"
        "${HOME}/.env"
    )

    for env_file in "${env_paths[@]}"; do
        if [[ -f "$env_file" ]]; then
            local url
            url=$(grep -E "^SLACK_WEBHOOK_URL=" "$env_file" 2>/dev/null | head -n 1 | cut -d'=' -f2- | tr -d "\"'" | tr -d '[:space:]')
            if [[ -n "$url" ]]; then
                echo "$url"
                return 0
            fi
        fi
    done

    return 1
}

# Count P0 issues in reflection
count_p0_issues() {
    local reflection_file="$1"

    # Try issues array first, then issues_identified
    local count
    count=$(jq -r '(.issues // .issues_identified // []) | map(select(.priority == "P0")) | length' "$reflection_file" 2>/dev/null)

    if [[ -n "$count" && "$count" =~ ^[0-9]+$ ]]; then
        echo "$count"
    else
        echo "0"
    fi
}

# Extract alert data from reflection
extract_alert_data() {
    local reflection_file="$1"

    # Extract key fields
    local summary org session_end p0_count trace_ids

    summary=$(jq -r '.summary // "No summary"' "$reflection_file" 2>/dev/null | head -c 200)
    org=$(jq -r '.session_metadata.org // .org_name // "unknown"' "$reflection_file" 2>/dev/null)
    session_end=$(jq -r '.session_metadata.session_end // empty' "$reflection_file" 2>/dev/null)
    p0_count=$(count_p0_issues "$reflection_file")
    trace_ids=$(jq -r '.debugging_context.trace_ids[0] // empty' "$reflection_file" 2>/dev/null | head -c 16)

    # Output as JSON
    jq -n \
        --arg summary "$summary" \
        --arg org "$org" \
        --arg session_end "${session_end:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}" \
        --arg p0_count "$p0_count" \
        --arg trace_id "${trace_ids:-none}" \
        '{
            summary: $summary,
            org: $org,
            session_end: $session_end,
            p0_count: ($p0_count | tonumber),
            trace_id: $trace_id
        }'
}

# Send Slack alert
send_slack_alert() {
    local webhook_url="$1"
    local alert_data="$2"

    local summary org session_end p0_count trace_id
    summary=$(echo "$alert_data" | jq -r '.summary')
    org=$(echo "$alert_data" | jq -r '.org')
    session_end=$(echo "$alert_data" | jq -r '.session_end')
    p0_count=$(echo "$alert_data" | jq -r '.p0_count')
    trace_id=$(echo "$alert_data" | jq -r '.trace_id')

    local trace_info="No trace ID"
    if [[ "$trace_id" != "none" && -n "$trace_id" ]]; then
        trace_info="Trace: \`${trace_id}\`"
    fi

    # Build Slack payload
    local payload
    payload=$(jq -n \
        --arg summary "$summary" \
        --arg org "$org" \
        --arg session_end "$session_end" \
        --arg p0_count "$p0_count" \
        --arg trace_info "$trace_info" \
        '{
            attachments: [{
                color: "#dc3545",
                blocks: [
                    {
                        type: "header",
                        text: {
                            type: "plain_text",
                            text: "🚨 P0 Issue Detected in Reflection",
                            emoji: true
                        }
                    },
                    {
                        type: "section",
                        fields: [
                            {
                                type: "mrkdwn",
                                text: ("*Session:*\n" + $session_end)
                            },
                            {
                                type: "mrkdwn",
                                text: ("*Org:*\n" + $org)
                            }
                        ]
                    },
                    {
                        type: "section",
                        text: {
                            type: "mrkdwn",
                            text: ("*Summary:*\n" + $summary)
                        }
                    },
                    {
                        type: "section",
                        text: {
                            type: "mrkdwn",
                            text: ("*P0 Issues:* " + $p0_count)
                        }
                    },
                    {
                        type: "context",
                        elements: [{
                            type: "mrkdwn",
                            text: ($trace_info + " | Triggered by post-reflect hook")
                        }]
                    }
                ]
            }]
        }')

    # Send to Slack
    local response
    response=$(curl -s -o /dev/null -w "%{http_code}" \
        -X POST \
        -H "Content-Type: application/json" \
        -d "$payload" \
        "$webhook_url" 2>/dev/null || echo "000")

    if [[ "$response" == "200" ]]; then
        log_verbose "Slack alert sent successfully"
        return 0
    else
        log_verbose "Slack alert failed with status: $response"
        return 1
    fi
}

# =============================================================================
# Main
# =============================================================================

main() {
    check_dependencies

    # Find latest reflection
    local reflection_file
    reflection_file=$(find_latest_reflection) || {
        log_verbose "No reflection file found"
        exit 0
    }

    log_verbose "Found reflection: $reflection_file"

    # Count P0 issues
    local p0_count
    p0_count=$(count_p0_issues "$reflection_file")

    if [[ "$p0_count" -eq 0 ]]; then
        log_verbose "No P0 issues found - skipping alert"
        exit 0
    fi

    log_verbose "Found $p0_count P0 issue(s) - preparing alert"

    # Load webhook URL
    local webhook_url
    webhook_url=$(load_webhook_url) || {
        log_verbose "Slack webhook not configured"
        exit 0
    }

    # Extract alert data
    local alert_data
    alert_data=$(extract_alert_data "$reflection_file")

    # Send alert (non-blocking, best-effort)
    send_slack_alert "$webhook_url" "$alert_data" || true

    exit 0
}

# Run main
main "$@"
