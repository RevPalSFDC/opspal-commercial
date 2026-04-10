#!/usr/bin/env bash
# =============================================================================
# Standardized Error Handler Library for Hooks
# =============================================================================
#
# Purpose: Provides consistent error handling and shared utilities across all plugin hooks
# Version: 2.0.0
# Created: 2025-11-24
# Updated: 2026-01-09 - Added project/platform detection, context caching, routing helpers
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
if ! declare -p EXIT_SUCCESS >/dev/null 2>&1; then readonly EXIT_SUCCESS=0; fi
if ! declare -p EXIT_GENERAL_ERROR >/dev/null 2>&1; then readonly EXIT_GENERAL_ERROR=1; fi
if ! declare -p EXIT_INVALID_ARGS >/dev/null 2>&1; then readonly EXIT_INVALID_ARGS=2; fi
if ! declare -p EXIT_NOT_FOUND >/dev/null 2>&1; then readonly EXIT_NOT_FOUND=3; fi
if ! declare -p EXIT_PERMISSION_DENIED >/dev/null 2>&1; then readonly EXIT_PERMISSION_DENIED=4; fi
if ! declare -p EXIT_TIMEOUT >/dev/null 2>&1; then readonly EXIT_TIMEOUT=5; fi
if ! declare -p EXIT_DEPENDENCY_MISSING >/dev/null 2>&1; then readonly EXIT_DEPENDENCY_MISSING=6; fi
if ! declare -p EXIT_VALIDATION_FAILED >/dev/null 2>&1; then readonly EXIT_VALIDATION_FAILED=7; fi

# Color codes for output
if ! declare -p RED >/dev/null 2>&1; then readonly RED='\033[0;31m'; fi
if ! declare -p YELLOW >/dev/null 2>&1; then readonly YELLOW='\033[0;33m'; fi
if ! declare -p GREEN >/dev/null 2>&1; then readonly GREEN='\033[0;32m'; fi
if ! declare -p BLUE >/dev/null 2>&1; then readonly BLUE='\033[0;34m'; fi
if ! declare -p NC >/dev/null 2>&1; then readonly NC='\033[0m'; fi # No Color

# Global configuration
ERROR_LOG_FILE="${HOME}/.claude/logs/hook-errors.jsonl"
ERROR_LOG_FALLBACK_FILE="/tmp/.claude/logs/hook-errors.jsonl"
ENABLE_CENTRALIZED_LOGGING="${ENABLE_CENTRALIZED_LOGGING:-1}"
HOOK_NAME="${HOOK_NAME:-unknown}"
HOOK_PHASE="${HOOK_PHASE:-unknown}"
HOOK_TRIGGERING_ACTION="${HOOK_TRIGGERING_ACTION:-}"
HOOK_RETRY_COUNT="${HOOK_RETRY_COUNT:-0}"
HOOK_RECOVERY_SUCCEEDED="${HOOK_RECOVERY_SUCCEEDED:-}"
HOOK_LAST_EXIT_CODE="${HOOK_LAST_EXIT_CODE:-}"
ENABLE_HOOK_STACK_TRACE="${ENABLE_HOOK_STACK_TRACE:-0}"

resolve_log_file_path() {
    local preferred_file="$1"
    local fallback_file="${2:-$ERROR_LOG_FALLBACK_FILE}"
    local preferred_dir
    local fallback_dir
    preferred_dir="$(dirname "$preferred_file")"
    fallback_dir="$(dirname "$fallback_file")"

    if mkdir -p "$preferred_dir" 2>/dev/null && [ -w "$preferred_dir" ]; then
        echo "$preferred_file"
        return 0
    fi

    if mkdir -p "$fallback_dir" 2>/dev/null && [ -w "$fallback_dir" ]; then
        echo "$fallback_file"
        return 0
    fi

    echo ""
    return 1
}

append_jsonl_with_fallback() {
    local line="$1"
    local preferred_file="$2"
    local fallback_file="${3:-$ERROR_LOG_FALLBACK_FILE}"
    local resolved_file
    resolved_file="$(resolve_log_file_path "$preferred_file" "$fallback_file" || true)"

    if [[ -z "$resolved_file" ]]; then
        return 1
    fi

    printf '%s\n' "$line" >> "$resolved_file" 2>/dev/null || return 1
    return 0
}

escape_json_string() {
    local value="${1:-}"
    printf '%s' "$value" | sed 's/\\/\\\\/g; s/"/\\"/g' | tr '\n' ' '
}

normalize_integer() {
    local value="${1:-0}"
    if [[ "$value" =~ ^-?[0-9]+$ ]]; then
        printf '%s' "$value"
    else
        printf '0'
    fi
}

normalize_boolean_or_empty() {
    local value="${1:-}"
    case "${value,,}" in
        true|1|yes|on)
            printf 'true'
            ;;
        false|0|no|off)
            printf 'false'
            ;;
        *)
            printf '""'
            ;;
    esac
}

capture_hook_stack_trace() {
    if [[ "${ENABLE_HOOK_STACK_TRACE:-0}" != "1" ]]; then
        printf ''
        return 0
    fi

    local frames=()
    local idx=1
    local max_frames=4

    while [[ $idx -lt ${#FUNCNAME[@]} ]] && [[ ${#frames[@]} -lt $max_frames ]]; do
        local fn_name="${FUNCNAME[$idx]:-main}"
        local source_file="${BASH_SOURCE[$idx]:-unknown}"
        local line_number="${BASH_LINENO[$((idx - 1))]:-0}"
        frames+=("${fn_name}@$(basename "$source_file"):${line_number}")
        idx=$((idx + 1))
    done

    local IFS=' | '
    printf '%s' "${frames[*]}"
}

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
    set +eu
    trap - ERR
}

# Handle trapped errors
handle_error() {
    local exit_code=$1
    local line_number=$2
    local command="$3"
    HOOK_LAST_EXIT_CODE="$exit_code"

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
    local stack_trace
    local retry_count
    local exit_code
    local recovery_succeeded
    local triggering_action
    local hook_phase

    stack_trace="$(capture_hook_stack_trace)"
    retry_count="$(normalize_integer "$HOOK_RETRY_COUNT")"
    exit_code="$(normalize_integer "$HOOK_LAST_EXIT_CODE")"
    recovery_succeeded="$(normalize_boolean_or_empty "$HOOK_RECOVERY_SUCCEEDED")"
    triggering_action="$(escape_json_string "$HOOK_TRIGGERING_ACTION")"
    hook_phase="$(escape_json_string "$HOOK_PHASE")"

    message="$(escape_json_string "$message")"
    context="$(escape_json_string "$context")"
    details="$(escape_json_string "$details")"
    stack_trace="$(escape_json_string "$stack_trace")"

    # Write JSON line
    append_jsonl_with_fallback \
        "{\"timestamp\":\"$(get_timestamp)\",\"level\":\"$(escape_json_string "$level")\",\"hook\":\"$(escape_json_string "$HOOK_NAME")\",\"hook_phase\":\"${hook_phase}\",\"triggering_action\":\"${triggering_action}\",\"message\":\"${message}\",\"context\":\"${context}\",\"details\":\"${details}\",\"exit_code\":${exit_code},\"retry_count\":${retry_count},\"recovery_succeeded\":${recovery_succeeded},\"stack_trace\":\"${stack_trace}\"}" \
        "$ERROR_LOG_FILE" \
        "$ERROR_LOG_FALLBACK_FILE" \
        || true
}

# =============================================================================
# Exit Functions
# =============================================================================

# Exit with error (explicit failure)
exit_with_error() {
    local code="${1:-1}"
    local message="${2:-Unknown error}"
    local operation="${3:-}"
    HOOK_LAST_EXIT_CODE="$code"

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
# Project & Platform Detection Functions (Consolidated - v2.0.0)
# =============================================================================

# Find project root by searching for marker directories
# Returns: Absolute path to project root, or PWD as fallback
find_project_root() {
    local current_dir="${1:-$PWD}"
    local max_depth="${2:-10}"
    local depth=0

    # Marker directories to search for (in priority order)
    local markers=(".claude-plugins" ".claude" ".git" "package.json")

    while [[ "$depth" -lt "$max_depth" ]]; do
        for marker in "${markers[@]}"; do
            if [[ -e "$current_dir/$marker" ]]; then
                echo "$current_dir"
                return 0
            fi
        done

        # Stop at filesystem root
        if [[ "$current_dir" == "/" ]]; then
            break
        fi

        current_dir="$(dirname "$current_dir")"
        ((depth++))
    done

    # Fallback: use original directory
    echo "${1:-$PWD}"
    return 1
}

# Detect platform from context (Salesforce, HubSpot, Marketo, or unknown)
# Returns: Platform name (salesforce, hubspot, marketo, unknown)
detect_platform() {
    local context="${1:-}"
    local cwd="${2:-$PWD}"

    # Check environment variables first
    if [[ -n "${SF_TARGET_ORG:-}" ]] || [[ -n "${SALESFORCE_ORG_ALIAS:-}" ]]; then
        echo "salesforce"
        return 0
    fi

    if [[ -n "${HUBSPOT_PORTAL_ID:-}" ]] || [[ -n "${HUBSPOT_ACCESS_TOKEN:-}" ]]; then
        echo "hubspot"
        return 0
    fi

    if [[ -n "${MARKETO_CLIENT_ID:-}" ]] || [[ -n "${MARKETO_INSTANCE:-}" ]]; then
        echo "marketo"
        return 0
    fi

    # Check context/message for platform keywords
    local context_lower
    context_lower=$(echo "$context" | tr '[:upper:]' '[:lower:]')

    if echo "$context_lower" | grep -qE "(salesforce|sfdc|sf org|apex|soql|sobject|flow|permission set|cpq|revops)"; then
        echo "salesforce"
        return 0
    fi

    if echo "$context_lower" | grep -qE "(hubspot|portal|workflow|contact.*property|deal|hs_)"; then
        echo "hubspot"
        return 0
    fi

    if echo "$context_lower" | grep -qE "(marketo|munchkin|smart campaign|program|lead scoring)"; then
        echo "marketo"
        return 0
    fi

    # Check working directory path
    if echo "$cwd" | grep -qiE "(salesforce|sfdc|sf-)"; then
        echo "salesforce"
        return 0
    fi

    if echo "$cwd" | grep -qiE "(hubspot|hs-)"; then
        echo "hubspot"
        return 0
    fi

    if echo "$cwd" | grep -qiE "(marketo|mkto)"; then
        echo "marketo"
        return 0
    fi

    echo "unknown"
    return 0
}

# =============================================================================
# Context Caching Functions
# =============================================================================

CONTEXT_CACHE_DIR="${HOME}/.claude/context-cache"
CONTEXT_CACHE_TTL="${CONTEXT_CACHE_TTL:-300}"  # 5 minutes default

# Get cached context if valid
# Args: $1 - cache key
# Returns: Cached JSON or empty string
get_cached_context() {
    local cache_key="$1"
    local cache_file="${CONTEXT_CACHE_DIR}/${cache_key}.json"

    if [[ ! -f "$cache_file" ]]; then
        return 1
    fi

    # Check cache age
    local cache_time
    cache_time=$(stat -c %Y "$cache_file" 2>/dev/null || stat -f %m "$cache_file" 2>/dev/null || echo 0)
    local now
    now=$(date +%s)
    local age=$((now - cache_time))

    if [[ "$age" -lt "$CONTEXT_CACHE_TTL" ]]; then
        cat "$cache_file"
        return 0
    fi

    return 1
}

# Set context cache
# Args: $1 - cache key, $2 - JSON content
set_cached_context() {
    local cache_key="$1"
    local content="$2"

    mkdir -p "$CONTEXT_CACHE_DIR" 2>/dev/null || true

    local cache_file="${CONTEXT_CACHE_DIR}/${cache_key}.json"
    echo "$content" > "$cache_file" 2>/dev/null || true
}

# Clear context cache
# Args: $1 - cache key (optional, clears all if not provided)
clear_cached_context() {
    local cache_key="${1:-}"

    if [[ -n "$cache_key" ]]; then
        rm -f "${CONTEXT_CACHE_DIR}/${cache_key}.json" 2>/dev/null || true
    else
        rm -f "${CONTEXT_CACHE_DIR}"/*.json 2>/dev/null || true
    fi
}

# =============================================================================
# Environment File Loading
# =============================================================================

# Load environment variables from .env file
# Args: $1 - path to .env file
# Returns: 0 if loaded, 1 if not found
load_env_file() {
    local env_file="$1"

    if [[ -f "$env_file" ]]; then
        set -a
        # shellcheck disable=SC1090
        source "$env_file" 2>/dev/null || true
        set +a
        return 0
    fi
    return 1
}

# Load environment from project root (tries multiple locations)
# Args: $1 - project root (optional, auto-detected if not provided)
load_project_env() {
    local project_root="${1:-}"

    if [[ -z "$project_root" ]]; then
        project_root=$(find_project_root)
    fi

    local loaded=0

    # Try multiple .env file locations
    local env_files=(
        "$project_root/.env"
        "$project_root/.env.local"
        "$project_root/.claude/.env"
    )

    for env_file in "${env_files[@]}"; do
        if load_env_file "$env_file"; then
            ((loaded++))
        fi
    done

    return $((loaded > 0 ? 0 : 1))
}

# =============================================================================
# Routing Helper Functions
# =============================================================================

# Calculate task complexity score (0.0 - 1.0)
# Args: $1 - user message/task description
# Returns: Complexity score as decimal
calculate_complexity() {
    local message="$1"
    local message_lower
    message_lower=$(echo "$message" | tr '[:upper:]' '[:lower:]')

    local score=0

    # High complexity indicators (+0.3 each, max 0.9)
    if echo "$message_lower" | grep -qE "(production|prod deploy|merge.*main|release)"; then
        score=$(echo "$score + 0.3" | bc -l 2>/dev/null || echo "0.3")
    fi

    if echo "$message_lower" | grep -qE "(audit|assessment|comprehensive|full analysis)"; then
        score=$(echo "$score + 0.3" | bc -l 2>/dev/null || echo "0.3")
    fi

    if echo "$message_lower" | grep -qE "(migrate|bulk|mass|delete all|update all)"; then
        score=$(echo "$score + 0.3" | bc -l 2>/dev/null || echo "0.3")
    fi

    # Medium complexity indicators (+0.2 each)
    if echo "$message_lower" | grep -qE "(create|build|new|implement)"; then
        score=$(echo "$score + 0.2" | bc -l 2>/dev/null || echo "0.2")
    fi

    if echo "$message_lower" | grep -qE "(workflow|flow|automation|trigger)"; then
        score=$(echo "$score + 0.2" | bc -l 2>/dev/null || echo "0.2")
    fi

    if echo "$message_lower" | grep -qE "(permission|security|profile|role)"; then
        score=$(echo "$score + 0.2" | bc -l 2>/dev/null || echo "0.2")
    fi

    # Low complexity indicators (+0.1 each)
    if echo "$message_lower" | grep -qE "(query|search|find|list|show)"; then
        score=$(echo "$score + 0.1" | bc -l 2>/dev/null || echo "0.1")
    fi

    if echo "$message_lower" | grep -qE "(check|validate|verify|test)"; then
        score=$(echo "$score + 0.1" | bc -l 2>/dev/null || echo "0.1")
    fi

    # Cap at 1.0
    if command -v bc &> /dev/null; then
        local capped
        capped=$(echo "if ($score > 1.0) 1.0 else $score" | bc -l 2>/dev/null || echo "$score")
        printf "%.2f" "$capped"
    else
        echo "${score:-0}"
    fi
}

# Match routing pattern and return agent
# Args: $1 - user message, $2 - patterns file (JSON)
# Returns: Agent name or empty string
match_routing_pattern() {
    local message="$1"
    local patterns_file="${2:-}"
    local message_lower
    message_lower=$(echo "$message" | tr '[:upper:]' '[:lower:]')

    # If patterns file provided and jq available, use it
    if [[ -n "$patterns_file" ]] && [[ -f "$patterns_file" ]] && command -v jq &> /dev/null; then
        local patterns
        patterns=$(jq -r '.patterns[]? | "\(.keywords | join("|")):\(.agent)"' "$patterns_file" 2>/dev/null || echo "")

        while IFS=: read -r keywords agent; do
            if [[ -n "$keywords" ]] && echo "$message_lower" | grep -qE "$keywords"; then
                echo "$agent"
                return 0
            fi
        done <<< "$patterns"
    fi

    # Fallback: Built-in pattern matching
    # Salesforce patterns
    if echo "$message_lower" | grep -qE "(cpq|quote.*pricing|pricing.*config)"; then
        echo "sfdc-cpq-assessor"
        return 0
    fi

    if echo "$message_lower" | grep -qE "(revops|revenue ops|pipeline|forecast)"; then
        echo "sfdc-revops-auditor"
        return 0
    fi

    if echo "$message_lower" | grep -qE "(automation audit|flow audit|trigger audit)"; then
        echo "sfdc-automation-auditor"
        return 0
    fi

    if echo "$message_lower" | grep -qE "(permission set|permission.*create|profile.*permission)"; then
        echo "sfdc-permission-orchestrator"
        return 0
    fi

    if echo "$message_lower" | grep -qE "(report|dashboard).*create"; then
        echo "sfdc-reports-dashboards"
        return 0
    fi

    if echo "$message_lower" | grep -qE "(import|export).*data|data.*(import|export)"; then
        echo "sfdc-data-operations"
        return 0
    fi

    if echo "$message_lower" | grep -qE "(territory|territory2)"; then
        echo "sfdc-territory-orchestrator"
        return 0
    fi

    # HubSpot patterns
    if echo "$message_lower" | grep -qE "(hubspot.*workflow|workflow.*hubspot)"; then
        echo "hubspot-workflow-builder"
        return 0
    fi

    if echo "$message_lower" | grep -qE "(hubspot.*contact|contact.*hubspot)"; then
        echo "hubspot-contact-manager"
        return 0
    fi

    # Marketo patterns
    if echo "$message_lower" | grep -qE "(marketo.*campaign|campaign.*marketo)"; then
        echo "marketo-campaign-builder"
        return 0
    fi

    if echo "$message_lower" | grep -qE "(marketo.*lead|lead.*marketo)"; then
        echo "marketo-lead-manager"
        return 0
    fi

    # Cross-platform patterns
    if echo "$message_lower" | grep -qE "(diagram|flowchart|erd|sequence|visualize)"; then
        echo "diagram-generator"
        return 0
    fi

    if echo "$message_lower" | grep -qE "(deploy.*prod|production.*deploy|release)"; then
        echo "release-coordinator"
        return 0
    fi

    # No match
    echo ""
    return 1
}

# =============================================================================
# Reflection File Utilities
# =============================================================================

# Find most recent reflection file
# Args: $1 - search directory
# Returns: Path to most recent reflection file or empty
find_reflection_file() {
    local search_dir="$1"

    if [[ ! -d "$search_dir/.claude" ]]; then
        return 1
    fi

    # Find most recent reflection file
    local reflection_file
    reflection_file=$(find "$search_dir/.claude" -maxdepth 1 -name "SESSION_REFLECTION_*.json" -type f -printf '%T@ %p\n' 2>/dev/null | sort -rn | head -1 | cut -f2- -d" ")

    if [[ -z "$reflection_file" ]] || [[ ! -f "$reflection_file" ]]; then
        return 1
    fi

    echo "$reflection_file"
    return 0
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

# New shared functions (v2.0.0)
export -f find_project_root detect_platform
export -f get_cached_context set_cached_context clear_cached_context
export -f load_env_file load_project_env
export -f calculate_complexity match_routing_pattern
export -f find_reflection_file
export -f escape_json_string normalize_integer normalize_boolean_or_empty capture_hook_stack_trace
export HOOK_PHASE HOOK_TRIGGERING_ACTION HOOK_RETRY_COUNT HOOK_RECOVERY_SUCCEEDED HOOK_LAST_EXIT_CODE ENABLE_HOOK_STACK_TRACE

# =============================================================================
# End of Library
# =============================================================================
