---
name: flexipage-facet-orphan-detection
description: "Compare facet definitions (flexiPageRegions with type=Facet) against facet references (value=Facet-xxx) to find orphans"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Flexipage Facet Orphan Detection

Compare facet definitions (flexiPageRegions with type=Facet) against facet references (value=Facet-xxx) to find orphans

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Compare facet definitions (flexiPageRegions with type=Facet) against facet references (value=Facet-xxx) to find orphans
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: a66cb090-746c-4c51-b9c2-b9471d8450d6
- **Agent**: manual-scripting
- **Enriched**: 2026-04-03
