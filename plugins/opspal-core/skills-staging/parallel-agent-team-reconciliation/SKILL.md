---
name: parallel-agent-team-reconciliation
description: "Use TeamCreate with 2+ general-purpose agents running in parallel to reconcile different object types from a shared CSV against live SFDC. Each agent writes its own script, queries SFDC, and outputs a reconciliation CSV. Lead agent merges results."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Write
  - Bash
agent: opspal-core:general-purpose (team mode)
---

# Parallel Agent Team Reconciliation

Use TeamCreate with 2+ general-purpose agents running in parallel to reconcile different object types from a shared CSV against live SFDC. Each agent writes its own script, queries SFDC, and outputs a reconciliation CSV. Lead agent merges results.

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Use TeamCreate with 2+ general-purpose agents running in parallel to reconcile different object types from a shared CSV against live SFDC
2. Each agent writes its own script, queries SFDC, and outputs a reconciliation CSV
3. Lead agent merges results

## Source

- **Reflection**: 2db11bc7-2a79-419d-bfe3-08f63659f4c8
- **Agent**: general-purpose (team mode)
- **Enriched**: 2026-04-03
