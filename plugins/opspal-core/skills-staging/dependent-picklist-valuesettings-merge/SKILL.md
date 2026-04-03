---
name: dependent-picklist-valuesettings-merge
description: "Before deploying dependent picklist field-meta.xml, scan for duplicate valueName entries across separate valueSettings blocks and merge them into single blocks with multiple controllingFieldValue entries."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-core:general-purpose (finalizer)
---

# Dependent Picklist Valuesettings Merge

Before deploying dependent picklist field-meta.xml, scan for duplicate valueName entries across separate valueSettings blocks and merge them into single blocks with multiple controllingFieldValue entries.

## When to Use This Skill

- Before executing the operation described in this skill
- When deploying metadata that involves the patterns described here

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Before deploying dependent picklist field-meta
2. xml, scan for duplicate valueName entries across separate valueSettings blocks and merge them into single blocks with multiple controllingFieldValue entries

## Source

- **Reflection**: 2cd1fc6f-231e-42c1-aa05-1d0e5b666325
- **Agent**: general-purpose (finalizer)
- **Enriched**: 2026-04-03
