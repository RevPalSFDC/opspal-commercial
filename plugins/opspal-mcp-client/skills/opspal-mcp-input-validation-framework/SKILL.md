---
name: opspal-mcp-input-validation-framework
description: Validate OpsPal MCP scoring and compute tool inputs with hook-enforced schema prechecks and guardrails.
allowed-tools: Read, Grep, Glob
---

# opspal-mcp-input-validation-framework

Use this skill when working on hook-driven workflows in this domain.

## Workflow

1. Identify the hook trigger surface and decision points.
2. Validate policy or guardrail behavior before and after change.
3. Capture failure modes, rollback path, and verification checks.

## Routing Boundaries

Use this skill for the specific hook workflow described here.
Defer to adjacent domain skills when the task is primarily about business logic rather than hook enforcement.

## References

- [Scoring Input Preconditions](./scoring-prechecks.md)
- [Compute Input Preconditions](./compute-prechecks.md)
- [Validation Block Reasoning](./block-reasoning.md)
