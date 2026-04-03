---
name: dark-agent-detection
description: "Compare set of all agents in routing index against set of agents reachable via byKeyword reverse lookup. Any agent not in the reachable set is 'dark' - unreachable by the router regardless of user prompt."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Dark Agent Detection

Compare set of all agents in routing index against set of agents reachable via byKeyword reverse lookup. Any agent not in the reachable set is 'dark' - unreachable by the router regardless of user prompt.

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Compare set of all agents in routing index against set of agents reachable via byKeyword reverse lookup
2. Any agent not in the reachable set is 'dark' - unreachable by the router regardless of user prompt

## Source

- **Reflection**: dc0b262c-3623-4cb4-a162-79e067b72010
- **Agent**: manual analysis
- **Enriched**: 2026-04-03
