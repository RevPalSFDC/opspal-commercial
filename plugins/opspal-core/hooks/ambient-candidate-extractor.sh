#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(dirname "$SCRIPT_DIR")"

ERROR_HANDLER="$PLUGIN_ROOT/hooks/lib/error-handler.sh"
if [[ -f "$ERROR_HANDLER" ]]; then
    # shellcheck source=/dev/null
    source "$ERROR_HANDLER"
    HOOK_NAME="ambient-candidate-extractor"
    set_lenient_mode 2>/dev/null || true
fi

# Dispatcher guard — this hook is invoked by user-prompt-dispatcher.sh.
# When run standalone (no dispatcher context and stdin is a terminal),
# exit cleanly rather than firing against ambient terminal input.
if [[ "${DISPATCHER_CONTEXT:-0}" != "1" ]] && [[ -t 0 ]]; then
  echo "[$(basename "$0")] INFO: standalone invocation — no dispatcher context, skipping" >&2
  exit 0
fi

if ! command -v node >/dev/null 2>&1 || ! command -v jq >/dev/null 2>&1; then
    exit 0
fi

INPUT="$(cat 2>/dev/null || true)"
if [[ -z "$INPUT" ]] || ! echo "$INPUT" | jq -e . >/dev/null 2>&1; then
    exit 0
fi

HOOK_EVENT="$(echo "$INPUT" | jq -r '.hook_event_name // empty' 2>/dev/null || true)"
if [[ -z "$HOOK_EVENT" ]] && echo "$INPUT" | jq -e 'has("tool_name")' >/dev/null 2>&1; then
    HOOK_EVENT="PostToolUse"
fi

case "$HOOK_EVENT" in
    PostToolUse)
        EXTRACTOR="$PLUGIN_ROOT/scripts/lib/ambient/extractors/post-tool-extractor.js"
        ;;
    UserPromptSubmit)
        EXTRACTOR="$PLUGIN_ROOT/scripts/lib/ambient/extractors/user-prompt-extractor.js"
        ;;
    SubagentStop)
        EXTRACTOR="$PLUGIN_ROOT/scripts/lib/ambient/extractors/subagent-extractor.js"
        ;;
    TaskCompleted)
        EXTRACTOR="$PLUGIN_ROOT/scripts/lib/ambient/extractors/task-completed-extractor.js"
        ;;
    *)
        exit 0
        ;;
esac

if [[ ! -f "$EXTRACTOR" ]]; then
    exit 0
fi

CANDIDATES="$(printf '%s' "$INPUT" | node "$EXTRACTOR" 2>/dev/null || echo '[]')"
if [[ -z "$CANDIDATES" ]] || [[ "$CANDIDATES" == "[]" ]]; then
    exit 0
fi

node "$PLUGIN_ROOT/scripts/lib/ambient/reflection-candidate-buffer.js" add "$CANDIDATES" >/dev/null 2>&1 || true

exit 0
