#!/bin/bash

###############################################################################
# Pre-Plan Scope Validation Hook
#
# Validates scope boundaries before execution in plan mode.
#
# Addresses: Cohort 5 (planning/scope) - 16 reflections, $24K ROI
#
# Prevention Target: Unclear requirements → scope creep → incomplete implementations
#
# How It Works:
# 1. Detects when entering plan mode or executing plans
# 2. Extracts requirements from user request
# 3. Checks for unbounded scope, vague requirements
# 4. Requires explicit user approval if risks detected
#
# Configuration:
#   PLAN_VALIDATION_ENABLED=1       # Enable validation (default: 1)
#   PLAN_VALIDATION_STRICT=1        # Block on any risk (default: 0)
#   PLAN_AUTO_ANALYZE=1             # Auto-analyze on plan mode entry (default: 1)
#
# Exit Codes:
#   0 - Validation passed or not needed
#   1 - Validation failed (scope risks detected)
#   2 - User approval required
###############################################################################

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source standardized error handler for centralized logging
if [[ -n "${CLAUDE_PLUGIN_ROOT:-}" ]]; then
    ERROR_HANDLER="${CLAUDE_PLUGIN_ROOT}/cross-platform-plugin/hooks/lib/error-handler.sh"
else
    ERROR_HANDLER="${SCRIPT_DIR}/lib/error-handler.sh"
fi

if [[ -f "$ERROR_HANDLER" ]]; then
    source "$ERROR_HANDLER"
    HOOK_NAME="pre-plan-scope-validation"
fi

# Configuration
ENABLED="${PLAN_VALIDATION_ENABLED:-1}"
STRICT="${PLAN_VALIDATION_STRICT:-0}"
AUTO_ANALYZE="${PLAN_AUTO_ANALYZE:-1}"

# Only run if enabled
if [ "$ENABLED" != "1" ]; then
  exit 0
fi
PLUGIN_DIR="$(dirname "$SCRIPT_DIR")"
EXTRACTOR_SCRIPT="$PLUGIN_DIR/scripts/lib/requirement-extractor.js"
FORMATTER="$PLUGIN_DIR/scripts/lib/output-formatter.js"

# Check if requirement extractor exists
if [ ! -f "$EXTRACTOR_SCRIPT" ]; then
  echo "⚠️  Requirement extractor not found: $EXTRACTOR_SCRIPT"
  exit 0  # Don't block if extractor not available
fi

# Parse hook input
# Input format: mode=<mode> request=<user-request>
MODE=""
USER_REQUEST=""

while IFS='=' read -r key value; do
  case "$key" in
    mode) MODE="$value" ;;
    request) USER_REQUEST="$value" ;;
  esac
done

# Only validate in plan mode or when executing plans
if [[ "$MODE" != "plan" ]] && [[ "$MODE" != "execute_plan" ]]; then
  exit 0
fi

# Skip if no user request
if [ -z "$USER_REQUEST" ]; then
  exit 0
fi

echo "🔍 Analyzing requirement scope..."

# Run requirement analysis
ANALYSIS_OUTPUT=$(node "$EXTRACTOR_SCRIPT" "$USER_REQUEST" 2>&1)
ANALYSIS_EXIT=$?

# Parse analysis results
BOUNDED=$(echo "$ANALYSIS_OUTPUT" | grep -q "Scope appears bounded" && echo "true" || echo "false")
RISKS_COUNT=$(echo "$ANALYSIS_OUTPUT" | grep -c "WARNING:")
CLARIFICATIONS_COUNT=$(echo "$ANALYSIS_OUTPUT" | grep -c "Clarifications Needed" -A 100 | grep -c "^[0-9]\+\.")

# Display analysis summary
echo "$ANALYSIS_OUTPUT" | grep -A 100 "Requirement Analysis Summary"

# Decide whether to block
if [ "$BOUNDED" == "false" ] || [ "$RISKS_COUNT" -gt 0 ]; then
  echo ""
  echo "⚠️  Scope Validation Results:"
  echo "  - Bounded: $BOUNDED"
  echo "  - Risks Detected: $RISKS_COUNT"
  echo "  - Clarifications Needed: $CLARIFICATIONS_COUNT"
  echo ""

  if [ "$STRICT" == "1" ]; then
    # Use OutputFormatter for error message
    if [ -f "$FORMATTER" ]; then
      node "$FORMATTER" error \
        "Scope Validation Failed" \
        "Execution blocked due to scope risks detected" \
        "Bounded:${BOUNDED},Risks Detected:${RISKS_COUNT},Clarifications Needed:${CLARIFICATIONS_COUNT}" \
        "Review and answer all clarification questions,Refine the request with specific scope limits,Set PLAN_VALIDATION_STRICT=0 to allow with warnings" \
        ""
      exit 1
    else
      # Fallback to basic output
      echo "🚫 Execution blocked (STRICT mode enabled)"
      echo ""
      echo "To proceed:"
      echo "  1. Review and answer all clarification questions"
      echo "  2. Refine the request with specific scope limits"
      echo "  3. Set PLAN_VALIDATION_STRICT=0 to allow with warnings"
      echo ""
      exit 1
    fi
  else
    # Exit 2 pattern: Automatic feedback to Claude without blocking using OutputFormatter
    if [ -f "$FORMATTER" ]; then
      # Build context and suggestions
      local context="Bounded:${BOUNDED},Risks:${RISKS_COUNT},Clarifications:${CLARIFICATIONS_COUNT}"
      local suggestions="Review clarification questions above,Confirm assumptions before implementation,Monitor for scope creep during execution"

      # Add extra warning for many clarifications
      if [ "$CLARIFICATIONS_COUNT" -gt 2 ]; then
        context="${context},Multiple Clarifications:${CLARIFICATIONS_COUNT} items detected"
        suggestions="${suggestions},Consider clarifying requirements before proceeding"
      fi

      node "$FORMATTER" warning \
        "Scope Validation Warning" \
        "Proceeding with scope risks detected (STRICT mode disabled)" \
        "$context" \
        "$suggestions" \
        ""
      exit 2
    else
      # Fallback to basic output
      echo "⚠️  Proceeding with warnings (STRICT mode disabled)" >&2
      echo "" >&2
      echo "Recommendation:" >&2
      echo "  - Review clarification questions above" >&2
      echo "  - Confirm assumptions before implementation" >&2
      echo "  - Monitor for scope creep during execution" >&2
      echo "" >&2

      # If many clarifications needed, show stronger warning
      if [ "$CLARIFICATIONS_COUNT" -gt 2 ]; then
        echo "❓ Multiple clarifications needed ($CLARIFICATIONS_COUNT items)" >&2
        echo "   Consider clarifying requirements before proceeding" >&2
        echo "" >&2
      fi

      exit 2
    fi
  fi
else
  echo "✅ Scope validation passed"
  echo "  - Bounded: true"
  echo "  - Risks: 0"
  echo "  - Clarifications: $CLARIFICATIONS_COUNT"
  echo ""
  exit 0
fi
