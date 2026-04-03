---
name: sf-field-corruption-recovery
description: "When CustomField exists in Tooling API but SOQL returns 'No such column': destructive metadata delete → fresh source deploy → FLS grant via profile metadata"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-salesforce:sfdc-orchestrator
---

# Sf Field Corruption Recovery

When CustomField exists in Tooling API but SOQL returns 'No such column': destructive metadata delete → fresh source deploy → FLS grant via profile metadata

## When to Use This Skill

- When deploying metadata that involves the patterns described here

**Category**: [SFDC_ID]
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: When CustomField exists in Tooling API but SOQL returns 'No such column': destructive metadata delete → fresh source deploy → FLS grant via profile metadata
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 011c05a4-a5cf-473f-b13b-62508bde610a
- **Agent**: sfdc-orchestrator
- **Enriched**: 2026-04-03
