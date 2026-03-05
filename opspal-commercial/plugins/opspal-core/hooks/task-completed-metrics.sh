#!/bin/bash
#
# TaskCompleted Hook - Agent Performance Metrics
#
# Purpose: Capture agent completion metrics for adaptive routing.
#          Fires on actual task completion (not planning calls), providing
#          cleaner signal than PostToolUse("Task").
#
# Input (from Claude Code TaskCompleted event):
#   CLAUDE_AGENT_NAME        - Agent that completed
#   CLAUDE_TASK_DURATION_MS  - Execution time in ms
#   CLAUDE_TASK_TOKEN_COUNT  - Tokens used
#   CLAUDE_TASK_TOOL_USES    - Number of tool invocations
#   CLAUDE_TASK_SUCCESS      - Whether agent succeeded
#   CLAUDE_TASK_SUBAGENT_TYPE - Full agent identifier
#
# Timeout: 5000ms
# Async: false
#
# Version: 1.0.0
# Created: 2026-02-06

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

LOG_DIR="${HOME}/.claude/logs"
LOG_FILE="${LOG_DIR}/task-completions.jsonl"
ROUTING_ENGINE="${PLUGIN_ROOT}/scripts/lib/adaptive-routing-engine.js"
ROUTING_METRICS="${PLUGIN_ROOT}/scripts/lib/routing-metrics.js"

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
LOG_FILE="${LOG_DIR}/task-completions.jsonl"

HOOK_INPUT=$(cat 2>/dev/null || true)

AGENT_NAME=""
DURATION=""
TOKENS=""
TOOL_USES=""
SUCCESS=""

if command -v jq &>/dev/null && [[ -n "$HOOK_INPUT" ]] && echo "$HOOK_INPUT" | jq -e . >/dev/null 2>&1; then
    # v2.1.69+: agent_type and agent_id are standardized fields
    AGENT_NAME=$(echo "$HOOK_INPUT" | jq -r '.agent_type // .subagent_type // empty' 2>/dev/null || true)
    AGENT_UUID=$(echo "$HOOK_INPUT" | jq -r '.agent_id // empty' 2>/dev/null || true)
    DURATION=$(echo "$HOOK_INPUT" | jq -r '.duration_ms // 0' 2>/dev/null || echo "0")
    TOKENS=$(echo "$HOOK_INPUT" | jq -r '.token_count // 0' 2>/dev/null || echo "0")
    TOOL_USES=$(echo "$HOOK_INPUT" | jq -r '.tool_uses // 0' 2>/dev/null || echo "0")
    SUCCESS=$(echo "$HOOK_INPUT" | jq -r '.success // true' 2>/dev/null || echo "true")
fi

# Extract metrics from environment as fallback
AGENT_UUID="${AGENT_UUID:-}"
AGENT_NAME="${AGENT_NAME:-${CLAUDE_TASK_SUBAGENT_TYPE:-${CLAUDE_AGENT_NAME:-unknown}}}"
DURATION="${DURATION:-${CLAUDE_TASK_DURATION_MS:-0}}"
TOKENS="${TOKENS:-${CLAUDE_TASK_TOKEN_COUNT:-0}}"
TOOL_USES="${TOOL_USES:-${CLAUDE_TASK_TOOL_USES:-0}}"
SUCCESS="${SUCCESS:-${CLAUDE_TASK_SUCCESS:-true}}"

# Skip if no agent identified
if [[ "$AGENT_NAME" == "unknown" ]]; then
    exit 0
fi

# Log completion to JSONL
TIMESTAMP=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
if ! cat >> "$LOG_FILE" <<EOF
{"timestamp":"${TIMESTAMP}","agent":"${AGENT_NAME}","agent_id":"${AGENT_UUID}","duration_ms":${DURATION},"token_count":${TOKENS},"tool_uses":${TOOL_USES},"success":${SUCCESS}}
EOF
then
    FALLBACK_LOG_DIR="${TMPDIR:-/tmp}/.claude/logs"
    FALLBACK_LOG_FILE="${FALLBACK_LOG_DIR}/task-completions.jsonl"
    mkdir -p "$FALLBACK_LOG_DIR" 2>/dev/null || true
    cat >> "$FALLBACK_LOG_FILE" <<EOF || true
{"timestamp":"${TIMESTAMP}","agent":"${AGENT_NAME}","agent_id":"${AGENT_UUID}","duration_ms":${DURATION},"token_count":${TOKENS},"tool_uses":${TOOL_USES},"success":${SUCCESS}}
EOF
fi

# Emit structured routing metrics for feedback analysis
if [[ -f "$ROUTING_METRICS" ]] && command -v node &>/dev/null && command -v jq &>/dev/null; then
    EVENT_JSON=$(jq -n \
      --arg agent "$AGENT_NAME" \
      --argjson success "$( [[ "$SUCCESS" == "true" ]] && echo "true" || echo "false" )" \
      --argjson duration_ms "${DURATION:-0}" \
      --argjson token_count "${TOKENS:-0}" \
      --argjson tool_uses "${TOOL_USES:-0}" \
      '{
        type: "agent_execution",
        output: {
          agent: (if $agent != "" then $agent else null end),
          success: $success
        },
        metrics: {
          durationMs: $duration_ms,
          tokenCount: $token_count,
          toolUses: $tool_uses
        },
        source: "task-completed-metrics"
      }' 2>/dev/null || echo '{}')
    (node "$ROUTING_METRICS" log "$EVENT_JSON" >/dev/null 2>&1 &)
fi

# Update adaptive routing engine if available
if [[ -f "$ROUTING_ENGINE" ]] && command -v node &> /dev/null; then
    # Derive task type from agent name
    TASK_TYPE=""
    case "$AGENT_NAME" in
        *"revops"*)       TASK_TYPE="revops_audit" ;;
        *"cpq"*)          TASK_TYPE="cpq_assessment" ;;
        *"automation"*)   TASK_TYPE="automation_audit" ;;
        *"report"*)       TASK_TYPE="report_creation" ;;
        *"permission"*)   TASK_TYPE="permission_management" ;;
        *"territory"*)    TASK_TYPE="territory_management" ;;
        *"data-op"*)      TASK_TYPE="data_operations" ;;
        *"deploy"*)       TASK_TYPE="deployment" ;;
        *"quality"*)      TASK_TYPE="quality_analysis" ;;
        *"hubspot"*)      TASK_TYPE="hubspot_operations" ;;
        *"marketo"*)      TASK_TYPE="marketo_operations" ;;
        *"diagram"*)      TASK_TYPE="diagram_generation" ;;
        *"reflection"*)   TASK_TYPE="reflection_processing" ;;
        *"planner"*)      TASK_TYPE="planning" ;;
        *"validator"*)    TASK_TYPE="validation" ;;
        *)                TASK_TYPE="general" ;;
    esac

    node "$ROUTING_ENGINE" record "$AGENT_NAME" "$TOKENS" "$DURATION" "$TOOL_USES" "$SUCCESS" 2>/dev/null || true
fi

exit 0
