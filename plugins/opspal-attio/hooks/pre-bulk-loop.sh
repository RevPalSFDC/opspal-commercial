#!/usr/bin/env bash
exec 3>&1 1>&2

#
# Pre-Bulk-Loop Hook - Attio Plugin
#
# Trigger:  PreToolUse
# Matcher:  Agent
# Purpose:  Detect when an agent prompt implies mass-record loop operations
#           and emit a rate-limit advisory before execution begins.
#
# Behavior:
#   - Reads hook input JSON from stdin (tool_input.prompt, tool_input.subagent_type)
#   - Checks prompt for bulk/loop operation patterns
#   - If detected AND the subagent_type contains "attio":
#       Emits advisory warning about 25 writes/s limit, recommends
#       attio-loop-executor.js, and suggests --dry-run first
#   - Always allows (permissionDecision: allow) — advisory only
#   - If no bulk pattern detected, outputs empty JSON {}
#
# Bulk patterns detected:
#   "all records", "every record", "bulk update", "mass update",
#   "loop through", "iterate over", "for each record",
#   "import.*csv", "batch.*process"
#
# Output (fd 3):
#   Bulk detected:  { "hookSpecificOutput": { "hookEventName": "PreToolUse",
#                                             "permissionDecision": "allow",
#                                             "permissionDecisionReason": "...",
#                                             "additionalContext": "..." } }
#   No bulk:        {}
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
    local context="$2"

    if ! command -v jq >/dev/null 2>&1; then
        printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow","permissionDecisionReason":"ATTIO BULK LOOP ADVISORY: Attio write limit is 25/s. Use attio-loop-executor.js and run --dry-run first."}}\n' >&3
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

# ── Extract subagent_type and prompt ──────────────────────────────────────────
SUBAGENT_TYPE=""
PROMPT=""

if command -v jq >/dev/null 2>&1; then
    SUBAGENT_TYPE="$(printf '%s' "$HOOK_INPUT" | jq -r '.tool_input.subagent_type // .subagent_type // ""' 2>/dev/null || true)"
    PROMPT="$(printf '%s' "$HOOK_INPUT" | jq -r '.tool_input.prompt // .prompt // ""' 2>/dev/null || true)"
else
    # Fallback without jq
    SUBAGENT_TYPE="$(printf '%s' "$HOOK_INPUT" | grep -oP '"subagent_type"\s*:\s*"\K[^"]+' 2>/dev/null | head -1 || true)"
    PROMPT="$(printf '%s' "$HOOK_INPUT" | grep -oP '"prompt"\s*:\s*"\K[^"]+' 2>/dev/null | head -1 || true)"
fi

SUBAGENT_LOWER="$(printf '%s' "$SUBAGENT_TYPE" | tr '[:upper:]' '[:lower:]')"
PROMPT_LOWER="$(printf '%s' "$PROMPT" | tr '[:upper:]' '[:lower:]')"

# ── Skip non-Attio agents ─────────────────────────────────────────────────────
if ! printf '%s' "$SUBAGENT_LOWER" | grep -q 'attio'; then
    emit_noop
    exit 0
fi

# ── Detect bulk/loop patterns ─────────────────────────────────────────────────
BULK_DETECTED=false

if printf '%s' "$PROMPT_LOWER" | grep -qE '(all records|every record|bulk update|mass update|loop through|iterate over|for each record)'; then
    BULK_DETECTED=true
fi

if [[ "$BULK_DETECTED" == "false" ]]; then
    if printf '%s' "$PROMPT_LOWER" | grep -qE '(import.*csv|csv.*import|batch.*process|process.*batch)'; then
        BULK_DETECTED=true
    fi
fi

if [[ "$BULK_DETECTED" == "false" ]]; then
    emit_noop
    exit 0
fi

# ── Log advisory to stderr ────────────────────────────────────────────────────
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >&2
echo "⚠️  ATTIO BULK LOOP ADVISORY" >&2
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >&2
echo "  Agent:   ${SUBAGENT_TYPE}" >&2
echo "  Pattern: Bulk/loop operation detected in prompt" >&2
echo "  Limit:   Attio write API is capped at 25 writes/second" >&2
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >&2

# ── Emit advisory (always allow) ──────────────────────────────────────────────
emit_advisory \
    "ATTIO_BULK_LOOP_ADVISORY: Bulk or loop operation detected for Attio agent '${SUBAGENT_TYPE}'. Attio write API limit is 25 writes/second. Exceeding this triggers HTTP 429 (rate limited)." \
    "Recommendations: (1) Use scripts/lib/attio-loop-executor.js which enforces 25 writes/s pacing automatically. (2) Always run with --dry-run first to preview changes before committing. (3) For CSV imports, use the loop executor with a batch size of 20 to leave headroom for concurrent operations. (4) Respect Retry-After header on any 429 responses. See config/attio-rate-limits.json for current limits."

exit 0
