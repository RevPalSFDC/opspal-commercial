---
name: hubspot-v4-batch-association-export
description: "Use POST /crm/v4/associations/{fromObjectType}/{toObjectType}/batch/read with batches of 500 IDs to efficiently export all associations for a contact list, then hydrate with v3 batch read for properties"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-hubspot:hubspot-data-operations-manager
---

# Hubspot V4 Batch Association Export

Use POST /crm/v4/associations/{fromObjectType}/{toObjectType}/batch/read with batches of 500 IDs to efficiently export all associations for a contact list, then hydrate with v3 batch read for properties

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: query
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Use POST /crm/v4/associations/{fromObjectType}/{toObjectType}/batch/read with batches of 500 IDs to efficiently export all associations for a contact list, then hydrate with v3 batch read for properties
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 7f1a0bdf-4618-414a-aded-04f951aa9979
- **Agent**: hubspot-data-operations-manager
- **Enriched**: 2026-04-03
