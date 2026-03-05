---
name: postmortem-rca-writer
description: Produce consistent post-incident RCA documents with corrective actions, ownership, and prevention tracking.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
agent: opspal-core:solution-analyzer
version: 1.0.0
---

# postmortem-rca-writer

## When to Use This Skill

Use immediately after incident stabilization and evidence collection.

## Required Inputs

- Incident timeline\n- Impact metrics\n- Root-cause evidence

## Output Artifacts

- RCA draft\n- Corrective action log\n- Prevention backlog

## Workflow

1. Collect scope, constraints, and success criteria.
2. Build a deterministic execution plan with explicit checks.
3. Run read-first diagnostics and capture baseline evidence.
4. Propose safe execution steps with rollback or abort criteria.
5. Produce final artifacts with owners and next actions.

## Safety Checks

- Evidence-backed conclusions only\n- No blame language\n- Require owners and due dates
