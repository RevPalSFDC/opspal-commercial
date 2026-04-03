---
name: vr-pre-activation-field-existence-check
description: "Before activating any validation rule, parse its formula for __c field references and confirm each exists in the org via describe API. Prevents deadlock conditions where VR references non-existent fields."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-core:diagnostic-analysis
---

# Vr Pre Activation Field Existence Check

Before activating any validation rule, parse its formula for __c field references and confirm each exists in the org via describe API. Prevents deadlock conditions where VR references non-existent fields.

## When to Use This Skill

- Before executing the operation described in this skill

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Before activating any validation rule, parse its formula for __c field references and confirm each exists in the org via describe API
2. Prevents deadlock conditions where VR references non-existent fields

## Source

- **Reflection**: 3ced6263-c01a-45fc-8602-c0ad6f1ed6a3
- **Agent**: diagnostic-analysis
- **Enriched**: 2026-04-03
