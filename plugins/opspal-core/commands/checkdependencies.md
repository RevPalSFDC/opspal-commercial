---
name: checkdependencies
description: Check and install missing npm dependencies across all plugins
argument-hint: "[--fix] [--plugin <name>] [--verbose]"
---

# Check Plugin Dependencies (Centralized)

Scans all plugins and validates npm package dependencies.

## Execute

Run the dependency checker:

```bash
node "$(find . -name 'check-all-plugin-dependencies.js' -path '*opspal-core*' 2>/dev/null | head -1)"
```

## What This Command Does

1. **Scans all plugins** in the plugins directory
2. **Parses package.json** files for each plugin
3. **Checks node_modules** to verify packages are installed
4. **Reports status** with color-coded output
5. **Auto-installs** missing packages with `--fix` flag

## Options

**Auto-install missing packages:**
```bash
node "$(find . -name 'check-all-plugin-dependencies.js' -path '*opspal-core*' 2>/dev/null | head -1)" --fix
```

**Check specific plugin:**
```bash
node "$(find . -name 'check-all-plugin-dependencies.js' -path '*opspal-core*' 2>/dev/null | head -1)" --plugin opspal-core
```

**Verbose output (include devDependencies):**
```bash
node "$(find . -name 'check-all-plugin-dependencies.js' -path '*opspal-core*' 2>/dev/null | head -1)" --verbose
```

## Example Output

```
============================================================
Plugin Dependency Checker
Plugins directory: /path/to/.claude-plugins
============================================================

opspal-core
  ✓ ajv (^8.12.0)
  ✓ ejs (^3.1.10)
  ✗ md-to-pdf (^5.2.5) - NOT INSTALLED
    Note: Requires Puppeteer/Chromium. May need: sudo apt-get install -y libgbm-dev libnss3
  ✓ pdf-lib (^1.17.1)

salesforce-plugin
  ✓ fast-xml-parser (^4.0.0)

hubspot-plugin
  ○ No package.json found

============================================================
Summary
============================================================
Plugins scanned: 3
Packages present: 4
Packages missing: 1

Run with --fix to install missing packages
============================================================
```

## Special Package Handling

Some packages require additional system dependencies:

| Package | Requirements |
|---------|--------------|
| `md-to-pdf` | Puppeteer/Chromium - may need: `sudo apt-get install -y libgbm-dev libnss3 libatk-bridge2.0-0` |
| `better-sqlite3` | Native module - prebuilt binaries are used when available; otherwise build tools may be required |
| `sharp` | Image processing - may need: `brew install vips` (macOS) or `apt-get install libvips-dev` (Linux) |

## When to Use This Command

Run `/checkdependencies` after:

1. **Fresh plugin installation** - Verify all npm packages are present
2. **Errors about missing modules** - Diagnose which package is missing
3. **Plugin updates** - Check if new dependencies were added
4. **New environment setup** - Set up a new machine with plugins
5. **Runtime "Cannot find module" errors** - Identify and fix missing packages

## Common Error Patterns

### "Cannot find module 'md-to-pdf'"

```bash
# Source shared path resolver
RESOLVE_SCRIPT=""
for _candidate in \
  "${CLAUDE_PLUGIN_ROOT:+${CLAUDE_PLUGIN_ROOT}/scripts/resolve-script.sh}" \
  "$HOME/.claude/plugins/cache/revpal-internal-plugins/opspal-core"/*/scripts/resolve-script.sh \
  "$HOME/.claude/plugins/marketplaces"/*/plugins/opspal-core/scripts/resolve-script.sh \
  "$PWD/plugins/opspal-core/scripts/resolve-script.sh" \
  "$PWD/.claude-plugins/opspal-core/scripts/resolve-script.sh"; do
  [ -n "$_candidate" ] && [ -f "$_candidate" ] && RESOLVE_SCRIPT="$_candidate" && break
done
if [ -z "$RESOLVE_SCRIPT" ]; then echo "ERROR: Cannot locate opspal-core resolve-script.sh"; exit 1; fi
source "$RESOLVE_SCRIPT"

# Diagnose
CHECKER=$(find_script "check-all-plugin-dependencies.js") && node "$CHECKER" --plugin opspal-core

# Fix
CHECKER=$(find_script "check-all-plugin-dependencies.js") && node "$CHECKER" --fix
```

### "Cannot find module 'fast-xml-parser'"

```bash
# Diagnose
CHECKER=$(find_script "check-all-plugin-dependencies.js") && node "$CHECKER" --plugin salesforce-plugin

# Fix
CHECKER=$(find_script "check-all-plugin-dependencies.js") && node "$CHECKER" --fix
```

## Integration with /pluginupdate

The `/pluginupdate` command now includes npm dependency checking as part of its validation. Running `/pluginupdate --fix` will also install missing npm packages.

## Exit Codes

- `0` - All dependencies present (or successfully fixed with --fix)
- `1` - One or more dependencies missing (without --fix)

## Related Commands

- `/pluginupdate` - Comprehensive plugin health check (includes this)
- `/initialize` - Initialize project structure
- `/agents` - List available agents

## Troubleshooting

### npm install fails for md-to-pdf

md-to-pdf depends on Puppeteer which downloads Chromium. If this fails:

```bash
# Install system dependencies (Linux)
sudo apt-get install -y libgbm-dev libnss3 libatk-bridge2.0-0 libxkbcommon0 libgtk-3-0

# Then retry
cd .claude-plugins/opspal-core && npm install
```

### npm install fails for native modules

For packages like `better-sqlite3` or `sharp`:

```bash
# Install build tools
npm install -g node-gyp

# Retry
npm install
```

## Version History

- **v1.0.0** (2026-01-23) - Initial implementation with centralized checking
