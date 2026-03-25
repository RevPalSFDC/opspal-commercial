#!/usr/bin/env bash

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

if ! command -v jq &>/dev/null; then
    echo "[stop-session-silent-failure-summary] jq not found, skipping" >&2
    exit 0
fi

emit_noop_json() {
    printf '{}\n'
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUNTIME_MONITOR="$SCRIPT_DIR/../scripts/lib/silent-failure/runtime-monitors.js"
POST_ANALYZER="$SCRIPT_DIR/../scripts/lib/silent-failure/post-session-analyzers.js"
METRICS_AGG="$SCRIPT_DIR/../scripts/lib/silent-failure/metrics-aggregator.js"
OVERRIDE_REGISTRY="$SCRIPT_DIR/../scripts/lib/override-registry.js"

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
    emit_noop_json
    exit 0
fi

if ! command -v node &>/dev/null; then
    emit_noop_json
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

if [ -f "$OVERRIDE_REGISTRY" ]; then
    OVERRIDE_SUMMARY=$(node "$OVERRIDE_REGISTRY" read-session --json 2>/dev/null || echo '{}')
    ACTIVE_OVERRIDES=$(echo "$OVERRIDE_SUMMARY" | jq -r '.summary.activeCount // 0' 2>/dev/null || echo "0")
    OVERRIDE_WARNINGS=$(echo "$OVERRIDE_SUMMARY" | jq -r '.summary.warningCount // 0' 2>/dev/null || echo "0")

    if [[ "$ACTIVE_OVERRIDES" =~ ^[0-9]+$ ]] && [ "$ACTIVE_OVERRIDES" -gt 0 ]; then
        log "Session override summary: $(echo "$OVERRIDE_SUMMARY" | jq -r '.summary.logLine // empty' 2>/dev/null || echo "$ACTIVE_OVERRIDES active override(s)")"

        while IFS= read -r override_line; do
            [ -n "$override_line" ] || continue
            log "Override summary detail: $override_line"
        done < <(
            echo "$OVERRIDE_SUMMARY" |
                jq -r '.activeOverrides[]? | "\(.envVar)=\(.currentValue) scope=\(.scope) severity=\(.severity) reason=\(.reason // "none")"' 2>/dev/null ||
                true
        )

        if [[ "$OVERRIDE_WARNINGS" =~ ^[0-9]+$ ]] && [ "$OVERRIDE_WARNINGS" -gt 0 ]; then
            while IFS= read -r warning_line; do
                [ -n "$warning_line" ] || continue
                log "Override summary warning: $warning_line"
            done < <(
                echo "$OVERRIDE_SUMMARY" |
                    jq -r '.warnings[]?.message' 2>/dev/null ||
                    true
            )
        fi
    fi
fi

# Reset runtime monitor for next session
node "$RUNTIME_MONITOR" reset >/dev/null 2>&1 || true

log "Post-session analysis complete"

emit_noop_json
exit 0
