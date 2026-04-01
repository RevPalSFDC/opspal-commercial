#!/usr/bin/env bash
# =============================================================================
# SessionStart Sequential Dispatcher
# =============================================================================
#
# Purpose: Replace parallel SessionStart hooks with a single sequential
#          dispatcher that guarantees execution order for session initialization.
#
# Why: Session startup has a strict dependency order — onboarding must check
#      first-run state before init runs, silent failure detection should happen
#      early, env validation must precede git pulls, and ambient pipeline init
#      runs last once the session environment is confirmed stable.
#
# Execution order:
#   1. session-start-first-run.sh          (onboarding gate — rarely fires)
#   2. session-init.sh                     (primary session initialization)
#   3. pre-session-silent-failure-check.sh (failure detection — early warning)
#   4. session-start-envcheck.sh           (environment validation)
#   5. session-start-repo-sync.sh          (git pulls — after env validated)
#   6. session-capture-init.sh             (ambient pipeline init — last)
#
# Event: SessionStart, Matcher: *
# Timeout: 30s
# =============================================================================

set -euo pipefail

if [[ "${HOOK_DEBUG:-}" == "true" ]]; then
  set -x
  echo "[hook-debug] $(basename "$0") starting (pid=$$)" >&2
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "[session-start-dispatcher] WARNING: jq not found — SessionStart child hooks disabled" >&2
  printf '{"suppressOutput":true,"systemMessage":"WARNING: SessionStart dispatcher skipped — jq not installed. Onboarding check, session initialization, and env validation are inactive."}}\n'
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
        def ctx($v): $v.systemMessage // "";
        {
          suppressOutput: true,
          systemMessage: (
            [ctx($current), ctx($next)]
            | map(select(length > 0))
            | join("\n\n---\n\n")
          )
        }
        | if (.systemMessage == "")
          then del(.systemMessage)
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
    echo "[session-start-dispatcher] WARNING: child hook exited $exit_code: $*" >&2
    # Non-zero exit is a hook failure, not a governance deny.
    # Log the error but continue the chain — session startup must complete
    # even if individual hooks encounter errors.
  fi
}

# ---------------------------------------------------------------------------
# Sequential execution — strict ordering for session initialization
# ---------------------------------------------------------------------------

if [ -z "$HOOK_INPUT" ]; then
  printf '{}\n'
  exit 0
fi

# Phase 1: Onboarding gate — check first-run state before anything else
run_child_hook "${PLUGIN_ROOT}/hooks/session-start-first-run.sh"

# Phase 2: Primary session initialization
run_child_hook "${PLUGIN_ROOT}/hooks/session-init.sh"

# Phase 3: Early warning systems — detect failures before proceeding
run_child_hook "${PLUGIN_ROOT}/hooks/pre-session-silent-failure-check.sh"

# Phase 4: Environment validation — must pass before git operations
run_child_hook "${PLUGIN_ROOT}/hooks/session-start-envcheck.sh"

# Phase 5: Git pulls — after env is validated
run_child_hook "${PLUGIN_ROOT}/hooks/session-start-repo-sync.sh"

# Phase 6: Ambient pipeline initialization — last, once session is stable
run_child_hook "${PLUGIN_ROOT}/hooks/session-capture-init.sh"

# ---------------------------------------------------------------------------
# Emit merged result
# ---------------------------------------------------------------------------

if [ -n "$LAST_JSON" ]; then
  printf '%s\n' "$LAST_JSON"
fi

exit 0
