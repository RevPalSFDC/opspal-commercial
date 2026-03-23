#!/usr/bin/env bash
set -euo pipefail

if ! command -v jq &>/dev/null; then
    echo "[pre-operation-env-validator] jq not found, skipping" >&2
    exit 0
fi

###############################################################################
# Pre-Operation Environment Validator Hook
#
# Purpose: Validates environment-specific assumptions before operations to
#          prevent hardcoded property names, deployment order errors, etc.
#
# Addresses: Reflection cohorts 2, 6 (schema/parse, config/env)
#
# Triggers: Before operations that might have environment assumptions:
#   - HubSpot property queries
#   - Salesforce deployments
#   - Cross-platform sync operations
#
# Usage: Automatically invoked by Claude Code before relevant operations
#
# Configuration: Set ENV_VALIDATION_ENABLED=0 to disable
###############################################################################

# Check if validation is enabled
if [ "${ENV_VALIDATION_ENABLED:-1}" = "0" ]; then
  exit 0
fi

# Get the command being executed
COMMAND="${1:-}"
PLATFORM="${2:-}"
INSTANCE="${3:-}"

# Path to validator script
VALIDATOR_SCRIPT=".claude-plugins/opspal-core/scripts/lib/env-config-validator.js"

# OutputFormatter and HookLogger
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_FORMATTER="$SCRIPT_DIR/../scripts/lib/output-formatter.js"
HOOK_LOGGER="$SCRIPT_DIR/../scripts/lib/hook-logger.js"
HOOK_NAME="pre-operation-env-validator"

# Check if validator exists
if [ ! -f "$VALIDATOR_SCRIPT" ]; then
  # Validation script not found, skip silently
  exit 0
fi

###############################################################################
# Detection Logic - Determine if validation is needed
###############################################################################

NEEDS_VALIDATION=0
VALIDATION_TYPE=""
VALIDATION_PARAM=""

# Detect HubSpot property operations
if echo "$COMMAND" | grep -q "hs_salesforce_id\|hs_object_id\|salesforce_id"; then
  NEEDS_VALIDATION=1
  VALIDATION_TYPE="property"
  VALIDATION_PARAM=$(echo "$COMMAND" | grep -oE "hs_[a-z_]+|salesforce_[a-z_]+" | head -1)
  PLATFORM="hubspot"
fi

# Detect Salesforce deployment operations
if echo "$COMMAND" | grep -q "sf project deploy\|sfdx force:source:deploy"; then
  NEEDS_VALIDATION=1
  VALIDATION_TYPE="deployment"

  # Detect metadata type from command
  if echo "$COMMAND" | grep -q "reports"; then
    VALIDATION_PARAM="reports"
  elif echo "$COMMAND" | grep -q "flows"; then
    VALIDATION_PARAM="flows"
  elif echo "$COMMAND" | grep -q "reportFolders"; then
    VALIDATION_PARAM="reportFolders"
  fi

  PLATFORM="salesforce"
fi

# Detect Salesforce label usage
if echo "$COMMAND" | grep -q "Quote\|Order Form\|Quote Line"; then
  NEEDS_VALIDATION=1
  VALIDATION_TYPE="label"
  PLATFORM="salesforce"
fi

# Exit if no validation needed
if [ "$NEEDS_VALIDATION" = "0" ]; then
  exit 0
fi

###############################################################################
# Determine Instance
###############################################################################

# Try to detect instance from environment or command
if [ -z "$INSTANCE" ]; then
  # Try SF org alias
  if [ -n "$SF_TARGET_ORG" ]; then
    INSTANCE="$SF_TARGET_ORG"
  elif [ -n "$SFDX_DEFAULTUSERNAME" ]; then
    INSTANCE="$SFDX_DEFAULTUSERNAME"
  # Try HubSpot portal from environment
  elif [ -n "$HUBSPOT_PORTAL_ID" ]; then
    INSTANCE="portal-$HUBSPOT_PORTAL_ID"
  fi
fi

# If still no instance, warn but don't block
if [ -z "$INSTANCE" ]; then
  echo "⚠️  [Env Validator] Could not determine instance - skipping validation" >&2
  exit 0
fi

###############################################################################
# Run Validation
###############################################################################

echo "🔍 [Env Validator] Validating $VALIDATION_TYPE for $PLATFORM/$INSTANCE..." >&2

VALIDATION_RESULT=""

case "$VALIDATION_TYPE" in
  property)
    VALIDATION_RESULT=$(node "$VALIDATOR_SCRIPT" validate-property "$PLATFORM" "$INSTANCE" "$VALIDATION_PARAM" 2>/dev/null)
    ;;

  deployment)
    if [ -n "$VALIDATION_PARAM" ]; then
      VALIDATION_RESULT=$(node "$VALIDATOR_SCRIPT" validate-deployment-order "$PLATFORM" "$INSTANCE" "$VALIDATION_PARAM" 2>/dev/null)
    fi
    ;;

  label)
    # Label validation needs both API name and expected label
    # For now, just warn that labels might be customized
    echo "ℹ️  [Env Validator] Object labels may be customized in this org" >&2
    echo "ℹ️  [Env Validator] Check ENV_CONFIG.json for labelCustomizations" >&2
    exit 0
    ;;
esac

# Parse validation result
if [ -n "$VALIDATION_RESULT" ]; then
  VALID=$(echo "$VALIDATION_RESULT" | jq -r '.valid // "unknown"' 2>/dev/null)
  MESSAGE=$(echo "$VALIDATION_RESULT" | jq -r '.message // "Validation failed"' 2>/dev/null)
  RECOMMENDATION=$(echo "$VALIDATION_RESULT" | jq -r '.recommendation // ""' 2>/dev/null)

  if [ "$VALID" = "false" ]; then
    # Log validation failure
    [ -f "$HOOK_LOGGER" ] && node "$HOOK_LOGGER" error "$HOOK_NAME" "Environment validation failed" \
      "{\"platform\":\"$PLATFORM\",\"instance\":\"$INSTANCE\",\"validationType\":\"$VALIDATION_TYPE\",\"param\":\"$VALIDATION_PARAM\",\"message\":\"$MESSAGE\"}"

    if [ -f "$OUTPUT_FORMATTER" ]; then
      # Build suggestions list
      SUGGESTIONS="Set ENV_VALIDATION_ENABLED=0 to bypass (not recommended)"
      if [ -n "$RECOMMENDATION" ] && [ "$RECOMMENDATION" != "null" ]; then
        SUGGESTIONS="$RECOMMENDATION,$SUGGESTIONS"
      fi

      node "$OUTPUT_FORMATTER" error \
        "Environment Validation Failed" \
        "$MESSAGE" \
        "Platform:$PLATFORM,Instance:$INSTANCE,Validation Type:$VALIDATION_TYPE,Parameter:$VALIDATION_PARAM" \
        "$SUGGESTIONS" \
        "Prevents wrong-environment operations"
      exit 1
    else
      echo "" >&2
      echo "❌ [Env Validator] Environment validation failed!" >&2
      echo "" >&2
      echo "$MESSAGE" >&2

      if [ -n "$RECOMMENDATION" ] && [ "$RECOMMENDATION" != "null" ]; then
        echo "" >&2
        echo "💡 Recommendation: $RECOMMENDATION" >&2
      fi

      echo "" >&2
      echo "To bypass this check: ENV_VALIDATION_ENABLED=0" >&2
      echo "" >&2
      exit 1
    fi

  elif [ "$VALID" = "unknown" ]; then
    # Log unknown validation
    [ -f "$HOOK_LOGGER" ] && node "$HOOK_LOGGER" warning "$HOOK_NAME" "Environment validation unknown - config may need updating" \
      "{\"platform\":\"$PLATFORM\",\"instance\":\"$INSTANCE\",\"validationType\":\"$VALIDATION_TYPE\",\"param\":\"$VALIDATION_PARAM\",\"message\":\"$MESSAGE\"}"

    # Exit 2 pattern: Automatic feedback for unknown validation
    if [ -f "$OUTPUT_FORMATTER" ]; then
      SUGGESTIONS="Update ENV_CONFIG.json for this instance"
      if [ -n "$RECOMMENDATION" ] && [ "$RECOMMENDATION" != "null" ]; then
        SUGGESTIONS="$RECOMMENDATION,$SUGGESTIONS"
      fi

      node "$OUTPUT_FORMATTER" warning \
        "Environment Validation Unknown" \
        "Could not validate - ENV_CONFIG.json may need updating for this instance" \
        "Platform:$PLATFORM,Instance:$INSTANCE,Validation Type:$VALIDATION_TYPE,Message:$MESSAGE" \
        "$SUGGESTIONS" \
        ""
      exit 2
    else
      echo "⚠️  [Env Validator] Could not validate - ENV_CONFIG.json may need updating" >&2
      echo "$MESSAGE" >&2

      if [ -n "$RECOMMENDATION" ] && [ "$RECOMMENDATION" != "null" ]; then
        echo "💡 $RECOMMENDATION" >&2
      fi
      exit 2
    fi

  else
    # Log validation success
    [ -f "$HOOK_LOGGER" ] && node "$HOOK_LOGGER" info "$HOOK_NAME" "Environment validation passed" \
      "{\"platform\":\"$PLATFORM\",\"instance\":\"$INSTANCE\",\"validationType\":\"$VALIDATION_TYPE\",\"param\":\"$VALIDATION_PARAM\",\"message\":\"$MESSAGE\"}"

    # Valid - show success message
    echo "✅ [Env Validator] Validation passed" >&2
    echo "$MESSAGE" >&2
    exit 0
  fi
fi

# Should not reach here
exit 0

###############################################################################
# Exit Codes:
#   0 = Validation passed or not needed
#   1 = Validation failed (blocks operation)
###############################################################################
