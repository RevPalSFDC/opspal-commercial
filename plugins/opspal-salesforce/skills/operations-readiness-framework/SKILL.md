---
name: operations-readiness-framework
description: Salesforce operational readiness baseline combining environment configuration and data-quality health checks. Use when preparing execution environments, MCP contexts, and pre-assessment data quality controls.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Operations Readiness Framework

Use this skill to prepare safe runtime conditions before feature or data operations.

## Workflow

1. Validate system and dependency readiness.
2. Confirm path and MCP context correctness.
3. Run data quality health checks.
4. Block risky operations when readiness checks fail.

## Routing Boundaries

Use this skill for environment and data-quality readiness.
Use domain-specific implementation skills (upsert, triggers, flows) for execution details.

## References

- [environment setup](./environment-setup.md)
- [mcp multi-context](./mcp-multi-context.md)
- [data quality health checks](./data-quality-health-checks.md)
