#!/usr/bin/env bash
#
# Post-Tool-Use Consultation Check Hook
#
# Purpose: Monitor agent outputs and tool results for signs of struggle,
#          suggesting Gemini consultation when appropriate.
#          Also logs consultation outcomes to ACE skill registry for learning.
#
# Triggers:
#   - High uncertainty in agent output (3+ uncertainty phrases)
#   - Repeated errors (2+ errors/retries)
#   - Architecture/design decisions with low confidence
#   - Very high complexity tasks (>= 85%)
#
# ACE Integration (v1.1.0):
#   - Detects gemini-consult agent completions
#   - Extracts alignment scores from consultation results
#   - Logs outcomes to ACE skill registry for future learning
#
# Configuration:
#   ENABLE_AUTO_CONSULTATION=1    # Enable (default)
#   CONSULTATION_VERBOSE=1        # Show debug output
#   ENABLE_ACE_LOGGING=1          # Enable ACE logging (default)
#
# Version: 1.1.0
# Date: 2025-12-06
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Configuration
ENABLE_AUTO_CONSULTATION="${ENABLE_AUTO_CONSULTATION:-1}"
ENABLE_ACE_LOGGING="${ENABLE_ACE_LOGGING:-1}"
VERBOSE="${CONSULTATION_VERBOSE:-0}"

# Skip if both auto-consultation and ACE logging disabled
if [ "$ENABLE_AUTO_CONSULTATION" != "1" ] && [ "$ENABLE_ACE_LOGGING" != "1" ]; then
  echo '{}'
  exit 0
fi

# Check dependencies
if ! command -v jq &> /dev/null; then
  echo '{}'
  exit 0
fi

if ! command -v node &> /dev/null; then
  echo '{}'
  exit 0
fi

# Read hook input
HOOK_INPUT=$(cat)

# Extract tool information
TOOL_NAME=$(echo "$HOOK_INPUT" | jq -r '.tool_name // ""' 2>/dev/null || echo "")
TOOL_OUTPUT=$(echo "$HOOK_INPUT" | jq -r '.tool_response // .tool_result // .tool_output // ""' 2>/dev/null || echo "")
TOOL_ERROR=$(echo "$HOOK_INPUT" | jq -r '.tool_response.error // .tool_result.error // .error // ""' 2>/dev/null || echo "")

# Path to ACE integration
ACE_INTEGRATION="$SCRIPT_DIR/../scripts/lib/ace-integration.js"

# ============================================================================
# ACE LOGGING: Log gemini-consult agent completions to skill registry
# ============================================================================
if [ "${ENABLE_ACE_LOGGING:-}" = "1" ] && [ "$TOOL_NAME" = "Agent" ]; then
  # Check if this was a gemini-consult agent invocation
  SUBAGENT_TYPE=$(echo "$HOOK_INPUT" | jq -r '.tool_input.subagent_type // ""')

  if [ "$SUBAGENT_TYPE" = "gemini-consult" ]; then
    [ "$VERBOSE" = "1" ] && echo "[ACE] Detected gemini-consult task completion" >&2

    # Extract consultation metrics from output
    ALIGNMENT_SCORE=""
    CONSULTATION_SUCCESS="false"
    TOPIC=""

    # Try to extract alignment score from output
    if [ -n "$TOOL_OUTPUT" ]; then
      # Look for "Overall Alignment: XX%" pattern
      ALIGNMENT_SCORE=$(echo "$TOOL_OUTPUT" | grep -oP 'Overall Alignment:\s*\K\d+' 2>/dev/null || echo "")

      # Check if output indicates success (has recommendation)
      if echo "$TOOL_OUTPUT" | grep -qiE '(recommendation|agreement|synthesis)'; then
        CONSULTATION_SUCCESS="true"
      fi

      # Try to extract topic from output
      TOPIC=$(echo "$TOOL_OUTPUT" | grep -oP 'Topic:\s*\K[^\n]+' 2>/dev/null || echo "")
    fi

    # Determine if consultation was successful based on output and error
    if [ -n "$TOOL_ERROR" ] && [ "$TOOL_ERROR" != "null" ]; then
      CONSULTATION_SUCCESS="false"
    fi

    # Log to ACE if integration script exists
    if [ -f "$ACE_INTEGRATION" ]; then
      [ "$VERBOSE" = "1" ] && echo "[ACE] Logging consultation: success=$CONSULTATION_SUCCESS, alignment=$ALIGNMENT_SCORE" >&2

      # Build record command args
      ACE_ARGS="--agent gemini-consult --success $CONSULTATION_SUCCESS"
      [ -n "$ALIGNMENT_SCORE" ] && ACE_ARGS="$ACE_ARGS --alignment-score $ALIGNMENT_SCORE"
      [ -n "$TOPIC" ] && ACE_ARGS="$ACE_ARGS --topic \"$TOPIC\""
      [ -n "$TOOL_ERROR" ] && [ "$TOOL_ERROR" != "null" ] && ACE_ARGS="$ACE_ARGS --error-message \"${TOOL_ERROR:0:200}\""

      # Run ACE logging in background to not block hook
      (node "$ACE_INTEGRATION" record $ACE_ARGS >/dev/null 2>&1 || true) &

      [ "$VERBOSE" = "1" ] && echo "[ACE] Consultation logged to skill registry" >&2
    else
      [ "$VERBOSE" = "1" ] && echo "[ACE] Integration script not found: $ACE_INTEGRATION" >&2
    fi
  fi
fi

# Skip consultation suggestion if no meaningful output
if [ -z "$TOOL_OUTPUT" ] && [ -z "$TOOL_ERROR" ]; then
  echo '{}'
  exit 0
fi

# Skip consultation suggestion if disabled
if [ "$ENABLE_AUTO_CONSULTATION" != "1" ]; then
  echo '{}'
  exit 0
fi

# Path to consultation trigger
CONSULTATION_TRIGGER="$SCRIPT_DIR/../scripts/lib/consultation-trigger.js"

# Skip if consultation trigger not found
if [ ! -f "$CONSULTATION_TRIGGER" ]; then
  [ "$VERBOSE" = "1" ] && echo "[CONSULTATION] Trigger script not found: $CONSULTATION_TRIGGER" >&2
  echo '{}'
  exit 0
fi

# Track errors in state file
ERROR_STATE_FILE="$HOME/.claude/consultation-error-state.json"
mkdir -p "$(dirname "$ERROR_STATE_FILE")" 2>/dev/null || true

# Initialize error tracking
ERROR_COUNT=0
RETRY_COUNT=0

# Load existing error state
if [ -f "$ERROR_STATE_FILE" ]; then
  ERROR_COUNT=$(jq -r '.errorCount // 0' "$ERROR_STATE_FILE" 2>/dev/null || echo "0")
  RETRY_COUNT=$(jq -r '.retryCount // 0' "$ERROR_STATE_FILE" 2>/dev/null || echo "0")
fi

# Check for error in tool output
if [ -n "$TOOL_ERROR" ] && [ "$TOOL_ERROR" != "null" ]; then
  ERROR_COUNT=$((ERROR_COUNT + 1))

  # Update error state
  jq -n \
    --argjson count "$ERROR_COUNT" \
    --argjson retry "$RETRY_COUNT" \
    --arg lastError "$TOOL_ERROR" \
    --arg lastTool "$TOOL_NAME" \
    --argjson ts "$(date +%s)" \
    '{
      errorCount: $count,
      retryCount: $retry,
      lastError: $lastError,
      lastTool: $lastTool,
      timestamp: $ts
    }' > "$ERROR_STATE_FILE" 2>/dev/null || true

  [ "$VERBOSE" = "1" ] && echo "[CONSULTATION] Error detected in $TOOL_NAME (count: $ERROR_COUNT)" >&2
fi

# Build check data
CHECK_DATA=$(jq -n \
  --arg output "$TOOL_OUTPUT" \
  --argjson errorCount "$ERROR_COUNT" \
  --argjson retryCount "$RETRY_COUNT" \
  --arg lastError "${TOOL_ERROR:-}" \
  '{
    agentOutput: $output,
    error: {
      errorCount: $errorCount,
      retryCount: $retryCount,
      lastError: $lastError
    }
  }')

# Run consultation trigger check
TRIGGER_RESULT=$(node "$CONSULTATION_TRIGGER" --all "$CHECK_DATA" --json-only 2>/dev/null || echo '{"shouldConsult": false}')

# Check if consultation is recommended
SHOULD_CONSULT=$(echo "$TRIGGER_RESULT" | jq -r '.shouldConsult // false')

if [ "$SHOULD_CONSULT" = "true" ]; then
  URGENCY=$(echo "$TRIGGER_RESULT" | jq -r '.urgency // "low"')
  REASONS=$(echo "$TRIGGER_RESULT" | jq -r '.reasons | join("; ")' 2>/dev/null || echo "")

  [ "$VERBOSE" = "1" ] && echo "[CONSULTATION] Trigger fired: $REASONS (urgency: $URGENCY)" >&2

  # Build suggestion message
  URGENCY_ICON="💡"
  case "$URGENCY" in
    high) URGENCY_ICON="🔴" ;;
    medium) URGENCY_ICON="🟡" ;;
    *) URGENCY_ICON="🟢" ;;
  esac

  SUGGESTION_MSG="$URGENCY_ICON GEMINI CONSULTATION SUGGESTED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Reason: $REASONS
Urgency: $(echo "$URGENCY" | tr '[:lower:]' '[:upper:]')

To get a second opinion:
  Agent(subagent_type='gemini-consult', prompt='<describe what you need help with>')
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  # Output to stderr for user visibility
  echo "" >&2
  echo "$SUGGESTION_MSG" >&2
  echo "" >&2

  # Return system message for Claude context
  jq -n \
    --arg msg "$SUGGESTION_MSG" \
    '{
      "systemMessage": $msg
    }'
else
  echo '{}'
fi

# Reset error count if we've been successful for a while
# (This prevents stale error counts from triggering falsely)
if [ "$SHOULD_CONSULT" != "true" ] && [ -z "$TOOL_ERROR" ]; then
  # Decrement error count slowly on success
  if [ "$ERROR_COUNT" -gt 0 ]; then
    NEW_ERROR_COUNT=$((ERROR_COUNT - 1))
    jq -n \
      --argjson count "$NEW_ERROR_COUNT" \
      --argjson retry "$RETRY_COUNT" \
      --argjson ts "$(date +%s)" \
      '{
        errorCount: $count,
        retryCount: $retry,
        timestamp: $ts
      }' > "$ERROR_STATE_FILE" 2>/dev/null || true
  fi
fi

exit 0
