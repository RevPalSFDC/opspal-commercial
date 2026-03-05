#!/bin/bash
#
# Pre-Task Runbook Reminder Hook
#
# Purpose: Remind agents to review org-specific runbooks before starting work.
#          Checks for RUNBOOK.md in instance directories and displays a visible
#          reminder to review operational knowledge before proceeding.
#
# Behavior:
#   1. Detects org/instance from multiple sources (path, env vars, hook input)
#   2. Searches for RUNBOOK.md in standard locations
#   3. Displays reminder with runbook path and key sections
#   4. Non-blocking - always allows task to proceed
#
# Configuration:
#   RUNBOOK_REMINDER_ENABLED=1    - Enable/disable reminders (default: 1)
#   RUNBOOK_REMINDER_VERBOSE=1    - Show detailed output (default: 0)
#   RUNBOOK_REMINDER_SHOW_SUMMARY=1 - Include runbook summary (default: 1)
#
# Supported Runbook Locations:
#   - orgs/{org}/platforms/{platform}/{instance}/configs/RUNBOOK.md (NEW - org-centric)
#   - orgs/{org}/platforms/{platform}/{instance}/RUNBOOK.md (NEW - org-centric)
#   - {plugin}/instances/{platform}/{org}/RUNBOOK.md (legacy)
#   - {plugin}/instances/{org}/RUNBOOK.md (legacy)
#   - instances/{platform}/{org}/RUNBOOK.md (project-level)
#   - $PWD/RUNBOOK.md
#   - $PWD/configs/RUNBOOK.md
#
# Version: 1.0.0
# Date: 2026-01-14
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Plugin root detection
if [ -n "${CLAUDE_PLUGIN_ROOT:-}" ]; then
    PLUGIN_ROOT="$CLAUDE_PLUGIN_ROOT"
else
    PLUGIN_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
fi

# Source standardized error handler if available
ERROR_HANDLER="${SCRIPT_DIR}/lib/error-handler.sh"
if [ -f "$ERROR_HANDLER" ]; then
    source "$ERROR_HANDLER"
    HOOK_NAME="pre-task-runbook-reminder"
    set_lenient_mode 2>/dev/null || true
fi

# Configuration
ENABLED="${RUNBOOK_REMINDER_ENABLED:-1}"
VERBOSE="${RUNBOOK_REMINDER_VERBOSE:-0}"
SHOW_SUMMARY="${RUNBOOK_REMINDER_SHOW_SUMMARY:-1}"

# Read hook input
HOOK_INPUT=""
if [ ! -t 0 ]; then
    HOOK_INPUT=$(cat)
fi

# Early exit if disabled
if [ "$ENABLED" = "0" ]; then
    [ -n "$HOOK_INPUT" ] && echo "$HOOK_INPUT"
    exit 0
fi

# ============================================================================
# Functions
# ============================================================================

log_verbose() {
    if [ "$VERBOSE" = "1" ]; then
        echo "[runbook-reminder] $1" >&2
    fi
}

# Detect org from various sources (Dual-Path Support)
detect_org() {
    local org=""

    # Try hook input first
    if [ -n "$HOOK_INPUT" ] && command -v jq &>/dev/null; then
        org=$(echo "$HOOK_INPUT" | jq -r '.sf_org_context.detected_org // ""' 2>/dev/null || echo "")
        [ -n "$org" ] && echo "$org" && return 0
    fi

    # Try environment variables
    [ -n "${ORG_SLUG:-}" ] && echo "$ORG_SLUG" && return 0
    [ -n "${SF_TARGET_ORG:-}" ] && echo "$SF_TARGET_ORG" && return 0
    [ -n "${SALESFORCE_ORG_ALIAS:-}" ] && echo "$SALESFORCE_ORG_ALIAS" && return 0
    [ -n "${HUBSPOT_PORTAL_ID:-}" ] && echo "hubspot-$HUBSPOT_PORTAL_ID" && return 0
    [ -n "${MARKETO_INSTANCE:-}" ] && echo "marketo-$MARKETO_INSTANCE" && return 0

    # Try to extract from PWD - NEW org-centric pattern first
    # Pattern: orgs/{org}/platforms/{platform}/{instance}/
    if [[ "$PWD" =~ /orgs/([^/]+)/platforms/([^/]+)/([^/]+) ]]; then
        # Export additional context
        export DETECTED_ORG_SLUG="${BASH_REMATCH[1]}"
        export DETECTED_PLATFORM="${BASH_REMATCH[2]}"
        export DETECTED_INSTANCE="${BASH_REMATCH[3]}"
        # Return instance name for compatibility
        echo "${BASH_REMATCH[3]}"
        return 0
    fi

    # Legacy: instances/{platform}/{org}/ or instances/{org}/
    if [[ "$PWD" =~ instances/([^/]+)/([^/]+) ]]; then
        echo "${BASH_REMATCH[2]}"
        return 0
    elif [[ "$PWD" =~ instances/([^/]+) ]]; then
        echo "${BASH_REMATCH[1]}"
        return 0
    fi

    return 1
}

# Detect platform from various sources
detect_platform() {
    local platform=""

    # Try hook input for agent type
    if [ -n "$HOOK_INPUT" ] && command -v jq &>/dev/null; then
        local agent_type
        agent_type=$(echo "$HOOK_INPUT" | jq -r '.subagent_type // ""' 2>/dev/null || echo "")

        case "$agent_type" in
            sfdc-*|salesforce-*|trigger-*|validation-rule-*|permission-*|flow-*)
                echo "salesforce"
                return 0
                ;;
            hubspot-*)
                echo "hubspot"
                return 0
                ;;
            marketo-*)
                echo "marketo"
                return 0
                ;;
        esac
    fi

    # Try environment
    [ -n "${SF_TARGET_ORG:-}" ] && echo "salesforce" && return 0
    [ -n "${HUBSPOT_PORTAL_ID:-}" ] && echo "hubspot" && return 0
    [ -n "${MARKETO_INSTANCE:-}" ] && echo "marketo" && return 0

    # Try PWD
    [[ "$PWD" =~ salesforce ]] && echo "salesforce" && return 0
    [[ "$PWD" =~ hubspot ]] && echo "hubspot" && return 0
    [[ "$PWD" =~ marketo ]] && echo "marketo" && return 0

    echo "unknown"
}

# Find runbook in standard locations (Dual-Path Support)
find_runbook() {
    local org="$1"
    local platform="$2"

    # Get the plugins directory (parent of opspal-core)
    local plugins_dir
    plugins_dir="$(cd "$PLUGIN_ROOT/.." && pwd)"

    # Get base project directory (parent of .claude-plugins)
    local project_dir
    project_dir="$(cd "$plugins_dir/.." && pwd)"

    # Get org slug if detected from org-centric path
    local org_slug="${DETECTED_ORG_SLUG:-}"
    local instance="${DETECTED_INSTANCE:-$org}"

    # Search locations in priority order
    local locations=(
        # NEW: Org-centric locations (highest priority)
        "$project_dir/orgs/$org_slug/platforms/$platform/$instance/configs/RUNBOOK.md"
        "$project_dir/orgs/$org_slug/platforms/$platform/$instance/RUNBOOK.md"
        "$project_dir/orgs/$org/platforms/$platform/$instance/configs/RUNBOOK.md"
        "$project_dir/orgs/$org/platforms/$platform/$instance/RUNBOOK.md"
        # Salesforce plugin locations
        "$plugins_dir/salesforce-plugin/instances/$platform/$org/RUNBOOK.md"
        "$plugins_dir/salesforce-plugin/instances/$org/RUNBOOK.md"
        # HubSpot plugin locations
        "$plugins_dir/hubspot-plugin/portals/$org/RUNBOOK.md"
        "$plugins_dir/hubspot-plugin/instances/$platform/$org/RUNBOOK.md"
        "$plugins_dir/hubspot-plugin/instances/$org/RUNBOOK.md"
        # Marketo plugin locations
        "$plugins_dir/marketo-plugin/instances/$platform/$org/RUNBOOK.md"
        "$plugins_dir/marketo-plugin/instances/$org/RUNBOOK.md"
        # Cross-platform locations
        "$plugins_dir/opspal-core/instances/$org/RUNBOOK.md"
        # Project-level instance locations
        "$project_dir/instances/$platform/$org/RUNBOOK.md"
        "$project_dir/instances/$org/RUNBOOK.md"
        # Current directory
        "$PWD/RUNBOOK.md"
        "$PWD/../RUNBOOK.md"
        "$PWD/configs/RUNBOOK.md"
    )

    for loc in "${locations[@]}"; do
        if [ -f "$loc" ]; then
            echo "$loc"
            return 0
        fi
    done

    return 1
}

# Extract key sections from runbook for summary
extract_runbook_summary() {
    local runbook_path="$1"
    local summary=""

    if command -v grep &>/dev/null; then
        # Extract section headers (## level)
        local sections
        sections=$(grep -E '^## ' "$runbook_path" 2>/dev/null | head -8 | sed 's/^## /  - /')

        if [ -n "$sections" ]; then
            summary="$sections"
        fi
    fi

    echo "$summary"
}

# Get runbook age
get_runbook_age() {
    local runbook_path="$1"
    local modified

    # Get modification time
    if [[ "$(uname)" == "Darwin" ]]; then
        modified=$(stat -f %m "$runbook_path" 2>/dev/null || echo 0)
    else
        modified=$(stat -c %Y "$runbook_path" 2>/dev/null || echo 0)
    fi

    local now
    now=$(date +%s)
    local age_days=$(( (now - modified) / 86400 ))

    echo "$age_days"
}

# ============================================================================
# Main Logic
# ============================================================================

# Detect context
ORG=$(detect_org || echo "")
PLATFORM=$(detect_platform)

log_verbose "Detected org: $ORG, platform: $PLATFORM"

# Try to find runbook
RUNBOOK_PATH=""
if [ -n "$ORG" ]; then
    RUNBOOK_PATH=$(find_runbook "$ORG" "$PLATFORM" || echo "")
fi

# If no org-specific runbook, try current directory
if [ -z "$RUNBOOK_PATH" ]; then
    if [ -f "$PWD/RUNBOOK.md" ]; then
        RUNBOOK_PATH="$PWD/RUNBOOK.md"
    elif [ -f "$PWD/../RUNBOOK.md" ]; then
        RUNBOOK_PATH="$PWD/../RUNBOOK.md"
    fi
fi

# Display reminder if runbook found
if [ -n "$RUNBOOK_PATH" ] && [ -f "$RUNBOOK_PATH" ]; then
    RUNBOOK_AGE=$(get_runbook_age "$RUNBOOK_PATH")

    echo ""
    echo "┌─────────────────────────────────────────────────────────────────┐"
    echo "│  📚 RUNBOOK AVAILABLE                                           │"
    echo "├─────────────────────────────────────────────────────────────────┤"
    echo "│  Review operational knowledge before starting work.            │"
    echo "│                                                                 │"
    printf "│  %-63s │\n" "Path: ${RUNBOOK_PATH##*/instances/}"
    printf "│  %-63s │\n" "Last updated: ${RUNBOOK_AGE} days ago"

    if [ "$SHOW_SUMMARY" = "1" ]; then
        SUMMARY=$(extract_runbook_summary "$RUNBOOK_PATH")
        if [ -n "$SUMMARY" ]; then
            echo "│                                                                 │"
            echo "│  Key sections:                                                  │"
            while IFS= read -r line; do
                printf "│  %-63s │\n" "$line"
            done <<< "$SUMMARY"
        fi
    fi

    echo "│                                                                 │"
    echo "│  Command: /view-runbook                                        │"
    echo "└─────────────────────────────────────────────────────────────────┘"
    echo "" >&2

    # If runbook is stale (>30 days), add warning
    if [ "$RUNBOOK_AGE" -gt 30 ]; then
        echo "⚠️  Runbook may be stale (${RUNBOOK_AGE} days old). Consider running /generate-runbook" >&2
    fi
else
    log_verbose "No runbook found for org: $ORG"
fi

# Pass through input unchanged
if [ -n "$HOOK_INPUT" ]; then
    echo "$HOOK_INPUT"
fi

exit 0
