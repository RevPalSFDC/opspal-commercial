#!/usr/bin/env bash
set -euo pipefail

##
# Pre-Agent Validator Hook
#
# Validates agent selection before agent execution to prevent routing errors.
# Blocks wrong agents and suggests correct ones based on task description.
#
# Adapted from SFDC pre-task-agent-validator.sh
##

# Hook debug support (all output to stderr)
if [[ "${HOOK_DEBUG:-}" == "true" ]]; then
    set -x
    echo "[hook-debug] $(basename "$0") starting (pid=$$)" >&2
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source error handler — try plugin-local lib first, then resolve core plugin
_EH="${SCRIPT_DIR}/lib/error-handler.sh"
if [[ ! -f "$_EH" ]]; then
    for _candidate in \
        "${SCRIPT_DIR}/../../opspal-core/hooks/lib/error-handler.sh" \
        "${CLAUDE_PLUGIN_ROOT:-/nonexistent}/opspal-core/hooks/lib/error-handler.sh" \
        "$HOME/.claude/plugins/marketplaces/opspal-commercial/plugins/opspal-core/hooks/lib/error-handler.sh"; do
        if [[ -f "$_candidate" ]]; then _EH="$_candidate"; break; fi
    done
fi
[[ -f "$_EH" ]] && source "$_EH"
unset _EH _candidate

if declare -f set_lenient_mode &>/dev/null; then
    HOOK_NAME="pre-task-agent-validator"
    set_lenient_mode 2>/dev/null || true
else
    # Inline fallback if error-handler not found
    set +e
    trap - ERR
fi

PROJECT_ROOT="${CLAUDE_PLUGIN_ROOT:-}"
BLOCK_EXIT_CODE="${HOOK_BLOCK_EXIT_CODE:-2}"
STRICT_VALIDATION="${HUBSPOT_TASK_AGENT_VALIDATOR_STRICT:-0}"

emit_pretool_noop() {
    printf '{}\n'
}

emit_pretool_response() {
    local permission_decision="$1"
    local permission_reason="$2"
    local additional_context="${3:-}"

    if ! command -v jq >/dev/null 2>&1; then
        emit_pretool_noop
        return 0
    fi

    jq -nc \
      --arg decision "$permission_decision" \
      --arg reason "$permission_reason" \
      --arg context "$additional_context" \
      '{
        suppressOutput: true,
        hookSpecificOutput: (
          { hookEventName: "PreToolUse" }
          + (if $decision != "${1:-}" then { permissionDecision: $decision } else {} end)
          + (if $reason != "${1:-}" then { permissionDecisionReason: $reason } else {} end)
          + (if $context != "${1:-}" then { additionalContext: $context } else {} end)
        )
      }'
}

# Read hook input from stdin if available
HOOK_INPUT="${1:-}"
if [[ ! -t 0 ]]; then
    HOOK_INPUT=$(cat)
fi

# Extract task description from environment or arguments
TASK_DESC="${TASK_DESCRIPTION:-${1:-}}"
AGENT_NAME="${AGENT_NAME:-${2:-}}"

if [[ -z "$TASK_DESC" ]] && [[ -n "$HOOK_INPUT" ]] && command -v jq >/dev/null 2>&1; then
    TASK_DESC=$(echo "$HOOK_INPUT" | jq -r '.tool_input.prompt // .prompt // .description // .task // "${1:-}"' 2>/dev/null || echo "${1:-}")
fi

if [[ -z "$AGENT_NAME" ]] && [[ -n "$HOOK_INPUT" ]] && command -v jq >/dev/null 2>&1; then
    AGENT_NAME=$(echo "$HOOK_INPUT" | jq -r '.tool_input.subagent_type // .subagent_type // .agent // "${1:-}"' 2>/dev/null || echo "${1:-}")
fi

AGENT_NAME_LOWER="$(printf '%s' "$AGENT_NAME" | tr '[:upper:]' '[:lower:]')"

# Only validate HubSpot-local agent launches here. Other plugin agents should
# not inherit HubSpot routing behavior just because this plugin is enabled.
if [[ -z "$AGENT_NAME_LOWER" ]] || [[ "$AGENT_NAME_LOWER" != *"hubspot"* ]]; then
    emit_pretool_noop
    exit 0
fi

# Exit if no task description
if [[ -z "$TASK_DESC" ]]; then
    # Not blocking - just informational
    emit_pretool_noop
    exit 0
fi

# Run task domain detector
DETECTOR_SCRIPT="$PROJECT_ROOT/scripts/lib/task-domain-detector.js"

if [[ -f "$DETECTOR_SCRIPT" ]]; then
    # Get suggested agent
    SUGGESTED_AGENT=$(node "$DETECTOR_SCRIPT" "$TASK_DESC" 2>/dev/null | tail -1)

    # If agent is specified, validate it
    if [[ -n "$AGENT_NAME" ]] && [[ -n "$SUGGESTED_AGENT" ]]; then
        # Run validation
        VALIDATION=$(node "$DETECTOR_SCRIPT" "$TASK_DESC" --validate "$AGENT_NAME" 2>&1)
        VALIDATION_CODE=$?

        if [[ $VALIDATION_CODE -ne 0 ]]; then
            echo "⚠️  Agent Validation Warning" >&2
            echo "================================" >&2
            echo "${1:-}" >&2
            echo "Task: $TASK_DESC" >&2
            echo "Selected Agent: $AGENT_NAME" >&2
            echo "Suggested Agent: $SUGGESTED_AGENT" >&2
            echo "${1:-}" >&2
            echo "$VALIDATION" >&2
            if [[ "$STRICT_VALIDATION" == "1" ]]; then
                echo "${1:-}" >&2
                echo "❌ Blocking due to HUBSPOT_TASK_AGENT_VALIDATOR_STRICT=1" >&2
                emit_pretool_response \
                  "deny" \
                  "HUBSPOT_AGENT_VALIDATION_STRICT: Selected agent '${AGENT_NAME}' did not match HubSpot task routing guidance." \
                  "Suggested agent: ${SUGGESTED_AGENT}. Validation detail: ${VALIDATION}"
                exit 0
            fi
        else
            echo "✅ Agent validation passed: $AGENT_NAME" >&2
        fi
    else
        # Just show suggestion
        if [[ -n "$SUGGESTED_AGENT" ]]; then
            echo "💡 Suggested agent for this task: $SUGGESTED_AGENT" >&2
        fi
    fi
fi

emit_pretool_noop
exit 0
