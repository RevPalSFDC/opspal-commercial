---
name: territory-rule-split-pattern
description: "Salesforce limits Territory2Rule to ~9 ruleItems per rule. For territories covering >9 states, split into multiple rules (e.g., FM_Northeast_Assignment, FM_Northeast_Assignment_2, FM_Northeast_Assignment_3)"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-salesforce:sfdc-territory-deployment
---

# Territory Rule Split Pattern

Salesforce limits Territory2Rule to ~9 ruleItems per rule. For territories covering >9 states, split into multiple rules (e.g., FM_Northeast_Assignment, FM_Northeast_Assignment_2, FM_Northeast_Assignment_3)

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: deployment
**Discovered from**: reflection analysis

## Workflow

1. Salesforce limits Territory2Rule to ~9 ruleItems per rule
2. For territories covering >9 states, split into multiple rules (e
3. , FM_Northeast_Assignment, FM_Northeast_Assignment_2, FM_Northeast_Assignment_3)

## Source

- **Reflection**: 5fd9c130-bdc2-4c0f-b3ad-931087ff285a
- **Agent**: opspal-salesforce:sfdc-territory-deployment
- **Enriched**: 2026-04-03
