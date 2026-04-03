---
name: cadence-family-suppression-pattern
description: "Use per-cadence-family checkbox fields on Contact (not a single global flag) to enable SalesLoft automation rules scoped to specific cadence types. Flow determines cadence family from [COMPANY] Type."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-salesforce:sfdc-deployment-manager
---

# Cadence Family Suppression Pattern

Use per-cadence-family checkbox fields on Contact (not a single global flag) to enable SalesLoft automation rules scoped to specific cadence types. Flow determines cadence family from [COMPANY] Type.

## When to Use This Skill

- When working with Salesforce Flows or automation

**Category**: automation
**Discovered from**: reflection analysis

## Workflow

1. Use per-cadence-family checkbox fields on Contact (not a single global flag) to enable SalesLoft automation rules scoped to specific cadence types
2. Flow determines cadence family from [COMPANY] Type

## Source

- **Reflection**: 19078300-7388-403e-a596-8ba698a56a95
- **Agent**: sfdc-deployment-manager
- **Enriched**: 2026-04-03
