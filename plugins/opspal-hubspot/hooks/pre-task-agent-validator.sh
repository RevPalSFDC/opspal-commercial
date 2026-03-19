#!/bin/bash

##
# Pre-Agent Validator Hook
#
# Validates agent selection before agent execution to prevent routing errors.
# Blocks wrong agents and suggests correct ones based on task description.
#
# Adapted from SFDC pre-task-agent-validator.sh
##

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source standardized error handler for centralized logging
if [[ -n "${CLAUDE_PLUGIN_ROOT:-}" ]]; then
    ERROR_HANDLER="${CLAUDE_PLUGIN_ROOT}/opspal-core/hooks/lib/error-handler.sh"
else
    ERROR_HANDLER="${SCRIPT_DIR}/../../opspal-core/hooks/lib/error-handler.sh"
fi

if [[ -f "$ERROR_HANDLER" ]]; then
    source "$ERROR_HANDLER"
    HOOK_NAME="pre-task-agent-validator"
    # Lenient mode - validation should not block on internal errors
    set_lenient_mode 2>/dev/null || true
fi

PROJECT_ROOT="${CLAUDE_PLUGIN_ROOT}"
BLOCK_EXIT_CODE="${HOOK_BLOCK_EXIT_CODE:-2}"
STRICT_VALIDATION="${HUBSPOT_TASK_AGENT_VALIDATOR_STRICT:-0}"

# Read hook input from stdin if available
HOOK_INPUT=""
if [[ ! -t 0 ]]; then
    HOOK_INPUT=$(cat)
fi

# Extract task description from environment or arguments
TASK_DESC="${TASK_DESCRIPTION:-$1}"
AGENT_NAME="${AGENT_NAME:-$2}"

if [[ -z "$TASK_DESC" ]] && [[ -n "$HOOK_INPUT" ]] && command -v jq >/dev/null 2>&1; then
    TASK_DESC=$(echo "$HOOK_INPUT" | jq -r '.tool_input.prompt // .prompt // .description // .task // ""' 2>/dev/null || echo "")
fi

if [[ -z "$AGENT_NAME" ]] && [[ -n "$HOOK_INPUT" ]] && command -v jq >/dev/null 2>&1; then
    AGENT_NAME=$(echo "$HOOK_INPUT" | jq -r '.tool_input.subagent_type // .subagent_type // .agent // ""' 2>/dev/null || echo "")
fi

# Exit if no task description
if [[ -z "$TASK_DESC" ]]; then
    # Not blocking - just informational
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
            echo "" >&2
            echo "Task: $TASK_DESC" >&2
            echo "Selected Agent: $AGENT_NAME" >&2
            echo "Suggested Agent: $SUGGESTED_AGENT" >&2
            echo "" >&2
            echo "$VALIDATION" >&2
            if [[ "$STRICT_VALIDATION" == "1" ]]; then
                echo "" >&2
                echo "❌ Blocking due to HUBSPOT_TASK_AGENT_VALIDATOR_STRICT=1" >&2
                exit "$BLOCK_EXIT_CODE"
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

exit 0
