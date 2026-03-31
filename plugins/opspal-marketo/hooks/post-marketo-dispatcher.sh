#!/usr/bin/env bash
# post-marketo-dispatcher.sh
# Consolidated PostToolUse dispatcher for all Marketo MCP operations.
# Runs broad hooks (API limit, verification) on every call, then
# dispatches to specific hooks based on tool_name.

set -euo pipefail

if ! command -v jq &>/dev/null; then
    echo "[post-marketo-dispatcher] WARNING: jq not found — Marketo post-hooks disabled" >&2
    exit 0
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"
HOOK_INPUT="$(cat 2>/dev/null || true)"
TOOL_NAME="$(printf '%s' "$HOOK_INPUT" | jq -r '.tool_name // ""' 2>/dev/null || echo "")"

# Source error handler if available
if [[ -f "${SCRIPT_DIR}/lib/error-handler.sh" ]]; then
    # shellcheck source=/dev/null
    source "${SCRIPT_DIR}/lib/error-handler.sh"
fi

# ============================================================================
# Output helpers
# ============================================================================

emit_stderr() {
    local msg="$1"
    if [[ -n "$msg" ]]; then
        printf '%s\n' "$msg" >&2
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

    # PostToolUse child hooks emit informational context — print stdout
    if [[ -n "$stdout_content" ]]; then
        printf '%s\n' "$stdout_content"
    fi
}

# ============================================================================
# Fast-exit for non-marketo tools
# ============================================================================

if [[ -z "$TOOL_NAME" ]] || [[ "$TOOL_NAME" != *marketo* ]]; then
    exit 0
fi

# ============================================================================
# Broad hooks — run on every Marketo MCP call
# ============================================================================

# API limit tracking (lightweight, runs first)
run_child_hook bash "${SCRIPT_DIR}/api-limit-monitor.sh"

# Operation verification (skips read-only ops internally)
run_child_hook bash "${SCRIPT_DIR}/post-operation-verification.sh"

# ============================================================================
# Conditional hooks — dispatched by tool name
# ============================================================================

case "$TOOL_NAME" in
    # Auth-related tools only
    *authenticate*|*auth*)
        run_child_hook bash "${SCRIPT_DIR}/post-instance-authentication.sh"
        ;;
esac

case "$TOOL_NAME" in
    *campaign_create*|*campaign_clone*)
        run_child_hook bash "${SCRIPT_DIR}/post-campaign-create.sh"
        ;;
esac

case "$TOOL_NAME" in
    *bulk_lead_import_status*)
        run_child_hook bash "${SCRIPT_DIR}/post-bulk-import.sh"
        ;;
esac

case "$TOOL_NAME" in
    *bulk_lead_export_status*|*bulk_activity_export_status*|*bulk_program_member_export_status*)
        run_child_hook bash "${SCRIPT_DIR}/post-extract-complete.sh"
        ;;
esac

case "$TOOL_NAME" in
    *sync_*)
        run_child_hook bash "${SCRIPT_DIR}/sync-error-monitor.sh"
        ;;
esac

case "$TOOL_NAME" in
    *bulk_*)
        run_child_hook bash "${SCRIPT_DIR}/observability-quota-monitor.sh"
        ;;
esac

case "$TOOL_NAME" in
    *campaign_*|*lead_activities*)
        run_child_hook bash "${SCRIPT_DIR}/campaign-diagnostic-reminder.sh"
        ;;
esac
