#!/bin/bash

##
# Post-Sub-Agent Execution Hook
# Validates sub-agent outputs after task completion
#
# Part of: Sub-Agent Verification Layer Implementation
# ROI: $8,000/year | Effort: 12 hours | Payback: 4 weeks
#
# Triggered: After any Task tool execution
# Purpose: Verify sub-agent outputs for hallucinations and compliance
##

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Configuration
VERIFICATION_ENABLED="${SUBAGENT_VERIFICATION_ENABLED:-true}"
STRICT_MODE="${SUBAGENT_VERIFICATION_STRICT:-false}"
SAVE_REPORTS="${SUBAGENT_VERIFICATION_SAVE_REPORTS:-true}"
REPORTS_DIR="${SUBAGENT_VERIFICATION_REPORTS_DIR:-./.claude/verification-reports}"

# Hook arguments (passed by Claude Code)
AGENT_NAME="${1:-unknown}"
TASK_DESCRIPTION="${2:-}"
OUTPUT_FILE="${3:-}"  # File where agent output was saved (if any)

# Only run verification if enabled
if [ "$VERIFICATION_ENABLED" != "true" ]; then
  exit 0
fi

# Skip verification for non-sub-agent tasks
# Only verify agents explicitly invoked via Task tool
if [ "$AGENT_NAME" == "unknown" ] || [ -z "$AGENT_NAME" ]; then
  exit 0
fi

echo ""
echo "🔍 Post-Sub-Agent Verification: $AGENT_NAME"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check if output file exists
if [ -n "$OUTPUT_FILE" ] && [ -f "$OUTPUT_FILE" ]; then
  echo "   Output file: $OUTPUT_FILE"

  # Run verification
  if [ -f "$PLUGIN_ROOT/scripts/lib/subagent-output-validator.js" ]; then
    # Create reports directory
    mkdir -p "$REPORTS_DIR"

    # Generate report filename
    TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    REPORT_FILE="$REPORTS_DIR/${AGENT_NAME}_${TIMESTAMP}.json"

    # Run validator
    VALIDATION_RESULT=$(node "$PLUGIN_ROOT/scripts/lib/subagent-output-validator.js" \
      --agent "$AGENT_NAME" \
      --output "$OUTPUT_FILE" \
      --report "$REPORT_FILE" \
      ${STRICT_MODE:+--strict} \
      2>&1)

    VALIDATOR_EXIT_CODE=$?

    # Check validation result
    if [ $VALIDATOR_EXIT_CODE -eq 0 ]; then
      echo "   ✅ Verification passed"

      # Extract confidence score if available
      CONFIDENCE=$(echo "$VALIDATION_RESULT" | grep -oP 'Confidence: \K\d+' || echo "")
      if [ -n "$CONFIDENCE" ]; then
        echo "   Confidence: ${CONFIDENCE}%"
      fi

    else
      echo "   ❌ Verification failed"
      echo ""
      echo "   Issues found:"
      echo "$VALIDATION_RESULT" | grep -E "^  -" | head -5

      # In strict mode, fail the hook
      if [ "$STRICT_MODE" == "true" ]; then
        echo ""
        echo "   ⚠️  STRICT MODE: Sub-agent execution blocked"
        echo "   Review verification report: $REPORT_FILE"
        exit 1
      else
        echo ""
        echo "   ⚠️  WARNING: Sub-agent output has issues"
        echo "   Review verification report: $REPORT_FILE"
      fi
    fi

    # Save report if enabled
    if [ "$SAVE_REPORTS" == "true" ] && [ -f "$REPORT_FILE" ]; then
      echo "   📋 Report saved: $REPORT_FILE"
    fi

  else
    echo "   ⚠️  Validator script not found, skipping verification"
  fi

else
  echo "   ⚠️  No output file to verify"
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Exit successfully (don't block task completion in non-strict mode)
exit 0
