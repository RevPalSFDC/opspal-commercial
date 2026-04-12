#!/usr/bin/env bash
exec 3>&1 1>&2

#
# API Quota Monitor Hook - Attio Plugin
#
# Trigger:  PostToolUse
# Matcher:  mcp__attio__*
# Purpose:  Track Attio API call volume per second (reads and writes separately),
#           and emit advisory context when approaching rate limits.
#
# Attio API Rate Limits (as of 2026):
#   Reads:  50 requests/second
#   Writes: 15 requests/second
#
# Behavior:
#   - Determines whether the completed tool call was a read or write
#   - Appends a timestamped record to a per-second temp file
#   - Counts operations in the current second from the temp file
#   - If approaching limits (>= 70% reads, >= 60% writes), adds warning to
#     additionalContext in the PostToolUse hook output
#   - Always exits 0 — quota monitoring never blocks operations
#
# Write operations (all others are reads):
#   records_create, records_upsert, records_update, records_update_overwrite,
#   records_delete, entries_create, entries_upsert, entries_update,
#   entries_update_overwrite, entries_delete, notes_create, notes_delete,
#   tasks_create, tasks_update, tasks_delete, webhooks_create, webhooks_update,
#   webhooks_delete, attributes_create, attributes_update,
#   attributes_create_option, attributes_create_status, objects_create,
#   objects_update, objects_delete, comments_create, comments_delete,
#   files_upload, files_delete, files_create_folder
#
# Output (fd 3):
#   { "hookSpecificOutput": { "hookEventName": "PostToolUse",
#                             "additionalContext": "..." } }
#   or {} if within normal limits
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

# ── Configuration ─────────────────────────────────────────────────────────────
QUOTA_MONITORING_ENABLED="${ATTIO_QUOTA_MONITORING:-1}"
READ_LIMIT_PER_SEC=50
WRITE_LIMIT_PER_SEC=15
READ_WARN_PCT=70    # warn at 70% of read limit (35/sec)
WRITE_WARN_PCT=60   # warn at 60% of write limit (9/sec)

# ── Short-circuit if disabled ────────────────────────────────────────────────
if [[ "$QUOTA_MONITORING_ENABLED" != "1" ]]; then
    printf '{}\n' >&3
    exit 0
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

# ── Extract tool name ─────────────────────────────────────────────────────────
TOOL_NAME=""
if [[ -n "$HOOK_INPUT" ]] && command -v jq >/dev/null 2>&1; then
    TOOL_NAME="$(printf '%s' "$HOOK_INPUT" | jq -r '.tool_name // empty' 2>/dev/null || true)"
fi

# Fallback to environment variable
if [[ -z "$TOOL_NAME" ]]; then
    TOOL_NAME="${CLAUDE_TOOL_NAME:-}"
fi

# Skip if not an Attio tool
if ! printf '%s' "$TOOL_NAME" | grep -q 'attio'; then
    emit_noop
    exit 0
fi

# ── Classify as read or write ─────────────────────────────────────────────────
# Strip the mcp__attio__ prefix to get the bare operation name
OPERATION="$(printf '%s' "$TOOL_NAME" | sed 's/mcp__attio__//' | sed 's/^attio__//')"

# Write operations list
WRITE_OPERATIONS="records_create records_upsert records_update records_update_overwrite records_delete entries_create entries_upsert entries_update entries_update_overwrite entries_delete notes_create notes_delete tasks_create tasks_update tasks_delete webhooks_create webhooks_update webhooks_delete attributes_create attributes_update attributes_create_option attributes_create_status objects_create objects_update objects_delete comments_create comments_delete files_upload files_delete files_create_folder"

OP_TYPE="read"
for write_op in $WRITE_OPERATIONS; do
    if [[ "$OPERATION" == "$write_op" ]]; then
        OP_TYPE="write"
        break
    fi
done

# ── Tracking via temp file ────────────────────────────────────────────────────
CURRENT_SECOND="$(date +%s)"
TRACKING_DIR="${TMPDIR:-/tmp}/attio-quota-tracking"
mkdir -p "$TRACKING_DIR" 2>/dev/null || true

TRACKING_FILE="${TRACKING_DIR}/calls-${CURRENT_SECOND}.tsv"

# Append this call: timestamp, operation_type, tool_name
printf '%s\t%s\t%s\n' "$CURRENT_SECOND" "$OP_TYPE" "$TOOL_NAME" >> "$TRACKING_FILE" 2>/dev/null || true

# Clean up tracking files older than 10 seconds to avoid accumulation
find "$TRACKING_DIR" -name 'calls-*.tsv' -mmin +1 -delete 2>/dev/null || true

# ── Count operations in current second ───────────────────────────────────────
READS_THIS_SEC=0
WRITES_THIS_SEC=0

if [[ -f "$TRACKING_FILE" ]]; then
    READS_THIS_SEC="$(grep -c $'\tread\t' "$TRACKING_FILE" 2>/dev/null || echo 0)"
    WRITES_THIS_SEC="$(grep -c $'\twrite\t' "$TRACKING_FILE" 2>/dev/null || echo 0)"
fi

# ── Compute percentages ───────────────────────────────────────────────────────
READ_PCT=$(( (READS_THIS_SEC * 100) / READ_LIMIT_PER_SEC ))
WRITE_PCT=$(( (WRITES_THIS_SEC * 100) / WRITE_LIMIT_PER_SEC ))

log_info "Attio quota — reads: ${READS_THIS_SEC}/${READ_LIMIT_PER_SEC} (${READ_PCT}%), writes: ${WRITES_THIS_SEC}/${WRITE_LIMIT_PER_SEC} (${WRITE_PCT}%)" 2>/dev/null || true

# ── Emit advisory context if approaching limits ───────────────────────────────
WARNING_MSG=""

if [[ "$WRITE_PCT" -ge 100 ]]; then
    WARNING_MSG="🚨 ATTIO WRITE RATE LIMIT REACHED: ${WRITES_THIS_SEC}/${WRITE_LIMIT_PER_SEC} writes this second (${WRITE_PCT}%). Writes may be throttled or rejected. Wait 1 second before the next write operation."
elif [[ "$WRITE_PCT" -ge "$WRITE_WARN_PCT" ]]; then
    WARNING_MSG="⚠️ ATTIO WRITE RATE WARNING: ${WRITES_THIS_SEC}/${WRITE_LIMIT_PER_SEC} writes this second (${WRITE_PCT}%). Approaching the ${WRITE_LIMIT_PER_SEC}/sec write limit. Consider adding delays between write operations."
fi

if [[ "$READ_PCT" -ge 100 ]]; then
    READ_MSG="🚨 ATTIO READ RATE LIMIT REACHED: ${READS_THIS_SEC}/${READ_LIMIT_PER_SEC} reads this second (${READ_PCT}%). Reads may be throttled. Wait 1 second before the next read operation."
    WARNING_MSG="${WARNING_MSG:+${WARNING_MSG} | }${READ_MSG}"
elif [[ "$READ_PCT" -ge "$READ_WARN_PCT" ]]; then
    READ_MSG="⚠️ ATTIO READ RATE WARNING: ${READS_THIS_SEC}/${READ_LIMIT_PER_SEC} reads this second (${READ_PCT}%). Approaching the ${READ_LIMIT_PER_SEC}/sec read limit."
    WARNING_MSG="${WARNING_MSG:+${WARNING_MSG} | }${READ_MSG}"
fi

if [[ -n "$WARNING_MSG" ]]; then
    echo "$WARNING_MSG" >&2
    emit_context "$WARNING_MSG"
else
    emit_noop
fi

exit 0
