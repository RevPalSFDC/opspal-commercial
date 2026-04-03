---
name: pre-import-email-overlap-check
description: "Before bulk importing, sample 900 emails via batch API to estimate match rate and net new lead count"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-marketo:marketo-automation-orchestrator
---

# Pre Import Email Overlap Check

Before bulk importing, sample 900 emails via batch API to estimate match rate and net new lead count

## When to Use This Skill

- Before executing the operation described in this skill
- During data import or bulk operations

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Before bulk importing, sample 900 emails via batch API to estimate match rate and net new lead count
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: c9f4a752-d28f-49a7-a9bd-6736279ef29d
- **Agent**: opspal-marketo:marketo-automation-orchestrator
- **Enriched**: 2026-04-03
