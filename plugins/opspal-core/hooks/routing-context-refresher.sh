#!/bin/bash
#
# routing-context-refresher.sh - Post-compaction & periodic routing context injection
#
# UserPromptSubmit hook that injects condensed routing reminders:
# 1. After context compaction (detected via sentinel file)
# 2. Periodically every N messages (default 20, configurable)
#
# Configuration:
#   ENABLE_ROUTING_REFRESH=1          # Enable (default)
#   ENABLE_ROUTING_REFRESH=0          # Disable entirely
#   ROUTING_REFRESH_INTERVAL=20       # Messages between periodic refreshes (0=disable periodic)
#
# Exit Codes:
#   0 = Success (with or without injection)
#

set -euo pipefail

# Configuration
ENABLE="${ENABLE_ROUTING_REFRESH:-1}"
INTERVAL="${ROUTING_REFRESH_INTERVAL:-20}"
COOLDOWN_SECONDS="${ROUTING_REFRESH_COOLDOWN_SECONDS:-600}"
SENTINEL_DIR="$HOME/.claude/session-context"
SENTINEL_FILE="$SENTINEL_DIR/.needs-routing-refresh"
COUNTER_FILE="/tmp/.routing-refresh-counter-${USER:-$(id -un 2>/dev/null || echo default)}"
CONDENSED_FILE="$SENTINEL_DIR/condensed-routing.txt"
STATE_FILE="$SENTINEL_DIR/routing-refresh-state.json"

# Quick exit if disabled
if [ "$ENABLE" = "0" ]; then
  echo '{}'
  exit 0
fi

HOOK_INPUT=""
if [ ! -t 0 ]; then
  HOOK_INPUT=$(cat)
fi

extract_user_message() {
  if [ -z "${HOOK_INPUT// }" ]; then
    return
  fi

  echo "$HOOK_INPUT" | jq -r '.user_message // .userPrompt // .prompt // .userMessage // .message // ""' 2>/dev/null || echo ""
}

is_specific_prompt() {
  local message="$1"
  local message_lower

  message_lower=$(echo "$message" | tr '[:upper:]' '[:lower:]')

  if [ -z "${message_lower// }" ]; then
    return 1
  fi

  if [ "${#message_lower}" -ge 120 ]; then
    return 0
  fi

  if echo "$message_lower" | grep -qE '^/'; then
    return 0
  fi

  if echo "$message_lower" | grep -qE '\b(agent\(|subagent_type|salesforce|sfdc|hubspot|marketo|okr|gtm|monday|flow|apex|soql|deploy|audit|validation rule|territory|report|dashboard)\b'; then
    return 0
  fi

  return 1
}

was_recently_injected() {
  if [ ! -f "$STATE_FILE" ] || ! command -v jq >/dev/null 2>&1; then
    return 1
  fi

  local last_epoch now age
  last_epoch=$(jq -r '.lastInjectedEpoch // 0' "$STATE_FILE" 2>/dev/null || echo "0")
  if ! [[ "$last_epoch" =~ ^[0-9]+$ ]]; then
    return 1
  fi

  now=$(date +%s)
  age=$((now - last_epoch))

  [ "$age" -lt "$COOLDOWN_SECONDS" ]
}

record_injection() {
  mkdir -p "$SENTINEL_DIR" 2>/dev/null || true
  jq -n \
    --arg reason "$1" \
    --arg text "$2" \
    --argjson epoch "$(date +%s)" \
    '{
      lastInjectedEpoch: $epoch,
      lastReason: $reason,
      lastText: $text
    }' > "$STATE_FILE" 2>/dev/null || true
}

SHOULD_INJECT=false
REASON=""

# Check 1: Post-compaction sentinel
if [ -f "$SENTINEL_FILE" ]; then
  SHOULD_INJECT=true
  REASON="post-compaction"
  rm -f "$SENTINEL_FILE" 2>/dev/null || true
  # Reset counter on compaction
  echo "0" > "$COUNTER_FILE" 2>/dev/null || true
fi

# Check 2: Periodic refresh (only if not already injecting)
if [ "$SHOULD_INJECT" = "false" ] && [ "$INTERVAL" != "0" ]; then
  CURRENT_COUNT=0
  if [ -f "$COUNTER_FILE" ]; then
    CURRENT_COUNT=$(cat "$COUNTER_FILE" 2>/dev/null || echo "0")
    # Validate it's a number
    if ! [[ "$CURRENT_COUNT" =~ ^[0-9]+$ ]]; then
      CURRENT_COUNT=0
    fi
  fi

  CURRENT_COUNT=$((CURRENT_COUNT + 1))

  if [ "$CURRENT_COUNT" -ge "$INTERVAL" ]; then
    SHOULD_INJECT=true
    REASON="periodic ($CURRENT_COUNT messages)"
    CURRENT_COUNT=0
  fi

  echo "$CURRENT_COUNT" > "$COUNTER_FILE" 2>/dev/null || true
fi

# If no injection needed, exit fast
if [ "$SHOULD_INJECT" = "false" ]; then
  echo '{}'
  exit 0
fi

USER_MESSAGE="$(extract_user_message)"
if [ "$REASON" != "post-compaction" ] && is_specific_prompt "$USER_MESSAGE"; then
  echo '{}'
  exit 0
fi

if [ "$REASON" != "post-compaction" ] && was_recently_injected; then
  echo '{}'
  exit 0
fi

# Get condensed routing text
ROUTING_TEXT=""

# Fast path: read pre-generated file
if [ -f "$CONDENSED_FILE" ]; then
  ROUTING_TEXT=$(cat "$CONDENSED_FILE" 2>/dev/null || true)
fi

# Slow path: generate on the fly if file missing or empty
if [ -z "$ROUTING_TEXT" ]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  REFRESHER_SCRIPT="$SCRIPT_DIR/../scripts/lib/routing-context-refresher.js"

  if [ -f "$REFRESHER_SCRIPT" ]; then
    ROUTING_TEXT=$(timeout 3 node "$REFRESHER_SCRIPT" --format=compact 2>/dev/null || true)
  fi
fi

# Fallback: hardcoded minimal reminder
if [ -z "$ROUTING_TEXT" ]; then
  ROUTING_TEXT="ROUTING REMINDER: For revops/audit use sfdc-revops-auditor, cpq/quote use sfdc-cpq-assessor, automation audit use sfdc-automation-auditor, hubspot assessment use hubspot-assessment-analyzer. Always invoke via Agent(subagent_type='<agent>', prompt=<request>)."
fi

# Escape for JSON
ESCAPED_TEXT=$(printf '%s' "$ROUTING_TEXT" | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read()))' 2>/dev/null || printf '%s' "$ROUTING_TEXT" | sed 's/\\/\\\\/g; s/"/\\"/g; s/\t/\\t/g' | tr '\n' ' ')

# Output injection via hookSpecificOutput
cat <<EOF
{
  "suppressOutput": true,
  "hookSpecificOutput": {
    "hookEventName": "UserPromptSubmit",
    "additionalContext": ${ESCAPED_TEXT}
  }
}
EOF

record_injection "$REASON" "$ROUTING_TEXT"

exit 0
