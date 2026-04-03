---
name: managed-package-trigger-settings-discovery
description: "Use global describe (/sobjects) to find managed package custom metadata types (__mdt) that control trigger behavior, then deploy CMT records to toggle triggers on/off"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-salesforce:sfdc-metadata-manager
---

# Managed Package Trigger Settings Discovery

Use global describe (/sobjects) to find managed package custom metadata types (__mdt) that control trigger behavior, then deploy CMT records to toggle triggers on/off

## When to Use This Skill

- When deploying metadata that involves the patterns described here

**Category**: [SFDC_ID]
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Use global describe (/sobjects) to find managed package custom metadata types (__mdt) that control trigger behavior, then deploy CMT records to toggle triggers on/off
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 875e15b5-0ccb-400f-9ce8-33d840151575
- **Agent**: sfdc-metadata-manager
- **Enriched**: 2026-04-03
