#!/usr/bin/env bash
exec 3>&1 1>&2

#
# Post-Meeting Create Hook - Attio Plugin
#
# Trigger:  PostToolUse
# Matcher:  mcp__attio__meetings_create
# Purpose:  After meeting creation, extract meeting_id and linked_records from
#           the tool result and surface next-step guidance for linking to deals,
#           creating follow-up tasks, and adding meeting notes.
#
# Behavior:
#   - Reads tool_result from stdin to extract meeting_id and linked_records
#   - Emits additionalContext suggesting: link to deal via /attio-pipeline-health,
#     create a follow-up task, and add meeting notes
#   - Logs an automation event via emit-automation-event.js if available
#   - Always exits 0 — never blocks
#
# Output (fd 3):
#   { "hookSpecificOutput": { "hookEventName": "PostToolUse",
#                             "additionalContext": "..." } }
#   or {} on parse failure
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

# ── Extract meeting_id and linked_records from tool_result ────────────────────
MEETING_ID=""
LINKED_COUNT=0

if command -v jq >/dev/null 2>&1; then
    # tool_result may be nested under .tool_result or .result depending on hook version
    MEETING_ID="$(printf '%s' "$HOOK_INPUT" | \
        jq -r '(.tool_result.id // .tool_result.meeting_id // .result.id // .result.meeting_id // empty)' \
        2>/dev/null || true)"

    LINKED_COUNT="$(printf '%s' "$HOOK_INPUT" | \
        jq -r '([(.tool_result.linked_records // .result.linked_records // []) | length] | first // 0)' \
        2>/dev/null || echo 0)"
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >&2
echo "📅 ATTIO MEETING CREATED — Post-Meeting Hook" >&2
if [[ -n "$MEETING_ID" ]]; then
    echo "   Meeting ID: ${MEETING_ID}" >&2
fi
echo "   Linked records: ${LINKED_COUNT}" >&2
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >&2

# ── Emit automation event (if available) ─────────────────────────────────────
EMIT_SCRIPT="${PLUGIN_ROOT}/scripts/lib/emit-automation-event.js"

if [[ -f "$EMIT_SCRIPT" ]] && command -v node >/dev/null 2>&1; then
    node "$EMIT_SCRIPT" \
        --event "meeting_created" \
        --meeting-id "${MEETING_ID:-unknown}" \
        --linked-records "${LINKED_COUNT}" \
        --timestamp "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
        2>/dev/null || true
fi

# ── Build advisory context ────────────────────────────────────────────────────
MEETING_REF="${MEETING_ID:-[meeting]}"

CONTEXT_MSG="Meeting created successfully."

if [[ -n "$MEETING_ID" ]]; then
    CONTEXT_MSG="${CONTEXT_MSG} Meeting ID: ${MEETING_ID}."
fi

CONTEXT_MSG="${CONTEXT_MSG} Recommended next steps: (1) Link to a deal entry — run /attio-pipeline-health to review deal pipeline and associate this meeting with the relevant opportunity. (2) Create a follow-up task — run: /attio-tasks create 'Follow up on ${MEETING_REF}' to ensure action items are tracked and assigned. (3) Add meeting notes — run: /attio-notes-add [object] [record-id] to capture key discussion points, decisions, and outcomes as a searchable note on the linked record. (4) If this meeting is linked to people or companies, consider updating their engagement signals — meeting frequency is a strong deal health indicator."

if [[ "$LINKED_COUNT" -eq 0 ]]; then
    CONTEXT_MSG="${CONTEXT_MSG} NOTE: No linked_records were detected in the creation payload. Consider linking this meeting to people and/or company records via the meetings API to ensure it appears in contact and account timelines."
fi

emit_context "$CONTEXT_MSG"
exit 0
