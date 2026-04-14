#!/usr/bin/env bash
# STATUS: SUPERSEDED — shared library sourced by other hooks, not a standalone registrable hook
#
# Attio Plugin Error Handler
#
# Sources the core error-handler (v2.0.0) for shared utilities, then adds
# Attio-specific extensions (config checks, workspace resolution, JSON output).
#
# Version: 1.0.0 (delegating to opspal-core)
#
# Usage: source "$(dirname "${BASH_SOURCE[0]}")/error-handler.sh"
#

# --- Source core error-handler (authoritative shared utilities) ---
_ATTIO_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
_CORE_ERROR_HANDLER=""

# Try plugin-root-relative path first (installed plugin layout)
if [[ -n "${CLAUDE_PLUGIN_ROOT:-}" ]]; then
    _CORE_ERROR_HANDLER="${CLAUDE_PLUGIN_ROOT}/opspal-core/hooks/lib/error-handler.sh"
fi

# Fallback: navigate from this file's location (../../opspal-core relative to hooks/lib/)
if [[ -z "$_CORE_ERROR_HANDLER" ]] || [[ ! -f "$_CORE_ERROR_HANDLER" ]]; then
    _CORE_ERROR_HANDLER="$(cd "$_ATTIO_LIB_DIR/../../../opspal-core/hooks/lib" 2>/dev/null && pwd)/error-handler.sh"
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
    set_lenient_mode() { set +eu; trap - ERR; }
    set_strict_mode()  { set -euo pipefail; }
fi

# Backwards-compatible alias
if ! declare -F log_warning >/dev/null 2>&1; then
    log_warning() {
        log_warn "$@"
    }
fi

# --- Attio-specific extensions ---

# Plugin root directory
# Resolves to the plugin root: two levels up from hooks/lib/
ATTIO_PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$(realpath "${BASH_SOURCE[0]}" 2>/dev/null || echo "$0")")/../.." 2>/dev/null && pwd)}"

# Check Attio configuration
# Returns 0 if configured, 3 if not configured
check_attio_config() {
    local config_file="${ATTIO_PLUGIN_ROOT}/workspaces/config.json"

    # Check environment variable first
    if [[ -n "${ATTIO_API_KEY:-}" ]]; then
        return 0
    fi

    # Check config file
    if [[ -f "$config_file" ]]; then
        return 0
    fi

    log_error "Attio configuration not found. Set ATTIO_API_KEY environment variable or create workspaces/config.json"
    return 3
}

# Get current workspace name
get_workspace_name() {
    if [[ -n "${ATTIO_WORKSPACE_NAME:-}" ]]; then
        echo "$ATTIO_WORKSPACE_NAME"
    elif [[ -f "${ATTIO_PLUGIN_ROOT}/.current-workspace" ]]; then
        cat "${ATTIO_PLUGIN_ROOT}/.current-workspace"
    else
        echo "default"
    fi
}

# Check if Node.js is available (convenience alias)
require_node() {
    if ! command -v node >/dev/null 2>&1; then
        log_error "Node.js is required for Attio plugin operations but was not found in PATH"
        return 1
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

    if [[ "$success" == "true" ]]; then
        output_json "{\"success\": true, \"message\": \"$message\", \"data\": $data}"
    else
        output_json "{\"success\": false, \"error\": \"$message\", \"data\": $data}"
    fi
}
