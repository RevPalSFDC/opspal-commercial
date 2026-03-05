#!/bin/bash

##
# Pre-Task Context Loader Hook
#
# Auto-loads portal context before task execution to provide agents with
# historical context and previous assessment findings.
#
# Adapted from SFDC pre-task-context-loader.sh
##

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source standardized error handler for centralized logging
if [[ -n "${CLAUDE_PLUGIN_ROOT:-}" ]]; then
    ERROR_HANDLER="${CLAUDE_PLUGIN_ROOT}/packages/opspal-core/cross-platform-plugin/hooks/lib/error-handler.sh"
else
    ERROR_HANDLER="${SCRIPT_DIR}/../../../opspal-core/cross-platform-plugin/hooks/lib/error-handler.sh"
fi

if [[ -f "$ERROR_HANDLER" ]]; then
    source "$ERROR_HANDLER"
    HOOK_NAME="pre-task-context-loader"
    # Lenient mode - context loading should not block tasks
    set_lenient_mode 2>/dev/null || true
fi

resolve_domain_root() {
    local dir="$1"
    while [[ "$dir" != "/" ]]; do
        if [[ -d "$dir/scripts" ]]; then
            echo "$dir"
            return 0
        fi
        dir="$(dirname "$dir")"
    done
    echo "$1"
}

DOMAIN_ROOT="$(resolve_domain_root "$SCRIPT_DIR")"
PROJECT_ROOT="$DOMAIN_ROOT"
if [[ -n "${CLAUDE_PLUGIN_ROOT:-}" ]]; then
    DOMAIN_NAME="$(basename "$DOMAIN_ROOT")"
    case "$CLAUDE_PLUGIN_ROOT" in
        *"/packages/domains/$DOMAIN_NAME"|*/"$DOMAIN_NAME"-plugin) PROJECT_ROOT="$CLAUDE_PLUGIN_ROOT" ;;
    esac
fi

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
    # No portal context available
    exit 0
fi

CONTEXT_MANAGER="$PROJECT_ROOT/scripts/lib/portal-context-manager.js"

if [[ -f "$CONTEXT_MANAGER" ]]; then
    # Load context and export as environment variable
    PORTAL_CONTEXT=$(node "$CONTEXT_MANAGER" load "$PORTAL_NAME" 2>/dev/null)

    if [[ $? -eq 0 ]] && [[ -n "$PORTAL_CONTEXT" ]]; then
        # Export context for agents to use
        export PORTAL_CONTEXT
        echo "✅ Portal context loaded for: $PORTAL_NAME"

        # Show quick summary
        TOTAL_ASSESSMENTS=$(echo "$PORTAL_CONTEXT" | jq -r '.metadata.totalAssessments' 2>/dev/null)
        if [[ -n "$TOTAL_ASSESSMENTS" ]] && [[ "$TOTAL_ASSESSMENTS" != "null" ]]; then
            echo "   Total assessments: $TOTAL_ASSESSMENTS"
        fi
    fi
fi

exit 0
