#!/usr/bin/env bash
exec 3>&1 1>&2

#
# Pre-Bash Attio API Hook - Attio Plugin
#
# Trigger:  PreToolUse
# Matcher:  Bash
# Purpose:  Detect direct curl calls to the Attio API and advise the user to use
#           the MCP tools instead. Advisory only — never blocks execution.
#
# Behavior:
#   - Reads hook input JSON from stdin (contains tool_input.command)
#   - Checks whether the Bash command targets api.attio.com
#   - If matched: emits an advisory permissionDecisionReason directing to MCP tools
#   - If not matched: emits {} (noop)
#
# Rationale:
#   Direct curl calls to api.attio.com bypass MCP-level validation, quota tracking,
#   and the permanent-delete safety guards baked into the Attio hook suite. All
#   Attio API interactions should go through mcp__attio__* tools.
#
# Output (fd 3):
#   Advisory JSON with permissionDecision: "allow" and routing guidance, or {}
#
# Exit Codes:
#   0 - Always exits 0; advisory hooks must never block
#
# Version: 1.0.0
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "${SCRIPT_DIR}/lib/error-handler.sh" ]]; then
    source "${SCRIPT_DIR}/lib/error-handler.sh"
fi

# ── Helpers ───────────────────────────────────────────────────────────────────

emit_noop() {
    printf '{}\n' >&3
}

emit_advisory() {
    local reason="$1"
    local context="${2:-}"

    if ! command -v jq >/dev/null 2>&1; then
        # jq unavailable — emit noop rather than malformed JSON
        emit_noop
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

# ── Extract command ───────────────────────────────────────────────────────────
COMMAND=""
if command -v jq >/dev/null 2>&1; then
    COMMAND="$(printf '%s' "$HOOK_INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null || true)"
fi

# Fallback: check raw stdin for the command string
if [[ -z "$COMMAND" ]]; then
    COMMAND="$HOOK_INPUT"
fi

# ── Check for Attio API patterns ──────────────────────────────────────────────
# Patterns: api.attio.com in URL, or curl with "attio" anywhere in command
if printf '%s' "$COMMAND" | grep -qE '(api\.attio\.com|curl[[:space:]].*attio|attio.*curl)'; then
    log_warn "Direct curl to Attio API detected — MCP tools recommended" 2>/dev/null || true

    emit_advisory \
        "ROUTING_ADVISORY: Direct Attio API call via Bash curl detected. Use mcp__attio__* MCP tools instead to ensure quota tracking, permanent-delete guards, and schema-change warnings are applied. Proceeding autonomously." \
        "Direct curl bypasses: (1) api-quota-monitor.sh rate tracking, (2) pre-record-delete.sh and pre-entry-delete.sh permanent-delete warnings, (3) pre-attribute-delete.sh schema-change guards. All Attio interactions should use mcp__attio__* tools."
    exit 0
fi

emit_noop
exit 0
