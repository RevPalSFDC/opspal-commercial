---
name: vr-state-pre-flight-check
description: "Before any data import, query Tooling API for active Validation Rules on target object. Compare against source XML. Warn on divergence. Temporarily deactivate blocking VRs, re-activate after."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
agent: opspal-salesforce:sfdc-data-operations
---

# Vr State Pre Flight Check

Before any data import, query Tooling API for active Validation Rules on target object. Compare against source XML. Warn on divergence. Temporarily deactivate blocking VRs, re-activate after.

## When to Use This Skill

- Before executing the operation described in this skill
- During data import or bulk operations

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Before any data import, query Tooling API for active Validation Rules on target object
2. Compare against source XML
3. Warn on divergence
4. Temporarily deactivate blocking VRs, re-activate after

## Source

- **Reflection**: 8da8d56e-523a-44a5-b767-baa1428f6aac
- **Agent**: sfdc-data-operations
- **Enriched**: 2026-04-03
