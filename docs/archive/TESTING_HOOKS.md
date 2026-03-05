# Testing UserPromptSubmit Hooks

This guide explains how to test if your UserPromptSubmit hooks are working correctly across different systems.

## Quick Diagnostic

The fastest way to check if hooks are working:

```bash
# For Salesforce Plugin
bash .claude-plugins/opspal-salesforce/scripts/diagnose-hook-health.sh

# For OpsPal Core
bash .claude-plugins/opspal-core/scripts/diagnose-hook-health.sh
```

**Output Example:**
```
================================================
UserPromptSubmit Hook Health Diagnostic
================================================

[1/6] Searching for UserPromptSubmit hooks...
✓ Found 2 hook(s)
  - user-prompt-router.sh
  - user-prompt-submit-wrapper.sh

[2/6] Checking permissions...
✓ All hooks are executable

[3/6] Validating syntax...
✓ All hooks have valid syntax

[4/6] Checking dependencies...
✓ All required dependencies are installed

[5/6] Testing hook execution...
✓ Executed successfully: user-prompt-router.sh
✓ Executed successfully: user-prompt-submit-wrapper.sh

[6/6] Checking environment...
  ✓ ENABLE_AUTO_ROUTING=1
  ✓ ENABLE_SUBAGENT_BOOST=1

================================================
Status: All checks passed!
================================================
```

## Comprehensive Test Suite

For detailed testing with multiple test cases:

```bash
# Test all plugins
./test-userprompt-hooks.sh

# Test specific plugin
./test-userprompt-hooks.sh salesforce

# Verbose mode
./test-userprompt-hooks.sh --verbose

# Debug mode (full logs)
./test-userprompt-hooks.sh --debug
```

## What Gets Tested

### 1. File Existence & Permissions
- Hook files exist in `hooks/` directory
- Files are executable (`chmod +x`)
- File paths are correct

### 2. Syntax Validation
- Bash syntax is correct (`bash -n`)
- No parse errors
- Proper shell usage

### 3. Execution Test
- Hook runs without errors
- Accepts JSON input via stdin
- Produces output or modifies prompt
- Exit code is 0 (success)

### 4. Dependency Check
- Required tools installed (`jq`, `node`, `bc`)
- Scripts referenced exist
- MCP tools available (if needed)

### 5. Input Handling
- Parses JSON correctly
- Extracts `user_message` field
- Handles edge cases ([DIRECT], [USE:agent])

### 6. Output Validation
- Stdout contains modified prompt or original
- Stderr doesn't contain fatal errors
- No hanging or timeout issues

## Manual Testing

### Test 1: Basic Execution

```bash
cd .claude-plugins/opspal-salesforce

# Create test input
echo '{"user_message":"Deploy validation rules","cwd":"'$(pwd)'","hook_event_name":"UserPromptSubmit"}' | \
  bash hooks/user-prompt-submit-wrapper.sh
```

**Expected**: Hook outputs message (modified or original) with exit code 0.

### Test 2: Direct Flag

```bash
echo '{"user_message":"[DIRECT] simple command","cwd":"'$(pwd)'","hook_event_name":"UserPromptSubmit"}' | \
  bash hooks/user-prompt-router.sh
```

**Expected**: Hook passes through the message unchanged.

### Test 3: Agent Specification

```bash
echo '{"user_message":"[USE: sfdc-cpq-assessor] Run assessment","cwd":"'$(pwd)'","hook_event_name":"UserPromptSubmit"}' | \
  bash hooks/user-prompt-router.sh
```

**Expected**: Hook prepends "Using the sfdc-cpq-assessor agent" to message.

### Test 4: Timeout Resistance

```bash
timeout 3s bash hooks/user-prompt-router.sh < <(echo '{"user_message":"test","cwd":"'$(pwd)'","hook_event_name":"UserPromptSubmit"}')
echo "Exit code: $?"
```

**Expected**: Completes within 3 seconds, exit code 0.

## Debugging Silent Failures

### Method 1: Add Debug Logging

Edit your hook to add debug output:

```bash
#!/bin/bash

# Add at the top of the hook
DEBUG_LOG="/tmp/hook-debug-$(date +%s).log"
{
  echo "=== Hook Called: $(date) ==="
  echo "Input:"
  cat
} | tee -a "$DEBUG_LOG" | {
  # Rest of hook logic
  # ...
}
```

Then check `/tmp/hook-debug-*.log` after running Claude Code.

### Method 2: Stderr Monitoring

Add visible stderr output:

```bash
#!/bin/bash

echo "[HOOK] UserPromptSubmit called at $(date)" >&2

# Rest of hook logic...
```

Run Claude Code and watch for the message in stderr.

### Method 3: File Marker

Create a file when hook executes:

```bash
#!/bin/bash

touch "/tmp/userprompt-hook-executed-$(date +%Y%m%d-%H%M%S)"

# Rest of hook logic...
```

Check `/tmp/` for marker files after Claude Code operations.

### Method 4: Check Claude Code Logs

Claude Code logs hook execution:

```bash
# Enable debug mode
export CLAUDE_CODE_DEBUG=1

# Run Claude Code
claude

# Check logs (location varies by installation)
# Mac/Linux: ~/.claude/logs/
# Check for hook-related entries
```

## Common Issues & Solutions

### Issue 1: Hook Not Found

**Symptom**: Hook never executes, no errors

**Causes**:
- Hook not in correct directory (must be `hooks/`)
- Filename doesn't match pattern (`*user-prompt*.sh`)
- Plugin not installed correctly

**Solution**:
```bash
# Check plugin installation
ls -la .claude-plugins/opspal-salesforce/hooks/

# Verify hook files
find .claude-plugins -name "*user-prompt*.sh"

# Reinstall plugin if needed
/plugin uninstall opspal-salesforce@revpal-internal-plugins
/plugin install opspal-salesforce@revpal-internal-plugins
```

### Issue 2: Permission Denied

**Symptom**: Hook exists but doesn't run

**Cause**: File not executable

**Solution**:
```bash
chmod +x .claude-plugins/*/hooks/*.sh
```

### Issue 3: Missing Dependencies

**Symptom**: Hook fails with "command not found"

**Causes**:
- `jq` not installed (JSON parsing)
- `node` not installed (JavaScript execution)
- `bc` not installed (arithmetic)

**Solution**:
```bash
# macOS
brew install jq node bc

# Linux (Debian/Ubuntu)
sudo apt-get install jq nodejs bc

# Verify installation
which jq node bc
```

### Issue 4: Syntax Errors

**Symptom**: Hook fails immediately

**Cause**: Bash syntax errors

**Solution**:
```bash
# Check syntax
bash -n .claude-plugins/opspal-salesforce/hooks/user-prompt-router.sh

# Common issues:
# - Missing quotes around variables
# - Unescaped special characters
# - Missing semicolons in loops
```

### Issue 5: Timeout/Hanging

**Symptom**: Hook never completes

**Causes**:
- Infinite loop
- Waiting for user input
- Network call without timeout
- Heavy computation

**Solution**:
```bash
# Test with timeout
timeout 5s bash hooks/user-prompt-router.sh < <(echo '{"user_message":"test","cwd":"'$(pwd)'","hook_event_name":"UserPromptSubmit"}')

# Add timeouts to external calls in hook:
timeout 5s node script.js
```

### Issue 6: JSON Parsing Failures

**Symptom**: Hook receives input but doesn't process it

**Cause**: Invalid JSON or wrong field names

**Solution**:
```bash
# Test JSON parsing manually
echo '{"user_message":"test","cwd":"'$(pwd)'","hook_event_name":"UserPromptSubmit"}' | jq -r '.user_message'

# Check field names in hook match Claude Code's format:
# - user_message (not message or prompt)
# - cwd (not pwd or dir)
# - hook_event_name (not event or type)
```

## Testing on Different Systems

### Development Environment

Test in your local development setup:

```bash
cd /path/to/opspal-internal-plugins
./test-userprompt-hooks.sh --verbose
```

### Marketplace Installation

Test after installing from marketplace:

```bash
# Location varies:
# ~/.claude/plugins/opspal-salesforce@revpal-internal-plugins/

cd ~/.claude/plugins/opspal-salesforce@revpal-internal-plugins
bash scripts/diagnose-hook-health.sh
```

### CI/CD Pipeline

Add to your CI/CD:

```yaml
# GitHub Actions example
- name: Test UserPromptSubmit Hooks
  run: |
    chmod +x test-userprompt-hooks.sh
    ./test-userprompt-hooks.sh
```

## Verifying Hooks Are Being Called

### Method 1: System Call Counter

Add counter to hook:

```bash
#!/bin/bash

COUNTER_FILE="/tmp/userprompt-hook-counter"
if [ -f "$COUNTER_FILE" ]; then
  COUNT=$(cat "$COUNTER_FILE")
  ((COUNT++))
else
  COUNT=1
fi
echo "$COUNT" > "$COUNTER_FILE"

echo "[HOOK] Call #$COUNT" >&2

# Rest of hook logic...
```

Check count: `cat /tmp/userprompt-hook-counter`

### Method 2: Slack Notification

Send notification when hook runs:

```bash
#!/bin/bash

if [ -n "$SLACK_WEBHOOK_URL" ]; then
  curl -X POST "$SLACK_WEBHOOK_URL" \
    -H 'Content-Type: application/json' \
    -d '{"text":"UserPromptSubmit hook called"}' \
    --silent --max-time 2 || true
fi

# Rest of hook logic...
```

### Method 3: Log Rotation

Create rotating logs:

```bash
#!/bin/bash

LOG_DIR="/tmp/hook-logs"
mkdir -p "$LOG_DIR"

LOG_FILE="$LOG_DIR/$(date +%Y%m%d).log"
echo "$(date +'%H:%M:%S') - Hook called" >> "$LOG_FILE"

# Keep only last 7 days
find "$LOG_DIR" -name "*.log" -mtime +7 -delete

# Rest of hook logic...
```

## Performance Testing

### Measure Hook Execution Time

```bash
#!/bin/bash

START_TIME=$(date +%s%N)

# Hook logic here...

END_TIME=$(date +%s%N)
DURATION=$(( (END_TIME - START_TIME) / 1000000 )) # milliseconds

echo "[PERF] Hook execution: ${DURATION}ms" >&2
```

**Target**: < 100ms for user-facing hooks

### Test Under Load

```bash
# Test 100 rapid executions
for i in {1..100}; do
  echo '{"user_message":"test '$i'","cwd":"'$(pwd)'","hook_event_name":"UserPromptSubmit"}' | \
    bash hooks/user-prompt-router.sh > /dev/null
done
```

## Automated Monitoring

### Health Check Script

Create a cron job to monitor hook health:

```bash
#!/bin/bash
# File: /usr/local/bin/check-claude-hooks.sh

cd ~/.claude/plugins/opspal-salesforce@revpal-internal-plugins

if bash scripts/diagnose-hook-health.sh --quick > /tmp/hook-health.log 2>&1; then
  echo "Hooks healthy at $(date)" >> /var/log/claude-hooks.log
else
  echo "Hooks unhealthy at $(date)" >> /var/log/claude-hooks.log
  # Send alert
  mail -s "Claude Code Hooks Issue" admin@example.com < /tmp/hook-health.log
fi
```

Add to crontab:
```bash
# Check hooks daily at 9 AM
0 9 * * * /usr/local/bin/check-claude-hooks.sh
```

## Reporting Issues

If hooks fail in production but pass all tests:

### 1. Collect Diagnostic Information

```bash
# Run full diagnostic
./test-userprompt-hooks.sh --debug > hook-diagnostic.log 2>&1

# Collect system info
uname -a >> hook-diagnostic.log
bash --version >> hook-diagnostic.log
which jq node bc >> hook-diagnostic.log
```

### 2. Enable Maximum Logging

```bash
export CLAUDE_DEBUG=1
export ROUTING_VERBOSE=1
export CLAUDE_CODE_DEBUG=1
```

### 3. Create Minimal Reproduction

```bash
# Simplify hook to minimal case
#!/bin/bash
echo "Hook called" >&2
cat  # Pass through input unchanged
```

If minimal case works but full hook doesn't, bisect to find issue.

### 4. Submit Issue Report

Include:
- Diagnostic log (`hook-diagnostic.log`)
- System information (OS, shell, Claude Code version)
- Hook file contents (if not sensitive)
- Steps to reproduce
- Expected vs actual behavior

## Best Practices

### 1. Fail Gracefully

Always exit 0 even on errors:

```bash
#!/bin/bash

# If hook fails, pass through input unchanged
{
  # Hook logic...
} || {
  cat  # Pass through on error
}

exit 0  # Always exit successfully
```

### 2. Timeout Protection

Add timeouts to all external calls:

```bash
timeout 5s node script.js || echo "Script timed out" >&2
```

### 3. Dependency Checks

Check dependencies before use:

```bash
if ! command -v jq &> /dev/null; then
  echo "Warning: jq not found, skipping processing" >&2
  cat  # Pass through
  exit 0
fi
```

### 4. Input Validation

Validate JSON structure:

```bash
INPUT=$(cat)

if ! echo "$INPUT" | jq empty 2>/dev/null; then
  echo "Warning: Invalid JSON input" >&2
  echo "$INPUT"
  exit 0
fi
```

### 5. Performance Budget

Keep execution time < 100ms:

```bash
# Avoid:
# - Heavy computation
# - Network calls without timeouts
# - Large file reads
# - Complex regex on large strings
```

## Testing Checklist

Before releasing hooks to users:

- [ ] Syntax validation passes (`bash -n`)
- [ ] All dependencies documented
- [ ] Execution completes < 100ms
- [ ] Handles invalid JSON gracefully
- [ ] Exit code is always 0
- [ ] No hanging or infinite loops
- [ ] Works with and without dependencies
- [ ] Tested on macOS, Linux, and Windows (if applicable)
- [ ] Documented in plugin CLAUDE.md
- [ ] Diagnostic script runs successfully
- [ ] Performance tested under load

## Additional Resources

- **Hook Development Guide**: `docs/HOOK_DEVELOPMENT.md`
- **Claude Code Hooks Documentation**: https://docs.claude.com/en/docs/claude-code/hooks
- **Plugin Development**: `docs/PLUGIN_DEVELOPMENT.md`
- **Troubleshooting**: `docs/TROUBLESHOOTING.md`

---

**Version**: 1.0.0
**Last Updated**: 2025-11-23
**Maintained By**: RevPal Engineering
