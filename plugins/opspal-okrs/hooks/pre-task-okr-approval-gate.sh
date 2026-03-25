#!/usr/bin/env bash

# PreToolUse/Agent gate for OKR lifecycle sequencing.
# Enforces basic state-machine order using cycle-state.json.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"
PROJECT_ROOT="${CLAUDE_PROJECT_ROOT:-$(cd "$PLUGIN_ROOT/../.." && pwd)}"

ENABLED="${OKR_PHASE_GATE_ENABLED:-1}"
STRICT="${OKR_PHASE_GATE_STRICT:-0}"

emit_pretool_noop() {
  printf '{}\n'
}

emit_pretool_response() {
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

extract_flag_value() {
  local prompt="$1"
  local flag_name="$2"

  printf '%s' "$prompt" | sed -nE "s/.*${flag_name}[=[:space:]]+([^[:space:]]+).*/\\1/p" | head -n 1
}

required_states_for_agent() {
  local agent_name="$1"

  case "$agent_name" in
    *okr-data-aggregator*|*okr-generator*|*okr-funnel-analyst*|*okr-initiative-evaluator*|*okr-initiative-prioritizer*|*okr-plg-specialist*)
      printf '%s' 'draft,scoring'
      ;;
    *okr-alignment-auditor*)
      printf '%s' 'scoring,approved,active'
      ;;
    *okr-asana-bridge*|*okr-cadence-manager*)
      printf '%s' 'approved,active'
      ;;
    *okr-progress-tracker*|*okr-executive-reporter*|*okr-dashboard-generator*)
      printf '%s' 'active,closed'
      ;;
    *okr-learning-engine*)
      printf '%s' 'closed'
      ;;
    *)
      printf '%s' ''
      ;;
  esac
}

if [[ "$ENABLED" != "1" && "$ENABLED" != "true" ]]; then
  emit_pretool_noop
  exit 0
fi

if ! command -v jq >/dev/null 2>&1; then
  emit_pretool_noop
  exit 0
fi

HOOK_INPUT=""
if [[ ! -t 0 ]]; then
  HOOK_INPUT="$(cat 2>/dev/null || true)"
fi

AGENT_NAME="${CLAUDE_AGENT_NAME:-${CLAUDE_TASK_AGENT:-unknown}}"
PROMPT="${CLAUDE_TASK_PROMPT:-}"

if [[ -n "$HOOK_INPUT" ]]; then
  AGENT_NAME="$(printf '%s' "$HOOK_INPUT" | jq -r '.tool_input.subagent_type // .subagent_type // .agent // empty' 2>/dev/null || echo "$AGENT_NAME")"
  PROMPT="$(printf '%s' "$HOOK_INPUT" | jq -r '.tool_input.prompt // .prompt // empty' 2>/dev/null || echo "$PROMPT")"
fi

AGENT_NAME="$(printf '%s' "$AGENT_NAME" | tr '[:upper:]' '[:lower:]')"

case "$AGENT_NAME" in
  *opspal-okrs*|*okr-*)
    ;;
  *)
    emit_pretool_noop
    exit 0
    ;;
esac

case "$AGENT_NAME" in
  *okr-strategy-orchestrator*|*validator*|*governance*|unknown)
    emit_pretool_noop
    exit 0
    ;;
esac

REQUIRED_STATES="$(required_states_for_agent "$AGENT_NAME")"
if [[ -z "$REQUIRED_STATES" ]]; then
  emit_pretool_noop
  exit 0
fi

ORG_SLUG_VALUE="${ORG_SLUG:-$(extract_flag_value "$PROMPT" '--org')}"
CYCLE_VALUE="${OKR_ACTIVE_CYCLE:-$(extract_flag_value "$PROMPT" '--cycle')}"

if [[ -z "$ORG_SLUG_VALUE" ]] || [[ -z "$CYCLE_VALUE" ]]; then
  emit_pretool_noop
  exit 0
fi

STATE_FILE="${PROJECT_ROOT}/orgs/${ORG_SLUG_VALUE}/platforms/okr/${CYCLE_VALUE}/cycle-state.json"
if [[ ! -f "$STATE_FILE" ]]; then
  emit_pretool_noop
  exit 0
fi

CURRENT_STATUS="$(jq -r '.status // ""' "$STATE_FILE" 2>/dev/null || echo "")"
if [[ -z "$CURRENT_STATUS" ]] || [[ "$CURRENT_STATUS" == "null" ]]; then
  emit_pretool_noop
  exit 0
fi

if printf ',%s,' "$REQUIRED_STATES" | grep -q ",${CURRENT_STATUS},"; then
  emit_pretool_noop
  exit 0
fi

MESSAGE="Agent ${AGENT_NAME} expects OKR cycle ${ORG_SLUG_VALUE}/${CYCLE_VALUE} to be in one of [${REQUIRED_STATES}], but the current state is ${CURRENT_STATUS}."

if [[ "$STRICT" == "1" ]]; then
  echo "[OKR-GATE] BLOCKED: ${MESSAGE}" >&2
  emit_pretool_response \
    "deny" \
    "OKR_PHASE_GATE_BLOCKED: ${MESSAGE}" \
    "Advance the cycle through the required methodology steps before running ${AGENT_NAME}."
  exit 0
fi

echo "[OKR-GATE] WARNING: ${MESSAGE}" >&2
emit_pretool_response \
  "allow" \
  "OKR_PHASE_GATE_WARNING: ${MESSAGE}" \
  "OKR phase gate is advisory in non-strict mode. Set OKR_PHASE_GATE_STRICT=1 to enforce blocking."
exit 0
