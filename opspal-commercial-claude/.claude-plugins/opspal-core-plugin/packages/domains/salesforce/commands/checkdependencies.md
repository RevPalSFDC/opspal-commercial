---
description: Check and install missing plugin dependencies (npm packages, CLI tools, system utilities)
argument-hint: "[--install] [--plugin-path=<path>]"
---

# Check Plugin Dependencies

Validates all plugin dependencies and optionally installs missing ones.

## What This Command Does

1. **Checks npm packages** - Validates Node.js dependencies (e.g., fast-xml-parser)
2. **Checks CLI tools** - Verifies required command-line tools (e.g., sf, node)
3. **Checks system utilities** - Validates system packages (e.g., jq, xmllint)
4. **Reports status** - Shows present/missing dependencies with color coding
5. **Auto-installs** (optional) - Can automatically install missing npm packages

## Usage

### Basic Check (Read-Only)

Run the dependency checker without installing anything:

```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/check-dependencies.js
```

### Check and Auto-Install

Automatically install missing npm packages:

```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/check-dependencies.js --install
```

### Check Specific Plugin

Check dependencies for a specific plugin path:

```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/check-dependencies.js \
  --plugin-path=/path/to/plugin
```

## Example Output

```
============================================================
Plugin Dependency Checker
============================================================

Checking npm packages...
  ✓ fast-xml-parser (^4.0.0)

Checking CLI tools...
  ✓ sf (>=2.0.0)
  ✓ node (>=18.0.0)

Checking system utilities...
  ✓ jq (installed)
  ⚠ xmllint (optional)

============================================================
Dependency Check Summary
============================================================
Plugin: salesforce-plugin v3.4.0

✓ Present: 4
✗ Missing: 0

============================================================
```

## Dependencies Checked

### Required Dependencies

These are **required** for the plugin to function:

1. **fast-xml-parser** (npm) - XML parsing for FLS-aware field deployment
2. **sf CLI** - Salesforce CLI for metadata operations
3. **node** - Node.js runtime (v18+)
4. **jq** - JSON processor for parsing CLI output

### Optional Dependencies

These **enhance functionality** but are not required:

1. **xmllint** - XML validation for metadata (improves validation accuracy)

## Automatic Installation

The checker can automatically install:

- ✅ **npm packages** - Installs via `npm install`
- ⚠️ **System packages with brew/choco** - Installs if no sudo required
- ❌ **System packages requiring sudo** - Shows manual install command

### What Gets Auto-Installed

With `--install` flag:
- npm packages (e.g., `npm install fast-xml-parser`)
- Homebrew packages on macOS (if installed)
- Chocolatey packages on Windows (if installed)

### What Requires Manual Installation

You'll need to manually install:
- Salesforce CLI (`sf`) - Follow: https://developer.salesforce.com/tools/salesforcecli
- System packages requiring sudo (e.g., `sudo apt-get install jq`)

## Troubleshooting

### "Command not found: node"

Node.js is not installed or not in PATH.

**Fix**:
```bash
# Download from https://nodejs.org/
# Or use a package manager:
brew install node       # macOS
choco install nodejs    # Windows
sudo apt install nodejs # Linux
```

### "Command not found: sf"

Salesforce CLI is not installed.

**Fix**:
```bash
# Install via npm
npm install -g @salesforce/cli

# Verify
sf --version
```

### "Command not found: jq"

jq is not installed (required for JSON parsing).

**Fix**:
```bash
# macOS
brew install jq

# Linux
sudo apt-get install jq

# Windows
choco install jq
```

### "Cannot find module 'fast-xml-parser'"

npm package is missing.

**Fix**:
```bash
# Auto-install
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/check-dependencies.js --install

# Or manually
npm install fast-xml-parser
```

## When to Use This Command

Run `/checkdependencies` after:

1. **Fresh plugin installation** - Verify all dependencies are present
2. **Errors about missing tools** - Diagnose which dependency is missing
3. **New environment setup** - Set up a new machine with the plugin
4. **Plugin updates** - Check if new dependencies were added

## Integration with Post-Install Hook

The post-install hook automatically runs this check:

```bash
# .claude-plugin/hooks/post-install.sh
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/check-dependencies.js
```

But you can run it manually anytime with `/checkdependencies`.

## Exit Codes

- `0` - All required dependencies present
- `1` - One or more required dependencies missing

## Related Commands

- `/reflect` - Submit session feedback (uses Supabase MCP, no deps)
- Plugin manifest: `.claude-plugin/plugin.json` - View all dependencies

## Version History

- **v1.0.0** (2025-10-11) - Initial implementation
