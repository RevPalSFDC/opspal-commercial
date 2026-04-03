---
name: territory2-bulk-condition-modification
description: "Retrieve Territory2Rule metadata, parse XML to find conditions by field/value, remove target ruleItem, update booleanFilter with proper renumbering, deploy changes"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
---

# Territory2 Bulk Condition Modification

Retrieve Territory2Rule metadata, parse XML to find conditions by field/value, remove target ruleItem, update booleanFilter with proper renumbering, deploy changes

## When to Use This Skill

- When deploying metadata that involves the patterns described here

**Category**: configuration
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Retrieve Territory2Rule metadata, parse XML to find conditions by field/value, remove target ruleItem, update booleanFilter with proper renumbering, deploy changes
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 3feea08c-827c-4489-8d55-a5feaab854b6
- **Agent**: manual implementation with sfdc-territory-discovery
- **Enriched**: 2026-04-03
