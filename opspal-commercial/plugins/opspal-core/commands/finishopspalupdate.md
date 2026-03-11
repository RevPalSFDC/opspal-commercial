---
description: Run post-update validation, routing health checks, cache prune, and documentation sync
argument-hint: "[--skip-fix] [--verbose] [--no-cache-prune]"
allowed_tools:
  - Bash
tags:
  - update
  - maintenance
  - validation
  - sync
aliases:
  - finish-update
  - opspalfinish
---

# Finish OpsPal Plugin Update

Complete the plugin update process by running validation, routing health checks, and documentation sync.

## EXECUTE IMMEDIATELY

Run the post-update validation steps:

```bash
echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║    OpsPal Post-Update Validation                               ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Parse arguments
SKIP_FIX=false
VERBOSE_FLAG=""
CACHE_PRUNE=true
for arg in $ARGUMENTS; do
  case $arg in
    --skip-fix) SKIP_FIX=true ;;
    --verbose) VERBOSE_FLAG="--verbose" ;;
    --no-cache-prune) CACHE_PRUNE=false ;;
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
    "${CLAUDE_PLUGIN_ROOT}/scripts/lib/$script_name"
    "${CLAUDE_PLUGIN_ROOT}/scripts/lib/$script_name"
    "${CLAUDE_PLUGIN_ROOT}/scripts/lib/$script_name"
    "${CLAUDE_PLUGIN_ROOT}/scripts/lib/$script_name"
  )

  local root mp_dir cache_hit found
  for root in "${CLAUDE_ROOTS[@]}"; do
    paths+=("$root/plugins/marketplaces/revpal-internal-plugins/${CLAUDE_PLUGIN_ROOT}/scripts/lib/$script_name")
    for mp_dir in "$root/plugins/marketplaces"/*/${CLAUDE_PLUGIN_ROOT}/scripts/lib; do
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
    "${CLAUDE_PLUGIN_ROOT}/scripts/ci/$script_name"
    "${CLAUDE_PLUGIN_ROOT}/scripts/ci/$script_name"
    "${CLAUDE_PLUGIN_ROOT}/scripts/ci/$script_name"
    "${CLAUDE_PLUGIN_ROOT}/scripts/ci/$script_name"
  )

  local root mp_dir cache_hit found
  for root in "${CLAUDE_ROOTS[@]}"; do
    paths+=("$root/plugins/marketplaces/revpal-internal-plugins/${CLAUDE_PLUGIN_ROOT}/scripts/ci/$script_name")
    for mp_dir in "$root/plugins/marketplaces"/*/${CLAUDE_PLUGIN_ROOT}/scripts/ci; do
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

prune_versioned_plugin_root() {
  local plugin_dir="$1"

  SCANNED_TOTAL=$((SCANNED_TOTAL + 1))

  mapfile -t versions < <(
    find "$plugin_dir" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' 2>/dev/null \
    | grep -E '^[0-9]+\.[0-9]+\.[0-9]+([.-][0-9A-Za-z.-]+)?$' \
    | sort -V
  )

  local count="${#versions[@]}"
  if [ "$count" -le 2 ]; then
    return 0
  fi

  local to_remove=$((count - 2))
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

# Step 2: Routing Artifact Refresh + Validation
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🧭 Step 2: Refreshing routing artifacts and validating routing health..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

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

echo ""

# Step 3: Cache Prune
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🧹 Step 3: Pruning stale plugin cache versions..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if [ "$CACHE_PRUNE" = true ]; then
  PRUNE_RESULT=$(prune_marketplace_cache_versions)
  PRUNED_COUNT="${PRUNE_RESULT%%|*}"
  SCANNED_COUNT="${PRUNE_RESULT##*|}"
  echo "✅ Cache prune complete (${PRUNED_COUNT} old versions removed across ${SCANNED_COUNT} plugin caches)"
else
  echo "⏭️  Cache prune skipped (--no-cache-prune)"
fi

echo ""

# Step 4: Project-Connect Schema Check
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔗 Step 4: Checking project-connect repo schemas..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

MIGRATE_SCRIPT=""
# Find migration script via same resolution as find_script but for top-level scripts
for candidate in \
  "${CLAUDE_PLUGIN_ROOT}/scripts/project-connect-schema-migrate.js" \
  "${CLAUDE_PLUGIN_ROOT}/scripts/project-connect-schema-migrate.js" \
  "${CLAUDE_PLUGIN_ROOT}/scripts/project-connect-schema-migrate.js" \
  "${CLAUDE_PLUGIN_ROOT}/scripts/project-connect-schema-migrate.js"; do
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

# Step 5: Project-Connect Auto-Sync Enablement
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔄 Step 5: Checking project-connect auto-sync..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Find sync-all script
REPO_SYNC_SCRIPT=""
for candidate in \
  "${CLAUDE_PLUGIN_ROOT}/scripts/project-connect-sync-all.sh" \
  "${CLAUDE_PLUGIN_ROOT}/scripts/project-connect-sync-all.sh" \
  "${CLAUDE_PLUGIN_ROOT}/scripts/project-connect-sync-all.sh" \
  "${CLAUDE_PLUGIN_ROOT}/scripts/project-connect-sync-all.sh"; do
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
  "${CLAUDE_PLUGIN_ROOT}/scheduler/scripts/lib/scheduler-manager.js" \
  "${CLAUDE_PLUGIN_ROOT}/scheduler/scripts/lib/scheduler-manager.js" \
  "${CLAUDE_PLUGIN_ROOT}/scheduler/scripts/lib/scheduler-manager.js" \
  "${CLAUDE_PLUGIN_ROOT}/scheduler/scripts/lib/scheduler-manager.js"; do
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

# Step 6: CLAUDE.md Sync
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📝 Step 6: Syncing CLAUDE.md..."
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

# Summary
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║    Update Complete                                             ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

if [ $EXIT_CODE -eq 0 ]; then
  echo "✅ All post-update tasks completed successfully!"
  echo ""
  echo "   Your plugins are now up-to-date and validated."
  echo "   Routing artifacts and guardrails have been refreshed."
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
echo "   1. Review changes in CLAUDE.md"
echo "   2. Commit updates to version control:"
echo "      git add CLAUDE.md plugins/ .claude-plugins/"
echo "      git commit -m 'chore: Update OpsPal plugins'"
echo ""

exit $EXIT_CODE
```

After execution, summarize the results to the user.

---

## What This Command Does

1. **Runs `/pluginupdate --fix`** - Validates all plugin configurations and auto-fixes issues:
   - System dependencies (jq, node, sf CLI)
   - NPM packages across all plugins
   - Security vulnerabilities (npm audit)
   - Hook permissions and registration
   - MCP server connectivity
   - Cache directories

2. **Refreshes routing artifacts and validates routing health**:
   - Rebuilds `routing-index.json`
   - Rebuilds agent alias and command registries
   - Clears semantic routing vector cache
   - Runs `scripts/ci/validate-routing.sh` (includes semver leak guardrail checks)

3. **Prunes stale cached plugin versions**:
   - Scans Claude marketplace plugin cache directories
   - Removes older semver version folders
   - Keeps latest 2 versions per plugin for rollback safety

4. **Checks and auto-fixes project-connect repo schemas**:
   - Scans `orgs/*/` for old `repo/` layout (pre-symlink)
   - Auto-migrates to `.repo/` + symlinks schema
   - Installs git hooks, updates org.yaml and registry
   - Respects `--skip-fix` (report-only mode)

5. **Enables project-connect auto-sync** for connected orgs:
   - Detects orgs with `.sync-manifest.json` (project-connected repos)
   - Runs initial `--pull` sync to bring repos up to date
   - Installs scheduler cron (every 30 min periodic fetch+pull)
   - Verifies SessionStart hook is registered (auto-pull on session start)
   - Reports auto-sync status summary
   - Respects `--skip-fix` (report-only for cron install)

6. **Runs `/sync-claudemd`** - Updates CLAUDE.md with latest plugin info:
   - Plugin versions and feature counts
   - Agent routing tables
   - Command references
   - Trigger keywords

## Options

### Skip Auto-Fix

```bash
/finishopspalupdate --skip-fix
```

Runs validation in check-only mode without auto-fixing issues.

### Verbose Output

```bash
/finishopspalupdate --verbose
```

Shows detailed output for validation, routing checks, and sync steps.

### Skip Cache Prune

```bash
/finishopspalupdate --no-cache-prune
```

Skips removal of old cached plugin versions.

## Two-Command Workflow

This command is the second step of a two-command workflow:

```
/startopspalupdate          ← Pulls latest from marketplace
         ↓
/finishopspalupdate         ← You are here (validates + routing health + cache prune + syncs)
```

### Complete Workflow Example

```bash
# Step 1: Update all plugins from marketplace
/startopspalupdate

# Step 2: Validate + refresh routing + prune cache + sync documentation
/finishopspalupdate

# Step 3: Commit changes
git add CLAUDE.md .claude-plugins/ plugins/
git commit -m "chore: Update OpsPal plugins to latest versions"
```

## Example Output

```
╔════════════════════════════════════════════════════════════════╗
║    OpsPal Post-Update Validation                               ║
╚════════════════════════════════════════════════════════════════╝

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔧 Step 1: Running plugin validation...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Plugin Update Check - 2026-02-05
================================

✅ Dependencies (5/5 passed)
✅ NPM Packages (47/47 passed)
✅ Security Vulnerabilities (0 found)
✅ Environment (8/10 - 2 optional missing)
✅ MCP Servers (3/3 connected)
✅ Cache Directories (12/12 exist)
✅ Hooks (195/195 valid)
✅ Hook Registration (merged into settings.json)

Overall: READY (0 warnings)

✅ Plugin validation passed

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🧭 Step 2: Refreshing routing artifacts and validating routing health...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ Routing index rebuilt
✅ Agent/command alias registries rebuilt
✅ Cleared semantic routing vector cache
✅ CI routing validation passed (0 warnings)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🧹 Step 3: Pruning stale plugin cache versions...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ Cache prune complete (34 old versions removed across 17 plugin caches)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔗 Step 4: Checking project-connect repo schemas...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ All 1 connected org(s) already on symlink schema

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔄 Step 5: Checking project-connect auto-sync...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Found 1 project-connected org(s)
  Running initial sync...
  ✅ Synced 1 repo(s) successfully
  ✅ Periodic sync cron already installed (every 30 min)
  ✅ SessionStart sync hook registered

  Auto-sync summary:
    Session start: enabled
    Periodic (30m): enabled
    Opt-out: export ENABLE_GIT_SYNC=0

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📝 Step 6: Syncing CLAUDE.md...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📝 Updating CLAUDE.md...

✅ CLAUDE.md Updated Successfully!

✅ CLAUDE.md synced successfully

╔════════════════════════════════════════════════════════════════╗
║    Update Complete                                             ║
╚════════════════════════════════════════════════════════════════╝

✅ All post-update tasks completed successfully!

   Your plugins are now up-to-date and validated.
   Routing artifacts and guardrails have been refreshed.
   CLAUDE.md has been updated with new routing tables.

━━━ Recommended Next Steps ━━━

   1. Review changes in CLAUDE.md
   2. Commit updates to version control:
      git add CLAUDE.md plugins/ .claude-plugins/
      git commit -m 'chore: Update OpsPal plugins'
```

## What Gets Validated

### Plugin Validation (`/pluginupdate`)

| Check | Description | Auto-Fix |
|-------|-------------|----------|
| System Dependencies | jq, node, sf CLI, curl, bc, mmdc | Install instructions |
| NPM Packages | All plugin dependencies | `npm install` |
| Security | npm audit for vulnerabilities | `npm audit fix` |
| Hooks | Executable permissions, valid syntax | `chmod +x` |
| MCP Servers | Playwright, Supabase, Asana | Connection guidance |
| Cache Directories | Required temp directories | `mkdir -p` |
| Hook Registration | Merge plugin hooks to settings | Auto-merge |

### Documentation Sync (`/sync-claudemd`)

| Section | Updates |
|---------|---------|
| Plugin Versions | Latest versions with feature counts |
| Agent Routing | Keywords to agent mapping |
| Command Reference | Available slash commands |
| Trigger Keywords | Agent trigger patterns |

### Routing Health Validation (`validate-routing.sh`)

| Check | Description |
|-------|-------------|
| Index Integrity | `routing-index.json` structure and coverage |
| Keyword Coverage | Ensures all indexed agents have routing keywords |
| Complexity Scoring | Validates high-risk threshold behavior |
| Validator Rules | Ensures mandatory agent enforcement still works |
| Semver Guardrail | Detects stale semver-prefixed agent alias leaks |

### Cache Hygiene

| Check | Description |
|-------|-------------|
| Marketplace + Cache Plugin Versions | Prunes old semver plugin versions in `~/.claude/plugins/marketplaces/*/plugins/*` and `~/.claude/plugins/cache/*/*/*` (WSL-aware roots included) |
| Rollback Safety | Keeps latest 2 versions per plugin |

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success - all steps passed |
| 1 | Partial success - some warnings |

## Troubleshooting

### "plugin-update-manager.js not found"

The script searches multiple locations. Ensure opspal-core is properly installed:

```bash
ls ${CLAUDE_PLUGIN_ROOT}/scripts/lib/plugin-update-manager.js
ls ${CLAUDE_PLUGIN_ROOT}/scripts/lib/plugin-update-manager.js
```

### "CLAUDE.md sync failed"

Check if CLAUDE.md exists. If not, initialize it first:

```bash
/initialize
```

### Hooks not registering

Run with verbose to see details:

```bash
/finishopspalupdate --verbose
```

## Related Commands

| Command | Purpose |
|---------|---------|
| `/startopspalupdate` | First step - pull latest from marketplace |
| `/pluginupdate` | Standalone plugin validation |
| `scripts/ci/validate-routing.sh` | Standalone routing health validation |
| `/sync-claudemd` | Standalone CLAUDE.md sync |
| `/checkdependencies` | NPM dependency check only |

## Version History

- **v1.4.0** (2026-02-17) - Added project-connect auto-sync enablement (Step 5)
  - Detects orgs with `.sync-manifest.json` and runs initial pull sync
  - Installs scheduler cron for periodic 30-min sync
  - Verifies SessionStart hook registration
  - Reports auto-sync status summary with opt-out instructions
- **v1.3.0** (2026-02-17) - Added project-connect schema migration check
  - Detects orgs with old `repo/` layout and auto-migrates to `.repo/` + symlinks
  - Respects `--skip-fix` for report-only mode
  - Installs git hooks and updates org.yaml/registry during migration
- **v1.2.0** (2026-02-10) - Added post-update cached plugin version pruning
  - Prunes old semver plugin cache directories
  - Keeps latest 2 versions per plugin for rollback safety
  - Added `--no-cache-prune` option
- **v1.1.0** (2026-02-10) - Added routing health refresh + guardrail validation
  - Rebuild routing index and alias registries
  - Run CI routing validator (including semver leak checks)
  - Clear semantic vector cache after updates
- **v1.0.0** (2026-02-05) - Initial implementation
  - Combined validation + sync workflow
  - Auto-fix by default with --skip-fix option
  - Clear step-by-step progress output
