---
name: windowed-bulk-export-for-full-database
description: "For full Marketo database analysis, create sequential bulk exports in 31-day windows, concatenate results, then analyze. Refresh token every 10 windows."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Write
  - Bash
agent: opspal-core:main context (manual implementation)
---

# Windowed Bulk Export For Full Database

For full Marketo database analysis, create sequential bulk exports in 31-day windows, concatenate results, then analyze. Refresh token every 10 windows.

## When to Use This Skill

- During data import or bulk operations
- When performing audits or assessments of the target system

**Category**: query
**Discovered from**: reflection analysis

## Workflow

1. For full Marketo database analysis, create sequential bulk exports in 31-day windows, concatenate results, then analyze
2. Refresh token every 10 windows

## Source

- **Reflection**: 712a6b96-e98b-4fcc-aca0-63e08ee5fc85
- **Agent**: main context (manual implementation)
- **Enriched**: 2026-04-03
