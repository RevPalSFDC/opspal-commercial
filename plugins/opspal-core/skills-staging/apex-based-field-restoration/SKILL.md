---
name: apex-based-field-restoration
description: "Use Anonymous Apex via sf apex run with type-aware field assignments (Date.valueOf, numeric literals, escaped strings) to bulk-restore field values from [COMPANY] backups after merge operations. Includes pre-flight metadata validation, User ID verification, and tiered execution with conflict detection."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
---

# Apex Based Field Restoration

Use Anonymous Apex via sf apex run with type-aware field assignments (Date.valueOf, numeric literals, escaped strings) to bulk-restore field values from [COMPANY] backups after merge operations. Includes pre-flight metadata validation, User ID verification, and tiered execution with conflict detection.

## When to Use This Skill

- Before executing the operation described in this skill
- During data import or bulk operations

**Category**: automation
**Discovered from**: reflection analysis

## Workflow

1. Use Anonymous Apex via sf apex run with type-aware field assignments (Date
2. valueOf, numeric literals, escaped strings) to bulk-restore field values from [COMPANY] backups after merge operations
3. Includes pre-flight metadata validation, User ID verification, and tiered execution with conflict detection

## Source

- **Reflection**: 84c4e5a8-8fb1-4c84-a53a-61e046ceaa2d
- **Agent**: manual (restore_customer_fields.py)
- **Enriched**: 2026-04-03
