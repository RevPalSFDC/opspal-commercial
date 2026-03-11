#!/usr/bin/env bash
# Hook: pre-write-okr-path-validator.sh
# Event: PreToolUse on Write
# Purpose: Validate OKR output paths follow orgs/*/platforms/okr/*/ convention
# Controlled by OKR_PATH_VALIDATOR_BLOCK env var (default: 1)

set -euo pipefail

BLOCK_MODE="${OKR_PATH_VALIDATOR_BLOCK:-1}"

# Read the tool input from stdin
INPUT="$(cat)"

# Extract the file_path from the tool input
FILE_PATH=""
if command -v jq &>/dev/null; then
  FILE_PATH="$(echo "$INPUT" | jq -r '.file_path // empty' 2>/dev/null || true)"
fi

# If we couldn't extract the path, allow the write
if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# Only validate paths that look like OKR outputs
case "$FILE_PATH" in
  *okr*|*OKR*)
    ;;
  *)
    # Not an OKR-related path — skip validation
    exit 0
    ;;
esac

# Check if path follows the convention: orgs/*/platforms/okr/*/
VALID_PATTERN="orgs/[^/]+/platforms/okr/"

if echo "$FILE_PATH" | grep -qE "$VALID_PATTERN"; then
  exit 0
fi

# Also allow writes to the plugin directory itself (templates, config, etc.)
if echo "$FILE_PATH" | grep -qE "plugins/opspal-okrs/"; then
  exit 0
fi

# Path doesn't match — warn or block
MSG="OKR path validation: '${FILE_PATH}' does not follow the orgs/{org}/platforms/okr/{cycle}/ convention. Expected pattern: orgs/<org-slug>/platforms/okr/<cycle>/<subfolder>/<filename>"

if [ "$BLOCK_MODE" = "1" ]; then
  echo "BLOCKED: $MSG" >&2
  exit 2
else
  echo "WARNING: $MSG" >&2
  exit 0
fi
