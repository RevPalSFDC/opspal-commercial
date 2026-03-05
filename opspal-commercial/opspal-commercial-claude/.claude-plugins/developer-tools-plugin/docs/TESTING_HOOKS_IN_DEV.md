# Testing Plugin Hooks in Development

## Overview

Plugin hooks (SessionStart, PostInstall, etc.) only execute in **installed plugin contexts**, not in the development repository. This is intentional behavior that prevents hooks from running unintentionally during development.

## Why Hooks Don't Run in Dev Repo

When you're working in the plugin source repository:
- ✅ You're **building** and **developing** plugins
- ❌ You're **not using** plugins in a project context
- ❌ Hooks are **disabled** to avoid side effects during development

When users install your plugin:
- ✅ Plugins are **installed** into a project via `/plugin install`
- ✅ Hooks **execute automatically** at appropriate times
- ✅ This is the **production** plugin experience

## Testing Strategies

### Option 1: Manual Hook Execution (Fastest)

Run hook scripts directly during development:

```bash
# Test SessionStart hook
.claude-plugins/salesforce-plugin/scripts/check-plugin-updates.sh

# Test PostInstall hook
.claude-plugins/hubspot-plugin/.claude-plugin/hooks/post-install.sh

# Test custom hooks
.claude-plugins/my-plugin/hooks/my-hook.sh
```

**Pros**:
- Fast iteration
- No installation needed
- Easy debugging

**Cons**:
- Doesn't test hook registration
- Misses environment variable substitution (`${CLAUDE_PLUGIN_ROOT}`)
- Doesn't validate hook execution order

### Option 2: Local Plugin Installation (Most Accurate)

Install your plugin locally in a test project:

```bash
# 1. Create test project
mkdir ~/test-plugin-project
cd ~/test-plugin-project

# 2. Install plugin from local filesystem
/plugin marketplace add file://path/to/opspal-internal-plugins
/plugin install my-plugin@local-marketplace

# 3. Test hook execution
# SessionStart hooks run automatically when Claude Code starts
# PostInstall hooks run during installation
```

**Pros**:
- Tests actual production behavior
- Validates hook registration
- Tests environment variable substitution
- Tests hook execution order

**Cons**:
- Slower iteration (requires reinstall for changes)
- Requires test project setup

### Option 3: Plugin Reload (Balanced)

Use `/plugin reload` to refresh plugin state:

```bash
# Make changes to hook scripts
vim .claude-plugins/my-plugin/hooks/my-hook.sh

# Reload plugin without reinstalling
/plugin reload my-plugin

# Test hook execution
# (depends on hook type - SessionStart runs on next session start)
```

**Pros**:
- Faster than full reinstall
- Tests hook registration
- Good for iterating on hook logic

**Cons**:
- Still requires plugin to be installed
- SessionStart hooks only run on new sessions

## Hook Types and Testing

### SessionStart Hooks

**When they run**: Every time Claude Code starts a new session or resumes an existing session

**Testing approach**:
```bash
# Option A: Manual execution
.claude-plugins/my-plugin/scripts/check-updates.sh

# Option B: Install and restart session
/plugin install my-plugin@local
# Restart Claude Code or start new session
```

**Common issues**:
- Cache files prevent frequent execution (by design)
- Hooks should be idempotent (safe to run multiple times)
- Exit code 0 = success (non-zero = error shown to user)

### PostInstall Hooks

**When they run**: Once after plugin installation completes

**Testing approach**:
```bash
# Option A: Manual execution
.claude-plugins/my-plugin/.claude-plugin/hooks/post-install.sh

# Option B: Reinstall plugin
/plugin uninstall my-plugin@local
/plugin install my-plugin@local
```

**Common issues**:
- Only runs once (use `/plugin reinstall` to test again)
- Should provide clear user instructions
- Should handle missing dependencies gracefully

### Custom Hooks

**When they run**: Depends on hook type (PreCommit, PostWrite, etc.)

**Testing approach**:
- Trigger the associated action (commit, write file, etc.)
- Use manual execution for faster iteration
- Install locally for integration testing

## Environment Variables in Hooks

Hooks have access to special environment variables:

- `${CLAUDE_PLUGIN_ROOT}` - Plugin installation directory
- `${CLAUDE_PROJECT_DIR}` - Project root directory
- `${CLAUDE_SESSION_ID}` - Current session identifier

**Testing environment variables**:

```bash
# In development (manual execution)
export CLAUDE_PLUGIN_ROOT="$(pwd)/.claude-plugins/my-plugin"
export CLAUDE_PROJECT_DIR="$(pwd)"
export CLAUDE_SESSION_ID="test-session-123"

.claude-plugins/my-plugin/hooks/my-hook.sh

# In installed context
# Variables are automatically set by Claude Code
```

## Debugging Hooks

### Enable Verbose Output

Add debug output to your hooks:

```bash
#!/bin/bash
set -x  # Print each command before execution

echo "=== Hook Debug Info ==="
echo "CLAUDE_PLUGIN_ROOT: $CLAUDE_PLUGIN_ROOT"
echo "CLAUDE_PROJECT_DIR: $CLAUDE_PROJECT_DIR"
echo "CLAUDE_SESSION_ID: $CLAUDE_SESSION_ID"
echo "PWD: $PWD"
echo "======================="

# Rest of hook logic...
```

### Check Hook Logs

Claude Code logs hook execution:

```bash
# Check Claude Code logs
cat ~/.claude/logs/session-*.log | grep -A5 "Hook execution"
```

### Test Hook Exit Codes

Hooks communicate success/failure via exit codes:

```bash
# Test exit code handling
bash -c ".claude-plugins/my-plugin/hooks/my-hook.sh; echo Exit code: $?"

# Exit code 0 = success (no output to user)
# Exit code non-zero = error (shown to user)
```

## Best Practices

### 1. Make Hooks Fast

SessionStart hooks run on every session start, so keep them fast:

```bash
# ✅ GOOD: Use caching to avoid frequent operations
CACHE_FILE="/tmp/my-plugin-cache-$(id -u).cache"
CACHE_TTL=3600  # 1 hour

if [ -f "$CACHE_FILE" ]; then
  CACHE_AGE=$(($(date +%s) - $(stat -c %Y "$CACHE_FILE" 2>/dev/null || echo 0)))
  if [ "$CACHE_AGE" -lt "$CACHE_TTL" ]; then
    exit 0  # Skip if cache is fresh
  fi
fi

# ❌ BAD: Network calls without caching
curl https://api.example.com/check-updates
```

### 2. Silent When Appropriate

Don't spam users with output on every session:

```bash
# ✅ GOOD: Silent when no action needed
if [ "$update_available" = "false" ]; then
  exit 0  # No output
fi

echo "🔔 Update available: v2.0.0"

# ❌ BAD: Output on every run
echo "Checking for updates..."
echo "No updates available"
```

### 3. Handle Errors Gracefully

Hooks shouldn't crash on missing dependencies:

```bash
# ✅ GOOD: Check dependencies, provide helpful errors
if ! command -v jq &> /dev/null; then
  echo "⚠️  jq not found (optional, enhances functionality)" >&2
  # Continue with degraded functionality
fi

# ❌ BAD: Assume dependencies exist
jq '.' some-file.json  # Crashes if jq not installed
```

### 4. Test in Both Contexts

Always test:
1. Manual execution (fast development iteration)
2. Installed plugin (validates production behavior)

```bash
# Development testing
.claude-plugins/my-plugin/hooks/my-hook.sh

# Production testing
mkdir ~/test-project && cd ~/test-project
/plugin marketplace add file://path/to/marketplace
/plugin install my-plugin@local
```

## Common Issues and Solutions

### Issue: Hook Doesn't Run

**Symptom**: Hook script exists but never executes

**Diagnosis**:
```bash
# Check hook registration in plugin.json
cat .claude-plugins/my-plugin/.claude-plugin/plugin.json | jq '.hooks'

# Verify hook file exists
ls -la .claude-plugins/my-plugin/hooks/
```

**Solutions**:
- Ensure hook is registered in `plugin.json` `hooks` section
- Verify hook file path matches `command` in plugin.json
- Check hook is executable (`chmod +x`)
- Confirm plugin is actually installed (`/plugin list`)

### Issue: Hook Runs in Dev Repo

**Symptom**: Hook executes during plugin development

**Solution**: This shouldn't happen. If it does:
- Check you're not accidentally in an installed plugin context
- Verify you haven't manually triggered the hook
- SessionStart hooks only run in installed contexts by design

### Issue: Environment Variables Not Set

**Symptom**: `$CLAUDE_PLUGIN_ROOT` is empty in hook

**Solution**:
- In **development**: Set manually for testing
- In **installed context**: Claude Code sets automatically
- Check plugin is installed, not just cloned

### Issue: Cache Prevents Testing

**Symptom**: Changes to hook don't seem to take effect

**Solution**:
```bash
# Clear cache files
rm -f /tmp/my-plugin-*.cache

# Or disable caching temporarily during testing
# Comment out cache check in hook script
```

## Recommended Development Workflow

1. **Initial Development**: Use manual execution
   ```bash
   vim .claude-plugins/my-plugin/hooks/my-hook.sh
   bash .claude-plugins/my-plugin/hooks/my-hook.sh
   ```

2. **Integration Testing**: Install locally
   ```bash
   mkdir ~/test-project && cd ~/test-project
   /plugin install my-plugin@file://path/to/marketplace
   # Test hook execution in real context
   ```

3. **Final Validation**: Test on fresh installation
   ```bash
   # Uninstall and reinstall to test PostInstall hooks
   /plugin uninstall my-plugin
   /plugin install my-plugin

   # Start new session to test SessionStart hooks
   # (restart Claude Code or open new project)
   ```

4. **Release**: Commit and push changes
   ```bash
   git add .claude-plugins/my-plugin/
   git commit -m "feat: Add session start hook"
   git push
   ```

## Documentation References

- [Plugin Architecture](../../../CLAUDE.md) - Overall plugin system
- [Hook Types Reference](https://docs.claude.com/hooks) - All available hook types
- [Plugin Development Guide](../README.md) - Complete plugin development guide
- [Marketplace Setup](../../../README.md) - Setting up plugin marketplace

---

**Questions?** See troubleshooting section or check plugin development examples in the repository.
