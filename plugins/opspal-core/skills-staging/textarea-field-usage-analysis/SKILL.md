---
name: textarea-field-usage-analysis
description: "Query all records without WHERE, analyze client-side for population rate, content patterns, owner distribution, and sample values"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
agent: opspal-salesforce:sfdc-data-operations
---

# Textarea Field Usage Analysis

Query all records without WHERE, analyze client-side for population rate, content patterns, owner distribution, and sample values

## When to Use This Skill

- When performing audits or assessments of the target system

**Category**: query
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Query all records without WHERE, analyze client-side for population rate, content patterns, owner distribution, and sample values
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: ee27c21d-f7a5-4c76-87be-b27eed927773
- **Agent**: sfdc-data-operations
- **Enriched**: 2026-04-03
