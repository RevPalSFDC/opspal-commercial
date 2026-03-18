#!/bin/bash
#
# SubagentStop Hook - Error Capture & Debugging
#
# Purpose: Capture transcript paths for failed agents to aid debugging.
#          Logs error patterns to the reflection pipeline for continuous
#          improvement.
#
# Input:
#   CLAUDE_AGENT_NAME         - Agent that stopped
#   CLAUDE_TASK_SUBAGENT_TYPE - Full agent identifier
#   CLAUDE_TASK_SUCCESS       - Whether agent succeeded
#   CLAUDE_TASK_ERROR         - Error message if failed
#
# Timeout: 3000ms
# Async: true
#
# Version: 1.0.0
# Created: 2026-02-06

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ROUTING_METRICS="${PLUGIN_ROOT}/scripts/lib/routing-metrics.js"

LOG_DIR="${HOME}/.claude/logs"
LOG_FILE="${LOG_DIR}/subagent-stops.jsonl"

ensure_writable_log_dir() {
    local dir="$1"
    local probe_file

    mkdir -p "$dir" 2>/dev/null || return 1
    probe_file="${dir}/.write-test.$$"
    : > "$probe_file" 2>/dev/null || return 1
    rm -f "$probe_file" 2>/dev/null || true
    return 0
}

if ! ensure_writable_log_dir "$LOG_DIR"; then
    LOG_DIR="${TMPDIR:-/tmp}/.claude/logs"
    ensure_writable_log_dir "$LOG_DIR" || true
fi
LOG_FILE="${LOG_DIR}/subagent-stops.jsonl"

HOOK_INPUT=$(cat 2>/dev/null || true)

AGENT_NAME=""
SUCCESS=""
ERROR_MSG=""
DURATION_MS="0"

if command -v jq &>/dev/null && [[ -n "$HOOK_INPUT" ]] && echo "$HOOK_INPUT" | jq -e . >/dev/null 2>&1; then
    # v2.1.69+: agent_type and agent_id are now standardized fields
    AGENT_NAME=$(echo "$HOOK_INPUT" | jq -r '.agent_type // .subagent_type // .agent_name // empty' 2>/dev/null || true)
    AGENT_ID=$(echo "$HOOK_INPUT" | jq -r '.agent_id // empty' 2>/dev/null || true)
    SUCCESS=$(echo "$HOOK_INPUT" | jq -r '.success // .task_success // .result.success // empty' 2>/dev/null || true)
    ERROR_MSG=$(echo "$HOOK_INPUT" | jq -r '.error // .error_message // .reason // .stop_reason // empty' 2>/dev/null || true)
    DURATION_MS=$(echo "$HOOK_INPUT" | jq -r '.duration_ms // .task_duration_ms // 0' 2>/dev/null || echo "0")
fi

AGENT_NAME="${AGENT_NAME:-${CLAUDE_TASK_SUBAGENT_TYPE:-${CLAUDE_AGENT_NAME:-unknown}}}"
SUCCESS="${SUCCESS:-${CLAUDE_TASK_SUCCESS:-true}}"
ERROR_MSG="${ERROR_MSG:-${CLAUDE_TASK_ERROR:-}}"
DURATION_MS="${DURATION_MS:-${CLAUDE_TASK_DURATION_MS:-0}}"

# Skip successful completions (handled by TaskCompleted hook)
if [[ "$SUCCESS" == "true" ]]; then
    exit 0
fi

TIMESTAMP=$(date -u '+%Y-%m-%dT%H:%M:%SZ')

# Log failed agent stop
if ! cat >> "$LOG_FILE" <<EOF
{"timestamp":"${TIMESTAMP}","agent":"${AGENT_NAME}","agent_id":"${AGENT_ID:-}","success":false,"error":"${ERROR_MSG:0:500}"}
EOF
then
    FALLBACK_LOG_DIR="${TMPDIR:-/tmp}/.claude/logs"
    FALLBACK_LOG_FILE="${FALLBACK_LOG_DIR}/subagent-stops.jsonl"
    mkdir -p "$FALLBACK_LOG_DIR" 2>/dev/null || true
    cat >> "$FALLBACK_LOG_FILE" <<EOF || true
{"timestamp":"${TIMESTAMP}","agent":"${AGENT_NAME}","agent_id":"${AGENT_ID:-}","success":false,"error":"${ERROR_MSG:0:500}"}
EOF
fi

# Emit routing metrics for failed subagent execution
if [[ -f "$ROUTING_METRICS" ]] && command -v node &>/dev/null && command -v jq &>/dev/null; then
    EVENT_JSON=$(jq -n \
      --arg agent "$AGENT_NAME" \
      --arg err "${ERROR_MSG:0:500}" \
      --argjson duration_ms "${DURATION_MS:-0}" \
      '{
        type: "agent_execution",
        output: {
          agent: (if $agent != "" then $agent else null end),
          success: false,
          errorMessage: $err
        },
        metrics: {
          durationMs: $duration_ms
        },
        source: "subagent-stop-capture",
        error: {
          message: $err
        }
      }' 2>/dev/null || echo '{}')
    (node "$ROUTING_METRICS" log "$EVENT_JSON" >/dev/null 2>&1 &)
fi

# Check if this is a recurring failure pattern (3+ in last hour)
if command -v jq &> /dev/null && [[ -f "$LOG_FILE" ]]; then
    ONE_HOUR_AGO=$(date -u -d '1 hour ago' '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null || date -u -v-1H '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null || echo "")

    if [[ -n "$ONE_HOUR_AGO" ]]; then
        RECENT_FAILURES=$(tail -50 "$LOG_FILE" | jq -r --arg agent "$AGENT_NAME" --arg since "$ONE_HOUR_AGO" \
            'select(.agent == $agent and .timestamp >= $since)' 2>/dev/null | wc -l | tr -d ' ')

        if [[ "$RECENT_FAILURES" -ge 3 ]]; then
            echo "WARNING: Agent '$AGENT_NAME' has failed $RECENT_FAILURES times in the last hour. Consider investigating." >&2
        fi
    fi
fi

exit 0
