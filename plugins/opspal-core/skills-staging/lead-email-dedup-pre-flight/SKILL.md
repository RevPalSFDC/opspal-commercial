---
name: lead-email-dedup-pre-flight
description: "Before creating new Leads, query existing unconverted Leads by email. Split matches into Lead updates vs truly new Leads."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
---

# Lead Email Dedup Pre Flight

Before creating new Leads, query existing unconverted Leads by email. Split matches into Lead updates vs truly new Leads.

## When to Use This Skill

- Before executing the operation described in this skill

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Before creating new Leads, query existing unconverted Leads by email
2. Split matches into Lead updates vs truly new Leads

## Source

- **Reflection**: 6181da08-9c5b-4d95-98df-70790dcdcbc7
- **Agent**: manual
- **Enriched**: 2026-04-03
