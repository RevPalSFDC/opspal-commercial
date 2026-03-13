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
SENTINEL_DIR="$HOME/.claude/session-context"
SENTINEL_FILE="$SENTINEL_DIR/.needs-routing-refresh"
COUNTER_FILE="/tmp/.routing-refresh-counter-${USER:-$(id -un 2>/dev/null || echo default)}"
CONDENSED_FILE="$SENTINEL_DIR/condensed-routing.txt"

# Quick exit if disabled
if [ "$ENABLE" = "0" ]; then
  echo '{}'
  exit 0
fi

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
  ROUTING_TEXT="ROUTING REMINDER: For revops/audit use sfdc-revops-auditor, cpq/quote use sfdc-cpq-assessor, automation audit use sfdc-automation-auditor, hubspot assessment use hubspot-assessment-analyzer. Always invoke via Task(subagent_type='<agent>', prompt=<request>)."
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

exit 0
