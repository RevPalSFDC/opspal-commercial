---
name: combined-field-creation-+-permission-set-workflow
description: "Create custom field, then immediately create permission set including that field in single orchestrated operation"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-salesforce:sfdc-permission-orchestrator
---

# Combined Field Creation + Permission Set Workflow

Create custom field, then immediately create permission set including that field in single orchestrated operation

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: configuration
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Create custom field, then immediately create permission set including that field in single orchestrated operation
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: da347edb-7143-4fec-9f4c-6a10905df041
- **Agent**: sfdc-permission-orchestrator
- **Enriched**: 2026-04-03
