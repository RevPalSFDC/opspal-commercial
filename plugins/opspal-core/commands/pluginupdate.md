---
description: Run post-installation and post-update tasks for all installed plugins
argument-hint: "[--plugin <name>] [--check-only] [--fix] [--verbose]"
---

# Plugin Update Check

Run this command to validate all installed plugins.

## Execute

Run the plugin update manager with verbose output:

```bash
# Find script (checks multiple locations with fallback to find)
find_plugin_script() {
  local script_name="$1"
  local search_paths=(
    "${CLAUDE_PLUGIN_ROOT:+${CLAUDE_PLUGIN_ROOT}/scripts/lib/$script_name}"
    "$PWD/plugins/opspal-core/scripts/lib/$script_name"
    "$PWD/.claude-plugins/opspal-core/scripts/lib/$script_name"
    "./plugins/opspal-core/scripts/lib/$script_name"
    "./.claude-plugins/opspal-core/scripts/lib/$script_name"
    "$HOME/.claude/plugins/opspal-core@revpal-internal-plugins/scripts/lib/$script_name"
  )
  for path in "${search_paths[@]}"; do
    [ -n "$path" ] && [ -f "$path" ] && echo "$path" && return 0
  done
  # Fallback: use find command
  local found=$(find . -name "$script_name" -path "*/opspal-core/scripts/lib/*" 2>/dev/null | head -1)
  [ -n "$found" ] && echo "$found" && return 0
  echo "Error: $script_name not found in:" >&2
  printf '  %s\n' "${search_paths[@]}" >&2
  echo "  (also tried: find . -name $script_name)" >&2
  return 1
}

SCRIPT=$(find_plugin_script "plugin-update-manager.js") && node "$SCRIPT" --verbose
```

## What This Command Does

1. **System Dependencies** - Validates jq, node, sf CLI, curl, bc, mmdc, chromium
2. **NPM Packages** - Checks all plugin npm dependencies are installed
3. **Security Vulnerabilities** - Runs `npm audit` to detect known vulnerabilities in dependencies
4. **Environment Variables** - Checks required and optional env vars
5. **MCP Server Status** - Verifies Playwright, Supabase, Asana connectivity
6. **Cache Directories** - Ensures required directories exist
7. **Hook Validation** - Checks hooks are executable and have valid syntax
8. **Database Connectivity** - Validates Supabase connection and skills registry
9. **User-Level Hooks** - Configures `~/.claude/settings.json` for hook output injection
10. **Official Plugin Fixes** - Fixes Python import issues in marketplace plugins (e.g., hookify)
11. **PDF Pipeline** - Validates CSS files, Mermaid CLI, md-to-pdf, Chromium for PDF generation
12. **Routing Registry** - Validates routing-patterns.json (canonical source), runs conflict detection
13. **Hook Registration** - Merges plugin hooks.json into project settings.json (NEW - fixes 70+ unregistered hooks)

## Options

**Auto-fix issues:**
```bash
SCRIPT=$(find . -name "plugin-update-manager.js" -path "*/opspal-core/scripts/lib/*" 2>/dev/null | head -1)
[ -n "$SCRIPT" ] && node "$SCRIPT" --fix
```

**Check only (no fixes):**
```bash
SCRIPT=$(find . -name "plugin-update-manager.js" -path "*/opspal-core/scripts/lib/*" 2>/dev/null | head -1)
[ -n "$SCRIPT" ] && node "$SCRIPT" --check-only
```

**Check specific plugin:**
```bash
SCRIPT=$(find . -name "plugin-update-manager.js" -path "*/opspal-core/scripts/lib/*" 2>/dev/null | head -1)
[ -n "$SCRIPT" ] && node "$SCRIPT" --plugin salesforce-plugin --verbose
```

## Example Output

### Summary View (Default)

```
Plugin Update Check - 2026-01-31
================================

✅ Dependencies (5/5 passed)
✅ NPM Packages (12/12 passed)
✅ Security Vulnerabilities (0 found)
⚠️  Environment (3/5 - 2 optional missing)
✅ MCP Servers (3/3 connected)
✅ Cache Directories (6/6 exist)
✅ Hooks (28/28 valid)
⚠️  Database (connected, skills table empty)

Overall: READY (2 warnings)

Run with --fix to auto-resolve issues
Run with --verbose for details
```

### Verbose View

```
Plugin Update Check - 2026-01-31
================================

## Dependencies
✅ jq: 1.7.1 (required)
✅ node: v22.15.1 >= 18.0.0 (required)
✅ sf: 2.68.8 (salesforce-plugin)
✅ curl: 8.4.0 (hubspot-plugin)
✅ bc: 1.07.1 (optional)

## NPM Packages
✅ opspal-core: 12 packages OK
✅ opspal-salesforce: 8 packages OK

## Security Vulnerabilities
✅ npm audit: No vulnerabilities found

## Environment Variables
✅ SFDX_ALIAS: production (salesforce-plugin)
✅ SUPABASE_URL: https://kjgsody... (opspal-core)
⚠️  SLACK_WEBHOOK_URL: not set (optional)

## MCP Servers
✅ playwright: connected (browsers installed)
✅ supabase: connected (project: kjgsodyuzjgbebfnbruz)
✅ asana: connected (workspace: 1206944680490015)

## Cache Directories
✅ /tmp/salesforce-reports: exists
✅ ~/.claude/cache/ace-routing: exists

## Hooks (salesforce-plugin)
✅ session-start-agent-reminder.sh: valid, executable

## Database
✅ Supabase: connected
⚠️  skills table: 0 records (run seed-skills-registry.js)
```

## Auto-Fix Actions

With `--fix` flag, the following issues can be automatically resolved:

| Issue | Auto-Fix Action |
|-------|-----------------|
| Missing jq | `brew install jq` (macOS) or `apt-get install jq` (Linux) |
| Missing cache dir | `mkdir -p <path>` |
| Non-executable hook | `chmod +x <path>` |
| Empty skills table | Run `seed-skills-registry.js` |
| Missing .env | Generate template from `.env.example` |
| **Security Vulnerabilities** | `npm audit fix` to patch vulnerable dependencies |
| **User-Level Hook Missing** | Configure `~/.claude/settings.json` with UserPromptSubmit hook |
| **hookify Python Import Error** | Create symlink and `__init__.py` in plugin directory |
| **Missing mmdc** | `npm install -g @mermaid-js/mermaid-cli` |
| **Missing md-to-pdf** | `npm install md-to-pdf` in opspal-core directory |
| **Plugin Hooks Not Registered** | Merge plugin hooks.json into .claude/settings.json |

### Security Vulnerability Severity Levels

| Severity | Action | Display |
|----------|--------|---------|
| **Critical/High** | Treated as failures, auto-fixed with `--fix` | ❌ (fail) |
| **Moderate/Low** | Treated as warnings, auto-fixed with `--fix` | ⚠️ (warn) |

**Note**: Some vulnerabilities may require `npm audit fix --force` for breaking changes, or manual intervention for complex dependency chains.

## Why User-Level Hooks?

**Background**: Claude Code has a bug where project-level hooks (in `.claude/settings.json` or `.claude/hooks/`) execute successfully but their stdout output is silently discarded. User-level hooks in `~/.claude/settings.json` work correctly.

**What this means**: The `/pluginupdate --fix` command configures hooks at the user level to enable:
- Hook output injection into Claude's context
- Routing recommendations visible to Claude
- Dynamic context injection

**Technical details**: See `docs/HOOK_BUG_SUMMARY.md` for the full investigation.

## What Requires Manual Action

- **Node.js** - Install from https://nodejs.org/
- **Salesforce CLI** - `npm install -g @salesforce/cli`
- **API tokens** - Set in `.env` file manually
- **MCP authentication** - Configure via Claude settings

## Checks by Plugin

### salesforce-plugin
- Dependencies: sf CLI, jq
- Environment: SFDX_ALIAS, SALESFORCE_ENVIRONMENT, SF_TARGET_ORG
- Hooks: session-start, pre-task-context-loader, post-field-deployment

### hubspot-plugin
- Dependencies: curl, jq
- Environment: HUBSPOT_PORTAL_ID, HUBSPOT_PRIVATE_APP_TOKEN
- Hooks: post-install

### opspal-core
- Dependencies: node, jq, bc
- Environment: SUPABASE_URL, ASANA_ACCESS_TOKEN
- Hooks: subagent-utilization-booster, session-start, session-end
- Database: skills table, reflections
- **Web Visualization (optional)**: express, ws (for dev server hot-reload)
  ```bash
  cd .claude-plugins/opspal-core && npm install express ws --save
  ```

## When to Use This Command

Run `/pluginupdate` after:

1. **Fresh plugin installation** - Verify complete setup
2. **Plugin updates** - Check for new requirements
3. **Environment changes** - Validate after config changes
4. **Troubleshooting errors** - Diagnose missing dependencies
5. **New machine setup** - Complete initial configuration

## Exit Codes

- `0` - All checks passed (may have warnings)
- `1` - Critical issues found (required items missing)
- `2` - Partial success (some fixes applied, review needed)

## Related Commands

- `/checkdependencies` - Check system dependencies only
- `/initialize` - Initialize project structure
- `/agents` - List available agents
- `/context7-status` - Check Context7 MCP status

## Version History

- **v1.3.0** (2026-02-04) - Added Hook Registration check with hook-merger.js integration
- **v1.2.0** (2026-01-31) - Added Security Vulnerabilities check with `npm audit` integration
- **v1.1.0** (2025-12-15) - Added User-Level Hooks and Official Plugin Fixes checks
- **v1.0.0** (2025-12-13) - Initial implementation
