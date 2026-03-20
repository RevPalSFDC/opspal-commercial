#!/usr/bin/env bash

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/opspal-claude-runtime.XXXXXX")"
TMP_HOME="$TMP_ROOT/home"
WORKDIR="$TMP_ROOT/repo"
KEEP_TEMP=false
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
Usage: test-claude-installed-runtime.sh [options]

Builds an isolated Claude plugin runtime from the candidate commercial repo and
verifies the installed cache/settings artifacts.

Options:
  --keep-temp     Preserve temp files for inspection
  --verbose       Print extra detail
  --help, -h      Show this help
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
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

log_step() {
  printf '\n==> %s\n' "$*"
}

fail() {
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

seed_repo_copy() {
  mkdir -p "$TMP_HOME/.claude" "$WORKDIR"
  if [ -f "$HOME/.claude/.credentials.json" ]; then
    cp "$HOME/.claude/.credentials.json" "$TMP_HOME/.claude/.credentials.json"
  fi
  if [ -f "$HOME/.claude/session.env" ]; then
    cp "$HOME/.claude/session.env" "$TMP_HOME/.claude/session.env"
  fi

  if command -v rsync >/dev/null 2>&1; then
    rsync -a --exclude='.git' --exclude='node_modules' "$REPO_ROOT"/ "$WORKDIR"/
  else
    cp -R "$REPO_ROOT"/. "$WORKDIR"/
    rm -rf "$WORKDIR/.git" "$WORKDIR/node_modules"
  fi
}

install_temp_plugins() {
  HOME="$TMP_HOME" claude plugin marketplace add "$WORKDIR" >/dev/null
  HOME="$TMP_HOME" claude plugin install "opspal-core@opspal-commercial" >/dev/null
  HOME="$TMP_HOME" claude plugin install "opspal-salesforce@opspal-commercial" >/dev/null
}

assert_file_exists() {
  local file_path="$1"
  [ -f "$file_path" ] || fail "Missing expected file: $file_path"
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

main() {
  local core_version salesforce_version
  local core_cache_hooks core_cache_plugin salesforce_cache_plugin
  local hook_health_exit=0

  seed_repo_copy

  log_step "Installing isolated marketplace plugins into temp Claude home"
  install_temp_plugins

  log_step "Generating temp project and user hook settings"
  HOME="$TMP_HOME" node "$WORKDIR/plugins/opspal-core/scripts/lib/reconcile-hook-registration.js" \
    --project-root "$WORKDIR" \
    --core-plugin-root "$WORKDIR/plugins/opspal-core" >/dev/null

  core_version="$(jq -r '.version' "$WORKDIR/plugins/opspal-core/.claude-plugin/plugin.json")"
  salesforce_version="$(jq -r '.version' "$WORKDIR/plugins/opspal-salesforce/.claude-plugin/plugin.json")"
  core_cache_hooks="$TMP_HOME/.claude/plugins/cache/opspal-commercial/opspal-core/$core_version/.claude-plugin/hooks.json"
  core_cache_plugin="$TMP_HOME/.claude/plugins/cache/opspal-commercial/opspal-core/$core_version/.claude-plugin/plugin.json"
  salesforce_cache_plugin="$TMP_HOME/.claude/plugins/cache/opspal-commercial/opspal-salesforce/$salesforce_version/.claude-plugin/plugin.json"

  assert_file_exists "$TMP_HOME/.claude/plugins/installed_plugins.json"
  assert_file_exists "$core_cache_hooks"
  assert_file_exists "$core_cache_plugin"
  assert_file_exists "$salesforce_cache_plugin"
  assert_file_exists "$TMP_HOME/.claude/settings.json"
  assert_file_exists "$WORKDIR/.claude/settings.json"

  assert_no_legacy_matchers "$core_cache_hooks"
  assert_no_legacy_matchers "$TMP_HOME/.claude/settings.json"
  assert_no_legacy_matchers "$WORKDIR/.claude/settings.json"
  assert_no_blanket_bash_deny "$TMP_HOME/.claude/settings.json"
  assert_no_blanket_bash_deny "$WORKDIR/.claude/settings.json"

  log_step "Running quick installed-runtime diagnostics"
  set +e
  HOME="$TMP_HOME" node "$WORKDIR/plugins/opspal-core/scripts/lib/hook-health-checker.js" \
    --quick \
    --format json \
    --project-root "$WORKDIR" >"$TMP_ROOT/hook-health.json"
  hook_health_exit=$?
  set -e
  assert_file_exists "$TMP_ROOT/hook-health.json"
  assert_expected_hook_health "$TMP_ROOT/hook-health.json"
  if [ "$hook_health_exit" -ne 0 ] && [ "$VERBOSE" = true ]; then
    printf 'WARN: hook-health-checker exited with status %s for isolated degraded state.\n' "$hook_health_exit"
  fi

  (
    cd "$WORKDIR"
    HOME="$TMP_HOME" bash plugins/opspal-core/scripts/routing-health-check.sh
  ) >"$TMP_ROOT/routing-health.txt"

  if [ "$VERBOSE" = true ]; then
    HOME="$TMP_HOME" claude plugin list || true
    cat "$TMP_ROOT/routing-health.txt"
  fi

  log_step "Installed runtime checks passed"
  printf 'Temp home: %s\n' "$TMP_HOME"
  printf 'Temp repo: %s\n' "$WORKDIR"
}

main "$@"
