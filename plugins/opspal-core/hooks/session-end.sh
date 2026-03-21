#!/bin/bash
# =============================================================================
# Session End Hook (Unified)
# =============================================================================
#
# Purpose: Unified session cleanup consolidating:
#   - session-end-scratchpad.sh
#   - Platform-specific cleanup
#
# Version: 1.0.0
# Created: 2026-01-09
#
# Event: Stop
# Timeout: 10000ms
#
# Responsibilities:
#   1. Save scratchpad state
#   2. Flush logs
#   3. Clean up temporary files
#   4. Platform-specific cleanup
#
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Always calculate from SCRIPT_DIR - CLAUDE_PLUGIN_ROOT may point to workspace root
PLUGIN_ROOT="$(dirname "$SCRIPT_DIR")"

# Source error handler
ERROR_HANDLER="$PLUGIN_ROOT/hooks/lib/error-handler.sh"
if [[ -f "$ERROR_HANDLER" ]]; then
    source "$ERROR_HANDLER"
    HOOK_NAME="session-end"
    set_lenient_mode 2>/dev/null || true
fi

# Configuration
VERBOSE="${SESSION_END_VERBOSE:-0}"
SKIP_SCRATCHPAD="${SKIP_SCRATCHPAD:-0}"
SKIP_CLEANUP="${SKIP_CLEANUP:-0}"

log_verbose() {
    if [[ "$VERBOSE" = "1" ]]; then
        echo "[session-end] $1" >&2
    fi
}

# =============================================================================
# 1. Save Scratchpad State
# =============================================================================

save_scratchpad() {
    if [[ "$SKIP_SCRATCHPAD" = "1" ]]; then
        return
    fi

    local scratchpad_saver="$PLUGIN_ROOT/hooks/session-end-scratchpad.sh"
    if [[ -f "$scratchpad_saver" ]] && [[ -x "$scratchpad_saver" ]]; then
        log_verbose "Saving scratchpad state..."
        bash "$scratchpad_saver" 1>&2 2>&2 || true
    fi
}

# =============================================================================
# 2. Flush Logs
# =============================================================================

flush_logs() {
    local log_dir="$HOME/.claude/logs"

    if [[ -d "$log_dir" ]]; then
        log_verbose "Ensuring logs are flushed..."
        # REMOVED: sync blocks indefinitely on WSL drvfs mounts
        # sync 2>/dev/null || true
    fi
}

# =============================================================================
# 3. Clean Up Temporary Files
# =============================================================================

cleanup_temp_files() {
    if [[ "$SKIP_CLEANUP" = "1" ]]; then
        return
    fi

    log_verbose "Cleaning up temporary files..."

    # Clean up session-specific temp files
    rm -f /tmp/unified-router-* 2>/dev/null || true
    rm -f /tmp/platform-context-*.json 2>/dev/null || true

    # Clean up old cache files (older than 24 hours) - backgrounded for WSL performance
    {
      for pattern in "sf-org-*.json" "hs-portal-*.json" "mkto-instance-*.json"; do
        find /tmp -maxdepth 1 -name "$pattern" -mtime +1 -delete 2>/dev/null || true
      done
    } &
}

# =============================================================================
# 4. Clear Context Cache
# =============================================================================

clear_session_cache() {
    # Clear in-memory context cache
    if type clear_cached_context &>/dev/null; then
        clear_cached_context "platform-context" 2>/dev/null || true
    fi

    # Remove session-specific cache file
    rm -f /tmp/platform-context.json 2>/dev/null || true
}

# =============================================================================
# 5. Platform-Specific Cleanup
# =============================================================================

platform_cleanup() {
    local platform="${DETECTED_PLATFORM:-unknown}"

    case "$platform" in
        salesforce)
            local sf_cleanup="${PLUGIN_ROOT}/../salesforce-plugin/hooks/session-end-sf.sh"
            if [[ -f "$sf_cleanup" ]] && [[ -x "$sf_cleanup" ]]; then
                bash "$sf_cleanup" 1>&2 2>&2 || true
            fi
            ;;
        hubspot)
            local hs_cleanup="${PLUGIN_ROOT}/../hubspot-plugin/hooks/session-end-hs.sh"
            if [[ -f "$hs_cleanup" ]] && [[ -x "$hs_cleanup" ]]; then
                bash "$hs_cleanup" 1>&2 2>&2 || true
            fi
            ;;
        marketo)
            local mkto_cleanup="${PLUGIN_ROOT}/../marketo-plugin/hooks/session-end-mkto.sh"
            if [[ -f "$mkto_cleanup" ]] && [[ -x "$mkto_cleanup" ]]; then
                bash "$mkto_cleanup" 1>&2 2>&2 || true
            fi
            ;;
    esac
}

# =============================================================================
# 6. Session Summary (optional)
# =============================================================================

write_session_summary() {
    local summary_dir="$HOME/.claude/sessions"
    mkdir -p "$summary_dir" 2>/dev/null || true

    local summary_file="$summary_dir/session-$(date +%Y%m%d-%H%M%S).json"

    # Write minimal session summary
    jq -n \
        --arg end_time "$(date -Iseconds 2>/dev/null || date '+%Y-%m-%dT%H:%M:%S')" \
        --arg platform "${DETECTED_PLATFORM:-unknown}" \
        --arg project_root "${PWD}" \
        '{
            endTime: $end_time,
            platform: $platform,
            projectRoot: $project_root
        }' > "$summary_file" 2>/dev/null || true

    log_verbose "Session summary written to: $summary_file"
}

# =============================================================================
# Main
# =============================================================================

log_verbose "Session ending..."

# Run all cleanup steps
save_scratchpad
flush_logs
cleanup_temp_files
clear_session_cache
platform_cleanup
write_session_summary

log_verbose "Session cleanup complete"

# Stop hooks: emit a JSON no-op envelope and exit 0.
printf '{}\n'
exit 0
