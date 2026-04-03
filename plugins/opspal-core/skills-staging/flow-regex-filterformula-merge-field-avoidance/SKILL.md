---
name: flow-regex-filterformula-merge-field-avoidance
description: "When using REGEX in Flow filterFormula XML, avoid {N} quantifier syntax because it conflicts with [COMPANY] merge field {!...} parsing. Use repeated character classes (e.g., [A-Z][A-Z]) instead of [A-Z]{2}."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-core:direct
---

# Flow Regex Filterformula Merge Field Avoidance

When using REGEX in Flow filterFormula XML, avoid {N} quantifier syntax because it conflicts with [COMPANY] merge field {!...} parsing. Use repeated character classes (e.g., [A-Z][A-Z]) instead of [A-Z]{2}.

## When to Use This Skill

- When working with Salesforce Flows or automation

**Category**: automation
**Discovered from**: reflection analysis

## Workflow

1. When using REGEX in Flow filterFormula XML, avoid {N} quantifier syntax because it conflicts with [COMPANY] merge field {!
2. Use repeated character classes (e
3. , [A-Z][A-Z]) instead of [A-Z]{2}

## Source

- **Reflection**: d0e7dd66-bc7f-489c-bfdb-a4fd84eb1086
- **Agent**: direct
- **Enriched**: 2026-04-03
