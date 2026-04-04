#!/usr/bin/env bash
# =============================================================================
# SOP Prompt Lifecycle Detector (UserPromptSubmit child)
# =============================================================================
# Purpose: Detect explicit work lifecycle signals in user prompts and emit
#          corresponding SOP events (work.blocked, work.started, work.logged).
# Feature flag: SOP_ENABLED (default: 0)
# Confidence: All events emitted as inferred_low.
# Mutation boundary: This hook ONLY calls the SOP runtime. No direct mutations.
# Pattern: Fires only on high-confidence signal phrases to avoid false positives.
# =============================================================================

set -euo pipefail

# Feature flag
SOP_ENABLED="${SOP_ENABLED:-1}"
[ "$SOP_ENABLED" != "1" ] && exit 0

# Dispatcher guard
[ "${DISPATCHER_CONTEXT:-0}" != "1" ] && [ -t 0 ] && exit 0

# Read input
HOOK_INPUT=""
[ ! -t 0 ] && HOOK_INPUT=$(cat 2>/dev/null || true)
[ -z "$HOOK_INPUT" ] && { printf '{}\n'; exit 0; }

# jq required
command -v jq &>/dev/null || { printf '{}\n'; exit 0; }

# Extract user message
MSG=$(printf '%s' "$HOOK_INPUT" | jq -r '.prompt // .message // .user_message // empty' 2>/dev/null || true)
[ -z "$MSG" ] && { printf '{}\n'; exit 0; }

MSG_LOWER=$(printf '%s' "$MSG" | tr '[:upper:]' '[:lower:]')

# Detect lifecycle signal — high-confidence phrases only
EVENT_TYPE=""
if printf '%s' "$MSG_LOWER" | grep -qE "(i('m| am) blocked|work is blocked|blocked on|can't proceed|waiting on|stuck on)" 2>/dev/null; then
  EVENT_TYPE="work.blocked"
elif printf '%s' "$MSG_LOWER" | grep -qE "(i('m| am) starting work|starting work on|beginning work|kicking off)" 2>/dev/null; then
  EVENT_TYPE="work.started"
elif printf '%s' "$MSG_LOWER" | grep -qE "(work is (done|complete|finished)|i('ve| have) completed|wrapping up|all done)" 2>/dev/null; then
  EVENT_TYPE="work.logged"
fi

[ -z "$EVENT_TYPE" ] && { printf '{}\n'; exit 0; }

# Resolve plugin root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Verify SOP runtime
SOP_RUNTIME="$PLUGIN_ROOT/scripts/lib/sop/sop-runtime.js"
[ ! -f "$SOP_RUNTIME" ] && { printf '{}\n'; exit 0; }
command -v node &>/dev/null || { printf '{}\n'; exit 0; }

# Resolve org
ORG="${ORG_SLUG:-${CLIENT_ORG:-}}"
[ -z "$ORG" ] && { printf '{}\n'; exit 0; }

CONTEXT=$(jq -nc --arg org "$ORG" --arg src "user_prompt" \
  '{org_slug: $org, source: $src}')

RESULT=$(node "$SOP_RUNTIME" --event "$EVENT_TYPE" --confidence "inferred_low" --context "$CONTEXT" 2>/dev/null || echo '{}')

SYSTEM_MSG=$(printf '%s' "$RESULT" | jq -r '.system_message // empty' 2>/dev/null || true)
if [ -n "$SYSTEM_MSG" ]; then
  jq -nc --arg msg "$SYSTEM_MSG" '{
    suppressOutput: true,
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext: $msg
    }
  }'
else
  printf '{}\n'
fi
