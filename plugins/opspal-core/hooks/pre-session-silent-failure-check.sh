#!/usr/bin/env bash

# =============================================================================
# Pre-Session Silent Failure Check Hook
# =============================================================================
#
# Event: SessionStart
# Timeout: 10000
#
# Purpose: Detect silent failure conditions BEFORE a session begins
#
# Checks:
# - Dangerous environment variables (SKIP_VALIDATION, etc.)
# - Open circuit breakers (hooks being skipped)
# - Stale cached data
# - Missing critical packages
# - Environment leakage between sessions
#
# Output: JSON with systemMessage for critical issues
# =============================================================================

set -euo pipefail

if ! command -v jq &>/dev/null; then
    echo "[pre-session-silent-failure-check] jq not found, skipping" >&2
    exit 0
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DETECTOR="$SCRIPT_DIR/../scripts/lib/silent-failure-detector.js"
OVERRIDE_REGISTRY="$SCRIPT_DIR/../scripts/lib/override-registry.js"
DEFAULT_RESULT='{"passed":true,"totalViolations":0,"criticalCount":0}'
LOG_DIR="${HOME}/.claude/logs"
LOG_FILE="$LOG_DIR/silent-failure-session.log"

if ! mkdir -p "$LOG_DIR" 2>/dev/null; then
    FALLBACK_ROOT="${CLAUDE_PROJECT_DIR:-$PWD}"
    LOG_DIR="${FALLBACK_ROOT}/.claude/logs"
    LOG_FILE="$LOG_DIR/silent-failure-session.log"
    mkdir -p "$LOG_DIR" 2>/dev/null || true
fi

log() {
    if ! echo "[$(date -Iseconds)] $*" >> "$LOG_FILE" 2>/dev/null; then
        return 0
    fi
}

# Check if detector script exists
if [ ! -f "$DETECTOR" ]; then
    # Silent exit - detector not installed
    exit 0
fi

# Check if node is available
if ! command -v node &>/dev/null; then
    exit 0
fi

if [ -f "$OVERRIDE_REGISTRY" ]; then
    OVERRIDE_AUDIT=$(node "$OVERRIDE_REGISTRY" record --json 2>/dev/null || printf '{}')

    if printf '%s' "$OVERRIDE_AUDIT" | jq -e . >/dev/null 2>&1; then
        ACTIVE_OVERRIDES="$(printf '%s' "$OVERRIDE_AUDIT" | jq -r '.summary.activeCount // 0' 2>/dev/null || printf '0')"
        ACTIVE_WARNINGS="$(printf '%s' "$OVERRIDE_AUDIT" | jq -r '.summary.warningCount // 0' 2>/dev/null || printf '0')"
        OVERRIDE_LOG_LINE="$(printf '%s' "$OVERRIDE_AUDIT" | jq -r '.summary.logLine // empty' 2>/dev/null || printf '')"

        if [[ "$ACTIVE_OVERRIDES" =~ ^[0-9]+$ ]] && [ "$ACTIVE_OVERRIDES" -gt 0 ]; then
            log "Session override audit: ${OVERRIDE_LOG_LINE:-$ACTIVE_OVERRIDES active override(s)}"

            while IFS= read -r override_line; do
                [ -n "$override_line" ] || continue
                log "Active override: $override_line"
            done < <(
                printf '%s' "$OVERRIDE_AUDIT" |
                    jq -r '.activeOverrides[]? | "\(.envVar)=\(.currentValue) scope=\(.scope) severity=\(.severity) reason=\(.reason // "none")"' 2>/dev/null ||
                    true
            )

            if [[ "$ACTIVE_WARNINGS" =~ ^[0-9]+$ ]] && [ "$ACTIVE_WARNINGS" -gt 0 ]; then
                while IFS= read -r warning_line; do
                    [ -n "$warning_line" ] || continue
                    log "Override warning: $warning_line"
                done < <(
                    printf '%s' "$OVERRIDE_AUDIT" |
                        jq -r '.warnings[]?.message' 2>/dev/null ||
                        true
                )
            fi
        fi
    fi
fi

# Run pre-session checks
RESULT="$DEFAULT_RESULT"
set +e
DETECTOR_OUTPUT=$(node "$DETECTOR" pre-session --json 2>/dev/null)
set -e

if [ -n "$DETECTOR_OUTPUT" ] && printf '%s' "$DETECTOR_OUTPUT" | jq -e . >/dev/null 2>&1; then
    RESULT="$DETECTOR_OUTPUT"
fi

# Extract key values
VIOLATIONS="$(printf '%s' "$RESULT" | jq -r '.totalViolations // 0' 2>/dev/null || printf '0')"
CRITICAL="$(printf '%s' "$RESULT" | jq -r '.criticalCount // 0' 2>/dev/null || printf '0')"

if ! [[ "$VIOLATIONS" =~ ^[0-9]+$ ]]; then
    VIOLATIONS=0
fi

if ! [[ "$CRITICAL" =~ ^[0-9]+$ ]]; then
    CRITICAL=0
fi

# Output system message for critical issues
if [ "$CRITICAL" -gt 0 ]; then
    # Extract critical summary
    SUMMARY="$(printf '%s' "$RESULT" | jq -r '.criticalSummary // "Critical silent failure conditions detected"' 2>/dev/null || printf 'Critical silent failure conditions detected')"

    # Output JSON for Claude
    echo "{\"systemMessage\":\"⚠️ SILENT FAILURE WARNING: $SUMMARY\",\"violations\":$VIOLATIONS,\"critical\":$CRITICAL}"
elif [ "$VIOLATIONS" -gt 0 ]; then
    # Non-critical issues - log only, don't inject into session context.
    # The /silent-failure-check command is always available on demand.
    # Set SILENT_FAILURE_VERBOSE=1 to surface non-critical risks at startup.
    log "Non-critical: $VIOLATIONS silent failure risk(s) detected"
    if [[ "${SILENT_FAILURE_VERBOSE:-0}" == "1" ]]; then
        echo "{\"systemMessage\":\"ℹ️ $VIOLATIONS silent failure risk(s) detected. Run /silent-failure-check for details.\"}"
    fi
fi

# Exit codes:
# 0 - Success (always allow session to continue)
exit 0
