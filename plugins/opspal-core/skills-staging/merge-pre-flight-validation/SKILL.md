---
name: merge-pre-flight-validation
description: "Before Account merges, validate: (1) dependent picklist values against controlling field, (2) shared ACR contacts, (3) unique field collisions"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
---

# Merge Pre Flight Validation

Before Account merges, validate: (1) dependent picklist values against controlling field, (2) shared ACR contacts, (3) unique field collisions

## When to Use This Skill

- Before executing the operation described in this skill

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Before Account merges, validate: (1) dependent picklist values against controlling field, (2) shared ACR contacts, (3) unique field collisions
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: ce8068e4-8b2a-4e00-ae72-cf9674cbbb81
- **Agent**: manual workflow
- **Enriched**: 2026-04-03
