#!/bin/bash

###############################################################################
# Pre-Operation Idempotency Check Hook
#
# Prevents duplicate operations by checking operation registry before execution.
#
# Addresses: Cohort 4 (operation/idempotency) - 7 reflections, $10.5K ROI
#
# Prevention Target: Operations run multiple times causing duplicates/inconsistency
#
# How It Works:
# 1. Detects high-risk operations (deploy, update, create, delete)
# 2. Generates operation fingerprint from context
# 3. Checks if operation already completed
# 4. Blocks duplicate operations, allows safe retries
#
# Configuration:
#   IDEMPOTENCY_CHECK_ENABLED=1     # Enable checking (default: 1)
#   IDEMPOTENCY_CHECK_STRICT=0      # Block all in-progress operations (default: 0)
#   IDEMPOTENCY_AUTO_CLEANUP=1      # Auto-cleanup stale operations (default: 1)
#
# Exit Codes:
#   0 - Operation allowed (not duplicate or safe retry)
#   1 - Operation blocked (duplicate detected)
#   2 - Configuration error
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
    HOOK_NAME="pre-operation-idempotency-check"
fi

# Configuration
ENABLED="${IDEMPOTENCY_CHECK_ENABLED:-1}"
STRICT="${IDEMPOTENCY_CHECK_STRICT:-0}"
AUTO_CLEANUP="${IDEMPOTENCY_AUTO_CLEANUP:-1}"

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_DIR="$(dirname "$SCRIPT_DIR")"
REGISTRY_SCRIPT="$PLUGIN_DIR/scripts/lib/operation-registry.js"

# OutputFormatter and HookLogger
OUTPUT_FORMATTER="$PLUGIN_DIR/scripts/lib/output-formatter.js"
HOOK_LOGGER="$PLUGIN_DIR/scripts/lib/hook-logger.js"
HOOK_NAME="pre-operation-idempotency-check"

# Only run if enabled
if [ "$ENABLED" != "1" ]; then
  exit 0
fi

# Check if operation registry exists
if [ ! -f "$REGISTRY_SCRIPT" ]; then
  echo "⚠️  Operation registry not found: $REGISTRY_SCRIPT"
  exit 0  # Don't block if registry not available
fi

# Parse hook input to detect operation type
# Input format: tool=<tool-name> args=<json>
TOOL_NAME=""
TOOL_ARGS=""

while IFS='=' read -r key value; do
  case "$key" in
    tool) TOOL_NAME="$value" ;;
    args) TOOL_ARGS="$value" ;;
  esac
done

# Detect high-risk operations that should be checked
is_high_risk_operation() {
  local tool="$1"
  local args="$2"

  # Deployment operations
  if [[ "$tool" == "Bash" ]] && [[ "$args" =~ (sf\ project\ deploy|sf\ data\ upsert|sf\ data\ update) ]]; then
    echo "deployment"
    return 0
  fi

  # Metadata operations
  if [[ "$tool" == "Bash" ]] && [[ "$args" =~ (sf\ cmdt\ create|sf\ object\ create|sf\ field\ create) ]]; then
    echo "metadata_creation"
    return 0
  fi

  # Data operations
  if [[ "$tool" == "Bash" ]] && [[ "$args" =~ (sf\ data\ delete|sf\ data\ bulk) ]]; then
    echo "data_modification"
    return 0
  fi

  # HubSpot operations
  if [[ "$args" =~ (createProperty|updateProperty|createWorkflow) ]]; then
    echo "hubspot_metadata"
    return 0
  fi

  # Write operations on critical files
  if [[ "$tool" == "Write" ]] && [[ "$args" =~ (force-app|package\.xml|sfdx-project\.json) ]]; then
    echo "metadata_file"
    return 0
  fi

  return 1
}

# Extract operation context from arguments
extract_context() {
  local tool="$1"
  local args="$2"

  # For Bash commands, extract key parameters
  if [[ "$tool" == "Bash" ]]; then
    # Extract org alias if present
    local org=""
    if [[ "$args" =~ --target-org[\ =]([^\ ]+) ]]; then
      org="${BASH_REMATCH[1]}"
    elif [[ "$args" =~ -o[\ ]([^\ ]+) ]]; then
      org="${BASH_REMATCH[1]}"
    fi

    # Extract source directory if present
    local source=""
    if [[ "$args" =~ --source-dir[\ =]([^\ ]+) ]]; then
      source="${BASH_REMATCH[1]}"
    elif [[ "$args" =~ -d[\ ]([^\ ]+) ]]; then
      source="${BASH_REMATCH[1]}"
    fi

    # Extract metadata type if present
    local metadata=""
    if [[ "$args" =~ --metadata[\ =]([^\ ]+) ]]; then
      metadata="${BASH_REMATCH[1]}"
    fi

    # Build context JSON
    echo "{\"org\":\"$org\",\"source\":\"$source\",\"metadata\":\"$metadata\",\"command\":\"$args\"}"
    return 0
  fi

  # For Write operations, use file path
  if [[ "$tool" == "Write" ]]; then
    local filepath=""
    if [[ "$args" =~ file_path[\"\':]\ *[\"\':]([^\"\']+) ]]; then
      filepath="${BASH_REMATCH[1]}"
    fi
    echo "{\"filepath\":\"$filepath\"}"
    return 0
  fi

  # Default: use full args as context
  echo "{\"args\":\"$args\"}"
}

# Check operation
OPERATION_TYPE=$(is_high_risk_operation "$TOOL_NAME" "$TOOL_ARGS")

if [ -z "$OPERATION_TYPE" ]; then
  # Not a high-risk operation, allow it
  exit 0
fi

# Extract context
CONTEXT=$(extract_context "$TOOL_NAME" "$TOOL_ARGS")

# Check if operation can retry
RETRY_CHECK=$(node "$REGISTRY_SCRIPT" check "$OPERATION_TYPE" "$CONTEXT" 2>/dev/null)

if [ $? -ne 0 ]; then
  echo "⚠️  Could not check operation registry"
  exit 0  # Don't block on registry errors
fi

# Parse retry check result
CAN_RETRY=$(echo "$RETRY_CHECK" | jq -r '.canRetry // true')
REASON=$(echo "$RETRY_CHECK" | jq -r '.reason // "unknown"')

# Auto-cleanup stale operations
if [ "$AUTO_CLEANUP" == "1" ] && [ "$REASON" == "stale_operation" ]; then
  echo "🧹 Cleaning up stale operation..."
  node "$REGISTRY_SCRIPT" cleanup 30 >/dev/null 2>&1
  exit 0  # Allow operation after cleanup
fi

# Decide whether to allow operation
if [ "$CAN_RETRY" == "false" ]; then
  case "$REASON" in
    already_completed)
      PREVIOUS_RESULT=$(echo "$RETRY_CHECK" | jq -r '.result // "No result available"')

      # Log blocked duplicate
      [ -f "$HOOK_LOGGER" ] && node "$HOOK_LOGGER" error "$HOOK_NAME" "Duplicate operation blocked - already completed" \
        "{\"operationType\":\"$OPERATION_TYPE\",\"context\":$CONTEXT,\"previousResult\":\"$PREVIOUS_RESULT\"}"

      if [ -f "$OUTPUT_FORMATTER" ]; then
        node "$OUTPUT_FORMATTER" error \
          "Operation Blocked - Already Completed" \
          "This operation has already been completed successfully and should not be re-run" \
          "Operation Type:$OPERATION_TYPE,Previous Result:$PREVIOUS_RESULT" \
          "Verify operation is actually needed,Delete operation record to force re-run,Check if result is already applied" \
          "Prevents duplicate operations • \$10.5K/year ROI"
        exit 1
      else
        echo "🚫 Operation Blocked: Already Completed"
        echo ""
        echo "This operation has already been completed successfully."
        echo "Operation Type: $OPERATION_TYPE"
        echo ""
        echo "Previous Result: $PREVIOUS_RESULT"
        exit 1
      fi
      ;;

    operation_in_progress)
      STARTED_AT=$(echo "$RETRY_CHECK" | jq -r '.previousOperation.startedAt // "unknown"')

      if [ "$STRICT" == "1" ]; then
        # Log blocked concurrent operation
        [ -f "$HOOK_LOGGER" ] && node "$HOOK_LOGGER" error "$HOOK_NAME" "Concurrent operation blocked - already in progress" \
          "{\"operationType\":\"$OPERATION_TYPE\",\"context\":$CONTEXT,\"startedAt\":\"$STARTED_AT\",\"strictMode\":true}"

        if [ -f "$OUTPUT_FORMATTER" ]; then
          node "$OUTPUT_FORMATTER" error \
            "Operation Blocked - Already In Progress" \
            "Another instance of this operation is currently running (STRICT mode enabled)" \
            "Operation Type:$OPERATION_TYPE,Started At:$STARTED_AT,Strict Mode:enabled" \
            "Wait for current operation to complete,Set IDEMPOTENCY_CHECK_STRICT=0 to allow concurrent operations,Check if operation is stuck" \
            ""
          exit 1
        else
          echo "🚫 Operation Blocked: Already In Progress"
          echo ""
          echo "Another instance of this operation is currently running."
          echo "Operation Type: $OPERATION_TYPE"
          echo "Started At: $STARTED_AT"
          echo ""
          echo "Set IDEMPOTENCY_CHECK_STRICT=0 to allow concurrent operations."
          exit 1
        fi
      else
        # Log warning for concurrent operation
        [ -f "$HOOK_LOGGER" ] && node "$HOOK_LOGGER" warning "$HOOK_NAME" "Concurrent operation allowed - already in progress" \
          "{\"operationType\":\"$OPERATION_TYPE\",\"context\":$CONTEXT,\"startedAt\":\"$STARTED_AT\",\"strictMode\":false}"

        # Exit 2 pattern: Automatic feedback to Claude without blocking
        if [ -f "$OUTPUT_FORMATTER" ]; then
          node "$OUTPUT_FORMATTER" warning \
            "Concurrent Operation Detected" \
            "Another instance is already in progress but allowing concurrent execution (STRICT mode disabled)" \
            "Operation Type:$OPERATION_TYPE,Started At:$STARTED_AT,Strict Mode:disabled" \
            "Monitor for conflicts or race conditions,Consider enabling STRICT mode for critical operations,Ensure operations are idempotent" \
            ""
          exit 2
        else
          echo "⚠️  Warning: Operation already in progress" >&2
          echo "Allowing concurrent execution (STRICT mode disabled)" >&2
          echo "Operation Type: $OPERATION_TYPE" >&2
          echo "Started At: $STARTED_AT" >&2
          exit 2
        fi
      fi
      ;;

    not_retryable)
      ERROR_MESSAGE=$(echo "$RETRY_CHECK" | jq -r '.previousOperation.error.message // "unknown"')

      # Log non-retryable operation
      [ -f "$HOOK_LOGGER" ] && node "$HOOK_LOGGER" error "$HOOK_NAME" "Operation blocked - previous failure not retryable" \
        "{\"operationType\":\"$OPERATION_TYPE\",\"context\":$CONTEXT,\"errorMessage\":\"$ERROR_MESSAGE\"}"

      if [ -f "$OUTPUT_FORMATTER" ]; then
        node "$OUTPUT_FORMATTER" error \
          "Operation Blocked - Not Retryable" \
          "This operation failed previously and is marked as non-retryable until the error is resolved" \
          "Operation Type:$OPERATION_TYPE,Previous Error:$ERROR_MESSAGE" \
          "Review and resolve the previous error,Fix root cause before retrying,Clear operation record if error is resolved" \
          ""
        exit 1
      else
        echo "🚫 Operation Blocked: Not Retryable"
        echo ""
        echo "This operation failed previously and is marked as non-retryable."
        echo "Operation Type: $OPERATION_TYPE"
        echo "Error: $ERROR_MESSAGE"
        echo ""
        echo "Review the error and resolve before retrying."
        exit 1
      fi
      ;;

    *)
      # Unknown reason, allow operation
      exit 0
      ;;
  esac
else
  # Can retry - allow operation
  if [ "$REASON" != "no_previous_operation" ]; then
    echo "✅ Operation allowed: $REASON"

    # Log allowed retry
    [ -f "$HOOK_LOGGER" ] && node "$HOOK_LOGGER" info "$HOOK_NAME" "Operation allowed - safe retry" \
      "{\"operationType\":\"$OPERATION_TYPE\",\"context\":$CONTEXT,\"reason\":\"$REASON\"}"
  fi
  exit 0
fi
