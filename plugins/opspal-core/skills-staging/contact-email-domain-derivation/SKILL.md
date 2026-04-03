---
name: contact-email-domain-derivation
description: "Query contacts by AccountId, extract email domains, count occurrences, select most frequent non-generic domain (excluding gmail, yahoo, outlook, etc.) as company website"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
agent: opspal-salesforce:sfdc-query-specialist
---

# Contact Email Domain Derivation

Query contacts by AccountId, extract email domains, count occurrences, select most frequent non-generic domain (excluding gmail, yahoo, outlook, etc.) as company website

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: data-quality
**Discovered from**: reflection analysis

## Workflow

1. Query contacts by AccountId, extract email domains, count occurrences, select most frequent non-generic domain (excluding gmail, yahoo, outlook, etc
2. ) as company website

## Source

- **Reflection**: b8fed46f-a3ef-4686-adfa-08c672381950
- **Agent**: sfdc-query-specialist
- **Enriched**: 2026-04-03
