#!/usr/bin/env bash
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

collect_platform_message() {
    local raw_output="$1"
    local system_message=""
    local additional_context=""

    if [[ -z "${raw_output//[[:space:]]/}" ]]; then
        return
    fi

    if command -v jq >/dev/null 2>&1 && printf '%s' "$raw_output" | jq -e . >/dev/null 2>&1; then
        system_message="$(printf '%s' "$raw_output" | jq -r '.systemMessage // empty' 2>/dev/null || true)"
        if [[ -n "$system_message" ]]; then
            add_message "$system_message"
            return
        fi

        additional_context="$(printf '%s' "$raw_output" | jq -r '.hookSpecificOutput.additionalContext // empty' 2>/dev/null || true)"
        if [[ -n "$additional_context" ]]; then
            add_message "$additional_context"
        fi
        return
    fi

    add_message "$raw_output"
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
PLATFORM_INIT_OUTPUT_DIR="${TMPDIR:-/tmp}/session-init-platform-$$"

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
    # Run all platform context loaders in parallel.
    # Each loader checks its own env/config and no-ops if unconfigured.
    # SF agent-reminder must complete before SF context-loader (exports SF_TARGET_ORG).
    local plugins_root="${PLUGIN_ROOT}/.."

    mkdir -p "$PLATFORM_INIT_OUTPUT_DIR" 2>/dev/null || true

    run_loader_if_exists() {
        local script="$1"
        local plugin_name=""
        local output_file=""
        if [[ -f "$script" ]]; then
            plugin_name="$(basename "$(dirname "$(dirname "$script")")")"
            output_file="${PLATFORM_INIT_OUTPUT_DIR}/${plugin_name}-$(basename "$script").out"
            bash "$script" </dev/null >"$output_file" 2>/dev/null || true
        fi
    }

    # SF pair: sequential (agent-reminder exports SF_TARGET_ORG for context-loader)
    (run_loader_if_exists "${plugins_root}/opspal-salesforce/hooks/session-start-agent-reminder.sh" && \
     run_loader_if_exists "${plugins_root}/opspal-salesforce/hooks/pre-task-context-loader.sh") &

    # Independent loaders: all parallel
    run_loader_if_exists "${plugins_root}/opspal-hubspot/hooks/pre-task-context-loader.sh" &
    run_loader_if_exists "${plugins_root}/opspal-marketo/hooks/session-start-marketo.sh" &
    run_loader_if_exists "${plugins_root}/opspal-gtm-planning/hooks/session-start-gtm-context-loader.sh" &
    run_loader_if_exists "${plugins_root}/opspal-okrs/hooks/session-start-okr-context-loader.sh" &

    wait
    log_verbose "Platform initialization complete"
}

collect_platform_init_messages() {
    local output_file=""

    for output_file in "$PLATFORM_INIT_OUTPUT_DIR"/*.out; do
        if [[ ! -f "$output_file" ]]; then
            continue
        fi
        collect_platform_message "$(cat "$output_file" 2>/dev/null || true)"
    done

    rm -rf "$PLATFORM_INIT_OUTPUT_DIR" 2>/dev/null || true
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

emit_session_start_output() {
    local combined_message=""
    local message=""

    if [[ ${#INIT_MESSAGES[@]} -eq 0 ]]; then
        printf '{}\n'
        return
    fi

    for message in "${INIT_MESSAGES[@]}"; do
        if [[ -z "${message//[[:space:]]/}" ]]; then
            continue
        fi

        if [[ -n "$combined_message" ]]; then
            combined_message="${combined_message}"$'\n\n'"${message}"
        else
            combined_message="$message"
        fi
    done

    if [[ -z "$combined_message" ]]; then
        printf '{}\n'
        return
    fi

    if command -v jq >/dev/null 2>&1; then
        jq -n \
          --arg msg "$combined_message" \
          '{
            systemMessage: $msg,
            hookSpecificOutput: {
              hookEventName: "SessionStart",
              additionalContext: $msg
            }
          }'
        return
    fi

    printf '{}\n'
}

# =============================================================================
# Main
# =============================================================================

log_verbose "Session initialization starting..."

reset_task_scope_state

# Clear shared state file from any previous session before loaders append to it (O3 fix)
_SHARED_STATE="${HOME}/.claude/session-state/session-init-state.env"
mkdir -p "$(dirname "$_SHARED_STATE")" 2>/dev/null || true
: > "$_SHARED_STATE" 2>/dev/null || true

# Run heavy subprocesses in parallel (writes to temp files, not arrays)
load_scratchpad &
check_version_compatibility &
initialize_platform &
load_context &
check_env_config &
wait

# Source shared state written by platform loaders — makes GTM_ACTIVE_CYCLE,
# OKR_ACTIVE_CYCLE, DETECTED_PLATFORM, etc. available for sequential steps below (O3 fix)
if [[ "${SESSION_INIT_SHARED_STATE:-1}" == "1" ]] && [[ -s "$_SHARED_STATE" ]]; then
    # shellcheck disable=SC1090
    source "$_SHARED_STATE" 2>/dev/null || true
fi

# Collect env config warnings from temp file (backgrounded check_env_config writes here)
if [[ -f "$ENV_CONFIG_TMPFILE" ]]; then
    add_message "$(cat "$ENV_CONFIG_TMPFILE")"
    rm -f "$ENV_CONFIG_TMPFILE"
fi

collect_platform_init_messages

# Run lightweight steps that use add_message sequentially
check_org_skills
check_auto_memory_precedence
check_agent_teams_flag

log_verbose "Session initialization complete"

emit_session_start_output
exit 0
