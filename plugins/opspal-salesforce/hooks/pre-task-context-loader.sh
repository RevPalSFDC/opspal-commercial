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
# Version: 1.1.0
# Date: 2025-12-05
# Updated: 2026-01-15 - Standardized exit codes, improved error handling
# Source: Reflection Plan Phase 1 - Org Context Detection
#
# Exit Codes (standardized - see sf-exit-codes.sh):
#   0 - Success
#   1 - Validation error
#   7 - Strict mode failure (no org detected)
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source standardized exit codes
if [[ -f "${SCRIPT_DIR}/../scripts/lib/sf-exit-codes.sh" ]]; then
    source "${SCRIPT_DIR}/../scripts/lib/sf-exit-codes.sh"
else
    EXIT_SUCCESS=0
    EXIT_VALIDATION_ERROR=1
fi

# Plugin root detection
if [ -n "${CLAUDE_PLUGIN_ROOT:-}" ]; then
    PLUGIN_ROOT="$CLAUDE_PLUGIN_ROOT"
else
    PLUGIN_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
fi

# Source standardized error handler if available
ERROR_HANDLER="${SCRIPT_DIR}/../../opspal-core/hooks/lib/error-handler.sh"
if [ -f "$ERROR_HANDLER" ]; then
    source "$ERROR_HANDLER"
    HOOK_NAME="pre-task-context-loader"
    set_lenient_mode 2>/dev/null || true
fi

# Configuration
STRICT_MODE="${ORG_CONTEXT_STRICT:-0}"
VERBOSE="${ORG_CONTEXT_VERBOSE:-0}"
CACHE_TTL="${ORG_CONTEXT_CACHE_TTL:-300}"
CACHE_FILE="${TMPDIR:-/tmp}/sf-org-context.json"

# Live-first mode: Skip cache and always load fresh context
# Controlled by GLOBAL_LIVE_FIRST or CONTEXT_LIVE_FIRST env vars
# Default: true (live-first behavior)
LIVE_FIRST="${CONTEXT_LIVE_FIRST:-${GLOBAL_LIVE_FIRST:-true}}"

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

    local result=""
    local exit_code=0

    # Execute with proper error handling (no silent fallback)
    result=$(node "$detector_script" --json 2>&1) || exit_code=$?

    if [ $exit_code -ne 0 ]; then
        log_verbose "org-context-detector failed (exit code: $exit_code)"
        # Return minimal structure indicating detection failed
        echo '{"detected":false,"error":"detector_failed","exitCode":'$exit_code'}'
        return 0  # Don't fail the hook, just indicate no detection
    fi

    echo "$result"
}

# Load org quirks if available (Dual-Path Support)
load_org_quirks() {
    local org_alias="$1"
    local quirks_file

    # Get project base (parent of .claude-plugins)
    local project_base="${CLAUDE_PLUGIN_ROOT:-$(pwd)}"
    if [[ "$project_base" =~ .claude-plugins ]]; then
        project_base="$(cd "$project_base/../.." && pwd)"
    fi

    # Detect org slug from org-centric path
    local org_slug=""
    local platform="salesforce"
    if [[ "$PWD" =~ /orgs/([^/]+)/platforms/([^/]+)/([^/]+) ]]; then
        org_slug="${BASH_REMATCH[1]}"
        platform="${BASH_REMATCH[2]}"
    fi

    # Check multiple possible locations in priority order
    local locations=(
        # Current directory
        "$PWD/ORG_QUIRKS.json"
        "$PWD/configs/ORG_QUIRKS.json"
        "$PWD/../ORG_QUIRKS.json"
        # NEW: Org-centric locations
        "$project_base/orgs/$org_slug/platforms/$platform/$org_alias/configs/ORG_QUIRKS.json"
        "$project_base/orgs/$org_slug/platforms/$platform/$org_alias/ORG_QUIRKS.json"
        "$project_base/orgs/$org_alias/platforms/salesforce/production/configs/ORG_QUIRKS.json"
        # Legacy project-level locations
        "$project_base/instances/salesforce/$org_alias/ORG_QUIRKS.json"
        "$project_base/instances/$org_alias/ORG_QUIRKS.json"
        # Legacy plugin-specific locations
        "$PLUGIN_ROOT/instances/$org_alias/ORG_QUIRKS.json"
        "$PLUGIN_ROOT/instances/salesforce/$org_alias/ORG_QUIRKS.json"
    )

    for quirks_file in "${locations[@]}"; do
        if [ -f "$quirks_file" ]; then
            log_verbose "Found quirks file: $quirks_file"
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
        # SessionStart hooks must output valid envelope or nothing — don't echo raw input
        exit 0
    fi
fi

# Try cache first (unless live-first mode is enabled)
if [[ "$LIVE_FIRST" != "true" ]] && is_cache_valid; then
    log_verbose "Using cached context"
    CONTEXT=$(cat "$CACHE_FILE")
else
    if [[ "$LIVE_FIRST" == "true" ]]; then
        log_verbose "Live-first mode: loading fresh org context"
    else
        log_verbose "Loading fresh org context"
    fi
    ORG_DETECTION=$(load_org_context)
    CONTEXT=$(build_context "$ORG_DETECTION")

    # Cache the result (for fallback use)
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

    # Add context to hook output for agent visibility via systemMessage envelope
    if command -v jq &>/dev/null; then
        CONTEXT_MSG="Salesforce org detected: ${ORG_ALIAS}. Auto-loaded org context is available via SF_ORG_CONTEXT env var."
        jq -n --arg msg "$CONTEXT_MSG" '{"systemMessage": $msg}'
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

# No context to inject — output nothing (valid no-op for SessionStart)
exit 0
