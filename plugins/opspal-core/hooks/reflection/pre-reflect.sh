#!/usr/bin/env bash
set -euo pipefail
# =============================================================================
# Pre-Reflect Hook (Unified)
# =============================================================================
#
# Purpose: Automatically submit pending reflections before generating new one
# Version: 2.0.0 (Consolidated from Salesforce/HubSpot duplicates)
# Created: 2026-01-09
#
# Triggered: Before /reflect command starts
# Behavior: Catch and submit any reflections that failed to submit previously
#
# Requirements:
#   - SUPABASE_URL/SUPABASE_ANON_KEY (for submission)
#   - Node.js (for batch submit script)
#
# Environment Variables (Optional):
#   BATCH_SUBMIT_VERBOSE=1    - Show detailed output
#   BATCH_SUBMIT_THOROUGH=1   - Search all locations (slower but more thorough)
#   BATCH_SUBMIT_MAX_AGE=N    - Only submit reflections newer than N days
#
# Exit Codes:
#   0 - Always (non-fatal errors to avoid breaking /reflect command)
#
# =============================================================================

# Source standardized error handler
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Always calculate from SCRIPT_DIR - CLAUDE_PLUGIN_ROOT may point to workspace root
PLUGIN_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

ERROR_HANDLER="$PLUGIN_ROOT/hooks/lib/error-handler.sh"
if [[ -f "$ERROR_HANDLER" ]]; then
    source "$ERROR_HANDLER"
    HOOK_NAME="pre-reflect"
    set_lenient_mode 2>/dev/null || true
else
    set +e  # Don't exit on errors (non-fatal hook)
fi

# Colors for output (fallback if error handler not loaded)
GREEN="${GREEN:-\033[0;32m}"
YELLOW="${YELLOW:-\033[1;33m}"
CYAN="${CYAN:-\033[0;36m}"
NC="${NC:-\033[0m}"

# =============================================================================
# MAIN EXECUTION
# =============================================================================

# Find batch submit script - check multiple locations
BATCH_SCRIPT=""
BATCH_LOCATIONS=(
    "$PLUGIN_ROOT/scripts/lib/batch-submit-reflections.js"
    "${CLAUDE_PLUGIN_ROOT:-}/../opspal-salesforce/scripts/lib/batch-submit-reflections.js"
    "${CLAUDE_PLUGIN_ROOT:-}/../opspal-hubspot/scripts/lib/batch-submit-reflections.js"
    # Legacy paths (for backward compatibility)
    "${CLAUDE_PLUGIN_ROOT:-}/../salesforce-plugin/scripts/lib/batch-submit-reflections.js"
    "${CLAUDE_PLUGIN_ROOT:-}/../hubspot-plugin/scripts/lib/batch-submit-reflections.js"
)

for location in "${BATCH_LOCATIONS[@]}"; do
    if [[ -f "$location" ]]; then
        BATCH_SCRIPT="$location"
        break
    fi
done

if [[ -z "$BATCH_SCRIPT" ]]; then
    # Silently skip if batch script not found (backwards compatibility)
    exit 0
fi

# Check if we should run (skip if in CI/test environment)
if [[ -n "${CI:-}" ]] || [[ -n "${CLAUDE_TEST_MODE:-}" ]]; then
    exit 0
fi

# Check if node is available
if ! command -v node &> /dev/null; then
    exit 0
fi

# Build options for batch script
BATCH_OPTIONS="--quick"  # Fast mode by default

if [[ "${BATCH_SUBMIT_VERBOSE:-0}" = "1" ]]; then
    BATCH_OPTIONS="$BATCH_OPTIONS --verbose"
fi

if [[ "${BATCH_SUBMIT_THOROUGH:-0}" = "1" ]]; then
    # Remove --quick flag for thorough search
    BATCH_OPTIONS=""
    if [[ "${BATCH_SUBMIT_VERBOSE:-0}" = "1" ]]; then
        BATCH_OPTIONS="--verbose"
    fi
fi

if [[ -n "${BATCH_SUBMIT_MAX_AGE:-}" ]]; then
    BATCH_OPTIONS="$BATCH_OPTIONS --max-age-days=$BATCH_SUBMIT_MAX_AGE"
fi

# Only show header if we're not in quiet mode
if [[ "${BATCH_SUBMIT_VERBOSE:-0}" != "1" ]]; then
    echo -e "${CYAN}🔄 Checking for unsubmitted reflections...${NC}"
fi

# Run batch submission
if [[ "${BATCH_SUBMIT_VERBOSE:-0}" = "1" ]]; then
    # Verbose mode: show all output
    node "$BATCH_SCRIPT" $BATCH_OPTIONS
else
    # Quiet mode: capture output and show summary
    BATCH_OUTPUT=$(node "$BATCH_SCRIPT" $BATCH_OPTIONS 2>&1)

    # Extract summary line (last line with status emoji)
    SUMMARY=$(echo "$BATCH_OUTPUT" | grep -E '(✅|ℹ️|❌)' | tail -1)

    if [[ -n "$SUMMARY" ]]; then
        echo "$SUMMARY"
    fi

    # If there were submissions, show the count
    if echo "$BATCH_OUTPUT" | grep -q "Submitted:"; then
        SUBMITTED_COUNT=$(echo "$BATCH_OUTPUT" | grep "Submitted:" | sed -n 's/.*Submitted: \([0-9]\+\).*/\1/p')
        if [[ -n "$SUBMITTED_COUNT" ]] && [[ "$SUBMITTED_COUNT" -gt 0 ]]; then
            echo -e "${GREEN}   Submitted $SUBMITTED_COUNT pending reflection(s)${NC}"
        fi
    fi
fi

# Always exit successfully (non-fatal)
exit 0
