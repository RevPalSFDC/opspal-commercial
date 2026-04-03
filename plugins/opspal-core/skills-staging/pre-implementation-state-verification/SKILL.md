---
name: pre-implementation-state-verification
description: "Before executing any implementation plan, query the org to identify what components already exist. Report delta and only deploy net-new items."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-core:direct-execution
---

# Pre Implementation State Verification

Before executing any implementation plan, query the org to identify what components already exist. Report delta and only deploy net-new items.

## When to Use This Skill

- Before executing the operation described in this skill
- When deploying metadata that involves the patterns described here
- When building or modifying reports and dashboards

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Before executing any implementation plan, query the org to identify what components already exist
2. Report delta and only deploy net-new items

## Source

- **Reflection**: 7c9cd6c1-07c8-4579-9932-37da60000ab2
- **Agent**: direct-execution
- **Enriched**: 2026-04-03
