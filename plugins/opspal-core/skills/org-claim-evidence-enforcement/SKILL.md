---
name: org-claim-evidence-enforcement
description: Enforce hook policies that require org-state claims to be backed by executable evidence and citations.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# org-claim-evidence-enforcement

Use this skill when working on hook-driven workflows in this domain.

## Workflow

1. Identify the hook trigger surface and decision points.
2. Validate policy or guardrail behavior before and after change.
3. Capture failure modes, rollback path, and verification checks.

## Routing Boundaries

Use this skill for the specific hook workflow described here.
Defer to adjacent domain skills when the task is primarily about business logic rather than hook enforcement.

## References

- [Claim Detection Gate](./claim-detection.md)
- [Evidence Retrieval Enforcement](./evidence-check.md)
- [Final Response Guard](./response-guard.md)
