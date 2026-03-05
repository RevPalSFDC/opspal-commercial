#!/bin/bash

# safe-curl.sh - Safe API Execution with JSON Validation
#
# Purpose: Wrapper around curl that validates HTTP responses are valid JSON
#          before piping to jq or other JSON processors
# Usage:   safe-curl <curl_args...>
# Example: safe-curl -X GET "$API_URL" -H "Authorization: Bearer $TOKEN"
#
# Returns: 0 if request successful and response is JSON, 1 otherwise
# Output:  JSON response to stdout, errors to stderr

set -euo pipefail

# Color codes
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m'

log_error() {
    echo -e "${RED}❌ [safe-curl]${NC} $1" >&2
}

log_warn() {
    echo -e "${YELLOW}⚠️  [safe-curl]${NC} $1" >&2
}

log_success() {
    echo -e "${GREEN}✅ [safe-curl]${NC} $1" >&2
}

# Validate that jq is available
if ! command -v jq &> /dev/null; then
    log_error "jq is not installed. Install with: sudo apt-get install jq"
    exit 1
fi

# Check if curl arguments provided
if [ $# -eq 0 ]; then
    log_error "Usage: safe-curl <curl_args...>"
    log_error "Example: safe-curl -X GET \"https://api.example.com/data\" -H \"Authorization: Bearer \$TOKEN\""
    exit 1
fi

# Create temp files for response and headers
TEMP_RESPONSE=$(mktemp)
TEMP_HEADERS=$(mktemp)

# Cleanup on exit
cleanup() {
    rm -f "$TEMP_RESPONSE" "$TEMP_HEADERS"
}
trap cleanup EXIT

# Execute curl with all provided arguments
# -s: silent (no progress bar)
# -S: show errors even with -s
# -w: write HTTP status code
# -D: dump headers to file
HTTP_STATUS=$(curl -s -S -w "%{http_code}" -D "$TEMP_HEADERS" -o "$TEMP_RESPONSE" "$@" 2>&1 | tail -1)

# Check if curl command succeeded
CURL_EXIT_CODE=$?
if [ $CURL_EXIT_CODE -ne 0 ]; then
    log_error "curl command failed with exit code $CURL_EXIT_CODE"

    # Show first few lines of response for debugging
    if [ -s "$TEMP_RESPONSE" ]; then
        log_error "Response preview:"
        head -3 "$TEMP_RESPONSE" | sed 's/^/    /' >&2
    fi

    exit 1
fi

# Validate HTTP status code
if [ "$HTTP_STATUS" -ge 400 ]; then
    log_error "HTTP request failed with status $HTTP_STATUS"

    # Try to parse error message if response is JSON
    if jq -e . "$TEMP_RESPONSE" > /dev/null 2>&1; then
        ERROR_MSG=$(jq -r '.error // .message // .errors[0] // "No error message"' "$TEMP_RESPONSE" 2>/dev/null || echo "Unknown error")
        log_error "API Error: $ERROR_MSG"
    else
        # Not JSON - show first few lines
        log_error "Response (not JSON):"
        head -3 "$TEMP_RESPONSE" | sed 's/^/    /' >&2
    fi

    exit 1
fi

# Validate response is JSON
if ! jq -e . "$TEMP_RESPONSE" > /dev/null 2>&1; then
    log_error "Response is not valid JSON (HTTP $HTTP_STATUS)"
    log_error "Response preview:"
    head -5 "$TEMP_RESPONSE" | sed 's/^/    /' >&2

    # Check if it's HTML
    if head -1 "$TEMP_RESPONSE" | grep -qi "<!DOCTYPE\|<html"; then
        log_error "Response appears to be HTML (possibly error page)"
        log_error "Check API endpoint and authentication"
    fi

    exit 1
fi

# Success - output JSON to stdout
cat "$TEMP_RESPONSE"

# Optional: Log success to stderr (can be disabled with SAFE_CURL_QUIET=1)
if [ "${SAFE_CURL_QUIET:-0}" != "1" ]; then
    RESPONSE_SIZE=$(wc -c < "$TEMP_RESPONSE")
    log_success "HTTP $HTTP_STATUS - Valid JSON ($RESPONSE_SIZE bytes)"
fi

exit 0
