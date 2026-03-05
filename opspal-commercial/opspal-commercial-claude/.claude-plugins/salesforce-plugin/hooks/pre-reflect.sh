#!/bin/bash
# Pre-Reflect Hook: Automatically submit pending reflections before generating new one
#
# Triggered before: /reflect command starts
# Purpose: Catch and submit any reflections that failed to submit previously
#
# ✅ REQUIRES SUPABASE_URL/SUPABASE_ANON_KEY (same as post-reflect hook)
# ✅ NON-FATAL: Never blocks /reflect command
# ✅ FAST: Uses --quick mode by default (only searches project root)
#
# Environment Variables (Optional):
#   BATCH_SUBMIT_VERBOSE=1    - Show detailed output
#   BATCH_SUBMIT_THOROUGH=1   - Search all locations (slower but more thorough)
#   BATCH_SUBMIT_MAX_AGE=N    - Only submit reflections newer than N days
#
# Exit Codes:
#   0 - Always (non-fatal errors to avoid breaking /reflect command)
#
# Version: 1.1.0 (Error Handler Integration)
# Date: 2025-11-24

# Source standardized error handler for centralized logging
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -n "${CLAUDE_PLUGIN_ROOT:-}" ]]; then
    ERROR_HANDLER="${CLAUDE_PLUGIN_ROOT}/cross-platform-plugin/hooks/lib/error-handler.sh"
else
    ERROR_HANDLER="${SCRIPT_DIR}/../../cross-platform-plugin/hooks/lib/error-handler.sh"
fi

if [[ -f "$ERROR_HANDLER" ]]; then
    source "$ERROR_HANDLER"
    HOOK_NAME="pre-reflect"
    # Use lenient mode - this hook is non-fatal
    set_lenient_mode 2>/dev/null || true
else
    set +e  # Don't exit on errors (non-fatal hook)
fi

# Colors for output (fallback if error handler not loaded)
GREEN="${GREEN:-\033[0;32m}"
YELLOW="${YELLOW:-\033[1;33m}"
CYAN="${CYAN:-\033[0;36m}"
NC="${NC:-\033[0m}"

# ==============================================================================
# MAIN EXECUTION
# ==============================================================================

# Determine plugin root (for script path)
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-}"
if [ -z "$PLUGIN_ROOT" ]; then
    # Fallback: derive from hook location
    PLUGIN_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
fi

BATCH_SCRIPT="$PLUGIN_ROOT/scripts/lib/batch-submit-reflections.js"

if [ ! -f "$BATCH_SCRIPT" ]; then
    # Silently skip if batch script not found (backwards compatibility)
    exit 0
fi

# Check if we should run (skip if in CI/test environment)
if [ -n "$CI" ] || [ -n "$CLAUDE_TEST_MODE" ]; then
    exit 0
fi

# Build options for batch script
BATCH_OPTIONS="--quick"  # Fast mode by default

if [ "$BATCH_SUBMIT_VERBOSE" = "1" ]; then
    BATCH_OPTIONS="$BATCH_OPTIONS --verbose"
fi

if [ "$BATCH_SUBMIT_THOROUGH" = "1" ]; then
    # Remove --quick flag for thorough search
    BATCH_OPTIONS=""
    if [ "$BATCH_SUBMIT_VERBOSE" = "1" ]; then
        BATCH_OPTIONS="--verbose"
    fi
fi

if [ -n "$BATCH_SUBMIT_MAX_AGE" ]; then
    BATCH_OPTIONS="$BATCH_OPTIONS --max-age-days=$BATCH_SUBMIT_MAX_AGE"
fi

# Only show header if we're not in quiet mode
if [ "$BATCH_SUBMIT_VERBOSE" != "1" ]; then
    echo -e "${CYAN}🔄 Checking for unsubmitted reflections...${NC}"
fi

# Run batch submission
# Capture output to show summary only
if [ "$BATCH_SUBMIT_VERBOSE" = "1" ]; then
    # Verbose mode: show all output
    node "$BATCH_SCRIPT" $BATCH_OPTIONS
    BATCH_EXIT=$?
else
    # Quiet mode: capture output and show summary
    BATCH_OUTPUT=$(node "$BATCH_SCRIPT" $BATCH_OPTIONS 2>&1)
    BATCH_EXIT=$?

    # Extract summary line (last line with ✅, ℹ️, or ❌)
    SUMMARY=$(echo "$BATCH_OUTPUT" | grep -E '(✅|ℹ️|❌)' | tail -1)

    if [ -n "$SUMMARY" ]; then
        echo "$SUMMARY"
    fi

    # If there were submissions, show the count
    if echo "$BATCH_OUTPUT" | grep -q "Submitted:"; then
        SUBMITTED_COUNT=$(echo "$BATCH_OUTPUT" | grep "Submitted:" | sed -n 's/.*Submitted: \([0-9]\+\).*/\1/p')
        if [ -n "$SUBMITTED_COUNT" ] && [ "$SUBMITTED_COUNT" -gt 0 ]; then
            echo -e "${GREEN}   Submitted $SUBMITTED_COUNT pending reflection(s)${NC}"
        fi
    fi
fi

# Always exit successfully (non-fatal)
exit 0
