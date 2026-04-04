#!/usr/bin/env bash
# =============================================================================
# UserPromptSubmit Sequential Dispatcher
# =============================================================================
#
# Purpose: Replace 7 parallel UserPromptSubmit hooks with a single sequential
#          dispatcher that guarantees execution order and produces one merged
#          additionalContext output.
#
# Why: Claude Code runs matching hooks in parallel. The unified-router writes
#      routing state that task-scope-selector reads — but in parallel, scope
#      often reads stale/empty state. This caused a governance deadlock where
#      scope suppressed the plugin that routing required.
#
# Architecture: Modeled on plugins/opspal-salesforce/hooks/pre-bash-dispatcher.sh
#
# Execution order:
#   1. user-prompt-first-run.sh     (onboarding gate — rarely fires)
#   2. pre-task-graph-trigger.sh    (flag detection — rarely fires)
#   3. routing-context-refresher.sh (periodic reminder — every ~20 msgs)
#   4. unified-router.sh            (PRIMARY — WRITES routing-state)
#   5. task-scope-selector.sh       (READS routing-state — MUST follow #4)
#   6. ambient-candidate-extractor  (fire-and-forget — zero Claude output)
#
# intake-suggestion.sh is intentionally omitted — unified-router handles
# intake gating. The script itself says: "Active intake gating is implemented
# in unified-router.sh."
#
# Event: UserPromptSubmit
# Timeout: 30s (worst-case sequential: 4+1+3+10+5 = 23s)
# =============================================================================

set -euo pipefail

if [[ "${HOOK_DEBUG:-}" == "true" ]]; then
  set -x
  echo "[hook-debug] $(basename "$0") starting (pid=$$)" >&2
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "[user-prompt-dispatcher] WARNING: jq not found — UPS child hooks disabled" >&2
  printf '{"suppressOutput":true,"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":"WARNING: UPS dispatcher skipped — jq not installed. Routing, scope selection, and task-graph detection are inactive."}}\n'
  exit 0
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"
HOOK_INPUT="$(cat 2>/dev/null || true)"
LAST_JSON=""

# ---------------------------------------------------------------------------
# Utility functions — ported from pre-bash-dispatcher.sh
# ---------------------------------------------------------------------------

emit_stderr() {
  local content="$1"
  if [ -n "$content" ]; then
    printf '%s' "$content" >&2
    case "$content" in
      *$'\n') ;;
      *) printf '\n' >&2 ;;
    esac
  fi
}

merge_hook_json() {
  local next_json="$1"

  if [ -z "$LAST_JSON" ]; then
    LAST_JSON="$next_json"
    return
  fi

  LAST_JSON="$(
    jq -nc \
      --argjson current "$LAST_JSON" \
      --argjson next "$next_json" \
      '
        def ctx($v): $v.hookSpecificOutput.additionalContext // "";
        {
          suppressOutput: true,
          hookSpecificOutput: {
            hookEventName: "UserPromptSubmit",
            additionalContext: (
              [ctx($current), ctx($next)]
              | map(select(length > 0))
              | join("\n\n---\n\n")
            )
          }
        }
        | if (.hookSpecificOutput.additionalContext == "")
          then del(.hookSpecificOutput.additionalContext)
          else .
          end
      ' 2>/dev/null || printf '%s' "$next_json"
  )"
}

handle_child_output() {
  local exit_code="$1"
  local stdout_content="$2"

  if [ -z "$stdout_content" ]; then
    return
  fi

  if printf '%s' "$stdout_content" | jq -e . >/dev/null 2>&1; then
    merge_hook_json "$stdout_content"
    return
  fi

  # Non-JSON stdout — route to stderr as informational text
  emit_stderr "$stdout_content"
}

run_child_hook() {
  local stdout_file
  local stderr_file
  local exit_code
  local stdout_content
  local stderr_content

  stdout_file="$(mktemp)"
  stderr_file="$(mktemp)"

  if printf '%s' "$HOOK_INPUT" | env DISPATCHER_CONTEXT=1 "$@" >"$stdout_file" 2>"$stderr_file"; then
    exit_code=0
  else
    exit_code=$?
  fi

  stdout_content="$(cat "$stdout_file")"
  stderr_content="$(cat "$stderr_file")"
  rm -f "$stdout_file" "$stderr_file"

  emit_stderr "$stderr_content"
  handle_child_output "$exit_code" "$stdout_content"

  if [ "$exit_code" -ne 0 ]; then
    echo "[user-prompt-dispatcher] WARNING: child hook exited $exit_code: $*" >&2
    # For UPS hooks, non-zero exit is a hook failure, not a governance deny.
    # Log the error but continue the chain — don't let one broken child
    # prevent routing and scope from executing.
  fi
}

run_fire_and_forget() {
  # Background launch for hooks with zero Claude output (ambient extractor).
  # No stdout capture, no merge, no exit-code check.
  ( printf '%s' "$HOOK_INPUT" | env DISPATCHER_CONTEXT=1 "$@" >/dev/null 2>/dev/null & )
}

# ---------------------------------------------------------------------------
# Sequential execution — critical ordering
# ---------------------------------------------------------------------------

if [ -z "$HOOK_INPUT" ]; then
  printf '{}\n'
  exit 0
fi

# Phase 1: Independent hooks (no routing-state dependencies)
run_child_hook "${PLUGIN_ROOT}/hooks/user-prompt-first-run.sh"
run_child_hook "${PLUGIN_ROOT}/hooks/pre-task-graph-trigger.sh"
run_child_hook "${PLUGIN_ROOT}/hooks/routing-context-refresher.sh"
run_child_hook "${PLUGIN_ROOT}/hooks/sop-prompt-lifecycle-detector.sh"

# Phase 2: Primary governance engine — WRITES routing-state
run_child_hook env \
  ROUTING_ADAPTIVE_CONTINUE=1 \
  ENABLE_HARD_BLOCKING=0 \
  ENABLE_COMPLEXITY_HARD_BLOCKING=0 \
  USER_PROMPT_MANDATORY_HARD_BLOCKING=0 \
  ENABLE_INTAKE_HARD_BLOCKING=0 \
  "${PLUGIN_ROOT}/hooks/unified-router.sh"

# Phase 3: Reads routing-state (MUST follow Phase 2)
run_child_hook "${PLUGIN_ROOT}/hooks/task-scope-selector.sh"

# intake-suggestion.sh intentionally omitted — router handles intake gating

# Phase 4: Fire-and-forget (zero Claude output, side-effect only)
run_fire_and_forget "${PLUGIN_ROOT}/hooks/ambient-candidate-extractor.sh"

# ---------------------------------------------------------------------------
# Emit merged result
# ---------------------------------------------------------------------------

if [ -n "$LAST_JSON" ]; then
  printf '%s\n' "$LAST_JSON"
fi

exit 0
