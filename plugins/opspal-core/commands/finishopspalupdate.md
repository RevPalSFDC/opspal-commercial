---
description: Run post-update validation, routing health checks, cache prune, and documentation sync
argument-hint: "[--skip-fix] [--verbose] [--no-cache-prune] [--strict] [--workspace path] [--claude-root path] [--json]"
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
# Find finish script in multiple locations
SCRIPT_PATHS=(
  "./plugins/opspal-core/scripts/finish-opspal-update.sh"
  "./.claude-plugins/opspal-core/scripts/finish-opspal-update.sh"
  "$HOME/.claude/plugins/opspal-core/scripts/finish-opspal-update.sh"
  "$HOME/.claude/plugins/marketplaces/opspal-commercial/plugins/opspal-core/scripts/finish-opspal-update.sh"
)

if [ -n "${CLAUDE_HOME:-}" ]; then
  SCRIPT_PATHS+=("$CLAUDE_HOME/plugins/opspal-core/scripts/finish-opspal-update.sh")
  SCRIPT_PATHS+=("$CLAUDE_HOME/plugins/marketplaces/opspal-commercial/plugins/opspal-core/scripts/finish-opspal-update.sh")
fi
if [ -n "${CLAUDE_CONFIG_DIR:-}" ]; then
  SCRIPT_PATHS+=("$CLAUDE_CONFIG_DIR/plugins/opspal-core/scripts/finish-opspal-update.sh")
  SCRIPT_PATHS+=("$CLAUDE_CONFIG_DIR/plugins/marketplaces/opspal-commercial/plugins/opspal-core/scripts/finish-opspal-update.sh")
fi

if [ -n "${WSL_DISTRO_NAME:-}" ] || [ -n "${WSL_INTEROP:-}" ]; then
  if [ -n "${USERPROFILE:-}" ] && command -v wslpath >/dev/null 2>&1; then
    WIN_PROFILE="$(wslpath -u "$USERPROFILE" 2>/dev/null || true)"
    [ -n "$WIN_PROFILE" ] && SCRIPT_PATHS+=("$WIN_PROFILE/.claude/plugins/marketplaces/opspal-commercial/plugins/opspal-core/scripts/finish-opspal-update.sh")
  fi
fi

for mp_dir in "$HOME/.claude/plugins/marketplaces"/*/plugins/opspal-core/scripts; do
  [ -f "$mp_dir/finish-opspal-update.sh" ] && SCRIPT_PATHS+=("$mp_dir/finish-opspal-update.sh")
done

for cache_script in "$HOME/.claude/plugins/cache"/*/opspal-core/*/scripts/finish-opspal-update.sh; do
  [ -f "$cache_script" ] && SCRIPT_PATHS+=("$cache_script")
done

FOUND_SCRIPT=""
for path in "${SCRIPT_PATHS[@]}"; do
  if [ -f "$path" ]; then
    FOUND_SCRIPT="$path"
    break
  fi
done

if [ -z "$FOUND_SCRIPT" ]; then
  echo "Error: finish-opspal-update.sh not found"
  echo ""
  echo "Searched locations:"
  for path in "${SCRIPT_PATHS[@]}"; do
    echo "  - $path"
  done
  exit 1
fi

chmod +x "$FOUND_SCRIPT" 2>/dev/null || true
if [ -n "${ARGUMENTS:-}" ]; then
  read -r -a UPDATE_ARGS <<< "$ARGUMENTS"
  bash "$FOUND_SCRIPT" "${UPDATE_ARGS[@]}"
else
  bash "$FOUND_SCRIPT"
fi
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

2. **Cleans stale plugin hooks from settings.json and activates the bundled OpsPal statusline**:
   - Detects hook entries in `~/.claude/settings.json` that duplicate plugin `hooks.json`
   - Removes entries pointing to plugin hook scripts (e.g., `unified-router.sh`) that should only run via the plugin's `hooks.json` (which includes safe env overrides)
   - Prevents false-positive hard blocks caused by duplicate hook execution without env overrides
   - Ensures `statusLine` points at the shipped `scripts/opspal-statusline.js`
   - Preserves an unrelated custom statusline if the user already configured one

3. **Repairs and verifies the installed runtime before routing validation**:
   - Runs `post-plugin-update-fixes.js` to reconcile the live installed runtime
   - Ensures `installed_plugins.json` points at the current versioned cache entry
   - Syncs the canonical cache bundle, including `.claude-plugin/hooks.json`, ambient reflection runtime assets, and the finish/update runtime helpers used for hook reconciliation
   - Reconciles user-level hook wiring so session capture plus ambient reflection candidate, hook-error, and flush hooks are enabled automatically after updates
   - Verifies wildcard `PreToolUse(*)` routing gate registration
   - Clears expired routing state, legacy routing-state files, and routing circuit breaker files

4. **Refreshes routing artifacts and validates routing + hook health**:
   - Rebuilds `routing-index.json`
   - Rebuilds agent alias and command registries
   - Clears semantic routing vector cache
   - Runs `scripts/ci/validate-routing.sh` (includes semver leak guardrail checks)
   - Runs a quick `hook-health-checker.js` pass to catch degraded or unhealthy hook wiring

5. **Prunes stale cached plugin versions**:
   - Scans Claude marketplace plugin cache directories
   - Removes older semver version folders
   - Keeps latest 2 versions per plugin for rollback safety

6. **Checks and auto-fixes project-connect repo schemas**:
   - Scans `orgs/*/` for old `repo/` layout (pre-symlink)
   - Auto-migrates to `.repo/` + symlinks schema
   - Installs git hooks, updates org.yaml and registry
   - Respects `--skip-fix` (report-only mode)

7. **Enables project-connect auto-sync** for connected orgs:
   - Detects orgs with `.sync-manifest.json` (project-connected repos)
   - Runs initial `--pull` sync to bring repos up to date
   - Installs scheduler cron (every 30 min periodic fetch+pull)
   - Verifies SessionStart hook is registered (auto-pull on session start)
   - Reports auto-sync status summary
   - Respects `--skip-fix` (report-only for cron install)

8. **Runs `/sync-claudemd`** - Updates CLAUDE.md with latest plugin info:
   - Plugin versions and feature counts
   - Agent routing tables (with Agent() invocation examples)
   - Command references
   - Trigger keywords

9. **Routing promotion verification** - Validates routing visibility:
   - Checks CLAUDE.md contains the critical routing preamble
   - Counts mandatory vs recommended routes from routing-index.json
   - Pre-generates condensed routing text for post-compaction hook refresh
   - Writes a machine-readable finish report and clears the pending update session state

10. **Sub-agent tool access remediation** - Ensures sub-agents can use their declared tools:

11. **Runbook automation enablement** - Verifies the Living Runbook System automation is wired up:
   - Checks incremental updater CLI module is present
   - Checks automation status tracker is present
   - Verifies post-operation hook has `ENABLE_AUTO_RUNBOOK` integration
   - Verifies post-reflect hook has `ENABLE_AUTO_RUNBOOK` integration
   - Checks reconciliation engine is present
   - Reports `ENABLE_AUTO_RUNBOOK` status (default: enabled)
   - Shows status command for verification: `node scripts/lib/runbook-status-reporter.js --org <your-org>`
   - Verifies the Bash permission contract is opt-in only (SUBAGENT_BASH_CONTRACT_ENABLED guard)
   - Confirms the deploy execution contract prompt injection is removed
   - Validates pre-deploy-agent-context-check.sh reads agent_type from hook JSON input
   - Reports any legacy bypass env vars (ALLOW_PLUGIN_DEPLOY_SUBAGENT_EXECUTION)

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

### Explicit Workspace / Claude Root

```bash
/finishopspalupdate --workspace /path/to/repo --claude-root /path/to/.claude
```

Runs finish validation against a specific workspace or Claude runtime root. If omitted, the command will reuse the persisted start-session manifest when present.

### Machine-Readable Output (--json)

```bash
/finishopspalupdate --json
```

Emits the final finish report JSON to stdout for wrappers and CI automation.

## Two-Command Workflow

This command is the second step of a two-command workflow:

```
/startopspalupdate          ← Pulls latest from marketplace
         ↓
/finishopspalupdate         ← You are here (repairs runtime + validates + routing health + cache prune + syncs)
```

### Complete Workflow Example

```bash
# Step 1: Update all plugins from marketplace
/startopspalupdate

# Step 2: Repair runtime + activate statusline + refresh routing + prune cache + sync documentation
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
🧹 Step 2: Cleaning stale plugin hooks and activating the OpsPal statusline...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ No stale plugin hooks found in settings.json
✅ Activated OpsPal statusline in ~/.claude/settings.json

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🧭 Step 3: Reconciling installed runtime, refreshing routing artifacts, and validating hook health...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ Runtime reconciliation completed
✅ Hook registration reconciliation passed
✅ Installed runtime parity verified
✅ Cleared expired session-scoped routing state
✅ Routing index rebuilt
✅ Agent/command alias registries rebuilt
✅ Cleared semantic routing vector cache
✅ CI routing validation passed (0 warnings)
✅ Hook health check passed (HEALTHY)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🧹 Step 4: Pruning stale plugin cache versions...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ Cache prune complete (34 old versions removed across 17 plugin caches)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔗 Step 5: Checking project-connect repo schemas...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ All 1 connected org(s) already on symlink schema

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔄 Step 6: Checking project-connect auto-sync...
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
📝 Step 7: Syncing CLAUDE.md...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📝 Updating CLAUDE.md...

✅ CLAUDE.md Updated Successfully!

✅ CLAUDE.md synced successfully

╔════════════════════════════════════════════════════════════════╗
║    Update Complete                                             ║
╚════════════════════════════════════════════════════════════════╝

✅ All post-update tasks completed successfully!

   Your plugins are now up-to-date and validated.
   Installed runtime parity, routing artifacts, and guardrails have been refreshed.
   CLAUDE.md has been updated with new routing tables.

━━━ Recommended Next Steps ━━━

   1. Restart Claude Code if this run repaired installed runtime or hook settings
   2. Review changes in CLAUDE.md
   3. Commit updates to version control:
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
| Hooks | Real `.claude-plugin/hooks.json` commands, executable permissions, valid syntax | `chmod +x` |
| MCP Servers | Playwright, Supabase, Asana | Connection guidance |
| Cache Directories | Required temp directories | `mkdir -p` |
| Hook Registration | Merge plugin hooks to settings | Auto-merge |

### Stale Hook Cleanup

| Check | Description |
|-------|-------------|
| Duplicate plugin hooks in settings.json | Removes hook entries that point to plugin scripts (e.g., `unified-router.sh`) which are already managed by the plugin's `hooks.json` with safe env overrides |

### Installed Runtime Parity

| Check | Description |
|-------|-------------|
| `installed_plugins.json` parity | Ensures opspal-core install records point at the current versioned cache path |
| Cache bundle integrity | Verifies `.claude-plugin/hooks.json`, routing hooks, routing-state-manager, and MCP tool policies exist in the active cache entry |
| Wildcard routing gate | Verifies cached `hooks.json` still contains the `PreToolUse(*)` routing gate |

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
| Runtime State Cleanup | Clears expired session routing state, legacy `routing-state.json`, and routing circuit breaker files |

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success - all steps passed |
| 1 | Partial success - some warnings |

## Troubleshooting

### "plugin-update-manager.js not found"

The script searches multiple locations. Ensure opspal-core is properly installed:

```bash
ls plugins/opspal-core/scripts/lib/plugin-update-manager.js
ls .claude-plugins/opspal-core/scripts/lib/plugin-update-manager.js
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

- **v1.8.0** (2026-03-21) - Added sub-agent tool access remediation (Step 9)
  - Verifies Bash permission contract is opt-in (SUBAGENT_BASH_CONTRACT_ENABLED guard)
  - Confirms deploy execution contract prompt injection is removed
  - Validates agent_type extraction from hook JSON input in pre-deploy-agent-context-check.sh
  - Auto-patches stale validators that still have active Bash contracts

- **v1.7.0** (2026-03-17) - Added installed runtime parity repair and hook health validation
  - Reconciles `installed_plugins.json` with the current versioned cache bundle
  - Verifies cached `.claude-plugin/hooks.json` still contains the wildcard `PreToolUse(*)` routing gate
  - Clears stale routing state and routing circuit breaker files during finish step
  - Adds quick hook health validation after routing artifact refresh

- **v1.6.0** (2026-03-16) - Added stale plugin hook cleanup (Step 2)
  - Detects and removes duplicate hook entries in settings.json that bypass plugin hooks.json env overrides
  - Prevents false-positive UserPromptSubmit hard blocks from stale unified-router.sh entries
  - Activates the bundled OpsPal statusline unless the user already has an unrelated custom statusline
  - All steps renumbered (now 8 steps total)

- **v1.5.0** (2026-03-09) - Added routing promotion verification (Step 8)
  - Validates CLAUDE.md contains critical routing preamble
  - Counts mandatory/recommended routes from routing-index.json
  - Pre-generates condensed routing for post-compaction hook refresh
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
