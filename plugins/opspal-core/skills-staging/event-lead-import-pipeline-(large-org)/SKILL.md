---
name: event-lead-import-pipeline-(large-org)
description: "XLSX → clean → dedup → priority segment → 4-step matching waterfall (email → lastname-bucketed name → company exact+fuzzy → new lead) → upload CSVs with [COMPANY] endings"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Event Lead Import Pipeline (large Org)

XLSX → clean → dedup → priority segment → 4-step matching waterfall (email → lastname-bucketed name → company exact+fuzzy → new lead) → upload CSVs with [COMPANY] endings

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: automation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: XLSX → clean → dedup → priority segment → 4-step matching waterfall (email → lastname-bucketed name → company exact+fuzzy → new lead) → upload CSVs with [COMPANY] endings
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 94eec466-4e6e-4bae-beff-88fee2a5368b
- **Agent**: manual (adapted from [COMPANY] 2026 scripts)
- **Enriched**: 2026-04-03
