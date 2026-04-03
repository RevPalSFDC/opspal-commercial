---
name: tactical-language-detection-in-executive-output
description: "Scan executive-level outputs for implementation/platform metrics (workflow counts, field counts, sync rates, API coverage) and flag for replacement with strategic framing language."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-core:okr-executive-reporter
---

# Tactical Language Detection In Executive Output

Scan executive-level outputs for implementation/platform metrics (workflow counts, field counts, sync rates, API coverage) and flag for replacement with strategic framing language.

## When to Use This Skill

- When working with Salesforce Flows or automation

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Scan executive-level outputs for implementation/platform metrics (workflow counts, field counts, sync rates, API coverage) and flag for replacement with strategic framing language.
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 0e33c559-0234-46ec-8acf-34455a0bd76e
- **Agent**: okr-executive-reporter
- **Enriched**: 2026-04-03
