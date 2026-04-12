#!/usr/bin/env bash
exec 3>&1 1>&2

#
# Pre-Entry Delete Hook - Attio Plugin
#
# Trigger:  PreToolUse
# Matcher:  mcp__attio__entries_delete
# Purpose:  Emit a strong permanent-delete warning before any Attio list entry
#           deletion. Attio has NO recycle bin — entry deletions are irreversible.
#
# Behavior:
#   - Reads hook input JSON from stdin (tool_input.list_id / list, entry_id)
#   - Extracts list identifier and entry ID for the warning message
#   - Always allows the operation (permissionDecision: allow)
#   - Emits a prominent PERMANENT DELETE warning as permissionDecisionReason
#
# Rationale:
#   List entries in Attio represent membership/stage data in a CRM pipeline or
#   list view. Removing an entry is permanent — the record still exists but its
#   list membership, stage history, and associated entry-level attributes are
#   destroyed with no recovery path.
#
# Output (fd 3):
#   { "hookSpecificOutput": { "hookEventName": "PreToolUse",
#                             "permissionDecision": "allow",
#                             "permissionDecisionReason": "⚠️ PERMANENT DELETE: ..." } }
#
# Exit Codes:
#   0 - Always exits 0
#
# Version: 1.0.0
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "${SCRIPT_DIR}/lib/error-handler.sh" ]]; then
    source "${SCRIPT_DIR}/lib/error-handler.sh"
    set_lenient_mode 2>/dev/null || true
fi

# ── Emit helpers ──────────────────────────────────────────────────────────────

emit_noop() {
    printf '{}\n' >&3
}

emit_warning() {
    local reason="$1"
    local context="${2:-}"

    if ! command -v jq >/dev/null 2>&1; then
        # Fallback: emit plain JSON without jq
        printf '{"suppressOutput":true,"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow","permissionDecisionReason":"PERMANENT DELETE WARNING: Attio has no recycle bin. This entry deletion cannot be undone."}}\n' >&3
        return 0
    fi

    jq -nc \
        --arg reason "$reason" \
        --arg context "$context" \
        '{
          suppressOutput: true,
          hookSpecificOutput: {
            hookEventName: "PreToolUse",
            permissionDecision: "allow",
            permissionDecisionReason: $reason,
            additionalContext: $context
          }
        }' >&3
}

# ── Read stdin ────────────────────────────────────────────────────────────────
HOOK_INPUT=""
if [[ ! -t 0 ]]; then
    HOOK_INPUT="$(cat 2>/dev/null || true)"
fi

# ── Extract list and entry_id ─────────────────────────────────────────────────
LIST_ID="unknown-list"
ENTRY_ID="unknown-entry"

if [[ -n "$HOOK_INPUT" ]] && command -v jq >/dev/null 2>&1; then
    # Attio MCP tool uses list_id (slug) and entry_id
    LIST_ID="$(printf '%s' "$HOOK_INPUT" | jq -r '.tool_input.list_id // .tool_input.list // "unknown-list"' 2>/dev/null || echo 'unknown-list')"
    ENTRY_ID="$(printf '%s' "$HOOK_INPUT" | jq -r '.tool_input.entry_id // "unknown-entry"' 2>/dev/null || echo 'unknown-entry')"
elif [[ -n "$HOOK_INPUT" ]]; then
    # Fallback grep extraction without jq
    LIST_ID="$(printf '%s' "$HOOK_INPUT" | grep -oP '"list_id"\s*:\s*"\K[^"]+' 2>/dev/null || echo 'unknown-list')"
    ENTRY_ID="$(printf '%s' "$HOOK_INPUT" | grep -oP '"entry_id"\s*:\s*"\K[^"]+' 2>/dev/null || echo 'unknown-entry')"
fi

# ── Log the warning to stderr ─────────────────────────────────────────────────
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >&2
echo "⚠️  PRE-ENTRY DELETE — PERMANENT OPERATION" >&2
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >&2
echo "  List:     ${LIST_ID}" >&2
echo "  Entry ID: ${ENTRY_ID}" >&2
echo "" >&2
echo "  Attio has NO recycle bin. This list entry will be permanently" >&2
echo "  removed, including its stage history and entry-level attributes." >&2
echo "  The parent record is not deleted, but the entry cannot be recovered." >&2
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >&2

# ── Emit advisory (always allow) ─────────────────────────────────────────────
emit_warning \
    "⚠️ PERMANENT DELETE: Entry [${ENTRY_ID}] will be permanently removed from list [${LIST_ID}]. This cannot be undone." \
    "Attio does not support entry restoration. Removing a list entry deletes its stage history and all entry-level attribute values for that record-list relationship. The underlying record remains intact. Consider updating the entry stage/status to 'Closed' or 'Inactive' instead of deleting."

exit 0
