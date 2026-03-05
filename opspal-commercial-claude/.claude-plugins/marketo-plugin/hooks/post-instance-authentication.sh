#!/bin/bash

#
# Post Instance Authentication Hook - Marketo Plugin
#
# Trigger: PostToolUse (for mcp__marketo__* tools)
# Purpose: Auto-detect instance customizations after successful API calls
#
# Behavior:
#   - Detects when authentication is first used
#   - Runs instance quirks detection in background
#   - Generates documentation files without blocking
#
# Configuration:
#   - MARKETO_SKIP_QUIRKS_DETECTION: Set to 1 to skip
#
# Version: 1.0.0
#

# Source error handler
SCRIPT_DIR="$(dirname "$(realpath "$0")")"
source "${SCRIPT_DIR}/lib/error-handler.sh"

# Set lenient mode - should not block operations
set_lenient_mode

# Get instance name
INSTANCE_NAME=$(get_instance_name)

# Check if quirks detection should be skipped
if [ "${MARKETO_SKIP_QUIRKS_DETECTION:-0}" = "1" ]; then
    log_info "Quirks detection skipped (MARKETO_SKIP_QUIRKS_DETECTION=1)"
    exit 0
fi

# Check if quirks file already exists (skip if recent)
QUIRKS_FILE="${MARKETO_PLUGIN_ROOT}/portals/${INSTANCE_NAME}/INSTANCE_QUIRKS.json"
if [ -f "$QUIRKS_FILE" ]; then
    # Check if file is less than 24 hours old
    FILE_AGE=$(( $(date +%s) - $(stat -c %Y "$QUIRKS_FILE" 2>/dev/null || echo 0) ))
    if [ "$FILE_AGE" -lt 86400 ]; then
        log_info "Quirks file is recent, skipping detection"
        exit 0
    fi
fi

# Run quirks detection in background (non-blocking)
QUIRKS_SCRIPT="${MARKETO_PLUGIN_ROOT}/scripts/lib/instance-quirks-detector.js"

if [ -f "$QUIRKS_SCRIPT" ]; then
    log_info "Running instance quirks detection in background..."

    # Run in background without blocking
    (
        node "$QUIRKS_SCRIPT" generate-docs "$INSTANCE_NAME" > /dev/null 2>&1

        if [ $? -eq 0 ]; then
            log_success "Instance quirks detected and documented"
        else
            log_warning "Quirks detection completed with warnings"
        fi
    ) &

    # Don't wait for background process
    disown
fi

exit 0
