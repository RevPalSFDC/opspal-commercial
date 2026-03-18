#!/usr/bin/env bash
# =============================================================================
# Session End Reliability Hook
#
# Automatically runs reliability checks at the end of each session:
# 1. Retry any failed reflection submissions
# 2. Refresh skill data if stale
# 3. Trigger processreflections if threshold reached
# 4. Self-heal any corrupt files
#
# This minimizes human intervention needed to keep the reflection system healthy.
#
# Version: 1.1.0
# =============================================================================

set -o pipefail

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Always resolve plugin root from script location, not CLAUDE_PLUGIN_ROOT
# (CLAUDE_PLUGIN_ROOT may point to workspace root for settings.json hooks)
PLUGIN_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Configuration
ENABLE_AUTO_RELIABILITY="${ENABLE_AUTO_RELIABILITY:-1}"
VERBOSE="${RELIABILITY_VERBOSE:-0}"

# Logging (all to stderr, never stdout)
log() {
    local level="$1"
    shift
    if [[ "$VERBOSE" == "1" ]] || [[ "$level" == "ERROR" ]]; then
        echo "[SessionEndReliability] [$level] $*" >&2
    fi
}

# Check if auto-reliability is enabled
if [[ "$ENABLE_AUTO_RELIABILITY" != "1" ]]; then
    log "INFO" "Auto-reliability disabled (ENABLE_AUTO_RELIABILITY=0)"
    exit 0
fi

# Check for node
if ! command -v node &> /dev/null; then
    log "WARN" "Node.js not available - skipping reliability checks"
    exit 0
fi

# Find reliability manager script
RELIABILITY_SCRIPT="$PLUGIN_ROOT/scripts/lib/reflection-reliability-manager.js"

if [[ ! -f "$RELIABILITY_SCRIPT" ]]; then
    log "WARN" "Reliability manager not found at $RELIABILITY_SCRIPT"
    exit 0
fi

# Run reliability checks in background (non-blocking)
log "INFO" "Running reliability checks..."

(
    # Run with timeout to prevent hanging
    timeout 60 node "$RELIABILITY_SCRIPT" run 2>/dev/null || {
        log "WARN" "Reliability checks timed out or failed"
    }
) &

# Don't wait - let it run in background
disown

log "INFO" "Reliability checks started in background"

# Stop hooks: output nothing to allow stop, exit 0
exit 0
