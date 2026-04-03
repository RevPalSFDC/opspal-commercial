---
name: geographic-address-derivation
description: "When web scraping fails for address information, derive addresses from organization name patterns and known geographic associations (e.g., 'Toronto Police Service' -> Toronto, Ontario, Canada)"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-core:Direct execution
---

# Geographic Address Derivation

When web scraping fails for address information, derive addresses from organization name patterns and known geographic associations (e.g., 'Toronto Police Service' -> Toronto, Ontario, Canada)

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: [SFDC_ID]
**Discovered from**: reflection analysis

## Workflow

1. When web scraping fails for address information, derive addresses from organization name patterns and known geographic associations (e
2. , 'Toronto Police Service' -> Toronto, Ontario, Canada)

## Source

- **Reflection**: c7ca7143-a790-413f-9225-9f557a0fa960
- **Agent**: Direct execution
- **Enriched**: 2026-04-03
