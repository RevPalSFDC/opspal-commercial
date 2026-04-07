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
  printf '{"suppressOutput":true,"systemMessage":"WARNING: SessionStart dispatcher skipped — jq not installed. Onboarding check, session initialization, and env validation are inactive."}\n'
  exit 0
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"
export CLAUDE_PLUGIN_ROOT="${PLUGIN_ROOT}"
HOOK_INPUT="$(cat 2>/dev/null || true)"
LAST_JSON=""

# ---------------------------------------------------------------------------
# Phase 0 (pre-init): Prune orphaned plugin references from installed_plugins.json
# and settings.json files. Runs inline (no child hook) because it must complete
# before the session fully initializes. Uses jq which is already required above.
# Fast-exits (~1ms) when no orphans are found.
# ---------------------------------------------------------------------------
_prune_orphaned_plugins() {
  local ip_file="${HOME}/.claude/plugins/installed_plugins.json"
  [ -f "$ip_file" ] || return 0

  # Find opspal-* keys whose marketplace plugin dir lacks a plugin.json
  local orphans=()
  while IFS= read -r key; do
    local pname="${key%%@*}"
    local mplace="${key#*@}"
    local mp_dir="${HOME}/.claude/plugins/marketplaces/${mplace}/plugins/${pname}"
    if [ ! -f "${mp_dir}/.claude-plugin/plugin.json" ] && [ ! -f "${mp_dir}/plugin.json" ]; then
      orphans+=("$key")
    fi
  done < <(jq -r '.plugins // {} | keys[] | select(startswith("opspal-"))' "$ip_file" 2>/dev/null)

  [ ${#orphans[@]} -eq 0 ] && return 0

  # Build jq delete expression for installed_plugins.json
  local jq_expr='.'
  for key in "${orphans[@]}"; do
    jq_expr="${jq_expr} | del(.plugins[\"${key}\"])"
  done
  local tmp_ip="${ip_file}.tmp.$$"
  if jq "$jq_expr" "$ip_file" > "$tmp_ip" 2>/dev/null; then
    mv "$tmp_ip" "$ip_file"
  else
    rm -f "$tmp_ip"
  fi

  # Clean enabledPlugins and hook commands from settings.json files
  local pname_pattern=""
  for key in "${orphans[@]}"; do
    local pn="${key%%@*}"
    [ -n "$pname_pattern" ] && pname_pattern="${pname_pattern}|"
    pname_pattern="${pname_pattern}${pn}"
  done

  local settings_files=(
    "${HOME}/.claude/settings.json"
    "${HOME}/.claude/settings.local.json"
    "${PWD}/.claude/settings.json"
    "${PWD}/.claude/settings.local.json"
  )
  for sf in "${settings_files[@]}"; do
    [ -f "$sf" ] || continue
    local tmp_sf="${sf}.tmp.$$"
    # Remove from enabledPlugins array and hook commands containing orphaned plugin paths
    jq --arg orphans "$(printf '%s\n' "${orphans[@]}")" --arg pattern "$pname_pattern" '
      # Remove from enabledPlugins
      (if .enabledPlugins then .enabledPlugins |= map(select(. as $p | ($orphans | split("\n") | map(select(. != "")) | index($p)) == null)) else . end)
      |
      # Remove hook entries whose commands reference orphaned plugins
      (if .hooks then .hooks |= with_entries(
        .value |= if type == "array" then
          map(select(
            (.hooks // []) | all(.command // "" | test("/(" + $pattern + ")/") | not)
          ))
        else . end
        | .value |= if . == [] then empty else . end
      ) else . end)
    ' "$sf" > "$tmp_sf" 2>/dev/null && mv "$tmp_sf" "$sf" || rm -f "$tmp_sf"
  done

  # Remove orphaned cache directories
  for key in "${orphans[@]}"; do
    local pn="${key%%@*}"
    local mp="${key#*@}"
    rm -rf "${HOME}/.claude/plugins/cache/${mp}/${pn}" 2>/dev/null || true
  done

  emit_stderr "Pruned ${#orphans[@]} orphaned plugin reference(s): ${orphans[*]}"
}
_prune_orphaned_plugins

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

# Phase 2b: Source shared state written by session-init.sh's platform loaders (O3 fix).
# Propagates GTM_ACTIVE_CYCLE, OKR_ACTIVE_CYCLE, DETECTED_PLATFORM, etc.
# to all subsequent child hooks in this dispatcher (envcheck, repo-sync, capture-init).
_SHARED_STATE="${HOME}/.claude/session-state/session-init-state.env"
if [[ "${SESSION_INIT_SHARED_STATE:-1}" == "1" ]] && [[ -s "$_SHARED_STATE" ]]; then
    # shellcheck disable=SC1090
    source "$_SHARED_STATE" 2>/dev/null || true
fi

# Phase 2c: SOP registry initialization
run_child_hook "${PLUGIN_ROOT}/hooks/sop-session-init.sh"

# Phase 3: Early warning systems — detect failures before proceeding
run_child_hook "${PLUGIN_ROOT}/hooks/pre-session-silent-failure-check.sh"

# Phase 4: Environment validation — must pass before git operations
run_child_hook "${PLUGIN_ROOT}/hooks/session-start-envcheck.sh"

# Phase 5: Git pulls — after env is validated
run_child_hook "${PLUGIN_ROOT}/hooks/session-start-repo-sync.sh"

# Phase 6: Ambient pipeline initialization — last, once session is stable
run_child_hook "${PLUGIN_ROOT}/hooks/session-capture-init.sh"

# Phase 7: Prune orphaned plugin references (fast — ~2ms when no orphans)
run_child_hook "${PLUGIN_ROOT}/hooks/session-start-prune-orphaned-plugins.sh"

# Phase 8: Post-update deferred tasks (version-change-gated, auto-safe steps only)
run_child_hook "${PLUGIN_ROOT}/hooks/session-start-post-update.sh"

# ---------------------------------------------------------------------------
# Emit merged result
# ---------------------------------------------------------------------------

if [ -n "$LAST_JSON" ]; then
  printf '%s\n' "$LAST_JSON"
fi

exit 0
