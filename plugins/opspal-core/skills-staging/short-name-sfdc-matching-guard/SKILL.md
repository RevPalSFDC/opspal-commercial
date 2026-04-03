---
name: short-name-sfdc-matching-guard
description: "For company names under 5 characters, require exact SOQL match instead of fuzzy/substring to prevent false positives"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
agent: opspal-salesforce:sfdc-csv-enrichment
---

# Short Name Sfdc Matching Guard

For company names under 5 characters, require exact SOQL match instead of fuzzy/substring to prevent false positives

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: For company names under 5 characters, require exact SOQL match instead of fuzzy/substring to prevent false positives
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 2b8e552f-4b7a-49e3-a975-fe49fbad5433
- **Agent**: opspal-salesforce:sfdc-csv-enrichment
- **Enriched**: 2026-04-03
