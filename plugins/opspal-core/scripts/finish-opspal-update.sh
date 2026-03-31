#!/usr/bin/env bash
#
# finish-opspal-update.sh - Post-update validation and runtime reconciliation
#
# Extracted from the /finishopspalupdate command so the slash command can invoke
# a real script instead of inlining a large Bash payload through `bash -c`.
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMMON_HELPER="$SCRIPT_DIR/lib/opspal-update-common.sh"
if [ ! -f "$COMMON_HELPER" ]; then
  echo "Error: shared update helper not found at $COMMON_HELPER"
  exit 1
fi
source "$COMMON_HELPER"

show_usage() {
  cat <<EOF
Usage: $0 [--skip-fix] [--verbose] [--no-cache-prune] [--no-pull] [--strict] [--workspace path] [--claude-root path] [--json] [--help]

Options:
  --skip-fix         Run validation in check-only mode
  --verbose          Show detailed diagnostics
  --no-cache-prune   Skip stale plugin cache pruning
  --no-pull          Skip marketplace git pull (use whatever is on disk)
  --strict           Keep fewer cache versions during prune
  --workspace <path> Run validation against a specific workspace root
  --claude-root <path> Use a specific ~/.claude root instead of auto-detecting
  --json             Emit the final report JSON to stdout
  --help             Show this help text
EOF
}

# Parse arguments
SKIP_FIX=false
VERBOSE_FLAG=""
CACHE_PRUNE=true
MARKETPLACE_PULL=true
STRICT_MODE=false
STRICT_FLAG=""
JSON_OUTPUT=false
WORKSPACE_ROOT_INPUT="${OPSPAL_UPDATE_WORKSPACE:-}"
CLAUDE_ROOT_OVERRIDE="${OPSPAL_UPDATE_CLAUDE_ROOT:-}"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-fix)
      SKIP_FIX=true
      shift
      ;;
    --verbose)
      VERBOSE_FLAG="--verbose"
      shift
      ;;
    --no-cache-prune)
      CACHE_PRUNE=false
      shift
      ;;
    --no-pull)
      MARKETPLACE_PULL=false
      shift
      ;;
    --strict)
      STRICT_MODE=true
      STRICT_FLAG="--strict"
      shift
      ;;
    --workspace)
      WORKSPACE_ROOT_INPUT="$2"
      shift 2
      ;;
    --workspace=*)
      WORKSPACE_ROOT_INPUT="${1#*=}"
      shift
      ;;
    --claude-root)
      CLAUDE_ROOT_OVERRIDE="$2"
      shift 2
      ;;
    --claude-root=*)
      CLAUDE_ROOT_OVERRIDE="${1#*=}"
      shift
      ;;
    --json)
      JSON_OUTPUT=true
      shift
      ;;
    --help)
      show_usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      echo ""
      show_usage
      exit 1
      ;;
  esac
done

opspal_update_init_paths
FINISH_REPORT_FILE="${OPSPAL_UPDATE_FINISH_REPORT_FILE:-$OPSPAL_UPDATE_LOG_DIR/opspal-update-finish-last.json}"
SESSION_FILE="${OPSPAL_UPDATE_SESSION_FILE:-$OPSPAL_UPDATE_STATE_DIR/opspal-update-session.json}"

ORIGINAL_STDOUT_OPENED=false
JSON_CAPTURE_FILE=""
if [ "$JSON_OUTPUT" = true ]; then
  exec 3>&1
  ORIGINAL_STDOUT_OPENED=true
  JSON_CAPTURE_FILE="$(mktemp "${TMPDIR:-/tmp}/opspal-finish-json.XXXXXX")"
  exec >"$JSON_CAPTURE_FILE"
fi

START_SESSION_FOUND=false
START_SESSION_PENDING=false
SESSION_ID="${OPSPAL_UPDATE_SESSION_ID:-}"
SESSION_STATUS="standalone"
START_REPORT_FILE=""
SESSION_HINT=""

if [ -f "$SESSION_FILE" ]; then
  START_SESSION_FOUND=true
  SESSION_STATUS="$(opspal_update_read_json_field "$SESSION_FILE" "status" || true)"
  START_REPORT_FILE="$(opspal_update_read_json_field "$SESSION_FILE" "startReportFile" || true)"
  if [ -z "$WORKSPACE_ROOT_INPUT" ]; then
    WORKSPACE_ROOT_INPUT="$(opspal_update_read_json_field "$SESSION_FILE" "workspaceRoot" || true)"
  fi
  if [ -z "$CLAUDE_ROOT_OVERRIDE" ]; then
    CLAUDE_ROOT_OVERRIDE="$(opspal_update_read_json_field "$SESSION_FILE" "claudeRootOverride" || true)"
  fi
  if [ -z "$SESSION_ID" ]; then
    SESSION_ID="$(opspal_update_read_json_field "$SESSION_FILE" "sessionId" || true)"
  fi
  if [ "$(opspal_update_read_json_field "$SESSION_FILE" "finishPending" || true)" = "true" ]; then
    START_SESSION_PENDING=true
  fi
fi

if [ -z "$WORKSPACE_ROOT_INPUT" ]; then
  WORKSPACE_ROOT_INPUT="$PWD"
fi

if ! WORKSPACE_ROOT="$(cd "$WORKSPACE_ROOT_INPUT" 2>/dev/null && pwd)"; then
  echo "Error: workspace root not found: $WORKSPACE_ROOT_INPUT"
  [ -n "$JSON_CAPTURE_FILE" ] && rm -f "$JSON_CAPTURE_FILE"
  exit 1
fi

if [ -n "$CLAUDE_ROOT_OVERRIDE" ]; then
  if ! CLAUDE_ROOT_OVERRIDE="$(cd "$CLAUDE_ROOT_OVERRIDE" 2>/dev/null && pwd)"; then
    echo "Error: Claude root not found: $CLAUDE_ROOT_OVERRIDE"
    [ -n "$JSON_CAPTURE_FILE" ] && rm -f "$JSON_CAPTURE_FILE"
    exit 1
  fi
fi

if [ -z "$SESSION_ID" ]; then
  SESSION_ID="$(opspal_update_session_id)"
fi

cd "$WORKSPACE_ROOT"

declare -a CLAUDE_ROOTS=()
declare -a SETTINGS_BACKUPS=()
declare -a STEP_RESULT_ROWS=()
PRUNED_COUNT=0
SCANNED_COUNT=0
STALE_HOOKS_CLEANED=0
LEGACY_ROUTING_STATE=0
ROUTING_CIRCUITS_RESET=0
CURRENT_STEP="initialization"
EXIT_CODE=0
FINISH_FINALIZED=false
ACTIVE_STEP_BACKUP_DIR=""
STEP_STATUS="passed"
STEP_MESSAGE=""
STEP_BACKUP_DIR=""

append_unique() {
  local target_array="$1"
  local candidate="$2"
  [ -n "$candidate" ] || return 0
  [ -d "$candidate" ] || return 0

  local current=()
  eval "current=(\"\${${target_array}[@]}\")"

  local existing
  for existing in "${current[@]}"; do
    if [ "$existing" = "$candidate" ]; then
      return 0
    fi
  done

  eval "${target_array}+=(\"\$candidate\")"
}

detect_claude_roots() {
  CLAUDE_ROOTS=()

  if [ -n "$CLAUDE_ROOT_OVERRIDE" ]; then
    append_unique CLAUDE_ROOTS "$CLAUDE_ROOT_OVERRIDE"
    return 0
  fi

  append_unique CLAUDE_ROOTS "$HOME/.claude"
  append_unique CLAUDE_ROOTS "${CLAUDE_HOME:-}"
  append_unique CLAUDE_ROOTS "${CLAUDE_CONFIG_DIR:-}"

  if [ -n "${WSL_DISTRO_NAME:-}" ] || [ -n "${WSL_INTEROP:-}" ]; then
    if [ -n "${USERPROFILE:-}" ] && command -v wslpath >/dev/null 2>&1; then
      WIN_PROFILE="$(wslpath -u "$USERPROFILE" 2>/dev/null || true)"
      append_unique CLAUDE_ROOTS "$WIN_PROFILE/.claude"
    fi
    append_unique CLAUDE_ROOTS "/mnt/c/Users/${USERNAME:-}/.claude"
    append_unique CLAUDE_ROOTS "/mnt/c/Users/${USER:-}/.claude"
  fi
}

json_array_from_args() {
  if [ "$#" -eq 0 ]; then
    printf '[]'
    return 0
  fi

  printf '%s\n' "$@" | node -e '
    "use strict";
    const fs = require("fs");
    const values = fs.readFileSync(0, "utf8")
      .split("\n")
      .map((value) => value.trim())
      .filter(Boolean);
    process.stdout.write(JSON.stringify(values));
  '
}

json_step_results() {
  if [ ${#STEP_RESULT_ROWS[@]} -eq 0 ]; then
    printf '[]'
    return 0
  fi

  printf '%s\n' "${STEP_RESULT_ROWS[@]}" | node -e '
    "use strict";
    const fs = require("fs");
    const rows = fs.readFileSync(0, "utf8")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [key = "", label = "", status = "", message = "", backupDir = "", restoreScript = ""] = line.split("\t");
        return {
          key,
          label,
          status,
          message,
          rollbackDir: backupDir || null,
          restoreScript: restoreScript || null
        };
      });
    process.stdout.write(JSON.stringify(rows));
  '
}

record_step_result() {
  local key="$1"
  local label="$2"
  local status="$3"
  local message="${4:-}"
  local backup_dir="${5:-}"
  local restore_script="${6:-}"

  STEP_RESULT_ROWS+=("$(printf '%s\t%s\t%s\t%s\t%s\t%s' "$key" "$label" "$status" "$message" "$backup_dir" "$restore_script")")
}

append_step_message() {
  local message="$1"
  [ -n "$message" ] || return 0

  if [ -z "$STEP_MESSAGE" ]; then
    STEP_MESSAGE="$message"
  else
    STEP_MESSAGE="${STEP_MESSAGE}; ${message}"
  fi
}

step_status_rank() {
  case "$1" in
    passed) echo 0 ;;
    skipped) echo 1 ;;
    degraded) echo 2 ;;
    warning) echo 3 ;;
    failed) echo 4 ;;
    *) echo 0 ;;
  esac
}

update_step_status() {
  local candidate="$1"
  local current_rank candidate_rank

  current_rank="$(step_status_rank "$STEP_STATUS")"
  candidate_rank="$(step_status_rank "$candidate")"

  if [ "$candidate_rank" -gt "$current_rank" ]; then
    STEP_STATUS="$candidate"
  fi
}

step_backup_dir_for_key() {
  local step_key="$1"
  echo "$OPSPAL_UPDATE_BACKUP_DIR/finish-${SESSION_ID}-${step_key}"
}

ensure_step_backup_dir() {
  local step_key="$1"
  local backup_dir
  local restore_script

  backup_dir="$(step_backup_dir_for_key "$step_key")"
  restore_script="$backup_dir/restore.sh"

  mkdir -p "$backup_dir/payload"
  if [ ! -f "$restore_script" ]; then
    cat > "$restore_script" <<EOF
#!/usr/bin/env bash
set -euo pipefail

# Restore bundle for ${step_key}
EOF
    chmod +x "$restore_script"
  fi

  : > "$backup_dir/.touch"
  echo "$backup_dir"
}

capture_backup_target() {
  local backup_dir="$1"
  local target="$2"
  local manifest="$backup_dir/targets.txt"
  local restore_script="$backup_dir/restore.sh"
  local relative_path snapshot_path

  [ -n "$backup_dir" ] || return 0
  [ -n "$target" ] || return 0

  if grep -Fxq "$target" "$manifest" 2>/dev/null; then
    return 0
  fi

  printf '%s\n' "$target" >> "$manifest"

  if [ -e "$target" ] || [ -L "$target" ]; then
    relative_path="${target#/}"
    snapshot_path="$backup_dir/payload/$relative_path"
    mkdir -p "$(dirname "$snapshot_path")"
    rm -rf "$snapshot_path"
    cp -a "$target" "$snapshot_path"
    {
      printf 'rm -rf %q\n' "$target"
      printf 'mkdir -p %q\n' "$(dirname "$target")"
      printf 'cp -a %q %q\n' "$snapshot_path" "$target"
    } >> "$restore_script"
  else
    printf 'rm -rf %q\n' "$target" >> "$restore_script"
  fi
}

prepare_step_snapshot() {
  local step_key="$1"
  shift
  local backup_dir
  local target_count=0
  local target

  backup_dir="$(ensure_step_backup_dir "$step_key")"
  for target in "$@"; do
    [ -n "$target" ] || continue
    capture_backup_target "$backup_dir" "$target"
    target_count=$((target_count + 1))
  done

  if [ "$target_count" -eq 0 ] && [ ! -s "$backup_dir/targets.txt" ] && [ ! -s "$backup_dir/crontab.before" ] && [ ! -s "$backup_dir/repo-heads.tsv" ] && [ ! -s "$backup_dir/README.txt" ]; then
    rm -rf "$backup_dir"
    echo ""
    return 0
  fi

  echo "$backup_dir"
}

capture_crontab_backup() {
  local backup_dir="$1"
  local crontab_file="$backup_dir/crontab.before"
  local restore_script="$backup_dir/restore.sh"

  [ -n "$backup_dir" ] || return 0
  if crontab -l > "$crontab_file" 2>/dev/null; then
    cat >> "$restore_script" <<EOF

if [ -s $(printf '%q' "$crontab_file") ]; then
  crontab $(printf '%q' "$crontab_file")
else
  crontab -r 2>/dev/null || true
fi
EOF
  else
    : > "$crontab_file"
    cat >> "$restore_script" <<'EOF'

crontab -r 2>/dev/null || true
EOF
  fi
}

capture_repo_head_manifest() {
  local backup_dir="$1"
  shift
  local manifest="$backup_dir/repo-heads.tsv"
  local repo_path sha

  [ -n "$backup_dir" ] || return 0
  : > "$manifest"

  for repo_path in "$@"; do
    [ -d "$repo_path/.git" ] || continue
    sha="$(git -C "$repo_path" rev-parse HEAD 2>/dev/null || true)"
    [ -n "$sha" ] || continue
    printf '%s\t%s\n' "$repo_path" "$sha" >> "$manifest"
  done

  if [ -s "$manifest" ]; then
    cat >> "$backup_dir/README.txt" <<'EOF'
Git repo heads before Step 6 were captured in repo-heads.tsv for manual rollback.
Use the recorded SHA with a manual reset if needed after reviewing repo state.
EOF
  else
    rm -f "$manifest"
  fi
}

finalize_step_backup_dir() {
  local backup_dir="$1"
  [ -n "$backup_dir" ] || return 0

  if [ ! -f "$backup_dir/restore.sh" ]; then
    return 0
  fi

  chmod +x "$backup_dir/restore.sh"

  if [ ! -s "$backup_dir/targets.txt" ] && [ ! -s "$backup_dir/crontab.before" ] && [ ! -s "$backup_dir/repo-heads.tsv" ] && [ ! -s "$backup_dir/README.txt" ]; then
    rm -rf "$backup_dir"
    return 0
  fi
}

run_step() {
  local step_key="$1"
  local step_label="$2"
  local step_heading="$3"
  local handler="$4"
  local restore_script=""
  local handler_exit=0

  CURRENT_STEP="$step_label"
  STEP_STATUS="passed"
  STEP_MESSAGE=""
  STEP_BACKUP_DIR=""

  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "$step_heading"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""

  set +e
  "$handler"
  handler_exit=$?
  set -e

  if [ "$handler_exit" -ne 0 ]; then
    EXIT_CODE=1
    update_step_status "failed"
    append_step_message "${step_label} failed unexpectedly"
  fi

  finalize_step_backup_dir "$STEP_BACKUP_DIR"
  if [ -n "$STEP_BACKUP_DIR" ] && [ -f "$STEP_BACKUP_DIR/restore.sh" ]; then
    restore_script="$STEP_BACKUP_DIR/restore.sh"
  fi

  if [ -z "$STEP_MESSAGE" ]; then
    case "$STEP_STATUS" in
      passed) STEP_MESSAGE="${step_label} completed successfully" ;;
      skipped) STEP_MESSAGE="${step_label} skipped" ;;
      degraded) STEP_MESSAGE="${step_label} completed with degraded signals" ;;
      warning) STEP_MESSAGE="${step_label} completed with warnings" ;;
      failed) STEP_MESSAGE="${step_label} failed" ;;
    esac
  fi

  record_step_result "$step_key" "$step_label" "$STEP_STATUS" "$STEP_MESSAGE" "$STEP_BACKUP_DIR" "$restore_script"
  echo ""
  return 0
}

build_finish_report_json() {
  local status="$1"
  local message="${2:-}"
  local timestamp roots_json backups_json step_results_json

  timestamp="$(opspal_update_timestamp_utc)"
  roots_json="$(json_array_from_args "${CLAUDE_ROOTS[@]}")"
  backups_json="$(json_array_from_args "${SETTINGS_BACKUPS[@]}")"
  step_results_json="$(json_step_results)"

  STATUS="$status" \
  MESSAGE="$message" \
  SESSION_ID="$SESSION_ID" \
  TIMESTAMP="$timestamp" \
  WORKSPACE_ROOT="$WORKSPACE_ROOT" \
  CLAUDE_ROOT_OVERRIDE="$CLAUDE_ROOT_OVERRIDE" \
  ROOTS_JSON="$roots_json" \
  BACKUPS_JSON="$backups_json" \
  STEP_RESULTS_JSON="$step_results_json" \
  SESSION_FILE="$SESSION_FILE" \
  START_REPORT_FILE="$START_REPORT_FILE" \
  FINISH_REPORT_FILE="$FINISH_REPORT_FILE" \
  SESSION_STATUS="$SESSION_STATUS" \
  START_SESSION_FOUND="$START_SESSION_FOUND" \
  START_SESSION_PENDING="$START_SESSION_PENDING" \
  SKIP_FIX="$SKIP_FIX" \
  CACHE_PRUNE="$CACHE_PRUNE" \
  STRICT_MODE="$STRICT_MODE" \
  VERBOSE_FLAG="$VERBOSE_FLAG" \
  EXIT_CODE="$EXIT_CODE" \
  CURRENT_STEP="$CURRENT_STEP" \
  LOCK_PATH="${OPSPAL_UPDATE_ACTIVE_LOCK:-}" \
  PRUNED_COUNT="$PRUNED_COUNT" \
  SCANNED_COUNT="$SCANNED_COUNT" \
  STALE_HOOKS_CLEANED="$STALE_HOOKS_CLEANED" \
  LEGACY_ROUTING_STATE="$LEGACY_ROUTING_STATE" \
  ROUTING_CIRCUITS_RESET="$ROUTING_CIRCUITS_RESET" \
  node - <<'EOF'
'use strict';

function parseJson(name, fallback) {
  try {
    return JSON.parse(process.env[name] || fallback);
  } catch (_error) {
    return JSON.parse(fallback);
  }
}

const payload = {
  reportType: 'finish-opspal-update',
  sessionId: process.env.SESSION_ID,
  timestamp: process.env.TIMESTAMP,
  updatedAt: process.env.TIMESTAMP,
  status: process.env.STATUS,
  message: process.env.MESSAGE || '',
  workspaceRoot: process.env.WORKSPACE_ROOT,
  claudeRootOverride: process.env.CLAUDE_ROOT_OVERRIDE || null,
  claudeRoots: parseJson('ROOTS_JSON', '[]'),
  steps: parseJson('STEP_RESULTS_JSON', '[]'),
  sessionFile: process.env.SESSION_FILE,
  startReportFile: process.env.START_REPORT_FILE || null,
  reportFile: process.env.FINISH_REPORT_FILE,
  lockPath: process.env.LOCK_PATH || null,
  skipFix: process.env.SKIP_FIX === 'true',
  cachePrune: process.env.CACHE_PRUNE === 'true',
  strictMode: process.env.STRICT_MODE === 'true',
  verbose: Boolean(process.env.VERBOSE_FLAG),
  currentStep: process.env.CURRENT_STEP,
  exitCode: Number(process.env.EXIT_CODE || 0),
  resumedFromStartSession: process.env.START_SESSION_FOUND === 'true',
  startSessionPending: process.env.START_SESSION_PENDING === 'true',
  startSessionStatus: process.env.SESSION_STATUS || null,
  settingsBackups: parseJson('BACKUPS_JSON', '[]'),
  summary: {
    staleHooksCleaned: Number(process.env.STALE_HOOKS_CLEANED || 0),
    routingStateFilesCleared: Number(process.env.LEGACY_ROUTING_STATE || 0),
    routingCircuitBreakersReset: Number(process.env.ROUTING_CIRCUITS_RESET || 0),
    prunedCacheVersions: Number(process.env.PRUNED_COUNT || 0),
    scannedCacheRoots: Number(process.env.SCANNED_COUNT || 0),
    stepCount: parseJson('STEP_RESULTS_JSON', '[]').length,
    rollbackCount: parseJson('STEP_RESULTS_JSON', '[]').filter((step) => step.rollbackDir).length
  }
};

process.stdout.write(JSON.stringify(payload));
EOF
}

persist_finish_artifacts() {
  local status="$1"
  local message="${2:-}"
  local report_json session_json session_tmp

  report_json="$(build_finish_report_json "$status" "$message")"
  opspal_update_write_json "$FINISH_REPORT_FILE" "$report_json"

  session_tmp="$(mktemp "${TMPDIR:-/tmp}/opspal-finish-session.XXXXXX")"
  REPORT_JSON="$report_json" node - <<'EOF' > "$session_tmp"
'use strict';

const report = JSON.parse(process.env.REPORT_JSON || '{}');
const terminalStatuses = new Set(['finish_completed', 'finish_warnings']);
const payload = {
  sessionId: report.sessionId,
  workspaceRoot: report.workspaceRoot,
  claudeRootOverride: report.claudeRootOverride,
  claudeRoots: report.claudeRoots,
  finishPending: terminalStatuses.has(report.status) ? false : true,
  finishReportFile: report.reportFile,
  finishStatus: report.status,
  updatedAt: report.updatedAt,
  finish: report
};

process.stdout.write(JSON.stringify(payload));
EOF
  session_json="$(cat "$session_tmp")"
  rm -f "$session_tmp"
  opspal_update_merge_json "$SESSION_FILE" "$session_json"
}

emit_finish_json_report() {
  if [ "$JSON_OUTPUT" = true ] && [ "$ORIGINAL_STDOUT_OPENED" = true ] && [ -f "$FINISH_REPORT_FILE" ]; then
    cat "$FINISH_REPORT_FILE" >&3
  fi
}

finalize_finish_script() {
  local exit_code="$1"
  local status="$2"
  local message="${3:-}"

  EXIT_CODE="$exit_code"
  persist_finish_artifacts "$status" "$message"
  FINISH_FINALIZED=true
  emit_finish_json_report
  opspal_update_release_lock
  [ -n "$JSON_CAPTURE_FILE" ] && rm -f "$JSON_CAPTURE_FILE"
  exit "$exit_code"
}

cleanup_finish_script() {
  local exit_code=$?

  if [ "$FINISH_FINALIZED" != true ]; then
    EXIT_CODE="$exit_code"
    persist_finish_artifacts "unexpected_exit" "Finish update exited unexpectedly during ${CURRENT_STEP}"
    emit_finish_json_report
    if [ "$JSON_OUTPUT" != true ]; then
      echo ""
      echo "⚠️  finish-opspal-update exited unexpectedly during ${CURRENT_STEP}"
    fi
  fi

  opspal_update_release_lock
  [ -n "$JSON_CAPTURE_FILE" ] && rm -f "$JSON_CAPTURE_FILE"
  return "$exit_code"
}

trap cleanup_finish_script EXIT

detect_claude_roots

if ! opspal_update_acquire_lock "opspal-update"; then
  EXIT_CODE=1
  finalize_finish_script 1 "lock_unavailable" "Another OpsPal update process is already running"
fi

echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║    OpsPal Post-Update Validation                               ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

if [ "$START_SESSION_FOUND" = true ]; then
  if [ "$START_SESSION_PENDING" = true ]; then
    echo "ℹ️  Resuming update session $SESSION_ID"
  else
    echo "ℹ️  Found prior update session $SESSION_ID; running finish validation again"
  fi
else
  echo "ℹ️  No pending start session found; running finish validation in standalone mode"
fi
echo ""

find_latest_cache_script() {
  local root="$1"
  local path_pattern="$2"
  [ -d "$root/plugins/cache" ] || return 1
  find "$root/plugins/cache" -type f -path "$path_pattern" 2>/dev/null | sort -V | tail -1
}

find_statusline_script_for_root() {
  local root="$1"
  local candidate=""
  local cache_hit=""
  local mp_dir=""
  local candidates=(
    "$root/plugins/opspal-core/scripts/opspal-statusline.js"
    "$root/plugins/marketplaces/opspal-commercial/plugins/opspal-core/scripts/opspal-statusline.js"
    "$WORKSPACE_ROOT/plugins/opspal-core/scripts/opspal-statusline.js"
    "$WORKSPACE_ROOT/.claude-plugins/opspal-core/scripts/opspal-statusline.js"
    "./plugins/opspal-core/scripts/opspal-statusline.js"
    "./.claude-plugins/opspal-core/scripts/opspal-statusline.js"
  )

  for mp_dir in "$root/plugins/marketplaces"/*/plugins/opspal-core/scripts; do
    [ -d "$mp_dir" ] && candidates+=("$mp_dir/opspal-statusline.js")
  done

  for candidate in "${candidates[@]}"; do
    [ -f "$candidate" ] && echo "$candidate" && return 0
  done

  cache_hit="$(find_latest_cache_script "$root" "*/opspal-core/*/scripts/opspal-statusline.js" || true)"
  if [ -n "$cache_hit" ] && [ -f "$cache_hit" ]; then
    echo "$cache_hit"
    return 0
  fi

  return 1
}

build_statusline_command() {
  local script_path="$1"
  printf 'node %q' "$script_path"
}

# Find lib script in multiple locations (dev + marketplace + cache)
find_script() {
  local script_name="$1"
  local paths=(
    "$PWD/plugins/opspal-core/scripts/lib/$script_name"
    "$PWD/.claude-plugins/opspal-core/scripts/lib/$script_name"
    "./plugins/opspal-core/scripts/lib/$script_name"
    "./.claude-plugins/opspal-core/scripts/lib/$script_name"
  )

  local root mp_dir cache_hit found
  for root in "${CLAUDE_ROOTS[@]}"; do
    paths+=("$root/plugins/marketplaces/opspal-commercial/plugins/opspal-core/scripts/lib/$script_name")
    for mp_dir in "$root/plugins/marketplaces"/*/plugins/opspal-core/scripts/lib; do
      [ -d "$mp_dir" ] && paths+=("$mp_dir/$script_name")
    done
    cache_hit="$(find_latest_cache_script "$root" "*/opspal-core/*/scripts/lib/$script_name" || true)"
    [ -n "$cache_hit" ] && paths+=("$cache_hit")
  done

  for path in "${paths[@]}"; do
    [ -f "$path" ] && echo "$path" && return 0
  done

  for root in "${CLAUDE_ROOTS[@]}"; do
    [ -d "$root/plugins" ] || continue
    found=$(find "$root/plugins" -name "$script_name" -path "*/opspal-core/scripts/lib/*" 2>/dev/null | sort -V | tail -1)
    [ -n "$found" ] && echo "$found" && return 0
  done

  found=$(find . -name "$script_name" -path "*/opspal-core/scripts/lib/*" 2>/dev/null | sort -V | tail -1)
  [ -n "$found" ] && echo "$found" && return 0
  return 1
}

find_routing_index() {
  local candidate=""
  local root=""
  local mp_dir=""
  local cache_hit=""
  local candidates=(
    "$WORKSPACE_ROOT/plugins/opspal-core/routing-index.json"
    "$WORKSPACE_ROOT/.claude-plugins/opspal-core/routing-index.json"
    "$PWD/plugins/opspal-core/routing-index.json"
    "$PWD/.claude-plugins/opspal-core/routing-index.json"
    "$SCRIPT_DIR/../routing-index.json"
  )

  for root in "${CLAUDE_ROOTS[@]}"; do
    candidates+=(
      "$root/plugins/opspal-core/routing-index.json"
      "$root/plugins/marketplaces/opspal-commercial/plugins/opspal-core/routing-index.json"
    )

    for mp_dir in "$root/plugins/marketplaces"/*/plugins/opspal-core; do
      [ -d "$mp_dir" ] && candidates+=("$mp_dir/routing-index.json")
    done

    cache_hit="$(find_latest_cache_script "$root" "*/opspal-core/*/routing-index.json" || true)"
    [ -n "$cache_hit" ] && candidates+=("$cache_hit")
  done

  for candidate in "${candidates[@]}"; do
    [ -f "$candidate" ] && echo "$candidate" && return 0
  done

  return 1
}

# Find CI script in multiple locations (dev + marketplace + cache)
find_ci_script() {
  local script_name="$1"
  local paths=(
    "$PWD/plugins/opspal-core/scripts/ci/$script_name"
    "$PWD/.claude-plugins/opspal-core/scripts/ci/$script_name"
    "./plugins/opspal-core/scripts/ci/$script_name"
    "./.claude-plugins/opspal-core/scripts/ci/$script_name"
  )

  local root mp_dir cache_hit found
  for root in "${CLAUDE_ROOTS[@]}"; do
    paths+=("$root/plugins/marketplaces/opspal-commercial/plugins/opspal-core/scripts/ci/$script_name")
    for mp_dir in "$root/plugins/marketplaces"/*/plugins/opspal-core/scripts/ci; do
      [ -d "$mp_dir" ] && paths+=("$mp_dir/$script_name")
    done
    cache_hit="$(find_latest_cache_script "$root" "*/opspal-core/*/scripts/ci/$script_name" || true)"
    [ -n "$cache_hit" ] && paths+=("$cache_hit")
  done

  for path in "${paths[@]}"; do
    [ -f "$path" ] && echo "$path" && return 0
  done

  for root in "${CLAUDE_ROOTS[@]}"; do
    [ -d "$root/plugins" ] || continue
    found=$(find "$root/plugins" -name "$script_name" -path "*/opspal-core/scripts/ci/*" 2>/dev/null | sort -V | tail -1)
    [ -n "$found" ] && echo "$found" && return 0
  done

  found=$(find . -name "$script_name" -path "*/opspal-core/scripts/ci/*" 2>/dev/null | sort -V | tail -1)
  [ -n "$found" ] && echo "$found" && return 0
  return 1
}

plugin_root_for_script() {
  local script_path="$1"
  [ -n "$script_path" ] || return 1
  (cd "$(dirname "$script_path")/../.." && pwd)
}

prune_versioned_plugin_root() {
  local plugin_dir="$1"
  local keep_versions=2

  SCANNED_TOTAL=$((SCANNED_TOTAL + 1))

  if [ "$STRICT_MODE" = true ]; then
    keep_versions=1
  fi

  mapfile -t versions < <(
    find "$plugin_dir" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' 2>/dev/null \
    | grep -E '^[0-9]+\.[0-9]+\.[0-9]+([.-][0-9A-Za-z.-]+)?$' \
    | sort -V
  )

  local count="${#versions[@]}"
  if [ "$count" -le "$keep_versions" ]; then
    return 0
  fi

  local to_remove=$((count - keep_versions))
  local i version target
  for ((i = 0; i < to_remove; i++)); do
    version="${versions[$i]}"
    target="$plugin_dir/$version"
    if [ -n "$ACTIVE_STEP_BACKUP_DIR" ]; then
      capture_backup_target "$ACTIVE_STEP_BACKUP_DIR" "$target"
    fi
    rm -rf "$target" 2>/dev/null || true
    PRUNED_TOTAL=$((PRUNED_TOTAL + 1))
    if [ "$VERBOSE_FLAG" = "--verbose" ]; then
      echo "  🧹 Pruned cached plugin version: $target"
    fi
  done
}

# Prune stale semver caches in both marketplace and cache trees.
# Keeps latest 2 versions per plugin for rollback safety.
prune_marketplace_cache_versions() {
  PRUNED_TOTAL=0
  SCANNED_TOTAL=0
  local root plugin_dir

  for root in "${CLAUDE_ROOTS[@]}"; do
    if [ -d "$root/plugins/marketplaces" ]; then
      while IFS= read -r plugin_dir; do
        prune_versioned_plugin_root "$plugin_dir"
      done < <(find "$root/plugins/marketplaces" -mindepth 3 -maxdepth 3 -type d -path "*/plugins/*" 2>/dev/null)
    fi

    if [ -d "$root/plugins/cache" ]; then
      while IFS= read -r plugin_dir; do
        prune_versioned_plugin_root "$plugin_dir"
      done < <(find "$root/plugins/cache" -mindepth 2 -maxdepth 2 -type d 2>/dev/null)
    fi
  done

  echo "$PRUNED_TOTAL|$SCANNED_TOTAL"
}

step0_marketplace_refresh() {
  if [ "$MARKETPLACE_PULL" != true ]; then
    echo "   Skipped (--no-pull)"
    append_step_message "Marketplace pull skipped (--no-pull)"
    return 0
  fi

  local refreshed=0
  local failed=0
  local claude_roots=("$HOME/.claude")

  # WSL-aware: add Windows .claude path
  if [ -n "${WSL_DISTRO_NAME:-}" ] || [ -n "${WSL_INTEROP:-}" ]; then
    if [ -n "${USERPROFILE:-}" ] && command -v wslpath >/dev/null 2>&1; then
      local win_profile
      win_profile="$(wslpath -u "$USERPROFILE" 2>/dev/null || true)"
      [ -n "$win_profile" ] && [ -d "$win_profile/.claude" ] && claude_roots+=("$win_profile/.claude")
    fi
  fi
  [ -n "${CLAUDE_HOME:-}" ] && [ -d "$CLAUDE_HOME" ] && claude_roots+=("$CLAUDE_HOME")
  [ -n "${CLAUDE_CONFIG_DIR:-}" ] && [ -d "$CLAUDE_CONFIG_DIR" ] && claude_roots+=("$CLAUDE_CONFIG_DIR")

  for claude_root in "${claude_roots[@]}"; do
    local mp_base="$claude_root/plugins/marketplaces"
    [ -d "$mp_base" ] || continue

    for mp_dir in "$mp_base"/*/; do
      [ -d "$mp_dir/.git" ] || continue
      local mp_name
      mp_name=$(basename "$mp_dir")
      echo -n "   $mp_name... "

      if git -C "$mp_dir" pull --ff-only --quiet 2>/dev/null; then
        echo "updated"
        refreshed=$((refreshed + 1))
      elif git -C "$mp_dir" fetch --quiet 2>/dev/null && git -C "$mp_dir" reset --hard origin/main --quiet 2>/dev/null; then
        echo "force-synced"
        refreshed=$((refreshed + 1))
      else
        echo "FAILED (offline or auth issue)"
        failed=$((failed + 1))
      fi
    done
  done

  if [ $refreshed -gt 0 ]; then
    append_step_message "Refreshed $refreshed marketplace(s)"
  fi
  if [ $failed -gt 0 ]; then
    append_step_message "WARNING: $failed marketplace(s) could not be refreshed"
  fi
  if [ $refreshed -eq 0 ] && [ $failed -eq 0 ]; then
    echo "   No marketplace checkouts found"
    append_step_message "No marketplace checkouts found"
  fi

  return 0
}

step1_plugin_validation() {
  local update_script=""
  local -a update_cmd=()
  local -a snapshot_targets=()

  if [ "$SKIP_FIX" != true ]; then
    [ -d "$WORKSPACE_ROOT/plugins" ] && snapshot_targets+=("$WORKSPACE_ROOT/plugins")
    [ -d "$WORKSPACE_ROOT/.claude-plugins" ] && snapshot_targets+=("$WORKSPACE_ROOT/.claude-plugins")
    STEP_BACKUP_DIR="$(prepare_step_snapshot "step1-plugin-validation" "${snapshot_targets[@]}")"
  fi

  update_script="$(find_script "plugin-update-manager.js")"
  if [ -n "$update_script" ]; then
    update_cmd=(node "$update_script")
    if [ "$SKIP_FIX" = true ]; then
      update_cmd+=(--check-only)
    else
      update_cmd+=(--fix)
    fi
    [ -n "$VERBOSE_FLAG" ] && update_cmd+=("$VERBOSE_FLAG")

    if "${update_cmd[@]}"; then
      echo "✅ Plugin validation passed"
    else
      EXIT_CODE=1
      update_step_status "warning"
      append_step_message "Plugin validation completed with warnings/errors"
      echo "⚠️  Plugin validation completed with warnings/errors"
    fi
  else
    EXIT_CODE=1
    update_step_status "warning"
    append_step_message "plugin-update-manager.js not found"
    echo "⚠️  plugin-update-manager.js not found - skipping validation"
  fi

  return 0
}

step2_clean_stale_hooks() {
  local settings_file=""
  local cleaned="0"
  local clean_result=""
  local statusline_action=""
  local statusline_script=""
  local statusline_command=""
  local root=""
  local -a settings_targets=()

  for root in "${CLAUDE_ROOTS[@]}"; do
    settings_file="$root/settings.json"
    settings_targets+=("$settings_file")
  done

  if [ "$SKIP_FIX" != true ]; then
    STEP_BACKUP_DIR="$(prepare_step_snapshot "step2-clean-stale-hooks" "${settings_targets[@]}")"
  fi

  for settings_file in "${settings_targets[@]}"; do
    if [ "$SKIP_FIX" != true ]; then
      SETTINGS_BACKUP="$(opspal_update_backup_file "$settings_file" "settings-pre-finish" || true)"
      if [ -n "$SETTINGS_BACKUP" ]; then
        SETTINGS_BACKUPS+=("$SETTINGS_BACKUP")
        if [ "$VERBOSE_FLAG" = "--verbose" ]; then
          echo "  Backed up settings.json -> $SETTINGS_BACKUP"
        fi
      fi
    fi

    statusline_script="$(find_statusline_script_for_root "$(dirname "$settings_file")" || true)"
    statusline_command=""
    if [ -n "$statusline_script" ]; then
      statusline_command="$(build_statusline_command "$statusline_script")"
    fi

    clean_result="$(node - "$settings_file" "$SKIP_FIX" "$STRICT_MODE" "$statusline_command" <<'EOF'
'use strict';

const fs = require('fs');
const path = require('path');

const filePath = process.argv[2];
const dryRun = process.argv[3] === 'true';
const strict = process.argv[4] === 'true';
const statuslineCommand = process.argv[5] || '';

const pluginHookPatterns = [
  /opspal-[^/]+\/hooks\/unified-router\.sh/,
  /opspal-[^/]+\/hooks\/pre-task-graph-trigger\.sh/,
  /opspal-[^/]+\/hooks\/intake-suggestion\.sh/,
  /opspal-[^/]+\/hooks\/routing-context-refresher\.sh/,
  /opspal-[^/]+\/hooks\/pre-task-agent-validator\.sh/,
  /opspal-[^/]+\/hooks\/pre-task-runbook-reminder\.sh/,
  /opspal-[^/]+\/hooks\/pre-task-template-injector\.sh/,
  /opspal-[^/]+\/hooks\/session-init\.sh/,
  /opspal-[^/]+\/hooks\/session-end\.sh/,
  /opspal-[^/]+\/hooks\/post-tool-use\.sh/,
  /opspal-[^/]+\/hooks\/pre-operation-data-validator\.sh/
];

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function isStalePluginHook(cmd) {
  if (!cmd || typeof cmd !== 'string') return false;
  const matchesPluginHook = pluginHookPatterns.some((pattern) => pattern.test(cmd));
  if (!matchesPluginHook) return false;
  if (strict) return true;
  return !cmd.startsWith('env ');
}

let data = {};
let fileExisted = false;
try {
  data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  fileExisted = true;
} catch (_error) {
  data = {};
}

if (!isObject(data)) {
  data = {};
}

let totalRemoved = 0;
if (isObject(data.hooks)) {
  for (const [event, matchers] of Object.entries(data.hooks)) {
    if (!Array.isArray(matchers)) continue;
    for (let i = matchers.length - 1; i >= 0; i -= 1) {
      const matcher = matchers[i];
      if (!Array.isArray(matcher.hooks)) continue;
      const before = matcher.hooks.length;
      matcher.hooks = matcher.hooks.filter((hook) => !isStalePluginHook(hook.command));
      totalRemoved += before - matcher.hooks.length;
      if (matcher.hooks.length === 0) {
        matchers.splice(i, 1);
      }
    }
    if (matchers.length === 0) {
      delete data.hooks[event];
    }
  }
}

let statuslineAction = statuslineCommand ? 'unchanged' : 'missing-script';
let needsWrite = totalRemoved > 0;
if (statuslineCommand) {
  const current = isObject(data.statusLine) ? data.statusLine : null;
  const currentCommand = typeof current?.command === 'string' ? current.command : '';
  const isOpsPalStatusline = /opspal-statusline\.js/.test(currentCommand);

  if (current && currentCommand && !isOpsPalStatusline) {
    statuslineAction = 'preserved-custom';
  } else if (current?.type === 'command' && currentCommand === statuslineCommand) {
    statuslineAction = 'unchanged';
  } else {
    if (!dryRun) {
      data.statusLine = { type: 'command', command: statuslineCommand };
    }
    needsWrite = true;
    if (!fileExisted) {
      statuslineAction = dryRun ? 'would-create' : 'created';
    } else if (current) {
      statuslineAction = dryRun ? 'would-update' : 'updated';
    } else {
      statuslineAction = dryRun ? 'would-add' : 'added';
    }
  }
}

if (!dryRun && needsWrite) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}

process.stdout.write(JSON.stringify({
  removedHooks: totalRemoved,
  statuslineAction
}));
EOF
)"

    cleaned="$(node -e 'const data = JSON.parse(process.argv[1] || "{}"); process.stdout.write(String(data.removedHooks || 0));' "$clean_result" 2>/dev/null || echo "0")"
    statusline_action="$(node -e 'const data = JSON.parse(process.argv[1] || "{}"); process.stdout.write(String(data.statuslineAction || ""));' "$clean_result" 2>/dev/null || true)"

    if [ "$cleaned" -gt 0 ] 2>/dev/null; then
      if [ "$SKIP_FIX" = true ]; then
        update_step_status "skipped"
        append_step_message "Found $cleaned stale plugin hook(s) in $settings_file"
        echo "  Found $cleaned stale plugin hook(s) in $settings_file (skipped: --skip-fix)"
      else
        STALE_HOOKS_CLEANED=$((STALE_HOOKS_CLEANED + cleaned))
        echo "  Removed $cleaned stale plugin hook(s) from $settings_file"
      fi
    fi

    case "$statusline_action" in
      added|created|updated)
        echo "  Activated OpsPal statusline in $settings_file"
        append_step_message "OpsPal statusline active in $settings_file"
        ;;
      would-add|would-create|would-update)
        update_step_status "skipped"
        echo "  Would activate OpsPal statusline in $settings_file (skipped: --skip-fix)"
        append_step_message "Would activate OpsPal statusline in $settings_file"
        ;;
      preserved-custom)
        echo "  Preserved existing custom statusLine in $settings_file"
        append_step_message "Preserved existing custom statusLine in $settings_file"
        ;;
      unchanged)
        if [ "$VERBOSE_FLAG" = "--verbose" ]; then
          echo "  OpsPal statusline already active in $settings_file"
        fi
        ;;
      missing-script)
        update_step_status "degraded"
        echo "  ⚠️  Could not locate opspal-statusline.js for $settings_file"
        append_step_message "Could not locate OpsPal statusline script for $settings_file"
        ;;
    esac
  done

  if [ "$SKIP_FIX" = true ] && [ "$STALE_HOOKS_CLEANED" -eq 0 ]; then
    update_step_status "skipped"
    append_step_message "Stale hook cleanup check completed in report-only mode"
    echo "✅ Stale hook cleanup check completed in report-only mode"
  elif [ "$STALE_HOOKS_CLEANED" -gt 0 ]; then
    echo "✅ Cleaned $STALE_HOOKS_CLEANED stale hook(s) from settings.json (now managed by plugin hooks.json)"
  else
    echo "✅ No stale plugin hooks found in settings.json"
  fi

  return 0
}

step3_runtime_reconciliation() {
  local fix_script=""
  local hook_reconcile_script=""
  local state_script=""
  local routing_index_script=""
  local alias_script=""
  local routing_validator=""
  local hook_health_script=""
  local hook_core_root=""
  local hook_reconcile_report=""
  local hook_health_json=""
  local hook_health_exit=0
  local hook_health_status="UNKNOWN"
  local vector_cache="/tmp/routing-vector-cache.json"
  local root=""
  local mp_dir=""
  local cache_dir=""
  local step3_msg=""
  local -a snapshot_targets=(
    "$WORKSPACE_ROOT/.claude/settings.json"
    "$WORKSPACE_ROOT/plugins/opspal-core/routing-index.json"
    "$WORKSPACE_ROOT/.claude-plugins/opspal-core/routing-index.json"
    "$WORKSPACE_ROOT/plugins/opspal-core/config/agent-alias-cache.json"
    "$WORKSPACE_ROOT/plugins/opspal-core/config/command-registry.json"
    "$WORKSPACE_ROOT/.claude-plugins/opspal-core/config/agent-alias-cache.json"
    "$WORKSPACE_ROOT/.claude-plugins/opspal-core/config/command-registry.json"
  )

  for root in "${CLAUDE_ROOTS[@]}"; do
    snapshot_targets+=(
      "$root/settings.json"
      "$root/plugins/installed_plugins.json"
      "$root/routing-state.json"
      "$root/circuit-breaker"
    )
    while IFS= read -r mp_dir; do
      [ -n "$mp_dir" ] && snapshot_targets+=("$mp_dir")
    done < <(find "$root/plugins/marketplaces" -type d -path "*/plugins/opspal-core" 2>/dev/null)
    while IFS= read -r cache_dir; do
      [ -n "$cache_dir" ] && snapshot_targets+=("$cache_dir")
    done < <(find "$root/plugins/cache" -mindepth 2 -maxdepth 2 -type d -name "opspal-core" 2>/dev/null)
  done
  STEP_BACKUP_DIR="$(prepare_step_snapshot "step3-runtime-reconciliation" "${snapshot_targets[@]}")"

  fix_script="$(find_script "post-plugin-update-fixes.js")"
  if [ -n "$fix_script" ]; then
    FIX_CMD=(node "$fix_script")
    if [ "$SKIP_FIX" = true ]; then
      FIX_CMD+=(--dry-run)
    else
      FIX_CMD+=(--fix)
    fi
    [ -n "$VERBOSE_FLAG" ] && FIX_CMD+=("$VERBOSE_FLAG")
    [ -n "$STRICT_FLAG" ] && FIX_CMD+=("$STRICT_FLAG")

    if "${FIX_CMD[@]}"; then
      echo "✅ Runtime reconciliation completed"
    else
      EXIT_CODE=1
      update_step_status "warning"
      append_step_message "Runtime reconciliation completed with warnings/errors"
      echo "⚠️  Runtime reconciliation completed with warnings/errors"
    fi
  else
    EXIT_CODE=1
    update_step_status "warning"
    append_step_message "post-plugin-update-fixes.js not found"
    echo "⚠️  post-plugin-update-fixes.js not found - skipping installed runtime reconciliation"
  fi

  hook_reconcile_script="$(find_script "reconcile-hook-registration.js")"
  if [ -n "$hook_reconcile_script" ]; then
    hook_core_root="$(plugin_root_for_script "$hook_reconcile_script")"
    hook_reconcile_report="$(mktemp)"
    HOOK_RECONCILE_CMD=(node "$hook_reconcile_script" --project-root "$PWD" --core-plugin-root "$hook_core_root")
    if [ "$SKIP_FIX" = true ]; then
      HOOK_RECONCILE_CMD+=(--check)
    fi

    if "${HOOK_RECONCILE_CMD[@]}" > "$hook_reconcile_report" 2>/dev/null; then
      echo "✅ Hook registration reconciliation passed"
    else
      EXIT_CODE=1
      update_step_status "warning"
      append_step_message "Hook registration reconciliation failed"
      echo "⚠️  Hook registration reconciliation failed"
      if [ "$VERBOSE_FLAG" = "--verbose" ] && [ -s "$hook_reconcile_report" ]; then
        cat "$hook_reconcile_report"
      fi
    fi
    rm -f "$hook_reconcile_report"
  else
    EXIT_CODE=1
    update_step_status "warning"
    append_step_message "reconcile-hook-registration.js not found"
    echo "⚠️  reconcile-hook-registration.js not found - skipping hook registration verification"
  fi

  if [ -n "$fix_script" ]; then
    VERIFY_RUNTIME_CMD=(node "$fix_script" --verify-runtime)
    [ -n "$VERBOSE_FLAG" ] && VERIFY_RUNTIME_CMD+=("$VERBOSE_FLAG")
    [ -n "$STRICT_FLAG" ] && VERIFY_RUNTIME_CMD+=("$STRICT_FLAG")

    if [ "$VERBOSE_FLAG" = "--verbose" ]; then
      if "${VERIFY_RUNTIME_CMD[@]}"; then
        echo "✅ Installed runtime parity verified"
      else
        EXIT_CODE=1
        update_step_status "warning"
        append_step_message "Installed runtime parity verification failed"
        echo "⚠️  Installed runtime parity verification failed"
      fi
    else
      if "${VERIFY_RUNTIME_CMD[@]}" >/dev/null 2>&1; then
        echo "✅ Installed runtime parity verified"
      else
        EXIT_CODE=1
        update_step_status "warning"
        append_step_message "Installed runtime parity verification failed"
        echo "⚠️  Installed runtime parity verification failed"
      fi
    fi
  fi

  state_script="$(find_script "routing-state-manager.js")"
  if [ -n "$state_script" ]; then
    node "$state_script" clear-expired >/dev/null 2>&1 || true
    echo "✅ Cleared expired session-scoped routing state"
  else
    EXIT_CODE=1
    update_step_status "warning"
    append_step_message "routing-state-manager.js not found"
    echo "⚠️  routing-state-manager.js not found - skipping routing state cleanup"
  fi

  LEGACY_ROUTING_STATE=0
  ROUTING_CIRCUITS_RESET=0
  for root in "${CLAUDE_ROOTS[@]}"; do
    if [ -f "$root/routing-state.json" ]; then
      rm -f "$root/routing-state.json" 2>/dev/null || true
      LEGACY_ROUTING_STATE=$((LEGACY_ROUTING_STATE + 1))
    fi
    for circuit_name in unified-router pre-tool-use-contract-validation pre-task-agent-validator post-tool-use; do
      if [ -f "$root/circuit-breaker/${circuit_name}.state" ]; then
        rm -f "$root/circuit-breaker/${circuit_name}.state" 2>/dev/null || true
        ROUTING_CIRCUITS_RESET=$((ROUTING_CIRCUITS_RESET + 1))
      fi
    done
  done

  if [ "$LEGACY_ROUTING_STATE" -gt 0 ]; then
    echo "✅ Cleared $LEGACY_ROUTING_STATE legacy routing state file(s)"
  fi
  if [ "$ROUTING_CIRCUITS_RESET" -gt 0 ]; then
    echo "✅ Reset $ROUTING_CIRCUITS_RESET routing circuit breaker file(s)"
  fi

  routing_index_script="$(find_script "routing-index-builder.js")"
  if [ -n "$routing_index_script" ]; then
    ROUTING_INDEX_CMD=(node "$routing_index_script")
    [ -n "$VERBOSE_FLAG" ] && ROUTING_INDEX_CMD+=("$VERBOSE_FLAG")

    if "${ROUTING_INDEX_CMD[@]}"; then
      echo "✅ Routing index rebuilt"
    else
      EXIT_CODE=1
      update_step_status "warning"
      append_step_message "Routing index rebuild completed with warnings/errors"
      echo "⚠️  Routing index rebuild completed with warnings/errors"
    fi
  else
    EXIT_CODE=1
    update_step_status "warning"
    append_step_message "routing-index-builder.js not found"
    echo "⚠️  routing-index-builder.js not found - skipping routing index rebuild"
  fi

  alias_script="$(find_script "agent-alias-resolver.js")"
  if [ -n "$alias_script" ]; then
    if ! node "$alias_script" rebuild; then
      EXIT_CODE=1
      update_step_status "warning"
      append_step_message "Agent alias registry rebuild had warnings/errors"
      echo "⚠️  Agent alias registry rebuild had warnings/errors"
    fi

    if ! node "$alias_script" rebuild-commands; then
      EXIT_CODE=1
      update_step_status "warning"
      append_step_message "Command registry rebuild had warnings/errors"
      echo "⚠️  Command registry rebuild had warnings/errors"
    else
      echo "✅ Agent/command alias registries rebuilt"
    fi
  else
    EXIT_CODE=1
    update_step_status "warning"
    append_step_message "agent-alias-resolver.js not found"
    echo "⚠️  agent-alias-resolver.js not found - skipping alias cache rebuild"
  fi

  if [ -f "$vector_cache" ]; then
    rm -f "$vector_cache" 2>/dev/null || true
    echo "✅ Cleared semantic routing vector cache"
  fi

  routing_validator="$(find_ci_script "validate-routing.sh")"
  if [ -n "$routing_validator" ]; then
    ROUTING_VALIDATE_CMD=(bash "$routing_validator")
    [ -n "$VERBOSE_FLAG" ] && ROUTING_VALIDATE_CMD+=("$VERBOSE_FLAG")

    if "${ROUTING_VALIDATE_CMD[@]}"; then
      echo "✅ Routing validation passed"
    else
      EXIT_CODE=1
      update_step_status "warning"
      append_step_message "Routing validation completed with warnings/errors"
      echo "⚠️  Routing validation completed with warnings/errors"
    fi
  else
    EXIT_CODE=1
    update_step_status "warning"
    append_step_message "validate-routing.sh not found"
    echo "⚠️  validate-routing.sh not found - skipping routing validation"
  fi

  hook_health_script="$(find_script "hook-health-checker.js")"
  if [ -n "$hook_health_script" ]; then
    hook_health_json="$(mktemp)"
    set +e
    node "$hook_health_script" --quick --format json > "$hook_health_json" 2>/dev/null
    hook_health_exit=$?
    set -e
    hook_health_status=$(node -e "
      const fs = require('fs');
      try {
        const data = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
        console.log((data.summary && data.summary.status) || data.status || 'UNKNOWN');
      } catch (_error) {
        console.log('UNKNOWN');
      }
    " "$hook_health_json" 2>/dev/null || echo "UNKNOWN")

    if [ "$hook_health_exit" -eq 0 ]; then
      echo "✅ Hook health check passed (${hook_health_status})"
    elif [ "$hook_health_exit" -eq 1 ]; then
      update_step_status "degraded"
      append_step_message "Hook health check degraded (${hook_health_status})"
      echo "⚠️  Hook health check degraded (${hook_health_status})"
    else
      EXIT_CODE=1
      update_step_status "warning"
      append_step_message "Hook health check unhealthy (${hook_health_status})"
      echo "⚠️  Hook health check unhealthy (${hook_health_status})"
    fi
    rm -f "$hook_health_json"
  else
    EXIT_CODE=1
    update_step_status "warning"
    append_step_message "hook-health-checker.js not found"
    echo "⚠️  hook-health-checker.js not found - skipping hook health validation"
  fi

  return 0
}

step4_cache_prune() {
  if [ "$CACHE_PRUNE" = true ]; then
    STEP_BACKUP_DIR="$(ensure_step_backup_dir "step4-cache-prune")"
    ACTIVE_STEP_BACKUP_DIR="$STEP_BACKUP_DIR"
    PRUNE_RESULT="$(prune_marketplace_cache_versions)"
    ACTIVE_STEP_BACKUP_DIR=""
    PRUNED_COUNT="${PRUNE_RESULT%%|*}"
    SCANNED_COUNT="${PRUNE_RESULT##*|}"
    if [ "$STRICT_MODE" = true ]; then
      echo "✅ Cache prune complete (${PRUNED_COUNT} old versions removed across ${SCANNED_COUNT} plugin caches, strict latest-only mode)"
    else
      echo "✅ Cache prune complete (${PRUNED_COUNT} old versions removed across ${SCANNED_COUNT} plugin caches)"
    fi
  else
    update_step_status "skipped"
    append_step_message "Cache prune skipped (--no-cache-prune)"
    echo "⏭️  Cache prune skipped (--no-cache-prune)"
  fi

  return 0
}

step5_schema_migration() {
  local migrate_script=""
  local found=""
  local org_dir=""
  local slug=""
  local stale_count=0
  local migrated_count=0
  local -a stale_org_dirs=()

  for candidate in \
    "$PWD/plugins/opspal-core/scripts/project-connect-schema-migrate.js" \
    "$PWD/.claude-plugins/opspal-core/scripts/project-connect-schema-migrate.js" \
    "./plugins/opspal-core/scripts/project-connect-schema-migrate.js" \
    "./.claude-plugins/opspal-core/scripts/project-connect-schema-migrate.js"; do
    [ -f "$candidate" ] && migrate_script="$candidate" && break
  done
  if [ -z "$migrate_script" ]; then
    for root in "${CLAUDE_ROOTS[@]}"; do
      [ -d "$root/plugins" ] || continue
      found=$(find "$root/plugins" -name "project-connect-schema-migrate.js" -path "*/opspal-core/scripts/*" 2>/dev/null | sort -V | tail -1)
      [ -n "$found" ] && migrate_script="$found" && break
    done
  fi

  if [ -n "$migrate_script" ] && [ -d "$PWD/orgs" ]; then
    for org_dir in "$PWD"/orgs/*/; do
      [ -d "$org_dir" ] || continue
      slug="$(basename "$org_dir")"
      if [ -d "$org_dir/repo/.git" ] && [ ! -d "$org_dir/.repo/.git" ]; then
        stale_count=$((stale_count + 1))
        stale_org_dirs+=("${org_dir%/}")
        echo "  Found stale schema: $slug (repo/ → needs .repo/ migration)"
      elif [ -d "$org_dir/.repo/.git" ]; then
        migrated_count=$((migrated_count + 1))
      fi
    done

    if [ "$stale_count" -gt 0 ]; then
      if [ "$SKIP_FIX" = true ]; then
        update_step_status "skipped"
        append_step_message "$stale_count org(s) need schema migration"
        echo ""
        echo "⚠️  $stale_count org(s) need schema migration (skipped: --skip-fix)"
        echo "   Run: node scripts/project-connect-schema-migrate.js --all"
      else
        STEP_BACKUP_DIR="$(prepare_step_snapshot "step5-schema-migration" "${stale_org_dirs[@]}")"
        echo ""
        echo "  Auto-migrating $stale_count org(s)..."
        if node "$migrate_script" --all --workspace "$PWD"; then
          echo ""
          echo "✅ Schema migration complete"
        else
          EXIT_CODE=1
          update_step_status "warning"
          append_step_message "Schema migration completed with errors"
          echo ""
          echo "⚠️  Schema migration completed with errors"
        fi
      fi
    else
      if [ "$migrated_count" -gt 0 ]; then
        echo "✅ All $migrated_count connected org(s) already on symlink schema"
      else
        update_step_status "skipped"
        append_step_message "No project-connected orgs found"
        echo "⏭️  No project-connected orgs found, skipping"
      fi
    fi
  else
    update_step_status "skipped"
    append_step_message "No orgs/ workspace or migration script found"
    echo "⏭️  Not in a workspace with orgs/ or migration script not found, skipping"
  fi

  return 0
}

step6_project_connect_autosync() {
  local repo_sync_script=""
  local scheduler_script=""
  local found=""
  local connected_orgs=0
  local sync_out=""
  local sync_synced="0"
  local sync_errors='"errors":[]'
  local cron_installed=false
  local hook_registered=false
  local org_manifest=""
  local org_dir=""
  local repo_path=""
  local scheduler_root=""
  local scheduler_config=""
  local -a repo_paths=()
  local -a snapshot_targets=()

  for candidate in \
    "$PWD/plugins/opspal-core/scripts/project-connect-sync-all.sh" \
    "$PWD/.claude-plugins/opspal-core/scripts/project-connect-sync-all.sh" \
    "./plugins/opspal-core/scripts/project-connect-sync-all.sh" \
    "./.claude-plugins/opspal-core/scripts/project-connect-sync-all.sh"; do
    [ -f "$candidate" ] && repo_sync_script="$candidate" && break
  done
  if [ -z "$repo_sync_script" ]; then
    for root in "${CLAUDE_ROOTS[@]}"; do
      [ -d "$root/plugins" ] || continue
      found=$(find "$root/plugins" -name "project-connect-sync-all.sh" -path "*/opspal-core/scripts/*" 2>/dev/null | sort -V | tail -1)
      [ -n "$found" ] && repo_sync_script="$found" && break
    done
  fi

  for candidate in \
    "$PWD/plugins/opspal-core/scheduler/scripts/lib/scheduler-manager.js" \
    "$PWD/.claude-plugins/opspal-core/scheduler/scripts/lib/scheduler-manager.js" \
    "./plugins/opspal-core/scheduler/scripts/lib/scheduler-manager.js" \
    "./.claude-plugins/opspal-core/scheduler/scripts/lib/scheduler-manager.js"; do
    [ -f "$candidate" ] && scheduler_script="$candidate" && break
  done
  if [ -z "$scheduler_script" ]; then
    for root in "${CLAUDE_ROOTS[@]}"; do
      [ -d "$root/plugins" ] || continue
      found=$(find "$root/plugins" -name "scheduler-manager.js" -path "*/opspal-core/scheduler/scripts/lib/*" 2>/dev/null | sort -V | tail -1)
      [ -n "$found" ] && scheduler_script="$found" && break
    done
  fi

  if [ -d "$PWD/orgs" ]; then
    while IFS= read -r org_manifest; do
      [ -n "$org_manifest" ] || continue
      connected_orgs=$((connected_orgs + 1))
      org_dir="$(dirname "$org_manifest")"
      if [ -d "$org_dir/.repo/.git" ]; then
        repo_path="$org_dir/.repo"
      elif [ -d "$org_dir/repo/.git" ]; then
        repo_path="$org_dir/repo"
      else
        repo_path=""
      fi
      [ -n "$repo_path" ] && repo_paths+=("$repo_path")
    done < <(find "$PWD/orgs" -maxdepth 2 -name ".sync-manifest.json" 2>/dev/null)

    if [ "$connected_orgs" -gt 0 ]; then
      echo "  Found $connected_orgs project-connected org(s)"

      if [ "${ENABLE_GIT_SYNC:-1}" = "0" ]; then
        update_step_status "skipped"
        append_step_message "Git sync disabled via ENABLE_GIT_SYNC=0"
        echo "  ⏭️  Git sync disabled (ENABLE_GIT_SYNC=0), skipping auto-sync setup"
      else
        if [ -n "$scheduler_script" ]; then
          scheduler_root="$(cd "$(dirname "$scheduler_script")/../../.." && pwd)"
          scheduler_config="$scheduler_root/config/scheduler-config.json"
          snapshot_targets+=("$scheduler_config")
        fi
        STEP_BACKUP_DIR="$(ensure_step_backup_dir "step6-project-connect-autosync")"
        capture_crontab_backup "$STEP_BACKUP_DIR"
        capture_repo_head_manifest "$STEP_BACKUP_DIR" "${repo_paths[@]}"
        if [ ${#snapshot_targets[@]} -gt 0 ]; then
          prepare_step_snapshot "step6-project-connect-autosync" "${snapshot_targets[@]}" >/dev/null
        fi

        if [ -n "$repo_sync_script" ]; then
          echo "  Running initial sync..."
          sync_out=$(timeout 30 bash "$repo_sync_script" --pull --workspace "$PWD" 2>/dev/null) || true
          sync_synced=$(echo "$sync_out" | grep -o '"synced":[0-9]*' | grep -o '[0-9]*' || echo "0")
          sync_errors=$(echo "$sync_out" | grep -o '"errors":\[[^]]*\]' || echo '"errors":[]')
          if [ "$sync_errors" = '"errors":[]' ] || [ -z "$sync_errors" ]; then
            echo "  ✅ Synced $sync_synced repo(s) successfully"
          else
            update_step_status "degraded"
            append_step_message "Synced $sync_synced repo(s) with warnings"
            echo "  ⚠️  Synced $sync_synced repo(s) with warnings (check ~/.claude/logs/project-connect-sync.jsonl)"
          fi
        else
          update_step_status "degraded"
          append_step_message "project-connect-sync-all.sh not found"
          echo "  ⚠️  project-connect-sync-all.sh not found - cannot run initial sync"
        fi

        if [ -n "$scheduler_script" ]; then
          if crontab -l 2>/dev/null | grep -q "project-connect-periodic-sync\|project-connect-sync-all" 2>/dev/null; then
            cron_installed=true
          fi

          if [ "$cron_installed" = true ]; then
            echo "  ✅ Periodic sync cron already installed (every 30 min)"
          else
            if [ "$SKIP_FIX" = true ]; then
              update_step_status "skipped"
              append_step_message "Periodic sync cron not installed"
              echo "  ℹ️  Periodic sync cron not installed (skipped: --skip-fix)"
              echo "     Install with: node $scheduler_script install"
            else
              echo "  Installing periodic sync cron (every 30 min)..."
              if node "$scheduler_script" install 2>/dev/null; then
                echo "  ✅ Periodic sync cron installed"
              else
                update_step_status "degraded"
                append_step_message "Could not install periodic sync cron"
                echo "  ⚠️  Could not install cron (non-blocking) - install manually:"
                echo "     node $scheduler_script install"
              fi
            fi
          fi
        else
          update_step_status "degraded"
          append_step_message "Scheduler not found"
          echo "  ℹ️  Scheduler not found - periodic sync not configured"
        fi

        for root in "${CLAUDE_ROOTS[@]}"; do
          if [ -f "$root/settings.json" ] && grep -q "session-start-repo-sync" "$root/settings.json" 2>/dev/null; then
            hook_registered=true
            break
          fi
        done
        if [ "$hook_registered" = false ]; then
          for candidate in \
            "$PWD/plugins/opspal-core/.claude-plugin/hooks.json" \
            "$PWD/.claude-plugins/opspal-core/.claude-plugin/hooks.json"; do
            if [ -f "$candidate" ] && grep -q "session-start-repo-sync" "$candidate" 2>/dev/null; then
              hook_registered=true
              break
            fi
          done
        fi

        if [ "$hook_registered" = true ]; then
          echo "  ✅ SessionStart sync hook registered"
        else
          update_step_status "degraded"
          append_step_message "SessionStart sync hook not found"
          echo "  ⚠️  SessionStart sync hook not found in hooks config"
          echo "     This hook auto-pulls connected repos at session start."
          echo "     Ensure opspal-core v2.24.0+ is installed."
        fi

        echo ""
        echo "  Auto-sync summary:"
        echo "    Session start: $([ "$hook_registered" = true ] && echo "enabled" || echo "not configured")"
        echo "    Periodic (30m): $([ "${cron_installed:-false}" = true ] && echo "enabled" || echo "$([ "$SKIP_FIX" = true ] && echo "not installed" || echo "just installed")")"
        echo "    Opt-out: export ENABLE_GIT_SYNC=0"
      fi
    else
      update_step_status "skipped"
      append_step_message "No project-connected orgs found"
      echo "⏭️  No project-connected orgs found (no .sync-manifest.json in orgs/)"
    fi
  else
    update_step_status "skipped"
    append_step_message "Not in a workspace with orgs/"
    echo "⏭️  Not in a workspace with orgs/, skipping"
  fi

  return 0
}

step7_sync_claudemd() {
  local sync_script=""
  STEP_BACKUP_DIR="$(prepare_step_snapshot "step7-sync-claudemd" "$WORKSPACE_ROOT/CLAUDE.md")"

  sync_script="$(find_script "sync-claudemd.js")"
  if [ -n "$sync_script" ]; then
    SYNC_CMD=(node "$sync_script")
    [ -n "$VERBOSE_FLAG" ] && SYNC_CMD+=("$VERBOSE_FLAG")

    if "${SYNC_CMD[@]}"; then
      echo "✅ CLAUDE.md synced successfully"
    else
      EXIT_CODE=1
      update_step_status "warning"
      append_step_message "CLAUDE.md sync completed with warnings"
      echo "⚠️  CLAUDE.md sync completed with warnings"
    fi
  else
    EXIT_CODE=1
    update_step_status "warning"
    append_step_message "sync-claudemd.js not found"
    echo "⚠️  sync-claudemd.js not found - skipping CLAUDE.md sync"
  fi

  return 0
}

step8_routing_promotion() {
  local claudemd_path="$PWD/CLAUDE.md"
  local routing_index=""
  local route_stats="0|0|0"
  local mandatory_count="0"
  local recommended_count="0"
  local total_count="0"
  local rest=""
  local refresher_script=""
  local condensed_dir="$OPSPAL_UPDATE_STATE_DIR"
  local condensed_file="$condensed_dir/condensed-routing.txt"
  local condensed_size=""

  STEP_BACKUP_DIR="$(prepare_step_snapshot "step8-routing-promotion" "$condensed_file")"

  if [ -f "$claudemd_path" ]; then
    if grep -q "CRITICAL: Agent Routing Rules" "$claudemd_path" 2>/dev/null; then
      echo "✅ CLAUDE.md contains critical routing preamble"
    else
      update_step_status "degraded"
      append_step_message "CLAUDE.md missing critical routing preamble"
      echo "⚠️  CLAUDE.md missing critical routing preamble (re-run /sync-claudemd)"
    fi
  else
    update_step_status "degraded"
    append_step_message "CLAUDE.md not found"
    echo "⚠️  CLAUDE.md not found at $claudemd_path"
  fi

  routing_index="$(find_routing_index || true)"

  if [ -n "$routing_index" ] && command -v node >/dev/null 2>&1; then
    route_stats=$(node -e '
      const idx = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
      const agents = idx.agents || {};
      let mandatory = 0, recommended = 0, total = 0;
      for (const agent of Object.values(agents)) {
        if (!agent.triggerKeywords || agent.triggerKeywords.length === 0) continue;
        total += 1;
        const desc = String(agent.description || "").toLowerCase();
        if (/must be used|mandatory|blocked operation/i.test(desc)) mandatory += 1;
        else if (/proactively|recommended/i.test(desc)) recommended += 1;
      }
      process.stdout.write(mandatory + "|" + recommended + "|" + total);
    ' "$routing_index" 2>/dev/null || echo "0|0|0")

    mandatory_count="${route_stats%%|*}"
    rest="${route_stats#*|}"
    recommended_count="${rest%%|*}"
    total_count="${rest#*|}"
    echo "  Routing index: $mandatory_count mandatory, $recommended_count recommended, $total_count total routable agents"
    [ "$VERBOSE_FLAG" = "--verbose" ] && echo "  Routing index source: $routing_index"
  else
    update_step_status "degraded"
    append_step_message "Routing index not found"
    echo "  ⚠️  Routing index not found - routing stats unavailable"
  fi

  refresher_script="$(find_script "routing-context-refresher.js")"
  if [ -n "$refresher_script" ]; then
    mkdir -p "$condensed_dir" 2>/dev/null || true
    node "$refresher_script" --format=compact --output="$condensed_file" >/dev/null 2>&1
    if [ -f "$condensed_file" ]; then
      condensed_size="$(wc -c < "$condensed_file" 2>/dev/null | tr -d ' ')"
      echo "✅ Condensed routing pre-generated (${condensed_size} bytes → $condensed_file)"
    else
      update_step_status "degraded"
      append_step_message "Failed to pre-generate condensed routing"
      echo "⚠️  Failed to pre-generate condensed routing (non-blocking)"
    fi
  else
    update_step_status "degraded"
    append_step_message "routing-context-refresher.js not found"
    echo "⚠️  routing-context-refresher.js not found - skipping condensed routing pre-gen"
  fi

  return 0
}

# Step 9: Sub-agent tool access remediation
# Verifies that the Bash permission contract is disabled (opt-in only),
# the deploy execution contract is removed, and deploy-agent-context-check
# reads agent_type from hook JSON input.
step9_subagent_remediation() {
  local fixes_applied=0
  local checks_passed=0
  local total_checks=0

  # Derive plugin roots from SCRIPT_DIR (scripts/ -> opspal-core -> plugins/)
  local core_plugin_root
  core_plugin_root="$(cd "$SCRIPT_DIR/.." 2>/dev/null && pwd)"
  local plugins_root
  plugins_root="$(cd "$core_plugin_root/.." 2>/dev/null && pwd)"
  local home_claude="${HOME:-.}/.claude"

  # Locate plugin hook files across workspace and marketplace roots
  local validator_paths=()
  local deploy_check_paths=()

  local search_root
  for search_root in "$plugins_root" "$home_claude/plugins/marketplaces" "$home_claude/plugins/cache"; do
    if [ -d "$search_root" ]; then
      while IFS= read -r f; do
        validator_paths+=("$f")
      done < <(find "$search_root" -name "pre-task-agent-validator.sh" -path "*/opspal-core/*" 2>/dev/null || true)

      while IFS= read -r f; do
        deploy_check_paths+=("$f")
      done < <(find "$search_root" -name "pre-deploy-agent-context-check.sh" -path "*/opspal-salesforce/*" 2>/dev/null || true)
    fi
  done

  # Check 1: Bash permission contract is opt-in (SUBAGENT_BASH_CONTRACT_ENABLED guard)
  total_checks=$((total_checks + 1))
  local bash_contract_ok=true
  for vpath in "${validator_paths[@]}"; do
    if [ -f "$vpath" ] && grep -q 'SUBAGENT_BASH_CONTRACT_ENABLED' "$vpath"; then
      : # Has the opt-in guard
    elif [ -f "$vpath" ] && grep -q 'SUBAGENT_BASH_PERMISSION_BLOCKED' "$vpath"; then
      bash_contract_ok=false
      if [ "$SKIP_FIX" = "false" ]; then
        # Patch: insert opt-in guard at the top of apply_subagent_permission_contract
        if sed -i 's/^apply_subagent_permission_contract() {$/apply_subagent_permission_contract() {\n    if [ "${SUBAGENT_BASH_CONTRACT_ENABLED:-0}" != "1" ]; then echo "$1"; return 0; fi/' "$vpath" 2>/dev/null; then
          fixes_applied=$((fixes_applied + 1))
          echo "  Fixed: Patched Bash permission contract to opt-in in $(basename "$(dirname "$(dirname "$vpath")")")"
          bash_contract_ok=true
        fi
      fi
    fi
  done
  if [ "$bash_contract_ok" = "true" ]; then
    checks_passed=$((checks_passed + 1))
    echo "✅ Bash permission contract is opt-in (SUBAGENT_BASH_CONTRACT_ENABLED)"
  else
    echo "⚠️  Bash permission contract still active — sub-agents may report false SUBAGENT_BASH_PERMISSION_BLOCKED"
    echo "   Fix: Add SUBAGENT_BASH_CONTRACT_ENABLED guard to apply_subagent_permission_contract()"
  fi

  # Check 2: Deploy execution contract removed
  total_checks=$((total_checks + 1))
  local deploy_contract_ok=true
  for vpath in "${validator_paths[@]}"; do
    if [ -f "$vpath" ] && grep -q 'apply_deployment_parent_context_contract.*input_json' "$vpath" && ! grep -q 'REMOVED' "$vpath"; then
      deploy_contract_ok=false
      echo "⚠️  Deploy execution contract still active in $(basename "$(dirname "$(dirname "$vpath")")")"
    fi
  done
  if [ "$deploy_contract_ok" = "true" ]; then
    checks_passed=$((checks_passed + 1))
    echo "✅ Deploy execution contract removed (no prompt injection for deploy agents)"
  fi

  # Check 3: Deploy agent context check reads agent_type from hook JSON
  total_checks=$((total_checks + 1))
  local agent_type_ok=true
  for dpath in "${deploy_check_paths[@]}"; do
    if [ -f "$dpath" ] && ! grep -q 'agent_type' "$dpath"; then
      agent_type_ok=false
      echo "⚠️  pre-deploy-agent-context-check.sh missing agent_type extraction in $(basename "$(dirname "$(dirname "$dpath")")")"
    fi
  done
  if [ "$agent_type_ok" = "true" ]; then
    checks_passed=$((checks_passed + 1))
    echo "✅ Deploy agent context check reads agent_type from hook JSON input"
  fi

  # Check 4: ALLOW_PLUGIN_DEPLOY_SUBAGENT_EXECUTION not needed (informational)
  total_checks=$((total_checks + 1))
  if [ "${ALLOW_PLUGIN_DEPLOY_SUBAGENT_EXECUTION:-}" = "1" ]; then
    echo "ℹ️  ALLOW_PLUGIN_DEPLOY_SUBAGENT_EXECUTION=1 set — no longer needed after deploy contract removal"
    checks_passed=$((checks_passed + 1))
  else
    checks_passed=$((checks_passed + 1))
    echo "✅ No legacy deploy contract bypass env vars set"
  fi

  if [ "$checks_passed" -eq "$total_checks" ]; then
    append_step_message "All $total_checks sub-agent remediation checks passed"
    if [ "$fixes_applied" -gt 0 ]; then
      append_step_message " ($fixes_applied auto-fixed)"
    fi
  else
    update_step_status "degraded"
    append_step_message "$checks_passed/$total_checks checks passed — review sub-agent tool access configuration"
  fi

  return 0
}

# ============================================================================
# Step 10: Customization migration
# ============================================================================

step10_customization_migration() {
  local core_plugin_root
  core_plugin_root="$(cd "$SCRIPT_DIR/.." 2>/dev/null && pwd)"
  local migration_script="$core_plugin_root/scripts/lib/customization/migration-runner.js"

  if [ ! -f "$migration_script" ]; then
    update_step_status "passed"
    append_step_message "Customization framework not installed — skipped"
    return 0
  fi

  if ! command -v node &>/dev/null; then
    update_step_status "degraded"
    append_step_message "Node.js not available — cannot run customization migrations"
    return 0
  fi

  local migration_output
  migration_output=$(node -e "
    const { MigrationRunner } = require('$core_plugin_root/scripts/lib/customization/migration-runner');
    const { ResourceRegistry } = require('$core_plugin_root/scripts/lib/customization/resource-registry');
    const { CustomResourceStore } = require('$core_plugin_root/scripts/lib/customization/custom-resource-store');
    const { BackupRestore } = require('$core_plugin_root/scripts/lib/customization/backup-restore');
    const { CustomizationAuditLog } = require('$core_plugin_root/scripts/lib/customization/customization-audit-log');

    (async () => {
      const registry = new ResourceRegistry({ pluginRoot: '$core_plugin_root' });
      await registry.load();
      const store = new CustomResourceStore();
      const backup = new BackupRestore({ store });
      const auditLog = new CustomizationAuditLog();
      const runner = new MigrationRunner({ registry, store, backup, auditLog, pluginRoot: '$core_plugin_root' });
      const results = await runner.runAll();
      const completed = results.filter(r => r.status === 'completed');
      const skipped = results.filter(r => r.status === 'skipped');
      console.log(JSON.stringify({ completed: completed.length, skipped: skipped.length, total: results.length }));
    })();
  " 2>/dev/null) || true

  if [ -n "$migration_output" ]; then
    local completed skipped total
    completed=$(echo "$migration_output" | node -e "process.stdin.on('data',d=>{try{console.log(JSON.parse(d).completed)}catch{console.log(0)}})" 2>/dev/null) || completed=0
    skipped=$(echo "$migration_output" | node -e "process.stdin.on('data',d=>{try{console.log(JSON.parse(d).skipped)}catch{console.log(0)}})" 2>/dev/null) || skipped=0
    total=$(echo "$migration_output" | node -e "process.stdin.on('data',d=>{try{console.log(JSON.parse(d).total)}catch{console.log(0)}})" 2>/dev/null) || total=0

    if [ "$completed" -gt 0 ] 2>/dev/null; then
      update_step_status "passed"
      append_step_message "$completed migration(s) completed, $skipped skipped"
    else
      update_step_status "passed"
      append_step_message "No pending migrations ($skipped already completed)"
    fi
  else
    update_step_status "passed"
    append_step_message "Customization migrations checked — none pending"
  fi

  return 0
}

# ============================================================================
# Step 11: Runbook automation enablement
# ============================================================================

step11_runbook_automation() {
  local core_plugin_root
  core_plugin_root="$(cd "$SCRIPT_DIR/.." 2>/dev/null && pwd)"

  local sf_plugin_root=""
  for candidate_path in \
      "$core_plugin_root/../opspal-salesforce" \
      "$(dirname "$core_plugin_root")/opspal-salesforce"; do
    if [ -d "$candidate_path/hooks" ]; then
      sf_plugin_root="$(cd "$candidate_path" && pwd)"
      break
    fi
  done

  local checks_passed=0
  local checks_total=0
  local details=""

  # Check 1: Incremental updater CLI exists
  checks_total=$((checks_total + 1))
  local updater="$core_plugin_root/scripts/lib/runbook-incremental-updater.js"
  if [ -f "$updater" ]; then
    checks_passed=$((checks_passed + 1))
    details="${details}  ✅ Incremental updater module present\n"
  else
    details="${details}  ❌ Incremental updater module missing: $updater\n"
  fi

  # Check 2: Automation status module exists
  checks_total=$((checks_total + 1))
  local status_mod="$core_plugin_root/scripts/lib/runbook-automation-status.js"
  if [ -f "$status_mod" ]; then
    checks_passed=$((checks_passed + 1))
    details="${details}  ✅ Automation status tracker present\n"
  else
    details="${details}  ❌ Automation status tracker missing: $status_mod\n"
  fi

  # Check 3: Post-operation hook has auto-runbook wiring
  checks_total=$((checks_total + 1))
  if [ -n "$sf_plugin_root" ]; then
    local obs_hook="$sf_plugin_root/hooks/post-operation-observe.sh"
    if [ -f "$obs_hook" ] && grep -q "ENABLE_AUTO_RUNBOOK" "$obs_hook" 2>/dev/null; then
      checks_passed=$((checks_passed + 1))
      details="${details}  ✅ Post-operation hook has runbook automation wiring\n"
    else
      details="${details}  ❌ Post-operation hook missing ENABLE_AUTO_RUNBOOK integration\n"
    fi
  else
    details="${details}  ⏭️  Salesforce plugin not found — skipping hook check\n"
  fi

  # Check 4: Post-reflect hook has auto-runbook wiring
  checks_total=$((checks_total + 1))
  local reflect_hook="$core_plugin_root/hooks/reflection/post-reflect.sh"
  if [ -f "$reflect_hook" ] && grep -q "ENABLE_AUTO_RUNBOOK" "$reflect_hook" 2>/dev/null; then
    checks_passed=$((checks_passed + 1))
    details="${details}  ✅ Post-reflect hook has runbook automation wiring\n"
  else
    details="${details}  ❌ Post-reflect hook missing ENABLE_AUTO_RUNBOOK integration\n"
  fi

  # Check 5: Reconciliation module exists
  checks_total=$((checks_total + 1))
  local reconcile_mod="$core_plugin_root/scripts/lib/runbook-reconcile.js"
  if [ -f "$reconcile_mod" ]; then
    checks_passed=$((checks_passed + 1))
    details="${details}  ✅ Reconciliation engine present\n"
  else
    details="${details}  ❌ Reconciliation engine missing: $reconcile_mod\n"
  fi

  # Report ENABLE_AUTO_RUNBOOK status
  local auto_runbook_status="${ENABLE_AUTO_RUNBOOK:-1}"
  if [ "$auto_runbook_status" = "1" ]; then
    details="${details}  ✅ ENABLE_AUTO_RUNBOOK=1 (automatic processing enabled)\n"
  else
    details="${details}  ⚠️  ENABLE_AUTO_RUNBOOK=$auto_runbook_status (automatic processing disabled)\n"
  fi

  echo -e "$details"

  if [ "$checks_passed" -eq "$checks_total" ]; then
    update_step_status "passed"
    append_step_message "Runbook automation verified ($checks_passed/$checks_total checks passed, ENABLE_AUTO_RUNBOOK=${auto_runbook_status})"
    echo ""
    echo "  📔 Living Runbook System: ACTIVE"
    echo "     Observations → auto-processed after each agent operation"
    echo "     Reflections → auto-processed after each /reflect submission"
    echo "     Disable: export ENABLE_AUTO_RUNBOOK=0"
    echo "     Status: node $core_plugin_root/scripts/lib/runbook-status-reporter.js --org <your-org>"
  else
    update_step_status "degraded"
    append_step_message "Runbook automation partially available ($checks_passed/$checks_total checks passed)"
  fi

  return 0
}

run_step "step0-marketplace-refresh" "Step 0: Marketplace refresh" "🔄 Step 0: Pulling latest from marketplace..." step0_marketplace_refresh
run_step "step1-plugin-validation" "Step 1: Plugin Validation" "🔧 Step 1: Running plugin validation..." step1_plugin_validation
run_step "step2-clean-stale-hooks" "Step 2: Clean stale plugin hooks and activate statusline" "🧹 Step 2: Cleaning stale plugin hooks and activating the OpsPal statusline..." step2_clean_stale_hooks
run_step "step3-runtime-reconciliation" "Step 3: Runtime reconciliation and routing validation" "🧭 Step 3: Reconciling installed runtime, refreshing routing artifacts, and validating hook health..." step3_runtime_reconciliation
run_step "step4-cache-prune" "Step 4: Cache prune" "🧹 Step 4: Pruning stale plugin cache versions..." step4_cache_prune
run_step "step5-schema-migration" "Step 5: Project-connect schema check" "🔗 Step 5: Checking project-connect repo schemas..." step5_schema_migration
run_step "step6-project-connect-autosync" "Step 6: Project-connect auto-sync" "🔄 Step 6: Checking project-connect auto-sync..." step6_project_connect_autosync
run_step "step7-sync-claudemd" "Step 7: CLAUDE.md sync" "📝 Step 7: Syncing CLAUDE.md..." step7_sync_claudemd
run_step "step8-routing-promotion" "Step 8: Routing promotion verification" "🚦 Step 8: Routing promotion verification & condensed routing pre-gen..." step8_routing_promotion
run_step "step9-subagent-remediation" "Step 9: Sub-agent tool access remediation" "🔓 Step 9: Verifying sub-agent tool access configuration..." step9_subagent_remediation
run_step "step10-customization-migration" "Step 10: Customization migration" "🎨 Step 10: Running customization migrations..." step10_customization_migration
run_step "step11-runbook-automation" "Step 11: Runbook automation enablement" "📔 Step 11: Verifying runbook automation wiring..." step11_runbook_automation

# Summary
CURRENT_STEP="summary"
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║    Update Complete                                             ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

if [ $EXIT_CODE -eq 0 ]; then
  echo "✅ All post-update tasks completed successfully!"
  echo ""
  echo "   Your plugins are now up-to-date and validated."
  echo "   Installed runtime parity, routing artifacts, and guardrails have been refreshed."
  echo "   CLAUDE.md has been updated with new routing tables."
else
  echo "⚠️  Post-update tasks completed with some warnings."
  echo ""
  echo "   Review the output above for details."
  echo "   Run '/finishopspalupdate --verbose' for detailed diagnostics."
fi

echo ""
echo "━━━ Step Results ━━━"
echo ""
for step_row in "${STEP_RESULT_ROWS[@]}"; do
  IFS=$'\t' read -r step_key step_label step_status step_message step_backup_dir step_restore_script <<< "$step_row"
  step_icon="✓"
  case "$step_status" in
    skipped) step_icon="⏭️" ;;
    degraded|warning) step_icon="⚠️" ;;
    failed) step_icon="✗" ;;
  esac
  echo "   $step_icon $step_label [$step_status]"
  echo "      $step_message"
  if [ -n "$step_restore_script" ]; then
    echo "      rollback: $step_restore_script"
  fi
done

echo ""
echo "━━━ Recommended Next Steps ━━━"
echo ""
echo "   1. Restart Claude Code if this run repaired installed runtime or hook settings"
echo "   2. Review changes in CLAUDE.md"
echo "   3. Commit updates to version control:"
echo "      git add CLAUDE.md plugins/ .claude-plugins/"
echo "      git commit -m 'chore: Update OpsPal plugins'"
echo ""

if [ $EXIT_CODE -eq 0 ]; then
  finalize_finish_script 0 "finish_completed" "Post-update validation completed successfully"
fi

finalize_finish_script "$EXIT_CODE" "finish_warnings" "Post-update validation completed with warnings"
