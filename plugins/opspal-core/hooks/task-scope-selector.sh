#!/usr/bin/env bash
#
# Task Scope Selector Hook
#
# Purpose: Narrow active plugin/skill guidance for the current task and persist
#          a scoped allowlist in ~/.claude/session-context/task-scope.json.
#
# Event: UserPromptSubmit
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(dirname "$SCRIPT_DIR")"
SELECTOR_SCRIPT="$PLUGIN_ROOT/scripts/lib/task-scope-selector.js"
STATE_FILE="${TASK_SCOPE_STATE_FILE:-$HOME/.claude/session-context/task-scope.json}"
ENABLED="${TASK_SCOPE_SELECTION_ENABLED:-1}"

if [[ "$ENABLED" != "1" ]] || [[ ! -f "$SELECTOR_SCRIPT" ]] || ! command -v node >/dev/null 2>&1; then
  printf '{}\n'
  exit 0
fi

# Dispatcher guard — this hook is invoked by user-prompt-dispatcher.sh.
# When run standalone (no dispatcher context and stdin is a terminal),
# exit cleanly rather than firing against ambient terminal input.
if [[ "${DISPATCHER_CONTEXT:-0}" != "1" ]] && [[ -t 0 ]]; then
  echo "[$(basename "$0")] INFO: standalone invocation — no dispatcher context, skipping" >&2
  exit 0
fi

HOOK_INPUT=""
if [[ ! -t 0 ]]; then
  HOOK_INPUT=$(cat)
fi

if [[ -z "${HOOK_INPUT// }" ]]; then
  printf '{}\n'
  exit 0
fi

CONTEXT=$(printf '%s' "$HOOK_INPUT" | node "$SELECTOR_SCRIPT" from-hook \
  --format userprompt-context \
  --state-file "$STATE_FILE" \
  --save true 2>/dev/null || true)

if [[ -z "${CONTEXT// }" ]]; then
  printf '{}\n'
  exit 0
fi

if command -v jq &>/dev/null; then
  jq -n \
    --arg context "$CONTEXT" \
    '{
      suppressOutput: true,
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext: ($context | gsub("\\s+"; " ") | sub("\\s+$"; ""))
      }
    }'
else
  printf '{}\n'
fi
