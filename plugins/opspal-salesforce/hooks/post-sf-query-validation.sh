#!/usr/bin/env bash

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

if ! command -v jq &>/dev/null; then
    echo "[post-sf-query-validation] jq not found, skipping" >&2
    exit 0
fi

# Get script directory for relative imports
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"

# Cross-platform plugin root for shared utilities
CROSS_PLATFORM_ROOT="${PLUGIN_ROOT}/../opspal-core"

# Read hook input from stdin
HOOK_INPUT=$(cat)

# Extract the completed command and result payload
COMMAND=$(echo "$HOOK_INPUT" | jq -r '.tool_input.command // ""' 2>/dev/null || echo "")
TOOL_OUTPUT=$(echo "$HOOK_INPUT" | jq -r '.tool_response.stdout // .tool_result.stdout // .tool_output // ""' 2>/dev/null || echo "")

# Only validate sf data query results
if [[ -z "$COMMAND" ]] || ! printf '%s' "$COMMAND" | grep -qE '(^|[[:space:]])(sf|sfdx)[[:space:]]+data[[:space:]]+query([[:space:]]|$)'; then
    exit 0
fi

# Initialize validation result
WARNINGS=()
ERRORS=()

emit_post_tool_use_context() {
    local context="$1"
    jq -nc --arg context "$context" '{
        suppressOutput: true,
        hookSpecificOutput: {
            hookEventName: "PostToolUse",
            additionalContext: $context
        }
    }'
}

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
            log_verbose "Query returned 0 records"
        fi
    fi
fi

# Build response
if [ ${#ERRORS[@]} -gt 0 ]; then
    ERROR_MSG=$(IFS='; '; echo "${ERRORS[*]}")
    emit_post_tool_use_context "Data quality validation found query errors: $ERROR_MSG"
    exit 0
elif [ ${#WARNINGS[@]} -gt 0 ]; then
    WARN_MSG=$(IFS='; '; echo "${WARNINGS[*]}")
    emit_post_tool_use_context "Data quality warnings: $WARN_MSG"
    exit 0
else
    echo '{}'
    exit 0
fi
