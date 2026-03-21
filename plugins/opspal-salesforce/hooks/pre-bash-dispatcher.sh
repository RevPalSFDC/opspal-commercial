#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"
HOOK_INPUT="$(cat 2>/dev/null || true)"
COMMAND="$(printf '%s' "$HOOK_INPUT" | jq -r '.tool_input.command // ""' 2>/dev/null || echo "")"
LAST_JSON=""

is_deploy_scope_command() {
  printf '%s' "$COMMAND" | grep -qE '(^|[[:space:]])sf[[:space:]]+project[[:space:]]+deploy[[:space:]]+(start|validate|preview)([[:space:]]|$)'
}

is_data_query_command() {
  printf '%s' "$COMMAND" | grep -qE '(^|[[:space:]])sf[[:space:]]+data[[:space:]]+query([[:space:]]|$)'
}

uses_jq() {
  printf '%s' "$COMMAND" | grep -q 'jq'
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
        def context($value): $value.hookSpecificOutput.additionalContext // "";
        def updated($value): $value.hookSpecificOutput.updatedInput // {};
        {
          suppressOutput: true,
          hookSpecificOutput: {
            hookEventName: "PreToolUse",
            permissionDecision: ($next.hookSpecificOutput.permissionDecision // $current.hookSpecificOutput.permissionDecision),
            permissionDecisionReason: ($next.hookSpecificOutput.permissionDecisionReason // $current.hookSpecificOutput.permissionDecisionReason),
            additionalContext: ([context($current), context($next)] | map(select(length > 0)) | join("\n\n")),
            updatedInput: (updated($current) + updated($next))
          }
        }
        | if (.hookSpecificOutput.additionalContext == "") then del(.hookSpecificOutput.additionalContext) else . end
        | if (.hookSpecificOutput.updatedInput == {}) then del(.hookSpecificOutput.updatedInput) else . end
        | if (.hookSpecificOutput.permissionDecision == null) then del(.hookSpecificOutput.permissionDecision, .hookSpecificOutput.permissionDecisionReason) else . end
      ' 2>/dev/null || printf '%s' "$next_json"
  )"
}

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

handle_child_output() {
  local exit_code="$1"
  local stdout_content="$2"

  if [ -z "$stdout_content" ]; then
    return
  fi

  if printf '%s' "$stdout_content" | jq -e . >/dev/null 2>&1; then
    merge_hook_json "$stdout_content"

    if [ "$exit_code" -eq 0 ]; then
      local permission_decision
      permission_decision="$(printf '%s' "$stdout_content" | jq -r '.hookSpecificOutput.permissionDecision // empty' 2>/dev/null || echo "")"
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
  local stdout_file
  local stderr_file
  local exit_code
  local stdout_content
  local stderr_content

  stdout_file="$(mktemp)"
  stderr_file="$(mktemp)"

  if printf '%s' "$HOOK_INPUT" | "$@" >"$stdout_file" 2>"$stderr_file"; then
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

if [ -z "$COMMAND" ]; then
  exit 0
fi

if is_deploy_scope_command; then
  run_child_hook "${PLUGIN_ROOT}/hooks/pre-deploy-agent-context-check.sh"
  run_child_hook env PRETOOLUSE_MODE=1 "${PLUGIN_ROOT}/hooks/pre-deployment-comprehensive-validation.sh"
  run_child_hook "${PLUGIN_ROOT}/hooks/pre-deploy-flow-validation.sh"
  run_child_hook "${PLUGIN_ROOT}/hooks/pre-deploy-report-quality-gate.sh"
fi

if is_data_query_command; then
  run_child_hook "${PLUGIN_ROOT}/hooks/pre-bash-soql-validator.sh"
fi

if uses_jq; then
  run_child_hook "${PLUGIN_ROOT}/hooks/pre-bash-jq-validator.sh"
fi

if [ -n "$LAST_JSON" ]; then
  printf '%s\n' "$LAST_JSON"
fi

exit 0
