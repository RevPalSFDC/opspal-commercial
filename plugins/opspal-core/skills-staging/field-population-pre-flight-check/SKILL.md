---
name: field-population-pre-flight-check
description: "Before executing queries with filters, check population rates for filter fields and warn if below threshold"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-salesforce:sfdc-query-specialist
---

# Field Population Pre Flight Check

Before executing queries with filters, check population rates for filter fields and warn if below threshold

## When to Use This Skill

- Before executing the operation described in this skill

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Before executing queries with filters, check population rates for filter fields and warn if below threshold
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: f31094e9-6bf5-4f7c-a6f1-706eaa5dd5a8
- **Agent**: sfdc-query-specialist
- **Enriched**: 2026-04-03
