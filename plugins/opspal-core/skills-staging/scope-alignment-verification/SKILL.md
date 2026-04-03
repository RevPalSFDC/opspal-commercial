---
name: scope-alignment-verification
description: "When user provides a data source (CSV), explicitly confirm query scope matches before execution"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
agent: opspal-salesforce:sfdc-query-specialist
---

# Scope Alignment Verification

When user provides a data source (CSV), explicitly confirm query scope matches before execution

## When to Use This Skill

- Before executing the operation described in this skill

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: When user provides a data source (CSV), explicitly confirm query scope matches before execution
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 930ed9ad-4c20-4504-b26a-b7a7510582ac
- **Agent**: sfdc-query-specialist
- **Enriched**: 2026-04-03
