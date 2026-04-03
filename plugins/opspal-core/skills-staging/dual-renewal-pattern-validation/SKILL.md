---
name: dual-renewal-pattern-validation
description: "Government contracts with option years legitimately have BOTH 'Option' (total value) and 'Primary Term Renewal' (FY-specific) opportunities. Validate before assuming duplicates."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-salesforce:sfdc-query-specialist
---

# Dual Renewal Pattern Validation

Government contracts with option years legitimately have BOTH 'Option' (total value) and 'Primary Term Renewal' (FY-specific) opportunities. Validate before assuming duplicates.

## When to Use This Skill

- Before executing the operation described in this skill

**Category**: assessment
**Discovered from**: reflection analysis

## Workflow

1. Government contracts with option years legitimately have BOTH 'Option' (total value) and 'Primary Term Renewal' (FY-specific) opportunities
2. Validate before assuming duplicates

## Source

- **Reflection**: 24057e6e-0ca5-42fe-80ce-8ae7077f4e0b
- **Agent**: sfdc-query-specialist
- **Enriched**: 2026-04-03
