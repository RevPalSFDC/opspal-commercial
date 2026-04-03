---
name: territory-exclusion-audit
description: "Cross-reference Territory2ObjectExclusion records against active rule criteria to identify stale or incorrect exclusions blocking legitimate territory assignments."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-salesforce:sfdc-territory-orchestrator
---

# Territory Exclusion Audit

Cross-reference Territory2ObjectExclusion records against active rule criteria to identify stale or incorrect exclusions blocking legitimate territory assignments.

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Cross-reference Territory2ObjectExclusion records against active rule criteria to identify stale or incorrect exclusions blocking legitimate territory assignments.
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: b3ce86e8-bf51-4392-8ea4-75296b15bfdd
- **Agent**: sfdc-territory-orchestrator
- **Enriched**: 2026-04-03
