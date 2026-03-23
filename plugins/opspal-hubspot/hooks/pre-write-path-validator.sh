#!/usr/bin/env bash
set -euo pipefail

##
# Pre-Write Path Validator Hook
#
# Validates write paths before file creation to enforce domain-specific patterns.
# Prevents files from being created in wrong directories.
#
# Adapted from SFDC pre-write-path-validator.sh
##

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source standardized error handler for centralized logging
if [[ -f "${SCRIPT_DIR}/lib/error-handler.sh" ]]; then
    ERROR_HANDLER="${SCRIPT_DIR}/lib/error-handler.sh"
elif [[ -f "${SCRIPT_DIR}/../../opspal-core/hooks/lib/error-handler.sh" ]]; then
    ERROR_HANDLER="${SCRIPT_DIR}/../../opspal-core/hooks/lib/error-handler.sh"
else
    ERROR_HANDLER=""
fi

if [[ -f "$ERROR_HANDLER" ]]; then
    source "$ERROR_HANDLER"
    HOOK_NAME="pre-write-path-validator"
    # Lenient mode - path validation should not block on internal errors
    set_lenient_mode 2>/dev/null || true
fi

PROJECT_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$SCRIPT_DIR/../../.." && pwd)}"
BLOCK_ON_PATH_VIOLATION="${HUBSPOT_PATH_VALIDATOR_BLOCK:-1}"

emit_pretool_noop() {
    printf '{}\n'
}

emit_pretool_response() {
    local permission_decision="$1"
    local permission_reason="$2"
    local additional_context="${3:-}"

    if ! command -v jq >/dev/null 2>&1; then
        emit_pretool_noop
        return 0
    fi

    jq -nc \
      --arg decision "$permission_decision" \
      --arg reason "$permission_reason" \
      --arg context "$additional_context" \
      '{
        suppressOutput: true,
        hookSpecificOutput: (
          { hookEventName: "PreToolUse" }
          + (if $decision != "${1:-}" then { permissionDecision: $decision } else {} end)
          + (if $reason != "${1:-}" then { permissionDecisionReason: $reason } else {} end)
          + (if $context != "${1:-}" then { additionalContext: $context } else {} end)
        )
      }'
}

emit_path_violation() {
    local message="$1"
    echo "⚠️  Path Validation Warning" >&2
    echo "=============================" >&2
    echo "${1:-}" >&2
    echo "$message" >&2
    echo "Path: $FILE_PATH" >&2
    echo "${1:-}" >&2
    if [[ "$BLOCK_ON_PATH_VIOLATION" == "1" ]]; then
        echo "❌ Write blocked by pre-write path validator" >&2
        emit_pretool_response \
          "deny" \
          "HUBSPOT_PATH_VALIDATION_BLOCKED: ${message}" \
          "Path: ${FILE_PATH}"
        exit 0
    fi
    echo "ℹ️  Continuing because HUBSPOT_PATH_VALIDATOR_BLOCK=$BLOCK_ON_PATH_VIOLATION" >&2
    emit_pretool_response \
      "allow" \
      "HUBSPOT_PATH_VALIDATION_WARNING: ${message}" \
      "Path: ${FILE_PATH}"
    exit 0
}

# Get file path from environment or arguments
FILE_PATH="${WRITE_FILE_PATH:-${1:-}}"

# Exit if no file path
if [[ -z "$FILE_PATH" ]]; then
    emit_pretool_noop
    exit 0
fi

# Load path requirements
REQUIREMENTS_FILE="$PROJECT_ROOT/.claude/domain-path-requirements.json"

if [[ ! -f "$REQUIREMENTS_FILE" ]]; then
    # No requirements file - allow
    emit_pretool_noop
    exit 0
fi

# Check if path matches requirements
# For now, just check common violations

# Scripts should be in scripts/ or scripts/lib/
if [[ "$FILE_PATH" == *.js ]] && [[ "$FILE_PATH" != *"/scripts/"* ]] && [[ "$FILE_PATH" != *"/lib/"* ]]; then
    # Check if it's an assessment script (allowed in instances/)
    if [[ "$FILE_PATH" != *"/instances/"* ]] && [[ "$FILE_PATH" != *"/portals/"* ]]; then
        emit_path_violation "JavaScript files should be in scripts/ or scripts/lib/
Suggested: scripts/$(basename "$FILE_PATH")"
    fi
fi

# Reports should be in reports/ or portals/{name}/reports/
if [[ "$FILE_PATH" == *"REPORT"* ]] || [[ "$FILE_PATH" == *"SUMMARY"* ]]; then
    if [[ "$FILE_PATH" != *"/reports/"* ]] && [[ "$FILE_PATH" != *"/portals/"* ]]; then
        emit_path_violation "Report files should be in reports/ or portals/{name}/reports/"
    fi
fi

emit_pretool_noop
exit 0
