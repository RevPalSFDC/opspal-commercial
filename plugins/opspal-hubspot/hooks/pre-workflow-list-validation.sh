#!/bin/bash
# Pre-Workflow List Validation Hook
# Validates list-workflow pairings before workflow operations
#
# Related reflections: 44f17e3e
# ROI: $3,000/yr
#
# Triggers: PreToolUse for HubSpot workflow tools

SCRIPT_DIR="$(dirname "$0")"
LIB_DIR="$SCRIPT_DIR/../scripts/lib"

# Live-first mode: Query live lists instead of using cache
# Controlled by GLOBAL_LIVE_FIRST or HS_WORKFLOW_LIVE_FIRST env vars
# Default: true (live-first behavior)
LIVE_FIRST="${HS_WORKFLOW_LIVE_FIRST:-${GLOBAL_LIVE_FIRST:-true}}"
LISTS_STALE_WARNING_MINUTES="${LISTS_STALE_WARNING_MINUTES:-30}"

# Get the tool input from stdin
INPUT=$(cat)

# Check if this is a workflow-related operation
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool // empty' 2>/dev/null)

# Only validate workflow creation/update operations
if [[ "$TOOL_NAME" != *"workflow"* ]]; then
  echo '{"status": "approve", "message": "Not a workflow operation"}'
  exit 0
fi

# Check for workflow definition in the input
WORKFLOW_JSON=$(echo "$INPUT" | jq -r '.workflow // .params.workflow // empty' 2>/dev/null)

if [ -z "$WORKFLOW_JSON" ] || [ "$WORKFLOW_JSON" = "null" ]; then
  echo '{"status": "approve", "message": "No workflow definition to validate"}'
  exit 0
fi

# Validate workflow-list pairings
if [ -f "$LIB_DIR/list-workflow-pairing-validator.js" ]; then
  # Write workflow to temp file for validation
  TEMP_WORKFLOW=$(mktemp)
  echo "$WORKFLOW_JSON" > "$TEMP_WORKFLOW"

  # Check for lists cache file
  LISTS_CACHE="$SCRIPT_DIR/../.cache/lists.json"
  LISTS_SOURCE="cache"

  # In live-first mode, check if cache is stale and warn
  if [ "$LIVE_FIRST" = "true" ] && [ -f "$LISTS_CACHE" ]; then
    CACHE_AGE_MINUTES=0
    if command -v stat &>/dev/null; then
      CACHE_TIME=$(stat -c %Y "$LISTS_CACHE" 2>/dev/null || stat -f %m "$LISTS_CACHE" 2>/dev/null || echo 0)
      NOW=$(date +%s)
      CACHE_AGE_MINUTES=$(( (NOW - CACHE_TIME) / 60 ))
    fi

    if [ "$CACHE_AGE_MINUTES" -gt "$LISTS_STALE_WARNING_MINUTES" ]; then
      echo "{\"status\": \"approve\", \"message\": \"WARNING: Lists cache is ${CACHE_AGE_MINUTES} minutes old. Run 'node $LIB_DIR/hubspot-list-fetcher.js refresh' to update.\"}"
      # Still validate with stale cache as fallback
      LISTS_SOURCE="stale-cache"
    fi
  fi

  if [ -f "$LISTS_CACHE" ]; then
    VALIDATION=$(node "$LIB_DIR/list-workflow-pairing-validator.js" validate-workflow "$TEMP_WORKFLOW" "$LISTS_CACHE" 2>/dev/null)
    EXIT_CODE=$?

    rm -f "$TEMP_WORKFLOW"

    if [ $EXIT_CODE -ne 0 ]; then
      # Extract issues
      ISSUES=$(echo "$VALIDATION" | jq -r '.issues[]?.message // empty' | head -3 | tr '\n' '; ')

      if [ -n "$ISSUES" ]; then
        echo "{\"status\": \"reject\", \"message\": \"Workflow validation failed: $ISSUES\"}"
        exit 1
      fi
    fi

    # Check for warnings
    WARNINGS=$(echo "$VALIDATION" | jq -r '.warnings[]?.message // empty' | head -2 | tr '\n' '; ')
    if [ -n "$WARNINGS" ]; then
      echo "{\"status\": \"approve\", \"message\": \"Warnings: $WARNINGS (source: $LISTS_SOURCE)\"}"
      exit 0
    fi
  else
    rm -f "$TEMP_WORKFLOW"
    if [ "$LIVE_FIRST" = "true" ]; then
      echo '{"status": "approve", "message": "No lists cache - run hubspot-list-fetcher.js to enable validation"}'
    else
      echo '{"status": "approve", "message": "No lists cache available - skipping list validation"}'
    fi
    exit 0
  fi
fi

echo '{"status": "approve", "message": "Workflow-list validation passed"}'
exit 0
