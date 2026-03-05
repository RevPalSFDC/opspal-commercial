---
name: monday-change-validation-and-rollback
description: Validate Monday changes with before/after diffing and generate deterministic rollback procedures.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
agent: opspal-monday:monday-batch-operator
version: 1.0.0
---

# monday-change-validation-and-rollback

## When to Use This Skill

Use after Monday changes or before production cutovers.

## Required Inputs

- Baseline snapshot\n- Post-change snapshot\n- Acceptance criteria

## Output Artifacts

- Validation diff report\n- Rollback playbook\n- Residual risk list

## Workflow

1. Collect scope, constraints, and success criteria.
2. Build a deterministic execution plan with explicit checks.
3. Run read-first diagnostics and capture baseline evidence.
4. Propose safe execution steps with rollback or abort criteria.
5. Produce final artifacts with owners and next actions.

## Safety Checks

- Require snapshots for rollback generation\n- Block irreversible operations without approval\n- Capture ownership for rollback steps
