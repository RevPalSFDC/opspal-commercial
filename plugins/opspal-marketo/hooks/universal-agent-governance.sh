#!/usr/bin/env bash

###############################################################################
# Universal Agent Governance Hook — Marketo
#
# Enforces basic governance for Marketo agent launches so high-risk bulk,
# destructive, and production-adjacent workflows do not bypass the Agent path.
#
# Triggers: PreToolUse matcher "Agent"
# Actions:
#   1. Detect Marketo agent launches from the live Agent payload
#   2. Score prompt + agent combination for destructive or bulk risk
#   3. Deny explicitly destructive mass operations
#   4. Emit approval guidance for high-risk bulk/sync/campaign execution tasks
#
# Exit Codes:
#   0 - Allowed or structured deny/allow response emitted
###############################################################################

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

ERROR_HANDLER="${PLUGIN_ROOT}/hooks/lib/error-handler.sh"
if [[ ! -f "$ERROR_HANDLER" ]]; then
  for candidate in "${CLAUDE_PLUGIN_ROOT:-}/../opspal-core/hooks/lib/error-handler.sh" \
                    "${SCRIPT_DIR}/../../opspal-core/hooks/lib/error-handler.sh"; do
    if [[ -f "$candidate" ]]; then
      ERROR_HANDLER="$candidate"
      break
    fi
  done
fi

if [[ -f "$ERROR_HANDLER" ]]; then
  # shellcheck source=/dev/null
  source "$ERROR_HANDLER"
  HOOK_NAME="marketo-universal-agent-governance"
  set_lenient_mode 2>/dev/null || true
fi

GOVERNANCE_ENABLED="${MARKETO_AGENT_GOVERNANCE_ENABLED:-true}"

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

if [[ "$GOVERNANCE_ENABLED" != "true" ]]; then
  emit_pretool_noop
  exit 0
fi

HOOK_INPUT="${1:-}"
if [[ ! -t 0 ]]; then
  HOOK_INPUT="$(cat 2>/dev/null || true)"
fi

AGENT_NAME="${CLAUDE_AGENT_NAME:-${CLAUDE_TASK_AGENT:-unknown}}"
PROMPT="${CLAUDE_TASK_PROMPT:-${1:-}}"
if [[ -n "$HOOK_INPUT" ]] && command -v jq >/dev/null 2>&1; then
  AGENT_NAME="$(printf '%s' "$HOOK_INPUT" | jq -r '.tool_input.subagent_type // .subagent_type // .agent // empty' 2>/dev/null || echo "$AGENT_NAME")"
  PROMPT="$(printf '%s' "$HOOK_INPUT" | jq -r '.tool_input.prompt // .prompt // empty' 2>/dev/null || echo "$PROMPT")"
fi

AGENT_NAME="$(printf '%s' "$AGENT_NAME" | tr '[:upper:]' '[:lower:]')"
PROMPT_LOWER="$(printf '%s' "$PROMPT" | tr '[:upper:]' '[:lower:]')"

case "$AGENT_NAME" in
  *marketo*)
    ;;
  *)
    emit_pretool_noop
    exit 0
    ;;
esac

case "$AGENT_NAME" in
  *governance*|*validator*|unknown)
    emit_pretool_noop
    exit 0
    ;;
esac

RISK_LEVEL="LOW"
RISK_REASON=""
BLOCKED="false"
REQUIRES_APPROVAL="false"

if printf '%s' "$PROMPT_LOWER" | grep -qE '(delete all|purge|mass delete|bulk delete|remove all leads|wipe workspace|clear all data)'; then
  RISK_LEVEL="CRITICAL"
  RISK_REASON="Mass-destructive Marketo operation detected"
  BLOCKED="true"
fi

if [[ "$BLOCKED" != "true" ]]; then
  case "$AGENT_NAME" in
    *data-operations*|*bulk*|*automation-orchestrator*|*orchestrator*)
      if printf '%s' "$PROMPT_LOWER" | grep -qE '(import|export|update|upsert|merge|delete|sync|clone|activate|schedule|request)' && \
         printf '%s' "$PROMPT_LOWER" | grep -qE '([0-9]{4,}|all leads|all programs|entire database|bulk|mass|workspace-wide)'; then
        RISK_LEVEL="HIGH"
        RISK_REASON="Large-scale Marketo bulk operation"
        REQUIRES_APPROVAL="true"
      fi
      ;;
    *smart-campaign-api-specialist*|*campaign-builder*|*webinar-orchestrator*)
      if printf '%s' "$PROMPT_LOWER" | grep -qE '(activate|schedule|request|send|launch)' && \
         printf '%s' "$PROMPT_LOWER" | grep -qE '(production|live|all leads|entire program|workspace)'; then
        RISK_LEVEL="HIGH"
        RISK_REASON="Campaign execution against production-like scope"
        REQUIRES_APPROVAL="true"
      fi
      ;;
    *sfdc-sync-specialist*|*hubspot-bridge*)
      if printf '%s' "$PROMPT_LOWER" | grep -qE '(sync|retry|replay|field mapping|backfill|bulk)'; then
        RISK_LEVEL="HIGH"
        RISK_REASON="Cross-system synchronization workflow"
        REQUIRES_APPROVAL="true"
      fi
      ;;
  esac
fi

if [[ "$RISK_LEVEL" == "LOW" ]] && \
   printf '%s' "$PROMPT_LOWER" | grep -qE '(update|change|modify|activate|schedule|request|merge|import|export)'; then
  RISK_LEVEL="MEDIUM"
  RISK_REASON="Mutating Marketo operation"
fi

TIMESTAMP="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
LOG_DIR="${CLAUDE_PROJECT_ROOT:-$(pwd)}/.claude/logs/hooks"
mkdir -p "$LOG_DIR" 2>/dev/null || true
LOG_FILE="$LOG_DIR/marketo-agent-governance-$(date +%Y-%m-%d).jsonl"

if command -v jq >/dev/null 2>&1; then
  jq -nc \
    --arg ts "$TIMESTAMP" \
    --arg agent "$AGENT_NAME" \
    --arg risk "$RISK_LEVEL" \
    --arg reason "$RISK_REASON" \
    --arg blocked "$BLOCKED" \
    --arg approval "$REQUIRES_APPROVAL" \
    '{timestamp: $ts, agent: $agent, risk_level: $risk, reason: $reason, blocked: ($blocked == "true"), requires_approval: ($approval == "true")}' \
    >> "$LOG_FILE" 2>/dev/null || true
fi

if [[ "$BLOCKED" == "true" ]]; then
  echo "BLOCKED: Marketo Agent Governance" >&2
  echo "  Agent: $AGENT_NAME" >&2
  echo "  Risk: $RISK_LEVEL - $RISK_REASON" >&2
  emit_pretool_response \
    "deny" \
    "MARKETO_GOVERNANCE_BLOCKED: ${RISK_REASON}." \
    "Agent ${AGENT_NAME} was blocked by Marketo governance. Route this through an approved, reviewed plan before retrying."
  exit 0
fi

if [[ "$REQUIRES_APPROVAL" == "true" ]]; then
  echo "Marketo Agent Governance: Approval Recommended" >&2
  echo "  Agent: $AGENT_NAME" >&2
  echo "  Risk: $RISK_LEVEL - $RISK_REASON" >&2
  emit_pretool_response \
    "allow" \
    "MARKETO_GOVERNANCE_APPROVAL_RECOMMENDED: ${RISK_REASON}." \
    "Marketo governance marked ${AGENT_NAME} as ${RISK_LEVEL} risk. Confirm approval before irreversible or high-volume execution."
  exit 0
fi

emit_pretool_noop
exit 0
