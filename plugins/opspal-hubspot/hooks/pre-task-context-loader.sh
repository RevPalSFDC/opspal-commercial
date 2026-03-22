#!/usr/bin/env bash
set -euo pipefail

##
# Pre-Task Context Loader Hook
if ! command -v jq &>/dev/null; then
    echo "[pre-task-context-loader] jq not found, skipping" >&2
    exit 0
fi

#
# Auto-loads portal context before task execution to provide agents with
# historical context and previous assessment findings.
#
# Adapted from SFDC pre-task-context-loader.sh
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
    HOOK_NAME="pre-task-context-loader"
    # Lenient mode - context loading should not block tasks
    set_lenient_mode 2>/dev/null || true
fi

# Live-first mode: Always load fresh context from manager
# Controlled by GLOBAL_LIVE_FIRST or CONTEXT_LIVE_FIRST env vars
# Default: true (live-first behavior)
LIVE_FIRST="${CONTEXT_LIVE_FIRST:-${GLOBAL_LIVE_FIRST:-true}}"
CACHE_FILE="/tmp/hs-portal-context.json"
CACHE_TTL="${HS_CONTEXT_CACHE_TTL:-300}"

PROJECT_ROOT="${CLAUDE_PLUGIN_ROOT:-}"

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

# Check cache validity (unless live-first mode)
is_cache_valid() {
    if [[ ! -f "$CACHE_FILE" ]]; then
        return 1
    fi
    local cache_time now age
    cache_time=$(stat -c %Y "$CACHE_FILE" 2>/dev/null || stat -f %m "$CACHE_FILE" 2>/dev/null || echo 0)
    now=$(date +%s)
    age=$((now - cache_time))
    [[ "$age" -lt "$CACHE_TTL" ]]
}

# Try cache first (unless live-first mode)
if [[ "$LIVE_FIRST" != "true" ]] && is_cache_valid; then
    PORTAL_CONTEXT=$(cat "$CACHE_FILE")
    export PORTAL_CONTEXT
    echo "✅ Portal context loaded from cache for: $PORTAL_NAME"
    exit 0
fi

if [[ -f "$CONTEXT_MANAGER" ]]; then
    if [[ "$LIVE_FIRST" == "true" ]]; then
        echo "🔄 Live-first mode: loading fresh portal context"
    fi

    # Load context and export as environment variable
    PORTAL_CONTEXT=$(node "$CONTEXT_MANAGER" load "$PORTAL_NAME" 2>/dev/null)

    if [[ $? -eq 0 ]] && [[ -n "$PORTAL_CONTEXT" ]]; then
        # Export context for agents to use
        export PORTAL_CONTEXT
        # Cache for fallback use
        echo "$PORTAL_CONTEXT" > "$CACHE_FILE" 2>/dev/null || true
        echo "✅ Portal context loaded for: $PORTAL_NAME"

        # Show quick summary
        TOTAL_ASSESSMENTS=$(echo "$PORTAL_CONTEXT" | jq -r '.metadata.totalAssessments' 2>/dev/null)
        if [[ -n "$TOTAL_ASSESSMENTS" ]] && [[ "$TOTAL_ASSESSMENTS" != "null" ]]; then
            echo "   Total assessments: $TOTAL_ASSESSMENTS"
        fi
    fi
fi

exit 0
