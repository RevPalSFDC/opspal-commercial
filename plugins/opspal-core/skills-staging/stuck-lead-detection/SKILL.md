---
name: stuck-lead-detection
description: "Identify leads stuck in Marketo without SFDC sync by analyzing campaign status and lead metadata"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: marketo-plugin:marketo-instance-discovery
---

# Stuck Lead Detection

Identify leads stuck in Marketo without SFDC sync by analyzing campaign status and lead metadata

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: [SFDC_ID]
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Identify leads stuck in Marketo without SFDC sync by analyzing campaign status and lead metadata
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: f6bd76bf-35fd-4a11-9d39-f07d26ef5c4a
- **Agent**: marketo-plugin:marketo-instance-discovery
- **Enriched**: 2026-04-03
