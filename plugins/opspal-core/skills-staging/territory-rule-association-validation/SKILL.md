---
name: territory-rule-association-validation
description: "Always verify RuleTerritory2Association junction record when checking if territory has active rules - rule existence alone is not sufficient"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-salesforce:sfdc-territory-orchestrator
---

# Territory Rule Association Validation

Always verify RuleTerritory2Association junction record when checking if territory has active rules - rule existence alone is not sufficient

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Always verify RuleTerritory2Association junction record when checking if territory has active rules - rule existence alone is not sufficient
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 6a66cc4e-3a9e-46dd-83de-f75e80c41cc3
- **Agent**: sfdc-territory-orchestrator
- **Enriched**: 2026-04-03
