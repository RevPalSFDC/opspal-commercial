---
name: multi-source-key-point-consolidation
description: "When synthesizing analysis from multiple Gong calls, collect all keyword-matching lines across calls, deduplicate by normalized text prefix, and apply bolded topic header formatting via regex (^[A-Z][^:]{2,40}:) for clean unified output."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Multi Source Key Point Consolidation

When synthesizing analysis from multiple Gong calls, collect all keyword-matching lines across calls, deduplicate by normalized text prefix, and apply bolded topic header formatting via regex (^[A-Z][^:]{2,40}:) for clean unified output.

## When to Use This Skill

- When encountering errors that match this pattern

**Category**: automation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: When synthesizing analysis from multiple Gong calls, collect all keyword-matching lines across calls, deduplicate by normalized text prefix, and apply bolded topic header formatting via regex (^[A-Z][^:]{2,40}:) for clean unified output.
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 1a4dbd61-33d9-4b1c-ba41-28b952f13ca1
- **Agent**: manual
- **Enriched**: 2026-04-03
