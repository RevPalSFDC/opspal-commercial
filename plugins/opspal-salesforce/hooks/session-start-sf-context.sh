#!/usr/bin/env bash
#
# Canonical Salesforce Org Context Hook
#
# Purpose: Single source of truth for SF org detection at session start.
#          Consolidates logic previously split across:
#            - session-start-agent-reminder.sh (org-context-injector.js + temp dirs)
#            - pre-task-context-loader.sh (org-context-detector.js + quirks)
#            - platform-extensions/salesforce.sh (sf org display + org-context-manager.js)
#
# Writes: /tmp/sf-org-context.json (canonical cache, 300s TTL)
# Reads:  org-context-detector.js (5-source resolver with confidence scoring)
#
# Created: 2026-04-01 (O1 optimization — reduce 5x SF detection to 1x)
# Event: SessionStart
# Timeout: 10000ms
#

set -euo pipefail

_TMPDIR="${TMPDIR:-/tmp}"
CACHE_FILE="${_TMPDIR}/sf-org-context.json"

# ---------------------------------------------------------------------------
# Double-execution guard
# If the cache was written <10s ago (by a parallel registration firing twice),
# skip re-detection entirely.
# ---------------------------------------------------------------------------
if [[ -f "$CACHE_FILE" ]]; then
    _cache_age=$(( $(date +%s) - $(stat -c %Y "$CACHE_FILE" 2>/dev/null || stat -f %m "$CACHE_FILE" 2>/dev/null || echo 0) ))
    if [[ $_cache_age -lt 10 ]]; then
        printf '{}\n'
        exit 0
    fi
fi

# ---------------------------------------------------------------------------
# Ensure required temp directories exist (absorbed from session-start-agent-reminder.sh)
# ---------------------------------------------------------------------------
mkdir -p "${_TMPDIR}/salesforce-reports" 2>/dev/null || true
mkdir -p "${_TMPDIR}/sf-cache" 2>/dev/null || true
mkdir -p "${_TMPDIR}/sf-data" 2>/dev/null || true
mkdir -p "${_TMPDIR}/salesforce-sync" 2>/dev/null || true
touch "${_TMPDIR}/salesforce-reports-metrics.json" 2>/dev/null || true

# ---------------------------------------------------------------------------
# Plugin root detection
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Source error handler for lenient mode
if [[ -n "${CLAUDE_PLUGIN_ROOT:-}" ]]; then
    ERROR_HANDLER="${CLAUDE_PLUGIN_ROOT}/opspal-core/hooks/lib/error-handler.sh"
else
    ERROR_HANDLER="${SCRIPT_DIR}/../../opspal-core/hooks/lib/error-handler.sh"
fi
if [[ -f "$ERROR_HANDLER" ]]; then
    source "$ERROR_HANDLER"
    HOOK_NAME="session-start-sf-context"
    set_lenient_mode 2>/dev/null || true
fi

# ---------------------------------------------------------------------------
# Org detection via org-context-detector.js (canonical 5-source resolver)
# ---------------------------------------------------------------------------
DETECTOR_SCRIPT="$PLUGIN_ROOT/scripts/lib/org-context-detector.js"

ORG_DETECTION='{"detected":false}'

if [[ -f "$DETECTOR_SCRIPT" ]] && command -v node &>/dev/null; then
    ORG_DETECTION=$(node "$DETECTOR_SCRIPT" --json 2>/dev/null || echo '{"detected":false,"error":"detector_failed"}')
fi

# Extract org alias
ORG_ALIAS=""
if command -v jq &>/dev/null; then
    ORG_ALIAS=$(echo "$ORG_DETECTION" | jq -r '.org // ""' 2>/dev/null || echo "")
fi

# ---------------------------------------------------------------------------
# Load org quirks (10-path search, preserved from pre-task-context-loader.sh)
# ---------------------------------------------------------------------------
load_org_quirks() {
    local org_alias="$1"
    if [[ -z "$org_alias" ]]; then echo '{}'; return; fi

    local project_base="${CLAUDE_PLUGIN_ROOT:-$(pwd)}"
    if [[ "$project_base" =~ .claude-plugins ]]; then
        project_base="$(cd "$project_base/../.." && pwd)"
    fi

    local org_slug=""
    local platform="salesforce"
    if [[ "$PWD" =~ /orgs/([^/]+)/platforms/([^/]+)/([^/]+) ]]; then
        org_slug="${BASH_REMATCH[1]}"
        platform="${BASH_REMATCH[2]}"
    fi

    local locations=(
        "$PWD/ORG_QUIRKS.json"
        "$PWD/configs/ORG_QUIRKS.json"
        "$PWD/../ORG_QUIRKS.json"
        "$project_base/orgs/$org_slug/platforms/$platform/$org_alias/configs/ORG_QUIRKS.json"
        "$project_base/orgs/$org_slug/platforms/$platform/$org_alias/ORG_QUIRKS.json"
        "$project_base/orgs/$org_alias/platforms/salesforce/production/configs/ORG_QUIRKS.json"
        "$project_base/instances/salesforce/$org_alias/ORG_QUIRKS.json"
        "$project_base/instances/$org_alias/ORG_QUIRKS.json"
        "$PLUGIN_ROOT/instances/$org_alias/ORG_QUIRKS.json"
        "$PLUGIN_ROOT/instances/salesforce/$org_alias/ORG_QUIRKS.json"
    )

    for quirks_file in "${locations[@]}"; do
        if [[ -f "$quirks_file" ]]; then
            cat "$quirks_file" 2>/dev/null || echo '{}'
            return
        fi
    done

    echo '{}'
}

QUIRKS='{}'
if [[ -n "$ORG_ALIAS" ]] && command -v jq &>/dev/null; then
    QUIRKS=$(load_org_quirks "$ORG_ALIAS")
fi

# ---------------------------------------------------------------------------
# Build and write canonical context
# ---------------------------------------------------------------------------
if command -v jq &>/dev/null; then
    CONTEXT=$(jq -n \
        --argjson detection "$ORG_DETECTION" \
        --argjson quirks "$QUIRKS" \
        --arg timestamp "$(date -Iseconds 2>/dev/null || date '+%Y-%m-%dT%H:%M:%S')" \
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
        }')
else
    CONTEXT="$ORG_DETECTION"
fi

# Write canonical cache
echo "$CONTEXT" > "$CACHE_FILE" 2>/dev/null || true

# Export for downstream (still in subshell, but cache is the real transport)
export SF_TARGET_ORG="$ORG_ALIAS"
export SF_ORG_CONTEXT="$CONTEXT"

printf '{}\n'
exit 0
