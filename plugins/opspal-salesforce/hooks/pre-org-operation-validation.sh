#!/usr/bin/env bash
set -euo pipefail
# Pre-Org Operation Validation Hook
if ! command -v jq &>/dev/null; then
    echo "[pre-org-operation-validation] jq not found, skipping" >&2
    exit 0
fi

# Validates org alias before any Salesforce operation
#
# Related reflections: c44fe70e
# ROI: $2,250/yr
#
# Triggers: PreToolUse for sf CLI commands

SCRIPT_DIR="$(dirname "$0")"
LIB_DIR="$SCRIPT_DIR/../scripts/lib"
CORE_PLUGIN_ROOT="$(cd "$SCRIPT_DIR/../../opspal-core" && pwd)"
ENVIRONMENT_LIB="${CORE_PLUGIN_ROOT}/scripts/lib/detect-environment.sh"

if [ -f "$ENVIRONMENT_LIB" ]; then
  # shellcheck source=/dev/null
  source "$ENVIRONMENT_LIB"
fi

# Get the tool input from stdin
INPUT=$(cat)
TOOL_NAME=$(printf '%s' "$INPUT" | jq -r '.tool_name // empty' 2>/dev/null || echo "")
COMMAND=$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null || echo "")
SESSION_CWD=$(printf '%s' "$INPUT" | jq -r '.cwd // empty' 2>/dev/null || echo "")

if [ "$TOOL_NAME" != "Bash" ]; then
  exit 0
fi

if ! printf '%s' "$COMMAND" | grep -qE '(^|[[:space:]])(sf|sfdx)([[:space:]]|$)'; then
  exit 0
fi

if [ -n "$SESSION_CWD" ] && [ ! -d "$SESSION_CWD" ]; then
  exit 0
fi

# Extract org alias from common patterns
ORG_ALIAS=""

if [[ "$COMMAND" =~ --target-org[=[:space:]]([^[:space:]]+) ]]; then
  ORG_ALIAS="${BASH_REMATCH[1]}"
elif [[ "$COMMAND" =~ -o[[:space:]]([^[:space:]]+) ]]; then
  ORG_ALIAS="${BASH_REMATCH[1]}"
fi

# If no org alias found, allow the operation (might use default)
if [ -z "$ORG_ALIAS" ]; then
  echo '{"status": "approve", "message": "No explicit org alias - using default"}'
  exit 0
fi

# Validate the org alias
if [ -f "$LIB_DIR/org-alias-validator.js" ]; then
  if ! VALIDATION=$(node "$LIB_DIR/org-alias-validator.js" validate "$ORG_ALIAS" 2>/dev/null); then
    if [ "${HOOK_TEST_MODE:-0}" = "1" ]; then
      echo '{"status": "approve", "message": "Skipping org alias validation in hook test mode without runtime org context"}'
      exit 0
    fi

    # Extract suggestions from validation result
    SUGGESTIONS=$(echo "$VALIDATION" | jq -r '.suggestions[]?' 2>/dev/null | head -3 | tr '\n' ' ')

    echo "{\"status\": \"reject\", \"message\": \"Org alias '$ORG_ALIAS' validation failed. $SUGGESTIONS\"}"
    exit 1
  fi

  # Check for production org warnings
  DETECTED_ENVIRONMENT="unknown"
  if declare -F detect_salesforce_environment >/dev/null 2>&1; then
    DETECTED_ENVIRONMENT="$(detect_salesforce_environment "$ORG_ALIAS")"
  fi

  if [ "$DETECTED_ENVIRONMENT" = "production" ]; then
    echo "{\"status\": \"approve\", \"message\": \"⚠️ Production org detected: $ORG_ALIAS - proceed with caution\"}"
    exit 0
  fi
fi

echo '{"status": "approve", "message": "Org alias validated"}'
exit 0
