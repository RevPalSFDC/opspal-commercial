---
name: salesforce-hook-reliability-circuit-breaker-framework
description: Salesforce hook reliability framework using circuit-breaker patterns for failure containment, cooldown recovery, and safe bypass behavior during hook instability.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Salesforce Hook Reliability Circuit Breaker Framework

## When to Use This Skill

Use this skill when:
- A hook is failing repeatedly and degrading the user experience
- Implementing automatic bypass for unstable hooks
- Building failure tracking and recovery logic for hooks that call external services
- Designing graceful degradation when hooks can't reach APIs or scripts

**Not for**: Hook governance policy (use `salesforce-hook-governance-framework`), Node script hardening (use `hook-inline-node-execution-hardening-framework`), or log management (use `hook-log-retention-and-rotation-framework`).

## Circuit Breaker State Machine

```
CLOSED (normal) ──[failures >= threshold]──> OPEN (bypass)
                                                │
                                     [cooldown expires]
                                                │
                                           HALF-OPEN
                                          /          \
                               [success]              [failure]
                                  │                      │
                               CLOSED                   OPEN
```

## Implementation Pattern

```bash
# Circuit breaker state file
CB_FILE="${HOME}/.claude/circuit-breaker/${HOOK_NAME}.json"
# Format: {"state":"closed","failures":0,"last_failure":"","opened_at":""}

FAILURE_THRESHOLD=3     # Open after 3 consecutive failures
COOLDOWN_SECONDS=300    # Wait 5 minutes before half-open test

# Check circuit state before executing hook logic
STATE=$(jq -r '.state // "closed"' "$CB_FILE" 2>/dev/null || echo "closed")
if [ "$STATE" = "open" ]; then
  OPENED_AT=$(jq -r '.opened_at' "$CB_FILE")
  ELAPSED=$(( $(date +%s) - $(date -d "$OPENED_AT" +%s 2>/dev/null || echo 0) ))
  if [ "$ELAPSED" -lt "$COOLDOWN_SECONDS" ]; then
    # Circuit open, bypass hook
    echo '{"decision":"allow","reason":"Circuit breaker open, bypassing hook"}'
    exit 0
  fi
  # Cooldown expired, try half-open
fi

# Execute hook logic here...
# On success: reset failures to 0, state to closed
# On failure: increment failures, open if >= threshold
```

## Thresholds

| Hook Category | Failure Threshold | Cooldown | Recovery Test |
|---------------|-------------------|----------|---------------|
| Routing advisory | 5 failures | 10 min | Single successful call |
| Pre-tool validation | 3 failures | 5 min | 2 consecutive successes |
| External API hooks | 2 failures | 15 min | Health check endpoint |
| Post-tool logging | 10 failures | 5 min | Single successful write |

## Workflow

1. Track consecutive failures per hook in a state file
2. Open circuit when threshold is reached (hook bypassed with allow)
3. After cooldown, attempt half-open recovery
4. Close circuit on successful recovery; re-open on further failure

## Routing Boundaries

Use this skill for hook runtime reliability engineering.
Use `salesforce-hook-governance-framework` for policy enforcement logic.

## References

- [state machine and thresholds](./state-machine-thresholds.md)
- [failure telemetry model](./failure-telemetry-model.md)
- [recovery and bypass patterns](./recovery-bypass-patterns.md)
