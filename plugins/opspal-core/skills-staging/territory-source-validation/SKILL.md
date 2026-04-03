---
name: territory-source-validation
description: "Cross-reference assignment source files against User object before bulk operations, generating reconciliation report"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Write
  - Bash
agent: opspal-salesforce:sfdc-territory-orchestrator
---

# Territory Source Validation

Cross-reference assignment source files against User object before bulk operations, generating reconciliation report

## When to Use This Skill

- Before executing the operation described in this skill
- During data import or bulk operations
- When building or modifying reports and dashboards

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Cross-reference assignment source files against User object before bulk operations, generating reconciliation report
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: d146bfbc-69ae-4f36-8f0a-557b2b70d46f
- **Agent**: sfdc-territory-orchestrator
- **Enriched**: 2026-04-03
