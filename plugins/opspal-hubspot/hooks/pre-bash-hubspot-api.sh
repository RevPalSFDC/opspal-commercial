#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CORE_PLUGIN_ROOT="$(cd "$SCRIPT_DIR/../../opspal-core" && pwd)"
BASH_CLASSIFIER_LIB="${CORE_PLUGIN_ROOT}/scripts/lib/classify-bash-command.sh"

# shellcheck source=/dev/null
source "$BASH_CLASSIFIER_LIB"

emit_pretool_noop() {
  printf '{}\n'
}

emit_pretool_decision() {
  local permission_decision="$1"
  local permission_reason="$2"
  local additional_context="${3:-}"

  if ! command -v jq >/dev/null 2>&1; then
    emit_pretool_noop
    return 0
  fi

  jq -nc \
    --arg decision "$permission_decision" \
    --arg reason "$permission_reason" \
    --arg context "$additional_context" \
    '{
      suppressOutput: true,
      hookSpecificOutput: (
        { hookEventName: "PreToolUse" }
        + (if $decision != "" then { permissionDecision: $decision } else {} end)
        + (if $reason != "" then { permissionDecisionReason: $reason } else {} end)
        + (if $context != "" then { additionalContext: $context } else {} end)
      )
    }'
}

extract_command() {
  if [[ -n "$HOOK_INPUT" ]] && command -v jq >/dev/null 2>&1; then
    printf '%s' "$HOOK_INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null || true
    return
  fi

  printf '%s' "${CLAUDE_TOOL_INPUT:-${HOOK_TOOL_INPUT:-}}"
}

extract_agent_type() {
  if [[ -n "$HOOK_INPUT" ]] && command -v jq >/dev/null 2>&1; then
    printf '%s' "$HOOK_INPUT" | jq -r '.agent_type // .tool_input.agent_type // empty' 2>/dev/null || true
    return
  fi

  printf '%s' "${CLAUDE_AGENT_NAME:-${CLAUDE_SUBAGENT_NAME:-}}"
}

classify_required_agent() {
  local path_lower="$1"

  if printf '%s' "$path_lower" | grep -qE '^/crm/.*/properties'; then
    printf 'opspal-hubspot:hubspot-property-manager'
    return
  fi

  if printf '%s' "$path_lower" | grep -qE '^/(automation|workflows)'; then
    printf 'opspal-hubspot:hubspot-workflow-builder'
    return
  fi

  if printf '%s' "$path_lower" | grep -qE '^/(cms|content|blog|marketing)'; then
    printf 'opspal-hubspot:hubspot-cms-content-manager'
    return
  fi

  if printf '%s' "$path_lower" | grep -qE '^/crm/' || printf '%s' "$path_lower" | grep -qE '^/imports'; then
    printf 'opspal-hubspot:hubspot-data-operations-manager'
    return
  fi

  if printf '%s' "$path_lower" | grep -qE '^/(integrations|extensions)'; then
    printf 'opspal-hubspot:hubspot-integration-specialist'
    return
  fi

  printf 'opspal-hubspot:hubspot-orchestrator'
}
HUBSPOT_BASH_API_GOVERNANCE_ENABLED="${HUBSPOT_BASH_API_GOVERNANCE_ENABLED:-true}"

if [[ "$HUBSPOT_BASH_API_GOVERNANCE_ENABLED" != "true" ]]; then
  emit_pretool_noop
  exit 0
fi

HOOK_INPUT=""
if [[ ! -t 0 ]]; then
  HOOK_INPUT="$(cat 2>/dev/null || true)"
fi

COMMAND="$(extract_command)"
if [[ -z "$COMMAND" ]]; then
  emit_pretool_noop
  exit 0
fi

CURL_CLASSIFICATION="$(classify_hubspot_curl "$COMMAND")"
if [[ "$CURL_CLASSIFICATION" == "unknown" ]]; then
  emit_pretool_noop
  exit 0
fi

METHOD="$(detect_http_method "$COMMAND")"
PATH_PART="$(extract_curl_path "$COMMAND")"
PATH_LOWER="$(printf '%s' "$PATH_PART" | tr '[:upper:]' '[:lower:]')"

if [[ "$CURL_CLASSIFICATION" == "read" ]]; then
  emit_pretool_noop
  exit 0
fi

AGENT_TYPE="$(extract_agent_type)"
if [[ -n "$AGENT_TYPE" || -n "${CLAUDE_TASK_ID:-}" ]]; then
  emit_pretool_noop
  exit 0
fi

# Production environment governance — block mutations from parent context
# when production is positively identified. detect_hubspot_environment() is
# sourced via classify-bash-command.sh -> detect-environment.sh.
HS_ENV="unknown"
if declare -F detect_hubspot_environment >/dev/null 2>&1; then
  HS_ENV="$(detect_hubspot_environment)"
fi

REQUIRED_AGENT="$(classify_required_agent "$PATH_LOWER")"

if [[ "$HS_ENV" == "production" ]]; then
  REASON="PRODUCTION_GOVERNANCE: HubSpot production portal mutation detected (${METHOD} ${PATH_PART}). All mutations against production portals require a specialist sub-agent. Use Agent tool with subagent_type='${REQUIRED_AGENT}'."
  CONTEXT="Production portal identified via HUBSPOT_PRODUCTION_PORTAL_IDS or HUBSPOT_ENVIRONMENT. Read-only GET, search, and batch/read requests remain allowed. Sandbox mutations require sub-agent context."
  emit_pretool_decision "deny" "$REASON" "$CONTEXT"
  exit 0
fi

REASON="ROUTING_SPECIALIST_REQUIRED: Direct HubSpot API mutation detected via Bash curl (${METHOD} ${PATH_PART}). Use the Agent tool with subagent_type='${REQUIRED_AGENT}' before direct execution."
CONTEXT="Direct HubSpot API mutations via curl bypass MCP-level validation. Read-only GET, search, and batch/read requests remain allowed."

emit_pretool_decision "deny" "$REASON" "$CONTEXT"
exit 0
