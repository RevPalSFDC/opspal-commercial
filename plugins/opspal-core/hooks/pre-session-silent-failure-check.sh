#!/bin/bash

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

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DETECTOR="$SCRIPT_DIR/../scripts/lib/silent-failure-detector.js"
DEFAULT_RESULT='{"passed":true,"totalViolations":0,"criticalCount":0}'

# Check if detector script exists
if [ ! -f "$DETECTOR" ]; then
    # Silent exit - detector not installed
    exit 0
fi

# Check if node is available
if ! command -v node &>/dev/null; then
    exit 0
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
    # Non-critical issues - informational message
    echo "{\"systemMessage\":\"ℹ️ $VIOLATIONS silent failure risk(s) detected. Run /silent-failure-check for details.\"}"
fi

# Exit codes:
# 0 - Success (always allow session to continue)
exit 0
