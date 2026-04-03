---
name: title-based-agency-disambiguation
description: "Use Contact Title keywords (officer, deputy, firefighter, etc.) to route contacts to the correct agency Account when a government domain maps to multiple agencies"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-core:orphan_contact_processor.py
---

# Title Based Agency Disambiguation

Use Contact Title keywords (officer, deputy, firefighter, etc.) to route contacts to the correct agency Account when a government domain maps to multiple agencies

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: assessment
**Discovered from**: reflection analysis

## Workflow

1. Use Contact Title keywords (officer, deputy, firefighter, etc
2. ) to route contacts to the correct agency Account when a government domain maps to multiple agencies

## Source

- **Reflection**: 908e683b-796f-464a-9cf1-0479eef068a6
- **Agent**: orphan_contact_processor.py
- **Enriched**: 2026-04-03
