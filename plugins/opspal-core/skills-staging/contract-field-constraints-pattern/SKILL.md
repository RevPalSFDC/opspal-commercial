---
name: contract-field-constraints-pattern
description: "Contract.EndDate is calculated from StartDate + ContractTerm; cannot be directly set. Always use ContractTerm (months) instead."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-core:direct execution
---

# Contract Field Constraints Pattern

Contract.EndDate is calculated from StartDate + ContractTerm; cannot be directly set. Always use ContractTerm (months) instead.

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: configuration
**Discovered from**: reflection analysis

## Workflow

1. EndDate is calculated from StartDate + ContractTerm
2. cannot be directly set
3. Always use ContractTerm (months) instead

## Source

- **Reflection**: defaa6a0-510a-4796-93e1-ed1678625aa2
- **Agent**: direct execution
- **Enriched**: 2026-04-03
