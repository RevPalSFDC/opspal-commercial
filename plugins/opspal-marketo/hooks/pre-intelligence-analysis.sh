#!/usr/bin/env bash
set -euo pipefail
exec 3>&1 1>&2

# Pre-Intelligence Analysis Hook
#
# Validates observability export freshness before analysis-oriented Marketo
# agents run so analysis prompts do not execute on missing or stale data.

MAX_DATA_AGE_HOURS=24
MIN_LEADS_FOR_ANALYSIS=100
MIN_ACTIVITIES_FOR_ANALYSIS=500

pass() {
    printf '{}\n' >&3
    exit 0
}

emit_block() {
    local message="$1"
    jq -nc --arg msg "$message" '{"suppressOutput": true, "hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "deny", "permissionDecisionReason": $msg}}' >&3
    exit 0
}

HOOK_INPUT=""
if [[ ! -t 0 ]]; then
    HOOK_INPUT="$(cat 2>/dev/null || true)"
fi

AGENT_NAME="${CLAUDE_AGENT_NAME:-${CLAUDE_TASK_AGENT:-}}"
TASK_PROMPT="${CLAUDE_TASK_PROMPT:-}"
if [[ -n "$HOOK_INPUT" ]] && command -v jq &>/dev/null; then
    AGENT_NAME="$(printf '%s' "$HOOK_INPUT" | jq -r '.tool_input.subagent_type // .subagent_type // .agent // empty' 2>/dev/null || echo "$AGENT_NAME")"
    TASK_PROMPT="$(printf '%s' "$HOOK_INPUT" | jq -r '.tool_input.prompt // .prompt // empty' 2>/dev/null || echo "$TASK_PROMPT")"
fi

AGENT_NAME_LOWER="$(printf '%s' "$AGENT_NAME" | tr '[:upper:]' '[:lower:]')"
TASK_PROMPT_LOWER="$(printf '%s' "$TASK_PROMPT" | tr '[:upper:]' '[:lower:]')"

case "$AGENT_NAME_LOWER" in
    marketo-intelligence-analyst)
        ;;
    marketo-observability-orchestrator)
        if ! printf '%s' "$TASK_PROMPT_LOWER" | grep -qE '(/analyze-performance|analy|insight|recommendation|performance)'; then
            pass
        fi
        ;;
    *)
        pass
        ;;
esac

PORTAL="${MARKETO_INSTANCE:-default}"
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$HOME/.claude-plugins/opspal-marketo}"
DATA_PATH="${PLUGIN_ROOT}/instances/${PORTAL}/observability/exports"

get_file_age_hours() {
    local file="$1"

    if [ ! -f "$file" ]; then
        echo "-1"
        return
    fi

    local file_time now age_seconds age_hours
    file_time="$(stat -c %Y "$file" 2>/dev/null || echo "0")"
    now="$(date +%s)"
    age_seconds=$((now - file_time))
    age_hours=$((age_seconds / 3600))

    echo "$age_hours"
}

check_record_count() {
    local file="$1"

    if [ ! -f "$file" ]; then
        echo "0"
        return
    fi

    grep -oP '"recordCount"\s*:\s*\K[0-9]+' "$file" 2>/dev/null || echo "0"
}

validate_json() {
    local file="$1"

    if [ ! -f "$file" ]; then
        return 1
    fi

    if grep -q '"recordCount"' "$file" && grep -q '"summary"' "$file"; then
        return 0
    fi

    return 1
}

main() {
    echo "=== Pre-Intelligence Analysis Validation ===" >&2

    local has_issues=0
    local has_warnings=0
    local leads_file leads_age leads_count
    local activities_file activities_age activities_count

    leads_file="${DATA_PATH}/leads/leads-current.json"
    leads_age="$(get_file_age_hours "$leads_file")"
    leads_count="$(check_record_count "$leads_file")"

    echo "" >&2
    echo "Leads Data:" >&2
    if [ "$leads_age" -eq -1 ]; then
        echo "  Status: NOT FOUND" >&2
        has_issues=1
    else
        echo "  Age: ${leads_age} hours" >&2
        echo "  Records: ${leads_count}" >&2

        if [ "$leads_age" -gt "$MAX_DATA_AGE_HOURS" ]; then
            echo "  Warning: Data older than ${MAX_DATA_AGE_HOURS} hours" >&2
            has_warnings=1
        fi

        if [ "$leads_count" -lt "$MIN_LEADS_FOR_ANALYSIS" ]; then
            echo "  Warning: Below minimum (${MIN_LEADS_FOR_ANALYSIS}) for analysis" >&2
            has_warnings=1
        fi

        if ! validate_json "$leads_file"; then
            echo "  Error: JSON structure invalid" >&2
            has_issues=1
        fi
    fi

    activities_file="${DATA_PATH}/activities/activities-7day.json"
    activities_age="$(get_file_age_hours "$activities_file")"
    activities_count="$(check_record_count "$activities_file")"

    echo "" >&2
    echo "Activities Data:" >&2
    if [ "$activities_age" -eq -1 ]; then
        echo "  Status: NOT FOUND" >&2
        has_issues=1
    else
        echo "  Age: ${activities_age} hours" >&2
        echo "  Records: ${activities_count}" >&2

        if [ "$activities_age" -gt "$MAX_DATA_AGE_HOURS" ]; then
            echo "  Warning: Data older than ${MAX_DATA_AGE_HOURS} hours" >&2
            has_warnings=1
        fi

        if [ "$activities_count" -lt "$MIN_ACTIVITIES_FOR_ANALYSIS" ]; then
            echo "  Warning: Below minimum (${MIN_ACTIVITIES_FOR_ANALYSIS}) for analysis" >&2
            has_warnings=1
        fi

        if ! validate_json "$activities_file"; then
            echo "  Error: JSON structure invalid" >&2
            has_issues=1
        fi
    fi

    echo "" >&2
    if [ "$has_issues" -eq 1 ]; then
        echo "VALIDATION FAILED - Cannot proceed with analysis" >&2
        echo "Required actions:" >&2
        echo "  1. Run /extract-wizard to export fresh data" >&2
        echo "  2. Ensure exports complete successfully" >&2
        echo "  3. Re-run analysis" >&2
        emit_block "Marketo analysis blocked: observability exports are missing, stale, or invalid. Run /extract-wizard, verify export completion, then retry /analyze-performance."
    fi

    if [ "$has_warnings" -eq 1 ]; then
        echo "VALIDATION PASSED WITH WARNINGS" >&2
        echo "Analysis will proceed but results may be limited" >&2
        echo "Consider refreshing data with /extract-wizard" >&2
    else
        echo "VALIDATION PASSED - Data ready for analysis" >&2
    fi

    pass
}

main "$@"
