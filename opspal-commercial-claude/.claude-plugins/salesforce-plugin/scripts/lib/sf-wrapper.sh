#!/bin/bash
# sf-wrapper.sh - Instance-agnostic Salesforce CLI wrapper
# Suppresses update warnings and provides consistent error handling

# Source shell commons if available
if [ -f "$(dirname "$0")/shell-commons.sh" ]; then
    source "$(dirname "$0")/shell-commons.sh"
fi

# Configuration
export SF_HIDE_RELEASE_NOTES=true
export SF_DISABLE_AUTOUPDATE=true
export SF_SKIP_NEW_VERSION_CHECK=true

# Suppress update warnings in output
suppress_update_warnings() {
    grep -v "Warning.*update available" | \
    grep -v "@salesforce/cli update available" | \
    grep -v "npm update" | \
    grep -v "A new version of"
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

# Execute SF command with warning suppression
sf_exec() {
    local cmd="$1"
    shift

    # Set environment to suppress warnings
    export NODE_NO_WARNINGS=1
    export SF_HIDE_RELEASE_NOTES=true
    sync_sf_auth

    # Execute command and filter warnings
    if command -v sf >/dev/null 2>&1; then
        sf $cmd "$@" 2>&1 | suppress_update_warnings
        return ${PIPESTATUS[0]}
    else
        echo "Error: Salesforce CLI (sf) not found" >&2
        return 1
    fi
}

# Main execution if called directly
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
    # Check for sf command or reject legacy sfdx
    if [[ "$1" == "sf" ]]; then
        shift
        sf_exec "$@"
    elif [[ "$1" == "sfdx" ]]; then
        shift
        echo "Error: Legacy sfdx commands are not supported. Use 'sf' instead." >&2
        exit 1
    else
        # Default to sf
        sf_exec "$@"
    fi
fi
