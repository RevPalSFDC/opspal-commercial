#!/usr/bin/env bash
#
# PermissionRequest Hook - Audit & Auto-Approve
#
# Purpose: Auto-approve read-only operations to reduce interruptions
#          during long-running assessments. Logs all permission requests
#          for audit trail.
#
# Auto-approve:
#   - Read, Glob, Grep, WebSearch, WebFetch
#   - Bash(sf data query*), Bash(ls *)
#   - All mcp__*_get_*, mcp__*_search_*, mcp__*_list_* operations
#
# Pass-through (user decides):
#   - Write, Edit, deploy operations
#   - MCP create/update/delete operations
#
# Output JSON: hookSpecificOutput.decision.behavior="allow" or nothing (pass-through)
#
# Timeout: 2000ms (fast path)
#
# Version: 1.0.0
# Created: 2026-02-06

set -euo pipefail

LOG_DIR="${HOME}/.claude/logs"
FALLBACK_LOG_DIR="${TMPDIR:-/tmp}/.claude/logs"
LOG_FILE="${LOG_DIR}/permission-audit.jsonl"

ensure_log_dir() {
    local dir="$1"
    mkdir -p "$dir" 2>/dev/null || return 1
    [ -w "$dir" ] || return 1
    return 0
}

if ! ensure_log_dir "$LOG_DIR"; then
    LOG_DIR="$FALLBACK_LOG_DIR"
    ensure_log_dir "$LOG_DIR" || true
fi
LOG_FILE="${LOG_DIR}/permission-audit.jsonl"

safe_append_log() {
    local line="$1"
    printf '%s\n' "$line" >> "$LOG_FILE" 2>/dev/null || true
}

# Read hook input from stdin
INPUT=$(cat 2>/dev/null || true)

# Default values for safety
TOOL_NAME=""
COMMAND=""
AGENT_NAME=""
DECISION="pass-through"
REASON="no auto-approval rule matched"

if command -v jq >/dev/null 2>&1 && [[ -n "$INPUT" ]] && echo "$INPUT" | jq -e . >/dev/null 2>&1; then
    TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // ""' 2>/dev/null || true)
    COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // ""' 2>/dev/null || true)
    AGENT_NAME=$(echo "$INPUT" | jq -r '.agent_type // .tool_input.subagent_type // ""' 2>/dev/null || true)
fi

if [[ -z "$TOOL_NAME" ]]; then
    TOOL_NAME="${CLAUDE_TOOL_NAME:-${HOOK_TOOL_NAME:-unknown}}"
fi
if [[ -z "$COMMAND" ]]; then
    COMMAND="${CLAUDE_TOOL_INPUT:-${HOOK_TOOL_INPUT:-}}"
fi
if [[ -z "$AGENT_NAME" ]]; then
    AGENT_NAME="${CLAUDE_AGENT_NAME:-${CLAUDE_TASK_SUBAGENT_TYPE:-unknown}}"
fi

TIMESTAMP=$(date -u '+%Y-%m-%dT%H:%M:%SZ')

# Determine auto-approve
case "$TOOL_NAME" in
    Read|Glob|Grep|WebSearch|WebFetch|LS|TaskList|TaskGet)
        DECISION="allow"
        REASON="read-only tool"
        ;;
    Bash)
        if echo "$COMMAND" | grep -qiE '^[[:space:]]*sf[[:space:]]+data[[:space:]]+query([[:space:]]|$)'; then
            DECISION="allow"
            REASON="safe sf data query read"
        elif echo "$COMMAND" | grep -qiE '^[[:space:]]*sf[[:space:]]+org[[:space:]]+(display|list)([[:space:]]|$)'; then
            DECISION="allow"
            REASON="safe sf org status read"
        elif echo "$COMMAND" | grep -qiE '^[[:space:]]*(ls|echo|cat|head|tail|wc|pwd)([[:space:]]|$)'; then
            DECISION="allow"
            REASON="safe shell read command"
        elif echo "$COMMAND" | grep -qiE '^[[:space:]]*git[[:space:]]+(log|status|diff|branch|show)([[:space:]]|$)'; then
            DECISION="allow"
            REASON="safe git read command"
        fi
        ;;
    mcp__*)
        # Auto-approve read-only MCP operations
        case "$TOOL_NAME" in
            *_get_*|*_list_*|*_search_*|*_describe*|*_query*|*_enumerate*|*_hydrate*|*_status*)
                DECISION="allow"
                REASON="read-only mcp operation"
                ;;
        esac
        ;;
esac

# Write audit log entry
LOG_LINE=$(printf '{"timestamp":"%s","tool":"%s","agent":"%s","command":"%s","decision":"%s","reason":"%s"}' \
    "$TIMESTAMP" \
    "${TOOL_NAME:-unknown}" \
    "${AGENT_NAME:-unknown}" \
    "${COMMAND:0:160}" \
    "$DECISION" \
    "$REASON")
safe_append_log "$LOG_LINE"

# Return decision
if [[ "$DECISION" == "allow" ]]; then
    jq -nc '{
      suppressOutput: true,
      hookSpecificOutput: {
        hookEventName: "PermissionRequest",
        decision: {
          behavior: "allow"
        }
      }
    }'
else
    printf '{}\n'
fi

exit 0
