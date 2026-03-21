#!/usr/bin/env bash

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/opspal-claude-runtime.XXXXXX")"
TMP_HOME="$TMP_ROOT/home"
WORKDIR="$TMP_ROOT/repo"
WORKSPACE_ROOT="$TMP_ROOT/workspace"
MARKETPLACE_ROOT="$TMP_HOME/.claude/plugins/marketplaces/opspal-commercial"
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
          (
            (
              .name == "Configuration Discovery" and
              .message == "No project-level hooks.json found"
            ) or
            (
              .name == "Cross-Reference Validation" and
              (.message | test("duplicate hook registration"))
            )
          ) | not
        )
      ] | length
    ) == 0
  ' "$health_file" >/dev/null || {
    cat "$health_file" >&2
    fail "Unexpected hook-health degradation detected in $health_file"
  }
}

copy_tree() {
  local source_dir="$1"
  local target_dir="$2"

  mkdir -p "$target_dir"
  if command -v rsync >/dev/null 2>&1; then
    rsync -a --exclude='.git' --exclude='node_modules' "$source_dir"/ "$target_dir"/
  else
    cp -R "$source_dir"/. "$target_dir"/
    rm -rf "$target_dir/.git" "$target_dir/node_modules"
  fi
}

seed_repo_copy() {
  mkdir -p "$TMP_HOME/.claude" "$WORKDIR" "$WORKSPACE_ROOT"
  if [ -f "$HOME/.claude/.credentials.json" ]; then
    cp "$HOME/.claude/.credentials.json" "$TMP_HOME/.claude/.credentials.json"
  fi
  if [ -f "$HOME/.claude/session.env" ]; then
    cp "$HOME/.claude/session.env" "$TMP_HOME/.claude/session.env"
  fi

  copy_tree "$REPO_ROOT" "$WORKDIR"
  mkdir -p "$WORKSPACE_ROOT/.claude"
  printf '{\n  "hooks": {}\n}\n' > "$WORKSPACE_ROOT/.claude/settings.json"
}

should_use_simulated_install() {
  if [ "${OPSPAL_SKIP_CLAUDE_CLI:-0}" = "1" ]; then
    return 0
  fi

  if [ "${CI:-}" = "true" ] && [ "${OPSPAL_USE_CLAUDE_CLI:-0}" != "1" ]; then
    return 0
  fi

  if ! command -v claude >/dev/null 2>&1; then
    return 0
  fi

  return 1
}

write_installed_plugins_manifest() {
  local installed_plugins_path="$TMP_HOME/.claude/plugins/installed_plugins.json"

  node - "$installed_plugins_path" "$@" <<'EOF'
const fs = require('fs');
const path = require('path');

const manifestPath = process.argv[2];
const pluginEntries = process.argv.slice(3);
const plugins = {};

pluginEntries.forEach((entry) => {
  const [name, version, installPath] = entry.split('|');
  if (!name || !version || !installPath) {
    throw new Error(`Invalid installed plugin entry: ${entry}`);
  }

  const key = `${name}@opspal-commercial`;
  plugins[key] = [
    {
      scope: 'user',
      installPath,
      version,
      installedAt: '2026-03-21T00:00:00.000Z',
      lastUpdated: '2026-03-21T00:00:00.000Z'
    }
  ];
});

fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
fs.writeFileSync(manifestPath, JSON.stringify({ version: 2, plugins }, null, 2) + '\n');
EOF
}

simulate_claude_install() {
  local install_entries=()
  local plugin_dir plugin_name manifest version cache_dir

  copy_tree "$WORKDIR" "$MARKETPLACE_ROOT"

  while IFS= read -r plugin_dir; do
    plugin_name="$(basename "$plugin_dir")"
    manifest="$plugin_dir/.claude-plugin/plugin.json"

    if [ ! -f "$manifest" ]; then
      continue
    fi

    version="$(jq -r '.version // empty' "$manifest")"
    [ -n "$version" ] || fail "Missing plugin version in $manifest"

    cache_dir="$TMP_HOME/.claude/plugins/cache/opspal-commercial/$plugin_name/$version"
    copy_tree "$plugin_dir" "$cache_dir"
    install_entries+=("${plugin_name}|${version}|${cache_dir}")
  done < <(find "$MARKETPLACE_ROOT/plugins" -mindepth 1 -maxdepth 1 -type d | sort)

  write_installed_plugins_manifest "${install_entries[@]}"
}

install_temp_plugins() {
  if should_use_simulated_install; then
    [ "$VERBOSE" = true ] && echo "Using simulated Claude marketplace install"
    simulate_claude_install
    return
  fi

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

assert_no_workspace_plugin_paths() {
  local file_path="$1"
  if grep -F "$WORKSPACE_ROOT/plugins/" "$file_path" >/dev/null 2>&1; then
    fail "Workspace plugin path leaked into installed runtime settings: $file_path"
  fi
}

assert_uses_installed_plugin_paths() {
  local file_path="$1"
  if ! grep -F "$TMP_HOME/.claude/plugins/" "$file_path" >/dev/null 2>&1; then
    fail "Installed runtime settings did not reference Claude plugin roots: $file_path"
  fi
}

main() {
  local core_version salesforce_version
  local core_cache_hooks core_cache_plugin salesforce_cache_plugin
  local hook_health_exit=0

  seed_repo_copy

  log_step "Installing isolated marketplace plugins into temp Claude home"
  install_temp_plugins

  log_step "Generating temp project and user hook settings"
  HOME="$TMP_HOME" node "$MARKETPLACE_ROOT/plugins/opspal-core/scripts/lib/reconcile-hook-registration.js" \
    --project-root "$WORKSPACE_ROOT" \
    --core-plugin-root "$MARKETPLACE_ROOT/plugins/opspal-core" >/dev/null

  core_version="$(jq -r '.version' "$MARKETPLACE_ROOT/plugins/opspal-core/.claude-plugin/plugin.json")"
  salesforce_version="$(jq -r '.version' "$MARKETPLACE_ROOT/plugins/opspal-salesforce/.claude-plugin/plugin.json")"
  core_cache_hooks="$TMP_HOME/.claude/plugins/cache/opspal-commercial/opspal-core/$core_version/.claude-plugin/hooks.json"
  core_cache_plugin="$TMP_HOME/.claude/plugins/cache/opspal-commercial/opspal-core/$core_version/.claude-plugin/plugin.json"
  salesforce_cache_plugin="$TMP_HOME/.claude/plugins/cache/opspal-commercial/opspal-salesforce/$salesforce_version/.claude-plugin/plugin.json"

  assert_file_exists "$TMP_HOME/.claude/plugins/installed_plugins.json"
  assert_file_exists "$core_cache_hooks"
  assert_file_exists "$core_cache_plugin"
  assert_file_exists "$salesforce_cache_plugin"
  assert_file_exists "$TMP_HOME/.claude/settings.json"
  assert_file_exists "$WORKSPACE_ROOT/.claude/settings.json"

  assert_no_legacy_matchers "$core_cache_hooks"
  assert_no_legacy_matchers "$TMP_HOME/.claude/settings.json"
  assert_no_legacy_matchers "$WORKSPACE_ROOT/.claude/settings.json"
  assert_no_blanket_bash_deny "$TMP_HOME/.claude/settings.json"
  assert_no_blanket_bash_deny "$WORKSPACE_ROOT/.claude/settings.json"
  assert_no_workspace_plugin_paths "$TMP_HOME/.claude/settings.json"
  assert_no_workspace_plugin_paths "$WORKSPACE_ROOT/.claude/settings.json"
  assert_uses_installed_plugin_paths "$TMP_HOME/.claude/settings.json"
  assert_uses_installed_plugin_paths "$WORKSPACE_ROOT/.claude/settings.json"

  log_step "Running quick installed-runtime diagnostics"
  set +e
  HOME="$TMP_HOME" node "$MARKETPLACE_ROOT/plugins/opspal-core/scripts/lib/hook-health-checker.js" \
    --quick \
    --format json \
    --project-root "$WORKSPACE_ROOT" >"$TMP_ROOT/hook-health.json"
  hook_health_exit=$?
  set -e
  assert_file_exists "$TMP_ROOT/hook-health.json"
  assert_expected_hook_health "$TMP_ROOT/hook-health.json"
  if [ "$hook_health_exit" -ne 0 ] && [ "$VERBOSE" = true ]; then
    printf 'WARN: hook-health-checker exited with status %s for isolated degraded state.\n' "$hook_health_exit"
  fi

  (
    cd "$WORKSPACE_ROOT"
    HOME="$TMP_HOME" bash "$MARKETPLACE_ROOT/plugins/opspal-core/scripts/routing-health-check.sh"
  ) >"$TMP_ROOT/routing-health.txt"

  if [ "$VERBOSE" = true ]; then
    HOME="$TMP_HOME" claude plugin list || true
    cat "$TMP_ROOT/routing-health.txt"
  fi

  log_step "Installed runtime checks passed"
  printf 'Temp home: %s\n' "$TMP_HOME"
  printf 'Temp repo: %s\n' "$WORKDIR"
  printf 'Temp workspace: %s\n' "$WORKSPACE_ROOT"
}

main "$@"
