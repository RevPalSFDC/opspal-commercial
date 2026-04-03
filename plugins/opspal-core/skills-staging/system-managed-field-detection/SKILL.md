---
name: system-managed-field-detection
description: "Before any bulk import, check field.createable and field.updateable flags to identify system-managed fields that cannot be set via API"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-core:direct-execution
---

# System Managed Field Detection

Before any bulk import, check field.createable and field.updateable flags to identify system-managed fields that cannot be set via API

## When to Use This Skill

- Before executing the operation described in this skill
- During data import or bulk operations

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Before any bulk import, check field
2. createable and field
3. updateable flags to identify system-managed fields that cannot be set via API

## Source

- **Reflection**: ae063832-f707-4bee-9f89-b3748fec4211
- **Agent**: direct-execution
- **Enriched**: 2026-04-03
