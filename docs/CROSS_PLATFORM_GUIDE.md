# Cross-Platform Compatibility Guide

Claude Code runs in two distinct environments on Windows. This guide ensures plugin hooks and scripts work correctly in both.

## Environment Matrix

| Dimension | CLI (WSL) | Desktop (Git Bash) |
|-----------|-----------|-------------------|
| Shell | `/bin/bash` (Ubuntu) | `bash.exe` (MINGW64) |
| HOME | `/home/<user>` | `/c/Users/<user>` |
| SF token store | `~/.sfdx/` (Linux) | `~/.sfdx/` (Windows) |
| `.claude/` location | `/home/<user>/.claude/` | `C:\Users\<user>\.claude\` |
| PATH inheritance | Full `.bashrc` | Minimal (no `.bashrc`) |
| `uname -s` | `Linux` | `MINGW64_NT-*` |
| `realpath` | Available | **Not available** |
| Line endings | LF (default) | CRLF (common) |

## Five Sourcing Rules for Plugin Scripts

### 1. Source `env-normalize.sh` first

Every hook and shell script should source the shared normalizer at the top:

```bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../scripts/lib/env-normalize.sh" 2>/dev/null || true
```

This handles platform detection, Node.js discovery, `CLAUDE_PLUGIN_ROOT` normalization, and provides portable utility functions.

### 2. Never call `node` directly — use `node_exec`

Desktop GUI apps don't inherit `.bashrc` PATH modifications. Node.js installed via nvm won't be on PATH.

```bash
# Bad — breaks on Desktop
node "$SCRIPT_DIR/my-script.js"

# Good — discovers node via fallback chain
source "${SCRIPT_DIR}/node-wrapper.sh"
node_exec "$SCRIPT_DIR/my-script.js"
```

### 3. Never use `$HOME` without fallback — use `get_home_dir()`

```bash
# Shell
source "${SCRIPT_DIR}/platform-helpers.sh"
HOMEDIR="$(get_home_dir)"

# JavaScript
const { getHomeDir } = require('./platform-utils');
const home = getHomeDir();
```

### 4. Never use `realpath` directly — use `safe_realpath`

Git Bash on Windows does not ship `realpath`. Use the portable fallback from `env-normalize.sh`:

```bash
source "${SCRIPT_DIR}/env-normalize.sh"
RESOLVED_PATH="$(safe_realpath "$SOME_PATH")"
```

### 5. Never hardcode paths starting with `/home/` or `/c/Users/`

Use environment variables with sensible defaults:

```bash
# Bad
RESOLVER="/home/chris/Desktop/RevPal/Agents/openclaw/scripts/lib/policy.py"

# Good — env var override with empty default
RESOLVER="${MY_RESOLVER_PATH:-}"
```

## SF Token Store Unification

Desktop and CLI may resolve `~/.sfdx/` to different physical directories, causing different authenticated orgs to appear.

### Option A: Set `SF_DATA_DIR` (quick)

Point both environments at the same store:

```bash
# In your .env or Windows System Environment Variables
export SF_DATA_DIR="/c/Users/cnace/.sfdx"
```

### Option B: Symlink stores (recommended)

```bash
# From WSL — point WSL at Windows store
rm -rf ~/.sfdx
ln -s /mnt/c/Users/cnace/.sfdx ~/.sfdx
```

### Option C: Always use `--target-org`

The safest approach for SF operations is to always qualify with `--target-org <alias>` rather than relying on the default org, since the default org config is environment-specific.

## CRLF Prevention

Desktop (Git Bash) produces CRLF line endings more frequently. Use these tools:

### Shell scripts

```bash
source env-normalize.sh
cat data.csv | normalize_crlf > clean.csv
normalize_crlf_file ./data.csv  # In-place
```

### JavaScript

```javascript
const { normalizeLineEndings } = require('./csv-smart-parser');
const clean = normalizeLineEndings(rawContent);
```

### CSV files for Salesforce Bulk API

Always normalize before upload. The `sf-command-auto-corrector.js` handles this automatically for sf CLI operations, but manual CSV creation should call `normalizeLineEndings()` explicitly.

## Subagent Context (`CLAUDE_PLUGIN_ROOT`)

When Claude Code spawns subagents via the Task tool, the subagent's working directory may be the user's project directory — not the plugin directory. Scripts that use `process.cwd()` as a fallback will fail.

The `session-start-dispatcher.sh` hook exports `CLAUDE_PLUGIN_ROOT` at session start. All scripts should use:

```javascript
const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || process.cwd();
```

```bash
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
```

## Platform Detection

### Shell

```bash
source platform-helpers.sh

if is_git_bash; then
  echo "Running on Desktop (Git Bash)"
elif is_wsl; then
  echo "Running in WSL"
elif is_macos; then
  echo "Running on macOS"
fi

PLATFORM="$(get_platform)"  # git-bash | wsl | macos | linux
```

### JavaScript

```javascript
const platform = require('./platform-utils');

if (platform.isGitBash()) { /* Desktop */ }
if (platform.isWSL()) { /* WSL CLI */ }

const name = platform.getPlatform(); // 'git-bash' | 'wsl' | 'macos' | 'linux'
```

## Testing Hooks in Both Environments

When developing hooks, test in both shells:

1. **WSL CLI**: Run `claude` from your WSL terminal
2. **Desktop**: Run Claude Code Desktop app

Key differences to watch for:
- `realpath` availability (use `safe_realpath`)
- `readlink -f` behavior (prefer `cd + pwd` pattern)
- Process substitution `<()` (works in both, but `cat` on empty stdin can block on Desktop)
- Always guard stdin reads: `HOOK_INPUT=$(cat 2>/dev/null || true)`

## Environment Variables Reference

| Variable | Purpose | Required |
|----------|---------|----------|
| `SF_DATA_DIR` | Override SF token store location | No |
| `SFDX_STATE_FOLDER` | Legacy override for `.sfdx` directory | No |
| `NODE_BIN` | Explicit Node.js binary path | No |
| `CLAUDE_PLUGIN_ROOT` | Plugin root directory | Auto-set at session start |
| `OPSPAL_PLATFORM` | Detected platform string | Auto-set by `env-normalize.sh` |
| `SF_TARGET_ORG` | Salesforce org alias | Recommended |
