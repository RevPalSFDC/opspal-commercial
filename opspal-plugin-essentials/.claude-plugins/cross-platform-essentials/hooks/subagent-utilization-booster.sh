#!/bin/bash
#
# Sub-Agent Utilization Booster Hook
#
# Purpose: Maximize the use of plugin sub-agents and tools by prepending
#          a directive to every user message encouraging Claude to delegate
#          to specialized agents.
#
# Goal: Achieve ≥70% sub-agent utilization (Supervisor-Auditor target)
#
# Configuration:
#   ENABLE_SUBAGENT_BOOST=1     # Enable (default)
#   ENABLE_SUBAGENT_BOOST=0     # Disable
#   SUBAGENT_BOOST_INTENSITY=standard|strong|maximum
#
# Output: Injects systemMessage that Claude sees before processing request
#

set -euo pipefail

# Check if node is installed (required for logging features)
NODE_AVAILABLE=0
if command -v node &> /dev/null; then
  NODE_AVAILABLE=1
fi

# OutputFormatter and HookLogger
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_FORMATTER="$SCRIPT_DIR/../scripts/lib/output-formatter.js"
HOOK_LOGGER="$SCRIPT_DIR/../scripts/lib/hook-logger.js"
HOOK_NAME="subagent-utilization-booster"

# Prevent duplicate execution if multiple hooks registered
LOCK_FILE="/tmp/claude-prompt-hook-$$"
if [ -f "$LOCK_FILE" ]; then
  # Another hook already processed this prompt
  echo '{}'
  exit 0
fi
touch "$LOCK_FILE"
trap "rm -f $LOCK_FILE" EXIT

# Check if jq is installed
if ! command -v jq &> /dev/null; then
  # jq not installed - output warning to stderr and pass through

  # Log jq missing (only if node available)
  if [ "$NODE_AVAILABLE" = "1" ] && [ -f "$HOOK_LOGGER" ]; then
    node "$HOOK_LOGGER" warning "$HOOK_NAME" "jq not installed - feature disabled" "{}"
  fi

  if [ "$NODE_AVAILABLE" = "1" ] && [ -f "$OUTPUT_FORMATTER" ]; then
    node "$OUTPUT_FORMATTER" warning \
      "Sub-Agent Utilization Booster Disabled" \
      "jq is not installed - this feature requires jq for JSON processing and will be disabled" \
      "" \
      "Install jq to enable:macOS: brew install jq,Linux: sudo apt-get install jq,Windows: choco install jq,Or run: /checkdependencies --install" \
      "Feature unavailable until jq installed"
  else
    cat >&2 << 'EOF'
⚠️  Sub-Agent Utilization Booster: jq is not installed
   This feature requires jq for JSON processing.

   Install jq to enable sub-agent utilization boosting:
   • macOS:   brew install jq
   • Linux:   sudo apt-get install jq
   • Windows: choco install jq

   Or run: /checkdependencies --install

   The hook will be disabled until jq is installed.
EOF
  fi

  # Pass through with empty JSON to not break hook chain
  echo '{}'
  exit 0
fi

# Configuration
ENABLE_BOOST="${ENABLE_SUBAGENT_BOOST:-1}"
INTENSITY="${SUBAGENT_BOOST_INTENSITY:-standard}"

# Read hook input
HOOK_INPUT=$(cat)
USER_MESSAGE=$(echo "$HOOK_INPUT" | jq -r '.message // ""')

# If disabled, pass through
if [ "$ENABLE_BOOST" != "1" ]; then
  echo '{}'
  exit 0
fi

# Define boost messages by intensity
case "$INTENSITY" in
  "standard")
    BOOST_PREFIX="Using the appropriate sub-agents, runbooks, and tools, "
    BOOST_CONTEXT=""
    ;;
  "strong")
    BOOST_PREFIX="Using the appropriate sub-agents, runbooks, and tools from the installed plugins, "
    BOOST_CONTEXT=""
    ;;
  "maximum")
    BOOST_PREFIX="Using the appropriate sub-agents, runbooks, and tools, "
    BOOST_CONTEXT="IMPORTANT: Maximize delegation to specialized sub-agents and plugin tools. Avoid direct execution when agents are available.

"
    ;;
  *)
    BOOST_PREFIX="Using the appropriate sub-agents, runbooks, and tools, "
    BOOST_CONTEXT=""
    ;;
esac

# Get plugin root
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"

# Check if there's an existing routing hook to chain with
ROUTING_HOOK="$PLUGIN_ROOT/../salesforce-plugin/hooks/user-prompt-hybrid.sh"
ROUTING_OUTPUT='{}'

if [ -f "$ROUTING_HOOK" ] && [ -n "${CLAUDE_PLUGIN_ROOT:-}" ]; then
  # Chain with existing routing logic (only if CLAUDE_PLUGIN_ROOT is set)
  ROUTING_OUTPUT=$(echo "$HOOK_INPUT" | bash "$ROUTING_HOOK" 2>/dev/null || echo '{}')
fi

# Extract existing systemMessage from routing hook
EXISTING_MESSAGE=$(echo "$ROUTING_OUTPUT" | jq -r '.systemMessage // ""')
SUGGESTED_AGENT=$(echo "$ROUTING_OUTPUT" | jq -r '.suggestedAgent // ""')
MANDATORY_AGENT=$(echo "$ROUTING_OUTPUT" | jq -r '.mandatoryAgent // false')
BLOCK_EXECUTION=$(echo "$ROUTING_OUTPUT" | jq -r '.blockExecution // false')
COMPLEXITY=$(echo "$ROUTING_OUTPUT" | jq -r '.complexity // 0')
CONFIDENCE=$(echo "$ROUTING_OUTPUT" | jq -r '.confidence // 0')

# Construct enhanced message
if [ -n "$EXISTING_MESSAGE" ]; then
  # Routing hook provided context - combine with boost
  ENHANCED_MESSAGE="${BOOST_CONTEXT}${BOOST_PREFIX}${USER_MESSAGE}

$EXISTING_MESSAGE"
else
  # No routing context - just add boost
  ENHANCED_MESSAGE="${BOOST_CONTEXT}${BOOST_PREFIX}${USER_MESSAGE}"
fi

# Build output JSON with all routing metadata preserved
OUTPUT=$(jq -n \
  --arg msg "$ENHANCED_MESSAGE" \
  '{systemMessage: $msg}')

# Add optional fields if present
if [ -n "$SUGGESTED_AGENT" ] && [ "$SUGGESTED_AGENT" != "null" ]; then
  OUTPUT=$(echo "$OUTPUT" | jq --arg agent "$SUGGESTED_AGENT" '. + {suggestedAgent: $agent}')
fi

if [ "$MANDATORY_AGENT" != "false" ] && [ "$MANDATORY_AGENT" != "null" ]; then
  OUTPUT=$(echo "$OUTPUT" | jq --argjson mandatory "$MANDATORY_AGENT" '. + {mandatoryAgent: $mandatory}')
fi

if [ "$BLOCK_EXECUTION" != "false" ] && [ "$BLOCK_EXECUTION" != "null" ]; then
  OUTPUT=$(echo "$OUTPUT" | jq --argjson block "$BLOCK_EXECUTION" '. + {blockExecution: $block}')
fi

if [ "$COMPLEXITY" != "0" ] && [ "$COMPLEXITY" != "null" ]; then
  OUTPUT=$(echo "$OUTPUT" | jq --argjson complexity "$COMPLEXITY" '. + {complexity: $complexity}')
fi

if [ "$CONFIDENCE" != "0" ] && [ "$CONFIDENCE" != "null" ]; then
  OUTPUT=$(echo "$OUTPUT" | jq --argjson confidence "$CONFIDENCE" '. + {confidence: $confidence}')
fi

# Output final JSON
echo "$OUTPUT"
