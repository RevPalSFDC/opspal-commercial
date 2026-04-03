---
name: runbook-renderer-recovery-via-version-history
description: "When runbook renderer produces degraded output (raw template tags, missing data), restore from runbook-history/ directory and manually update rather than debugging the renderer in-session."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Runbook Renderer Recovery Via Version History

When runbook renderer produces degraded output (raw template tags, missing data), restore from runbook-history/ directory and manually update rather than debugging the renderer in-session.

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: [SFDC_ID]
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: When runbook renderer produces degraded output (raw template tags, missing data), restore from runbook-history/ directory and manually update rather than debugging the renderer in-session.
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 72e418ad-21a5-455c-856f-3b8815b6a08c
- **Agent**: manual
- **Enriched**: 2026-04-03
