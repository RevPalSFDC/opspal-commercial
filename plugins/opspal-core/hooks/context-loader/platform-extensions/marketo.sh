#!/bin/bash
# =============================================================================
# Marketo Context Extension
# =============================================================================
#
# Purpose: Load Marketo-specific context (instance, client ID, quirks)
# Version: 1.0.0
# Created: 2026-01-09
#
# Called by: base-context-loader.sh
# Input: Common context JSON as $1
# Output: Marketo context JSON to stdout
#
# =============================================================================

set -euo pipefail

COMMON_CONTEXT="${1:-{}}"

# Find Marketo plugin root
MKTO_PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-}/../marketo-plugin"
if [[ ! -d "$MKTO_PLUGIN_ROOT" ]]; then
    MKTO_PLUGIN_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../marketo-plugin" 2>/dev/null && pwd)" || MKTO_PLUGIN_ROOT=""
fi

# =============================================================================
# Detect Instance
# =============================================================================

detect_instance() {
    local instance=""
    local munchkin_id=""

    # Check environment variables first
    if [[ -n "${MARKETO_INSTANCE:-}" ]]; then
        instance="$MARKETO_INSTANCE"
    fi

    if [[ -n "${MARKETO_MUNCHKIN_ID:-}" ]]; then
        munchkin_id="$MARKETO_MUNCHKIN_ID"
    fi

    if [[ -n "${MARKETO_CLIENT_ID:-}" ]] && [[ -z "$instance" ]]; then
        # Client ID often includes instance info
        instance="${MARKETO_CLIENT_ID}"
    fi

    # Check .marketo-instance file
    if [[ -z "$instance" ]] && [[ -f ".marketo-instance" ]]; then
        instance=$(cat ".marketo-instance" 2>/dev/null || echo "")
    fi

    # Check .current-instance file
    if [[ -z "$instance" ]] && [[ -f ".current-instance" ]]; then
        instance=$(cat ".current-instance" 2>/dev/null || echo "")
    fi

    echo "${instance:-}|${munchkin_id:-}"
}

# =============================================================================
# Load Instance Quirks
# =============================================================================

load_instance_quirks() {
    local instance="$1"
    local quirks="{}"

    if [[ -z "$instance" ]]; then
        echo "$quirks"
        return
    fi

    # Check for quirks file
    local quirks_file="$MKTO_PLUGIN_ROOT/instances/$instance/INSTANCE_QUIRKS.json"
    if [[ -f "$quirks_file" ]]; then
        quirks=$(cat "$quirks_file" 2>/dev/null || echo '{}')
    fi

    # Try instance context manager
    local context_manager="$MKTO_PLUGIN_ROOT/scripts/lib/instance-context-manager.js"
    if [[ -f "$context_manager" ]] && command -v node &>/dev/null; then
        local full_context
        full_context=$(node "$context_manager" load "$instance" 2>/dev/null || echo '{}')
        if [[ -n "$full_context" ]] && [[ "$full_context" != '{}' ]]; then
            quirks="$full_context"
        fi
    fi

    echo "$quirks"
}

# =============================================================================
# Get Instance Info
# =============================================================================

get_instance_info() {
    local instance="$1"
    local instance_info="{}"

    if [[ -z "$instance" ]]; then
        echo "$instance_info"
        return
    fi

    # Check for cached instance info
    local cache_file="${TMPDIR:-/tmp}/mkto-instance-info-${instance}.json"
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

    # For Marketo, return basic structure
    instance_info=$(jq -n \
        --arg instance "$instance" \
        '{
            instance: $instance,
            instanceType: "unknown"
        }' 2>/dev/null || echo '{}')

    echo "$instance_info"
}

# =============================================================================
# Main
# =============================================================================

INSTANCE_DETECTION=$(detect_instance)
INSTANCE=$(echo "$INSTANCE_DETECTION" | cut -d'|' -f1)
MUNCHKIN_ID=$(echo "$INSTANCE_DETECTION" | cut -d'|' -f2)

INSTANCE_QUIRKS=$(load_instance_quirks "$INSTANCE")
INSTANCE_INFO=$(get_instance_info "$INSTANCE")

# Build Marketo context
jq -n \
    --arg instance "$INSTANCE" \
    --arg munchkinId "$MUNCHKIN_ID" \
    --argjson instanceInfo "$INSTANCE_INFO" \
    --argjson quirks "$INSTANCE_QUIRKS" \
    --arg pluginRoot "$MKTO_PLUGIN_ROOT" \
    '{
        instance: $instance,
        munchkinId: $munchkinId,
        instanceInfo: $instanceInfo,
        quirks: $quirks,
        pluginRoot: $pluginRoot,
        hasContext: ($instance != "" or $munchkinId != "")
    }' 2>/dev/null || echo '{"hasContext":false}'
