#!/usr/bin/env bash
# =============================================================================
# Salesforce Context Extension (Cache-Reader)
# =============================================================================
#
# Purpose: Read Salesforce context from canonical cache written by
#          opspal-salesforce/hooks/session-start-sf-context.sh
#
# Rewritten: 2026-04-01 (O2 optimization + O9 TTL standardization)
# Previously: Independently called sf org display, sf config get target-org,
#             and node org-context-manager.js — duplicating the detection done
#             by opspal-salesforce's session-start hooks.
#
# Now: Pure cache-reader with bounded wait. No SF CLI calls, no Node.js spawns.
#
# Called by: base-context-loader.sh
# Input: Common context JSON as $1
# Output: Salesforce context JSON to stdout
#
# =============================================================================

set -euo pipefail

if ! command -v jq &>/dev/null; then
    echo '{"hasContext":false}'
    exit 0
fi

_cache="${TMPDIR:-/tmp}/sf-org-context.json"
_ttl="${SF_CONTEXT_CACHE_TTL:-300}"

# ---------------------------------------------------------------------------
# Bounded wait for canonical hook to write cache
# The opspal-salesforce SessionStart hook fires in parallel with the dispatcher
# chain that calls base-context-loader.sh. Wait up to 2s for the cache to appear.
# ---------------------------------------------------------------------------
_waited=0
while [[ ! -f "$_cache" ]] && [[ $_waited -lt 20 ]]; do
    sleep 0.1
    (( _waited++ )) || true
done

if [[ -f "$_cache" ]]; then
    _cache_time=$(stat -c %Y "$_cache" 2>/dev/null || stat -f %m "$_cache" 2>/dev/null || echo 0)
    _now=$(date +%s)
    _age=$(( _now - _cache_time ))

    if [[ $_age -lt $_ttl ]]; then
        _src=$(cat "$_cache" 2>/dev/null || echo '{}')

        # Reshape to the format base-context-loader.sh expects
        jq -n --argjson s "$_src" '{
            orgAlias: ($s.orgContext.org // ""),
            orgInfo: ($s.orgContext // {}),
            quirks: ($s.quirks // {}),
            pluginRoot: "",
            hasContext: ($s.orgContext.detected // false)
        }' 2>/dev/null || echo '{"hasContext":false}'
        exit 0
    fi
fi

# No valid cache — return minimal context
# (Full detection is handled by opspal-salesforce session-start-sf-context.sh)
echo '{"hasContext":false,"source":"no-cache"}'
