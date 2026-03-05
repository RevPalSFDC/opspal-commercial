# Hook Development Guide

**Version**: 1.0.0
**Created**: 2025-11-24

## Overview

This guide provides standards for developing hooks across all plugins in the OpsPal system. Following these standards ensures consistent error handling, proper exit codes, and reliable execution.

## Standardized Error Handler Library

**Location**: `opspal-core/hooks/lib/error-handler.sh`

### Quick Start

```bash
#!/bin/bash

# Source the error handler at the top of your hook
source "$(dirname "${BASH_SOURCE[0]}")/../../../opspal-core/hooks/lib/error-handler.sh"

# Set strict mode (recommended for most hooks)
HOOK_NAME="my-hook-name"
set_strict_mode

# Your hook logic here
log_info "Starting operation..."

if ! some_command; then
    log_error "Command failed" "context" "details"
    exit_with_error $EXIT_GENERAL_ERROR "Operation failed" "my-operation"
fi

exit_success "Operation completed"
```

### Standardized Exit Codes

| Code | Constant | Description |
|------|----------|-------------|
| 0 | `EXIT_SUCCESS` | Operation completed successfully |
| 1 | `EXIT_GENERAL_ERROR` | General/unspecified error |
| 2 | `EXIT_INVALID_ARGS` | Invalid arguments provided |
| 3 | `EXIT_NOT_FOUND` | Required file/resource not found |
| 4 | `EXIT_PERMISSION_DENIED` | Permission denied |
| 5 | `EXIT_TIMEOUT` | Operation timed out |
| 6 | `EXIT_DEPENDENCY_MISSING` | Required dependency not available |
| 7 | `EXIT_VALIDATION_FAILED` | Validation check failed |

### Available Functions

#### Error Handling

```bash
# Set strict mode (set -euo pipefail with ERR trap)
set_strict_mode

# Set lenient mode (for hooks that should continue on errors)
set_lenient_mode

# Exit with error (logs and exits)
exit_with_error $EXIT_GENERAL_ERROR "Message" "operation_name"

# Exit with success
exit_success "Message"

# Exit silently (no output)
exit_silent 0
```

#### Logging

```bash
# Info message (blue)
log_info "Starting operation..."

# Success message (green)
log_success "Operation completed"

# Warning message (yellow, logged to central file)
log_warn "Something unusual" "context"

# Error message (red, logged to central file)
log_error "Something failed" "context" "details"
```

#### Validation

```bash
# Check if command exists
require_command "jq" "JSON parsing"

# Check if environment variable is set
require_env "SALESFORCE_ORG_ALIAS" "Salesforce org identification"

# Check if file exists
require_file "/path/to/file" "Configuration file"
```

#### Timeout Handling

```bash
# Run command with timeout (in seconds)
run_with_timeout 30 "sf data query --query 'SELECT Id FROM Account LIMIT 1'"
```

#### Circuit Breaker Integration

```bash
# Check if circuit breaker is open (skip execution if too many failures)
if ! check_circuit_breaker "my-hook-name"; then
    exit_silent 0  # Circuit open, skip gracefully
fi

# Record failure (increments failure count)
record_failure "my-hook-name"

# Record success (resets failure count, closes circuit)
record_success "my-hook-name"
```

## Circuit Breaker System

**Location**: `salesforce-plugin/hooks/hook-circuit-breaker.sh`

The circuit breaker provides graceful degradation for hook failures:

### States

| State | Description |
|-------|-------------|
| CLOSED | Normal operation, hook runs |
| OPEN | Hook failed 3+ times, bypass hook |
| HALF-OPEN | After cooldown, test recovery |

### Configuration

- **Failure Threshold**: 3 failures within 5 minutes → OPEN
- **Cooldown**: 2 minutes before HALF-OPEN
- **Hook Timeout**: 10 seconds per execution

### Usage

```bash
# Wrap your hook with circuit breaker
HOOK_SCRIPT="./my-hook.sh" bash hook-circuit-breaker.sh
```

## Centralized Logging

All warnings and errors are logged to:
```
~/.claude/logs/hook-errors.jsonl
```

Format (JSON Lines):
```json
{"timestamp":"2025-11-24T12:00:00Z","level":"error","hook":"my-hook","message":"Error message","context":"operation_name","details":"additional_info"}
```

### Viewing Logs

```bash
# Recent errors
tail -20 ~/.claude/logs/hook-errors.jsonl | jq .

# Errors for specific hook
grep '"hook":"my-hook"' ~/.claude/logs/hook-errors.jsonl | jq .

# Errors in last hour
cat ~/.claude/logs/hook-errors.jsonl | jq 'select(.timestamp > "2025-11-24T11:00:00Z")'
```

## Hook Development Best Practices

### 1. Always Use Strict Mode

Unless your hook needs to continue on errors, always use strict mode:

```bash
source "$(dirname "${BASH_SOURCE[0]}")/../../../opspal-core/hooks/lib/error-handler.sh"
HOOK_NAME="my-hook"
set_strict_mode
```

### 2. Validate Dependencies Early

Check for required commands and files before doing work:

```bash
require_command "jq" "JSON parsing"
require_command "sf" "Salesforce CLI"
require_file "$CONFIG_FILE" "Configuration"
```

### 3. Use Descriptive Exit Codes

Choose the most specific exit code:

```bash
# Good
exit_with_error $EXIT_DEPENDENCY_MISSING "jq not found" "dependency_check"

# Bad
exit 1
```

### 4. Log Context with Errors

Always include context and details:

```bash
# Good
log_error "Query failed" "account_query" "SOQL syntax error on line 5"

# Bad
log_error "Error"
```

### 5. Handle Timeouts Gracefully

For operations that might hang:

```bash
if ! run_with_timeout 30 "sf data query ..."; then
    log_error "Query timed out" "data_query" "30s timeout exceeded"
    exit_with_error $EXIT_TIMEOUT "Query timed out"
fi
```

### 6. Use Circuit Breaker for External Calls

For hooks that call external services:

```bash
if ! check_circuit_breaker "$HOOK_NAME"; then
    log_warn "Circuit breaker open, skipping" "$HOOK_NAME"
    exit_silent 0
fi

# Do work...

if [ $? -eq 0 ]; then
    record_success "$HOOK_NAME"
else
    record_failure "$HOOK_NAME"
fi
```

### 7. Exit Silently When Appropriate

For hooks that should not affect user experience on failure:

```bash
# Use exit_silent for non-critical hooks
exit_silent 0
```

## Testing Hooks

### Basic Syntax Check

```bash
bash -n my-hook.sh
```

### Manual Execution

```bash
# Test with sample input
echo '{"prompt":"test prompt"}' | bash my-hook.sh
```

### Hook Health Diagnostics

```bash
# Run hook health check
bash scripts/diagnose-hook-health.sh
```

## Migration Guide

### Migrating Existing Hooks

1. **Add error handler import** at the top:
   ```bash
   source "$(dirname "${BASH_SOURCE[0]}")/../../../opspal-core/hooks/lib/error-handler.sh"
   HOOK_NAME="existing-hook"
   ```

2. **Replace set -e with set_strict_mode**:
   ```bash
   # Before
   set -e

   # After
   set_strict_mode
   ```

3. **Replace exit codes with constants**:
   ```bash
   # Before
   exit 1

   # After
   exit_with_error $EXIT_GENERAL_ERROR "Message" "context"
   ```

4. **Replace echo messages with log functions**:
   ```bash
   # Before
   echo "Error: something failed" >&2

   # After
   log_error "Something failed" "context" "details"
   ```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `ENABLE_CENTRALIZED_LOGGING` | Log errors to central file | `1` |
| `HOOK_NAME` | Name of current hook for logging | `unknown` |
| `ERROR_LOG_FILE` | Central error log location | `~/.claude/logs/hook-errors.jsonl` |

## Related Documentation

- Error Handler Library: `opspal-core/hooks/lib/error-handler.sh`
- Circuit Breaker: `salesforce-plugin/hooks/hook-circuit-breaker.sh`
- Hook Testing: `TESTING_HOOKS.md` (repo root)
