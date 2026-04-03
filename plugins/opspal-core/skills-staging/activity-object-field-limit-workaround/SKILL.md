---
name: activity-object-field-limit-workaround
description: "When sandbox hits 100 custom Activity field limit, formula fields don't count — verify via Tooling API DataType analysis before assuming limit is hit"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-core:release-coordinator
---

# Activity Object Field Limit Workaround

When sandbox hits 100 custom Activity field limit, formula fields don't count — verify via Tooling API DataType analysis before assuming limit is hit

## When to Use This Skill

- Before executing the operation described in this skill

**Category**: deployment
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: When sandbox hits 100 custom Activity field limit, formula fields don't count — verify via Tooling API DataType analysis before assuming limit is hit
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 94d49ead-a1a8-43ac-b9d3-5545e8084d7b
- **Agent**: opspal-core:release-coordinator
- **Enriched**: 2026-04-03
