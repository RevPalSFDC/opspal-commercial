---
name: hook-inline-node-execution-hardening-framework
description: Harden inline Node execution in shell hooks with deterministic IO contracts and failure propagation.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Hook Inline Node Execution Hardening

## When to Use This Skill

Use this skill when:
- Writing a shell hook that invokes `node` to run a JavaScript script
- Debugging hook failures caused by Node.js process crashes or timeout
- Ensuring hook JSON output is not corrupted by Node script stderr mixing
- Implementing timeout budgets for Node scripts called from hooks

**Not for**: Hook governance policy (use `salesforce-hook-governance-framework`), circuit breaker patterns (use `salesforce-hook-reliability-circuit-breaker-framework`), or log management (use `hook-log-retention-and-rotation-framework`).

## Hardening Patterns

### Isolate Node Output from Hook JSON

```bash
# WRONG: Node stdout mixes with hook JSON response
RESULT=$(node scripts/lib/my-validator.js "$INPUT")
echo "$RESULT"  # May contain error messages mixed with JSON

# CORRECT: Capture stdout and stderr separately
NODE_STDOUT=$(node scripts/lib/my-validator.js "$INPUT" 2>/tmp/hook-node-stderr.log)
NODE_EXIT=$?
if [ $NODE_EXIT -ne 0 ]; then
  cat /tmp/hook-node-stderr.log >> "$LOG_FILE" 2>/dev/null
  echo '{"decision":"allow","reason":"Node script failed, allowing as advisory"}'
  exit 0
fi
echo "$NODE_STDOUT"
```

### Enforce Timeout Budget

```bash
# Hooks should complete within 5 seconds total
# Node scripts get 3 seconds (leaving 2s for shell overhead)
timeout 3 node scripts/lib/my-validator.js "$INPUT" 2>/dev/null
if [ $? -eq 124 ]; then
  echo '{"decision":"allow","reason":"Validation timeout, allowing as advisory"}'
  exit 0
fi
```

### Exit Code Contract

| Node Exit Code | Meaning | Hook Behavior |
|----------------|---------|---------------|
| 0 | Success | Use Node stdout as hook result |
| 1 | Validation error | Use fallback allow/block per policy |
| 2 | Parse error (bad input) | Log and allow (advisory) |
| 124 | Timeout (from `timeout` command) | Log and allow (advisory) |
| 137 | SIGKILL (OOM or force kill) | Log and allow (advisory) |

### Node Script Requirements

Scripts called from hooks must:
- Write ONLY valid JSON to stdout (no `console.log` debug output)
- Write all diagnostics to stderr
- Exit 0 on success, non-zero on failure
- Complete within the timeout budget
- Use `node-wrapper.sh` for Node binary discovery in Desktop/GUI contexts

## Workflow

1. Wrap Node invocation with `timeout` and stderr capture (`2>/tmp/...`)
2. Check exit code and apply fallback behavior per contract
3. Never let Node failures corrupt the hook JSON output stream
4. Test with explicit pass, fail, and timeout scenarios

## References

- [IO Contract](./io-contract.md)
- [Error Propagation](./error-propagation.md)
- [Runtime Constraints](./runtime-constraints.md)
