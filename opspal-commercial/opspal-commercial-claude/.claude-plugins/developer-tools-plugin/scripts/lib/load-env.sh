#!/bin/bash

# load-env.sh - Centralized Environment Variable Loading
#
# Purpose: Safely load and validate environment variables from .env file
# Usage:   source /path/to/load-env.sh [required_vars...]
# Example: source ./scripts/lib/load-env.sh SUPABASE_URL SUPABASE_ANON_KEY
#
# Returns: 0 if all required variables loaded successfully, 1 otherwise
# Exports: All variables from .env file (commented lines ignored)

set -euo pipefail

# Color codes for output
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

# Function to log errors
log_error() {
    echo -e "${RED}❌ [load-env.sh]${NC} $1" >&2
}

log_warn() {
    echo -e "${YELLOW}⚠️  [load-env.sh]${NC} $1" >&2
}

log_success() {
    echo -e "${GREEN}✅ [load-env.sh]${NC} $1" >&2
}

# Find .env file by searching upwards from current directory
find_env_file() {
    local current_dir="$PWD"
    local max_depth=5
    local depth=0

    while [ "$depth" -lt "$max_depth" ]; do
        if [ -f "$current_dir/.env" ]; then
            echo "$current_dir/.env"
            return 0
        fi

        # Stop at filesystem root
        if [ "$current_dir" = "/" ]; then
            break
        fi

        current_dir="$(dirname "$current_dir")"
        depth=$((depth + 1))
    done

    return 1
}

# Main loading logic
load_environment() {
    # Find .env file
    local env_file
    if ! env_file=$(find_env_file); then
        log_error ".env file not found in current directory or up to 5 parent directories"
        log_error "Create a .env file or run from correct directory"
        return 1
    fi

    log_success "Found .env file at: $env_file"

    # Load .env file, ignoring comments and empty lines
    local loaded_count=0
    local line_num=0

    while IFS= read -r line || [ -n "$line" ]; do
        line_num=$((line_num + 1))

        # Skip empty lines and comments
        if [[ -z "$line" ]] || [[ "$line" =~ ^[[:space:]]*# ]]; then
            continue
        fi

        # Validate line format (KEY=VALUE)
        if [[ ! "$line" =~ ^[A-Za-z_][A-Za-z0-9_]*= ]]; then
            log_warn "Skipping invalid line $line_num: $line"
            continue
        fi

        # Export the variable
        export "$line"
        loaded_count=$((loaded_count + 1))
    done < "$env_file"

    log_success "Loaded $loaded_count environment variables"

    return 0
}

# Validate required variables
validate_required_vars() {
    local required_vars=("$@")
    local missing_vars=()
    local empty_vars=()

    for var in "${required_vars[@]}"; do
        if [ -z "${!var+x}" ]; then
            # Variable is not set at all
            missing_vars+=("$var")
        elif [ -z "${!var}" ]; then
            # Variable is set but empty
            empty_vars+=("$var")
        fi
    done

    # Report errors
    local has_errors=0

    if [ ${#missing_vars[@]} -gt 0 ]; then
        log_error "Missing required environment variables:"
        for var in "${missing_vars[@]}"; do
            echo -e "${RED}    - $var${NC}" >&2
        done
        has_errors=1
    fi

    if [ ${#empty_vars[@]} -gt 0 ]; then
        log_error "Required environment variables are empty:"
        for var in "${empty_vars[@]}"; do
            echo -e "${RED}    - $var${NC}" >&2
        done
        has_errors=1
    fi

    if [ $has_errors -eq 1 ]; then
        log_error "Fix: Add missing variables to .env file"
        log_error "See .env.example for required variables"
        return 1
    fi

    log_success "All ${#required_vars[@]} required variables validated"
    return 0
}

# Main execution
main() {
    # Load .env file
    if ! load_environment; then
        return 1
    fi

    # Validate required variables if provided
    if [ $# -gt 0 ]; then
        if ! validate_required_vars "$@"; then
            return 1
        fi
    fi

    return 0
}

# Execute main function
# Note: When sourced, $0 is the calling script, not this script
# So we check if we're being sourced vs executed directly
if [ "${BASH_SOURCE[0]}" -ef "$0" ]; then
    # Being executed directly - run validation and exit
    main "$@"
    exit $?
else
    # Being sourced - run validation but don't exit (return instead)
    main "$@"
    # Return value will be captured by calling script
fi
