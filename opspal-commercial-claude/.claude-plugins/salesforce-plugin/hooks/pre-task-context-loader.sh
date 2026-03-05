#!/bin/bash
#
# Pre-Task Context Loader Hook
#
# Purpose: Automatically load org context and environment data before Task tool
#          invocations, ensuring all agents have consistent context information.
#
# Behavior:
#   1. Detects Salesforce org from multiple sources (path, config, env, history)
#   2. Loads org-specific quirks and mappings
#   3. Exports context as JSON for agent consumption
#   4. Warns if no org context can be determined
#
# Configuration:
#   ORG_CONTEXT_STRICT=1     - Block tasks if no org detected (default: 0)
#   ORG_CONTEXT_VERBOSE=1    - Show detailed detection output (default: 0)
#   ORG_CONTEXT_CACHE_TTL=300 - Cache TTL in seconds (default: 300)
#
# Outputs:
#   - SF_ORG_CONTEXT env var (JSON with full detection result)
#   - SF_TARGET_ORG env var (detected org alias)
#   - /tmp/sf-org-context.json (cached context file)
#
# Integration:
#   Uses org-context-detector.js for comprehensive detection
#
# Version: 1.0.0
# Date: 2025-12-05
# Source: Reflection Plan Phase 1 - Org Context Detection
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Plugin root detection
if [ -n "${CLAUDE_PLUGIN_ROOT:-}" ]; then
    PLUGIN_ROOT="$CLAUDE_PLUGIN_ROOT"
else
    PLUGIN_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
fi

# Source standardized error handler if available
ERROR_HANDLER="${SCRIPT_DIR}/../../cross-platform-plugin/hooks/lib/error-handler.sh"
if [ -f "$ERROR_HANDLER" ]; then
    source "$ERROR_HANDLER"
    HOOK_NAME="pre-task-context-loader"
    set_lenient_mode 2>/dev/null || true
fi

# Configuration
STRICT_MODE="${ORG_CONTEXT_STRICT:-0}"
VERBOSE="${ORG_CONTEXT_VERBOSE:-0}"
CACHE_TTL="${ORG_CONTEXT_CACHE_TTL:-300}"
CACHE_FILE="/tmp/sf-org-context.json"

# Read hook input
HOOK_INPUT=""
if [ ! -t 0 ]; then
    HOOK_INPUT=$(cat)
fi

# ============================================================================
# Functions
# ============================================================================

log_verbose() {
    if [ "$VERBOSE" = "1" ]; then
        echo "[pre-task-context-loader] $1" >&2
    fi
}

# Check if cache is still valid
is_cache_valid() {
    if [ ! -f "$CACHE_FILE" ]; then
        return 1
    fi

    local cache_time
    cache_time=$(stat -c %Y "$CACHE_FILE" 2>/dev/null || stat -f %m "$CACHE_FILE" 2>/dev/null || echo 0)
    local now
    now=$(date +%s)
    local age=$((now - cache_time))

    if [ "$age" -lt "$CACHE_TTL" ]; then
        return 0
    fi
    return 1
}

# Load context using org-context-detector.js
load_org_context() {
    local detector_script="$PLUGIN_ROOT/scripts/lib/org-context-detector.js"

    if [ ! -f "$detector_script" ]; then
        log_verbose "org-context-detector.js not found at $detector_script"
        return 1
    fi

    if ! command -v node &>/dev/null; then
        log_verbose "Node.js not available"
        return 1
    fi

    local result
    result=$(node "$detector_script" --json 2>/dev/null || echo '{"detected":false}')

    echo "$result"
}

# Load org quirks if available
load_org_quirks() {
    local org_alias="$1"
    local quirks_file

    # Check multiple possible locations
    local locations=(
        "$PWD/ORG_QUIRKS.json"
        "$PWD/../ORG_QUIRKS.json"
        "$(dirname "$PWD")/instances/$org_alias/ORG_QUIRKS.json"
    )

    for quirks_file in "${locations[@]}"; do
        if [ -f "$quirks_file" ]; then
            cat "$quirks_file"
            return 0
        fi
    done

    echo '{}'
}

# Build comprehensive context
build_context() {
    local org_detection="$1"
    local org_alias

    org_alias=$(echo "$org_detection" | jq -r '.org // ""' 2>/dev/null || echo "")

    local quirks='{}'
    if [ -n "$org_alias" ]; then
        quirks=$(load_org_quirks "$org_alias")
    fi

    # Build combined context
    if command -v jq &>/dev/null; then
        jq -n \
            --argjson detection "$org_detection" \
            --argjson quirks "$quirks" \
            --arg timestamp "$(date -Iseconds)" \
            --arg cwd "$PWD" \
            '{
                orgContext: $detection,
                quirks: $quirks,
                loadedAt: $timestamp,
                workingDirectory: $cwd,
                environment: {
                    SALESFORCE_ENVIRONMENT: (env.SALESFORCE_ENVIRONMENT // "unknown"),
                    SALESFORCE_INSTANCE: (env.SALESFORCE_INSTANCE // "unknown"),
                    SF_TARGET_ORG: (env.SF_TARGET_ORG // "")
                }
            }'
    else
        echo "$org_detection"
    fi
}

# ============================================================================
# Main Logic
# ============================================================================

# Check if we should skip (not a Salesforce-related task)
if [ -n "$HOOK_INPUT" ] && command -v jq &>/dev/null; then
    AGENT_TYPE=$(echo "$HOOK_INPUT" | jq -r '.subagent_type // ""' 2>/dev/null || echo "")

    # Only process for Salesforce-related agents
    if [[ ! "$AGENT_TYPE" =~ ^(sfdc-|salesforce|trigger-|validation-rule-|permission-|flow-) ]]; then
        log_verbose "Non-Salesforce agent ($AGENT_TYPE) - skipping context load"
        echo "$HOOK_INPUT"
        exit 0
    fi
fi

# Try cache first
if is_cache_valid; then
    log_verbose "Using cached context"
    CONTEXT=$(cat "$CACHE_FILE")
else
    log_verbose "Loading fresh org context"
    ORG_DETECTION=$(load_org_context)
    CONTEXT=$(build_context "$ORG_DETECTION")

    # Cache the result
    echo "$CONTEXT" > "$CACHE_FILE"
fi

# Extract org alias for environment export
ORG_ALIAS=$(echo "$CONTEXT" | jq -r '.orgContext.org // ""' 2>/dev/null || echo "")
DETECTED=$(echo "$CONTEXT" | jq -r '.orgContext.detected // false' 2>/dev/null || echo "false")
CONFIDENCE=$(echo "$CONTEXT" | jq -r '.orgContext.confidence // 0' 2>/dev/null || echo "0")

# Export context
export SF_ORG_CONTEXT="$CONTEXT"
export SF_TARGET_ORG="$ORG_ALIAS"

# Log detection result
if [ "$DETECTED" = "true" ]; then
    log_verbose "Detected org: $ORG_ALIAS (confidence: $CONFIDENCE)"

    # Add context to hook output for agent visibility
    if [ -n "$HOOK_INPUT" ] && command -v jq &>/dev/null; then
        ENHANCED_INPUT=$(echo "$HOOK_INPUT" | jq \
            --arg org "$ORG_ALIAS" \
            --argjson context "$CONTEXT" \
            '. + {
                sf_org_context: {
                    detected_org: $org,
                    context: $context,
                    note: "Auto-detected org context - use --target-org to override"
                }
            }'
        )
        echo "$ENHANCED_INPUT"
        exit 0
    fi
else
    # No org detected
    if [ "$STRICT_MODE" = "1" ]; then
        echo "
⚠️ NO SALESFORCE ORG CONTEXT DETECTED

Unable to determine target Salesforce org. Please either:
1. Set SF_TARGET_ORG or SALESFORCE_ORG_ALIAS environment variable
2. Run: sf config set target-org <alias>
3. Use --target-org flag in your commands

To disable strict mode: export ORG_CONTEXT_STRICT=0
" >&2
        exit 7  # EXIT_VALIDATION_FAILED
    else
        log_verbose "No org detected - proceeding without context"
    fi
fi

# Pass through input
if [ -n "$HOOK_INPUT" ]; then
    echo "$HOOK_INPUT"
fi
exit 0
