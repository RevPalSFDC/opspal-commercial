---
name: backfill-benchmark-validation
description: "Run backfill dry-run against production, compare calculated values to known-good Account records before executing. Provides high-confidence validation without modifying data."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Backfill Benchmark Validation

Run backfill dry-run against production, compare calculated values to known-good Account records before executing. Provides high-confidence validation without modifying data.

## When to Use This Skill

- Before executing the operation described in this skill

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Run backfill dry-run against production, compare calculated values to known-good Account records before executing
2. Provides high-confidence validation without modifying data

## Source

- **Reflection**: d3d39d23-1af6-41a4-82d9-94ca87a6a34e
- **Agent**: manual (backfill_partner_stats.py)
- **Enriched**: 2026-04-03
