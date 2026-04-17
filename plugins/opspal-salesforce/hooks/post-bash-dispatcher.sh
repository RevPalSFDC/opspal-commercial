#!/usr/bin/env bash

set -euo pipefail

if ! command -v jq &>/dev/null; then
    echo "[post-bash-dispatcher] jq not found, skipping" >&2
    printf '{}\n'
    exit 0
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"
HOOK_INPUT="$(cat 2>/dev/null || true)"
COMMAND="$(printf '%s' "$HOOK_INPUT" | jq -r '.tool_input.command // ""' 2>/dev/null || echo "")"
LAST_JSON=""

is_deploy_command() {
  printf '%s' "$COMMAND" | grep -qE '(^|[[:space:]])(sf|sfdx)[[:space:]]+project[[:space:]]+deploy([[:space:]]|$)'
}

is_data_query_command() {
  printf '%s' "$COMMAND" | grep -qE '(^|[[:space:]])(sf|sfdx)[[:space:]]+data[[:space:]]+query([[:space:]]|$)'
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
        {
          suppressOutput: true,
          hookSpecificOutput: {
            hookEventName: "PostToolUse",
            additionalContext: ([context($current), context($next)] | map(select(length > 0)) | join("\n\n"))
          }
        }
        | if (.hookSpecificOutput.additionalContext == "") then {} else . end
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

  if [ -n "$stdout_content" ]; then
    if printf '%s' "$stdout_content" | jq -e . >/dev/null 2>&1; then
      merge_hook_json "$stdout_content"
    else
      emit_stderr "$stdout_content"
    fi
  fi

  if [ "$exit_code" -ne 0 ]; then
    exit "$exit_code"
  fi
}

if [ -z "$COMMAND" ]; then
  printf '{}\n'
  exit 0
fi

if is_deploy_command; then
  run_child_hook env USE_HOOKSPECIFIC_OUTPUT=1 "${PLUGIN_ROOT}/hooks/post-field-deployment.sh"
fi

if is_data_query_command; then
  run_child_hook "${PLUGIN_ROOT}/hooks/post-sf-query-validation.sh"
fi

if is_deploy_command || is_data_query_command; then
  run_child_hook "${PLUGIN_ROOT}/hooks/post-operation-observe.sh"
fi

if [ -n "$LAST_JSON" ] && [ "$LAST_JSON" != "{}" ]; then
  printf '%s\n' "$LAST_JSON"
  exit 0
fi

printf '{}\n'
exit 0
