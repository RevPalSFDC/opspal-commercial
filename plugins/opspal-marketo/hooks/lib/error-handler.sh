#!/usr/bin/env bash
#
# Marketo Plugin Error Handler
#
# Sources the core error-handler (v2.0.0) for shared utilities, then adds
# Marketo-specific extensions (config checks, instance resolution, JSON output).
#
# Version: 2.0.0 (delegating to opspal-core)
#
# Usage: source "$(dirname "${BASH_SOURCE[0]}")/error-handler.sh"
#

# --- Source core error-handler (authoritative shared utilities) ---
_MARKETO_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
_CORE_ERROR_HANDLER=""

# Try plugin-root-relative path first (installed plugin layout)
if [[ -n "${CLAUDE_PLUGIN_ROOT:-}" ]]; then
    _CORE_ERROR_HANDLER="${CLAUDE_PLUGIN_ROOT}/opspal-core/hooks/lib/error-handler.sh"
fi

# Fallback: navigate from this file's location
if [[ -z "$_CORE_ERROR_HANDLER" ]] || [[ ! -f "$_CORE_ERROR_HANDLER" ]]; then
    _CORE_ERROR_HANDLER="$(cd "$_MARKETO_LIB_DIR/../../../opspal-core/hooks/lib" 2>/dev/null && pwd)/error-handler.sh"
fi

if [[ -f "$_CORE_ERROR_HANDLER" ]]; then
    # shellcheck disable=SC1090
    source "$_CORE_ERROR_HANDLER"
else
    # Minimal fallback if core is unavailable
    log_info()    { echo "[INFO] $1" >&2; }
    log_success() { echo "[OK] $1" >&2; }
    log_warn()    { echo "[WARN] $1" >&2; }
    log_error()   { echo "[ERROR] $1" >&2; }
    set_lenient_mode() { set +e; trap - ERR; }
    set_strict_mode()  { set -euo pipefail; }
fi

# Backwards-compatible alias used by older Marketo hooks.
if ! declare -F log_warning >/dev/null 2>&1; then
    log_warning() {
        log_warn "$@"
    }
fi

# --- Marketo-specific extensions ---

# Plugin root directory
MARKETO_PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(dirname "$(dirname "$(realpath "${BASH_SOURCE[0]}" 2>/dev/null || echo "$0")")")}"

# Check Marketo configuration
check_marketo_config() {
    local config_file="${MARKETO_PLUGIN_ROOT}/portals/config.json"

    if [ -n "${MARKETO_CLIENT_ID:-}" ] && [ -n "${MARKETO_CLIENT_SECRET:-}" ] && [ -n "${MARKETO_BASE_URL:-}" ]; then
        return 0
    fi

    if [ -f "$config_file" ]; then
        return 0
    fi

    log_error "Marketo configuration not found. Set environment variables or create portals/config.json"
    return 3
}

# Get current instance name
get_instance_name() {
    if [ -n "${MARKETO_INSTANCE_NAME:-}" ]; then
        echo "$MARKETO_INSTANCE_NAME"
    elif [ -f "${MARKETO_PLUGIN_ROOT}/.current-instance" ]; then
        cat "${MARKETO_PLUGIN_ROOT}/.current-instance"
    else
        echo "default"
    fi
}

# Check if Node.js is available (convenience alias)
require_node() {
    require_command node "Marketo plugin operations"
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

# Execute with error handling (Marketo-flavored wrapper)
safe_execute() {
    local cmd="$1"
    local error_msg="${2:-Command failed}"

    if ! eval "$cmd"; then
        if [ "${LENIENT_MODE:-0}" -eq 1 ]; then
            log_warn "$error_msg (lenient mode - continuing)"
            return 0
        else
            log_error "$error_msg"
            return 1
        fi
    fi
}
