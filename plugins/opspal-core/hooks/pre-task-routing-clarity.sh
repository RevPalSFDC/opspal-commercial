#!/usr/bin/env bash
# STATUS: SUPERSEDED — absorbed by a registered dispatcher or consolidated hook
set -euo pipefail

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

# Optional hard-enforcement mode (default off for backward compatibility).
# Deprecated at UserPromptSubmit: low/moderate confidence routing emits guidance
# and downstream routing state instead of rejecting the user's prompt.
FAIL_CLOSED="${ROUTING_CLARITY_FAIL_CLOSED:-0}"
OVERRIDE_TOKEN="${ROUTING_CLARITY_OVERRIDE_TOKEN:-[ROUTING_OVERRIDE]}"
ANALYSIS_TIMEOUT_SECONDS="${ROUTING_CLARITY_TIMEOUT_SECONDS:-5}"
CONFIDENCE_OVERRIDE="${ROUTING_CLARITY_CONFIDENCE_OVERRIDE:-}"

# Resolve script paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FORMATTER="$SCRIPT_DIR/../scripts/lib/output-formatter.js"

find_enhancer_script() {
  local candidates=(
    "$SCRIPT_DIR/../scripts/lib/routing-clarity-enhancer.js"
    "${CLAUDE_PLUGIN_ROOT:-}/scripts/lib/routing-clarity-enhancer.js"
    "plugins/opspal-core/scripts/lib/routing-clarity-enhancer.js"
    ".claude-plugins/opspal-core/scripts/lib/routing-clarity-enhancer.js"
    "$HOME/.claude/plugins/opspal-core@opspal-commercial/scripts/lib/routing-clarity-enhancer.js"
  )

  for path in "${candidates[@]}"; do
    if [ -n "$path" ] && [ -f "$path" ]; then
      echo "$path"
      return 0
    fi
  done

  return 1
}

log_clarity_event() {
  local status="$1"
  local confidence="$2"

  if ! command -v jq >/dev/null 2>&1; then
    return 0
  fi

  local log_dir="${HOME}/.claude/logs"
  local log_file="$log_dir/routing-clarity.jsonl"
  mkdir -p "$log_dir" 2>/dev/null || true

  local entry
  entry=$(jq -n \
    --arg ts "$(date -Iseconds 2>/dev/null || date '+%Y-%m-%dT%H:%M:%S')" \
    --arg status "$status" \
    --arg prompt "${TASK_DESCRIPTION:0:140}" \
    --arg agent "${SELECTED_AGENT:-}" \
    --arg override_token "$OVERRIDE_TOKEN" \
    --argjson confidence "${confidence:-0}" \
    --argjson fail_closed "$FAIL_CLOSED" \
    --argjson has_override "$HAS_OVERRIDE" \
    '{
      timestamp: $ts,
      source: "pre-task-routing-clarity",
      status: $status,
      confidence_pct: $confidence,
      fail_closed: $fail_closed,
      has_override: $has_override,
      selected_agent: (if $agent != "" then $agent else null end),
      override_token: (if $has_override then $override_token else null end),
      task_preview: $prompt
    }' 2>/dev/null || echo '{}')

  printf '%s\n' "$entry" >> "$log_file" 2>/dev/null || true
}

emit_noop_json() {
  printf '{}\n'
}

emit_guidance_json() {
  local context="$1"
  local recommendation="$2"
  local confidence="$3"
  local prompt_block_requested="${4:-false}"

  if ! command -v jq >/dev/null 2>&1; then
    emit_noop_json
    return 0
  fi

  jq -n \
    --arg context "$context" \
    --arg recommendation "$recommendation" \
    --arg confidence "$confidence" \
    --argjson prompt_block_requested "$prompt_block_requested" \
    '{
      suppressOutput: true,
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext: $context
      },
      metadata: {
        orchestrationType: "routing-clarity",
        recommendation: $recommendation,
        confidence: $confidence,
        promptBlockRequested: $prompt_block_requested,
        promptBlockSuppressed: $prompt_block_requested
      }
    }'
}

run_routing_analysis() {
  if [ -n "$CONFIDENCE_OVERRIDE" ]; then
    printf 'Confidence: %s%%\n' "$CONFIDENCE_OVERRIDE"
    return 0
  fi

  if command -v timeout >/dev/null 2>&1; then
    timeout "$ANALYSIS_TIMEOUT_SECONDS" node "$ENHANCER_SCRIPT" route "$TASK_DESCRIPTION" 2>/dev/null
    return $?
  fi

  node "$ENHANCER_SCRIPT" route "$TASK_DESCRIPTION" 2>/dev/null
}

# Accept both argument-based invocation and stdin payloads (raw prompt or JSON)
TASK_DESCRIPTION="${1:-}"
SELECTED_AGENT="${2:-}"
RAW_INPUT=""
STDIN_READ_TIMEOUT="${ROUTING_CLARITY_STDIN_TIMEOUT:-0.2}"

if [ ! -t 0 ]; then
  # Avoid blocking when stdin is open but empty (common in some hook/test runners).
  if IFS= read -r -t "$STDIN_READ_TIMEOUT" first_line; then
    RAW_INPUT="$first_line"
    while IFS= read -r line; do
      RAW_INPUT="${RAW_INPUT}"$'\n'"${line}"
    done
  fi
fi

if [ -z "$TASK_DESCRIPTION" ] && [ -n "$RAW_INPUT" ]; then
  if command -v jq >/dev/null 2>&1 && echo "$RAW_INPUT" | jq -e . >/dev/null 2>&1; then
    TASK_DESCRIPTION=$(echo "$RAW_INPUT" | jq -r '.message // .userMessage // .prompt // .description // ""' 2>/dev/null)
    if [ -z "$SELECTED_AGENT" ]; then
      SELECTED_AGENT=$(echo "$RAW_INPUT" | jq -r '.subagent_type // .agent // ""' 2>/dev/null)
    fi
  else
    TASK_DESCRIPTION="$RAW_INPUT"
  fi
fi

ENHANCER_SCRIPT="$(find_enhancer_script || true)"

# Check if enhancer exists
if [ -z "$ENHANCER_SCRIPT" ] || [ ! -f "$ENHANCER_SCRIPT" ]; then
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

# Any non-empty task description should be routable and eligible for clarity checks.
if [ -n "$TASK_DESCRIPTION" ]; then
  NEEDS_CLARITY=1
fi

# Check if task description contains agent-related keywords
if echo "$TASK_DESCRIPTION" | grep -qiE "agent|sub-agent|delegate|orchestrate"; then
  NEEDS_CLARITY=1
fi

HAS_OVERRIDE=false
if [ -n "$TASK_DESCRIPTION" ] && echo "$TASK_DESCRIPTION" | grep -Fqi "$OVERRIDE_TOKEN"; then
  HAS_OVERRIDE=true
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
  # Silent mode - still run analyzer and emit telemetry.
  SILENT_RESULT=$(run_routing_analysis || true)
  SILENT_CONFIDENCE=$(echo "$SILENT_RESULT" | grep -oE "Confidence:[[:space:]]+[0-9]+(\.[0-9]+)?%" | head -1 | grep -oE "[0-9]+(\.[0-9]+)?" || echo "0")
  if [ -z "$SILENT_RESULT" ]; then
    log_clarity_event "analysis_unavailable" "${SILENT_CONFIDENCE:-0}"
  fi
  log_clarity_event "silent" "${SILENT_CONFIDENCE:-0}"
  exit 0
fi

###############################################################################
# Verbose Mode - Show Routing Decision
###############################################################################

echo "" >&2
echo "🧭 [Routing Clarity] Analyzing agent selection..." >&2

# Get routing recommendation
ROUTING_RESULT=$(run_routing_analysis 2>&1 || true)
CONFIDENCE_NUM=""

if [ -z "$ROUTING_RESULT" ]; then
  echo "⚠️  [Routing Clarity] Analysis unavailable - continuing without prompt block" >&2
  log_clarity_event "analysis_unavailable" "0"
  emit_noop_json
  exit 0
fi

# Extract confidence from result (if available)
CONFIDENCE=$(echo "$ROUTING_RESULT" | grep -oP "Confidence:\s+\K[\d.]+%" | head -1)

if [ -n "$CONFIDENCE" ]; then
  CONFIDENCE_NUM=$(echo "$CONFIDENCE" | tr -d '%')

  if (( $(echo "$CONFIDENCE_NUM >= 85" | bc -l 2>/dev/null || echo "0") )); then
    echo "✅ [Routing Clarity] High confidence routing (${CONFIDENCE})" >&2
    log_clarity_event "high_confidence" "$CONFIDENCE_NUM"
  elif (( $(echo "$CONFIDENCE_NUM >= 70" | bc -l 2>/dev/null || echo "0") )); then
    echo "✅ [Routing Clarity] Good confidence routing (${CONFIDENCE})" >&2
    log_clarity_event "good_confidence" "$CONFIDENCE_NUM"
  elif (( $(echo "$CONFIDENCE_NUM >= 50" | bc -l 2>/dev/null || echo "0") )); then
    if [ "$FAIL_CLOSED" = "1" ] && [ "$HAS_OVERRIDE" = "false" ]; then
      if [ -f "$FORMATTER" ]; then
        node "$FORMATTER" error \
          "Routing Blocked (Moderate Confidence)" \
          "Fail-closed routing was requested, but prompt submission continues and downstream routing remains enforced" \
          "Confidence:${CONFIDENCE},Recommended Agent:${SELECTED_AGENT:-Unknown}" \
          "Claude should delegate to the recommended specialist immediately,Refine task description to improve routing confidence,Choose explicit agent with [USE: plugin:agent-name]" \
          "" >&2 || true
      else
        echo "⚠️  [Routing Clarity] Fail-closed routing requested for moderate confidence (${CONFIDENCE}), but prompt submission will continue" >&2
      fi
      log_clarity_event "suppressed_moderate" "$CONFIDENCE_NUM"
      emit_guidance_json \
        "ROUTING REQUIRED: Delegate to ${SELECTED_AGENT:-the recommended specialist} immediately. Prompt submission continues; downstream routing validation remains enforced." \
        "${SELECTED_AGENT:-Unknown}" \
        "$CONFIDENCE" \
        "true"
      exit 0
    fi

    if [ "$FAIL_CLOSED" = "1" ] && [ "$HAS_OVERRIDE" = "true" ]; then
      echo "⚠️  [Routing Clarity] Override token detected - bypassing fail-closed block (${CONFIDENCE})" >&2
      log_clarity_event "override_moderate" "$CONFIDENCE_NUM"
      exit 0
    fi

    # Exit 2 pattern: Automatic feedback for moderate confidence using OutputFormatter
    if [ -f "$FORMATTER" ]; then
      node "$FORMATTER" warning \
        "Moderate Confidence Routing" \
        "The routing system has moderate confidence in agent recommendation" \
        "Confidence:${CONFIDENCE},Recommended Agent:${SELECTED_AGENT:-Unknown}" \
        "Review alternative agents if task has specific requirements,Use [USE: agent-name] to override routing" \
        "" >&2 || true
      log_clarity_event "warning_moderate" "$CONFIDENCE_NUM"
      emit_guidance_json \
        "ROUTING GUIDANCE: Prefer ${SELECTED_AGENT:-the recommended specialist} for this request. Prompt submission continues." \
        "${SELECTED_AGENT:-Unknown}" \
        "$CONFIDENCE" \
        "false"
      exit 0
    else
      # Fallback to basic output
      echo "⚠️  [Routing Clarity] Moderate confidence routing (${CONFIDENCE})" >&2
      echo "   Consider reviewing alternatives if task has specific requirements" >&2
      log_clarity_event "warning_moderate" "$CONFIDENCE_NUM"
      emit_guidance_json \
        "ROUTING GUIDANCE: Prefer ${SELECTED_AGENT:-the recommended specialist} for this request. Prompt submission continues." \
        "${SELECTED_AGENT:-Unknown}" \
        "$CONFIDENCE" \
        "false"
      exit 0
    fi
  else
    if [ "$FAIL_CLOSED" = "1" ] && [ "$HAS_OVERRIDE" = "false" ]; then
      if [ -f "$FORMATTER" ]; then
        node "$FORMATTER" error \
          "Routing Blocked (Low Confidence)" \
          "Fail-closed routing was requested, but prompt submission continues and downstream routing remains enforced" \
          "Confidence:${CONFIDENCE},Recommended Agent:${SELECTED_AGENT:-Unknown}" \
          "Claude should delegate to the recommended specialist immediately,Use explicit agent selection [USE: plugin:agent-name],Break task into smaller units to raise confidence" \
          "" >&2 || true
      else
        echo "⚠️  [Routing Clarity] Fail-closed routing requested for low confidence (${CONFIDENCE}), but prompt submission will continue" >&2
      fi
      log_clarity_event "suppressed_low" "$CONFIDENCE_NUM"
      emit_guidance_json \
        "ROUTING REQUIRED: Delegate to ${SELECTED_AGENT:-the recommended specialist} immediately. Prompt submission continues; downstream routing validation remains enforced." \
        "${SELECTED_AGENT:-Unknown}" \
        "$CONFIDENCE" \
        "true"
      exit 0
    fi

    if [ "$FAIL_CLOSED" = "1" ] && [ "$HAS_OVERRIDE" = "true" ]; then
      echo "⚠️  [Routing Clarity] Override token detected - bypassing fail-closed block (${CONFIDENCE})" >&2
      log_clarity_event "override_low" "$CONFIDENCE_NUM"
      exit 0
    fi

    # Exit 2 pattern: Automatic feedback for low confidence using OutputFormatter
    if [ -f "$FORMATTER" ]; then
      node "$FORMATTER" warning \
        "Low Confidence Routing" \
        "The routing system has low confidence in agent recommendation" \
        "Confidence:${CONFIDENCE},Recommended Agent:${SELECTED_AGENT:-Unknown}" \
        "Review alternative agents or use direct tools,Consider breaking down task into smaller steps,Use [USE: agent-name] to override if you know the right agent" \
        "" >&2 || true
      log_clarity_event "warning_low" "$CONFIDENCE_NUM"
      emit_guidance_json \
        "ROUTING GUIDANCE: Routing confidence is low; prefer ${SELECTED_AGENT:-the recommended specialist} or choose an explicit specialist. Prompt submission continues." \
        "${SELECTED_AGENT:-Unknown}" \
        "$CONFIDENCE" \
        "false"
      exit 0
    else
      # Fallback to basic output
      echo "⚠️  [Routing Clarity] Low confidence routing (${CONFIDENCE})" >&2
      echo "   Recommendation: Review alternatives or use direct tools" >&2
      log_clarity_event "warning_low" "$CONFIDENCE_NUM"
      emit_guidance_json \
        "ROUTING GUIDANCE: Routing confidence is low; prefer ${SELECTED_AGENT:-the recommended specialist} or choose an explicit specialist. Prompt submission continues." \
        "${SELECTED_AGENT:-Unknown}" \
        "$CONFIDENCE" \
        "false"
      exit 0
    fi
  fi
fi

log_clarity_event "no_confidence" "0"

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

# Default success when no warning/block condition is triggered.
exit 0

###############################################################################
# Exit Codes:
#   0 = Continue (with or without routing guidance)
###############################################################################
