#!/usr/bin/env bash
# STATUS: SUPERSEDED — absorbed by a registered dispatcher or consolidated hook
set -euo pipefail

###############################################################################
# Prevention System Orchestrator
#
# Master hook that coordinates all Phase 1-3 prevention hooks.
#
# Runs at UserPromptSubmit and intelligently calls appropriate prevention hooks
# based on the user's request context.
#
# Hook Coordination:
# - Phase 1.1: pre-task-routing-clarity.sh (routing explanations)
# - Phase 1.2: pre-operation-env-validator.sh (environment config)
# - Phase 1.3: post-edit-verification.sh (handled separately after edits)
# - Phase 2.1: pre-operation-idempotency-check.sh (duplicate prevention)
# - Phase 2.2: pre-plan-scope-validation.sh (scope validation)
# - Phase 2.3: pre-task-agent-recommendation.sh (agent recommendations)
# - Phase 3.2: pre-operation-snapshot.sh (error recovery)
# - Phase 3.3: session-context-loader.sh (handled at SessionStart)
#
# Configuration:
#   PREVENTION_SYSTEM_ENABLED=1     # Master enable/disable (default: 1)
#   PREVENTION_SYSTEM_VERBOSE=0     # Show all hook outputs (default: 0)
#
# Exit Codes:
#   0 - All checks passed or warnings only
#   1 - Critical prevention check failed (operation blocked)
###############################################################################

# Master configuration
ENABLED="${PREVENTION_SYSTEM_ENABLED:-1}"
VERBOSE="${PREVENTION_SYSTEM_VERBOSE:-0}"

# Only run if enabled
if [ "$ENABLED" != "1" ]; then
  exit 0
fi

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# OutputFormatter and HookLogger
OUTPUT_FORMATTER="$SCRIPT_DIR/../scripts/lib/output-formatter.js"
HOOK_LOGGER="$SCRIPT_DIR/../scripts/lib/hook-logger.js"
HOOK_NAME="prevention-system-orchestrator"

# Get user prompt from stdin
USER_PROMPT=""
if [ -t 0 ]; then
  # Not piped input, try from args
  USER_PROMPT="$*"
else
  # Piped input
  USER_PROMPT=$(cat)
fi

# Skip if no prompt
if [ -z "$USER_PROMPT" ]; then
  exit 0
fi

# Track outputs
OUTPUTS=()
WARNINGS=0
ERRORS=0

# Helper: Run hook and capture output
run_hook() {
  local hook_name="$1"
  local hook_path="$SCRIPT_DIR/$hook_name"

  if [ ! -f "$hook_path" ]; then
    if [ "$VERBOSE" == "1" ]; then
      echo "⚠️  Hook not found: $hook_name"
    fi
    return 0
  fi

  # Run hook with prompt as input
  local output
  output=$(echo "$USER_PROMPT" | bash "$hook_path" 2>&1)
  local exit_code=$?

  # Store output
  if [ -n "$output" ]; then
    OUTPUTS+=("$output")
  fi

  # Track warnings/errors
  if [ $exit_code -eq 1 ]; then
    ERRORS=$((ERRORS + 1))
  elif [ $exit_code -eq 2 ]; then
    WARNINGS=$((WARNINGS + 1))
  fi

  return $exit_code
}

# Detect request type from prompt
detect_request_type() {
  local prompt="$1"
  local types=""

  # Check for plan mode
  if echo "$prompt" | grep -qiE '\b(plan|planning|scope|requirements?)\b'; then
    types="${types}plan "
  fi

  # Check for operations
  if echo "$prompt" | grep -qiE '\b(deploy|update|delete|create|modify|upsert)\b'; then
    types="${types}operation "
  fi

  # Check for agent/routing requests
  if echo "$prompt" | grep -qiE '\b(agent|routing|recommend|suggest)\b'; then
    types="${types}agent "
  fi

  # Check for all/every/entire (unbounded scope)
  if echo "$prompt" | grep -qiE '\b(all|every|entire|comprehensive|complete)\b'; then
    types="${types}unbounded "
  fi

  echo "$types"
}

# Detect request types
REQUEST_TYPES=$(detect_request_type "$USER_PROMPT")

if [ "$VERBOSE" == "1" ]; then
  echo "🔍 Prevention System Active"
  echo "   Request types: ${REQUEST_TYPES:-none detected}"
  echo ""
fi

# Run appropriate hooks based on request type

# Always run routing clarity (Phase 1.1) for better transparency
if [ "${ROUTING_CLARITY_ENABLED:-1}" == "1" ]; then
  if run_hook "pre-task-routing-clarity.sh"; then
    : # Success
  else
    if [ $? -eq 1 ]; then
      exit 1  # Block on error
    fi
  fi
fi

# Run agent recommendation (Phase 2.3) for complex tasks
if echo "$REQUEST_TYPES" | grep -q "agent"; then
  if [ "${AGENT_RECOMMENDATION_ENABLED:-1}" == "1" ]; then
    run_hook "pre-task-agent-recommendation.sh"
  fi
fi

# Run plan scope validation (Phase 2.2) for planning requests
if echo "$REQUEST_TYPES" | grep -qE "plan|unbounded"; then
  if [ "${PLAN_VALIDATION_ENABLED:-1}" == "1" ]; then
    if run_hook "pre-plan-scope-validation.sh"; then
      : # Success or warning
    else
      if [ $? -eq 1 ]; then
        # Log scope validation failure
        [ -f "$HOOK_LOGGER" ] && node "$HOOK_LOGGER" error "$HOOK_NAME" "Scope validation failed - request blocked" \
          "{\"requestTypes\":\"$REQUEST_TYPES\",\"warnings\":$WARNINGS,\"errors\":$((ERRORS + 1))}"

        if [ -f "$OUTPUT_FORMATTER" ]; then
          node "$OUTPUT_FORMATTER" error \
            "Scope Validation Failed" \
            "Request blocked by prevention system - scope risks detected" \
            "Request Types:$REQUEST_TYPES,Warnings:$WARNINGS,Errors:$((ERRORS + 1))" \
            "Review and answer all clarification questions,Refine the request with specific scope limits,Set PLAN_VALIDATION_ENABLED=0 to bypass" \
            "Part of Prevention System • \$37K/year ROI"
          exit 1
        else
          echo "🚫 Scope validation failed - request blocked"
          exit 1
        fi
      fi
    fi
  fi
fi

# Run environment validation (Phase 1.2) for operations
if echo "$REQUEST_TYPES" | grep -q "operation"; then
  if [ "${ENV_VALIDATION_ENABLED:-1}" == "1" ]; then
    run_hook "pre-operation-env-validator.sh"
  fi
fi

# Run idempotency check (Phase 2.1) for operations
if echo "$REQUEST_TYPES" | grep -q "operation"; then
  if [ "${IDEMPOTENCY_CHECK_ENABLED:-1}" == "1" ]; then
    if run_hook "pre-operation-idempotency-check.sh"; then
      : # Success
    else
      if [ $? -eq 1 ]; then
        # Log idempotency check failure
        [ -f "$HOOK_LOGGER" ] && node "$HOOK_LOGGER" error "$HOOK_NAME" "Idempotency check failed - duplicate operation blocked" \
          "{\"requestTypes\":\"$REQUEST_TYPES\",\"warnings\":$WARNINGS,\"errors\":$((ERRORS + 1))}"

        if [ -f "$OUTPUT_FORMATTER" ]; then
          node "$OUTPUT_FORMATTER" error \
            "Idempotency Check Failed" \
            "Request blocked by prevention system - duplicate operation detected" \
            "Request Types:$REQUEST_TYPES,Warnings:$WARNINGS,Errors:$((ERRORS + 1))" \
            "Verify operation is actually needed,Delete operation record to force re-run,Check if result is already applied,Set IDEMPOTENCY_CHECK_ENABLED=0 to bypass" \
            "Part of Prevention System • \$37K/year ROI"
          exit 1
        else
          echo "🚫 Idempotency check failed - duplicate operation blocked"
          exit 1
        fi
      fi
    fi
  fi
fi

# Run snapshot capture (Phase 3.2) for risky operations
if echo "$USER_PROMPT" | grep -qiE '\b(deploy|delete|bulk|production)\b'; then
  if [ "${ERROR_RECOVERY_ENABLED:-1}" == "1" ]; then
    run_hook "pre-operation-snapshot.sh"
  fi
fi

# Display collected outputs if verbose
if [ "$VERBOSE" == "1" ] && [ ${#OUTPUTS[@]} -gt 0 ]; then
  echo ""
  echo "📋 Prevention Hook Outputs:"
  for output in "${OUTPUTS[@]}"; do
    echo "$output"
    echo "---"
  done
fi

# Display summary if there were warnings/errors
if [ $WARNINGS -gt 0 ] || [ $ERRORS -gt 0 ]; then
  if [ "$VERBOSE" == "1" ]; then
    echo ""
    echo "⚠️  Prevention Summary:"
    echo "   Warnings: $WARNINGS"
    echo "   Errors: $ERRORS"
  fi
fi

# Exit with appropriate code
if [ $ERRORS -gt 0 ]; then
  exit 1  # Block request
else
  exit 0  # Allow request
fi
