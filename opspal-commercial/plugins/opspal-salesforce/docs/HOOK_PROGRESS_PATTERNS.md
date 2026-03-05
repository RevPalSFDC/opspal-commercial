# Hook Progress Patterns - Best Practices Guide

## Overview

**Hook Progress Messages** (introduced in Claude Code v2.0.32) provide real-time feedback during long-running hook operations. This guide documents the standardized progress helper library and best practices for implementing progress messages in hooks.

**Key Fix in v2.0.32**: Progress messages now update correctly during PostToolUse hook execution (previously they didn't display properly).

## What Are Progress Messages?

Progress messages are visual indicators shown to users during hook execution to:
- Provide visibility into long-running operations
- Reduce perceived wait time
- Show clear completion status
- Display elapsed time for performance tracking

**Benefits:**
- ✅ Better user experience during slow operations
- ✅ Clear indication of hook activity
- ✅ Performance transparency (elapsed time)
- ✅ Color-coded status (info, success, warning, error)
- ✅ Progress bars for determinate operations

## Progress Helper Library

### Location

`.claude-plugins/opspal-salesforce/scripts/lib/hook-progress-helper.sh`

### Features

1. **Start/Update/Complete Pattern**
   - Start operation: `progress_start "message"`
   - Update progress: `progress_update "message" percent`
   - Complete operation: `progress_complete "message" show_time`

2. **Spinner Animations**
   - Indeterminate progress with rotating spinner
   - 10 Unicode frames for smooth animation

3. **Progress Bars**
   - Determinate progress with visual bar [████░░░░]
   - Percentage display (0-100%)

4. **Color-Coded Messages**
   - Info (blue): General information
   - Success (green): Successful completion
   - Warning (yellow): Completed with warnings
   - Error (red): Failed operation

5. **Time Tracking**
   - Automatic elapsed time calculation
   - Optional display on completion

6. **Multi-Step Operations**
   - Step tracking: `progress_step current total message`
   - Example: ⏳ [2/5] Validating permissions... (40%)

## Usage Patterns

### Pattern 1: Simple Progress (Indeterminate)

**Use Case**: Operation with unknown duration

```bash
#!/bin/bash
source "$PLUGIN_ROOT/scripts/lib/hook-progress-helper.sh"

progress_start "Analyzing task complexity"
# ... long-running operation ...
progress_complete "Analysis complete" true  # Show elapsed time
```

**Output:**
```
⏳ Analyzing task complexity...
✅ Analysis complete (2s)
```

### Pattern 2: Progress Bar (Determinate)

**Use Case**: Operation with measurable progress

```bash
#!/bin/bash
source "$PLUGIN_ROOT/scripts/lib/hook-progress-helper.sh"

progress_start "Processing deployment"

progress_update "Validating metadata" 25
# ... validation ...

progress_update "Deploying components" 50
# ... deployment ...

progress_update "Running tests" 75
# ... tests ...

progress_complete "Deployment successful" true
```

**Output:**
```
⏳ Processing deployment...
⏳ Validating metadata [█████░░░░░░░░░░░░░░░] 25%
⏳ Deploying components [██████████░░░░░░░░░░] 50%
⏳ Running tests [███████████████░░░░░] 75%
✅ Deployment successful (8s)
```

### Pattern 3: Multi-Step Progress

**Use Case**: Operation with distinct steps

```bash
#!/bin/bash
source "$PLUGIN_ROOT/scripts/lib/hook-progress-helper.sh"

TOTAL_STEPS=5

progress_step 1 $TOTAL_STEPS "Checking prerequisites"
# ... check ...

progress_step 2 $TOTAL_STEPS "Loading configuration"
# ... load ...

progress_step 3 $TOTAL_STEPS "Validating permissions"
# ... validate ...

progress_step 4 $TOTAL_STEPS "Syncing data"
# ... sync ...

progress_step 5 $TOTAL_STEPS "Finalizing"
# ... finalize ...

progress_complete "All steps complete" true
```

**Output:**
```
⏳ [1/5] Checking prerequisites... (20%)
⏳ [2/5] Loading configuration... (40%)
⏳ [3/5] Validating permissions... (60%)
⏳ [4/5] Syncing data... (80%)
⏳ [5/5] Finalizing... (100%)
✅ All steps complete (3s)
```

### Pattern 4: Conditional Completion

**Use Case**: Operation that may complete with different statuses

```bash
#!/bin/bash
source "$PLUGIN_ROOT/scripts/lib/hook-progress-helper.sh"

progress_start "Running validation"

if validate_data; then
    progress_complete "Validation passed" true
elif validate_with_warnings; then
    progress_warning "Validation completed with warnings" true
else
    progress_error "Validation failed" true
    exit 1
fi
```

**Output (Success):**
```
⏳ Running validation...
✅ Validation passed (1s)
```

**Output (Warning):**
```
⏳ Running validation...
⚠️ Validation completed with warnings (1s)
```

**Output (Error):**
```
⏳ Running validation...
❌ Validation failed (1s)
```

### Pattern 5: Spinner with Updates

**Use Case**: Operation with multiple stages but unknown percentage

```bash
#!/bin/bash
source "$PLUGIN_ROOT/scripts/lib/hook-progress-helper.sh"

progress_start "Analyzing codebase"

progress_spinner "Scanning files"
# ... scan ...

progress_spinner "Parsing metadata"
# ... parse ...

progress_spinner "Generating report"
# ... generate ...

progress_complete "Analysis complete" true
```

**Output:**
```
⏳ Analyzing codebase...
⠋ Scanning files...
⠙ Parsing metadata...
⠹ Generating report...
✅ Analysis complete (4s)
```

## API Reference

### Core Functions

#### `progress_start(message)`

Start a progress operation.

**Parameters:**
- `message`: Description of the operation

**Example:**
```bash
progress_start "Loading configuration"
```

#### `progress_update(message, [percent])`

Update progress with optional percentage.

**Parameters:**
- `message`: Current operation description
- `percent` (optional): Progress percentage (0-100)

**Example:**
```bash
progress_update "Processing data" 50
progress_update "Analyzing results"  # Without percentage
```

#### `progress_complete(message, [show_time])`

Complete progress operation successfully.

**Parameters:**
- `message`: Completion message
- `show_time` (optional): Show elapsed time (default: false)

**Example:**
```bash
progress_complete "Operation complete" true
```

#### `progress_warning(message, [show_time])`

Complete with warning status.

**Parameters:**
- `message`: Warning message
- `show_time` (optional): Show elapsed time (default: false)

**Example:**
```bash
progress_warning "Completed with warnings" true
```

#### `progress_error(message, [show_time])`

Complete with error status.

**Parameters:**
- `message`: Error message
- `show_time` (optional): Show elapsed time (default: false)

**Example:**
```bash
progress_error "Operation failed" true
```

### Advanced Functions

#### `progress_spinner(message)`

Show spinning animation (indeterminate progress).

**Parameters:**
- `message`: Operation description

**Example:**
```bash
progress_spinner "Processing complex analysis"
```

#### `progress_step(current, total, message)`

Show step progress in multi-step operation.

**Parameters:**
- `current`: Current step number
- `total`: Total number of steps
- `message`: Step description

**Example:**
```bash
progress_step 3 10 "Validating permissions"
```

#### `progress_info(message)`

Show info message (not part of progress sequence).

**Parameters:**
- `message`: Information message

**Example:**
```bash
progress_info "Using cached results for faster execution"
```

#### `progress_run(message, command...)`

Run command with automatic progress messages.

**Parameters:**
- `message`: Operation description
- `command...`: Command to execute

**Returns:**
- Exit code of the command

**Example:**
```bash
if progress_run "Running tests" npm test; then
    echo "Tests passed"
else
    echo "Tests failed"
fi
```

#### `progress_run_with_file(message, progress_file, command...)`

Run command with file-based progress updates.

**Parameters:**
- `message`: Operation description prefix
- `progress_file`: File containing progress percentage (0-100)
- `command...`: Command to execute

**Returns:**
- Exit code of the command

**Example:**
```bash
progress_run_with_file "Analyzing" /tmp/progress.txt \
    node scripts/analyzer.js --progress /tmp/progress.txt
```

## Hook Integration Examples

### Example 1: Auto-Router Hook

**Hook:** `auto-router-adapter.sh`

**Operation:** Analyze task complexity and suggest agents

```bash
#!/bin/bash
source "$PLUGIN_ROOT/scripts/lib/hook-progress-helper.sh"

# Start analysis
progress_start "Analyzing task complexity"

# Run auto-router (long operation)
ROUTER_OUTPUT=$(node "$AUTO_ROUTER" route "$USER_MESSAGE" 2>&1)

progress_update "Processing routing decision" 75

# Parse results
AGENT=$(echo "$ROUTER_OUTPUT" | jq -r '.agent')
CONFIDENCE=$(echo "$ROUTER_OUTPUT" | jq -r '.confidence')

progress_update "Finalizing recommendation" 90

# Complete with context
if [ -n "$AGENT" ]; then
    progress_complete "Analysis complete: Routing to $AGENT ($CONFIDENCE% confidence)" true
else
    progress_complete "Analysis complete: No specific routing needed"
fi
```

### Example 2: Permission Sync Hook

**Hook:** `pre-deployment-permission-sync.sh`

**Operation:** Sync permission sets before deployment

```bash
#!/bin/bash
source "$PLUGIN_ROOT/scripts/lib/hook-progress-helper.sh"

progress_start "Checking if permission sync is needed"

if ! should_sync_permissions "$manifest_path"; then
    progress_complete "Permission sync not needed"
    exit 0
fi

progress_update "Detecting initiative and permission config" 30

if config_file=$(detect_initiative "$manifest_path" "$org_alias"); then
    progress_update "Found permission config, preparing sync" 50
    progress_update "Syncing permissions" 75

    if sync_permissions "$config_file" "$org_alias"; then
        progress_complete "Permission sync successful" true
    else
        progress_warning "Permission sync failed, continuing deployment" true
    fi
else
    progress_complete "No permission config found"
fi
```

### Example 3: API Usage Tracking Hook

**Hook:** `post-sf-command.sh`

**Operation:** Track API calls after SF CLI commands

```bash
#!/bin/bash
source "$PLUGIN_ROOT/scripts/lib/hook-progress-helper.sh"

# Determine operation type and API call count
CALL_TYPE=$(determine_call_type "$COMMAND")
API_CALLS=$(estimate_api_calls "$COMMAND")

progress_start "Tracking API usage for $SUBCOMMAND"

# Track calls in background
for ((i=0; i<API_CALLS; i++)); do
    node "$API_MONITOR" track "$ORG" "$CALL_TYPE" "$SUBCOMMAND"
done

progress_complete "API usage tracked ($API_CALLS call(s))"
```

## Best Practices

### Do's ✅

1. **Always Source the Helper**
   ```bash
   source "$PLUGIN_ROOT/scripts/lib/hook-progress-helper.sh"
   ```

2. **Start Progress Before Long Operations**
   ```bash
   progress_start "Running analysis"
   # ... long operation ...
   progress_complete "Analysis complete"
   ```

3. **Show Elapsed Time for Slow Operations**
   ```bash
   progress_complete "Operation complete" true  # Show time
   ```

4. **Use Progress Bars When Possible**
   ```bash
   for i in {1..10}; do
       progress_update "Processing batch $i" $((i * 10))
   done
   ```

5. **Handle Errors Gracefully**
   ```bash
   if validate; then
       progress_complete "Validation passed"
   else
       progress_error "Validation failed"
       exit 1
   fi
   ```

6. **Output to stderr**
   - Progress messages go to stderr automatically
   - Hook JSON output goes to stdout
   - This prevents mixing

7. **Use Appropriate Completion Status**
   ```bash
   progress_complete  # Success (green)
   progress_warning   # Warning (yellow)
   progress_error     # Error (red)
   ```

### Don'ts ❌

1. **Don't Skip Progress for Long Operations**
   ```bash
   # ❌ BAD: No progress indicator
   node long-running-script.js

   # ✅ GOOD: With progress
   progress_start "Running analysis"
   node long-running-script.js
   progress_complete "Analysis complete" true
   ```

2. **Don't Mix stdout and Progress Messages**
   ```bash
   # ❌ BAD: Mixing outputs
   echo "Starting..." | tee -a progress.log

   # ✅ GOOD: Use progress helper (outputs to stderr)
   progress_start "Starting"
   ```

3. **Don't Forget to Complete**
   ```bash
   # ❌ BAD: Progress never completes
   progress_start "Processing"
   # ... operation ...
   exit 0  # No completion!

   # ✅ GOOD: Always complete
   progress_start "Processing"
   # ... operation ...
   progress_complete "Processing complete"
   ```

4. **Don't Show Progress for Fast Operations**
   ```bash
   # ❌ BAD: Progress for instant operation
   progress_start "Checking flag"
   FLAG="true"
   progress_complete "Flag checked"

   # ✅ GOOD: No progress for instant ops
   FLAG="true"
   ```

5. **Don't Use progress_info for Steps**
   ```bash
   # ❌ BAD: Using info instead of progress
   progress_info "Step 1 of 5"

   # ✅ GOOD: Use progress_step
   progress_step 1 5 "First step"
   ```

6. **Don't Hard-code Percentages Without Logic**
   ```bash
   # ❌ BAD: Arbitrary percentages
   progress_update "Doing something" 50  # Why 50%?

   # ✅ GOOD: Calculated percentages
   progress_update "Processing batch $i" $((i * 100 / total))
   ```

## Performance Considerations

### When to Use Progress Messages

**Always Use For:**
- Operations > 1 second
- Network calls (API, database)
- File system operations (search, copy)
- Complex calculations
- Multi-step workflows

**Optional For:**
- Operations 0.5-1 second
- Loops with < 10 iterations
- Simple file reads

**Skip For:**
- Operations < 0.5 second
- Simple variable assignments
- Conditional checks

### Overhead

Progress messages have minimal overhead:
- **Per call:** ~5ms (echo to stderr)
- **Total impact:** < 1% for operations > 1 second
- **Network impact:** None (all local)

## Testing Progress Messages

### Manual Testing

```bash
# Test progress helper directly
bash .claude-plugins/opspal-salesforce/scripts/lib/hook-progress-helper.sh
```

### Unit Testing

```bash
# Create test script
cat > test-progress.sh <<'EOF'
#!/bin/bash
source ./scripts/lib/hook-progress-helper.sh

# Test 1: Simple progress
progress_start "Test operation"
sleep 1
progress_complete "Test complete" true

# Test 2: Progress bar
progress_start "Multi-step operation"
for i in {1..5}; do
    progress_update "Step $i" $((i * 20))
    sleep 0.2
done
progress_complete "All steps complete" true
EOF

bash test-progress.sh
```

### Integration Testing

Test progress messages in actual hooks:

```bash
# Test auto-router hook
echo '{"user_message": "Deploy to production"}' | \
    bash .claude-plugins/opspal-salesforce/hooks/auto-router-adapter.sh
```

## Troubleshooting

### Progress Messages Not Showing

**Symptom:** No progress messages appear during hook execution

**Causes:**
1. Not sourcing the helper library
2. Outputting to stdout instead of stderr
3. Hook errors preventing execution

**Solutions:**
```bash
# 1. Check if helper is sourced
grep "source.*hook-progress-helper" your-hook.sh

# 2. Verify stderr output
# Progress messages should use >&2 (handled by helper)

# 3. Check for errors
bash -x your-hook.sh  # Run with tracing
```

### Progress Messages Interleaved with Output

**Symptom:** Progress messages mixed with JSON output

**Cause:** Not separating stderr (progress) from stdout (JSON)

**Solution:**
```bash
# Correct: Progress to stderr, JSON to stdout
progress_start "Processing" >&2  # Explicit stderr (helper does this)
echo '{"result": "success"}'    # JSON to stdout
```

### Time Tracking Not Working

**Symptom:** Elapsed time shows 0s or incorrect value

**Cause:** `PROGRESS_START_TIME` not set

**Solution:**
```bash
# Always use progress_start to initialize timer
progress_start "Operation"  # Sets PROGRESS_START_TIME

# Then complete with time
progress_complete "Complete" true  # Shows elapsed time
```

### Color Codes Not Rendering

**Symptom:** ANSI color codes appear as text: `\033[32m✅\033[0m`

**Cause:** Terminal doesn't support ANSI colors

**Solution:**
```bash
# Check if terminal supports colors
if [[ -t 2 ]] && type tput &>/dev/null && tput colors &>/dev/null; then
    # Colors supported
    progress_start "Operation"
else
    # Fallback to plain text
    echo "⏳ Operation..." >&2
fi
```

## Migration Guide

### Updating Existing Hooks

**Step 1:** Add progress helper import
```bash
# Add after shebang and before main logic
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
source "$PLUGIN_ROOT/scripts/lib/hook-progress-helper.sh"
```

**Step 2:** Identify long-running operations
```bash
# Look for:
# - node commands
# - sf commands
# - loops with multiple iterations
# - file system operations
```

**Step 3:** Add progress messages
```bash
# Before:
run_complex_analysis

# After:
progress_start "Running complex analysis"
run_complex_analysis
progress_complete "Analysis complete" true
```

**Step 4:** Test the hook
```bash
bash your-hook.sh  # Test directly
```

## Related Documentation

- **Claude Code v2.0.32 Release Notes**: Hook progress message fix
- **Hook System Guide**: `.claude-plugins/opspal-salesforce/docs/HOOK_SYSTEM_GUIDE.md`
- **Phase 2 Implementation**: `PHASE_2_PART_2_HOOK_PROGRESS_COMPLETE.md`

## Summary

**Key Takeaways:**

1. **Progress Helper Library**: Standardized functions for all hooks
2. **Three Patterns**: Simple, determinate (bar), multi-step
3. **Four Statuses**: Complete, warning, error, info
4. **Always Show Time**: For operations > 1 second
5. **Minimal Overhead**: < 1% impact on hook performance

**Impact:**
- ✅ Better user experience during slow hooks
- ✅ Clear visibility into hook operations
- ✅ Performance transparency with elapsed time
- ✅ Consistent progress message formatting
- ✅ Easy to integrate into existing hooks

**Next Steps:**
1. Update remaining hooks with progress messages
2. Test progress messages in production
3. Gather user feedback on UX improvement
4. Consider extending to other plugins

---

**Version**: 1.0.0
**Last Updated**: 2025-11-04
**Maintained By**: salesforce-plugin team
