---
name: sync-claudemd
description: Non-destructive merge of plugin metadata into CLAUDE.md with section ownership
argument-hint: "[--dry-run] [--verbose] [--project-dir=<path>] [--mode=interactive|non-interactive] [--force] [--rollback]"
allowed_tools:
  - Bash
tags:
  - sync
  - documentation
  - routing
  - merge
---

# Sync CLAUDE.md After Plugin Update

## EXECUTE IMMEDIATELY

Run this command now (pass any user arguments like --dry-run):

```bash
# Source shared path resolver
RESOLVE_SCRIPT=""
for _candidate in \
  "${CLAUDE_PLUGIN_ROOT:+${CLAUDE_PLUGIN_ROOT}/scripts/resolve-script.sh}" \
  "$HOME/.claude/plugins/cache/opspal-commercial/opspal-core"/*/scripts/resolve-script.sh \
  "$HOME/.claude/plugins/marketplaces"/*/plugins/opspal-core/scripts/resolve-script.sh \
  "$PWD/plugins/opspal-core/scripts/resolve-script.sh" \
  "$PWD/.claude-plugins/opspal-core/scripts/resolve-script.sh"; do
  [ -n "$_candidate" ] && [ -f "$_candidate" ] && RESOLVE_SCRIPT="$_candidate" && break
done
if [ -z "$RESOLVE_SCRIPT" ]; then echo "ERROR: Cannot locate opspal-core resolve-script.sh"; exit 1; fi
source "$RESOLVE_SCRIPT"

SYNC_SCRIPT=$(find_script "sync-claudemd.js")
if [ -z "$SYNC_SCRIPT" ]; then echo "ERROR: sync-claudemd.js not found"; exit 1; fi

node "$SYNC_SCRIPT" $ARGUMENTS
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
# Use find_script() to locate sync-claudemd.js (see bootstrap above)
SYNC_SCRIPT=$(find_script "sync-claudemd.js")
node "$SYNC_SCRIPT" --project-dir=/path/to/project
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

## What Gets Preserved (v4.0 Section Ownership)

**ALL user content is preserved by default.** The v4.0 merge engine uses section markers to distinguish plugin-owned content from yours:

- **User sections** (`<!-- USER_SECTION name="..." -->`) — never touched by sync
- **Legacy sections** (`<!-- USER_EDITABLE_START name="..." -->`) — fully supported, never touched
- **Untagged content** — detected and deferred for review (never silently destroyed)
- **Plugin-managed sections** (`<!-- OPSPAL_MANAGED section="..." -->`) — updated by plugins

### How It Works

1. Plugin sections are wrapped in `OPSPAL_MANAGED` markers with checksums
2. Your content lives in `USER_SECTION` markers (or untagged verbatim)
3. On sync: plugin sections update in place, your content stays untouched
4. If you edit inside a managed section, the conflict is detected and handled

### Protecting Your Content

Wrap any custom section you add:

```html
<!-- USER_SECTION name="my-team-conventions" -->
## Our Team Conventions
- Always use Person Accounts for B2C
- Custom field prefix: RevPal__
<!-- USER_SECTION_END -->
```

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
# Use find_script() pattern from resolve-script.sh to locate sync-claudemd.js
SYNC_SCRIPT=$(find_script "sync-claudemd.js") && node "$SYNC_SCRIPT"
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

## New Flags (v4.0)

| Flag | Purpose |
|------|---------|
| `--mode=interactive` | Guided merge with per-section review (default) |
| `--mode=non-interactive` | Safe merge only, defer untagged content (used by automated callers) |
| `--force` | Overwrite even on conflicts (always backs up first) |
| `--rollback` | Restore CLAUDE.md from most recent backup |
| `--dry-run` | Show section-level diff report without writing |

## Backup & Rollback

Every sync creates a timestamped backup in `~/.claude/opspal/claudemd-backups/`. Up to 10 backups are retained.

```bash
/sync-claudemd --rollback    # Restore from most recent backup
```

## Version History

- **v4.0.0** (2026-04-09) - Section Ownership Merge
  - **BREAKING**: File is now section-level merged instead of fully regenerated
  - Plugin sections wrapped in `OPSPAL_MANAGED` markers with checksums
  - User content preserved in `USER_SECTION` markers
  - Untagged user content detected and deferred (never destroyed)
  - Automatic backup before every write
  - `--rollback` flag to restore from backup
  - `--mode=non-interactive` for safe automated syncs
  - `--force` to override conflicts
  - Legacy `USER_EDITABLE_START/END` markers fully supported
  - Structured JSON output for hook callers (`__SYNC_RESULT__`)

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
