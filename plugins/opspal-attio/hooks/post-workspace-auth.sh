#!/usr/bin/env bash
exec 3>&1 1>&2

#
# Post Workspace Auth Hook - Attio Plugin
#
# Trigger:  PostToolUse
# Matcher:  mcp__attio__self_get
# Purpose:  After a successful self/workspace identity call, parse the result
#           to extract workspace_id and scope, log success, and provide advisory
#           context about the authenticated workspace.
#
# Behavior:
#   - Reads hook input JSON from stdin (contains tool_result)
#   - Parses workspace_id and scope from the Attio identity response
#   - Logs authentication success to stderr
#   - Suggests caching workspace context for the session
#   - Emits additionalContext with workspace identity summary
#
# Attio self/identity response shape (partial):
#   {
#     "data": {
#       "id": { "workspace_id": "..." },
#       "workspace_name": "...",
#       "scopes": ["record:read", "record:read-write", ...]
#     }
#   }
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

# ── Extract tool result ───────────────────────────────────────────────────────
TOOL_RESULT=""
if command -v jq >/dev/null 2>&1; then
    # tool_result may be a JSON string or nested object depending on MCP version
    TOOL_RESULT="$(printf '%s' "$HOOK_INPUT" | jq -r '.tool_result // .result // empty' 2>/dev/null || true)"

    # If tool_result is a JSON string (escaped), parse it
    if printf '%s' "$TOOL_RESULT" | grep -q '^\s*"'; then
        TOOL_RESULT="$(printf '%s' "$TOOL_RESULT" | jq -r '.' 2>/dev/null || echo "$TOOL_RESULT")"
    fi
fi

if [[ -z "$TOOL_RESULT" ]]; then
    # No parseable result — emit minimal context
    emit_context "Attio authentication call (self_get) completed. Workspace context not parseable from tool result."
    exit 0
fi

# ── Extract workspace identity fields ────────────────────────────────────────
WORKSPACE_ID=""
WORKSPACE_NAME=""
SCOPES_RAW=""

if command -v jq >/dev/null 2>&1; then
    WORKSPACE_ID="$(printf '%s' "$TOOL_RESULT" | jq -r '.data.id.workspace_id // .workspace_id // "unknown"' 2>/dev/null || echo 'unknown')"
    WORKSPACE_NAME="$(printf '%s' "$TOOL_RESULT" | jq -r '.data.workspace_name // .workspace_name // "unknown"' 2>/dev/null || echo 'unknown')"
    # Collect scopes as a comma-separated list
    SCOPES_RAW="$(printf '%s' "$TOOL_RESULT" | jq -r '(.data.scopes // .scopes // []) | join(", ")' 2>/dev/null || echo 'unknown')"
else
    # Fallback without jq
    WORKSPACE_ID="$(printf '%s' "$TOOL_RESULT" | grep -oP '"workspace_id"\s*:\s*"\K[^"]+' 2>/dev/null | head -1 || echo 'unknown')"
    WORKSPACE_NAME="$(printf '%s' "$TOOL_RESULT" | grep -oP '"workspace_name"\s*:\s*"\K[^"]+' 2>/dev/null | head -1 || echo 'unknown')"
    SCOPES_RAW="unknown"
fi

# ── Log success to stderr ─────────────────────────────────────────────────────
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >&2
echo "✅ ATTIO WORKSPACE AUTHENTICATED" >&2
echo "   Workspace:  ${WORKSPACE_NAME}" >&2
echo "   ID:         ${WORKSPACE_ID}" >&2
echo "   Scopes:     ${SCOPES_RAW}" >&2
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >&2

log_success "Attio workspace authenticated: ${WORKSPACE_NAME} (${WORKSPACE_ID})" 2>/dev/null || true

# ── Cache workspace context for the session ───────────────────────────────────
WORKSPACE_CONTEXT_FILE="${TMPDIR:-/tmp}/attio-workspace-context.json"
if command -v jq >/dev/null 2>&1; then
    jq -n \
        --arg workspace_id "$WORKSPACE_ID" \
        --arg workspace_name "$WORKSPACE_NAME" \
        --arg scopes "$SCOPES_RAW" \
        --arg cached_at "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
        '{workspace_id: $workspace_id, workspace_name: $workspace_name, scopes: $scopes, cached_at: $cached_at}' \
        > "$WORKSPACE_CONTEXT_FILE" 2>/dev/null || true
fi

export ATTIO_WORKSPACE_ID="${WORKSPACE_ID}"
export ATTIO_WORKSPACE_NAME="${WORKSPACE_NAME}"

# ── Emit advisory context ─────────────────────────────────────────────────────
# Determine write access from scopes
WRITE_ACCESS="unknown"
if printf '%s' "$SCOPES_RAW" | grep -qi 'read-write\|write'; then
    WRITE_ACCESS="yes"
elif printf '%s' "$SCOPES_RAW" | grep -qi 'read'; then
    WRITE_ACCESS="no (read-only token)"
fi

CONTEXT_MSG="Attio workspace authenticated. Workspace: '${WORKSPACE_NAME}' (ID: ${WORKSPACE_ID}). Write access: ${WRITE_ACCESS}. Scopes: ${SCOPES_RAW}. Workspace context cached to ${WORKSPACE_CONTEXT_FILE} for session reuse. REMINDER: Attio has no recycle bin — all deletes are permanent."

emit_context "$CONTEXT_MSG"
exit 0
