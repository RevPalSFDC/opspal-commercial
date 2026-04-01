#!/usr/bin/env bash
# =============================================================================
# SubagentStop Sequential Dispatcher
# =============================================================================
#
# Purpose: Replace parallel SubagentStop hooks with a single sequential
#          dispatcher that guarantees execution order for sub-agent teardown.
#
# Why: Sub-agent stop processing has a strict dependency order — failures
#      must be captured first, then claims verified, then execution proofed,
#      then ambient signals extracted. Running in parallel causes the extractor
#      to miss freshly-written capture data.
#
# Execution order:
#   1. subagent-stop-capture.sh             (capture failures — must run first)
#   2. post-subagent-verification.sh        (verify claims against captured data)
#   3. post-investigation-execution-proof.sh (verify actual execution)
#   4. ambient-candidate-extractor.sh       (extract ambient signals — last)
#
# Event: SubagentStop (no matcher — fires for all sub-agents)
# Timeout: 20s
# =============================================================================

set -euo pipefail

if [[ "${HOOK_DEBUG:-}" == "true" ]]; then
  set -x
  echo "[hook-debug] $(basename "$0") starting (pid=$$)" >&2
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "[subagent-stop-dispatcher] WARNING: jq not found — SubagentStop child hooks disabled" >&2
  printf '{"suppressOutput":true,"stopReason":"WARNING: SubagentStop dispatcher skipped — jq not installed. Sub-agent failure capture, verification, and ambient extraction are inactive."}\n'
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
    echo "[subagent-stop-dispatcher] WARNING: child hook exited $exit_code: $*" >&2
    # Non-zero exit is a hook failure, not a governance deny.
    # Log the error but continue the chain — sub-agent stop processing
    # must complete even if individual hooks encounter errors.
  fi
}

# ---------------------------------------------------------------------------
# Sequential execution — strict ordering for sub-agent teardown
# ---------------------------------------------------------------------------

if [ -z "$HOOK_INPUT" ]; then
  printf '{}\n'
  exit 0
fi

# Phase 1: Capture failures first — downstream hooks depend on this data
run_child_hook "${PLUGIN_ROOT}/hooks/subagent-stop-capture.sh"

# Phase 2: Verify claims against captured data
run_child_hook "${PLUGIN_ROOT}/hooks/post-subagent-verification.sh"

# Phase 3: Verify actual execution proof
run_child_hook "${PLUGIN_ROOT}/hooks/post-investigation-execution-proof.sh"

# Phase 4: Extract ambient signals — after all capture/verification is done
run_child_hook "${PLUGIN_ROOT}/hooks/ambient-candidate-extractor.sh"

# ---------------------------------------------------------------------------
# Emit merged result
# ---------------------------------------------------------------------------

if [ -n "$LAST_JSON" ]; then
  printf '%s\n' "$LAST_JSON"
fi

exit 0
