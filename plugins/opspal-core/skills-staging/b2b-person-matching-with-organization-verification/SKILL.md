---
name: b2b-person-matching-with-organization-verification
description: "For B2B data matching, combine person name similarity (60%) with organization name similarity (40%), applying heavy penalty when organization doesn't match"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-core:custom Python script
---

# B2b Person Matching With Organization Verification

For B2B data matching, combine person name similarity (60%) with organization name similarity (40%), applying heavy penalty when organization doesn't match

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: For B2B data matching, combine person name similarity (60%) with organization name similarity (40%), applying heavy penalty when organization doesn't match
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: f481c1bb-2f81-4ff6-95f4-e071921a6311
- **Agent**: custom Python script
- **Enriched**: 2026-04-03
