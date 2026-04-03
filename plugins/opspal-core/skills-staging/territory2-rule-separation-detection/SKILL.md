---
name: territory2-rule-separation-detection
description: "Parse ruleAssociations from Territory2 XML to identify rules that require separate creation when using Data API deployment path"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-salesforce:sfdc-territory-orchestrator
---

# Territory2 Rule Separation Detection

Parse ruleAssociations from Territory2 XML to identify rules that require separate creation when using Data API deployment path

## When to Use This Skill

- When deploying metadata that involves the patterns described here

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Parse ruleAssociations from Territory2 XML to identify rules that require separate creation when using Data API deployment path
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 43d0ec8b-f1c3-4f59-89fd-86c9dcd0a51d
- **Agent**: sfdc-territory-orchestrator
- **Enriched**: 2026-04-03
