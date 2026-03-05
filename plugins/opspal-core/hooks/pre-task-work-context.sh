#!/bin/bash
#
# Pre-Task Work Context Hook
#
# Purpose: Load client work history at session start when ORG_SLUG is set.
#          Displays recent work, in-progress items, and pending follow-ups
#          to provide project memory context.
#
# Behavior:
#   1. Checks if ORG_SLUG environment variable is set
#   2. Loads recent work from WORK_INDEX.yaml
#   3. Displays context summary (recent, in-progress, follow-ups)
#   4. Non-blocking - always allows task to proceed
#
# Configuration:
#   WORK_CONTEXT_ENABLED=1    - Enable/disable context loading (default: 1)
#   WORK_CONTEXT_VERBOSE=1    - Show detailed output (default: 0)
#   WORK_CONTEXT_LIMIT=5      - Number of recent items to show (default: 5)
#
# Environment Variables Used:
#   ORG_SLUG                  - Organization identifier (required)
#   CLIENT_ORG                - Fallback org identifier
#   SF_TARGET_ORG             - Fallback from Salesforce context
#
# Version: 1.0.0
# Date: 2026-01-29
#

set -euo pipefail

# Plugin root detection - multiple strategies for robustness
# Strategy 1: Use CLAUDE_PLUGIN_ROOT if set by Claude Code
# Strategy 2: Use known plugin path relative to CWD (hooks run from repo root)
# Strategy 3: Fall back to $0-based detection

PLUGIN_ROOT=""
DEBUG="${WORK_CONTEXT_DEBUG:-0}"

# Debug output helper (returns 0 to not fail with set -e)
debug_log() {
    [ "$DEBUG" = "1" ] && echo "[DEBUG] $1" >&2 || true
}

debug_log "pwd=$(pwd)"

# Plugin root detection - ALWAYS validate file exists before trusting any path
# Strategy order prioritizes actual file existence over environment variables

# Strategy 1: Known path from repo root (hooks run with CWD = repo root)
if [ -f "$(pwd)/plugins/opspal-core/scripts/lib/work-index-manager.js" ]; then
    PLUGIN_ROOT="$(pwd)/plugins/opspal-core"
    debug_log "Using Strategy 1: Known path from repo root"
# Strategy 2: Check .claude-plugins symlink
elif [ -f "$(pwd)/.claude-plugins/opspal-core/scripts/lib/work-index-manager.js" ]; then
    PLUGIN_ROOT="$(pwd)/.claude-plugins/opspal-core"
    debug_log "Using Strategy 2: .claude-plugins symlink"
# Strategy 3: CLAUDE_PLUGIN_ROOT env var (only if manager script exists there)
elif [ -n "${CLAUDE_PLUGIN_ROOT:-}" ] && [ -f "${CLAUDE_PLUGIN_ROOT}/scripts/lib/work-index-manager.js" ]; then
    PLUGIN_ROOT="$CLAUDE_PLUGIN_ROOT"
    debug_log "Using Strategy 3: CLAUDE_PLUGIN_ROOT"
# Strategy 4: Fall back to $0-based detection
else
    debug_log "Using Strategy 4: \$0-based fallback"
    if [ -n "${BASH_SOURCE[0]:-}" ] && [ "${BASH_SOURCE[0]:-}" != "$0" ]; then
        SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
        debug_log "SCRIPT_DIR from BASH_SOURCE: $SCRIPT_DIR"
    else
        SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
        debug_log "SCRIPT_DIR from \$0: $SCRIPT_DIR"
    fi
    PLUGIN_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
fi

debug_log "Final PLUGIN_ROOT=$PLUGIN_ROOT"

# Configuration
ENABLED="${WORK_CONTEXT_ENABLED:-1}"
VERBOSE="${WORK_CONTEXT_VERBOSE:-0}"
LIMIT="${WORK_CONTEXT_LIMIT:-5}"

# Live-first mode: Add staleness warnings for work context
# Controlled by GLOBAL_LIVE_FIRST or WORK_CONTEXT_LIVE_FIRST env vars
# Default: true (shows staleness warnings)
LIVE_FIRST="${WORK_CONTEXT_LIVE_FIRST:-${GLOBAL_LIVE_FIRST:-true}}"
WORK_INDEX_STALE_DAYS="${WORK_INDEX_STALE_DAYS:-7}"

# Early exit if disabled
if [ "$ENABLED" != "1" ]; then
    exit 0
fi

# Determine org slug from various sources
ORG=""
if [ -n "${ORG_SLUG:-}" ]; then
    ORG="$ORG_SLUG"
elif [ -n "${CLIENT_ORG:-}" ]; then
    ORG="$CLIENT_ORG"
elif [ -n "${SF_TARGET_ORG:-}" ]; then
    ORG="$SF_TARGET_ORG"
fi

# Exit silently if no org context
if [ -z "$ORG" ]; then
    [ "$VERBOSE" = "1" ] && echo "[work-context] No ORG_SLUG set, skipping" >&2
    exit 0
fi

# Path to work-index-manager
MANAGER_SCRIPT="$PLUGIN_ROOT/scripts/lib/work-index-manager.js"

# Check if manager script exists
if [ ! -f "$MANAGER_SCRIPT" ]; then
    [ "$VERBOSE" = "1" ] && echo "[work-context] Manager script not found: $MANAGER_SCRIPT" >&2
    exit 0
fi

# Check if node is available
if ! command -v node &> /dev/null; then
    [ "$VERBOSE" = "1" ] && echo "[work-context] Node.js not available" >&2
    exit 0
fi

# Check WORK_INDEX.yaml staleness in live-first mode
WORK_INDEX_FILE="orgs/$ORG/WORK_INDEX.yaml"
STALENESS_WARNING=""
if [ "$LIVE_FIRST" = "1" ] || [ "$LIVE_FIRST" = "true" ]; then
    if [ -f "$WORK_INDEX_FILE" ]; then
        INDEX_TIME=$(stat -c %Y "$WORK_INDEX_FILE" 2>/dev/null || stat -f %m "$WORK_INDEX_FILE" 2>/dev/null || echo 0)
        NOW=$(date +%s)
        INDEX_AGE_DAYS=$(( (NOW - INDEX_TIME) / 86400 ))

        if [ "$INDEX_AGE_DAYS" -gt "$WORK_INDEX_STALE_DAYS" ]; then
            STALENESS_WARNING="⚠️  Work index last updated ${INDEX_AGE_DAYS} days ago (threshold: ${WORK_INDEX_STALE_DAYS} days)"
        fi
    fi
fi

# Get context from manager
CONTEXT_OUTPUT=""
if CONTEXT_OUTPUT=$(node "$MANAGER_SCRIPT" context "$ORG" 2>/dev/null); then
    # Check if there's any content to show
    if [ -n "$CONTEXT_OUTPUT" ] && [ "$CONTEXT_OUTPUT" != "No work history found for this org." ]; then
        echo ""
        echo "======================================================================"
        echo "PROJECT MEMORY: $ORG"
        echo "======================================================================"
        if [ -n "$STALENESS_WARNING" ]; then
            echo "$STALENESS_WARNING"
            echo "----------------------------------------------------------------------"
        fi
        echo ""
        echo "$CONTEXT_OUTPUT"
        echo ""
        echo "----------------------------------------------------------------------"
        echo "Use '/work-index list $ORG' for full history"
        echo "======================================================================"
        echo ""
    elif [ "$VERBOSE" = "1" ]; then
        echo "[work-context] No work history for $ORG" >&2
    fi
else
    [ "$VERBOSE" = "1" ] && echo "[work-context] Failed to load context for $ORG" >&2
fi

# Always exit successfully - context loading is informational
exit 0
