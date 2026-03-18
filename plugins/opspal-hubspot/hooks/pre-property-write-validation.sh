#!/usr/bin/env bash
# pre-property-write-validation.sh
#
# M3: Property Deployment Order Enforcement
#
# Before record create/update operations, verify that referenced
# custom properties actually exist in the target portal. Properties
# must be deployed before code writes to them.
#
# Hook Type: PreToolUse
# Matches: hubspot_create, hubspot_update, hubspot_batch_upsert
#
# This is a lightweight check that warns but does not block.
# Full property validation requires portal access.

set -euo pipefail

# Only run for HubSpot write operations
TOOL_NAME="${TOOL_NAME:-}"
case "$TOOL_NAME" in
  hubspot_create|hubspot_update|hubspot_batch_upsert)
    ;;
  *)
    exit 0
    ;;
esac

# Read the tool input from stdin
INPUT=$(cat)

# Check if properties are being written
HAS_PROPERTIES=$(echo "$INPUT" | grep -c '"properties"' 2>/dev/null || true)

if [ "$HAS_PROPERTIES" -gt 0 ]; then
  # Extract property names being written (basic JSON parsing)
  PROP_NAMES=$(echo "$INPUT" | grep -oP '"properties"\s*:\s*\{[^}]*\}' | grep -oP '"[a-z_][a-z0-9_]*"\s*:' | sed 's/"//g; s/://g' | sort -u 2>/dev/null || true)

  # Known HubSpot system properties that always exist
  SYSTEM_PROPS="email firstname lastname company phone website lifecyclestage hs_lead_status hubspot_owner_id"

  # Check for potentially custom properties (not in system list)
  CUSTOM_PROPS=""
  for prop in $PROP_NAMES; do
    IS_SYSTEM=false
    for sys in $SYSTEM_PROPS; do
      if [ "$prop" = "$sys" ]; then
        IS_SYSTEM=true
        break
      fi
    done
    if [ "$IS_SYSTEM" = false ] && [[ "$prop" != hs_* ]]; then
      CUSTOM_PROPS="$CUSTOM_PROPS $prop"
    fi
  done

  if [ -n "$CUSTOM_PROPS" ]; then
    # Log a reminder — this is informational, not blocking
    echo "[pre-property-write] Writing to custom properties:$CUSTOM_PROPS" >&2
    echo "[pre-property-write] Ensure these properties exist in the target portal before writing." >&2
  fi
fi

exit 0
