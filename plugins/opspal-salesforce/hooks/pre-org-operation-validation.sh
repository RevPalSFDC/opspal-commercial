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

# Extract org alias from common patterns
ORG_ALIAS=""

# Check for --target-org flag
if echo "$INPUT" | grep -q '"--target-org"'; then
  ORG_ALIAS=$(echo "$INPUT" | grep -oP '(?<="--target-org",\s*")[^"]+' | head -1)
fi

# Check for -o flag
if [ -z "$ORG_ALIAS" ] && echo "$INPUT" | grep -q '"-o"'; then
  ORG_ALIAS=$(echo "$INPUT" | grep -oP '(?<="-o",\s*")[^"]+' | head -1)
fi

# Check for org alias in command string
if [ -z "$ORG_ALIAS" ]; then
  ORG_ALIAS=$(echo "$INPUT" | grep -oP '(?<=--target-org\s)[^\s"]+' | head -1 || true)
fi

# If no org alias found, allow the operation (might use default)
if [ -z "$ORG_ALIAS" ]; then
  echo '{"status": "approve", "message": "No explicit org alias - using default"}'
  exit 0
fi

# Validate the org alias
if [ -f "$LIB_DIR/org-alias-validator.js" ]; then
  if ! VALIDATION=$(node "$LIB_DIR/org-alias-validator.js" validate "$ORG_ALIAS" 2>/dev/null); then
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
