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

# ---------------------------------------------------------------------------
# Idempotency guard: Claude Code may load plugin hooks twice during startup,
# causing this dispatcher to fire twice. Use a session-scoped lockfile to
# ensure we only run once per startup cycle. The lock expires after 60s to
# handle edge cases where the session PID gets reused.
# ---------------------------------------------------------------------------
_LOCK_DIR="${HOME}/.claude/session-state"
mkdir -p "$_LOCK_DIR" 2>/dev/null || true
_LOCK_FILE="${_LOCK_DIR}/session-start-dispatcher.lock"
_NOW=$(date +%s 2>/dev/null || echo 0)
if [ -f "$_LOCK_FILE" ]; then
  _LOCK_AGE=$(cat "$_LOCK_FILE" 2>/dev/null || echo 0)
  _ELAPSED=$(( _NOW - _LOCK_AGE ))
  if [ "$_ELAPSED" -lt 60 ] && [ "$_ELAPSED" -ge 0 ]; then
    # Already ran within the last 60 seconds — skip duplicate invocation
    if [[ "${HOOK_DEBUG:-}" == "true" ]]; then
      echo "[hook-debug] session-start-dispatcher skipped (duplicate invocation, lock age=${_ELAPSED}s)" >&2
    fi
    printf '{}\n'
    exit 0
  fi
fi
printf '%s' "$_NOW" > "$_LOCK_FILE" 2>/dev/null || true

# ---------------------------------------------------------------------------
# Auto-migrate deprecated SFDX_STATE_FOLDER → SF_DATA_DIR for this session.
# The Salesforce CLI emits a noisy deprecation warning when SFDX_STATE_FOLDER
# is set. Migrate the value so sf commands run clean.
# ---------------------------------------------------------------------------
if [[ -n "${SFDX_STATE_FOLDER:-}" ]] && [[ -z "${SF_DATA_DIR:-}" ]]; then
  export SF_DATA_DIR="$SFDX_STATE_FOLDER"
  unset SFDX_STATE_FOLDER
  echo "[session-start-dispatcher] Migrated SFDX_STATE_FOLDER → SF_DATA_DIR=$SF_DATA_DIR" >&2
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
# Phase 0 (pre-init): Prune stale plugin references from installed_plugins.json
# and settings.json files. Runs inline before child hooks.
# Two-pass approach:
#   Pass 1: Remove orphaned opspal-* keys from installed_plugins.json + enabledPlugins
#   Pass 2: Remove ANY hook entry whose command points to a non-existent script file
#           (marketplace-agnostic, OS-agnostic — just checks if the file is on disk)
# Fast-exits (~1ms) when nothing needs cleaning.
# ---------------------------------------------------------------------------
_prune_stale_references() {
  local pruned_count=0

  # --- Pass 1: Orphaned installed_plugins.json entries ---
  local ip_file="${HOME}/.claude/plugins/installed_plugins.json"
  local orphan_keys=()
  if [ -f "$ip_file" ]; then
    while IFS= read -r key; do
      local pname="${key%%@*}"
      local mplace="${key#*@}"
      local mp_dir="${HOME}/.claude/plugins/marketplaces/${mplace}/plugins/${pname}"
      if [ ! -f "${mp_dir}/.claude-plugin/plugin.json" ] && [ ! -f "${mp_dir}/plugin.json" ]; then
        orphan_keys+=("$key")
      fi
    done < <(jq -r '.plugins // {} | keys[] | select(startswith("opspal-"))' "$ip_file" 2>/dev/null)

    if [ ${#orphan_keys[@]} -gt 0 ]; then
      local jq_expr='.'
      for key in "${orphan_keys[@]}"; do
        jq_expr="${jq_expr} | del(.plugins[\"${key}\"])"
      done
      local tmp_ip="${ip_file}.tmp.$$"
      if jq "$jq_expr" "$ip_file" > "$tmp_ip" 2>/dev/null; then
        mv "$tmp_ip" "$ip_file"
        pruned_count=$((pruned_count + ${#orphan_keys[@]}))
      else
        rm -f "$tmp_ip"
      fi
      # Remove orphaned cache directories
      for key in "${orphan_keys[@]}"; do
        rm -rf "${HOME}/.claude/plugins/cache/${key#*@}/${key%%@*}" 2>/dev/null || true
      done
    fi
  fi

  # --- Pass 2: Clean enabledPlugins + dead hook commands from settings.json files ---
  local settings_files=(
    "${HOME}/.claude/settings.json"
    "${HOME}/.claude/settings.local.json"
    "${PWD}/.claude/settings.json"
    "${PWD}/.claude/settings.local.json"
  )

  for sf in "${settings_files[@]}"; do
    [ -f "$sf" ] || continue

    # 2a. Remove stale enabledPlugins entries — INDEPENDENTLY of installed_plugins.json.
    #     Scan each enabledPlugins entry that looks like "name@marketplace" and check
    #     whether the plugin exists in the marketplace on disk. This catches cases where
    #     installed_plugins.json was already cleaned by a prior session but enabledPlugins
    #     wasn't, causing the startup sync to re-add the stale entry every launch.
    local stale_ep=()
    while IFS= read -r ep_entry; do
      [ -z "$ep_entry" ] && continue
      case "$ep_entry" in
        opspal-*@*)
          local ep_pname="${ep_entry%%@*}"
          local ep_mplace="${ep_entry#*@}"
          local ep_dir="${HOME}/.claude/plugins/marketplaces/${ep_mplace}/plugins/${ep_pname}"
          if [ ! -f "${ep_dir}/.claude-plugin/plugin.json" ] && [ ! -f "${ep_dir}/plugin.json" ]; then
            stale_ep+=("$ep_entry")
          fi
          ;;
      esac
    done < <(jq -r '.enabledPlugins // {} | if type == "object" then keys[] else .[] end' "$sf" 2>/dev/null)

    if [ ${#stale_ep[@]} -gt 0 ]; then
      # Build jq del() expression — works for both object {"key":true} and array ["key"] formats
      local del_expr='.'
      for ep_key in "${stale_ep[@]}"; do
        del_expr="${del_expr} | if .enabledPlugins | type == \"object\" then del(.enabledPlugins[\"${ep_key}\"]) elif .enabledPlugins | type == \"array\" then .enabledPlugins |= map(select(. != \"${ep_key}\")) else . end"
      done
      local tmp_sf="${sf}.tmp.$$"
      jq "$del_expr" "$sf" > "$tmp_sf" 2>/dev/null && mv "$tmp_sf" "$sf" || rm -f "$tmp_sf"
      pruned_count=$((pruned_count + ${#stale_ep[@]}))
    fi

    # 2b. Remove hook entries whose script files don't exist on disk.
    #     Extract each hook command, resolve to a file path, test -f it.
    #     This is marketplace-agnostic and catches all stale hooks regardless
    #     of which plugin or marketplace they referenced.
    local dead_paths=()
    while IFS=$'\t' read -r evt idx cmd; do
      [ -z "$cmd" ] && continue
      # Resolve the script path from the command string:
      # - Expand ${CLAUDE_PLUGIN_ROOT} with the current plugin root
      # - Expand ~ to $HOME
      # - Take the first whitespace-delimited token (the script path, before args)
      local resolved="$cmd"
      resolved="${resolved//\$\{CLAUDE_PLUGIN_ROOT\}/${PLUGIN_ROOT}}"
      resolved="${resolved//\~/${HOME}}"
      # Extract just the script path (first token before space or quote)
      local script_path
      script_path=$(echo "$resolved" | awk '{print $1}')
      # Only check absolute paths (skip inline bash -c, env, etc.)
      case "$script_path" in
        /*)
          if [ ! -f "$script_path" ]; then
            dead_paths+=("${evt}:${idx}")
          fi
          ;;
      esac
    done < <(jq -r '
      .hooks // {} | to_entries[] |
      .key as $evt | .value | if type == "array" then to_entries[] else empty end |
      .key as $idx | .value.hooks // [] | .[] |
      "\($evt)\t\($idx)\t\(.command // "")"
    ' "$sf" 2>/dev/null)

    if [ ${#dead_paths[@]} -gt 0 ]; then
      # Build jq expression to delete dead entries (process in reverse index order
      # so that deletions don't shift indices)
      local del_expr='.'
      # Deduplicate by evt:idx and sort in reverse
      local sorted_paths
      sorted_paths=$(printf '%s\n' "${dead_paths[@]}" | sort -t: -k1,1 -k2,2rn | uniq)
      while IFS=: read -r evt idx; do
        del_expr="${del_expr} | if .hooks[\"${evt}\"] then .hooks[\"${evt}\"] |= (to_entries | map(select(.key != ${idx})) | map(.value)) else . end"
      done <<< "$sorted_paths"
      # Clean up empty arrays
      del_expr="${del_expr} | if .hooks then .hooks |= with_entries(select(.value | length > 0)) else . end"

      local tmp_sf="${sf}.tmp.$$"
      if jq "$del_expr" "$sf" > "$tmp_sf" 2>/dev/null; then
        mv "$tmp_sf" "$sf"
        pruned_count=$((pruned_count + ${#dead_paths[@]}))
      else
        rm -f "$tmp_sf"
      fi
    fi
  done

  [ $pruned_count -eq 0 ] && return 0
  printf 'Pruned %d stale plugin/hook reference(s)\n' "$pruned_count" >&2
}
_prune_stale_references

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
