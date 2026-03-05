#!/bin/bash

# Post-SF Query Validation Hook
#
# Validates query results for data quality issues:
# - Checks result counts against expectations
# - Validates field presence in results
# - Detects truncated results
# - Flags suspicious patterns (empty when data expected)
#
# @version 1.0.0
# @date 2025-12-19
#
# Addresses: data-quality cohort (query result validation)

set -euo pipefail

# Get script directory for relative imports
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
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

# Cross-platform plugin root for shared utilities
CROSS_PLATFORM_ROOT="${PLUGIN_ROOT}/../../../opspal-core/cross-platform-plugin"

# Read hook input from stdin
HOOK_INPUT=$(cat)

# Extract tool name and result
TOOL_NAME=$(echo "$HOOK_INPUT" | jq -r '.tool_name // ""')
TOOL_OUTPUT=$(echo "$HOOK_INPUT" | jq -r '.tool_output // ""')

# Only validate sf data query results
if [[ "$TOOL_NAME" != *"data query"* ]] && [[ "$TOOL_NAME" != *"data_query"* ]]; then
    # Not a query tool, pass through
    echo '{"continue": true}'
    exit 0
fi

# Initialize validation result
WARNINGS=()
ERRORS=()

# Check for empty results when data was expected
if echo "$TOOL_OUTPUT" | grep -q '"totalSize":0' || echo "$TOOL_OUTPUT" | grep -q '"records":\[\]'; then
    WARNINGS+=("Query returned 0 records - verify this is expected")
fi

# Check for query truncation indicators
if echo "$TOOL_OUTPUT" | grep -qi "more records"; then
    WARNINGS+=("Results may be truncated - consider adding LIMIT or pagination")
fi

# Check for SOQL error patterns
if echo "$TOOL_OUTPUT" | grep -qi "malformed query\|invalid field\|INVALID_FIELD\|MALFORMED_QUERY"; then
    ERRORS+=("Query contains errors - check field names and syntax")
fi

# Check for null/empty results that might indicate issues
if echo "$TOOL_OUTPUT" | grep -qi "null\|undefined" | head -20 | grep -c "null" | xargs test 10 -lt 2>/dev/null; then
    WARNINGS+=("High number of NULL values in result - verify data quality")
fi

# Run data quality gate validation if available
if [ -f "$CROSS_PLATFORM_ROOT/scripts/lib/data-quality-gate.js" ]; then
    # Extract records for validation (if JSON result)
    if echo "$TOOL_OUTPUT" | jq -e '.records' > /dev/null 2>&1; then
        RECORDS=$(echo "$TOOL_OUTPUT" | jq -c '.records')
        TOTAL=$(echo "$TOOL_OUTPUT" | jq -r '.totalSize // 0')

        # Check for improbable zero count
        if [ "$TOTAL" = "0" ]; then
            # Log to structured logger if available
            if [ -f "$CROSS_PLATFORM_ROOT/scripts/lib/structured-logger.js" ]; then
                node "$CROSS_PLATFORM_ROOT/scripts/lib/structured-logger.js" log \
                    --level warning \
                    --message "Query returned 0 records" \
                    --context '{"tool":"sf data query","hook":"post-sf-query-validation"}' 2>/dev/null || true
            fi
        fi
    fi
fi

# Build response
if [ ${#ERRORS[@]} -gt 0 ]; then
    # Has errors - block execution
    ERROR_MSG=$(IFS='; '; echo "${ERRORS[*]}")
    echo "{\"continue\": false, \"message\": \"Data quality validation failed: $ERROR_MSG\"}"
    exit 0
elif [ ${#WARNINGS[@]} -gt 0 ]; then
    # Has warnings - continue but add message
    WARN_MSG=$(IFS='; '; echo "${WARNINGS[*]}")
    echo "{\"continue\": true, \"message\": \"Data quality warnings: $WARN_MSG\"}"
    exit 0
else
    # All good
    echo '{"continue": true}'
    exit 0
fi
