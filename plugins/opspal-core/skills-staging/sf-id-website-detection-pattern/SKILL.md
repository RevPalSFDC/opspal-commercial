---
name: sf-id-website-detection-pattern
description: "Query accounts where Website LIKE '001%.com' OR LIKE '003%.com' OR LIKE '00[a-z]%.com' to detect Salesforce IDs mistakenly used as websites"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
agent: opspal-salesforce:sfdc-query-specialist
---

# Sf Id Website Detection Pattern

Query accounts where Website LIKE '001%.com' OR LIKE '003%.com' OR LIKE '00[a-z]%.com' to detect Salesforce IDs mistakenly used as websites

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Query accounts where Website LIKE '001%
2. com' OR LIKE '003%
3. com' OR LIKE '00[a-z]%
4. com' to detect Salesforce IDs mistakenly used as websites

## Source

- **Reflection**: b8fed46f-a3ef-4686-adfa-08c672381950
- **Agent**: sfdc-query-specialist
- **Enriched**: 2026-04-03
