---
name: acr-preserved-contact-reparenting
description: "When moving contacts between accounts within the same org family, Salesforce auto-creates indirect AccountContactRelation records. No manual ACR creation needed."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Write
  - Bash
agent: opspal-core:direct execution
---

# Acr Preserved Contact Reparenting

When moving contacts between accounts within the same org family, Salesforce auto-creates indirect AccountContactRelation records. No manual ACR creation needed.

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: automation
**Discovered from**: reflection analysis

## Workflow

1. When moving contacts between accounts within the same org family, Salesforce auto-creates indirect AccountContactRelation records
2. No manual ACR creation needed

## Source

- **Reflection**: 8ebcce08-e26d-41e7-992b-231ce1fda7a8
- **Agent**: direct execution
- **Enriched**: 2026-04-03
