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
RESULT=$(node "$DETECTOR" pre-session --json 2>/dev/null || echo '{"passed":true}')

# Extract key values
VIOLATIONS=$(echo "$RESULT" | jq -r '.totalViolations // 0' 2>/dev/null || echo "0")
CRITICAL=$(echo "$RESULT" | jq -r '.criticalCount // 0' 2>/dev/null || echo "0")

# Output system message for critical issues
if [ "$CRITICAL" -gt 0 ]; then
    # Extract critical summary
    SUMMARY=$(echo "$RESULT" | jq -r '.criticalSummary // "Critical silent failure conditions detected"' 2>/dev/null)

    # Output JSON for Claude
    echo "{\"systemMessage\":\"⚠️ SILENT FAILURE WARNING: $SUMMARY\",\"violations\":$VIOLATIONS,\"critical\":$CRITICAL}"
elif [ "$VIOLATIONS" -gt 0 ]; then
    # Non-critical issues - informational message
    echo "{\"systemMessage\":\"ℹ️ $VIOLATIONS silent failure risk(s) detected. Run /silent-failure-check for details.\"}"
fi

# Exit codes:
# 0 - Success (always allow session to continue)
exit 0
