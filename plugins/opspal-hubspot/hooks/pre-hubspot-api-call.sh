#!/usr/bin/env bash
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
#   0 - Not a Lists API call (skip validation)
#
# Created: 2025-10-24
# Version: 1.1.0 (Error Handler Integration)
# Date: 2025-11-24

set -euo pipefail

# Source standardized error handler for centralized logging
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -n "${CLAUDE_PLUGIN_ROOT:-}" ]]; then
    ERROR_HANDLER="${CLAUDE_PLUGIN_ROOT}/opspal-core/hooks/lib/error-handler.sh"
else
    ERROR_HANDLER="${SCRIPT_DIR}/../../opspal-core/hooks/lib/error-handler.sh"
fi
if ! command -v jq &>/dev/null; then
    echo "[pre-hubspot-api-call] jq not found, skipping" >&2
    exit 0
fi


if [[ -f "$ERROR_HANDLER" ]]; then
    source "$ERROR_HANDLER"
    HOOK_NAME="pre-hubspot-api-call"
fi

API_ENDPOINT="${1:-}"
REQUEST_JSON=""
HOOK_INPUT=""

# In hook execution, stdin is JSON event data.
# In manual execution, stdin can be request JSON.
if [ -t 0 ]; then
    REQUEST_JSON="${2:-}"
else
    HOOK_INPUT=$(cat 2>/dev/null || true)

    if [[ -n "$HOOK_INPUT" ]] && echo "$HOOK_INPUT" | jq -e . >/dev/null 2>&1; then
        # Claude hook input shape
        API_ENDPOINT="${API_ENDPOINT:-$(echo "$HOOK_INPUT" | jq -r '.tool_input.api_endpoint // .tool_input.endpoint // .tool_input.path // .tool_name // empty')}"
        REQUEST_JSON="$(echo "$HOOK_INPUT" | jq -c '.tool_input.request_json // .tool_input.body // .tool_input.payload // .tool_input // empty')"
        if [[ "$REQUEST_JSON" == "null" ]]; then
            REQUEST_JSON=""
        fi
    else
        # Raw JSON piped manually
        REQUEST_JSON="$HOOK_INPUT"
    fi
fi

if [ -z "$API_ENDPOINT" ]; then
    # For generic hubspot hooks where endpoint is unavailable, skip validation.
    # Keep manual usage support with helpful guidance.
    if [[ -n "${HOOK_INPUT:-}" ]]; then
        exit 0
    fi
    echo "Usage: bash pre-hubspot-api-call.sh <api-endpoint> [request-json]"
    echo "   or: echo '{...}' | bash pre-hubspot-api-call.sh <api-endpoint>"
    exit 1
fi

PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"

# ===================================================================
# Check if this is a Lists API call
# ===================================================================

if [[ ! "$API_ENDPOINT" == *"/lists"* ]]; then
    # Not a Lists API call - allow operation to continue
    exit 0
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
    exit 0
fi

if [ -z "$REQUEST_JSON" ]; then
    echo "⚠️  No request JSON provided - skipping validation"
    exit 0
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
