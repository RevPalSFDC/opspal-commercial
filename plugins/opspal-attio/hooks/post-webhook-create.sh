#!/usr/bin/env bash
exec 3>&1 1>&2

#
# Post-Webhook-Create Hook - Attio Plugin
#
# Trigger:  PostToolUse
# Matcher:  mcp__attio__webhooks_create
# Purpose:  After webhook creation, surface HMAC verification setup guidance
#           and at-least-once delivery idempotency recommendations.
#
# Behavior:
#   - Reads hook input JSON from stdin (tool_result)
#   - Parses target_url and subscriptions from the Attio webhook response
#   - Emits additionalContext with:
#       - Webhook summary (URL + subscription count)
#       - HMAC signature verification requirement (webhook-hmac-verifier.js)
#       - At-least-once delivery idempotency guidance (Idempotency-Key header)
#       - List of subscribed event types
#
# Attio webhook response shape (partial):
#   {
#     "data": {
#       "id": { "webhook_id": "..." },
#       "target_url": "https://...",
#       "subscriptions": [
#         { "event_type": "record.created", "object_slug": "people" },
#         ...
#       ]
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
        printf '{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"Webhook created. IMPORTANT: Configure HMAC signature verification. Attio delivers at-least-once — design for idempotency."}}\n' >&3
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

# ── Extract tool_result ───────────────────────────────────────────────────────
TOOL_RESULT=""

if command -v jq >/dev/null 2>&1; then
    TOOL_RESULT="$(printf '%s' "$HOOK_INPUT" | jq -r '.tool_result // .result // empty' 2>/dev/null || true)"

    # If tool_result is a JSON string (escaped), parse it
    if printf '%s' "$TOOL_RESULT" | grep -q '^\s*"'; then
        TOOL_RESULT="$(printf '%s' "$TOOL_RESULT" | jq -r '.' 2>/dev/null || echo "$TOOL_RESULT")"
    fi
fi

# ── Extract target_url, webhook_id, and subscriptions ────────────────────────
TARGET_URL="unknown-url"
WEBHOOK_ID="unknown-id"
SUBSCRIPTION_COUNT=0
EVENT_TYPES_LIST="(none parsed)"

if [[ -n "$TOOL_RESULT" ]] && command -v jq >/dev/null 2>&1; then
    TARGET_URL="$(printf '%s' "$TOOL_RESULT" | jq -r '.data.target_url // .target_url // "unknown-url"' 2>/dev/null || echo 'unknown-url')"
    WEBHOOK_ID="$(printf '%s' "$TOOL_RESULT" | jq -r '.data.id.webhook_id // .webhook_id // .data.id // "unknown-id"' 2>/dev/null || echo 'unknown-id')"

    SUBSCRIPTION_COUNT="$(printf '%s' "$TOOL_RESULT" | jq -r '(.data.subscriptions // .subscriptions // []) | length' 2>/dev/null || echo '0')"
    EVENT_TYPES_LIST="$(printf '%s' "$TOOL_RESULT" | jq -r '(.data.subscriptions // .subscriptions // []) | map(.event_type + (if .object_slug then " (" + .object_slug + ")" else "" end)) | join(", ")' 2>/dev/null || echo '(none parsed)')"
else
    # Fallback without jq
    TARGET_URL="$(printf '%s' "$TOOL_RESULT" | grep -oP '"target_url"\s*:\s*"\K[^"]+' 2>/dev/null | head -1 || echo 'unknown-url')"
fi

# ── Log to stderr ─────────────────────────────────────────────────────────────
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >&2
echo "✅ ATTIO WEBHOOK CREATED" >&2
echo "   Webhook ID:    ${WEBHOOK_ID}" >&2
echo "   Target URL:    ${TARGET_URL}" >&2
echo "   Subscriptions: ${SUBSCRIPTION_COUNT}" >&2
echo "   Events:        ${EVENT_TYPES_LIST}" >&2
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >&2

# ── Build advisory context ────────────────────────────────────────────────────
CONTEXT_MSG="Webhook created targeting [${TARGET_URL}] with [${SUBSCRIPTION_COUNT}] subscription(s). "
CONTEXT_MSG+="Subscribed events: ${EVENT_TYPES_LIST}. "
CONTEXT_MSG+="IMPORTANT: Configure HMAC signature verification using your webhook secret. "
CONTEXT_MSG+="Use scripts/lib/webhook-hmac-verifier.js to implement timing-safe HMAC-SHA256 verification of the Attio-Signature header on all incoming events. "
CONTEXT_MSG+="Attio webhooks deliver at-least-once. Design your endpoint for idempotency using the Idempotency-Key header to prevent duplicate processing on retries. "
CONTEXT_MSG+="Delivery timeout is 5 seconds per event; Attio will retry up to 10 times over ~3 days on failure. Ensure your endpoint responds within 5 seconds."

emit_context "$CONTEXT_MSG"
exit 0
