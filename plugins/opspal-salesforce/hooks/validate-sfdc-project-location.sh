#!/usr/bin/env bash
set -euo pipefail
# MANDATORY: Validates that SFDC projects are created in correct location
#
# Exit Codes (standardized - see sf-exit-codes.sh):
#   0 - Path is valid
#   1 - Path validation failed (wrong location)
#
# Updated: 2026-01-15 - Standardized exit codes

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source standardized exit codes
if [[ -f "${SCRIPT_DIR}/../scripts/lib/sf-exit-codes.sh" ]]; then
    source "${SCRIPT_DIR}/../scripts/lib/sf-exit-codes.sh"
else
    EXIT_SUCCESS=0
    EXIT_VALIDATION_ERROR=1
fi

# Source standardized error handler for centralized logging
if [[ -n "${CLAUDE_PLUGIN_ROOT:-}" ]]; then
    ERROR_HANDLER="${CLAUDE_PLUGIN_ROOT}/opspal-core/hooks/lib/error-handler.sh"
else
    ERROR_HANDLER="${SCRIPT_DIR}/../../opspal-core/hooks/lib/error-handler.sh"
fi

if [[ -f "$ERROR_HANDLER" ]]; then
    source "$ERROR_HANDLER"
    HOOK_NAME="validate-sfdc-project-location"
fi

PROJECT_PATH="$1"

# Check if this is an SFDC-related operation
if [[ "$PROJECT_PATH" == *"instances/"* ]] && [[ "$PROJECT_PATH" != *"SFDC/instances/"* ]]; then
    echo "❌ ERROR: SFDC projects MUST be created in SFDC/instances/{org-alias}/"
    echo "   Wrong path: $PROJECT_PATH"
    echo "   Correct pattern: */SFDC/instances/{org-alias}/{project-name}/"
    exit $EXIT_VALIDATION_ERROR
fi

# Check if using wrong instances directory
if [[ "$PROJECT_PATH" == *"/opspal-internal/instances/"* ]] && [[ "$PROJECT_PATH" != *"/SFDC/"* ]]; then
    echo "❌ ERROR: SFDC project in wrong instances directory!"
    echo "   Found: opspal-internal/instances/ (WRONG)"
    echo "   Expected: opspal-internal/SFDC/instances/ (CORRECT)"
    exit $EXIT_VALIDATION_ERROR
fi

exit $EXIT_SUCCESS
