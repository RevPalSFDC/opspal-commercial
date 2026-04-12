#!/usr/bin/env bash
exec 3>&1 1>&2

#
# Pre-Schema Mutate Hook - Attio Plugin
#
# Trigger:  PreToolUse
# Matcher:  mcp__attio__attributes_create, mcp__attio__attributes_update,
#           mcp__attio__attributes_delete, mcp__attio__objects_create,
#           mcp__attio__objects_update, mcp__attio__objects_delete
# Purpose:  Warn before schema mutations since they impact all records and
#           all workspace members immediately.
#
# Behavior:
#   - Reads hook input JSON from stdin
#   - Dispatches advisory based on operation type:
#       CREATE:  Naming-convention advisory (snake_case api_slug)
#       UPDATE:  Warning that attribute type is immutable; type changes are not supported
#       DELETE:  Strong warning about permanent data loss (handled in depth by
#                pre-attribute-delete.sh; this hook adds the unified schema banner)
#   - Always allows (permissionDecision: allow)
#
# Advisory Rationale:
#   - api_slug once set is used by all integrations and cannot be renamed without
#     breaking downstream consumers.
#   - Attribute type is immutable in Attio — the only way to change it is delete
#     and recreate, which destroys all values for that attribute across all records.
#   - Object/attribute schema changes affect all workspace members immediately;
#     there is no draft or staging mode.
#
# Output (fd 3):
#   { "hookSpecificOutput": { "hookEventName": "PreToolUse",
#                             "permissionDecision": "allow",
#                             "permissionDecisionReason": "...",
#                             "additionalContext": "..." } }
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

emit_advisory() {
    local reason="$1"
    local context="${2:-}"

    if ! command -v jq >/dev/null 2>&1; then
        printf '{"suppressOutput":true,"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow","permissionDecisionReason":"ATTIO SCHEMA MUTATION ADVISORY: Schema changes affect all records and workspace members immediately."}}\n' >&3
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

if [[ -z "$HOOK_INPUT" ]]; then
    emit_noop
    exit 0
fi

# ── Parse tool name and operation category ────────────────────────────────────
TOOL_NAME=""
OPERATION=""    # create | update | delete
ENTITY=""       # attribute | object

if command -v jq >/dev/null 2>&1; then
    TOOL_NAME="$(printf '%s' "$HOOK_INPUT" | jq -r '.tool_name // empty' 2>/dev/null || true)"
else
    TOOL_NAME="$(printf '%s' "$HOOK_INPUT" | grep -oP '"tool_name"\s*:\s*"\K[^"]+' 2>/dev/null || echo '')"
fi

TOOL_NAME_LOWER="$(printf '%s' "$TOOL_NAME" | tr '[:upper:]' '[:lower:]')"

# Determine entity
if printf '%s' "$TOOL_NAME_LOWER" | grep -q 'attributes'; then
    ENTITY="attribute"
elif printf '%s' "$TOOL_NAME_LOWER" | grep -q 'objects'; then
    ENTITY="object"
else
    # Not a schema-mutation tool — noop
    emit_noop
    exit 0
fi

# Determine operation
if printf '%s' "$TOOL_NAME_LOWER" | grep -q 'create'; then
    OPERATION="create"
elif printf '%s' "$TOOL_NAME_LOWER" | grep -q 'update'; then
    OPERATION="update"
elif printf '%s' "$TOOL_NAME_LOWER" | grep -q 'delete'; then
    OPERATION="delete"
else
    emit_noop
    exit 0
fi

# ── Extract identifiers for context ──────────────────────────────────────────
IDENTIFIER="unknown"
API_SLUG=""
ATTR_TYPE=""

if command -v jq >/dev/null 2>&1; then
    IDENTIFIER="$(printf '%s' "$HOOK_INPUT" | jq -r '.tool_input.identifier // .tool_input.object_id // .tool_input.attribute_id // .tool_input.object // "unknown"' 2>/dev/null || echo 'unknown')"
    API_SLUG="$(printf '%s' "$HOOK_INPUT" | jq -r '.tool_input.api_slug // empty' 2>/dev/null || echo '')"
    ATTR_TYPE="$(printf '%s' "$HOOK_INPUT" | jq -r '.tool_input.type // empty' 2>/dev/null || echo '')"
fi

# ── Log to stderr ─────────────────────────────────────────────────────────────
echo "" >&2
echo "┌─────────────────────────────────────────────────────────────┐" >&2
echo "│  ⚠️   ATTIO SCHEMA MUTATION — ${ENTITY^^} ${OPERATION^^}           │" >&2
echo "└─────────────────────────────────────────────────────────────┘" >&2
echo "  Tool:       ${TOOL_NAME}" >&2
echo "  Entity:     ${ENTITY}" >&2
echo "  Operation:  ${OPERATION}" >&2
echo "  Identifier: ${IDENTIFIER}" >&2
if [[ -n "$API_SLUG" ]]; then
    echo "  API Slug:   ${API_SLUG}" >&2
fi
if [[ -n "$ATTR_TYPE" ]]; then
    echo "  Type:       ${ATTR_TYPE}" >&2
fi
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >&2

# ── Emit advisory based on operation type ─────────────────────────────────────
case "$OPERATION" in
    create)
        REASON="ATTIO SCHEMA ADVISORY [CREATE]: Creating ${ENTITY} [${IDENTIFIER}]."
        if [[ -n "$API_SLUG" ]]; then
            REASON="${REASON} api_slug='${API_SLUG}'."
        fi
        CONTEXT="Naming conventions for Attio schema: (1) api_slug must be snake_case (e.g., 'deal_value', 'close_date') — hyphens and spaces are not allowed. (2) api_slug is permanent and cannot be renamed after creation; all integrations and API consumers will use this slug. (3) The attribute will appear for ALL records on this object immediately after creation. (4) For custom objects, singular_noun and plural_noun control display names throughout the UI."
        if [[ "$ENTITY" == "object" ]]; then
            CONTEXT="Naming conventions for Attio custom objects: (1) api_slug must be snake_case and is permanent — cannot be renamed after creation. (2) singular_noun and plural_noun are used throughout the UI. (3) The new object will be visible to all workspace members immediately. (4) Standard system objects (people, companies, deals) cannot be re-created if deleted."
        fi
        emit_advisory "$REASON" "$CONTEXT"
        ;;
    update)
        REASON="ATTIO SCHEMA ADVISORY [UPDATE]: Updating ${ENTITY} [${IDENTIFIER}]."
        if [[ "$ENTITY" == "attribute" ]]; then
            REASON="${REASON} IMPORTANT: Attribute type is IMMUTABLE in Attio. If you are attempting to change the type (e.g., text → number), this is not supported. The only path is to delete the attribute (destroying all stored values) and recreate it with the new type."
            CONTEXT="Attio attribute update rules: (1) Type changes are not supported — attribute type cannot be modified after creation. (2) api_slug cannot be renamed after creation. (3) You CAN update: title (display name), description, is_required, is_multiselect, is_archived. (4) Setting is_archived=true hides the attribute from the UI but preserves all data. (5) Changing is_required to true will not backfill existing records — new records will be required to have a value."
        else
            REASON="${REASON} Object schema update — note that api_slug is immutable."
            CONTEXT="Attio object update rules: (1) api_slug cannot be changed after creation. (2) You CAN update: singular_noun, plural_noun, description. (3) Changes affect all workspace members immediately."
        fi
        emit_advisory "$REASON" "$CONTEXT"
        ;;
    delete)
        if [[ "$ENTITY" == "attribute" ]]; then
            REASON="🛑 DESTRUCTIVE SCHEMA CHANGE [DELETE ATTRIBUTE]: Deleting attribute [${IDENTIFIER}] will permanently remove the attribute definition and ALL stored values for this attribute across ALL records in the workspace. This is irreversible — Attio has no recycle bin."
            CONTEXT="Before deleting an Attio attribute: (1) Export all attribute values via bulk export or records_query. (2) Confirm no integrations, automations, or filters reference this attribute slug. (3) Consider setting is_archived=true to hide the attribute without destroying data. (4) After deletion, the attribute slug cannot be reused for a different attribute type."
        else
            REASON="🛑 DESTRUCTIVE SCHEMA CHANGE [DELETE OBJECT]: Deleting object [${IDENTIFIER}] will permanently destroy ALL records of this type, ALL attributes on this object, ALL list entries referencing these records, and ALL tasks, notes, and comments associated with them. This is irreversible."
            CONTEXT="Before deleting an Attio object: (1) Export all records of this type. (2) Confirm no downstream integrations or automations depend on this object. (3) Verify no active workflows reference this object. (4) Consider renaming the object to 'DEPRECATED_${IDENTIFIER}' and archiving its attributes instead of deleting. (5) Standard system objects (people, companies) cannot be deleted."
        fi
        emit_advisory "$REASON" "$CONTEXT"
        ;;
    *)
        emit_noop
        ;;
esac

exit 0
