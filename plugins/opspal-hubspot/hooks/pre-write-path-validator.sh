#!/bin/bash

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
if [[ -n "${CLAUDE_PLUGIN_ROOT:-}" ]]; then
    ERROR_HANDLER="${CLAUDE_PLUGIN_ROOT}/opspal-core/hooks/lib/error-handler.sh"
else
    ERROR_HANDLER="${SCRIPT_DIR}/../../opspal-core/hooks/lib/error-handler.sh"
fi

if [[ -f "$ERROR_HANDLER" ]]; then
    source "$ERROR_HANDLER"
    HOOK_NAME="pre-write-path-validator"
    # Lenient mode - path validation should not block on internal errors
    set_lenient_mode 2>/dev/null || true
fi

PROJECT_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$SCRIPT_DIR/../../.." && pwd)}"
BLOCK_ON_PATH_VIOLATION="${HUBSPOT_PATH_VALIDATOR_BLOCK:-1}"

emit_path_violation() {
    local message="$1"
    echo "⚠️  Path Validation Warning" >&2
    echo "=============================" >&2
    echo "" >&2
    echo "$message" >&2
    echo "Path: $FILE_PATH" >&2
    echo "" >&2
    if [[ "$BLOCK_ON_PATH_VIOLATION" == "1" ]]; then
        echo "❌ Write blocked by pre-write path validator" >&2
        exit 2
    fi
    echo "ℹ️  Continuing because HUBSPOT_PATH_VALIDATOR_BLOCK=$BLOCK_ON_PATH_VIOLATION" >&2
}

# Get file path from environment or arguments
FILE_PATH="${WRITE_FILE_PATH:-$1}"

# Exit if no file path
if [[ -z "$FILE_PATH" ]]; then
    exit 0
fi

# Load path requirements
REQUIREMENTS_FILE="$PROJECT_ROOT/.claude/domain-path-requirements.json"

if [[ ! -f "$REQUIREMENTS_FILE" ]]; then
    # No requirements file - allow
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

echo "✅ Path validation passed"
exit 0
