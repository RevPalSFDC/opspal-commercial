#!/bin/bash
#
# Auto-Router Hook Adapter
#
# This hook integrates the sophisticated auto-agent-router.js with Claude Code's hook system.
# It provides:
# - Complexity analysis (0.0 - 1.0 score)
# - Confidence-based routing (0.0 - 1.0 score)
# - Pattern matching across 15+ agent types
# - Analytics tracking
#
# Output: JSON with systemMessage for Claude

set -euo pipefail

# Get plugin root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
resolve_domain_root() {
  local dir="$1"
  while [[ "$dir" != "/" ]]; do
    if [[ -d "$dir/scripts" ]]; then
      echo "$dir"
      return 0
    fi
    dir="$(dirname "$dir")"
  done
  echo "$1"
}

DOMAIN_ROOT="$(resolve_domain_root "$SCRIPT_DIR")"
PLUGIN_ROOT="$DOMAIN_ROOT"
if [[ -n "${CLAUDE_PLUGIN_ROOT:-}" ]]; then
  DOMAIN_NAME="$(basename "$DOMAIN_ROOT")"
  case "$CLAUDE_PLUGIN_ROOT" in
    *"/packages/domains/$DOMAIN_NAME"|*/"$DOMAIN_NAME"-plugin) PLUGIN_ROOT="$CLAUDE_PLUGIN_ROOT" ;;
  esac
fi

# Load progress helper
source "$PLUGIN_ROOT/scripts/lib/hook-progress-helper.sh"

# Read JSON input from stdin
HOOK_INPUT=$(cat)

# Extract user message
USER_MESSAGE=$(echo "$HOOK_INPUT" | jq -r '.user_message // .message // ""' 2>/dev/null || echo "")

# If no user message, exit gracefully
if [ -z "$USER_MESSAGE" ]; then
  echo '{}'
  exit 0
fi

AUTO_ROUTER="$PLUGIN_ROOT/scripts/auto-agent-router.js"

# Check if auto-router exists
if [ ! -f "$AUTO_ROUTER" ]; then
  # Fallback to simple pattern matching if auto-router not available
  echo '{"systemMessage": "⚠️ Auto-router not available, using basic pattern matching"}' >&2
  exit 0
fi

# Show progress while running auto-router
progress_start "Analyzing task complexity"

# Run auto-router and capture ONLY the JSON output
# The JSON is at the end of output, starts with { and contains "routed" key
ROUTER_RAW=$(node "$AUTO_ROUTER" route "$USER_MESSAGE" 2>&1)

progress_update "Processing routing decision" 75

ROUTER_OUTPUT=$(echo "$ROUTER_RAW" | grep -B1 -A10 '"routed"' | grep -E '^\{|"routed"|"agent"|"autoInvoked"|"confidence"|"complexity"|"requiresConfirmation"|^\}' | tr -d '\n' | sed 's/  //g' || echo '{"routed":false}')

# Parse routing decision
ROUTED=$(echo "$ROUTER_OUTPUT" | jq -r '.routed // false' 2>/dev/null || echo "false")

if [ "$ROUTED" = "false" ]; then
  # No routing decision - allow normal execution
  progress_complete "Analysis complete: No specific routing needed"
  echo '{}'
  exit 0
fi

progress_update "Finalizing routing recommendation" 90

# Extract routing details
AGENT=$(echo "$ROUTER_OUTPUT" | jq -r '.agent // ""')
CONFIDENCE=$(echo "$ROUTER_OUTPUT" | jq -r '.confidence // 0')
COMPLEXITY=$(echo "$ROUTER_OUTPUT" | jq -r '.complexity // 0')
AUTO_INVOKED=$(echo "$ROUTER_OUTPUT" | jq -r '.autoInvoked // false')

# Convert to percentages for display
CONFIDENCE_PCT=$(echo "$CONFIDENCE * 100" | bc | cut -d. -f1)
COMPLEXITY_PCT=$(echo "$COMPLEXITY * 100" | bc | cut -d. -f1)

# Determine message type based on auto-invoke decision
if [ "$AUTO_INVOKED" = "true" ]; then
  # High confidence or high complexity - strong recommendation
  SYSTEM_MSG="🤖 AUTO-ROUTING RECOMMENDATION

Agent: $AGENT
Confidence: $CONFIDENCE_PCT% | Complexity: $COMPLEXITY_PCT%

This task has been analyzed and requires the specialized $AGENT agent.

To proceed:
→ Use Task tool with subagent_type='$AGENT'

This recommendation is based on:
- Task complexity analysis
- Pattern matching across operation types
- Historical success rates"

  progress_complete "Analysis complete: Routing to $AGENT (${CONFIDENCE_PCT}% confidence)" true

  jq -n \
    --arg msg "$SYSTEM_MSG" \
    --arg agent "$AGENT" \
    --argjson confidence "$CONFIDENCE" \
    --argjson complexity "$COMPLEXITY" \
    '{systemMessage: $msg, suggestedAgent: $agent, confidence: $confidence, complexity: $complexity, autoRouted: true}'

elif [ "$AGENT" != "" ]; then
  # Lower confidence - soft suggestion
  SYSTEM_MSG="💡 Agent Suggestion (Confidence: $CONFIDENCE_PCT%)

Consider using: $AGENT

Task complexity: $COMPLEXITY_PCT%

While not mandatory, this agent can help with this operation."

  progress_complete "Analysis complete: Suggesting $AGENT (${CONFIDENCE_PCT}% confidence)" true

  jq -n \
    --arg msg "$SYSTEM_MSG" \
    --arg agent "$AGENT" \
    --argjson confidence "$CONFIDENCE" \
    --argjson complexity "$COMPLEXITY" \
    '{systemMessage: $msg, suggestedAgent: $agent, confidence: $confidence, complexity: $complexity, autoRouted: false}'

else
  # No specific agent recommendation
  progress_complete "Analysis complete: No specific agent recommendation"
  echo '{}'
fi

exit 0
