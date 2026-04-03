---
name: territory-gap-remediation
description: "Parse territory rules from [COMPANY] -> query current assignments -> detect gaps -> classify root causes -> generate paired CSVs (ObjectTerritory2Association + Account field updates) -> bulk load -> verify"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-salesforce:sfdc-territory-orchestrator + sfdc-bulkops-orchestrator
---

# Territory Gap Remediation

Parse territory rules from [COMPANY] -> query current assignments -> detect gaps -> classify root causes -> generate paired CSVs (ObjectTerritory2Association + Account field updates) -> bulk load -> verify

## When to Use This Skill

- During data import or bulk operations

**Category**: automation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Parse territory rules from [COMPANY] -> query current assignments -> detect gaps -> classify root causes -> generate paired CSVs (ObjectTerritory2Association + Account field updates) -> bulk load -> verify
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 841053b4-8654-40c5-843e-a636edb0bcb3
- **Agent**: sfdc-territory-orchestrator + sfdc-bulkops-orchestrator
- **Enriched**: 2026-04-03
