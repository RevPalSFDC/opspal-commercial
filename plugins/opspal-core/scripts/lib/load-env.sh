#!/bin/bash

###############################################################################
# Centralized Environment Loader
#
# Provides consistent environment variable loading for all plugin scripts.
#
# Addresses: Cohort 2 (config/env) - 8 reflections, $30K ROI
#
# Prevention Targets:
# - Bash tool spawns new shell without .env inheritance
# - Hardcoded configuration values
# - Inconsistent env loading across scripts
#
# How It Works:
# 1. Sources .env files in order of precedence
# 2. Validates required environment variables
# 3. Exports standardized variables for child processes
# 4. Provides helper functions for env management
#
# Usage:
#   source "$(dirname "$0")/load-env.sh"
#
#   # With validation
#   source "$(dirname "$0")/load-env.sh" validate
#
#   # With specific required vars
#   source "$(dirname "$0")/load-env.sh" validate SUPABASE_URL ASANA_ACCESS_TOKEN
#
# Configuration:
#   ENV_LOAD_QUIET=1           # Suppress status messages
#   ENV_LOAD_STRICT=1          # Exit on missing required vars
#   ENV_LOAD_DEBUG=1           # Show debug information
#   ENV_SKIP_VALIDATION=1      # Skip all validation
###############################################################################

# Configuration
ENV_LOAD_QUIET="${ENV_LOAD_QUIET:-0}"
ENV_LOAD_STRICT="${ENV_LOAD_STRICT:-1}"
ENV_LOAD_DEBUG="${ENV_LOAD_DEBUG:-0}"
ENV_SKIP_VALIDATION="${ENV_SKIP_VALIDATION:-0}"

# Track what was loaded for debugging
_LOADED_ENV_FILES=()
_LOADED_VARS=()

# Logging helper
_env_log() {
    local level="$1"
    shift
    if [ "$ENV_LOAD_QUIET" != "1" ]; then
        case "$level" in
            debug)
                [ "$ENV_LOAD_DEBUG" == "1" ] && echo "[env:debug] $*" >&2
                ;;
            info)
                echo "[env] $*" >&2
                ;;
            warn)
                echo "[env:warn] $*" >&2
                ;;
            error)
                echo "[env:error] $*" >&2
                ;;
        esac
    fi
}

# Find and return .env file locations in order of precedence
# Later files override earlier ones
_find_env_files() {
    local env_files=()

    # 1. System-wide (lowest priority)
    [ -f "/etc/claude/.env" ] && env_files+=("/etc/claude/.env")

    # 2. User home directory
    [ -f "${HOME}/.claude/.env" ] && env_files+=("${HOME}/.claude/.env")
    [ -f "${HOME}/.env" ] && env_files+=("${HOME}/.env")

    # 3. Plugin root (if set)
    if [ -n "${CLAUDE_PLUGIN_ROOT:-}" ]; then
        [ -f "${CLAUDE_PLUGIN_ROOT}/.env" ] && env_files+=("${CLAUDE_PLUGIN_ROOT}/.env")
        [ -f "${CLAUDE_PLUGIN_ROOT}/../.env" ] && env_files+=("${CLAUDE_PLUGIN_ROOT}/../.env")
    fi

    # 4. Current working directory (highest priority)
    [ -f "./.env" ] && env_files+=("./.env")
    [ -f "./.env.local" ] && env_files+=("./.env.local")

    # 5. Environment-specific overrides (if NODE_ENV or similar is set)
    if [ -n "${NODE_ENV:-}" ]; then
        [ -f "./.env.${NODE_ENV}" ] && env_files+=("./.env.${NODE_ENV}")
        [ -f "./.env.${NODE_ENV}.local" ] && env_files+=("./.env.${NODE_ENV}.local")
    fi

    printf '%s\n' "${env_files[@]}"
}

# Source a single .env file safely
_source_env_file() {
    local file="$1"

    if [ ! -f "$file" ]; then
        _env_log debug "File not found: $file"
        return 1
    fi

    if [ ! -r "$file" ]; then
        _env_log warn "Cannot read: $file (permission denied)"
        return 1
    fi

    _env_log debug "Loading: $file"

    # Use set -a to export all variables, then source
    set -a
    # shellcheck disable=SC1090
    source "$file"
    set +a

    _LOADED_ENV_FILES+=("$file")
    return 0
}

# Load all environment files
load_environment() {
    local files
    files=$(_find_env_files)

    if [ -z "$files" ]; then
        _env_log debug "No .env files found"
        return 0
    fi

    while IFS= read -r file; do
        _source_env_file "$file"
    done <<< "$files"

    _env_log info "Loaded ${#_LOADED_ENV_FILES[@]} environment file(s)"

    if [ "$ENV_LOAD_DEBUG" == "1" ]; then
        for f in "${_LOADED_ENV_FILES[@]}"; do
            _env_log debug "  - $f"
        done
    fi

    return 0
}

# Validate that required variables are set
validate_required_vars() {
    local required_vars=("$@")
    local missing_vars=()
    local empty_vars=()

    # Default required vars if none specified
    if [ ${#required_vars[@]} -eq 0 ]; then
        required_vars=(
            SUPABASE_URL
            SUPABASE_SERVICE_ROLE_KEY
        )
    fi

    for var in "${required_vars[@]}"; do
        if [ -z "${!var+x}" ]; then
            missing_vars+=("$var")
        elif [ -z "${!var}" ]; then
            empty_vars+=("$var")
        fi
    done

    if [ ${#missing_vars[@]} -gt 0 ]; then
        _env_log error "Missing required variables: ${missing_vars[*]}"
        if [ "$ENV_LOAD_STRICT" == "1" ]; then
            _env_log error "Set ENV_LOAD_STRICT=0 to continue with missing vars"
            return 1
        fi
    fi

    if [ ${#empty_vars[@]} -gt 0 ]; then
        _env_log warn "Empty required variables: ${empty_vars[*]}"
    fi

    return 0
}

# Get environment variable with default fallback
env_get() {
    local var_name="$1"
    local default="${2:-}"

    if [ -n "${!var_name+x}" ]; then
        echo "${!var_name}"
    else
        echo "$default"
    fi
}

# Set environment variable and track it
env_set() {
    local var_name="$1"
    local value="$2"

    export "$var_name"="$value"
    _LOADED_VARS+=("$var_name")
    _env_log debug "Set: $var_name"
}

# Check if variable is set (not empty)
env_is_set() {
    local var_name="$1"
    [ -n "${!var_name:-}" ]
}

# Print summary of loaded environment
env_summary() {
    echo "=== Environment Summary ===" >&2
    echo "Loaded files (${#_LOADED_ENV_FILES[@]}):" >&2
    for f in "${_LOADED_ENV_FILES[@]}"; do
        echo "  - $f" >&2
    done
    echo "" >&2
    echo "Key variables:" >&2

    local key_vars=(
        SUPABASE_URL
        SUPABASE_SERVICE_ROLE_KEY
        ASANA_ACCESS_TOKEN
        ASANA_WORKSPACE_ID
        SF_ORG_ALIAS
        HUBSPOT_ACCESS_TOKEN
        NODE_ENV
        CLAUDE_PLUGIN_ROOT
    )

    for var in "${key_vars[@]}"; do
        if [ -n "${!var:-}" ]; then
            # Mask sensitive values
            if [[ "$var" =~ (KEY|TOKEN|SECRET|PASSWORD) ]]; then
                echo "  $var=***REDACTED***" >&2
            else
                echo "  $var=${!var}" >&2
            fi
        else
            echo "  $var=(not set)" >&2
        fi
    done
}

# Validate connection-style env vars (URLs, etc.)
validate_connections() {
    local errors=0

    # Validate Supabase URL format
    if [ -n "${SUPABASE_URL:-}" ]; then
        if ! [[ "$SUPABASE_URL" =~ ^https?:// ]]; then
            _env_log error "SUPABASE_URL must be a valid URL (got: $SUPABASE_URL)"
            ((errors++))
        fi
    fi

    # Validate tokens look like tokens (basic check)
    if [ -n "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
        if [ ${#SUPABASE_SERVICE_ROLE_KEY} -lt 100 ]; then
            _env_log warn "SUPABASE_SERVICE_ROLE_KEY seems short - verify it's correct"
        fi
    fi

    if [ -n "${ASANA_ACCESS_TOKEN:-}" ]; then
        if [ ${#ASANA_ACCESS_TOKEN} -lt 20 ]; then
            _env_log warn "ASANA_ACCESS_TOKEN seems short - verify it's correct"
        fi
    fi

    return $errors
}

# Export common helpers for child scripts
export_helpers() {
    # Export this script's location so children can re-source
    export LOAD_ENV_SCRIPT="${BASH_SOURCE[0]}"

    # Export helper functions (bash 4.4+ feature)
    if [ "${BASH_VERSINFO[0]}" -ge 4 ] && [ "${BASH_VERSINFO[1]}" -ge 4 ]; then
        export -f env_get
        export -f env_is_set
    fi
}

# Main entrypoint when sourced with arguments
_main() {
    local action="${1:-load}"
    shift || true

    case "$action" in
        load)
            load_environment
            ;;
        validate)
            load_environment
            if [ "$ENV_SKIP_VALIDATION" != "1" ]; then
                validate_required_vars "$@"
                validate_connections
            fi
            ;;
        summary)
            load_environment
            env_summary
            ;;
        debug)
            ENV_LOAD_DEBUG=1
            load_environment
            env_summary
            ;;
        help)
            echo "Usage: source load-env.sh [action] [args...]"
            echo ""
            echo "Actions:"
            echo "  load              Load environment files (default)"
            echo "  validate [vars]   Load and validate required variables"
            echo "  summary           Load and print summary"
            echo "  debug             Load with debug output"
            echo "  help              Show this help"
            echo ""
            echo "Environment:"
            echo "  ENV_LOAD_QUIET=1    Suppress output"
            echo "  ENV_LOAD_STRICT=1   Exit on missing vars"
            echo "  ENV_LOAD_DEBUG=1    Debug output"
            ;;
        *)
            _env_log error "Unknown action: $action"
            return 1
            ;;
    esac
}

# Auto-run when sourced (unless ENV_LOAD_MANUAL is set)
if [ "${ENV_LOAD_MANUAL:-0}" != "1" ]; then
    _main "$@"
fi

# Export helpers for child scripts
export_helpers
