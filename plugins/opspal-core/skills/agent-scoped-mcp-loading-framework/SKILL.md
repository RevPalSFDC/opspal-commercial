---
name: agent-scoped-mcp-loading-framework
description: Configure and troubleshoot agent-scoped MCP loading hooks for selective server activation.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# agent-scoped-mcp-loading-framework

## When to Use This Skill

- An agent's `plugin.json` `requiresMcp` list needs to be updated to add or remove a server
- A PreToolUse hook should selectively block MCP tool calls not listed for the current agent's scope
- An agent is loading MCP servers it does not need, causing token waste or permission bleed
- You are diagnosing "MCP tool not available" errors where the server was not scoped in
- Validating that newly added agents have correct `requiresMcp` entries before release

**Not for**: General MCP server installation/configuration — use the opspal-mcp-client plugin for that.

## Frontmatter Pattern

```yaml
# In agent .md frontmatter:
requiresMcp:
  - gong
  - fireflies
# Hook reads this at PreToolUse and blocks calls to unlisted servers
```

| Field | Required | Example |
|-------|----------|---------|
| `requiresMcp` | No (omit = allow all) | `[gong, notebooklm]` |
| Hook event | PreToolUse | `tool_name` starts with `mcp__` |
| Failure mode | Block + advisory message | Does not hard-error the session |

## Workflow

1. Read the agent's `.md` frontmatter to confirm its `requiresMcp` list (or absence).
2. Grep the hook file for the MCP scope-enforcement block to understand current logic.
3. Identify which MCP tools the agent actually calls — compare against the declared list.
4. Update `requiresMcp` in the frontmatter and verify the hook parses the field correctly (see `frontmatter-requiresmcp.md`).
5. Run a dry-call test: invoke the agent with an out-of-scope MCP tool and confirm the advisory fires without aborting the session.
6. Verify the load-export contract (see `load-export.md`) is honored — the hook must export the active MCP list for downstream hooks.

## Routing Boundaries

Use this skill for hook-level MCP scoping logic.
Defer to `tool-contract-engineering` when the issue is about validating MCP tool input/output contracts rather than which servers load.

## References

- [requiresMcp Frontmatter Parsing](./frontmatter-requiresmcp.md)
- [MCP Load Export Contract](./load-export.md)
- [Agent Load Failure Handling](./failure-handling.md)
