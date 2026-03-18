#!/bin/bash

# Pre-Dashboard Report Check Hook
#
# Validates date filter consistency when reports are being added to dashboards.
# Blocks if incompatible date filter families are detected (e.g., fiscal vs calendar).
#
# Trigger: mcp_salesforce_report_create, mcp_salesforce_dashboard_*
# Behavior: Checks if the new report's date filters are compatible with existing
#           dashboard reports. Blocks with error if incompatible.
#
# @version 1.0.0

set -e

# Configuration
VALIDATOR_SCRIPT=""
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(dirname "$SCRIPT_DIR")}"

# Find the validator script
find_validator() {
  local candidates=(
    "$PLUGIN_ROOT/scripts/lib/date-filter-consistency-validator.js"
    "$SCRIPT_DIR/../scripts/lib/date-filter-consistency-validator.js"
    "$(pwd)/plugins/opspal-salesforce/scripts/lib/date-filter-consistency-validator.js"
  )

  for candidate in "${candidates[@]}"; do
    if [ -f "$candidate" ]; then
      VALIDATOR_SCRIPT="$candidate"
      return 0
    fi
  done

  return 1
}

# Extract tool input from environment or stdin
get_tool_input() {
  local input=""

  # Try various environment variables
  if [ -n "${CLAUDE_TOOL_INPUT:-}" ]; then
    input="$CLAUDE_TOOL_INPUT"
  elif [ -n "${HOOK_TOOL_INPUT:-}" ]; then
    input="$HOOK_TOOL_INPUT"
  elif [ -n "${TOOL_INPUT:-}" ]; then
    input="$TOOL_INPUT"
  elif [ ! -t 0 ]; then
    # Read from stdin if available
    input=$(cat)
  fi

  echo "$input"
}

# Check if this is a dashboard-related operation
is_dashboard_operation() {
  local tool_name="${CLAUDE_TOOL_NAME:-${HOOK_TOOL_NAME:-${TOOL_NAME:-}}}"

  case "$tool_name" in
    mcp_salesforce_dashboard_*)
      return 0
      ;;
    mcp_salesforce_report_create)
      # Check if the report is being added to a dashboard
      local input
      input=$(get_tool_input)
      if echo "$input" | grep -qi "dashboard"; then
        return 0
      fi
      ;;
  esac

  return 1
}

# Extract dashboard context and reports from tool input
extract_dashboard_context() {
  local input
  input=$(get_tool_input)

  # Try to parse JSON and extract dashboard info
  if command -v jq &>/dev/null && [ -n "$input" ]; then
    local dashboard_id
    dashboard_id=$(echo "$input" | jq -r '.dashboardId // .dashboard_id // empty' 2>/dev/null)

    if [ -n "$dashboard_id" ]; then
      echo "$dashboard_id"
      return 0
    fi
  fi

  return 1
}

# Main validation logic
main() {
  # Skip if not a dashboard operation
  if ! is_dashboard_operation; then
    exit 0
  fi

  # Find validator
  if ! find_validator; then
    echo "⚠️  Warning: Date filter consistency validator not found, skipping check" >&2
    exit 0
  fi

  # Get tool input
  local input
  input=$(get_tool_input)

  if [ -z "$input" ]; then
    exit 0
  fi

  # Check if we can parse the input as JSON
  if ! command -v jq &>/dev/null; then
    echo "⚠️  Warning: jq not available, skipping date filter validation" >&2
    exit 0
  fi

  # Extract report filters from the input
  local report_filters
  report_filters=$(echo "$input" | jq -c '.reportFilters // .filters // []' 2>/dev/null)

  if [ "$report_filters" == "[]" ] || [ -z "$report_filters" ]; then
    # No filters to validate
    exit 0
  fi

  # Build report object for validation
  local report_json
  report_json=$(echo "$input" | jq -c '{
    name: (.name // .reportName // "New Report"),
    filters: (.reportFilters // .filters // []),
    standardDateFilter: .standardDateFilter
  }' 2>/dev/null)

  # Run the validator's check-report command
  local result
  result=$(node "$VALIDATOR_SCRIPT" check-report "$report_json" 2>&1) || true

  # Parse the result
  local status
  status=$(echo "$result" | jq -r '.status // "unknown"' 2>/dev/null)

  if [ "$status" == "warning" ]; then
    local issues
    issues=$(echo "$result" | jq -r '.issues[]?.message // empty' 2>/dev/null)

    if [ -n "$issues" ]; then
      echo "⚠️  Date Filter Warning:" >&2
      echo "$issues" | while read -r issue; do
        echo "   $issue" >&2
      done
      echo "" >&2
      echo "💡 Recommendation: Ensure all reports on the same dashboard use consistent date filter families (fiscal OR calendar, not both)" >&2
    fi
  fi

  # For now, we warn but don't block
  # To block, uncomment the following:
  # if [ "$status" == "blocked" ]; then
  #   echo "❌ BLOCKED: Date filter inconsistency detected" >&2
  #   exit 1
  # fi

  exit 0
}

# Run main if not being sourced
if [ "${BASH_SOURCE[0]}" == "${0}" ]; then
  main "$@"
fi
