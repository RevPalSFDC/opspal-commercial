---
name: territory-association-drift-validator
description: "Detect duplicate or conflicting Territory2 rule associations that break expected assignment outcomes after territory changes."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-salesforce:sfdc-territory-orchestrator
---

# Territory Association Drift Validator

Detect duplicate or conflicting Territory2 rule associations that break expected assignment outcomes after territory changes.

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Detect duplicate or conflicting Territory2 rule associations that break expected assignment outcomes after territory changes.
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: a13ec5ab-50f9-42b4-8eba-3a8cfc8d7a27
- **Agent**: sfdc-territory-orchestrator
- **Enriched**: 2026-04-03
