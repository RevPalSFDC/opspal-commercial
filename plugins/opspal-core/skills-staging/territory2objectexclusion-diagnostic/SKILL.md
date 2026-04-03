---
name: territory2objectexclusion-diagnostic
description: "When an account matches all rule criteria but has no territory assignment, query Territory2ObjectExclusion WHERE Object2Id = accountId to check for manual exclusions"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
agent: opspal-salesforce:sfdc-territory-orchestrator
---

# Territory2objectexclusion Diagnostic

When an account matches all rule criteria but has no territory assignment, query Territory2ObjectExclusion WHERE Object2Id = accountId to check for manual exclusions

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: [SFDC_ID]
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: When an account matches all rule criteria but has no territory assignment, query Territory2ObjectExclusion WHERE Object2Id = accountId to check for manual exclusions
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 6cf899ca-cbce-459d-b800-f91f1b6dd8ca
- **Agent**: sfdc-territory-orchestrator
- **Enriched**: 2026-04-03
