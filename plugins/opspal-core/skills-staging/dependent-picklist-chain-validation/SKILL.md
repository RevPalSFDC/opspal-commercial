---
name: dependent-picklist-chain-validation
description: "When debugging picklist errors, trace entire dependency chain (Market > Segment > Sub-Segment > Sub-Type) and validate each level's constraints"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Dependent Picklist Chain Validation

When debugging picklist errors, trace entire dependency chain (Market > Segment > Sub-Segment > Sub-Type) and validate each level's constraints

## When to Use This Skill

- When encountering errors that match this pattern

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: When debugging picklist errors, trace entire dependency chain (Market > Segment > Sub-Segment > Sub-Type) and validate each level's constraints
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: c4c76b01-3a8c-4ddc-b321-8c800f93b44a
- **Agent**: manual-investigation
- **Enriched**: 2026-04-03
