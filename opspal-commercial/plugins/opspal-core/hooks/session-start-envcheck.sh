#!/bin/bash
# =============================================================================
# Session Start Environment Check Hook
# =============================================================================
#
# Purpose: Fast environment preflight check at session start.
#   Reports issues (expired tokens, missing deps) as systemMessage.
#   Silent when everything passes. Never blocks session start.
#
# Event: SessionStart
# Timeout: 5000ms
# Version: 1.0.0
#
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(dirname "$SCRIPT_DIR")"
PREFLIGHT_SCRIPT="$PLUGIN_ROOT/scripts/lib/envcheck/session-preflight.js"

# Skip if explicitly disabled
if [[ "${SKIP_ENVCHECK:-0}" == "1" ]]; then
    exit 0
fi

# Skip if script doesn't exist
if [[ ! -f "$PREFLIGHT_SCRIPT" ]]; then
    exit 0
fi

# Run preflight with 4s timeout (leaving 1s buffer for the 5s hook timeout)
# If it times out or errors, silently exit (never block session start)
timeout 4 node "$PREFLIGHT_SCRIPT" 2>/dev/null || exit 0
