---
name: command-execution-directive-pattern
description: "Slash commands need explicit execution directives. Add 'allowed_tools' in frontmatter + 'EXECUTE IMMEDIATELY' section with bash command. Without this, Claude treats command as documentation."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Command Execution Directive Pattern

Slash commands need explicit execution directives. Add 'allowed_tools' in frontmatter + 'EXECUTE IMMEDIATELY' section with bash command. Without this, Claude treats command as documentation.

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: command-development
**Discovered from**: reflection analysis

## Workflow

1. Slash commands need explicit execution directives
2. Add 'allowed_tools' in frontmatter + 'EXECUTE IMMEDIATELY' section with bash command
3. Without this, Claude treats command as documentation

## Source

- **Reflection**: b7689ffe-2da8-487b-860c-08cad6cf9817
- **Agent**: unknown
- **Enriched**: 2026-04-03
