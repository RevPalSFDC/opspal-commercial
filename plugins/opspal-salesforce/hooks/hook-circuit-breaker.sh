#!/usr/bin/env bash

#
# Hook Circuit Breaker - Graceful degradation for hook failures
#
# Implements circuit breaker pattern for hooks to prevent cascading failures:
#
# States:
# - CLOSED: Normal operation, hook runs
# - OPEN: Hook failed 3+ times, bypass hook (log warning)
# - HALF-OPEN: After cooldown, try one request (test recovery)
#
# Behavior:
# - 3 failures within 5 minutes → OPEN circuit (bypass hook)
# - 2-minute cooldown → HALF-OPEN (test recovery)
# - Success in HALF-OPEN → CLOSED (resume normal operation)
# - Failure in HALF-OPEN → OPEN (extend cooldown)
#
# Metrics:
# - Failure rate tracking
# - Circuit state logging
# - Performance monitoring
# - Recovery attempts
#
# Usage:
#   HOOK_SCRIPT="path/to/hook.sh" bash hook-circuit-breaker.sh
#   Input: JSON via stdin
#   Output: JSON with systemMessage or passthrough
#
# Version: 1.1.0 (Error Handler Integration)
# Date: 2025-11-24
#

set -euo pipefail

# Source standardized error handler for centralized logging
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -n "${CLAUDE_PLUGIN_ROOT:-}" ]]; then
    ERROR_HANDLER="${CLAUDE_PLUGIN_ROOT}/opspal-core/hooks/lib/error-handler.sh"
else
    ERROR_HANDLER="${SCRIPT_DIR}/../../opspal-core/hooks/lib/error-handler.sh"
fi
if ! command -v jq &>/dev/null; then
    echo "[hook-circuit-breaker] jq not found, skipping" >&2
    exit 0
fi


if [[ -f "$ERROR_HANDLER" ]]; then
    source "$ERROR_HANDLER"
    HOOK_NAME="hook-circuit-breaker"
    # Keep strict mode - circuit breaker needs proper error tracking
fi

# Configuration
STATE_FILE="${CLAUDE_PLUGIN_ROOT:-$(dirname "$0")/..}/.claude/hook-circuit-state.json"
METRICS_FILE="${CLAUDE_PLUGIN_ROOT:-$(dirname "$0")/..}/.claude/hook-metrics.json"
FAILURE_THRESHOLD=3
FAILURE_WINDOW_SECONDS=300  # 5 minutes
COOLDOWN_SECONDS=120        # 2 minutes
HOOK_TIMEOUT=10             # 10 seconds (matches settings.json)

# Get the hook script to wrap
HOOK_SCRIPT="${HOOK_SCRIPT:-}"
if [ -z "$HOOK_SCRIPT" ]; then
  echo '{"error": "HOOK_SCRIPT environment variable required"}' >&2
  exit 1
fi

# Read input
HOOK_INPUT=$(cat 2>/dev/null || true)

# ═══════════════════════════════════════════════════════════════
# STATE MANAGEMENT
# ═══════════════════════════════════════════════════════════════

load_state() {
  if [ -f "$STATE_FILE" ]; then
    cat "$STATE_FILE"
  else
    echo '{
      "state": "CLOSED",
      "failures": [],
      "lastStateChange": '$(date +%s)',
      "successCount": 0,
      "failureCount": 0,
      "openCount": 0,
      "recoveryAttempts": 0
    }'
  fi
}

save_state() {
  local state_json="$1"
  mkdir -p "$(dirname "$STATE_FILE")"
  echo "$state_json" > "$STATE_FILE"
}

get_current_state() {
  local state_json="$1"
  echo "$state_json" | jq -r '.state'
}

# ═══════════════════════════════════════════════════════════════
# FAILURE TRACKING
# ═══════════════════════════════════════════════════════════════

record_failure() {
  local state_json="$1"
  local now=$(date +%s)

  # Add new failure timestamp
  state_json=$(echo "$state_json" | jq --argjson now "$now" '.failures += [$now] | .failureCount += 1')

  # Clean old failures outside window
  local window_start=$((now - FAILURE_WINDOW_SECONDS))
  state_json=$(echo "$state_json" | jq --argjson ws "$window_start" '.failures = [.failures[] | select(. > $ws)]')

  echo "$state_json"
}

record_success() {
  local state_json="$1"
  echo "$state_json" | jq '.successCount += 1 | .failures = []'
}

get_recent_failures() {
  local state_json="$1"
  echo "$state_json" | jq '.failures | length'
}

# ═══════════════════════════════════════════════════════════════
# CIRCUIT BREAKER LOGIC
# ═══════════════════════════════════════════════════════════════

should_attempt_execution() {
  local state_json="$1"
  local current_state=$(get_current_state "$state_json")
  local now=$(date +%s)
  local last_change=$(echo "$state_json" | jq -r '.lastStateChange')
  local time_since_change=$((now - last_change))

  case "$current_state" in
    CLOSED)
      echo "true"
      ;;
    OPEN)
      # Check if cooldown period has passed
      if [ "$time_since_change" -ge "$COOLDOWN_SECONDS" ]; then
        echo "half-open"  # Special case: transition to HALF-OPEN
      else
        echo "false"
      fi
      ;;
    HALF-OPEN)
      echo "true"  # Allow one attempt
      ;;
    *)
      echo "true"  # Default to allowing execution
      ;;
  esac
}

transition_state() {
  local state_json="$1"
  local new_state="$2"
  local now=$(date +%s)

  state_json=$(echo "$state_json" | jq --arg ns "$new_state" --argjson now "$now" '
    .state = $ns | .lastStateChange = $now
  ')

  # Track open events
  if [ "$new_state" = "OPEN" ]; then
    state_json=$(echo "$state_json" | jq '.openCount += 1')
  fi

  # Track recovery attempts
  if [ "$new_state" = "HALF-OPEN" ]; then
    state_json=$(echo "$state_json" | jq '.recoveryAttempts += 1')
  fi

  echo "$state_json"
}

# ═══════════════════════════════════════════════════════════════
# METRICS
# ═══════════════════════════════════════════════════════════════

log_metrics() {
  local event="$1"
  local state="$2"
  local execution_time_ms="${3:-0}"

  mkdir -p "$(dirname "$METRICS_FILE")"

  local metric="{
    \"timestamp\": $(date +%s),
    \"event\": \"$event\",
    \"state\": \"$state\",
    \"executionTimeMs\": $execution_time_ms,
    \"hook\": \"$(basename "$HOOK_SCRIPT")\"
  }"

  # Append to metrics file (keep last 1000 entries)
  if [ -f "$METRICS_FILE" ]; then
    local metrics=$(cat "$METRICS_FILE")
    echo "$metrics" | jq --argjson m "$metric" '. += [$m] | .[-1000:]' > "$METRICS_FILE"
  else
    echo "[$metric]" > "$METRICS_FILE"
  fi
}

# ═══════════════════════════════════════════════════════════════
# HOOK EXECUTION
# ═══════════════════════════════════════════════════════════════

execute_hook() {
  local start_time=$(date +%s%3N)  # milliseconds

  # Execute hook with timeout
  local output
  local exit_code=0

  output=$(echo "$HOOK_INPUT" | timeout "$HOOK_TIMEOUT" bash "$HOOK_SCRIPT" 2>&1) || exit_code=$?

  local end_time=$(date +%s%3N)
  local execution_time=$((end_time - start_time))

  if [ $exit_code -eq 0 ]; then
    echo "$output"
    return 0
  else
    echo '{}' # Empty JSON on failure
    return "$exit_code"
  fi
}

# ═══════════════════════════════════════════════════════════════
# MAIN CIRCUIT BREAKER LOGIC
# ═══════════════════════════════════════════════════════════════

main() {
  # Load current state
  state_json=$(load_state)
  current_state=$(get_current_state "$state_json")

  # Check if we should attempt execution
  should_execute=$(should_attempt_execution "$state_json")

  if [ "$should_execute" = "half-open" ]; then
    # Transition to HALF-OPEN for recovery test
    state_json=$(transition_state "$state_json" "HALF-OPEN")
    save_state "$state_json"
    should_execute="true"
    log_metrics "transition" "HALF-OPEN" 0
  fi

  if [ "$should_execute" = "false" ]; then
    # Circuit is OPEN - bypass hook
    log_metrics "bypassed" "OPEN" 0

    # Return passthrough with warning
    echo '{
      "systemMessage": "⚠️  Hook circuit breaker is OPEN (too many failures). Hook bypassed for safety. Normal operation will resume after cooldown.",
      "circuitBreakerState": "OPEN",
      "bypassed": true
    }'

    save_state "$state_json"
    exit 0
  fi

  # Attempt hook execution
  start_time=$(date +%s%3N)
  output=$(execute_hook) || exit_code=$?
  end_time=$(date +%s%3N)
  execution_time=$((end_time - start_time))

  if [ "${exit_code:-0}" -eq 0 ]; then
    # SUCCESS
    state_json=$(record_success "$state_json")

    # If we were in HALF-OPEN, transition back to CLOSED
    if [ "$current_state" = "HALF-OPEN" ]; then
      state_json=$(transition_state "$state_json" "CLOSED")
      log_metrics "recovery_success" "CLOSED" "$execution_time"
    else
      log_metrics "success" "$current_state" "$execution_time"
    fi

    save_state "$state_json"
    echo "$output"
    exit 0

  else
    # FAILURE
    state_json=$(record_failure "$state_json")
    recent_failures=$(get_recent_failures "$state_json")

    log_metrics "failure" "$current_state" "$execution_time"

    # Check if we should open the circuit
    if [ "$recent_failures" -ge "$FAILURE_THRESHOLD" ]; then
      state_json=$(transition_state "$state_json" "OPEN")
      log_metrics "transition" "OPEN" 0

      echo "{
        \"systemMessage\": \"⚠️  Hook circuit breaker OPENED after $recent_failures failures. Hook bypassed to prevent cascading failures. Will retry after ${COOLDOWN_SECONDS}s cooldown.\",
        \"circuitBreakerState\": \"OPEN\",
        \"recentFailures\": $recent_failures,
        \"bypassed\": true
      }"
    else
      echo "{
        \"hookSpecificOutput\": {
          \"hookEventName\": \"PreToolUse\",
          \"additionalContext\": \"WARNING: Hook failed ($recent_failures/$FAILURE_THRESHOLD failures). Operation allowed but hook protection may be degraded.\"
        },
        \"systemMessage\": \"⚠️  Hook failed but circuit breaker still CLOSED ($recent_failures/$FAILURE_THRESHOLD failures). Allowing operation to proceed.\",
        \"circuitBreakerState\": \"CLOSED\",
        \"recentFailures\": $recent_failures,
        \"hookFailed\": true
      }"
    fi

    save_state "$state_json"
    exit 0  # Don't fail the overall operation
  fi
}

# Run main logic
main
