#!/bin/bash

###############################################################################
# Safe cURL API Wrapper
#
# Wraps curl calls with JSON validation, error handling, and retry logic.
#
# Addresses: Cohort 2 (config/env) - 8 reflections, $30K ROI
#
# Prevention Targets:
# - curl/jq parsing failures on non-JSON responses
# - HTTP error codes not properly handled
# - Missing retry logic for transient failures
# - Rate limiting not handled
#
# Usage:
#   source "$(dirname "$0")/safe-curl.sh"
#
#   # Simple GET
#   safe_curl GET "https://api.example.com/data"
#
#   # POST with JSON body
#   safe_curl POST "https://api.example.com/data" '{"key":"value"}'
#
#   # With headers
#   safe_curl GET "https://api.example.com/data" "" "Authorization: Bearer token"
#
#   # Direct function call with full control
#   result=$(safe_api_request \
#     --method POST \
#     --url "https://api.example.com" \
#     --data '{"key":"value"}' \
#     --header "Authorization: Bearer token" \
#     --retry 3 \
#     --timeout 30)
#
# Configuration:
#   SAFE_CURL_RETRY=3          # Number of retries (default: 3)
#   SAFE_CURL_TIMEOUT=30       # Timeout in seconds (default: 30)
#   SAFE_CURL_RETRY_DELAY=2    # Delay between retries (default: 2)
#   SAFE_CURL_DEBUG=0          # Debug output (default: 0)
#   SAFE_CURL_QUIET=0          # Suppress all output (default: 0)
###############################################################################

# Configuration with defaults
SAFE_CURL_RETRY="${SAFE_CURL_RETRY:-3}"
SAFE_CURL_TIMEOUT="${SAFE_CURL_TIMEOUT:-30}"
SAFE_CURL_RETRY_DELAY="${SAFE_CURL_RETRY_DELAY:-2}"
SAFE_CURL_DEBUG="${SAFE_CURL_DEBUG:-0}"
SAFE_CURL_QUIET="${SAFE_CURL_QUIET:-0}"

# Store last request details for debugging
_SAFE_CURL_LAST_HTTP_CODE=""
_SAFE_CURL_LAST_RESPONSE=""
_SAFE_CURL_LAST_ERROR=""

# Logging helper
_curl_log() {
    local level="$1"
    shift
    if [ "$SAFE_CURL_QUIET" != "1" ]; then
        case "$level" in
            debug)
                [ "$SAFE_CURL_DEBUG" == "1" ] && echo "[curl:debug] $*" >&2
                ;;
            info)
                echo "[curl] $*" >&2
                ;;
            warn)
                echo "[curl:warn] $*" >&2
                ;;
            error)
                echo "[curl:error] $*" >&2
                ;;
        esac
    fi
}

# Check if response is valid JSON
is_valid_json() {
    local content="$1"
    echo "$content" | jq -e . >/dev/null 2>&1
}

# Extract error message from various API response formats
extract_error_message() {
    local body="$1"

    # Try common error field patterns
    local msg=""

    # Salesforce style
    msg=$(echo "$body" | jq -r '.message // empty' 2>/dev/null)
    [ -n "$msg" ] && echo "$msg" && return

    # Salesforce array style
    msg=$(echo "$body" | jq -r '.[0].message // empty' 2>/dev/null)
    [ -n "$msg" ] && echo "$msg" && return

    # Generic error field
    msg=$(echo "$body" | jq -r '.error // empty' 2>/dev/null)
    [ -n "$msg" ] && echo "$msg" && return

    # Error description field
    msg=$(echo "$body" | jq -r '.error_description // empty' 2>/dev/null)
    [ -n "$msg" ] && echo "$msg" && return

    # Supabase style
    msg=$(echo "$body" | jq -r '.error.message // empty' 2>/dev/null)
    [ -n "$msg" ] && echo "$msg" && return

    # HubSpot style
    msg=$(echo "$body" | jq -r '.errors[0].message // empty' 2>/dev/null)
    [ -n "$msg" ] && echo "$msg" && return

    # Asana style
    msg=$(echo "$body" | jq -r '.errors[0] // empty' 2>/dev/null)
    [ -n "$msg" ] && echo "$msg" && return

    # Fallback: return truncated body
    echo "${body:0:200}"
}

# Check if error is retryable
is_retryable_error() {
    local http_code="$1"
    local body="$2"

    # Server errors are usually retryable
    [ "$http_code" -ge 500 ] && return 0

    # Rate limiting is retryable
    [ "$http_code" -eq 429 ] && return 0

    # Connection timeout/reset
    [ "$http_code" -eq 0 ] && return 0

    # Specific error messages that indicate transient issues
    if echo "$body" | grep -qi "timeout\|temporarily unavailable\|try again\|rate limit\|throttl"; then
        return 0
    fi

    return 1
}

# Get retry delay (with exponential backoff for rate limits)
get_retry_delay() {
    local attempt="$1"
    local http_code="$2"
    local body="$3"

    # Check for Retry-After header hint in body
    local retry_after=""
    retry_after=$(echo "$body" | jq -r '.retryAfter // .retry_after // empty' 2>/dev/null)

    if [ -n "$retry_after" ] && [ "$retry_after" -gt 0 ] 2>/dev/null; then
        echo "$retry_after"
        return
    fi

    # Rate limit: exponential backoff
    if [ "$http_code" -eq 429 ]; then
        local delay=$((SAFE_CURL_RETRY_DELAY * (2 ** attempt)))
        # Cap at 60 seconds
        [ "$delay" -gt 60 ] && delay=60
        echo "$delay"
        return
    fi

    # Server errors: linear backoff
    if [ "$http_code" -ge 500 ]; then
        echo $((SAFE_CURL_RETRY_DELAY * (attempt + 1)))
        return
    fi

    # Default delay
    echo "$SAFE_CURL_RETRY_DELAY"
}

# Main API request function with full control
safe_api_request() {
    local method="GET"
    local url=""
    local data=""
    local headers=()
    local retry="$SAFE_CURL_RETRY"
    local timeout="$SAFE_CURL_TIMEOUT"
    local expect_json=1

    # Parse arguments
    while [ $# -gt 0 ]; do
        case "$1" in
            --method|-X)
                method="$2"
                shift 2
                ;;
            --url)
                url="$2"
                shift 2
                ;;
            --data|-d)
                data="$2"
                shift 2
                ;;
            --header|-H)
                headers+=("$2")
                shift 2
                ;;
            --retry)
                retry="$2"
                shift 2
                ;;
            --timeout)
                timeout="$2"
                shift 2
                ;;
            --no-json)
                expect_json=0
                shift
                ;;
            *)
                # Positional: url
                if [ -z "$url" ]; then
                    url="$1"
                fi
                shift
                ;;
        esac
    done

    if [ -z "$url" ]; then
        _curl_log error "URL is required"
        _SAFE_CURL_LAST_ERROR="URL is required"
        return 1
    fi

    _curl_log debug "Request: $method $url"

    local attempt=0
    local http_code
    local response_body
    local curl_exit

    while [ $attempt -le $retry ]; do
        if [ $attempt -gt 0 ]; then
            local delay
            delay=$(get_retry_delay $((attempt - 1)) "$http_code" "$response_body")
            _curl_log info "Retry $attempt/$retry after ${delay}s (HTTP $http_code)"
            sleep "$delay"
        fi

        # Build curl command
        local curl_cmd=(curl -s -w "\n%{http_code}" --max-time "$timeout")

        # Add method
        curl_cmd+=(-X "$method")

        # Add headers
        for header in "${headers[@]}"; do
            curl_cmd+=(-H "$header")
        done

        # Add default Content-Type for POST/PUT/PATCH with data
        if [ -n "$data" ]; then
            local has_content_type=0
            for header in "${headers[@]}"; do
                [[ "$header" =~ ^[Cc]ontent-[Tt]ype: ]] && has_content_type=1
            done
            if [ $has_content_type -eq 0 ]; then
                curl_cmd+=(-H "Content-Type: application/json")
            fi
            curl_cmd+=(-d "$data")
        fi

        # Add URL
        curl_cmd+=("$url")

        _curl_log debug "Executing: ${curl_cmd[*]}"

        # Execute request
        local full_response
        full_response=$("${curl_cmd[@]}" 2>&1)
        curl_exit=$?

        # Parse response
        http_code=$(echo "$full_response" | tail -n1)
        response_body=$(echo "$full_response" | sed '$d')

        _SAFE_CURL_LAST_HTTP_CODE="$http_code"
        _SAFE_CURL_LAST_RESPONSE="$response_body"

        _curl_log debug "HTTP $http_code, curl exit: $curl_exit"

        # Handle curl errors
        if [ $curl_exit -ne 0 ]; then
            _curl_log warn "curl failed with exit code $curl_exit"
            http_code=0
            if is_retryable_error $http_code "$response_body"; then
                ((attempt++))
                continue
            fi
            _SAFE_CURL_LAST_ERROR="curl failed: exit code $curl_exit"
            return 1
        fi

        # Check HTTP status
        if [[ "$http_code" =~ ^2 ]]; then
            # Success
            if [ $expect_json -eq 1 ]; then
                if is_valid_json "$response_body"; then
                    echo "$response_body"
                    return 0
                else
                    _curl_log warn "Response is not valid JSON"
                    _SAFE_CURL_LAST_ERROR="Invalid JSON response"
                    # Still return the body, caller can decide
                    echo "$response_body"
                    return 2
                fi
            else
                echo "$response_body"
                return 0
            fi
        fi

        # Error response
        local error_msg
        error_msg=$(extract_error_message "$response_body")
        _SAFE_CURL_LAST_ERROR="HTTP $http_code: $error_msg"

        if is_retryable_error "$http_code" "$response_body"; then
            ((attempt++))
            continue
        fi

        # Non-retryable error
        _curl_log error "HTTP $http_code: $error_msg"
        echo "$response_body"
        return 1
    done

    # All retries exhausted
    _curl_log error "All $retry retries exhausted"
    _SAFE_CURL_LAST_ERROR="All retries exhausted"
    echo "$response_body"
    return 1
}

# Simplified wrapper for common use cases
safe_curl() {
    local method="${1:-GET}"
    local url="$2"
    local data="${3:-}"
    local extra_header="${4:-}"

    local args=(--method "$method" --url "$url")

    [ -n "$data" ] && args+=(--data "$data")
    [ -n "$extra_header" ] && args+=(--header "$extra_header")

    safe_api_request "${args[@]}"
}

# Supabase-specific helper
supabase_request() {
    local method="${1:-GET}"
    local endpoint="$2"
    local data="${3:-}"

    local url="${SUPABASE_URL}${endpoint}"

    safe_api_request \
        --method "$method" \
        --url "$url" \
        --header "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
        --header "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
        ${data:+--data "$data"}
}

# Asana-specific helper
asana_request() {
    local method="${1:-GET}"
    local endpoint="$2"
    local data="${3:-}"

    local url="https://app.asana.com/api/1.0${endpoint}"

    safe_api_request \
        --method "$method" \
        --url "$url" \
        --header "Authorization: Bearer ${ASANA_ACCESS_TOKEN}" \
        ${data:+--data "$data"}
}

# Get last request details for debugging
get_last_request_info() {
    echo "HTTP Code: $_SAFE_CURL_LAST_HTTP_CODE"
    echo "Error: $_SAFE_CURL_LAST_ERROR"
    echo "Response: ${_SAFE_CURL_LAST_RESPONSE:0:500}"
}

# Test connection to a URL
test_connection() {
    local url="$1"
    local old_quiet="$SAFE_CURL_QUIET"
    SAFE_CURL_QUIET=1

    if safe_api_request --method HEAD --url "$url" --retry 0 --timeout 5 --no-json >/dev/null 2>&1; then
        SAFE_CURL_QUIET="$old_quiet"
        echo "OK"
        return 0
    else
        SAFE_CURL_QUIET="$old_quiet"
        echo "FAILED: $_SAFE_CURL_LAST_ERROR"
        return 1
    fi
}

# Export functions for use in scripts
export -f safe_curl
export -f safe_api_request
export -f supabase_request
export -f asana_request
export -f is_valid_json
export -f get_last_request_info
export -f test_connection
