#!/bin/bash
#
# UserPromptSubmit Hook Wrapper
#
# This wrapper bridges Claude Code's UserPromptSubmit hook → pre-task-hook.sh
#
# Claude Code passes hook input as JSON via stdin with this structure:
# {
#   "user_message": "the user's request",
#   "cwd": "/current/working/directory",
#   "hook_event_name": "UserPromptSubmit"
# }
#
# We extract user_message and pass it to the existing pre-task-hook.sh

set -euo pipefail

# Read JSON input from stdin
HOOK_INPUT=$(cat)

# Extract user message (try multiple field names for compatibility)
USER_MESSAGE=$(echo "$HOOK_INPUT" | jq -r '.user_message // .message // ""' 2>/dev/null || echo "")

# Debug logging (if debug flag enabled)
if [ "${CLAUDE_DEBUG:-0}" = "1" ]; then
  echo "[UserPromptSubmit Hook] Received: $USER_MESSAGE" >&2
fi

# If no user message found, exit gracefully
if [ -z "$USER_MESSAGE" ]; then
  exit 0
fi

# Call the existing pre-task-hook.sh with the user message
# Use CLAUDE_PLUGIN_ROOT if available, otherwise fallback to relative path
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
PRE_TASK_HOOK="$PLUGIN_ROOT/hooks/pre-task-hook.sh"

if [ -f "$PRE_TASK_HOOK" ]; then
  bash "$PRE_TASK_HOOK" "$USER_MESSAGE"
else
  echo "⚠️  Warning: pre-task-hook.sh not found at $PRE_TASK_HOOK" >&2
  exit 0
fi
