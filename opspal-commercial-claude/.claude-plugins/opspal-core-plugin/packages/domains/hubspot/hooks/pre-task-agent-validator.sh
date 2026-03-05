#!/bin/bash

##
# Pre-Task Agent Validator Hook
#
# Validates agent selection before task execution to prevent routing errors.
# Blocks wrong agents and suggests correct ones based on task description.
#
# Adapted from SFDC pre-task-agent-validator.sh
##

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source standardized error handler for centralized logging
if [[ -n "${CLAUDE_PLUGIN_ROOT:-}" ]]; then
    ERROR_HANDLER="${CLAUDE_PLUGIN_ROOT}/packages/opspal-core/cross-platform-plugin/hooks/lib/error-handler.sh"
else
    ERROR_HANDLER="${SCRIPT_DIR}/../../../opspal-core/cross-platform-plugin/hooks/lib/error-handler.sh"
fi

if [[ -f "$ERROR_HANDLER" ]]; then
    source "$ERROR_HANDLER"
    HOOK_NAME="pre-task-agent-validator"
    # Lenient mode - validation should not block on internal errors
    set_lenient_mode 2>/dev/null || true
fi

resolve_domain_root() {
    local dir="$1"
    while [[ "$dir" != "/" ]]; do
        if [[ -d "$dir/scripts" ]]; then
            echo "$dir"
            return 0
        fi
        dir="$(dirname "$dir")"
    done
    echo "$1"
}

DOMAIN_ROOT="$(resolve_domain_root "$SCRIPT_DIR")"
PROJECT_ROOT="$DOMAIN_ROOT"
if [[ -n "${CLAUDE_PLUGIN_ROOT:-}" ]]; then
    DOMAIN_NAME="$(basename "$DOMAIN_ROOT")"
    case "$CLAUDE_PLUGIN_ROOT" in
        *"/packages/domains/$DOMAIN_NAME"|*/"$DOMAIN_NAME"-plugin) PROJECT_ROOT="$CLAUDE_PLUGIN_ROOT" ;;
    esac
fi

# Extract task description from environment or arguments
TASK_DESC="${TASK_DESCRIPTION:-$1}"
AGENT_NAME="${AGENT_NAME:-$2}"

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
            echo "⚠️  Agent Validation Warning"
            echo "================================"
            echo ""
            echo "Task: $TASK_DESC"
            echo "Selected Agent: $AGENT_NAME"
            echo "Suggested Agent: $SUGGESTED_AGENT"
            echo ""
            echo "$VALIDATION"
            echo ""
            echo "Continue anyway? (y/n)"
            read -r response
            if [[ "$response" != "y" ]] && [[ "$response" != "Y" ]]; then
                echo "❌ Task cancelled by user"
                exit 1
            fi
        else
            echo "✅ Agent validation passed: $AGENT_NAME"
        fi
    else
        # Just show suggestion
        if [[ -n "$SUGGESTED_AGENT" ]]; then
            echo "💡 Suggested agent for this task: $SUGGESTED_AGENT"
        fi
    fi
fi

exit 0
