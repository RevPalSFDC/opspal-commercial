---
name: comment-syntax-validation
description: "Multiline comments containing '*/' patterns (even in descriptive text) will prematurely close the comment block. Escape or rephrase patterns like 'plugins/*/.claude-plugin' to 'plugins/<name>/.claude-plugin'."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Comment Syntax Validation

Multiline comments containing '*/' patterns (even in descriptive text) will prematurely close the comment block. Escape or rephrase patterns like 'plugins/*/.claude-plugin' to 'plugins/<name>/.claude-plugin'.

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: script-development
**Discovered from**: reflection analysis

## Workflow

1. Multiline comments containing '*/' patterns (even in descriptive text) will prematurely close the comment block
2. Escape or rephrase patterns like 'plugins/*/
3. claude-plugin' to 'plugins/<name>/
4. claude-plugin'

## Source

- **Reflection**: e19d25eb-d4de-4088-b99b-9cd70d4bdf38
- **Agent**: unknown
- **Enriched**: 2026-04-03
