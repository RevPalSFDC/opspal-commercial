#!/usr/bin/env bash
###############################################################################
# Pre-Task Graph Trigger Hook (Simplified)
#
# Purpose: Detect explicit user flags that request Task Graph orchestration.
#          Complexity assessment is available on-demand via /complexity skill.
#
# Flags:
#   [SEQUENTIAL], [PLAN_CAREFULLY], [COMPLEX] — force Task Graph
#   [DIRECT], [QUICK_MODE], [SIMPLE] — skip Task Graph
#
# Configuration:
#   TASK_GRAPH_ENABLED=1   Enable/disable (default: 1)
###############################################################################

set -euo pipefail

# Hook debug support (all output to stderr)
if [[ "${HOOK_DEBUG:-}" == "true" ]]; then
    set -x
    echo "[hook-debug] $(basename "$0") starting (pid=$$)" >&2
fi

TASK_GRAPH_ENABLED="${TASK_GRAPH_ENABLED:-1}"

if [[ "$TASK_GRAPH_ENABLED" == "0" ]]; then
    printf '{}\n'
    exit 0
fi

# Dispatcher guard — this hook is invoked by user-prompt-dispatcher.sh.
# When run standalone (no dispatcher context and stdin is a terminal),
# exit cleanly rather than firing against ambient terminal input.
if [[ "${DISPATCHER_CONTEXT:-0}" != "1" ]] && [[ -t 0 ]]; then
  echo "[$(basename "$0")] INFO: standalone invocation — no dispatcher context, skipping" >&2
  exit 0
fi

# Read prompt from stdin
INPUT=""
if [[ ! -t 0 ]]; then
    INPUT=$(cat)
fi

if [[ -z "$INPUT" ]]; then
    printf '{}\n'
    exit 0
fi

# Extract user message (jq optional — fall back to raw input)
MSG="$INPUT"
if command -v jq &>/dev/null; then
    MSG=$(printf '%s' "$INPUT" | jq -r '.prompt // .message // .user_message // empty' 2>/dev/null || echo "$INPUT")
fi

# Check for force flags
if printf '%s' "$MSG" | grep -qE '\[SEQUENTIAL\]|\[PLAN_CAREFULLY\]|\[COMPLEX\]'; then
    echo "[task-graph-trigger] Force flag detected — recommending task-graph-orchestrator" >&2
    if command -v jq &>/dev/null; then
        jq -nc '{
            suppressOutput: true,
            hookSpecificOutput: {
                hookEventName: "UserPromptSubmit",
                additionalContext: "TASK GRAPH MODE: User flag detected. Route this request through task-graph-orchestrator for DAG decomposition and parallel execution."
            }
        }'
    else
        printf '{}\n'
    fi
    exit 0
fi

# Check for skip flags
if printf '%s' "$MSG" | grep -qE '\[DIRECT\]|\[QUICK_MODE\]|\[SIMPLE\]'; then
    echo "[task-graph-trigger] Skip flag detected" >&2
    printf '{}\n'
    exit 0
fi

# No flag — pass through (complexity scoring available on-demand via /complexity)
printf '{}\n'
exit 0
