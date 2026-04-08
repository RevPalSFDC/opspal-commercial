#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(dirname "$SCRIPT_DIR")"

ERROR_HANDLER="$PLUGIN_ROOT/hooks/lib/error-handler.sh"
if [[ -f "$ERROR_HANDLER" ]]; then
    # shellcheck source=/dev/null
    source "$ERROR_HANDLER"
    HOOK_NAME="ambient-flush-trigger"
    set_lenient_mode 2>/dev/null || true
fi

if ! command -v node >/dev/null 2>&1; then
    printf '{}\n'
    exit 0
fi

# Skip in subagent context — flush evaluation only valuable at main session level.
if [[ -n "${CLAUDE_AGENT_CONTEXT:-}" ]] || [[ -n "${CLAUDE_SUBAGENT_NAME:-}" ]]; then
    printf '{}\n'
    exit 0
fi

INPUT="$(cat 2>/dev/null || true)"
TRIGGER="${1:-}"
FORCE_ARGS=()

if [[ -z "$TRIGGER" ]] && command -v jq >/dev/null 2>&1 && [[ -n "$INPUT" ]] && echo "$INPUT" | jq -e . >/dev/null 2>&1; then
    HOOK_EVENT="$(echo "$INPUT" | jq -r '.hook_event_name // empty' 2>/dev/null || true)"
    case "$HOOK_EVENT" in
        PostToolUse)
            TRIGGER="post_tool_use"
            ;;
        Stop)
            TRIGGER="session_end"
            ;;
        PreCompact)
            TRIGGER="pre_compact"
            ;;
        TaskCompleted)
            TRIGGER="task_completion"
            ;;
    esac
fi

TRIGGER="${TRIGGER:-post_tool_use}"

if [[ "${AMBIENT_REFLECT_FORCE_FLUSH:-0}" == "1" ]] || [[ "$TRIGGER" == "manual_reflect" ]]; then
    FORCE_ARGS+=(--force)
fi

RESULT="$(node "$PLUGIN_ROOT/scripts/lib/ambient/flush-trigger-engine.js" "$TRIGGER" "${FORCE_ARGS[@]}" 2>/dev/null || echo '{}')"
if [[ "${AMBIENT_REFLECT_DEBUG:-0}" == "1" ]] && [[ -n "$RESULT" ]] && [[ "$RESULT" != "{}" ]]; then
    echo "[ambient-flush-trigger] $RESULT" >&2
fi

if [[ "${AMBIENT_REFLECT_CAPTURE_RESULT:-0}" == "1" ]]; then
    printf '%s\n' "$RESULT" >&2
fi

printf '{}\n'
exit 0
