---
name: claude-code-hook-schema-validation
description: "Validate hook types against known valid list, validate matchers as regex, check for common glob-to-regex conversion needs"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Claude Code Hook Schema Validation

Validate hook types against known valid list, validate matchers as regex, check for common glob-to-regex conversion needs

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Validate hook types against known valid list, validate matchers as regex, check for common glob-to-regex conversion needs
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 815f83eb-aae3-4232-ad12-b37af6c8a045
- **Agent**: manual-debugging
- **Enriched**: 2026-04-03
