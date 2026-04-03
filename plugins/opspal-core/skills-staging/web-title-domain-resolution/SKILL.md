---
name: web-title-domain-resolution
description: "For unmatched email domains, fetch homepage title to derive company name, then match against SFDC Account.Name as final fallback"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-core:direct
---

# Web Title Domain Resolution

For unmatched email domains, fetch homepage title to derive company name, then match against SFDC Account.Name as final fallback

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: query
**Discovered from**: reflection analysis

## Workflow

1. For unmatched email domains, fetch homepage title to derive company name, then match against SFDC Account
2. Name as final fallback

## Source

- **Reflection**: a8170299-41bb-4781-af64-b369398c51bb
- **Agent**: direct
- **Enriched**: 2026-04-03
