#!/bin/bash
# MANDATORY: Validates that SFDC projects are created in correct location

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source standardized error handler for centralized logging
if [[ -n "${CLAUDE_PLUGIN_ROOT:-}" ]]; then
    ERROR_HANDLER="${CLAUDE_PLUGIN_ROOT}/cross-platform-plugin/hooks/lib/error-handler.sh"
else
    ERROR_HANDLER="${SCRIPT_DIR}/../../cross-platform-plugin/hooks/lib/error-handler.sh"
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
    exit 1
fi

# Check if using wrong instances directory
if [[ "$PROJECT_PATH" == *"/opspal-internal/instances/"* ]] && [[ "$PROJECT_PATH" != *"/SFDC/"* ]]; then
    echo "❌ ERROR: SFDC project in wrong instances directory!"
    echo "   Found: opspal-internal/instances/ (WRONG)"
    echo "   Expected: opspal-internal/SFDC/instances/ (CORRECT)"
    exit 1
fi

exit 0
