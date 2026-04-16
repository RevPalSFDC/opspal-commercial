#!/usr/bin/env bash

set -euo pipefail

if ! command -v jq &>/dev/null; then
    echo "[pre-bash-dispatcher] WARNING: jq not found — Salesforce deploy/query hooks disabled for this call. Install jq for full protection." >&2
    # Emit structured warning as BOTH permissionDecisionReason (for logs) AND
    # additionalContext (for prominent visibility in Claude's conversation context).
    printf '{"suppressOutput":true,"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow","permissionDecisionReason":"SAFETY DEGRADED: jq not found — SOQL validation, deploy governance, and error correction are disabled for this session. Install jq: sudo apt-get install jq","additionalContext":"SAFETY DEGRADED: Salesforce Bash dispatcher is non-functional because jq is not installed. Deploy validation, SOQL correction, and deploy governance are ALL disabled. Install jq immediately: sudo apt-get install jq (Linux) or brew install jq (macOS)."}}\n'
    exit 0
fi

if [[ "${HOOK_DEBUG:-}" == "true" ]]; then
    set -x
    echo "DEBUG: [pre-bash-dispatcher] starting" >&2
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"
SF_WRAPPER="${PLUGIN_ROOT}/scripts/lib/sf-wrapper.sh"
HOOK_INPUT="$(cat 2>/dev/null || true)"
COMMAND="$(printf '%s' "$HOOK_INPUT" | jq -r '.tool_input.command // ""' 2>/dev/null || echo "")"

# Fast-exit for commands that don't involve Salesforce CLI or jq piping —
# avoids sourcing sf-wrapper.sh, defining helpers, and running Node.js validators
# for commands like ls, git, node, cat, etc. Keeps jq validation active for
if [[ -n "$COMMAND" ]] && [[ "$COMMAND" != *"sf "* ]] && [[ "$COMMAND" != *"sfdx "* ]] && [[ "$COMMAND" != *" jq "* ]] && [[ "$COMMAND" != *"| jq "* ]]; then
  printf '{}\n'
  exit 0
fi

LAST_JSON=""

if [ -f "$SF_WRAPPER" ]; then
  # shellcheck source=/dev/null
  source "$SF_WRAPPER"
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"
fi

emit_pretool_context() {
  local context="$1"
  local updated_command="${2:-}"

  if [ -n "$updated_command" ]; then
    jq -nc \
      --arg context "$context" \
      --arg command "$updated_command" \
      '{
        suppressOutput: true,
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "allow",
          permissionDecisionReason: $context,
          updatedInput: {
            command: $command
          }
        }
      }'
    return
  fi

  jq -nc \
    --arg context "$context" \
    '{
      suppressOutput: true,
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "allow",
        permissionDecisionReason: $context
      }
    }'
}

emit_pretool_deny() {
  local reason="$1"
  local context="${2:-}"

  if [ -n "$context" ]; then
    reason="${reason}\n\n${context}"
  fi

  jq -nc \
    --arg reason "$reason" \
    '{
      suppressOutput: true,
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: $reason
      }
    }'
}

update_hook_input_command() {
  local updated_command="$1"

  HOOK_INPUT="$(
    printf '%s' "$HOOK_INPUT" | jq -c --arg command "$updated_command" '
      .tool_input.command = $command
    ' 2>/dev/null || printf '%s' "$HOOK_INPUT"
  )"
  COMMAND="$updated_command"
}

is_salesforce_cli_command() {
  printf '%s' "$COMMAND" | grep -qE '(^|[[:space:]])(sf|sfdx)([[:space:]]+(data|sobject|org|project)|[[:space:]]+force:)([[:space:]]|$)'
}

is_deploy_scope_command() {
  printf '%s' "$COMMAND" | grep -qE '(^|[[:space:]])((sf|sfdx)[[:space:]]+project[[:space:]]+deploy[[:space:]]+(start|validate|preview)|sfdx[[:space:]]+force:source:deploy)([[:space:]]|$)'
}

wrap_deploy_with_timeout() {
  local timeout_s="${SFDC_DEPLOY_TIMEOUT_SECS:-300}"
  # Skip if command already has a timeout wrapper or uses --async
  if printf '%s' "$COMMAND" | grep -qE '(^|[[:space:]])timeout[[:space:]]'; then
    return
  fi
  if printf '%s' "$COMMAND" | grep -qE '\-\-async'; then
    return
  fi
  local wrapped_cmd="timeout --preserve-status ${timeout_s} ${COMMAND}"
  update_hook_input_command "$wrapped_cmd"
  merge_hook_json "$(emit_pretool_context "Deploy timeout guard active: process will be killed after ${timeout_s}s if unresponsive. Override with SFDC_DEPLOY_TIMEOUT_SECS. If killed, check status: sf project deploy report --use-most-recent")"
}

is_data_query_command() {
  printf '%s' "$COMMAND" | grep -qE '(^|[[:space:]])((sf|sfdx)[[:space:]]+data[[:space:]]+query|sfdx[[:space:]]+force:data:soql:query)([[:space:]]|$)'
}

uses_jq() {
  printf '%s' "$COMMAND" | grep -q 'jq'
}

uses_python_postprocessor() {
  printf '%s' "$COMMAND" | grep -qE '(^|[[:space:]])python(3)?([[:space:]]|$)'
}

has_pipeline_without_pipefail() {
  printf '%s' "$COMMAND" | grep -q '|' &&
    ! printf '%s' "$COMMAND" | grep -qE '(^|[;&(])[[:space:]]*set[[:space:]]+-o[[:space:]]+pipefail([[:space:];&)]|$)|(^|[[:space:]])bash[[:space:]]+-o[[:space:]]+pipefail([[:space:]]|$)'
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
        def reason($value): $value.hookSpecificOutput.permissionDecisionReason // "";
        def updated($value): $value.hookSpecificOutput.updatedInput // {};
        {
          suppressOutput: true,
          hookSpecificOutput: {
            hookEventName: "PreToolUse",
            permissionDecision: ($next.hookSpecificOutput.permissionDecision // $current.hookSpecificOutput.permissionDecision),
            permissionDecisionReason: ([reason($current), reason($next)] | map(select(length > 0)) | join("\n\n")),
            updatedInput: (updated($current) + updated($next))
          }
        }
        | if (.hookSpecificOutput.permissionDecisionReason == "") then del(.hookSpecificOutput.permissionDecisionReason) else . end
        | if (.hookSpecificOutput.updatedInput == {}) then del(.hookSpecificOutput.updatedInput) else . end
        | if (.hookSpecificOutput.permissionDecision == null) then del(.hookSpecificOutput.permissionDecision, .hookSpecificOutput.permissionDecisionReason) else . end
      ' 2>/dev/null || printf '%s' "$next_json"
  )"
}

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

handle_child_output() {
  local exit_code="$1"
  local stdout_content="$2"

  if [ -z "$stdout_content" ]; then
    return
  fi

  if printf '%s' "$stdout_content" | jq -e . >/dev/null 2>&1; then
    merge_hook_json "$stdout_content"

    if [ "$exit_code" -eq 0 ]; then
      local permission_decision
      permission_decision="$(printf '%s' "$stdout_content" | jq -r '.hookSpecificOutput.permissionDecision // empty' 2>/dev/null || echo "")"
      if [ "$permission_decision" = "deny" ]; then
        printf '%s\n' "$LAST_JSON"
        exit 0
      fi
    fi

    return
  fi

  emit_stderr "$stdout_content"
}

run_child_hook() {
  local stdout_file
  local stderr_file
  local exit_code
  local stdout_content
  local stderr_content
  local child_timeout_s
  local start_ns end_ns elapsed_ms
  local child_name
  local timing_log

  child_timeout_s="${SFDC_CHILD_HOOK_TIMEOUT_SECS:-15}"

  stdout_file="$(mktemp)"
  stderr_file="$(mktemp)"

  # Capture child identity (last arg of env chain is typically the hook script path)
  child_name="$(basename "${!#}" 2>/dev/null || echo "unknown")"

  start_ns="$(date +%s%N 2>/dev/null || echo 0)"

  # Wrap in `timeout` so a hung child can't stall every subsequent Bash call.
  # --preserve-status keeps the child's real exit code on success; timeout
  # itself exits 124 on TERM. -k adds a 2s grace period before SIGKILL.
  if command -v timeout >/dev/null 2>&1; then
    if printf '%s' "$HOOK_INPUT" | env DISPATCHER_CONTEXT=1 \
        timeout --preserve-status -k 2s "${child_timeout_s}s" "$@" \
        >"$stdout_file" 2>"$stderr_file"; then
      exit_code=0
    else
      exit_code=$?
    fi
  else
    if printf '%s' "$HOOK_INPUT" | env DISPATCHER_CONTEXT=1 "$@" \
        >"$stdout_file" 2>"$stderr_file"; then
      exit_code=0
    else
      exit_code=$?
    fi
  fi

  end_ns="$(date +%s%N 2>/dev/null || echo 0)"
  if [ "$start_ns" -gt 0 ] && [ "$end_ns" -gt 0 ]; then
    elapsed_ms=$(( (end_ns - start_ns) / 1000000 ))
  else
    elapsed_ms=0
  fi

  # Emit timing to a jsonl log so slow hooks can be identified post-hoc.
  # Best-effort only — never fails the dispatch.
  timing_log="${HOME}/.claude/logs/sfdc-child-hook-timing.jsonl"
  mkdir -p "$(dirname "$timing_log")" 2>/dev/null || true
  if [ -w "$(dirname "$timing_log")" ] 2>/dev/null; then
    printf '{"ts":"%s","child":"%s","ms":%d,"exit":%d,"timeout_s":%d}\n' \
      "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$child_name" "$elapsed_ms" "$exit_code" "$child_timeout_s" \
      >> "$timing_log" 2>/dev/null || true
  fi

  # Emit stderr warning for slow children (>5s) so the agent sees the friction
  if [ "$elapsed_ms" -gt 5000 ]; then
    printf '[pre-bash-dispatcher] WARNING: child hook %s took %dms (timeout=%ds)\n' \
      "$child_name" "$elapsed_ms" "$child_timeout_s" >&2
  fi

  # Exit code 124 = timeout killed the child. Surface this clearly instead of
  # treating it as a generic failure.
  if [ "$exit_code" -eq 124 ]; then
    printf '[pre-bash-dispatcher] ERROR: child hook %s timed out after %ds (set SFDC_CHILD_HOOK_TIMEOUT_SECS to override)\n' \
      "$child_name" "$child_timeout_s" >&2
  fi

  stdout_content="$(cat "$stdout_file")"
  stderr_content="$(cat "$stderr_file")"
  rm -f "$stdout_file" "$stderr_file"

  emit_stderr "$stderr_content"
  handle_child_output "$exit_code" "$stdout_content"

  if [ "$exit_code" -ne 0 ]; then
    exit "$exit_code"
  fi
}

if [ -z "$COMMAND" ]; then
  exit 0
fi

if is_salesforce_cli_command; then
  CLI_FAMILY="$(detect_salesforce_cli_family 2>/dev/null || true)"
  if [ -z "$CLI_FAMILY" ]; then
    emit_pretool_deny \
      "SF_CLI_NOT_FOUND: Neither sf nor sfdx is installed or available on PATH." \
      "Salesforce CLI command requested, but no supported Salesforce CLI binary is available to this Claude session. Install @salesforce/cli or expose it on PATH."
    exit 0
  fi

  TRANSLATED_COMMAND="$(translate_salesforce_command_for_available_cli "$COMMAND" 2>/dev/null || true)"
  if [ -n "$TRANSLATED_COMMAND" ] && [ "$TRANSLATED_COMMAND" != "$COMMAND" ]; then
    update_hook_input_command "$TRANSLATED_COMMAND"
    merge_hook_json "$(emit_pretool_context "Salesforce CLI compatibility fallback applied: using ${CLI_FAMILY} because the requested command family is unavailable in this session." "$TRANSLATED_COMMAND")"
  elif [ "$CLI_FAMILY" = "sfdx" ] && printf '%s' "$COMMAND" | grep -qE '^[[:space:]]*sf[[:space:]]'; then
    emit_pretool_deny \
      "SF_CLI_FALLBACK_UNSUPPORTED: sf is unavailable and this command cannot be safely translated to sfdx." \
      "Only legacy sfdx is available on PATH for this session. Install sf or rewrite the command to a supported legacy equivalent before retrying."
    exit 0
  fi
fi

if is_salesforce_cli_command && has_pipeline_without_pipefail && (uses_jq || uses_python_postprocessor); then
  PIPESAFE_COMMAND="set -o pipefail; $COMMAND"
  update_hook_input_command "$PIPESAFE_COMMAND"
  merge_hook_json "$(emit_pretool_context "Applied set -o pipefail so Salesforce CLI failures stay visible before jq/python post-processing. Prefer validating the raw --json output before piping when debugging." "$PIPESAFE_COMMAND")"
fi

if is_deploy_scope_command; then
  run_child_hook "${PLUGIN_ROOT}/hooks/pre-deploy-queued-check.sh"
  run_child_hook "${PLUGIN_ROOT}/hooks/pre-deploy-agent-context-check.sh"
  run_child_hook env PRETOOLUSE_MODE=1 "${PLUGIN_ROOT}/hooks/pre-deployment-comprehensive-validation.sh"
  run_child_hook "${PLUGIN_ROOT}/hooks/pre-deploy-flow-validation.sh"
  run_child_hook "${PLUGIN_ROOT}/hooks/pre-deploy-report-quality-gate.sh"
  run_child_hook "${PLUGIN_ROOT}/hooks/pre-picklist-dependency-validation.sh"
  wrap_deploy_with_timeout
fi

if is_data_query_command; then
  run_child_hook "${PLUGIN_ROOT}/hooks/pre-bash-soql-validator.sh"
fi

if uses_jq; then
  run_child_hook "${PLUGIN_ROOT}/hooks/pre-bash-jq-validator.sh"
fi

if [ -n "$LAST_JSON" ]; then
  printf '%s\n' "$LAST_JSON"
fi

exit 0
