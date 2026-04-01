#!/usr/bin/env bash
# =============================================================================
# Stop Sequential Dispatcher
# =============================================================================
#
# Purpose: Replace parallel Stop hooks with a single sequential dispatcher
#          that guarantees execution order for session teardown.
#
# Why: Session cleanup must follow a strict ordering — governance verification
#      runs first, then cleanup, then reliability retry/refresh, then analysis
#      and observation, then flush. Running these in parallel creates race
#      conditions where flush executes before capture completes.
#
# Execution order:
#   1. pre-stop-org-verification.sh        (governance — must run first)
#   2. session-end.sh                      (primary session cleanup)
#   3. session-end-reliability.sh          (retry/refresh — after cleanup)
#   4. stop-session-silent-failure-summary.sh (silent failure analysis)
#   5. ambient-hook-error-observer.sh      (error observation)
#   6. ambient-flush-trigger.sh            (flush — must run last)
#
# Event: Stop, Matcher: *
# Timeout: 90s (session-end-reliability alone has 60s timeout)
# =============================================================================

set -euo pipefail

if [[ "${HOOK_DEBUG:-}" == "true" ]]; then
  set -x
  echo "[hook-debug] $(basename "$0") starting (pid=$$)" >&2
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "[stop-dispatcher] WARNING: jq not found — Stop child hooks disabled" >&2
  printf '{"suppressOutput":true,"stopReason":"WARNING: Stop dispatcher skipped — jq not installed. Session cleanup, org verification, and ambient flush are inactive."}\n'
  exit 0
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"
HOOK_INPUT="$(cat 2>/dev/null || true)"
LAST_JSON=""

# ---------------------------------------------------------------------------
# Utility functions
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
        def ctx($v): $v.stopReason // "";
        {
          suppressOutput: true,
          stopReason: (
            [ctx($current), ctx($next)]
            | map(select(length > 0))
            | join("\n\n---\n\n")
          )
        }
        | if (.stopReason == "")
          then del(.stopReason)
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
    echo "[stop-dispatcher] WARNING: child hook exited $exit_code: $*" >&2
    # Non-zero exit is a hook failure, not a governance deny.
    # Log the error but continue the chain — session teardown must complete
    # even if individual hooks encounter errors.
  fi
}

# ---------------------------------------------------------------------------
# Sequential execution — strict ordering for session teardown
# ---------------------------------------------------------------------------

if [ -z "$HOOK_INPUT" ]; then
  printf '{}\n'
  exit 0
fi

# Phase 1: Governance — must verify org state before any cleanup
run_child_hook "${PLUGIN_ROOT}/hooks/pre-stop-org-verification.sh"

# Phase 2: Primary session cleanup
run_child_hook "${PLUGIN_ROOT}/hooks/session-end.sh"

# Phase 3: Reliability retry/refresh — after cleanup, before analysis
run_child_hook "${PLUGIN_ROOT}/hooks/session-end-reliability.sh"

# Phase 4: Analysis and observation
run_child_hook "${PLUGIN_ROOT}/hooks/stop-session-silent-failure-summary.sh"
run_child_hook "${PLUGIN_ROOT}/hooks/ambient-hook-error-observer.sh"

# Phase 5: Flush — must run last after all capture is complete
run_child_hook "${PLUGIN_ROOT}/hooks/ambient-flush-trigger.sh"

# ---------------------------------------------------------------------------
# Emit merged result
# ---------------------------------------------------------------------------

if [ -n "$LAST_JSON" ]; then
  printf '%s\n' "$LAST_JSON"
fi

exit 0
