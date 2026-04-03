---
name: agent-frontmatter-keyword-extraction
description: "Extract [SFDC_ID] from frontmatter, fallback to triggers field, then parse description text for keyword patterns"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
---

# Agent Frontmatter Keyword Extraction

Extract [SFDC_ID] from frontmatter, fallback to triggers field, then parse description text for keyword patterns

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: agent-development
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Extract [SFDC_ID] from frontmatter, fallback to triggers field, then parse description text for keyword patterns
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 43553d24-8424-494e-aae6-3b25749ff653
- **Agent**: unknown
- **Enriched**: 2026-04-03
