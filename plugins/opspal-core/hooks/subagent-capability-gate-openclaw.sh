#!/usr/bin/env bash

set -euo pipefail

INPUT="$(cat || true)"

emit_pass() {
  jq -cn --arg capability "${1:-}" --arg reason "${2:-}" '{
    block: false,
    capability: $capability,
    reason: $reason
  }'
}

emit_block() {
  jq -cn --arg capability "${1:-}" --arg reason "${2:-}" --arg code "${3:-policy_denied}" '{
    block: true,
    blockReason: ("Sub-agent capability blocked (" + $code + "): " + $reason),
    capability: $capability,
    reasonCode: $code,
    reason: $reason
  }'
}

if ! command -v jq >/dev/null 2>&1; then
  # Fail open if jq is unavailable; parity plugin fail-closed behavior can still catch script failures.
  printf '{"block":false,"reason":"jq unavailable"}\n'
  exit 0
fi

TOOL_NAME="$(printf '%s' "$INPUT" | jq -r '.event.toolName // ""' 2>/dev/null | tr '[:upper:]' '[:lower:]')"
case "$TOOL_NAME" in
  task|sessions_spawn|sessions.spawn|subagents_spawn|subagents.spawn) ;;
  *)
    emit_pass "" "non-subagent tool"
    exit 0
    ;;
esac

TARGET_AGENT="$(
  printf '%s' "$INPUT" | jq -r '
    .event.params.subagent_type
    // .event.params.agent_type
    // .event.params.agentId
    // .event.params.agent_id
    // .event.params.agent
    // .event.params.targetAgentId
    // .event.params.target_agent_id
    // ""
  ' 2>/dev/null
)"

ORG_SLUG="$(
  printf '%s' "$INPUT" | jq -r '
    .event.params.org_slug
    // .event.params.orgSlug
    // .event.params.client_slug
    // .event.params.clientSlug
    // .event.params.metadata.org_slug
    // .event.params.metadata.orgSlug
    // .context.org_slug
    // .context.orgSlug
    // ""
  ' 2>/dev/null | tr '[:upper:]' '[:lower:]'
)"

if [[ -z "$ORG_SLUG" ]]; then
  AGENT_ID_FROM_CTX="$(printf '%s' "$INPUT" | jq -r '.context.agentId // ""' 2>/dev/null | tr '[:upper:]' '[:lower:]')"
  if [[ "$AGENT_ID_FROM_CTX" == "peregrine" ]]; then
    ORG_SLUG="peregrine"
  fi
fi

CHANNEL_ID="$(
  printf '%s' "$INPUT" | jq -r '
    .event.params.channel_id
    // .event.params.channelId
    // .event.params.thread.channel_id
    // .event.params.metadata.channel_id
    // .context.channelId
    // ""
  ' 2>/dev/null
)"

USER_ID="$(
  printf '%s' "$INPUT" | jq -r '
    .event.params.user_id
    // .event.params.userId
    // .event.params.requester_id
    // .event.params.requesterId
    // .event.params.metadata.user_id
    // .context.userId
    // ""
  ' 2>/dev/null
)"

CAPABILITY="subagents_core"
if printf '%s' "$TARGET_AGENT" | tr '[:upper:]' '[:lower:]' | grep -Eq '(sfdc|salesforce)'; then
  CAPABILITY="subagents_salesforce"
fi

DEFAULT_MODE="${SUBAGENT_CAPABILITY_DEFAULT_MODE:-shadow}"
ENFORCED_CHANNEL_ID="${SUBAGENT_CAPABILITY_ENFORCED_CHANNEL_ID:-C0AGVQFDB18}"

if [[ -n "$ENFORCED_CHANNEL_ID" ]]; then
  CHANNEL_UPPER="$(printf '%s' "$CHANNEL_ID" | tr '[:lower:]' '[:upper:]')"
  ENFORCED_UPPER="$(printf '%s' "$ENFORCED_CHANNEL_ID" | tr '[:lower:]' '[:upper:]')"
  if [[ -n "$CHANNEL_UPPER" && "$CHANNEL_UPPER" != "$ENFORCED_UPPER" ]]; then
    emit_pass "$CAPABILITY" "channel out of scope for capability enforcement"
    exit 0
  fi
fi

if [[ -z "$ORG_SLUG" ]]; then
  if [[ "$DEFAULT_MODE" == "enforce" ]]; then
    emit_block "$CAPABILITY" "Missing org slug for capability decision." "missing_org_slug"
  else
    emit_pass "$CAPABILITY" "missing org slug (shadow mode)"
  fi
  exit 0
fi

RESOLVER="${SUBAGENT_CAPABILITY_RESOLVER:-}"
WORKSPACE_ROOT="${SUBAGENT_CAPABILITY_WORKSPACE_ROOT:-}"

if [[ ! -f "$RESOLVER" ]]; then
  if [[ "$DEFAULT_MODE" == "enforce" ]]; then
    emit_block "$CAPABILITY" "Capability resolver missing at $RESOLVER." "resolver_missing"
  else
    emit_pass "$CAPABILITY" "resolver missing (shadow mode)"
  fi
  exit 0
fi

if ! command -v python3 >/dev/null 2>&1; then
  if [[ "$DEFAULT_MODE" == "enforce" ]]; then
    emit_block "$CAPABILITY" "python3 unavailable for capability resolver." "python_unavailable"
  else
    emit_pass "$CAPABILITY" "python unavailable (shadow mode)"
  fi
  exit 0
fi

resolver_args=(
  "$RESOLVER"
  --workspace-root "$WORKSPACE_ROOT"
  --slug "$ORG_SLUG"
  --capability "$CAPABILITY"
  --default-mode "$DEFAULT_MODE"
)

if [[ -n "$CHANNEL_ID" ]]; then
  resolver_args+=(--channel-id "$CHANNEL_ID")
fi
if [[ -n "$USER_ID" ]]; then
  resolver_args+=(--user-id "$USER_ID")
fi

RESOLVER_OUT="$(python3 "${resolver_args[@]}" 2>/dev/null || true)"
if [[ -z "$RESOLVER_OUT" ]]; then
  if [[ "$DEFAULT_MODE" == "enforce" ]]; then
    emit_block "$CAPABILITY" "Capability resolver returned no output." "resolver_unavailable"
  else
    emit_pass "$CAPABILITY" "resolver unavailable (shadow mode)"
  fi
  exit 0
fi

ALLOWED="$(printf '%s' "$RESOLVER_OUT" | jq -r '.allowed // false' 2>/dev/null)"
MODE="$(printf '%s' "$RESOLVER_OUT" | jq -r '.mode // "shadow"' 2>/dev/null)"
REASON_CODE="$(printf '%s' "$RESOLVER_OUT" | jq -r '.reason_code // "unknown"' 2>/dev/null)"
REASON="$(printf '%s' "$RESOLVER_OUT" | jq -r '.reason // "policy denied"' 2>/dev/null)"

if [[ "$ALLOWED" == "true" ]]; then
  emit_pass "$CAPABILITY" "$REASON"
  exit 0
fi

if [[ "$MODE" == "enforce" ]]; then
  emit_block "$CAPABILITY" "$REASON" "$REASON_CODE"
  exit 0
fi

emit_pass "$CAPABILITY" "$REASON"
