#!/usr/bin/env bash

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/opspal-claude-hooks.XXXXXX")"
WORKDIR="$TMP_ROOT/repo"
STATE_HOME="$TMP_ROOT/state-home"
STATE_USER_SETTINGS="$STATE_HOME/.claude/settings.json"
PROJECT_SETTINGS_REL=".claude/settings.json"
KEEP_TEMP=false
SKIP_LIVE=false
ALLOW_AUTH_FAILURE=false
VERBOSE=false

cleanup() {
  if [ "$KEEP_TEMP" = true ]; then
    echo "Keeping temp artifacts: $TMP_ROOT"
    return
  fi
  rm -rf "$TMP_ROOT"
}

trap cleanup EXIT

usage() {
  cat <<'EOF'
Usage: test-claude-hooks-smoke.sh [options]

Runs isolated Claude hook smoke checks against the candidate commercial repo.

Options:
  --skip-live            Run only static/settings/runtime checks
  --allow-auth-failure   Do not fail if live Claude API auth probe fails
  --keep-temp            Preserve temp files for inspection
  --verbose              Print extra detail
  --help, -h             Show this help
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --skip-live)
      SKIP_LIVE=true
      ;;
    --allow-auth-failure)
      ALLOW_AUTH_FAILURE=true
      ;;
    --keep-temp)
      KEEP_TEMP=true
      ;;
    --verbose)
      VERBOSE=true
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
  shift
done

log() {
  printf '%s\n' "$*"
}

log_step() {
  printf '\n==> %s\n' "$*"
}

fail() {
  KEEP_TEMP=true
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

assert_expected_hook_health() {
  local health_file="$1"

  jq -e '
    .counts.unhealthy == 0 and
    .effectiveCounts.unhealthy == 0 and
    (
      [
        .results[] |
        select(.status != "HEALTHY") |
        select(
          .name != "Configuration Discovery" or
          .message != "No project-level hooks.json found"
        )
      ] | length
    ) == 0
  ' "$health_file" >/dev/null || {
    cat "$health_file" >&2
    fail "Unexpected hook-health degradation detected in $health_file"
  }
}

assert_file_exists() {
  local file_path="$1"
  [ -f "$file_path" ] || fail "Missing expected file: $file_path"
}

seed_repo_copy() {
  mkdir -p "$WORKDIR" "$STATE_HOME"
  if command -v rsync >/dev/null 2>&1; then
    rsync -a --exclude='.git' --exclude='node_modules' "$REPO_ROOT"/ "$WORKDIR"/
  else
    cp -R "$REPO_ROOT"/. "$WORKDIR"/
    rm -rf "$WORKDIR/.git" "$WORKDIR/node_modules"
  fi
}

generate_isolated_settings() {
  HOME="$STATE_HOME" node "$WORKDIR/plugins/opspal-core/scripts/lib/reconcile-hook-registration.js" \
    --project-root "$WORKDIR" \
    --core-plugin-root "$WORKDIR/plugins/opspal-core" >/dev/null
}

assert_no_legacy_matchers() {
  local file_path="$1"
  if rg -n 'Task\(\*\)|Agent\(\*\)|Bash\(\*jq\*\)|Write\(\*SESSION_REFLECTION\*\)' "$file_path" >/dev/null 2>&1; then
    fail "Legacy matcher pattern found in $file_path"
  fi
}

assert_no_blanket_bash_deny() {
  local file_path="$1"
  jq -e '
    [
      .permissions.deny[]? |
      (
        (type == "string" and (. == "Bash" or . == "Bash*" or . == "Bash.*")) or
        (type == "object" and .toolName == "Bash" and ((.ruleContent // "") == "" or .ruleContent == "*" or .ruleContent == ".*"))
      )
    ] | length == 0
  ' "$file_path" >/dev/null || fail "Blanket Bash deny rule found in $file_path"
}

run_static_checks() {
  local hook_health_exit=0

  log_step "Generating isolated hook settings"
  generate_isolated_settings
  assert_file_exists "$WORKDIR/$PROJECT_SETTINGS_REL"
  assert_file_exists "$STATE_USER_SETTINGS"
  assert_no_legacy_matchers "$WORKDIR/$PROJECT_SETTINGS_REL"
  assert_no_legacy_matchers "$STATE_USER_SETTINGS"
  assert_no_blanket_bash_deny "$WORKDIR/$PROJECT_SETTINGS_REL"
  assert_no_blanket_bash_deny "$STATE_USER_SETTINGS"

  log_step "Running hook config validation"
  (cd "$WORKDIR" && node scripts/validate-hooks-config.js)

  log_step "Running quick hook health check"
  set +e
  HOME="$STATE_HOME" node "$WORKDIR/plugins/opspal-core/scripts/lib/hook-health-checker.js" \
    --quick \
    --format json \
    --project-root "$WORKDIR" >"$TMP_ROOT/hook-health.json"
  hook_health_exit=$?
  set -e
  assert_file_exists "$TMP_ROOT/hook-health.json"
  assert_expected_hook_health "$TMP_ROOT/hook-health.json"
  if [ "$hook_health_exit" -ne 0 ] && [ "$VERBOSE" = true ]; then
    log "WARN: hook-health-checker exited with status $hook_health_exit for isolated degraded state."
  fi

  log_step "Running routing health check"
  (
    cd "$WORKDIR"
    HOME="$STATE_HOME" bash plugins/opspal-core/scripts/routing-health-check.sh
  ) >"$TMP_ROOT/routing-health.txt"

  if [ "$VERBOSE" = true ]; then
    cat "$TMP_ROOT/routing-health.txt"
  fi
}

has_claude_agents_flag() {
  claude --help 2>/dev/null | grep -q -- '--agents'
}

run_auth_probe() {
  local stdout_file="$TMP_ROOT/auth-probe.json"
  local stderr_file="$TMP_ROOT/auth-probe.stderr"
  local exit_code=0

  set +e
  claude -p --output-format json --max-turns 1 "Reply with the word ok." >"$stdout_file" 2>"$stderr_file"
  exit_code=$?
  set -e

  if [ ! -s "$stdout_file" ]; then
    return "$exit_code"
  fi

  if jq -e '.is_error == false and .result == "ok"' "$stdout_file" >/dev/null 2>&1; then
    return 0
  fi

  return "$exit_code"
}

assert_no_debug_failures() {
  local debug_file="$1"
  local pattern
  local patterns=(
    'readonly variable'
    'invalid matcher'
    'BYPASS ATTEMPT DETECTED'
    'deny \["Bash\*"\]'
    'top-level decision'
    'command not found'
    'integer expression expected'
    'Could not determine tool name'
  )

  [ -f "$debug_file" ] || return 0

  for pattern in "${patterns[@]}"; do
    if rg -n "$pattern" "$debug_file" >/dev/null 2>&1; then
      fail "Debug log contains forbidden pattern '$pattern' in $debug_file"
    fi
  done
}

run_live_bash_scenario() {
  local stdout_file="$TMP_ROOT/live-bash.json"
  local stderr_file="$TMP_ROOT/live-bash.debug"
  local claude_debug_file="$TMP_ROOT/live-bash.claude-debug.log"
  local exit_code=0

  log_step "Running live Claude Bash smoke scenario"
  set +e
  (
    cd "$WORKDIR"
    claude -p \
      --output-format json \
      --debug hooks \
      --debug-file "$claude_debug_file" \
      --setting-sources project \
      --settings "$STATE_USER_SETTINGS" \
      --tools "Bash" \
      --max-turns 3 \
      "Use the Bash tool to run the exact command pwd. Then respond with only the resulting directory path."
  ) >"$stdout_file" 2>"$stderr_file"
  exit_code=$?
  set -e

  assert_file_exists "$claude_debug_file"
  [ "$VERBOSE" = true ] && cat "$stderr_file" >&2 || true
  [ "$VERBOSE" = true ] && printf 'Claude debug log: %s\n' "$claude_debug_file" >&2 || true
  assert_no_debug_failures "$stderr_file"
  assert_no_debug_failures "$claude_debug_file"

  if [ "$exit_code" -ne 0 ]; then
    fail "Live Bash smoke scenario failed. See $stdout_file, $stderr_file, and $claude_debug_file"
  fi

  jq -e '.is_error == false and (.result | type == "string") and (.result | length > 0)' "$stdout_file" >/dev/null \
    || fail "Live Bash smoke scenario returned an error result"
}

run_live_agent_scenario() {
  local stdout_file="$TMP_ROOT/live-agent.json"
  local stderr_file="$TMP_ROOT/live-agent.debug"
  local claude_debug_file="$TMP_ROOT/live-agent.claude-debug.log"
  local agents_json="$TMP_ROOT/agents.json"
  local agents_inline
  local exit_code=0

  if ! has_claude_agents_flag; then
    log "WARN: Claude CLI does not support --agents; skipping live Agent smoke scenario."
    return 0
  fi

  cat >"$agents_json" <<'EOF'
{
  "opspal-core:hook-smoke-agent": {
    "description": "Smoke test agent for Claude hook validation",
    "prompt": "When invoked, reply with the exact text agent-ok and do not use any tools."
  }
}
EOF
  agents_inline="$(jq -c . "$agents_json")"

  log_step "Running live Claude Agent smoke scenario"
  set +e
  (
    cd "$WORKDIR"
    claude -p \
      --output-format json \
      --debug hooks \
      --debug-file "$claude_debug_file" \
      --setting-sources project \
      --settings "$STATE_USER_SETTINGS" \
      --tools "Agent" \
      --agents "$agents_inline" \
      --max-turns 4 \
      "Use the Agent tool exactly once with subagent_type='opspal-core:hook-smoke-agent'. Then respond with only agent-ok."
  ) >"$stdout_file" 2>"$stderr_file"
  exit_code=$?
  set -e

  assert_file_exists "$claude_debug_file"
  [ "$VERBOSE" = true ] && cat "$stderr_file" >&2 || true
  [ "$VERBOSE" = true ] && printf 'Claude debug log: %s\n' "$claude_debug_file" >&2 || true
  assert_no_debug_failures "$stderr_file"
  assert_no_debug_failures "$claude_debug_file"

  if [ "$exit_code" -ne 0 ]; then
    fail "Live Agent smoke scenario failed. See $stdout_file, $stderr_file, and $claude_debug_file"
  fi

  jq -e '.is_error == false and .result == "agent-ok"' "$stdout_file" >/dev/null \
    || fail "Live Agent smoke scenario did not produce agent-ok"
}

main() {
  seed_repo_copy
  run_static_checks

  if [ "$SKIP_LIVE" = true ]; then
    log_step "Static smoke checks completed"
    log "Temp repo: $WORKDIR"
    log "Temp state home: $STATE_HOME"
    return 0
  fi

  log_step "Running Claude auth probe"
  if ! run_auth_probe; then
    if [ "$ALLOW_AUTH_FAILURE" = true ]; then
      log "WARN: Live Claude auth probe failed; skipping live smoke scenarios."
      log "Probe output: $TMP_ROOT/auth-probe.json"
      return 0
    fi
    fail "Claude auth probe failed. Run 'claude auth login' or rerun with --allow-auth-failure for static-only validation."
  fi

  run_live_bash_scenario
  run_live_agent_scenario

  log_step "Claude hook smoke checks passed"
  log "Temp repo: $WORKDIR"
  log "Temp state home: $STATE_HOME"
  log "Claude debug logs: $TMP_ROOT/live-bash.claude-debug.log, $TMP_ROOT/live-agent.claude-debug.log"
}

main "$@"
