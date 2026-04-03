---
name: account-contract-deduplication-check
description: "Before bulk contract creation, query existing contracts by AccountId to prevent duplicates"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
agent: opspal-core:direct execution
---

# Account Contract Deduplication Check

Before bulk contract creation, query existing contracts by AccountId to prevent duplicates

## When to Use This Skill

- Before executing the operation described in this skill
- During data import or bulk operations

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Before bulk contract creation, query existing contracts by AccountId to prevent duplicates
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: defaa6a0-510a-4796-93e1-ed1678625aa2
- **Agent**: direct execution
- **Enriched**: 2026-04-03
