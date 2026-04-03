---
name: address-format-detection
description: "Before bulk address updates, query existing field values to detect format (abbreviations vs full names) and map input data accordingly"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
---

# Address Format Detection

Before bulk address updates, query existing field values to detect format (abbreviations vs full names) and map input data accordingly

## When to Use This Skill

- Before executing the operation described in this skill
- During data import or bulk operations

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Before bulk address updates, query existing field values to detect format (abbreviations vs full names) and map input data accordingly
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: a817c7ab-108d-438c-b782-cb4173b88081
- **Agent**: manual discovery during [SFDC_ID]
- **Enriched**: 2026-04-03
