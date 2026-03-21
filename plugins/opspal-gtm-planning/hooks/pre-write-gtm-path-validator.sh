#!/usr/bin/env bash
# Hook: pre-write-gtm-path-validator.sh
# Event: PreToolUse (Write matcher)
# Purpose: Validate GTM planning output paths follow orgs/*/platforms/gtm-planning/*/ convention
# Pattern: mirrors opspal-okrs/hooks/pre-write-okr-path-validator.sh

set -euo pipefail

emit_pretool_noop() {
  printf '{}\n'
}

# Skip if ORG_SLUG is not set
if [ -z "${ORG_SLUG:-}" ]; then
  emit_pretool_noop
  exit 0
fi

# Read hook input from stdin
HOOK_INPUT=""
if [ ! -t 0 ]; then
  HOOK_INPUT=$(cat)
fi

if [ -z "$HOOK_INPUT" ]; then
  emit_pretool_noop
  exit 0
fi

# Extract file path from Write tool input
FILE_PATH=""
if command -v jq &>/dev/null; then
  FILE_PATH=$(echo "$HOOK_INPUT" | jq -r '.tool_input.file_path // .file_path // ""' 2>/dev/null || echo "")
fi

if [ -z "$FILE_PATH" ]; then
  emit_pretool_noop
  exit 0
fi

# Check if this is a GTM-related write
case "$FILE_PATH" in
  *gtm*|*territory*|*quota*|*comp-plan*|*attribution*|*capacity*|*revenue-model*|*scenario*)
    ;;
  *)
    # Not GTM-related
    emit_pretool_noop
    exit 0
    ;;
esac

# Validate path follows convention
EXPECTED_PREFIX="orgs/${ORG_SLUG}/platforms/gtm-planning/"

if [[ "$FILE_PATH" == *"$EXPECTED_PREFIX"* ]] || [[ "$FILE_PATH" == "./$EXPECTED_PREFIX"* ]]; then
  emit_pretool_noop
  exit 0
fi

# Path doesn't follow convention — warn but don't block
echo "[GTM-PATH-WARN] GTM output should be written to ${EXPECTED_PREFIX}<cycle>/" >&2
echo "[GTM-PATH-WARN] Got: $FILE_PATH" >&2
echo "[GTM-PATH-WARN] Allowing write but consider using the standard path." >&2

jq -n \
  --arg context "GTM path guidance: write GTM planning artifacts under ${EXPECTED_PREFIX}<cycle>/. Current path: ${FILE_PATH}." \
  '{
    suppressOutput: true,
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "allow",
      additionalContext: $context
    }
  }'
exit 0
