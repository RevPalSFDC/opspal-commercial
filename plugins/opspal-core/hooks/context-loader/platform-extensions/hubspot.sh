#!/bin/bash
# =============================================================================
# HubSpot Context Extension
# =============================================================================
#
# Purpose: Load HubSpot-specific context (portal ID, name, quirks)
# Version: 1.0.0
# Created: 2026-01-09
#
# Called by: base-context-loader.sh
# Input: Common context JSON as $1
# Output: HubSpot context JSON to stdout
#
# =============================================================================

set -euo pipefail

COMMON_CONTEXT="${1:-{}}"

# Find HubSpot plugin root
HS_PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-}/../hubspot-plugin"
if [[ ! -d "$HS_PLUGIN_ROOT" ]]; then
    HS_PLUGIN_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../hubspot-plugin" 2>/dev/null && pwd)" || HS_PLUGIN_ROOT=""
fi

# =============================================================================
# Detect Portal
# =============================================================================

detect_portal() {
    local portal_id=""
    local portal_name=""

    # Check environment variables first
    if [[ -n "${HUBSPOT_PORTAL_ID:-}" ]]; then
        portal_id="$HUBSPOT_PORTAL_ID"
    fi

    if [[ -n "${HUBSPOT_PORTAL_NAME:-}" ]]; then
        portal_name="$HUBSPOT_PORTAL_NAME"
    fi

    # Check .current-portal file
    if [[ -z "$portal_name" ]] && [[ -f ".current-portal" ]]; then
        portal_name=$(cat ".current-portal" 2>/dev/null || echo "")
    fi

    # Check .hubspot-portal file
    if [[ -z "$portal_id" ]] && [[ -f ".hubspot-portal" ]]; then
        portal_id=$(cat ".hubspot-portal" 2>/dev/null || echo "")
    fi

    # Check hubspot.config.yml
    if [[ -z "$portal_id" ]] && [[ -f "hubspot.config.yml" ]]; then
        portal_id=$(grep -E "^portalId:" hubspot.config.yml 2>/dev/null | sed 's/portalId: *//' | head -1 || echo "")
    fi

    echo "${portal_id:-}|${portal_name:-}"
}

# =============================================================================
# Load Portal Quirks
# =============================================================================

load_portal_quirks() {
    local portal_name="$1"
    local quirks="{}"

    if [[ -z "$portal_name" ]]; then
        echo "$quirks"
        return
    fi

    # Check for quirks file
    local quirks_file="$HS_PLUGIN_ROOT/portals/$portal_name/PORTAL_QUIRKS.json"
    if [[ -f "$quirks_file" ]]; then
        quirks=$(cat "$quirks_file" 2>/dev/null || echo '{}')
    fi

    # Try portal context manager
    local context_manager="$HS_PLUGIN_ROOT/scripts/lib/portal-context-manager.js"
    if [[ -f "$context_manager" ]] && command -v node &>/dev/null; then
        local full_context
        full_context=$(node "$context_manager" load "$portal_name" 2>/dev/null || echo '{}')
        if [[ -n "$full_context" ]] && [[ "$full_context" != '{}' ]]; then
            quirks="$full_context"
        fi
    fi

    echo "$quirks"
}

# =============================================================================
# Get Portal Info
# =============================================================================

get_portal_info() {
    local portal_id="$1"
    local portal_info="{}"

    if [[ -z "$portal_id" ]]; then
        echo "$portal_info"
        return
    fi

    # Check for cached portal info
    local cache_file="${TMPDIR:-/tmp}/hs-portal-info-${portal_id}.json"
    local cache_ttl=3600  # 1 hour

    if [[ -f "$cache_file" ]]; then
        local cache_time now age
        cache_time=$(stat -c %Y "$cache_file" 2>/dev/null || stat -f %m "$cache_file" 2>/dev/null || echo 0)
        now=$(date +%s)
        age=$((now - cache_time))

        if [[ "$age" -lt "$cache_ttl" ]]; then
            cat "$cache_file"
            return
        fi
    fi

    # For HubSpot, we need API access to get portal details
    # This would typically be done via MCP or direct API call
    # For now, return basic structure
    portal_info=$(jq -n \
        --arg portalId "$portal_id" \
        '{
            portalId: $portalId,
            portalType: "unknown"
        }' 2>/dev/null || echo '{}')

    echo "$portal_info"
}

# =============================================================================
# Main
# =============================================================================

PORTAL_DETECTION=$(detect_portal)
PORTAL_ID=$(echo "$PORTAL_DETECTION" | cut -d'|' -f1)
PORTAL_NAME=$(echo "$PORTAL_DETECTION" | cut -d'|' -f2)

PORTAL_QUIRKS=$(load_portal_quirks "$PORTAL_NAME")
PORTAL_INFO=$(get_portal_info "$PORTAL_ID")

# Build HubSpot context
jq -n \
    --arg portalId "$PORTAL_ID" \
    --arg portalName "$PORTAL_NAME" \
    --argjson portalInfo "$PORTAL_INFO" \
    --argjson quirks "$PORTAL_QUIRKS" \
    --arg pluginRoot "$HS_PLUGIN_ROOT" \
    '{
        portalId: $portalId,
        portalName: $portalName,
        portalInfo: $portalInfo,
        quirks: $quirks,
        pluginRoot: $pluginRoot,
        hasContext: ($portalId != "" or $portalName != "")
    }' 2>/dev/null || echo '{"hasContext":false}'
