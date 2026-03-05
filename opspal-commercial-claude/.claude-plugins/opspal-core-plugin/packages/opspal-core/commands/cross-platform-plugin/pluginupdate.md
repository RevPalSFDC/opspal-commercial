---
description: Run post-installation and post-update tasks for all installed plugins
argument-hint: "[--plugin <name>] [--check-only] [--fix] [--verbose]"
---

# Plugin Update Check

Comprehensive post-installation and post-update validation for all installed plugins. Checks dependencies, environment variables, MCP servers, cache directories, hooks, and database connectivity.

## What This Command Does

1. **System Dependencies** - Validates jq, node, sf CLI, curl, bc
2. **Environment Variables** - Checks required and optional env vars
3. **MCP Server Status** - Verifies Playwright, Supabase, Asana connectivity
4. **Cache Directories** - Ensures required directories exist
5. **Hook Validation** - Checks hooks are executable and have valid syntax
6. **Database Connectivity** - Validates Supabase connection and skills registry
7. **User-Level Hooks** - Configures `~/.claude/settings.json` for hook output injection
8. **Official Plugin Fixes** - Fixes Python import issues in marketplace plugins (e.g., hookify)

## Usage

### Basic Check

Run validation without making changes:

```bash
node .claude-plugins/opspal-core-plugin/packages/opspal-core/cross-platform-plugin/scripts/lib/plugin-update-manager.js
```

### Check Only Mode

Report issues without attempting fixes:

```bash
node .claude-plugins/opspal-core-plugin/packages/opspal-core/cross-platform-plugin/scripts/lib/plugin-update-manager.js --check-only
```

### Auto-Fix Issues

Automatically resolve fixable issues:

```bash
node .claude-plugins/opspal-core-plugin/packages/opspal-core/cross-platform-plugin/scripts/lib/plugin-update-manager.js --fix
```

### Verbose Output

Show detailed status for each check:

```bash
node .claude-plugins/opspal-core-plugin/packages/opspal-core/cross-platform-plugin/scripts/lib/plugin-update-manager.js --verbose
```

### Check Specific Plugin

Target a specific plugin:

```bash
node .claude-plugins/opspal-core-plugin/packages/opspal-core/cross-platform-plugin/scripts/lib/plugin-update-manager.js \
  --plugin salesforce-plugin --verbose
```

## Example Output

### Summary View (Default)

```
Plugin Update Check - 2025-12-13
================================

✅ Dependencies (5/5 passed)
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
Plugin Update Check - 2025-12-13
================================

## Dependencies
✅ jq: 1.7.1 (required)
✅ node: v22.15.1 >= 18.0.0 (required)
✅ sf: 2.68.8 (salesforce-plugin)
✅ curl: 8.4.0 (hubspot-plugin)
✅ bc: 1.07.1 (optional)

## Environment Variables
✅ SFDX_ALIAS: production (salesforce-plugin)
✅ SUPABASE_URL: https://kjgsody... (cross-platform-plugin)
⚠️  SLACK_WEBHOOK_URL: not set (optional)

## MCP Servers
✅ playwright: connected (browsers installed)
✅ supabase: connected (project: REDACTED_SUPABASE_PROJECT)
✅ asana: connected (workspace: REDACTED_WORKSPACE_ID)

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
| **User-Level Hook Missing** | Configure `~/.claude/settings.json` with UserPromptSubmit hook |
| **hookify Python Import Error** | Create symlink and `__init__.py` in plugin directory |

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

### cross-platform-plugin
- Dependencies: node, jq, bc
- Environment: SUPABASE_URL, ASANA_ACCESS_TOKEN
- Hooks: subagent-utilization-booster, session-start, session-end
- Database: skills table, reflections

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

- **v1.1.0** (2025-12-15) - Added User-Level Hooks and Official Plugin Fixes checks
- **v1.0.0** (2025-12-13) - Initial implementation
