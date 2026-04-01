#!/usr/bin/env bash
# =============================================================================
# PostToolUse (Agent matcher) Sequential Dispatcher
# =============================================================================
#
# Purpose: Replace parallel PostToolUse hooks with a single sequential
#          dispatcher that guarantees execution order and produces one merged
#          output for the Agent matcher.
#
# Why: Sequential execution ensures post-assessment indexing, compliance
#      checking, and calibration signals are captured in dependency order.
#      A deny from any child short-circuits the chain (matching PreToolUse
#      dispatcher behavior).
#
# Execution order:
#   1. post-assessment-work-index.sh        (work index capture)
#   2. post-task-runbook-compliance-check.sh (compliance gate)
#   3. post-tool-use.sh                     (general post-tool processing)
#   4. post-tool-use-contract-validation.sh (contract validation)
#   5. post-audit-bluf-generator.sh         (BLUF output generation)
#   6. post-win-loss-calibration.sh         (win/loss signals)
#   7. post-task-stall-check.sh             (stall detection)
#
# Event: PostToolUse, Matcher: Agent
# Timeout: 30s (most hooks return {} quickly; worst-case wall time << 50s sum)
# =============================================================================

set -euo pipefail

if [[ "${HOOK_DEBUG:-}" == "true" ]]; then
  set -x
  echo "[hook-debug] $(basename "$0") starting (pid=$$)" >&2
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "[post-tool-use-agent-dispatcher] WARNING: jq not found — PostToolUse Agent child hooks disabled" >&2
  printf '{"suppressOutput":true,"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"WARNING: PostToolUse Agent dispatcher skipped — jq not installed. Work indexing, compliance checking, and calibration signals are inactive."}}\n'
  exit 0
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"
HOOK_INPUT="$(cat 2>/dev/null || true)"
LAST_JSON=""
DENY_TRIGGERED=0

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
        def ctx($v): $v.hookSpecificOutput.additionalContext // "";
        def perm($v): $v.hookSpecificOutput.permissionDecision // null;
        def reason($v): $v.hookSpecificOutput.permissionDecisionReason // null;
        {
          suppressOutput: true,
          hookSpecificOutput: {
            hookEventName: "PostToolUse",
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
        | if (perm($next) != null)
          then .hookSpecificOutput.permissionDecision = perm($next)
          elif (perm($current) != null)
          then .hookSpecificOutput.permissionDecision = perm($current)
          else .
          end
        | if (reason($next) != null)
          then .hookSpecificOutput.permissionDecisionReason = reason($next)
          elif (reason($current) != null)
          then .hookSpecificOutput.permissionDecisionReason = reason($current)
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

    # PostToolUse hooks CAN return permissionDecision — short-circuit on deny
    if [ "$exit_code" -eq 0 ]; then
      local permission_decision
      permission_decision="$(printf '%s' "$stdout_content" | jq -r '.hookSpecificOutput.permissionDecision // empty' 2>/dev/null || echo "")"
      if [ "$permission_decision" = "deny" ]; then
        DENY_TRIGGERED=1
        printf '%s\n' "$LAST_JSON"
        exit 0
      fi
    fi

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
    echo "[post-tool-use-agent-dispatcher] WARNING: child hook exited $exit_code: $*" >&2
    # Non-zero exit is a hook failure, not necessarily a governance deny.
    # Log the error but continue the chain — don't let one broken child
    # block downstream work indexing and calibration.
  fi
}

# ---------------------------------------------------------------------------
# Sequential execution
# ---------------------------------------------------------------------------

if [ -z "$HOOK_INPUT" ]; then
  printf '{}\n'
  exit 0
fi

run_child_hook "${PLUGIN_ROOT}/hooks/post-assessment-work-index.sh"
run_child_hook "${PLUGIN_ROOT}/hooks/post-task-runbook-compliance-check.sh"
run_child_hook "${PLUGIN_ROOT}/hooks/post-tool-use.sh"
run_child_hook "${PLUGIN_ROOT}/hooks/post-tool-use-contract-validation.sh"
run_child_hook "${PLUGIN_ROOT}/hooks/post-audit-bluf-generator.sh"
run_child_hook "${PLUGIN_ROOT}/hooks/post-win-loss-calibration.sh"
run_child_hook "${PLUGIN_ROOT}/hooks/post-task-stall-check.sh"

# ---------------------------------------------------------------------------
# Emit merged result
# ---------------------------------------------------------------------------

if [ -n "$LAST_JSON" ]; then
  printf '%s\n' "$LAST_JSON"
fi

exit 0
