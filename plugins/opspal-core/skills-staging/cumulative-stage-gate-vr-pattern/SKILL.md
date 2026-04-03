---
name: cumulative-stage-gate-vr-pattern
description: "Use CASE() ordinal mapping with >= threshold to enforce cumulative field requirements across stage progression. Pair with [COMPANY](ISPICKVAL(StageName, 'Closed Lost')) to allow closing lost from any stage."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-core:validation-rule-orchestrator
---

# Cumulative Stage Gate Vr Pattern

Use CASE() ordinal mapping with >= threshold to enforce cumulative field requirements across stage progression. Pair with [COMPANY](ISPICKVAL(StageName, 'Closed Lost')) to allow closing lost from any stage.

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Use CASE() ordinal mapping with >= threshold to enforce cumulative field requirements across stage progression
2. Pair with [COMPANY](ISPICKVAL(StageName, 'Closed Lost')) to allow closing lost from any stage

## Source

- **Reflection**: fafd3c04-7bbe-4e0e-a20b-6c7122c20e7f
- **Agent**: validation-rule-orchestrator
- **Enriched**: 2026-04-03
