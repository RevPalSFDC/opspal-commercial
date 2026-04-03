---
name: record-type-rollout-with-type-field-alignment
description: "When introducing a new Record Type, chain Permission Set visibility grant with bulk Type picklist update to ensure data consistency"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-salesforce:permission-orchestrator + opspal-salesforce:sfdc-data-operations
---

# Record Type Rollout With Type Field Alignment

When introducing a new Record Type, chain Permission Set visibility grant with bulk Type picklist update to ensure data consistency

## When to Use This Skill

- During data import or bulk operations

**Category**: configuration
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: When introducing a new Record Type, chain Permission Set visibility grant with bulk Type picklist update to ensure data consistency
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 21990720-4e76-4b2f-8835-cc5580ffd536
- **Agent**: opspal-salesforce:permission-orchestrator + opspal-salesforce:sfdc-data-operations
- **Enriched**: 2026-04-03
