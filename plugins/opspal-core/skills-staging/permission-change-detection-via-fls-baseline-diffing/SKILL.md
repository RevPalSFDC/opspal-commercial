---
name: permission-change-detection-via-fls-baseline-diffing
description: "Snapshot FieldPermissions for RevPal-deployed fields at session end. At next session start, query current FieldPermissions and diff against snapshot. Alert on any revoked permissions before beginning investigation work."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
---

# Permission Change Detection Via Fls Baseline Diffing

Snapshot FieldPermissions for RevPal-deployed fields at session end. At next session start, query current FieldPermissions and diff against snapshot. Alert on any revoked permissions before beginning investigation work.

## When to Use This Skill

- Before executing the operation described in this skill
- When deploying metadata that involves the patterns described here

**Category**: [SFDC_ID]
**Discovered from**: reflection analysis

## Workflow

1. Snapshot FieldPermissions for RevPal-deployed fields at session end
2. At next session start, query current FieldPermissions and diff against snapshot
3. Alert on any revoked permissions before beginning investigation work

## Source

- **Reflection**: 915135c9-d4fb-42b7-a090-4f6668cd8559
- **Agent**: manual
- **Enriched**: 2026-04-03
