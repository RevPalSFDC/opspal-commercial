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
  ORG_ALIAS=$(echo "$INPUT" | grep -oP '(?<=--target-org\s)[^\s"]+' | head -1)
fi

# If no org alias found, allow the operation (might use default)
if [ -z "$ORG_ALIAS" ]; then
  echo '{"status": "approve", "message": "No explicit org alias - using default"}'
  exit 0
fi

# Validate the org alias
if [ -f "$LIB_DIR/org-alias-validator.js" ]; then
  VALIDATION=$(node "$LIB_DIR/org-alias-validator.js" validate "$ORG_ALIAS" 2>/dev/null)

  if [ $? -ne 0 ]; then
    # Extract suggestions from validation result
    SUGGESTIONS=$(echo "$VALIDATION" | jq -r '.suggestions[]?' 2>/dev/null | head -3 | tr '\n' ' ')

    echo "{\"status\": \"reject\", \"message\": \"Org alias '$ORG_ALIAS' validation failed. $SUGGESTIONS\"}"
    exit 1
  fi

  # Check for production org warnings
  ORG_TYPE=$(echo "$VALIDATION" | jq -r '.orgDetails.isScratch // false' 2>/dev/null)
  if echo "$ORG_ALIAS" | grep -qiE '^(prod|production|prd|live|main)$'; then
    echo "{\"status\": \"approve\", \"message\": \"⚠️ Production org detected: $ORG_ALIAS - proceed with caution\"}"
    exit 0
  fi
fi

echo '{"status": "approve", "message": "Org alias validated"}'
exit 0
