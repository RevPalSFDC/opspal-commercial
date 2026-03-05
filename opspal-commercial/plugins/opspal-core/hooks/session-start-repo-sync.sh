#!/bin/bash
# =============================================================================
# Session Start Repository Sync Hook
# =============================================================================
#
# Purpose: Auto-pull project-connected repos at session start.
#   Uses project-connect-sync-all.sh to fetch+pull any orgs with
#   .sync-manifest.json. Silent when everything is up to date.
#   Warns via systemMessage only if errors occur.
#
# Event: SessionStart
# Timeout: 10000ms
# Opt-out: ENABLE_GIT_SYNC=0
# Version: 1.0.0
#
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(dirname "$SCRIPT_DIR")"
SYNC_SCRIPT="$PLUGIN_ROOT/scripts/project-connect-sync-all.sh"

# Opt-out via env var (same var the sync script checks)
if [[ "${ENABLE_GIT_SYNC:-1}" == "0" ]]; then
    exit 0
fi

# Skip if sync script doesn't exist
if [[ ! -f "$SYNC_SCRIPT" ]]; then
    exit 0
fi

# Detect workspace root (need orgs/ directory with sync manifests)
WORKSPACE_ROOT=""
if [[ -d "$PWD/orgs" ]]; then
    WORKSPACE_ROOT="$PWD"
else
    TOPLEVEL="$(git rev-parse --show-toplevel 2>/dev/null || true)"
    if [[ -n "$TOPLEVEL" ]] && [[ -d "$TOPLEVEL/orgs" ]]; then
        WORKSPACE_ROOT="$TOPLEVEL"
    fi
fi

if [[ -z "$WORKSPACE_ROOT" ]]; then
    exit 0  # No orgs to sync
fi

# Check if any .sync-manifest.json files exist (no manifests = no connected repos)
MANIFEST="$(find "$WORKSPACE_ROOT/orgs" -maxdepth 2 -name ".sync-manifest.json" 2>/dev/null | head -1)"
if [[ -z "$MANIFEST" ]]; then
    exit 0
fi

# Run sync with --pull --quiet, 8s timeout (leaving 2s buffer for 10s hook timeout)
RESULT=$(timeout 8 bash "$SYNC_SCRIPT" --pull --quiet --workspace "$WORKSPACE_ROOT" 2>/dev/null) || exit 0

# Parse result for synced count and errors
SYNCED=$(echo "$RESULT" | grep -o '"synced":[0-9]*' | grep -o '[0-9]*' || echo "0")
ERRORS=$(echo "$RESULT" | grep -o '"errors":\[.*\]' || echo "")

# Only output a systemMessage if there were sync errors
if [[ -n "$ERRORS" ]] && [[ "$ERRORS" != '"errors":[]' ]]; then
    echo "{\"systemMessage\":\"Project-Connect: sync completed ($SYNCED repos) with warnings. Check ~/.claude/logs/project-connect-sync.jsonl\"}"
fi

exit 0
