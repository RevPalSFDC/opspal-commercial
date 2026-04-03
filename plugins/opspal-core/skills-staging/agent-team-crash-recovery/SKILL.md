---
name: agent-team-crash-recovery
description: "When agent team crashes: 1) verify production state via metadata/data queries, 2) delete old team, 3) create new team with tasks scoped to remaining work only, 4) spawn agents with verified context"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-core:team-lead
---

# Agent Team Crash Recovery

When agent team crashes: 1) verify production state via metadata/data queries, 2) delete old team, 3) create new team with tasks scoped to remaining work only, 4) spawn agents with verified context

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: [SFDC_ID]
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: When agent team crashes: 1) verify production state via metadata/data queries, 2) delete old team, 3) create new team with tasks scoped to remaining work only, 4) spawn agents with verified context
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 5fd9c130-bdc2-4c0f-b3ad-931087ff285a
- **Agent**: team-lead
- **Enriched**: 2026-04-03
