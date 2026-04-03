---
name: audit-result-sanity-check
description: "If automation audit returns 0 items across all objects, treat as suspect and suggest manual verification or Tooling API retry"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
---

# Audit Result Sanity Check

If automation audit returns 0 items across all objects, treat as suspect and suggest manual verification or Tooling API retry

## When to Use This Skill

- When performing audits or assessments of the target system
- When working with Salesforce Flows or automation

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: If automation audit returns 0 items across all objects, treat as suspect and suggest manual verification or Tooling API retry
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: aee686bc-c1a0-47b7-ba8e-edae792abcbb
- **Agent**: manual investigation
- **Enriched**: 2026-04-03
