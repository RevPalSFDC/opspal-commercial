---
description: Dynamically discover and sync plugin metadata to CLAUDE.md routing tables
argument-hint: "[--dry-run] [--verbose] [--project-dir=<path>]"
allowed_tools:
  - Bash
tags:
  - sync
  - documentation
  - routing
---

# Sync CLAUDE.md After Plugin Update

## EXECUTE IMMEDIATELY

Run this command now (pass any user arguments like --dry-run):

```bash
node .claude-plugins/opspal-core/scripts/lib/sync-claudemd.js $ARGUMENTS
```

After execution, report the results to the user.

---

**v2.0 - Dynamic Discovery Edition**

Automatically discovers commands, agents, and routing patterns from plugin metadata and updates your project's CLAUDE.md. No more manual updates when new features are added!

## What This Command Does

1. **Scans installed plugins** - Detects all plugins in `.claude-plugins/`, `plugins/`, and marketplace
2. **Discovers metadata dynamically** - Parses frontmatter from all commands and agents
3. **Extracts routing keywords** - Pulls tags, aliases, triggers, and descriptions
4. **Builds routing tables** - Generates agent and command routing sections automatically
5. **Prioritizes by importance** - Assessors, auditors, and orchestrators ranked higher
6. **Updates plugin versions** - Syncs version numbers and feature counts
7. **Preserves customizations** - Keeps your Project Overview and custom sections intact

### Dynamic Discovery Sources

| Source | What's Extracted |
|--------|-----------------|
| Command frontmatter | `name`, `description`, `tags`, `aliases` |
| Agent frontmatter | `name`, `description`, `tags`, `triggers` |
| Plugin CLAUDE.md | "Trigger keywords" patterns, routing tables |

### Why This Matters

**Before v2.0**: New commands/agents required manual CLAUDE.md updates. Easy to forget.

**After v2.0**: Add a command with tags/description → run `/sync-claudemd` → automatically discoverable.

## Usage

### Basic Sync

```bash
/sync-claudemd
```

Updates CLAUDE.md in the current directory.

### Preview Changes (Dry Run)

```bash
/sync-claudemd --dry-run
```

Shows what would be updated without making changes.

### Verbose Output

```bash
/sync-claudemd --verbose
```

Shows detailed information about detected plugins and changes.

### Specific Directory

```bash
node .claude-plugins/opspal-core/scripts/lib/sync-claudemd.js --project-dir=/path/to/project
```

## What Gets Updated

### Plugin Versions Section

**Before:**
```markdown
## 🔌 Installed Plugins

- ✅ **salesforce-plugin** (v3.45.0) - 51 agents, 97 scripts, 14 commands
```

**After:**
```markdown
## 🔌 Installed Plugins

- ✅ **salesforce-plugin** (v3.51.1) - 72 agents, 102 scripts, 16 commands, 5 hooks
- ✅ **hubspot-plugin** (v3.0.2) - 44 agents, 84 scripts, 21 commands, 13 hooks
- ✅ **opspal-core** (v1.12.2) - 13 agents, 2 commands

**Last synced**: 2025-11-26
```

### Agent Quick Lookup Section

Updates the keyword-to-agent mapping table with current agents.

### Commands Reference

Updates the list of available slash commands per plugin.

## What Gets Preserved

The following sections are NOT modified (your customizations are safe):

- **Project Overview** - Your project name, description, and details
- **Custom sections** - Any sections you've added
- **Instance-specific notes** - Customer/org specific documentation
- **Comments** - `<!-- EDIT THIS SECTION -->` markers and content within

## When to Run This Command

### Recommended Times

- ✅ **After plugin update** - Sync new versions and features
- ✅ **After adding a plugin** - Include new plugin in CLAUDE.md
- ✅ **After removing a plugin** - Update plugin list
- ✅ **Weekly maintenance** - Keep documentation current
- ✅ **Before onboarding** - Ensure team sees latest info

### Automatic Integration

This command can be added to post-plugin-update hooks:

```bash
# In .claude/hooks/post-plugin-update.sh
node .claude-plugins/opspal-core/scripts/lib/sync-claudemd.js
```

## Example Output

```
╔════════════════════════════════════════════════════════╗
║        CLAUDE.md Sync - Plugin Update Utility          ║
╚════════════════════════════════════════════════════════╝

📦 Scanning for installed plugins...
   Found 3 plugin(s):

   ✓ salesforce-plugin v3.51.1
   ✓ hubspot-plugin v3.0.2
   ✓ opspal-core v1.12.2

📝 Updating CLAUDE.md...

╔════════════════════════════════════════════════════════╗
║  ✅ CLAUDE.md Updated Successfully!                    ║
╚════════════════════════════════════════════════════════╝

   • Updated plugin versions and counts
   • Updated agent quick lookup

   Updated: /path/to/project/CLAUDE.md

📋 Next Steps:
   1. Review the updated CLAUDE.md
   2. Edit Project Overview section if needed
   3. Commit changes to version control
```

## Integration with /initialize

| Command | Purpose | When to Use |
|---------|---------|-------------|
| `/initialize` | Creates new CLAUDE.md from scratch | New projects, first-time setup |
| `/sync-claudemd` | Updates existing CLAUDE.md | After plugin updates |

**Workflow:**
1. New project → `/initialize` (creates structure + CLAUDE.md)
2. Plugin update → `/sync-claudemd` (updates versions only)

## Troubleshooting

### "No CLAUDE.md found"

Run `/initialize` first to create the file:
```bash
/initialize
```

### "No plugins found"

Verify plugins are installed:
```bash
/plugin list
ls .claude-plugins/
```

### Changes not appearing

Run with `--verbose` to inspect plugin discovery details:
```bash
/sync-claudemd --verbose
```

### Custom sections being overwritten

This command only updates specific sections:
- `## 🔌 Installed Plugins`
- `### ⚡ Quick Agent Lookup`

Other sections are preserved. If you're seeing unexpected changes, please report via `/reflect`.

## Exit Codes

- `0` - Success (updated or already current)
- `1` - Error (no file, no plugins, write error)

## Related Commands

- `/initialize` - Create new CLAUDE.md from scratch
- `/plugindr` - Diagnose plugin health issues
- `/checkdependencies` - Verify plugin dependencies

## Version History

- **v2.0.0** (2026-01-30) - Dynamic Discovery Edition
  - **BREAKING**: Routing tables now auto-generated from plugin metadata
  - Parses command frontmatter (name, description, tags, aliases)
  - Parses agent frontmatter (name, description, tags, triggers)
  - Extracts trigger keywords from plugin CLAUDE.md files
  - Priority-based sorting (assessors, auditors, orchestrators ranked higher)
  - Adds "Key Commands" section alongside agents
  - Validation warnings for missing expected patterns
  - Discovery statistics in output

- **v1.0.0** (2025-11-26) - Initial implementation
  - Plugin version and count sync
  - Agent quick lookup updates
  - Dry-run mode
  - Verbose output
  - Preserves user customizations
