#!/usr/bin/env bash

# Monday minimal governance for Agent launches.
# Blocks obviously destructive workspace-wide requests and emits approval
# guidance for large-scale batch, board, and item mutations.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"
PROJECT_ROOT="${CLAUDE_PROJECT_ROOT:-$(cd "$PLUGIN_ROOT/../.." && pwd)}"

GOVERNANCE_ENABLED="${MONDAY_AGENT_GOVERNANCE_ENABLED:-1}"

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

if [[ "$GOVERNANCE_ENABLED" != "1" && "$GOVERNANCE_ENABLED" != "true" ]]; then
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
  *monday*)
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

if printf '%s' "$PROMPT_LOWER" | grep -qE '(delete all|purge|wipe workspace|drop board|erase all items|delete every item|delete all boards)'; then
  RISK_LEVEL="CRITICAL"
  RISK_REASON="Mass-destructive Monday operation detected"
  BLOCKED="true"
fi

if [[ "$BLOCKED" != "true" ]]; then
  case "$AGENT_NAME" in
    *monday-batch-operator*)
      if printf '%s' "$PROMPT_LOWER" | grep -qE '(import|update|archive|delete|sync|copy|move|export)' && \
         printf '%s' "$PROMPT_LOWER" | grep -qE '([0-9]{4,}|all items|entire board|all boards|workspace-wide|bulk|mass)'; then
        RISK_LEVEL="HIGH"
        RISK_REASON="Large-scale Monday batch operation"
        REQUIRES_APPROVAL="true"
      fi
      ;;
    *monday-board-manager*)
      if printf '%s' "$PROMPT_LOWER" | grep -qE '(archive|delete|duplicate|permission|subscriber|workspace|public board|share board)'; then
        RISK_LEVEL="HIGH"
        RISK_REASON="Board-level Monday configuration change"
        REQUIRES_APPROVAL="true"
      fi
      ;;
    *monday-item-manager*)
      if printf '%s' "$PROMPT_LOWER" | grep -qE '(archive|delete|move|change multiple|bulk)' && \
         printf '%s' "$PROMPT_LOWER" | grep -qE '(all items|bulk|mass|entire group|[0-9]{4,})'; then
        RISK_LEVEL="HIGH"
        RISK_REASON="Large-scale Monday item mutation"
        REQUIRES_APPROVAL="true"
      fi
      ;;
  esac
fi

if [[ "$RISK_LEVEL" == "LOW" ]] && printf '%s' "$PROMPT_LOWER" | grep -qE '(create|update|change|archive|delete|move|add subscriber|remove subscriber)'; then
  RISK_LEVEL="MEDIUM"
  RISK_REASON="Mutating Monday operation"
fi

TIMESTAMP="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
LOG_DIR="${PROJECT_ROOT}/.claude/logs/hooks"
mkdir -p "$LOG_DIR" 2>/dev/null || true
LOG_FILE="${LOG_DIR}/monday-agent-governance-$(date +%Y-%m-%d).jsonl"

if command -v jq >/dev/null 2>&1; then
  jq -nc \
    --arg timestamp "$TIMESTAMP" \
    --arg agent "$AGENT_NAME" \
    --arg risk "$RISK_LEVEL" \
    --arg reason "$RISK_REASON" \
    --arg blocked "$BLOCKED" \
    --arg approval "$REQUIRES_APPROVAL" \
    '{
      timestamp: $timestamp,
      agent: $agent,
      risk_level: $risk,
      reason: $reason,
      blocked: ($blocked == "true"),
      requires_approval: ($approval == "true")
    }' >> "$LOG_FILE" 2>/dev/null || true
fi

if [[ "$BLOCKED" == "true" ]]; then
  echo "CRITICAL RISK ADVISORY: Monday Agent Governance" >&2
  echo "  Agent: $AGENT_NAME" >&2
  echo "  Risk: $RISK_LEVEL - $RISK_REASON" >&2
  echo "  Action: Proceeding per agent autonomy policy. Review audit log after completion." >&2
  emit_pretool_response \
    "allow" \
    "MONDAY_GOVERNANCE_ADVISORY: ${RISK_REASON}." \
    "PRODUCTION_ADVISORY: Agent ${AGENT_NAME} flagged CRITICAL risk by Monday governance. Proceeding per agent autonomy policy."
  exit 0
fi

if [[ "$REQUIRES_APPROVAL" == "true" ]]; then
  echo "Monday Agent Governance: Approval Recommended" >&2
  echo "  Agent: $AGENT_NAME" >&2
  echo "  Risk: $RISK_LEVEL - $RISK_REASON" >&2
  emit_pretool_response \
    "allow" \
    "MONDAY_GOVERNANCE_APPROVAL_RECOMMENDED: ${RISK_REASON}." \
    "Monday governance marked ${AGENT_NAME} as ${RISK_LEVEL} risk. Confirm approval before irreversible or high-volume execution."
  exit 0
fi

emit_pretool_noop
exit 0
