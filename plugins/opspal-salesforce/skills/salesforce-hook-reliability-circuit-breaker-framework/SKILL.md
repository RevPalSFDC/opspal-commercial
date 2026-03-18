---
name: salesforce-hook-reliability-circuit-breaker-framework
description: Salesforce hook reliability framework using circuit-breaker patterns for failure containment, cooldown recovery, and safe bypass behavior during hook instability.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Salesforce Hook Reliability Circuit Breaker Framework

Use this skill for resilient hook execution patterns.

## Workflow

1. Track hook failures in rolling window.
2. Open circuit after threshold breaches.
3. Attempt controlled half-open recovery.
4. Close circuit on stable success and log metrics.

## Routing Boundaries

Use this skill for hook runtime reliability engineering.
Use `salesforce-hook-governance-framework` for policy enforcement logic.

## References

- [state machine and thresholds](./state-machine-thresholds.md)
- [failure telemetry model](./failure-telemetry-model.md)
- [recovery and bypass patterns](./recovery-bypass-patterns.md)
