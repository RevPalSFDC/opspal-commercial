---
name: consultation-escalation-and-ace-logging-framework
description: Use post-tool hooks to trigger consultation escalation and log consultation outcomes into ACE learning registry.
allowed-tools: Read, Grep, Glob
---

# consultation-escalation-and-ace-logging-framework

Use this skill when working on hook-driven workflows in this domain.

## Workflow

1. Identify the hook trigger surface and decision points.
2. Validate policy or guardrail behavior before and after change.
3. Capture failure modes, rollback path, and verification checks.

## Routing Boundaries

Use this skill for the specific hook workflow described here.
Defer to adjacent domain skills when the task is primarily about business logic rather than hook enforcement.

## References

- [Consultation Escalation Triggers](./escalation-triggers.md)
- [ACE Outcome Logging](./ace-logging.md)
- [Nonblocking Consultation Guidance](./nonblocking-behavior.md)
