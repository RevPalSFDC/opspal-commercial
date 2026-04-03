---
name: multi-workstream-data-import-orchestration
description: "Decompose CSV import into parallel workstreams (user resolution -> group membership + account creation -> opportunity creation + team assignment) with dependency management"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-core:parent orchestrator
---

# Multi Workstream Data Import Orchestration

Decompose CSV import into parallel workstreams (user resolution -> group membership + account creation -> opportunity creation + team assignment) with dependency management

## When to Use This Skill

- During data import or bulk operations

**Category**: automation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Decompose CSV import into parallel workstreams (user resolution -> group membership + account creation -> opportunity creation + team assignment) with dependency management
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 0a30399d-591f-4f4e-810d-efd53437f60d
- **Agent**: parent orchestrator
- **Enriched**: 2026-04-03
