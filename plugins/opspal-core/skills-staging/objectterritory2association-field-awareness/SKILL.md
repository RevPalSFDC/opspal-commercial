---
name: objectterritory2association-field-awareness
description: "OTA lacks IsActive field - records are deleted when inactive. Use Territory2.Territory2ModelId filter instead of IsActive."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-salesforce:sfdc-territory-discovery
---

# Objectterritory2association Field Awareness

OTA lacks IsActive field - records are deleted when inactive. Use Territory2.Territory2ModelId filter instead of IsActive.

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: query
**Discovered from**: reflection analysis

## Workflow

1. OTA lacks IsActive field - records are deleted when inactive
2. Use Territory2
3. Territory2ModelId filter instead of IsActive

## Source

- **Reflection**: 84b5e2ad-b1d9-4bc4-902d-5e617c70354a
- **Agent**: sfdc-territory-discovery
- **Enriched**: 2026-04-03
