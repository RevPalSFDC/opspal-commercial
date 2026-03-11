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
/opspal-core:initialize

# Initialize specific directory
/opspal-core:initialize --project-dir=/path/to/project

# Force overwrite existing
/opspal-core:initialize --force

# Use org-centric structure
/opspal-core:initialize --org-centric
```

## Full Documentation

See the full `/initialize` documentation in:
- `plugins/opspal-core/commands/initialize.md`

---

## Legacy Behavior

If `opspal-core` is unavailable, install or update `opspal-core` and rerun `/initialize`. This redirect exists so project initialization uses one resolver-backed implementation.
