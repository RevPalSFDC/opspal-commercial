#!/bin/bash

##
# Post-Portal Authentication Hook
#
# Auto-runs portal quirks detection after successful portal authentication
# to generate quick reference documentation.
#
# Adapted from SFDC post-org-authentication.sh
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
    HOOK_NAME="post-portal-authentication"
    # Lenient mode - quirks detection should not block operations
    set_lenient_mode 2>/dev/null || true
fi

PROJECT_ROOT="${CLAUDE_PLUGIN_ROOT}"

# Get portal name from environment or current portal config
PORTAL_NAME="${HUBSPOT_PORTAL_NAME:-}"

if [[ -z "$PORTAL_NAME" ]]; then
    # Try to read from .current-portal file
    CURRENT_PORTAL_FILE="$PROJECT_ROOT/.current-portal"
    if [[ -f "$CURRENT_PORTAL_FILE" ]]; then
        PORTAL_NAME=$(cat "$CURRENT_PORTAL_FILE")
    fi
fi

if [[ -z "$PORTAL_NAME" ]]; then
    echo "ℹ️  No portal name detected - skipping quirks detection"
    exit 0
fi

echo "🔍 Running portal quirks detection for: $PORTAL_NAME"

DETECTOR_SCRIPT="$PROJECT_ROOT/scripts/lib/portal-quirks-detector.js"

if [[ -f "$DETECTOR_SCRIPT" ]]; then
    # Run quirks detection in background to not block
    (
        node "$DETECTOR_SCRIPT" generate-docs "$PORTAL_NAME" > /dev/null 2>&1
        if [[ $? -eq 0 ]]; then
            echo "✅ Portal quirks documentation generated"
            echo "   Location: portals/$PORTAL_NAME/"
        else
            echo "⚠️  Portal quirks detection failed (non-blocking)"
        fi
    ) &
else
    echo "⚠️  Portal quirks detector not found: $DETECTOR_SCRIPT"
fi

exit 0
