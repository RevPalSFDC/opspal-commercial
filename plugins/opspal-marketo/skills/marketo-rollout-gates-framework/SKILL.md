---
name: marketo-rollout-gates-framework
description: Apply preflight and launch gates for Marketo program and campaign deployments.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
agent: opspal-marketo:marketo-orchestrator
version: 1.0.0
---

# marketo-rollout-gates-framework

## When to Use This Skill

Use before campaign activation or any high-impact Marketo rollout.

## Required Inputs

- Program/campaign IDs\n- Launch window\n- Approval requirements

## Output Artifacts

- Go/no-go checklist\n- Launch validation report\n- Rollback and fallback path

## Workflow

1. Collect scope, constraints, and success criteria.
2. Build a deterministic execution plan with explicit checks.
3. Run read-first diagnostics and capture baseline evidence.
4. Propose safe execution steps with rollback or abort criteria.
5. Produce final artifacts with owners and next actions.

## Safety Checks

- Enforce approval checkpoints\n- Validate integration dependencies\n- Stop rollout on gate failure
