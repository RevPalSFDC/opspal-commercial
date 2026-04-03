---
name: large-dataset-pre-flight-estimation
description: "Before running any batch processing tool against large datasets (>[N] records), calculate estimated time = records / batch_size / rate_per_minute and present to user for confirmation"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Large Dataset Pre Flight Estimation

Before running any batch processing tool against large datasets (>[N] records), calculate estimated time = records / batch_size / rate_per_minute and present to user for confirmation

## When to Use This Skill

- Before executing the operation described in this skill

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Before running any batch processing tool against large datasets (>[N] records), calculate estimated time = records / batch_size / rate_per_minute and present to user for confirmation
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 1545e5a6-a96c-4103-8bac-5f084e8012be
- **Agent**: manual observation
- **Enriched**: 2026-04-03
