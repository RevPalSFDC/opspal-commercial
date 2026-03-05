#!/bin/bash

# =============================================================================
# Stop Session Silent Failure Summary Hook
# =============================================================================
#
# Event: Stop
# Timeout: 15000
#
# Purpose: Analyze session for silent failure patterns at session end
#
# Actions:
# - Collect runtime monitor metrics
# - Run post-session pattern analysis
# - Update metrics baseline
# - Generate reflection if patterns detected
#
# Output: Silent (background processing)
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUNTIME_MONITOR="$SCRIPT_DIR/../scripts/lib/silent-failure/runtime-monitors.js"
POST_ANALYZER="$SCRIPT_DIR/../scripts/lib/silent-failure/post-session-analyzers.js"
METRICS_AGG="$SCRIPT_DIR/../scripts/lib/silent-failure/metrics-aggregator.js"

LOG_DIR="${HOME}/.claude/logs"
LOG_FILE="$LOG_DIR/silent-failure-session.log"

# Ensure log directory exists; fall back to project-local logs in restricted environments.
if ! mkdir -p "$LOG_DIR" 2>/dev/null; then
    FALLBACK_ROOT="${CLAUDE_PROJECT_DIR:-$PWD}"
    LOG_DIR="${FALLBACK_ROOT}/.claude/logs"
    LOG_FILE="$LOG_DIR/silent-failure-session.log"
    mkdir -p "$LOG_DIR" 2>/dev/null || true
fi

log() {
    if ! echo "[$(date -Iseconds)] $*" >> "$LOG_FILE" 2>/dev/null; then
        # Logging must never break the hook's core behavior.
        return 0
    fi
}

# Check if scripts exist
if [ ! -f "$RUNTIME_MONITOR" ]; then
    exit 0
fi

if ! command -v node &>/dev/null; then
    exit 0
fi

log "Starting post-session silent failure analysis"

# Get runtime monitor summary
SESSION_DATA=$(node "$RUNTIME_MONITOR" status 2>/dev/null || echo '{}')

# Only analyze if we have meaningful data
SKIP_COUNT=$(echo "$SESSION_DATA" | jq -r '.metrics.validationSkips.totalSkips // 0' 2>/dev/null || echo "0")
FALLBACK_COUNT=$(echo "$SESSION_DATA" | jq -r '.metrics.cache.fallbacks // 0' 2>/dev/null || echo "0")
FAILURE_COUNT=$(echo "$SESSION_DATA" | jq -r '.metrics.hookFailures.totalFailures // 0' 2>/dev/null || echo "0")

TOTAL=$((SKIP_COUNT + FALLBACK_COUNT + FAILURE_COUNT))

if [ "$TOTAL" -gt 0 ]; then
    log "Session had $TOTAL silent failure indicators (skips: $SKIP_COUNT, fallbacks: $FALLBACK_COUNT, failures: $FAILURE_COUNT)"

    # Run post-session analysis
    if [ -f "$POST_ANALYZER" ]; then
        ANALYSIS=$(echo "$SESSION_DATA" | node "$POST_ANALYZER" --stdin 2>/dev/null || echo '{}')

        PATTERNS=$(echo "$ANALYSIS" | jq -r '.patternAnalysis.patternCount // 0' 2>/dev/null || echo "0")
        REFLECTION=$(echo "$ANALYSIS" | jq -r '.summary.reflectionGenerated // false' 2>/dev/null || echo "false")

        log "Analysis complete: $PATTERNS patterns detected, reflection generated: $REFLECTION"
    fi
else
    log "Clean session - no silent failure indicators"
fi

# Reset runtime monitor for next session
node "$RUNTIME_MONITOR" reset 2>/dev/null || true

log "Post-session analysis complete"

exit 0
