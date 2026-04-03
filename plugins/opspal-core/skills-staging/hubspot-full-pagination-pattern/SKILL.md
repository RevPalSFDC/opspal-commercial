---
name: hubspot-full-pagination-pattern
description: "Use while(true) loop with vidOffset tracking and break on !has-more. Never use arbitrary maxContacts caps for analysis scripts."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Hubspot Full Pagination Pattern

Use while(true) loop with vidOffset tracking and break on !has-more. Never use arbitrary maxContacts caps for analysis scripts.

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: query
**Discovered from**: reflection analysis

## Workflow

1. Use while(true) loop with vidOffset tracking and break on !has-more
2. Never use arbitrary maxContacts caps for analysis scripts

## Source

- **Reflection**: d4628483-2fbe-4180-8cf2-f83f0e9a9a02
- **Agent**: manual
- **Enriched**: 2026-04-03
