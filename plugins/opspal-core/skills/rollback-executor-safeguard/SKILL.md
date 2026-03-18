---
name: rollback-executor-safeguard
description: Generate safe rollback execution plans with verification gates and evidence capture.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
agent: opspal-core:solution-deployment-orchestrator
version: 1.0.0
---

# rollback-executor-safeguard

## When to Use This Skill

Use for failed releases, regressions, or rollback drills.

## Required Inputs

- Target release/change id\n- Last known good version\n- Rollback scope

## Output Artifacts

- Rollback runbook\n- Verification checklist\n- Post-rollback evidence bundle

## Workflow

1. Collect scope, constraints, and success criteria.
2. Build a deterministic execution plan with explicit checks.
3. Run read-first diagnostics and capture baseline evidence.
4. Propose safe execution steps with rollback or abort criteria.
5. Produce final artifacts with owners and next actions.

## Safety Checks

- Require pre/post state snapshots\n- Enforce blast-radius check\n- Abort on missing rollback prerequisites
