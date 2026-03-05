#!/bin/bash
# =============================================================================
# Salesforce Context Extension
# =============================================================================
#
# Purpose: Load Salesforce-specific context (org alias, quirks, mappings)
# Version: 1.0.0
# Created: 2026-01-09
#
# Called by: base-context-loader.sh
# Input: Common context JSON as $1
# Output: Salesforce context JSON to stdout
#
# =============================================================================

set -euo pipefail

COMMON_CONTEXT="${1:-{}}"

# Find Salesforce plugin root
SF_PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-}/../salesforce-plugin"
if [[ ! -d "$SF_PLUGIN_ROOT" ]]; then
    SF_PLUGIN_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../salesforce-plugin" 2>/dev/null && pwd)" || SF_PLUGIN_ROOT=""
fi

# =============================================================================
# Detect Org Alias
# =============================================================================

detect_org_alias() {
    local alias=""

    # Check environment variable first
    if [[ -n "${SF_TARGET_ORG:-}" ]]; then
        alias="$SF_TARGET_ORG"
    elif [[ -n "${SFDX_DEFAULTUSERNAME:-}" ]]; then
        alias="$SFDX_DEFAULTUSERNAME"
    fi

    # Check sfdx config
    if [[ -z "$alias" ]] && command -v sf &>/dev/null; then
        alias=$(sf config get target-org --json 2>/dev/null | jq -r '.result[0].value // empty' 2>/dev/null || echo "")
    fi

    # Check .sf/config.json
    if [[ -z "$alias" ]] && [[ -f ".sf/config.json" ]]; then
        alias=$(jq -r '."target-org" // empty' .sf/config.json 2>/dev/null || echo "")
    fi

    echo "$alias"
}

# =============================================================================
# Load Org Quirks
# =============================================================================

load_org_quirks() {
    local org_alias="$1"
    local quirks="{}"

    if [[ -z "$org_alias" ]]; then
        echo "$quirks"
        return
    fi

    # Check for quirks file
    local quirks_file="$SF_PLUGIN_ROOT/instances/$org_alias/ORG_QUIRKS.json"
    if [[ -f "$quirks_file" ]]; then
        quirks=$(cat "$quirks_file" 2>/dev/null || echo '{}')
    fi

    # Try org context manager
    local context_manager="$SF_PLUGIN_ROOT/scripts/lib/org-context-manager.js"
    if [[ -f "$context_manager" ]] && command -v node &>/dev/null; then
        local full_context
        full_context=$(node "$context_manager" load "$org_alias" 2>/dev/null || echo '{}')
        if [[ -n "$full_context" ]] && [[ "$full_context" != '{}' ]]; then
            quirks="$full_context"
        fi
    fi

    echo "$quirks"
}

# =============================================================================
# Get Org Info
# =============================================================================

get_org_info() {
    local org_alias="$1"
    local org_info="{}"

    if [[ -z "$org_alias" ]] || ! command -v sf &>/dev/null; then
        echo "$org_info"
        return
    fi

    # Get org display info (cached for performance)
    local cache_file="${TMPDIR:-/tmp}/sf-org-info-${org_alias}.json"
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

    # Fetch fresh org info
    org_info=$(sf org display --target-org "$org_alias" --json 2>/dev/null | jq '{
        username: .result.username,
        orgId: .result.id,
        instanceUrl: .result.instanceUrl,
        orgType: (if .result.isSandbox then "sandbox" else "production" end),
        apiVersion: .result.apiVersion
    }' 2>/dev/null || echo '{}')

    # Cache result
    echo "$org_info" > "$cache_file" 2>/dev/null || true

    echo "$org_info"
}

# =============================================================================
# Main
# =============================================================================

ORG_ALIAS=$(detect_org_alias)
ORG_QUIRKS=$(load_org_quirks "$ORG_ALIAS")
ORG_INFO=$(get_org_info "$ORG_ALIAS")

# Build Salesforce context
jq -n \
    --arg orgAlias "$ORG_ALIAS" \
    --argjson orgInfo "$ORG_INFO" \
    --argjson quirks "$ORG_QUIRKS" \
    --arg pluginRoot "$SF_PLUGIN_ROOT" \
    '{
        orgAlias: $orgAlias,
        orgInfo: $orgInfo,
        quirks: $quirks,
        pluginRoot: $pluginRoot,
        hasContext: ($orgAlias != "")
    }' 2>/dev/null || echo '{"hasContext":false}'
