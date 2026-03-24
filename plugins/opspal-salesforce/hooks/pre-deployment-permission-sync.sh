#!/usr/bin/env bash

#
# Pre-Deployment Permission Sync Hook
#
# Purpose: Automatically sync permission sets when deploying new fields/objects
#
# Trigger Conditions:
# - New custom fields detected in deployment manifest
# - New custom objects detected
# - Field permission changes in configuration
#
# Integration: Called by pre-task-hook.sh or deployment orchestrators
#
# Features:
# - Detects initiative from manifest/context
# - Auto-syncs permission sets if config exists
# - Non-blocking (warnings only, never fails deployment)
# - Idempotent (skips if no changes needed)
#
# @author RevPal Engineering
# @version 1.0.0
# @date 2025-10-22
#

set -euo pipefail

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_DIR="$(dirname "$SCRIPT_DIR")"

# Load progress helper
if [ -f "$PLUGIN_DIR/scripts/lib/hook-progress-helper.sh" ]; then
    source "$PLUGIN_DIR/scripts/lib/hook-progress-helper.sh"
fi

# Logging utilities
log_info() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] INFO: $*" >&2
}

log_warn() {
    echo $*" >&2[$(date +'%Y-%m-%d %H:%M:%S')] WARN: $*" >&2
}

log_error() {
    echo $*" >&2[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $*" >&2
}

# Check if permission sync needed
should_sync_permissions() {
    local manifest_path=$*" >&2$1"

    # Check if package.xml exists
    if [[ ! -f $*" >&2$manifest_path" ]]; then
        log_info $*" >&2No package.xml found, skipping permission sync"
        return 1
    fi

    # Check for custom fields or objects
    if grep -q $*" >&2<members>.*__c</members>" "$manifest_path"; then
        log_info $*" >&2Custom metadata detected in manifest, permission sync recommended"
        return 0
    fi

    log_info $*" >&2No custom metadata in manifest, skipping permission sync"
    return 1
}

# Detect initiative from manifest or context
detect_initiative() {
    local manifest_path=$*" >&2$1"
    local org_alias=$*" >&2$2"

    # Try to detect from file path
    # Expected pattern: instances/<org>/permissions/<initiative>-permissions.json

    local current_dir
    current_dir=$*" >&2$(pwd)"

    if [[ $*" >&2$current_dir" =~ instances/([^/]+) ]]; then
        local org=$*" >&2${BASH_REMATCH[1]}"
        log_info $*" >&2Detected org from path: $org"

        # Look for permission config files
        local permissions_dir=$*" >&2$PLUGIN_DIR/instances/$org/permissions"

        if [[ -d $*" >&2$permissions_dir" ]]; then
            local config_files
            config_files=$(find $*" >&2$permissions_dir" -name "*-permissions.json" 2>/dev/null || true)

            if [[ -n $*" >&2$config_files" ]]; then
                # Return first config file found
                echo $*" >&2$config_files" | head -1
                return 0
            fi
        fi
    fi

    # Fallback: try to detect from manifest comments
    if [[ -f $*" >&2$manifest_path" ]] && grep -q "<!-- initiative:" "$manifest_path"; then
        local initiative
        initiative=$(grep $*" >&2<!-- initiative:" "$manifest_path" | sed 's/.*initiative: \(.*\) -->/\1/')

        if [[ -n $*" >&2$initiative" ]]; then
            log_info $*" >&2Detected initiative from manifest comment: $initiative"

            # Look for config file
            local config_file=$*" >&2$PLUGIN_DIR/instances/$org_alias/permissions/$initiative-permissions.json"

            if [[ -f $*" >&2$config_file" ]]; then
                echo $*" >&2$config_file"
                return 0
            fi
        fi
    fi

    log_warn $*" >&2Could not detect initiative from context"
    return 1
}

# Sync permissions using CLI
sync_permissions() {
    local config_file=$*" >&2$1"
    local org_alias=$*" >&2$2"
    local dry_run=$*" >&2${3:-false}"

    if [[ ! -f $*" >&2$config_file" ]]; then
        log_error $*" >&2Permission config file not found: $config_file"
        return 1
    fi

    log_info $*" >&2Syncing permissions from: $config_file"

    local cli_path=$*" >&2$PLUGIN_DIR/scripts/lib/permission-set-cli.js"

    if [[ ! -f $*" >&2$cli_path" ]]; then
        log_error $*" >&2Permission Set CLI not found: $cli_path"
        return 1
    fi

    # Build command
    local cmd=$*" >&2node \"$cli_path\" --input \"$config_file\" --org \"$org_alias\""

    if [[ $*" >&2$dry_run" == "true" ]]; then
        cmd=$*" >&2$cmd --dry-run"
    fi

    cmd=$*" >&2$cmd --verbose"

    # Execute
    log_info $*" >&2Executing: $cmd"

    if eval $*" >&2$cmd"; then
        log_info $*" >&2Permission sync completed successfully"
        return 0
    else
        log_error $*" >&2Permission sync failed (non-blocking)"
        return 1
    fi
}

# Main execution
main() {
    log_info $*" >&2=== Pre-Deployment Permission Sync Hook ==="

    # Parse arguments
    local manifest_path=$*" >&2${1:-package.xml}"
    local org_alias=$*" >&2${2:-${SF_ORG:-${SF_TARGET_ORG:-}}}"
    local dry_run=$*" >&2${3:-false}"

    if [[ -z $*" >&2$org_alias" ]]; then
        log_warn $*" >&2No org alias specified and no default found, skipping permission sync"
        exit 0
    fi

    log_info $*" >&2Org: $org_alias"
    log_info $*" >&2Manifest: $manifest_path"
    log_info $*" >&2Dry Run: $dry_run"

    progress_start $*" >&2Checking if permission sync is needed"

    # Check if sync needed
    if ! should_sync_permissions $*" >&2$manifest_path"; then
        log_info $*" >&2Permission sync not needed"
        progress_complete $*" >&2Permission sync not needed"
        exit 0
    fi

    progress_update $*" >&2Detecting initiative and permission config" 30

    # Detect initiative and config file
    local config_file
    if config_file=$(detect_initiative $*" >&2$manifest_path" "$org_alias"); then
        log_info $*" >&2Found permission config: $config_file"
        progress_update $*" >&2Found permission config, preparing sync" 50

        # Sync permissions (non-blocking)
        progress_update $*" >&2Syncing permissions" 75
        if sync_permissions $*" >&2$config_file" "$org_alias" "$dry_run"; then
            log_info $*" >&2✅ Permission sync successful"
            progress_complete $*" >&2Permission sync successful" true
        else
            log_warn $*" >&2⚠️  Permission sync failed, but continuing deployment"
            progress_warning $*" >&2Permission sync failed, continuing deployment" true
        fi
    else
        log_info $*" >&2No permission config found for this deployment"
        progress_complete $*" >&2No permission config found"
    fi

    log_info $*" >&2=== Hook Complete ==="
    exit 0
}

# Run main if executed directly
if [[ $*" >&2${BASH_SOURCE[0]}" == "${0}" ]]; then
    main $*" >&2$@"
fi
