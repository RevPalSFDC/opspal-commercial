---
name: knowledge-propagation-from-sub-runbooks
description: "When a fix is discovered and documented in a sub-project runbook, always propagate the fix to CLAUDE.md (project-level) so all agents inherit the knowledge."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Knowledge Propagation From Sub Runbooks

When a fix is discovered and documented in a sub-project runbook, always propagate the fix to CLAUDE.md (project-level) so all agents inherit the knowledge.

## When to Use This Skill

- When encountering errors that match this pattern

**Category**: configuration
**Discovered from**: reflection analysis

## Workflow

1. When a fix is discovered and documented in a sub-project runbook, always propagate the fix to CLAUDE
2. md (project-level) so all agents inherit the knowledge

## Source

- **Reflection**: 4711bd48-617c-4019-8097-596bca673f9d
- **Agent**: manual-execution
- **Enriched**: 2026-04-03
