---
name: dual-mode-report-enhancement
description: "When enhancing scripts with both single-item and bulk/rolling modes, always update BOTH code paths - they often have separate [SFDC_ID]"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-core:direct-implementation
---

# Dual Mode Report Enhancement

When enhancing scripts with both single-item and bulk/rolling modes, always update BOTH code paths - they often have separate [SFDC_ID]

## When to Use This Skill

- During data import or bulk operations

**Category**: automation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: When enhancing scripts with both single-item and bulk/rolling modes, always update BOTH code paths - they often have separate [SFDC_ID]
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: d504908a-32a3-48c1-97e4-e5ea29c21017
- **Agent**: direct-implementation
- **Enriched**: 2026-04-03
