#!/bin/bash
#
# Hybrid UserPromptSubmit Hook
#
# This hook combines two routing strategies:
# 1. Enhanced pattern matching (fast, high-confidence blocking for known operations)
# 2. Auto-router complexity analysis (sophisticated scoring for all operations)
#
# Strategy:
# - Run enhanced hook first for mandatory operations (BLOCKS execution)
# - If no mandatory match, run auto-router for suggestions with complexity scoring
# - Return whichever has a match, preferring mandatory operations
#
# Output: JSON with systemMessage for Claude

set -euo pipefail

# Get plugin root
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"

# Source standardized error handler for safe_json_parse
ERROR_HANDLER="${CLAUDE_PLUGIN_ROOT:-}/../cross-platform-plugin/hooks/lib/error-handler.sh"
if [ ! -f "$ERROR_HANDLER" ]; then
  ERROR_HANDLER="$PLUGIN_ROOT/../cross-platform-plugin/hooks/lib/error-handler.sh"
fi
[ -f "$ERROR_HANDLER" ] && source "$ERROR_HANDLER" 2>/dev/null || true

# Check for jq availability - required for JSON processing
if ! command -v jq &>/dev/null; then
  # jq not available - exit gracefully with empty response
  echo '{"systemMessage":"","continue":true}'
  exit 0
fi

# Read JSON input from stdin and store it
HOOK_INPUT=$(cat)

# NEW: Detect environment and export CLAUDE_ENV early
# This allows all downstream hooks and agents to know the environment
if command -v node &>/dev/null; then
  ENV_DETECTOR="${CLAUDE_PLUGIN_ROOT:-}/../developer-tools-plugin/scripts/lib/environment-detector.js"
  if [ ! -f "$ENV_DETECTOR" ]; then
    ENV_DETECTOR="$PLUGIN_ROOT/scripts/lib/environment-detector.js"
  fi

  if [ -f "$ENV_DETECTOR" ]; then
    ENV_RESULT=$(node "$ENV_DETECTOR" 2>/dev/null || echo '{}')
    DETECTED_ENV=$(echo "$ENV_RESULT" | jq -r '.environment // ""' 2>/dev/null || echo "")

    if [ -n "$DETECTED_ENV" ] && [ "$DETECTED_ENV" != "null" ]; then
      export CLAUDE_ENV="$DETECTED_ENV"
    fi
  fi
fi

# Pass input to enhanced hook (pattern matching)
ENHANCED_OUTPUT=$(echo "$HOOK_INPUT" | bash "$PLUGIN_ROOT/hooks/user-prompt-submit-enhanced.sh" 2>/dev/null || echo '{}')

# Check if enhanced hook found a match
HAS_ENHANCED_MATCH=$(echo "$ENHANCED_OUTPUT" | jq -r 'has("suggestedAgent")' 2>/dev/null || echo "false")

if [ "$HAS_ENHANCED_MATCH" = "true" ]; then
  # Enhanced hook found a match - use it
  # Check if it's mandatory
  IS_MANDATORY=$(echo "$ENHANCED_OUTPUT" | jq -r '.mandatoryAgent // false')

  if [ "$IS_MANDATORY" = "true" ]; then
    # MANDATORY operation - return immediately
    echo "$ENHANCED_OUTPUT"
    exit 0
  else
    # Suggested operation - also run auto-router for additional context
    AUTO_OUTPUT=$(echo "$HOOK_INPUT" | bash "$PLUGIN_ROOT/hooks/auto-router-adapter.sh" 2>/dev/null || echo '{}')
    HAS_AUTO_MATCH=$(echo "$AUTO_OUTPUT" | jq -r 'has("suggestedAgent")' 2>/dev/null || echo "false")

    if [ "$HAS_AUTO_MATCH" = "true" ]; then
      # Combine both outputs - use enhanced agent but add complexity/confidence from auto-router
      ENHANCED_AGENT=$(echo "$ENHANCED_OUTPUT" | jq -r '.suggestedAgent')
      AUTO_COMPLEXITY=$(echo "$AUTO_OUTPUT" | jq -r '.complexity // 0')
      AUTO_CONFIDENCE=$(echo "$AUTO_OUTPUT" | jq -r '.confidence // 0')

      # Create combined message
      ENHANCED_MSG=$(echo "$ENHANCED_OUTPUT" | jq -r '.systemMessage')
      COMPLEXITY_PCT=$(echo "$AUTO_COMPLEXITY * 100" | bc | cut -d. -f1)
      CONFIDENCE_PCT=$(echo "$AUTO_CONFIDENCE * 100" | bc | cut -d. -f1)

      COMBINED_MSG="$ENHANCED_MSG

[Auto-Analysis]
Complexity: $COMPLEXITY_PCT% | Confidence: $CONFIDENCE_PCT%"

      # NEW: Set blocking for high complexity tasks
      SHOULD_BLOCK="false"
      SHOULD_MANDATE="false"
      if (( $(echo "$AUTO_COMPLEXITY >= 0.7" | bc -l) )); then
        SHOULD_BLOCK="true"
        SHOULD_MANDATE="true"
        COMBINED_MSG="$COMBINED_MSG

⛔ HIGH COMPLEXITY DETECTED (${COMPLEXITY_PCT}%) - AGENT REQUIRED

You MUST use the Task tool with: ${ENHANCED_AGENT}
DO NOT attempt direct execution.

Reasons:
   - Task requires multiple coordinated steps
   - High risk of unintended consequences
   - Requires specialized handling"
      fi

      jq -n \
        --arg msg "$COMBINED_MSG" \
        --arg agent "$ENHANCED_AGENT" \
        --argjson complexity "$AUTO_COMPLEXITY" \
        --argjson confidence "$AUTO_CONFIDENCE" \
        --argjson block "$SHOULD_BLOCK" \
        --argjson mandatory "$SHOULD_MANDATE" \
        '{systemMessage: $msg, suggestedAgent: $agent, complexity: $complexity, confidence: $confidence, mandatoryAgent: $mandatory, blockExecution: $block, source: "hybrid"}'

      exit 0
    else
      # Just enhanced match
      echo "$ENHANCED_OUTPUT"
      exit 0
    fi
  fi
fi

# No enhanced match - try auto-router only
AUTO_OUTPUT=$(echo "$HOOK_INPUT" | bash "$PLUGIN_ROOT/hooks/auto-router-adapter.sh" 2>/dev/null || echo '{}')

# NEW: Add blocking for high complexity tasks
HAS_AUTO_MATCH=$(echo "$AUTO_OUTPUT" | jq -r 'has("suggestedAgent")' 2>/dev/null || echo "false")
if [ "$HAS_AUTO_MATCH" = "true" ]; then
  AUTO_COMPLEXITY=$(echo "$AUTO_OUTPUT" | jq -r '.complexity // 0')
  AUTO_AGENT=$(echo "$AUTO_OUTPUT" | jq -r '.suggestedAgent // ""')

  if (( $(echo "$AUTO_COMPLEXITY >= 0.7" | bc -l) )); then
    AUTO_MSG=$(echo "$AUTO_OUTPUT" | jq -r '.systemMessage')
    COMPLEXITY_PCT=$(echo "$AUTO_COMPLEXITY * 100" | bc | cut -d. -f1)

    BLOCKING_MSG="$AUTO_MSG

⛔ HIGH COMPLEXITY DETECTED (${COMPLEXITY_PCT}%) - AGENT REQUIRED

You MUST use the Task tool with: ${AUTO_AGENT}
DO NOT attempt direct execution.

Reasons:
   - Task requires multiple coordinated steps
   - High risk of unintended consequences
   - Requires specialized handling"

    # Rebuild output with blocking flags
    echo "$AUTO_OUTPUT" | jq \
      --arg msg "$BLOCKING_MSG" \
      '.systemMessage = $msg | .blockExecution = true | .mandatoryAgent = true'
    exit 0
  fi
fi

echo "$AUTO_OUTPUT"
exit 0
