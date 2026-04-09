#!/usr/bin/env bash
# =============================================================================
# Pre-Agent Plugin Dispatcher
# =============================================================================
#
# Purpose: Replace per-plugin Agent hook registrations when Claude's
# `if: "Agent(...)"` filtering is unavailable for Agent launches.
#
# Flow:
#   1. Read the Agent hook payload once
#   2. Determine the target plugin family from subagent_type
#   3. Dispatch only that plugin's Agent governance hooks
#   4. Merge structured JSON responses and stop early on blocks
#
# Event: PreToolUse matcher "Agent"
# =============================================================================

set -euo pipefail

if [[ "${HOOK_DEBUG:-}" == "true" ]]; then
  set -x
  echo "[hook-debug] $(basename "$0") starting (pid=$$)" >&2
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "[pre-agent-plugin-dispatcher] WARNING: jq not found — plugin Agent dispatch disabled" >&2
  exit 0
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_ROOT="$(cd "$PLUGIN_ROOT/../.." && pwd)"
HOOK_INPUT="$(cat 2>/dev/null || true)"
LAST_JSON=""

emit_stderr() {
  local content="$1"

  if [ -n "$content" ]; then
    printf '%s' "$content" >&2
    case "$content" in
      *$'\n') ;;
      *) printf '\n' >&2 ;;
    esac
  fi
}

merge_hook_json() {
  local next_json="$1"

  if [ -z "$LAST_JSON" ]; then
    LAST_JSON="$next_json"
    return
  fi

  LAST_JSON="$(
    jq -nc \
      --argjson current "$LAST_JSON" \
      --argjson next "$next_json" \
      '
        def context($value): $value.hookSpecificOutput.permissionDecisionReason // "";
        def updated($value): $value.hookSpecificOutput.updatedInput // {};
        # Translate legacy blockExecution to canonical permissionDecision
        (if ($next.hookSpecificOutput.permissionDecision // $current.hookSpecificOutput.permissionDecision) != null
         then ($next.hookSpecificOutput.permissionDecision // $current.hookSpecificOutput.permissionDecision)
         elif ($next.blockExecution // $current.blockExecution // false) == true then "deny"
         else null end) as $decision |
        (if ($next.hookSpecificOutput.permissionDecisionReason // $current.hookSpecificOutput.permissionDecisionReason) != null
         then ($next.hookSpecificOutput.permissionDecisionReason // $current.hookSpecificOutput.permissionDecisionReason)
         elif ($next.blockMessage // $current.blockMessage // null) != null then ($next.blockMessage // $current.blockMessage)
         else null end) as $reason |
        ([context($current), context($next)] | map(select(length > 0)) | join("\n\n")) as $mergedReason |
        {
          suppressOutput: true,
          hookSpecificOutput: {
            hookEventName: "PreToolUse",
            permissionDecision: $decision,
            permissionDecisionReason: (if $mergedReason != "" then $mergedReason elif $reason != null then $reason else null end),
            updatedInput: (updated($current) + updated($next))
          }
        }
        | if (.hookSpecificOutput.permissionDecisionReason == "" or .hookSpecificOutput.permissionDecisionReason == null) then del(.hookSpecificOutput.permissionDecisionReason) else . end
        | if (.hookSpecificOutput.updatedInput == {}) then del(.hookSpecificOutput.updatedInput) else . end
        | if (.hookSpecificOutput.permissionDecision == null) then del(.hookSpecificOutput.permissionDecision, .hookSpecificOutput.permissionDecisionReason) else . end
      ' 2>/dev/null || printf '%s' "$next_json"
  )"
}

handle_child_output() {
  local exit_code="$1"
  local stdout_content="$2"

  if [ -z "$stdout_content" ]; then
    return
  fi

  if printf '%s' "$stdout_content" | jq -e . >/dev/null 2>&1; then
    merge_hook_json "$stdout_content"

    if [ "$exit_code" -eq 0 ]; then
      local permission_decision=""
      local block_execution=""

      permission_decision="$(printf '%s' "$LAST_JSON" | jq -r '.hookSpecificOutput.permissionDecision // empty' 2>/dev/null || echo "")"

      if [ "$permission_decision" = "deny" ]; then
        printf '%s\n' "$LAST_JSON"
        exit 0
      fi
    fi

    return
  fi

  emit_stderr "$stdout_content"
}

run_child_hook() {
  local child_plugin_root="$1"
  shift

  local stdout_file
  local stderr_file
  local exit_code
  local stdout_content
  local stderr_content

  stdout_file="$(mktemp)"
  stderr_file="$(mktemp)"

  if printf '%s' "$HOOK_INPUT" | env \
    DISPATCHER_CONTEXT=1 \
    CLAUDE_PLUGIN_ROOT="$child_plugin_root" \
    CLAUDE_PROJECT_ROOT="$PROJECT_ROOT" \
    "$@" >"$stdout_file" 2>"$stderr_file"; then
    exit_code=0
  else
    exit_code=$?
  fi

  stdout_content="$(cat "$stdout_file")"
  stderr_content="$(cat "$stderr_file")"
  rm -f "$stdout_file" "$stderr_file"

  emit_stderr "$stderr_content"
  handle_child_output "$exit_code" "$stdout_content"

  if [ "$exit_code" -ne 0 ]; then
    exit "$exit_code"
  fi
}

extract_agent_name() {
  if [ -z "$HOOK_INPUT" ]; then
    echo "" >&2
    return 0
  fi

  printf '%s' "$HOOK_INPUT" | jq -r '
    if (.tool_name // "") != "Agent" then
      ""
    else
      .tool_input.subagent_type // .subagent_type // .agent // ""
    end
  ' 2>/dev/null || echo "" >&2
}

AGENT_NAME="$(extract_agent_name)"
AGENT_NAME_LOWER="$(printf '%s' "$AGENT_NAME" | tr '[:upper:]' '[:lower:]')"

if [ -z "$AGENT_NAME_LOWER" ]; then
  exit 0
fi

case "$AGENT_NAME_LOWER" in
  *hubspot*)
    HUBSPOT_ROOT="${PROJECT_ROOT}/plugins/opspal-hubspot"
    run_child_hook "$HUBSPOT_ROOT" "${HUBSPOT_ROOT}/hooks/universal-agent-governance.sh"
    run_child_hook "$HUBSPOT_ROOT" "${HUBSPOT_ROOT}/hooks/pre-task-agent-validator.sh"
    run_child_hook "$HUBSPOT_ROOT" "${HUBSPOT_ROOT}/hooks/pre-task-mandatory.sh"
    ;;
  *marketo*)
    MARKETO_ROOT="${PROJECT_ROOT}/plugins/opspal-marketo"
    run_child_hook "$MARKETO_ROOT" "${MARKETO_ROOT}/hooks/universal-agent-governance.sh"
    run_child_hook "$MARKETO_ROOT" "${MARKETO_ROOT}/hooks/pre-intelligence-analysis.sh"
    ;;
  *monday*)
    MONDAY_ROOT="${PROJECT_ROOT}/plugins/opspal-monday"
    run_child_hook "$MONDAY_ROOT" "${MONDAY_ROOT}/hooks/universal-agent-governance.sh"
    ;;
  *opspal-okrs*|*okr-*)
    OKR_ROOT="${PROJECT_ROOT}/plugins/opspal-okrs"
    run_child_hook "$OKR_ROOT" "${OKR_ROOT}/hooks/pre-task-okr-approval-gate.sh"
    ;;
  *opspal-gtm-planning*|*gtm-*|*forecast-orchestrator*)
    GTM_ROOT="${PROJECT_ROOT}/plugins/opspal-gtm-planning"
    run_child_hook "$GTM_ROOT" "${GTM_ROOT}/hooks/pre-task-gtm-approval-gate.sh"
    ;;
  *)
    ;;
esac

if [ -n "$LAST_JSON" ]; then
  printf '%s\n' "$LAST_JSON"
fi
