#!/usr/bin/env bash
# pre-marketo-mutating-dispatcher.sh
# Consolidated PreToolUse dispatcher for Marketo MCP mutating operations.
# Dispatches to per-operation child hooks based on tool_name.
# Fast-exits for read-only tools (campaign_list, lead_query, etc.).

set -euo pipefail

# Hook debug support (all output to stderr)
if [[ "${HOOK_DEBUG:-}" == "true" ]]; then
    set -x
    echo "[hook-debug] $(basename "$0") starting (pid=$$)" >&2
fi

if ! command -v jq &>/dev/null; then
    echo "[pre-marketo-dispatcher] WARNING: jq not found — Marketo pre-hooks disabled" >&2
    exit 0
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"
HOOK_INPUT="$(cat 2>/dev/null || true)"
TOOL_NAME="$(printf '%s' "$HOOK_INPUT" | jq -r '.tool_name // ""' 2>/dev/null || echo "")"
LAST_JSON=""

# Source error handler if available
if [[ -f "${SCRIPT_DIR}/lib/error-handler.sh" ]]; then
    # shellcheck source=/dev/null
    source "${SCRIPT_DIR}/lib/error-handler.sh"
fi

# ============================================================================
# Output helpers (same protocol as SF dispatcher)
# ============================================================================

emit_stderr() {
    local msg="$1"
    if [[ -n "$msg" ]]; then
        printf '%s\n' "$msg" >&2
    fi
}

emit_pretool_deny() {
    local reason="$1"
    local context="$2"
    if [[ -n "$context" ]]; then
        if [[ -n "$reason" ]]; then
            reason="${reason}\n\n${context}"
        else
            reason="$context"
        fi
    fi
    jq -nc \
        --arg reason "$reason" \
        '{
            suppressOutput: true,
            hookSpecificOutput: {
                hookEventName: "PreToolUse",
                permissionDecision: "deny",
                permissionDecisionReason: $reason
            }
        }'
}

merge_hook_json() {
    local next_json="$1"
    if [[ -z "$LAST_JSON" ]]; then
        LAST_JSON="$next_json"
        return
    fi
    LAST_JSON="$(
        jq -nc \
            --argjson current "$LAST_JSON" \
            --argjson next "$next_json" \
            '$current * $next'
    )"
}

handle_child_output() {
    local exit_code="$1"
    local stdout_content="$2"
    if [[ -n "$stdout_content" ]] && printf '%s' "$stdout_content" | jq empty 2>/dev/null; then
        merge_hook_json "$stdout_content"
    fi
}

run_child_hook() {
    local stdout_file stderr_file exit_code stdout_content stderr_content
    stdout_file="$(mktemp)"
    stderr_file="$(mktemp)"

    if printf '%s' "$HOOK_INPUT" | env DISPATCHER_CONTEXT=1 "$@" >"$stdout_file" 2>"$stderr_file"; then
        exit_code=0
    else
        exit_code=$?
    fi

    stdout_content="$(cat "$stdout_file")"
    stderr_content="$(cat "$stderr_file")"
    rm -f "$stdout_file" "$stderr_file"

    emit_stderr "$stderr_content"
    handle_child_output "$exit_code" "$stdout_content"

    if [[ "$exit_code" -ne 0 ]]; then
        exit "$exit_code"
    fi
}

# ============================================================================
# Fast-exit for empty or non-marketo tools
# ============================================================================

if [[ -z "$TOOL_NAME" ]] || [[ "$TOOL_NAME" != *marketo* ]]; then
    exit 0
fi

# ============================================================================
# Dispatch by tool name to child hooks
# ============================================================================

case "$TOOL_NAME" in
    *campaign_activate*)
        run_child_hook bash "${SCRIPT_DIR}/pre-campaign-activation.sh"
        ;;
    *campaign_clone*)
        run_child_hook bash "${SCRIPT_DIR}/pre-campaign-clone.sh"
        ;;
    *campaign_delete*)
        run_child_hook bash "${SCRIPT_DIR}/pre-campaign-delete.sh"
        ;;
    *lead_create*|*lead_update*|*lead_delete*|*program_member_*)
        run_child_hook bash "${SCRIPT_DIR}/pre-bulk-operation.sh"
        ;;
    *lead_merge*)
        run_child_hook bash "${SCRIPT_DIR}/pre-lead-merge.sh"
        ;;
    *program_clone*)
        run_child_hook bash "${SCRIPT_DIR}/pre-orchestration.sh"
        ;;
    *bulk_*_export_create*|*bulk_lead_export_create*|*bulk_activity_export_create*|*bulk_program_member_export_create*)
        run_child_hook bash "${SCRIPT_DIR}/pre-bulk-export.sh"
        run_child_hook bash "${SCRIPT_DIR}/pre-observability-extract.sh"
        ;;
    *)
        # Read-only or unhandled tools — pass through
        ;;
esac

# ============================================================================
# Emit merged result
# ============================================================================

if [[ -n "$LAST_JSON" ]]; then
    printf '%s\n' "$LAST_JSON"
fi
