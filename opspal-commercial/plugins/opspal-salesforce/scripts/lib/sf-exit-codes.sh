#!/bin/bash
# sf-exit-codes.sh - Standardized exit codes for Salesforce CLI operations
#
# This file defines consistent exit codes across all SF CLI wrapper scripts
# and hooks. Source this file to use standardized exit codes.
#
# Usage:
#   source "$(dirname "$0")/sf-exit-codes.sh"
#
#   if [ -z "$ORG_ALIAS" ]; then
#       log_error "CONFIG_ERROR" "No org alias specified"
#       exit $EXIT_CONFIG_ERROR
#   fi

# ============================================================================
# EXIT CODES - Match error-taxonomy.json
# ============================================================================

# Success - Operation completed without errors
readonly EXIT_SUCCESS=0

# Validation Error - Data or query validation failed
# Examples: INVALID_FIELD, MALFORMED_QUERY, No such column
readonly EXIT_VALIDATION_ERROR=1

# Missing Dependency - Required tool or package not installed
# Examples: sf command not found, jq not installed
readonly EXIT_MISSING_DEPENDENCY=2

# Transient Error - Temporary failure that may succeed on retry
# Examples: ECONNRESET, timeout, 503 errors
readonly EXIT_TRANSIENT_ERROR=3

# Permission Error - Access denied or insufficient permissions
# Examples: INSUFFICIENT_ACCESS, session expired
readonly EXIT_PERMISSION_ERROR=4

# Config Error - Configuration or environment issue
# Examples: No default org, alias not found
readonly EXIT_CONFIG_ERROR=5

# Rate Limit - API rate limit exceeded
# Examples: REQUEST_LIMIT_EXCEEDED, too many requests
readonly EXIT_RATE_LIMIT=6

# Timeout - Operation timed out
# Examples: command timeout, query timeout
readonly EXIT_TIMEOUT=7

# CLI Error - Salesforce CLI tool error
# Examples: invalid command, spawn ENOENT
readonly EXIT_CLI_ERROR=8

# Unknown Error - Unclassified error
readonly EXIT_UNKNOWN_ERROR=99

# ============================================================================
# LOGGING FUNCTIONS
# ============================================================================

# Log file path (can be overridden)
SF_ERROR_LOG="${SF_ERROR_LOG:-${SCRIPT_DIR:-$(dirname "$0")}/../../../logs/sf-errors.jsonl}"

# Ensure log directory exists
_ensure_log_dir() {
    local log_dir
    log_dir="$(dirname "$SF_ERROR_LOG")"
    if [ ! -d "$log_dir" ]; then
        mkdir -p "$log_dir" 2>/dev/null || true
    fi
}

# Log an error in structured format
# Usage: log_error "CATEGORY" "message" [exit_code]
log_error() {
    local category="${1:-UNKNOWN}"
    local message="${2:-Unknown error}"
    local exit_code="${3:-$EXIT_UNKNOWN_ERROR}"
    local timestamp
    timestamp="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

    # Print to stderr
    echo "[${category}] ${message}" >&2

    # Log to file if logging is enabled
    if [ "${SF_DISABLE_ERROR_LOG:-0}" != "1" ]; then
        _ensure_log_dir
        local log_entry
        log_entry=$(cat <<EOF
{"timestamp":"${timestamp}","category":"${category}","message":"${message}","exitCode":${exit_code},"command":"${SF_CURRENT_COMMAND:-}","context":{"cwd":"$(pwd)","org":"${SF_TARGET_ORG:-${SFDC_INSTANCE:-}}"}}
EOF
)
        echo "$log_entry" >> "$SF_ERROR_LOG" 2>/dev/null || true
    fi
}

# Log a warning (non-fatal)
log_warning() {
    local message="${1:-Warning}"
    echo "[WARNING] ${message}" >&2
}

# Log info message
log_info() {
    local message="${1:-Info}"
    if [ "${SF_VERBOSE:-0}" = "1" ]; then
        echo "[INFO] ${message}" >&2
    fi
}

# Log success message
log_success() {
    local message="${1:-Success}"
    echo "[SUCCESS] ${message}" >&2
}

# ============================================================================
# ERROR CLASSIFICATION
# ============================================================================

# Classify an error message and return appropriate exit code
# Usage: classify_error "error message"
# Returns: Sets $CLASSIFIED_CATEGORY and $CLASSIFIED_EXIT_CODE
classify_error() {
    local error_msg="${1:-}"
    local msg_lower
    msg_lower="$(echo "$error_msg" | tr '[:upper:]' '[:lower:]')"

    # Transient errors (retry-able)
    if echo "$msg_lower" | grep -qE 'econnreset|etimedout|enotfound|socket hang up|connection reset|network error|temporarily unavailable|503|502|504|service unavailable|gateway timeout|bad gateway'; then
        CLASSIFIED_CATEGORY="TRANSIENT"
        CLASSIFIED_EXIT_CODE=$EXIT_TRANSIENT_ERROR
        return 0
    fi

    # Rate limit errors
    if echo "$msg_lower" | grep -qE 'request_limit_exceeded|query_timeout|too many requests|rate limit|throttled|429|api limit exceeded|concurrent request limit'; then
        CLASSIFIED_CATEGORY="RATE_LIMIT"
        CLASSIFIED_EXIT_CODE=$EXIT_RATE_LIMIT
        return 0
    fi

    # Timeout errors
    if echo "$msg_lower" | grep -qE 'timeout|timed out|deadline exceeded'; then
        CLASSIFIED_CATEGORY="TIMEOUT"
        CLASSIFIED_EXIT_CODE=$EXIT_TIMEOUT
        return 0
    fi

    # Permission errors
    if echo "$msg_lower" | grep -qE 'insufficient_access|invalid_session|access denied|not authorized|permission denied|authentication failed|session expired'; then
        CLASSIFIED_CATEGORY="PERMISSION"
        CLASSIFIED_EXIT_CODE=$EXIT_PERMISSION_ERROR
        return 0
    fi

    # Config errors
    if echo "$msg_lower" | grep -qE 'no default org|org not found|alias not found|missing org|no project|outside of project'; then
        CLASSIFIED_CATEGORY="CONFIG_ERROR"
        CLASSIFIED_EXIT_CODE=$EXIT_CONFIG_ERROR
        return 0
    fi

    # CLI errors
    if echo "$msg_lower" | grep -qE 'command not found|cli not installed|enoent|spawn enoent|invalid command|unknown command'; then
        CLASSIFIED_CATEGORY="CLI_ERROR"
        CLASSIFIED_EXIT_CODE=$EXIT_CLI_ERROR
        return 0
    fi

    # Validation errors (default for most SF errors)
    if echo "$msg_lower" | grep -qE 'invalid_field|invalid_type|malformed|no such column|duplicate|required_field|does not exist'; then
        CLASSIFIED_CATEGORY="VALIDATION"
        CLASSIFIED_EXIT_CODE=$EXIT_VALIDATION_ERROR
        return 0
    fi

    # Unknown
    CLASSIFIED_CATEGORY="UNKNOWN"
    CLASSIFIED_EXIT_CODE=$EXIT_UNKNOWN_ERROR
    return 0
}

# ============================================================================
# RETRY HELPERS
# ============================================================================

# Check if an exit code indicates a retry-able error
# Usage: is_retryable $exit_code
is_retryable() {
    local code="${1:-0}"
    case $code in
        $EXIT_TRANSIENT_ERROR|$EXIT_RATE_LIMIT|$EXIT_TIMEOUT)
            return 0  # true - is retryable
            ;;
        *)
            return 1  # false - not retryable
            ;;
    esac
}

# Calculate retry delay with exponential backoff
# Usage: calculate_delay $attempt $base_delay $max_delay
calculate_delay() {
    local attempt="${1:-1}"
    local base_delay="${2:-2}"
    local max_delay="${3:-30}"

    # Exponential backoff: base * 2^(attempt-1)
    local delay
    delay=$(echo "$base_delay * (2 ^ ($attempt - 1))" | bc 2>/dev/null || echo "$base_delay")

    # Cap at max delay
    if [ "$delay" -gt "$max_delay" ] 2>/dev/null; then
        delay=$max_delay
    fi

    echo "$delay"
}

# Execute with retry
# Usage: execute_with_retry max_attempts command [args...]
execute_with_retry() {
    local max_attempts="${1:-3}"
    shift
    local cmd="$*"

    local attempt=1
    local last_exit_code=0
    local output=""

    while [ $attempt -le "$max_attempts" ]; do
        log_info "Attempt $attempt/$max_attempts: $cmd"

        # Execute command and capture output
        output=$(eval "$cmd" 2>&1)
        last_exit_code=$?

        if [ $last_exit_code -eq 0 ]; then
            echo "$output"
            return 0
        fi

        # Classify the error
        classify_error "$output"

        if ! is_retryable $CLASSIFIED_EXIT_CODE || [ $attempt -ge "$max_attempts" ]; then
            log_error "$CLASSIFIED_CATEGORY" "$output" "$CLASSIFIED_EXIT_CODE"
            echo "$output"
            return $CLASSIFIED_EXIT_CODE
        fi

        # Calculate delay and wait
        local delay
        delay=$(calculate_delay $attempt 2 30)
        log_info "Retryable error ($CLASSIFIED_CATEGORY), waiting ${delay}s..."
        sleep "$delay"

        attempt=$((attempt + 1))
    done

    echo "$output"
    return $last_exit_code
}

# ============================================================================
# SUGGESTION HELPERS
# ============================================================================

# Get suggestion for common errors
# Usage: get_suggestion "error message"
get_suggestion() {
    local error_msg="${1:-}"
    local msg_lower
    msg_lower="$(echo "$error_msg" | tr '[:upper:]' '[:lower:]')"

    if echo "$msg_lower" | grep -q "no source-backed components"; then
        echo "Run: sf project retrieve start -m \"<MetadataType>:<Name>\""
    elif echo "$msg_lower" | grep -q "no default org"; then
        echo "Set default org: sf config set target-org <alias>"
    elif echo "$msg_lower" | grep -q "alias not found"; then
        echo "Authenticate to org: sf org login web --alias <name>"
    elif echo "$msg_lower" | grep -q "command not found"; then
        echo "Install SF CLI: npm install -g @salesforce/cli"
    elif echo "$msg_lower" | grep -q "flowdefinitionview\|apexclass\|validationrule"; then
        echo "Add --use-tooling-api flag for metadata objects"
    else
        echo ""
    fi
}

# ============================================================================
# EXIT WITH PROPER CODE
# ============================================================================

# Exit with classified error code and logging
# Usage: exit_with_error "CATEGORY" "message"
exit_with_error() {
    local category="${1:-UNKNOWN}"
    local message="${2:-Unknown error}"
    local exit_code

    case "$category" in
        "VALIDATION")     exit_code=$EXIT_VALIDATION_ERROR ;;
        "TRANSIENT")      exit_code=$EXIT_TRANSIENT_ERROR ;;
        "PERMISSION")     exit_code=$EXIT_PERMISSION_ERROR ;;
        "CONFIG_ERROR")   exit_code=$EXIT_CONFIG_ERROR ;;
        "RATE_LIMIT")     exit_code=$EXIT_RATE_LIMIT ;;
        "TIMEOUT")        exit_code=$EXIT_TIMEOUT ;;
        "CLI_ERROR")      exit_code=$EXIT_CLI_ERROR ;;
        "MISSING_DEPENDENCY") exit_code=$EXIT_MISSING_DEPENDENCY ;;
        *)                exit_code=$EXIT_UNKNOWN_ERROR ;;
    esac

    log_error "$category" "$message" "$exit_code"

    # Print suggestion if available
    local suggestion
    suggestion=$(get_suggestion "$message")
    if [ -n "$suggestion" ]; then
        echo "  Suggestion: $suggestion" >&2
    fi

    exit $exit_code
}

# ============================================================================
# SELF-TEST
# ============================================================================

# Run self-test when called directly
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
    echo "sf-exit-codes.sh - Self Test"
    echo "=============================="
    echo ""
    echo "Exit Codes:"
    echo "  EXIT_SUCCESS=$EXIT_SUCCESS"
    echo "  EXIT_VALIDATION_ERROR=$EXIT_VALIDATION_ERROR"
    echo "  EXIT_MISSING_DEPENDENCY=$EXIT_MISSING_DEPENDENCY"
    echo "  EXIT_TRANSIENT_ERROR=$EXIT_TRANSIENT_ERROR"
    echo "  EXIT_PERMISSION_ERROR=$EXIT_PERMISSION_ERROR"
    echo "  EXIT_CONFIG_ERROR=$EXIT_CONFIG_ERROR"
    echo "  EXIT_RATE_LIMIT=$EXIT_RATE_LIMIT"
    echo "  EXIT_TIMEOUT=$EXIT_TIMEOUT"
    echo "  EXIT_CLI_ERROR=$EXIT_CLI_ERROR"
    echo "  EXIT_UNKNOWN_ERROR=$EXIT_UNKNOWN_ERROR"
    echo ""
    echo "Testing error classification..."

    # Test cases
    classify_error "ECONNRESET: Connection reset by peer"
    echo "  'ECONNRESET' -> $CLASSIFIED_CATEGORY (exit $CLASSIFIED_EXIT_CODE)"

    classify_error "REQUEST_LIMIT_EXCEEDED"
    echo "  'REQUEST_LIMIT_EXCEEDED' -> $CLASSIFIED_CATEGORY (exit $CLASSIFIED_EXIT_CODE)"

    classify_error "No default org found"
    echo "  'No default org' -> $CLASSIFIED_CATEGORY (exit $CLASSIFIED_EXIT_CODE)"

    classify_error "INVALID_FIELD: Account.BadField__c does not exist"
    echo "  'INVALID_FIELD' -> $CLASSIFIED_CATEGORY (exit $CLASSIFIED_EXIT_CODE)"

    classify_error "sf: command not found"
    echo "  'command not found' -> $CLASSIFIED_CATEGORY (exit $CLASSIFIED_EXIT_CODE)"

    echo ""
    echo "Testing suggestions..."
    echo "  'No source-backed components' -> $(get_suggestion 'No source-backed components present')"
    echo "  'No default org' -> $(get_suggestion 'No default org found')"

    echo ""
    echo "Testing retry check..."
    if is_retryable $EXIT_TRANSIENT_ERROR; then
        echo "  EXIT_TRANSIENT_ERROR ($EXIT_TRANSIENT_ERROR) is retryable: YES"
    fi
    if ! is_retryable $EXIT_VALIDATION_ERROR; then
        echo "  EXIT_VALIDATION_ERROR ($EXIT_VALIDATION_ERROR) is retryable: NO"
    fi

    echo ""
    echo "Self-test complete."
fi
