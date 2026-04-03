---
name: territory-vs-role-layer-distinction
description: "When territory structure includes segments like Major/Core, validate whether these are account [SFDC_ID] (no role layer needed) or actual reporting structures (role layer needed)"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Write
  - Bash
agent: opspal-core:direct-cli
---

# Territory Vs Role Layer Distinction

When territory structure includes segments like Major/Core, validate whether these are account [SFDC_ID] (no role layer needed) or actual reporting structures (role layer needed)

## When to Use This Skill

- When building or modifying reports and dashboards

**Category**: configuration
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: When territory structure includes segments like Major/Core, validate whether these are account [SFDC_ID] (no role layer needed) or actual reporting structures (role layer needed)
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: bc0fe01a-5473-4934-812c-3886efb9d2cf
- **Agent**: direct-cli
- **Enriched**: 2026-04-03
