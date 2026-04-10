#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Resolve opspal-core plugin root. In versioned cache the sibling path includes
# a version directory (e.g. cache/opspal-commercial/opspal-core/2.54.13/) so the
# simple ../../opspal-core relative path doesn't work. Try CLAUDE_PLUGIN_ROOT
# first (set by the dispatcher), then probe the versioned cache, then fallback.
_resolve_core_root() {
  # 1. If CLAUDE_PLUGIN_ROOT points to opspal-core, use its scripts directly
  if [[ -n "${CLAUDE_PLUGIN_ROOT:-}" ]] && [[ -f "${CLAUDE_PLUGIN_ROOT}/scripts/lib/classify-bash-command.sh" ]]; then
    printf '%s' "$CLAUDE_PLUGIN_ROOT"
    return
  fi
  # 2. Versioned cache: go up to marketplace dir, find latest opspal-core version
  local marketplace_dir
  marketplace_dir="$(cd "$SCRIPT_DIR/../../.." 2>/dev/null && pwd)" || true
  if [[ -d "${marketplace_dir}/opspal-core" ]]; then
    local latest
    latest="$(ls -1d "${marketplace_dir}/opspal-core"/*/ 2>/dev/null | sort -V | tail -1)"
    if [[ -n "$latest" ]] && [[ -f "${latest}scripts/lib/classify-bash-command.sh" ]]; then
      printf '%s' "${latest%/}"
      return
    fi
  fi
  # 3. Source-tree sibling (marketplace source or dev checkout)
  local sibling
  sibling="$(cd "$SCRIPT_DIR/../../opspal-core" 2>/dev/null && pwd)" || true
  if [[ -n "$sibling" ]]; then
    printf '%s' "$sibling"
    return
  fi
}
CORE_PLUGIN_ROOT="$(_resolve_core_root)"
BASH_CLASSIFIER_LIB="${CORE_PLUGIN_ROOT}/scripts/lib/classify-bash-command.sh"

if [[ ! -f "$BASH_CLASSIFIER_LIB" ]]; then
  # Cannot locate opspal-core classify library — emit noop and exit cleanly
  printf '{}\n'
  exit 0
fi

# Fast-exit: peek at stdin to check if command involves curl to Marketo API.
# Avoids sourcing the full classifier library for irrelevant commands (ls, git, sf, etc.)
_STDIN_PEEK=""
if [[ ! -t 0 ]]; then
  _STDIN_PEEK="$(cat 2>/dev/null || true)"
fi
if [[ -n "$_STDIN_PEEK" ]] && [[ "$_STDIN_PEEK" != *"curl "* ]] && [[ "$_STDIN_PEEK" != *"curl\""* ]]; then
  printf '{}\n'
  exit 0
fi

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

  # Merge additional_context into permissionDecisionReason for backward compatibility
  local merged_reason="$permission_reason"
  if [[ -n "$additional_context" ]]; then
      if [[ -n "$merged_reason" ]]; then
          merged_reason="${merged_reason}\n\n${additional_context}"
      else
          merged_reason="$additional_context"
      fi
  fi

  jq -nc \
    --arg decision "$permission_decision" \
    --arg reason "$merged_reason" \
    '{
      suppressOutput: true,
      hookSpecificOutput: (
        { hookEventName: "PreToolUse" }
        + (if $decision != "" then { permissionDecision: $decision } else {} end)
        + (if $reason != "" then { permissionDecisionReason: $reason } else {} end)
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

  if printf '%s' "$path_lower" | grep -qE '/bulk/.*/(import|export)(/|\.|$)'; then
    printf 'opspal-marketo:marketo-data-operations'
    return
  fi

  if printf '%s' "$path_lower" | grep -qE '(requestcampaign|/smartcampaign/|/activate|/deactivate|/schedule)'; then
    printf 'opspal-marketo:marketo-smart-campaign-api-specialist'
    return
  fi

  if printf '%s' "$path_lower" | grep -qE '(sync|sfdc|fieldmapping)'; then
    printf 'opspal-marketo:marketo-sfdc-sync-specialist'
    return
  fi

  if printf '%s' "$path_lower" | grep -qE '(/rest/asset/|/rest/v1/(programs|folders|emails|forms|landingpages))'; then
    printf 'opspal-marketo:marketo-orchestrator'
    return
  fi

  if printf '%s' "$path_lower" | grep -qE '/rest/v1/leads'; then
    printf 'opspal-marketo:marketo-data-operations'
    return
  fi

  printf 'opspal-marketo:marketo-integration-specialist'
}
MARKETO_BASH_API_GOVERNANCE_ENABLED="${MARKETO_BASH_API_GOVERNANCE_ENABLED:-true}"

if [[ "$MARKETO_BASH_API_GOVERNANCE_ENABLED" != "true" ]]; then
  emit_pretool_noop
  exit 0
fi

# Use pre-read stdin from fast-exit check (stdin already consumed above)
HOOK_INPUT="${_STDIN_PEEK:-}"

COMMAND="$(extract_command)"
if [[ -z "$COMMAND" ]]; then
  emit_pretool_noop
  exit 0
fi

CURL_CLASSIFICATION="$(classify_marketo_curl "$COMMAND")"
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
# when production is positively identified. detect_marketo_environment() is
# sourced via classify-bash-command.sh -> detect-environment.sh.
MK_ENV="unknown"
if declare -F detect_marketo_environment >/dev/null 2>&1; then
  MK_ENV="$(detect_marketo_environment)"
fi

REQUIRED_AGENT="$(classify_required_agent "$PATH_LOWER")"

if [[ "$MK_ENV" == "production" ]]; then
  REASON="PRODUCTION_ADVISORY: Marketo production instance mutation detected (${METHOD} ${PATH_PART}). Recommend using specialist sub-agent: Agent tool with subagent_type='${REQUIRED_AGENT}'. Proceeding autonomously."
  CONTEXT="Production Marketo instance identified via mktorest.com URL or MARKETO_ENVIRONMENT=production. Read-only GET requests remain allowed."
  emit_pretool_decision "allow" "$REASON" "$CONTEXT"
  exit 0
fi

REASON="ROUTING_ADVISORY: Direct Marketo API mutation detected via Bash curl (${METHOD} ${PATH_PART}). Recommend using Agent tool with subagent_type='${REQUIRED_AGENT}'. Proceeding autonomously."
CONTEXT="Direct Marketo API mutations via curl bypass MCP-level validation. Read-only GET requests remain allowed."

emit_pretool_decision "allow" "$REASON" "$CONTEXT"
exit 0
