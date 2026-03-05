#!/bin/bash

#
# Marketo Plugin Error Handler
#
# Standardized error handling for all Marketo plugin hooks.
# Source this file at the beginning of any hook script.
#
# Version: 1.0.0
#
# Exit Codes:
#   0 - Success
#   1 - General error
#   2 - Skip (non-blocking)
#   3 - Configuration error
#   4 - Authentication error
#   5 - API error
#   6 - Validation error
#   7 - Timeout error
#

# Colors for output (if terminal supports it)
if [ -t 1 ]; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[0;33m'
    BLUE='\033[0;34m'
    NC='\033[0m' # No Color
else
    RED=''
    GREEN=''
    YELLOW=''
    BLUE=''
    NC=''
fi

# Plugin root directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
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
MARKETO_PLUGIN_ROOT="$DOMAIN_ROOT"
if [[ -n "${CLAUDE_PLUGIN_ROOT:-}" ]]; then
    DOMAIN_NAME="$(basename "$DOMAIN_ROOT")"
    case "$CLAUDE_PLUGIN_ROOT" in
        *"/packages/domains/$DOMAIN_NAME"|*/"$DOMAIN_NAME"-plugin) MARKETO_PLUGIN_ROOT="$CLAUDE_PLUGIN_ROOT" ;;
    esac
fi

# Logging functions
log_info() {
    echo -e "${BLUE}[marketo-plugin]${NC} $1" >&2
}

log_success() {
    echo -e "${GREEN}[marketo-plugin]${NC} $1" >&2
}

log_warning() {
    echo -e "${YELLOW}[marketo-plugin]${NC} WARNING: $1" >&2
}

log_error() {
    echo -e "${RED}[marketo-plugin]${NC} ERROR: $1" >&2
}

# Error handler function
handle_error() {
    local exit_code=$1
    local message=$2
    local context=${3:-""}

    log_error "$message"
    if [ -n "$context" ]; then
        log_error "Context: $context"
    fi

    exit "$exit_code"
}

# Check if required command exists
require_command() {
    local cmd=$1
    if ! command -v "$cmd" &> /dev/null; then
        handle_error 3 "Required command not found: $cmd"
    fi
}

# Check if Node.js is available
require_node() {
    if ! command -v node &> /dev/null; then
        handle_error 3 "Node.js is required but not installed"
    fi
}

# Check if environment variable is set
require_env() {
    local var_name=$1
    if [ -z "${!var_name}" ]; then
        handle_error 3 "Required environment variable not set: $var_name"
    fi
}

# Set lenient mode (errors become warnings)
LENIENT_MODE=0

set_lenient_mode() {
    LENIENT_MODE=1
}

# Execute with error handling
safe_execute() {
    local cmd="$1"
    local error_msg="${2:-Command failed}"

    if ! eval "$cmd"; then
        if [ "$LENIENT_MODE" -eq 1 ]; then
            log_warning "$error_msg (lenient mode - continuing)"
            return 0
        else
            handle_error 1 "$error_msg"
        fi
    fi
}

# Check Marketo configuration
check_marketo_config() {
    # Check for required environment variables or config file
    local config_file="${MARKETO_PLUGIN_ROOT}/portals/config.json"

    if [ -n "$MARKETO_CLIENT_ID" ] && [ -n "$MARKETO_CLIENT_SECRET" ] && [ -n "$MARKETO_BASE_URL" ]; then
        return 0
    fi

    if [ -f "$config_file" ]; then
        return 0
    fi

    handle_error 3 "Marketo configuration not found. Set environment variables or create portals/config.json"
}

# Get current instance name
get_instance_name() {
    if [ -n "$MARKETO_INSTANCE_NAME" ]; then
        echo "$MARKETO_INSTANCE_NAME"
    elif [ -f "${MARKETO_PLUGIN_ROOT}/.current-instance" ]; then
        cat "${MARKETO_PLUGIN_ROOT}/.current-instance"
    else
        echo "default"
    fi
}

# Output JSON for Claude Code consumption
output_json() {
    local json="$1"
    echo "$json"
}

# Output hook result in standard format
output_result() {
    local success=$1
    local message=$2
    local data=${3:-"{}"}

    if [ "$success" = "true" ]; then
        output_json "{\"success\": true, \"message\": \"$message\", \"data\": $data}"
    else
        output_json "{\"success\": false, \"error\": \"$message\", \"data\": $data}"
    fi
}
