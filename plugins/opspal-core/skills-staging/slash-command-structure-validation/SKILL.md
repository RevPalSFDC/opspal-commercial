---
name: slash-command-structure-validation
description: "Before claiming slash command is complete, verify: (1) Created in skills/{name}/SKILL.md, (2) Has valid YAML frontmatter, (3) Appears in skills registry"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Write
  - Bash
---

# Slash Command Structure Validation

Before claiming slash command is complete, verify: (1) Created in skills/{name}/SKILL.md, (2) Has valid YAML frontmatter, (3) Appears in skills registry

## When to Use This Skill

- Before executing the operation described in this skill

**Category**: plugin-validation
**Discovered from**: reflection analysis

## Workflow

1. Before claiming slash command is complete, verify: (1) Created in skills/{name}/SKILL
2. md, (2) Has valid YAML frontmatter, (3) Appears in skills registry

## Source

- **Reflection**: e530a3e6-3dac-43af-acd7-d6118fcca99f
- **Agent**: unknown
- **Enriched**: 2026-04-03
