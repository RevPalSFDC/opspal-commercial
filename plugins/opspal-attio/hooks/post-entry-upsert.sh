#!/usr/bin/env bash
exec 3>&1 1>&2

#
# Post-Entry Upsert Hook - Attio Plugin
#
# Trigger:  PostToolUse
# Matcher:  mcp__attio__entries_upsert, mcp__attio__entries_create
# Purpose:  Log pipeline stage entry creation/update for audit trail.
#
# Behavior:
#   - Reads hook input JSON from stdin (tool_name, tool_result)
#   - Extracts list_id and entry_id from the result
#   - Writes an audit event via emit-automation-event.js if available
#   - Emits additionalContext summarizing the entry operation and suggesting
#     /attio-pipeline-health to check stage distribution
#   - Gracefully handles missing scripts (skips event emission)
#
# Audit event shape (written to workspaces/{name}/events.jsonl):
#   { "event": "entry.created", "list": "...", "entry": "..." }
#
# Output (fd 3):
#   { "hookSpecificOutput": { "hookEventName": "PostToolUse",
#                             "additionalContext": "..." } }
#
# Exit Codes:
#   0 - Always exits 0
#
# Version: 1.0.0
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

if [[ -f "${SCRIPT_DIR}/lib/error-handler.sh" ]]; then
    source "${SCRIPT_DIR}/lib/error-handler.sh"
    set_lenient_mode 2>/dev/null || true
fi

# ── Emit helpers ──────────────────────────────────────────────────────────────

emit_noop() {
    printf '{}\n' >&3
}

emit_context() {
    local context="$1"

    if ! command -v jq >/dev/null 2>&1; then
        emit_noop
        return 0
    fi

    jq -nc \
        --arg context "$context" \
        '{
          hookSpecificOutput: {
            hookEventName: "PostToolUse",
            additionalContext: $context
          }
        }' >&3
}

# ── Read stdin ────────────────────────────────────────────────────────────────
HOOK_INPUT=""
if [[ ! -t 0 ]]; then
    HOOK_INPUT="$(cat 2>/dev/null || true)"
fi

if [[ -z "$HOOK_INPUT" ]]; then
    emit_noop
    exit 0
fi

# ── Extract tool_name and tool_result ─────────────────────────────────────────
TOOL_NAME=""
TOOL_RESULT=""

if command -v jq >/dev/null 2>&1; then
    TOOL_NAME="$(printf '%s' "$HOOK_INPUT" | jq -r '.tool_name // ""' 2>/dev/null || true)"
    TOOL_RESULT="$(printf '%s' "$HOOK_INPUT" | jq -r '.tool_result // .result // empty' 2>/dev/null || true)"

    # If tool_result is a JSON string (escaped), parse it
    if printf '%s' "$TOOL_RESULT" | grep -q '^\s*"'; then
        TOOL_RESULT="$(printf '%s' "$TOOL_RESULT" | jq -r '.' 2>/dev/null || echo "$TOOL_RESULT")"
    fi
else
    TOOL_NAME="$(printf '%s' "$HOOK_INPUT" | grep -oP '"tool_name"\s*:\s*"\K[^"]+' 2>/dev/null | head -1 || true)"
fi

# ── Determine operation type ──────────────────────────────────────────────────
OPERATION="created"
if printf '%s' "$TOOL_NAME" | grep -qi 'upsert'; then
    OPERATION="upserted"
fi

# ── Extract list_id and entry_id from result ──────────────────────────────────
LIST_ID="unknown-list"
ENTRY_ID="unknown-entry"

if [[ -n "$TOOL_RESULT" ]] && command -v jq >/dev/null 2>&1; then
    # Try .data.id.list_id and .data.id.entry_id (Attio v2 entry response shape)
    LIST_ID="$(printf '%s' "$TOOL_RESULT" | jq -r '.data.id.list_id // .list_id // .data.list // "unknown-list"' 2>/dev/null || echo 'unknown-list')"
    ENTRY_ID="$(printf '%s' "$TOOL_RESULT" | jq -r '.data.id.entry_id // .entry_id // .data.id // "unknown-entry"' 2>/dev/null || echo 'unknown-entry')"
else
    # Fallback without jq
    LIST_ID="$(printf '%s' "$TOOL_RESULT" | grep -oP '"list_id"\s*:\s*"\K[^"]+' 2>/dev/null | head -1 || echo 'unknown-list')"
    ENTRY_ID="$(printf '%s' "$TOOL_RESULT" | grep -oP '"entry_id"\s*:\s*"\K[^"]+' 2>/dev/null | head -1 || echo 'unknown-entry')"
fi

# ── Log to stderr ─────────────────────────────────────────────────────────────
echo "✅ ATTIO ENTRY ${OPERATION^^}" >&2
echo "   List:  ${LIST_ID}" >&2
echo "   Entry: ${ENTRY_ID}" >&2

# ── Emit audit event via emit-automation-event.js (graceful) ─────────────────
EMIT_SCRIPT="${PLUGIN_ROOT}/scripts/lib/emit-automation-event.js"
if [[ -f "$EMIT_SCRIPT" ]] && command -v node >/dev/null 2>&1; then
    AUDIT_PAYLOAD="{\"list\":\"${LIST_ID}\",\"entry\":\"${ENTRY_ID}\"}"
    node "$EMIT_SCRIPT" "entry.${OPERATION}" "$AUDIT_PAYLOAD" 2>/dev/null || true
fi

# ── Emit additionalContext ────────────────────────────────────────────────────
CONTEXT_MSG="Entry [${ENTRY_ID}] ${OPERATION} in list [${LIST_ID}]. Audit event written to workspace events log. Use /attio-pipeline-health to check stage distribution and identify bottlenecks in this pipeline."

emit_context "$CONTEXT_MSG"
exit 0
