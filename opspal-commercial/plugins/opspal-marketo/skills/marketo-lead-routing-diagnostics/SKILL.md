---
name: marketo-lead-routing-diagnostics
description: Deterministic API-first diagnostics for Marketo lead routing incidents, including identity resolution, membership snapshots, activity timeline reconstruction, race-condition detection, and safe remediation with audit payloads.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Task
---

# Marketo Lead Routing Diagnostics

Use this skill for routing incidents where lead progression or ownership path is unclear.

## Workflow

1. Resolve canonical identity.
2. Snapshot memberships and gating conditions.
3. Reconstruct activity timeline.
4. Correlate Smart List rules and infer flow gaps.
5. Detect race/loop patterns.
6. Apply safe remediation ladder with confirmation.

## Routing Boundaries

Use this skill for lead routing path analysis and remediation.
Use `marketo-campaign-diagnostics-framework` for broader campaign health incidents.

## References

- [canonical trace sequence](./canonical-trace-sequence.md)
- [race and loop detection](./race-loop-detection.md)
- [remediation and audit payload](./remediation-audit.md)
