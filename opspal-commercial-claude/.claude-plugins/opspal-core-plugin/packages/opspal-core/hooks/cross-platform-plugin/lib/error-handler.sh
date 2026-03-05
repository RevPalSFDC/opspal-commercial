#!/bin/bash
# =============================================================================
# Standardized Error Handler Library for Hooks
# =============================================================================
#
# Purpose: Provides consistent error handling across all plugin hooks
# Version: 1.0.0
# Created: 2025-11-24
#
# Usage: Source this file at the top of any hook script
#
#   source "$(dirname "${BASH_SOURCE[0]}")/../hooks/lib/error-handler.sh"
#
#   # Set strict error handling
#   set_strict_mode
#
#   # Log with context
#   log_info "Starting operation..."
#   log_error "Something failed" "operation_name" "additional_context"
#
#   # Exit with proper code
#   exit_with_error 1 "Operation failed" "deployment"
#
# =============================================================================

# Exit codes (standardized across all hooks)
readonly EXIT_SUCCESS=0
readonly EXIT_GENERAL_ERROR=1
readonly EXIT_INVALID_ARGS=2
readonly EXIT_NOT_FOUND=3
readonly EXIT_PERMISSION_DENIED=4
readonly EXIT_TIMEOUT=5
readonly EXIT_DEPENDENCY_MISSING=6
readonly EXIT_VALIDATION_FAILED=7

# Color codes for output
readonly RED='\033[0;31m'
readonly YELLOW='\033[0;33m'
readonly GREEN='\033[0;32m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m' # No Color

# Global configuration
ERROR_LOG_FILE="${HOME}/.claude/logs/hook-errors.jsonl"
ENABLE_CENTRALIZED_LOGGING="${ENABLE_CENTRALIZED_LOGGING:-1}"
HOOK_NAME="${HOOK_NAME:-unknown}"

# =============================================================================
# Core Functions
# =============================================================================

# Set strict error handling mode (recommended for all hooks)
set_strict_mode() {
    set -euo pipefail
    trap 'handle_error $? $LINENO "$BASH_COMMAND"' ERR
}

# Set lenient mode (only for hooks that need to continue on errors)
set_lenient_mode() {
    set +e
    trap - ERR
}

# Handle trapped errors
handle_error() {
    local exit_code=$1
    local line_number=$2
    local command="$3"

    log_error "Command failed: ${command}" "line_${line_number}" "exit_code=${exit_code}"

    # Don't exit if in lenient mode
    if [[ "${LENIENT_MODE:-0}" == "1" ]]; then
        return 0
    fi
}

# =============================================================================
# Logging Functions
# =============================================================================

# Get timestamp in ISO 8601 format
get_timestamp() {
    date -u +"%Y-%m-%dT%H:%M:%SZ"
}

# Log info message
log_info() {
    local message="$1"
    echo -e "${BLUE}[INFO]${NC} [$(get_timestamp)] ${message}" >&2
}

# Log success message
log_success() {
    local message="$1"
    echo -e "${GREEN}[SUCCESS]${NC} [$(get_timestamp)] ${message}" >&2
}

# Log warning message
log_warn() {
    local message="$1"
    local context="${2:-}"
    echo -e "${YELLOW}[WARN]${NC} [$(get_timestamp)] ${message}" >&2

    if [[ "$ENABLE_CENTRALIZED_LOGGING" == "1" ]]; then
        log_to_central "warn" "$message" "$context" ""
    fi
}

# Log error message
log_error() {
    local message="$1"
    local context="${2:-}"
    local details="${3:-}"
    echo -e "${RED}[ERROR]${NC} [$(get_timestamp)] ${message}" >&2

    if [[ -n "$context" ]]; then
        echo -e "${RED}       Context:${NC} ${context}" >&2
    fi
    if [[ -n "$details" ]]; then
        echo -e "${RED}       Details:${NC} ${details}" >&2
    fi

    if [[ "$ENABLE_CENTRALIZED_LOGGING" == "1" ]]; then
        log_to_central "error" "$message" "$context" "$details"
    fi
}

# Log to centralized location (JSON Lines format)
log_to_central() {
    local level="$1"
    local message="$2"
    local context="$3"
    local details="$4"

    # Ensure log directory exists
    mkdir -p "$(dirname "$ERROR_LOG_FILE")" 2>/dev/null || true

    # Escape special characters for JSON
    message=$(echo "$message" | sed 's/"/\\"/g' | tr '\n' ' ')
    context=$(echo "$context" | sed 's/"/\\"/g' | tr '\n' ' ')
    details=$(echo "$details" | sed 's/"/\\"/g' | tr '\n' ' ')

    # Write JSON line
    echo "{\"timestamp\":\"$(get_timestamp)\",\"level\":\"${level}\",\"hook\":\"${HOOK_NAME}\",\"message\":\"${message}\",\"context\":\"${context}\",\"details\":\"${details}\"}" >> "$ERROR_LOG_FILE" 2>/dev/null || true
}

# =============================================================================
# Exit Functions
# =============================================================================

# Exit with error (explicit failure)
exit_with_error() {
    local code="${1:-1}"
    local message="${2:-Unknown error}"
    local operation="${3:-}"

    log_error "$message" "$operation" "exit_code=$code"
    exit "$code"
}

# Exit with success
exit_success() {
    local message="${1:-Operation completed successfully}"
    log_success "$message"
    exit $EXIT_SUCCESS
}

# Exit silently (for hooks that should not affect user experience)
exit_silent() {
    local code="${1:-0}"
    exit "$code"
}

# =============================================================================
# Validation Functions
# =============================================================================

# Check if required command exists
require_command() {
    local cmd="$1"
    local purpose="${2:-required}"

    if ! command -v "$cmd" &> /dev/null; then
        log_error "Missing required command: $cmd" "dependency_check" "Purpose: $purpose"
        return $EXIT_DEPENDENCY_MISSING
    fi
    return 0
}

# Check if required environment variable is set
require_env() {
    local var_name="$1"
    local purpose="${2:-required}"

    if [[ -z "${!var_name:-}" ]]; then
        log_error "Missing required environment variable: $var_name" "env_check" "Purpose: $purpose"
        return $EXIT_VALIDATION_FAILED
    fi
    return 0
}

# Check if file exists
require_file() {
    local file_path="$1"
    local purpose="${2:-required}"

    if [[ ! -f "$file_path" ]]; then
        log_error "Required file not found: $file_path" "file_check" "Purpose: $purpose"
        return $EXIT_NOT_FOUND
    fi
    return 0
}

# =============================================================================
# Timeout Functions
# =============================================================================

# Run command with timeout
run_with_timeout() {
    local timeout_seconds="$1"
    shift
    local cmd="$@"

    if command -v timeout &> /dev/null; then
        timeout "$timeout_seconds" bash -c "$cmd"
        return $?
    else
        # Fallback for systems without timeout command
        bash -c "$cmd" &
        local pid=$!
        local count=0
        while kill -0 $pid 2>/dev/null; do
            sleep 1
            ((count++))
            if [[ $count -ge $timeout_seconds ]]; then
                kill -9 $pid 2>/dev/null
                log_error "Command timed out after ${timeout_seconds}s" "timeout" "$cmd"
                return $EXIT_TIMEOUT
            fi
        done
        wait $pid
        return $?
    fi
}

# =============================================================================
# Circuit Breaker Integration
# =============================================================================

# Check if circuit breaker is open (skip execution if too many failures)
check_circuit_breaker() {
    local hook_name="${1:-$HOOK_NAME}"
    local state_file="${HOME}/.claude/circuit-breaker/${hook_name}.state"

    if [[ -f "$state_file" ]]; then
        local state=$(cat "$state_file" 2>/dev/null || echo "CLOSED")
        if [[ "$state" == "OPEN" ]]; then
            log_warn "Circuit breaker OPEN for $hook_name - skipping execution"
            return 1
        fi
    fi
    return 0
}

# Record failure for circuit breaker
record_failure() {
    local hook_name="${1:-$HOOK_NAME}"
    local state_dir="${HOME}/.claude/circuit-breaker"
    local failures_file="${state_dir}/${hook_name}.failures"

    mkdir -p "$state_dir" 2>/dev/null || true

    local failures=0
    if [[ -f "$failures_file" ]]; then
        failures=$(cat "$failures_file" 2>/dev/null || echo "0")
    fi

    ((failures++))
    echo "$failures" > "$failures_file"

    # Open circuit after 5 consecutive failures
    if [[ $failures -ge 5 ]]; then
        echo "OPEN" > "${state_dir}/${hook_name}.state"
        log_warn "Circuit breaker OPENED for $hook_name after $failures failures"
    fi
}

# Record success (reset failure count)
record_success() {
    local hook_name="${1:-$HOOK_NAME}"
    local state_dir="${HOME}/.claude/circuit-breaker"

    # Reset failure count
    echo "0" > "${state_dir}/${hook_name}.failures" 2>/dev/null || true

    # Close circuit if it was open
    if [[ -f "${state_dir}/${hook_name}.state" ]]; then
        echo "CLOSED" > "${state_dir}/${hook_name}.state"
    fi
}

# =============================================================================
# Utility Functions
# =============================================================================

# Safe JSON parsing (requires jq)
safe_json_parse() {
    local json="$1"
    local query="$2"
    local default="${3:-}"

    if ! command -v jq &> /dev/null; then
        echo "$default"
        return 0
    fi

    local result
    result=$(echo "$json" | jq -r "$query" 2>/dev/null) || result="$default"

    if [[ "$result" == "null" || -z "$result" ]]; then
        echo "$default"
    else
        echo "$result"
    fi
}

# =============================================================================
# Initialization
# =============================================================================

# Create log directory if it doesn't exist
mkdir -p "$(dirname "$ERROR_LOG_FILE")" 2>/dev/null || true

# Export functions for use in subshells
export -f log_info log_warn log_error log_success
export -f exit_with_error exit_success exit_silent
export -f require_command require_env require_file
export -f run_with_timeout
export -f check_circuit_breaker record_failure record_success
export -f safe_json_parse get_timestamp

# =============================================================================
# End of Library
# =============================================================================
