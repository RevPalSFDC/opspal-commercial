#!/usr/bin/env bash
exec 3>&1 1>&2

#
# Pre-Attribute / Object Delete Hook - Attio Plugin
#
# Trigger:  PreToolUse
# Matcher:  mcp__attio__attributes_delete, mcp__attio__objects_delete
# Purpose:  Emit the strongest possible warning before schema-level deletions.
#           Deleting an attribute or object in Attio destroys ALL associated
#           data across ALL records — immediately and irreversibly.
#
# Behavior:
#   - Reads hook input JSON from stdin
#   - Determines whether this is an attribute delete or object delete
#   - Extracts the attribute/object name or slug for the warning message
#   - Always allows the operation (permissionDecision: allow)
#   - Emits a DESTRUCTIVE SCHEMA CHANGE warning as permissionDecisionReason
#
# Rationale:
#   Attio schema changes are among the most dangerous operations possible:
#   - Deleting an attribute removes that field's value from every record in
#     the workspace — thousands of data points gone instantly.
#   - Deleting an object removes the entire object type, all its records,
#     all its attributes, all list entries referencing it, and all associated
#     tasks, notes, and comments. There is no recovery.
#
# Output (fd 3):
#   { "hookSpecificOutput": { "hookEventName": "PreToolUse",
#                             "permissionDecision": "allow",
#                             "permissionDecisionReason": "🛑 DESTRUCTIVE SCHEMA CHANGE: ..." } }
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

emit_schema_warning() {
    local reason="$1"
    local context="${2:-}"

    if ! command -v jq >/dev/null 2>&1; then
        # Fallback without jq
        printf '{"suppressOutput":true,"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow","permissionDecisionReason":"DESTRUCTIVE SCHEMA CHANGE WARNING: This permanently destroys ALL associated data. This is irreversible."}}\n' >&3
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

# ── Determine operation type and extract identifiers ─────────────────────────
TOOL_NAME=""
SCHEMA_ENTITY_TYPE="attribute"
SCHEMA_ENTITY_NAME="unknown"
OBJECT_SLUG="unknown-object"

if [[ -n "$HOOK_INPUT" ]] && command -v jq >/dev/null 2>&1; then
    TOOL_NAME="$(printf '%s' "$HOOK_INPUT" | jq -r '.tool_name // empty' 2>/dev/null || true)"

    # Attribute delete: object_id + attribute_id (slug)
    OBJECT_SLUG="$(printf '%s' "$HOOK_INPUT" | jq -r '.tool_input.object_id // .tool_input.object // "unknown-object"' 2>/dev/null || echo 'unknown-object')"
    SCHEMA_ENTITY_NAME="$(printf '%s' "$HOOK_INPUT" | jq -r '.tool_input.attribute_id // .tool_input.attribute // .tool_input.object_id // .tool_input.object // "unknown"' 2>/dev/null || echo 'unknown')"

    # If tool name contains "objects_delete", this is an object deletion
    if printf '%s' "$TOOL_NAME" | grep -q 'objects_delete'; then
        SCHEMA_ENTITY_TYPE="object"
        SCHEMA_ENTITY_NAME="$(printf '%s' "$HOOK_INPUT" | jq -r '.tool_input.object_id // .tool_input.object // "unknown-object"' 2>/dev/null || echo 'unknown-object')"
    fi
elif [[ -n "$HOOK_INPUT" ]]; then
    # Fallback grep extraction
    TOOL_NAME="$(printf '%s' "$HOOK_INPUT" | grep -oP '"tool_name"\s*:\s*"\K[^"]+' 2>/dev/null || echo '')"
    SCHEMA_ENTITY_NAME="$(printf '%s' "$HOOK_INPUT" | grep -oP '"attribute_id"\s*:\s*"\K[^"]+' 2>/dev/null || \
                          printf '%s' "$HOOK_INPUT" | grep -oP '"object_id"\s*:\s*"\K[^"]+' 2>/dev/null || echo 'unknown')"
    if printf '%s' "$TOOL_NAME" | grep -q 'objects_delete'; then
        SCHEMA_ENTITY_TYPE="object"
    fi
fi

# ── Log the warning to stderr ─────────────────────────────────────────────────
echo "" >&2
echo "┌─────────────────────────────────────────────────────────────┐" >&2
echo "│  🛑  DESTRUCTIVE SCHEMA CHANGE — ATTIO PLUGIN               │" >&2
echo "└─────────────────────────────────────────────────────────────┘" >&2
if [[ "$SCHEMA_ENTITY_TYPE" == "object" ]]; then
    echo "  Operation:   DELETE OBJECT" >&2
    echo "  Object:      ${SCHEMA_ENTITY_NAME}" >&2
    echo "" >&2
    echo "  This will PERMANENTLY DESTROY:" >&2
    echo "    • All records of type '${SCHEMA_ENTITY_NAME}'" >&2
    echo "    • All attributes defined on this object" >&2
    echo "    • All list entries referencing these records" >&2
    echo "    • All tasks, notes, and comments on these records" >&2
    echo "    • All associated files and attachments" >&2
else
    echo "  Operation:   DELETE ATTRIBUTE" >&2
    echo "  Attribute:   ${SCHEMA_ENTITY_NAME}" >&2
    echo "  On Object:   ${OBJECT_SLUG}" >&2
    echo "" >&2
    echo "  This will PERMANENTLY DESTROY:" >&2
    echo "    • The attribute definition '${SCHEMA_ENTITY_NAME}'" >&2
    echo "    • ALL values for this attribute across ALL records" >&2
    echo "    • Any filter/view logic referencing this attribute" >&2
fi
echo "" >&2
echo "  ⚠️  Attio has NO recycle bin. This is IRREVERSIBLE." >&2
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >&2

# ── Emit advisory (always allow) ─────────────────────────────────────────────
if [[ "$SCHEMA_ENTITY_TYPE" == "object" ]]; then
    emit_schema_warning \
        "🛑 DESTRUCTIVE SCHEMA CHANGE: Deleting object [${SCHEMA_ENTITY_NAME}] will permanently destroy ALL records, ALL attribute values, ALL list entries, ALL tasks/notes/comments associated with this object type across ALL records. This is irreversible." \
        "Attio object deletion cannot be undone. Before proceeding: (1) Export all records of this type, (2) Confirm no downstream integrations depend on this object, (3) Verify no active workflows reference this object. Consider renaming the object to 'DEPRECATED_${SCHEMA_ENTITY_NAME}' and hiding it from views instead of deleting."
else
    emit_schema_warning \
        "🛑 DESTRUCTIVE SCHEMA CHANGE: Deleting attribute [${SCHEMA_ENTITY_NAME}] on object [${OBJECT_SLUG}] will permanently destroy all associated data across ALL records. This is irreversible." \
        "Attio attribute deletion removes the field definition and all its stored values across every record in the workspace. Before proceeding: (1) Export attribute values via bulk export, (2) Confirm no integrations or automations reference this field, (3) Check if any list views or filters use this attribute. Consider making the attribute hidden/inactive instead of deleting."
fi

exit 0
