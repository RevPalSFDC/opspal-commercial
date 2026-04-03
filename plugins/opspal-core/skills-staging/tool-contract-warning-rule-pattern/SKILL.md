---
name: tool-contract-warning-rule-pattern
description: "For non-critical but problematic tool usage patterns: (1) add param to optional/types, (2) create rule with condition checking param presence/absence, (3) set severity to WARNING (not CRITICAL), (4) provide clear message referencing documentation, (5) suggest remediation"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Write
  - Bash
---

# Tool Contract Warning Rule Pattern

For non-critical but problematic tool usage patterns: (1) add param to optional/types, (2) create rule with condition checking param presence/absence, (3) set severity to WARNING (not CRITICAL), (4) provide clear message referencing documentation, (5) suggest remediation

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: plugin-development
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: For non-critical but problematic tool usage patterns: (1) add param to optional/types, (2) create rule with condition checking param presence/absence, (3) set severity to WARNING (not CRITICAL), (4) provide clear message referencing documentation, (5) suggest remediation
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 801602bd-8229-4f11-aee2-32f5baf03447
- **Agent**: unknown
- **Enriched**: 2026-04-03
