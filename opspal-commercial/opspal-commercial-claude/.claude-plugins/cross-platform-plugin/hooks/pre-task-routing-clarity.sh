#!/bin/bash

###############################################################################
# Pre-Task Routing Clarity Hook
#
# Purpose: Provides routing confidence and explanations before task execution
#          to prevent agent selection confusion.
#
# Addresses: Reflection cohorts 1, 7 (tool-contract, 21 reflections, $31.5K ROI)
#
# Triggers: Before task execution with agent routing
#
# Usage: Automatically invoked by Claude Code before agent routing
#
# Configuration: Set ROUTING_CLARITY_ENABLED=0 to disable
###############################################################################

# Check if routing clarity is enabled
if [ "${ROUTING_CLARITY_ENABLED:-1}" = "0" ]; then
  exit 0
fi

# Get task description from arguments
TASK_DESCRIPTION="$1"
SELECTED_AGENT="$2"

# Path to routing clarity enhancer
ENHANCER_SCRIPT=".claude-plugins/cross-platform-plugin/scripts/lib/routing-clarity-enhancer.js"

# Check if enhancer exists
if [ ! -f "$ENHANCER_SCRIPT" ]; then
  # Enhancer script not found, skip silently
  exit 0
fi

###############################################################################
# Detection Logic - Determine if clarity check is needed
###############################################################################

NEEDS_CLARITY=0

# Check if this is an agent routing decision
if [ -n "$SELECTED_AGENT" ]; then
  NEEDS_CLARITY=1
fi

# Check if task description contains agent-related keywords
if echo "$TASK_DESCRIPTION" | grep -qiE "agent|sub-agent|delegate|orchestrate"; then
  NEEDS_CLARITY=1
fi

# Exit if no clarity check needed
if [ "$NEEDS_CLARITY" = "0" ]; then
  exit 0
fi

###############################################################################
# Confidence Level Check
###############################################################################

# Skip detailed output if verbose mode is not enabled
if [ "${ROUTING_CLARITY_VERBOSE:-0}" = "0" ]; then
  # Silent mode - just log the decision
  node "$ENHANCER_SCRIPT" route "$TASK_DESCRIPTION" > /dev/null 2>&1
  exit 0
fi

###############################################################################
# Verbose Mode - Show Routing Decision
###############################################################################

echo "" >&2
echo "🧭 [Routing Clarity] Analyzing agent selection..." >&2

# Get routing recommendation
ROUTING_RESULT=$(node "$ENHANCER_SCRIPT" route "$TASK_DESCRIPTION" 2>&1)
ROUTING_EXIT_CODE=$?

# Extract confidence from result (if available)
CONFIDENCE=$(echo "$ROUTING_RESULT" | grep -oP "Confidence:\s+\K[\d.]+%" | head -1)

if [ -n "$CONFIDENCE" ]; then
  CONFIDENCE_NUM=$(echo "$CONFIDENCE" | tr -d '%')

  # Get script directory for OutputFormatter
  SCRIPT_DIR="$(cd "$(dirname "$0")/../scripts/lib" && pwd)"
  FORMATTER="$SCRIPT_DIR/output-formatter.js"

  if (( $(echo "$CONFIDENCE_NUM >= 85" | bc -l 2>/dev/null || echo "0") )); then
    echo "✅ [Routing Clarity] High confidence routing (${CONFIDENCE})" >&2
  elif (( $(echo "$CONFIDENCE_NUM >= 70" | bc -l 2>/dev/null || echo "0") )); then
    echo "✅ [Routing Clarity] Good confidence routing (${CONFIDENCE})" >&2
  elif (( $(echo "$CONFIDENCE_NUM >= 50" | bc -l 2>/dev/null || echo "0") )); then
    # Exit 2 pattern: Automatic feedback for moderate confidence using OutputFormatter
    if [ -f "$FORMATTER" ]; then
      node "$FORMATTER" warning \
        "Moderate Confidence Routing" \
        "The routing system has moderate confidence in agent recommendation" \
        "Confidence:${CONFIDENCE},Recommended Agent:${SELECTED_AGENT:-Unknown}" \
        "Review alternative agents if task has specific requirements,Use [USE: agent-name] to override routing" \
        ""
      exit 2
    else
      # Fallback to basic output
      echo "⚠️  [Routing Clarity] Moderate confidence routing (${CONFIDENCE})" >&2
      echo "   Consider reviewing alternatives if task has specific requirements" >&2
      exit 2
    fi
  else
    # Exit 2 pattern: Automatic feedback for low confidence using OutputFormatter
    if [ -f "$FORMATTER" ]; then
      node "$FORMATTER" warning \
        "Low Confidence Routing" \
        "The routing system has low confidence in agent recommendation" \
        "Confidence:${CONFIDENCE},Recommended Agent:${SELECTED_AGENT:-Unknown}" \
        "Review alternative agents or use direct tools,Consider breaking down task into smaller steps,Use [USE: agent-name] to override if you know the right agent" \
        ""
      exit 2
    else
      # Fallback to basic output
      echo "⚠️  [Routing Clarity] Low confidence routing (${CONFIDENCE})" >&2
      echo "   Recommendation: Review alternatives or use direct tools" >&2
      exit 2
    fi
  fi
fi

# Show full routing explanation if explicitly requested
if [ "${ROUTING_SHOW_EXPLANATION:-0}" = "1" ]; then
  echo "" >&2
  echo "$ROUTING_RESULT" >&2
  echo "" >&2
fi

###############################################################################
# Interactive Confirmation (Optional)
###############################################################################

# If confidence is low and interactive mode is enabled, ask for confirmation
if [ "${ROUTING_INTERACTIVE:-0}" = "1" ] && [ -n "$CONFIDENCE_NUM" ]; then
  if (( $(echo "$CONFIDENCE_NUM < 50" | bc -l 2>/dev/null || echo "0") )); then
    echo "" >&2
    echo "⚠️  Low confidence detected. Options:" >&2
    echo "   1. Proceed with selected agent (default)" >&2
    echo "   2. Show alternatives" >&2
    echo "   3. Cancel" >&2
    echo "" >&2
    read -p "Choice (1-3): " -t 10 choice >&2 || choice=1

    case "$choice" in
      2)
        echo "" >&2
        echo "$ROUTING_RESULT" | grep -A 20 "Alternatives:" >&2
        echo "" >&2
        read -p "Press Enter to continue or Ctrl+C to cancel..." >&2
        ;;
      3)
        echo "❌ Cancelled by user" >&2
        exit 1
        ;;
      *)
        echo "Proceeding with selected agent..." >&2
        ;;
    esac
  fi
fi

# Always exit successfully (hook is informational only)
exit 0

###############################################################################
# Exit Codes:
#   0 = Always (informational hook, never blocks)
###############################################################################
