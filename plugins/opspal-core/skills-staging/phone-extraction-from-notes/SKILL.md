---
name: phone-extraction-from-notes
description: "Extract phone numbers from freeform text fields using regex patterns, normalize to 10 digits, cross-reference against existing Account phones for additional matching"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-core:custom-script
---

# Phone Extraction From Notes

Extract phone numbers from freeform text fields using regex patterns, normalize to 10 digits, cross-reference against existing Account phones for additional matching

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Extract phone numbers from freeform text fields using regex patterns, normalize to 10 digits, cross-reference against existing Account phones for additional matching
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 2aa9a8d7-7e05-4355-9123-b2bc6ba4fdb9
- **Agent**: custom-script
- **Enriched**: 2026-04-03
