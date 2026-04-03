---
name: contract-enddate-proximity-matching
description: "Match orphan renewals to Contracts using Account + EndDate within ±365 days of CloseDate"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Contract Enddate Proximity Matching

Match orphan renewals to Contracts using Account + EndDate within ±365 days of CloseDate

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: query
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Match orphan renewals to Contracts using Account + EndDate within ±365 days of CloseDate
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 1209b25f-1ae2-4939-9bf0-6b8b0050471d
- **Agent**: manual implementation during session
- **Enriched**: 2026-04-03
