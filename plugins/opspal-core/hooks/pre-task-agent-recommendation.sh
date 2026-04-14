#!/usr/bin/env bash
# STATUS: SUPERSEDED — absorbed by a registered dispatcher or consolidated hook
set -euo pipefail

###############################################################################
# Pre-Task Agent Recommendation Hook
#
# Provides intelligent agent recommendations for complex tasks.
#
# Addresses: Cohort 6 (agent/selection) - 8 reflections, $12K ROI
#
# Prevention Target: Wrong agent selected for multi-faceted tasks
#
# How It Works:
# 1. Analyzes task description
# 2. Decomposes into facets
# 3. Recommends appropriate agent(s)
# 4. Provides execution plan
#
# Configuration:
#   AGENT_RECOMMENDATION_ENABLED=1  # Enable recommendations (default: 1)
#   AGENT_RECOMMENDATION_VERBOSE=1  # Show detailed analysis (default: 0)
#
# Exit Codes:
#   0 - Always (non-blocking, informational only)
###############################################################################

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source standardized error handler for centralized logging
if [[ -n "${CLAUDE_PLUGIN_ROOT:-}" ]]; then
    ERROR_HANDLER="${CLAUDE_PLUGIN_ROOT}/opspal-core/hooks/lib/error-handler.sh"
else
    ERROR_HANDLER="${SCRIPT_DIR}/lib/error-handler.sh"
fi

if [[ -f "$ERROR_HANDLER" ]]; then
    source "$ERROR_HANDLER"
    HOOK_NAME="pre-task-agent-recommendation"
    # Lenient mode - recommendations should not block tasks
    set_lenient_mode 2>/dev/null || true
fi

# Configuration
ENABLED="${AGENT_RECOMMENDATION_ENABLED:-1}"
VERBOSE="${AGENT_RECOMMENDATION_VERBOSE:-0}"

# Only run if enabled
if [ "$ENABLED" != "1" ]; then
  exit 0
fi

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_DIR="$(dirname "$SCRIPT_DIR")"
MATRIX_SCRIPT="$PLUGIN_DIR/scripts/lib/agent-decision-matrix.js"

# OutputFormatter and HookLogger
OUTPUT_FORMATTER="$PLUGIN_DIR/scripts/lib/output-formatter.js"
HOOK_LOGGER="$PLUGIN_DIR/scripts/lib/hook-logger.js"
HOOK_NAME="pre-task-agent-recommendation"

# Check if decision matrix exists
if [ ! -f "$MATRIX_SCRIPT" ]; then
  exit 0  # Don't block if matrix not available
fi

# Parse hook input
# Input format: task=<task-description>
TASK_DESCRIPTION=""

while IFS='=' read -r key value; do
  case "$key" in
    task) TASK_DESCRIPTION="$value" ;;
  esac
done

# Skip if no task description
if [ -z "$TASK_DESCRIPTION" ]; then
  exit 0
fi

# Skip for very simple tasks
if [ ${#TASK_DESCRIPTION} -lt 20 ]; then
  exit 0
fi

# Run agent decision matrix analysis
ANALYSIS=$(node "$MATRIX_SCRIPT" "$TASK_DESCRIPTION" 2>&1)

# Check if analysis generated recommendations
if echo "$ANALYSIS" | grep -q "Recommended Agents"; then
  # Extract key recommendations
  COMPLEXITY=$(echo "$ANALYSIS" | grep -oP 'Complexity: \K\d+')
  FACET_COUNT=$(echo "$ANALYSIS" | grep "Identified Facets" -A 100 | grep -c "^🟢\|^🟡\|^🔴")
  TOP_AGENT=$(echo "$ANALYSIS" | grep "Recommended Agents" -A 3 | grep -oP '1\. \*\*\K[^*]+' | head -1)

  if [ -n "$TOP_AGENT" ]; then
    # Log agent recommendation
    [ -f "$HOOK_LOGGER" ] && node "$HOOK_LOGGER" info "$HOOK_NAME" "Agent recommendation provided" \
      "{\"topAgent\":\"$TOP_AGENT\",\"complexity\":${COMPLEXITY:-0},\"facetCount\":${FACET_COUNT:-0}}"

    if [ "$VERBOSE" == "1" ]; then
      # Verbose mode: show full analysis
      if [ -f "$OUTPUT_FORMATTER" ]; then
        node "$OUTPUT_FORMATTER" info \
          "Agent Recommendation Analysis" \
          "Detailed analysis of task complexity and recommended agents" \
          "Task Complexity:${COMPLEXITY:-N/A}%,Task Facets:${FACET_COUNT:-N/A},Top Agent:$TOP_AGENT" \
          "Full Analysis:$ANALYSIS" \
          "Helps select optimal agent • \$12K/year ROI"
      else
        echo "🤖 Agent Recommendation Analysis:"
        echo "$ANALYSIS"
      fi
    else
      # Brief mode: show summary
      if [ -f "$OUTPUT_FORMATTER" ]; then
        node "$OUTPUT_FORMATTER" info \
          "Agent Recommendation" \
          "Based on task analysis, a specialized agent is recommended for this task" \
          "Task Complexity:${COMPLEXITY:-N/A}%,Task Facets:${FACET_COUNT:-N/A},Recommended Agent:$TOP_AGENT" \
          "Set AGENT_RECOMMENDATION_VERBOSE=1 for detailed analysis,Consider using the Agent tool with the recommended agent" \
          "Helps select optimal agent • \$12K/year ROI"
      else
        echo "💡 Agent Recommendation:"
        echo "   Task Complexity: ${COMPLEXITY:-N/A}%"
        echo "   Task Facets: ${FACET_COUNT:-N/A}"
        echo "   Recommended Agent: $TOP_AGENT"
        echo ""
        echo "   Set AGENT_RECOMMENDATION_VERBOSE=1 for detailed analysis"
      fi
    fi
  fi
fi

# Always exit 0 (non-blocking)
exit 0
