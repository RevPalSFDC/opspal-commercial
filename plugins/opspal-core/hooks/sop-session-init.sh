#!/usr/bin/env bash
# STATUS: SUPERSEDED — absorbed by a registered dispatcher or consolidated hook
# =============================================================================
# SOP Session Initialization Hook (SessionStart child)
# =============================================================================
# Purpose: Validate SOP config at session start. Emits system message with
#          policy count or validation errors.
# Feature flag: SOP_ENABLED (default: 1)
# Mutation boundary: Read-only — only reads config files and emits messages.
# =============================================================================

set -euo pipefail

# Feature flag
SOP_ENABLED="${SOP_ENABLED:-1}"
[ "$SOP_ENABLED" != "1" ] && exit 0

# Dispatcher guard
[ "${DISPATCHER_CONTEXT:-0}" != "1" ] && [ -t 0 ] && exit 0

# Resolve plugin root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Check if SOP is initialized
SOP_CONFIG="$PLUGIN_ROOT/config/sop/sop-config.yaml"
[ ! -f "$SOP_CONFIG" ] && exit 0

# jq and node required
command -v jq &>/dev/null || exit 0
command -v node &>/dev/null || exit 0

# Count policy files
POLICY_COUNT=0
for dir in "$PLUGIN_ROOT/config/sop/global" "$PLUGIN_ROOT/config/sop/revpal-internal" "$PLUGIN_ROOT/config/sop/client-delivery"; do
  if [ -d "$dir" ]; then
    count=$(find "$dir" -name "*.yaml" -o -name "*.yml" 2>/dev/null | wc -l)
    POLICY_COUNT=$((POLICY_COUNT + count))
  fi
done

# Count org overrides
if [ -d "$PLUGIN_ROOT/config/sop/orgs" ]; then
  count=$(find "$PLUGIN_ROOT/config/sop/orgs" -name "*.yaml" -o -name "*.yml" 2>/dev/null | wc -l)
  POLICY_COUNT=$((POLICY_COUNT + count))
fi

# Quick validation: try loading the registry
VALIDATION_RESULT=$(node -e "
const { SopRegistry } = require('$PLUGIN_ROOT/scripts/lib/sop/sop-registry');
const registry = new SopRegistry();
const result = registry.load();
console.log(JSON.stringify({ policies: result.policies, warnings: result.warnings.length, warning_details: result.warnings.slice(0, 3) }));
" 2>/dev/null || echo '{"policies":0,"warnings":0}')

LOADED=$(printf '%s' "$VALIDATION_RESULT" | jq -r '.policies // 0')
WARNING_COUNT=$(printf '%s' "$VALIDATION_RESULT" | jq -r '.warnings // 0')

if [ "$WARNING_COUNT" -gt "0" ]; then
  FIRST_WARNING=$(printf '%s' "$VALIDATION_RESULT" | jq -r '.warning_details[0] // "Unknown"')
  MSG="SOP subsystem active: ${LOADED} policies loaded, ${WARNING_COUNT} warning(s). First: ${FIRST_WARNING}. Run /sop-validate to review."
else
  MSG="SOP subsystem active: ${LOADED} policies loaded."
fi

jq -nc --arg msg "$MSG" '{
  hookSpecificOutput: {
    hookEventName: "SessionStart",
    additionalContext: $msg
  }
}'
