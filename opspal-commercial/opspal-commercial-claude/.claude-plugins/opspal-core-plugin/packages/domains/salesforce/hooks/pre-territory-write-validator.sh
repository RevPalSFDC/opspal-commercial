#!/bin/bash

# Pre-Territory Write Validator Hook
#
# Validates territory operations before execution.
# Trigger: Before any Territory2, UserTerritory2Association, or ObjectTerritory2Association write
#
# Exit codes:
#   0 - Validation passed
#   1 - Validation failed
#   2 - Warning (proceeds but alerts user)

set -e

# Get the command being executed
COMMAND="$1"
shift

# Source error handler if available
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "$SCRIPT_DIR/lib/error-handler.sh" ]; then
  source "$SCRIPT_DIR/lib/error-handler.sh"
fi

# Check if this is a territory-related operation
is_territory_operation() {
  local cmd="$1"

  # Check for Territory2 object operations
  if echo "$cmd" | grep -qiE "(Territory2|UserTerritory2Association|ObjectTerritory2Association|Territory2ObjectExclusion)"; then
    return 0
  fi

  # Check for territory scripts
  if echo "$cmd" | grep -qi "territory"; then
    return 0
  fi

  return 1
}

# Validate DeveloperName format
validate_developer_name() {
  local name="$1"

  if ! echo "$name" | grep -qE "^[a-zA-Z][a-zA-Z0-9_]*$"; then
    echo "❌ Invalid DeveloperName format: $name"
    echo "   Must start with letter, contain only alphanumeric and underscore"
    return 1
  fi

  if [ ${#name} -gt 80 ]; then
    echo "❌ DeveloperName too long: ${#name} characters (max 80)"
    return 1
  fi

  return 0
}

# Validate access level value
validate_access_level() {
  local field="$1"
  local value="$2"

  case "$field" in
    AccountAccessLevel)
      if ! echo "$value" | grep -qE "^(Read|Edit|All)$"; then
        echo "❌ Invalid $field: $value (must be Read, Edit, or All)"
        return 1
      fi
      ;;
    OpportunityAccessLevel|CaseAccessLevel|ContactAccessLevel)
      if ! echo "$value" | grep -qE "^(None|Read|Edit)$"; then
        echo "❌ Invalid $field: $value (must be None, Read, or Edit)"
        return 1
      fi
      ;;
  esac

  return 0
}

# Extract values from sf data command
extract_values() {
  local cmd="$1"

  # Extract --values parameter
  if echo "$cmd" | grep -q '\-\-values'; then
    echo "$cmd" | sed 's/.*--values[= ]*"\([^"]*\)".*/\1/'
  fi
}

# Main validation logic
main() {
  local full_command="$COMMAND $*"

  # Only process territory operations
  if ! is_territory_operation "$full_command"; then
    exit 0
  fi

  echo "🔍 Pre-validating territory operation..."

  # Check for create/update operations
  if echo "$full_command" | grep -qE "(create record|update record|upsert)"; then
    local values
    values=$(extract_values "$full_command")

    if [ -n "$values" ]; then
      # Validate DeveloperName if present
      if echo "$values" | grep -q "DeveloperName"; then
        local dev_name
        dev_name=$(echo "$values" | sed "s/.*DeveloperName='\\([^']*\\)'.*/\\1/")
        if ! validate_developer_name "$dev_name"; then
          exit 1
        fi
      fi

      # Validate access levels if present
      for field in AccountAccessLevel OpportunityAccessLevel CaseAccessLevel ContactAccessLevel; do
        if echo "$values" | grep -q "$field"; then
          local value
          value=$(echo "$values" | sed "s/.*${field}='\\([^']*\\)'.*/\\1/")
          if ! validate_access_level "$field" "$value"; then
            exit 1
          fi
        fi
      done
    fi
  fi

  # Check for delete operations
  if echo "$full_command" | grep -q "delete record"; then
    # Extract sobject type
    local sobject
    sobject=$(echo "$full_command" | sed 's/.*--sobject[= ]*\([^ ]*\).*/\1/')

    if [ "$sobject" = "Territory2" ]; then
      echo "⚠️  Territory deletion detected"
      echo "   Ensure child territories and assignments are removed first"
      echo "   Consider using: node scripts/territory/territory-safe-delete.js"
      # Don't block, just warn
      exit 2
    fi
  fi

  # Check for bulk operations
  if echo "$full_command" | grep -qE "(import bulk|upsert bulk)"; then
    local sobject
    sobject=$(echo "$full_command" | sed 's/.*--sobject[= ]*\([^ ]*\).*/\1/')

    if echo "$sobject" | grep -qE "(Territory2|UserTerritory2Association|ObjectTerritory2Association)"; then
      echo "⚠️  Bulk territory operation detected"
      echo "   Recommend pre-validation with: node scripts/territory/territory-bulk-assignment.js ... --dry-run"
      # Don't block bulk operations, just warn
      exit 2
    fi
  fi

  echo "✅ Pre-validation passed"
  exit 0
}

main "$@"
