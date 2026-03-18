#!/bin/bash
# sf-wrapper.sh - Instance-agnostic Salesforce CLI wrapper
# Suppresses update warnings and provides consistent error handling with retry logic
#
# Features:
# - Automatic retry for transient errors (network, timeout, rate limit)
# - Structured error classification and logging
# - Warning suppression for SF CLI update messages
# - Backward compatible with existing usage
#
# Usage:
#   source sf-wrapper.sh
#   sf_exec data query --query "SELECT Id FROM Account"
#   sf_exec_safe data query --query "SELECT Id FROM Account"  # With retry
#
# Environment Variables:
#   SF_MAX_RETRIES     - Maximum retry attempts (default: 3)
#   SF_RETRY_DELAY     - Base retry delay in seconds (default: 2)
#   SF_VERBOSE         - Enable verbose output (default: 0)
#   SF_DISABLE_RETRY   - Disable automatic retry (default: 0)

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source shell commons if available
if [ -f "${SCRIPT_DIR}/shell-commons.sh" ]; then
    source "${SCRIPT_DIR}/shell-commons.sh"
fi

# Source exit codes
if [ -f "${SCRIPT_DIR}/sf-exit-codes.sh" ]; then
    source "${SCRIPT_DIR}/sf-exit-codes.sh"
else
    # Fallback exit codes if file not found
    readonly EXIT_SUCCESS=0
    readonly EXIT_VALIDATION_ERROR=1
    readonly EXIT_TRANSIENT_ERROR=3
    readonly EXIT_RATE_LIMIT=6
    readonly EXIT_TIMEOUT=7
    readonly EXIT_CLI_ERROR=8
fi

# Configuration
export SF_HIDE_RELEASE_NOTES=true
export SF_DISABLE_AUTOUPDATE=true
export SF_SKIP_NEW_VERSION_CHECK=true

# Retry configuration (can be overridden via environment)
SF_MAX_RETRIES="${SF_MAX_RETRIES:-3}"
SF_RETRY_DELAY="${SF_RETRY_DELAY:-2}"
SF_MAX_DELAY="${SF_MAX_DELAY:-30}"
SF_VERBOSE="${SF_VERBOSE:-0}"
SF_DISABLE_RETRY="${SF_DISABLE_RETRY:-0}"

# Resolve sf binary in environments with minimal PATH (for example cron)
resolve_sf_binary() {
    local candidates=()

    # Explicit override first
    if [ -n "${SF_CLI_BIN:-}" ] && [ -x "${SF_CLI_BIN}" ]; then
        echo "${SF_CLI_BIN}"
        return 0
    fi

    # Already discoverable
    if command -v sf >/dev/null 2>&1; then
        command -v sf
        return 0
    fi

    # Common locations (npm global, nvm-managed node bins, local installs)
    candidates+=(
        "${HOME}/.local/share/sf/bin/sf"
        "${HOME}/.npm-global/bin/sf"
        "${HOME}/bin/sf"
        "/usr/local/bin/sf"
        "/opt/homebrew/bin/sf"
        "/usr/bin/sf"
    )

    # nvm installs: prefer the highest lexical version available
    local nvm_candidate=""
    for bin_dir in "${HOME}"/.nvm/versions/node/*/bin; do
        if [ -x "${bin_dir}/sf" ]; then
            nvm_candidate="${bin_dir}/sf"
        fi
    done
    if [ -n "${nvm_candidate}" ]; then
        candidates=("${nvm_candidate}" "${candidates[@]}")
    fi

    local candidate
    for candidate in "${candidates[@]}"; do
        if [ -x "${candidate}" ]; then
            echo "${candidate}"
            return 0
        fi
    done

    return 1
}

ensure_sf_in_path() {
    local sf_path
    sf_path="$(resolve_sf_binary 2>/dev/null)" || return 1

    local sf_dir
    sf_dir="$(dirname "${sf_path}")"
    if [[ ":${PATH}:" != *":${sf_dir}:"* ]]; then
        export PATH="${sf_dir}:${PATH}"
    fi

    export SF_CLI_BIN="${sf_path}"
    return 0
}

# Suppress update warnings in output
suppress_update_warnings() {
    grep -v "Warning.*update available" | \
    grep -v "@salesforce/cli update available" | \
    grep -v "npm update" | \
    grep -v "A new version of"
}

# ============================================================================
# ERROR CLASSIFICATION (inline for performance when sf-exit-codes.sh missing)
# ============================================================================

# Classify error and set CLASSIFIED_CATEGORY and CLASSIFIED_EXIT_CODE
_classify_sf_error() {
    local error_msg="${1:-}"
    local msg_lower
    msg_lower="$(echo "$error_msg" | tr '[:upper:]' '[:lower:]')"

    # Transient errors (retry-able)
    if echo "$msg_lower" | grep -qE 'econnreset|etimedout|enotfound|socket hang up|connection reset|network error|temporarily unavailable|503|502|504|service unavailable|gateway timeout|bad gateway'; then
        CLASSIFIED_CATEGORY="TRANSIENT"
        CLASSIFIED_EXIT_CODE=${EXIT_TRANSIENT_ERROR:-3}
        CLASSIFIED_RETRYABLE=1
        return 0
    fi

    # Rate limit errors
    if echo "$msg_lower" | grep -qE 'request_limit_exceeded|query_timeout|too many requests|rate limit|throttled|429|api limit exceeded|concurrent request limit'; then
        CLASSIFIED_CATEGORY="RATE_LIMIT"
        CLASSIFIED_EXIT_CODE=${EXIT_RATE_LIMIT:-6}
        CLASSIFIED_RETRYABLE=1
        return 0
    fi

    # Timeout errors
    if echo "$msg_lower" | grep -qE 'timeout|timed out|deadline exceeded'; then
        CLASSIFIED_CATEGORY="TIMEOUT"
        CLASSIFIED_EXIT_CODE=${EXIT_TIMEOUT:-7}
        CLASSIFIED_RETRYABLE=1
        return 0
    fi

    # All other errors are not retryable
    CLASSIFIED_CATEGORY="OTHER"
    CLASSIFIED_EXIT_CODE=${EXIT_VALIDATION_ERROR:-1}
    CLASSIFIED_RETRYABLE=0
    return 0
}

# Calculate exponential backoff delay
_calculate_backoff() {
    local attempt="${1:-1}"
    local base="${SF_RETRY_DELAY:-2}"
    local max="${SF_MAX_DELAY:-30}"

    # Exponential: base * 2^(attempt-1)
    local delay
    if command -v bc >/dev/null 2>&1; then
        delay=$(echo "$base * (2 ^ ($attempt - 1))" | bc 2>/dev/null)
    else
        # Fallback without bc
        delay=$((base * (1 << (attempt - 1))))
    fi

    # Cap at max
    if [ "$delay" -gt "$max" ] 2>/dev/null; then
        delay=$max
    fi

    echo "$delay"
}

# Log message if verbose
_log_verbose() {
    if [ "${SF_VERBOSE:-0}" = "1" ]; then
        echo "[sf-wrapper] $*" >&2
    fi
}

# Sync local instance auth if needed
sync_sf_auth() {
    if [[ "${SF_AUTH_SYNC:-1}" != "1" ]]; then
        return 0
    fi

    local sync_script
    sync_script="$(dirname "$0")/sf-auth-sync.js"

    if [ ! -f "$sync_script" ] || ! command -v node >/dev/null 2>&1; then
        return 0
    fi

    local org_alias="${SFDC_INSTANCE:-${SF_TARGET_ORG:-${ORG:-}}}"
    local instance_dir="${INSTANCE_DIR:-}"
    local args=("--quiet")

    if [ -n "$org_alias" ]; then
        args+=("--org" "$org_alias")
    fi

    if [ -n "$instance_dir" ]; then
        args+=("--instance-dir" "$instance_dir")
    fi

    node "$sync_script" "${args[@]}" >/dev/null 2>&1 || true
}

# Execute SF command with warning suppression (original function, backward compatible)
sf_exec() {
    local cmd="$1"
    shift

    # Set environment to suppress warnings
    export NODE_NO_WARNINGS=1
    export SF_HIDE_RELEASE_NOTES=true
    sync_sf_auth
    ensure_sf_in_path >/dev/null 2>&1 || true

    # Execute command and filter warnings
    if command -v sf >/dev/null 2>&1; then
        sf $cmd "$@" 2>&1 | suppress_update_warnings
        return ${PIPESTATUS[0]}
    else
        echo "Error: Salesforce CLI (sf) not found" >&2
        return ${EXIT_CLI_ERROR:-8}
    fi
}

# ============================================================================
# ENHANCED EXECUTION WITH RETRY
# ============================================================================

# Execute SF command with automatic retry for transient errors
# Usage: sf_exec_safe <subcommand> [args...]
# Returns: Exit code from error taxonomy (0=success, 1=validation, 3=transient, etc.)
sf_exec_safe() {
    local cmd="$1"
    shift
    local full_cmd="sf $cmd $*"

    # If retry is disabled, use simple execution
    if [ "${SF_DISABLE_RETRY:-0}" = "1" ]; then
        sf_exec "$cmd" "$@"
        return $?
    fi

    local max_attempts="${SF_MAX_RETRIES:-3}"
    local attempt=1
    local output=""
    local exit_code=0

    # Set environment
    export NODE_NO_WARNINGS=1
    export SF_HIDE_RELEASE_NOTES=true
    export SF_CURRENT_COMMAND="$full_cmd"
    sync_sf_auth
    ensure_sf_in_path >/dev/null 2>&1 || true

    # Check if sf is available
    if ! command -v sf >/dev/null 2>&1; then
        echo "Error: Salesforce CLI (sf) not found" >&2
        echo "  Suggestion: Install SF CLI: npm install -g @salesforce/cli" >&2
        return ${EXIT_CLI_ERROR:-8}
    fi

    while [ $attempt -le "$max_attempts" ]; do
        _log_verbose "Attempt $attempt/$max_attempts: $full_cmd"

        # Execute and capture both stdout and stderr
        # Use temp file to preserve exit code through pipe
        local tmpfile
        tmpfile=$(mktemp)

        sf $cmd "$@" > "$tmpfile" 2>&1
        exit_code=$?

        output=$(cat "$tmpfile" | suppress_update_warnings)
        rm -f "$tmpfile"

        # Success - return output
        if [ $exit_code -eq 0 ]; then
            echo "$output"
            return 0
        fi

        # Classify the error
        _classify_sf_error "$output"

        _log_verbose "Error classified as: $CLASSIFIED_CATEGORY (retryable: $CLASSIFIED_RETRYABLE)"

        # If not retryable or last attempt, return error
        if [ "$CLASSIFIED_RETRYABLE" != "1" ] || [ $attempt -ge "$max_attempts" ]; then
            echo "$output"

            # Log to structured log if sf-exit-codes.sh is available
            if type log_error &>/dev/null; then
                log_error "$CLASSIFIED_CATEGORY" "$output" "$CLASSIFIED_EXIT_CODE"
            fi

            return $CLASSIFIED_EXIT_CODE
        fi

        # Calculate delay and wait
        local delay
        delay=$(_calculate_backoff $attempt)
        _log_verbose "Waiting ${delay}s before retry..."
        sleep "$delay"

        attempt=$((attempt + 1))
    done

    # Should not reach here, but safety return
    echo "$output"
    return ${EXIT_VALIDATION_ERROR:-1}
}

# Execute SF command and fail explicitly on error (no silent fallbacks)
# Usage: sf_exec_strict <subcommand> [args...]
# Unlike || echo patterns, this will return actual error, never fake data
sf_exec_strict() {
    local output
    local exit_code

    output=$(sf_exec_safe "$@")
    exit_code=$?

    if [ $exit_code -ne 0 ]; then
        echo "SF CLI Error (exit $exit_code):" >&2
        echo "$output" >&2
        return $exit_code
    fi

    echo "$output"
    return 0
}

# Execute SF query and validate non-empty result
# Usage: sf_query_safe "<SOQL>" [--target-org <alias>]
# Returns error if query fails OR returns empty result
sf_query_safe() {
    local query="$1"
    shift

    local output
    local exit_code

    output=$(sf_exec_safe data query --query "$query" "$@")
    exit_code=$?

    if [ $exit_code -ne 0 ]; then
        return $exit_code
    fi

    # Check for empty result (common silent failure pattern)
    if echo "$output" | grep -q '"totalSize": 0\|"totalSize":0\|"records": \[\]\|"records":\[\]'; then
        _log_verbose "Query returned empty result"
        # This is not an error, just log it
    fi

    echo "$output"
    return 0
}

# Main execution if called directly
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
    case "$1" in
        --help|-h)
            cat <<'EOF'
sf-wrapper.sh - Salesforce CLI wrapper with retry logic

Usage:
  sf-wrapper.sh [options] <command> [args...]
  sf-wrapper.sh --safe <command> [args...]    # With retry
  sf-wrapper.sh --strict <command> [args...]  # Fail explicitly on error
  sf-wrapper.sh --test                         # Run self-test

Options:
  --safe      Use sf_exec_safe (automatic retry for transient errors)
  --strict    Use sf_exec_strict (fail explicitly, no silent fallbacks)
  --verbose   Enable verbose output
  --test      Run self-test

Environment Variables:
  SF_MAX_RETRIES     Maximum retry attempts (default: 3)
  SF_RETRY_DELAY     Base retry delay in seconds (default: 2)
  SF_VERBOSE         Enable verbose output (default: 0)
  SF_DISABLE_RETRY   Disable automatic retry (default: 0)

Examples:
  sf-wrapper.sh data query --query "SELECT Id FROM Account"
  sf-wrapper.sh --safe data query --query "SELECT Id FROM Account"
  SF_VERBOSE=1 sf-wrapper.sh --safe org display

Exit Codes:
  0 - Success
  1 - Validation error (not retryable)
  3 - Transient error (retryable, exhausted retries)
  6 - Rate limit exceeded
  7 - Timeout
  8 - CLI not found
EOF
            exit 0
            ;;

        --test)
            echo "sf-wrapper.sh - Self Test"
            echo "========================="
            echo ""
            echo "Configuration:"
            echo "  SF_MAX_RETRIES=$SF_MAX_RETRIES"
            echo "  SF_RETRY_DELAY=$SF_RETRY_DELAY"
            echo "  SF_MAX_DELAY=$SF_MAX_DELAY"
            echo ""
            echo "Testing error classification..."

            _classify_sf_error "ECONNRESET: Connection reset by peer"
            echo "  'ECONNRESET' -> $CLASSIFIED_CATEGORY (retryable: $CLASSIFIED_RETRYABLE, exit: $CLASSIFIED_EXIT_CODE)"

            _classify_sf_error "REQUEST_LIMIT_EXCEEDED"
            echo "  'REQUEST_LIMIT_EXCEEDED' -> $CLASSIFIED_CATEGORY (retryable: $CLASSIFIED_RETRYABLE, exit: $CLASSIFIED_EXIT_CODE)"

            _classify_sf_error "INVALID_FIELD: BadField__c does not exist"
            echo "  'INVALID_FIELD' -> $CLASSIFIED_CATEGORY (retryable: $CLASSIFIED_RETRYABLE, exit: $CLASSIFIED_EXIT_CODE)"

            echo ""
            echo "Testing backoff calculation..."
            echo "  Attempt 1: $(_calculate_backoff 1)s"
            echo "  Attempt 2: $(_calculate_backoff 2)s"
            echo "  Attempt 3: $(_calculate_backoff 3)s"

            echo ""
            echo "Checking SF CLI availability..."
            if command -v sf >/dev/null 2>&1; then
                echo "  SF CLI: $(sf --version 2>/dev/null | head -1)"
            else
                echo "  SF CLI: NOT FOUND"
            fi

            echo ""
            echo "Self-test complete."
            exit 0
            ;;

        --safe)
            shift
            sf_exec_safe "$@"
            exit $?
            ;;

        --strict)
            shift
            sf_exec_strict "$@"
            exit $?
            ;;

        --verbose)
            export SF_VERBOSE=1
            shift
            sf_exec_safe "$@"
            exit $?
            ;;

        sf)
            shift
            sf_exec "$@"
            exit $?
            ;;

        sfdx)
            echo "Error: Legacy sfdx commands are not supported. Use 'sf' instead." >&2
            exit ${EXIT_CLI_ERROR:-8}
            ;;

        *)
            # Default to sf_exec (backward compatible)
            sf_exec "$@"
            exit $?
            ;;
    esac
fi
