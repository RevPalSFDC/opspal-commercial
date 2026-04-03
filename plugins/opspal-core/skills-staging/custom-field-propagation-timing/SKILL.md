---
name: custom-field-propagation-timing
description: "Newly deployed custom fields may not be immediately accessible in all API contexts. For territory rules, wait 2-5 minutes or implement polling before referencing new fields in rule items."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-salesforce:sfdc-territory-orchestrator
---

# Custom Field Propagation Timing

Newly deployed custom fields may not be immediately accessible in all API contexts. For territory rules, wait 2-5 minutes or implement polling before referencing new fields in rule items.

## When to Use This Skill

- Before executing the operation described in this skill
- When deploying metadata that involves the patterns described here

**Category**: deployment
**Discovered from**: reflection analysis

## Workflow

1. Newly deployed custom fields may not be immediately accessible in all API contexts
2. For territory rules, wait 2-5 minutes or implement polling before referencing new fields in rule items

## Source

- **Reflection**: 775e2bc7-9730-4eb2-9582-ca26b1801bee
- **Agent**: sfdc-territory-orchestrator
- **Enriched**: 2026-04-03
