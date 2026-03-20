#!/usr/bin/env bash
#
# finish-opspal-update.sh - Post-update validation and runtime reconciliation
#
# Extracted from the /finishopspalupdate command so the slash command can invoke
# a real script instead of inlining a large Bash payload through `bash -c`.
#

set -euo pipefail

show_usage() {
  cat <<EOF
Usage: $0 [--skip-fix] [--verbose] [--no-cache-prune] [--strict] [--help]

Options:
  --skip-fix         Run validation in check-only mode
  --verbose          Show detailed diagnostics
  --no-cache-prune   Skip stale plugin cache pruning
  --strict           Keep fewer cache versions during prune
  --help             Show this help text
EOF
}

echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║    OpsPal Post-Update Validation                               ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Parse arguments
SKIP_FIX=false
VERBOSE_FLAG=""
CACHE_PRUNE=true
STRICT_MODE=false
STRICT_FLAG=""
for arg in "$@"; do
  case "$arg" in
    --skip-fix) SKIP_FIX=true ;;
    --verbose) VERBOSE_FLAG="--verbose" ;;
    --no-cache-prune) CACHE_PRUNE=false ;;
    --strict) STRICT_MODE=true; STRICT_FLAG="--strict" ;;
    --help)
      show_usage
      exit 0
      ;;
    *)
      echo "Unknown option: $arg"
      echo ""
      show_usage
      exit 1
      ;;
  esac
done

# Build Claude roots (Linux/macOS + WSL Windows profile)
CLAUDE_ROOTS=("$HOME/.claude")
if [ -n "${CLAUDE_HOME:-}" ]; then
  CLAUDE_ROOTS+=("$CLAUDE_HOME")
fi
if [ -n "${CLAUDE_CONFIG_DIR:-}" ]; then
  CLAUDE_ROOTS+=("$CLAUDE_CONFIG_DIR")
fi
if [ -n "${WSL_DISTRO_NAME:-}" ] || [ -n "${WSL_INTEROP:-}" ]; then
  if [ -n "${USERPROFILE:-}" ] && command -v wslpath >/dev/null 2>&1; then
    WIN_PROFILE="$(wslpath -u "$USERPROFILE" 2>/dev/null || true)"
    [ -n "$WIN_PROFILE" ] && CLAUDE_ROOTS+=("$WIN_PROFILE/.claude")
  fi
  [ -n "${USERNAME:-}" ] && CLAUDE_ROOTS+=("/mnt/c/Users/$USERNAME/.claude")
  [ -n "${USER:-}" ] && CLAUDE_ROOTS+=("/mnt/c/Users/$USER/.claude")
fi

find_latest_cache_script() {
  local root="$1"
  local path_pattern="$2"
  [ -d "$root/plugins/cache" ] || return 1
  find "$root/plugins/cache" -type f -path "$path_pattern" 2>/dev/null | sort -V | tail -1
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
    found=$(find "$root/plugins" -name "$script_name" -path "*/opspal-core/scripts/lib/*" 2>/dev/null | sort -V | tail -1)
    [ -n "$found" ] && echo "$found" && return 0
  done

  found=$(find . -name "$script_name" -path "*/opspal-core/scripts/lib/*" 2>/dev/null | sort -V | tail -1)
  [ -n "$found" ] && echo "$found" && return 0
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

EXIT_CODE=0

# Step 1: Plugin Validation
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔧 Step 1: Running plugin validation..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

UPDATE_SCRIPT=$(find_script "plugin-update-manager.js")
if [ -n "$UPDATE_SCRIPT" ]; then
  if [ "$SKIP_FIX" = true ]; then
    node "$UPDATE_SCRIPT" --check-only $VERBOSE_FLAG
  else
    node "$UPDATE_SCRIPT" --fix $VERBOSE_FLAG
  fi
  if [ $? -ne 0 ]; then
    EXIT_CODE=1
    echo ""
    echo "⚠️  Plugin validation completed with warnings/errors"
  else
    echo ""
    echo "✅ Plugin validation passed"
  fi
else
  echo "⚠️  plugin-update-manager.js not found - skipping validation"
  EXIT_CODE=1
fi

echo ""

# Step 2: Clean stale plugin hooks from settings.json
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🧹 Step 2: Cleaning stale plugin hooks from settings.json..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Detect and remove hook entries in settings.json that duplicate what plugin
# hooks.json files already provide. These stale entries can run plugin hooks
# WITHOUT the safe env overrides the plugin hooks.json specifies, causing
# false-positive hard blocks on user prompts.
#
# Known stale patterns:
#   - unified-router.sh in UserPromptSubmit (plugin hooks.json has env overrides)
#   - pre-task-graph-trigger.sh in UserPromptSubmit (already in plugin hooks.json)
#   - intake-suggestion.sh in UserPromptSubmit (already in plugin hooks.json)
#   - routing-context-refresher.sh in UserPromptSubmit (already in plugin hooks.json)
#
# We only remove entries whose command points to a plugin path (contains
# "opspal-core/hooks/" or "opspal-salesforce/hooks/" etc) and that are NOT
# prefixed with "env " (which would indicate intentional user customization).

STALE_HOOKS_CLEANED=0

for root in "${CLAUDE_ROOTS[@]}"; do
  SETTINGS_FILE="$root/settings.json"
  [ -f "$SETTINGS_FILE" ] || continue

  if command -v node >/dev/null 2>&1; then
    CLEANED=$(node -e "
      const fs = require('fs');
      const path = '$SETTINGS_FILE';
      let data;
      try { data = JSON.parse(fs.readFileSync(path, 'utf8')); } catch(e) { process.exit(0); }
      if (!data.hooks) process.exit(0);

      // Patterns that indicate a plugin-managed hook (should be in hooks.json, not settings.json)
      const pluginHookPatterns = [
        /opspal-[^\/]+\/hooks\/unified-router\.sh/,
        /opspal-[^\/]+\/hooks\/pre-task-graph-trigger\.sh/,
        /opspal-[^\/]+\/hooks\/intake-suggestion\.sh/,
        /opspal-[^\/]+\/hooks\/routing-context-refresher\.sh/,
        /opspal-[^\/]+\/hooks\/pre-task-agent-validator\.sh/,
        /opspal-[^\/]+\/hooks\/pre-task-runbook-reminder\.sh/,
        /opspal-[^\/]+\/hooks\/pre-task-template-injector\.sh/,
        /opspal-[^\/]+\/hooks\/session-init\.sh/,
        /opspal-[^\/]+\/hooks\/session-end\.sh/,
        /opspal-[^\/]+\/hooks\/post-tool-use\.sh/,
        /opspal-[^\/]+\/hooks\/pre-operation-data-validator\.sh/
      ];

      function isStalePluginHook(cmd) {
        if (!cmd || typeof cmd !== 'string') return false;
        const strict = ${STRICT_MODE};
        const matchesPluginHook = pluginHookPatterns.some(p => p.test(cmd));
        if (!matchesPluginHook) return false;
        // In strict mode, canonicalize all plugin-managed hook entries even if
        // they were previously customized with env prefixes.
        if (strict) return true;
        if (cmd.startsWith('env ')) return false;
        return true;
      }

      let totalRemoved = 0;
      for (const [event, matchers] of Object.entries(data.hooks)) {
        if (!Array.isArray(matchers)) continue;
        for (let mi = matchers.length - 1; mi >= 0; mi--) {
          const matcher = matchers[mi];
          if (!matcher.hooks || !Array.isArray(matcher.hooks)) continue;
          const before = matcher.hooks.length;
          matcher.hooks = matcher.hooks.filter(h => !isStalePluginHook(h.command));
          totalRemoved += (before - matcher.hooks.length);
          // Remove empty matcher groups
          if (matcher.hooks.length === 0) {
            matchers.splice(mi, 1);
          }
        }
        // Remove empty event arrays
        if (matchers.length === 0) {
          delete data.hooks[event];
        }
      }

      if (totalRemoved > 0) {
        fs.writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
      }
      console.log(totalRemoved);
    " 2>/dev/null || echo "0")

    if [ "$CLEANED" -gt 0 ] 2>/dev/null; then
      STALE_HOOKS_CLEANED=$((STALE_HOOKS_CLEANED + CLEANED))
      echo "  Removed $CLEANED stale plugin hook(s) from $SETTINGS_FILE"
    fi
  fi
done

if [ "$STALE_HOOKS_CLEANED" -gt 0 ]; then
  echo "✅ Cleaned $STALE_HOOKS_CLEANED stale hook(s) from settings.json (now managed by plugin hooks.json)"
else
  echo "✅ No stale plugin hooks found in settings.json"
fi

echo ""

# Step 3: Installed Runtime Reconciliation + Routing Artifact Refresh + Validation
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🧭 Step 3: Reconciling installed runtime, refreshing routing artifacts, and validating hook health..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

FIX_SCRIPT=$(find_script "post-plugin-update-fixes.js")
if [ -n "$FIX_SCRIPT" ]; then
  if [ "$SKIP_FIX" = true ]; then
    node "$FIX_SCRIPT" --dry-run $VERBOSE_FLAG $STRICT_FLAG
  else
    node "$FIX_SCRIPT" --fix $VERBOSE_FLAG $STRICT_FLAG
  fi
  if [ $? -ne 0 ]; then
    EXIT_CODE=1
    echo ""
    echo "⚠️  Runtime reconciliation completed with warnings/errors"
  else
    echo "✅ Runtime reconciliation completed"
  fi
else
  echo "⚠️  post-plugin-update-fixes.js not found - skipping installed runtime reconciliation"
  EXIT_CODE=1
fi

HOOK_RECONCILE_SCRIPT=$(find_script "reconcile-hook-registration.js")
if [ -n "$HOOK_RECONCILE_SCRIPT" ]; then
  HOOK_CORE_ROOT="$(plugin_root_for_script "$HOOK_RECONCILE_SCRIPT")"
  HOOK_RECONCILE_REPORT="$(mktemp)"
  if [ "$SKIP_FIX" = true ]; then
    node "$HOOK_RECONCILE_SCRIPT" --check --project-root "$PWD" --core-plugin-root "$HOOK_CORE_ROOT" > "$HOOK_RECONCILE_REPORT" 2>/dev/null
  else
    node "$HOOK_RECONCILE_SCRIPT" --project-root "$PWD" --core-plugin-root "$HOOK_CORE_ROOT" > "$HOOK_RECONCILE_REPORT" 2>/dev/null
  fi
  if [ $? -ne 0 ]; then
    EXIT_CODE=1
    echo "⚠️  Hook registration reconciliation failed"
    if [ "$VERBOSE_FLAG" = "--verbose" ] && [ -s "$HOOK_RECONCILE_REPORT" ]; then
      cat "$HOOK_RECONCILE_REPORT"
    fi
  else
    echo "✅ Hook registration reconciliation passed"
  fi
  rm -f "$HOOK_RECONCILE_REPORT"
else
  echo "⚠️  reconcile-hook-registration.js not found - skipping hook registration verification"
  EXIT_CODE=1
fi

if [ -n "$FIX_SCRIPT" ]; then
  if [ "$VERBOSE_FLAG" = "--verbose" ]; then
    node "$FIX_SCRIPT" --verify-runtime $VERBOSE_FLAG $STRICT_FLAG
  else
    node "$FIX_SCRIPT" --verify-runtime $STRICT_FLAG >/dev/null 2>&1
  fi
  if [ $? -ne 0 ]; then
    EXIT_CODE=1
    echo "⚠️  Installed runtime parity verification failed"
  else
    echo "✅ Installed runtime parity verified"
  fi
fi

STATE_SCRIPT=$(find_script "routing-state-manager.js")
if [ -n "$STATE_SCRIPT" ]; then
  node "$STATE_SCRIPT" clear-expired >/dev/null 2>&1 || true
  echo "✅ Cleared expired session-scoped routing state"
else
  echo "⚠️  routing-state-manager.js not found - skipping routing state cleanup"
  EXIT_CODE=1
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

ROUTING_INDEX_SCRIPT=$(find_script "routing-index-builder.js")
if [ -n "$ROUTING_INDEX_SCRIPT" ]; then
  node "$ROUTING_INDEX_SCRIPT" $VERBOSE_FLAG
  if [ $? -ne 0 ]; then
    EXIT_CODE=1
    echo ""
    echo "⚠️  Routing index rebuild completed with warnings/errors"
  else
    echo "✅ Routing index rebuilt"
  fi
else
  echo "⚠️  routing-index-builder.js not found - skipping routing index rebuild"
  EXIT_CODE=1
fi

ALIAS_SCRIPT=$(find_script "agent-alias-resolver.js")
if [ -n "$ALIAS_SCRIPT" ]; then
  node "$ALIAS_SCRIPT" rebuild
  if [ $? -ne 0 ]; then
    EXIT_CODE=1
    echo "⚠️  Agent alias registry rebuild had warnings/errors"
  fi

  node "$ALIAS_SCRIPT" rebuild-commands
  if [ $? -ne 0 ]; then
    EXIT_CODE=1
    echo "⚠️  Command registry rebuild had warnings/errors"
  else
    echo "✅ Agent/command alias registries rebuilt"
  fi
else
  echo "⚠️  agent-alias-resolver.js not found - skipping alias cache rebuild"
  EXIT_CODE=1
fi

# Clear semantic vector cache so semantic router rebuilds from latest index
VECTOR_CACHE="/tmp/routing-vector-cache.json"
if [ -f "$VECTOR_CACHE" ]; then
  rm -f "$VECTOR_CACHE" 2>/dev/null || true
  echo "✅ Cleared semantic routing vector cache"
fi

ROUTING_VALIDATOR=$(find_ci_script "validate-routing.sh")
if [ -n "$ROUTING_VALIDATOR" ]; then
  bash "$ROUTING_VALIDATOR" $VERBOSE_FLAG
  if [ $? -ne 0 ]; then
    EXIT_CODE=1
    echo ""
    echo "⚠️  Routing validation completed with warnings/errors"
  else
    echo "✅ Routing validation passed"
  fi
else
  echo "⚠️  validate-routing.sh not found - skipping routing validation"
  EXIT_CODE=1
fi

HOOK_HEALTH_SCRIPT=$(find_script "hook-health-checker.js")
if [ -n "$HOOK_HEALTH_SCRIPT" ]; then
  HOOK_HEALTH_JSON="$(mktemp)"
  node "$HOOK_HEALTH_SCRIPT" --quick --format json > "$HOOK_HEALTH_JSON" 2>/dev/null
  HOOK_HEALTH_EXIT=$?
  HOOK_HEALTH_STATUS=$(node -e "
    const fs = require('fs');
    try {
      const data = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
      console.log((data.summary && data.summary.status) || data.status || 'UNKNOWN');
    } catch (_error) {
      console.log('UNKNOWN');
    }
  " "$HOOK_HEALTH_JSON" 2>/dev/null || echo "UNKNOWN")

  if [ "$HOOK_HEALTH_EXIT" -eq 0 ]; then
    echo "✅ Hook health check passed (${HOOK_HEALTH_STATUS})"
  elif [ "$HOOK_HEALTH_EXIT" -eq 1 ]; then
    echo "⚠️  Hook health check degraded (${HOOK_HEALTH_STATUS})"
  else
    EXIT_CODE=1
    echo "⚠️  Hook health check unhealthy (${HOOK_HEALTH_STATUS})"
  fi

  rm -f "$HOOK_HEALTH_JSON"
else
  echo "⚠️  hook-health-checker.js not found - skipping hook health validation"
  EXIT_CODE=1
fi

echo ""

# Step 4: Cache Prune
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🧹 Step 4: Pruning stale plugin cache versions..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if [ "$CACHE_PRUNE" = true ]; then
  PRUNE_RESULT=$(prune_marketplace_cache_versions)
  PRUNED_COUNT="${PRUNE_RESULT%%|*}"
  SCANNED_COUNT="${PRUNE_RESULT##*|}"
  if [ "$STRICT_MODE" = true ]; then
    echo "✅ Cache prune complete (${PRUNED_COUNT} old versions removed across ${SCANNED_COUNT} plugin caches, strict latest-only mode)"
  else
    echo "✅ Cache prune complete (${PRUNED_COUNT} old versions removed across ${SCANNED_COUNT} plugin caches)"
  fi
else
  echo "⏭️  Cache prune skipped (--no-cache-prune)"
fi

echo ""

# Step 5: Project-Connect Schema Check
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔗 Step 5: Checking project-connect repo schemas..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

MIGRATE_SCRIPT=""
# Find migration script via same resolution as find_script but for top-level scripts
for candidate in \
  "$PWD/plugins/opspal-core/scripts/project-connect-schema-migrate.js" \
  "$PWD/.claude-plugins/opspal-core/scripts/project-connect-schema-migrate.js" \
  "./plugins/opspal-core/scripts/project-connect-schema-migrate.js" \
  "./.claude-plugins/opspal-core/scripts/project-connect-schema-migrate.js"; do
  [ -f "$candidate" ] && MIGRATE_SCRIPT="$candidate" && break
done
if [ -z "$MIGRATE_SCRIPT" ]; then
  for root in "${CLAUDE_ROOTS[@]}"; do
    found=$(find "$root/plugins" -name "project-connect-schema-migrate.js" -path "*/opspal-core/scripts/*" 2>/dev/null | sort -V | tail -1)
    [ -n "$found" ] && MIGRATE_SCRIPT="$found" && break
  done
fi

if [ -n "$MIGRATE_SCRIPT" ] && [ -d "$PWD/orgs" ]; then
  # Scan for orgs with old repo/ layout
  STALE_COUNT=0
  MIGRATED_COUNT=0
  for org_dir in "$PWD"/orgs/*/; do
    slug="$(basename "$org_dir")"
    if [ -d "$org_dir/repo/.git" ] && [ ! -d "$org_dir/.repo/.git" ]; then
      STALE_COUNT=$((STALE_COUNT + 1))
      echo "  Found stale schema: $slug (repo/ → needs .repo/ migration)"
    elif [ -d "$org_dir/.repo/.git" ]; then
      MIGRATED_COUNT=$((MIGRATED_COUNT + 1))
    fi
  done

  if [ "$STALE_COUNT" -gt 0 ]; then
    if [ "$SKIP_FIX" = true ]; then
      echo ""
      echo "⚠️  $STALE_COUNT org(s) need schema migration (skipped: --skip-fix)"
      echo "   Run: node scripts/project-connect-schema-migrate.js --all"
    else
      echo ""
      echo "  Auto-migrating $STALE_COUNT org(s)..."
      node "$MIGRATE_SCRIPT" --all --workspace "$PWD"
      if [ $? -ne 0 ]; then
        EXIT_CODE=1
        echo ""
        echo "⚠️  Schema migration completed with errors"
      else
        echo ""
        echo "✅ Schema migration complete"
      fi
    fi
  else
    if [ "$MIGRATED_COUNT" -gt 0 ]; then
      echo "✅ All $MIGRATED_COUNT connected org(s) already on symlink schema"
    else
      echo "⏭️  No project-connected orgs found, skipping"
    fi
  fi
else
  echo "⏭️  Not in a workspace with orgs/ or migration script not found, skipping"
fi

echo ""

# Step 6: Project-Connect Auto-Sync Enablement
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔄 Step 6: Checking project-connect auto-sync..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Find sync-all script
REPO_SYNC_SCRIPT=""
for candidate in \
  "$PWD/plugins/opspal-core/scripts/project-connect-sync-all.sh" \
  "$PWD/.claude-plugins/opspal-core/scripts/project-connect-sync-all.sh" \
  "./plugins/opspal-core/scripts/project-connect-sync-all.sh" \
  "./.claude-plugins/opspal-core/scripts/project-connect-sync-all.sh"; do
  [ -f "$candidate" ] && REPO_SYNC_SCRIPT="$candidate" && break
done
if [ -z "$REPO_SYNC_SCRIPT" ]; then
  for root in "${CLAUDE_ROOTS[@]}"; do
    found=$(find "$root/plugins" -name "project-connect-sync-all.sh" -path "*/opspal-core/scripts/*" 2>/dev/null | sort -V | tail -1)
    [ -n "$found" ] && REPO_SYNC_SCRIPT="$found" && break
  done
fi

# Find scheduler manager
SCHEDULER_SCRIPT=""
for candidate in \
  "$PWD/plugins/opspal-core/scheduler/scripts/lib/scheduler-manager.js" \
  "$PWD/.claude-plugins/opspal-core/scheduler/scripts/lib/scheduler-manager.js" \
  "./plugins/opspal-core/scheduler/scripts/lib/scheduler-manager.js" \
  "./.claude-plugins/opspal-core/scheduler/scripts/lib/scheduler-manager.js"; do
  [ -f "$candidate" ] && SCHEDULER_SCRIPT="$candidate" && break
done
if [ -z "$SCHEDULER_SCRIPT" ]; then
  for root in "${CLAUDE_ROOTS[@]}"; do
    found=$(find "$root/plugins" -name "scheduler-manager.js" -path "*/opspal-core/scheduler/scripts/lib/*" 2>/dev/null | sort -V | tail -1)
    [ -n "$found" ] && SCHEDULER_SCRIPT="$found" && break
  done
fi

if [ -d "$PWD/orgs" ]; then
  # Count orgs with .sync-manifest.json (project-connected repos)
  CONNECTED_ORGS=$(find "$PWD/orgs" -maxdepth 2 -name ".sync-manifest.json" 2>/dev/null | wc -l | tr -d ' ')

  if [ "$CONNECTED_ORGS" -gt 0 ]; then
    echo "  Found $CONNECTED_ORGS project-connected org(s)"

    # Check if ENABLE_GIT_SYNC is explicitly disabled
    if [ "${ENABLE_GIT_SYNC:-1}" = "0" ]; then
      echo "  ⏭️  Git sync disabled (ENABLE_GIT_SYNC=0), skipping auto-sync setup"
    else
      # Run an initial sync to pull latest changes
      if [ -n "$REPO_SYNC_SCRIPT" ]; then
        echo "  Running initial sync..."
        SYNC_OUT=$(timeout 30 bash "$REPO_SYNC_SCRIPT" --pull --workspace "$PWD" 2>/dev/null) || true
        SYNC_SYNCED=$(echo "$SYNC_OUT" | grep -o '"synced":[0-9]*' | grep -o '[0-9]*' || echo "0")
        SYNC_ERRORS=$(echo "$SYNC_OUT" | grep -o '"errors":\[[^]]*\]' || echo '"errors":[]')
        if [ "$SYNC_ERRORS" = '"errors":[]' ] || [ -z "$SYNC_ERRORS" ]; then
          echo "  ✅ Synced $SYNC_SYNCED repo(s) successfully"
        else
          echo "  ⚠️  Synced $SYNC_SYNCED repo(s) with warnings (check ~/.claude/logs/project-connect-sync.jsonl)"
        fi
      else
        echo "  ⚠️  project-connect-sync-all.sh not found - cannot run initial sync"
      fi

      # Check if scheduler periodic task is installed
      if [ -n "$SCHEDULER_SCRIPT" ]; then
        # Check if the periodic sync task is in crontab
        CRON_INSTALLED=false
        if crontab -l 2>/dev/null | grep -q "project-connect-periodic-sync\|project-connect-sync-all" 2>/dev/null; then
          CRON_INSTALLED=true
        fi

        if [ "$CRON_INSTALLED" = true ]; then
          echo "  ✅ Periodic sync cron already installed (every 30 min)"
        else
          if [ "$SKIP_FIX" = true ]; then
            echo "  ℹ️  Periodic sync cron not installed (skipped: --skip-fix)"
            echo "     Install with: node $(basename "$(dirname "$(dirname "$(dirname "$SCHEDULER_SCRIPT")")")")/scheduler/scripts/lib/scheduler-manager.js install"
          else
            echo "  Installing periodic sync cron (every 30 min)..."
            node "$SCHEDULER_SCRIPT" install 2>/dev/null
            if [ $? -eq 0 ]; then
              echo "  ✅ Periodic sync cron installed"
            else
              echo "  ⚠️  Could not install cron (non-blocking) - install manually:"
              echo "     node $SCHEDULER_SCRIPT install"
            fi
          fi
        fi
      else
        echo "  ℹ️  Scheduler not found - periodic sync not configured"
      fi

      # Verify the SessionStart hook is registered
      HOOK_REGISTERED=false
      for root in "${CLAUDE_ROOTS[@]}"; do
        if [ -f "$root/settings.json" ]; then
          if grep -q "session-start-repo-sync" "$root/settings.json" 2>/dev/null; then
            HOOK_REGISTERED=true
            break
          fi
        fi
      done
      # Also check plugin hooks.json
      for candidate in \
        "$PWD/plugins/opspal-core/.claude-plugin/hooks.json" \
        "$PWD/.claude-plugins/opspal-core/.claude-plugin/hooks.json"; do
        if [ -f "$candidate" ] && grep -q "session-start-repo-sync" "$candidate" 2>/dev/null; then
          HOOK_REGISTERED=true
          break
        fi
      done

      if [ "$HOOK_REGISTERED" = true ]; then
        echo "  ✅ SessionStart sync hook registered"
      else
        echo "  ⚠️  SessionStart sync hook not found in hooks config"
        echo "     This hook auto-pulls connected repos at session start."
        echo "     Ensure opspal-core v2.24.0+ is installed."
      fi

      echo ""
      echo "  Auto-sync summary:"
      echo "    Session start: $([ "$HOOK_REGISTERED" = true ] && echo "enabled" || echo "not configured")"
      echo "    Periodic (30m): $([ "${CRON_INSTALLED:-false}" = true ] && echo "enabled" || echo "$([ "$SKIP_FIX" = true ] && echo "not installed" || echo "just installed")")"
      echo "    Opt-out: export ENABLE_GIT_SYNC=0"
    fi
  else
    echo "⏭️  No project-connected orgs found (no .sync-manifest.json in orgs/)"
  fi
else
  echo "⏭️  Not in a workspace with orgs/, skipping"
fi

echo ""

# Step 7: CLAUDE.md Sync
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📝 Step 7: Syncing CLAUDE.md..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

SYNC_SCRIPT=$(find_script "sync-claudemd.js")
if [ -n "$SYNC_SCRIPT" ]; then
  node "$SYNC_SCRIPT" $VERBOSE_FLAG
  if [ $? -ne 0 ]; then
    EXIT_CODE=1
    echo ""
    echo "⚠️  CLAUDE.md sync completed with warnings"
  else
    echo ""
    echo "✅ CLAUDE.md synced successfully"
  fi
else
  echo "⚠️  sync-claudemd.js not found - skipping CLAUDE.md sync"
  EXIT_CODE=1
fi

echo ""

# Step 8: Routing Promotion Verification
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🚦 Step 8: Routing promotion verification & condensed routing pre-gen..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 7a: Check CLAUDE.md has the critical routing preamble
CLAUDEMD_PATH="$PWD/CLAUDE.md"
PREAMBLE_OK=false
if [ -f "$CLAUDEMD_PATH" ]; then
  if grep -q "CRITICAL: Agent Routing Rules" "$CLAUDEMD_PATH" 2>/dev/null; then
    PREAMBLE_OK=true
    echo "✅ CLAUDE.md contains critical routing preamble"
  else
    echo "⚠️  CLAUDE.md missing critical routing preamble (re-run /sync-claudemd)"
  fi
else
  echo "⚠️  CLAUDE.md not found at $CLAUDEMD_PATH"
fi

# 7b: Count mandatory vs recommended routes in routing index
ROUTING_INDEX=""
for candidate in \
  "$PWD/plugins/opspal-core/routing-index.json" \
  "$PWD/.claude-plugins/opspal-core/routing-index.json"; do
  [ -f "$candidate" ] && ROUTING_INDEX="$candidate" && break
done

if [ -n "$ROUTING_INDEX" ] && command -v node >/dev/null 2>&1; then
  ROUTE_STATS=$(node -e "
    const idx = JSON.parse(require('fs').readFileSync('$ROUTING_INDEX', 'utf8'));
    const agents = idx.agents || {};
    let mandatory = 0, recommended = 0, total = 0;
    for (const [k, a] of Object.entries(agents)) {
      if (!a.triggerKeywords || a.triggerKeywords.length === 0) continue;
      total++;
      const desc = (a.description || '').toLowerCase();
      if (/must be used|mandatory|blocked operation/i.test(desc)) mandatory++;
      else if (/proactively|recommended/i.test(desc)) recommended++;
    }
    console.log(mandatory + '|' + recommended + '|' + total);
  " 2>/dev/null || echo "0|0|0")

  MAND_COUNT="${ROUTE_STATS%%|*}"
  REST="${ROUTE_STATS#*|}"
  REC_COUNT="${REST%%|*}"
  TOTAL_COUNT="${REST#*|}"
  echo "  Routing index: $MAND_COUNT mandatory, $REC_COUNT recommended, $TOTAL_COUNT total routable agents"
else
  echo "  ⚠️  Routing index not found - routing stats unavailable"
fi

# 7c: Pre-generate condensed routing for post-compaction hook
REFRESHER_SCRIPT=$(find_script "routing-context-refresher.js")
CONDENSED_DIR="$HOME/.claude/session-context"
CONDENSED_FILE="$CONDENSED_DIR/condensed-routing.txt"

if [ -n "$REFRESHER_SCRIPT" ]; then
  mkdir -p "$CONDENSED_DIR" 2>/dev/null || true
  node "$REFRESHER_SCRIPT" --format=compact --output="$CONDENSED_FILE" >/dev/null 2>&1
  if [ -f "$CONDENSED_FILE" ]; then
    CONDENSED_SIZE=$(wc -c < "$CONDENSED_FILE" 2>/dev/null | tr -d ' ')
    echo "✅ Condensed routing pre-generated ($CONDENSED_SIZE bytes → $CONDENSED_FILE)"
  else
    echo "⚠️  Failed to pre-generate condensed routing (non-blocking)"
  fi
else
  echo "⚠️  routing-context-refresher.js not found - skipping condensed routing pre-gen"
fi

echo ""

# Summary
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
echo "━━━ Recommended Next Steps ━━━"
echo ""
echo "   1. Restart Claude Code if this run repaired installed runtime or hook settings"
echo "   2. Review changes in CLAUDE.md"
echo "   3. Commit updates to version control:"
echo "      git add CLAUDE.md plugins/ .claude-plugins/"
echo "      git commit -m 'chore: Update OpsPal plugins'"
echo ""

exit $EXIT_CODE
