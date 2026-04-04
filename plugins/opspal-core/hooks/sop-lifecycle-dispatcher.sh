#!/usr/bin/env bash
# =============================================================================
# SOP Lifecycle Dispatcher (PostToolUse/Agent)
# =============================================================================
# Purpose: Emit SOP lifecycle events when agents complete.
# Fires: PostToolUse (Agent matcher) via post-tool-use-agent-dispatcher.sh
# Feature flag: SOP_ENABLED (default: 0)
# Mutation boundary: This hook ONLY calls the SOP runtime. It does not perform
#   any direct mutations (no Asana calls, no work-index writes).
# =============================================================================

set -euo pipefail

# Feature flag — enabled by default
SOP_ENABLED="${SOP_ENABLED:-1}"
[ "$SOP_ENABLED" != "1" ] && exit 0

# jq required
command -v jq &>/dev/null || exit 0

# Read hook input
HOOK_INPUT=""
if [ "${DISPATCHER_CONTEXT:-0}" = "1" ] || [ ! -t 0 ]; then
  HOOK_INPUT=$(cat 2>/dev/null || true)
fi
[ -z "$HOOK_INPUT" ] && exit 0

# Resolve plugin root (multi-strategy)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Verify SOP runtime exists
SOP_RUNTIME="$PLUGIN_ROOT/scripts/lib/sop/sop-runtime.js"
[ ! -f "$SOP_RUNTIME" ] && exit 0
command -v node &>/dev/null || exit 0

# Extract agent name
AGENT_NAME=""
if [ -n "${CLAUDE_AGENT_NAME:-}" ]; then
  AGENT_NAME="$CLAUDE_AGENT_NAME"
else
  AGENT_NAME=$(printf '%s' "$HOOK_INPUT" | jq -r '.tool_input.subagent_type // .agent_type // .subagent_type // .agent_name // empty' 2>/dev/null || true)
fi
[ -z "$AGENT_NAME" ] && exit 0

# Look up agent -> event mapping
SOP_AGENT_MAP="$PLUGIN_ROOT/config/sop/sop-agent-event-mappings.json"
[ ! -f "$SOP_AGENT_MAP" ] && exit 0

EVENT_TYPE=$(jq -r --arg agent "$AGENT_NAME" '.mappings[$agent].event // empty' "$SOP_AGENT_MAP" 2>/dev/null || true)
[ -z "$EVENT_TYPE" ] && exit 0

CONFIDENCE=$(jq -r --arg agent "$AGENT_NAME" '.mappings[$agent].confidence // "inferred_high"' "$SOP_AGENT_MAP" 2>/dev/null || echo "inferred_high")
CLASSIFICATION=$(jq -r --arg agent "$AGENT_NAME" '.mappings[$agent].classification // empty' "$SOP_AGENT_MAP" 2>/dev/null || true)
SUB_TYPE=$(jq -r --arg agent "$AGENT_NAME" '.mappings[$agent].sub_type // empty' "$SOP_AGENT_MAP" 2>/dev/null || true)

# Check if this is a completion event
IS_COMPLETION_AGENT=$(jq -r --arg agent "$AGENT_NAME" '.completion_agents | if . then index($agent) != null else false end' "$SOP_AGENT_MAP" 2>/dev/null || echo "false")

# Determine if we should emit work.completed instead of work.started
# If the agent is in completion_agents and the tool output indicates completion
if [ "$IS_COMPLETION_AGENT" = "true" ]; then
  TOOL_OUTPUT=$(printf '%s' "$HOOK_INPUT" | jq -r '.tool_response.output // .tool_output // empty' 2>/dev/null | head -c 500 || true)
  if printf '%s' "$TOOL_OUTPUT" | grep -qiE "(complete|finished|done|delivered|assessment complete)" 2>/dev/null; then
    EVENT_TYPE="work.completed"
  fi
fi

# Resolve org context
ORG="${ORG_SLUG:-${CLIENT_ORG:-${SF_TARGET_ORG:-}}}"
[ -z "$ORG" ] && exit 0

# Build context JSON
CONTEXT=$(jq -nc \
  --arg org_slug "$ORG" \
  --arg agent "$AGENT_NAME" \
  --arg classification "${CLASSIFICATION:-}" \
  --arg sub_type "${SUB_TYPE:-}" \
  '{org_slug: $org_slug, agent_name: $agent, classification: (if $classification != "" then $classification else null end), sub_type: (if $sub_type != "" then $sub_type else null end)}')

# Invoke SOP runtime — non-blocking, always exit 0
RESULT=$(node "$SOP_RUNTIME" \
  --event "$EVENT_TYPE" \
  --confidence "$CONFIDENCE" \
  --context "$CONTEXT" \
  2>/dev/null || echo '{}')

# If runtime returned a system_message (recommend-mode policy), inject it
SYSTEM_MSG=$(printf '%s' "$RESULT" | jq -r '.system_message // empty' 2>/dev/null || true)
if [ -n "$SYSTEM_MSG" ]; then
  jq -nc --arg msg "$SYSTEM_MSG" '{
    suppressOutput: true,
    hookSpecificOutput: {
      hookEventName: "PostToolUse",
      additionalContext: $msg
    }
  }'
else
  exit 0
fi
