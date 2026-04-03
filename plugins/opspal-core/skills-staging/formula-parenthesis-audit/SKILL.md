---
name: formula-parenthesis-audit
description: "When adding nested IF branches to formula fields, always recount open vs close parentheses. Pattern: each new IF adds 1 open paren, trailing close parens should equal total IFs + inner expressions."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-core:direct-execution
---

# Formula Parenthesis Audit

When adding nested IF branches to formula fields, always recount open vs close parentheses. Pattern: each new IF adds 1 open paren, trailing close parens should equal total IFs + inner expressions.

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. When adding nested IF branches to formula fields, always recount open vs close parentheses
2. Pattern: each new IF adds 1 open paren, trailing close parens should equal total IFs + inner expressions

## Source

- **Reflection**: f53538aa-1cb4-4a66-bdd7-18501a339fdd
- **Agent**: direct-execution
- **Enriched**: 2026-04-03
