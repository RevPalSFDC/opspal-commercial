#!/bin/bash
# =============================================================================
# Session Init Hook (Unified)
# =============================================================================
#
# Purpose: Unified session initialization consolidating previous hooks:
#   - session-start-scratchpad.sh
#   - session-start-env-config.sh
#   - session-start-version-check.sh
#   - session-start-agent-reminder.sh
#   - session-start-marketo.sh (platform-specific init)
#
# Version: 1.0.0
# Created: 2026-01-09
#
# Event: SessionStart
# Timeout: 15000ms
#
# Responsibilities:
#   1. Load scratchpad (session continuity)
#   2. Detect and load environment config
#   3. Version compatibility check
#   4. Platform-specific initialization
#   5. Agent reminder injection
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
    HOOK_NAME="session-init"
    set_lenient_mode 2>/dev/null || true
fi

# Configuration
VERBOSE="${SESSION_INIT_VERBOSE:-0}"
SKIP_SCRATCHPAD="${SKIP_SCRATCHPAD:-0}"
SKIP_ENV_CHECK="${SKIP_ENV_CHECK:-0}"
SKIP_VERSION_CHECK="${SKIP_VERSION_CHECK:-0}"
RESET_TASK_SCOPE_STATE="${RESET_TASK_SCOPE_STATE:-1}"

# Output message collection
INIT_MESSAGES=()

log_verbose() {
    if [[ "$VERBOSE" = "1" ]]; then
        echo "[session-init] $1" >&2
    fi
}

add_message() {
    INIT_MESSAGES+=("$1")
}

reset_task_scope_state() {
    if [[ "$RESET_TASK_SCOPE_STATE" != "1" ]]; then
        return
    fi

    local scope_state_dir="${HOME}/.claude/session-context"
    local scope_state_file="${scope_state_dir}/task-scope.json"

    mkdir -p "$scope_state_dir" 2>/dev/null || true
    rm -f "$scope_state_file" 2>/dev/null || true
}

# =============================================================================
# 1. Scratchpad Loading
# =============================================================================

load_scratchpad() {
    if [[ "$SKIP_SCRATCHPAD" = "1" ]]; then
        return
    fi

    local scratchpad_loader="$PLUGIN_ROOT/hooks/session-start-scratchpad.sh"
    if [[ -f "$scratchpad_loader" ]] && [[ -x "$scratchpad_loader" ]]; then
        log_verbose "Loading scratchpad..."
        local result
        result=$(bash "$scratchpad_loader" 2>&1 || echo "")
        if [[ -n "$result" ]]; then
            log_verbose "Scratchpad loaded"
        fi
    fi
}

# =============================================================================
# 2. Environment Config Detection
# =============================================================================

ENV_CONFIG_TMPFILE="${TMPDIR:-/tmp}/session-init-envconfig-$$.txt"

check_env_config() {
    if [[ "$SKIP_ENV_CHECK" = "1" ]]; then
        return
    fi

    local env_checker="$PLUGIN_ROOT/hooks/session-start-env-config.sh"
    if [[ -f "$env_checker" ]] && [[ -x "$env_checker" ]]; then
        log_verbose "Checking environment config..."
        local result
        result=$(bash "$env_checker" 2>&1 || echo "")
        if echo "$result" | grep -qi "warning\|missing\|error"; then
            # Write to temp file so parent can collect after wait
            echo "$result" > "$ENV_CONFIG_TMPFILE"
        fi
    fi
}

# =============================================================================
# 3. Version Compatibility Check
# =============================================================================

check_version_compatibility() {
    if [[ "$SKIP_VERSION_CHECK" = "1" ]]; then
        return
    fi

    local version_checker="$PLUGIN_ROOT/hooks/session-start-version-check.sh"
    if [[ -f "$version_checker" ]] && [[ -x "$version_checker" ]]; then
        log_verbose "Checking version compatibility..."
        bash "$version_checker" >/dev/null 2>&1 || true
    fi
}

# =============================================================================
# 4. Platform-Specific Initialization
# =============================================================================

initialize_platform() {
    # Detect platform
    local platform="unknown"
    if type detect_platform &>/dev/null; then
        platform=$(detect_platform)
    else
        # Simple detection
        if [[ -n "${SF_TARGET_ORG:-}" ]] || [[ -f "sfdx-project.json" ]]; then
            platform="salesforce"
        elif [[ -n "${HUBSPOT_PORTAL_ID:-}" ]]; then
            platform="hubspot"
        elif [[ -n "${MARKETO_INSTANCE:-}" ]]; then
            platform="marketo"
        fi
    fi

    log_verbose "Detected platform: $platform"

    # Run platform-specific init
    case "$platform" in
        salesforce)
            local sf_init="${PLUGIN_ROOT}/../salesforce-plugin/hooks/session-start-sf.sh"
            if [[ -f "$sf_init" ]] && [[ -x "$sf_init" ]]; then
                bash "$sf_init" >/dev/null 2>&1 || true
            fi
            ;;
        hubspot)
            local hs_init="${PLUGIN_ROOT}/../hubspot-plugin/hooks/session-start-hs.sh"
            if [[ -f "$hs_init" ]] && [[ -x "$hs_init" ]]; then
                bash "$hs_init" >/dev/null 2>&1 || true
            fi
            ;;
        marketo)
            local mkto_init="${PLUGIN_ROOT}/../marketo-plugin/hooks/session-start-marketo.sh"
            if [[ -f "$mkto_init" ]] && [[ -x "$mkto_init" ]]; then
                bash "$mkto_init" >/dev/null 2>&1 || true
            fi
            ;;
    esac
}

# =============================================================================
# 5. Load Context (via base context loader)
# =============================================================================

load_context() {
    local context_loader="$PLUGIN_ROOT/hooks/context-loader/base-context-loader.sh"
    if [[ -f "$context_loader" ]] && [[ -x "$context_loader" ]]; then
        log_verbose "Loading platform context..."
        # Use cache during session start — 5-min TTL is fine for init
        CONTEXT_LIVE_FIRST=false bash "$context_loader" >/dev/null 2>&1 || true
    fi
}

# =============================================================================
# 6. Org-Specific Skills Hint
# =============================================================================

check_org_skills() {
    local org_slug="${ORG_SLUG:-}"
    if [[ -z "$org_slug" ]]; then
        return
    fi

    # Find the orgs directory relative to workspace root
    local workspace_root
    workspace_root=$(git -C "$(pwd)" rev-parse --show-toplevel 2>/dev/null || echo "$(pwd)")
    local org_skills_dir="$workspace_root/orgs/$org_slug/.claude/skills"

    if [[ -d "$org_skills_dir" ]]; then
        # Check if there are actual skill files (not just .gitkeep)
        local skill_count
        skill_count=$(find "$org_skills_dir" -name "SKILL.md" 2>/dev/null | wc -l)
        if [[ "$skill_count" -gt 0 ]]; then
            add_message "Org-specific skills available for $org_slug ($skill_count skills). Use: claude --add-dir orgs/$org_slug"
        fi
    fi
}

# =============================================================================
# 7. Auto Memory Precedence Note
# =============================================================================

check_auto_memory_precedence() {
    local org_slug="${ORG_SLUG:-}"
    if [[ -z "$org_slug" ]]; then
        return
    fi

    # Only emit if structured context sources exist for this org
    local workspace_root
    workspace_root=$(git -C "$(pwd)" rev-parse --show-toplevel 2>/dev/null || echo "$(pwd)")
    local org_dir="$workspace_root/orgs/$org_slug"

    if [[ -f "$org_dir/WORK_INDEX.yaml" ]] || [[ -f "$org_dir/configs/field-dictionary.yaml" ]]; then
        add_message "Structured context from Work Index and field dictionaries takes precedence over auto-recalled memories."
    fi
}

# =============================================================================
# 8. Agent Teams Detection
# =============================================================================

check_agent_teams_flag() {
    if [[ "${CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS:-}" = "1" ]]; then
        add_message "Agent Teams experimental mode detected. Team-based workflows are available but not recommended for production client work."
    fi
}

# =============================================================================
# Main
# =============================================================================

log_verbose "Session initialization starting..."

reset_task_scope_state

# Run heavy subprocesses in parallel (writes to temp files, not arrays)
load_scratchpad &
check_version_compatibility &
initialize_platform &
load_context &
check_env_config &
wait

# Collect env config warnings from temp file (backgrounded check_env_config writes here)
if [[ -f "$ENV_CONFIG_TMPFILE" ]]; then
    add_message "$(cat "$ENV_CONFIG_TMPFILE")"
    rm -f "$ENV_CONFIG_TMPFILE"
fi

# Run lightweight steps that use add_message sequentially
check_org_skills
check_auto_memory_precedence
check_agent_teams_flag

log_verbose "Session initialization complete"

# Build output
if [[ ${#INIT_MESSAGES[@]} -gt 0 ]]; then
    # Output initialization messages
    printf '%s\n' "${INIT_MESSAGES[@]}" >&2
fi

# Return empty JSON (session init is informational)
echo '{}'
exit 0
