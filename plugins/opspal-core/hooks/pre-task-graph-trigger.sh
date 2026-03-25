#!/usr/bin/env bash

###############################################################################
# Pre-Task Graph Trigger Hook
#
# Purpose: Detect when a task should be decomposed using the Task Graph
#          orchestration framework based on complexity assessment.
#
# Triggers: Before any task execution
#
# Detection Logic:
#   1. Check for explicit user flags ([SEQUENTIAL], [PLAN_CAREFULLY])
#   2. Run complexity calculator against task description
#   3. If score >= 4, recommend or require Task Graph orchestration
#
# Exit Codes:
#   0 = Continue (task graph guidance is non-blocking at UserPromptSubmit)
#
# Configuration:
#   TASK_GRAPH_ENABLED=1        Enable/disable hook (default: 1)
#   TASK_GRAPH_THRESHOLD=4      Complexity threshold (default: 4)
#   TASK_GRAPH_BLOCKING=0       Deprecated at UserPromptSubmit; retained for telemetry only
#   TASK_GRAPH_VERBOSE=0        Show detailed complexity breakdown (default: 0)
###############################################################################

set -euo pipefail

# Configuration
TASK_GRAPH_ENABLED="${TASK_GRAPH_ENABLED:-1}"
TASK_GRAPH_THRESHOLD="${TASK_GRAPH_THRESHOLD:-4}"
TASK_GRAPH_BLOCKING="${TASK_GRAPH_BLOCKING:-0}"
TASK_GRAPH_VERBOSE="${TASK_GRAPH_VERBOSE:-0}"

emit_noop_json() {
  printf '{}\n'
}

emit_guidance_json() {
  local context="$1"
  local recommendation="$2"
  local score="$3"
  local factors_json="$4"
  local prompt_block_requested="${5:-false}"

  if ! command -v jq &>/dev/null; then
    emit_noop_json
    return 0
  fi

  jq -n \
    --arg context "$context" \
    --arg recommendation "$recommendation" \
    --argjson score "$score" \
    --argjson factors "$factors_json" \
    --argjson prompt_block_requested "$prompt_block_requested" \
    '{
      suppressOutput: true,
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext: $context
      },
      metadata: {
        orchestrationType: "task-graph",
        recommendation: $recommendation,
        score: $score,
        factors: $factors,
        promptBlockRequested: $prompt_block_requested,
        promptBlockSuppressed: $prompt_block_requested
      }
    }'
}

# Exit if disabled
if [ "$TASK_GRAPH_ENABLED" = "0" ]; then
  emit_noop_json
  exit 0
fi

# Get task description from argument or stdin
TASK_DESCRIPTION="${1:-}"
if [ -z "$TASK_DESCRIPTION" ] && [ ! -t 0 ]; then
  TASK_DESCRIPTION=$(cat)
fi

# Exit if no task description
if [ -z "$TASK_DESCRIPTION" ]; then
  emit_noop_json
  exit 0
fi

# Script paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="${SCRIPT_DIR}/.."
COMPLEXITY_CALCULATOR="${PLUGIN_ROOT}/scripts/lib/task-graph/complexity-calculator.js"
OUTPUT_FORMATTER="${PLUGIN_ROOT}/scripts/lib/output-formatter.js"
PROJECT_ROOT="$(cd "$PLUGIN_ROOT/../.." && pwd)"
DEFAULT_LOG_ROOT="${PROJECT_ROOT}/.claude/logs"
LOG_ROOT="${CLAUDE_HOOK_LOG_ROOT:-$DEFAULT_LOG_ROOT}"
FALLBACK_LOG_ROOT="/tmp/.claude/logs"
LOG_DIR=""
LOG_FILE=""

resolve_log_dir() {
  local primary="${LOG_ROOT}/task-graph"
  local fallback="${FALLBACK_LOG_ROOT}/task-graph"

  if mkdir -p "$primary" 2>/dev/null; then
    echo "$primary"
    return 0
  fi

  if mkdir -p "$fallback" 2>/dev/null; then
    echo "$fallback"
    return 0
  fi

  echo ""
  return 1
}

append_log_line() {
  local line="$1"
  if [ -z "$LOG_FILE" ]; then
    return 0
  fi
  printf '%s\n' "$line" >> "$LOG_FILE" 2>/dev/null || true
}

LOG_DIR="$(resolve_log_dir || true)"
if [ -n "$LOG_DIR" ]; then
  LOG_FILE="${LOG_DIR}/trigger-detection.jsonl"
fi

###############################################################################
# Check for User Flags (Highest Priority)
###############################################################################

check_user_flags() {
  local desc="$1"

  # Force Task Graph flags
  if echo "$desc" | grep -qE '\[SEQUENTIAL\]|\[PLAN_CAREFULLY\]|\[COMPLEX\]'; then
    echo "USER_FLAG_FORCE"
    return 0
  fi

  # Skip Task Graph flags
  if echo "$desc" | grep -qE '\[DIRECT\]|\[QUICK_MODE\]|\[SIMPLE\]'; then
    echo "USER_FLAG_SKIP"
    return 0
  fi

  echo "NO_FLAG"
  return 0
}

###############################################################################
# Run Complexity Assessment
###############################################################################

assess_complexity() {
  local desc="$1"

  # Check if calculator exists
  if [ ! -f "$COMPLEXITY_CALCULATOR" ]; then
    echo '{"score":0,"factors":[],"recommendation":"direct_execution","shouldDecompose":false,"error":"calculator_not_found"}'
    return 0
  fi

  # Check if node is available
  if ! command -v node &>/dev/null; then
    echo '{"score":0,"factors":[],"recommendation":"direct_execution","shouldDecompose":false,"error":"node_not_found"}'
    return 0
  fi

  # Run complexity calculator
  node "$COMPLEXITY_CALCULATOR" "$desc" 2>/dev/null || echo '{"score":0,"factors":[],"recommendation":"direct_execution","shouldDecompose":false,"error":"calculation_failed"}'
}

###############################################################################
# Log Decision
###############################################################################

log_decision() {
  local decision="$1"
  local score="$2"
  local factors="$3"

  if command -v jq &>/dev/null; then
    local log_entry
    log_entry=$(jq -nc \
      --arg timestamp "$(date -Iseconds)" \
      --arg decision "$decision" \
      --argjson score "$score" \
      --argjson factors "$factors" \
      --argjson threshold "$TASK_GRAPH_THRESHOLD" \
      '{timestamp: $timestamp, decision: $decision, score: $score, factors: $factors, threshold: $threshold}' 2>/dev/null || true)
    if [ -n "$log_entry" ]; then
      append_log_line "$log_entry"
    fi
  fi
}

###############################################################################
# Format Output
###############################################################################

format_output() {
  local title="$1"
  local message="$2"
  local details="$3"
  local suggestions="$4"

  if [ -f "$OUTPUT_FORMATTER" ] && command -v node &>/dev/null; then
    node "$OUTPUT_FORMATTER" info "$title" "$message" "$details" "$suggestions" "" 1>&2 2>/dev/null || {
      # Fallback to basic output
      echo "" >&2
      echo "📊 $title" >&2
      echo "   $message" >&2
      echo "" >&2
    }
  else
    echo "" >&2
    echo "📊 $title" >&2
    echo "   $message" >&2
    echo "" >&2
  fi
}

###############################################################################
# Main Logic
###############################################################################

main() {
  # Check user flags first
  local flag_result
  flag_result=$(check_user_flags "$TASK_DESCRIPTION")

  case "$flag_result" in
    USER_FLAG_FORCE)
      log_decision "force_task_graph" "10" '["user_flag"]'
      format_output \
        "Task Graph Mode Activated" \
        "User flag detected. Task will be decomposed using Task Graph orchestration." \
        "Flag:Detected,Mode:Sequential" \
        "The task-graph-orchestrator will create a DAG for this request"
      # Exit 0 to allow continuation - the routing system will pick up the recommendation
      emit_noop_json
      exit 0
      ;;
    USER_FLAG_SKIP)
      log_decision "skip_task_graph" "0" '["user_flag_skip"]'
      if [ "$TASK_GRAPH_VERBOSE" = "1" ]; then
        echo "⚡ [Task Graph] Skipped by user flag" >&2
      fi
      emit_noop_json
      exit 0
      ;;
  esac

  # Run complexity assessment
  local complexity_result
  complexity_result=$(assess_complexity "$TASK_DESCRIPTION")

  # Parse result (requires jq)
  if ! command -v jq &>/dev/null; then
    emit_noop_json
    exit 0
  fi

  local score factors recommendation should_decompose
  score=$(echo "$complexity_result" | jq -r '.score // 0')
  factors=$(echo "$complexity_result" | jq -c '.factors // []')
  recommendation=$(echo "$complexity_result" | jq -r '.recommendation // "direct_execution"')
  should_decompose=$(echo "$complexity_result" | jq -r '.shouldDecompose // false')

  # Log the assessment
  log_decision "$recommendation" "$score" "$factors"

  # Check if complexity meets threshold
  if [ "$should_decompose" = "true" ] || [ "$score" -ge "$TASK_GRAPH_THRESHOLD" ]; then
    # Format factors for display
    local factors_display
    factors_display=$(echo "$factors" | jq -r 'join(", ")' 2>/dev/null || echo "$factors")

    if [ "$TASK_GRAPH_BLOCKING" = "1" ]; then
      # Legacy blocking mode is suppressed into internal routing guidance so the
      # user prompt is never rejected for orchestration reasons.
      format_output \
        "Task Graph Required" \
        "Complexity score $score/$((TASK_GRAPH_THRESHOLD * 2)) exceeds threshold. Task Graph orchestration is required." \
        "Score:$score,Factors:$factors_display,Threshold:$TASK_GRAPH_THRESHOLD" \
        "Use the Agent tool with subagent_type='task-graph-orchestrator' to decompose this request"
      emit_guidance_json \
        "TASK GRAPH REQUIRED: Route this request through task-graph-orchestrator before direct execution. Prompt submission continues; use task graph orchestration for decomposition and downstream execution control." \
        "task_graph_required" \
        "$score" \
        "$factors" \
        "true"
      exit 0
    else
      # Recommendation mode - suggest Task Graph
      if [ "$TASK_GRAPH_VERBOSE" = "1" ]; then
        format_output \
          "Task Graph Recommended" \
          "Complexity score $score/$((TASK_GRAPH_THRESHOLD * 2)). Task Graph orchestration is recommended." \
          "Score:$score,Factors:$factors_display,Threshold:$TASK_GRAPH_THRESHOLD" \
          "Consider using task-graph-orchestrator for better tracking and parallel execution"
      else
        echo "" >&2
        echo "📊 [Task Graph] Complexity: $score (factors: $factors_display)" >&2
        echo "   Recommendation: Use task-graph-orchestrator for this request" >&2
        echo "" >&2
      fi
      emit_guidance_json \
        "TASK GRAPH RECOMMENDED: Consider routing this request through task-graph-orchestrator for better decomposition, tracking, and parallel execution." \
        "task_graph_recommended" \
        "$score" \
        "$factors" \
        "false"
      exit 0
    fi
  fi

  # Below threshold - no Task Graph needed
  if [ "$TASK_GRAPH_VERBOSE" = "1" ]; then
    echo "✅ [Task Graph] Complexity $score < threshold $TASK_GRAPH_THRESHOLD - direct execution OK" >&2
  fi

  emit_noop_json
  exit 0
}

# Run main function
main

###############################################################################
# Exit Codes:
#   0 = Continue (task graph guidance is emitted without blocking prompt submission)
###############################################################################
