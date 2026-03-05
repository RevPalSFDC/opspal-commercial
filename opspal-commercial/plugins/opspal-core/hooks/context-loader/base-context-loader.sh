#!/bin/bash
# =============================================================================
# Base Context Loader Hook
# =============================================================================
#
# Purpose: Unified context loading with platform-specific extensions
# Version: 1.0.0
# Created: 2026-01-09
#
# This is the centralized context loader that:
#   1. Detects the current platform (Salesforce, HubSpot, Marketo)
#   2. Loads common context (project root, env vars, cache)
#   3. Delegates to platform-specific extensions for specialized context
#   4. Exports unified context for agents
#
# Configuration:
#   CONTEXT_CACHE_TTL=300    - Cache TTL in seconds (default: 300)
#   CONTEXT_VERBOSE=1        - Show detailed output
#   CONTEXT_STRICT=1         - Block if no context detected
#
# Outputs:
#   - PLATFORM_CONTEXT env var (JSON with unified context)
#   - DETECTED_PLATFORM env var (salesforce|hubspot|marketo|unknown)
#   - /tmp/platform-context.json (cached context)
#
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Always calculate from SCRIPT_DIR - CLAUDE_PLUGIN_ROOT may point to workspace root
PLUGIN_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Source standardized error handler
ERROR_HANDLER="$PLUGIN_ROOT/hooks/lib/error-handler.sh"
if [[ -f "$ERROR_HANDLER" ]]; then
    source "$ERROR_HANDLER"
    HOOK_NAME="base-context-loader"
    set_lenient_mode 2>/dev/null || true
fi

# Configuration
CACHE_TTL="${CONTEXT_CACHE_TTL:-300}"
VERBOSE="${CONTEXT_VERBOSE:-0}"
STRICT_MODE="${CONTEXT_STRICT:-0}"
CACHE_FILE="${TMPDIR:-/tmp}/platform-context.json"

# Live-first mode: Skip cache and always load fresh context
# Controlled by GLOBAL_LIVE_FIRST or CONTEXT_LIVE_FIRST env vars
# Default: true (live-first behavior)
LIVE_FIRST="${CONTEXT_LIVE_FIRST:-${GLOBAL_LIVE_FIRST:-true}}"

# Read hook input
HOOK_INPUT=""
if [[ ! -t 0 ]]; then
    HOOK_INPUT=$(cat)
fi

# =============================================================================
# Logging
# =============================================================================

log_verbose() {
    if [[ "$VERBOSE" = "1" ]]; then
        echo "[context-loader] $1" >&2
    fi
}

log_info() {
    echo "[context-loader] $1" >&2
}

# =============================================================================
# Cache Management (uses shared functions from error-handler.sh)
# =============================================================================

check_cache() {
    if type get_cached_context &>/dev/null; then
        local cached
        cached=$(get_cached_context "platform-context" "$CACHE_TTL" 2>/dev/null || echo "")
        if [[ -n "$cached" ]]; then
            log_verbose "Using cached context (TTL: ${CACHE_TTL}s)"
            echo "$cached"
            return 0
        fi
    elif [[ -f "$CACHE_FILE" ]]; then
        # Fallback: file-based cache
        local cache_time now age
        cache_time=$(stat -c %Y "$CACHE_FILE" 2>/dev/null || stat -f %m "$CACHE_FILE" 2>/dev/null || echo 0)
        now=$(date +%s)
        age=$((now - cache_time))

        if [[ "$age" -lt "$CACHE_TTL" ]]; then
            log_verbose "Using file-cached context (age: ${age}s)"
            cat "$CACHE_FILE"
            return 0
        fi
    fi
    return 1
}

save_cache() {
    local context="$1"

    if type set_cached_context &>/dev/null; then
        set_cached_context "platform-context" "$context" 2>/dev/null || true
    fi

    # Also save to file as backup
    echo "$context" > "$CACHE_FILE" 2>/dev/null || true
}

# =============================================================================
# Platform Detection (uses shared function if available)
# =============================================================================

detect_current_platform() {
    # Use shared function from error-handler.sh if available
    if type detect_platform &>/dev/null; then
        detect_platform
        return
    fi

    # Fallback implementation
    local platform="unknown"
    local pwd_lower
    pwd_lower=$(echo "$PWD" | tr '[:upper:]' '[:lower:]')

    # Check environment variables first
    if [[ -n "${SF_TARGET_ORG:-}" ]] || [[ -n "${SFDX_DEFAULTUSERNAME:-}" ]]; then
        platform="salesforce"
    elif [[ -n "${HUBSPOT_PORTAL_ID:-}" ]] || [[ -n "${HUBSPOT_PORTAL_NAME:-}" ]]; then
        platform="hubspot"
    elif [[ -n "${MARKETO_CLIENT_ID:-}" ]] || [[ -n "${MARKETO_INSTANCE:-}" ]]; then
        platform="marketo"
    # Check working directory
    elif echo "$pwd_lower" | grep -qE "(sfdc|salesforce|force-app)"; then
        platform="salesforce"
    elif echo "$pwd_lower" | grep -qE "(hubspot|hs-|portal)"; then
        platform="hubspot"
    elif echo "$pwd_lower" | grep -qE "(marketo|mkto)"; then
        platform="marketo"
    # Check for config files
    elif [[ -f "sfdx-project.json" ]] || [[ -d "force-app" ]]; then
        platform="salesforce"
    elif [[ -f ".hubspot-portal" ]] || [[ -f ".current-portal" ]]; then
        platform="hubspot"
    elif [[ -f ".marketo-instance" ]]; then
        platform="marketo"
    fi

    echo "$platform"
}

# =============================================================================
# Load Common Context
# =============================================================================

load_common_context() {
    local project_root="$PWD"

    # Use shared function if available
    if type find_project_root &>/dev/null; then
        project_root=$(find_project_root 2>/dev/null || echo "$PWD")
    fi

    # Load environment variables from project
    if type load_project_env &>/dev/null; then
        load_project_env "$project_root" 2>/dev/null || true
    elif [[ -f "$project_root/.env" ]]; then
        set -a
        source "$project_root/.env" 2>/dev/null || true
        set +a
    fi

    # Build common context JSON
    local context
    context=$(jq -n \
        --arg root "$project_root" \
        --arg user "${USER:-$(whoami)}" \
        --arg ts "$(date -Iseconds 2>/dev/null || date '+%Y-%m-%dT%H:%M:%S')" \
        '{
            projectRoot: $root,
            user: $user,
            timestamp: $ts,
            env: {}
        }' 2>/dev/null || echo '{}')

    echo "$context"
}

# =============================================================================
# Load Platform-Specific Context
# =============================================================================

load_platform_context() {
    local platform="$1"
    local common_context="$2"
    local platform_context="{}"

    # Look for platform extension script
    local extension_script="$SCRIPT_DIR/platform-extensions/${platform}.sh"

    if [[ -f "$extension_script" ]]; then
        log_verbose "Loading $platform extension: $extension_script"
        platform_context=$(bash "$extension_script" "$common_context" 2>/dev/null || echo '{}')
    else
        log_verbose "No extension for platform: $platform"

        # Fallback: Try to call platform-specific context managers
        case "$platform" in
            salesforce)
                local sf_manager="${CLAUDE_PLUGIN_ROOT:-}/../salesforce-plugin/scripts/lib/org-context-manager.js"
                if [[ -f "$sf_manager" ]] && command -v node &>/dev/null; then
                    local org_alias="${SF_TARGET_ORG:-}"
                    if [[ -n "$org_alias" ]]; then
                        platform_context=$(node "$sf_manager" load "$org_alias" 2>/dev/null || echo '{}')
                    fi
                fi
                ;;
            hubspot)
                local hs_manager="${CLAUDE_PLUGIN_ROOT:-}/../hubspot-plugin/scripts/lib/portal-context-manager.js"
                if [[ -f "$hs_manager" ]] && command -v node &>/dev/null; then
                    local portal_name="${HUBSPOT_PORTAL_NAME:-}"
                    if [[ -n "$portal_name" ]]; then
                        platform_context=$(node "$hs_manager" load "$portal_name" 2>/dev/null || echo '{}')
                    fi
                fi
                ;;
            marketo)
                local mkto_manager="${CLAUDE_PLUGIN_ROOT:-}/../marketo-plugin/scripts/lib/instance-context-manager.js"
                if [[ -f "$mkto_manager" ]] && command -v node &>/dev/null; then
                    local instance="${MARKETO_INSTANCE:-}"
                    if [[ -n "$instance" ]]; then
                        platform_context=$(node "$mkto_manager" load "$instance" 2>/dev/null || echo '{}')
                    fi
                fi
                ;;
        esac
    fi

    echo "$platform_context"
}

# =============================================================================
# Main
# =============================================================================

# Check cache first (unless live-first mode is enabled)
CACHED_CONTEXT=""
if [[ "$LIVE_FIRST" != "true" ]]; then
    CACHED_CONTEXT=$(check_cache || echo "")
    if [[ -n "$CACHED_CONTEXT" ]]; then
        # Export cached context
        export PLATFORM_CONTEXT="$CACHED_CONTEXT"
        export DETECTED_PLATFORM=$(echo "$CACHED_CONTEXT" | jq -r '.platform // "unknown"' 2>/dev/null || echo "unknown")

        # Output for hook system
        echo '{}'
        exit 0
    fi
else
    log_verbose "Live-first mode: skipping cache, loading fresh context"
fi

# Detect platform
PLATFORM=$(detect_current_platform)
log_verbose "Detected platform: $PLATFORM"
export DETECTED_PLATFORM="$PLATFORM"

# Load common context
COMMON_CONTEXT=$(load_common_context)
log_verbose "Common context loaded"

# Load platform-specific context
PLATFORM_CONTEXT_DATA=$(load_platform_context "$PLATFORM" "$COMMON_CONTEXT")
log_verbose "Platform context loaded"

# Merge contexts
UNIFIED_CONTEXT=$(jq -n \
    --arg platform "$PLATFORM" \
    --argjson common "$COMMON_CONTEXT" \
    --argjson platform_data "$PLATFORM_CONTEXT_DATA" \
    '{
        platform: $platform,
        common: $common,
        platformData: $platform_data
    }' 2>/dev/null || echo '{"platform":"'$PLATFORM'","error":"context merge failed"}')

# Save to cache
save_cache "$UNIFIED_CONTEXT"

# Export for agent consumption
export PLATFORM_CONTEXT="$UNIFIED_CONTEXT"

# Show summary
if [[ "$PLATFORM" != "unknown" ]]; then
    log_info "Context loaded for: $PLATFORM"
fi

# Strict mode check
if [[ "$STRICT_MODE" = "1" ]] && [[ "$PLATFORM" = "unknown" ]]; then
    echo '{"error":"No platform context detected","blocked":true}' >&2
    exit 1
fi

# Output empty JSON for hook system (context is in env vars)
echo '{}'
exit 0
