---
name: live-data-correction-of-agent-estimates
description: "After agent produces sample-based estimates, run data collector scripts and patch assessment files with verified live counts"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-core:direct-orchestration
---

# Live Data Correction Of Agent Estimates

After agent produces sample-based estimates, run data collector scripts and patch assessment files with verified live counts

## When to Use This Skill

- When performing audits or assessments of the target system

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: After agent produces sample-based estimates, run data collector scripts and patch assessment files with verified live counts
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 630290b1-f517-4a29-9658-67867b46945e
- **Agent**: direct-orchestration
- **Enriched**: 2026-04-03
