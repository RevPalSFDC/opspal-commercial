#!/bin/bash
#
# Pre-Stop Org Verification Hook
#
# Purpose: Enforce that agent responses containing org-state claims have
#          corresponding query evidence. Prevents agents from providing
#          information based on local documentation without live validation.
#
# Trigger: Stop event (before agent completes response)
#
# Behavior:
#   - Extracts pending response content from hook input
#   - Detects org-state claims using claim-query-validator.js
#   - Checks query evidence tracker for supporting queries
#   - STRICT MODE (default): Blocks response if claims lack evidence
#   - WARNING MODE: Allows response with warning injection
#
# Configuration:
#   REQUIRE_ORG_VERIFICATION=1  - Strict mode (block) - DEFAULT
#   REQUIRE_ORG_VERIFICATION=0  - Warning mode (allow with notice)
#   ORG_CLAIM_SENSITIVITY       - low|medium|high (default: medium)
#   SKIP_SF_ORG_VERIFICATION=1  - Skip Salesforce validation
#   SKIP_HS_ORG_VERIFICATION=1  - Skip HubSpot validation
#   SKIP_MARKETO_ORG_VERIFICATION=1 - Skip Marketo validation
#
# Exit Codes:
#   0 - Response approved (no claims or all claims verified)
#   2 - Response blocked (strict mode, unverified claims)
#
# Version: 1.0.0
# Date: 2026-01-09
#

set -euo pipefail

emit_noop_json() {
    printf '{}\n'
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Source standardized error handler
ERROR_HANDLER="${SCRIPT_DIR}/lib/error-handler.sh"
if [ -f "$ERROR_HANDLER" ]; then
    source "$ERROR_HANDLER"
    HOOK_NAME="pre-stop-org-verification"
    set_lenient_mode 2>/dev/null || true
fi

# Configuration
STRICT_MODE="${REQUIRE_ORG_VERIFICATION:-1}"
CLAIM_VALIDATOR="${PLUGIN_ROOT}/scripts/lib/claim-query-validator.js"
LOG_DIR="${PLUGIN_ROOT}/.logs"

# Ensure log directory exists
mkdir -p "$LOG_DIR" 2>/dev/null || true

# ============================================================================
# Read Hook Input
# ============================================================================

HOOK_INPUT=""
if [ ! -t 0 ]; then
    HOOK_INPUT=$(cat)
fi

# If no input, nothing to validate
if [ -z "$HOOK_INPUT" ]; then
    emit_noop_json
    exit 0
fi

# ============================================================================
# Extract Response Content
# ============================================================================

RESPONSE_CONTENT=""
if command -v jq &>/dev/null; then
    # Try to extract response from various possible formats
    RESPONSE_CONTENT=$(echo "$HOOK_INPUT" | jq -r '
        .stop_response //
        .response //
        .message //
        .content //
        .text //
        ""
    ' 2>/dev/null || echo "")

    # If still empty, try treating entire input as the response
    if [ -z "$RESPONSE_CONTENT" ] || [ "$RESPONSE_CONTENT" = "null" ]; then
        RESPONSE_CONTENT="$HOOK_INPUT"
    fi
else
    RESPONSE_CONTENT="$HOOK_INPUT"
fi

# Skip if no meaningful response content
if [ -z "$RESPONSE_CONTENT" ] || [ ${#RESPONSE_CONTENT} -lt 50 ]; then
    emit_noop_json
    exit 0
fi

# ============================================================================
# Check for Skip Flags
# ============================================================================

# Build platform filter based on skip flags
PLATFORM_FILTER=""

if [ "${SKIP_SF_ORG_VERIFICATION:-0}" = "1" ] && \
   [ "${SKIP_HS_ORG_VERIFICATION:-0}" = "1" ] && \
   [ "${SKIP_MARKETO_ORG_VERIFICATION:-0}" = "1" ]; then
    # All platforms skipped - pass through
    emit_noop_json
    exit 0
fi

# ============================================================================
# Validate Response Claims
# ============================================================================

# Check if validator exists
if [ ! -f "$CLAIM_VALIDATOR" ]; then
    echo "⚠️  Claim validator not found - skipping verification" >&2
    emit_noop_json
    exit 0
fi

# Run claim validation
VALIDATION_RESULT=""
VALIDATION_EXIT_CODE=0

# Create temp file for response (handles special characters better)
TEMP_RESPONSE=$(mktemp)
echo "$RESPONSE_CONTENT" > "$TEMP_RESPONSE"

VALIDATION_RESULT=$(node "$CLAIM_VALIDATOR" validate-file "$TEMP_RESPONSE" --json 2>&1) || VALIDATION_EXIT_CODE=$?
rm -f "$TEMP_RESPONSE"

# Parse validation result
if [ -z "$VALIDATION_RESULT" ]; then
    emit_noop_json
    exit 0
fi

IS_VALID=$(echo "$VALIDATION_RESULT" | jq -r '.valid // true' 2>/dev/null || echo "true")
CLAIMS_FOUND=$(echo "$VALIDATION_RESULT" | jq -r '.claimsFound // 0' 2>/dev/null || echo "0")
UNSUPPORTED_COUNT=$(echo "$VALIDATION_RESULT" | jq -r '.unsupportedClaims // 0' 2>/dev/null || echo "0")
HOOK_OUTPUT=$(echo "$VALIDATION_RESULT" | jq -r '.hookOutput // {}' 2>/dev/null || echo "{}")

# Log validation (for debugging and analysis)
{
    echo "$(date '+%Y-%m-%d %H:%M:%S') | claims=$CLAIMS_FOUND unsupported=$UNSUPPORTED_COUNT valid=$IS_VALID strict=$STRICT_MODE"
} >> "$LOG_DIR/org-verification.log" 2>/dev/null || true

# ============================================================================
# Handle Validation Result
# ============================================================================

if [ "$IS_VALID" = "true" ] || [ "$CLAIMS_FOUND" = "0" ]; then
    # All claims verified or no claims found - pass through
    emit_noop_json
    exit 0
fi

# Claims found without evidence
if [ "$STRICT_MODE" = "1" ]; then
    # STRICT MODE: Block the response

    DECISION=$(echo "$HOOK_OUTPUT" | jq -r '.decision // "block"' 2>/dev/null || echo "block")
    INSTRUCTION=$(echo "$HOOK_OUTPUT" | jq -r '.instruction // ""' 2>/dev/null || echo "")

    # Extract unsupported claims for error message
    UNSUPPORTED_LIST=$(echo "$VALIDATION_RESULT" | jq -r '
        .unsupported // [] |
        map("  - \(.claim) (\(.type))") |
        join("\n")
    ' 2>/dev/null || echo "  - (details unavailable)")

    REQUIRED_ACTIONS=$(echo "$VALIDATION_RESULT" | jq -r '
        .requiredActions // [] |
        map("  - \(.)") |
        join("\n")
    ' 2>/dev/null || echo "  - Query the org directly")

    # Output blocking message
    cat >&2 << EOF

⛔ RESPONSE BLOCKED: ORG-STATE CLAIMS WITHOUT QUERY EVIDENCE

Your response contains ${UNSUPPORTED_COUNT} claim(s) about org state that cannot be
verified against live query evidence.

Unverified Claims:
$UNSUPPORTED_LIST

Required Actions:
$REQUIRED_ACTIONS

To proceed:
1. Execute the required queries against the target org
2. Include query results in your response
3. Never rely solely on local documentation for org-state information

To disable strict mode: export REQUIRE_ORG_VERIFICATION=0

EOF

    # Log the block event
    {
        echo "$(date '+%Y-%m-%d %H:%M:%S') | BLOCKED | unsupported=$UNSUPPORTED_COUNT"
        echo "$UNSUPPORTED_LIST" | sed 's/^/  /'
    } >> "$LOG_DIR/org-verification-blocks.log" 2>/dev/null || true

    exit 2

else
    # WARNING MODE: Allow with warning injection

    WARNING_MSG=$(echo "$HOOK_OUTPUT" | jq -r '.warning // ""' 2>/dev/null || echo "")

    if [ -n "$WARNING_MSG" ]; then
        # Inject warning into output
        echo "
⚠️  VERIFICATION WARNING
$WARNING_MSG
" >&2
    fi

    # Pass through the original input
    emit_noop_json
    exit 0
fi
