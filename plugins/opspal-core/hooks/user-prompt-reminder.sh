#!/usr/bin/env bash
# STATUS: SUPERSEDED — called as child hook by user-prompt-dispatcher.sh (the registered UserPromptSubmit hook)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_REMINDER_PATH="$SCRIPT_DIR/../docs/reminder.md"
REMINDER_PATH="${REMINDER_PATH:-$DEFAULT_REMINDER_PATH}"

if [ ! -f "$REMINDER_PATH" ]; then
  echo '{}'
  exit 0
fi

if ! command -v jq >/dev/null 2>&1; then
  echo '{}'
  exit 0
fi

ESCAPED_TEXT="$(jq -Rs . < "$REMINDER_PATH" 2>/dev/null || printf '""')"

cat <<EOF
{
  "suppressOutput": true,
  "hookSpecificOutput": {
    "hookEventName": "UserPromptSubmit",
    "additionalContext": ${ESCAPED_TEXT}
  }
}
EOF

exit 0
