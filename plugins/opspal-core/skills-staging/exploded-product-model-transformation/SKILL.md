---
name: exploded-product-model-transformation
description: "Transform rows with multiple boolean product flags into separate rows per enabled product, allocating MRR to primary product only"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Exploded Product Model Transformation

Transform rows with multiple boolean product flags into separate rows per enabled product, allocating MRR to primary product only

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: data-transformation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Transform rows with multiple boolean product flags into separate rows per enabled product, allocating MRR to primary product only
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 81db45b7-cc65-4f9f-99e0-6ca76fd7de0b
- **Agent**: manual Python transformation
- **Enriched**: 2026-04-03
