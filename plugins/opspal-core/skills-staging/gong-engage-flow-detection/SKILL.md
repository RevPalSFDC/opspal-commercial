---
name: gong-engage-flow-detection
description: "Query Tasks where Gong__Current_Flow_Name__c != null to identify Engage Flow adoption"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
agent: opspal-core:direct-execution
---

# Gong Engage Flow Detection

Query Tasks where Gong__Current_Flow_Name__c != null to identify Engage Flow adoption

## When to Use This Skill

- When working with Salesforce Flows or automation

**Category**: query
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Query Tasks where Gong__Current_Flow_Name__c != null to identify Engage Flow adoption
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 69248980-94ab-4209-9d39-13429ca3f883
- **Agent**: direct-execution
- **Enriched**: 2026-04-03
