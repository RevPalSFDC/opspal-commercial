---
name: agent-scoped-mcp-loading-framework
description: Configure and troubleshoot agent-scoped MCP loading hooks for selective server activation.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# agent-scoped-mcp-loading-framework

Use this skill when working on hook-driven workflows in this domain.

## Workflow

1. Identify the hook trigger surface and decision points.
2. Validate policy or guardrail behavior before and after change.
3. Capture failure modes, rollback path, and verification checks.

## Routing Boundaries

Use this skill for the specific hook workflow described here.
Defer to adjacent domain skills when the task is primarily about business logic rather than hook enforcement.

## References

- [requiresMcp Frontmatter Parsing](./frontmatter-requiresmcp.md)
- [MCP Load Export Contract](./load-export.md)
- [Agent Load Failure Handling](./failure-handling.md)
