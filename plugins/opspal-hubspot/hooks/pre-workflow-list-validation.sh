#!/usr/bin/env bash
set -euo pipefail
# Pre-Workflow List Validation Hook
if ! command -v jq &>/dev/null; then
    echo "[pre-workflow-list-validation] jq not found, skipping" >&2
    exit 0
fi

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

emit_context() {
  local message="$1"
  jq -nc \
    --arg message "$message" \
    '{
      suppressOutput: true,
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        additionalContext: $message
      }
    }'
}

emit_deny() {
  local message="$1"
  jq -nc \
    --arg message "$message" \
    '{
      suppressOutput: true,
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: $message
      }
    }'
}

# Get the tool input from stdin
INPUT=$(cat)

# Check if this is a workflow-related operation
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty' 2>/dev/null)

# Only validate workflow creation/update operations
if [[ "$TOOL_NAME" != *"workflow"* ]]; then
  exit 0
fi

# Check for workflow definition in the input
WORKFLOW_JSON=$(echo "$INPUT" | jq -c '.tool_input.workflow // .tool_input.params.workflow // empty' 2>/dev/null)

if [ -z "$WORKFLOW_JSON" ] || [ "$WORKFLOW_JSON" = "null" ]; then
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
  STALE_WARNING=""
  if [ "$LIVE_FIRST" = "true" ] && [ -f "$LISTS_CACHE" ]; then
    CACHE_AGE_MINUTES=0
    if command -v stat &>/dev/null; then
      CACHE_TIME=$(stat -c %Y "$LISTS_CACHE" 2>/dev/null || stat -f %m "$LISTS_CACHE" 2>/dev/null || echo 0)
      NOW=$(date +%s)
      CACHE_AGE_MINUTES=$(( (NOW - CACHE_TIME) / 60 ))
    fi

    if [ "$CACHE_AGE_MINUTES" -gt "$LISTS_STALE_WARNING_MINUTES" ]; then
      STALE_WARNING="Lists cache is ${CACHE_AGE_MINUTES} minutes old. Run 'node $LIB_DIR/hubspot-list-fetcher.js refresh' to update."
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
        emit_deny "Workflow validation failed: $ISSUES"
        exit 0
      fi
    fi

    # Check for warnings
    WARNINGS=$(echo "$VALIDATION" | jq -r '.warnings[]?.message // empty' | head -2 | tr '\n' '; ')
    if [ -n "$WARNINGS" ]; then
      emit_context "Warnings: $WARNINGS (source: $LISTS_SOURCE)"
      exit 0
    fi
  else
    rm -f "$TEMP_WORKFLOW"
    if [ "$LIVE_FIRST" = "true" ]; then
      emit_context "No lists cache - run hubspot-list-fetcher.js to enable validation"
    else
      emit_context "No lists cache available - skipping list validation"
    fi
    exit 0
  fi
fi

if [ -n "${STALE_WARNING:-}" ]; then
  emit_context "$STALE_WARNING"
fi
exit 0
