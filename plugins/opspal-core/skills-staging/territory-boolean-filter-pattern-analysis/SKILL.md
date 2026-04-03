---
name: territory-boolean-filter-pattern-analysis
description: "When territory rules have complex boolean filters like (1 OR 2 OR 3) AND (4 AND 5), adding new states may require adjusting the filter to exempt new states from certain conditions (e.g., county filters)"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-core:direct-execution
---

# Territory Boolean Filter Pattern Analysis

When territory rules have complex boolean filters like (1 OR 2 OR 3) AND (4 AND 5), adding new states may require adjusting the filter to exempt new states from certain conditions (e.g., county filters)

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: [SFDC_ID]
**Discovered from**: reflection analysis

## Workflow

1. When territory rules have complex boolean filters like (1 OR 2 OR 3) AND (4 AND 5), adding new states may require adjusting the filter to exempt new states from certain conditions (e
2. , county filters)

## Source

- **Reflection**: b7dd5dd3-6c5f-45e2-9769-79cd634c4628
- **Agent**: direct-execution
- **Enriched**: 2026-04-03
