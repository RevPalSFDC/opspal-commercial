---
name: initialize
description: "[REDIRECTS TO opspal-core] Initialize project structure"
argument-hint: "[options]"
allowed-tools:
  - Read
  - Write
  - Bash
---

# Initialize Project (Redirect)

**This command has been consolidated into opspal-core for unified project initialization across all plugins.**

## How to Use

The `/initialize` command is now provided by `opspal-core`. If you have both plugins installed, use:

```bash
/opspal-core:initialize
```

Or simply run `/initialize` - Claude will automatically use the opspal-core version if available.

## Why the Change?

The initialization system has been consolidated to:
1. **Single source of truth** - One initialization script for all plugins
2. **Consistent structure** - Same folder layout across all platforms
3. **Multi-platform detection** - Automatically detects all installed plugins
4. **Easier maintenance** - Improvements apply to all plugins automatically

## Centralized Features

The opspal-core version provides:
- Detects **all installed plugins** (Salesforce, HubSpot, Marketo, etc.)
- Creates unified folder structure
- Merges CLAUDE.md templates for multi-platform projects
- Merges .gitignore rules from all plugins
- Supports org-centric structure with `--org-centric`

## Usage

```bash
# Initialize current directory
node .claude-plugins/opspal-core/scripts/lib/initialize-project.js

# Initialize specific directory
node .claude-plugins/opspal-core/scripts/lib/initialize-project.js --project-dir=/path/to/project

# Force overwrite existing
node .claude-plugins/opspal-core/scripts/lib/initialize-project.js --force

# Use org-centric structure
node .claude-plugins/opspal-core/scripts/lib/initialize-project.js --org-centric
```

## Full Documentation

See the full `/initialize` documentation in:
- `plugins/opspal-core/commands/initialize.md`

---

## Legacy Behavior (For Backwards Compatibility)

If opspal-core is not available, this command will still function. The agent should:

1. Check for installed plugins (salesforce-plugin, hubspot-plugin)
2. Create appropriate folder structure
3. Generate CLAUDE.md from templates
4. Create .gitignore with platform rules

### Script Location (Multi-Path Discovery)

```bash
# Check multiple possible locations
SCRIPT_PATHS=(
    "${CLAUDE_PLUGIN_ROOT:-}"
    "${HOME}/.claude/plugins/opspal-core@revpal-internal-plugins"
    "./plugins/opspal-core"
    "./.claude-plugins/opspal-core"
    "${HOME}/.claude/plugins/opspal-salesforce@revpal-internal-plugins"
    "./plugins/opspal-salesforce"
    "./.claude-plugins/opspal-salesforce"
)

for p in "${SCRIPT_PATHS[@]}"; do
    if [ -n "$p" ] && [ -f "$p/scripts/lib/initialize-project.js" ]; then
        INIT_SCRIPT="$p/scripts/lib/initialize-project.js"
        break
    fi
done
```
