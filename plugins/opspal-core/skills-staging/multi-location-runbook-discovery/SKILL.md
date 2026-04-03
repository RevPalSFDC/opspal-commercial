---
name: multi-location-runbook-discovery
description: "When syncing runbooks to NotebookLM, check org root for [COMPANY]_RUNBOOK.md (comprehensive) before platform-level RUNBOOK.md (auto-generated). Prefer files >500 lines over sparse stubs."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Write
  - Bash
agent: opspal-core:generate-runbook
---

# Multi Location Runbook Discovery

When syncing runbooks to NotebookLM, check org root for [COMPANY]_RUNBOOK.md (comprehensive) before platform-level RUNBOOK.md (auto-generated). Prefer files >500 lines over sparse stubs.

## When to Use This Skill

- Before executing the operation described in this skill

**Category**: configuration
**Discovered from**: reflection analysis

## Workflow

1. When syncing runbooks to NotebookLM, check org root for [COMPANY]_RUNBOOK
2. md (comprehensive) before platform-level RUNBOOK
3. md (auto-generated)
4. Prefer files >500 lines over sparse stubs

## Source

- **Reflection**: 5427a419-7274-4549-986b-2f2ad5a2ca49
- **Agent**: generate-runbook
- **Enriched**: 2026-04-03
