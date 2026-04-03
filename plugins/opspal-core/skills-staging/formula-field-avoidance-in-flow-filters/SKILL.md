---
name: formula-field-avoidance-in-flow-filters
description: "When flow validation hooks flag formula fields (IsClosed, IsWon) in Get Records filters, replace with equivalent picklist filters (StageName NotEqualTo closed values) to bypass permission checks while maintaining identical query behavior"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-core:direct-execution
---

# Formula Field Avoidance In Flow Filters

When flow validation hooks flag formula fields (IsClosed, IsWon) in Get Records filters, replace with equivalent picklist filters (StageName NotEqualTo closed values) to bypass permission checks while maintaining identical query behavior

## When to Use This Skill

- When working with Salesforce Flows or automation

**Category**: automation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: When flow validation hooks flag formula fields (IsClosed, IsWon) in Get Records filters, replace with equivalent picklist filters (StageName NotEqualTo closed values) to bypass permission checks while maintaining identical query behavior
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: f51c2c18-5456-46c0-9d25-db1ae0ce9f6c
- **Agent**: direct-execution
- **Enriched**: 2026-04-03
