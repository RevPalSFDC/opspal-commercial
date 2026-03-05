#!/bin/bash
#
# Pre-HubSpot API Call Hook
#
# Validates HubSpot API requests before execution to prevent:
# - Wrong association IDs (280 vs 279)
# - Invalid operator syntax (>= vs IS_GREATER_THAN_OR_EQUAL_TO)
# - Missing operationType field
# - Invalid filter structure (not OR-with-nested-AND)
#
# Usage:
#   bash pre-hubspot-api-call.sh <api-endpoint> <request-json>
#
# Or pipe JSON:
#   echo '{"filterBranches": [...]}' | bash pre-hubspot-api-call.sh /lists
#
# Returns:
#   0 - Validation passed
#   1 - Validation failed
#   2 - Not a Lists API call (skip validation)
#
# Created: 2025-10-24
# Version: 1.1.0 (Error Handler Integration)
# Date: 2025-11-24

set -euo pipefail

# Source standardized error handler for centralized logging
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -n "${CLAUDE_PLUGIN_ROOT:-}" ]]; then
    ERROR_HANDLER="${CLAUDE_PLUGIN_ROOT}/packages/opspal-core/cross-platform-plugin/hooks/lib/error-handler.sh"
else
    ERROR_HANDLER="${SCRIPT_DIR}/../../../opspal-core/cross-platform-plugin/hooks/lib/error-handler.sh"
fi

if [[ -f "$ERROR_HANDLER" ]]; then
    source "$ERROR_HANDLER"
    HOOK_NAME="pre-hubspot-api-call"
fi

API_ENDPOINT="${1:-}"

# Read request JSON from stdin if available, otherwise from argument
if [ -t 0 ]; then
    REQUEST_JSON="${2:-}"
else
    REQUEST_JSON=$(cat)
fi

if [ -z "$API_ENDPOINT" ]; then
    echo "Usage: bash pre-hubspot-api-call.sh <api-endpoint> [request-json]"
    echo "   or: echo '{...}' | bash pre-hubspot-api-call.sh <api-endpoint>"
    exit 1
fi

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

# ===================================================================
# Check if this is a Lists API call
# ===================================================================

if [[ ! "$API_ENDPOINT" == *"/lists"* ]]; then
    # Not a Lists API call - skip validation
    exit 2
fi

echo "=== Pre-HubSpot Lists API Call Validation ==="
echo ""
echo "Endpoint: $API_ENDPOINT"
echo ""

# ===================================================================
# Validate Lists API Request
# ===================================================================

VALIDATOR="$PLUGIN_ROOT/scripts/lib/hubspot-lists-api-validator.js"

if [ ! -f "$VALIDATOR" ]; then
    echo "⚠️  Lists API validator not found - skipping validation"
    echo "   Expected: $VALIDATOR"
    exit 2
fi

if [ -z "$REQUEST_JSON" ]; then
    echo "⚠️  No request JSON provided - skipping validation"
    exit 2
fi

# Create temp files
REQUEST_FILE=$(mktemp)
RESULT_FILE=$(mktemp)

trap "rm -f $REQUEST_FILE $RESULT_FILE" EXIT

# Write request to temp file
echo "$REQUEST_JSON" > "$REQUEST_FILE"

# Run validation
echo "Running Lists API validation..."
echo ""

if node "$VALIDATOR" validate "$(cat $REQUEST_FILE)" > "$RESULT_FILE" 2>&1; then
    echo "✅ Lists API validation passed"
    echo ""
    cat "$RESULT_FILE"
    exit 0
else
    echo "❌ Lists API validation failed"
    echo ""
    cat "$RESULT_FILE"
    echo ""
    echo "Fix errors before making API call."
    exit 1
fi
