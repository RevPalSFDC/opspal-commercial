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
source "$PLUGIN_DIR/scripts/lib/hook-progress-helper.sh"

# Logging utilities
log_info() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] INFO: $*"
}

log_warn() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] WARN: $*" >&2
}

log_error() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $*" >&2
}

# Check if permission sync needed
should_sync_permissions() {
    local manifest_path="$1"

    # Check if package.xml exists
    if [[ ! -f "$manifest_path" ]]; then
        log_info "No package.xml found, skipping permission sync"
        return 1
    fi

    # Check for custom fields or objects
    if grep -q "<members>.*__c</members>" "$manifest_path"; then
        log_info "Custom metadata detected in manifest, permission sync recommended"
        return 0
    fi

    log_info "No custom metadata in manifest, skipping permission sync"
    return 1
}

# Detect initiative from manifest or context
detect_initiative() {
    local manifest_path="$1"
    local org_alias="$2"

    # Try to detect from file path
    # Expected pattern: instances/<org>/permissions/<initiative>-permissions.json

    local current_dir
    current_dir="$(pwd)"

    if [[ "$current_dir" =~ instances/([^/]+) ]]; then
        local org="${BASH_REMATCH[1]}"
        log_info "Detected org from path: $org"

        # Look for permission config files
        local permissions_dir="$PLUGIN_DIR/instances/$org/permissions"

        if [[ -d "$permissions_dir" ]]; then
            local config_files
            config_files=$(find "$permissions_dir" -name "*-permissions.json" 2>/dev/null || true)

            if [[ -n "$config_files" ]]; then
                # Return first config file found
                echo "$config_files" | head -1
                return 0
            fi
        fi
    fi

    # Fallback: try to detect from manifest comments
    if [[ -f "$manifest_path" ]] && grep -q "<!-- initiative:" "$manifest_path"; then
        local initiative
        initiative=$(grep "<!-- initiative:" "$manifest_path" | sed 's/.*initiative: \(.*\) -->/\1/')

        if [[ -n "$initiative" ]]; then
            log_info "Detected initiative from manifest comment: $initiative"

            # Look for config file
            local config_file="$PLUGIN_DIR/instances/$org_alias/permissions/$initiative-permissions.json"

            if [[ -f "$config_file" ]]; then
                echo "$config_file"
                return 0
            fi
        fi
    fi

    log_warn "Could not detect initiative from context"
    return 1
}

# Sync permissions using CLI
sync_permissions() {
    local config_file="$1"
    local org_alias="$2"
    local dry_run="${3:-false}"

    if [[ ! -f "$config_file" ]]; then
        log_error "Permission config file not found: $config_file"
        return 1
    fi

    log_info "Syncing permissions from: $config_file"

    local cli_path="$PLUGIN_DIR/scripts/lib/permission-set-cli.js"

    if [[ ! -f "$cli_path" ]]; then
        log_error "Permission Set CLI not found: $cli_path"
        return 1
    fi

    # Build command
    local cmd="node \"$cli_path\" --input \"$config_file\" --org \"$org_alias\""

    if [[ "$dry_run" == "true" ]]; then
        cmd="$cmd --dry-run"
    fi

    cmd="$cmd --verbose"

    # Execute
    log_info "Executing: $cmd"

    if eval "$cmd"; then
        log_info "Permission sync completed successfully"
        return 0
    else
        log_error "Permission sync failed (non-blocking)"
        return 1
    fi
}

# Main execution
main() {
    log_info "=== Pre-Deployment Permission Sync Hook ==="

    # Parse arguments
    local manifest_path="${1:-package.xml}"
    local org_alias="${2:-${SF_ORG:-${SF_TARGET_ORG:-}}}"
    local dry_run="${3:-false}"

    if [[ -z "$org_alias" ]]; then
        log_warn "No org alias specified and no default found, skipping permission sync"
        exit 0
    fi

    log_info "Org: $org_alias"
    log_info "Manifest: $manifest_path"
    log_info "Dry Run: $dry_run"

    progress_start "Checking if permission sync is needed"

    # Check if sync needed
    if ! should_sync_permissions "$manifest_path"; then
        log_info "Permission sync not needed"
        progress_complete "Permission sync not needed"
        exit 0
    fi

    progress_update "Detecting initiative and permission config" 30

    # Detect initiative and config file
    local config_file
    if config_file=$(detect_initiative "$manifest_path" "$org_alias"); then
        log_info "Found permission config: $config_file"
        progress_update "Found permission config, preparing sync" 50

        # Sync permissions (non-blocking)
        progress_update "Syncing permissions" 75
        if sync_permissions "$config_file" "$org_alias" "$dry_run"; then
            log_info "✅ Permission sync successful"
            progress_complete "Permission sync successful" true
        else
            log_warn "⚠️  Permission sync failed, but continuing deployment"
            progress_warning "Permission sync failed, continuing deployment" true
        fi
    else
        log_info "No permission config found for this deployment"
        progress_complete "No permission config found"
    fi

    log_info "=== Hook Complete ==="
    exit 0
}

# Run main if executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
