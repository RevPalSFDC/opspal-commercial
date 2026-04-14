#!/usr/bin/env bash
# STATUS: SUPERSEDED — absorbed by a registered dispatcher or consolidated hook
set -euo pipefail

if ! command -v jq &>/dev/null; then
    echo "[pre-operation-snapshot] jq not found, skipping" >&2
    exit 0
fi

###############################################################################
# Pre-Operation Snapshot Hook
#
# Captures state before risky operations for rollback capability.
#
# Addresses: Phase 3.2 - Defensive error recovery
#
# Prevention Target: Operations failing without rollback capability
#
# How It Works:
# 1. Detects risky operations (deploy, delete, bulk update)
# 2. Captures current state snapshot
# 3. Stores snapshot ID for recovery
# 4. Enables automatic rollback on failure
#
# Configuration:
#   ERROR_RECOVERY_ENABLED=1        # Enable snapshots (default: 1)
#   ERROR_RECOVERY_AUTO_ROLLBACK=1  # Auto-rollback on fail (default: 1)
#   ERROR_RECOVERY_VERBOSE=0        # Show snapshot details (default: 0)
#
# Exit Codes:
#   0 - Snapshot captured or not needed
#   1 - Snapshot failed (critical operations only)
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
    HOOK_NAME="pre-operation-snapshot"
    # Lenient mode - snapshots should not block operations if they fail
    set_lenient_mode 2>/dev/null || true
fi

# Configuration
ENABLED="${ERROR_RECOVERY_ENABLED:-1}"
AUTO_ROLLBACK="${ERROR_RECOVERY_AUTO_ROLLBACK:-1}"
VERBOSE="${ERROR_RECOVERY_VERBOSE:-0}"

# Only run if enabled
if [ "$ENABLED" != "1" ]; then
  exit 0
fi

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_DIR="$(dirname "$SCRIPT_DIR")"
RECOVERY_SCRIPT="$PLUGIN_DIR/scripts/lib/error-recovery-manager.js"

# OutputFormatter and HookLogger
OUTPUT_FORMATTER="$PLUGIN_DIR/scripts/lib/output-formatter.js"
HOOK_LOGGER="$PLUGIN_DIR/scripts/lib/hook-logger.js"
HOOK_NAME="pre-operation-snapshot"

# Check if recovery manager exists
if [ ! -f "$RECOVERY_SCRIPT" ]; then
  exit 0  # Don't block if recovery not available
fi

# Parse hook input
# Input format: tool=<tool-name> args=<json>
TOOL_NAME=""
TOOL_ARGS=""

while IFS='=' read -r key value; do
  case "$key" in
    tool) TOOL_NAME="$value" ;;
    args) TOOL_ARGS="$value" ;;
  esac
done

# Detect risky operations that should have snapshots
is_risky_operation() {
  local tool="$1"
  local args="$2"

  # Deployment operations
  if [[ "$tool" == "Bash" ]] && [[ "$args" =~ (sf\ project\ deploy|sf\ mdapi\ deploy) ]]; then
    echo "deployment"
    return 0
  fi

  # Bulk data operations
  if [[ "$tool" == "Bash" ]] && [[ "$args" =~ (sf\ data\ bulk|sf\ data\ delete) ]]; then
    echo "bulk_data"
    return 0
  fi

  # Data updates
  if [[ "$tool" == "Bash" ]] && [[ "$args" =~ (sf\ data\ upsert|sf\ data\ update) ]]; then
    echo "data_update"
    return 0
  fi

  # Destructive metadata operations
  if [[ "$tool" == "Bash" ]] && [[ "$args" =~ (sf\ object\ delete|sf\ field\ delete) ]]; then
    echo "metadata_deletion"
    return 0
  fi

  # HubSpot bulk operations
  if [[ "$args" =~ (bulkDelete|bulkUpdate|deleteProperty) ]]; then
    echo "hubspot_bulk"
    return 0
  fi

  return 1
}

# Extract operation context
extract_context() {
  local tool="$1"
  local args="$2"

  # For Bash commands, extract key parameters
  if [[ "$tool" == "Bash" ]]; then
    local org=""
    if [[ "$args" =~ --target-org[\ =]([^\ ]+) ]]; then
      org="${BASH_REMATCH[1]}"
    fi

    local source=""
    if [[ "$args" =~ --source-dir[\ =]([^\ ]+) ]]; then
      source="${BASH_REMATCH[1]}"
    fi

    # Build context JSON
    echo "{\"org\":\"$org\",\"source\":\"$source\",\"command\":\"$args\"}"
    return 0
  fi

  # Default context
  echo "{\"tool\":\"$tool\",\"args\":\"$args\"}"
}

# Check if operation is risky
OPERATION_TYPE=$(is_risky_operation "$TOOL_NAME" "$TOOL_ARGS")

if [ -z "$OPERATION_TYPE" ]; then
  # Not a risky operation, no snapshot needed
  exit 0
fi

# Extract context
CONTEXT=$(extract_context "$TOOL_NAME" "$TOOL_ARGS")

# Capture snapshot
if [ "$VERBOSE" == "1" ]; then
  echo "📸 Capturing state snapshot before $OPERATION_TYPE operation..."
fi

# Use node to capture snapshot
SNAPSHOT_RESULT=$(node -e "
const { ErrorRecoveryManager } = require('$RECOVERY_SCRIPT');
const recovery = new ErrorRecoveryManager();

async function capture() {
  try {
    const snapshotId = await recovery.captureState('$OPERATION_TYPE', $CONTEXT);
    console.log(JSON.stringify({ success: true, snapshotId }));
  } catch (error) {
    console.log(JSON.stringify({ success: false, error: error.message }));
  }
}

capture();
" 2>&1)

# Parse result
SUCCESS=$(echo "$SNAPSHOT_RESULT" | jq -r '.success // false')
SNAPSHOT_ID=$(echo "$SNAPSHOT_RESULT" | jq -r '.snapshotId // "unknown"')

if [ "$SUCCESS" == "true" ]; then
  # Log snapshot success
  [ -f "$HOOK_LOGGER" ] && node "$HOOK_LOGGER" info "$HOOK_NAME" "Snapshot captured successfully" \
    "{\"operationType\":\"$OPERATION_TYPE\",\"snapshotId\":\"$SNAPSHOT_ID\",\"autoRollback\":\"$AUTO_ROLLBACK\"}"

  if [ "$VERBOSE" == "1" ]; then
    if [ -f "$OUTPUT_FORMATTER" ]; then
      node "$OUTPUT_FORMATTER" info \
        "State Snapshot Captured" \
        "Captured state before risky operation for rollback capability" \
        "Operation Type:$OPERATION_TYPE,Snapshot ID:$SNAPSHOT_ID,Auto-Rollback:$AUTO_ROLLBACK" \
        "Snapshot available for recovery if operation fails,Check .recovery-snapshots/ directory for details" \
        "Error recovery enabled"
    else
      echo "✅ Snapshot captured: $SNAPSHOT_ID"
      echo "   Auto-rollback: $AUTO_ROLLBACK"
    fi
  fi

  # Export snapshot ID for post-operation hook
  export LAST_SNAPSHOT_ID="$SNAPSHOT_ID"
  export ERROR_RECOVERY_AUTO_ROLLBACK="$AUTO_ROLLBACK"

  exit 0
else
  ERROR_MSG=$(echo "$SNAPSHOT_RESULT" | jq -r '.error // "unknown error"')

  # Log snapshot failure
  [ -f "$HOOK_LOGGER" ] && node "$HOOK_LOGGER" error "$HOOK_NAME" "Failed to capture snapshot" \
    "{\"operationType\":\"$OPERATION_TYPE\",\"error\":\"$ERROR_MSG\"}"

  # For critical operations, block execution
  if [[ "$OPERATION_TYPE" == "metadata_deletion" ]] || [[ "$OPERATION_TYPE" == "bulk_data" ]]; then
    # Log critical operation blocked
    [ -f "$HOOK_LOGGER" ] && node "$HOOK_LOGGER" error "$HOOK_NAME" "Critical operation blocked - snapshot failed" \
      "{\"operationType\":\"$OPERATION_TYPE\",\"error\":\"$ERROR_MSG\"}"

    if [ -f "$OUTPUT_FORMATTER" ]; then
      node "$OUTPUT_FORMATTER" error \
        "Critical Operation Blocked" \
        "Snapshot capture failed - cannot ensure rollback capability for critical operation" \
        "Operation Type:$OPERATION_TYPE,Error:$ERROR_MSG" \
        "Review snapshot capture error,Check error recovery system logs,Verify recovery manager is configured,Set ERROR_RECOVERY_ENABLED=0 to proceed anyway (not recommended)" \
        "Error recovery protects critical operations"
      exit 1
    else
      echo "🚫 Critical operation blocked due to snapshot failure"
      echo "   Operation type: $OPERATION_TYPE"
      echo "   Reason: Cannot ensure rollback capability"
      echo ""
      echo "   To proceed anyway: ERROR_RECOVERY_ENABLED=0"
      exit 1
    fi
  fi

  # For non-critical, warn but allow
  [ -f "$HOOK_LOGGER" ] && node "$HOOK_LOGGER" warning "$HOOK_NAME" "Snapshot failed - proceeding without recovery" \
    "{\"operationType\":\"$OPERATION_TYPE\",\"error\":\"$ERROR_MSG\"}"

  # Exit 2 pattern: Automatic feedback without blocking
  if [ -f "$OUTPUT_FORMATTER" ]; then
    node "$OUTPUT_FORMATTER" warning \
      "Snapshot Capture Failed" \
      "Failed to capture snapshot but allowing non-critical operation to proceed" \
      "Operation Type:$OPERATION_TYPE,Error:$ERROR_MSG" \
      "Operation will proceed without rollback capability,Review error recovery logs,Consider fixing snapshot issues before critical operations" \
      ""
    exit 2
  else
    echo "⚠️  Proceeding without snapshot (non-critical operation)"
    exit 2
  fi
fi
