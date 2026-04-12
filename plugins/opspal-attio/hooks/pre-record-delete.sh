#!/usr/bin/env bash
exec 3>&1 1>&2

#
# Pre-Record Delete Hook - Attio Plugin
#
# Trigger:  PreToolUse
# Matcher:  mcp__attio__records_delete
# Purpose:  Emit a strong permanent-delete warning before any Attio record
#           deletion. Attio has NO recycle bin — deletions are irreversible.
#
# Behavior:
#   - Reads hook input JSON from stdin (tool_input.object_id / object, record_id)
#   - Extracts object type and record ID for the warning message
#   - Always allows the operation (permissionDecision: allow)
#   - Emits a prominent PERMANENT DELETE warning as permissionDecisionReason
#
# Rationale:
#   Unlike Salesforce (recycle bin) or HubSpot (restore from trash), Attio
#   record deletions are immediate and permanent with no recovery path. Users
#   and agents must be explicitly warned before every delete call.
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
        printf '{"suppressOutput":true,"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow","permissionDecisionReason":"PERMANENT DELETE WARNING: Attio has no recycle bin. This deletion cannot be undone."}}\n' >&3
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

# ── Extract object and record_id ──────────────────────────────────────────────
OBJECT_TYPE="unknown-object"
RECORD_ID="unknown-record"

if [[ -n "$HOOK_INPUT" ]] && command -v jq >/dev/null 2>&1; then
    # Attio MCP tool uses object_id (slug) and record_id
    OBJECT_TYPE="$(printf '%s' "$HOOK_INPUT" | jq -r '.tool_input.object_id // .tool_input.object // "unknown-object"' 2>/dev/null || echo 'unknown-object')"
    RECORD_ID="$(printf '%s' "$HOOK_INPUT" | jq -r '.tool_input.record_id // "unknown-record"' 2>/dev/null || echo 'unknown-record')"
elif [[ -n "$HOOK_INPUT" ]]; then
    # Fallback grep extraction without jq
    OBJECT_TYPE="$(printf '%s' "$HOOK_INPUT" | grep -oP '"object_id"\s*:\s*"\K[^"]+' 2>/dev/null || echo 'unknown-object')"
    RECORD_ID="$(printf '%s' "$HOOK_INPUT" | grep -oP '"record_id"\s*:\s*"\K[^"]+' 2>/dev/null || echo 'unknown-record')"
fi

# ── Log the warning to stderr ─────────────────────────────────────────────────
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >&2
echo "⚠️  PRE-RECORD DELETE — PERMANENT OPERATION" >&2
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >&2
echo "  Object:    ${OBJECT_TYPE}" >&2
echo "  Record ID: ${RECORD_ID}" >&2
echo "" >&2
echo "  Attio has NO recycle bin. This record will be permanently" >&2
echo "  destroyed and CANNOT be recovered." >&2
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >&2

# ── Emit advisory (always allow) ─────────────────────────────────────────────
emit_warning \
    "⚠️ PERMANENT DELETE: Attio has no recycle bin. Record [${RECORD_ID}] on object [${OBJECT_TYPE}] will be permanently destroyed. This cannot be undone." \
    "Attio does not support soft-delete or record restoration. If this record contains critical data, export or archive it before deletion. Alternatives: update a status/stage attribute to mark it inactive instead of deleting."

exit 0
