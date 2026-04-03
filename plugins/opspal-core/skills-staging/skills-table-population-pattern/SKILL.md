---
name: skills-table-population-pattern
description: "After reflection submission: extract skills arrays -> upsert skills table -> update usage counts -> record feedback -> recalculate success rates"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-core:reflection-workflow
---

# Skills Table Population Pattern

After reflection submission: extract skills arrays -> upsert skills table -> update usage counts -> record feedback -> recalculate success rates

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: configuration
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: After reflection submission: extract skills arrays -> upsert skills table -> update usage counts -> record feedback -> recalculate success rates
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: f9ae0260-d92f-4a24-b68a-c471ca6f9f12
- **Agent**: reflection-workflow
- **Enriched**: 2026-04-03
