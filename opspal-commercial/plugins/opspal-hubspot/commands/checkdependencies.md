---
name: checkdependencies
description: "[REDIRECTS TO opspal-core] Check and install plugin dependencies"
argument-hint: "[options]"
telemetry-contract: opspal-command-telemetry-v1
telemetry-enabled: true
allowed-tools:
  - Read
  - Bash
---

# Check Plugin Dependencies (Redirect)

**This command has been consolidated into opspal-core for unified dependency checking across all plugins.**

## How to Use

The `/checkdependencies` command is now provided by `opspal-core`. If you have both plugins installed, use:

```bash
/opspal-core:checkdependencies
```

Or simply run `/checkdependencies` - Claude will automatically use the opspal-core version if available.

## Why the Change?

The dependency checking system has been consolidated to:
1. **Single source of truth** - One script checking ALL plugins
2. **Consistent behavior** - Same output format across all platforms
3. **Easier maintenance** - Improvements apply to all plugins automatically
4. **No duplication** - Centralized `check-all-plugin-dependencies.js`

## Centralized Features

The opspal-core version provides:
- Scans **all plugins** in `.claude-plugins/` directory
- Checks npm packages, CLI tools, and system utilities
- Auto-installs missing packages with `--fix`
- Plugin-specific checking with `--plugin <name>`
- Verbose mode for devDependencies

## Usage

```bash
# Check all plugins (centralized)
/opspal-core:checkdependencies

# Auto-install missing
/opspal-core:checkdependencies --fix

# Check specific plugin
/opspal-core:checkdependencies --plugin hubspot-plugin
```

## Full Documentation

See the full `/checkdependencies` documentation in:
- `plugins/opspal-core/commands/checkdependencies.md`

---

## Legacy Behavior

If `opspal-core` is unavailable, stop and install or update `opspal-core` rather than hardcoding plugin paths. The redirect is intentional so dependency checks stay centralized.
