---
name: event-upload-failure-triage
description: "Categorize upload failures by type and apply type-specific resolution: Country validation -> remove field, duplicate -> update existing, locked -> find alternative record, deleted -> document as unrecoverable"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
---

# Event Upload Failure Triage

Categorize upload failures by type and apply type-specific resolution: Country validation -> remove field, duplicate -> update existing, locked -> find alternative record, deleted -> document as unrecoverable

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: [SFDC_ID]
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Categorize upload failures by type and apply type-specific resolution: Country validation -> remove field, duplicate -> update existing, locked -> find alternative record, deleted -> document as unrecoverable
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: cdf0a3dd-7ac1-4390-9856-9b81ac9ea2f8
- **Agent**: manual
- **Enriched**: 2026-04-03
