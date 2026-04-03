---
name: rolling-window-decrease-diagnosis
description: "When rolling metrics decrease unexpectedly: (1) identify dropped week, (2) query unique items from dropped week, (3) cross-reference with current window, (4) count items not re-contacted to explain decrease"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
agent: opspal-core:direct-execution
---

# Rolling Window Decrease Diagnosis

When rolling metrics decrease unexpectedly: (1) identify dropped week, (2) query unique items from dropped week, (3) cross-reference with current window, (4) count items not re-contacted to explain decrease

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: [SFDC_ID]
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: When rolling metrics decrease unexpectedly: (1) identify dropped week, (2) query unique items from dropped week, (3) cross-reference with current window, (4) count items not re-contacted to explain decrease
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 8b23d9c1-39ed-4d43-b884-4979398fff0c
- **Agent**: direct-execution
- **Enriched**: 2026-04-03
