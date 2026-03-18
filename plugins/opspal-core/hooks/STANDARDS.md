# Hook Development Standards

**Version**: 2.0.0
**Created**: 2025-11-24
**Updated**: 2026-03-08
**Applies to**: All plugins in opspal-internal-plugins

This document defines the standards for developing, maintaining, and testing hooks across all plugins.

## Table of Contents

1. [Overview](#overview)
2. [Exit Code Standard](#exit-code-standard)
3. [Error Handler Integration](#error-handler-integration)
4. [Hook Categories](#hook-categories)
5. [Development Patterns](#development-patterns)
6. [Testing Requirements](#testing-requirements)
7. [Best Practices](#best-practices)

---

## Overview

Hooks are bash scripts that execute in response to Claude Code events. They provide extensibility for validation, transformation, logging, and orchestration.

### Hook Types (Claude Code Events)

| Event | When Triggered | Common Uses |
|-------|----------------|-------------|
| `user-prompt-submit` | Before user message processed | Routing, validation, transformation |
| `pre-command` | Before command execution | Validation, permission checks |
| `post-command` | After command execution | Logging, metrics, cleanup |
| `session-start` | When session begins | Context loading, initialization |
| `session-end` | When session ends | Cleanup, reporting |

---

## Exit Code Standard

**All hooks MUST use standardized exit codes** from `lib/error-handler.sh`:

| Code | Constant | Description | When to Use |
|------|----------|-------------|-------------|
| 0 | `EXIT_SUCCESS` | Success | Operation completed successfully |
| 1 | `EXIT_GENERAL_ERROR` | General error | Unspecified failure |
| 2 | `EXIT_INVALID_ARGS` | Invalid arguments | Missing or malformed arguments |
| 3 | `EXIT_NOT_FOUND` | Not found | Required file/resource missing |
| 4 | `EXIT_PERMISSION_DENIED` | Permission denied | Insufficient permissions |
| 5 | `EXIT_TIMEOUT` | Timeout | Operation exceeded time limit |
| 6 | `EXIT_DEPENDENCY_MISSING` | Missing dependency | Required command/tool not installed |
| 7 | `EXIT_VALIDATION_FAILED` | Validation failed | Pre-flight validation error |

### Exit Code Behavior

- **Exit 0**: Hook succeeded, continue operation
- **Exit 1-7**: Hook failed, behavior depends on hook type:
  - **Blocking hooks**: Operation is prevented
  - **Non-blocking hooks**: Operation continues (failure logged)

---

## Error Handler Integration

**All hooks MUST source the standardized error handler** for consistent logging and error handling.

### Integration Pattern

```bash
#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source standardized error handler for centralized logging
if [[ -n "${CLAUDE_PLUGIN_ROOT:-}" ]]; then
    ERROR_HANDLER="${CLAUDE_PLUGIN_ROOT}/opspal-core/hooks/lib/error-handler.sh"
else
    ERROR_HANDLER="${SCRIPT_DIR}/../../opspal-core/hooks/lib/error-handler.sh"
fi

if [[ -f "$ERROR_HANDLER" ]]; then
    source "$ERROR_HANDLER"
    HOOK_NAME="your-hook-name"  # REQUIRED: Set unique hook name

    # Choose mode based on hook type (see Hook Categories)
    # Blocking hooks: Keep strict mode (default)
    # Non-blocking hooks: set_lenient_mode 2>/dev/null || true
fi

# Your hook logic here...
```

### Error Handler Features

| Feature | Function | Description |
|---------|----------|-------------|
| **Logging** | `log_info`, `log_warn`, `log_error`, `log_success` | Color-coded console + JSONL file logging |
| **Exit helpers** | `exit_with_error`, `exit_success`, `exit_silent` | Consistent exit with logging |
| **Validation** | `require_command`, `require_env`, `require_file` | Pre-flight checks |
| **Timeout** | `run_with_timeout` | Execute commands with time limit |
| **Circuit breaker** | `check_circuit_breaker`, `record_failure`, `record_success` | Auto-bypass after failures |
| **JSON parsing** | `safe_json_parse` | Handle JSON with jq fallback |

### Centralized Logging

All errors are logged to `~/.claude/logs/hook-errors.jsonl` in JSON Lines format:

```json
{"timestamp":"2025-11-24T10:30:00Z","level":"error","hook":"pre-sf-command","message":"Validation failed","context":"deployment","details":"exit_code=7"}
```

---

## Hook Categories

### Blocking Hooks

Hooks that CAN prevent operations from proceeding.

**Characteristics**:
- Use **strict mode** (`set -euo pipefail`)
- Non-zero exit prevents operation
- Must be fast (<1s typical, <10s max)
- Require careful error handling

**Examples**:
- `pre-sf-command-validation.sh` - Validates SF CLI commands
- `universal-agent-governance.sh` - Enforces governance rules
- `pre-task-hook.sh` - Agent discovery and validation

**Pattern**:
```bash
if [[ -f "$ERROR_HANDLER" ]]; then
    source "$ERROR_HANDLER"
    HOOK_NAME="pre-validation"
    # Keep strict mode - this hook can block operations
fi
```

### Non-Blocking Hooks

Hooks that should NOT prevent operations (monitoring, logging, metrics).

**Characteristics**:
- Use **lenient mode** (`set +e`)
- Failures are logged but don't block
- Can be slower (async operations OK)
- Should degrade gracefully

**Examples**:
- `post-sf-command.sh` - API usage tracking
- `session-context-loader.sh` - Context initialization
- `post-reflect.sh` - Reflection submission

**Pattern**:
```bash
if [[ -f "$ERROR_HANDLER" ]]; then
    source "$ERROR_HANDLER"
    HOOK_NAME="post-tracking"
    set_lenient_mode 2>/dev/null || true  # Non-blocking
fi
```

---

## Development Patterns

### 1. Portable Path Resolution

**Always use CLAUDE_PLUGIN_ROOT with fallback**:

```bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ -n "${CLAUDE_PLUGIN_ROOT:-}" ]]; then
    PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT}"
else
    PLUGIN_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
fi

# Use $PLUGIN_ROOT for all paths
```

### 2. Dependency Checking

**Always verify dependencies before use**:

```bash
# Using error handler
if ! require_command "jq" "JSON processing"; then
    exit $EXIT_DEPENDENCY_MISSING
fi

# Manual check
if ! command -v jq &> /dev/null; then
    log_error "jq is required but not installed"
    exit 6
fi
```

### 3. Input Validation

**Validate all inputs before processing**:

```bash
# Validate required environment variable
if ! require_env "TARGET_ORG" "Salesforce target org"; then
    exit $EXIT_VALIDATION_FAILED
fi

# Validate required file
if ! require_file "$CONFIG_FILE" "Configuration file"; then
    exit $EXIT_NOT_FOUND
fi
```

### 4. Timeout Handling

**Use timeouts for external operations**:

```bash
# Run with 10-second timeout
if ! run_with_timeout 10 "sf org display --json"; then
    log_error "Org display timed out"
    exit $EXIT_TIMEOUT
fi
```

### 5. JSON Processing

**Use safe JSON parsing**:

```bash
# With jq installed
ORG_TYPE=$(safe_json_parse "$JSON_OUTPUT" '.result.orgType' 'unknown')

# Manual safe parsing
if command -v jq &> /dev/null; then
    VALUE=$(echo "$JSON" | jq -r '.key' 2>/dev/null) || VALUE="default"
else
    VALUE="default"
fi
```

---

## Testing Requirements

### Required Tests

All hooks MUST have:

1. **Syntax validation** - `bash -n hook.sh`
2. **Dependency check** - All required commands available
3. **Basic execution** - Hook runs without crashing
4. **Exit code verification** - Correct codes for success/failure cases

### Testing Script

Use the provided diagnostic script:

```bash
# Test individual hook
bash scripts/diagnose-hook-health.sh hooks/my-hook.sh

# Test all hooks in plugin
bash scripts/diagnose-hook-health.sh
```

### Test Checklist

- [ ] Hook is executable (`chmod +x`)
- [ ] Syntax is valid (`bash -n`)
- [ ] Error handler is sourced
- [ ] HOOK_NAME is set
- [ ] Dependencies are checked
- [ ] Exit codes are correct
- [ ] Logging works (check `~/.claude/logs/hook-errors.jsonl`)

---

## Best Practices

### DO

- **Source error handler** at the top of every hook
- **Set HOOK_NAME** for logging identification
- **Use standardized exit codes** (0-7)
- **Check dependencies** before using external commands
- **Log meaningful errors** with context
- **Test with both success and failure cases**
- **Keep hooks fast** (<1s for blocking, <10s for non-blocking)
- **Use portable paths** with CLAUDE_PLUGIN_ROOT

### DON'T

- **Don't use `set -e` without error handler** - Breaks graceful degradation
- **Don't hardcode paths** - Use CLAUDE_PLUGIN_ROOT
- **Don't ignore exit codes** - Check command return values
- **Don't output to stdout** - Claude Code reads stdout; use stderr
- **Don't block on user input** - Hooks must be non-interactive
- **Don't exceed timeout** - Claude Code kills slow hooks (10s default)

### Output Guidelines

```bash
# DO: Use stderr for diagnostic output
echo "Processing..." >&2
log_info "Processing started"

# DON'T: Use stdout (interferes with Claude Code)
echo "Processing..."  # BAD - goes to stdout
```

### Error Messages

```bash
# DO: Provide actionable error messages
log_error "jq not found" "dependency_check" "Install with: brew install jq"

# DON'T: Vague error messages
log_error "Error"  # BAD - no context
```

---

## Migration Guide

### Migrating Existing Hooks

1. **Add error handler sourcing** (see Integration Pattern above)
2. **Set HOOK_NAME** unique identifier
3. **Choose mode** (strict for blocking, lenient for non-blocking)
4. **Update exit codes** to use standardized constants
5. **Replace echo with log functions**
6. **Test with diagnostic script**

### Before/After Example

**Before (legacy)**:
```bash
#!/bin/bash
set -e

if [ -z "$TARGET_ORG" ]; then
    echo "Error: TARGET_ORG not set"
    exit 1
fi

# ... rest of hook
```

**After (standardized)**:
```bash
#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -n "${CLAUDE_PLUGIN_ROOT:-}" ]]; then
    ERROR_HANDLER="${CLAUDE_PLUGIN_ROOT}/opspal-core/hooks/lib/error-handler.sh"
else
    ERROR_HANDLER="${SCRIPT_DIR}/../../opspal-core/hooks/lib/error-handler.sh"
fi

if [[ -f "$ERROR_HANDLER" ]]; then
    source "$ERROR_HANDLER"
    HOOK_NAME="my-hook"
fi

if ! require_env "TARGET_ORG" "Salesforce target org"; then
    exit $EXIT_VALIDATION_FAILED
fi

# ... rest of hook
```

---

---

## Structured Log Format (v2.0.0)

All hooks MUST log in JSON Lines format to enable automated analysis:

```json
{"timestamp":"2026-03-08T12:00:00Z","hook":"hook-name","event":"type","tool":"ToolName","session_id":"$CLAUDE_SESSION_ID"}
```

Use `append_jsonl_with_fallback` from `lib/error-handler.sh` for safe writes with automatic fallback paths when the primary log directory is unavailable.

---

## Output Channels (v2.0.0)

| Channel | Purpose | When to use |
|---------|---------|-------------|
| **stdout** | `additionalContext` injected into Claude's context window | Actionable feedback Claude should act on (exit code 2 warnings, remediation hints) |
| **stderr** | Terminal-only diagnostic output | Logging, progress, non-actionable info |

**Rule:** Never write debug or diagnostic output to stdout — it wastes Claude's context tokens.

---

## Claude Code Exit Code Semantics (v2.0.0)

In addition to the internal exit codes above, Claude Code interprets hook exit codes as:

| Code | Claude Code Behavior |
|------|---------------------|
| 0 | PreToolUse: allow. PostToolUse: no feedback. |
| 1 | PreToolUse: **block** tool call. PostToolUse: signals critical failure. |
| 2 | stdout content becomes `additionalContext` for Claude (warning/feedback). |

---

## Fast-Exit Guards (v2.0.0)

Hooks that fire on broad matchers (`*`) MUST include a fast-exit guard for read-only tools:

```bash
TOOL_NAME_QUICK="${CLAUDE_TOOL_NAME:-${HOOK_TOOL_NAME:-${TOOL_NAME:-}}}"
case "$TOOL_NAME_QUICK" in
  Read|Glob|Grep|LS|ToolSearch) exit 0 ;;
esac
```

This eliminates ~30-40% of invocations for heavy PostToolUse scripts.

---

## Matcher Guidelines (v2.0.0)

- Prefer **narrow matchers** (`Bash(*awk*)`) over broad ones (`Bash`) when the hook only applies to a subset of invocations.
- If a script self-filters by tool name internally, use a **single `*` matcher** instead of registering duplicate entries per tool. Claude Code deduplicates identical `(matcher, command)` pairs, but different wrapper commands bypass dedup.
- When consolidating, verify the script handles all previously-matched tools.

---

## Async Hooks (v2.0.0)

Mark hooks as `"async": true` in `settings.json` when they are:
- **Logging/metrics only** — no blocking feedback needed
- **Background analysis** — reflections, routing weight updates
- **Non-critical tracking** — work index, state updates

**Never make async:**
- Pre-tool validation hooks (must block before execution)
- Error detection hooks that use exit code 2 for feedback

---

## Lockfiles for Background Hooks (v2.0.0)

Stop hooks that fork background processes MUST use a lockfile to prevent concurrent runs:

```bash
LOCKFILE="/tmp/my-hook-name.lock"
if [ -f "$LOCKFILE" ]; then
    LOCK_PID=$(cat "$LOCKFILE" 2>/dev/null || echo "")
    if [ -n "$LOCK_PID" ] && kill -0 "$LOCK_PID" 2>/dev/null; then
        exit 0  # Already running
    fi
    rm -f "$LOCKFILE"  # Stale lockfile
fi

# In background block:
{
    echo $$ > "$LOCKFILE"
    trap 'rm -f "$LOCKFILE"' EXIT
    # ... work ...
} &
```

---

## Portability (v2.0.0)

- Use `date -u +"%Y-%m-%dT%H:%M:%SZ"` for timestamps (universal).
- For date parsing, provide fallback chain: `date -d` (GNU) → `date -jf` (macOS) → `node -e` → `echo 0`.
- Use `while IFS='=' read -r key value` for `.env` loading. **Never** `export $(grep | xargs)`.
- Do not use PCRE features (`(?!...)`, `\d`, `\w`) with `grep -E` (ERE only).
- Use `${BASH_SOURCE[0]}` for path resolution, never hardcoded absolute paths.

---

## Error Handler Deduplication (v2.0.0)

The **authoritative** error handler is `plugins/opspal-core/hooks/lib/error-handler.sh` (v2.0.0).

Other plugins MUST NOT maintain separate copies. Instead, create a **shim** that sources the core version and adds plugin-specific extensions. See `plugins/opspal-marketo/hooks/lib/error-handler.sh` for the reference pattern.

---

## Related Documentation

- **Error Handler Source**: `lib/error-handler.sh`
- **CLAUDE.md Exit Codes**: See "Hook Exit Code Standard" section
- **Diagnostic Script**: `scripts/diagnose-hook-health.sh`
- **Testing Guide**: `../../TESTING_HOOKS.md`

---

**Maintained by**: RevPal Engineering
**Last Updated**: 2026-03-08
