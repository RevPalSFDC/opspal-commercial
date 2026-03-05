---
name: hook-rollout-and-canary-manager
description: Roll out hook changes safely using phased canaries, rollback thresholds, and success gates.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
agent: opspal-core:plugin-doctor
version: 1.0.0
---

# hook-rollout-and-canary-manager

## When to Use This Skill

Use for high-risk hook changes affecting task routing or enforcement.

## Required Inputs

- Target hooks\n- Canary cohort\n- Rollout gates

## Output Artifacts

- Phased rollout plan\n- Success/failure criteria\n- Rollback trigger matrix

## Workflow

1. Collect scope, constraints, and success criteria.
2. Build a deterministic execution plan with explicit checks.
3. Run read-first diagnostics and capture baseline evidence.
4. Propose safe execution steps with rollback or abort criteria.
5. Produce final artifacts with owners and next actions.

## Safety Checks

- Enforce max blast radius\n- Automatic stop on failure threshold\n- Keep rollback path pre-approved
