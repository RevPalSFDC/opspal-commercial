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
    ERROR_HANDLER="${CLAUDE_PLUGIN_ROOT}/packages/opspal-core/cross-platform-plugin/hooks/lib/error-handler.sh"
else
    ERROR_HANDLER="${SCRIPT_DIR}/../../../opspal-core/cross-platform-plugin/hooks/lib/error-handler.sh"
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
resolve_domain_root() {
    local dir="$1"
    while [[ "$dir" != "/" ]]; do
        if [[ -d "$dir/scripts" ]]; then
            echo "$dir"
            return 0
        fi
        dir="$(dirname "$dir")"
    done
    echo "$1"
}

DOMAIN_ROOT="$(resolve_domain_root "$SCRIPT_DIR")"
PLUGIN_ROOT="$DOMAIN_ROOT"
if [[ -n "${CLAUDE_PLUGIN_ROOT:-}" ]]; then
    DOMAIN_NAME="$(basename "$DOMAIN_ROOT")"
    case "$CLAUDE_PLUGIN_ROOT" in
        *"/packages/domains/$DOMAIN_NAME"|*/"$DOMAIN_NAME"-plugin) PLUGIN_ROOT="$CLAUDE_PLUGIN_ROOT" ;;
    esac
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
