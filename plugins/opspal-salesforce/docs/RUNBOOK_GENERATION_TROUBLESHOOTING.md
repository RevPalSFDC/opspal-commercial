# Runbook Generation Troubleshooting Guide

## Error: "Runbook scripts not found"

### Symptoms
When running `/generate-runbook`, you see:
```
⚠️  Runbook scripts not found - creating manual runbook instead
```

### Root Cause
The `generate-enhanced-runbook.sh` script cannot locate the required JavaScript files:
- `scripts/lib/runbook-reflection-bridge.js`
- `scripts/lib/runbook-synthesizer.js`
- `scripts/lib/runbook-renderer.js`

This typically happens when the `CLAUDE_PLUGIN_ROOT` environment variable is not set and the script is executed from an unusual location (e.g., `/tmp/`).

### Quick Fix (Immediate)

Set the `CLAUDE_PLUGIN_ROOT` environment variable to point to your Salesforce plugin directory:

```bash
# Find your plugin root (run from the opspal-internal-plugins directory)
export CLAUDE_PLUGIN_ROOT=$(pwd)/.claude-plugins/opspal-salesforce

# Verify it's set correctly
echo $CLAUDE_PLUGIN_ROOT

# Now run the command
/generate-runbook
```

### Permanent Fix (Recommended)

Add to your shell profile (`~/.bashrc`, `~/.zshrc`, or equivalent):

```bash
# Add this line to your shell profile
export CLAUDE_PLUGIN_ROOT=$HOME/Desktop/RevPal/Agents/opspal-internal-plugins/.claude-plugins/opspal-salesforce
```

Then reload your shell:
```bash
source ~/.bashrc  # or ~/.zshrc
```

### Verification

After setting `CLAUDE_PLUGIN_ROOT`, verify the fix:

```bash
# Check environment variable
echo $CLAUDE_PLUGIN_ROOT
# Should output: /path/to/salesforce-plugin

# Test path resolution
ls -la $CLAUDE_PLUGIN_ROOT/scripts/lib/runbook-*.js
# Should list all runbook scripts

# Run the command
/generate-runbook
# Should work without errors
```

### Alternative Solution

If you cannot set environment variables, the updated script (v3.61.0+) will automatically detect the plugin root using Node.js path resolution. This works even when:
- Script is executed from `/tmp/`
- Working directory changes
- Script is symlinked

The automatic detection looks for these markers:
1. `plugin.json` in root directory
2. `.claude-plugin/plugin.json` in subdirectory

### Technical Details

**Path Resolution Priority:**
1. `$CLAUDE_PLUGIN_ROOT` environment variable (highest priority)
2. Node.js `path-conventions.js` module resolution
3. Script location fallback (`../../` from script directory)

**Required Directory Structure:**
```
.claude-plugins/opspal-salesforce/
├── plugin.json (or .claude-plugin/plugin.json)
├── scripts/
│   └── lib/
│       ├── generate-enhanced-runbook.sh
│       ├── path-conventions.js
│       ├── runbook-reflection-bridge.js
│       ├── runbook-synthesizer.js
│       └── runbook-renderer.js
└── instances/
    └── salesforce/
        └── {org-alias}/
            ├── observations/
            └── RUNBOOK.md (generated)
```

### Related Documentation

- **Portable Script Development**: See Salesforce Plugin CLAUDE.md section on `CLAUDE_PLUGIN_ROOT`
- **Path Conventions**: See `scripts/lib/path-conventions.js` for path resolution logic
- **Claude Code Version**: Requires v2.0.37+ for automatic `CLAUDE_PLUGIN_ROOT` provision

### Still Having Issues?

If the error persists after setting `CLAUDE_PLUGIN_ROOT`:

1. **Verify plugin installation**:
   ```bash
   ls -la .claude-plugins/opspal-salesforce/plugin.json
   ```

2. **Check script permissions**:
   ```bash
   ls -la .claude-plugins/opspal-salesforce/scripts/lib/*.sh
   # All .sh files should be executable (rwxr-xr-x)
   ```

3. **Test script directly**:
   ```bash
   bash .claude-plugins/opspal-salesforce/scripts/lib/generate-enhanced-runbook.sh acme-production
   ```

4. **Check Node.js availability**:
   ```bash
   node --version
   # Should output v14.0.0 or higher
   ```

5. **Submit reflection** with error details:
   ```bash
   /reflect
   ```

### Version History

- **v3.61.0+**: Automatic path resolution using `path-conventions.js`
- **v3.42.0**: Initial Living Runbook System implementation
- **v3.0.0**: Original runbook generator with manual path configuration
