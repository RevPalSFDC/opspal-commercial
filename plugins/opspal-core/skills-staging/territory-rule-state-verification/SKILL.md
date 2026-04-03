---
name: territory-rule-state-verification
description: "After modifying territory rules, query IsActive, BooleanFilter, and item SortOrder alignment before reporting success"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-salesforce:sfdc-territory-orchestrator
---

# Territory Rule State Verification

After modifying territory rules, query IsActive, BooleanFilter, and item SortOrder alignment before reporting success

## When to Use This Skill

- Before executing the operation described in this skill
- When building or modifying reports and dashboards

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: After modifying territory rules, query IsActive, BooleanFilter, and item SortOrder alignment before reporting success
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 1db32731-c806-4173-bc46-0ac7239145b3
- **Agent**: sfdc-territory-orchestrator
- **Enriched**: 2026-04-03
