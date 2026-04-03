---
name: prior-session-artifact-discovery
description: "Search workspace orgs directory and reports directory for artifacts from previous sessions using Glob patterns, then cross-reference with [COMPANY] tasks for full context"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Write
  - Bash
agent: opspal-core:main
---

# Prior Session Artifact Discovery

Search workspace orgs directory and reports directory for artifacts from previous sessions using Glob patterns, then cross-reference with [COMPANY] tasks for full context

## When to Use This Skill

- When building or modifying reports and dashboards

**Category**: query
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Search workspace orgs directory and reports directory for artifacts from previous sessions using Glob patterns, then cross-reference with [COMPANY] tasks for full context
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 021eb2d0-6b42-4874-8d6e-843a5f597124
- **Agent**: main
- **Enriched**: 2026-04-03
