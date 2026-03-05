# Troubleshooting /reflect on Remote Systems

## Quick Diagnosis

Run this comprehensive diagnostic script:

```bash
./claude-plugins/developer-tools-plugin/scripts/lib/diagnose-reflect-remote.sh hubspot-plugin
```

This will check:
- ✅ Plugin installation
- ✅ Command file existence
- ✅ Recent reflection files
- ✅ Submission script
- ✅ Post-reflect hook
- ✅ Node.js availability
- ✅ Environment variables
- ✅ Supabase connectivity
- ✅ Git repository status
- ✅ Claude Code version

## Common Issues & Fixes

### Issue 1: Plugin Not Updated

**Symptoms**: /reflect doesn't auto-submit, or generates error about missing script

**Cause**: Plugin not updated with latest auto-submit feature

**Fix**:
```bash
# Pull latest changes
cd /path/to/opspal-internal-plugins
git pull origin main

# Reinstall plugin
/plugin uninstall opspal-hubspot@revpal-internal-plugins
/plugin install opspal-hubspot@revpal-internal-plugins
```

### Issue 2: Post-Reflect Hook Not Executable

**Symptoms**: Reflection generated but not submitted, no submission output

**Cause**: Hook file exists but doesn't have execute permissions

**Fix**:
```bash
chmod +x .claude-plugins/opspal-hubspot/hooks/post-reflect.sh
```

**Verify**:
```bash
ls -la .claude-plugins/opspal-hubspot/hooks/post-reflect.sh
# Should show: -rwxr-xr-x (with x permissions)
```

### Issue 3: Node.js Not Installed

**Symptoms**: Error about `node` command not found

**Cause**: Node.js not installed on system

**Fix**:
```bash
# Check if Node.js is installed
node --version

# If not installed, install via:
# Ubuntu/Debian:
sudo apt-get update && sudo apt-get install nodejs npm

# macOS:
brew install node

# Or download from: https://nodejs.org/
```

**Verify version >= 18.0.0**

### Issue 4: Reflection File Not Generated

**Symptoms**: /reflect runs but no `.claude/SESSION_REFLECTION_*.json` file created

**Cause**: Command failed to generate JSON output

**Debug**:
1. Check if `/reflect` command exists:
   ```bash
   ls -la .claude-plugins/opspal-hubspot/commands/reflect.md
   ```

2. Verify command frontmatter:
   ```bash
   head -10 .claude-plugins/opspal-hubspot/commands/reflect.md
   # Should show YAML frontmatter with model, tools, etc.
   ```

3. Check `.claude` directory permissions:
   ```bash
   ls -ld .claude
   # Should be writable
   ```

4. Try creating test file:
   ```bash
   touch .claude/test.json
   # If this fails, permissions issue
   ```

### Issue 5: Supabase Connection Failure

**Symptoms**: "Network error" or "Supabase API error" during submission

**Cause**: Network connectivity or incorrect credentials

**Fix**:
```bash
# Test connectivity
curl -s https://REDACTED_SUPABASE_PROJECT.supabase.co/rest/v1/reflections?limit=1 \
  -H "apikey: REDACTED_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer REDACTED_SUPABASE_ANON_KEY"

# Should return HTTP 200 with JSON array
```

**If fails**:
- Check internet connection
- Check firewall/proxy settings
- Verify Supabase URL is accessible

### Issue 6: Environment Variables Missing

**Symptoms**: Submissions work but missing attribution or using wrong Supabase

**Cause**: Environment variables not set

**Fix**:
```bash
# Add to .env or .bashrc / .zshrc
export SUPABASE_URL='https://REDACTED_SUPABASE_PROJECT.supabase.co'
export SUPABASE_ANON_KEY='REDACTED_SUPABASE_ANON_KEY'
export USER_EMAIL='your-email@example.com'

# Source the file
source ~/.bashrc  # or ~/.zshrc
```

## Manual Testing

### Step 1: Verify Plugin Installation

```bash
/plugin list | grep hubspot-plugin
```

Expected output:
```
hubspot-plugin@revpal-internal-plugins (v1.3.1)
```

### Step 2: Check Command Exists

```bash
ls -la .claude-plugins/opspal-hubspot/commands/reflect.md
```

Expected: File exists with ~300+ lines

### Step 3: Run /reflect

```bash
# In Claude Code session:
/reflect
```

Expected behavior:
1. Command analyzes session
2. Generates JSON output
3. Saves to `.claude/SESSION_REFLECTION_<timestamp>.json`
4. Auto-submits to Supabase
5. Reports success/failure

### Step 4: Verify Reflection File Created

```bash
ls -lt .claude/SESSION_REFLECTION_*.json | head -1
```

Expected: Shows most recent reflection file

### Step 5: Validate JSON

```bash
LATEST=$(ls -t .claude/SESSION_REFLECTION_*.json | head -1)
jq empty "$LATEST" && echo "Valid JSON" || echo "Invalid JSON"
```

Expected: "Valid JSON"

### Step 6: Manual Submission Test

```bash
LATEST=$(ls -t .claude/SESSION_REFLECTION_*.json | head -1)
node .claude-plugins/opspal-hubspot/scripts/lib/submit-reflection.js "$LATEST"
```

Expected output:
```
🔒 Sanitizing reflection data...
✅ Payload validated with JSONB wrapper
Submitting reflection...
  Plugin: hubspot-plugin v1.3.1
  Org: [your-org]
  Focus: [detected-focus]
  Issues: X total, Y high-priority

✅ Reflection submitted successfully
```

## Debugging Output

### Enable Verbose Hook Output

```bash
# Add debug mode to post-reflect hook
sed -i '2i set -x' .claude-plugins/opspal-hubspot/hooks/post-reflect.sh
```

This will show every command executed in the hook.

**To disable**:
```bash
sed -i '/set -x/d' .claude-plugins/opspal-hubspot/hooks/post-reflect.sh
```

### Check Hook Execution Log

If using a log directory:
```bash
tail -f .claude/logs/post-reflect.log
```

### Test Hook Directly

```bash
# Create test reflection first
LATEST=$(ls -t .claude/SESSION_REFLECTION_*.json | head -1)

# Run hook manually
.claude-plugins/opspal-hubspot/hooks/post-reflect.sh
```

## Getting Help from Remote System

When asking for help, provide this diagnostic output:

```bash
# Run full diagnostic
./diagnose-reflect-remote.sh hubspot-plugin > diagnostic-output.txt 2>&1

# Include in support request:
cat diagnostic-output.txt
```

Also include:
- Exact error message from /reflect
- Output of manual submission test
- Any relevant logs

## Comparison: Working vs Non-Working System

To compare with working system:

```bash
# On working system
./diagnose-reflect-remote.sh hubspot-plugin > working-system.txt

# On failing system
./diagnose-reflect-remote.sh hubspot-plugin > failing-system.txt

# Compare
diff working-system.txt failing-system.txt
```

## Quick Fixes Checklist

Run through this checklist:

- [ ] Git pull latest changes: `git pull origin main`
- [ ] Reinstall plugin: `/plugin uninstall && /plugin install`
- [ ] Make hook executable: `chmod +x .claude-plugins/opspal-hubspot/hooks/post-reflect.sh`
- [ ] Verify Node.js installed: `node --version`
- [ ] Test Supabase connectivity: `curl https://REDACTED_SUPABASE_PROJECT.supabase.co/rest/v1/reflections?limit=1 ...`
- [ ] Check .claude directory permissions: `ls -ld .claude`
- [ ] Run diagnostic: `./diagnose-reflect-remote.sh hubspot-plugin`
- [ ] Test manual submission: `node .claude-plugins/opspal-hubspot/scripts/lib/submit-reflection.js <file>`

## System Requirements

Minimum requirements for /reflect:
- ✅ Claude Code installed and in PATH
- ✅ Plugin installed (`/plugin list` shows it)
- ✅ Node.js >= v18.0.0
- ✅ Write permissions on `.claude/` directory
- ✅ Internet connectivity (for Supabase submission)
- ✅ Git repository (recommended, for updates)

Optional but recommended:
- Environment variables set (`USER_EMAIL`, etc.)
- `jq` installed (for JSON validation)
- `curl` installed (for connectivity tests)

## Next Steps

If issue persists after trying these fixes:

1. **Run full diagnostic** and save output:
   ```bash
   ./diagnose-reflect-remote.sh hubspot-plugin | tee diagnostic.log
   ```

2. **Try on different plugin** to isolate:
   ```bash
   ./diagnose-reflect-remote.sh salesforce-plugin
   ```

3. **Check Claude Code version**:
   ```bash
   claude --version
   ```

4. **Report issue** with:
   - Diagnostic output (`diagnostic.log`)
   - Claude Code version
   - Operating system details
   - Exact error messages

---

**Last Updated**: 2025-10-13
**Related**: [Plugin Loading Troubleshooting](TROUBLESHOOTING_PLUGIN_LOADING.md), [Plugin Development Guide](PLUGIN_DEVELOPMENT_GUIDE.md)
