#!/usr/bin/env bash
#
# opspal-update-manager.sh - Force refresh marketplace and update all OpsPal plugins
#
# Usage:
#   ./opspal-update-manager.sh [--dry-run] [--skip-confirm] [--only plugin1,plugin2] [--mode external|manual|legacy]
#
# This script:
# 1. Lists all installed OpsPal-related plugins
# 2. Stores current versions for comparison
# 3. Generates a nested-session-safe execution plan (default) or runs legacy direct updates
# 4. Reinstalls from marketplace (pulls latest version) when legacy mode is explicitly selected
# 5. Reports version changes
# 6. Logs update history to ~/.claude/logs/opspal-updates.jsonl
#

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
BOLD='\033[1m'

# Update history log file
UPDATE_LOG_DIR="$HOME/.claude/logs"
UPDATE_LOG_FILE="$UPDATE_LOG_DIR/opspal-updates.jsonl"

# Parse arguments
DRY_RUN=false
SKIP_CONFIRM=false
VERBOSE=false
ONLY_PLUGINS=""
SHOW_HISTORY=false
EXECUTION_MODE="${OPSPAL_UPDATE_MODE:-external}"
EMIT_SCRIPT_ONLY=false
ALLOW_IN_SESSION_LEGACY="${OPSPAL_UPDATE_ALLOW_IN_SESSION_CLAUDE_CLI:-0}"

SCRIPT_ABS_PATH="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")"

while [[ $# -gt 0 ]]; do
  case $1 in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --skip-confirm)
      SKIP_CONFIRM=true
      shift
      ;;
    --verbose)
      VERBOSE=true
      shift
      ;;
    --only)
      ONLY_PLUGINS="$2"
      shift 2
      ;;
    --only=*)
      ONLY_PLUGINS="${1#*=}"
      shift
      ;;
    --history)
      SHOW_HISTORY=true
      shift
      ;;
    --mode)
      EXECUTION_MODE="$2"
      shift 2
      ;;
    --mode=*)
      EXECUTION_MODE="${1#*=}"
      shift
      ;;
    --emit-script-only)
      EMIT_SCRIPT_ONLY=true
      shift
      ;;
    --help)
      echo "Usage: $0 [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  --dry-run              Show what would be done without making changes"
      echo "  --skip-confirm         Skip confirmation prompt"
      echo "  --verbose              Show detailed output"
      echo "  --only <plugins>       Only update specified plugins (comma-separated)"
      echo "                         Example: --only salesforce-plugin,opspal-core"
      echo "  --history              Show recent update history"
      echo "  --mode <mode>          Update execution mode: external (default), manual, legacy"
      echo "                         external = generate host-terminal runner script"
      echo "                         manual   = print exact commands to run yourself"
      echo "                         legacy   = run claude plugin install/uninstall directly"
      echo "  --emit-script-only     Only print generated runner path (external mode)"
      echo ""
      echo "Examples:"
      echo "  $0                           # Generate external runner for all plugins"
      echo "  $0 --dry-run                 # Preview what would be updated"
      echo "  $0 --only opspal-salesforce  # Update only opspal-salesforce"
      echo "  $0 --only salesforce-plugin,opspal-core --skip-confirm"
      echo "  $0 --mode manual             # Print exact commands to run manually"
      echo "  $0 --mode legacy             # Direct update (host terminal only)"
      echo "  $0 --history                 # Show last 10 updates"
      echo ""
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      echo "Use --help for usage information"
      exit 1
      ;;
  esac
done

validate_execution_mode() {
  case "$EXECUTION_MODE" in
    external|manual|legacy)
      return 0
      ;;
    *)
      echo -e "${RED}Error: invalid --mode '$EXECUTION_MODE'. Use external, manual, or legacy.${NC}"
      exit 1
      ;;
  esac
}

validate_execution_mode

# Function to log update to history
log_update() {
  local plugin="$1"
  local old_version="$2"
  local new_version="$3"
  local status="$4"
  local execution_mode="${5:-$EXECUTION_MODE}"
  local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

  # Ensure log directory exists
  mkdir -p "$UPDATE_LOG_DIR"

  # Create JSON log entry
  local log_entry=$(cat <<EOF
{"timestamp":"$timestamp","plugin":"$plugin","old_version":"$old_version","new_version":"$new_version","status":"$status","execution_mode":"$execution_mode","user":"$(whoami)","hostname":"$(hostname)"}
EOF
)

  echo "$log_entry" >> "$UPDATE_LOG_FILE"
}

# Function to show update history
show_history() {
  echo ""
  echo -e "${CYAN}╔════════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${CYAN}║${NC}    ${BOLD}OpsPal Update History${NC}                                       ${CYAN}║${NC}"
  echo -e "${CYAN}╚════════════════════════════════════════════════════════════════╝${NC}"
  echo ""

  if [ ! -f "$UPDATE_LOG_FILE" ]; then
    echo -e "${YELLOW}No update history found.${NC}"
    echo "History will be recorded after running updates."
    exit 0
  fi

  echo -e "${BLUE}Recent updates (last 20):${NC}"
  echo ""

  # Show last 20 entries, formatted nicely
  tail -20 "$UPDATE_LOG_FILE" | while read -r line; do
    if command -v jq &> /dev/null; then
      timestamp=$(echo "$line" | jq -r '.timestamp // "unknown"')
      plugin=$(echo "$line" | jq -r '.plugin // "unknown"')
      old_ver=$(echo "$line" | jq -r '.old_version // "?"')
      new_ver=$(echo "$line" | jq -r '.new_version // "?"')
      status=$(echo "$line" | jq -r '.status // "unknown"')
      exec_mode=$(echo "$line" | jq -r '.execution_mode // "legacy"')

      # Format timestamp to be more readable
      formatted_date=$(echo "$timestamp" | sed 's/T/ /g' | sed 's/Z//g' | cut -d' ' -f1,2 | cut -c1-16)

      if [ "$status" = "success" ]; then
        if [ "$old_ver" != "$new_ver" ]; then
          echo -e "   ${GREEN}✓${NC} [$formatted_date] ${BOLD}$plugin${NC}: v$old_ver → v$new_ver (${exec_mode})"
        else
          echo -e "   ${GREEN}✓${NC} [$formatted_date] ${BOLD}$plugin${NC}: v$new_ver (no change, ${exec_mode})"
        fi
      else
        echo -e "   ${RED}✗${NC} [$formatted_date] ${BOLD}$plugin${NC}: FAILED (${exec_mode})"
      fi
    else
      # Fallback without jq
      echo "   $line"
    fi
  done

  echo ""
  echo -e "${CYAN}Log file: $UPDATE_LOG_FILE${NC}"
  exit 0
}

has_nested_session_markers() {
  if [ -n "${CLAUDE_TOOLS_DIR:-}" ] || [ -n "${CLAUDE_PLUGIN_ROOT:-}" ] || [ -n "${CODEX_THREAD_ID:-}" ] || [ -n "${CLAUDECODE:-}" ]; then
    return 0
  fi
  return 1
}

ensure_legacy_mode_safe() {
  if [ "$EXECUTION_MODE" != "legacy" ]; then
    return 0
  fi

  if has_nested_session_markers && [ "$ALLOW_IN_SESSION_LEGACY" != "1" ]; then
    echo -e "${RED}Legacy mode blocked inside Claude Code/Codex session.${NC}"
    echo ""
    echo "Claude Code 2.1.39+ guards against nested session launches."
    echo "Use one of the nested-session-safe modes instead:"
    echo "  - --mode external (default): generate host-terminal runner"
    echo "  - --mode manual: print exact commands to run yourself"
    echo ""
    echo "If you intentionally want to bypass this check, rerun with:"
    echo "  OPSPAL_UPDATE_ALLOW_IN_SESSION_CLAUDE_CLI=1 $0 --mode legacy ..."
    exit 1
  fi
}

run_claude_auth_precheck() {
  if ! command -v claude >/dev/null 2>&1; then
    echo -e "${RED}Error: Claude CLI is not available on PATH.${NC}"
    echo "Install or expose Claude CLI before running updates."
    return 1
  fi

  local auth_output=""
  if ! auth_output=$(claude auth status 2>&1); then
    echo -e "${RED}Claude auth check failed.${NC}"
    echo "$auth_output"
    echo ""
    echo "Recovery commands:"
    echo "  claude auth login"
    echo "  claude auth status"
    echo "  claude auth logout   # use if auth is stale/broken"
    return 1
  fi

  local logged_in="unknown"
  if command -v jq >/dev/null 2>&1; then
    logged_in=$(echo "$auth_output" | jq -r '.loggedIn // "unknown"' 2>/dev/null || echo "unknown")
  fi
  if [ "$logged_in" = "unknown" ]; then
    if echo "$auth_output" | grep -qi '"loggedIn"[[:space:]]*:[[:space:]]*true'; then
      logged_in="true"
    elif echo "$auth_output" | grep -qiE 'not logged in|loggedIn[^[:alnum:]]*false'; then
      logged_in="false"
    fi
  fi

  if [ "$logged_in" = "false" ]; then
    echo -e "${RED}Claude CLI is not logged in.${NC}"
    echo "$auth_output"
    echo ""
    echo "Run:"
    echo "  claude auth login"
    echo "  claude auth status"
    return 1
  fi

  if [ "$VERBOSE" = true ]; then
    echo -e "${GREEN}✓ Claude auth status verified${NC}"
  fi
  return 0
}

render_manual_commands() {
  local plugin
  echo -e "${YELLOW}Manual mode selected - no plugin lifecycle commands were executed.${NC}"
  echo ""
  echo "Run the following in a regular terminal (outside Claude Code session):"
  echo ""
  echo "# Step 0: Refresh marketplace checkout"
  echo "git -C ~/.claude/plugins/marketplaces/revpal-internal-plugins pull"
  echo ""
  for plugin in "${PLUGINS_TO_UPDATE[@]}"; do
    echo "claude plugin uninstall \"$plugin\" || true"
    echo "claude plugin install \"${plugin}@revpal-internal-plugins\""
    echo ""
  done
  echo "Then run:"
  echo "  /finishopspalupdate"
  echo ""
}

generate_external_runner() {
  local only_csv="$1"
  local runner_dir="${TMPDIR:-/tmp}/opspal-update"
  local timestamp
  local runner_path
  local manager_path_escaped
  local only_csv_escaped
  local skip_confirm_escaped
  local verbose_escaped

  timestamp=$(date -u +"%Y%m%dT%H%M%SZ")
  runner_path="$runner_dir/run-opspal-update-${timestamp}.sh"

  mkdir -p "$runner_dir"

  manager_path_escaped=$(printf '%q' "$SCRIPT_ABS_PATH")
  only_csv_escaped=$(printf '%q' "$only_csv")
  skip_confirm_escaped=$(printf '%q' "$SKIP_CONFIRM")
  verbose_escaped=$(printf '%q' "$VERBOSE")

  cat > "$runner_path" <<EOF
#!/usr/bin/env bash
set -euo pipefail

if [ -n "\${CLAUDE_TOOLS_DIR:-}" ] || [ -n "\${CLAUDE_PLUGIN_ROOT:-}" ] || [ -n "\${CODEX_THREAD_ID:-}" ] || [ -n "\${CLAUDECODE:-}" ]; then
  echo "This runner must be executed in a regular terminal (outside Claude Code/Codex session)."
  exit 2
fi

MANAGER_PATH=${manager_path_escaped}
ONLY_PLUGINS=${only_csv_escaped}
SKIP_CONFIRM=${skip_confirm_escaped}
VERBOSE=${verbose_escaped}

if [ ! -f "\$MANAGER_PATH" ]; then
  echo "Could not locate opspal-update-manager.sh at: \$MANAGER_PATH"
  exit 1
fi

# Refresh marketplace checkouts before running update
echo "Refreshing marketplace checkouts..."
for mp_dir in "\$HOME/.claude/plugins/marketplaces"/*/; do
  [ -d "\$mp_dir/.git" ] || continue
  mp_name=\$(basename "\$mp_dir")
  echo -n "  \$mp_name... "
  if git -C "\$mp_dir" pull --ff-only --quiet 2>/dev/null; then
    echo "updated"
  elif git -C "\$mp_dir" fetch --quiet 2>/dev/null && git -C "\$mp_dir" reset --hard origin/main --quiet 2>/dev/null; then
    echo "force-synced"
  else
    echo "FAILED (will use cached)"
  fi
done
echo ""

CMD=(bash "\$MANAGER_PATH" --mode legacy --only "\$ONLY_PLUGINS")
if [ "\$SKIP_CONFIRM" = "true" ]; then
  CMD+=(--skip-confirm)
fi
if [ "\$VERBOSE" = "true" ]; then
  CMD+=(--verbose)
fi

echo "Running: \${CMD[*]}"
"\${CMD[@]}"
EOF

  chmod +x "$runner_path"
  echo "$runner_path"
}

# Show history if requested
if [ "$SHOW_HISTORY" = true ]; then
  show_history
fi

# Helpers
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

is_semver() {
  local value="$1"
  [[ "$value" =~ ^[0-9]+\.[0-9]+\.[0-9]+([.-][0-9A-Za-z.-]+)?$ ]]
}

semver_gt() {
  local a="$1"
  local b="$2"
  [ "$a" = "$b" ] && return 1
  [ "$(printf '%s\n%s\n' "$a" "$b" | sort -V | tail -1)" = "$a" ]
}

plugin_matches_pattern() {
  local plugin_name="$1"
  local pattern
  for pattern in "${OPSPAL_PATTERNS[@]}"; do
    if [[ "$plugin_name" == *"$pattern"* ]]; then
      return 0
    fi
  done
  return 1
}

detect_claude_roots() {
  CLAUDE_ROOTS=()
  append_unique CLAUDE_ROOTS "$HOME/.claude"
  append_unique CLAUDE_ROOTS "${CLAUDE_HOME:-}"
  append_unique CLAUDE_ROOTS "${CLAUDE_CONFIG_DIR:-}"

  # WSL-aware: include Windows user profile Claude dir if available.
  if [ -n "${WSL_DISTRO_NAME:-}" ] || [ -n "${WSL_INTEROP:-}" ]; then
    if [ -n "${USERPROFILE:-}" ] && command -v wslpath >/dev/null 2>&1; then
      win_profile="$(wslpath -u "$USERPROFILE" 2>/dev/null || true)"
      append_unique CLAUDE_ROOTS "${win_profile}/.claude"
    fi
    append_unique CLAUDE_ROOTS "/mnt/c/Users/${USERNAME:-}/.claude"
    append_unique CLAUDE_ROOTS "/mnt/c/Users/${USER:-}/.claude"
  fi
}

refresh_marketplace_checkouts() {
  local refreshed=0
  local failed=0

  echo -e "${BLUE}🔄 Refreshing marketplace checkouts...${NC}"

  for claude_root in "${CLAUDE_ROOTS[@]}"; do
    local mp_base="$claude_root/plugins/marketplaces"
    [ -d "$mp_base" ] || continue

    for mp_dir in "$mp_base"/*/; do
      [ -d "$mp_dir/.git" ] || continue
      local mp_name
      mp_name=$(basename "$mp_dir")
      echo -n "   $mp_name... "

      if git -C "$mp_dir" pull --ff-only --quiet 2>/dev/null; then
        echo -e "${GREEN}updated${NC}"
        refreshed=$((refreshed + 1))
      elif git -C "$mp_dir" fetch --quiet 2>/dev/null && git -C "$mp_dir" reset --hard origin/main --quiet 2>/dev/null; then
        echo -e "${YELLOW}force-synced${NC}"
        refreshed=$((refreshed + 1))
      else
        echo -e "${RED}FAILED (offline or auth issue)${NC}"
        failed=$((failed + 1))
      fi
    done
  done

  if [ $refreshed -gt 0 ]; then
    echo -e "   ${GREEN}✓${NC} Refreshed $refreshed marketplace(s)"
  fi
  if [ $failed -gt 0 ]; then
    echo -e "   ${YELLOW}⚠${NC} $failed marketplace(s) could not be refreshed (will use cached)"
  fi
  echo ""
}

resolve_plugin_version_from_manifest() {
  local plugin_dir="$1"
  local version_file=""
  if [ -f "$plugin_dir/.claude-plugin/plugin.json" ]; then
    version_file="$plugin_dir/.claude-plugin/plugin.json"
  elif [ -f "$plugin_dir/plugin.json" ]; then
    version_file="$plugin_dir/plugin.json"
  fi

  if [ -n "$version_file" ] && command -v jq &> /dev/null; then
    jq -r '.version // "unknown"' "$version_file" 2>/dev/null || echo "unknown"
    return 0
  fi

  echo "unknown"
}

declare -a CACHE_PLUGIN_DIRS=()
declare -A CACHE_LATEST_VERSION=()
declare -A CACHE_LATEST_PATH=()

scan_cache_plugins() {
  CACHE_PLUGIN_DIRS=()
  CACHE_LATEST_VERSION=()
  CACHE_LATEST_PATH=()

  local claude_root cache_root marketplace_dir plugin_root version_dir
  local plugin_name version latest

  for claude_root in "${CLAUDE_ROOTS[@]}"; do
    cache_root="$claude_root/plugins/cache"
    [ -d "$cache_root" ] || continue

    for marketplace_dir in "$cache_root"/*; do
      [ -d "$marketplace_dir" ] || continue

      for plugin_root in "$marketplace_dir"/*; do
        [ -d "$plugin_root" ] || continue
        plugin_name="$(basename "$plugin_root")"
        plugin_matches_pattern "$plugin_name" || continue

        latest="${CACHE_LATEST_VERSION[$plugin_name]:-}"

        for version_dir in "$plugin_root"/*; do
          [ -d "$version_dir" ] || continue
          version="$(basename "$version_dir")"
          is_semver "$version" || continue

          if [ -z "$latest" ] || semver_gt "$version" "$latest"; then
            latest="$version"
            CACHE_LATEST_VERSION["$plugin_name"]="$version"
            CACHE_LATEST_PATH["$plugin_name"]="$version_dir"
          fi
        done

        append_unique CACHE_PLUGIN_DIRS "$plugin_root"
      done
    done
  done
}

resolve_best_plugin_source_path() {
  local plugin="$1"
  local preferred_version="${2:-}"
  local plugin_dir candidate version
  local best_path=""
  local best_version=""

  for plugin_dir in "${PLUGIN_DIRS[@]}"; do
    candidate="$plugin_dir/$plugin"
    [ -d "$candidate" ] || continue

    version="$(resolve_plugin_version_from_manifest "$candidate")"
    if [ -n "$preferred_version" ] && [ "$version" = "$preferred_version" ]; then
      echo "$candidate"
      return 0
    fi

    if [ -z "$best_version" ] || { is_semver "$version" && is_semver "$best_version" && semver_gt "$version" "$best_version"; }; then
      best_version="$version"
      best_path="$candidate"
    elif [ -z "$best_path" ]; then
      best_path="$candidate"
    fi
  done

  if [ -n "$best_path" ]; then
    echo "$best_path"
    return 0
  fi

  if [ -n "${CACHE_LATEST_PATH[$plugin]:-}" ]; then
    echo "${CACHE_LATEST_PATH[$plugin]}"
    return 0
  fi

  return 1
}

resolve_latest_known_plugin_version() {
  local plugin="$1"
  local plugin_dir candidate version
  local best_version=""

  for plugin_dir in "${PLUGIN_DIRS[@]}"; do
    candidate="$plugin_dir/$plugin"
    [ -d "$candidate" ] || continue
    version="$(resolve_plugin_version_from_manifest "$candidate")"
    if [ -z "$best_version" ]; then
      best_version="$version"
      continue
    fi
    if is_semver "$version" && is_semver "$best_version" && semver_gt "$version" "$best_version"; then
      best_version="$version"
    fi
  done

  if [ -n "${CACHE_LATEST_VERSION[$plugin]:-}" ]; then
    if [ -z "$best_version" ] || { is_semver "${CACHE_LATEST_VERSION[$plugin]}" && is_semver "$best_version" && semver_gt "${CACHE_LATEST_VERSION[$plugin]}" "$best_version"; }; then
      best_version="${CACHE_LATEST_VERSION[$plugin]}"
    fi
  fi

  [ -n "$best_version" ] && echo "$best_version" || echo "unknown"
}

sync_cache_plugin_versions() {
  local plugin="$1"
  local source_path="$2"
  local new_version="$3"

  [ -d "$source_path" ] || return 0
  is_semver "$new_version" || return 0

  local plugin_cache_root new_dir version_dir version linked
  local repaired_count=0

  # Ensure every discovered cache root has the newest version payload.
  for plugin_cache_root in "${CACHE_PLUGIN_DIRS[@]}"; do
    if [ "$(basename "$plugin_cache_root")" != "$plugin" ]; then
      continue
    fi

    new_dir="$plugin_cache_root/$new_version"
    if [ ! -d "$new_dir" ] && [ ! -L "$new_dir" ]; then
      mkdir -p "$plugin_cache_root"
      cp -a "$source_path" "$new_dir"
      if [ "$VERBOSE" = true ]; then
        echo "   ↺ Seeded cache version: $new_dir"
      fi
    fi

    for version_dir in "$plugin_cache_root"/*; do
      [ -e "$version_dir" ] || continue
      version="$(basename "$version_dir")"
      is_semver "$version" || continue
      [ "$version" = "$new_version" ] && continue

      if [ -L "$version_dir" ]; then
        rm -f "$version_dir"
      else
        rm -rf "$version_dir"
      fi

      linked=false
      if ln -s "$new_version" "$version_dir" 2>/dev/null; then
        linked=true
      else
        cp -a "$new_dir" "$version_dir"
      fi

      repaired_count=$((repaired_count + 1))
      if [ "$VERBOSE" = true ]; then
        if [ "$linked" = true ]; then
          echo "   ↺ Re-pointed stale cache version $version -> $new_version"
        else
          echo "   ↺ Refreshed stale cache version $version with $new_version payload"
        fi
      fi
    done
  done

  if [ "$VERBOSE" = true ] && [ "$repaired_count" -gt 0 ]; then
    echo "   ✅ Cache compatibility repairs applied: $repaired_count"
  fi
}

# Banner
echo ""
echo -e "${CYAN}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║${NC}    ${BOLD}OpsPal Plugin Update Manager${NC}                                ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}    Force refresh from marketplace                             ${CYAN}║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Parse --only plugins into array
declare -a SELECTED_PLUGINS=()
if [ -n "$ONLY_PLUGINS" ]; then
  IFS=',' read -ra SELECTED_PLUGINS <<< "$ONLY_PLUGINS"
  echo -e "${BLUE}📌 Selective update mode: ${#SELECTED_PLUGINS[@]} plugin(s) specified${NC}"
  for p in "${SELECTED_PLUGINS[@]}"; do
    echo -e "   • $p"
  done
  echo ""
fi

# Resolve Claude roots first (Linux/macOS + WSL).
declare -a CLAUDE_ROOTS=()
detect_claude_roots

# Find plugin directories - check multiple locations.
# Priority: 1. Local dev paths, 2. Marketplace installs, 3. Direct plugin installs.
declare -a PLUGIN_DIRS=()
append_unique PLUGIN_DIRS "./.claude-plugins"
append_unique PLUGIN_DIRS "./plugins"

for claude_root in "${CLAUDE_ROOTS[@]}"; do
  append_unique PLUGIN_DIRS "$claude_root/plugins/marketplaces/revpal-internal-plugins/plugins"

  if [ -d "$claude_root/plugins/marketplaces" ]; then
    for mp_dir in "$claude_root/plugins/marketplaces"/*/plugins; do
      [ -d "$mp_dir" ] || continue
      if ls "$mp_dir"/opspal-* &>/dev/null || ls "$mp_dir"/*-plugin &>/dev/null; then
        append_unique PLUGIN_DIRS "$mp_dir"
      fi
    done
  fi

  append_unique PLUGIN_DIRS "$claude_root/plugins"
done

if [ ${#PLUGIN_DIRS[@]} -eq 0 ]; then
  echo -e "${RED}Error: No plugin directories found${NC}"
  echo ""
  echo "Searched locations:"
  echo "  - ./.claude-plugins (local dev)"
  echo "  - ./plugins (local dev)"
  echo "  - ~/.claude/plugins/marketplaces/*/plugins (Claude CLI)"
  echo "  - ~/.claude/plugins (legacy/direct installs)"
  echo "  - WSL Windows profile .claude paths (if available)"
  echo ""
  echo "If plugins are installed, verify with: claude plugin list"
  exit 1
fi

# Show where we're looking (verbose mode)
if [ "$VERBOSE" = true ]; then
  echo -e "${CYAN}Claude roots detected:${NC}"
  for root in "${CLAUDE_ROOTS[@]}"; do
    echo "  - $root"
  done
  echo ""

  echo -e "${CYAN}Plugin directories found:${NC}"
  for dir in "${PLUGIN_DIRS[@]}"; do
    echo "  - $dir"
  done
  echo ""
fi

# Patterns for OpsPal plugins
OPSPAL_PATTERNS=(
  "opspal-"
  "salesforce-plugin"
  "hubspot-plugin"
  "marketo-plugin"
  "developer-tools-plugin"
  "gtm-planning-plugin"
  "ai-consult-plugin"
  "cross-platform-plugin"
)

# Function to check if plugin is in selected list
is_selected() {
  local plugin="$1"

  # If no --only specified, all plugins are selected
  if [ ${#SELECTED_PLUGINS[@]} -eq 0 ]; then
    return 0
  fi

  for selected in "${SELECTED_PLUGINS[@]}"; do
    # Trim whitespace
    selected=$(echo "$selected" | xargs)
    if [ "$plugin" = "$selected" ]; then
      return 0
    fi
  done

  return 1
}

# Refresh marketplace checkouts BEFORE discovering plugins
if [ "$DRY_RUN" != true ]; then
  refresh_marketplace_checkouts
fi

# Discover installed plugins
echo -e "${BLUE}📦 Discovering installed plugins...${NC}"
echo ""

declare -A OLD_VERSIONS
declare -a PLUGINS_TO_UPDATE=()
declare -a SKIPPED_PLUGINS=()

# Capture cache plugin inventory before update so we can refresh stale version paths.
scan_cache_plugins

for plugin_dir in "${PLUGIN_DIRS[@]}"; do
  if [ ! -d "$plugin_dir" ]; then
    continue
  fi

  for entry in "$plugin_dir"/*; do
    if [ ! -d "$entry" ]; then
      continue
    fi

    plugin_name=$(basename "$entry")

    if ! plugin_matches_pattern "$plugin_name"; then
      continue
    fi

    version="$(resolve_plugin_version_from_manifest "$entry")"

    # Skip duplicates (same plugin in multiple dirs)
    if [ -n "${OLD_VERSIONS[$plugin_name]:-}" ]; then
      continue
    fi

    OLD_VERSIONS["$plugin_name"]="$version"

    # Check if this plugin should be updated (selective mode)
    if is_selected "$plugin_name"; then
      PLUGINS_TO_UPDATE+=("$plugin_name")
      echo -e "   ${GREEN}✓${NC} ${BOLD}$plugin_name${NC} (v$version)"
    else
      SKIPPED_PLUGINS+=("$plugin_name")
      if [ "$VERBOSE" = true ]; then
        echo -e "   ${YELLOW}○${NC} $plugin_name (v$version) - skipped"
      fi
    fi
  done
done

# Include plugins that only exist in cache locations (common in some Claude/WSL setups).
for plugin_name in "${!CACHE_LATEST_VERSION[@]}"; do
  if [ -n "${OLD_VERSIONS[$plugin_name]:-}" ]; then
    continue
  fi

  version="${CACHE_LATEST_VERSION[$plugin_name]}"
  OLD_VERSIONS["$plugin_name"]="$version"

  if is_selected "$plugin_name"; then
    PLUGINS_TO_UPDATE+=("$plugin_name")
    echo -e "   ${GREEN}✓${NC} ${BOLD}$plugin_name${NC} (cache v$version)"
  else
    SKIPPED_PLUGINS+=("$plugin_name")
    if [ "$VERBOSE" = true ]; then
      echo -e "   ${YELLOW}○${NC} $plugin_name (cache v$version) - skipped"
    fi
  fi
done

echo ""

# Show skipped plugins count if in selective mode
if [ ${#SELECTED_PLUGINS[@]} -gt 0 ] && [ ${#SKIPPED_PLUGINS[@]} -gt 0 ]; then
  echo -e "${YELLOW}Skipped ${#SKIPPED_PLUGINS[@]} plugin(s) not in --only list${NC}"
  echo ""
fi

echo -e "${BLUE}Found ${#PLUGINS_TO_UPDATE[@]} plugin(s) to update${NC}"
echo ""

if [ ${#PLUGINS_TO_UPDATE[@]} -eq 0 ]; then
  if [ ${#SELECTED_PLUGINS[@]} -gt 0 ]; then
    echo -e "${YELLOW}No matching plugins found for: ${ONLY_PLUGINS}${NC}"
    echo ""
    echo "Available plugins:"
    for plugin in "${!OLD_VERSIONS[@]}"; do
      echo "  - $plugin"
    done
  else
    echo -e "${YELLOW}No OpsPal plugins found to update.${NC}"
  fi
  exit 0
fi

# Dry run mode
if [ "$DRY_RUN" = true ]; then
  echo -e "${YELLOW}DRY RUN MODE - No changes will be made${NC}"
  echo ""
  echo "The following plugins would be updated:"
  for plugin in "${PLUGINS_TO_UPDATE[@]}"; do
    echo "  - $plugin (current: v${OLD_VERSIONS[$plugin]})"
  done
  echo ""
  echo -e "${CYAN}Run without --dry-run to execute the update.${NC}"
  exit 0
fi

# Validate auth before any non-dry-run update path.
if ! run_claude_auth_precheck; then
  exit 1
fi

# Legacy mode can only run safely outside nested Claude sessions unless explicitly overridden.
ensure_legacy_mode_safe

# Confirmation
if [ "$SKIP_CONFIRM" = false ]; then
  # Auto-skip confirmation when running non-interactively (e.g., from Claude Code Bash tool)
  if [ ! -t 0 ]; then
    echo -e "${YELLOW}Non-interactive mode detected - skipping confirmation${NC}"
    echo ""
  else
    case "$EXECUTION_MODE" in
      external)
        echo -e "${YELLOW}This will generate a host-terminal runner for ${#PLUGINS_TO_UPDATE[@]} plugin updates.${NC}"
        ;;
      manual)
        echo -e "${YELLOW}This will print manual plugin update commands for ${#PLUGINS_TO_UPDATE[@]} plugins.${NC}"
        ;;
      legacy)
        echo -e "${YELLOW}This will uninstall and reinstall ${#PLUGINS_TO_UPDATE[@]} plugins directly.${NC}"
        ;;
    esac
    echo ""
    read -p "Continue? [y/N] " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
      echo "Aborted."
      exit 1
    fi
  fi
fi

# External mode (default): generate a host-terminal runner script.
if [ "$EXECUTION_MODE" = "external" ]; then
  ONLY_CSV="$(IFS=','; echo "${PLUGINS_TO_UPDATE[*]}")"
  RUNNER_PATH="$(generate_external_runner "$ONLY_CSV")"

  if [ "$EMIT_SCRIPT_ONLY" = true ]; then
    echo "$RUNNER_PATH"
    exit 0
  fi

  echo -e "${GREEN}✅ Generated host-terminal update runner${NC}"
  echo ""
  echo "Runner script:"
  echo "  $RUNNER_PATH"
  echo ""
  echo "Run this in a regular terminal (outside Claude Code session):"
  echo "  bash \"$RUNNER_PATH\""
  echo ""
  echo "After it completes, run:"
  echo "  /finishopspalupdate"
  echo ""
  exit 0
fi

# Manual mode: print exact commands and stop.
if [ "$EXECUTION_MODE" = "manual" ]; then
  render_manual_commands
  exit 0
fi

# Update each plugin
echo ""
echo -e "${BLUE}🔄 Updating plugins...${NC}"
echo ""

FAILED_PLUGINS=()
SUCCESS_PLUGINS=()
declare -A NEW_VERSIONS

for plugin in "${PLUGINS_TO_UPDATE[@]}"; do
  echo -e "${CYAN}━━━ $plugin ━━━${NC}"

  # Uninstall
  echo -n "   Uninstalling... "
  uninstall_output=""
  if uninstall_output=$(claude plugin uninstall "$plugin" 2>&1); then
    echo -e "${GREEN}done${NC}"
  else
    if echo "$uninstall_output" | grep -qi "not found"; then
      echo -e "${YELLOW}not found (will install fresh)${NC}"
    else
      echo -e "${RED}FAILED${NC}"
      if [ -n "$uninstall_output" ]; then
        echo "$uninstall_output" | sed 's/^/      /'
      fi
      FAILED_PLUGINS+=("$plugin")
      log_update "$plugin" "${OLD_VERSIONS[$plugin]}" "failed" "failed" "$EXECUTION_MODE"
      echo ""
      continue
    fi
  fi

  # Reinstall from marketplace
  echo -n "   Installing from marketplace... "
  install_output=""
  if install_output=$(claude plugin install "${plugin}@revpal-internal-plugins" 2>&1); then
    echo -e "${GREEN}done${NC}"
    SUCCESS_PLUGINS+=("$plugin")

    # Refresh cache discovery after install so we can reconcile stale paths.
    scan_cache_plugins

    # Resolve highest known version across marketplace + cache locations.
    new_version="$(resolve_latest_known_plugin_version "$plugin")"
    source_path="$(resolve_best_plugin_source_path "$plugin" "$new_version" || true)"
    if [ -n "$source_path" ]; then
      sync_cache_plugin_versions "$plugin" "$source_path" "$new_version"
    fi

    NEW_VERSIONS["$plugin"]="$new_version"

    # Log successful update
    log_update "$plugin" "${OLD_VERSIONS[$plugin]}" "$new_version" "success" "$EXECUTION_MODE"
  else
    echo -e "${RED}FAILED${NC}"
    FAILED_PLUGINS+=("$plugin")
    if [ -n "$install_output" ]; then
      echo "$install_output" | sed 's/^/      /'
    fi

    # Log failed update
    log_update "$plugin" "${OLD_VERSIONS[$plugin]}" "failed" "failed" "$EXECUTION_MODE"
  fi

  echo ""
done

# Summary
echo ""
echo -e "${CYAN}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║${NC}    ${BOLD}Update Summary${NC}                                              ${CYAN}║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

UPGRADED_COUNT=0
UNCHANGED_COUNT=0

if [ ${#SUCCESS_PLUGINS[@]} -gt 0 ]; then
  echo -e "${GREEN}✅ Updated Successfully (${#SUCCESS_PLUGINS[@]})${NC}"
  for plugin in "${SUCCESS_PLUGINS[@]}"; do
    old_ver="${OLD_VERSIONS[$plugin]}"
    new_ver="${NEW_VERSIONS[$plugin]:-unknown}"
    if [ "$old_ver" != "$new_ver" ]; then
      echo -e "   ${BOLD}$plugin${NC}: v$old_ver → ${GREEN}v$new_ver${NC}"
      ((UPGRADED_COUNT++))
    else
      echo -e "   ${BOLD}$plugin${NC}: v$new_ver (unchanged)"
      ((UNCHANGED_COUNT++))
    fi
  done
  echo ""
fi

if [ ${#FAILED_PLUGINS[@]} -gt 0 ]; then
  echo -e "${RED}❌ Failed (${#FAILED_PLUGINS[@]})${NC}"
  for plugin in "${FAILED_PLUGINS[@]}"; do
    echo "   $plugin"
  done
  echo ""
fi

# Statistics
echo -e "${BLUE}📊 Statistics${NC}"
echo "   Upgraded: $UPGRADED_COUNT"
echo "   Unchanged: $UNCHANGED_COUNT"
echo "   Failed: ${#FAILED_PLUGINS[@]}"
echo ""

# History note
echo -e "${CYAN}📜 Update logged to: $UPDATE_LOG_FILE${NC}"
echo -e "   Run with ${BOLD}--history${NC} to view recent updates"
echo ""

# Next steps
echo -e "${CYAN}━━━ Next Steps ━━━${NC}"
echo ""
echo -e "   Run ${BOLD}/finishopspalupdate${NC} to complete the update process:"
echo -e "   • Validate plugin configuration"
echo -e "   • Update CLAUDE.md routing tables"
echo -e "   • Check for any issues"
echo ""

# Exit code
if [ ${#FAILED_PLUGINS[@]} -gt 0 ]; then
  if [ ${#SUCCESS_PLUGINS[@]} -eq 0 ]; then
    exit 2  # Complete failure
  else
    exit 1  # Partial failure
  fi
fi

exit 0
