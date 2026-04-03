---
name: partner-stats-dry-run-comparison
description: "Run read-only aggregation queries against Opportunity data, compare with current Account stats, categorize changes (new/stale/correct), present impact summary before any writes"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-core:direct-execution
---

# Partner Stats Dry Run Comparison

Run read-only aggregation queries against Opportunity data, compare with current Account stats, categorize changes (new/stale/correct), present impact summary before any writes

## When to Use This Skill

- Before executing the operation described in this skill

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Run read-only aggregation queries against Opportunity data, compare with current Account stats, categorize changes (new/stale/correct), present impact summary before any writes
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 62793c36-7be6-4bef-b2c0-6122ad06eb5b
- **Agent**: direct-execution
- **Enriched**: 2026-04-03
