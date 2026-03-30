---
name: startopspalupdate
description: Force refresh marketplace and update all installed OpsPal plugins to latest versions
argument-hint: "[--dry-run] [--skip-confirm] [--only plugin1,plugin2] [--history] [--verbose] [--mode external|manual|legacy] [--emit-script-only] [--workspace path] [--claude-root path] [--preflight] [--json]"
allowed_tools:
  - Bash
tags:
  - update
  - maintenance
  - plugins
  - marketplace
aliases:
  - start-update
  - opspalpull
---

# Start OpsPal Plugin Update

Force refresh all installed OpsPal plugins from the marketplace to ensure you have the latest versions.

Default behavior is nested-session-safe: this command generates a host-terminal runner script instead of executing `claude plugin install/uninstall` directly inside Claude Code.

## EXECUTE IMMEDIATELY

Run the update manager script with any provided arguments:

```bash
# Find update manager script in multiple locations
# Priority: 1. Local dev paths, 2. Claude CLI marketplace, 3. Cache fallback, 4. User plugins
SCRIPT_PATHS=(
  "./plugins/opspal-core/scripts/opspal-update-manager.sh"
  "./.claude-plugins/opspal-core/scripts/opspal-update-manager.sh"
  "$HOME/.claude/plugins/opspal-core/scripts/opspal-update-manager.sh"
  "$HOME/.claude/plugins/marketplaces/opspal-commercial/plugins/opspal-core/scripts/opspal-update-manager.sh"
)

# WSL-aware: add Windows profile .claude path if available
if [ -n "${WSL_DISTRO_NAME:-}" ] || [ -n "${WSL_INTEROP:-}" ]; then
  if [ -n "${USERPROFILE:-}" ] && command -v wslpath >/dev/null 2>&1; then
    WIN_PROFILE="$(wslpath -u "$USERPROFILE" 2>/dev/null || true)"
    [ -n "$WIN_PROFILE" ] && SCRIPT_PATHS+=("$WIN_PROFILE/.claude/plugins/marketplaces/opspal-commercial/plugins/opspal-core/scripts/opspal-update-manager.sh")
  fi
fi

# Also check for alternative marketplace names and cache versions
for mp_dir in "$HOME/.claude/plugins/marketplaces"/*/plugins/opspal-core/scripts; do
  [ -f "$mp_dir/opspal-update-manager.sh" ] && SCRIPT_PATHS+=("$mp_dir/opspal-update-manager.sh")
done

for cache_script in "$HOME/.claude/plugins/cache"/*/opspal-core/*/scripts/opspal-update-manager.sh; do
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
  echo "Error: opspal-update-manager.sh not found"
  echo ""
  echo "Searched locations:"
  for path in "${SCRIPT_PATHS[@]}"; do
    echo "  - $path"
  done
  echo ""
  echo "Verify opspal-core is installed: claude plugin list | grep opspal-core"
  exit 1
fi

# Make executable and run
chmod +x "$FOUND_SCRIPT" 2>/dev/null || true
if [ -n "${ARGUMENTS:-}" ]; then
  read -r -a UPDATE_ARGS <<< "$ARGUMENTS"
  bash "$FOUND_SCRIPT" "${UPDATE_ARGS[@]}"
else
  bash "$FOUND_SCRIPT"
fi
```

After execution, remind the user to run `/finishopspalupdate` to complete the process.

---

## What This Command Does

1. **Discovers installed plugins** - Scans multiple locations for OpsPal-related plugins:
   - `./plugins/` (local development)
   - `./.claude-plugins/` (local development)
   - `~/.claude/plugins/marketplaces/*/plugins/` (Claude CLI installations)
   - `~/.claude/plugins/cache/*/<plugin>/<version>/` (cached runtime installs)
   - WSL Windows-profile Claude directories (when available)
2. **Validates Claude auth state** - Checks `claude auth status` before update execution
3. **Builds execution plan** - Based on `--mode`:
   - `external` (default): generates a host-terminal runner script
   - `manual`: prints exact commands to run manually
   - `legacy`: runs install/uninstall directly (blocked in nested session unless explicit override)
4. **Reinstalls from marketplace** - Pulls latest versions when execution actually runs
5. **Repairs cache compatibility paths** - Re-points stale cached versions to newest payload
6. **Persists update session state** - Writes a resumable session manifest for `/finishopspalupdate`
7. **Reports/logs changes** - Tracks upgrade results in update history and machine-readable JSON reports

## Plugin Detection Patterns

The following plugins are detected for update:

| Pattern | Examples |
|---------|----------|
| `opspal-*` | opspal-core, opspal-salesforce, opspal-hubspot, etc. |
| `*-plugin` | salesforce-plugin, hubspot-plugin, marketo-plugin |
| Developer tools | developer-tools-plugin, gtm-planning-plugin |
| Data tools | cross-platform-plugin |

## Options

### Dry Run (Preview)

```bash
/startopspalupdate --dry-run
```

Shows what would be updated without making changes.

### Skip Confirmation

```bash
/startopspalupdate --skip-confirm
```

Skips the confirmation prompt (useful for automation).

### Selective Update (--only)

Update only specific plugins instead of all:

```bash
# Single plugin
/startopspalupdate --only opspal-salesforce

# Multiple plugins (comma-separated)
/startopspalupdate --only salesforce-plugin,opspal-core,opspal-hubspot

# With other options
/startopspalupdate --only opspal-core --dry-run
```

### View Update History (--history)

View recent update history:

```bash
/startopspalupdate --history
```

Shows the last 20 updates with timestamps, versions, and status.

### Execution Mode (--mode)

```bash
# Default (recommended): generate host-terminal runner
/startopspalupdate --mode external

# Print exact commands to run manually
/startopspalupdate --mode manual

# Direct execution (host terminal only; nested session guarded)
/startopspalupdate --mode legacy
```

### Emit Runner Path Only (--emit-script-only)

```bash
/startopspalupdate --only opspal-core --emit-script-only
```

Prints only the generated runner script path for automation wrappers.

### Preflight Checks (--preflight)

```bash
/startopspalupdate --preflight
```

Validates auth, workspace paths, writable update directories, and plugin discovery without performing any update.

### Explicit Workspace / Claude Root

```bash
/startopspalupdate --workspace /path/to/repo --claude-root /path/to/.claude
```

Pins the update workflow to a specific workspace root and Claude runtime root instead of relying on the current shell context.

### Machine-Readable Output (--json)

```bash
/startopspalupdate --mode external --json
```

Emits the final start-session report JSON to stdout for wrappers and CI automation.

### Combined

```bash
/startopspalupdate --only salesforce-plugin --skip-confirm --verbose
```

### Verbose Output

```bash
/startopspalupdate --verbose
```

Shows detailed plugin discovery and update execution diagnostics.

## Example Output

```bash
╔════════════════════════════════════════════════════════════════╗
║    OpsPal Plugin Update Manager                                ║
║    Force refresh from marketplace                              ║
╚════════════════════════════════════════════════════════════════╝

📦 Discovering installed plugins...
   ✓ opspal-core (v2.21.18)
   ✓ opspal-salesforce (v3.77.8)

Found 2 plugin(s) to update

✅ Generated host-terminal update runner

Runner script:
  /tmp/opspal-update/run-opspal-update-20260213T170000Z.sh

Run this in a regular terminal (outside Claude Code session):
  bash "/tmp/opspal-update/run-opspal-update-20260213T170000Z.sh"

After it completes, run:
  /finishopspalupdate
```

## Update History Log

All updates are automatically logged to `~/.claude/logs/opspal-updates.jsonl` in JSONL format:

```json
{"timestamp":"2026-02-05T14:30:00Z","plugin":"opspal-core","old_version":"2.4.0","new_version":"2.5.0","status":"success","execution_mode":"legacy","user":"chris","hostname":"workstation"}
```

View history with:
```bash
/startopspalupdate --history
```

Example output:
```
╔════════════════════════════════════════════════════════════════╗
║    OpsPal Update History                                       ║
╚════════════════════════════════════════════════════════════════╝

Recent updates (last 20):

   ✓ [2026-02-05 14:30] opspal-core: v2.4.0 → v2.5.0
   ✓ [2026-02-05 14:30] opspal-salesforce: v3.70.0 → v3.71.0
   ✓ [2026-02-05 14:30] opspal-hubspot: v3.7.0 (no change)
   ✗ [2026-02-04 09:15] marketo-plugin: FAILED

Log file: /home/chris/.claude/logs/opspal-updates.jsonl
```

## Two-Command Workflow

This command is the first step of a two-command workflow:

```
/startopspalupdate          ← You are here
         ↓
/finishopspalupdate         ← Run after this completes (includes cache prune; use --no-cache-prune to skip)
```

### Why Two Commands?

1. **Separation of concerns** - Update vs. validation are distinct operations
2. **Error isolation** - If marketplace pull fails, validation is skipped
3. **User control** - Review updates before validating
4. **Interruptibility** - Can pause between update and validation

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success - all plugins updated |
| 1 | Partial failure - some plugins failed |
| 2 | Complete failure - no plugins updated |

## Troubleshooting

### "Plugin not found in marketplace"

The marketplace may have renamed or deprecated the plugin. Check the marketplace for the correct name:

```bash
claude plugin search opspal
```

### "opspal-update-manager.sh not found"

The script searches multiple locations. If not found:

1. Verify opspal-core is installed:
   ```bash
   claude plugin list | grep opspal-core
   ```

2. Check where plugins are installed:
   ```bash
   ls ~/.claude/plugins/marketplaces/*/plugins/opspal-core 2>/dev/null
   ls ~/.claude/plugins/cache/*/opspal-core/* 2>/dev/null
   ls ~/.claude/plugins/opspal-core 2>/dev/null
   ls ./plugins/opspal-core 2>/dev/null
   ls ./.claude-plugins/opspal-core 2>/dev/null
   # WSL fallback (if applicable)
   ls /mnt/c/Users/$USERNAME/.claude/plugins/marketplaces/*/plugins/opspal-core 2>/dev/null
   ```

3. Reinstall if needed:
   ```bash
   # Run in a regular terminal
   claude plugin install opspal-core@opspal-commercial
   ```

### "Legacy mode blocked inside Claude session"

`--mode legacy` now enforces nested-session safety.

Use one of these:

```bash
# Recommended
/startopspalupdate --mode external

# Manual commands only
/startopspalupdate --mode manual
```

Only bypass when intentional:

```bash
OPSPAL_UPDATE_ALLOW_IN_SESSION_CLAUDE_CLI=1 /startopspalupdate --mode legacy
```

### "Permission denied"

The script needs execute permission:

```bash
# Find and fix permissions
find ~/.claude/plugins -name "opspal-update-manager.sh" -exec chmod +x {} \;
# Or for local dev:
chmod +x plugins/opspal-core/scripts/opspal-update-manager.sh
```

### "jq not found"

Install jq for version comparison:

```bash
# macOS
brew install jq

# Ubuntu/Debian
sudo apt-get install jq
```

## Related Commands

| Command | Purpose |
|---------|---------|
| `/finishopspalupdate` | Run validation, routing health checks, cache prune, and sync after update |
| `/pluginupdate` | Full plugin health check |
| `/sync-claudemd` | Update CLAUDE.md routing tables |
| `/checkdependencies` | Check npm dependencies |

## Version History

- **v1.4.0** (2026-02-13) - Nested-session-safe execution modes
  - Added `--mode external|manual|legacy` (default: `external`)
  - Added `--emit-script-only` for automation wrappers
  - Added `claude auth status` precheck guidance and troubleshooting
  - Legacy mode now guarded inside nested Claude/Codex sessions

- **v1.3.0** (2026-02-10) - Robust argument pass-through and user plugin path support
  - Added `--verbose` to argument hint/options
  - Added user plugin path lookup (`~/.claude/plugins/opspal-core`)
  - Switched to array-based argument forwarding for safer shell parsing
  - Updated finish-step guidance to mention cache prune behavior

- **v1.2.0** (2026-02-05) - Multi-location plugin detection
  - Fixed: Script now finds plugins in Claude CLI marketplace paths (`~/.claude/plugins/marketplaces/`)
  - Added support for alternative marketplace names
  - Better error messages showing searched locations
  - Improved troubleshooting guidance

- **v1.1.0** (2026-02-05) - Selective update and history
  - Added `--only` flag for selective plugin updates
  - Added `--history` flag to view update history
  - Updates logged to `~/.claude/logs/opspal-updates.jsonl`
  - Added statistics summary (upgraded/unchanged/failed)

- **v1.0.0** (2026-02-05) - Initial implementation
  - Marketplace force refresh
  - Version tracking and comparison
  - Dry-run mode
  - Colored output with progress
