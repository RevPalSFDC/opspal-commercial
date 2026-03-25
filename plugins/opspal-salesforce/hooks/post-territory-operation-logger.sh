#!/usr/bin/env bash
set -euo pipefail

# Post-Territory Operation Logger Hook
#
# Logs territory operations for audit trail and runbook observations.
# Trigger: After any Territory2 operation completes
#
# Exit codes:
#   0 - Logging succeeded
#   1 - Logging failed (non-blocking)

# Get the command that was executed and its result
COMMAND="${1:-}"
EXIT_CODE="${2:-}"
if [ "$#" -ge 2 ]; then
  shift 2
else
  set --
fi

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="${SCRIPT_DIR}/.."

# Log directory
LOG_DIR="${PLUGIN_ROOT}/logs/territory"
mkdir -p "$LOG_DIR"

# Log file
LOG_FILE="${LOG_DIR}/territory-operations.log"
OBSERVATION_FILE="${LOG_DIR}/territory-observations.jsonl"

# Get timestamp
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
DATE_PART=$(date -u +"%Y-%m-%d")

# Check if this is a territory-related operation
is_territory_operation() {
  local cmd="$1"

  if echo "$cmd" | grep -qiE "(Territory2|UserTerritory2Association|ObjectTerritory2Association|Territory2ObjectExclusion)"; then
    return 0
  fi

  if echo "$cmd" | grep -qi "territory"; then
    return 0
  fi

  return 1
}

# Determine operation type
get_operation_type() {
  local cmd="$1"

  if echo "$cmd" | grep -q "create record"; then
    echo "CREATE"
  elif echo "$cmd" | grep -q "update record"; then
    echo "UPDATE"
  elif echo "$cmd" | grep -q "delete record"; then
    echo "DELETE"
  elif echo "$cmd" | grep -q "import bulk"; then
    echo "BULK_IMPORT"
  elif echo "$cmd" | grep -q "upsert bulk"; then
    echo "BULK_UPSERT"
  elif echo "$cmd" | grep -qi "activate"; then
    echo "ACTIVATE"
  elif echo "$cmd" | grep -qi "archive"; then
    echo "ARCHIVE"
  elif echo "$cmd" | grep -qi "hierarchy-analyzer"; then
    echo "ANALYZE"
  elif echo "$cmd" | grep -qi "bulk-assignment"; then
    echo "BULK_ASSIGN"
  elif echo "$cmd" | grep -qi "safe-delete"; then
    echo "SAFE_DELETE"
  else
    echo "OTHER"
  fi
}

# Get object type
get_object_type() {
  local cmd="$1"

  if echo "$cmd" | grep -qi "UserTerritory2Association"; then
    echo "UserTerritory2Association"
  elif echo "$cmd" | grep -qi "ObjectTerritory2Association"; then
    echo "ObjectTerritory2Association"
  elif echo "$cmd" | grep -qi "Territory2ObjectExclusion"; then
    echo "Territory2ObjectExclusion"
  elif echo "$cmd" | grep -qi "Territory2Model"; then
    echo "Territory2Model"
  elif echo "$cmd" | grep -qi "Territory2"; then
    echo "Territory2"
  else
    echo "Unknown"
  fi
}

# Log to file
log_operation() {
  local operation="$1"
  local object="$2"
  local status="$3"
  local cmd="$4"

  echo "[$TIMESTAMP] [$operation] [$object] [$status] $cmd" >> "$LOG_FILE"
}

# Create observation for Living Runbook System
create_observation() {
  local operation="$1"
  local object="$2"
  local status="$3"
  local cmd="$4"

  # Create JSON observation
  local observation
  observation=$(cat <<EOF
{"timestamp":"$TIMESTAMP","type":"territory_operation","operation":"$operation","object":"$object","status":"$status","command":"$(echo "$cmd" | sed 's/"/\\"/g' | tr -d '\n')"}
EOF
)

  echo "$observation" >> "$OBSERVATION_FILE"
}

# Main logging logic
main() {
  local full_command="$COMMAND $*"

  # Only process territory operations
  if ! is_territory_operation "$full_command"; then
    exit 0
  fi

  local operation
  operation=$(get_operation_type "$full_command")

  local object
  object=$(get_object_type "$full_command")

  local status
  if [ "$EXIT_CODE" = "0" ]; then
    status="SUCCESS"
  else
    status="FAILED"
  fi

  # Log operation
  log_operation "$operation" "$object" "$status" "$full_command"

  # Create observation for Living Runbook System
  create_observation "$operation" "$object" "$status" "$full_command"

  # Print summary if verbose
  if [ "${TERRITORY_LOG_VERBOSE:-0}" = "1" ]; then
    echo "📝 Territory operation logged:" >&2
    echo "   Operation: $operation" >&2
    echo "   Object:    $object" >&2
    echo "   Status:    $status" >&2
  fi

  # Rotate log if too large (> 10MB)
  if [ -f "$LOG_FILE" ]; then
    local size
    size=$(stat -f%z "$LOG_FILE" 2>/dev/null || stat -c%s "$LOG_FILE" 2>/dev/null || echo "0")
    if [ "$size" -gt 10485760 ]; then
      mv "$LOG_FILE" "${LOG_FILE}.${DATE_PART}.bak"
      echo "[$TIMESTAMP] Log rotated" > "$LOG_FILE"
    fi
  fi

  # Trigger monitoring agent for bulk operations
  if echo "$operation" | grep -qE "^(BULK_|ACTIVATE)"; then
    if [ -f "${PLUGIN_ROOT}/scripts/territory/territory-model-lifecycle.js" ]; then
      # Check for active model and log status
      if echo "$full_command" | grep -q "model-id\|Territory2Model"; then
        echo "ℹ️  Bulk/activation operation detected - consider running:" >&2
        echo "   node scripts/territory/territory-model-lifecycle.js [org] status [model-id]" >&2
      fi
    fi
  fi

  exit 0
}

main "$@"
